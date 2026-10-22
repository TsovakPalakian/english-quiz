// Explicit dedicated TEST bucket only. No environment/global fallback or public object URLs.
import {StudyError} from './learning-study.mjs';
import {boundedProviderBytes} from './bounded-provider-body.mjs';
import {privateQuizMediaObject,QUIZ_MEDIA_LIMITS} from './quiz-media.mjs';
export const WORKBENCH_TEST_BUCKET='learn-english-workbench-test-media';
const mimes={'image/png':'image','image/jpeg':'image','audio/wav':'audio','audio/mpeg':'audio','video/mp4':'video'};
const fail=()=>{throw new StudyError(503,'Private workbench media storage is unavailable or inconsistent.');};
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
export function quizR2MediaStore({enabled=false,bucket,bucketName,forbiddenBucket=null,environment='test',productionApproved=false}={}){
  const dedicated=environment==='test'?bucketName===WORKBENCH_TEST_BUCKET:environment==='production'&&productionApproved===true&&bucketName==='learn-english-workbench-private-media';
  const ready=()=>{if(enabled!==true||!dedicated||!bucket||bucket===forbiddenBucket||!['get','head','put','delete'].every(key=>typeof bucket[key]==='function'))fail();};
  const identity=key=>{ready();const match=/^quiz-media\/([a-f0-9-]{36})\/([a-f0-9]{64})$/.exec(key);if(!match)fail();return {key:'workbench-v1/'+key,digest:match[2]};};
  function metadata(object,expected){
    if(!object)return null;const meta=object.customMetadata||{},mime=object.httpMetadata?.contentType;
    if(!Object.hasOwn(mimes,mime)||meta.digest!==expected||meta.mime!==mime||!Number.isSafeInteger(object.size)||object.size<1||object.size>QUIZ_MEDIA_LIMITS[mimes[mime]]||String(object.size)!==meta.bytes)fail();
    return {mime,size:object.size};
  }
  async function read(key){const ref=identity(key),object=await bucket.get(ref.key),info=metadata(object,ref.digest);if(!info)return null;
    const bytes=await boundedProviderBytes(object.body,info.size);if(bytes.length!==info.size||await digest(bytes)!==ref.digest)fail();return {...info,bytes};}
  return {kind:environment==='production'?'dedicated-workbench-r2-production':'dedicated-workbench-r2-test',
    async putImmutable(key,bytes,meta){
      const ref=identity(key);if(!(bytes instanceof Uint8Array)||!Object.hasOwn(mimes,meta.mime)||!bytes.length||bytes.length>QUIZ_MEDIA_LIMITS[mimes[meta.mime]]||await digest(bytes)!==ref.digest)fail();
      const result=await bucket.put(ref.key,bytes,{onlyIf:new Headers({'If-None-Match':'*'}),sha256:ref.digest,httpMetadata:{contentType:meta.mime,cacheControl:'private, no-store'},customMetadata:{digest:ref.digest,mime:meta.mime,bytes:String(bytes.length)}});
      if(result){const info=metadata(result,ref.digest);if(info?.mime!==meta.mime||info.size!==bytes.length)fail();return;}
      const existing=await read(key);if(!existing||existing.mime!==meta.mime||existing.size!==bytes.length)fail();
    },
    async get(key,options){const entry=await read(key);return entry?privateQuizMediaObject(entry.bytes,entry.mime,options):null;},
    async head(key){const ref=identity(key),info=metadata(await bucket.head(ref.key),ref.digest);return info?{size:info.size,writeHttpMetadata(headers){headers.set('Content-Type',info.mime);}}:null;},
    async delete(key){const ref=identity(key);await bucket.delete(ref.key);},
  };
}
