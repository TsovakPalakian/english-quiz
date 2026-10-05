import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {request} from 'node:http';
import {StudyService,TursoStudyClient,statement} from '../src/turso-study.mjs';
import {createStageServer} from './run-turso-stage.mjs';
import {legacyLessons} from '../src/turso-legacy-read.mjs';

test('Native Worker fetch is called without the client as receiver',async()=>{
  const client=new TursoStudyClient({endpoint:'https://english-quiz-test-fixture.turso.io/v2/pipeline',token:'fixture',fetchImpl:async function(url,options){
    assert.equal(this,undefined);
    assert.equal(options.redirect,'manual');
    return Response.json({baton:null,results:[{type:'ok',response:{type:'execute',result:{cols:[],rows:[]}}},{type:'ok',response:{type:'close'}}]});
  }});
  assert.deepEqual(await client.read('SELECT 1'),[]);
});

test('Database redirects are rejected without forwarding the token',async()=>{
  let calls=0;
  const client=new TursoStudyClient({endpoint:'https://english-quiz-test-fixture.turso.io/v2/pipeline',token:'fixture',fetchImpl:async()=>{
    calls++;return new Response(null,{status:307,headers:{Location:'https://other.invalid/'}});
  }});
  await assert.rejects(client.read('SELECT 1'),/Test database request failed/);
  assert.equal(calls,1);
});

test('Only read snapshots receive the larger transfer window; writes do not',async()=>{
  const client=new TursoStudyClient({endpoint:'https://english-quiz-test-fixture.turso.io/v2/pipeline',token:'fixture'}),modes=[];
  client.send=async(requests,options)=>{
    modes.push(options.readSnapshot);
    const results=requests[0].batch.steps.map(()=>({cols:[],rows:[]}));
    return [{result:{step_results:results,step_errors:results.map(()=>null)}}];
  };
  await client.readMany([statement('SELECT 1')]);
  await client.atomic([statement('INSERT INTO fixture VALUES(1)')]);
  assert.deepEqual(modes,[true,false]);
  await assert.rejects(client.readMany([statement('DELETE FROM fixture')]),/Only SELECTs/);
});

