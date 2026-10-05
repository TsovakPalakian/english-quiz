// Local staging media references only; never uploads to production R2.
import {StudyService,StudyError,statement as s} from './turso-study.mjs';
import {audioMetadata,AUDIO_LIMIT} from './turso-song-media.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export async function lessonMediaMetadata(bytes,mime,name){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>AUDIO_LIMIT)fail(413,'File must be between 1 byte and 10 MiB.');
  if(typeof name!=='string'||!name.trim()||name.length>200||/[\x00-\x1f\x7f/\\]/.test(name))fail(400,'Invalid filename.');
  if(['audio/wav','audio/mpeg','audio/ogg'].includes(mime))return audioMetadata(bytes,mime,name);
  const ascii=(offset,size)=>String.fromCharCode(...bytes.slice(offset,offset+size));
  const valid=mime==='application/pdf'&&/^%PDF-(1\.[0-7]|2\.0)/.test(ascii(0,8))
    ||mime==='image/png'&&bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)&&ascii(12,4)==='IHDR'
    ||mime==='image/jpeg'&&bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255
    ||mime==='image/gif'&&bytes.length>=13&&['GIF87a','GIF89a'].includes(ascii(0,6))
    ||mime==='image/webp'&&bytes.length>=16&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP';
  if(!valid)fail(415,'Use PDF, PNG, JPEG, GIF, WEBP, MP3, WAV or OGG matching its content type.');
  return {sha256:await hash(bytes),mime,bytes:bytes.length,name:name.trim()};
}
export class LessonMediaService extends StudyService {
  constructor(db,store){super(db);this.store=store;}
  async detach(actor,lessonId,blockId,body){
    if(!id(lessonId)||!id(blockId)||!body||Object.keys(body).some(k=>!['mutationId','expectedRevision','expectedBlockRevision'].includes(k))
      ||![body.expectedRevision,body.expectedBlockRevision].every(v=>Number.isSafeInteger(v)&&v>0))fail(400,'A saved lesson and block revision are required.');
    return this.mutate(actor,body,['detach-lesson-file',lessonId,blockId],async()=>{
      const [row]=await this.db.read(`SELECT b.*,l.revision lesson_revision FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id
        WHERE l.id=? AND b.id=? AND l.deleted_at IS NULL AND b.deleted_at IS NULL`,[lessonId,blockId]);
      if(!row)fail(404,'Saved lesson block not found.');
      if(!['image','audio','pronunciation','pdf','file'].includes(row.type))fail(415,'This block has no supported attachment.');
      if(row.lesson_revision!==body.expectedRevision||row.revision!==body.expectedBlockRevision)fail(409,'Lesson or block changed. Reload before removing its file.');
      const content=JSON.parse(row.content_json),detached={};
      for(const key of ['fileId','localMediaKey','name','size','hasFile','sample','fileType']){if(Object.hasOwn(content,key))detached[key]=content[key];delete content[key];}
      Object.assign(content,{name:'',size:'',sample:false,hasFile:false,fileType:''});
      return {statements:[s('UPDATE lessons SET revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=? AND deleted_at IS NULL',[lessonId,body.expectedRevision]),this.guard(),
        s('UPDATE lesson_blocks SET content_json=?,revision=revision+1 WHERE lesson_id=? AND id=? AND revision=? AND deleted_at IS NULL',[JSON.stringify(content),lessonId,blockId,body.expectedBlockRevision]),this.guard()],
        result:{id:lessonId,revision:body.expectedRevision+1,block:{id:blockId,revision:body.expectedBlockRevision+1,content},detached,fileDeleted:false}};
    });
  }
  async upload(actor,lessonId,blockId,body,bytes){
    if(!this.store||!['isolated-local-stage','isolated-r2-stage'].includes(this.store.kind))fail(503,'Isolated storage unavailable.');
    if(!id(lessonId)||!id(blockId)||!body||Object.keys(body).some(k=>!['mutationId','expectedRevision','expectedBlockRevision','mime','name'].includes(k))
      ||![body.expectedRevision,body.expectedBlockRevision].every(v=>Number.isSafeInteger(v)&&v>0))fail(400,'Save the lesson and block before uploading.');
    // Deny learner writes before validating or storing any file.
    if(!actor?.id)fail(401,'Sign in first.');if(!['ADMIN','DEVELOPER'].includes(actor.role))fail(403,'Only teacher/developer can upload lesson files.');
    const metadata=await lessonMediaMetadata(bytes,body.mime,body.name);
    return this.mutate(actor,{...body,...metadata},['upload-lesson-file',lessonId,blockId],async()=>{
      const [row]=await this.db.read(`SELECT b.*,l.revision lesson_revision FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id
        WHERE l.id=? AND b.id=? AND l.deleted_at IS NULL AND b.deleted_at IS NULL`,[lessonId,blockId]);
      if(!row)fail(404,'Saved lesson block not found.');
      if(row.lesson_revision!==body.expectedRevision||row.revision!==body.expectedBlockRevision)fail(409,'Lesson or block changed. Reload before replacing its file.');
      const allowed=row.type==='file'||row.type==='pdf'&&metadata.mime==='application/pdf'||row.type==='image'&&metadata.mime.startsWith('image/')
        ||['audio','pronunciation'].includes(row.type)&&metadata.mime.startsWith('audio/');
      if(!allowed)fail(415,'This file does not match the lesson block type.');
      const key=`stage-local/lessons/${lessonId}/${blockId}/${metadata.sha256}`;
      const fileId='sf_'+await hash(new TextEncoder().encode(key));
      await this.store.putImmutable(key,bytes,metadata);
      const content={...JSON.parse(row.content_json),fileId,localMediaKey:key,name:metadata.name,fileType:metadata.mime,size:`${metadata.bytes} B`,hasFile:true,sample:false};
      return {statements:[s(`UPDATE lessons SET revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=? AND deleted_at IS NULL`,[lessonId,body.expectedRevision]),this.guard(),
        s(`UPDATE lesson_blocks SET content_json=?,revision=revision+1 WHERE lesson_id=? AND id=? AND revision=? AND deleted_at IS NULL`,[JSON.stringify(content),lessonId,blockId,body.expectedBlockRevision]),this.guard()],
        result:{id:lessonId,revision:body.expectedRevision+1,block:{id:blockId,revision:body.expectedBlockRevision+1,content},media:{...metadata,key,fileId}}};
    });
  }
}
