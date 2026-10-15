import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pbkdf2Sync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {neonStudyMigration} from '../src/neon-study-migration.mjs';
import {neonStudyTables} from '../src/neon-study-schema.mjs';
import {NeonStudyClient} from '../src/neon-study.mjs';
import {studyQuery} from '../src/neon-study-sql.mjs';
import {StudyService,statement as s} from '../src/turso-study.mjs';
import {PersonalService} from '../src/turso-personal.mjs';
import {GroupService} from '../src/turso-groups.mjs';
import {ExamService} from '../src/turso-exams.mjs';
import {ensureStudyProfile} from '../src/turso-profile.mjs';
import {ActivityService} from '../src/turso-activity.mjs';
import {ArchiveService} from '../src/turso-archive.mjs';
import {MessageService} from '../src/turso-messages.mjs';
import {AssessmentService} from '../src/turso-assessment.mjs';
import {ContentCopyService} from '../src/turso-content-copy.mjs';
import {ensureSpeakout,saveSpeakout,speakoutLesson} from '../src/turso-speakout.mjs';
import {neonFoundation} from '../src/neon-foundation.mjs';
import {neonApplicationEnvironment} from '../src/neon-application.mjs';
import {DATABASE_CONTROL} from '../src/database-selection.mjs';
import {integratedWorker} from '../src/turso-integrated-worker.mjs';
import {ChatBridge} from '../src/chat-worker.mjs';
import {chatDatabaseHeaders} from '../src/chat-database.mjs';
import {accountBootstrap,accountCards,legacyLessons,accountSongs} from '../src/turso-legacy-read.mjs';

let pg,db;
const dev={id:'a'.repeat(32),login:'fixture_dev',name:'Teacher',role:'DEVELOPER'},student={id:'b'.repeat(32),login:'fixture_student',role:'USER'},other={id:'c'.repeat(32),login:'fixture_other',role:'USER'};
function driver(engine){
  const run=async(tx,text,params)=>{
    try{const result=await tx.query(text,params);return {...result,command:text.trim().split(/\s/)[0],rowCount:result.affectedRows||0};}
    catch(error){if(!['23514','23505','40001'].includes(error.code))console.error('LOCAL POSTGRES FIXTURE:',text.slice(0,3000),'ERROR:',error.message);throw error;}
  };
  return {query(text,params){return {text,params,then(resolve,reject){return run(engine,text,params).then(resolve,reject);}};},async transaction(commands,options){
    assert.equal(options.fullResults,true);
    return engine.transaction(async tx=>{await tx.exec(options.readOnly?'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY':'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');const result=[];for(const command of commands)result.push(await run(tx,command.text,command.params));return result;});
  }};
}
before(async()=>{
  pg=new PGlite();for(const query of neonStudyMigration)await pg.exec(query);
  db=new NeonStudyClient({}, {createSql:()=>driver(pg)});
});
after(async()=>{await pg?.close();});

