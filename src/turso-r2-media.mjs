// Dedicated TEST bucket only. Never write/delete through the production binding.
import {StudyError} from './turso-study.mjs';
import {mediaRange} from './turso-media.mjs';
export const TEST_MEDIA_BUCKET='learn-english-turso-test-media';
export const PRODUCTION_MEDIA_BUCKET='learn-english-production-media';
const limit=25*1024*1024;
const pattern=/^(?:stage-local\/(songs|lessons|themes)\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}|migration-inline)\/([a-f0-9]{64})$/;
const mimes=new Set(['audio/wav','audio/mpeg','audio/ogg','application/pdf','image/png','image/jpeg','image/gif','image/webp']);
const fail=(status,message)=>{throw new StudyError(status,message);};
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
export async function boundedMediaBytes(request){
  const declared=request.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))fail(413,'File exceeds 25 MiB.');
  if(!request.body)fail(400,'File required.');
  const reader=request.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>limit){await reader.cancel();fail(413,'File exceeds 25 MiB.');}chunks.push(value);}
  }finally{reader.releaseLock();}
  if(!size)fail(400,'File required.');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export function stageR2Media(env){
  const bucketName=env.STORAGE_MODE==='production'?PRODUCTION_MEDIA_BUCKET:TEST_MEDIA_BUCKET;
  if(!env.STAGE_MEDIA||env.STAGE_MEDIA===env.MEDIA||env.STAGE_MEDIA_BUCKET!==bucketName
    ||!['get','head','put'].every(method=>typeof env.STAGE_MEDIA[method]==='function'))fail(503,'Dedicated test media bucket unavailable. No production fallback.');
  const bucket=env.STAGE_MEDIA;
  const identity=key=>{const match=pattern.exec(key);if(!match)fail(400,'Invalid test media key.');return match[2];};
  const validate=(key,object)=>{
    if(!object)fail(404,'Test media not found.');
    const digest=identity(key),meta=object.customMetadata||{},mime=object.httpMetadata?.contentType;
    if(!Number.isSafeInteger(object.size)||object.size<1||object.size>limit||meta.sha256!==digest||Number(meta.bytes)!==object.size
      ||!mimes.has(mime)||meta.mime!==mime||!object.checksums?.sha256||hex(object.checksums.sha256)!==digest)
      fail(503,'Test media integrity check failed.');
    return {sha256:digest,bytes:object.size,mime,name:meta.name||''};
  };
  const read=async key=>{
    identity(key);const object=await bucket.get(key),metadata=validate(key,object);
    const bytes=await boundedMediaBytes(new Response(object.body,{headers:{'Content-Length':String(object.size)}}));
    if(bytes.length!==metadata.bytes||await hash(bytes)!==metadata.sha256)fail(503,'Test media checksum mismatch.');
    return {metadata,bytes};
  };
  return {kind:'isolated-r2-stage',
    async putImmutable(key,bytes,metadata){
      const digest=identity(key);
      if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>limit||metadata.sha256!==digest||metadata.bytes!==bytes.length
        ||!mimes.has(metadata.mime)||typeof metadata.name!=='string'||metadata.name.length>200||await hash(bytes)!==digest)fail(400,'Invalid immutable test media.');
      const saved=await bucket.put(key,bytes,{onlyIf:new Headers({'If-None-Match':'*'}),sha256:digest,
        httpMetadata:{contentType:metadata.mime,cacheControl:'private, no-store'},
        customMetadata:{sha256:digest,bytes:String(bytes.length),mime:metadata.mime,name:metadata.name}});
      if(saved){validate(key,saved);return;}
      // Existing/racing object must match. Never overwrite or delete on failure.
      const existing=await read(key);if(existing.metadata.mime!==metadata.mime)fail(409,'Existing test media has a different type.');
    },
    readVerified:read,
    async response(key,method,range='',expected=null){
      if(!['GET','HEAD'].includes(method))fail(405,'Read only.');identity(key);const validated=mediaRange(method==='HEAD'?'':range);
      const result=method==='HEAD'?{metadata:validate(key,await bucket.head(key))}:await read(key),{metadata,bytes}=result;
      if(expected&&(metadata.sha256!==expected.sha256||metadata.bytes!==expected.bytes||metadata.mime!==expected.mime))fail(503,'Inline media metadata mismatch.');
      const headers={'Content-Type':metadata.mime,'Content-Length':String(metadata.bytes),'Cache-Control':'private, no-store',
        'X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Accept-Ranges':'bytes',
        'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
      if(method==='HEAD')return new Response(null,{headers});
      if(!validated)return new Response(bytes,{headers});
      const [,a,b]=/^bytes=(\d*)-(\d*)$/.exec(validated),start=a?Number(a):Math.max(0,bytes.length-Number(b)),end=a?(b?Math.min(Number(b),bytes.length-1):bytes.length-1):bytes.length-1;
      if(start>=bytes.length)return new Response(null,{status:416,headers:{...headers,'Content-Length':'0','Content-Range':`bytes */${bytes.length}`}});
      const body=bytes.subarray(start,end+1);return new Response(body,{status:206,headers:{...headers,'Content-Length':String(body.length),'Content-Range':`bytes ${start}-${end}/${bytes.length}`}});
    }
  };
}
