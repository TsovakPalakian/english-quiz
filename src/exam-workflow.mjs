import {StudyError,statement as s,recordId} from './learning-study.mjs';
import {ExamService} from './learning-exams.mjs';
import {AssessmentService} from './learning-assessment.mjs';
import {MessageService} from './learning-messages.mjs';
import {mayReviewInstance,instanceReviewerIds} from './learning-exam-instances.mjs';
import {ensureAccountArchive} from './account-archive.mjs';
const events={viewed:'Assignment viewed',started:'Exam started',review_started:'Review started',results_viewed:'Results viewed',completed:'Exam completed'};
export async function requireExamStarted(db,examId,account){
  const [row]=await db.read("SELECT EXISTS(SELECT 1 FROM assessment_history h WHERE h.kind='exam-workflow' AND h.material_id=i.exam_id AND h.account_id=i.account_id AND h.action='started' AND h.actor_id=i.account_id) started FROM exam_instances i WHERE i.exam_id=? AND i.account_id=? AND i.active=1",[examId,account]);
  if(row&&!row.started)throw new StudyError(409,'Start at least one examination block before submitting.');
}
export async function examWorkflowCommands(db,instance,actor,event){
  if(!events[event])throw new StudyError(400,'Invalid exam event.');
  const key='exam-workflow:'+instance.exam_id+':'+event;
  const commands=[s(`INSERT INTO assessment_history(account_id,kind,material_id,actor_id,action,reason,snapshot_json)
    SELECT ?,'exam-workflow',?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM assessment_history WHERE kind='exam-workflow' AND material_id=? AND action=?)`,[instance.account_id,instance.exam_id,actor.id,event,key,JSON.stringify({event,examId:instance.exam_id,at:new Date().toISOString()}),instance.exam_id,event])];
  if(['started','review_started','completed'].includes(event)){
    const recipients=event==='review_started'?[instance.account_id]:await instanceReviewerIds(db,instance);
    for(const recipient of new Set(recipients))if(recipient&&recipient!==actor.id){
      const messages=new MessageService(db,async()=>[]);await messages.ensure();
      const room='direct:'+ [actor.id,recipient].sort().join(':');
      commands.push(...messages.directCommands(actor,recipient),s(`INSERT OR IGNORE INTO chat_messages(room_id,sender_id,sender_name,category,body,assignment_id,client_key,created_ms,exam_instance_id) VALUES(?,?,?,'learning',?,?,?,?,?)`,[room,actor.id,actor.name||actor.login||'Teacher',messages.sealText(room,events[event]+': '+instance.title),instance.assignment_id,key+(recipients.length>1?':'+recipient:''),Date.now(),instance.exam_id]));
    }
  }
  return commands;
}
export class ExamWorkflowService{
  constructor(db){this.db=db;}
  async instance(actor,id){
    recordId(id);if(!actor?.id)throw new StudyError(401,'Sign in first.');
    await new ExamService(this.db).ensure();await new AssessmentService(this.db).ensure();
    const [instance]=await this.db.read('SELECT i.*,e.title FROM exam_instances i JOIN exams e ON e.id=i.exam_id WHERE i.exam_id=? AND i.active=1 AND e.deleted_at IS NULL',[id]);
    await ensureAccountArchive(this.db);
    const archived=instance&&(await this.db.read('SELECT account_id FROM account_archives WHERE account_id=?',[instance.account_id])).length;
    if(!instance||archived&&actor.role!=='DEVELOPER'||!(actor.id===instance.account_id||await mayReviewInstance(this.db,instance,actor)))throw new StudyError(404,'Assigned exam not found.');
    return instance;
  }
  async status(actor,{examId}){
    const instance=await this.instance(actor,examId);
    const history=await this.db.read("SELECT action,actor_id actorId,created_at createdAt FROM assessment_history WHERE kind='exam-workflow' AND material_id=? ORDER BY id",[examId]);
    const work=await this.db.read("SELECT b.id,w.state FROM exam_blocks b LEFT JOIN assessment_work w ON w.material_id=b.id AND w.kind='exam-block' AND w.account_id=? WHERE b.exam_id=? AND b.deleted_at IS NULL AND b.published=1",[instance.account_id,examId]);
    const allPublished=work.length>0&&work.every(row=>row.state==='published'),allSubmitted=work.length>0&&work.every(row=>['submitted','reviewing','published'].includes(row.state));
    const has=event=>history.some(row=>row.action===event);
    const state=allPublished?(has('completed')?'completed':'results_published'):allSubmitted?(has('review_started')?'under_review':'submitted'):has('started')?'in_progress':'assigned';
    return {examId,state,canComplete:allPublished&&!has('completed'),canStart:!has('started')&&!allSubmitted,history,assignedAt:instance.assigned_at,blocks:work.length,submitted:work.filter(row=>['submitted','reviewing','published'].includes(row.state)).length,published:work.filter(row=>row.state==='published').length};
  }
  async write(actor,{examId,action}){
    if(!['viewed','started','review_started','results_viewed','completed'].includes(action))throw new StudyError(400,'Invalid exam workflow action.');
    const instance=await this.instance(actor,examId);
    if(action==='review_started'){
      if(!['ADMIN','DEVELOPER'].includes(actor.role)||actor.id===instance.account_id)throw new StudyError(403,'Only the assigned teacher can start review.');
    }else if(actor.id!==instance.account_id)throw new StudyError(403,'Only the assigned student can perform this action.');
    const current=await this.status(actor,{examId});
    if(['results_viewed','completed'].includes(action)&&!['results_published','completed'].includes(current.state))throw new StudyError(409,'Wait for published results.');
    if(action==='review_started'&&!['submitted','under_review'].includes(current.state))throw new StudyError(409,'Wait for all exam blocks to be submitted.');
    if(action==='started'&&['submitted','under_review','results_published','completed'].includes(current.state))return current;
    const commands=await examWorkflowCommands(this.db,instance,actor,action);
    if(['results_viewed','completed'].includes(action))commands.unshift(s('DROP TABLE IF EXISTS temp.assessment_guard'),s('CREATE TEMP TABLE assessment_guard(ok INTEGER NOT NULL CHECK(ok=1))'),s("INSERT INTO assessment_guard SELECT NOT EXISTS(SELECT 1 FROM exam_blocks b LEFT JOIN assessment_work w ON w.material_id=b.id AND w.kind='exam-block' AND w.account_id=? WHERE b.exam_id=? AND b.deleted_at IS NULL AND b.published=1 AND COALESCE(w.state,'')<>'published')",[instance.account_id,examId]));
    await this.db.atomic(commands);return this.status(actor,{examId});
  }
}
