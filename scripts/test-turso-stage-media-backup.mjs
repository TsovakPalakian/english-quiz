import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stageMediaArchiveStore} from './turso-stage-media-backup.mjs';
const bytes=Buffer.from('%PDF-1.4\nsynthetic'),sha=createHash('sha256').update(bytes).digest('hex');
const key='stage-local/lessons/test/block/'+sha;
const data={version:1,testOnly:true,tables:{lesson_blocks:[{lesson_id:'test',id:'block',content_json:JSON.stringify({localMediaKey:key,fileId:'sf_'+createHash('sha256').update(key).digest('hex'),fileType:'application/pdf',name:'test.pdf'})}]}};
test('Stage media backup performs only exact test-bucket GETs, including archived references',async()=>{
  const calls=[],store=await stageMediaArchiveStore(data,{tokenProvider:()=> 'synthetic',fetchImpl:async(url,options)=>{
    calls.push({url,options});return new Response(bytes,{headers:{'Content-Type':'application/pdf'}});
  }});
  assert.equal(store.requests,1);assert.deepEqual(Buffer.from(store.readVerified(key).bytes),bytes);
  assert.ok(calls[0].url.includes('/buckets/learn-english-turso-test-media/objects/'+key));
  assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');assert.ok(!('body' in calls[0].options));
});
test('Stage backup rejects corrupt bytes, wrong MIME, unsafe ownership and never retries',async()=>{
  await assert.rejects(stageMediaArchiveStore(data,{tokenProvider:()=> 'synthetic',fetchImpl:async()=>new Response(Buffer.from('%PDF-1.4\nchanged'),{headers:{'Content-Type':'application/pdf'}})}),/checksum/);
  await assert.rejects(stageMediaArchiveStore(data,{tokenProvider:()=> 'synthetic',fetchImpl:async()=>new Response(bytes,{headers:{'Content-Type':'text/plain'}})}),/MIME/);
  const wrong=structuredClone(data);wrong.tables.lesson_blocks[0].lesson_id='different';
  await assert.rejects(stageMediaArchiveStore(wrong,{tokenProvider:()=>{throw Error('Should not request');}}),/different owner/);
  let attempts=0;await assert.rejects(stageMediaArchiveStore(data,{tokenProvider:()=> 'synthetic',fetchImpl:async()=>{attempts++;throw Error('offline');}}),/no automatic retry/);assert.equal(attempts,1);
});
