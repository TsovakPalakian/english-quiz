import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {sourceMediaPlan,writeSourceMediaBackup,verifySourceMediaBackup,restoreSourceMediaBackup,cloudflareMediaReader} from './turso-source-media.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),owner='a'.repeat(32),r2=Buffer.from('original audio'),image=Buffer.from('private image');
function fixture(){
  const source=mkdtempSync('/private/tmp/english-quiz-source-fixture-'),destination=mkdtempSync('/private/tmp/english-quiz-turso-backup-');
  mkdirSync(resolve(source,'inline-media'),{mode:0o700});writeFileSync(resolve(source,'inline-media',sha(image)+'.bin'),image,{mode:0o600});
  const data={version:1,testOnly:true,tables:{account_refs:[{id:owner}],library_items:[{media_key:owner+'/song'}],lesson_blocks:[],catalog_documents:[{namespace:'private-migration-media',key:sha(image),value_json:JSON.stringify({sha256:sha(image),file:'inline-media/'+sha(image)+'.bin',bytes:image.length,mime:'image/jpeg'})}]}};
  const manifest={status:'complete',account:'22f73bd94b002b9aee8eed13d261cf13',bucket:'learn-english-media',inventory:[{key:owner+'/song',size:r2.length,etag:createHash('md5').update(r2).digest('hex')}]};
  writeFileSync(resolve(source,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
  return {data,source,destination,manifest,close(){rmSync(source,{recursive:true});rmSync(destination,{recursive:true});}};
}
test('Source media copy and isolated restore preserve exact R2 and inline bytes without source changes',async()=>{
  const f=fixture();let restored;try{
    const original=readFileSync(resolve(f.source,'manifest.json'));let requests=0;
    const result=await writeSourceMediaBackup(f.destination,f.data,f.source,{read:async entry=>{requests++;assert.equal(entry.key,owner+'/song');return {bytes:r2,mime:'audio/mpeg'};}});
    assert.equal(requests,1);assert.equal(result.r2Objects,1);assert.equal(result.inlineObjects,1);assert.equal(result.totalBytes,r2.length+image.length);
    assert.deepEqual(verifySourceMediaBackup(f.destination,f.data),result);restored=restoreSourceMediaBackup(f.destination,f.data);
    assert.equal(restored.productionChanged,false);assert.equal(restored.runtimeChanged,false);
    assert.deepEqual(readFileSync(resolve(restored.directory,'r2',sha(owner+'/song')+'.bin')),r2);
    assert.deepEqual(readFileSync(resolve(restored.directory,'inline-media',sha(image)+'.bin')),image);
    assert.deepEqual(readFileSync(resolve(f.source,'manifest.json')),original);
  }finally{if(restored)rmSync(restored.directory,{recursive:true});f.close();}
});
test('Source media rejects missing inventory, changed inline bytes and archive corruption',async()=>{
  const f=fixture();try{
    const wrong=structuredClone(f.data);wrong.tables.library_items[0].media_key=owner+'/missing';assert.throws(()=>sourceMediaPlan(wrong,f.source),/absent/);
    await writeSourceMediaBackup(f.destination,f.data,f.source,{read:async()=>({bytes:r2,mime:'audio/mpeg'})});
    const manifest=JSON.parse(readFileSync(resolve(f.destination,'source-media.json')));writeFileSync(resolve(f.destination,'source-media',manifest.objects[0].file),'corrupt');
    assert.throws(()=>verifySourceMediaBackup(f.destination,f.data));assert.throws(()=>restoreSourceMediaBackup(f.destination,f.data));
    const wrongOwner=structuredClone(f.data);wrongOwner.tables.library_items[0].media_key='b'.repeat(32)+'/song';assert.throws(()=>sourceMediaPlan(wrongOwner,f.source),/Unknown source/);
  }finally{f.close();}
});
test('R2 source provider sends only bounded conditional GETs; no D1/PUT/DELETE or retry',async()=>{
  const f=fixture();try{
    const [entry]=sourceMediaPlan(f.data,f.source).r2,calls=[];
    const reader=cloudflareMediaReader({tokenProvider:()=> 'fixture-only',fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(r2,{headers:{ETag:'"'+entry.etag+'"','Content-Type':'audio/mpeg'}});}});
    assert.deepEqual((await reader.read(entry)).bytes,r2);assert.equal(reader.requests,1);assert.equal(calls[0].options.method,'GET');assert.ok(calls[0].url.includes('/r2/buckets/learn-english-media/objects/'));
    assert.equal(calls[0].options.headers['If-Match'],'"'+entry.etag+'"');assert.equal(calls[0].options.redirect,'error');assert.ok(!('body' in calls[0].options));
    await assert.rejects(reader.read({...entry,key:owner+'/account-state.json'}));assert.equal(calls.length,1);
    const changed=cloudflareMediaReader({tokenProvider:()=> 'fixture-only',fetchImpl:async()=>new Response(Buffer.from('different data'),{headers:{ETag:'changed'}})});
    await assert.rejects(changed.read(entry));assert.equal(changed.requests,1);
    let attempts=0;const failed=cloudflareMediaReader({tokenProvider:()=> 'fixture-only',fetchImpl:async()=>{attempts++;throw new Error('offline');}});
    await assert.rejects(failed.read(entry),/no automatic retry/);assert.equal(attempts,1);
  }finally{f.close();}
});
