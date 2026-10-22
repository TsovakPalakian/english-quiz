// Isolated orchestration. No provider, credentials, timers or production imports.
import {StudyError,statement as s,QUIZ_TYPES} from './learning-study.mjs';
import {exactFields,reviewText,validateReviewContent} from './quiz-review-content.mjs';
import {validateGenerationMetadata,validateGenerationSource,validateGenerationUsage} from './quiz-generation-metadata.mjs';
const contextTypes=['Match','Memory','Select all','Odd one out'];
const fail=(status,message)=>{throw new StudyError(status,message);};
const reviewer=actor=>{if(!actor?.id||!['ADMIN','DEVELOPER'].includes(actor.role)||actor.active===false||actor.active===0||actor.revoked)fail(403,'An active teacher is required.');};
const origin=job=>({groupId:job.group_id,lessonId:job.lesson_id,cardId:job.card_id,senseId:job.sense_id});
const dto=j=>({id:j.id,type:j.type,state:j.state,revision:j.revision,attempts:j.attempts,cycle:j.cycle,issue:j.issue,versionId:j.version_id,quizState:j.quiz_state||null,...origin(j)});
export class GenerationIssue extends Error{
  constructor(code,retryable=true){super(code);this.code=code;this.retryable=retryable;}
}
export class QuizGenerationService{
  constructor({review,worker,resolveActor,generate,preparation=null,now=Date.now,timeoutMs=2000,leaseMs=10000,backoffMs=1000}){
    if(worker?.role!=='DEVELOPER'||typeof resolveActor!=='function'||typeof generate!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<1||leaseMs<=timeoutMs||backoffMs<0)throw new Error('Invalid isolated generation dependencies.');
    if(preparation!==null&&(preparation.review!==review||!['load','assertCurrent','guards'].every(key=>typeof preparation[key]==='function')))throw Error('Preparation must use the current review service.');
    Object.assign(this,{review,db:review.db,worker,resolveActor,generate,preparation,now,timeoutMs,leaseMs,backoffMs});
  }
  async enqueuePackage(actor,body,{retryFailed=true}={}){
    exactFields(body,['mutationId','groupId','lessonId','cardId','senseId']);
    if(!this.preparation)fail(503,'Full preparation is not configured.');
    return this.enqueue(actor,{...body,types:[...QUIZ_TYPES]},{skipProposals:true,retryFailed});
  }
  async enqueue(actor,body,{skipProposals=false,retryFailed=false,excludeTypes=[],beforeEnqueue=null}={}){
    reviewer(actor);exactFields(body,['mutationId','groupId','lessonId','cardId','senseId','types']);
    if(!Array.isArray(body.types)||!body.types.length||body.types.length>17||new Set(body.types).size!==body.types.length||body.types.some(t=>!QUIZ_TYPES.includes(t)))fail(400,'Choose valid, distinct quiz types.');
    return this.review.mutation(actor,body,[skipProposals?'generation-fill':'generation-enqueue'],async()=>{
      if(beforeEnqueue)await beforeEnqueue();
      await this.review.checkContext(actor,body);const statements=[this.review.accessGuard(actor,body)],ids=[];
      for(const type of body.types){
        if(excludeTypes.includes(type))continue;
        if(skipProposals){const [proposal]=await this.db.read("SELECT id FROM qr_versions WHERE sense_id=? AND type=? AND state IN ('draft','submitted','returned') LIMIT 1",[body.senseId,type]);if(proposal)continue;}
        const [existing]=await this.db.read('SELECT * FROM qr_generation_jobs WHERE group_id=? AND lesson_id=? AND card_id=? AND sense_id=? AND type=?',[body.groupId,body.lessonId,body.cardId,body.senseId,type]);
        if(existing){
          if(this.preparation&&existing.state==='context'){
            statements.push(s("UPDATE qr_generation_jobs SET state='queued',requested_by=?,revision=revision+1 WHERE id=? AND revision=? AND state='context'",[actor.id,existing.id,existing.revision]),this.review.guard());ids.push(existing.id);continue;
          }
          if(retryFailed){const [job]=await this.db.read('SELECT * FROM qr_generation_jobs WHERE id=?',[existing.id]);
            if(job.state==='review'&&!job.version_id&&job.cycle<2){
              statements.push(s("UPDATE qr_generation_jobs SET state='queued',requested_by=?,attempts=0,cycle=cycle+1,candidate_json=NULL,candidate_generation_json=NULL,next_at=0,issue='',revision=revision+1 WHERE id=? AND revision=? AND state='review' AND version_id IS NULL AND cycle<2 AND NOT EXISTS(SELECT 1 FROM qr_versions WHERE sense_id=? AND type=? AND state IN ('draft','submitted','returned','approved'))",[actor.id,job.id,job.revision,body.senseId,type]),this.review.guard());ids.push(job.id);
            }
          }else ids.push(existing.id);continue;
        }
        const [approved]=await this.db.read("SELECT id FROM qr_versions WHERE sense_id=? AND type=? AND state='approved' LIMIT 1",[body.senseId,type]);if(approved)continue;
        const id=crypto.randomUUID();ids.push(id);
        if(skipProposals)statements.push(s("INSERT INTO mutation_guard SELECT NOT EXISTS(SELECT 1 FROM qr_versions WHERE sense_id=? AND type=? AND state IN ('draft','submitted','returned','approved'))",[body.senseId,type]));
        statements.push(s(`INSERT INTO qr_generation_jobs(id,group_id,lesson_id,card_id,sense_id,type,requested_by,state)
          VALUES(?,?,?,?,?,?,?,?)`,[id,body.groupId,body.lessonId,body.cardId,body.senseId,type,actor.id,contextTypes.includes(type)&&!this.preparation?'context':'queued']),this.review.guard());
      }
      return {statements,result:{ids}};
    });
  }
  async list(actor){
    reviewer(actor);const rows=await this.db.read('SELECT j.*,q.state AS quiz_state FROM qr_generation_jobs j LEFT JOIN qr_versions q ON q.id=j.version_id ORDER BY j.group_id,j.lesson_id,j.type,j.id LIMIT 300'),out=[];
    for(const row of rows){try{await this.review.checkContext(actor,origin(row));out.push(dto(row));}catch(error){if(error.status!==403)throw error;}}
    return out;
  }
  async attemptHistory(actor,id){
    reviewer(actor);const [job]=await this.db.read('SELECT * FROM qr_generation_jobs WHERE id=?',[id]);
    if(!job)fail(404,'Task not found.');await this.review.checkContext(actor,origin(job));
    const rows=await this.db.read('SELECT * FROM qr_generation_attempts WHERE job_id=? ORDER BY cycle,attempt',[id]);
    return rows.map(row=>({cycle:row.cycle,attempt:row.attempt,state:row.state,startedAt:row.started_at,finishedAt:row.finished_at,issue:row.issue,
      source:row.source_json?JSON.parse(row.source_json):null,usage:row.usage_json?JSON.parse(row.usage_json):null}));
  }
  async retry(actor,id,body){
    reviewer(actor);exactFields(body,['mutationId','expectedRevision']);
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)fail(400,'Use the current revision.');
    return this.review.mutation(actor,body,['generation-retry',id],async()=>{
      const [job]=await this.db.read('SELECT * FROM qr_generation_jobs WHERE id=?',[id]);if(!job)fail(404,'Task not found.');await this.review.checkContext(actor,origin(job));
      if(job.state!=='review'||job.cycle>=2||job.version_id)fail(409,'This task cannot be retried again.');
      return {statements:[this.review.accessGuard(actor,origin(job)),s("UPDATE qr_generation_jobs SET state='queued',requested_by=?,attempts=0,cycle=cycle+1,candidate_json=NULL,candidate_generation_json=NULL,next_at=0,issue='',revision=revision+1 WHERE id=? AND revision=? AND state='review' AND cycle<2 AND version_id IS NULL",[actor.id,id,body.expectedRevision]),this.review.guard()],result:{id,state:'queued',revision:body.expectedRevision+1}};
    });
  }
  async repair(actor,id,body){
    reviewer(actor);exactFields(body,['mutationId','expectedRevision','content']);
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)fail(400,'Use the current revision.');
    return this.review.mutation(actor,body,['generation-repair',id],async()=>{
      const [job]=await this.db.read('SELECT * FROM qr_generation_jobs WHERE id=?',[id]);if(!job)fail(404,'Task not found.');
      const ctx=await this.review.checkContext(actor,origin(job));
      if(job.state!=='review'||job.version_id)fail(409,'A replacement is already linked or the task is not ready for repair.');
      const content=validateReviewContent(job.type,body.content),versionId=crypto.randomUUID(),author=reviewText(actor.name||actor.login||actor.id,200);
      const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yerevan',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      return {statements:[this.review.accessGuard(actor,origin(job)),
        s(`INSERT INTO qr_versions(id,family_id,version,sense_id,type,content_json,state,author_id,author_name,author_group,group_id,lesson_id,card_id,created_date)
          VALUES(?,?,1,?,?,?,'draft',?,?,?,?,?,?,?)`,[versionId,versionId,job.sense_id,job.type,JSON.stringify(content),actor.id,author,ctx.group_name,job.group_id,job.lesson_id,job.card_id,date]),this.review.guard(),
        s("UPDATE qr_generation_jobs SET version_id=?,revision=revision+1 WHERE id=? AND revision=? AND state='review' AND version_id IS NULL",[versionId,id,body.expectedRevision]),this.review.guard(),
        this.review.event({id:versionId,revision:1},actor,'manual-replacement-created',{generationJobId:id,originalIssue:job.issue,content})],
      result:{id:versionId,jobId:id,revision:1,state:'draft',jobRevision:body.expectedRevision+1}};
    });
  }
  async atomic(commands){
    try{await this.db.atomic([s('DROP TABLE IF EXISTS temp.mutation_guard'),s('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))'),...commands,s('DROP TABLE temp.mutation_guard')]);}
    catch(error){if(error.status===409||/constraint/i.test(error.message))fail(409,'Task lease changed.');throw error;}
  }
  async change(job,fields,extra=[]){
    const keys=Object.keys(fields),values=Object.values(fields);
    await this.atomic([s(`UPDATE qr_generation_jobs SET ${keys.map(k=>k+'=?').join(',')},revision=revision+1 WHERE id=? AND revision=? AND state='running' AND lease_token=? AND lease_until>?`,[...values,job.id,job.revision,job.lease_token,this.now()]),this.review.guard(),...extra]);
    return (await this.db.read('SELECT * FROM qr_generation_jobs WHERE id=?',[job.id]))[0];
  }
  finishAttempt(job,attempt,state,issue,observation){
    return [s(`UPDATE qr_generation_attempts SET state=?,finished_at=?,issue=?,source_json=?,usage_json=?
      WHERE job_id=? AND cycle=? AND attempt=? AND state='running' AND lease_token=?`,
    [state,Math.max(this.now(),attempt.startedAt),issue,observation.source?JSON.stringify(observation.source):null,observation.usage?JSON.stringify(observation.usage):null,
      job.id,job.cycle,attempt.number,job.lease_token]),this.review.guard()];
  }
  async runOne({signal}={}){
    if(signal?.aborted)return false;
    const now=this.now(),[found]=await this.db.read(`SELECT * FROM qr_generation_jobs WHERE
      (state IN ('queued','retry') AND next_at<=?) OR (state='running' AND lease_until<=?) ORDER BY next_at,id LIMIT 1`,[now,now]);
    if(!found)return false;
    const token=crypto.randomUUID();
    try{await this.atomic([s(`UPDATE qr_generation_jobs SET state='running',lease_token=?,lease_until=?,revision=revision+1
      WHERE id=? AND revision=? AND ((state IN ('queued','retry') AND next_at<=?) OR (state='running' AND lease_until<=?))`,[token,now+this.leaseMs,found.id,found.revision,now,now]),this.review.guard(),
      s("UPDATE qr_generation_attempts SET state='interrupted',finished_at=MAX(started_at,?),issue='worker_interrupted' WHERE job_id=? AND state='running'",[now,found.id])]);}catch(error){if(error.status===409)return true;throw error;}
    let job=(await this.db.read('SELECT * FROM qr_generation_jobs WHERE id=?',[found.id]))[0];
    let attempt=null,observing=false,observation={source:null,usage:null};
    try{
      const actor=await this.resolveActor(job.requested_by);reviewer(actor);await this.review.checkContext(actor,origin(job));
      if(signal?.aborted)throw new GenerationIssue('cancelled',false);
      const [approved]=await this.db.read("SELECT id FROM qr_versions WHERE sense_id=? AND type=? AND state='approved' LIMIT 1",[job.sense_id,job.type]);
      if(approved){await this.change(job,{state:'skipped',issue:'already_approved',lease_token:null,lease_until:0});return true;}
      let candidate=job.candidate_json?JSON.parse(job.candidate_json):null;
      let generation=job.candidate_generation_json?validateGenerationMetadata(JSON.parse(job.candidate_generation_json)):null;
      let preparation=null;
      if(!candidate){
        if(job.attempts>=3)throw new GenerationIssue('attempt_limit',false);
        const number=job.attempts+1,startedAt=this.now();
        job=await this.change(job,{attempts:number},[s("INSERT INTO qr_generation_attempts(job_id,cycle,attempt,lease_token,state,started_at) VALUES(?,?,?,?,'running',?)",[job.id,job.cycle,number,job.lease_token,startedAt])]);
        attempt={number,startedAt};
        const [meaning]=await this.db.read('SELECT en,translation,definition,part_of_speech FROM qr_senses WHERE id=?',[job.sense_id]);
        const controller=new AbortController();let timer,abort;
        try{
          observing=true;
          candidate=await Promise.race([Promise.resolve().then(async()=>{
            if(this.preparation)preparation=await this.preparation.load(actor,job,{signal:controller.signal});
            if(controller.signal.aborted)throw new GenerationIssue('timeout');
            return this.generate({type:job.type,meaning,preparation,attempt:job.attempts,signal:controller.signal,
            onObservation:value=>{if(observing){observation={source:validateGenerationSource(value.source),usage:value.usage==null?null:validateGenerationUsage(value.usage)};}}
          });}),new Promise((_,reject)=>{abort=()=>{controller.abort();reject(new GenerationIssue('cancelled',false));};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();timer=setTimeout(()=>{controller.abort();reject(new GenerationIssue('timeout'));},this.timeoutMs);})]);
        }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);observing=false;}
        if(candidate&&Object.hasOwn(candidate,'content')){
          exactFields(candidate,['content','generation']);
          generation=validateGenerationMetadata(candidate.generation);candidate=candidate.content;
          observation={source:generation.source,usage:generation.usage};
        }
        if(preparation)await this.preparation.assertCurrent(actor,job,preparation);
        candidate=this.preparation?this.review.validateContent(job.type,candidate):validateReviewContent(job.type,candidate);
        job=await this.change(job,{candidate_json:JSON.stringify(candidate),candidate_generation_json:generation?JSON.stringify(generation):null},this.finishAttempt(job,attempt,'accepted','',observation));
        attempt=null;
      }
      if(signal?.aborted)throw new GenerationIssue('cancelled',false);
      if(this.preparation){preparation=preparation||await this.preparation.load(actor,job);await this.preparation.assertCurrent(actor,job,preparation);}
      // Stable mutation + saved candidate recover a crash after creating the version.
      const version=await this.review.createGeneratedDraft(this.worker,actor,{mutationId:job.id,...origin(job),type:job.type,content:candidate,...(generation?{generation}:{})},{guards:this.preparation?[...this.preparation.guards(actor,preparation),s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_generation_jobs WHERE id=? AND revision=? AND state='running' AND lease_token=? AND lease_until>?)",[job.id,job.revision,job.lease_token,this.now()])]:[]});
      await this.change(job,{state:'submitted',version_id:version.id,issue:'',lease_token:null,lease_until:0});
    }catch(error){
      if(error.status===409){
        const [current]=await this.db.read('SELECT lease_token,lease_until FROM qr_generation_jobs WHERE id=?',[job.id]);
        if(current?.lease_token!==job.lease_token||current.lease_until<=this.now())return true;
        error=new GenerationIssue('write_conflict',false);
      }
      const codes=['timeout','audio_unavailable','temporary_failure','attempt_limit','write_conflict','provider_not_configured','context_required','source_changed','dictionary_mismatch','quality_check_failed','invalid_model_response','quota_exceeded','cancelled'];
      const issue=error.status===400?'invalid_content':[401,403].includes(error.status)?'access_changed':error instanceof GenerationIssue&&codes.includes(error.code)?error.code:'generator_failed';
      const retryable=error.status===400||!(error instanceof GenerationIssue)&&![401,403].includes(error.status)||error instanceof GenerationIssue&&error.retryable;
      const terminal=error.status===400||['quality_check_failed','invalid_model_response'].includes(issue)?'rejected':'error';
      try{await this.change(job,{state:retryable&&job.attempts<3?'retry':'review',issue,...(error.status===400?{candidate_json:null,candidate_generation_json:null}:{}),next_at:this.now()+this.backoffMs*2**Math.max(0,job.attempts-1),lease_token:null,lease_until:0},attempt?this.finishAttempt(job,attempt,terminal,issue,observation):[]);}catch(leaseError){if(leaseError.status!==409)throw leaseError;}
    }
    return true;
  }
}
