import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyTursoSchema} from './turso-test-schema.mjs';
import {examWorkflowDemo} from './exam-workflow-demo.mjs';
import {ExamService,studentExamContent} from '../src/turso-exams.mjs';
import {AssessmentService,gradingQuestions} from '../src/turso-assessment.mjs';
import {MessageService} from '../src/turso-messages.mjs';
import {ExamWorkflowService} from '../src/exam-workflow.mjs';
import {examSuggestion} from '../src/exam-checking.mjs';
import {examTaskMax} from '../src/exam-scoring.mjs';
import {examRecommendation} from '../src/exam-recommendations.mjs';
const teacher={id:'teacher',login:'TsovakTeacher',name:'Teacher',role:'ADMIN'},student={id:'student',login:'Somestudent',name:'Student',role:'USER'};
function fixture(){
  const sqlite=new DatabaseSync(':memory:');applyTursoSchema(sqlite);
  const args=command=>command.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={async read(sql,args=[]){return sqlite.prepare(sql).all(...args);},async readMany(commands){return commands.map(command=>sqlite.prepare(command.sql).all(...args(command)));},async atomic(commands){sqlite.exec('BEGIN IMMEDIATE');try{const result=commands.map(command=>{const query=sqlite.prepare(command.sql),rows=query.all(...args(command));return {cols:query.columns().map(c=>({name:c.name})),rows:rows.map(row=>Object.values(row).map(value=>({type:value==null?'null':typeof value==='number'?'integer':'text',value:String(value)})))};});sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  return {sqlite,db};
}
test('Answer references are withheld before Submit, revealed afterwards, and lesson projections are unchanged',()=>{
  const part={type:'text',answerEnabled:true,html:'secret reference',allowedAnswers:'secret alternative',response:'old learner answer'};
  assert.ok(!JSON.stringify(studentExamContent(part,'text')).includes('secret'));
  assert.equal(studentExamContent(part,'text',{revealAnswer:true}).modelAnswer,'secret reference');
  assert.equal(studentExamContent(part,'text',{protectAnswer:false}).html,part.html);
});
test('exact and objective suggestions handle normalization, zero, empty and partial matching without publishing grades',()=>{
  const part={type:'text',answerEnabled:true,checkMode:'exact',allowedAnswers:'children',ignorePunctuation:true};
  assert.equal(examSuggestion({part,item:part,index:0,max:3},' CHILDREN! '),3);
  assert.equal(examSuggestion({part,item:part,index:0,max:3},'child'),0);
  assert.equal(examSuggestion({part:{...part,answerPurpose:'example'},item:part,index:0,max:3},'other'),null);
  const choice={type:'quiz',quizType:'Choice'};
  assert.equal(examSuggestion({part:choice,item:{answer:0},max:2},0),2);
  assert.equal(examSuggestion({part:choice,item:{answer:0},max:2},''),0);
  const match={type:'quiz',quizType:'Match',items:[{left:'a',right:'one'},{left:'b',right:'two'}]};
  assert.equal(examSuggestion({part:match,item:match,max:4},'{"0":"one","1":"wrong"}'),2);
});
test('fresh per-request assessment clients keep submit, review and publish below the Worker subrequest budget',async()=>{
  const f=fixture();try{
    const source=await new ExamService(f.db).save(teacher,{exam:{title:'A1 Request budget',published:true,blocks:[{title:'Answers',published:true,materials:[{type:'quiz',quizType:'Choice',scoringVersion:3,items:[{prompt:'Choose',options:['Yes','No'],answer:0,maxPoints:1}]},{type:'text',answerEnabled:true,scoringVersion:3,maxPoints:2,html:'children',checkMode:'exact',allowedAnswers:'children'}]}]}});
    await new MessageService(f.db,async()=>[teacher,student]).assign(teacher,{action:'assign',targetKind:'student',targetId:student.id,examId:source.id,clientKey:'budget-assignment'});
    const [instance]=await f.db.read('SELECT exam_id FROM exam_instances WHERE source_exam_id=?',[source.id]);
    const [block]=await f.db.read('SELECT id FROM exam_blocks WHERE exam_id=?',[instance.exam_id]);
    const parts=await f.db.read('SELECT id,type FROM exam_materials WHERE block_id=? ORDER BY position',[block.id]);
    const answers={[parts[0].id]:{0:0},[parts[1].id]:{0:'children'}},points={[parts[0].id]:{0:1},[parts[1].id]:{0:2}};
    const counts={};let revision=0;
    for(const action of ['submit','review','publish']){
      let calls=0;const client={};
      for(const method of ['read','readMany','atomic'])client[method]=(...args)=>{assert.ok(++calls<=40,'Assessment exceeded its 40-subrequest SQL budget');return f.db[method](...args);};
      const row=await new AssessmentService(client).write(action==='submit'?student:teacher,{kind:'exam-block',id:block.id,action,expectedRevision:revision,answers,points,...(action==='submit'?{}:{studentId:student.id})});
      revision=row.revision;counts[action]=calls;assert.ok(calls<=40);
    }
    assert.equal(f.sqlite.prepare('SELECT state FROM assessment_work WHERE material_id=?').get(block.id).state,'published');
    console.log('Fresh-request SQL round trips:',JSON.stringify(counts));
  }finally{f.sqlite.close();}
});
test('Subgroup assignment rejects outsiders, is replay-safe and exposes active work to teachers',async()=>{
  const {db,sqlite}=fixture();try{
    const exams=new ExamService(db),messages=new MessageService(db,async()=>[teacher,student,{id:'outside',role:'USER'}]);
    await exams.ensure();await messages.ensure();
    sqlite.exec("INSERT INTO class_groups(id,title,lesson_date) VALUES(99,'A1 Assignment','2026-10-15'); INSERT INTO class_group_setup(key) VALUES('levels-v1'),('level-names-v2'); INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES('student',99,'teacher')");
    const source=await exams.save(teacher,{exam:{title:'A1 Assignment',groupId:99,published:true,blocks:[{title:'Quiz',published:true,materials:[{type:'quiz',quizType:'Choice',scoringVersion:3,items:[{prompt:'Choose',options:['Yes','No'],answer:0,maxPoints:1}]}]}]}});
    const body={examId:source.id,groupId:99,studentId:student.id,clientKey:'subgroup-assignment'};
    await assert.rejects(messages.assignInSubgroup(student,body),error=>error.status===403);
    await assert.rejects(messages.assignInSubgroup(teacher,{...body,studentId:'outside'}),error=>error.status===403);
    await assert.rejects(messages.assignInSubgroup(teacher,{...body,groupId:98}),error=>error.status===403);
    await messages.assignInSubgroup(teacher,body);await messages.assignInSubgroup(teacher,body);
    const instances=await db.read('SELECT exam_id FROM exam_instances WHERE source_exam_id=?',[source.id]);assert.equal(instances.length,1);
    const row=(await exams.list(teacher)).find(exam=>exam.id===instances[0].exam_id);assert.equal(row.instanceStatus,'active');assert.equal(row.groupId,99);
  }finally{sqlite.close();}
});
test('complete demo supports all 16 quiz types, frozen copies, private references, review and idempotent completion without changing lessons',async()=>{
  const f=fixture();try{
    const {db,sqlite}=f,exams=new ExamService(db),assessment=new AssessmentService(db),workflow=new ExamWorkflowService(db);
    const directory=async()=>[teacher,student];const messages=new MessageService(db,directory);
    await exams.ensure();await messages.ensure();
    sqlite.exec("INSERT INTO class_groups(id,title,lesson_date) VALUES(99,'A1 Exam Demo','2026-10-15'); INSERT INTO class_group_setup(key) VALUES('levels-v1'),('level-names-v2'); INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES('student',99,'teacher')");
    const before=sqlite.prepare('SELECT * FROM lesson_blocks').all();
    const saved=await exams.save(teacher,{exam:examWorkflowDemo(99)});assert.equal(saved.blocks.length,6);
    const quizzes=saved.blocks.flatMap(block=>block.materials).filter(part=>part.type==='quiz');assert.equal(new Set(quizzes.map(part=>part.quizType)).size,16);
    assert.ok(saved.blocks.flatMap(block=>block.materials).every(part=>/^#[a-f0-9]{6}$/i.test(part.blockColor)));
    const grouped=saved.blocks.find(block=>block.title.startsWith('05'));const task=grouped.materials.find(part=>part.assignmentId==='demo-task-group');assert.equal(examTaskMax(grouped.materials,task),5);
    await messages.assign(teacher,{action:'assign',targetKind:'student',targetId:student.id,examId:saved.id,clientKey:'demo-assignment-1'});
    const [instance]=await db.read('SELECT * FROM exam_instances WHERE source_exam_id=?',[saved.id]);assert.ok(instance);
    assert.equal((await workflow.status(student,{examId:instance.exam_id})).state,'assigned');
    await assert.rejects(workflow.write(student,{examId:instance.exam_id,action:'completed'}),error=>error.status===409);
    await workflow.write(student,{examId:instance.exam_id,action:'started'});
    const copy=(await exams.list(student)).find(exam=>exam.id===instance.exam_id);assert.ok(copy);
    for(const block of copy.blocks){
      const request={kind:'exam-block',id:block.id};const initial=await assessment.get(student,request);assert.equal(initial.saved,false);
      for(const part of initial.materials.filter(part=>part.answerEnabled))assert.equal(part.html,'');
      const sent=await assessment.write(student,{...request,action:'submit',expectedRevision:initial.revision,answers:{}});assert.equal(sent.state,'submitted');
      for(const part of sent.materials.filter(part=>part.answerEnabled))assert.ok(part.modelAnswer);
      const review=await assessment.get(teacher,{...request,studentId:student.id}),points={};
      const meaning=review.materials.find(part=>part.checkMode==='meaning');
      if(meaning){const recommendation=await examRecommendation(db,{},teacher,{id:block.id,studentId:student.id,partId:meaning.id,index:0,expectedRevision:review.revision});assert.equal(recommendation.status,'unavailable');assert.equal(recommendation.requiresTeacher,true);assert.equal(sqlite.prepare('SELECT count(*) n FROM bug_reports').get().n,1);}
      for(const question of gradingQuestions(block.materials))(points[question.part.id]||={})[question.index]=0;
      await assessment.write(teacher,{...request,studentId:student.id,action:'publish',expectedRevision:review.revision,points,corrections:{},overallComment:'Published feedback',privateNote:'Private teacher note'});
      const published=await assessment.get(student,request);assert.equal(published.overallComment,'Published feedback');assert.ok(!JSON.stringify(published).includes('Private teacher note'));
    }
    assert.equal((await workflow.status(student,{examId:instance.exam_id})).state,'results_published');
    await workflow.write(student,{examId:instance.exam_id,action:'results_viewed'});
    await workflow.write(student,{examId:instance.exam_id,action:'completed'});
    await workflow.write(student,{examId:instance.exam_id,action:'completed'});
    const status=await workflow.status(student,{examId:instance.exam_id});assert.equal(status.state,'completed');
    assert.equal(status.history.filter(event=>event.action==='completed').length,1);
    assert.equal(sqlite.prepare('SELECT group_id FROM class_group_exams WHERE exam_id=?').get(saved.id).group_id,99);
    assert.deepEqual(sqlite.prepare('SELECT * FROM lesson_blocks').all(),before);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM chat_messages WHERE client_key=?").get('exam-workflow:'+instance.exam_id+':completed').n,1);
    await assert.rejects(workflow.status({...student,id:'other'},{examId:instance.exam_id}),error=>error.status===404);
  }finally{f.sqlite.close();}
});
