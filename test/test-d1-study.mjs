import {resolveTestDependency} from '../ops/check-environment.mjs';
import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {D1StudyClient} from '../src/d1-study.mjs';
import {statement as s} from '../src/learning-study.mjs';
import {AccountGroupTeachers} from '../src/account-group-teachers.mjs';
import {AccountInvites} from '../src/account-invites.mjs';
import {EmailOtp} from '../src/email-otp.mjs';
import {Passkeys} from '../src/passkeys.mjs';
import {MicrosoftOAuth} from '../src/microsoft-oauth.mjs';
import {saveBug,listBugs,resolveBug,resetBugStoreForTests} from '../src/bug-log.mjs';
import {DatabaseSync} from 'node:sqlite';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {StudyService} from '../src/learning-study.mjs';
import {ExamService} from '../src/learning-exams.mjs';
import {GroupService} from '../src/learning-groups.mjs';
import {MessageService} from '../src/learning-messages.mjs';
import {bindChatEncryption} from '../src/chat-encryption.mjs';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(resolveTestDependency('miniflare'));
let mf,binding,db,curriculum;
before(async()=>{
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local only")}}',compatibilityDate:'2026-08-01',d1Databases:{STUDY_DB:'local-study-contract',CURRICULUM:'local-curriculum-contract'}}));
  binding=await mf.getD1Database('STUDY_DB');db=new D1StudyClient(binding);
  await db.atomic([
    s('CREATE TABLE records(id INTEGER PRIMARY KEY, title TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL DEFAULT 1)'),
    s('CREATE TABLE children(id INTEGER PRIMARY KEY,parent INTEGER REFERENCES records(id))'),
    s('CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key))'),
    s('CREATE TABLE class_groups(id INTEGER PRIMARY KEY,deleted_at INTEGER)'),s('INSERT INTO class_groups VALUES(1,NULL)'),
    s('CREATE TABLE class_group_students(account_id TEXT PRIMARY KEY,group_id INTEGER)'),s("INSERT INTO class_group_students VALUES('student',1)")
  ]);
});
after(async()=>{if(mf)await mf.dispose();});

