// Isolated orchestration. No provider, credentials, timers or production imports.
import {StudyError,statement as s,QUIZ_TYPES} from './learning-study.mjs';
import {exactFields,validateReviewContent} from './quiz-review-content.mjs';
const contextTypes=['Match','Memory','Select all','Odd one out'];
const fail=(status,message)=>{throw new StudyError(status,message);};
const reviewer=actor=>{if(!actor?.id||!['ADMIN','DEVELOPER'].includes(actor.role)||actor.active===false||actor.active===0||actor.revoked)fail(403,'An active teacher is required.');};
const origin=job=>({groupId:job.group_id,lessonId:job.lesson_id,cardId:job.card_id,senseId:job.sense_id});
const dto=j=>({id:j.id,type:j.type,state:j.state,revision:j.revision,attempts:j.attempts,cycle:j.cycle,issue:j.issue,versionId:j.version_id,...origin(j)});
export class GenerationIssue extends Error{
  constructor(code,retryable=true){super(code);this.code=code;this.retryable=retryable;}
}
export class QuizGenerationService{
  constructor({review,worker,resolveActor,generate,now=Date.now,timeoutMs=2000,leaseMs=10000,backoffMs=1000}){
    if(worker?.role!=='DEVELOPER'||typeof resolveActor!=='function'||typeof generate!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<1||leaseMs<=timeoutMs||backoffMs<0)throw new Error('Invalid isolated generation dependencies.');
    Object.assign(this,{review,db:review.db,worker,resolveActor,generate,now,timeoutMs,leaseMs,backoffMs});
  }
  async enqueue(actor,body){
    reviewer(actor);exactFields(body,['mutationId','groupId','lessonId','cardId','senseId','types']);
    if(!Array.isArray(body.types)||!body.types.length||body.types.length>17||new Set(body.types).size!==body.types.length||body.types.some(t=>!QUIZ_TYPES.includes(t)))fail(400,'Choose valid, distinct quiz types.');
    return this.review.mutation(actor,body,['generation-enqueue'],async()=>{
      await this.review.checkContext(actor,body);const statements=[this.review.accessGuard(actor,body)],ids=[];
      for(const type of body.types){
        const [existing]=await this.db.read('SELECT id FROM qr_generation_jobs WHERE group_id=? AND lesson_id=? AND card_id=? AND sense_id=? AND type=?',[body.groupId,body.lessonId,body.cardId,body.senseId,type]);
        if(existing){ids.push(existing.id);continue;}
        const [approved]=await this.db.read("SELECT id FROM qr_versions WHERE sense_id=? AND type=? AND state='approved' LIMIT 1",[body.senseId,type]);if(approved)continue;
        const id=crypto.randomUUID();ids.push(id);
        statements.push(s(`INSERT INTO qr_generation_jobs(id,group_id,lesson_id,card_id,sense_id,type,requested_by,state)
          VALUES(?,?,?,?,?,?,?,?)`,[id,body.groupId,body.lessonId,body.cardId,body.senseId,type,actor.id,contextTypes.includes(type)?'context':'queued']),this.review.guard());
      }
      return {statements,result:{ids}};
    });
  }
  async list(actor){
    reviewer(actor);const rows=await this.db.read('SELECT * FROM qr_generation_jobs ORDER BY group_id,lesson_id,type,id LIMIT 300'),out=[];
    for(const row of rows){try{await this.review.checkContext(actor,origin(row));out.push(dto(row));}catch(error){if(error.status!==403)throw error;}}
    return out;
  }
  async retry(actor,id,body){
    reviewer(actor);exactFields(body,['mutationId','expectedRevision']);
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)fail(400,'Use the current revision.');
    return this.review.mutation(actor,body,['generation-retry',id],async()=>{
      const [job]=await this.db.read('SELECT * FROM qr_generation_jobs WHERE id=?',[id]);if(!job)fail(404,'Task not found.');await this.review.checkContext(actor,origin(job));
      if(job.state!=='review'||job.cycle>=2)fail(409,'This task cannot be retried again.');
      return {statements:[this.review.accessGuard(actor,origin(job)),s("UPDATE qr_generation_jobs SET state='queued',requested_by=?,attempts=0,cycle=cycle+1,next_at=0,issue='',revision=revision+1 WHERE id=? AND revision=? AND state='review' AND cycle<2",[actor.id,id,body.expectedRevision]),this.review.guard()],result:{id,state:'queued',revision:body.expectedRevision+1}};
    });
  }
  async atomic(commands){
    try{await this.db.atomic([s('DROP TABLE IF EXISTS temp.mutation_guard'),s('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))'),...commands,s('DROP TABLE temp.mutation_guard')]);}
    catch(error){if(error.status===409||/constraint/i.test(error.message))fail(409,'Task lease changed.');throw error;}
  }
  async change(job,fields){
    const keys=Object.keys(fields),values=Object.values(fields);
    await this.atomic([s(`UPDATE qr_generation_jobs SET ${keys.map(k=>k+'=?').join(',')},revision=revision+1 WHERE id=? AND revision=? AND state='running' AND lease_token=? AND lease_until>?`,[...values,job.id,job.revision,job.lease_token,this.now()]),this.review.guard()]);
    return (await this.db.read('SELECT * FROM qr_generation_jobs WHERE id=?',[job.id]))[0];
  }
  async runOne(){
    const now=this.now(),[found]=await this.db.read(`SELECT * FROM qr_generation_jobs WHERE
      (state IN ('queued','retry') AND next_at<=?) OR (state='running' AND lease_until<=?) ORDER BY next_at,id LIMIT 1`,[now,now]);
    if(!found)return false;
    const token=crypto.randomUUID();
    try{await this.atomic([s(`UPDATE qr_generation_jobs SET state='running',lease_token=?,lease_until=?,revision=revision+1
      WHERE id=? AND revision=? AND ((state IN ('queued','retry') AND next_at<=?) OR (state='running' AND lease_until<=?))`,[token,now+this.leaseMs,found.id,found.revision,now,now]),this.review.guard()]);}catch(error){if(error.status===409)return true;throw error;}
    let job=(await this.db.read('SELECT * FROM qr_generation_jobs WHERE id=?',[found.id]))[0];
    try{
      const actor=await this.resolveActor(job.requested_by);reviewer(actor);await this.review.checkContext(actor,origin(job));
      const [approved]=await this.db.read("SELECT id FROM qr_versions WHERE sense_id=? AND type=? AND state='approved' LIMIT 1",[job.sense_id,job.type]);
      if(approved){await this.change(job,{state:'skipped',issue:'already_approved',lease_token:null,lease_until:0});return true;}
      let candidate=job.candidate_json?JSON.parse(job.candidate_json):null;
      if(!candidate){
        if(job.attempts>=3)throw new GenerationIssue('attempt_limit',false);
        job=await this.change(job,{attempts:job.attempts+1});
        const [meaning]=await this.db.read('SELECT en,translation,definition,part_of_speech FROM qr_senses WHERE id=?',[job.sense_id]);
        const controller=new AbortController();let timer;
        try{
          candidate=await Promise.race([Promise.resolve().then(()=>this.generate({type:job.type,meaning,attempt:job.attempts,signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new GenerationIssue('timeout'));},this.timeoutMs);})]);
        }finally{clearTimeout(timer);}
        candidate=validateReviewContent(job.type,candidate);
        job=await this.change(job,{candidate_json:JSON.stringify(candidate)});
      }
      // Stable mutation + saved candidate recover a crash after creating the version.
      const version=await this.review.createGeneratedDraft(this.worker,actor,{mutationId:job.id,...origin(job),type:job.type,content:candidate});
      await this.change(job,{state:'submitted',version_id:version.id,issue:'',lease_token:null,lease_until:0});
    }catch(error){
      if(error.status===409){
        const [current]=await this.db.read('SELECT lease_token,lease_until FROM qr_generation_jobs WHERE id=?',[job.id]);
        if(current?.lease_token!==job.lease_token||current.lease_until<=this.now())return true;
        error=new GenerationIssue('write_conflict',false);
      }
      const codes=['timeout','audio_unavailable','temporary_failure','attempt_limit','write_conflict'];
      const issue=error.status===400?'invalid_content':[401,403].includes(error.status)?'access_changed':error instanceof GenerationIssue&&codes.includes(error.code)?error.code:'generator_failed';
      const retryable=error.status===400||!(error instanceof GenerationIssue)&&![401,403].includes(error.status)||error instanceof GenerationIssue&&error.retryable;
      try{await this.change(job,{state:retryable&&job.attempts<3?'retry':'review',issue,...(error.status===400?{candidate_json:null}:{}),next_at:this.now()+this.backoffMs*2**Math.max(0,job.attempts-1),lease_token:null,lease_until:0});}catch(leaseError){if(leaseError.status!==409)throw leaseError;}
    }
    return true;
  }
}