// In-memory SQLite implements the actual Hrana batch shape, including skipped
// steps and connection-close rollback. The service uses its real HTTP client.
function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/turso/001_content_schema.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/turso/002_import_audit.sql',import.meta.url),'utf8'));
  sqlite.exec(`INSERT INTO account_refs(id) VALUES('teacher'),('developer'),('student'),('student2');
    INSERT INTO study_profiles(id,kind) VALUES('p1','personal'),('p2','personal');
    INSERT INTO profile_members VALUES('student','p1'),('student2','p2');
    INSERT INTO lessons(id,title,published) VALUES('visible','Visible',1),('draft','Draft',0);
    INSERT INTO lessons(id,title,published,hidden_from_students) VALUES('hidden','Hidden',1,1);
    INSERT INTO cards(id,scope,en,word_key,ru) VALUES('shared','shared','test','test','before'),('draft-card','shared','draft','draft','secret'),('hidden-card','shared','hidden','hidden','secret');
    INSERT INTO cards(id,scope,owner_profile_id,en,word_key,ru) VALUES('private','profile','p1','private','private','personal');
    INSERT INTO lesson_blocks(lesson_id,id,position,type,card_id) VALUES('visible','b',0,'word','shared'),('draft','b',0,'word','draft-card'),('hidden','b',0,'word','hidden-card');`);
  const encode=value=>value===null?{type:'null'}:typeof value==='number'?{type:'integer',value:String(value)}:{type:'text',value};
  const execute=command=>{
    const prepared=sqlite.prepare(command.sql);
    const args=(command.args||[]).map(a=>a.type==='null'?null:a.type==='integer'?Number(a.value):a.value);
    const columns=prepared.columns();
    if(!columns.length){const result=prepared.run(...args);return {cols:[],rows:[],affected_row_count:Number(result.changes)};}
    const records=prepared.all(...args);
    return {cols:columns.map(c=>({name:c.name})),rows:records.map(row=>columns.map(c=>encode(row[c.name]))),affected_row_count:0};
  };
  let dropResponse=false;
  const fetchImpl=async(_url,options)=>{
    const requests=JSON.parse(options.body).requests,results=[];
    for(const request of requests){
      if(request.type==='close'){
        if(sqlite.isTransaction)sqlite.exec('ROLLBACK');
        results.push({type:'ok',response:{type:'close'}});continue;
      }
      if(request.type==='batch'){
        const step_results=[],step_errors=[];
        for(const step of request.batch.steps){
          if(step.condition && !step_results[step.condition.step]){step_results.push(null);step_errors.push(null);continue;}
          try{step_results.push(execute(step.stmt));step_errors.push(null);}
          catch(error){step_results.push(null);step_errors.push({code:/constraint/i.test(error.message)?'SQLITE_CONSTRAINT':'SQLITE_ERROR',message:error.message});}
        }
        results.push({type:'ok',response:{type:'batch',result:{step_results,step_errors}}});
      }else{
        try{results.push({type:'ok',response:{type:'execute',result:execute(request.stmt)}});}
        catch(error){results.push({type:'error',error:{code:'SQLITE_ERROR',message:error.message}});}
      }
    }
    if(dropResponse && requests.some(r=>r.type==='batch')){dropResponse=false;throw new Error('Response lost AFTER commit');}
    return new Response(JSON.stringify({baton:null,results}),{status:200});
  };
  const db=new TursoStudyClient({endpoint:'https://english-quiz-test-fixture.turso.io/v2/pipeline',token:'offline-only',fetchImpl});
  const service=new StudyService(db);
  const personas=[{key:'teacher',label:'Teacher',id:'teacher',role:'ADMIN'},{key:'developer',label:'Dev',id:'developer',role:'DEVELOPER'},{key:'student',label:'Student',id:'student',role:'USER'},{key:'student2',label:'Student 2',id:'student2',role:'USER'}];
  return {db,service,personas,sqlite,loseResponse:()=>{dropResponse=true;}};
}
const id=()=>crypto.randomUUID();
const rejects=(promise,status)=>assert.rejects(promise,error=>error.status===status);
test('Managed unlink removes one target/place only, preserves definition/progress and supports receipt replay',async()=>{
  const {service,personas,sqlite}=fixture(),[teacher,,student]=personas;
  await service.linkManagedCard(teacher,'student',{mutationId:id(),cardId:'shared',place:'mine',expectedRevision:0,expectedCardRevision:1});
  sqlite.exec("INSERT INTO profile_cards(profile_id,card_id,place,position) VALUES('p1','shared','phrasal',1),('p2','shared','mine',1); INSERT INTO card_progress(profile_id,card_id,learned) VALUES('p1','shared',1);");
  const definitions=sqlite.prepare('SELECT * FROM cards ORDER BY id').all(),progress=sqlite.prepare('SELECT * FROM card_progress').all();
  const body={mutationId:id(),place:'mine',expectedRevision:1};
  const result=await service.unlinkManagedCard(teacher,'student','shared',body);
  assert.deepEqual(await service.unlinkManagedCard(teacher,'student','shared',body),result);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM profile_cards WHERE profile_id='p1' AND place='mine'").get().n,0);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM profile_cards WHERE profile_id='p1' AND place='phrasal'").get().n,1);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM profile_cards WHERE profile_id='p2'").get().n,1);
  assert.deepEqual(sqlite.prepare('SELECT * FROM cards ORDER BY id').all(),definitions);
  assert.deepEqual(sqlite.prepare('SELECT * FROM card_progress').all(),progress);
  await rejects(service.unlinkManagedCard(teacher,'student','shared',{...body,mutationId:id()}),409);
  await rejects(service.unlinkManagedCard(student,'student2','shared',{...body,mutationId:id()}),403);
  await rejects(service.unlinkManagedCard(teacher,'student','shared',{...body,mutationId:id(),expectedRevision:2}),409);
  assert.equal(sqlite.prepare("SELECT revision FROM profile_settings WHERE profile_id='p1' AND key='tursoCardLinks'").get().revision,2,'Failed missing-link removal rolls back CAS');
  sqlite.close();
});
test('Managed card link reuses definition, isolates profiles, protects CAS and preserves teacher receipts',async()=>{
  const {service,personas,sqlite}=fixture(),[teacher,,student]=personas;
  const body={mutationId:id(),cardId:'shared',place:'mine',expectedRevision:0,expectedCardRevision:1};
  const before=sqlite.prepare('SELECT count(*) n FROM cards').get().n;
  const result=await service.linkManagedCard(teacher,'student',body);
  assert.deepEqual(await service.linkManagedCard(teacher,'student',body),result);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM cards').get().n,before);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM profile_cards WHERE profile_id='p2'").get().n,0);
  assert.equal(sqlite.prepare('SELECT account_id FROM operation_receipts WHERE mutation_id=?').get(body.mutationId).account_id,teacher.id);
  await rejects(service.linkManagedCard(teacher,'student',{...body,mutationId:id()}),409);
  await rejects(service.linkManagedCard(student,'student2',{...body,mutationId:id()}),403);
  await rejects(service.linkManagedCard(teacher,'student2',{...body,cardId:'private',mutationId:id()}),404);
  await rejects(service.linkManagedCard(teacher,'student',{...body,cardId:'draft-card',expectedRevision:1,mutationId:id()}),404);
  await rejects(service.linkManagedCard(teacher,'student',{...body,expectedRevision:1,mutationId:id(),profileId:'p2'}),400);
  sqlite.close();
});
test('Managed lesson access is point-scoped, CAS-protected, replayable and never changes definitions',async()=>{
  const {service,personas,sqlite,loseResponse}=fixture(),[teacher,,student]=personas;
  const expected={allowHidden:false,personalHidden:false},changes={allowHidden:true,personalHidden:false};
  const body={mutationId:id(),expected,changes};
  const before=sqlite.prepare('SELECT * FROM lessons').all();
  const result=await service.setLessonAccess(teacher,'student','hidden',body);
  assert.deepEqual(await service.setLessonAccess(teacher,'student','hidden',body),result);
  assert.deepEqual(sqlite.prepare('SELECT * FROM lessons').all(),before);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM lesson_access WHERE account_id=?').get('student2').n,0);
  await rejects(service.setLessonAccess(teacher,'student','hidden',{...body,mutationId:id()}),409);
  await rejects(service.setLessonAccess(student,'student','visible',{...body,mutationId:id()}),403);
  await rejects(service.setLessonAccess(teacher,'missing','hidden',{...body,mutationId:id()}),404);
  loseResponse();const retry={mutationId:id(),expected,changes:{allowHidden:false,personalHidden:true}};
  const saved=await service.setLessonAccess(teacher,'student','visible',retry);
  assert.deepEqual(await service.setLessonAccess(teacher,'student','visible',retry),saved);
  assert.equal((await service.lessons(student)).some(l=>l.id==='visible'),false);
  assert.equal((await service.lessons(student)).some(l=>l.id==='hidden'),true);
  sqlite.close();
});

