// Exact referenced GETs from the dedicated test bucket. No list/PUT/DELETE/D1.
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {localMediaReferences} from './turso-media-backup.mjs';
import {lessonMediaMetadata} from '../src/turso-lesson-media.mjs';
import {TEST_MEDIA_BUCKET,boundedMediaBytes} from '../src/turso-r2-media.mjs';
const ACCOUNT='22f73bd94b002b9aee8eed13d261cf13';
export async function stageMediaArchiveStore(data,{fetchImpl=fetch,tokenProvider}={}){
  const references=localMediaReferences(data);assert.ok(references.length<=32,'Stage backup exceeds 32 objects.');
  const definitions=new Map();
  const add=(key,mime,name)=>{
    const old=definitions.get(key);if(old)assert.equal(old.mime,mime,'Conflicting MIME metadata.');
    definitions.set(key,{mime,name});
  };
  for(const row of data.tables.library_items||[])if(row.media_key?.startsWith('stage-local/')){
    const content=JSON.parse(row.content_json);add(row.media_key,content.fileType,content.fileName);
  }
  for(const row of data.tables.lesson_blocks||[]){const content=JSON.parse(row.content_json);
    if(content.localMediaKey)add(content.localMediaKey,content.fileType,content.name);
  }
  if(!references.length)return {kind:'isolated-local-stage',requests:0,readVerified(){throw Error('Absent media.');}};
  let token;
  if(tokenProvider)token=tokenProvider();else{
    const saved=readFileSync(resolve(homedir(),'.wrangler/config/default.toml'),'utf8');
    token=saved.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
    const expiry=saved.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
    assert.ok(token&&expiry&&Date.parse(expiry)>Date.now(),'Wrangler login expired.');
  }
  const cache=new Map();let total=0;
  for(const {key} of references){
    const definition=definitions.get(key);assert.ok(definition);
    let response;
    try{response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${TEST_MEDIA_BUCKET}/objects/`+key.split('/').map(encodeURIComponent).join('/'),{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,'Accept-Encoding':'identity'}
    });}catch{throw Error('Test R2 read failed; no automatic retry.');}
    if(response.status!==200){await response.body?.cancel();throw Error('Test R2 read HTTP '+response.status);}
    assert.equal(response.headers.get('content-type')?.split(';')[0],definition.mime,'R2 MIME mismatch.');
    const bytes=await boundedMediaBytes(response),metadata=await lessonMediaMetadata(bytes,definition.mime,definition.name);
    assert.ok(key.endsWith('/'+metadata.sha256),'Stage backup checksum mismatch.');
    total+=bytes.length;assert.ok(total<=64*1024*1024,'Stage backup exceeds 64 MiB.');
    cache.set(key,{bytes,metadata});
  }
  return {kind:'isolated-local-stage',requests:references.length,readVerified(key){assert.ok(cache.has(key));return cache.get(key);}};
}
