// Isolated lesson speech pilot. Trusted auth, provider registry and private media are injected.
import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
import {kitSigned,kitTeacher} from './learning-kits.mjs';
import {SPEECH_MODES,SPEECH_METRICS,validateSpeechRubric,validateSpeechOutput,scoreSpeech} from './speech-assessment.mjs';
import {boundedProviderBytes} from './bounded-provider-body.mjs';
import {checkSpeechContext,speechContextGuard,lessonSpeechContext} from './speech-lesson-context.mjs';
import {validateSpeechTaskCriteria,validateSpeechDialogue} from './speech-task-criteria.mjs';
import {speechProgressPeriods} from './speech-progress-periods.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const context=row=>({groupId:row.group_id,lessonId:row.lesson_id,cardId:row.card_id,senseId:row.sense_id,...(JSON.parse(row.value_json).quizSessionId?{speechTaskId:row.id,quizSessionId:JSON.parse(row.value_json).quizSessionId}:{})});
const scripted=mode=>['pronunciation','shadowing'].includes(mode);
export class SpeechPractice{
  constructor(kits,media,{enabled=false,providers,worker,rubrics=[],budgets,resolveActor=async()=>null,now=Date.now,timeoutMs=45000}={}){
    if(typeof enabled!=='boolean'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)fail(503,'Invalid speech configuration.');
    this.kits=kits;this.review=kits.review;this.db=kits.db;this.media=media;this.enabled=enabled;this.providers=providers;this.worker=worker;this.now=now;this.timeoutMs=timeoutMs;this.resolveActor=resolveActor;this.controllers=new Map();this.running=new Set();
    this.deletionStatements=[];this.onDelete=[];
    this.rubrics=rubrics.map(validateSpeechRubric);if(new Set(this.rubrics.map(row=>row.id)).size!==this.rubrics.length)fail(503,'Duplicate speech rubric.');
    for(const kind of ['audio','language'])if(!Number.isSafeInteger(budgets?.[kind]?.day)||budgets[kind].day<1||!Number.isSafeInteger(budgets[kind].month)||budgets[kind].month<budgets[kind].day)fail(503,'Explicit speech budgets are required.');
    this.budgets=structuredClone(budgets);
    media.referenceGuards.push(id=>[s('INSERT INTO mutation_guard SELECT NOT EXISTS(SELECT 1 FROM qr_speech_attempts WHERE media_id=? AND deleted_at IS NULL)',[id]),s("INSERT INTO mutation_guard SELECT NOT EXISTS(SELECT 1 FROM qr_speech_tasks WHERE json_extract(value_json,'$.referenceMediaId')=?)",[id])]);
  }
  gate(actor){kitSigned(actor);if(!this.enabled)fail(503,'Speech practice is off.');}
  dates(){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yerevan',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(this.now()));return {day,month:day.slice(0,7)};}
  checkContext(actor,value){return checkSpeechContext(this.review,actor,value);}
  accessGuard(actor,value){return speechContextGuard(this.review,actor,value);}
  async task(actor,id){this.gate(actor);const [row]=await this.db.read('SELECT * FROM qr_speech_tasks WHERE id=?',[id]);if(!row)fail(404,'Speech task not found.');await this.checkContext(actor,context(row));return {...row,value:JSON.parse(row.value_json)};}
  async createTask(actor,body){
    this.gate(actor);kitTeacher(actor);exactFields(body,['mutationId','groupId','lessonId','cardId','senseId','mode','locale','prompt','reference','referenceMediaId','rubricId','evaluation','languageReview','level','criteria','dialogue']);
    body={...body,cardId:body.cardId??null,senseId:body.senseId??null};await this.checkContext(actor,body);
    if(!SPEECH_MODES.includes(body.mode)||!['en-US','en-GB'].includes(body.locale)||!['pronunciation','stt'].includes(body.evaluation)||typeof body.languageReview!=='boolean'||!this.rubrics.some(row=>row.id===body.rubricId)||![null,'A1','A2','B1','B2','C1','C2'].includes(body.level))fail(400,'Invalid speech task configuration.');
    const reference=body.reference===null?null:reviewText(body.reference,2000),prompt=reviewText(body.prompt,2000),referenceMediaId=body.referenceMediaId;
    if(scripted(body.mode)&&!reference||!scripted(body.mode)&&reference!==null)fail(400,'Only scripted practice uses an exact reading reference.');
    if(body.mode==='shadowing'&&!referenceMediaId)fail(400,'Shadowing requires reference audio.');
    if(lessonSpeechContext(body)&&!scripted(body.mode)&&body.evaluation!=='stt')fail(400,'Open lesson speech requires transcription, not scripted pronunciation assessment.');
    const criteria=lessonSpeechContext(body)||body.criteria!==undefined?validateSpeechTaskCriteria(body.criteria,body.mode):null;
    if(body.dialogue!==undefined&&body.mode!=='dialogue')fail(400,'Dialogue configuration requires dialogue mode.');
    const dialogue=validateSpeechDialogue(body.dialogue);
    const guards=referenceMediaId===null?[]:await this.media.validate(actor,body,'Listen',{items:[{mediaId:referenceMediaId}]});
    const value={mode:body.mode,locale:body.locale,prompt,reference,referenceMediaId,rubric:this.rubrics.find(row=>row.id===body.rubricId),evaluation:body.evaluation,languageReview:body.languageReview,level:body.level,maxSeconds:scripted(body.mode)?30:120,...(criteria?{criteria}:{}),...(dialogue?{dialogue}:{})};
    return this.review.mutation(actor,body,['speech-task'],async()=>{const id=crypto.randomUUID();return {statements:[this.accessGuard(actor,body),...guards,s('INSERT INTO qr_speech_tasks(id,group_id,lesson_id,card_id,sense_id,author_id,created_at,value_json) VALUES(?,?,?,?,?,?,?,?)',[id,body.groupId,body.lessonId,body.cardId,body.senseId,actor.id,this.now(),JSON.stringify(value)])],result:{id}};});
  }
  async listTasks(actor,body){this.gate(actor);exactFields(body,['groupId','lessonId','cardId','senseId']);await this.review.checkContext(actor,body);return this.db.read("SELECT id,value_json FROM qr_speech_tasks WHERE group_id=? AND lesson_id=? AND card_id=? AND sense_id=? AND json_extract(value_json,'$.quizSessionId') IS NULL ORDER BY created_at,id",[body.groupId,body.lessonId,body.cardId,body.senseId]).then(rows=>rows.map(row=>({id:row.id,...JSON.parse(row.value_json)})));}
  async lessonCatalog(actor,body){
    this.gate(actor);exactFields(body,['groupId','lessonId']);await this.checkContext(actor,{...body,cardId:null,senseId:null});
    const staff=['ADMIN','DEVELOPER'].includes(actor.role);
    const rows=await this.db.read(`SELECT DISTINCT c.id AS cardId,cs.sense_id AS senseId,c.en AS word,m.definition,m.part_of_speech AS partOfSpeech
      FROM lesson_blocks b JOIN cards c ON c.id=b.card_id JOIN qr_card_senses cs ON cs.card_id=c.id JOIN qr_senses m ON m.id=cs.sense_id
      WHERE b.lesson_id=? AND b.type IN ('word','wordcard') AND b.deleted_at IS NULL AND c.deleted_at IS NULL AND c.scope='shared' ORDER BY c.id,cs.sense_id`,[body.lessonId]),contexts=[];
    for(const row of rows)try{await this.review.checkContext(actor,{...body,...row});contexts.push(row);}catch(error){if(error.status!==403)throw error;}
    const allowed=new Map(contexts.map(row=>[row.cardId+':'+row.senseId,row])),tasks=[];
    for(const row of await this.db.read('SELECT * FROM qr_speech_tasks WHERE group_id=? AND lesson_id=? ORDER BY created_at,id',[body.groupId,body.lessonId])){
      if(JSON.parse(row.value_json).quizSessionId)continue;
      const origin=allowed.get(row.card_id+':'+row.sense_id);if(row.card_id===null&&row.sense_id===null)tasks.push({id:row.id,...JSON.parse(row.value_json),cardId:null,senseId:null,word:null});else if(origin)tasks.push({id:row.id,...JSON.parse(row.value_json),cardId:origin.cardId,senseId:origin.senseId,word:origin.word});
    }
    return {tasks,contexts:staff?contexts:[]};
  }
  async training(actor,id){
    const row=await this.attempt(actor,id,{owner:true}),result=row.result_json?JSON.parse(row.result_json):null;
    if(row.state!=='complete'||!result?.sufficient||!result.training.length)fail(409,'No reliable practice focus is available for this attempt.');
    const task=await this.task(actor,row.task_id);
    return {attemptId:id,taskId:row.task_id,prompt:task.value.prompt,reference:task.value.reference,referenceMediaId:task.value.referenceMediaId,
      focus:result.training.slice(0,3),synthetic:result.synthetic,provisional:result.provisional};
  }
  async compare(actor,id,repeatId){
    if(typeof repeatId!=='string'||!/^[a-f0-9-]{36}$/.test(repeatId)||repeatId===id)fail(400,'Choose a different completed attempt.');
    const baseline=await this.attempt(actor,id,{owner:true}),repeat=await this.attempt(actor,repeatId,{owner:true});
    if(baseline.state!=='complete'||repeat.state!=='complete'||baseline.task_id!==repeat.task_id||baseline.comparison_key!==repeat.comparison_key)fail(409,'These attempts are not comparable. Use the same task, provider and rubric.');
    const before=JSON.parse(baseline.result_json),after=JSON.parse(repeat.result_json);
    if(!before.sufficient||!after.sufficient)fail(409,'Both recordings need sufficient assessment data.');
    const metrics=Object.fromEntries(['overall',...SPEECH_METRICS].map(key=>{
      const a=key==='overall'?before.overall:before.scores[key],b=key==='overall'?after.overall:after.scores[key];
      return [key,{before:a,after:b,change:a===null||b===null?null:Math.round((b-a)*10)/10}];
    }));
    return {baseline:{id,date:baseline.created_at},repeat:{id:repeatId,date:repeat.created_at},metrics,synthetic:before.synthetic||after.synthetic,provisional:before.provisional||after.provisional};
  }
  async upload(actor,id,body,bytes){
    const row=await this.task(actor,id);exactFields(body,['mutationId','mime','name']);
    return this.media.upload(actor,{...body,groupId:row.group_id,lessonId:row.lesson_id,cardId:row.card_id,senseId:row.sense_id,purpose:'speech'},bytes,{kind:'speech-recording',taskId:id,maxSeconds:row.value.maxSeconds});
  }
  async recover(){
    const at=this.now();await this.db.atomic([s("UPDATE qr_speech_attempts SET state='failed',error_code='interrupted',finished_at=? WHERE state IN ('queued','analyzing') AND deleted_at IS NULL AND deadline_at<=?",[at,at]),s("UPDATE qr_speech_usage SET state='released' WHERE state='reserved' AND attempt_id IN (SELECT id FROM qr_speech_attempts WHERE state IN ('failed','cancelled') OR deleted_at IS NOT NULL)")]);
  }
  async attempt(actor,id,{owner=false,audio=false}={}){
    this.gate(actor);const [row]=await this.db.read('SELECT * FROM qr_speech_attempts WHERE id=? AND deleted_at IS NULL',[id]);if(!row)fail(404,'Speech attempt not found.');
    const task=await this.task(actor,row.task_id);
    if(row.owner_id!==actor.id){
      if(owner||!['ADMIN','DEVELOPER'].includes(actor.role))fail(404,'Speech attempt not found.');
      const [share]=await this.db.read('SELECT include_audio FROM qr_speech_shares WHERE attempt_id=? AND teacher_id=?',[id,actor.id]);
      if(!share||audio&&!share.include_audio||!await this.assigned(actor,task))fail(404,'Speech attempt not found.');
    }
    return row;
  }
  async assigned(actor,task){
    if(task.value?.quizSessionId)return false;
    if(actor.role==='DEVELOPER')return true;
    const [row]=await this.db.read("SELECT 1 FROM catalog_documents d,json_each(d.value_json,'$.teacherIds') t WHERE d.namespace='accounts-group-teachers' AND d.key=? AND t.value=?",[String(task.group_id),actor.id]);return !!row;
  }
  async get(actor,id,{recover=true}={}){
    this.gate(actor);if(recover)await this.recover();const row=await this.attempt(actor,id),[correction]=await this.db.read('SELECT text,created_at,revision FROM qr_speech_corrections WHERE attempt_id=? ORDER BY revision DESC LIMIT 1',[id]);
    const shares=row.owner_id===actor.id?await this.db.read('SELECT teacher_id AS teacherId,include_audio AS includeAudio FROM qr_speech_shares WHERE attempt_id=?',[id]):[];
    const [audioShare]=row.owner_id===actor.id?[]:await this.db.read('SELECT include_audio FROM qr_speech_shares WHERE attempt_id=? AND teacher_id=?',[id,actor.id]);
    return {id,taskId:row.task_id,state:row.state,createdAt:row.created_at,error:row.error_code,result:row.result_json?JSON.parse(row.result_json):null,correction:correction||null,shares,canManage:row.owner_id===actor.id,canHear:row.owner_id===actor.id||!!audioShare?.include_audio};
  }
  async analyze(actor,id,body,{background=false}={}){
    const task=await this.task(actor,id);exactFields(body,['mutationId','mediaId','consent']);if(body.consent!==true)fail(400,'Explicit consent is required before analysis.');
    await this.recover();
    const operation=await this.review.mutation(actor,body,['speech-analysis',id],async()=>{
      const asset=await this.media.row(body.mediaId),descriptor=JSON.parse(asset.descriptor_json),source=JSON.parse(asset.source_json);
      if(asset.owner_id!==actor.id||asset.purpose!=='speech'||source.taskId!==id||descriptor.kind!=='audio')fail(403,'Choose your own recording for this task.');
      if(descriptor.duration>task.value.maxSeconds)fail(400,'The recording is too long for this task.');
      if(descriptor.duration<task.value.rubric.minimumSeconds)fail(400,'Record a longer sample before sending for analysis.');
      const settings=await this.providers.inspect(this.worker),tasks=[task.value.evaluation],plan=[];
      for(const name of tasks){
        const selection=settings.selections[name],adapter=settings.adapters.find(row=>row.id===selection?.adapterId),mode=name==='conversation'?'text':scripted(task.value.mode)?'scripted':'unscripted';
        if(!selection||settings.unavailable.some(row=>row.task===name)||selection.mode!==mode||selection.locale!==task.value.locale)fail(409,'Select a compatible speech provider and locale; no fallback is used.');
        plan.push({task:name,...selection,provider:adapter.provider,model:adapter.model,version:adapter.version,configurationRevision:settings.revision});
      }
      const snapshot={...task.value,plan,duration:descriptor.duration},comparisonKey=JSON.stringify({taskId:id,rubric:task.value.rubric,plan:plan.map(({configurationRevision,...source})=>source)}),attemptId=crypto.randomUUID(),at=this.now(),{day,month}=this.dates();
      const statements=[this.accessGuard(actor,context(task)),s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_media WHERE id=? AND owner_id=? AND purpose='speech' AND deleted_at IS NULL)",[asset.id,actor.id]),s("INSERT INTO qr_speech_attempts(id,task_id,owner_id,media_id,consent_at,created_at,deadline_at,snapshot_json,comparison_key,state) VALUES(?,?,?,?,?,?,?,?,?,'queued')",[attemptId,id,actor.id,asset.id,at,at,at+this.timeoutMs,JSON.stringify(snapshot),comparisonKey])];
      for(const source of plan){
        const kind=source.task==='conversation'?'language':'audio',quantity=kind==='audio'?Math.max(1,Math.ceil(descriptor.duration)):1,limits=this.budgets[kind];
        statements.push(s("INSERT INTO mutation_guard SELECT COALESCE(sum(CASE WHEN day=? THEN quantity ELSE 0 END),0)+?<=? AND COALESCE(sum(quantity),0)+?<=? FROM qr_speech_usage WHERE kind=? AND provider=? AND month=? AND state<>'released'",[day,quantity,limits.day,quantity,limits.month,kind,source.provider,month]),s("INSERT INTO qr_speech_usage(attempt_id,task,provider,kind,quantity,day,month,state) VALUES(?,?,?,?,?,?,?,'reserved')",[attemptId,source.task,source.provider,kind,quantity,day,month]));
      }
      return {statements,result:{id:attemptId}};
    });
    let row=await this.attempt(actor,operation.id,{owner:true});if(row.state!=='queued')return this.get(actor,row.id);
    try{await this.review.mutation(actor,{mutationId:crypto.randomUUID()},['speech-dispatch',row.id],async()=>({statements:[this.accessGuard(actor,context(task)),s("UPDATE qr_speech_attempts SET state='analyzing' WHERE id=? AND state='queued' AND deleted_at IS NULL AND deadline_at>?",[row.id,this.now()]),this.review.guard()],result:{id:row.id}}));}
    catch(error){if(error.status!==409)throw error;return this.get(actor,row.id);}
    const work=this.process(actor,row,task);this.running.add(work);work.then(()=>this.running.delete(work),()=>this.running.delete(work));
    return background?this.get(actor,row.id):work;
  }
  async process(actor,row,task){
    const controller=new AbortController();this.controllers.set(row.id,controller);const timer=setTimeout(()=>controller.abort(),Math.max(1,row.deadline_at-this.now()));
    try{
      const snapshot=JSON.parse(row.snapshot_json),response=await this.media.response(actor,row.media_id,new Request('https://local.invalid/speech')),
        bytes=await boundedProviderBytes(response.body,10*1024*1024,controller.signal),asset=await this.media.row(row.media_id),outputs=[];
      for(const source of snapshot.plan){
        const latest=await this.attempt(actor,row.id,{owner:true});if(latest.state!=='analyzing'||this.now()>=latest.deadline_at||controller.signal.aborted)fail(409,'Speech attempt stopped.');
        // Older queued pilot snapshots may contain an unconfirmed text stage. Never dispatch it.
        if(source.task==='conversation')break;
        await this.review.mutation(actor,{mutationId:crypto.randomUUID()},['speech-provider-dispatch',row.id,source.task],async()=>({statements:[this.accessGuard(actor,context(task)),s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_speech_attempts WHERE id=? AND state='analyzing' AND deleted_at IS NULL AND deadline_at>?)",[row.id,this.now()]),s("UPDATE qr_speech_usage SET state='started' WHERE attempt_id=? AND task=? AND state='reserved'",[row.id,source.task]),this.review.guard()],result:{id:row.id}}));
        const payload=source.task==='conversation'?{kind:'speech-language-review',transcript:outputs[0].data.transcript,prompt:snapshot.prompt,reference:snapshot.reference,level:snapshot.level}:
          {bytes,mime:asset.mime,mode:scripted(snapshot.mode)?'scripted':'unscripted',reference:snapshot.reference,locale:snapshot.locale};
        try{
          const output=await this.providers.execute(source.task,payload,{signal:controller.signal,timeoutMs:Math.max(1,Math.min(this.timeoutMs,row.deadline_at-this.now())),expectedConfigurationRevision:source.configurationRevision});
          if(['task','adapterId','provider','model','version','locale','mode','configurationRevision'].some(key=>output.source[key]!==source[key]))fail(400,'Speech source changed during analysis.');
          outputs.push({task:source.task,data:validateSpeechOutput(output.data,source.task),source:output.source});
        }catch(error){if(source.task!=='conversation'||controller.signal.aborted)throw error;break;}
      }
      const result=scoreSpeech(outputs,snapshot.rubric,{duration:snapshot.duration,synthetic:snapshot.plan.some(source=>source.provider==='local-fixture')});
      result.transcript=outputs[0]?.data.transcript||null;result.sources=outputs.map(output=>output.source);
      result.languageReviewUnavailable=snapshot.languageReview&&!outputs.some(output=>output.task==='conversation');
      await this.db.atomic([s("UPDATE qr_speech_attempts SET state=?,result_json=?,finished_at=? WHERE id=? AND state='analyzing' AND deleted_at IS NULL AND deadline_at>?",[result.sufficient?'complete':'unusable',JSON.stringify(result),this.now(),row.id,this.now()])]);
    }catch{
      await this.db.atomic([s("UPDATE qr_speech_attempts SET state='failed',error_code=?,finished_at=? WHERE id=? AND state='analyzing' AND deleted_at IS NULL",[controller.signal.aborted?'cancelled_or_timeout':'analysis_unavailable',this.now(),row.id])]);
    }finally{clearTimeout(timer);this.controllers.delete(row.id);await this.db.atomic([s("UPDATE qr_speech_usage SET state='released' WHERE attempt_id=? AND state='reserved'",[row.id])]);}
    return this.get(actor,row.id);
  }
  async history(actor,taskId,{before=null,recover=true}={}){
    await this.task(actor,taskId);if(recover)await this.recover();if(before!==null&&(!Array.isArray(before)||before.length!==2||!Number.isSafeInteger(before[0])||before[0]<0||typeof before[1]!=='string'||!/^[a-f0-9-]{36}$/.test(before[1])))fail(400,'Invalid speech history cursor.');
    const rows=await this.db.read(`SELECT id,created_at FROM qr_speech_attempts WHERE task_id=? AND owner_id=? AND deleted_at IS NULL ${before?'AND (created_at<? OR (created_at=? AND id<?))':''} ORDER BY created_at DESC,id DESC LIMIT 51`,[taskId,actor.id,...(before?[before[0],before[0],before[1]]:[])]),page=rows.slice(0,50);
    return {attempts:await Promise.all(page.map(row=>this.get(actor,row.id,{recover:false}))),next:rows.length>50?[page.at(-1).created_at,page.at(-1).id]:null};
  }
  async progress(actor,taskId,{period,from=null,to=null}={}){
    if(period!==undefined&&!['day','week','month'].includes(period)||[from,to].some(value=>value!==null&&(!Number.isSafeInteger(value)||value<0))||from!==null&&to!==null&&from>=to)fail(400,'Invalid progress period.');
    await this.task(actor,taskId);let rows=await this.db.read("SELECT id,comparison_key,result_json,created_at FROM qr_speech_attempts WHERE task_id=? AND owner_id=? AND state='complete' AND deleted_at IS NULL AND (? IS NULL OR created_at>=?) AND (? IS NULL OR created_at<?) ORDER BY created_at,id"+(period?' LIMIT 5001':''),[taskId,actor.id,from,from,to,to]);const truncated=!!period&&rows.length>5000;if(truncated)rows=rows.slice(0,5000);const groups=new Map();
    for(const row of rows){const result=JSON.parse(row.result_json);if(!groups.has(row.comparison_key))groups.set(row.comparison_key,{key:row.comparison_key,synthetic:result.synthetic,provisional:result.provisional,points:[],metrics:{}});const group=groups.get(row.comparison_key);group.points.push({id:row.id,date:row.created_at,overall:result.overall,...result.scores});}
    for(const group of groups.values())for(const metric of ['overall','accuracy','fluency','prosody','grammar','vocabulary','task']){
      const points=group.points.filter(point=>point[metric]!==null),values=points.map(point=>point[metric]);group.metrics[metric]=values.length?{count:values.length,first:values[0],last:values.at(-1),best:values.reduce((a,b)=>Math.max(a,b)),average:Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10}:null;
    }
    const series=[...groups.values()];return {series,...(period?{periods:speechProgressPeriods(series,{period}),truncated,from,to}:{})};
  }
  async correct(actor,id,body){const row=await this.attempt(actor,id,{owner:true});exactFields(body,['mutationId','text']);if(row.state!=='complete'||!row.result_json)fail(409,'Only a completed transcript may be corrected.');const text=reviewText(body.text,6000);
    return this.review.mutation(actor,body,['speech-correction',id],async()=>({statements:[s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_speech_attempts WHERE id=? AND deleted_at IS NULL AND state='complete')",[id]),s('INSERT INTO qr_speech_corrections(id,attempt_id,created_at,text,revision) SELECT ?,?,?,?,COALESCE(max(revision),0)+1 FROM qr_speech_corrections WHERE attempt_id=?',[crypto.randomUUID(),id,this.now(),text,id])],result:{id,scoreUnchanged:true}}));}
  async share(actor,id,body){
    const row=await this.attempt(actor,id,{owner:true}),task=await this.task(actor,row.task_id);exactFields(body,['mutationId','teacherId','includeAudio','consent']);
    if(task.value.quizSessionId)fail(409,'Template practice stays private; choose an assigned lesson task to share an attempt.');
    const target=await this.resolveActor(body.teacherId);if(!target||!['ADMIN','DEVELOPER'].includes(target.role)||target.active===false||target.active===0||target.revoked||!await this.assigned(target,task)||body.consent!==true||typeof body.includeAudio!=='boolean')fail(403,'Select an active assigned teacher and explicitly allow sharing.');
    return this.review.mutation(actor,body,['speech-share',id],async()=>({statements:[s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_speech_attempts WHERE id=? AND deleted_at IS NULL)',[id]),s('INSERT INTO qr_speech_shares(attempt_id,teacher_id,created_at,include_audio) VALUES(?,?,?,?) ON CONFLICT(attempt_id,teacher_id) DO UPDATE SET include_audio=excluded.include_audio,created_at=excluded.created_at',[id,target.id,this.now(),body.includeAudio?1:0])],result:{id,teacherId:target.id}}));
  }
  async revoke(actor,id,body){await this.attempt(actor,id,{owner:true});exactFields(body,['mutationId','teacherId']);return this.review.mutation(actor,body,['speech-revoke',id],async()=>({statements:[s('DELETE FROM qr_speech_shares WHERE attempt_id=? AND teacher_id=?',[id,body.teacherId])],result:{id}}));}
  async recipients(actor,id){const task=await this.task(actor,id);if(task.value.quizSessionId)return [];const rows=await this.db.read("SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers' AND key=?",[String(task.group_id)]),ids=rows.length?JSON.parse(rows[0].value_json).teacherIds:[],result=[];
    for(const teacherId of new Set([...ids,this.worker.id])){const target=await this.resolveActor(teacherId);if(target&&['ADMIN','DEVELOPER'].includes(target.role)&&target.active!==false&&target.active!==0&&!target.revoked)result.push({id:target.id,name:target.name||'Teacher'});}return result;}
  async shared(actor,id,{recover=true}={}){kitTeacher(actor);await this.task(actor,id);const rows=await this.db.read('SELECT a.id FROM qr_speech_attempts a JOIN qr_speech_shares s ON s.attempt_id=a.id WHERE a.task_id=? AND s.teacher_id=? AND a.deleted_at IS NULL ORDER BY a.created_at DESC,a.id DESC LIMIT 50',[id,actor.id]),result=[];
    for(const row of rows)try{result.push(await this.get(actor,row.id,{recover}));}catch(error){if(![403,404].includes(error.status))throw error;}return result;}
  async recording(actor,id,request){const row=await this.attempt(actor,id,{audio:true}),task=await this.task(actor,row.task_id);return this.media.response(actor,row.media_id,request,{session:{owner_id:actor.id,card_id:task.card_id,speechTaskId:task.id,content_json:JSON.stringify({items:[{mediaId:row.media_id}]})},itemIndex:0});}
  async reference(actor,id,request){const task=await this.task(actor,id),mediaId=task.value.referenceMediaId;if(!mediaId)fail(404,'Reference audio is unavailable.');return this.media.response(actor,mediaId,request,{session:{owner_id:actor.id,card_id:task.card_id,speechTaskId:task.id,content_json:JSON.stringify({items:[{mediaId}]})},itemIndex:0});}
  async cancel(actor,id,body){await this.attempt(actor,id,{owner:true});exactFields(body,['mutationId']);const result=await this.review.mutation(actor,body,['speech-cancel',id],async()=>({statements:[s("UPDATE qr_speech_attempts SET state='cancelled',error_code='cancelled',finished_at=? WHERE id=? AND state IN ('queued','analyzing') AND deleted_at IS NULL",[this.now(),id]),this.review.guard(),s("UPDATE qr_speech_usage SET state='released' WHERE attempt_id=? AND state='reserved'",[id])],result:{id,state:'cancelled'}}));this.controllers.get(id)?.abort();return result;}
  async remove(actor,id,body){
    this.gate(actor);exactFields(body,['mutationId']);const [row]=await this.db.read('SELECT * FROM qr_speech_attempts WHERE id=? AND owner_id=?',[id,actor.id]);if(!row)fail(404,'Attempt unavailable.');
    if(!row.deleted_at)await this.review.mutation(actor,body,['speech-delete',id],async()=>({statements:[s('UPDATE qr_speech_attempts SET deleted_at=?,result_json=NULL WHERE id=? AND deleted_at IS NULL',[this.now(),id]),this.review.guard(),s('DELETE FROM qr_speech_corrections WHERE attempt_id=?',[id]),s('DELETE FROM qr_speech_shares WHERE attempt_id=?',[id]),...this.deletionStatements.flatMap(build=>build(id)),s("UPDATE qr_speech_usage SET state='released' WHERE attempt_id=? AND state='reserved'",[id])],result:{id,deleted:true}}));
    this.controllers.get(id)?.abort();this.onDelete.forEach(notify=>notify(id));const asset=await this.media.row(row.media_id,{includeDeleted:true});
    if(!asset.deleted_at)await this.media.remove(actor,row.media_id,{mutationId:crypto.randomUUID()});
    else await this.media.store.delete('quiz-media/'+asset.id+'/'+asset.digest);
    return {id,deleted:true};
  }
  async close(){for(const controller of this.controllers.values())controller.abort();await Promise.allSettled([...this.running]);}
}
