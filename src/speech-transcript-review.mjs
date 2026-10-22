// A separately consented language assessment. Never rewrites acoustic grades or progress.
import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields} from './quiz-review-content.mjs';
import {validateSpeechRubric,validateSpeechOutput,scoreSpeech} from './speech-assessment.mjs';
import {speechProgressPeriods} from './speech-progress-periods.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
export class SpeechTranscriptReview{
  constructor(speech,{enabled=false,rubric,now=Date.now,timeoutMs=30000}={}){
    if(typeof enabled!=='boolean'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)fail(503,'Invalid transcript review configuration.');
    this.speech=speech;this.db=speech.db;this.review=speech.review;this.rubric=validateSpeechRubric(rubric);this.enabled=enabled;this.now=now;this.timeoutMs=timeoutMs;this.controllers=new Map();this.running=new Set();
    if(Object.keys(this.rubric.weights).some(key=>!['grammar','vocabulary','task'].includes(key)))fail(503,'Language review needs its own language-only rubric.');
    speech.deletionStatements.push(id=>[s("UPDATE qr_speech_text_reviews SET deleted_at=?,transcript='',result_json=NULL WHERE attempt_id=? AND deleted_at IS NULL",[this.now(),id])]);
    speech.onDelete.push(id=>{for(const entry of this.controllers.values())if(entry.attemptId===id)entry.controller.abort();});
  }
  gate(actor){this.speech.gate(actor);if(!this.enabled)fail(503,'Confirmed transcript review is off.');}
  async recover(){
    const at=this.now();await this.db.atomic([s("UPDATE qr_speech_text_reviews SET state='failed',error_code='interrupted',finished_at=? WHERE state IN ('reserved','started') AND deleted_at IS NULL AND deadline_at<=?",[at,at]),s("UPDATE qr_speech_usage SET state='released' WHERE state='reserved' AND task IN (SELECT 'text-review:'||id FROM qr_speech_text_reviews WHERE state IN ('failed','cancelled') OR deleted_at IS NOT NULL)")]);
  }
  async row(actor,id,{owner=false}={}){this.gate(actor);const [row]=await this.db.read('SELECT * FROM qr_speech_text_reviews WHERE id=? AND deleted_at IS NULL',[id]);if(!row)fail(404,'Transcript review unavailable.');await this.speech.attempt(actor,row.attempt_id,{owner});return row;}
  dto(row){return {id:row.id,attemptId:row.attempt_id,transcriptRevision:row.transcript_revision,transcript:row.transcript,state:row.state,createdAt:row.created_at,source:JSON.parse(row.source_json),result:row.result_json?JSON.parse(row.result_json):null,error:row.error_code,basedOnEditedTranscript:row.transcript_revision>0};}
  async get(actor,id){return this.dto(await this.row(actor,id));}
  async history(actor,id){this.gate(actor);await this.speech.attempt(actor,id);const rows=await this.db.read('SELECT * FROM qr_speech_text_reviews WHERE attempt_id=? AND deleted_at IS NULL ORDER BY sequence DESC LIMIT 50',[id]);return {reviews:rows.map(row=>this.dto(row)),limit:50};}
  async progress(actor,taskId,{period='week',from=null,to=null}={}){
    this.gate(actor);await this.speech.task(actor,taskId);
    if(!['day','week','month'].includes(period)||[from,to].some(value=>value!==null&&(!Number.isSafeInteger(value)||value<0))||from!==null&&to!==null&&from>=to)fail(400,'Invalid progress period.');
    const rows=await this.db.read("SELECT r.* FROM qr_speech_text_reviews r JOIN qr_speech_attempts a ON a.id=r.attempt_id WHERE a.task_id=? AND r.owner_id=? AND a.deleted_at IS NULL AND r.deleted_at IS NULL AND r.state='complete' AND (? IS NULL OR r.created_at>=?) AND (? IS NULL OR r.created_at<?) ORDER BY r.created_at,r.id LIMIT 5001",[taskId,actor.id,from,from,to,to]),groups=new Map();
    for(const row of rows.slice(0,5000)){
      const result=JSON.parse(row.result_json);if(!result?.sufficient)continue;
      const {configurationRevision,...source}=JSON.parse(row.source_json),key=JSON.stringify({source,rubric:JSON.parse(row.rubric_json),edited:row.transcript_revision>0});
      if(!groups.has(key))groups.set(key,{key,synthetic:result.synthetic,provisional:result.provisional,editedTranscript:row.transcript_revision>0,points:[]});
      groups.get(key).points.push({id:row.id,date:row.created_at,overall:result.overall,...result.scores});
    }
    const series=[...groups.values()];return {series,periods:speechProgressPeriods(series,{period}),truncated:rows.length>5000,basis:'confirmed_transcript_not_acoustic_speech',from,to};
  }
  async confirm(actor,id,body,{background=false}={}){
    this.gate(actor);const attempt=await this.speech.attempt(actor,id,{owner:true});exactFields(body,['mutationId','transcriptRevision','consent','retryOf']);
    if(body.consent!==true||!Number.isSafeInteger(body.transcriptRevision)||body.transcriptRevision<0)fail(400,'Confirm the displayed transcript revision before language review.');
    if(attempt.state!=='complete'||!attempt.result_json)fail(409,'A completed speech result is required.');
    await this.recover();
    const operation=await this.review.mutation(actor,body,['confirmed-speech-text',id],async()=>{
      const [correction]=await this.db.read('SELECT revision,text FROM qr_speech_corrections WHERE attempt_id=? ORDER BY revision DESC LIMIT 1',[id]),transcript=correction?.text||JSON.parse(attempt.result_json).transcript;
      if(!transcript||body.transcriptRevision!==(correction?.revision||0))fail(409,'The transcript changed. Read and confirm the latest revision.');
      const snapshot=JSON.parse(attempt.snapshot_json),settings=await this.speech.providers.inspect(this.speech.worker),choice=settings.selections.conversation,adapter=settings.adapters.find(row=>row.id===choice?.adapterId);
      if(!choice||settings.unavailable.some(row=>row.task==='conversation')||choice.mode!=='text'||choice.locale!==snapshot.locale)fail(409,'Select a compatible language reviewer.');
      const source={task:'conversation',...choice,provider:adapter.provider,model:adapter.model,version:adapter.version,configurationRevision:settings.revision},sourceJSON=JSON.stringify(source),rubricJSON=JSON.stringify(this.rubric);
      const [cached]=await this.db.read("SELECT id FROM qr_speech_text_reviews WHERE attempt_id=? AND transcript_revision=? AND deleted_at IS NULL AND (state IN ('reserved','started') OR (state='complete' AND source_json=? AND rubric_json=?)) ORDER BY created_at DESC,id DESC LIMIT 1",[id,body.transcriptRevision,sourceJSON,rubricJSON]);
      if(cached)return {statements:[],result:{id:cached.id}};
      const previous=await this.db.read('SELECT id FROM qr_speech_text_reviews WHERE attempt_id=? AND transcript_revision=? AND deleted_at IS NULL ORDER BY sequence DESC',[id,body.transcriptRevision]);
      if(previous.length>=3)fail(409,'This transcript has reached its review attempt limit.');
      if(body.retryOf!==undefined&&body.retryOf!==null&&body.retryOf!==previous[0]?.id||previous.length&&body.retryOf!==previous[0].id)fail(409,'Explicitly retry the latest review or confirm a new transcript revision.');
      const reviewId=crypto.randomUUID(),at=this.now(),{day,month}=this.speech.dates(),limits=this.speech.budgets.language,task=await this.speech.task(actor,attempt.task_id);
      const [{sequence}]=await this.db.read('SELECT COALESCE(max(sequence),0)+1 AS sequence FROM qr_speech_text_reviews WHERE attempt_id=?',[id]);
      return {statements:[this.speech.accessGuard(actor,{groupId:task.group_id,lessonId:task.lesson_id,cardId:task.card_id,senseId:task.sense_id,...(task.value.quizSessionId?{speechTaskId:task.id,quizSessionId:task.value.quizSessionId}:{})}),
        s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_speech_attempts WHERE id=? AND owner_id=? AND state='complete' AND deleted_at IS NULL)",[id,actor.id]),s('INSERT INTO mutation_guard SELECT COALESCE(max(revision),0)=? FROM qr_speech_corrections WHERE attempt_id=?',[body.transcriptRevision,id]),
        s("INSERT INTO mutation_guard SELECT COALESCE(sum(CASE WHEN day=? THEN quantity ELSE 0 END),0)+1<=? AND COALESCE(sum(quantity),0)+1<=? FROM qr_speech_usage WHERE kind='language' AND provider=? AND month=? AND state<>'released'",[day,limits.day,limits.month,source.provider,month]),
        s("INSERT INTO qr_speech_text_reviews(id,attempt_id,owner_id,transcript_revision,transcript,consent_at,source_json,rubric_json,sequence,created_at,deadline_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,'reserved')",[reviewId,id,actor.id,body.transcriptRevision,transcript,at,sourceJSON,rubricJSON,sequence,at,at+this.timeoutMs]),
        s("INSERT INTO qr_speech_usage(attempt_id,task,provider,kind,quantity,day,month,state) VALUES(?,?,?,'language',1,?,?,'reserved')",[id,'text-review:'+reviewId,source.provider,day,month])],result:{id:reviewId}};
    });
    const row=await this.row(actor,operation.id,{owner:true});if(row.state!=='reserved')return this.dto(row);
    try{await this.review.mutation(actor,{mutationId:crypto.randomUUID()},['speech-text-dispatch',row.id],async()=>({statements:[s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_speech_attempts WHERE id=? AND deleted_at IS NULL)",[row.attempt_id]),s("UPDATE qr_speech_text_reviews SET state='started' WHERE id=? AND state='reserved' AND deleted_at IS NULL AND deadline_at>?",[row.id,this.now()]),this.review.guard(),s("UPDATE qr_speech_usage SET state='started' WHERE task=? AND state='reserved'",['text-review:'+row.id]),this.review.guard()],result:{id:row.id}}));}
    catch(error){if(error.status!==409)throw error;return this.get(actor,row.id);}
    const work=this.process(actor,row,JSON.parse(attempt.snapshot_json));this.running.add(work);work.then(()=>this.running.delete(work),()=>this.running.delete(work));return background?this.get(actor,row.id):work;
  }
  async process(actor,row,snapshot){
    const controller=new AbortController();this.controllers.set(row.id,{attemptId:row.attempt_id,controller});const timer=setTimeout(()=>controller.abort(),Math.max(1,row.deadline_at-this.now()));
    try{
      await this.speech.attempt(actor,row.attempt_id,{owner:true});const source=JSON.parse(row.source_json);
      const output=await this.speech.providers.execute('conversation',{kind:'speech-language-review',transcript:row.transcript,prompt:snapshot.prompt,reference:snapshot.reference,level:snapshot.level,...(snapshot.criteria?{criteria:snapshot.criteria}:{})},{signal:controller.signal,timeoutMs:Math.max(1,row.deadline_at-this.now()),expectedConfigurationRevision:source.configurationRevision});
      if(Object.keys(source).some(key=>output.source[key]!==source[key]))fail(400,'Language reviewer changed.');
      if(output.data.transcript!==null&&output.data.transcript!==row.transcript)fail(400,'The reviewed transcript does not match.');
      const data=validateSpeechOutput({...output.data,transcript:row.transcript},'conversation'),result=scoreSpeech([{task:'conversation',data,source:output.source}],JSON.parse(row.rubric_json),{duration:snapshot.duration,synthetic:source.provider==='local-fixture'});
      result.basis='confirmed_transcript_not_acoustic_speech';
      if(snapshot.criteria){result.criteria=structuredClone(snapshot.criteria);result.criteriaAssessment='not_verified';}
      await this.db.atomic([s("UPDATE qr_speech_text_reviews SET state='complete',result_json=?,finished_at=? WHERE id=? AND state='started' AND deleted_at IS NULL AND deadline_at>?",[JSON.stringify(result),this.now(),row.id,this.now()])]);
    }catch{await this.db.atomic([s("UPDATE qr_speech_text_reviews SET state='failed',error_code=?,finished_at=? WHERE id=? AND state='started' AND deleted_at IS NULL",[controller.signal.aborted?'cancelled_or_timeout':'language_review_failed',this.now(),row.id])]);}
    finally{clearTimeout(timer);this.controllers.delete(row.id);}
    return this.get(actor,row.id);
  }
  async cancel(actor,id,body){const row=await this.row(actor,id,{owner:true});exactFields(body,['mutationId']);const result=await this.review.mutation(actor,body,['cancel-speech-text',id],async()=>({statements:[s("UPDATE qr_speech_text_reviews SET state='cancelled',error_code='cancelled',finished_at=? WHERE id=? AND state IN ('reserved','started') AND deleted_at IS NULL",[this.now(),id]),this.review.guard(),s("UPDATE qr_speech_usage SET state='released' WHERE task=? AND state='reserved'",['text-review:'+id])],result:{id:row.id,state:'cancelled'}}));this.controllers.get(id)?.controller.abort();return result;}
  async close(){for(const entry of this.controllers.values())entry.controller.abort();await Promise.allSettled([...this.running]);}
}
