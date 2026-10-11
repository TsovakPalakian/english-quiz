import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {MessageService} from '../src/turso-messages.mjs';
import {messagesTestWorker} from '../src/turso-messages-test-worker.mjs';
import {messagesWorker} from '../src/turso-messages-worker.mjs';
import {productionWorker} from '../src/turso-production-worker.mjs';
import {StudyError} from '../src/turso-study.mjs';
import {applyTursoSchema} from './turso-test-schema.mjs';
function fixture() {
  const sqlite=new DatabaseSync(':memory:');applyTursoSchema(sqlite);
  const args=command=>command.args.map(arg=>arg.type==='null'?null:arg.type==='integer'?Number(arg.value):arg.value);
  const db={async read(sql,values=[]){return sqlite.prepare(sql).all(...values);},async atomic(commands){
    sqlite.exec('BEGIN IMMEDIATE');
    try {const result=commands.map(command=>{const query=sqlite.prepare(command.sql),values=args(command);if(query.columns().length){const rows=query.all(...values);return {rows:rows.map(row=>Object.values(row).map(value=>({value:String(value)})))};}query.run(...values);return {rows:[]};});sqlite.exec('COMMIT');return result;}
    catch(error){sqlite.exec('ROLLBACK');throw new StudyError(/constraint/i.test(error.message)?409:503,error.message);}
  }};
  const users=[{id:'teacher',name:'Teacher',role:'ADMIN'},{id:'developer',name:'Private role',role:'DEVELOPER'},{id:'student',name:'Alice',role:'USER'},{id:'mate',name:'Bob',role:'USER'},{id:'other',name:'Other group',role:'USER'}];
  const service=new MessageService(db,async()=>users);
  const by=id=>users.find(user=>user.id===id);
  const boot=async()=>{await service.ensure();sqlite.exec("INSERT INTO class_groups(id,title) VALUES(1,'A1'),(2,'B1');INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES('student',1,'teacher'),('mate',1,'teacher'),('other',2,'teacher');INSERT INTO exams(id,title,published) VALUES(1,'Published exam',1),(2,'Draft exam',0);");};
  return {sqlite,db,users,service,by,boot,close:()=>sqlite.close()};
}
test('Private rooms, group membership and teacher-only announcements are enforced',async()=>{
  const f=fixture();try{await f.boot();const {service:s,by}=f;
    const contacts=await s.contacts(by('student'));assert.equal(contacts.some(row=>row.id==='other'),false);assert.equal(contacts.find(row=>row.id==='developer').role,'Support');
    await assert.rejects(s.open(by('student'),{kind:'direct',accountId:'other'}),error=>error.status===403);
    const {roomId}=await s.open(by('student'),{kind:'direct',accountId:'mate'});
    await assert.rejects(s.history(by('teacher'),roomId),error=>error.status===403);
    await assert.rejects(s.send(by('student'),{roomId,text:'Announcement',category:'learning',clientKey:'notice'}),error=>error.status===403);
    const body={roomId,text:'Hello <script>',category:'personal',clientKey:'first'};
    const sent=await s.send(by('student'),body);assert.ok(sent.id>0);assert.deepEqual(await s.send(by('student'),body),sent);
    await assert.rejects(s.send(by('student'),{...body,text:'Changed'}),error=>error.status===409);
    assert.equal((await s.summary(by('mate'))).total,1);
    await s.read(by('mate'),{roomId,category:'personal',through:sent.id});assert.equal((await s.summary(by('mate'))).total,0);
    assert.equal((await s.history(by('student'),roomId)).messages[0].read,true);
    const receipts=await s.history(by('student'),roomId,{after:sent.id});
    assert.equal(receipts.messages.length,0);assert.equal(receipts.peerReadThrough,sent.id);
    const group=await s.open(by('teacher'),{kind:'group',groupId:1});await s.send(by('teacher'),{roomId:group.roomId,text:'Group message',category:'personal',clientKey:'group-message'});
    assert.equal((await s.history(by('student'),group.roomId)).messages.length,1);
    await assert.rejects(s.history(by('other'),group.roomId),error=>error.status===403);
    await s.assignStudent(by('teacher'),'student',2);await assert.rejects(s.history(by('student'),group.roomId),error=>error.status===403);
    await s.assignStudent(by('teacher'),'other',1);assert.equal((await s.history(by('other'),group.roomId)).messages.length,0);
    await s.send(by('teacher'),{roomId:group.roomId,text:'New announcement',category:'learning',clientKey:'group-notice'});
    assert.equal((await s.summary(by('other'))).unread.learning,1);
  }finally{f.close();}
});
test('Assignments and notifications commit together, retry once and preserve cancellation history',async()=>{
  const f=fixture();try{await f.boot();const {service:s,by,sqlite}=f;
    const request={targetKind:'group',targetId:1,examId:1,action:'assign',clientKey:'assignment'};
    await s.assign(by('teacher'),request);await s.assign(by('teacher'),request);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM chat_messages').get().n,2);
    assert.equal((await s.summary(by('student'))).unread.learning,1);
    assert.equal((await s.examLink(by('student'),1)).examId,1);
    const room=(await s.summary(by('student'))).rooms.find(row=>row.kind==='direct');
    const notice=(await s.history(by('student'),room.id,{category:'learning'})).messages[0];
    assert.equal(notice.examId,1);assert.equal(notice.assignmentActive,true);
    await s.assign(by('teacher'),{...request,action:'unassign',clientKey:'cancel'});
    assert.equal((await s.history(by('student'),room.id,{category:'learning'})).messages[0].assignmentActive,false);
    await assert.rejects(s.examLink(by('student'),1),error=>error.status===403);
    await s.assign(by('teacher'),{targetKind:'student',targetId:'student',examId:1,action:'assign',clientKey:'personal-assignment'});
    assert.equal((await s.examLink(by('student'),1)).examId,1);
    await s.assign(by('teacher'),{targetKind:'student',targetId:'student',examId:2,action:'assign',clientKey:'draft'});
    await assert.rejects(s.examLink(by('student'),2),error=>error.status===404);
    const history=await s.history(by('student'),room.id,{category:'learning'});assert.equal(history.messages.some(row=>row.text.includes('Draft exam')),false);
    const before=sqlite.prepare('SELECT COUNT(*) n FROM chat_messages').get().n;
    sqlite.exec("CREATE TRIGGER reject_notice BEFORE INSERT ON chat_messages WHEN NEW.client_key LIKE 'rollback%' BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
    await assert.rejects(s.assign(by('teacher'),{targetKind:'group',targetId:2,examId:1,action:'assign',clientKey:'rollback'}));
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_group_exams WHERE group_id=2').get().n,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM chat_messages').get().n,before);
  }finally{f.close();}
});
test('Message history is paginated, searchable and account-specific; rate limits persist',async()=>{
  const f=fixture();try{await f.boot();const {service:s,by,sqlite}=f;
    const {roomId}=await s.open(by('teacher'),{kind:'direct',accountId:'student'});
    for(let i=0;i<75;i++)sqlite.prepare("INSERT INTO chat_messages(room_id,sender_id,sender_name,category,body,client_key) VALUES(?,'teacher','Teacher','personal',?,?)").run(roomId,'Message '+i,'seed-'+i);
    const page=await s.history(by('student'),roomId);assert.equal(page.messages.length,50);assert.equal(page.more,true);
    const earlier=await s.history(by('student'),roomId,{before:page.messages[0].id});assert.equal(earlier.messages.length,25);
    assert.equal((await s.history(by('student'),roomId,{query:'Message 74'})).messages.length,1);
    const parent=page.messages.at(-1);await s.send(by('student'),{roomId,text:'My reply',category:'personal',replyTo:parent.id,clientKey:'reply'});
    assert.equal((await s.history(by('teacher'),roomId)).messages.at(-1).replyText,'Message 74');
    sqlite.prepare('INSERT OR REPLACE INTO chat_send_budget VALUES(?,unixepoch(),30)').run('student');
    await assert.rejects(s.send(by('student'),{roomId,text:'Flood',category:'personal',clientKey:'flood'}),error=>error.status===429);
  }finally{f.close();}
});
test('Concurrent exam reassignment fails safely rather than leaving two active group assignments',async()=>{
  const f=fixture();try{await f.boot();const {service:s,by,db,sqlite}=f;
    const atomic=db.atomic.bind(db);let changed=false;
    db.atomic=async commands=>{
      if(!changed && commands.some(command=>command.sql.includes('INSERT INTO chat_mutations'))){changed=true;sqlite.exec('INSERT INTO class_group_exams(group_id,exam_id) VALUES(2,1)');}
      return atomic(commands);
    };
    await assert.rejects(s.assign(by('teacher'),{targetKind:'group',targetId:1,examId:1,action:'assign',clientKey:'concurrent'}),error=>error.status===409);
    assert.equal(sqlite.prepare('SELECT group_id FROM class_group_exams WHERE exam_id=1').get().group_id,2);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM chat_messages').get().n,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM chat_assignments').get().n,0);
  }finally{f.close();}
});
test('Messaging wrapper fails closed outside TEST and passes unrelated routes untouched',async()=>{
  const f=fixture();try{await f.boot();let passed=0;
    const worker=messagesTestWorker({baseWorker:{async fetch(){passed++;return new Response('existing feature');}},authenticate:async()=>f.by('student'),studyDatabase:()=>f.db,directory:async()=>f.users});
    const env={MESSAGES_ENABLED:'true',STAGE_ENABLED:'true',STAGE_WRITES:'true',STAGE_ALLOWED_HOST:'learn-english-turso-integrated-test.east-tarsal.workers.dev'};
    assert.equal((await worker.fetch(new Request('https://learn-english.east-tarsal.workers.dev/api/messages'),env)).status,403);
    const base='https://'+env.STAGE_ALLOWED_HOST;
    assert.equal((await worker.fetch(new Request(base+'/api/messages'),env)).status,200);
    assert.equal((await worker.fetch(new Request(base+'/api/messages/open',{method:'POST',headers:{Origin:'https://evil.invalid'},body:'{}'}),env)).status,403);
    assert.equal(await (await worker.fetch(new Request(base+'/api/lessons'),env)).text(),'existing feature');assert.equal(passed,1);
  }finally{f.close();}
});
test('Production messaging stays isolated, authenticated and additive to existing routes',async()=>{
  const f=fixture();try{await f.boot();let actor=f.by('teacher'),passed=0;
    const app=messagesWorker({mode:'production',baseWorker:{async fetch(){passed++;return new Response('existing feature');}},authenticate:async()=>actor,studyDatabase:()=>f.db,directory:async()=>f.users});
    const worker=productionWorker(app),host='learn-english.east-tarsal.workers.dev',base='https://'+host;
    const env={MESSAGES_ENABLED:'true',CONTENT_ENABLED:'true',CONTENT_WRITES:'true',CONTENT_ALLOWED_HOST:host,CONTENT_MEDIA_BUCKET:'learn-english-production-media',CONTENT_SESSION_SECRET:'fixture',DB:{},MEDIA:{},ASSETS:{fetch:async()=>new Response('asset')},CONTENT_MEDIA:{get(){},head(){},put(){}},TURSO_URL:'libsql://english-quiz-production-fixture.turso.io',TURSO_AUTH_TOKEN:'fixture'};
    const call=(path,options={},settings=env)=>worker.fetch(new Request(base+path,options),settings,{});
    assert.equal((await call('/api/messages')).status,200);
    assert.equal((await call('/messages.js')).status,200);
    actor=null;assert.equal((await call('/api/messages')).status,401);actor=f.by('teacher');
    assert.equal((await call('/api/messages/open',{method:'POST',headers:{Origin:'https://evil.invalid'},body:'{}'})).status,403);
    assert.equal((await call('/api/messages/open',{method:'POST',headers:{Origin:base},body:'{}'},{...env,CONTENT_WRITES:'false'})).status,403);
    assert.equal((await worker.fetch(new Request('https://learn-english-turso-integrated-test.east-tarsal.workers.dev/api/messages'),env,{})).status,403);
    assert.equal((await call('/api/messages',{}, {...env,TURSO_URL:'libsql://english-quiz-test-fixture.turso.io'})).status,503);
    assert.equal(await (await call('/api/lessons')).text(),'existing feature');
    assert.equal(await (await call('/api/groups/manage',{method:'POST',headers:{Origin:base},body:'{"action":"rename"}'})).text(),'existing feature');
    assert.equal(await (await call('/api/groups/members',{method:'POST',body:'{}'},{...env,MESSAGES_ENABLED:'false'})).text(),'existing feature');
    assert.equal(passed,3);
    const opened=await (await call('/api/messages/open',{method:'POST',headers:{Origin:base},body:JSON.stringify({kind:'direct',accountId:'student'})})).json();
    assert.ok(opened.roomId);
    assert.equal((await call('/api/messages/send',{method:'POST',headers:{Origin:base},body:JSON.stringify({roomId:opened.roomId,category:'personal',text:'Production fixture',clientKey:'production-fixture'})})).status,200);
    const summary=await (await call('/api/messages')).json();assert.equal(summary.rooms.length,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM exams').get().n,2);
  }finally{f.close();}
});
