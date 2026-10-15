import assert from 'node:assert/strict';
import {productionCredentials} from './import-turso-production.mjs';
import {cloudflareAccountSource} from './turso-real-auth.mjs';
import {TursoStudyClient,statement as s} from '../src/turso-study.mjs';
import {ExamService} from '../src/turso-exams.mjs';
import {MessageService} from '../src/turso-messages.mjs';
import {AssessmentService,gradingQuestions} from '../src/turso-assessment.mjs';
import {ExamWorkflowService} from '../src/exam-workflow.mjs';
import {ensureStudyProfile} from '../src/turso-profile.mjs';
import {examWorkflowDemo} from './exam-workflow-demo.mjs';
const origin='https://learn-english.east-tarsal.workers.dev';
const known={teacher:'962531a13c01c510e81971f4010c7290',student:'98c54efd7341e0932f1c117e2c654ef3'};
async function context(){const response=await fetch(origin+'/api/database-context',{cache:'no-store',signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);const value=await response.json();assert.equal(value.provider,'turso','The site must remain on Turso.');return value;}
try{
  const [mode,file,...extra]=process.argv.slice(2);assert.ok(['--plan','--apply','--exercise'].includes(mode)&&!extra.length);
  const selected=await context(),db=new TursoStudyClient({...productionCredentials(file),mode:'production'}),accounts=cloudflareAccountSource();
  const actor=async(id,login,role)=>{const row=await accounts.byId(id);assert.ok(row&&row.login===login&&row.role===role&&row.active===1&&!row.is_personal_data_revoked,'The specified live account must be active with the correct role.');return {id:row.id,login:row.login,name:row.name||row.login,role:row.role};};
  const teacher=await actor(known.teacher,'TsovakTeacher','ADMIN'),student=await actor(known.student,'Somestudent','USER');
  const groups=await db.read("SELECT id,title FROM class_groups WHERE title='A1 Exam Demo' AND deleted_at IS NULL");assert.ok(groups.length<=1,'Duplicate demo groups require review.');
  if(mode==='--plan'){console.log(JSON.stringify({provider:selected.provider,revision:selected.revision,teacher:teacher.login,student:student.login,group:'A1 Exam Demo',existingGroup:!!groups.length,blocks:6,quizTypes:16,changes:0}));process.exit(0);}
  assert.deepEqual(await context(),selected,'Database selection changed.');
  if(!groups.length)await db.atomic([s("INSERT INTO class_groups(title,lesson_date,position) SELECT 'A1 Exam Demo',date('now'),COALESCE(MAX(position)+1,0) FROM class_groups")]);
  const [group]=await db.read("SELECT id,revision FROM class_groups WHERE title='A1 Exam Demo' AND deleted_at IS NULL");
  await ensureStudyProfile(db,teacher);await ensureStudyProfile(db,student);
  // Only the explicitly selected test student is enrolled; teacher membership stays separate.
  await db.atomic([s('INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET group_id=excluded.group_id,assigned_by=excluded.assigned_by,updated_at=unixepoch()',[student.id,group.id,teacher.id])]);
  const exams=new ExamService(db),messages=new MessageService(db,async()=>[teacher,student]),assessment=new AssessmentService(db),workflow=new ExamWorkflowService(db);
  const create=async(title,key)=>{
    let [existing]=await db.read('SELECT id FROM exams WHERE title=? AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM exam_instances i WHERE i.exam_id=exams.id)',[title]);
    if(!existing){const definition=examWorkflowDemo();definition.title=title;existing=await exams.save(teacher,{exam:definition});}
    await db.atomic([s('INSERT INTO class_group_exams(group_id,exam_id) VALUES(?,?) ON CONFLICT(exam_id) DO UPDATE SET group_id=excluded.group_id',[group.id,existing.id])]);
    await messages.assign(teacher,{action:'assign',targetKind:'student',targetId:student.id,examId:existing.id,clientKey:key});
    const [instance]=await db.read('SELECT exam_id FROM exam_instances WHERE source_exam_id=? AND account_id=? ORDER BY assigned_at DESC LIMIT 1',[existing.id,student.id]);assert.ok(instance);return {source:existing.id,id:instance.exam_id};
  };
  const demo=await create('A1 Complete Exam Demo','full-demo-assignment-v1');
  if(mode==='--exercise'){
    await workflow.write(student,{examId:demo.id,action:'viewed'});await workflow.write(student,{examId:demo.id,action:'started'});
    const blocks=await db.read('SELECT id FROM exam_blocks WHERE exam_id=? AND deleted_at IS NULL ORDER BY position',[demo.id]);
    for(const block of blocks){
      const params={kind:'exam-block',id:block.id},current=await assessment.get(student,params);if(current.saved)continue;
      const definition=await assessment.get(teacher,{...params,studentId:student.id}),answers={};
      for(const q of gradingQuestions(definition.materials)){
        if(q.part.quizType==='Memory')continue;
        let value=q.part.type==='text'?(q.part.checkMode==='exact'?String(q.part.allowedAnswers).split('\n')[0]:q.part.answerPurpose==='example'?"I'm tired because I worked late.":'I study English every morning. I work in the afternoon. I read at night.'):q.part.type==='task'?'Alice was walking by the river. She saw a rabbit and followed it.':q.part.quizType==='Match'?JSON.stringify(Object.fromEntries(q.part.items.map((item,i)=>[i,item.right]))):q.part.quizType==='Select all'?q.item.answers:q.item.answer??q.item.write??q.item.back??q.item.translation??q.item.word;
        if(value!=null)(answers[q.part.id]||={})[q.index]=value;
      }
      await assessment.write(student,{...params,action:'submit',expectedRevision:current.revision,answers});
    }
    for(const block of blocks){
      const params={kind:'exam-block',id:block.id,studentId:student.id},current=await assessment.get(teacher,params);if(current.state==='published')continue;
      const points={},corrections={};for(const q of gradingQuestions(current.materials)){(points[q.part.id]||={})[q.index]=current.suggestedPoints?.[q.part.id]?.[q.index]??q.max;(corrections[q.part.id]||={})[q.index]='Demonstration review: '+(q.part.answerPurpose==='example'?'A different relevant answer is accepted.':'Checked against the task criteria.');}
      await assessment.write(teacher,{...params,action:'publish',expectedRevision:current.revision,points,corrections});
    }
    await workflow.write(student,{examId:demo.id,action:'results_viewed'});await workflow.write(student,{examId:demo.id,action:'completed'});
  }
  const fresh=await create('A1 Complete Exam Demo - Your turn','full-demo-practice-assignment-v1');
  assert.deepEqual(await context(),selected,'Database selection changed.');
  console.log(JSON.stringify({provider:'turso',groupId:group.id,group:'A1 Exam Demo',teacher:teacher.login,student:student.login,demo,fresh,state:(await workflow.status(student,{examId:demo.id})).state,lessonsChanged:false,passwordsChanged:false}));
}catch(error){console.error(error instanceof assert.AssertionError?error.message:error.status?error.message:'Demo operation failed. No credentials were printed. Rerun the plan to inspect existing demo resources.');process.exitCode=1;}
