// Local staging only: binary data never goes into Turso or production R2.
import {PersonalService,libraryDto} from './turso-personal.mjs';
import {StudyError,statement as s} from './turso-study.mjs';
export const AUDIO_LIMIT=10*1024*1024;
const fail=(status,message)=>{throw new StudyError(status,message);};
export async function audioMetadata(bytes,mime,name){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>AUDIO_LIMIT)fail(413,'Audio must be between 1 byte and 10 MiB.');
  if(typeof name!=='string'||!name.trim()||name.length>200||/[\x00-\x1f\x7f/\\]/.test(name))fail(400,'Invalid audio filename.');
  const ascii=(offset,size)=>String.fromCharCode(...bytes.slice(offset,offset+size));
  const valid=mime==='audio/wav'&&bytes.length>=44&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WAVE'
    ||mime==='audio/ogg'&&bytes.length>=27&&ascii(0,4)==='OggS'&&bytes[4]===0
    ||mime==='audio/mpeg'&&bytes.length>=4&&(ascii(0,3)==='ID3'&&bytes.length>=10||bytes[0]===255&&(bytes[1]&224)===224&&(bytes[1]&6)!==0&&(bytes[2]&240)!==0&&(bytes[2]&240)!==240&&(bytes[2]&12)!==12);
  if(!valid)fail(415,'Use a WAV, OGG or MP3 file matching its content type.');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  return {sha256,mime,bytes:bytes.length,name:name.trim()};
}
export class SongMediaService extends PersonalService {
  constructor(db,store){super(db);this.store=store;}
  async upload(actor,id,body,bytes){
    if(!this.store||!['isolated-local-stage','isolated-r2-stage'].includes(this.store.kind))fail(503,'Isolated audio storage is not configured.');
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||!body||Object.keys(body).some(k=>!['mutationId','expectedRevision','mime','name'].includes(k))
      ||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)fail(400,'Invalid audio upload.');
    const metadata=await audioMetadata(bytes,body.mime,body.name),intent={...body,...metadata};
    return this.personal(actor,intent,['upload-own-song',id],async profile=>{
      if(!/^[A-Za-z0-9_-]{1,100}$/.test(profile))fail(503,'Invalid profile identity.');
      const [row]=await this.db.read(`SELECT l.* FROM library_items l JOIN profile_library_items p ON p.item_id=l.id
        WHERE p.profile_id=? AND l.id=? AND l.kind='song' AND l.scope='profile' AND l.owner_profile_id=? AND l.deleted_at IS NULL`,[profile,id,profile]);
      if(!row)fail(404,'Own song not found.');
      if(row.revision!==body.expectedRevision)fail(409,'Song changed. Reload before replacing its audio.');
      const key=`stage-local/songs/${profile}/${id}/${metadata.sha256}`;
      // Journal + immutable create before SQL. On an uncertain commit NEVER
      // delete the object: it may already be referenced by a committed row.
      // Failed/stale orphan objects remain private for a later bounded review.
      await this.store.putImmutable(key,bytes,metadata);
      const content={...JSON.parse(row.content_json),fileName:metadata.name,fileType:metadata.mime,updatedAt:new Date().toISOString()};
      const updated={...row,content_json:JSON.stringify(content),media_key:key,revision:body.expectedRevision+1};
      return {statements:[s(`UPDATE library_items SET media_key=?,content_json=?,revision=revision+1 WHERE id=?
        AND owner_profile_id=? AND scope='profile' AND kind='song' AND revision=? AND deleted_at IS NULL
        AND EXISTS(SELECT 1 FROM profile_library_items p WHERE p.profile_id=? AND p.item_id=library_items.id)`,[key,updated.content_json,id,profile,body.expectedRevision,profile]),this.guard()],
        result:{id,revision:updated.revision,item:{...libraryDto(updated),kind:'song'},media:{...metadata,key}}};
    });
  }
}
