// Isolated local foundation: no production routes, model transport or auto-approval.
import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields} from './quiz-review-content.mjs';
import {createIndependentQuizReviewer,isIndependentReviewCurrent,validateIndependentReviewResult,IndependentReviewIssue} from './quiz-independent-review.mjs';

const fail=(status,message)=>{throw new StudyError(status,message);};
const teacher=actor=>{
  if(!actor?.id||actor.active===false||actor.active===0||actor.revoked)fail(401,'Sign in with an active account.');
  if(!['ADMIN','DEVELOPER'].includes(actor.role))fail(403,'Teacher access required.');
};
const levels=[null,'A1','A2','B1','B2','C1','C2'];
const knownErrors=new Set(['review_not_configured','quota_exceeded','quota_unavailable','cancelled','timeout','interrupted','invalid_review_input','invalid_review_response','stale_review_response','review_refused','review_unavailable']);
const select=`SELECT r.*,l.expires_at,l.retry_of,l.retry_count,o.finished_at,o.result_json,o.error_code,
  EXISTS(SELECT 1 FROM qr_independent_leases child WHERE child.retry_of=r.id) AS retried
  FROM qr_independent_requests r JOIN qr_independent_leases l ON l.request_id=r.id LEFT JOIN qr_independent_outcomes o ON o.request_id=r.id`;

