import {StudyError,statement as s,recordId,lessonAccess} from './learning-study.mjs';
import {materialVisibility} from './learning-visibility.mjs';
import {studentExamContent,ExamService} from './learning-exams.mjs';
import {examGrading,examChildren,examAnswerQuestions,memoryScore} from './exam-scoring.mjs';
import {instanceAccess,mayReviewInstance} from './learning-exam-instances.mjs';
import {examLifecycleCommands} from './learning-exam-lifecycle.mjs';
import {assignedExamIds,assignedExamSql} from './learning-exam-access.mjs';
import {boundedMediaBytes} from './learning-r2-media.mjs';
import {chatFileMetadata} from './chat-attachments.mjs';
import {examSuggestion} from './exam-checking.mjs';
import {examWorkflowCommands,requireExamStarted} from './exam-workflow.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const reviewer=actor=>['ADMIN','DEVELOPER'].includes(actor?.role);
const ready=new WeakMap();
export function rubric(value){return String(value||'').split('\n').map(line=>{const [label,points]=line.split('|');return {label:label.trim(),max:Number(String(points).replace(',','.'))};}).filter(row=>row.label&&Number.isFinite(row.max)&&row.max>0&&row.max<=1e12).slice(0,20);}
export function assessmentQuestions(parts){return parts.filter(p=>['quiz','exercise','task'].includes(p.type)).flatMap(part=>(part.type==='task'?[part]:part.items||[]).map((item,index)=>({part,index,item,max:rubric(item.criteria).length?rubric(item.criteria).reduce((n,c)=>n+c.max,0):Number(item.maxPoints??part.maxPoints??1)})));}
const decimal=value=>Number(String(value).replace(',','.'));
export function gradingQuestions(parts){
  if(parts.some(part=>part.scoringVersion>=2))return examGrading(parts);
  const result=[],seen=new Set();
  for(const part of parts.filter(p=>['quiz','exercise','task'].includes(p.type))){
    if(part.gradeMode!=='assignment'){result.push(...assessmentQuestions([part]));continue;}
    const key=part.assignmentKey||part.assignmentId||('part-'+part.id);if(seen.has(key))continue;seen.add(key);
    const leader=parts.find(p=>p.assignmentId===key&&p.gradeMode==='assignment'&&['quiz','exercise','task'].includes(p.type))||part;
    const criteria=rubric(leader.criteria),max=criteria.length?criteria.reduce((n,c)=>n+c.max,0):decimal(leader.maxPoints??1);
    result.push({part:leader,index:0,item:leader,max});
  }
  return result;
}
function reviewDocument(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.runs)||value.runs.length>2000||Object.keys(value).some(key=>key!=='runs'))fail(400,'Invalid reviewed text.');
  const allowed=['bold','italic','underline','strike','color','size','family'];
  let length=0;
  for(const run of value.runs){
    if(!run||typeof run.text!=='string'||Object.keys(run).some(key=>!['text','marks'].includes(key)))fail(400,'Invalid reviewed text.');
    length+=run.text.length;const marks=run.marks||{};
    if(typeof marks!=='object'||Array.isArray(marks)||Object.keys(marks).some(key=>!allowed.includes(key)))fail(400,'Invalid text formatting.');
    for(const key of ['bold','italic','underline','strike'])if(marks[key]!=null&&typeof marks[key]!=='boolean')fail(400,'Invalid text formatting.');
    if(marks.color!=null&&!/^#[a-f0-9]{6}$/i.test(marks.color))fail(400,'Invalid text color.');
    if(marks.size!=null&&(!Number.isFinite(marks.size)||marks.size<10||marks.size>96))fail(400,'Invalid text size.');
    if(marks.family!=null&&!['serif','sans','mono','georgia','verdana','palatino','trebuchet','courier'].includes(marks.family))fail(400,'Invalid text font.');
  }
  if(length>50000)fail(413,'Reviewed text is too large.');
  return value;
}
export class AssessmentService{
  constructor(db){this.db=db;}
  ensure(){if(!ready.has(this.db))ready.set(this.db,this.db.atomic([
    s(`CREATE TABLE IF NOT EXISTS assessment_work(account_id TEXT NOT NULL,kind TEXT NOT NULL,material_id INTEGER NOT NULL,exam_id INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,state TEXT NOT NULL DEFAULT 'draft',answers_json TEXT NOT NULL DEFAULT '{}',grading_json TEXT NOT NULL DEFAULT '{}',snapshot_json TEXT NOT NULL DEFAULT '[]',updated_at INTEGER NOT NULL DEFAULT(unixepoch()),PRIMARY KEY(account_id,kind,material_id))`),
    s(`CREATE TABLE IF NOT EXISTS assessment_history(id INTEGER PRIMARY KEY,account_id TEXT NOT NULL,kind TEXT NOT NULL,material_id INTEGER NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',snapshot_json TEXT NOT NULL,created_at INTEGER NOT NULL DEFAULT(unixepoch()))`),
    s(`CREATE TABLE IF NOT EXISTS assessment_recordings(account_id TEXT NOT NULL,kind TEXT NOT NULL,material_id INTEGER NOT NULL,part_id INTEGER NOT NULL,question_index INTEGER NOT NULL,object_key TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(account_id,kind,material_id,part_id,question_index))`)
  ]).catch(error=>{ready.delete(this.db);throw error;}));return ready.get(this.db);}
  async document(actor,kind,id,account){
    recordId(id);let rows;
    if(kind==='exam-block'){
      await new ExamService(this.db).ensure();
      const assigned=await assignedExamIds(this.db,account);
      const [found]=await this.db.read(`SELECT b.exam_id,(SELECT status FROM exam_instances i WHERE i.exam_id=b.exam_id AND i.active=1) instance_status FROM exam_blocks b JOIN exams e ON e.id=b.exam_id WHERE b.id=? AND b.deleted_at IS NULL AND e.deleted_at IS NULL AND (?=1 OR (e.published=1 AND b.published=1 AND ${assignedExamSql('e.id',assigned)}))`,[id,+reviewer(actor)]);
      const hidden=await materialVisibility(this.db,account);
      if(!found||!reviewer(actor)&&!assigned.has(found.exam_id)&&(hidden.has('exam:'+found.exam_id)||hidden.has('exam-block:'+id)))fail(404,'Exam not found.');
      if(!reviewer(actor)&&found.instance_status==='ready')fail(403,'This exam is being reviewed. Wait for your teacher to publish the review.');
      await instanceAccess(this.db,found.exam_id,account);
      if(actor.role==='ADMIN'&&actor.id!==account){const [instance]=await this.db.read('SELECT reviewer_id,group_id FROM exam_instances WHERE exam_id=? AND active=1',[found.exam_id]);if(instance?.reviewer_id&&!await mayReviewInstance(this.db,instance,actor))fail(403,'Only the assigned teacher can review this exam.');}
      rows=await this.db.read('SELECT id,type,content_json FROM exam_materials WHERE block_id=? AND deleted_at IS NULL ORDER BY position,id',[id]);
      return {examId:found.exam_id,parts:rows.map(row=>({...JSON.parse(row.content_json),id:row.id,type:row.type}))};
    }
    if(kind!=='lesson')fail(400,'Invalid assessment.');
    const [found]=await this.db.read(`SELECT l.id FROM lessons l WHERE l.id=? AND ${lessonAccess}`,[id,+reviewer(actor),account,account]);
    if(!found)fail(404,'Lesson not found.');
    rows=await this.db.read('SELECT id,type,tab,content_json FROM lesson_blocks WHERE lesson_id=? AND deleted_at IS NULL ORDER BY position,id',[id]);
    const parts=rows.map(row=>({...JSON.parse(row.content_json),id:row.id,type:row.type,tab:row.tab}));
    if(!parts.some(part=>part.assessed))fail(400,'Assessment is not enabled for this lesson.');
    return {examId:0,parts:parts.filter(part=>part.assessed)};
  }
  account(actor,studentId){if(!actor?.id)fail(401,'Sign in first.');const account=studentId||actor.id;if(account!==actor.id&&!reviewer(actor))fail(403,'You cannot review another account.');if(!/^[A-Za-z0-9_-]{1,100}$/.test(account))fail(400,'Invalid student.');return account;}
  async row(account,kind,id){await this.ensure();return (await this.db.read('SELECT * FROM assessment_work WHERE account_id=? AND kind=? AND material_id=?',[account,kind,id]))[0];}
  async legacy(account,id){return (await this.db.read('SELECT * FROM exam_work WHERE account_id=? AND block_id=?',[account,id]))[0];}
  project(row,actor){
    const grading=JSON.parse(row.grading_json||'{}'),published=row.state==='published',show=reviewer(actor)||published;
    const answerData=JSON.parse(row.answers_json||'{}'),answerText=answerData._formatting||{};delete answerData._formatting;
    const notes=row.kind==='exam-block'?{overallComment:show?grading.overallComment||'':'',...(reviewer(actor)?{privateNote:grading.privateNote||''}:{})}:{};
    return {...notes,kind:row.kind,examId:row.exam_id,blockId:row.material_id,revision:row.revision,state:row.state,saved:row.state!=='draft',answers:answerData,answerText,commentFormatting:show?grading.commentFormatting||{}:{},corrections:show?grading.comments||{}:{},points:show?grading.points||{}:{},suggestedPoints:reviewer(actor)?grading.suggestedPoints||{}:{},errors:show?grading.errors||{}:{},criteriaPoints:show?grading.criteriaPoints||{}:{},reviewText:show?grading.reviewText||{}:{},materials:JSON.parse(row.snapshot_json||'[]').map(part=>reviewer(actor)?part:studentExamContent(part,part.type,{protectAnswer:row.kind==='exam-block',revealAnswer:row.kind==='exam-block'&&row.state!=='draft'}))};
  }
  async get(actor,{kind,id,studentId}){
    const account=this.account(actor,studentId),document=await this.document(actor,kind,id,account),row=await this.row(account,kind,id);
    if(kind==='exam-block'&&!reviewer(actor)&&row&&['submitted','reviewing'].includes(row.state))fail(403,'This exam is being reviewed. Wait for your teacher to publish the review.');
    return this.workView(actor,{kind,id,account},document,row);
  }
  async workView(actor,{kind,id,account},document,row){
    const recordings={};for(const recording of await this.db.read('SELECT part_id,question_index,mime,bytes FROM assessment_recordings WHERE account_id=? AND kind=? AND material_id=?',[account,kind,id]))(recordings[recording.part_id]||={})[recording.question_index]={mime:recording.mime,bytes:recording.bytes};
    if(row)return {...this.project(row,actor),recordings};
    const legacy=kind==='exam-block'?await this.legacy(account,id):null;
    return {...this.project({account_id:account,kind,material_id:id,exam_id:document.examId,revision:0,state:legacy?.saved?'submitted':'draft',answers_json:legacy?.answers_json||'{}',grading_json:JSON.stringify({points:JSON.parse(legacy?.points_json||'{}'),comments:JSON.parse(legacy?.corrections_json||'{}')}),snapshot_json:JSON.stringify(document.parts)},actor),recordings};
  }
  async recording(actor,query,request,store){
    const {kind,id,studentId,part,index,expectedRevision}=query,account=this.account(actor,studentId);
    const document=await this.document(actor,kind,id,account);await this.ensure();
    if(kind!=='exam-block'||!Number.isSafeInteger(part)||!Number.isInteger(index)||index<0)fail(400,'Invalid pronunciation recording.');
    const item=document.parts.find(p=>p.id===part);
    if(!item||item.quizType!=='Spell'||!item.items?.[index])fail(404,'Pronunciation question not found.');
    if(request.method!=='POST'){
      const [file]=await this.db.read('SELECT object_key FROM assessment_recordings WHERE account_id=? AND kind=? AND material_id=? AND part_id=? AND question_index=?',[account,kind,id,part,index]);
      if(!file)fail(404,'Recording not found.');return store.response(file.object_key,request.method,request.headers.get('range')||'');
    }
    if(account!==actor.id)fail(403,'Only the student can record their answer.');
    const previous=await this.get(actor,{kind,id});if(previous.saved)fail(409,'Submitted recordings cannot be changed.');
    if(expectedRevision!==previous.revision)fail(409,'Answers changed. Retry the recording.');
    const bytes=await boundedMediaBytes(request),metadata=await chatFileMetadata(bytes,request.headers.get('content-type')||'');
    if(!['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/mpeg'].includes(metadata.mime))fail(415,'A valid audio recording is required.');
    const namespace=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(account+':'+kind+':'+id)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const key='stage-local/recordings/'+namespace+'/'+crypto.randomUUID()+'/'+metadata.sha256;
    await store.putImmutable(key,bytes,{...metadata,bytes:bytes.length,name:'pronunciation'});
    await this.db.atomic([s('DROP TABLE IF EXISTS temp.recording_guard'),s('CREATE TEMP TABLE recording_guard(ok INTEGER NOT NULL CHECK(ok=1))'),s("INSERT INTO recording_guard SELECT ?=COALESCE((SELECT revision FROM assessment_work WHERE account_id=? AND kind=? AND material_id=?),0) AND NOT EXISTS(SELECT 1 FROM assessment_work WHERE account_id=? AND kind=? AND material_id=? AND state<>'draft')",[previous.revision,account,kind,id,account,kind,id]),s('INSERT INTO assessment_recordings(account_id,kind,material_id,part_id,question_index,object_key,mime,bytes) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id,kind,material_id,part_id,question_index) DO UPDATE SET object_key=excluded.object_key,mime=excluded.mime,bytes=excluded.bytes',[account,kind,id,part,index,key,metadata.mime,bytes.length])]);
    return {mime:metadata.mime,bytes:bytes.length};
  }
  async write(actor,body){
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid assessment.');
    const {kind,id,studentId,action='draft'}=body,account=this.account(actor,studentId),document=await this.document(actor,kind,id,account);
    if(kind==='exam-block'&&action==='reopen')fail(409,'Submitted exams cannot be reopened. Assign a new exam instead.');
    if(kind==='exam-block'&&body.examId!=null&&body.examId!==document.examId)fail(404,'Exam not found.');
    let previous,row;
    if(kind==='exam-block'){
      row=await this.row(account,kind,id);
      previous=await this.workView(actor,{kind,id,account},document,row);
    }else{previous=await this.get(actor,{kind,id,studentId});row=await this.row(account,kind,id);}
    const revision=row?.revision||0;
    if(kind==='exam-block'&&action==='submit'&&account===actor.id)await requireExamStarted(this.db,document.examId,account);
    if(body.expectedRevision!=null&&body.expectedRevision!==revision)fail(409,kind==='exam-block'?`This work changed (expected revision ${body.expectedRevision}, current ${revision}). Reopen the work before saving; your changes were not published.`:'This work changed. Reload before saving.');
    const teaching=account!==actor.id&&reviewer(actor),parts=row?JSON.parse(row.snapshot_json):document.parts;
    const questions=gradingQuestions(parts),answerQuestions=parts.some(part=>part.scoringVersion>=3)?examAnswerQuestions(parts):assessmentQuestions(parts.filter(part=>part.scoringVersion!==2||!examChildren(parts,part).length)),max=questions.reduce((sum,q)=>sum+q.max,0);
    if(questions.some(q=>!Number.isFinite(q.max)||q.max<0||q.max>1e12)||max>1e14)fail(400,'Invalid maximum points.');
    let state=previous.state,answers=previous.answers,answerText=previous.answerText||{},grading=row?JSON.parse(row.grading_json):{points:previous.points,comments:previous.corrections},snapshot=parts;
    if(['draft','submit'].includes(action)){
      if(teaching)fail(403,'Only the student can submit answers.');
      if(previous.saved){if(action==='submit'&&JSON.stringify(body.answers||{})===JSON.stringify(answers))return previous;fail(409,'This material has already been submitted.');}
      const previousAnswers=answers;answers=body.answers||{};
      if(!answers||typeof answers!=='object'||Array.isArray(answers)||JSON.stringify(answers).length>50000)fail(400,'Invalid answers.');
      const keys=new Set(answerQuestions.map(q=>q.part.id+':'+q.index));
      for(const [part,items] of Object.entries(answers)){
        if(!items||typeof items!=='object'||Array.isArray(items))fail(400,'Invalid answer.');
        for(const [index,value] of Object.entries(items))if(!keys.has(part+':'+index)||!(typeof value==='string'||typeof value==='number'||Array.isArray(value)&&value.every(Number.isSafeInteger)))fail(400,'Invalid answer.');
      }
      const suggestedPoints={};
      if(kind==='exam-block')for(const q of questions){const score=examSuggestion(q,answers[q.part.id]?.[q.index]);if(score!=null)(suggestedPoints[q.part.id]||={})[q.index]=score;}
      for(const part of parts.filter(part=>part.scoringVersion>=3&&part.quizType==='Memory')){
        const value=answers[part.id]?.[0]??(previousAnswers[part.id]?.[0]?undefined:{turns:[]});
        let result;try{result=memoryScore(part,value,previousAnswers[part.id]?.[0]);}catch(error){fail(400,error.message);}
        suggestedPoints[part.id]={0:result.points};
      }
      const canAutoPublish=kind==='exam-block'&&action==='submit'&&(document.autoPublish||body.autoPublish||parts.some(p=>p.autoPublish))&&questions.length>0&&questions.every(q=>suggestedPoints[q.part.id]?.[q.index]!=null&&q.part.type!=='task'&&q.item.checkMode!=='teacher'&&q.item.checkMode!=='meaning');
      if(canAutoPublish){
        state='published';
        const points=JSON.parse(JSON.stringify(suggestedPoints));
        grading={suggestedPoints,points,comments:{},errors:{},criteriaPoints:{},reviewText:{}};
      }else{
        state=action==='submit'?'submitted':'draft';
        grading={suggestedPoints};
      }
      snapshot=parts;
      answerText=body.answerText||answerText;
      if(!answerText||typeof answerText!=='object'||Array.isArray(answerText)||JSON.stringify(answerText).length>50000)fail(400,'Invalid answer formatting.');
      for(const [part,items] of Object.entries(answerText)){if(!items||typeof items!=='object'||Array.isArray(items))fail(400,'Invalid answer formatting.');for(const [index,format] of Object.entries(items)){
        if(!keys.has(part+':'+index)||typeof answers[part]?.[index]!=='string')fail(400,'Only text answers can be formatted.');reviewDocument(format);
        if(format.runs.map(run=>run.text).join('')!==answers[part][index])fail(400,'Answer formatting does not match the text.');
      }}
    }else{
      if(!teaching)fail(403,'Only a teacher can review or reopen student work.');
      if(!['review','publish','reopen','amend'].includes(action))fail(400,'Invalid review action.');
      if(['reopen','amend'].includes(action)){
        if(action==='reopen'&&!previous.saved||action==='amend'&&previous.state!=='published')fail(409,'This action is not available for the current submission.');
        if(!(kind==='exam-block'&&action==='amend')&&(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500))fail(400,'Enter a reason.');
        if(kind==='exam-block'&&action==='amend'&&body.reason!=null&&(typeof body.reason!=='string'||body.reason.length>500))fail(400,'Invalid reason.');
        state=action==='reopen'?'draft':'reviewing';
        if(action==='reopen'){grading={};snapshot=document.parts;}
      }else{
        if(!previous.saved)fail(409,'Wait for the student to submit.');
        if(previous.state==='published')fail(409,'Reopen the review before changing published grades.');
        const overallComment=kind==='exam-block'?body.overallComment??grading.overallComment??'':'',privateNote=kind==='exam-block'?body.privateNote??grading.privateNote??'':'';
        if(typeof overallComment!=='string'||overallComment.length>6000||typeof privateNote!=='string'||privateNote.length>6000)fail(400,'Review notes are too long.');
        grading={suggestedPoints:grading.suggestedPoints||{},points:body.points||{},comments:body.corrections||{},errors:body.errors||{},criteriaPoints:body.criteriaPoints||{},reviewText:body.reviewText||{},commentFormatting:body.commentFormatting||{},...(kind==='exam-block'?{overallComment,privateNote}:{})};
        if(!grading.points||typeof grading.points!=='object'||Array.isArray(grading.points))fail(400,'Invalid review.');
        for(const q of questions)if(q.part.quizType==='Memory'&&q.part.scoringVersion>=3&&grading.suggestedPoints[q.part.id]?.[0]!=null&&grading.points[q.part.id]?.[0]==null)(grading.points[q.part.id]||={})[0]=grading.suggestedPoints[q.part.id][0];
        if(!grading.commentFormatting||typeof grading.commentFormatting!=='object'||Array.isArray(grading.commentFormatting))fail(400,'Invalid feedback formatting.');
        for(const [part,items] of Object.entries(grading.commentFormatting)){if(!items||typeof items!=='object'||Array.isArray(items))fail(400,'Invalid feedback formatting.');for(const [index,format] of Object.entries(items)){reviewDocument(format);if(format.runs.map(run=>run.text).join('')!==grading.comments[part]?.[index])fail(400,'Feedback formatting does not match the text.');}}
        if(JSON.stringify(grading).length>90000)fail(413,'Review is too large.');
        const keys=new Set(questions.map(q=>q.part.id+':'+q.index));
        for(const map of [grading.points,grading.comments,grading.errors,grading.criteriaPoints]){
          if(!map||typeof map!=='object'||Array.isArray(map))fail(400,'Invalid review.');
          for(const [part,items] of Object.entries(map)){
            if(!items||typeof items!=='object'||Array.isArray(items))fail(400,'Invalid review.');
            const validKeys=map===grading.comments||map===grading.errors?new Set(answerQuestions.map(q=>q.part.id+':'+q.index)):keys;
            for(const index of Object.keys(items))if(!validKeys.has(part+':'+index))fail(400,'Unknown review question.');
          }
        }
        if(!grading.reviewText||typeof grading.reviewText!=='object'||Array.isArray(grading.reviewText))fail(400,'Invalid reviewed text.');
        const answerKeys=new Set(answerQuestions.map(q=>q.part.id+':'+q.index));
        for(const [part,items] of Object.entries(grading.reviewText)){
          if(!items||typeof items!=='object'||Array.isArray(items))fail(400,'Invalid reviewed text.');
          for(const [index,value] of Object.entries(items)){
            const q=answerQuestions.find(q=>q.part.id+':'+q.index===part+':'+index);
            const text=q&&(['task','text','cards','vocab'].includes(q.part.type)||q.part.type==='exercise'&&q.item.kind==='write'||q.part.type==='quiz'&&!['Choice','Odd one out','Select all','True / false','Match','Memory'].includes(q.part.quizType||'Choice'));
            if(!answerKeys.has(part+':'+index)||!text)fail(400,'Only text answers can be edited.');
            reviewDocument(value);
          }
        }
        for(const q of answerQuestions){
          const comment=grading.comments[q.part.id]?.[q.index];if(comment!=null&&(typeof comment!=='string'||comment.length>3000))fail(400,'Invalid feedback.');
          const error=grading.errors[q.part.id]?.[q.index];if(error!=null&&!['','correct','needs-work'].includes(error))fail(400,'Invalid error mark.');
        }
        for(const q of questions){
          const value=grading.points[q.part.id]?.[q.index];
          if(value!=null&&value!==''&&(!Number.isFinite(decimal(value))||decimal(value)<0||decimal(value)>q.max))fail(400,'Points must be between zero and the maximum.');
          if(value!=null&&value!=='')grading.points[q.part.id][q.index]=decimal(value);
          if(action==='publish'&&(value==null||value===''))fail(400,'Grade every question before publishing.');
          const criteria=rubric(q.item.criteria),scores=grading.criteriaPoints[q.part.id]?.[q.index];
          if(criteria.length&&scores){
            if(typeof scores!=='object'||Array.isArray(scores)||Object.keys(scores).some(i=>!/^\d+$/.test(i)||Number(i)>=criteria.length))fail(400,'Invalid criterion points.');
            let sum=0,complete=true;
            for(const [i,c] of criteria.entries()){
              if(scores[i]==null||scores[i]===''){complete=false;if(action==='publish')fail(400,'Complete every criterion.');continue;}
              const score=decimal(scores[i]);if(!Number.isFinite(score)||score<0||score>c.max)fail(400,'Invalid criterion points.');sum+=score;
            }
            if(complete&&value!=null&&value!==''&&Math.abs(sum-decimal(value))>1e-8)fail(400,'Criterion points must equal the question score.');
          }
          const comment=grading.comments[q.part.id]?.[q.index];if(comment!=null&&(typeof comment!=='string'||comment.length>3000))fail(400,'Invalid feedback.');
          const error=grading.errors[q.part.id]?.[q.index];if(error!=null&&!['','correct','needs-work'].includes(error))fail(400,'Invalid error mark.');
        }
        state=action==='publish'?'published':'reviewing';
      }
    }
    const savedAnswers={...answers,...(Object.keys(answerText).length?{_formatting:answerText}:{})};
    // The revision guard and history snapshot commit together, including legacy mirrors.
    const commands=[s('DROP TABLE IF EXISTS temp.assessment_guard'),s('CREATE TEMP TABLE assessment_guard(ok INTEGER NOT NULL CHECK(ok=1))'),s('INSERT INTO assessment_guard SELECT ?=COALESCE((SELECT revision FROM assessment_work WHERE account_id=? AND kind=? AND material_id=?),0)',[revision,account,kind,id]),
      s('INSERT INTO assessment_history(account_id,kind,material_id,actor_id,action,reason,snapshot_json) VALUES(?,?,?,?,?,?,?)',[account,kind,id,actor.id,action,body.reason||'',JSON.stringify(row||previous)]),
      s(`INSERT INTO assessment_work(account_id,kind,material_id,exam_id,revision,state,answers_json,grading_json,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,kind,material_id) DO UPDATE SET revision=excluded.revision,state=excluded.state,answers_json=excluded.answers_json,grading_json=excluded.grading_json,snapshot_json=excluded.snapshot_json,updated_at=unixepoch()`,[account,kind,id,document.examId,revision+1,state,JSON.stringify(savedAnswers),JSON.stringify(grading),JSON.stringify(snapshot)])];
    if(kind==='exam-block')commands.push(s(`INSERT INTO exam_work(account_id,exam_id,block_id,saved,answers_json,corrections_json,points_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_id,exam_id,block_id) DO UPDATE SET saved=excluded.saved,answers_json=excluded.answers_json,corrections_json=excluded.corrections_json,points_json=excluded.points_json,updated_at=unixepoch()`,[account,document.examId,id,+(state!=='draft'),JSON.stringify(savedAnswers),JSON.stringify(grading.comments||{}),JSON.stringify(grading.points||{})]));
    if(kind==='exam-block'&&['submit','publish','amend'].includes(action))commands.push(...await examLifecycleCommands(this.db,document.examId,account,actor,id,state,grading));
    if(kind==='exam-block'&&['review','publish'].includes(action)){
      const [instance]=await this.db.read('SELECT i.*,e.title FROM exam_instances i JOIN exams e ON e.id=i.exam_id WHERE i.exam_id=? AND i.account_id=? AND i.active=1',[document.examId,account]);
      if(instance)commands.push(...await examWorkflowCommands(this.db,instance,actor,teaching?'review_started':'started'));
    }
    try{await this.db.atomic(commands);}catch(error){if(/constraint|check/i.test(error.message))fail(409,'This work changed. Reload before saving.');throw error;}
    if(kind==='exam-block'&&!reviewer(actor)&&state==='submitted')return {kind,examId:document.examId,blockId:id,revision:revision+1,state,saved:true,answers,materials:[]};
    return this.get(actor,{kind,id,studentId});
  }
  async history(actor,body){const account=this.account(actor,body.studentId);if(!reviewer(actor)||account===actor.id)fail(403,'Review history is available to the teacher.');await this.document(actor,body.kind,body.id,account);await this.ensure();return this.db.read('SELECT action,reason,actor_id actorId,created_at createdAt,snapshot_json snapshot FROM assessment_history WHERE account_id=? AND kind=? AND material_id=? ORDER BY id DESC LIMIT 30',[account,body.kind,body.id]);}
}
