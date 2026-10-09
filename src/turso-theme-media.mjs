// Theme pictures stay in the media bucket. The theme row stores only the key.
import {PersonalService} from './turso-personal.mjs';
import {StudyError} from './turso-study.mjs';
export const THEME_PHOTO_LIMIT=400000;
const fail=(status,message)=>{throw new StudyError(status,message);};
const photoKey=/^stage-local\/themes\/[A-Za-z0-9_-]{1,100}\/user-[a-z0-9-]{1,80}\/[a-f0-9]{64}$/;
export async function themeImageMetadata(bytes,mime){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>THEME_PHOTO_LIMIT)fail(413,'Theme picture must be between 1 byte and 400 kB.');
  if(mime!=='image/jpeg'&&mime!=='image/png'&&mime!=='image/webp')fail(415,'Use a JPEG, PNG or WEBP picture.');
  const ascii=(offset,size)=>String.fromCharCode(...bytes.slice(offset,offset+size));
  const ok=mime==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff
    ||mime==='image/png'&&ascii(0,8)==='\x89PNG\r\n\x1a\n'
    ||mime==='image/webp'&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP';
  if(!ok)fail(415,'Use a JPEG, PNG or WEBP picture.');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  return {sha256,mime,bytes:bytes.length,name:mime==='image/png'?'theme.png':mime==='image/webp'?'theme.webp':'theme.jpg'};
}
export class ThemeMediaService extends PersonalService {
  constructor(db,store){super(db);this.store=store;}
  async upload(actor,themeId,bytes,mime){
    if(!this.store||!['isolated-local-stage','isolated-r2-stage'].includes(this.store.kind))fail(503,'Isolated media storage is not configured.');
    if(!/^user-[a-z0-9-]{1,80}$/.test(themeId))fail(400,'Invalid theme.');
    const metadata=await themeImageMetadata(bytes,mime);
    const members=await this.db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[actor.id]);
    if(members.length!==1)fail(409,'This account has not been imported into test Turso.');
    const profile=members[0].profile_id;
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(profile))fail(503,'Invalid profile identity.');
    const key=`stage-local/themes/${profile}/${themeId}/${metadata.sha256}`;
    await this.store.putImmutable(key,bytes,metadata);
    return {photo:key};
  }
  async ownedKey(actor,themeId){
    if(!/^user-[a-z0-9-]{1,80}$/.test(themeId))fail(404,'Theme picture not found.');
    const members=await this.db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[actor.id]);
    if(members.length!==1)fail(404,'Theme picture not found.');
    const profile=members[0].profile_id;
    const rows=await this.db.read("SELECT value_json FROM account_settings WHERE account_id=? AND key='customThemes'",[actor.id]);
    let list=[];
    try{list=rows.length?JSON.parse(rows[0].value_json):[];}catch{list=[];}
    const theme=Array.isArray(list)?list.find(row=>row&&row.id===themeId):null;
    const key=theme&&theme.photo;
    if(typeof key!=='string'||!photoKey.test(key)||!key.startsWith(`stage-local/themes/${profile}/${themeId}/`))fail(404,'Theme picture not found.');
    return key;
  }
}
