import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {MessageService} from '../src/learning-messages.mjs';
import {messagesTestWorker} from '../src/learning-messages-test-worker.mjs';
import {messagesWorker} from '../src/learning-messages-worker.mjs';
import {productionWorker} from '../src/learning-production-worker.mjs';
import {StudyError} from '../src/learning-study.mjs';
import {ExamService} from '../src/learning-exams.mjs';
import {AssessmentService} from '../src/learning-assessment.mjs';
import {ExamWorkflowService} from '../src/exam-workflow.mjs';
import {examGrading,examTaskMax,validateExamScoring} from '../src/exam-scoring.mjs';
import {mediaKey} from '../src/learning-media.mjs';
import {applyLearningSchema} from './learning-test-schema.mjs';
function fixture() {
  const sqlite=new DatabaseSync(':memory:');applyLearningSchema(sqlite);
  const args=command=>command.args.map(arg=>arg.type==='null'?null:arg.type==='integer'?Number(arg.value):arg.value);
  const db={async read(sql,values=[]){return sqlite.prepare(sql).all(...values);},async atomic(commands){
    sqlite.exec('BEGIN IMMEDIATE');
    try {const result=commands.map(command=>{const query=sqlite.prepare(command.sql),values=args(command);if(query.columns().length){const rows=query.all(...values);return {rows:rows.map(row=>Object.values(row).map(value=>({value:String(value)})))};}query.run(...values);return {rows:[]};});sqlite.exec('COMMIT');return result;}
    catch(error){sqlite.exec('ROLLBACK');throw new StudyError(/constraint/i.test(error.message)?409:503,error.message);}
  }};
  const users=[{id:'teacher',name:'Teacher',role:'ADMIN'},{id:'developer',name:'Private role',role:'DEVELOPER'},{id:'student',name:'Alice',email:'alice@example.invalid',role:'USER'},{id:'mate',name:'Bob',role:'USER'},{id:'other',name:'Other group',role:'USER'}];
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
    const first=(await s.history(by('student'),roomId)).messages[0];
    assert.ok(Number.isSafeInteger(first.createdMs));assert.ok(Math.abs(first.createdMs-Date.now())<5000);
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
    const instance=(await s.examLink(by('student'),1)).examId;
    assert.notEqual(instance,1);
    assert.notEqual((await s.examLink(by('mate'),1)).examId,instance);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM exam_instances').get().n,2);
    const room=(await s.summary(by('student'))).rooms.find(row=>row.kind==='direct');
    const notice=(await s.history(by('student'),room.id,{category:'learning'})).messages[0];
    assert.equal(notice.examId,1);assert.equal(notice.assignmentActive,true);
    await s.assign(by('teacher'),{...request,action:'unassign',clientKey:'cancel'});
    assert.equal((await s.history(by('student'),room.id,{category:'learning'})).messages[0].assignmentActive,false);
    await assert.rejects(s.examLink(by('student'),1),error=>error.status===404);
    await s.assign(by('teacher'),{targetKind:'student',targetId:'student',examId:1,action:'assign',clientKey:'personal-assignment'});
    assert.notEqual((await s.examLink(by('student'),1)).examId,instance);
    await assert.rejects(s.assign(by('teacher'),{targetKind:'student',targetId:'student',examId:2,action:'assign',clientKey:'draft'}),error=>error.status===409);
    await assert.rejects(s.examLink(by('student'),2),error=>error.status===404);
    const history=await s.history(by('student'),room.id,{category:'learning'});assert.equal(history.messages.some(row=>row.text.includes('Draft exam')),false);
    const before=sqlite.prepare('SELECT COUNT(*) n FROM chat_messages').get().n;
    sqlite.exec("CREATE TRIGGER reject_notice BEFORE INSERT ON chat_messages WHEN NEW.client_key LIKE 'rollback%' BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
    await assert.rejects(s.assign(by('teacher'),{targetKind:'group',targetId:2,examId:1,action:'assign',clientKey:'rollback'}));
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_group_exams WHERE group_id=2').get().n,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM chat_messages').get().n,before);
  }finally{f.close();}
});
test('Assignments reveal hidden exams and published subblocks only to their recipients',async()=>{
  const f=fixture();try{
    await f.boot();const {sqlite,db,service,by}=f;
    sqlite.exec("UPDATE exams SET hidden_from_students=1 WHERE id=1;INSERT INTO exam_blocks(id,exam_id,position,title,published,hidden_from_students) VALUES(10,1,0,'Hidden task',1,1),(20,1,1,'Draft task',0,1)");
    sqlite.prepare("INSERT INTO exam_materials(id,exam_id,block_id,position,type,content_json) VALUES(11,1,10,0,'task',?)").run(JSON.stringify({maxPoints:1.1,text:'Answer',scoringVersion:2}));
    await service.assign(by('developer'),{targetKind:'group',targetId:1,examId:1,action:'assign',clientKey:'hidden-assigned'});
    const exams=new ExamService(db),copy=(await exams.list(by('student')))[0];
    assert.ok(copy);assert.equal(copy.hidden,false);assert.equal(copy.blocks.length,1);assert.equal(copy.blocks[0].hidden,false);
    assert.equal((await exams.list(by('mate'))).some(e=>e.instanceStatus),true);
    assert.equal((await exams.list(by('other'))).some(e=>e.id===1||e.instanceStatus),false);
    assert.equal(sqlite.prepare('SELECT hidden_from_students FROM exams WHERE id=1').get().hidden_from_students,1);
    sqlite.prepare('UPDATE exams SET hidden_from_students=1 WHERE id=?').run(copy.id);
    sqlite.prepare('UPDATE exam_blocks SET hidden_from_students=1 WHERE id=?').run(copy.blocks[0].id);
    sqlite.exec("INSERT INTO account_refs(id) VALUES('student')");
    for(const key of ['exam:'+copy.id,'exam-block:'+copy.blocks[0].id])sqlite.prepare("INSERT INTO account_settings(account_id,key,value_json) VALUES('student',?, 'true')").run('visibility:'+key);
    assert.equal((await exams.list(by('student')))[0].blocks.length,1);
    const media='stage-local/copies/copy-'+crypto.randomUUID()+'/'+crypto.randomUUID()+'/'+ 'a'.repeat(64);
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(media)))].map(b=>b.toString(16).padStart(2,'0')).join(''),fileId='sf_'+digest;
    sqlite.prepare("INSERT INTO exam_materials(id,exam_id,block_id,position,type,content_json) VALUES(100,?,?,1,'audio',?)").run(copy.id,copy.blocks[0].id,JSON.stringify({fileId,localMediaKey:media}));
    assert.equal(await mediaKey(db,by('student'),'lesson',fileId),media);
    await assert.rejects(mediaKey(db,by('other'),'lesson',fileId),e=>e.status===404);
    const assessment=new AssessmentService(db),block=copy.blocks[0];
    await new ExamWorkflowService(db).write(by('student'),{examId:copy.id,action:'started'});
    await assessment.write(by('student'),{kind:'exam-block',id:block.id,action:'submit',answers:{[block.materials[0].id]:{0:'Answer'}}});
    assert.equal((await exams.listWork(by('student'))).length,1);
    assert.equal((await service.history(by('developer'),'direct:developer:student',{category:'learning'})).messages.some(m=>m.text.startsWith('Ready for review')),true);
    // Older assignments without copies also override hiding, without revealing the template publicly.
    sqlite.exec("INSERT INTO chat_assignments(id,exam_id,target_kind,target_id) VALUES('legacy-hidden',1,'student','other')");
    assert.equal((await exams.list(by('other'))).find(e=>e.id===1).blocks.length,1);
    assert.equal((await assessment.get(by('other'),{kind:'exam-block',id:10})).saved,false);
  }finally{f.close();}
});
test('Each student gets frozen definitions, separate grades and published colored feedback',async()=>{
  const f=fixture();try{
    await f.boot();const {sqlite,service,by,db}=f;
    sqlite.exec("INSERT INTO exam_blocks(id,exam_id,position,title,published) VALUES(10,1,0,'Block',1)");
    const parts=[{id:11,type:'task',title:'Listening',assignmentId:'task-1',scoringVersion:2,text:'Listen'},
      {id:12,type:'task',title:'Answer',assignmentKey:'task-1',scoringVersion:2,maxPoints:'1,1',text:'Explain'},
      {id:13,type:'quiz',title:'Quiz',assignmentKey:'task-1',scoringVersion:2,maxPoints:2.5,items:[{prompt:'Choose',options:['A','B'],answer:0}]}];
    for(const [position,part] of parts.entries())sqlite.prepare('INSERT INTO exam_materials(id,exam_id,block_id,position,type,content_json) VALUES(?,1,10,?,?,?)').run(part.id,position,part.type,JSON.stringify(part));
    validateExamScoring(parts);assert.equal(examTaskMax(parts,parts[0]),3.6);assert.equal(examGrading(parts).length,2);
    assert.throws(()=>validateExamScoring([{type:'task',scoringVersion:2,title:'Empty'}]),/Maximum/);
    await service.assign(by('teacher'),{targetKind:'group',targetId:1,examId:1,action:'assign',clientKey:'frozen'});
    const exams=new ExamService(db),a=(await exams.list(by('student')))[0],b=(await exams.list(by('mate')))[0];assert.notEqual(a.id,b.id);assert.notEqual(a.blocks[0].id,b.blocks[0].id);
    sqlite.prepare('UPDATE exam_materials SET content_json=? WHERE id=12').run(JSON.stringify({...parts[1],text:'Changed',maxPoints:99}));
    const fresh=(await exams.list(by('student')))[0];assert.equal(fresh.blocks[0].materials[1].text,'Explain');assert.equal(fresh.blocks[0].materials[1].maxPoints,'1,1');
    const assessment=new AssessmentService(db),block=a.blocks[0],answer=block.materials[1],quiz=block.materials[2];
    await assert.rejects(assessment.get(by('mate'),{kind:'exam-block',id:block.id}),error=>error.status===404);
    const answerText={[answer.id]:{0:{runs:[{text:'My answer',marks:{color:'#ff0000'}}]}}};
    await new ExamWorkflowService(db).write(by('student'),{examId:a.id,action:'started'});
    const submitted=await assessment.write(by('student'),{kind:'exam-block',id:block.id,action:'submit',answers:{[answer.id]:{0:'My answer'},[quiz.id]:{0:1}},answerText});
    assert.equal(submitted.state,'submitted');assert.deepEqual(submitted.materials,[]);
    assert.deepEqual((await assessment.get(by('teacher'),{kind:'exam-block',id:block.id,studentId:'student'})).answerText,answerText);
    const ready=(await exams.list(by('teacher'))).find(e=>e.id===a.id);assert.equal(ready.instanceStatus,'ready');assert.equal(ready.studentEmail,by('student').email);assert.equal(ready.groupTitle,'A1 Group');
    await assert.rejects(assessment.write(by('student'),{kind:'exam-block',id:block.id,action:'draft',answers:{}}),error=>error.status===403);
    const reviewed=await assessment.write(by('teacher'),{kind:'exam-block',id:block.id,studentId:'student',action:'review',points:{[answer.id]:{0:'0,6'},[quiz.id]:{0:1.5}}});
    assert.equal(reviewed.points[answer.id][0],0.6);await assert.rejects(assessment.get(by('student'),{kind:'exam-block',id:block.id}),error=>error.status===403);
    const published=await assessment.write(by('teacher'),{kind:'exam-block',id:block.id,studentId:'student',action:'publish',points:reviewed.points,corrections:{[answer.id]:{0:'Check grammar'}},commentFormatting:{[answer.id]:{0:{runs:[{text:'Check grammar',marks:{color:'#ff0000'}}]}}}});
    const result=await assessment.get(by('student'),{kind:'exam-block',id:block.id});assert.equal(result.state,'published');assert.deepEqual(result.commentFormatting,published.commentFormatting);assert.equal(result.materials[2].items[0].answer,undefined);
    assert.equal((await assessment.get(by('mate'),{kind:'exam-block',id:b.blocks[0].id})).saved,false);
    assert.equal(sqlite.prepare('SELECT status,group_title FROM exam_instances WHERE exam_id=?').get(a.id).status,'completed');
    const history=await service.history(by('teacher'),'direct:student:teacher',{category:'learning'});
    assert.equal(history.messages.filter(m=>m.text.startsWith('Ready for review')).length,1);
    assert.equal(history.messages.filter(m=>m.text.startsWith('Exam reviewed')).length,1);
    assert.equal(history.messages.at(-1).examId,a.id);
    assert.equal(history.messages.at(-1).assignmentActive,true);
    assert.match(history.messages.at(-1).text,/Score: 2.1 \/ 3.6/);
    assert.deepEqual(await service.examLink(by('teacher'),a.id),{examId:a.id,studentId:'student'});
    await assert.rejects(service.examLink(by('mate'),a.id),e=>e.status===404);
    await assert.rejects(assessment.write(by('teacher'),{kind:'exam-block',id:block.id,studentId:'student',action:'reopen',reason:'Retry'}),e=>e.status===409);
    await service.assignStudent(by('teacher'),'student',2);
    const transferred=(await exams.list(by('student'))).find(e=>e.id===a.id);
    assert.equal(transferred.groupTitle,'B1 Group');
    assert.equal(transferred.instanceStatus,'completed','Transfer preserves completed work');
    await service.assign(by('teacher'),{targetKind:'student',targetId:'student',examId:1,action:'assign',clientKey:'new-independent-attempt'});
    const attempts=(await exams.list(by('student'))).filter(e=>e.instanceStatus);
    assert.equal(attempts.length,2);assert.equal(attempts.filter(e=>e.instanceStatus==='completed').length,1);
    const next=attempts.find(e=>e.id!==a.id);assert.equal(next.groupTitle,'B1 Group');assert.notEqual(next.blocks[0].id,block.id);
    assert.equal((await assessment.get(by('student'),{kind:'exam-block',id:next.blocks[0].id})).saved,false);
    assert.equal((await assessment.get(by('student'),{kind:'exam-block',id:block.id})).state,'published');
    const histories=sqlite.prepare('SELECT COUNT(*) n FROM assessment_history').get().n;
    assert.equal((await exams.remove(by('teacher'),a.id)).referenceOnly,true);
    assert.equal((await exams.list(by('teacher'))).some(e=>e.id===a.id),false);
    assert.equal((await exams.list(by('developer'))).some(e=>e.id===a.id),true);
    assert.equal((await exams.list(by('student'))).some(e=>e.id===a.id),true);
    assert.equal((await assessment.get(by('student'),{kind:'exam-block',id:block.id})).state,'published');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM assessment_history').get().n,histories);
  }finally{f.close();}
});
test('All required blocks must be submitted and published; a completed group assignment can be assigned anew',async()=>{
  const f=fixture();try{
    await f.boot();const {sqlite,db,service,by}=f;
    sqlite.exec("DELETE FROM class_group_students WHERE account_id='mate'");
    for(const id of [10,20]){
      sqlite.prepare("INSERT INTO exam_blocks(id,exam_id,position,title,published) VALUES(?,1,?,'Task',1)").run(id,id);
      sqlite.prepare("INSERT INTO exam_materials(id,exam_id,block_id,position,type,content_json) VALUES(?,1,?,0,'task',?)").run(id+1,id,JSON.stringify({text:'Answer',maxPoints:1.1,scoringVersion:2}));
    }
    await service.assign(by('teacher'),{targetKind:'group',targetId:1,examId:1,action:'assign',clientKey:'first-group-attempt'});
    const exams=new ExamService(db),copy=(await exams.list(by('student'))).find(e=>e.instanceStatus),assessment=new AssessmentService(db);
    const submit=block=>assessment.write(by('student'),{kind:'exam-block',id:block.id,action:'submit',answers:{[block.materials[0].id]:{0:'Answer'}}});
    const publish=block=>assessment.write(by('teacher'),{kind:'exam-block',id:block.id,studentId:'student',action:'publish',points:{[block.materials[0].id]:{0:0.6}}});
    await new ExamWorkflowService(db).write(by('student'),{examId:copy.id,action:'started'});
    await submit(copy.blocks[0]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM chat_messages WHERE body LIKE 'Ready for review%'").get().n,0);
    await submit(copy.blocks[1]);await assert.rejects(submit(copy.blocks[1]),error=>error.status===403);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM chat_messages WHERE body LIKE 'Ready for review%'").get().n,1);
    await publish(copy.blocks[0]);
    assert.equal(sqlite.prepare('SELECT status FROM exam_instances WHERE exam_id=?').get(copy.id).status,'ready');
    await publish(copy.blocks[1]);
    assert.equal(sqlite.prepare('SELECT status FROM exam_instances WHERE exam_id=?').get(copy.id).status,'completed');
    assert.equal((await service.assignments(by('teacher'))).assignments.length,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_group_exams').get().n,1);
    assert.match((await service.history(by('student'),'direct:student:teacher',{category:'learning'})).messages.at(-1).text,/Score: 1.2 \/ 2.2/);
    await service.assign(by('teacher'),{targetKind:'group',targetId:1,examId:1,action:'assign',clientKey:'second-group-attempt'});
    const next=(await exams.list(by('student'))).find(e=>e.instanceStatus==='active');assert.ok(next);assert.notEqual(next.id,copy.id);
    await service.assign(by('teacher'),{targetKind:'group',targetId:1,examId:1,action:'unassign',clientKey:'cancel-second'});
    assert.equal((await exams.list(by('student'))).some(e=>e.id===copy.id&&e.instanceStatus==='completed'),true);
    assert.equal((await assessment.get(by('student'),{kind:'exam-block',id:copy.blocks[0].id})).state,'published');
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
    const env={MESSAGES_ENABLED:'true',STAGE_ENABLED:'true',STAGE_WRITES:'true',STAGE_ALLOWED_HOST:'learn-english-learning-integrated-test.east-tarsal.workers.dev'};
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
    const env={MESSAGES_ENABLED:'true',CONTENT_ENABLED:'true',CONTENT_WRITES:'true',CONTENT_ALLOWED_HOST:host,CONTENT_MEDIA_BUCKET:'learn-english-production-media',CONTENT_SESSION_SECRET:'fixture',DB:{},STUDY_DB:{prepare(){},batch(){}},MEDIA:{},ASSETS:{fetch:async()=>new Response('asset')},CONTENT_MEDIA:{get(){},head(){},put(){}}};
    const call=(path,options={},settings=env)=>worker.fetch(new Request(base+path,options),settings,{});
    assert.equal((await call('/api/messages')).status,200);
    assert.equal((await call('/messages.js')).status,200);
    actor=null;assert.equal((await call('/api/messages')).status,401);actor=f.by('teacher');
    assert.equal((await call('/api/messages/open',{method:'POST',headers:{Origin:'https://evil.invalid'},body:'{}'})).status,403);
    assert.equal((await call('/api/messages/open',{method:'POST',headers:{Origin:base},body:'{}'},{...env,CONTENT_WRITES:'false'})).status,403);
    assert.equal((await worker.fetch(new Request('https://learn-english-learning-integrated-test.east-tarsal.workers.dev/api/messages'),env,{})).status,403);
    assert.equal((await call('/api/messages',{}, {...env,CONTENT_MEDIA:undefined})).status,503);
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