test('Save, fresh-session read, replay, conflict and uncertain commit',async()=>{
  const {service,personas,loseResponse,sqlite}=fixture();const [teacher,dev,student]=personas;
  const body={mutationId:id(),expectedRevision:1,changes:{ru:"новый перевод ' ; DROP TABLE cards; --"}};
  const result=await service.editCard(teacher,'shared',body);
  assert.equal((await service.card(student,'shared')).ru,body.changes.ru);
  assert.deepEqual(await service.editCard(teacher,'shared',body),result);
  assert.equal((await service.card(dev,'shared')).revision,2);
  await rejects(service.editCard(teacher,'shared',{...body,changes:{ru:'different'}}),409);
  await rejects(service.editCard(dev,'shared',{...body,mutationId:id()}),409);
  assert.equal((await service.card(student,'shared')).ru,body.changes.ru);
  loseResponse();
  await service.editCard(dev,'shared',{mutationId:id(),expectedRevision:2,changes:{ru:'after lost response'}});
  assert.equal((await service.card(student,'shared')).revision,3);
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  sqlite.close();
});
test('Quiz create/edit/delete persists, only selected quiz deleted, duplicate race once',async()=>{
  const {service,personas,sqlite}=fixture();const [teacher,dev,student]=personas;
  const first=await service.createQuiz(teacher,'shared',{mutationId:id(),expectedRevision:1,expectedCollectionRevision:0,quiz:{type:'Flip',items:[{front:'test',back:'тест'}]}});
  const request={mutationId:id(),expectedRevision:1,expectedCollectionRevision:1,quiz:{type:'Type',items:[{prompt:'test',answer:'тест'}]}};
  const [second,duplicate]=await Promise.all([service.createQuiz(teacher,'shared',request),service.createQuiz(teacher,'shared',request)]);
  assert.deepEqual(second,duplicate);
  assert.equal((await service.card(student,'shared')).quizzes.length,2);
  await service.editQuiz(dev,second.id,{mutationId:id(),expectedRevision:1,quiz:{type:'Type',items:[{prompt:'test',answer:'исправлено'}]}});
  assert.equal((await service.card(student,'shared')).quizzes.find(q=>q.id===second.id).items[0].answer,'исправлено');
  const deletion={mutationId:id(),expectedRevision:1};
  await service.deleteQuiz(teacher,first.id,deletion);
  await service.deleteQuiz(teacher,first.id,deletion);
  assert.deepEqual((await service.card(student,'shared')).quizzes.map(q=>q.id),[second.id]);
  assert.equal((await service.card(student,'shared')).collections[0].revision,4);
  await rejects(service.editQuiz(dev,first.id,{mutationId:id(),expectedRevision:1,quiz:request.quiz}),409);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM quizzes').get().n,2);
  sqlite.close();
});
test('Student mutation denied, private/draft/hidden visibility and card delete',async()=>{
  const {service,personas,db,sqlite}=fixture();const [teacher,dev,student,other]=personas;
  const body={mutationId:id(),expectedRevision:1};
  for(const role of [student,other]){
    await rejects(service.editCard(role,'shared',{...body,changes:{ru:'unauthorized'}}),403);
    await rejects(service.deleteCard(role,'shared',body),403);
    await rejects(service.createQuiz(role,'shared',{...body,expectedCollectionRevision:0,quiz:{type:'Flip',items:[{}]}}),403);
    await rejects(service.deleteQuiz(role,'unknown',body),403);
    await rejects(service.editQuiz(role,'unknown',{...body,quiz:{type:'Flip',items:[{}]}}),403);
    await rejects(service.card(role,'draft-card'),404);await rejects(service.card(role,'hidden-card'),404);
  }
  assert.equal((await service.card(student,'private')).ru,'personal');
  await rejects(service.card(other,'private'),404);await rejects(service.card(teacher,'private'),404);
  assert.equal((await service.card(dev,'draft-card')).ru,'secret');
  await db.atomic([statement('INSERT INTO lesson_access(account_id,lesson_id,allow_hidden) VALUES(?,?,1)',['student','hidden'])]);
  assert.equal((await service.card(student,'hidden-card')).ru,'secret');
  await db.atomic([statement('UPDATE lesson_access SET personal_hidden=1 WHERE account_id=? AND lesson_id=?',['student','hidden'])]);
  await rejects(service.card(student,'hidden-card'),404);
  await service.deleteCard(teacher,'shared',body);
  await service.deleteCard(teacher,'shared',body);
  await rejects(service.card(dev,'shared'),404);await rejects(service.card(student,'shared'),404);
  assert.equal((await service.cards(student)).some(c=>c.id==='shared'),false);
  sqlite.close();
});
test('HTTP authentication, no role spoof, CSRF/DNS rebinding and no secret files',async()=>{
  const {db,personas,sqlite}=fixture();const {server,launchCode}=createStageServer({db,personas});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    const req=(path,method='GET',body,headers={})=>fetch(origin+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal((await req('/api/cards')).status,401);
    assert.equal((await req('/api/test/session','POST',{persona:'teacher',launchCode:'invalid'})).status,403);
    assert.equal((await req('/api/test/session','POST',{persona:'student',launchCode,role:'DEVELOPER'})).status,403);
    const session=await req('/api/test/session','POST',{persona:'student',launchCode});assert.equal(session.status,200);
    const cookie=session.headers.get('set-cookie').split(';')[0];
    assert.equal((await req('/api/cards/shared')).status,401);
    assert.equal((await req('/api/cards/shared','GET',null,{Cookie:cookie})).status,200);
    assert.equal((await req('/api/cards/shared','PATCH',{mutationId:id(),expectedRevision:1,changes:{ru:'no'},role:'DEVELOPER'},{Cookie:cookie,'X-Role':'DEVELOPER'})).status,403);
    assert.equal((await req('/api/cards/shared','DELETE',{mutationId:id(),expectedRevision:1},{Cookie:cookie,Origin:'https://evil.example'})).status,403);
    const rebound=await new Promise((resolve,reject)=>{const r=request(origin+'/api/test/personas',{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);});r.on('error',reject);r.end();});
    assert.equal(rebound,403);
    assert.equal((await req('/.dev.vars','GET',null,{Cookie:cookie})).status,404);
    assert.equal((await req('/','GET')).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));sqlite.close();}
});
test('Personal progress: own profile, paired profile, CAS, retry after lost commit and cleared counters',async()=>{
  const f=fixture(),student=f.personas[2],other=f.personas[3];
  f.sqlite.exec("INSERT INTO profile_members VALUES('developer','p1')");
  const baseline=f.sqlite.prepare('SELECT * FROM cards').all();
  const body={mutationId:id(),expectedRevision:0,changes:{learned:true,variants:['own variant']}};
  const saved=await f.service.saveCardProgress(student,'shared',body);
  assert.deepEqual(await f.service.saveCardProgress(student,'shared',body),saved);
  await rejects(f.service.saveCardProgress(student,'shared',{...body,mutationId:id()}),409);
  await rejects(f.service.saveCardProgress(other,'private',{...body,mutationId:id()}),404);
  await rejects(f.service.saveCardProgress(student,'draft-card',{...body,mutationId:id()}),404);
  await rejects(f.service.saveCardProgress(student,'hidden-card',{...body,mutationId:id()}),404);
  await rejects(f.service.saveCardProgress(student,'shared',{...body,profileId:'p2'}),400);
  await rejects(f.service.saveCardProgress(student,'shared',{...body,changes:{ru:'no'}}),400);
  let rev=0;
  for(const correct of [false,true,true,true,true]){
    const answer={mutationId:id(),expectedRevision:rev,quizType:'Type',correct};
    if(rev===1)f.loseResponse();
    const result=await f.service.answerCard(student,'shared',answer);rev=result.revision;
    assert.deepEqual(await f.service.answerCard(student,'shared',answer),result);
  }
  const [progress]=await f.db.read('SELECT * FROM quiz_progress');
  assert.equal(progress.revision,5);assert.equal(JSON.parse(progress.progress_json).cleared,true);
  const paired=await f.service.answerCard(f.personas[1],'shared',{mutationId:id(),expectedRevision:5,quizType:'Type',correct:false});
  assert.equal(paired.progress.misses,1);assert.equal(paired.progress.streak,0);
  const independent=await f.service.answerCard(other,'shared',{mutationId:id(),expectedRevision:0,quizType:'Type',correct:true});
  assert.equal(independent.progress.misses,0);assert.equal(independent.revision,1);
  await rejects(f.service.answerCard(student,'shared',{mutationId:id(),expectedRevision:6,quizType:'Type',correct:true,misses:0}),400);
  await rejects(f.service.editCard(student,'shared',{mutationId:id(),expectedRevision:1,changes:{ru:'no'}}),403);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM cards').all(),baseline);
  f.sqlite.close();
});
test('Lesson responses never update definitions or foreign profiles; block/response CAS, server score and validation',async()=>{
  const f=fixture(),student=f.personas[2],other=f.personas[3];
  f.sqlite.exec(`INSERT INTO lesson_blocks(lesson_id,id,position,type,content_json) VALUES
    ('visible','task',1,'task','{"text":"Write something"}'),
    ('visible','quiz',2,'quiz','{"quizType":"Choice","items":[{"options":["yes","no"],"answer":1}]}'),
    ('hidden','task',1,'task','{}');`);
  const baseline=f.sqlite.prepare('SELECT * FROM lesson_blocks').all();
  const body={mutationId:id(),expectedRevision:0,expectedBlockRevision:1,response:'my private answer'};
  const result=await f.service.saveLessonResponse(student,'visible','task',body);
  assert.deepEqual(await f.service.saveLessonResponse(student,'visible','task',body),result);
  await rejects(f.service.saveLessonResponse(student,'visible','task',{...body,mutationId:id()}),409);
  await rejects(f.service.saveLessonResponse(student,'visible','task',{...body,mutationId:id(),expectedRevision:1,expectedBlockRevision:2}),409);
  await rejects(f.service.saveLessonResponse(student,'hidden','task',{...body,mutationId:id()}),404);
  await rejects(f.service.saveLessonResponse(student,'visible','task',{...body,profileId:'p2'}),400);
  await f.service.saveLessonResponse(other,'visible','task',{...body,mutationId:id(),response:'other private answer'});
  const choice={mutationId:id(),expectedRevision:0,expectedBlockRevision:1,response:{items:[{picked:1}],checked:true}};
  const scored=await f.service.saveLessonResponse(student,'visible','quiz',choice);assert.equal(scored.response.score,'1 / 1');
  await rejects(f.service.saveLessonResponse(student,'visible','quiz',{...choice,mutationId:id(),expectedRevision:1,response:{items:[{answer:0}]}}),400);
  await rejects(f.service.saveLessonResponse(student,'visible','quiz',{...choice,mutationId:id(),expectedRevision:1,response:{items:[{picked:2}]}}),400);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM lesson_blocks').all(),baseline);
  assert.equal(JSON.parse((await f.db.read('SELECT response_json FROM lesson_responses WHERE profile_id=? AND block_id=?',['p1','task']))[0].response_json).value,'my private answer');
  assert.equal(JSON.parse((await f.db.read('SELECT response_json FROM lesson_responses WHERE profile_id=? AND block_id=?',['p2','task']))[0].response_json).value,'other private answer');
  assert.deepEqual(await f.db.read('PRAGMA foreign_key_check'),[]);f.sqlite.close();
});
test('Lesson CRUD: draft/publish/hide visibility, point edits, receipts, soft deletes and existing cards',async()=>{
  const f=fixture(),[teacher,dev,student]=f.personas;
  const block=(id,type,content={},cardId=null)=>({id,type,content,cardId,tab:'overview',expectedRevision:0});
  const request={mutationId:id(),id:'new_lesson',changes:{title:'New lesson',date:'2026-10-03'},blocks:[block('task','task',{text:'Write'}),block('linked','wordcard',{},'shared')]};
  const baseline=f.sqlite.prepare('SELECT * FROM cards').all();
  await rejects(f.service.createLesson(student,request),403);
  f.loseResponse();const created=await f.service.createLesson(teacher,request);
  assert.deepEqual(await f.service.createLesson(teacher,request),created);
  assert.equal((await legacyLessons(f.db,student)).materials.some(l=>l.id==='new_lesson'),false);
  const publish={mutationId:id(),expectedRevision:1,changes:{published:true},upserts:[],deletes:[]};
  await f.service.editLesson(dev,'new_lesson',publish);
  assert.equal((await legacyLessons(f.db,student)).materials.find(l=>l.id==='new_lesson').blocks.length,2);
  await rejects(f.service.editLesson(teacher,'new_lesson',{...publish,mutationId:id()}),409);
  const beforeBlocks=f.sqlite.prepare("SELECT * FROM lesson_blocks WHERE lesson_id='new_lesson'").all();
  await f.service.editLesson(teacher,'new_lesson',{mutationId:id(),expectedRevision:2,changes:{title:'Edited'},upserts:[{...block('task','task',{text:'Changed'}),expectedRevision:1}],deletes:[]});
  assert.deepEqual(f.sqlite.prepare("SELECT * FROM lesson_blocks WHERE lesson_id='new_lesson' AND id='linked'").get(),beforeBlocks.find(b=>b.id==='linked'));
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM cards').all(),baseline);
  await f.service.editLesson(teacher,'new_lesson',{mutationId:id(),expectedRevision:3,changes:{hiddenFromStudents:true},upserts:[],deletes:[]});
  assert.equal((await legacyLessons(f.db,student)).materials.some(l=>l.id==='new_lesson'),false);
  const deletion={mutationId:id(),expectedRevision:4};await f.service.deleteLesson(dev,'new_lesson',deletion);await f.service.deleteLesson(dev,'new_lesson',deletion);
  assert.equal((await legacyLessons(f.db,teacher)).materials.some(l=>l.id==='new_lesson'),false);
  assert.ok(f.sqlite.prepare("SELECT deleted_at FROM lessons WHERE id='new_lesson'").get().deleted_at);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM lesson_blocks WHERE lesson_id='new_lesson'").get().n,2);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM cards').all(),baseline);f.sqlite.close();
});
test('Lesson block edits are atomic, scoped, ordered and never overwrite learner answers',async()=>{
  const f=fixture(),[teacher,,student]=f.personas;
  const b=(id,text,expectedRevision=0)=>({id,type:'task',tab:'overview',cardId:null,content:{text},expectedRevision});
  await f.service.createLesson(teacher,{mutationId:id(),id:'new_lesson',changes:{title:'Test',published:true},blocks:[b('a','Original'),b('b','Keep')]});
  await f.service.saveLessonResponse(student,'new_lesson','a',{mutationId:id(),expectedRevision:0,expectedBlockRevision:1,response:'Private old answer'});
  const responses=f.sqlite.prepare('SELECT * FROM lesson_responses').all();
  const patch={mutationId:id(),expectedRevision:1,changes:{title:'Changed'},upserts:[b('a','New',9)],deletes:[]};
  await rejects(f.service.editLesson(teacher,'new_lesson',patch),409);
  assert.equal(f.sqlite.prepare("SELECT revision FROM lessons WHERE id='new_lesson'").get().revision,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM operation_receipts WHERE mutation_id=?').get(patch.mutationId).n,0);
  await rejects(f.service.editLesson(teacher,'new_lesson',{...patch,mutationId:id(),upserts:[],deletes:[{id:'b',expectedRevision:8}]}),409);
  await rejects(f.service.editLesson(teacher,'new_lesson',{...patch,mutationId:id(),upserts:[b('c','New')],order:['a','c']}),400);
  await rejects(f.service.editLesson(teacher,'new_lesson',{...patch,mutationId:id(),upserts:[{...b('c','New'),type:'video'}]}),400);
  await rejects(f.service.editLesson(teacher,'new_lesson',{...patch,mutationId:id(),upserts:[{...b('c','New'),content:{response:'foreign answer'}}]}),400);
  f.loseResponse();const good={...patch,mutationId:id(),upserts:[b('a','New',1),b('c','Added')],deletes:[{id:'b',expectedRevision:1}],order:['c','a']};
  const saved=await f.service.editLesson(teacher,'new_lesson',good);assert.deepEqual(await f.service.editLesson(teacher,'new_lesson',good),saved);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM lesson_responses').all(),responses,'Do not rewrite or delete any personal answers');
  const lesson=(await legacyLessons(f.db,student)).materials.find(l=>l.id==='new_lesson');
  assert.deepEqual(lesson.blocks.map(b=>b.id),['c','a']);assert.equal(lesson.blocks[1].response,undefined,'Old answers must not apply to new definitions');
  assert.equal(lesson.blocks[1].stageResponseRevision,1);
  await rejects(f.service.saveLessonResponse(student,'new_lesson','a',{mutationId:id(),expectedRevision:1,expectedBlockRevision:1,response:'Stale'}),409);
  await f.service.saveLessonResponse(student,'new_lesson','a',{mutationId:id(),expectedRevision:1,expectedBlockRevision:2,response:'New own answer'});
  assert.equal((await legacyLessons(f.db,student)).materials.find(l=>l.id==='new_lesson').blocks[1].response,'New own answer');
  assert.ok(f.sqlite.prepare("SELECT deleted_at FROM lesson_blocks WHERE lesson_id='new_lesson' AND id='b'").get().deleted_at);
  assert.deepEqual(await f.db.read('PRAGMA foreign_key_check'),[]);f.sqlite.close();
});