export class StoredQuizIndependentReview{
  constructor(review,{reviewer=createIndependentQuizReviewer(),now=Date.now,timeoutMs=12000}={}){
    if(typeof review?.db?.read!=='function'||typeof review.db.atomic!=='function'||typeof reviewer!=='function'||typeof now!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)fail(400,'Invalid independent review configuration.');
    this.review=review;this.db=review.db;this.reviewer=reviewer;this.now=now;this.timeoutMs=timeoutMs;
  }
  timestamp(){const value=this.now();if(!Number.isSafeInteger(value)||value<0)fail(503,'Review clock unavailable.');return value;}
  async version(actor,id){teacher(actor);const q=await this.review.version(id);await this.review.access(actor,q);return q;}
  async expire(id){
    const now=this.timestamp();
    await this.db.atomic([s(`INSERT OR IGNORE INTO qr_independent_outcomes(request_id,finished_at,result_json,error_code)
      SELECT r.id,l.expires_at,NULL,'interrupted' FROM qr_independent_requests r JOIN qr_independent_leases l ON l.request_id=r.id
      WHERE r.version_id=? AND l.expires_at<=?`,[id,now])]);
  }
  async input(q,level){
    if(!levels.includes(level))fail(400,'Invalid target level.');
    const [meaning]=await this.db.read('SELECT en,translation,definition,part_of_speech FROM qr_senses WHERE id=?',[q.sense_id]);
    if(!meaning)fail(409,'Quiz meaning is unavailable.');
    return {type:q.type,meaning,content:JSON.parse(q.content_json),revision:q.revision,level};
  }
  async entry(row,currentInput){
    const checked=JSON.parse(row.checked_json);
    const result=row.result_json?await validateIndependentReviewResult(JSON.parse(row.result_json),checked):null;
    return {id:row.id,sequence:row.sequence,versionId:row.version_id,revision:row.revision,
      requestedBy:row.requested_by,requestedAt:row.requested_at,finishedAt:row.finished_at,
      expiresAt:row.expires_at,retryOf:row.retry_of,retryCount:row.retry_count,
      canRetry:!!row.error_code&&!row.retried&&row.retry_count<2&&row.revision===currentInput.revision&&checked.level===currentInput.level,
      state:row.finished_at===null?'pending':row.error_code?'failed':'completed',error:row.error_code,
      checked,result,current:result!==null&&await isIndependentReviewCurrent(result,currentInput)};
  }
  async run(actor,id,body,options){return this.execute(actor,id,body,options);}
  async retry(actor,id,attemptId,body,options={}){
    exactFields(body,['mutationId','expectedRevision']);
    if(typeof attemptId!=='string'||!/^[a-f0-9-]{36}$/.test(attemptId))fail(400,'Invalid review attempt.');
    await this.version(actor,id);
    const [original]=await this.db.read('SELECT checked_json FROM qr_independent_requests WHERE id=? AND version_id=?',[attemptId,id]);
    if(!original)fail(404,'Review attempt not found.');
    return this.execute(actor,id,{...body,level:JSON.parse(original.checked_json).level},{...options,retryOf:attemptId});
  }
  async execute(actor,id,body,{signal,retryOf=null}={}){
    const q=await this.version(actor,id);
    exactFields(body,['mutationId','expectedRevision','level']);
    const level=body.level??null;
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||!levels.includes(level)||
      typeof body.mutationId!=='string'||!/^[A-Za-z0-9_-]{12,100}$/.test(body.mutationId))fail(400,'Invalid independent review request.');
    await this.expire(id);
    const request=JSON.stringify({id,expectedRevision:body.expectedRevision,level,...(retryOf?{retryOf}:{})});
    const [previous]=await this.db.read(select+' WHERE r.requested_by=? AND r.mutation_id=?',[actor.id,body.mutationId]);
    if(previous){
      if(previous.request_json!==request)fail(409,'This operation ID was already used for another review.');
      return this.entry(previous,await this.input(q,level));
    }
    if(q.revision!==body.expectedRevision)fail(409,'The quiz changed. Reload before checking.');
    if(signal?.aborted)fail(400,'Review cancelled before starting.');
    let retryCount=0;
    if(retryOf){
      const [original]=await this.db.read(select+' WHERE r.id=? AND r.version_id=?',[retryOf,id]);
      if(!original||!original.error_code||original.retried||original.retry_count>=2||original.revision!==q.revision)fail(409,'This attempt cannot be retried. Refresh the quiz and its history.');
      retryCount=original.retry_count+1;
    }
    const checked=await this.input(q,level),attemptId=crypto.randomUUID(),requestedAt=this.timestamp();
    const expiresAt=requestedAt+this.timeoutMs;if(!Number.isSafeInteger(expiresAt))fail(503,'Review clock unavailable.');
    const saved=await this.review.mutation(actor,body,['independent-review',id],async()=>({
      statements:[this.review.accessGuard(actor,{groupId:q.group_id,lessonId:q.lesson_id,cardId:q.card_id,senseId:q.sense_id}),
        s(`INSERT INTO mutation_guard SELECT NOT EXISTS(SELECT 1 FROM qr_independent_requests r
          LEFT JOIN qr_independent_outcomes o ON o.request_id=r.id WHERE r.version_id=? AND r.revision=? AND o.request_id IS NULL)`,[id,q.revision]),
        s(`INSERT INTO qr_independent_requests(id,version_id,revision,requested_by,mutation_id,request_json,checked_json,requested_at)
          SELECT ?,id,revision,?,?,?,?,? FROM qr_versions WHERE id=? AND revision=? AND content_json=? AND sense_id=?`,
        [attemptId,actor.id,body.mutationId,request,JSON.stringify(checked),requestedAt,id,q.revision,q.content_json,q.sense_id]),this.review.guard(),
        s('INSERT INTO qr_independent_leases(request_id,expires_at,retry_of,retry_count) VALUES(?,?,?,?)',[attemptId,expiresAt,retryOf,retryCount])],
      result:{attemptId}}));
    if(saved.attemptId===attemptId){
      let result=null,error=null;
      const controller=new AbortController();let timer,abort;
      const stopped=new Promise((_,reject)=>{
        const stop=code=>{reject(new IndependentReviewIssue(code));controller.abort();};
        abort=()=>stop('cancelled');signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>stop('interrupted'),Math.max(1,expiresAt-this.timestamp()));
        if(signal?.aborted)abort();
      });
      try{
        const candidate=await Promise.race([Promise.resolve().then(()=>{
          if(controller.signal.aborted)throw new IndependentReviewIssue('cancelled');
          return this.reviewer({...structuredClone(checked),signal:controller.signal});
        }),stopped]);
        if(signal?.aborted)error='cancelled';
        else result=await validateIndependentReviewResult(candidate,checked);
      }catch(issue){error=knownErrors.has(issue.code)?issue.code:'review_unavailable';}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
      const finishedAt=this.timestamp();
      await this.db.atomic([
        s(`INSERT OR IGNORE INTO qr_independent_outcomes(request_id,finished_at,result_json,error_code)
          SELECT request_id,expires_at,NULL,'interrupted' FROM qr_independent_leases WHERE request_id=? AND expires_at<=?`,[attemptId,finishedAt]),
        s('INSERT OR IGNORE INTO qr_independent_outcomes(request_id,finished_at,result_json,error_code) VALUES(?,?,?,?)',
          [attemptId,finishedAt,result?JSON.stringify(result):null,error])]);
    }
    const [row]=await this.db.read(select+' WHERE r.id=?',[saved.attemptId]);
    return this.entry(row,await this.input(await this.version(actor,id),level));
  }
  async history(actor,id,{level=null,before=null,limit=50,recover=true}={}){
    const q=await this.version(actor,id);
    if(!levels.includes(level)||!Number.isSafeInteger(limit)||limit<1||limit>100||before!==null&&(!Number.isSafeInteger(before)||before<1))fail(400,'Invalid review history page.');
    if(recover)await this.expire(id);
    const current=await this.input(q,level);
    const rows=await this.db.read(select+` WHERE r.version_id=? ${before===null?'':'AND r.sequence<?'} ORDER BY r.sequence DESC LIMIT ?`,[id,...(before===null?[]:[before]),limit+1]);
    const page=rows.slice(0,limit);
    return {attempts:await Promise.all(page.map(row=>this.entry(row,current))),next:rows.length>limit?page.at(-1).sequence:null};
  }
  async latest(actor,id,{level=null}={}){
    const {attempts}=await this.history(actor,id,{level,limit:1});
    const attempt=attempts[0]??null;
    return {attempt,result:attempt?.current?attempt.result:null};
  }
  async attempt(actor,id,attemptId,{level=null}={}){
    const q=await this.version(actor,id);await this.expire(id);
    const [row]=await this.db.read(select+' WHERE r.id=? AND r.version_id=?',[attemptId,id]);
    if(!row)fail(404,'Review attempt not found.');
    return this.entry(row,await this.input(q,level));
  }
}
