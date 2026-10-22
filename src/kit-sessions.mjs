// Version-pinned session contract; not a replacement for the existing exam runner.
import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields} from './quiz-review-content.mjs';
import {kitSigned,kitTeacher} from './learning-kits.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const normalize=value=>String(value).normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
const choiceTypes=new Set(['Choice','Reverse','Listen','Definition','Odd one out','Video choice']);
function questions(type,content){
  if(type==='Pronunciation')return content.items.map(({prompt,reference,locale,rubric})=>({prompt,reference,locale,rubric:structuredClone(rubric)}));
  if(['Match','Memory'].includes(type)){const right=content.items.map(item=>item.right);return {left:content.items.map(item=>item.left),right:[...right.slice(1),right[0]]};}
  const fields={Flip:['front'],Reverse:['front','options'],Choice:['prompt','options'],Listen:['prompt','options'],Definition:['prompt','options'],Type:['prompt'],Gap:['shown','hint'],Build:['parts'],'True / false':['prompt'],Tap:['text'],'Select all':['prompt','options'],Spell:['hint'],Letters:['hint'],Hangman:['hint'],'Odd one out':['prompt','options'],'Video choice':['prompt','options']}[type];
  return content.items.map(item=>({...Object.fromEntries(fields.filter(key=>item[key]!==undefined).map(key=>[key,structuredClone(item[key])])),...(type==='Letters'?{letters:[...item.word].sort()}:type==='Hangman'?{length:[...item.word].length}:{})}));
}
function evaluate(type,content,responses,meaning,metadata){
  if(type==='Pronunciation')fail(400,'Use private speech assessment, not text answers.');
  if(!Array.isArray(responses)||responses.length!==content.items.length)fail(400,'Answer every item exactly once.');
  if(['Match','Memory'].includes(type)){
    const size=content.items.length;if(new Set(responses).size!==size||responses.some(value=>!Number.isSafeInteger(value)||value<0||value>=size))fail(400,'Send a distinct right-side index for each pair.');
    return responses.map((value,index)=>value===(index+size-1)%size);
  }
  return content.items.map((item,index)=>{
    const response=responses[index];
    if(choiceTypes.has(type)){if(!Number.isSafeInteger(response)||response<0||response>=item.options.length)fail(400,'Invalid answer index.');return response===item.answer;}
    if(type==='Select all'){
      if(!Array.isArray(response)||new Set(response).size!==response.length||response.some(value=>!Number.isSafeInteger(value)||value<0||value>=item.options.length))fail(400,'Invalid selected indices.');
      return response.length===item.answers.length&&response.every(value=>item.answers.includes(value));
    }
    if(typeof response!=='string'||response.length>4000)fail(400,'Send a text answer.');
    const answer=type==='Flip'?item.back:['Spell','Letters','Hangman'].includes(type)?item.word:item.answer;
    const accepted=[answer,...(normalize(answer)===normalize(meaning)?metadata.forms:[])];
    return accepted.some(value=>normalize(value)===normalize(response));
  });
}
export class KitSessions{
  constructor(kits,{authorizeExamRelease=async()=>false,speech=null}={}){this.kits=kits;this.review=kits.review;this.db=kits.db;this.authorizeExamRelease=authorizeExamRelease;this.speech=speech;}
  async start(actor,body){
    kitSigned(actor);exactFields(body,['mutationId','cardId','senseId','versionId','mode']);if(!['practice','exam'].includes(body.mode))fail(400,'Invalid session mode.');
    await this.kits.card(actor,body.cardId);
    return this.review.mutation(actor,body,['kit-session'],async()=>{
      const template=(await this.review.sharedForCard(actor,body.cardId)).find(q=>q.id===body.versionId&&q.senseId===body.senseId);if(!template)fail(409,'Choose a current available approved template.');
      if(template.type==='Pronunciation'&&(!this.speech?.enabled||body.mode!=='practice'))fail(409,'Pronunciation requires enabled private speech practice; exam grading is not available.');
      const [meaning]=await this.db.read('SELECT en FROM qr_senses WHERE id=?',[body.senseId]),metadata=await this.kits.metadata(body.senseId),raw=await this.review.version(template.id),content=this.review.validateContent(template.type,JSON.parse(raw.content_json)),id=crypto.randomUUID();
      return {statements:[this.kits.cardGuard(actor,body.cardId),...(this.review.mediaQuizzes?this.review.contentPolicy.snapshotGuards(content):[]),s(`INSERT INTO qr_session_snapshots(id,owner_id,card_id,version_id,type,mode,content_json,metadata_json,state,created_at)
        SELECT ?,?,?,?,?,?,?,?,'open',? WHERE EXISTS(SELECT 1 FROM qr_versions q JOIN qr_card_senses cs ON cs.sense_id=q.sense_id
          WHERE q.id=? AND cs.card_id=? AND q.state='approved' AND NOT EXISTS(SELECT 1 FROM qr_publication p WHERE p.version_id=q.id AND p.available=0)
          AND NOT EXISTS(SELECT 1 FROM qr_versions newer WHERE newer.family_id=q.family_id AND newer.state='approved' AND newer.version>q.version))`,
        [id,actor.id,body.cardId,template.id,template.type,body.mode,JSON.stringify(content),JSON.stringify({meaning:meaning.en,...metadata}),Date.now(),template.id,body.cardId]),this.review.guard()],result:{id}};
    });
  }
  async row(actor,id){kitSigned(actor);const [row]=await this.db.read('SELECT * FROM qr_session_snapshots WHERE id=? AND owner_id=?',[id,actor.id]);if(!row)fail(404,'Session not found.');await this.kits.card(actor,row.card_id);return row;}
  async get(actor,id){
    const row=await this.row(actor,id),content=JSON.parse(row.content_json),metadata=JSON.parse(row.metadata_json),visible=row.state==='released'||row.mode==='practice'&&row.state==='submitted';
    const result={id:row.id,versionId:row.version_id,type:row.type,mode:row.mode,state:row.state,revision:row.revision,questions:questions(row.type,content)};
    if(Array.isArray(result.questions))result.questions.forEach((item,index)=>{if(content.items[index].mediaId)item.mediaUrl='/local/kit-sessions/'+row.id+'/media/'+index;});
    if(visible){const correct=evaluate(row.type,content,JSON.parse(row.responses_json),metadata.meaning,metadata);Object.assign(result,{content,responses:JSON.parse(row.responses_json),correct,correctCount:correct.filter(Boolean).length,total:correct.length});}
    return result;
  }
  async pronunciation(actor,id,body){
    exactFields(body,['mutationId','itemIndex']);
    const row=await this.row(actor,id);
    if(!this.speech?.enabled||row.type!=='Pronunciation'||row.mode!=='practice'||row.state!=='open')fail(409,'Choose an open pronunciation practice session.');
    const content=this.review.validateContent(row.type,JSON.parse(row.content_json)),item=content.items[body.itemIndex];
    if(!Number.isSafeInteger(body.itemIndex)||body.itemIndex<0||!item)fail(400,'Choose a pronunciation item.');
    this.speech.gate(actor);
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('pronunciation:'+id+':'+body.itemIndex)));
    digest[6]=(digest[6]&15)|128;digest[8]=(digest[8]&63)|128;
    const hex=[...digest.slice(0,16)].map(byte=>byte.toString(16).padStart(2,'0')).join(''),taskId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
    const original=await this.review.version(row.version_id),value={mode:'pronunciation',locale:item.locale,prompt:item.prompt,reference:item.reference,referenceMediaId:item.mediaId||null,rubric:item.rubric,evaluation:'pronunciation',languageReview:false,level:null,maxSeconds:30,quizSessionId:id,quizVersionId:row.version_id,quizItemIndex:body.itemIndex};
    return this.review.mutation(actor,body,['pronunciation-session',id,body.itemIndex],async()=>({statements:[this.kits.cardGuard(actor,row.card_id),
      s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_session_snapshots WHERE id=? AND owner_id=? AND type='Pronunciation' AND mode='practice' AND state='open' AND content_json=?)",[id,actor.id,row.content_json]),
      ...(this.review.contentPolicy?this.review.contentPolicy.snapshotGuards({items:[item]}):[]),
      s('INSERT OR IGNORE INTO qr_speech_tasks(id,group_id,lesson_id,card_id,sense_id,author_id,created_at,value_json) VALUES(?,?,?,?,?,?,?,?)',[taskId,original.group_id,original.lesson_id,row.card_id,original.sense_id,actor.id,this.speech.now(),JSON.stringify(value)]),
      s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_speech_tasks WHERE id=? AND value_json=?)',[taskId,JSON.stringify(value)])],result:{id:taskId,sessionId:id,itemIndex:body.itemIndex}}));
  }
  async media(actor,id,index,request){
    const row=await this.row(actor,id),items=JSON.parse(row.content_json).items;
    if(!Number.isSafeInteger(index)||index<0||index>=items.length||!items[index].mediaId||!this.review.contentPolicy)fail(404,'Session media unavailable.');
    return this.review.contentPolicy.response(actor,items[index].mediaId,request,{session:row,itemIndex:index});
  }
  async submit(actor,id,body){
    kitSigned(actor);exactFields(body,['mutationId','expectedRevision','responses']);
    return this.review.mutation(actor,body,['kit-session-answer',id],async()=>{
      const row=await this.row(actor,id);if(row.state!=='open'||row.revision!==body.expectedRevision)fail(409,'This session is already submitted or changed.');
      const metadata=JSON.parse(row.metadata_json);evaluate(row.type,JSON.parse(row.content_json),body.responses,metadata.meaning,metadata);
      return {statements:[this.kits.cardGuard(actor,row.card_id),s("UPDATE qr_session_snapshots SET state='submitted',responses_json=?,revision=revision+1 WHERE id=? AND owner_id=? AND revision=? AND state='open'",[JSON.stringify(body.responses),id,actor.id,body.expectedRevision]),this.review.guard()],result:{id,state:'submitted',revision:body.expectedRevision+1}};
    });
  }
  async release(actor,id,body){
    kitTeacher(actor);exactFields(body,['mutationId','expectedRevision']);
    const [row]=await this.db.read('SELECT * FROM qr_session_snapshots WHERE id=?',[id]);if(!row||row.mode!=='exam'||await this.authorizeExamRelease(actor,structuredClone(row))!==true)fail(403,'Exam release is not authorized.');
    return this.review.mutation(actor,body,['kit-session-release',id],async()=>({statements:[s("UPDATE qr_session_snapshots SET state='released',revision=revision+1 WHERE id=? AND revision=? AND state='submitted' AND mode='exam'",[id,body.expectedRevision]),this.review.guard()],result:{id,state:'released',revision:body.expectedRevision+1}}));
  }
}