test('requires a dedicated D1 binding',()=>{for(const value of [null,{}, {prepare(){}}])assert.throws(()=>new D1StudyClient(value),e=>e.status===503);});
test('bug occurrence history, legacy backfill and resolution dates work on actual D1',async()=>{
  resetBugStoreForTests();
  const event={method:'GET',path:'/api/fixture-bug',status:500,error:'D1 fixture failure',request:{},response:{}};
  await saveBug(db,event);const [first]=await listBugs(db);
  await resolveBug(db,first.id);const [closed]=await listBugs(db);assert.ok(closed.resolvedAt);assert.equal(closed.resolutions.length,1);
  await saveBug(db,event);const [again]=await listBugs(db);assert.equal(again.resolved,false);assert.equal(again.resolvedAt,null);assert.equal(again.occurrences.length,2);assert.equal(again.resolutions.length,1);
  resetBugStoreForTests();assert.equal((await listBugs(db))[0].occurrences.length,2);
});
test('real D1 rejects TEMP tables, so unadapted Learning transactions cannot be activated',async()=>{
  await assert.rejects(binding.prepare('CREATE TEMP TABLE unsupported_temp(id INTEGER)').all(),/not authorized/);
});
test('typed bindings, quotes, Unicode, nulls and JSON round-trip unchanged',async()=>{
  assert.deepEqual(await db.read('SELECT ? AS text, ? AS n, ? AS f, ? AS missing, json_extract(?,\'$.n\') AS j',["mutation_guard ' Привет",42,1.25,null,'{"n":3}']),[{text:"mutation_guard ' Привет",n:42,f:1.25,missing:null,j:3}]);
});
test('read snapshots return ordered result sets, including empty sets',async()=>{
  assert.deepEqual(await db.readMany([s('SELECT 1 AS n'),s('SELECT 2 AS n WHERE 0')]),[[{n:1}],[]]);
  assert.deepEqual(await db.atomic([]),[]);
});
test('atomic results retain Hrana shape, changes and inserted IDs',async()=>{
  const results=await db.atomic([s('INSERT INTO records(title) VALUES(?)',['first']),s('SELECT changes() AS changed,last_insert_rowid() AS id')]);
  assert.equal(results.length,2);assert.equal(results[0].affected_row_count,1);
  assert.deepEqual(results[1].cols,[{name:'changed'},{name:'id'}]);
  assert.deepEqual(results[1].rows,[[{type:'integer',value:'1'},{type:'integer',value:'1'}]]);
});
test('guard failure rolls back every preceding write and scratch table',async()=>{
  await assert.rejects(db.atomic([s('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))'),s("INSERT INTO records(title) VALUES('rollback')"),s('INSERT INTO mutation_guard SELECT 0')]),e=>e.status===409);
  assert.deepEqual(await db.read("SELECT id FROM records WHERE title='rollback'"),[]);
  assert.deepEqual(await db.read("SELECT name FROM sqlite_master WHERE name LIKE '_study_batch_%'"),[]);
});
test('guards preserve changes() and clean up even without explicit DROP',async()=>{
  await db.atomic([s('DROP TABLE IF EXISTS temp.group_guard'),s('CREATE TEMP TABLE group_guard(ok INTEGER CHECK(ok=1))'),s("UPDATE records SET revision=revision+1 WHERE title='first'"),s('INSERT INTO group_guard SELECT changes()=1')]);
  assert.equal((await db.read("SELECT revision FROM records WHERE title='first'"))[0].revision,2);
  assert.deepEqual(await db.read("SELECT name FROM sqlite_master WHERE name LIKE '_study_batch_%'"),[]);
});
test('saved IDs survive scratch inserts and multiple entity creation',async()=>{
  const results=await db.atomic([s('CREATE TEMP TABLE created_rows(seq INTEGER PRIMARY KEY,id INTEGER NOT NULL)'),s("INSERT INTO records(title) VALUES('copy-one')"),s('INSERT INTO created_rows VALUES(1,last_insert_rowid())'),s("INSERT INTO records(title) VALUES('copy-two')"),s('INSERT INTO created_rows VALUES(2,last_insert_rowid())'),s('SELECT r.title FROM records r JOIN temp.created_rows c ON r.id=c.id ORDER BY c.seq'),s('DROP TABLE temp.created_rows')]);
  assert.deepEqual(results[5].rows,[[{type:'text',value:'copy-one'}],[{type:'text',value:'copy-two'}]]);
});
test('literal SQL-looking content is never rewritten',async()=>{
  const [result]=await db.atomic([s("SELECT 'temp.mutation_guard; CREATE TEMP TABLE created_rows' AS text, ? AS bound",['DROP TABLE temp.chat_guard'])]);
  assert.deepEqual(result.rows,[[{type:'text',value:'temp.mutation_guard; CREATE TEMP TABLE created_rows'},{type:'text',value:'DROP TABLE temp.chat_guard'}]]);
});
test('foreign keys remain enforced and failure rolls back the batch',async()=>{
  await assert.rejects(db.atomic([s("INSERT INTO records(title) VALUES('fk-rollback')"),s('INSERT INTO children(parent) VALUES(-1)')]),e=>e.status===409);
  assert.deepEqual(await db.read("SELECT id FROM records WHERE title='fk-rollback'"),[]);
});
test('duplicate keys return conflict and do not partially commit',async()=>{
  await assert.rejects(db.atomic([s("INSERT INTO records(title) VALUES('unique-rollback')"),s("INSERT INTO records(title) VALUES('first')")]),e=>e.status===409);
  assert.deepEqual(await db.read("SELECT id FROM records WHERE title='unique-rollback'"),[]);
});
test('parallel guarded CAS edits yield exactly one winner without shared scratch state',async()=>{
  const results=await Promise.allSettled(Array.from({length:8},()=>db.atomic([s('CREATE TEMP TABLE mutation_guard(ok INTEGER CHECK(ok=1))'),s("UPDATE records SET revision=3 WHERE title='first' AND revision=2"),s('INSERT INTO mutation_guard SELECT changes()=1')])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  for(const r of results.filter(r=>r.status==='rejected'))assert.equal(r.reason.status,409);
});
test('Accounts teacher service preserves assignments, revisions and student membership on D1',async()=>{
  const service=new AccountGroupTeachers(db),actor={id:'dev',role:'DEVELOPER'},users=[actor,{id:'teacher',role:'ADMIN'},{id:'student',role:'USER'}];
  await service.save(actor,{groupId:1,teacherIds:['teacher'],expectedRevision:0},users);
  assert.deepEqual((await service.list(actor,users)).assignments[0].teacherIds,['teacher']);
  await assert.rejects(service.save(actor,{groupId:1,teacherIds:[],expectedRevision:0},users),e=>e.status===409);
  assert.equal((await db.read('SELECT group_id FROM class_group_students'))[0].group_id,1);
});
test('invite and email-code CAS guards work on actual D1 without TEMP tables',async()=>{
  await db.atomic([s("ALTER TABLE class_groups ADD COLUMN title TEXT NOT NULL DEFAULT 'A1'")]);
  const teacher={id:'teacher',role:'ADMIN'},service=new AccountInvites(db);
  const invite=await service.create(teacher,{groupId:1},[teacher]);
  await service.redeem({id:'student',role:'USER'},invite.token,async()=>{});
  await assert.rejects(service.peek(invite.token),error=>error.status===410);
  const otp=new EmailOtp(db),proof=await otp.issue('fixture@example.invalid');
  const wrong=proof.code==='100000'?'100001':'100000';
  await assert.rejects(otp.consume(proof.email,wrong),error=>error.status===401);
  assert.equal((await otp.consume(proof.email,proof.code)).email,proof.email);
  await assert.rejects(otp.consume(proof.email,proof.code),error=>error.status===400);
  assert.deepEqual(await db.read("SELECT name FROM sqlite_master WHERE name IN ('_study_batch_invite_guard','_study_batch_email_otp_guard','_study_batch_email_otp_consume_guard')"),[]);
});
test('passkey rate limits and single-use challenges work through actual D1 guards',async()=>{
  const service=new Passkeys(db,'https://fixture.invalid');
  const challenge=await service.issue('login',{rateKey:'d1-passkey'});
  assert.equal(challenge.options.userVerification,'required');
  const stored=await service.challenge(challenge.token,'login');
  await service.atomic(service.consume(challenge.token,stored));
  await assert.rejects(service.atomic(service.consume(challenge.token,stored)),error=>error.status===409);
  for(let i=0;i<20;i++)await service.limit('limited-fixture');
  await assert.rejects(service.limit('limited-fixture'),error=>error.status===429);
  assert.deepEqual(await db.read("SELECT name FROM sqlite_master WHERE name='_study_batch_passkey_guard'"),[]);
});
test('Microsoft authorization state and identity linking use transactional D1 guards',async()=>{
  const service=new MicrosoftOAuth(db,'https://fixture.invalid');
  const {token}=await service.start('','microsoft-fixture');
  const outcomes=await Promise.allSettled([service.consume(token,'authorize'),service.consume(token,'authorize')]);
  assert.equal(outcomes.filter(outcome=>outcome.status==='fulfilled').length,1);
  await service.link('fixture-microsoft-subject',{registrationId:'pending-microsoft',accountId:''});
  await service.approved('pending-microsoft','microsoft-user');
  assert.equal((await service.identity('fixture-microsoft-subject')).accountId,'microsoft-user');
  await service.removeAccount('microsoft-user');assert.equal(await service.identity('fixture-microsoft-subject'),null);
});
test('read-only calls reject writes before executing any part of a batch',async()=>{
  for(const action of [()=>db.read("DELETE FROM records"),()=>db.readMany([s('SELECT 1'),s('DELETE FROM records')]),()=>db.atomic([s('DELETE FROM records')],{readOnly:true}),()=>db.read('PRAGMA foreign_keys=OFF')])await assert.rejects(action,e=>e.status===500);
  assert.equal((await db.read('SELECT count(*) AS n FROM records'))[0].n,3);
});
test('schema inspection supports table_info used by existing runtime migrations',async()=>{
  assert.deepEqual((await db.read('PRAGMA table_info(records)')).map(c=>c.name),['id','title','revision']);
});
test('unknown temporary tables, multi-statements and explicit transactions fail closed',async()=>{
  for(const sql of ['CREATE TEMP TABLE unknown_guard(ok INTEGER)','SELECT 1; DELETE FROM records','BEGIN IMMEDIATE','COMMIT','PRAGMA foreign_keys=OFF','SELECT * FROM temp.unknown_guard'])await assert.rejects(db.atomic([s(sql)]),e=>e.status===500);
});
test('invalid or unsafe typed arguments are rejected',async()=>{
  for(const arg of [{type:'integer',value:'9007199254740993'},{type:'float',value:Infinity},{type:'blob',value:'AA=='},{type:'text',value:{} }])await assert.rejects(db.atomic([{sql:'SELECT ?',args:[arg]}]),e=>e.status===500);
});
test('database errors are sanitized and uncertain writes are never retried',async()=>{
  let calls=0;const client=new D1StudyClient({prepare:()=>({bind(){return this;}}),async batch(){calls++;throw new Error('D1_ERROR: secret SQL and credential');}});
  await assert.rejects(client.atomic([s('SELECT 1')]),e=>e.status===503&&!e.message.includes('secret'));
  assert.equal(calls,1);
});
test('complete migrated educational schema creates on actual D1',async()=>{
  curriculum=new D1StudyClient(await mf.getD1Database('CURRICULUM'));
  const sqlite=new DatabaseSync(':memory:');
  try{
    applyLearningSchema(sqlite);
    const commands=sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
    for(const {sql} of commands)await curriculum.atomic([s(sql)]);
    const expected=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
    const actual=(await curriculum.read("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map(row=>row.name);
    for(const name of expected)assert.ok(actual.includes(name),name);
  }finally{sqlite.close();}
  await curriculum.atomic([s("INSERT INTO account_refs(id) VALUES('teacher'),('student')"),s("INSERT INTO study_profiles(id,kind) VALUES(1,'personal')"),s("INSERT INTO profile_members VALUES('teacher',1),('student',1)")]);
});
let lesson;
const teacher={id:'teacher',role:'ADMIN'},student={id:'student',role:'USER'};
const newLesson=()=>({mutationId:crypto.randomUUID(),changes:{title:'D1 lesson',published:true},blocks:[{id:null,type:'task',content:{text:'Write an answer'},cardId:null,tab:'overview',expectedRevision:0}]});
test('lesson creation stores generated block IDs and replays its receipt exactly once',async()=>{
  const service=new StudyService(curriculum),request=newLesson();
  lesson=await service.createLesson(teacher,request);
  assert.ok(lesson.id>0);assert.equal(lesson.blocks.length,1);
  assert.deepEqual(await service.createLesson(teacher,request),lesson);
  assert.equal((await curriculum.read('SELECT count(*) AS n FROM lessons'))[0].n,1);
  await assert.rejects(service.createLesson(teacher,{...request,changes:{title:'Different'}}),e=>e.status===409);
});
test('concurrent duplicate lesson requests return one persisted lesson and identical IDs',async()=>{
  const service=new StudyService(curriculum),request=newLesson();
  const results=await Promise.all(Array.from({length:4},()=>service.createLesson(teacher,request)));
  for(const result of results)assert.deepEqual(result,results[0]);
  assert.equal((await curriculum.read('SELECT count(*) AS n FROM lessons'))[0].n,2);
});
test('lesson edits enforce revisions, preserve block text and reject student mutation',async()=>{
  const service=new StudyService(curriculum),body={mutationId:crypto.randomUUID(),expectedRevision:1,changes:{title:'Renamed'},upserts:[],deletes:[]};
  await service.editLesson(teacher,lesson.id,body);
  await assert.rejects(service.editLesson(teacher,lesson.id,{...body,mutationId:crypto.randomUUID()}),e=>e.status===409);
  await assert.rejects(service.createLesson(student,newLesson()),e=>e.status===403);
  assert.equal((await curriculum.read('SELECT content_json FROM lesson_blocks WHERE lesson_id=?',[lesson.id]))[0].content_json,'{"text":"Write an answer"}');
});
test('exam save, generated IDs, archive schema and group seeding work unchanged on D1',async()=>{
  const exams=new ExamService(curriculum);
  const exam=await exams.save(teacher,{exam:{title:'D1 exam',blocks:[{title:'Part one',published:false,materials:[{type:'text',text:'Instructions',tab:'overview'}]}]}});
  assert.ok(exam.id>0);
  assert.equal((await curriculum.read('SELECT count(*) AS n FROM exam_materials WHERE exam_id=?',[exam.id]))[0].n,1);
  const groups=await new GroupService(curriculum).list(teacher);assert.ok(groups.length>=9);
  assert.deepEqual(await curriculum.read("SELECT name FROM sqlite_master WHERE name LIKE '_study_batch_%'"),[]);
});
test('existing learning-message outbox trigger and runtime schema upgrades work on D1',async()=>{
  await new MessageService(curriculum,async()=>[]).ensure();
  assert.equal((await curriculum.read("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name='chat_notice_outbox'"))[0].n,1);
  await curriculum.atomic([s("INSERT INTO chat_rooms(id,kind) VALUES('test-room','direct')"),s("INSERT INTO chat_messages(room_id,sender_id,sender_name,category,body,client_key) VALUES('test-room','teacher','Teacher','learning','fixture','outbox-fixture')")]);
  assert.equal((await curriculum.read('SELECT count(*) AS n FROM chat_delivery_outbox'))[0].n,1);
});
test('D1 journal keeps the existing chat encryption and authenticates the room binding',async()=>{
  bindChatEncryption(curriculum,{CHAT_ENCRYPTION_KEY:btoa('e'.repeat(32)),CHAT_ENCRYPTION_REQUIRED:'true'});
  const messages=new MessageService(curriculum,async()=>[]),text='Private D1 encryption fixture';
  const encrypted=await messages.sealText('test-room',text);
  await curriculum.atomic([s("INSERT INTO chat_messages(room_id,sender_id,sender_name,category,body,client_key) VALUES('test-room','teacher','Teacher','personal',?,'encrypted-fixture')",[encrypted])]);
  const [{body}]=await curriculum.read("SELECT body FROM chat_messages WHERE client_key='encrypted-fixture'");
  assert.ok(body.startsWith('chatenc:aes256gcm:'));assert.ok(!body.includes(text));
  assert.equal(await messages.openText('test-room',body),text);
  assert.throws(()=>messages.openText('another-room',body),e=>e.status===503);
});
test('trigger exception cannot be extended into arbitrary multi-statement SQL',async()=>{
  const [{sql}]=await curriculum.read("SELECT sql FROM sqlite_master WHERE name='chat_notice_outbox'");
  await assert.rejects(curriculum.atomic([s(sql+'; DELETE FROM chat_messages')]),e=>e.status===500);
});
test('D1 statement limits fail before a batch can partially execute',async()=>{
  let calls=0;const client=new D1StudyClient({prepare(){calls++;},batch(){calls++;}});
  for(const command of [s('SELECT '+Array(101).fill('?').join(','),Array(101).fill(1)),s("SELECT '"+'x'.repeat(100000)+"'"),s('SELECT ?',['x'.repeat(2000001)])]){
    await assert.rejects(client.atomic([s('SELECT 1'),command]),e=>e.status===413);
  }
  assert.equal(calls,0);
});
test('large parameter-only IN lists preserve values and binding order within D1 limits',async()=>{
  const ids=Array.from({length:150},(_,i)=>'value-'+i);
  assert.deepEqual(await db.read('SELECT ? AS first WHERE ? IN ('+ids.map(()=>'?').join(',')+') AND ?=?',['kept','value-149',...ids,'tail','tail']),[{first:'kept'}]);
  assert.deepEqual(await db.read('SELECT 1 AS n WHERE ? NOT IN ('+ids.map(()=>'?').join(',')+')',['absent',...ids]),[{n:1}]);
});
