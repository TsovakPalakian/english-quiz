// Server-owned source selection, saved results and independent non-financial budgets.
import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
import {kitTeacher,validateSenseMetadata} from './learning-kits.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
export function validateDictionaryResult(value){
  exactFields(value,['entries']);if(!Array.isArray(value.entries)||value.entries.length<1||value.entries.length>8)fail(400,'Dictionary result unavailable.');
  return {entries:value.entries.map(entry=>{
    exactFields(entry,['word','partOfSpeech','definition','translation','ipa','forms','examples','source']);
    const metadata=validateSenseMetadata({level:null,forms:entry.forms,examples:entry.examples,source:entry.source});if(!metadata.source)fail(400,'Dictionary provenance and reuse conditions are required.');
    return {word:reviewText(entry.word,200),partOfSpeech:reviewText(entry.partOfSpeech,100),definition:reviewText(entry.definition),translation:reviewText(entry.translation),ipa:entry.ipa===null?null:reviewText(entry.ipa,200),...metadata};
  })};
}
export class QuizLanguageMaterials{
  constructor(kits,media,{providers,worker,voices=[],budgets,now=Date.now}={}){
    this.kits=kits;this.review=kits.review;this.db=kits.db;this.media=media;this.providers=providers;this.worker=worker;this.voices=voices;this.now=now;this.budgets=budgets;
    for(const task of ['tts','dictionary'])if(!Number.isSafeInteger(budgets?.[task]?.day)||budgets[task].day<1||!Number.isSafeInteger(budgets[task].month)||budgets[task].month<budgets[task].day)fail(503,'Explicit daily and monthly material budgets are required.');
  }
  dates(){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yerevan',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(this.now()));return {day,month:day.slice(0,7)};}
  async recover(){await this.db.atomic([s("UPDATE qr_language_usage SET state='failed',result_json=? WHERE state IN ('reserved','started') AND deadline_at<?",[JSON.stringify({error:'Material request was interrupted. No automatic retry was sent.'}),this.now()])]);}
  async status(actor){
    kitTeacher(actor);const {day,month}=this.dates(),settings=await this.providers.inspect(this.worker),tasks=[];
    for(const task of ['dictionary','tts']){
      const choice=settings.selections[task],adapter=settings.adapters.find(row=>row.id===choice?.adapterId),provider=adapter?.provider;
      const [usage]=await this.db.read('SELECT COALESCE(sum(CASE WHEN day=? THEN quantity ELSE 0 END),0) AS dayUsed,COALESCE(sum(quantity),0) AS monthUsed FROM qr_language_usage WHERE task=? AND provider=? AND month=?',[day,task,provider||'',month]);
      tasks.push({task,selection:choice,available:!!choice&&!settings.unavailable.some(row=>row.task===task),provider,unit:task==='tts'?'characters':'requests',...this.budgets[task],...usage});
    }
    return {tasks,voices:this.voices,financialBudgetVerified:false};
  }
  async create(actor,task,body){
    kitTeacher(actor);exactFields(body,['mutationId','groupId','lessonId','cardId','senseId',...(task==='tts'?['voice']:[])]);if(!['dictionary','tts'].includes(task))fail(400,'Invalid material task.');
    await this.review.checkContext(actor,body);
    await this.recover();
    const operation=await this.review.mutation(actor,body,['language-material',task],async()=>{
      const settings=await this.providers.inspect(this.worker),selection=settings.selections[task],adapter=settings.adapters.find(row=>row.id===selection?.adapterId);
      if(!selection||settings.unavailable.some(row=>row.task===task))fail(409,'This material provider is off or unavailable.');
      if(task==='tts'&&!this.voices.some(voice=>voice.id===body.voice&&voice.locale===selection.locale))fail(400,'Select a registered voice for this locale.');
      const [sense]=await this.db.read('SELECT en,part_of_speech,definition,translation FROM qr_senses WHERE id=?',[body.senseId]);
      const request={task,selection,adapter:{provider:adapter.provider,model:adapter.model,version:adapter.version},sense,...(task==='tts'?{voice:body.voice}:{})},cacheKey=JSON.stringify({owner:actor.id,...request});
      const [active]=await this.db.read("SELECT id FROM qr_language_usage WHERE cache_key=? AND state IN ('reserved','started') LIMIT 1",[cacheKey]);
      if(active)return {statements:[],result:{id:active.id}};
      const [cached]=await this.db.read("SELECT id,result_json FROM qr_language_usage WHERE cache_key=? AND state='complete' ORDER BY created_at DESC LIMIT 1",[cacheKey]);
      let validCache=!!cached;if(cached&&task==='tts')validCache=await this.media.available('Listen',{items:[{mediaId:JSON.parse(cached.result_json).media.id}]});
      if(validCache)return {statements:[],result:{id:cached.id}};
      const id=crypto.randomUUID(),{day,month}=this.dates(),quantity=task==='tts'?[...sense.en].length:1,limits=this.budgets[task];
      const [usage]=await this.db.read('SELECT COALESCE(sum(CASE WHEN day=? THEN quantity ELSE 0 END),0) AS dayUsed,COALESCE(sum(quantity),0) AS monthUsed FROM qr_language_usage WHERE task=? AND provider=? AND month=?',[day,task,adapter.provider,month]);
      if(usage.dayUsed+quantity>limits.day||usage.monthUsed+quantity>limits.month)fail(429,'Daily or monthly material limit reached.');
      return {statements:[this.review.accessGuard(actor,body),s(`INSERT INTO mutation_guard SELECT
        COALESCE(sum(CASE WHEN day=? THEN quantity ELSE 0 END),0)+?<=? AND COALESCE(sum(quantity),0)+?<=?
        FROM qr_language_usage WHERE task=? AND provider=? AND month=?`,[day,quantity,limits.day,quantity,limits.month,task,adapter.provider,month]),
        s("INSERT INTO qr_language_usage(id,owner_id,task,provider,unit,quantity,day,month,created_at,deadline_at,state,cache_key,request_json) VALUES(?,?,?,?,?,?,?,?,?,?,'reserved',?,?)",[id,actor.id,task,adapter.provider,task==='tts'?'characters':'requests',quantity,day,month,this.now(),this.now()+120000,cacheKey,JSON.stringify({...request,configurationRevision:settings.revision,context:{groupId:body.groupId,lessonId:body.lessonId,cardId:body.cardId,senseId:body.senseId}})])],result:{id}};
    });
    const [row]=await this.db.read('SELECT * FROM qr_language_usage WHERE id=? AND owner_id=?',[operation.id,actor.id]);
    if(row.state!=='reserved')return this.get(actor,row.id);
    try{await this.review.mutation(actor,{mutationId:crypto.randomUUID()},['language-dispatch',row.id],async()=>({statements:[s("UPDATE qr_language_usage SET state='started' WHERE id=? AND state='reserved'",[row.id]),this.review.guard()],result:{id:row.id}}));}
    catch{return this.get(actor,row.id);}
    const request=JSON.parse(row.request_json);
    try{
      const output=await this.providers.execute(task,{word:request.sense.en,meaning:request.sense,...(task==='tts'?{voice:request.voice}:{})},{expectedConfigurationRevision:request.configurationRevision,timeoutMs:30000});
      let result;
      if(task==='dictionary'){
        result={...validateDictionaryResult(output.data),source:output.source};
        if(result.entries.some(entry=>entry.word.toLowerCase()!==request.sense.en.toLowerCase()))fail(400,'Dictionary returned a different word.');
      }else{
        exactFields(output.data,['bytes','mime','voice']);if(!(output.data.bytes instanceof Uint8Array)||output.data.voice!==request.voice||output.data.mime!=='audio/wav')fail(400,'Invalid speech result.');
        const media=await this.media.upload(actor,{mutationId:crypto.randomUUID(),purpose:'quiz',...request.context,mime:'audio/wav',name:'reference.wav',rights:'Installed local voice; production reuse terms require separate verification.'},output.data.bytes,{kind:'tts',...output.source,voice:request.voice,text:request.sense.en});
        result={media,source:output.source,voice:request.voice,text:request.sense.en,teacherCheckRequired:true};
      }
      await this.db.atomic([s("UPDATE qr_language_usage SET state='complete',result_json=? WHERE id=? AND state='started'",[JSON.stringify(result),row.id])]);
    }catch{await this.db.atomic([s("UPDATE qr_language_usage SET state='failed',result_json=? WHERE id=? AND state='started'",[JSON.stringify({error:'Material preparation failed. Check the selected provider and limits; no fallback was used.'}),row.id])]);}
    return this.get(actor,row.id);
  }
  async get(actor,id){kitTeacher(actor);await this.recover();const [row]=await this.db.read('SELECT id,state,result_json FROM qr_language_usage WHERE id=? AND owner_id=?',[id,actor.id]);if(!row)fail(404,'Material request unavailable.');return {id:row.id,state:row.state,result:row.result_json?JSON.parse(row.result_json):null};}
}
