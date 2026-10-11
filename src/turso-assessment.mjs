import {StudyError,statement as s,recordId,lessonAccess} from './turso-study.mjs';
import {materialVisibility} from './turso-visibility.mjs';
import {studentExamContent,ExamService} from './turso-exams.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const reviewer=actor=>['ADMIN','DEVELOPER'].includes(actor?.role);
const ready=new WeakMap();
export function rubric(value){return String(value||'').split('\n').map(line=>{const [label,points]=line.split('|');return {label:label.trim(),max:Number(points)};}).filter(row=>row.label&&Number.isFinite(row.max)&&row.max>0&&row.max<=10000).slice(0,20);}
export function assessmentQuestions(parts){return parts.filter(p=>['quiz','exercise','task'].includes(p.type)).flatMap(part=>(part.type==='task'?[part]:part.items||[]).map((item,index)=>({part,index,item,max:rubric(item.criteria).length?rubric(item.criteria).reduce((n,c)=>n+c.max,0):Number(item.maxPoints??part.maxPoints??1)})));}
export class AssessmentService{
  constructor(db){this.db=db;}
  ensure(){if(!ready.has(this.db))ready.set(this.db,this.db.atomic([
    s(`CREATE TABLE IF NOT EXISTS assessment_work(account_id TEXT NOT NULL,kind TEXT NOT NULL,material_id INTEGER NOT NULL,exam_id INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,state TEXT NOT NULL DEFAULT 'draft',answers_json TEXT NOT NULL DEFAULT '{}',grading_json TEXT NOT NULL DEFAULT '{}',snapshot_json TEXT NOT NULL DEFAULT '[]',updated_at INTEGER NOT NULL DEFAULT(unixepoch()),PRIMARY KEY(account_id,kind,material_id))`),
    s(`CREATE TABLE IF NOT EXISTS assessment_history(id INTEGER PRIMARY KEY,account_id TEXT NOT NULL,kind TEXT NOT NULL,material_id INTEGER NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',snapshot_json TEXT NOT NULL,created_at INTEGER NOT NULL DEFAULT(unixepoch()))`)
  ]).catch(error=>{ready.delete(this.db);throw error;}));return ready.get(this.db);}
  async document(actor,kind,id,account){
    recordId(id);let rows;
    if(kind==='exam-block'){
      await new ExamService(this.db).ensure();
      const [found]=await this.db.read(`SELECT b.exam_id FROM exam_blocks b JOIN exams e ON e.id=b.exam_id WHERE b.id=? AND b.deleted_at IS NULL AND e.deleted_at IS NULL AND (?=1 OR (e.published=1 AND b.published=1 AND e.hidden_from_students=0 AND b.hidden_from_students=0))`,[id,+reviewer(actor)]);
      const hidden=await materialVisibility(this.db,account);
      if(!found||!reviewer(actor)&&(hidden.has('exam:'+found.exam_id)||hidden.has('exam-block:'+id)))fail(404,'Exam not found.');
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
    return {kind:row.kind,examId:row.exam_id,blockId:row.material_id,revision:row.revision,state:row.state,saved:row.state!=='draft',answers:JSON.parse(row.answers_json||'{}'),corrections:show?grading.comments||{}:{},points:show?grading.points||{}:{},errors:show?grading.errors||{}:{},criteriaPoints:show?grading.criteriaPoints||{}:{},materials:JSON.parse(row.snapshot_json||'[]').map(part=>reviewer(actor)?part:studentExamContent(part,part.type))};
  }
  async get(actor,{kind,id,studentId}){
    const account=this.account(actor,studentId),document=await this.document(actor,kind,id,account),row=await this.row(account,kind,id);
    if(row)return this.project(row,actor);
    const legacy=kind==='exam-block'?await this.legacy(account,id):null;
    return this.project({account_id:account,kind,material_id:id,exam_id:document.examId,revision:0,state:legacy?.saved?'submitted':'draft',answers_json:legacy?.answers_json||'{}',grading_json:JSON.stringify({points:JSON.parse(legacy?.points_json||'{}'),comments:JSON.parse(legacy?.corrections_json||'{}')}),snapshot_json:JSON.stringify(document.parts)},actor);
  }
  async write(actor,body){
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid assessment.');
    const {kind,id,studentId,action='draft'}=body,account=this.account(actor,studentId),document=await this.document(actor,kind,id,account);
    if(kind==='exam-block'&&body.examId!=null&&body.examId!==document.examId)fail(404,'Exam not found.');
    const previous=await this.get(actor,{kind,id,studentId}),row=await this.row(account,kind,id),revision=row?.revision||0;
    if(body.expectedRevision!=null&&body.expectedRevision!==revision)fail(409,'This work changed. Reload before saving.');
    const teaching=account!==actor.id&&reviewer(actor),parts=row&&previous.saved?JSON.parse(row.snapshot_json):document.parts;
    const questions=assessmentQuestions(parts),max=questions.reduce((sum,q)=>sum+q.max,0);
    if(questions.some(q=>!Number.isFinite(q.max)||q.max<0||q.max>10000)||max>100000)fail(400,'Invalid maximum points.');
    let state=previous.state,answers=previous.answers,grading=row?JSON.parse(row.grading_json):{points:previous.points,comments:previous.corrections},snapshot=parts;
    if(['draft','submit'].includes(action)){
      if(teaching)fail(403,'Only the student can submit answers.');
      if(previous.saved){if(action==='submit'&&JSON.stringify(body.answers||{})===JSON.stringify(answers))return previous;fail(409,'This material has already been submitted.');}
      answers=body.answers||{};
      if(!answers||typeof answers!=='object'||Array.isArray(answers)||JSON.stringify(answers).length>50000)fail(400,'Invalid answers.');
      const keys=new Set(questions.map(q=>q.part.id+':'+q.index));
      for(const [part,items] of Object.entries(answers)){
        if(!items||typeof items!=='object'||Array.isArray(items))fail(400,'Invalid answer.');
        for(const [index,value] of Object.entries(items))if(!keys.has(part+':'+index)||!(typeof value==='string'||typeof value==='number'||Array.isArray(value)&&value.every(Number.isSafeInteger)))fail(400,'Invalid answer.');
      }
      state=action==='submit'?'submitted':'draft';grading={};snapshot=document.parts;
    }else{
      if(!teaching)fail(403,'Only a teacher can review or reopen student work.');
      if(!['review','publish','reopen','amend'].includes(action))fail(400,'Invalid review action.');
      if(['reopen','amend'].includes(action)){
        if(action==='reopen'&&!previous.saved||action==='amend'&&previous.state!=='published')fail(409,'This action is not available for the current submission.');
        if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500)fail(400,'Enter a reason.');
        state=action==='reopen'?'draft':'reviewing';
        if(action==='reopen'){grading={};snapshot=document.parts;}
      }else{
        if(!previous.saved)fail(409,'Wait for the student to submit.');
        if(previous.state==='published')fail(409,'Reopen the review before changing published grades.');
        grading={points:body.points||{},comments:body.corrections||{},errors:body.errors||{},criteriaPoints:body.criteriaPoints||{}};
        if(JSON.stringify(grading).length>50000)fail(413,'Review is too large.');
        const keys=new Set(questions.map(q=>q.part.id+':'+q.index));
        for(const map of Object.values(grading)){
          if(!map||typeof map!=='object'||Array.isArray(map))fail(400,'Invalid review.');
          for(const [part,items] of Object.entries(map)){
            if(!items||typeof items!=='object'||Array.isArray(items))fail(400,'Invalid review.');
            for(const index of Object.keys(items))if(!keys.has(part+':'+index))fail(400,'Unknown review question.');
          }
        }
        for(const q of questions){
          const value=grading.points[q.part.id]?.[q.index];
          if(value!=null&&value!==''&&(!Number.isFinite(Number(value))||Number(value)<0||Number(value)>q.max))fail(400,'Points must be between zero and the maximum.');
          if(action==='publish'&&(value==null||value===''))fail(400,'Grade every question before publishing.');
          const criteria=rubric(q.item.criteria),scores=grading.criteriaPoints[q.part.id]?.[q.index];
          if(criteria.length&&scores){
            if(typeof scores!=='object'||Array.isArray(scores)||Object.keys(scores).some(i=>!/^\d+$/.test(i)||Number(i)>=criteria.length))fail(400,'Invalid criterion points.');
            let sum=0,complete=true;
            for(const [i,c] of criteria.entries()){
              if(scores[i]==null||scores[i]===''){complete=false;if(action==='publish')fail(400,'Complete every criterion.');continue;}
              const score=Number(scores[i]);if(!Number.isFinite(score)||score<0||score>c.max)fail(400,'Invalid criterion points.');sum+=score;
            }
            if(complete&&value!=null&&value!==''&&Math.abs(sum-Number(value))>1e-8)fail(400,'Criterion points must equal the question score.');
          }
          const comment=grading.comments[q.part.id]?.[q.index];if(comment!=null&&(typeof comment!=='string'||comment.length>3000))fail(400,'Invalid feedback.');
          const error=grading.errors[q.part.id]?.[q.index];if(error!=null&&!['','correct','needs-work'].includes(error))fail(400,'Invalid error mark.');
        }
        state=action==='publish'?'published':'reviewing';
      }
    }
    // The revision guard and history snapshot commit together, including legacy mirrors.
    const commands=[s('DROP TABLE IF EXISTS temp.assessment_guard'),s('CREATE TEMP TABLE assessment_guard(ok INTEGER NOT NULL CHECK(ok=1))'),s('INSERT INTO assessment_guard SELECT ?=COALESCE((SELECT revision FROM assessment_work WHERE account_id=? AND kind=? AND material_id=?),0)',[revision,account,kind,id]),
      s('INSERT INTO assessment_history(account_id,kind,material_id,actor_id,action,reason,snapshot_json) VALUES(?,?,?,?,?,?,?)',[account,kind,id,actor.id,action,body.reason||'',JSON.stringify(row||previous)]),
      s(`INSERT INTO assessment_work(account_id,kind,material_id,exam_id,revision,state,answers_json,grading_json,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,kind,material_id) DO UPDATE SET revision=excluded.revision,state=excluded.state,answers_json=excluded.answers_json,grading_json=excluded.grading_json,snapshot_json=excluded.snapshot_json,updated_at=unixepoch()`,[account,kind,id,document.examId,revision+1,state,JSON.stringify(answers),JSON.stringify(grading),JSON.stringify(snapshot)])];
    if(kind==='exam-block')commands.push(s(`INSERT INTO exam_work(account_id,exam_id,block_id,saved,answers_json,corrections_json,points_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_id,exam_id,block_id) DO UPDATE SET saved=excluded.saved,answers_json=excluded.answers_json,corrections_json=excluded.corrections_json,points_json=excluded.points_json,updated_at=unixepoch()`,[account,document.examId,id,+(state!=='draft'),JSON.stringify(answers),JSON.stringify(grading.comments||{}),JSON.stringify(grading.points||{})]));
    try{await this.db.atomic(commands);}catch(error){if(/constraint|check/i.test(error.message))fail(409,'This work changed. Reload before saving.');throw error;}
    return this.get(actor,{kind,id,studentId});
  }
  async history(actor,body){const account=this.account(actor,body.studentId);if(!reviewer(actor)||account===actor.id)fail(403,'Review history is available to the teacher.');await this.document(actor,body.kind,body.id,account);await this.ensure();return this.db.read('SELECT action,reason,actor_id actorId,created_at createdAt,snapshot_json snapshot FROM assessment_history WHERE account_id=? AND kind=? AND material_id=? ORDER BY id DESC LIMIT 30',[account,body.kind,body.id]);}
}
