import test from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SELECTION_KEY,readDatabaseSelection,changeDatabaseSelection,withDatabaseSelection} from '../src/database-selection.mjs';

const developer={id:'developer',role:'DEVELOPER'};
function storage(){
  let current=null,etag=0;
  return {async get(key){assert.equal(key,DATABASE_SELECTION_KEY);return current?{etag:String(etag),json:async()=>structuredClone(current)}:null;},
    async put(key,value,options){assert.equal(key,DATABASE_SELECTION_KEY);const condition=options.onlyIf;
      if(condition.etagMatches!==undefined?condition.etagMatches!==String(etag):!!current)return null;
      current=JSON.parse(value);return {etag:String(++etag)};
    }};
}
test('default is shared Turso selection and creates no new database or object',async()=>{
  const bucket=storage();assert.deepEqual(await readDatabaseSelection(bucket),{selection:{provider:'turso',revision:0,scope:'site'},etag:null});
});
test('global choice survives independent callers and supports reversal without copying data',async()=>{
  const bucket=storage(),checks=[];
  const change=(provider,revision)=>changeDatabaseSelection(bucket,{provider,expectedRevision:revision,actor:developer,verifyTarget:async target=>{checks.push(target);}});
  await change('neon',0);
  assert.equal((await readDatabaseSelection(bucket)).selection.provider,'neon');
  let opened=0;
  for(const id of ['first-user','second-user']){
    const env=await withDatabaseSelection({CONTENT_MEDIA:bucket,userId:id},{openNeon:async env=>{opened++;return {...env,adapter:'neon'};}});
    assert.equal(env.adapter,'neon');assert.equal(env.DATABASE_SELECTION.revision,1);
  }
  assert.equal(opened,2);await change('turso',1);
  assert.equal((await withDatabaseSelection({CONTENT_MEDIA:bucket})).DATABASE_SELECTION.provider,'turso');
  assert.deepEqual(checks,['neon','turso']);
});
test('failed readiness and unauthorized users never change shared selection',async()=>{
  const bucket=storage();
  for(const actor of [null,{id:'student',role:'USER'},{id:'teacher',role:'ADMIN'}])await assert.rejects(changeDatabaseSelection(bucket,{provider:'neon',expectedRevision:0,actor}),error=>error.status===403);
  await assert.rejects(changeDatabaseSelection(bucket,{provider:'neon',expectedRevision:0,actor:developer,verifyTarget:async()=>{throw new Error('unavailable');}}));
  assert.equal((await readDatabaseSelection(bucket)).selection.revision,0);
});
test('concurrent activation uses R2 CAS and rejects the stale administrator',async()=>{
  const bucket=storage();let release,entered;const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{entered=resolve;});
  const first=changeDatabaseSelection(bucket,{provider:'neon',expectedRevision:0,actor:developer,verifyTarget:async()=>{entered();await gate;}});
  await ready;
  await changeDatabaseSelection(bucket,{provider:'neon',expectedRevision:0,actor:developer,verifyTarget:async()=>{}});
  release();await assert.rejects(first,error=>error.status===409);
  await assert.rejects(changeDatabaseSelection(bucket,{provider:'turso',expectedRevision:0,actor:developer}),error=>error.status===409);
});
test('missing adapter, corrupt config or failed storage never silently falls back',async()=>{
  const bucket=storage();await changeDatabaseSelection(bucket,{provider:'neon',expectedRevision:0,actor:developer,verifyTarget:async()=>{}});
  await assert.rejects(withDatabaseSelection({CONTENT_MEDIA:bucket}),error=>error.status===503&&/did not fall back/.test(error.message));
  await assert.rejects(readDatabaseSelection({get:async()=>{throw new Error('secret');}}),error=>error.status===503&&!error.message.includes('secret'));
  await assert.rejects(readDatabaseSelection({get:async()=>({json:async()=>({provider:'unknown',revision:1,scope:'site'})})}),error=>error.status===503);
});
