import {mediaRange} from './turso-media.mjs';
export const CHAT_FILE_LIMIT=25*1024*1024;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function chatFileMime(bytes,type=''){
  const starts=values=>values.every((v,i)=>bytes[i]===v),ascii=(at,length)=>new TextDecoder().decode(bytes.slice(at,at+length));
  if(starts([137,80,78,71,13,10,26,10]))return 'image/png';
  if(starts([255,216,255]))return 'image/jpeg';
  if(['GIF87a','GIF89a'].includes(ascii(0,6)))return 'image/gif';
  if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP')return 'image/webp';
  if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WAVE')return 'audio/wav';
  if(ascii(0,4)==='OggS')return 'audio/ogg';
  if(ascii(0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224)return 'audio/mpeg';
  if(starts([26,69,223,163]))return type.split(';')[0]==='audio/webm'?'audio/webm':'video/webm';
  if(ascii(4,4)==='ftyp')return type.split(';')[0]==='audio/mp4'?'audio/mp4':'video/mp4';
  // Other formats are downloads, never executable same-origin HTML or SVG.
  return 'application/octet-stream';
}
export async function chatFileMetadata(bytes,type){
  if(bytes.length>CHAT_FILE_LIMIT)fail(413,'Maximum attachment size is 25 MB.');
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return {mime:chatFileMime(bytes,type),sha256:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')};
}
export async function chatFileResponse(store,file,request){
  const head=request.method==='HEAD',range=head?'':mediaRange(request.headers.get('Range')||'');
  const object=head?await store.head(file.storage_key):await store.get(file.storage_key,range?{range:new Headers({Range:range})}:undefined);
  if(!object)fail(404,'Attachment unavailable.');
  const inline=/^(image\/(png|jpeg|gif|webp)|audio\/(mpeg|wav|ogg|webm|mp4)|video\/(webm|mp4))$/.test(file.mime);
  const name=file.name.replace(/[\x00-\x1f\x7f]/g,'').slice(0,160)||'attachment';
  const download=new URL(request.url).searchParams.get('download')==='1';
  const headers=new Headers({'Content-Type':inline?file.mime:'application/octet-stream','Content-Disposition':(inline&&!download?'inline':'attachment')+'; filename="'+name.replace(/[^a-zA-Z0-9._-]/g,'_')+'"; filename*=UTF-8\'\''+encodeURIComponent(name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'Accept-Ranges':'bytes'});
  let status=200,length=object.size;
  if(!head&&object.range){const start=object.range.offset??Math.max(0,object.size-(object.range.suffix||0));length=Math.min(object.range.length??object.size-start,object.size-start);if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(length)||length<=0){headers.set('Content-Range','bytes */'+object.size);return new Response(null,{status:416,headers});}headers.set('Content-Range',`bytes ${start}-${start+length-1}/${object.size}`);status=206;}
  headers.set('Content-Length',String(length));return new Response(head?null:object.body,{status,headers});
}
