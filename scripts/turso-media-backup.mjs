// Local binaries only. Never contacts Turso, D1 or R2, never changes runtime paths.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {localMediaStore} from './turso-local-media.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const keyPattern=/^stage-local\/(songs|lessons)\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}\/[a-f0-9]{64}$/;
const mimeTypes=['audio/wav','audio/mpeg','audio/ogg','application/pdf','image/png','image/jpeg','image/gif','image/webp'];
const MAX_OBJECTS=1000,MAX_BYTES=512*1024*1024;
function privateDirectory(path){
  const dir=resolve(path),info=lstatSync(dir);
  assert.ok((dir.startsWith('/private/tmp/english-quiz-turso-backup-')||dir.startsWith('/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/turso-verified-')
    ||/^\/private\/tmp\/english-quiz-candidate-[A-Za-z0-9]+$/.test(dir)
    ||/^\/Users\/tsovakpalakian\/Downloads\/english-quiz-turso-backups\/candidate-verified-[A-Za-z0-9]+$/.test(dir))
    &&info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&realpathSync(dir)===dir,'Only a private recorded backup directory.');return dir;
}
function privateFile(path,limit){
  const info=lstatSync(path);assert.ok(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&info.size<=limit,'Unsafe or oversized media backup file.');
  return readFileSync(path);
}
export const privateBackupDirectory=privateDirectory,privateBackupFile=privateFile;
export function localMediaReferences(data){
  assert.equal(data.version,1);assert.equal(data.testOnly,true);
  const counts=new Map();
  const add=(key,prefix)=>{
    assert.ok(keyPattern.test(key)&&key.startsWith(prefix),'Local media reference has a different owner/block.');
    counts.set(key,(counts.get(key)||0)+1);
  };
  for(const row of data.tables.library_items||[])if(typeof row.media_key==='string'&&row.media_key.startsWith('stage-local/')){
    assert.equal(row.scope,'profile');assert.equal(row.kind,'song');add(row.media_key,`stage-local/songs/${row.owner_profile_id}/${row.id}/`);
  }
  for(const row of data.tables.lesson_blocks||[]){
    const content=JSON.parse(row.content_json);
    if(content.localMediaKey!==undefined){
      assert.equal(typeof content.localMediaKey,'string');add(content.localMediaKey,`stage-local/lessons/${row.lesson_id}/${row.id}/`);
      assert.equal(content.fileId,'sf_'+hash(content.localMediaKey),'Lesson file ID does not match the local key.');
    }
  }
  assert.ok(counts.size<=MAX_OBJECTS,'Local media backup object limit exceeded.');
  return [...counts].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,references])=>({key,references}));
}
export function writeLocalMediaBackup(path,data,store=null){
  const dir=privateDirectory(path),references=localMediaReferences(data);
  assert.ok(!existsSync(resolve(dir,'manifest.json')),'Cannot modify a completed backup.');
  if(references.length)assert.ok(store?.kind==='isolated-local-stage'&&typeof store.readVerified==='function','Referenced local media storage is unavailable.');
  const target=resolve(dir,'local-media');mkdirSync(target,{mode:0o700});
  let totalBytes=0;const objects=[];
  for(const {key,references:count} of references){
    const {metadata,bytes}=store.readVerified(key);totalBytes+=bytes.length;assert.ok(totalBytes<=MAX_BYTES,'Local media backup byte limit exceeded.');
    const stem=hash(key),file=stem+'.bin',journal=stem+'.json',raw=Buffer.from(JSON.stringify({...metadata,key}));
    writeFileSync(resolve(target,file),bytes,{flag:'wx',mode:0o600});writeFileSync(resolve(target,journal),raw,{flag:'wx',mode:0o600});
    objects.push({key,references:count,file,journal,bytes:bytes.length,sha256:hash(bytes),journalSha256:hash(raw)});
  }
  const manifest={version:1,testOnly:true,scope:'isolated-local-media-only',productionR2Included:false,migrationInlineIncluded:false,totalBytes,objects};
  writeFileSync(resolve(dir,'local-media.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
  return verifyLocalMediaBackup(dir,data);
}
export function verifyLocalMediaBackup(path,data){
  const dir=privateDirectory(path),references=localMediaReferences(data);
  const manifest=JSON.parse(privateFile(resolve(dir,'local-media.json'),2*1024*1024));
  assert.equal(manifest.version,1);assert.equal(manifest.testOnly,true);assert.equal(manifest.scope,'isolated-local-media-only');
  assert.equal(manifest.productionR2Included,false);assert.equal(manifest.migrationInlineIncluded,false);
  assert.ok(Array.isArray(manifest.objects)&&manifest.objects.length<=MAX_OBJECTS);
  assert.deepEqual(manifest.objects.map(({key,references})=>({key,references})),references,'Missing/extra/duplicate referenced local media.');
  const target=resolve(dir,'local-media'),info=lstatSync(target);
  assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&realpathSync(target)===target);
  let totalBytes=0;
  for(const entry of manifest.objects){
    const stem=hash(entry.key);assert.equal(entry.file,stem+'.bin');assert.equal(entry.journal,stem+'.json');
    const bytes=privateFile(resolve(target,entry.file),10*1024*1024),raw=privateFile(resolve(target,entry.journal),4096),metadata=JSON.parse(raw);
    assert.equal(hash(bytes),entry.sha256);assert.equal(hash(raw),entry.journalSha256);assert.equal(bytes.length,entry.bytes);
    assert.equal(metadata.key,entry.key);assert.equal(metadata.sha256,entry.key.slice(-64));assert.equal(hash(bytes),metadata.sha256);assert.equal(metadata.bytes,bytes.length);
    assert.ok(mimeTypes.includes(metadata.mime));totalBytes+=bytes.length;assert.ok(totalBytes<=MAX_BYTES);
  }
  assert.equal(totalBytes,manifest.totalBytes);
  return {scope:manifest.scope,objects:manifest.objects.length,totalBytes,productionR2Included:false,migrationInlineIncluded:false};
}
export async function restoreLocalMediaBackup(path,data){
  const dir=privateDirectory(path),verified=verifyLocalMediaBackup(dir,data);
  // Always a new private directory. Never overwrite originals or update ledger.
  const destination=mkdtempSync('/private/tmp/english-quiz-stage-media-'),store=localMediaStore(destination);
  const manifest=JSON.parse(privateFile(resolve(dir,'local-media.json'),2*1024*1024));
  for(const entry of manifest.objects){
    const bytes=privateFile(resolve(dir,'local-media',entry.file),10*1024*1024),raw=privateFile(resolve(dir,'local-media',entry.journal),4096),metadata=JSON.parse(raw);
    // Recheck bytes after verification: a changed backup must not be restored.
    assert.equal(hash(bytes),entry.sha256);assert.equal(hash(raw),entry.journalSha256);
    await store.putImmutable(entry.key,bytes,metadata);assert.equal(hash(store.readVerified(entry.key).bytes),entry.sha256);
  }
  return {...verified,directory:destination,runtimeChanged:false,productionChanged:false};
}
export function localMediaArchiveStore(path,data){
  const dir=privateDirectory(path);verifyLocalMediaBackup(dir,data);
  const manifest=JSON.parse(privateFile(resolve(dir,'local-media.json'),2*1024*1024));
  return {kind:'isolated-local-stage',readVerified(key){
    const entry=manifest.objects.find(e=>e.key===key);assert.ok(entry,'Local media absent from archive.');
    const bytes=privateFile(resolve(dir,'local-media',entry.file),10*1024*1024),raw=privateFile(resolve(dir,'local-media',entry.journal),4096);
    assert.equal(hash(bytes),entry.sha256);assert.equal(hash(raw),entry.journalSha256);
    return {bytes,metadata:JSON.parse(raw)};
  }};
}
