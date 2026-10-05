import {StudyError,lessonAccess} from './turso-study.mjs';
export function mediaRange(value=''){
  if(!value)return '';
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!match||!match[1]&&!match[2])throw new StudyError(400,'Invalid media range.');
  const start=match[1]?Number(match[1]):null,end=match[2]?Number(match[2]):null;
  if(start!==null&&!Number.isSafeInteger(start)||end!==null&&!Number.isSafeInteger(end)||start===null&&end===0||start!==null&&end!==null&&end<start)throw new StudyError(400,'Invalid media range.');
  return value;
}
export function mediaMime(value=''){
  const mime=value.split(';')[0].trim();
  if(!/^(audio\/[a-z0-9.+-]+|video\/(mp4|webm)|application\/pdf|image\/(png|jpeg|webp|gif))$/i.test(mime))throw new StudyError(415,'Unsafe media type.');
  return mime;
}
// Call only after mediaKey has checked the authenticated profile/lesson access.
export async function storedMediaResponse(store,key,request){
  const head=request.method==='HEAD',range=head?'':mediaRange(request.headers.get('range')||'');
  const object=head?await store.head(key):await store.get(key,range?{range:new Headers({Range:range})}:undefined);
  if(!object)throw new StudyError(404,'File not found.');
  if(!Number.isSafeInteger(object.size)||object.size<0)throw new StudyError(503,'Invalid media metadata.');
  const headers=new Headers();object.writeHttpMetadata(headers);
  headers.set('Content-Type',mediaMime(headers.get('Content-Type')||''));
  // Stored object metadata must never override private response headers.
  headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');
  headers.set('Cross-Origin-Resource-Policy','same-origin');headers.set('Referrer-Policy','no-referrer');
  headers.set('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  headers.set('Accept-Ranges','bytes');headers.delete('Content-Range');headers.delete('Content-Length');
  let status=200,length=object.size;
  if(!head&&object.range){
    const start=object.range.offset??Math.max(0,object.size-(object.range.suffix||0));
    length=Math.min(object.range.length??object.size-start,object.size-start);
    if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(length)||length<=0){
      headers.set('Content-Range',`bytes */${object.size}`);return new Response(null,{status:416,headers});
    }
    headers.set('Content-Range',`bytes ${start}-${start+length-1}/${object.size}`);status=206;
  }
  headers.set('Content-Length',String(length));return new Response(head?null:object.body,{status,headers});
}
export function mediaPlaceholders(value){
  if(typeof value==='string'&&/^migration-media:[a-f0-9]{64}$/.test(value))return '/api/migration-media/'+value.slice(16);
  if(Array.isArray(value))return value.map(mediaPlaceholders);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mediaPlaceholders(v)]));
  return value;
}
export async function inlineMedia(db,actor,digest){
  if(!actor?.id)throw new StudyError(401,'Sign in first.');if(!/^[a-f0-9]{64}$/.test(digest))throw new StudyError(404,'Media not found.');
  const needle='migration-media:'+digest;
  const rows=await db.read(`SELECT value_json FROM catalog_documents WHERE namespace='private-migration-media' AND key=? AND (
    EXISTS(SELECT 1 FROM account_settings WHERE account_id=? AND instr(value_json,?)>0)
    OR EXISTS(SELECT 1 FROM profile_settings p JOIN profile_members m ON m.profile_id=p.profile_id WHERE m.account_id=? AND instr(p.value_json,?)>0)
    OR EXISTS(SELECT 1 FROM library_items l JOIN profile_library_items p ON p.item_id=l.id JOIN profile_members m ON m.profile_id=p.profile_id
      WHERE m.account_id=? AND l.deleted_at IS NULL AND (l.scope='shared' OR l.owner_profile_id=m.profile_id) AND instr(l.content_json,?)>0)
    OR EXISTS(SELECT 1 FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id WHERE b.deleted_at IS NULL AND instr(b.content_json,?)>0 AND ${lessonAccess}))`,
    [digest,actor.id,needle,actor.id,needle,actor.id,needle,needle,+['ADMIN','DEVELOPER'].includes(actor.role),actor.id,actor.id]);
  if(rows.length!==1)throw new StudyError(404,'Media not found.');
  const entry=JSON.parse(rows[0].value_json);
  if(entry.sha256!==digest||entry.file!=='inline-media/'+digest+'.bin'||!['image/png','image/jpeg','image/webp','image/gif'].includes(entry.mime)||!Number.isSafeInteger(entry.bytes)||entry.bytes>5_000_000)throw new StudyError(415,'Unsafe media type or size.');
  return entry;
}
export async function mediaKey(db,actor,kind,id){
  if(!actor?.id)throw new StudyError(401,'Sign in first.');if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw new StudyError(400,'Invalid file ID.');
  if(kind==='song'){
    const rows=await db.read(`SELECT l.media_key FROM library_items l JOIN profile_library_items p ON p.item_id=l.id JOIN profile_members m ON m.profile_id=p.profile_id
      WHERE m.account_id=? AND l.kind='song' AND l.deleted_at IS NULL AND (l.scope='shared' OR l.owner_profile_id=m.profile_id)
      AND (l.id=? OR json_extract(l.content_json,'$.id')=?)`,[actor.id,id,id]);
    if(rows.length!==1||!rows[0].media_key)throw new StudyError(404,'Song media not found.');
    const key=rows[0].media_key;if(!/^[A-Za-z0-9_/-]{1,400}$/.test(key)||key.includes('..'))throw new StudyError(404,'Invalid media reference.');return key;
  }
  const rows=await db.read(`SELECT l.id lesson_id,b.id block_id,b.content_json FROM lessons l JOIN lesson_blocks b ON b.lesson_id=l.id WHERE b.deleted_at IS NULL AND json_extract(b.content_json,'$.fileId')=? AND ${lessonAccess} LIMIT 2`,[id,+['ADMIN','DEVELOPER'].includes(actor.role),actor.id,actor.id]);
  if(!rows.length)throw new StudyError(404,'Lesson file not found.');
  if(rows.every(row=>JSON.parse(row.content_json).localMediaKey===undefined)){
    if(id.startsWith('sf_'))throw new StudyError(404,'Local lesson media unavailable. No production fallback.');
    return 'lessons/files/'+id;
  }
  if(rows.length!==1)throw new StudyError(404,'Ambiguous local lesson file.');
  const content=JSON.parse(rows[0].content_json),key=content.localMediaKey;
  if(key!==undefined){
    const prefix=`stage-local/lessons/${rows[0].lesson_id}/${rows[0].block_id}/`;
    if(typeof key!=='string'||!key.startsWith(prefix)||! /^[a-f0-9]{64}$/.test(key.slice(prefix.length))||! /^sf_[a-f0-9]{64}$/.test(id))throw new StudyError(404,'Invalid local lesson media reference.');
    return key;
  }
  if(id.startsWith('sf_'))throw new StudyError(404,'Local lesson media unavailable. No production fallback.');
  return 'lessons/files/'+id;
}
