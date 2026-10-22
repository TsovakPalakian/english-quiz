// Explicit owner consent and one dispatch per report. Never imported by production.
import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
import {kitSigned} from './learning-kits.mjs';
import {FEEDBACK_ADDRESS} from './quiz-feedback.mjs';
import {boundedProviderBytes} from './bounded-provider-body.mjs';
import {rejectReportSecrets} from './quiz-feedback-privacy.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const MAX_ATTACHMENTS_BYTES=3*1024*1024;
const noDelivery=new Set(['E_VALIDATION_ERROR','E_FIELD_MISSING','E_TOO_MANY_RECIPIENTS','E_TOO_MANY_ATTACHMENTS','E_SENDER_NOT_VERIFIED','E_RECIPIENT_NOT_ALLOWED','E_RECIPIENT_SUPPRESSED','E_ACCOUNT_SUSPENDED','E_SENDER_DOMAIN_NOT_AVAILABLE','E_CONTENT_TOO_LARGE','E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED']);
const base64=bytes=>{let value='';for(let at=0;at<bytes.length;at+=24576)value+=btoa(String.fromCharCode(...bytes.subarray(at,at+24576)));return value;};
export function createFeedbackEmailTransport({enabled=false,binding=null,recipientVerified=false,policyRevision=null}={}){
  if(typeof enabled!=='boolean'||typeof recipientVerified!=='boolean'||policyRevision!==null&&(typeof policyRevision!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(policyRevision)))fail(503,'Invalid report email configuration.');
  const ready=()=>{if(!enabled||!recipientVerified||!policyRevision||typeof binding?.send!=='function')fail(503,'Report email sending is off or unverified.');};
  const prepared=new WeakSet();
  return {
    policyRevision,
    prepare({id,category,text,attachments}){
      ready();if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||!['complaint','remark','suggestion','bug'].includes(category)||typeof text!=='string'||text.length>12000||!Array.isArray(attachments)||attachments.length>5)fail(400,'Invalid email report.');
      let bytes=0;const files=attachments.map(file=>{
        if(!(file.content instanceof Uint8Array)||!file.content.length||typeof file.filename!=='string'||file.filename.length>160||/[\x00-\x1f\x7f/\\]/.test(file.filename)||
          !['image/png','image/jpeg','audio/wav','audio/mpeg','video/mp4'].includes(file.type))fail(400,'Invalid report attachment.');
        bytes+=file.content.length;if(bytes>MAX_ATTACHMENTS_BYTES)fail(413,'Report attachments exceed the email limit. No files were omitted.');
        return Object.freeze({filename:file.filename,type:file.type,disposition:'attachment',content:base64(file.content)});
      });
      // 3 MiB raw + base64 line folding + 64 KiB envelope stays below the 5 MiB service limit.
      const message=Object.freeze({to:FEEDBACK_ADDRESS,from:Object.freeze({email:'noreply@lumiscia.org',name:'Lumiscia'}),subject:'Lumiscia '+category+' ['+id+']',text,attachments:Object.freeze(files)});
      prepared.add(message);return message;
    },
    async send(message){ready();if(!prepared.has(message))fail(400,'Use an unmodified prepared report.');prepared.delete(message);return binding.send(structuredClone(message));},
  };
}
export class QuizFeedbackDelivery{
  constructor(feedback,{transport=createFeedbackEmailTransport(),dailyLimit=20,now=Date.now,timeoutMs=15000}={}){
    if(!Number.isSafeInteger(dailyLimit)||dailyLimit<1||dailyLimit>1000||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000||typeof now!=='function'||typeof transport?.prepare!=='function'||typeof transport?.send!=='function')fail(503,'Invalid report delivery configuration.');
    this.feedback=feedback;this.kits=feedback.kits;this.review=feedback.review;this.db=feedback.db;this.media=feedback.media;this.transport=transport;this.now=now;this.dailyLimit=dailyLimit;this.timeoutMs=timeoutMs;
  }
  async owned(actor,id){
    kitSigned(actor);const [row]=await this.db.read('SELECT * FROM qr_feedback WHERE id=? AND owner_id=?',[id,actor.id]);if(!row||this.feedback.privacyEnabled&&(row.deleted_at!==null||(row.expires_at??row.created_at+this.feedback.retentionDays*86400000)<=this.now()))fail(404,'Report unavailable.');if(!this.feedback.privacyEnabled)await this.kits.card(actor,row.card_id);return row;
  }
  async recover(){await this.db.atomic([s("UPDATE qr_feedback_delivery SET state='uncertain',error_code='interrupted',finished_at=? WHERE state IN ('queued','started') AND deadline_at<=?",[this.now(),this.now()])]);}
  async status(actor,id,{recover=true}={}){
    await this.owned(actor,id);if(recover)await this.recover();const [row]=await this.db.read('SELECT state,message_id,consent_at,finished_at,error_code FROM qr_feedback_delivery WHERE feedback_id=? AND owner_id=?',[id,actor.id]);
    return {id,state:row?.state||'saved_locally',recipient:FEEDBACK_ADDRESS,accepted:row?.state==='accepted',delivered:false,messageId:row?.message_id||null,consentAt:row?.consent_at||null,finishedAt:row?.finished_at||null,errorCode:row?.error_code||null};
  }
  async send(actor,id,body){
    const report=await this.owned(actor,id);exactFields(body,['mutationId','consent']);if(body.consent!==true)fail(400,'Explicit consent to send this report and its attachments is required.');
    await this.kits.card(actor,report.card_id);
    rejectReportSecrets(report.description);
    await this.recover();
    const [previous]=await this.db.read('SELECT state FROM qr_feedback_delivery WHERE feedback_id=?',[id]);if(previous)return this.status(actor,id);
    const attachments=[];let total=0;
    for(const mediaId of JSON.parse(report.attachments_json)){
      const row=await this.media.row(mediaId);if(row.owner_id!==actor.id||row.purpose!=='feedback')fail(403,'Report attachment unavailable.');
      rejectReportSecrets(row.name);
      total+=row.bytes;if(total>MAX_ATTACHMENTS_BYTES)fail(413,'Report attachments exceed the email limit. No files were omitted.');
      const response=await this.media.response(actor,mediaId,new Request('https://local.invalid/media/'+mediaId));
      const content=await boundedProviderBytes(response.body,row.bytes);if(content.length!==row.bytes)fail(503,'Report attachment integrity check failed.');
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',content))].map(byte=>byte.toString(16).padStart(2,'0')).join('');if(digest!==row.digest)fail(503,'Report attachment integrity check failed.');
      attachments.push({filename:row.name,type:row.mime,content});
    }
    const [sense]=await this.db.read('SELECT en,definition FROM qr_senses WHERE id=?',[report.sense_id]);
    const text=['Report: '+id,'Category: '+report.category,'Created: '+new Date(report.created_at).toISOString(),'Word: '+sense.en,'Meaning: '+sense.definition,'Version: '+(report.version_id||'word and meaning'),'',report.description].join('\n');
    const message=this.transport.prepare({id,category:report.category,text,attachments});
    const at=this.now(),policy=reviewText(this.transport.policyRevision,100);
    try{
      await this.review.mutation(actor,body,['feedback-email',id],async()=>({statements:[this.kits.cardGuard(actor,report.card_id),
        ...(this.feedback.privacyEnabled?[s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_feedback WHERE id=? AND owner_id=? AND deleted_at IS NULL AND COALESCE(expires_at,created_at+?)>? AND description=? AND attachments_json=?)',[id,actor.id,this.feedback.retentionDays*86400000,at,report.description,report.attachments_json])]:[]),
        ...JSON.parse(report.attachments_json).map(mediaId=>s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_media WHERE id=? AND owner_id=? AND purpose='feedback' AND deleted_at IS NULL)",[mediaId,actor.id])),
        s('INSERT INTO mutation_guard SELECT count(*)<? FROM qr_feedback_delivery WHERE created_at>?',[this.dailyLimit,at-86400000]),
        s("INSERT INTO qr_feedback_delivery(feedback_id,owner_id,consent_at,policy_revision,recipient,created_at,deadline_at,state) VALUES(?,?,?,?,?,?,?,'queued')",[id,actor.id,at,policy,FEEDBACK_ADDRESS,at,at+this.timeoutMs])],result:{id}}));
    }catch(error){
      if(error.status!==409||!(await this.db.read('SELECT 1 FROM qr_feedback_delivery WHERE feedback_id=? AND owner_id=?',[id,actor.id])).length)throw error;
      return this.status(actor,id);
    }
    try{
      await this.review.mutation(actor,{mutationId:crypto.randomUUID()},['feedback-email-dispatch',id],async()=>({statements:[this.kits.cardGuard(actor,report.card_id),
        ...(this.feedback.privacyEnabled?[s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_feedback WHERE id=? AND deleted_at IS NULL AND COALESCE(expires_at,created_at+?)>?)',[id,this.feedback.retentionDays*86400000,this.now()])]:[]),
        s("UPDATE qr_feedback_delivery SET state='started' WHERE feedback_id=? AND state='queued' AND deadline_at>?",[id,this.now()]),this.review.guard()],result:{id}}));
    }catch(error){if(error.status!==409)throw error;return this.status(actor,id);}
    let timer;
    try{
      const result=await Promise.race([Promise.resolve().then(()=>this.transport.send(message)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),this.timeoutMs);})]);
      if(!result||typeof result.messageId!=='string'||!result.messageId.trim()||result.messageId.length>200||/[\x00-\x1f\x7f]/.test(result.messageId))throw Error('unknown result');
      await this.db.atomic([s("UPDATE qr_feedback_delivery SET state='accepted',message_id=?,finished_at=? WHERE feedback_id=? AND state='started' AND deadline_at>?",[result.messageId,this.now(),id,this.now()])]);
    }catch(error){
      const code=noDelivery.has(error?.code)?error.code:'delivery_unknown',state=code==='delivery_unknown'?'uncertain':'rejected';
      await this.db.atomic([s("UPDATE qr_feedback_delivery SET state=?,error_code=?,finished_at=? WHERE feedback_id=? AND state='started'",[state,code,this.now(),id])]);
    }finally{clearTimeout(timer);}
    return this.status(actor,id);
  }
}
