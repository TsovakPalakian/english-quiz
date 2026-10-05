// Frozen source binaries: exact referenced R2 GETs only, no D1 or cloud writes.
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {privateBackupDirectory,privateBackupFile} from './turso-media-backup.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ACCOUNT='22f73bd94b002b9aee8eed13d261cf13',BUCKET='learn-english-media';
const MAX_OBJECTS=32,MAX_FILE=32*1024*1024,MAX_TOTAL=256*1024*1024;
function inlineEntries(data){
  return (data.tables.catalog_documents||[]).filter(row=>row.namespace==='private-migration-media').map(row=>{
    const entry=JSON.parse(row.value_json);
    assert.match(row.key,/^[a-f0-9]{64}$/);assert.equal(entry.sha256,row.key);assert.equal(entry.file,'inline-media/'+row.key+'.bin');
    assert.ok(['image/png','image/jpeg','image/gif','image/webp'].includes(entry.mime));assert.ok(Number.isSafeInteger(entry.bytes)&&entry.bytes>0&&entry.bytes<=5_000_000);
    return {kind:'migration-inline',key:row.key,bytes:entry.bytes,mime:entry.mime,expectedSha256:entry.sha256};
  }).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
}
export function sourceMediaReferences(data){
  assert.equal(data.version,1);assert.equal(data.testOnly,true);
  const accounts=new Set((data.tables.account_refs||[]).map(row=>row.id)),keys=new Set();
  for(const row of data.tables.library_items||[])if(row.media_key&&!row.media_key.startsWith('stage-local/')){
    assert.match(row.media_key,/^[a-f0-9]{16,64}\/[A-Za-z0-9_-]{1,100}$/);assert.ok(accounts.has(row.media_key.split('/')[0]),'Unknown source media account.');keys.add(row.media_key);
  }
  for(const row of data.tables.lesson_blocks||[]){const content=JSON.parse(row.content_json);
    if(content.fileId&&!content.localMediaKey){assert.match(content.fileId,/^[A-Za-z0-9_-]{1,100}$/);assert.ok(!content.fileId.startsWith('sf_'));keys.add('lessons/files/'+content.fileId);}}
  assert.ok(keys.size<=MAX_OBJECTS,'Source R2 copy request limit exceeded.');
  return {r2:[...keys].sort(),inline:inlineEntries(data)};
}
function sourceInventory(directory){
  const dir=resolve(directory),info=lstatSync(dir);
  const scoped=/^\/Users\/tsovakpalakian\/Downloads\/english-quiz-turso-backups\/tsovakdev-plan-[A-Za-z0-9]+$/.test(dir);
  assert.ok((dir.startsWith('/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/snapshot-')||scoped||dir.startsWith('/private/tmp/english-quiz-source-fixture-'))
    &&info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&realpathSync(dir)===dir,'Only a private frozen source snapshot.');
  const raw=privateBackupFile(resolve(dir,'manifest.json'),8*1024*1024),manifest=JSON.parse(raw);
  assert.equal(manifest.status,'complete');assert.equal(manifest.account,ACCOUNT);assert.equal(manifest.bucket,BUCKET);assert.ok(Array.isArray(manifest.inventory));
  if(scoped)assert.equal(manifest.projection?.retainedLogin,'TsovakDev','Scoped media source must be a retained projection.');
  assert.equal(new Set(manifest.inventory.map(e=>e.key)).size,manifest.inventory.length,'Duplicate inventory key.');
  return {dir,manifest,sourceManifestSha256:sha(raw)};
}
export function sourceMediaPlan(data,directory){
  const refs=sourceMediaReferences(data),source=sourceInventory(directory),inventory=new Map(source.manifest.inventory.map(e=>[e.key,e]));
  const r2=refs.r2.map(key=>{
    const entry=inventory.get(key);assert.ok(entry,'Referenced source media is absent from frozen inventory.');
    assert.ok(Number.isSafeInteger(entry.size)&&entry.size>0&&entry.size<=MAX_FILE,'Source media object limit exceeded.');
    assert.ok(typeof entry.etag==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(entry.etag),'Invalid frozen ETag.');
    return {kind:'r2',key,bytes:entry.size,etag:entry.etag};
  });
  assert.ok([...r2,...refs.inline].reduce((n,e)=>n+e.bytes,0)<=MAX_TOTAL,'Source media total byte limit exceeded.');
  return {...source,r2,inline:refs.inline};
}
export function cloudflareMediaReader({fetchImpl=fetch,tokenProvider}={}){
  let requests=0;
  return {get requests(){return requests;},async read(entry){
    assert.equal(entry.kind,'r2');assert.ok(/^[a-f0-9]{16,64}\/[A-Za-z0-9_-]{1,100}$/.test(entry.key)||/^lessons\/files\/[A-Za-z0-9_-]{1,100}$/.test(entry.key));
    assert.ok(requests<MAX_OBJECTS&&entry.bytes>0&&entry.bytes<=MAX_FILE);assert.match(entry.etag,/^[A-Za-z0-9_-]{1,128}$/);
    let token;
    if(tokenProvider)token=tokenProvider();else{
      const saved=readFileSync(resolve(homedir(),'.wrangler/config/default.toml'),'utf8');
      token=saved.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];const expiry=saved.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
      assert.ok(token&&expiry&&Date.parse(expiry)>Date.now(),'Existing Wrangler login unavailable or expired.');
    }
    requests++;
    let response;try{response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/`+entry.key.split('/').map(encodeURIComponent).join('/'),{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(60_000),headers:{Authorization:'Bearer '+token,'Accept-Encoding':'identity','If-Match':'"'+entry.etag+'"'}});}
    catch{throw new Error('Source media GET unavailable; no automatic retry.');}
    if(response.status!==200){await response.body?.cancel();throw new Error('Source media GET HTTP '+response.status+'; original data was not changed.');}
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>entry.bytes||size>MAX_FILE){await reader.cancel();throw new Error('Source media size changed.');}chunks.push(value);}}
    finally{reader.releaseLock();}
    const bytes=Buffer.concat(chunks);assert.equal(bytes.length,entry.bytes,'Source media size mismatch.');
    const etag=response.headers.get('etag')?.replace(/^W\//,'').replace(/^"|"$/g,'');
    const md5=/^[a-f0-9]{32}$/.test(entry.etag)&&createHash('md5').update(bytes).digest('hex')===entry.etag;
    assert.ok(md5||etag===entry.etag,'Source changed since frozen inventory.');
    return {bytes,mime:response.headers.get('content-type')||'application/octet-stream'};
  }};
}
export async function writeSourceMediaBackup(path,data,sourceDirectory,provider){
  const dir=privateBackupDirectory(path),plan=sourceMediaPlan(data,sourceDirectory);
  // Completed backups must never be supplemented in place.
  try{lstatSync(resolve(dir,'manifest.json'));throw new Error('Cannot modify a completed backup.');}catch(error){if(error.code!=='ENOENT')throw error;}
  const target=resolve(dir,'source-media');mkdirSync(target,{mode:0o700});const objects=[];
  for(const entry of [...plan.inline,...plan.r2]){
    let bytes,mime=entry.mime;
    if(entry.kind==='migration-inline'){
      const parent=resolve(plan.dir,'inline-media');assert.ok(!lstatSync(parent).isSymbolicLink()&&realpathSync(parent)===parent);
      bytes=privateBackupFile(resolve(parent,entry.key+'.bin'),5_000_000);assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.expectedSha256);
    }else{const result=await provider.read(entry);bytes=result.bytes;mime=result.mime;assert.equal(bytes.length,entry.bytes);}
    const file=sha(entry.kind+':'+entry.key)+'.bin';writeFileSync(resolve(target,file),bytes,{flag:'wx',mode:0o600});objects.push({...entry,mime,file,sha256:sha(bytes)});
  }
  const manifest={version:1,testOnly:true,scope:'referenced-frozen-source-media',bucket:BUCKET,sourceManifestSha256:plan.sourceManifestSha256,
    totalBytes:objects.reduce((n,e)=>n+e.bytes,0),objects,allBucketObjectsIncluded:false};
  writeFileSync(resolve(dir,'source-media.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
  return verifySourceMediaBackup(dir,data);
}
export function verifySourceMediaBackup(path,data){
  const dir=privateBackupDirectory(path),refs=sourceMediaReferences(data),manifest=JSON.parse(privateBackupFile(resolve(dir,'source-media.json'),128*1024));
  assert.equal(manifest.version,1);assert.equal(manifest.testOnly,true);assert.equal(manifest.scope,'referenced-frozen-source-media');assert.equal(manifest.bucket,BUCKET);
  assert.match(manifest.sourceManifestSha256,/^[a-f0-9]{64}$/);assert.equal(manifest.allBucketObjectsIncluded,false);
  assert.ok(Array.isArray(manifest.objects)&&manifest.objects.length===refs.r2.length+refs.inline.length);
  assert.deepEqual(manifest.objects.map(e=>({kind:e.kind,key:e.key})),[...refs.inline.map(e=>({kind:e.kind,key:e.key})),...refs.r2.map(key=>({kind:'r2',key}))]);
  const parent=resolve(dir,'source-media'),info=lstatSync(parent);assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&realpathSync(parent)===parent);
  let totalBytes=0;
  for(const entry of manifest.objects){
    assert.equal(entry.file,sha(entry.kind+':'+entry.key)+'.bin');assert.ok(Number.isSafeInteger(entry.bytes)&&entry.bytes>0&&entry.bytes<=MAX_FILE);
    const bytes=privateBackupFile(resolve(parent,entry.file),MAX_FILE);assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);
    if(entry.kind==='migration-inline'){const source=refs.inline.find(e=>e.key===entry.key);assert.equal(entry.bytes,source.bytes);assert.equal(entry.mime,source.mime);assert.equal(entry.sha256,source.expectedSha256);}
    totalBytes+=bytes.length;assert.ok(totalBytes<=MAX_TOTAL);
  }
  assert.equal(totalBytes,manifest.totalBytes);
  return {scope:manifest.scope,r2Objects:refs.r2.length,inlineObjects:refs.inline.length,totalBytes,allBucketObjectsIncluded:false};
}
export function restoreSourceMediaBackup(path,data){
  const dir=privateBackupDirectory(path),verified=verifySourceMediaBackup(dir,data),destination=mkdtempSync('/private/tmp/english-quiz-source-media-');
  const manifest=JSON.parse(privateBackupFile(resolve(dir,'source-media.json'),128*1024));
  for(const kind of ['r2','inline-media'])mkdirSync(resolve(destination,kind),{mode:0o700});
  for(const entry of manifest.objects){const bytes=privateBackupFile(resolve(dir,'source-media',entry.file),MAX_FILE);assert.equal(sha(bytes),entry.sha256);
    const file=entry.kind==='migration-inline'?'inline-media/'+entry.key+'.bin':'r2/'+sha(entry.key)+'.bin';writeFileSync(resolve(destination,file),bytes,{flag:'wx',mode:0o600});}
  writeFileSync(resolve(destination,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
  return {...verified,directory:destination,runtimeChanged:false,productionChanged:false};
}
