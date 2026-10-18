import test from 'node:test';
import assert from 'node:assert/strict';
import {accountTransferWorker} from '../src/account-transfer.mjs';
function bucket(){const entries=new Map();return {entries,async get(key){const row=entries.get(key);return row?{...row,key,etag:'fixture',body:row.bytes,arrayBuffer:async()=>row.bytes.buffer.slice(row.bytes.byteOffset,row.bytes.byteOffset+row.bytes.byteLength),json:async()=>JSON.parse(new TextDecoder().decode(row.bytes))}:null;},async put(key,body,options={}){if(options.onlyIf?.etagDoesNotMatch==='*'&&entries.has(key))return null;const bytes=typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(body);entries.set(key,{bytes,httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{}});return {etag:'fixture'};},async list(){return {objects:[...entries.keys()].map(key=>({key})),truncated:false};}};}
function setup(role){const env={ACCOUNT_TRANSFER_ROLE:role,ACCOUNT_TRANSFER_FROZEN:'true',ACCOUNT_TRANSFER_KEY:btoa('t'.repeat(32)),ACCOUNT_TRANSFER_EXPIRES:String(Date.now()+60000),MEDIA:bucket(),CONTENT_MEDIA:bucket()},worker=accountTransferWorker({fetch:async()=>new Response('blocked')});
 return {env,call:body=>worker.fetch(new Request('https://fixture/__account-transfer',{method:'POST',headers:{Authorization:'Bearer '+env.ACCOUNT_TRANSFER_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)}),env,{}),upload:(bytes,metadata)=>worker.fetch(new Request('https://fixture/__account-transfer?action=media-put',{method:'POST',headers:{Authorization:'Bearer '+env.ACCOUNT_TRANSFER_KEY,'X-Transfer-Metadata':Buffer.from(JSON.stringify(metadata)).toString('base64')},body:bytes}),env,{})};}
const sha=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
test('private media transfer lists and downloads bytes with original metadata',async()=>{
 const f=setup('source');await f.env.MEDIA.put('fixture','hello',{httpMetadata:{contentType:'text/plain',cacheControl:'private'},customMetadata:{name:'sample'}});
 assert.equal((await f.call({action:'media-list',bucket:'MEDIA'})).status,200);
 const response=await f.call({action:'media-get',bucket:'MEDIA',key:'fixture'});assert.equal(response.status,200);assert.equal(await response.text(),'hello');
 const metadata=JSON.parse(Buffer.from(response.headers.get('X-Transfer-Metadata'),'base64').toString());assert.deepEqual(metadata.customMetadata,{name:'sample'});assert.equal(metadata.httpMetadata.contentType,'text/plain');
 assert.equal((await f.call({action:'media-list',bucket:'UNKNOWN'})).status,400);
});
test('target media import validates content and preserves metadata without overwriting',async()=>{
 const f=setup('target'),bytes=new TextEncoder().encode('fixture'),metadata={bucket:'CONTENT_MEDIA',key:'fixture',sha256:await sha(bytes),httpMetadata:{contentType:'text/plain'},customMetadata:{name:'sample'}};
 assert.equal((await f.upload(bytes,{...metadata,sha256:'invalid'})).status,400);assert.equal(f.env.CONTENT_MEDIA.entries.size,0);
 assert.equal((await f.upload(bytes,metadata)).status,200);assert.equal(f.env.CONTENT_MEDIA.entries.get('fixture').customMetadata.name,'sample');
 assert.equal((await f.upload(bytes,metadata)).status,200);
 const different=new TextEncoder().encode('different');assert.equal((await f.upload(different,{...metadata,sha256:await sha(different)})).status,409);
});
test('media operations require the correct role, frozen environment and transfer authorization',async()=>{
 const source=setup('source'),target=setup('target'),bytes=new TextEncoder().encode('x');
 assert.equal((await target.call({action:'media-list',bucket:'MEDIA'})).status,404);
 assert.equal((await source.upload(bytes,{})).status,404);
 delete source.env.ACCOUNT_TRANSFER_FROZEN;assert.equal((await source.call({action:'media-list',bucket:'MEDIA'})).status,409);
 source.env.ACCOUNT_TRANSFER_EXPIRES='1';assert.equal((await source.call({action:'media-list',bucket:'MEDIA'})).status,404);
});
test('persistent fence changes preserve the exact database selection and are role-bound',async()=>{
 for(const role of ['source','target']){
  const f=setup(role),key='system/database-selection-v1.json',selection={provider:'d1',revision:7,scope:'site',updatedBy:'fixture',accountTransferFrozen:role==='target'};await f.env.CONTENT_MEDIA.put(key,JSON.stringify(selection));
  assert.equal((await f.call({action:'media-fence',frozen:role==='source'})).status,200);
  assert.deepEqual(await(await f.env.CONTENT_MEDIA.get(key)).json(),{...selection,accountTransferFrozen:role==='source'});
  assert.equal((await f.call({action:'media-fence',frozen:role!=='source'})).status,403);
 }
});
