// Private filesystem adapter; no network, no R2 writes, no arbitrary paths.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,lstatSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {StudyError} from '../src/turso-study.mjs';
import {mediaRange} from '../src/turso-media.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const keyPattern=/^stage-local\/(songs|lessons)\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}\/[a-f0-9]{64}$/;
const allowedMime=['audio/wav','audio/mpeg','audio/ogg','application/pdf','image/png','image/jpeg','image/gif','image/webp'];
export function localMediaStore(directory){
  const dir=resolve(directory);
  if(!dir.startsWith('/private/tmp/english-quiz-stage-media-')||!lstatSync(dir).isDirectory()||lstatSync(dir).isSymbolicLink()||realpathSync(dir)!==dir||(lstatSync(dir).mode&0o077)!==0)throw new StudyError(503,'Private staging media directory required.');
  const paths=key=>{if(!keyPattern.test(key))throw new StudyError(400,'Invalid local media key.');const hash=digest(key);return {file:resolve(dir,hash+'.bin'),journal:resolve(dir,hash+'.json')};};
  const read=key=>{
    const {file,journal}=paths(key);
    let metadata,bytes;
    try{
      for(const path of [file,journal]){const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0||info.size>(path===file?25*1024*1024:4096))throw new Error();}
      metadata=JSON.parse(readFileSync(journal,'utf8'));bytes=readFileSync(file);
    }catch{throw new StudyError(503,'Local audio missing or unsafe. No production fallback.');}
    if(metadata.key!==key||!allowedMime.includes(metadata.mime)||metadata.sha256!==key.slice(-64)||bytes.length!==metadata.bytes||digest(bytes)!==metadata.sha256)throw new StudyError(503,'Local media checksum mismatch.');
    return {metadata,bytes};
  };
  return {kind:'isolated-local-stage',directory:dir,
    // Verified, read-only access for isolated backups; never enumerates R2.
    readVerified:read,
    async putImmutable(key,bytes,metadata){
      const {file,journal}=paths(key);
      if(metadata.sha256!==key.slice(-64)||digest(bytes)!==metadata.sha256||metadata.bytes!==bytes.length)throw new StudyError(400,'Invalid immutable audio.');
      try{writeFileSync(journal,JSON.stringify({...metadata,key}),{mode:0o600,flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
      try{writeFileSync(file,bytes,{mode:0o600,flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
      const saved=read(key);if(saved.metadata.mime!==metadata.mime)throw new StudyError(409,'Audio already exists with a different type.');
    },
    async response(key,method,range=''){
      const validated=method==='HEAD'?'':mediaRange(range),{metadata,bytes}=read(key);
      const headers={'Content-Type':metadata.mime,'Content-Length':String(bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Accept-Ranges':'bytes'};
      if(method==='HEAD')return new Response(null,{headers});
      let status=200,body=bytes;
      if(validated){
        const [,a,b]=/^bytes=(\d*)-(\d*)$/.exec(validated),start=a?Number(a):Math.max(0,bytes.length-Number(b)),end=a?(b?Math.min(Number(b),bytes.length-1):bytes.length-1):bytes.length-1;
        if(start>=bytes.length)return new Response(null,{status:416,headers:{...headers,'Content-Length':'0','Content-Range':`bytes */${bytes.length}`}});
        body=bytes.subarray(start,end+1);status=206;headers['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;headers['Content-Length']=String(body.length);
      }
      return new Response(body,{status,headers});
    }
  };
}
export function configuredLocalMedia(root){
  const ledger=resolve(root,'rollback/turso-local-media.json');let directory;
  try{directory=JSON.parse(readFileSync(ledger,'utf8')).directory;}catch(error){if(error.code!=='ENOENT')throw error;
    directory=mkdtempSync('/private/tmp/english-quiz-stage-media-');mkdirSync(resolve(root,'rollback'),{recursive:true,mode:0o700});
    writeFileSync(ledger,JSON.stringify({testOnly:true,directory}),{flag:'wx',mode:0o600});}
  return localMediaStore(directory);
}
