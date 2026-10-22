import {StudyError,statement as s,recordId} from './learning-study.mjs';
import {exactFields} from './quiz-review-content.mjs';
import {kitSigned,kitTeacher} from './learning-kits.mjs';
import {evaluateKitResponses} from './kit-sessions.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
export class KitExams{
  constructor(sessions,{resolveActor=async()=>null}={}){this.sessions=sessions;this.kits=sessions.kits;this.review=sessions.review;this.db=sessions.db;this.resolveActor=resolveActor;}
  async instance(actor,examId,blockId,{staff=false}={}){
    kitSigned(actor);recordId(examId);recordId(blockId);
    const [row]=await this.db.read(`SELECT i.*,b.id AS block_id,e.published AS exam_published,b.published AS block_published FROM exam_instances i
      JOIN exams e ON e.id=i.exam_id AND e.deleted_at IS NULL JOIN exam_blocks b ON b.exam_id=e.id AND b.id=? AND b.deleted_at IS NULL
      WHERE i.exam_id=? AND i.active=1`,[blockId,examId]);
    if(!row)fail(404,'Assigned exam block unavailable.');
    if(staff){kitTeacher(actor);if(actor.id===row.account_id||actor.role!=='DEVELOPER'&&row.reviewer_id!==actor.id)fail(403,'Only the assigned reviewer can manage these exam quizzes.');}
    else if(row.account_id!==actor.id||row.exam_published!==1||row.block_published!==1)fail(404,'Assigned exam block unavailable.');
    return row;
  }
  guard(actor,link,{submit=false,staff=false,published=false}={}){
    return s(`INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM exam_instances i JOIN exams e ON e.id=i.exam_id
      JOIN exam_blocks b ON b.exam_id=e.id AND b.id=? WHERE i.exam_id=? AND i.active=1 AND e.deleted_at IS NULL AND b.deleted_at IS NULL
      AND ${staff?"i.account_id<>? AND (?='DEVELOPER' OR i.reviewer_id=?)":"i.account_id=? AND e.published=1 AND b.published=1"}
      ${submit?"AND i.status NOT IN ('ready','completed') AND EXISTS(SELECT 1 FROM assessment_history h WHERE h.kind='exam-workflow' AND h.material_id=i.exam_id AND h.account_id=i.account_id AND h.action='started' AND h.actor_id=i.account_id) AND NOT EXISTS(SELECT 1 FROM assessment_work w WHERE w.account_id=i.account_id AND w.kind='exam-block' AND w.material_id=b.id AND w.state IN ('submitted','reviewing','published'))":''}
      ${published?"AND EXISTS(SELECT 1 FROM assessment_work w WHERE w.account_id=i.account_id AND w.kind='exam-block' AND w.material_id=b.id AND w.state='published')":''})`,[link.block_id,link.exam_id,...(staff?[actor.id,actor.role,actor.id]:[actor.id])]);
  }
  async access(actor,row){
    const [link]=await this.db.read('SELECT * FROM qr_exam_sessions WHERE session_id=?',[row.id]);if(!link)fail(403,'Exam practice must belong to an assigned exam block.');
    await this.instance(actor,link.exam_id,link.block_id);return link;
  }
  async assign(actor,body){
    kitTeacher(actor);exactFields(body,['mutationId','examId','blockId','cardId','senseId','versionId']);
    const instance=await this.instance(actor,body.examId,body.blockId,{staff:true}),student=await this.resolveActor(instance.account_id);
    if(!student||student.active===false||student.active===0||student.revoked||['ready','completed'].includes(instance.status))fail(409,'Assign quizzes before exam submission.');
    const card=await this.kits.card(actor,body.cardId);if(card.scope!=='shared')fail(400,'Choose a shared lesson card.');await this.kits.card(student,body.cardId);
    return this.review.mutation(actor,body,['assigned-quiz',body.examId,body.blockId],async()=>{
      const template=(await this.review.sharedForCard(actor,body.cardId)).find(row=>row.id===body.versionId&&row.senseId===body.senseId);
      if(!template||template.type==='Pronunciation')fail(409,'Choose an available reviewed non-speech template. Speech exam grading requires a separate teacher assessment.');
      const raw=await this.review.version(template.id),content=this.review.validateContent(raw.type,JSON.parse(raw.content_json)),metadata=await this.kits.metadata(body.senseId),[sense]=await this.db.read('SELECT en FROM qr_senses WHERE id=?',[body.senseId]),id=crypto.randomUUID(),at=Date.now();
      return {statements:[this.kits.cardGuard(actor,body.cardId),this.kits.cardGuard(student,body.cardId),this.guard(actor,{exam_id:body.examId,block_id:body.blockId},{staff:true}),
        s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM exam_instances WHERE exam_id=? AND account_id=? AND active=1 AND status NOT IN ('ready','completed'))",[body.examId,student.id]),
        s("INSERT INTO mutation_guard SELECT NOT EXISTS(SELECT 1 FROM assessment_work WHERE account_id=? AND kind='exam-block' AND material_id=? AND state IN ('submitted','reviewing','published'))",[student.id,body.blockId]),
        s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_versions q JOIN qr_card_senses cs ON cs.sense_id=q.sense_id WHERE q.id=? AND cs.card_id=? AND q.state='approved' AND NOT EXISTS(SELECT 1 FROM qr_publication p WHERE p.version_id=q.id AND p.available=0) AND NOT EXISTS(SELECT 1 FROM qr_versions n WHERE n.family_id=q.family_id AND n.state='approved' AND n.version>q.version))",[raw.id,body.cardId]),
        ...(this.review.contentPolicy?this.review.contentPolicy.snapshotGuards(content):[]),
        s("INSERT INTO qr_session_snapshots(id,owner_id,card_id,version_id,type,mode,content_json,metadata_json,state,created_at) VALUES(?,?,?,?,?,'exam',?,?,'open',?)",[id,student.id,body.cardId,raw.id,raw.type,JSON.stringify(content),JSON.stringify({meaning:sense.en,...metadata}),at]),
        s('INSERT INTO qr_exam_sessions(session_id,exam_id,block_id,version_id,assigned_by,created_at) VALUES(?,?,?,?,?,?)',[id,body.examId,body.blockId,raw.id,actor.id,at])
      ],result:{id,examId:body.examId,blockId:body.blockId,affectsLegacyGrade:false}};
    });
  }
  async list(actor,{examId,blockId}){
    const staff=['ADMIN','DEVELOPER'].includes(actor.role);await this.instance(actor,examId,blockId,{staff});
    const rows=await this.db.read(`SELECT q.id,q.type,q.state,q.revision,q.created_at AS createdAt FROM qr_exam_sessions x JOIN qr_session_snapshots q ON q.id=x.session_id WHERE x.exam_id=? AND x.block_id=? ORDER BY q.created_at,q.id`,[examId,blockId]);
    return {sessions:rows,affectsLegacyGrade:false};
  }
  async reviewSession(actor,id){
    kitTeacher(actor);const [link]=await this.db.read('SELECT * FROM qr_exam_sessions WHERE session_id=?',[id]);if(!link)fail(404,'Assigned quiz not found.');await this.instance(actor,link.exam_id,link.block_id,{staff:true});
    const [row]=await this.db.read('SELECT * FROM qr_session_snapshots WHERE id=?',[id]),content=JSON.parse(row.content_json),metadata=JSON.parse(row.metadata_json);
    return {id,type:row.type,state:row.state,revision:row.revision,content,responses:row.responses_json?JSON.parse(row.responses_json):null,correct:row.responses_json?evaluateKitResponses(row.type,content,JSON.parse(row.responses_json),metadata.meaning,metadata):null,affectsLegacyGrade:false};
  }
  async resultsVisible(actor,row){const link=await this.access(actor,row);const [published]=await this.db.read("SELECT 1 FROM assessment_work WHERE account_id=? AND kind='exam-block' AND material_id=? AND state='published'",[row.owner_id,link.block_id]);return !!published;}
  async canRelease(actor,row){const [link]=await this.db.read('SELECT * FROM qr_exam_sessions WHERE session_id=?',[row.id]);if(!link)return false;const instance=await this.instance(actor,link.exam_id,link.block_id,{staff:true});if(instance.account_id!==row.owner_id)return false;const [published]=await this.db.read("SELECT 1 FROM assessment_work WHERE account_id=? AND kind='exam-block' AND material_id=? AND state='published'",[row.owner_id,link.block_id]);return !!published;}
  async releaseGuards(actor,row){const [link]=await this.db.read('SELECT * FROM qr_exam_sessions WHERE session_id=?',[row.id]);if(!link)fail(403,'Assigned exam quiz required.');return [this.guard(actor,link,{staff:true,published:true}),s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM exam_instances WHERE exam_id=? AND account_id=? AND active=1)',[link.exam_id,row.owner_id])];}
}
