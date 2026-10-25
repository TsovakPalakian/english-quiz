import {statement as s} from './learning-study.mjs';
import {MessageService} from './learning-messages.mjs';
import {gradingQuestions} from './learning-assessment.mjs';
import {instanceReviewerIds} from './learning-exam-instances.mjs';

// Lifecycle and notices join the submission transaction; retries cannot duplicate them.
export async function examLifecycleCommands(db,examId,account,actor,blockId,state,grading){
  const [instance]=await db.read('SELECT i.*,e.title,e.lesson_date FROM exam_instances i JOIN exams e ON e.id=i.exam_id WHERE i.exam_id=? AND i.account_id=?',[examId,account]);
  if(!instance||!instance.reviewer_id||!['submitted','reviewing','published'].includes(state))return [];
  const messages=new MessageService(db,async()=>[]);await messages.ensure();
  const rows=await db.read(`SELECT b.id,m.id part_id,m.type,m.content_json,w.revision,w.grading_json,w.snapshot_json FROM exam_blocks b LEFT JOIN exam_materials m ON m.block_id=b.id AND m.deleted_at IS NULL LEFT JOIN assessment_work w ON w.material_id=b.id AND w.kind='exam-block' AND w.account_id=? WHERE b.exam_id=? AND b.deleted_at IS NULL AND b.published=1 ORDER BY b.position,m.position`,[account,examId]);
  let maximum=0,earned=0;
  for(const id of new Set(rows.map(r=>r.id))){
    const items=rows.filter(r=>r.id===id),snapshot=items[0].snapshot_json;
    const parts=snapshot?JSON.parse(snapshot):items.filter(r=>r.part_id).map(r=>({...JSON.parse(r.content_json),id:r.part_id,type:r.type}));
    const scores=id===blockId?grading:JSON.parse(items[0].grading_json||'{}');
    for(const q of gradingQuestions(parts)){maximum+=q.max;earned+=Number(scores.points?.[q.part.id]?.[q.index]||0);}
  }
  const required="b.exam_id="+examId+" AND b.deleted_at IS NULL AND b.published=1";
  const predicate=states=>`EXISTS(SELECT 1 FROM exam_blocks b WHERE ${required}) AND NOT EXISTS(SELECT 1 FROM exam_blocks b WHERE ${required} AND NOT EXISTS(SELECT 1 FROM assessment_work w WHERE w.material_id=b.id AND w.kind='exam-block' AND w.account_id=exam_instances.account_id AND w.state IN (${states})))`;
  const submitted=predicate("'submitted','reviewing','published'"),completed=predicate("'published'");
  const details='\nStudent: '+instance.student_name+'\nGroup: '+(instance.group_title||'Unassigned')+'\nExam: '+instance.title+'\nInstance: '+examId+(instance.lesson_date?'\nExam date: '+instance.lesson_date:'')+'\nMaximum: '+Number(maximum.toFixed(10));
  const recipients=[...new Set(await instanceReviewerIds(db,instance))];
  const notify=(recipient,sender,event,text,condition)=>{
    const room='direct:'+ [sender.id,recipient].sort().join(':');
    return [...messages.directCommands(sender,recipient),s(`INSERT OR IGNORE INTO chat_messages(room_id,sender_id,sender_name,category,body,assignment_id,client_key,created_ms,exam_instance_id) SELECT ?,?,?,'learning',?,?,?,?,? FROM exam_instances WHERE exam_id=? AND ${condition}`,[room,sender.id,sender.name,messages.sealText(room,text),instance.assignment_id,'exam:'+examId+':'+event,Date.now(),examId,examId])];
  };
  const commands=[];
  const journal=(event,condition)=>s(`INSERT INTO assessment_history(account_id,kind,material_id,actor_id,action,reason,snapshot_json) SELECT ?,'exam-workflow',?,?,?,'',? FROM exam_instances WHERE exam_id=? AND ${condition} AND NOT EXISTS(SELECT 1 FROM assessment_history h WHERE h.kind='exam-workflow' AND h.material_id=? AND h.action=?)`,[account,examId,actor.id,event,JSON.stringify({event,examId,at:new Date().toISOString()}),examId,examId,event]);
  for(const id of new Set(rows.map(r=>r.id)))if(id!==blockId)commands.push(s("INSERT INTO assessment_guard SELECT COALESCE((SELECT revision FROM assessment_work WHERE account_id=? AND kind='exam-block' AND material_id=?),0)=?",[account,id,rows.find(r=>r.id===id).revision||0]));
  for(const recipient of recipients)commands.push(...notify(recipient,{id:account,name:instance.student_name},'submitted'+(recipients.length>1?':'+recipient:''),'Ready for review'+details+'\nSubmitted: '+new Date().toISOString(),submitted));
  commands.push(journal('submitted',submitted));
  if(state==='published')commands.push(journal('results_published',completed));
  if(state==='published')commands.push(...notify(account,{id:actor.id,name:actor.role==='DEVELOPER'?'Support':actor.name||actor.login||'Teacher'},'completed','Exam reviewed. Results published.'+details+'\nScore: '+Number(earned.toFixed(10))+' / '+Number(maximum.toFixed(10)),completed));
  commands.push(s(`UPDATE exam_instances SET status=CASE WHEN ${completed} THEN 'completed' WHEN ${submitted} THEN 'ready' ELSE status END,completed_at=CASE WHEN ${completed} THEN COALESCE(completed_at,unixepoch()) ELSE completed_at END,max_points=?,earned_points=CASE WHEN ${completed} THEN ? ELSE earned_points END WHERE exam_id=?`,[Number(maximum.toFixed(10)),Number(earned.toFixed(10)),examId]));
  commands.push(s("UPDATE chat_assignments SET active=0 WHERE id=? AND NOT EXISTS(SELECT 1 FROM exam_instances WHERE assignment_id=? AND status<>'completed' AND active=1)",[instance.assignment_id,instance.assignment_id]));
  commands.push(s("UPDATE class_groups SET revision=revision+1 WHERE id=(SELECT group_id FROM class_group_exams WHERE exam_id=?) AND NOT EXISTS(SELECT 1 FROM chat_assignments WHERE exam_id=? AND target_kind='group' AND active=1)",[instance.source_exam_id,instance.source_exam_id]));
  // Ending an assignment must not detach its reusable source exam from its subgroup.
  commands.push(s('UPDATE exams SET revision=revision+1 WHERE id=?',[examId]));
  return commands;
}
