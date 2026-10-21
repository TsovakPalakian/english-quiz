// Version-pinned session contract; not a replacement for the existing exam runner.
import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields,validateReviewContent} from './quiz-review-content.mjs';
import {kitSigned,kitTeacher} from './learning-kits.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const normalize=value=>String(value).normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
const choiceTypes=new Set(['Choice','Reverse','Listen','Definition','Odd one out']);
function questions(type,content){
  if(['Match','Memory'].includes(type)){const right=content.items.map(item=>item.right);return {left:content.items.map(item=>item.left),right:[...right.slice(1),right[0]]};}
  const fields={Flip:['front'],Reverse:['front','options'],Choice:['prompt','options'],Listen:['prompt','options'],Definition:['prompt','options'],Type:['prompt'],Gap:['shown','hint'],Build:['parts'],'True / false':['prompt'],Tap:['text'],'Select all':['prompt','options'],Spell:['hint'],Letters:['hint'],Hangman:['hint'],'Odd one out':['prompt','options']}[type];
  return content.items.map(item=>({...Object.fromEntries(fields.filter(key=>item[key]!==undefined).map(key=>[key,structuredClone(item[key])])),...(type==='Letters'?{letters:[...item.word].sort()}:type==='Hangman'?{length:[...item.word].length}:{})}));
}
function evaluate(type,content,responses,meaning,metadata){
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
  constructor(kits,{authorizeExamRelease=async()=>false}={}){this.kits=kits;this.review=kits.review;this.db=kits.db;this.authorizeExamRelease=authorizeExamRelease;}
  async start(actor,body){
    kitSigned(actor);exactFields(body,['mutationId','cardId','senseId','versionId','mode']);if(!['practice','exam'].includes(body.mode))fail(400,'Invalid session mode.');
    await this.kits.card(actor,body.cardId);
    return this.review.mutation(actor,body,['kit-session'],async()=>{
      const template=(await this.review.sharedForCard(actor,body.cardId)).find(q=>q.id===body.versionId&&q.senseId===body.senseId);if(!template)fail(409,'Choose a current available approved template.');
      const [meaning]=await this.db.read('SELECT en FROM qr_senses WHERE id=?',[body.senseId]),metadata=await this.kits.metadata(body.senseId),content=validateReviewContent(template.type,template.content),id=crypto.randomUUID();
      return {statements:[this.kits.cardGuard(actor,body.cardId),s(`INSERT INTO qr_session_snapshots(id,owner_id,card_id,version_id,type,mode,content_json,metadata_json,state,created_at)
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
    if(visible){const correct=evaluate(row.type,content,JSON.parse(row.responses_json),metadata.meaning,metadata);Object.assign(result,{content,responses:JSON.parse(row.responses_json),correct,correctCount:correct.filter(Boolean).length,total:correct.length});}
    return result;
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
