// One private asset path for the isolated quiz and feedback pilots.
import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
import {kitSigned} from './learning-kits.mjs';
import {chatFileMime} from './chat-attachments.mjs';
import {mediaRange,storedMediaResponse} from './learning-media.mjs';
import {boundedProviderBytes} from './bounded-provider-body.mjs';
import {checkSpeechContext,speechContextGuard,lessonSpeechContext} from './speech-lesson-context.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
export const QUIZ_MEDIA_LIMITS=Object.freeze({image:5*1024*1024,audio:10*1024*1024,video:20*1024*1024,uploadsPerDay:20,bytesPerDay:100*1024*1024});
const kinds={'image/png':'image','image/jpeg':'image','audio/wav':'audio','audio/mpeg':'audio','video/mp4':'video'};
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const refs=`SELECT 1 FROM qr_versions q,json_each(q.content_json,'$.items') i WHERE json_extract(i.value,'$.mediaId')=?
 UNION ALL SELECT 1 FROM qr_session_snapshots q,json_each(q.content_json,'$.items') i WHERE json_extract(i.value,'$.mediaId')=?
 UNION ALL SELECT 1 FROM qr_feedback q,json_each(q.attachments_json) i WHERE i.value=?`;
export function privateQuizMediaObject(input,mime,options,head=false){
    let bytes=input,range;
    const header=options?.range?.get('Range');
    if(header){mediaRange(header);const [,a,b]=/^bytes=(\d*)-(\d*)$/.exec(header),start=a?Number(a):Math.max(0,bytes.length-Number(b)),end=a?(b?Math.min(Number(b),bytes.length-1):bytes.length-1):bytes.length-1;range={offset:start,length:Math.max(0,end-start+1)};bytes=bytes.subarray(start,end+1);}
    return {size:input.length,body:head?null:bytes.slice(),range,writeHttpMetadata(headers){headers.set('Content-Type',mime);}};
}
export function memoryQuizMediaStore(){
  const files=new Map();let total=0;
  const object=(key,options,head=false)=>{const entry=files.get(key);return entry?privateQuizMediaObject(entry.bytes,entry.mime,options,head):null;};
  return {kind:'isolated-quiz-memory',async putImmutable(key,bytes,metadata){
    if(files.has(key))return;if(total+bytes.length>256*1024*1024)fail(507,'Local media capacity exhausted.');
    files.set(key,{bytes:bytes.slice(),mime:metadata.mime});total+=bytes.length;
  },async get(key,options){return object(key,options);},async head(key){return object(key,null,true);},async delete(key){const entry=files.get(key);if(entry){total-=entry.bytes.length;files.delete(key);}}};
}
export class QuizMedia{
  constructor(kits,{store,inspect,now=Date.now}={}){
    if(!store||typeof inspect!=='function'||!['putImmutable','get','head','delete'].every(key=>typeof store[key]==='function'))fail(503,'Private validated media storage is required.');
    this.kits=kits;this.review=kits.review;this.db=kits.db;this.store=store;this.inspect=inspect;this.now=now;this.referenceGuards=[];
  }
  async upload(actor,body,bytes,source={kind:'manual'}){
    kitSigned(actor);exactFields(body,['mutationId','purpose','cardId','senseId','groupId','lessonId','mime','name','rights','sourceUrl']);
    if(!['quiz','feedback','speech'].includes(body.purpose)||!Object.hasOwn(kinds,body.mime))fail(415,'Use PNG, JPEG, WAV, MP3 or MP4.');
    if(body.purpose==='speech'&&(source.kind!=='speech-recording'||!validId(source.taskId)||![30,120].includes(source.maxSeconds)||kinds[body.mime]!=='audio'))fail(400,'Upload speech through its lesson task.');
    const name=reviewText(body.name,160);if(/[\x00-\x1f\x7f/\\]/.test(name))fail(400,'Invalid filename.');
    const rights=body.purpose==='quiz'?reviewText(body.rights,500):null;
    let sourceUrl=null;if(body.sourceUrl){try{const url=new URL(body.sourceUrl);if(url.protocol!=='https:'||url.username||url.password||body.sourceUrl.length>1000)throw Error();sourceUrl=url.href;}catch{fail(400,'Use an HTTPS source URL without credentials.');}}
    source={...source,rights,sourceUrl,rightsIndependentlyVerified:false};
    if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>QUIZ_MEDIA_LIMITS[kinds[body.mime]])fail(413,'Media exceeds its file-size limit.');
    if(chatFileMime(bytes,body.mime)!==body.mime)fail(415,'File contents do not match the declared format.');
    const lessonRecording=body.purpose==='speech'&&lessonSpeechContext(body);
    if(lessonRecording){
      const [task]=await this.db.read('SELECT id FROM qr_speech_tasks WHERE id=? AND group_id=? AND lesson_id=? AND card_id IS NULL AND sense_id IS NULL',[source.taskId,body.groupId,body.lessonId]);if(!task)fail(403,'Choose a speech task for this lesson.');
      await checkSpeechContext(this.review,actor,body);
    }else{await this.kits.card(actor,body.cardId);if(body.purpose!=='feedback')await this.review.checkContext(actor,body);}
    const sha256=await digest(bytes),at=this.now();
    return this.review.mutation(actor,{...body,sha256},['media-upload'],async()=>{
      const descriptor=await this.inspect(bytes,body.mime);
      if(descriptor.kind!==kinds[body.mime]||!Number.isFinite(descriptor.duration)||descriptor.duration<0||descriptor.kind!=='image'&&descriptor.duration<=0||descriptor.duration>(body.purpose==='speech'?source.maxSeconds:descriptor.kind==='video'?60:180))fail(415,'Media duration or type could not be verified.');
      if(![descriptor.width,descriptor.height].every(value=>Number.isSafeInteger(value)&&value>=0)||descriptor.kind==='video'&&(!descriptor.width||!descriptor.height||descriptor.width>1920||descriptor.height>1920)||descriptor.kind==='image'&&(!descriptor.width||!descriptor.height||descriptor.width>8192||descriptor.height>8192||descriptor.width*descriptor.height>24000000))fail(415,'Media dimensions could not be verified.');
      const id=crypto.randomUUID(),key='quiz-media/'+id+'/'+sha256;
      const [usage]=await this.db.read('SELECT count(*) AS count,COALESCE(sum(bytes),0) AS bytes FROM qr_media WHERE owner_id=? AND created_at>?',[actor.id,at-86400000]);
      if(usage.count>=QUIZ_MEDIA_LIMITS.uploadsPerDay||usage.bytes+bytes.length>QUIZ_MEDIA_LIMITS.bytesPerDay)fail(429,'Daily media upload limit reached.');
      await this.store.putImmutable(key,bytes,{mime:body.mime});
      return {statements:[...(lessonRecording?[speechContextGuard(this.review,actor,body),s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_speech_tasks WHERE id=? AND group_id=? AND lesson_id=? AND card_id IS NULL AND sense_id IS NULL)',[source.taskId,body.groupId,body.lessonId])]:[this.kits.cardGuard(actor,body.cardId),...(body.purpose!=='feedback'?[this.review.accessGuard(actor,body)]:[])]),
        s('INSERT INTO mutation_guard SELECT count(*)<? AND COALESCE(sum(bytes),0)+?<=? FROM qr_media WHERE owner_id=? AND created_at>?',[QUIZ_MEDIA_LIMITS.uploadsPerDay,bytes.length,QUIZ_MEDIA_LIMITS.bytesPerDay,actor.id,at-86400000]),
        s('INSERT INTO qr_media(id,owner_id,purpose,digest,mime,bytes,name,descriptor_json,source_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[id,actor.id,body.purpose,sha256,body.mime,bytes.length,name,JSON.stringify(descriptor),JSON.stringify(source),at])],
      result:{id,mime:body.mime,name,bytes:bytes.length,descriptor,source}};
    });
  }
  async row(id,{includeDeleted=false}={}){if(!validId(id))fail(404,'Media unavailable.');const [row]=await this.db.read('SELECT * FROM qr_media WHERE id=?'+(includeDeleted?'':' AND deleted_at IS NULL'),[id]);if(!row)fail(404,'Media unavailable.');return row;}
  async list(actor,purpose){kitSigned(actor);if(!['quiz','feedback','speech'].includes(purpose))fail(400,'Invalid media purpose.');return this.db.read('SELECT id,name,mime,bytes,descriptor_json AS descriptor,source_json AS source FROM qr_media WHERE owner_id=? AND purpose=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100',[actor.id,purpose]).then(rows=>rows.map(row=>({...row,descriptor:JSON.parse(row.descriptor),source:JSON.parse(row.source)})));}
  async response(actor,id,request,{session=null,itemIndex=null}={}){
    kitSigned(actor);const row=await this.row(id);
    if(session){
      if(session.owner_id!==actor.id)fail(404,'Media unavailable.');
      if(session.card_id==null){
        if(!validId(session.speechTaskId))fail(404,'Media unavailable.');const [task]=await this.db.read('SELECT group_id,lesson_id FROM qr_speech_tasks WHERE id=? AND card_id IS NULL AND sense_id IS NULL',[session.speechTaskId]);if(!task)fail(404,'Media unavailable.');await checkSpeechContext(this.review,actor,{groupId:task.group_id,lessonId:task.lesson_id,cardId:null,senseId:null});
      }else await this.kits.card(actor,session.card_id);
      if(JSON.parse(session.content_json).items[itemIndex]?.mediaId!==id)fail(404,'Media unavailable.');
    }else if(row.owner_id!==actor.id){
      if(!['ADMIN','DEVELOPER'].includes(actor.role)||row.purpose!=='quiz')fail(404,'Media unavailable.');
      const versions=await this.db.read("SELECT q.id FROM qr_versions q,json_each(q.content_json,'$.items') i WHERE json_extract(i.value,'$.mediaId')=? LIMIT 1",[id]);
      if(!versions.length)fail(404,'Media unavailable.');await this.review.access(actor,await this.review.version(versions[0].id));
    }
    const key='quiz-media/'+id+'/'+row.digest,object=await this.store.get(key);if(!object||object.size!==row.bytes)fail(503,'Media integrity check failed.');
    const bytes=await boundedProviderBytes(object.body,row.bytes),headers=new Headers();object.writeHttpMetadata(headers);
    if(bytes.length!==row.bytes||await digest(bytes)!==row.digest||headers.get('Content-Type')!==row.mime)fail(503,'Media integrity check failed.');
    // Serve the same verified snapshot; never fetch a second, potentially different range object.
    return storedMediaResponse({head:async()=>privateQuizMediaObject(bytes,row.mime,null,true),get:async(key,options)=>privateQuizMediaObject(bytes,row.mime,options)},key,request);
  }
  async remove(actor,id,body){
    kitSigned(actor);exactFields(body,['mutationId']);const row=await this.row(id,{includeDeleted:true});if(row.owner_id!==actor.id)fail(403,'Only the uploader may remove unused media.');
    const result=await this.review.mutation(actor,body,['media-delete',id],async()=>({statements:[s('INSERT INTO mutation_guard SELECT NOT EXISTS('+refs+')',[id,id,id]),...this.referenceGuards.flatMap(guard=>guard(id)),s('UPDATE qr_media SET deleted_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL',[this.now(),id,actor.id]),this.review.guard()],result:{id,deleted:true}}));
    await this.store.delete('quiz-media/'+id+'/'+row.digest);return result;
  }
  async available(type,content){
    if(type!=='Video choice'&&!(type==='Listen'&&content.items.some(item=>item.mediaId)))return type!=='Listen';
    for(const item of content.items){
      if(!item.mediaId)return false;
      try{const asset=await this.row(item.mediaId),object=await this.store.head('quiz-media/'+asset.id+'/'+asset.digest);if(asset.purpose!=='quiz'||!object||object.size!==asset.bytes||JSON.parse(asset.descriptor_json).kind!==(type==='Listen'?'audio':'video'))return false;}catch{return false;}
    }
    return true;
  }
  snapshotGuards(content){return content.items.filter(item=>item.mediaId).map(item=>s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_media WHERE id=? AND deleted_at IS NULL)',[item.mediaId]));}
  async summaries(content){
    const result=[];for(const id of new Set(content.items.map(item=>item.mediaId).filter(Boolean))){const row=await this.row(id);result.push({mime:row.mime,name:row.name,descriptor:JSON.parse(row.descriptor_json),source:JSON.parse(row.source_json)});}return result;
  }
  async validate(actor,context,type,content){
    if(type!=='Video choice'&&type!=='Listen')return [];
    const statements=[];
    for(const item of content.items){
      if(!item.mediaId){if(type==='Video choice')fail(400,'Choose a verified video.');continue;}
      const row=await this.row(item.mediaId);
      if(row.purpose!=='quiz'||JSON.parse(row.descriptor_json).kind!==(type==='Listen'?'audio':'video'))fail(415,'The asset does not match this quiz type.');
      const shared=await this.db.read("SELECT q.id FROM qr_versions q,json_each(q.content_json,'$.items') i WHERE q.sense_id=? AND json_extract(i.value,'$.mediaId')=? LIMIT 1",[context.senseId,row.id]);
      if(row.owner_id!==actor.id&&(!['ADMIN','DEVELOPER'].includes(actor.role)||!shared.length))fail(403,'Choose your own upload or media already bound to this meaning.');
      if(row.owner_id!==actor.id)statements.push(s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_versions q,json_each(q.content_json,'$.items') i WHERE q.sense_id=? AND json_extract(i.value,'$.mediaId')=?)",[context.senseId,row.id]));
      statements.push(s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_media WHERE id=? AND deleted_at IS NULL AND digest=?)',[row.id,row.digest]));
    }
    return statements;
  }
}
