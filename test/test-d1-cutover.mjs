import test from 'node:test';
import assert from 'node:assert/strict';
import {studyClient} from '../src/study-database.mjs';
import {withDatabaseSelection} from '../src/database-selection.mjs';
import {chatStorageName,prepareChatDatabase} from '../src/chat-database.mjs';
import {databaseStatus,databaseAction} from '../src/database-administration.mjs';

const selection={provider:'d1',revision:2,scope:'site'};
const bucket={get:async()=>({etag:'2',json:async()=>selection})};
test('D1 selection uses only the dedicated educational binding, never auth or Learning',async()=>{
  const env=await withDatabaseSelection({CONTENT_MEDIA:bucket,DB_PROVIDER:'d1'});
  assert.equal(env.DB_PROVIDER,'d1');
  assert.throws(()=>studyClient({...env,DB:{prepare(){},batch(){}}}),e=>e.status===503);
  const binding={prepare(){},batch(){}};
  assert.equal(studyClient({...env,STUDY_DB:binding}).binding,binding);
});
test('D1 preserves Learning chat object names but remains isolated from Neon',async()=>{
  assert.equal(chatStorageName({DATABASE_SELECTION:selection},'alice'),'alice');
  assert.equal(chatStorageName({DATABASE_SELECTION:{...selection,provider:'neon'}},'alice'),'neon:v1:alice');
  const values=new Map([['_databaseScope',{provider:'d1',revision:1,scope:'site'}]]),store={baseEnv:{CONTENT_ENABLED:'true',CONTENT_MEDIA:bucket,CONTENT_SESSION_SECRET:'test'},get:k=>values.get(k),set:(k,v)=>values.set(k,v),ctx:{getWebSockets:()=>[]}};
  const request=new Request('https://internal/prepare',{headers:{'X-Chat-Internal':'test','X-Chat-Database':'d1','X-Chat-Database-Revision':'2'}});
  await prepareChatDatabase(store,request);assert.equal(values.get('_databaseScope').provider,'d1');
  values.set('_databaseScope',{provider:'neon',revision:1,scope:'site'});
  await assert.rejects(prepareChatDatabase(store,request),e=>e.status===403);
});
test('administration lists D1 and refuses switching back to a stale Learning snapshot',async()=>{
  const env={DATABASE_SELECTION:selection,STUDY_DB:{}};
  assert.ok(databaseStatus(env).providers.some(p=>p.id==='d1'&&p.active));
  await assert.rejects(databaseAction(env,{action:'activate',provider:'retired',expectedRevision:2},{actor:{id:'dev',role:'DEVELOPER'}}),e=>e.status===400);
});
