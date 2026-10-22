import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
const staff=actor=>{if(!actor?.id||!['ADMIN','DEVELOPER'].includes(actor.role)||actor.active===false||actor.active===0||actor.revoked)throw new StudyError(403,'Active teacher access required.');};
const developer=actor=>{staff(actor);if(actor.role!=='DEVELOPER')throw new StudyError(403,'Developer access required.');};
const stop=code=>{throw Object.assign(Error(code),{code});};
const positive=(value,max)=>Number.isSafeInteger(value)&&value>0&&value<=max;
export class QuizPreparationRunner{
  constructor({review,generation,pipeline,workerId,resolveActor,authorize=async()=>false,now=Date.now,leaseMs=30000}={}){
    if(!review?.db||generation?.review!==review||pipeline?.review!==review||!generation.preparation||typeof generation.enqueuePackage!=='function'||typeof pipeline.runOne!=='function'||typeof workerId!=='string'||!workerId||typeof resolveActor!=='function'||typeof authorize!=='function'||typeof now!=='function'||!positive(leaseMs,120000))throw Error('Invalid preparation runner dependencies.');
    Object.assign(this,{review,db:review.db,generation,pipeline,workerId,resolveActor,authorize,now,leaseMs});
    this.running=new Set();
  }
  time(){const at=this.now();if(!Number.isSafeInteger(at)||at<0||!Number.isSafeInteger(at+this.leaseMs))throw new StudyError(503,'Preparation clock unavailable.');return at;}
  async settings(actor){developer(actor);const [row]=await this.db.read('SELECT * FROM qr_dispatch_settings WHERE id=1');if(!row)throw new StudyError(503,'Preparation settings unavailable.');return {enabled:row.enabled===1,revision:row.revision};}
  async configure(actor,body){
    developer(actor);exactFields(body,['mutationId','expectedRevision','enabled','reason']);
    if(typeof body.enabled!=='boolean'||!positive(body.expectedRevision,Number.MAX_SAFE_INTEGER-1))throw new StudyError(400,'Invalid preparation settings.');const reason=reviewText(body.reason,500);
    return this.review.mutation(actor,body,['dispatch-settings'],async()=>({statements:[s('UPDATE qr_dispatch_settings SET enabled=?,revision=revision+1 WHERE id=1 AND revision=? AND enabled<>?',[+body.enabled,body.expectedRevision,+body.enabled]),this.review.guard(),s('INSERT INTO qr_dispatch_setting_events VALUES(?,?,?,?,?)',[body.expectedRevision+1,actor.id,+body.enabled,reason,this.time()])],result:{enabled:body.enabled,revision:body.expectedRevision+1}}));
  }
  async gate(stage,signal,context=null){
    if(signal?.aborted)stop('cancelled');
    const worker=await this.resolveActor(this.workerId);try{developer(worker);}catch{stop('denied');}if(worker.id!==this.workerId)stop('denied');
    if(!(await this.settings(worker)).enabled)stop('off');
    if(signal?.aborted)stop('cancelled');
    if(await this.authorize({stage,worker,context,signal})!==true)stop('denied');
    if(signal?.aborted)stop('cancelled');if(!(await this.settings(worker)).enabled)stop('off');return worker;
  }
  async reconcile(actor,{after=0,limit=100}={}){
    developer(actor);if(!Number.isSafeInteger(after)||after<0||!positive(limit,100))throw new StudyError(400,'Invalid reconciliation page.');
    if(!(await this.settings(actor)).enabled)throw new StudyError(409,'Preparation is off.');
    const rows=await this.db.read(`SELECT b.id,b.lesson_id,b.card_id FROM lesson_blocks b JOIN cards c ON c.id=b.card_id JOIN lessons l ON l.id=b.lesson_id
      WHERE b.id>? AND b.type IN('word','wordcard') AND b.deleted_at IS NULL AND c.scope='shared' AND c.deleted_at IS NULL AND l.deleted_at IS NULL ORDER BY b.id LIMIT ?`,[after,limit+1]);
    const page=rows.slice(0,limit);
    if(page.length)await this.db.atomic(page.map(row=>s(`INSERT INTO qr_preparation_outbox(lesson_id,card_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM qr_dispatch_settings WHERE id=1 AND enabled=1)
      ON CONFLICT(lesson_id,card_id) DO UPDATE SET state='queued',attempts=0,issue='',next_at=0,revision=revision+1,event_revision=event_revision+1 WHERE qr_preparation_outbox.state IN('waiting','done','ignored','attention')`,[row.lesson_id,row.card_id])));
    return {scanned:page.length,next:rows.length>limit?page.at(-1).id:null};
  }
  async finish(row,state,issue=''){
    await this.generation.atomic([s(`UPDATE qr_preparation_outbox SET state=?,issue=?,lease_token=NULL,lease_until=0,next_at=?,revision=revision+1
      WHERE id=? AND revision=? AND state='running' AND lease_token=? AND lease_until>?`,[state,issue,state==='retry'?this.time()+1000*2**Math.max(0,row.attempts-1):0,row.id,row.revision,row.lease_token,this.time()]),this.review.guard()]);
  }
  async dispatch({signal}={}){
    const worker=await this.gate('dispatch',signal),at=this.time(),[found]=await this.db.read(`SELECT * FROM qr_preparation_outbox WHERE (state IN('queued','retry') AND next_at<=?) OR (state='running' AND lease_until<=?) ORDER BY next_at,id LIMIT 1`,[at,at]);
    if(!found)return false;
    const token=crypto.randomUUID();
    try{await this.generation.atomic([s(`UPDATE qr_preparation_outbox SET state='running',attempts=MIN(3,attempts+1),lease_token=?,lease_until=?,revision=revision+1
      WHERE id=? AND revision=? AND ((state IN('queued','retry') AND next_at<=?) OR (state='running' AND lease_until<=?))
      AND EXISTS(SELECT 1 FROM qr_dispatch_settings WHERE id=1 AND enabled=1)`,[token,at+this.leaseMs,found.id,found.revision,at,at]),this.review.guard()]);}catch(error){if(error.status===409)return true;throw error;}
    const [row]=await this.db.read('SELECT * FROM qr_preparation_outbox WHERE id=?',[found.id]);
    try{
      if(found.attempts>=3){await this.finish(row,'attention','dispatch_attempt_limit');return true;}
      const [word]=await this.db.read(`SELECT c.id FROM cards c JOIN lesson_blocks b ON b.card_id=c.id JOIN lessons l ON l.id=b.lesson_id
        WHERE c.id=? AND b.lesson_id=? AND c.scope='shared' AND c.deleted_at IS NULL AND b.deleted_at IS NULL AND l.deleted_at IS NULL AND b.type IN('word','wordcard') LIMIT 1`,[row.card_id,row.lesson_id]);
      if(!word){await this.finish(row,'ignored','word_unavailable');return true;}
      const senses=await this.db.read('SELECT sense_id FROM qr_card_senses WHERE card_id=? LIMIT 2',[row.card_id]);
      if(senses.length!==1){await this.finish(row,'waiting',senses.length?'meaning_ambiguous':'meaning_required');return true;}
      const groups=await this.db.read('SELECT g.id FROM class_group_lessons gl JOIN class_groups g ON g.id=gl.group_id WHERE gl.lesson_id=? AND g.deleted_at IS NULL ORDER BY g.id LIMIT 21',[row.lesson_id]);
      if(!groups.length){await this.finish(row,'waiting','group_required');return true;}if(groups.length>20){await this.finish(row,'attention','context_limit');return true;}
      for(const group of groups){
        const context={groupId:group.id,lessonId:row.lesson_id,cardId:row.card_id,senseId:senses[0].sense_id};await this.gate('enqueue',signal,context);await this.review.checkContext(worker,context);
        // Stable across leases/restarts; new source events have a new event_revision.
        await this.generation.enqueuePackage(worker,{mutationId:`auto-${row.id}-${row.event_revision}-${group.id}-${context.senseId}`,...context},{retryFailed:false});
      }
      await this.finish(row,'done');
    }catch(error){
      const issue=['off','denied','cancelled'].includes(error.code)?error.code:[401,403].includes(error.status)?'access_changed':'dispatch_unavailable';
      try{await this.finish(row,['off','cancelled'].includes(issue)||issue==='dispatch_unavailable'&&row.attempts<3?'retry':'attention',issue);}catch(conflict){if(conflict.status!==409)throw conflict;}
    }
    return true;
  }
  async tick({maxSteps=12,maxMs=20000,signal}={}){
    if(!positive(maxSteps,100)||!positive(maxMs,120000))throw new StudyError(400,'Invalid preparation tick budget.');
    const controller=new AbortController(),counts={dispatch:0,generation:0,review:0};let timer,abort,reason='limit';
    const stopped=new Promise(resolve=>{abort=()=>{controller.abort();resolve(signal?.aborted?'cancelled':'deadline');};signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,maxMs);if(signal?.aborted)abort();});
    const work=(async()=>{
      let idle=0;
      for(let index=0;index<maxSteps;index++){
        const stage=['dispatch','generation','review'][index%3];await this.gate(stage,controller.signal);
        const performed=await (stage==='dispatch'?this.dispatch({signal:controller.signal}):stage==='generation'?this.generation.runOne({signal:controller.signal}):this.pipeline.runOne({signal:controller.signal}));
        if(performed){counts[stage]++;idle=0;}else if(++idle===3)return 'idle';
      }
      return 'limit';
    })().catch(error=>['off','denied','cancelled'].includes(error.code)?error.code:'unavailable');
    this.running.add(work);work.then(()=>this.running.delete(work));
    try{reason=await Promise.race([work,stopped]);return {reason,counts:{...counts}};}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
  }
  async summary(actor,{limit=50}={}){
    staff(actor);if(!positive(limit,100))throw new StudyError(400,'Invalid preparation page.');
    const counts=await this.db.read('SELECT state,COUNT(*) AS count FROM qr_preparation_outbox GROUP BY state'),generation=await this.db.read('SELECT state,COUNT(*) AS count FROM qr_generation_jobs GROUP BY state'),review=await this.db.read('SELECT state,COUNT(*) AS count FROM qr_preparation_pipeline GROUP BY state');
    const rows=await this.db.read('SELECT id,lesson_id AS lessonId,card_id AS cardId,event_revision AS eventRevision,revision,state,attempts,issue,next_at AS nextAt FROM qr_preparation_outbox ORDER BY id DESC LIMIT ?',[limit]);
    return {counts,generation,review,rows,eventAuthorKnown:false};
  }
  async history(actor,id,{before=null,limit=50}={}){
    staff(actor);if(!positive(id,Number.MAX_SAFE_INTEGER)||!positive(limit,100)||before!==null&&!positive(before,Number.MAX_SAFE_INTEGER))throw new StudyError(400,'Invalid dispatch history.');
    const rows=await this.db.read(`SELECT id,revision,state,issue,changed_at AS changedAt FROM qr_dispatch_events WHERE outbox_id=? ${before===null?'':'AND id<?'} ORDER BY id DESC LIMIT ?`,[id,...(before===null?[]:[before]),limit+1]),page=rows.slice(0,limit);
    return {events:page,next:rows.length>limit?page.at(-1).id:null};
  }
}
// Only a trusted host schedules ticks. No cron/resource or production flag is created.
export function createPreparationScheduled({enabled=false,openRunner,maxSteps=12,maxMs=20000}={}){
  if(typeof enabled!=='boolean'||typeof openRunner!=='function'||!positive(maxSteps,100)||!positive(maxMs,120000))throw Error('Invalid preparation scheduler.');
  return async(_event,env,ctx)=>{
    if(!enabled||env?.LEARNING_PREPARATION_ENABLED!=='true'||env?.LEARNING_WORKBENCH_ENABLED!=='true'||env?.LEARNING_WORKBENCH_WRITES!=='true'||env?.STAGE_WRITES!=='true'||env?.ACCOUNT_TRANSFER_FROZEN==='true')return {reason:'off'};
    if(typeof ctx?.waitUntil!=='function')throw Error('A trusted scheduling context is required.');
    const work=Promise.resolve().then(async()=>{const runner=await openRunner({env});if(!(runner instanceof QuizPreparationRunner))throw Error('A trusted preparation runner is required.');return runner.tick({maxSteps,maxMs});});ctx.waitUntil(work);return work;
  };
}