test('runtime migration is additive/idempotent and provides numeric child IDs',async()=>{
  for(const query of neonStudyMigration)await pg.exec(query);
  assert.equal(neonStudyTables.length,54);
  const columns=(await pg.query("SELECT table_name,data_type FROM information_schema.columns WHERE table_schema='english_study' AND column_name='id' AND table_name IN ('lesson_blocks','exam_blocks','exam_materials')")).rows;
  assert.equal(columns.length,3);assert.ok(columns.every(column=>column.data_type==='bigint'));
});
test('parameterization preserves hostile text and rejects stacked statements',async()=>{
  const hostile="test'); DELETE FROM cards; --";
  assert.deepEqual(await db.read('SELECT ? AS value',[hostile]),[{value:hostile}]);
  assert.throws(()=>studyQuery('SELECT 1; DELETE FROM cards'));
  assert.throws(()=>studyQuery('SELECT ?',[{},1]));
});
test('new study profiles are provisioned atomically and remain isolated',async()=>{
  const own=await ensureStudyProfile(db,dev),second=await ensureStudyProfile(db,student),third=await ensureStudyProfile(db,other);
  assert.equal(typeof own,'number');assert.notEqual(own,second);assert.notEqual(second,third);assert.equal(await ensureStudyProfile(db,dev),own);
});
test('row counters and generated IDs remain within the HTTP transaction',async()=>{
  const result=await db.atomic([s("INSERT INTO lessons(title) VALUES('Counter fixture')"),s('SELECT last_insert_rowid() AS id,changes() AS changes'),s("UPDATE lessons SET title='changed' WHERE id=-1"),s('SELECT changes() AS changes')]);
  assert.equal(result[1].rows[0][1].value,'1');assert.equal(result[3].rows[0][0].value,'0');
  assert.deepEqual(await db.read('SELECT changes() AS changes,last_insert_rowid() AS id'),[{changes:0,id:0}]);
});
test('revision guards roll back the entire write when their predicate fails',async()=>{
  const [before]=await db.read('SELECT count(*) AS n FROM lessons');
  await assert.rejects(db.atomic([s('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))'),s("INSERT INTO lessons(title) VALUES('must roll back')"),s('INSERT INTO mutation_guard SELECT changes()=0')]),error=>error.status===409);
  assert.equal((await db.read('SELECT count(*) AS n FROM lessons'))[0].n,before.n);
});
test('personal card creation is idempotent and returns the unchanged DTO shape',async()=>{
  const body={mutationId:crypto.randomUUID(),expectedRevision:0,card:{en:'apple',ru:'яблоко',place:'mine'}};
  const personal=new PersonalService(db),created=await personal.createOwnCard(student,body);
  assert.equal(created.card.word,'apple');assert.equal(typeof created.id,'number');
  assert.deepEqual(await personal.createOwnCard(student,body),created);
  const mine=await accountCards(db,student),theirs=await accountCards(db,other);
  assert.equal(mine.cards.some(card=>card.word==='apple'),true);assert.equal(theirs.cards.some(card=>card.word==='apple'),false);
});
test('lesson creation preserves ordered numeric child IDs and idempotent receipts',async()=>{
  const service=new StudyService(db),body={mutationId:crypto.randomUUID(),changes:{title:'PG lesson',published:true},blocks:[{expectedRevision:0,type:'text',tab:'overview',cardId:null,content:{text:'Question'}},{expectedRevision:0,type:'text',tab:'overview',cardId:null,content:{text:'Answer',answerEnabled:true}}]};
  const created=await service.createLesson(dev,body);
  assert.equal(typeof created.id,'number');assert.equal(created.blocks.length,2);assert.equal(typeof created.blocks[0].id,'number');
  assert.deepEqual(await service.createLesson(dev,body),created);
});
test('standard groups and enrollment read paths work on PostgreSQL',async()=>{
  const groups=new GroupService(db);await groups.seed();
  assert.ok((await groups.list(dev)).length>=9);
});
test('activity JSON counters preserve nested labels and numeric increments',async()=>{
  const activity=new ActivityService(db);
  await activity.events(student,{mutationId:crypto.randomUUID(),events:[{kind:'answer',area:'Words / test',result:'ok'}]});
  const result=await activity.stats(student,{});assert.equal(result.activity.answers,1);assert.equal(result.activity.correct,1);assert.equal(result.activity.byArea['Words / test'],1);
});
test('song/text creation and archive flags retain numeric JSON IDs and privacy',async()=>{
  const personal=new PersonalService(db);
  const created=await personal.createLibrary(student,{mutationId:crypto.randomUUID(),kind:'song',changes:{title:'Local fixture',lyrics:'English words',archived:false}});
  assert.equal(typeof created.item.id,'number');assert.equal(created.item.title,'Local fixture');
  const songs=await accountSongs(db,student);assert.equal(songs.songs[0].id,created.id);assert.equal(songs.songs[0].archived,false);
  assert.equal((await accountSongs(db,other)).songs.length,0);
  await personal.editLibrary(student,created.id,{mutationId:crypto.randomUUID(),expectedRevision:1,changes:{archived:true}});
  assert.equal((await accountSongs(db,student)).songs.length,0);
});
test('group renames preserve enrolled students and reject stale revisions',async()=>{
  const service=new GroupService(db),result=await service.manage(dev,{action:'create',title:'A1 Runtime'}),group=result.groups.find(group=>group.title==='A1 Runtime');
  await service.assignStudent(dev,student.id,group.id);
  const current=await service.activeGroup(group.id);
  await service.manage(dev,{action:'rename',id:group.id,expectedRevision:current.revision,title:'B1 Runtime'});
  assert.equal((await service.members(dev)).find(row=>row.accountId===student.id).groupId,group.id);
  await assert.rejects(service.manage(dev,{action:'rename',id:group.id,expectedRevision:current.revision,title:'A1 Stale'}),error=>error.status===409);
});
test('exam saves, student solution filtering and archived blocks work on PostgreSQL',async()=>{
  const exams=new ExamService(db),archive=new ArchiveService(db);
  const saved=await exams.save(dev,{exam:{title:'A1 Runtime exam',published:true,blocks:[{title:'Block',published:true,materials:[{type:'quiz',quizType:'Choice',items:[{prompt:'Choose',options:['a','b'],answer:1}]}]}]}});
  assert.equal(saved.blocks[0].materials.length,1);assert.equal(typeof saved.blocks[0].id,'number');
  assert.equal((await exams.list(student)).length,0);
  await db.atomic([s("INSERT INTO chat_assignments(id,exam_id,target_kind,target_id) VALUES(?,?,'student',?)",['fixture-assignment',saved.id,student.id])]);
  const visible=await exams.list(student);assert.equal(visible[0].blocks[0].materials[0].items[0].answer,undefined);
  assert.equal((await exams.list(dev))[0].blocks[0].materials[0].items[0].answer,1);
  await archive.archive(dev,{type:'exam-block',id:saved.blocks[0].id});
  assert.equal((await exams.list(dev))[0].blocks.length,0);
  assert.equal((await archive.list(dev)).items.some(item=>item.type==='exam-block'),true);
  await archive.restore(dev,{type:'exam-block',id:saved.blocks[0].id});
  assert.equal((await exams.list(dev))[0].blocks.length,1);
});
test('bootstrap snapshots and legacy lesson projections use the same repository',async()=>{
  const state=await accountBootstrap(db,student);assert.ok(state);
  assert.ok(await legacyLessons(db,dev));
});
test('card progress and shared quizzes preserve references rather than duplicating definitions',async()=>{
  await db.atomic([s("INSERT INTO cards(scope,en,word_key,ru) VALUES('shared','fixture shared','fixture shared','translation')")]);
  const [card]=await db.read("SELECT id FROM cards WHERE word_key='fixture shared'"),service=new StudyService(db);
  const created=await service.createQuiz(dev,card.id,{mutationId:crypto.randomUUID(),expectedRevision:1,expectedCollectionRevision:0,quiz:{type:'Choice',items:[{prompt:'Choose',options:['a','b'],answer:1}]}});
  assert.equal(created.type,'Choice');assert.equal(typeof created.id,'number');
  await service.createLesson(dev,{mutationId:crypto.randomUUID(),changes:{title:'Public shared definition',published:true},blocks:[{expectedRevision:0,type:'wordcard',tab:'words',cardId:card.id,content:{}}]});
  await service.linkCard(other,{mutationId:crypto.randomUUID(),expectedRevision:0,expectedCardRevision:1,cardId:card.id,place:'mine'});
  const progress=await service.saveCardProgress(other,card.id,{mutationId:crypto.randomUUID(),expectedRevision:0,changes:{learned:true,variants:['fixture']}});
  assert.equal(progress.learned,true);
  const [privateCard]=await db.read("SELECT id FROM cards WHERE word_key='apple'");
  await assert.rejects(service.saveCardProgress(other,privateCard.id,{mutationId:crypto.randomUUID(),expectedRevision:0,changes:{learned:true}}),error=>error.status===404);
});
test('copying a saved lesson to a group preserves its material order',async()=>{
  const [lesson]=await db.read("SELECT id FROM lessons WHERE title='PG lesson'"),[group]=await db.read("SELECT id FROM class_groups WHERE title='B1 Runtime'");
  const result=await new ContentCopyService(db).copy(dev,{mutationId:crypto.randomUUID(),source:{type:'lesson',id:lesson.id},destination:{type:'group',id:group.id},title:'Copied PG lesson'});
  assert.equal(result.copied,true);
  const [copied]=await db.read("SELECT id FROM lessons WHERE title='Copied PG lesson'");assert.ok(copied);
  assert.equal((await db.read('SELECT id FROM lesson_blocks WHERE lesson_id=?',[copied.id])).length,2);
});
test('exam submission freezes student work and is private to the assigned account',async()=>{
  const exams=new ExamService(db),[exam]=await db.read("SELECT id FROM exams WHERE title='A1 Runtime exam'"),[block]=await db.read('SELECT id FROM exam_blocks WHERE exam_id=?',[exam.id]),[part]=await db.read('SELECT id FROM exam_materials WHERE block_id=?',[block.id]);
  const body={examId:exam.id,blockId:block.id,saved:true,answers:{[part.id]:{0:0}}};
  await exams.saveWork(student,body);await exams.saveWork(student,body);
  await assert.rejects(exams.saveWork(student,{...body,answers:{[part.id]:{0:1}},saved:false}),error=>error.status===409);
  assert.equal((await exams.listWork(other)).length,0);
  assert.equal((await exams.listWork(student))[0].answers[part.id][0],0);
});
test('SQL message journal and outbox are kept in the same PostgreSQL transaction',async()=>{
  const messages=new MessageService(db,async()=>[dev,student,other]);await messages.ensure();
  const opened=await messages.open(dev,{kind:'direct',accountId:student.id});assert.ok(opened.roomId);
  await messages.send(dev,{roomId:opened.roomId,category:'personal',text:'Fixture message',clientKey:'pg-fixture-message'});
  assert.equal((await messages.history(student,opened.roomId,{category:'personal'})).messages.length,1);
  await db.atomic([s("INSERT INTO chat_messages(room_id,sender_id,sender_name,category,body,client_key) VALUES(?,?,?,'learning',?,?)",[opened.roomId,dev.id,'Teacher','Notice','pg-fixture-notice'])]);
  assert.equal((await db.read('SELECT message_id FROM chat_delivery_outbox')).length,1);
});
test('real login, profile provisioning and account/card endpoints run with no D1 or Turso binding',async()=>{
  for(const query of neonFoundation)await pg.exec(query);
  const password='Fixture-password-123',salt='ab'.repeat(16),hash=pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex'),id='e'.repeat(32);
  await pg.query("INSERT INTO english_app.users(id,login,email,name,password_salt,password_hash,password_iterations,role) VALUES($1,'runtime_login','runtime@example.test','Fixture',$2,$3,100000,'DEVELOPER')",[id,salt,hash]);
  const objects=new Map(),bucket={async get(key){const body=objects.get(key);return body===undefined?null:{json:async()=>JSON.parse(body),text:async()=>body,etag:'fixture'};},async head(key){return this.get(key);},async put(key,value){objects.set(key,value);return {etag:'fixture'};},async delete(key){objects.delete(key);},async list({prefix=''}){return {objects:[...objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}};
  const env=neonApplicationEnvironment({DB_PROVIDER:'neon',DATABASE_SELECTION:{provider:'neon',revision:7,scope:'site'},CONTENT_MEDIA:bucket,MEDIA:bucket,SESSION_SECRET:'fixture-session-secret',STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'app.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false'},{study:db,auth:{sql:driver(pg)}});
  const app=integratedWorker(),call=(path,body,cookie)=>app.fetch(new Request('https://app.example'+path,{method:body?'POST':'GET',headers:{Origin:'https://app.example','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});
  let response=await call('/api/login',{login:'runtime_login',password});assert.equal(response.status,200,await response.clone().text());
  const session=response.headers.get('Set-Cookie').split(';')[0];assert.equal((await response.json()).user.id,id);
  response=await call('/api/me',null,session);assert.equal((await response.json()).user.role,'DEVELOPER');
  response=await call('/api/me/state?summary=1',null,session);assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).counts.cards,0);
  response=await call('/api/me/cards/new',{mutationId:crypto.randomUUID(),expectedRevision:0,card:{en:'runtime endpoint',ru:'fixture translation',place:'mine'}},session);assert.equal(response.status,200,await response.clone().text());
  response=await call('/api/me/cards',null,session);assert.equal((await response.json()).cards[0].word,'runtime endpoint');
  assert.equal(env[DATABASE_CONTROL],bucket);assert.equal(await env.CONTENT_MEDIA.get('old-turso-file'),null);
  await env.CONTENT_MEDIA.put('fixture-file','private');assert.equal(objects.get('study/neon/fixture-file'),'private');
  response=await call('/api/logout',{},session);assert.equal(response.status,200);
  assert.equal((await (await call('/api/me',null,session)).json()).user,null);
});
test('the Neon chat policy reads PostgreSQL identities instead of the original D1 binding',async()=>{
  const sqlite=new DatabaseSync(':memory:'),selected={provider:'neon',revision:7,scope:'site'},calls=[];
  try{
    const namespace={idFromName:id=>{assert.ok(id.startsWith('neon:v1:'));return id;},get:id=>({async fetch(request){calls.push(id);return Response.json(new URL(request.url).pathname==='/snapshot'?{rooms:[]}:{configured:true});}})};
    const env={CONTENT_ENABLED:'true',CONTENT_SESSION_SECRET:'fixture-chat-secret',CONTENT_MEDIA:{get:async()=>({json:async()=>selected})},MEDIA:{},DB:{prepare(){throw Error('D1 access is forbidden');}},CHAT_ROOM:namespace,CHAT_INBOX:namespace};
    const ctx={storage:{sql:{exec(text,...args){const statement=sqlite.prepare(text),result=statement.columns().length?statement.all(...args):(statement.run(...args),[]);return {toArray:()=>result};}},async setAlarm(){},async deleteAlarm(){}},getWebSockets:()=>[]};
    const bridge=new ChatBridge(ctx,env,{openNeon:value=>neonApplicationEnvironment(value,{study:db,auth:{sql:driver(pg)}})});
    const response=await bridge.fetch(new Request('https://chat.internal/policy',{method:'POST',headers:{'X-Chat-Internal':'fixture-chat-secret',...chatDatabaseHeaders({DATABASE_SELECTION:selected})},body:'{}'}));
    assert.equal(response.status,200,await response.clone().text());const policy=await response.json();
    assert.deepEqual(policy.users.map(user=>user.login),['runtime_login']);assert.ok(calls.length>0);
  }finally{sqlite.close();}
});
