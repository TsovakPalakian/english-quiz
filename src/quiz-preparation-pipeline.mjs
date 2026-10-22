// Local orchestration only. Generation, model checks and teacher approval stay separate.
import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const teacher=actor=>{if(!actor?.id||!['ADMIN','DEVELOPER'].includes(actor.role)||actor.active===false||actor.active===0||actor.revoked)fail(403,'Active teacher access required.');};
const developer=actor=>{teacher(actor);if(actor.role!=='DEVELOPER')fail(403,'Developer access required.');};
const context=q=>({groupId:q.group_id,lessonId:q.lesson_id,cardId:q.card_id,senseId:q.sense_id});
export class QuizPreparationPipeline{
  constructor({review,independent,worker,resolveActor,now=Date.now,leaseMs=30000}){
    developer(worker);
    if(!review?.db||!independent||typeof resolveActor!=='function'||typeof now!=='function'||!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>120000)fail(400,'Invalid pipeline configuration.');
    Object.assign(this,{review,independent,db:review.db,worker,resolveActor,now,leaseMs});
  }
  time(){const at=this.now();if(!Number.isSafeInteger(at)||at<0||!Number.isSafeInteger(at+this.leaseMs))fail(503,'Pipeline clock unavailable.');return at;}
  async atomic(commands){
    try{await this.db.atomic([s('DROP TABLE IF EXISTS temp.mutation_guard'),s('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))'),...commands,s('DROP TABLE mutation_guard')]);}
    catch(error){if(error.status===409||/constraint/i.test(error.message))fail(409,'Pipeline changed. Refresh before retrying.');throw error;}
  }
  async initialize(actor){developer(actor);await this.db.atomic([s('INSERT OR IGNORE INTO qr_pipeline_settings(id,enabled,revision) VALUES(1,0,1)')]);return this.settings(actor);}
  async settings(actor){teacher(actor);const [row]=await this.db.read('SELECT enabled,revision FROM qr_pipeline_settings WHERE id=1');if(!row)fail(503,'Pipeline settings unavailable.');return {enabled:row.enabled===1,revision:row.revision};}
  async configure(actor,body){
    developer(actor);exactFields(body,['mutationId','expectedRevision','enabled','reason']);
    if(typeof body.enabled!=='boolean'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=Number.MAX_SAFE_INTEGER)fail(400,'Invalid pipeline settings.');
    const reason=reviewText(body.reason,500);
    return this.review.mutation(actor,body,['pipeline-settings'],async()=>({statements:[
      s('UPDATE qr_pipeline_settings SET enabled=?,revision=revision+1 WHERE id=1 AND revision=? AND enabled<>?',[+body.enabled,body.expectedRevision,+body.enabled]),this.review.guard(),
      s('INSERT INTO qr_pipeline_setting_events(revision,actor_id,enabled,reason,changed_at) VALUES(?,?,?,?,?)',[body.expectedRevision+1,actor.id,+body.enabled,reason,this.time()])],
      result:{enabled:body.enabled,revision:body.expectedRevision+1}}));
  }
  async discover(){
    const rows=await this.db.read(`SELECT j.id AS generation_id,j.requested_by,q.id,q.revision FROM qr_generation_jobs j JOIN qr_versions q ON q.id=j.version_id
      WHERE j.state='submitted' AND q.state='submitted' AND q.author_kind='automatic'
      AND NOT EXISTS(SELECT 1 FROM qr_preparation_pipeline p WHERE p.version_id=q.id) ORDER BY j.id LIMIT 100`);
    const at=this.time();
    if(rows.length)await this.db.atomic(rows.map(row=>s(`INSERT OR IGNORE INTO qr_preparation_pipeline(id,generation_job_id,version_id,expected_revision,requested_by,state,changed_at)
      SELECT ?,j.id,q.id,q.revision,j.requested_by,'queued',? FROM qr_generation_jobs j JOIN qr_versions q ON q.id=j.version_id
      WHERE j.id=? AND q.id=? AND q.revision=? AND j.state='submitted' AND q.state='submitted' AND q.author_kind='automatic'
      AND EXISTS(SELECT 1 FROM qr_pipeline_settings WHERE id=1 AND enabled=1)`,[crypto.randomUUID(),at,row.generation_id,row.id,row.revision])));
  }
  async finish(job,state,issue='',attemptId=null,leaseUntil=0){
    await this.atomic([s(`UPDATE qr_preparation_pipeline SET state=?,issue=?,attempt_id=?,lease_token=?,lease_until=?,changed_at=?,revision=revision+1
      WHERE id=? AND revision=? AND state='running' AND lease_token=? AND lease_until>?`,
      [state,issue,attemptId,state==='running'?job.lease_token:null,leaseUntil,this.time(),job.id,job.revision,job.lease_token,this.time()]),this.review.guard()]);
  }
  async runOne({signal}={}){
    if(signal?.aborted)return false;
    developer(this.worker);if(!(await this.settings(this.worker)).enabled)return false;
    await this.discover();const at=this.time();
    const [found]=await this.db.read("SELECT * FROM qr_preparation_pipeline WHERE state='queued' OR (state='running' AND lease_until<=?) ORDER BY changed_at,id LIMIT 1",[at]);
    if(!found)return false;
    const token=crypto.randomUUID();
    try{await this.atomic([s(`UPDATE qr_preparation_pipeline SET state='running',lease_token=?,lease_until=?,changed_at=?,revision=revision+1
      WHERE id=? AND revision=? AND (state='queued' OR (state='running' AND lease_until<=?))
      AND EXISTS(SELECT 1 FROM qr_pipeline_settings WHERE id=1 AND enabled=1)`,[token,at+this.leaseMs,at,found.id,found.revision,at]),this.review.guard()]);}
    catch(error){if(error.status===409)return true;throw error;}
    const [job]=await this.db.read('SELECT * FROM qr_preparation_pipeline WHERE id=?',[found.id]);
    try{
      const actor=await this.resolveActor(job.requested_by);teacher(actor);
      if(signal?.aborted){await this.finish(job,'attention','cancelled');return true;}
      const q=await this.review.version(job.version_id);await this.review.access(actor,q);
      if(q.revision!==job.expected_revision||q.state!=='submitted'){await this.finish(job,'stale','revision_changed');return true;}
      const [lease]=await this.db.read('SELECT lease_token,lease_until FROM qr_preparation_pipeline WHERE id=?',[job.id]);
      if(lease.lease_token!==token||lease.lease_until<=this.time())return true;
      // Stable actor + mutation identity recovers a crash before linking the model result.
      const existing=await this.independent.latest(actor,q.id);
      let attempt;
      if(job.attempt_id)attempt=await this.independent.attempt(actor,q.id,job.attempt_id);
      else if(existing.attempt?.current||existing.attempt?.state==='pending'&&existing.attempt.revision===q.revision)attempt=existing.attempt;
      else attempt=await this.independent.run(actor,q.id,{mutationId:'pipeline-'+job.id,expectedRevision:q.revision,level:null},{signal});
      const current=await this.review.version(q.id);
      if(current.revision!==job.expected_revision||current.state!=='submitted')await this.finish(job,'stale','revision_changed',attempt.id);
      else if(attempt.state==='pending')await this.finish(job,'running','awaiting_result',attempt.id,Math.max(this.time()+1000,attempt.expiresAt));
      else await this.finish(job,attempt.result?'teacher_review':'attention',attempt.error||'',attempt.id);
    }catch(error){
      if(error.status===409){
        const [current]=await this.db.read('SELECT lease_token,lease_until FROM qr_preparation_pipeline WHERE id=?',[job.id]);
        if(current?.lease_token!==token||current.lease_until<=this.time())return true;
      }
      try{await this.finish(job,'attention',[401,403].includes(error.status)?'access_changed':error.status===409?'review_conflict':'pipeline_unavailable',job.attempt_id);}
      catch(conflict){if(conflict.status!==409)throw conflict;}
    }
    return true;
  }
  async list(actor){
    teacher(actor);const settings=await this.settings(actor),rows=await this.db.read(`SELECT p.*,q.group_id,q.lesson_id,q.card_id,q.sense_id,q.type,q.revision AS current_revision,q.state AS quiz_state
      FROM qr_preparation_pipeline p JOIN qr_versions q ON q.id=p.version_id ORDER BY p.changed_at DESC,p.id LIMIT 300`),jobs=[];
    for(const row of rows){
      try{await this.review.checkContext(actor,context(row));}catch(error){if(error.status===403)continue;throw error;}
      const latest=await this.independent.latest(actor,row.version_id);
      const status=row.quiz_state==='approved'?'approved':row.current_revision!==row.expected_revision?'stale':latest.attempt?.current?'teacher_review':latest.attempt?.state==='pending'?'running':latest.attempt?.error?'attention':!settings.enabled&&row.state==='queued'?'paused':row.state;
      jobs.push({id:row.id,versionId:row.version_id,revision:row.revision,expectedRevision:row.expected_revision,state:row.state,status,
        issue:latest.attempt?.error||row.issue,attemptId:row.attempt_id,changedAt:row.changed_at,type:row.type,...context(row)});
    }
    return {...settings,jobs};
  }
  async history(actor,id,{before=null}={}){
    teacher(actor);if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||before!==null&&(!Number.isSafeInteger(before)||before<1))fail(400,'Invalid pipeline history.');
    const [job]=await this.db.read('SELECT * FROM qr_preparation_pipeline WHERE id=?',[id]);if(!job)fail(404,'Pipeline task not found.');
    const q=await this.review.version(job.version_id);await this.review.access(actor,q);
    const rows=await this.db.read(`SELECT id,revision,state,issue,attempt_id,changed_at FROM qr_pipeline_events WHERE job_id=? ${before===null?'':'AND id<?'} ORDER BY id DESC LIMIT 51`,[id,...(before===null?[]:[before])]);
    const page=rows.slice(0,50);return {events:page.map(row=>({id:row.id,revision:row.revision,state:row.state,issue:row.issue,attemptId:row.attempt_id,changedAt:row.changed_at})),next:rows.length>50?page.at(-1).id:null};
  }
}
