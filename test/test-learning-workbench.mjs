import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
import {workbenchMigrationPlan} from '../ops/learning-workbench-migration-plan.mjs';
import {learningWorkbenchReadiness} from '../src/learning-workbench-schema.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';
import {learningWorkbenchAPI} from '../src/learning-workbench-api.mjs';
import {quizR2MediaStore,WORKBENCH_TEST_BUCKET} from '../src/quiz-r2-media-store.mjs';
const rejects=(promise,status)=>assert.rejects(promise,error=>error.status===status);
async function readyFixture(){
  const f=await fixture({d1:true,extendedLifecycle:true});
  for(const step of workbenchMigrationPlan().steps.slice(1))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8'));
  return f;
}
test('migration manifest and readiness inspect isolated schema without applying changes',async()=>{
  const f=await readyFixture();try{
    const plan=workbenchMigrationPlan();assert.equal(plan.steps.length,13);assert.equal(plan.applied,false);assert.ok(plan.steps.every(step=>/^[a-f0-9]{64}$/.test(step.sha256)));
    const before=f.sql.prepare('SELECT total_changes() AS n').get().n;
    const ready=await learningWorkbenchReadiness(f.db);assert.equal(ready.ready,true,JSON.stringify(ready));assert.equal(ready.productionApproved,false);
    assert.equal(f.sql.prepare('SELECT total_changes() AS n').get().n,before);
    f.sql.exec('DROP TRIGGER qr_speech_text_immutable');assert.equal((await learningWorkbenchReadiness(f.db)).ready,false);
  }finally{f.close();}
  const old=await fixture({d1:true});try{assert.equal((await learningWorkbenchReadiness(old.db)).ready,false);}finally{old.close();}
});
test('integrated boundary uses existing actor, fails closed and never recovers on read-only history',async()=>{
  const f=await readyFixture();let actor=actors.student,opens=0,reads=0;try{
    const raw={prepare(){return {bind(){return this;},all:async()=>({results:[]}),first:async()=>null};}};
    const worker=integratedWorker({authenticate:async()=>actor,studyDatabase:()=>{reads++;return f.db;},openWorkbench:async({db,writable,actor:trusted})=>{
      opens++;assert.equal(trusted,actor);if(!writable)await rejects(db.atomic([]),503);
      return {review:f.service,speech:{history:async(who,id,options)=>{assert.equal(who,actor);assert.equal(options.recover,false);return {attempts:[]};}}};
    }});
    const env={DB:raw,STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid',LEARNING_WORKBENCH_ENABLED:'true'};
    const call=(path='/status',settings=env,data,origin='https://test.invalid')=>worker.fetch(new Request('https://test.invalid/api/learning-workbench'+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),settings);
    assert.equal((await call('/status',{...env,LEARNING_WORKBENCH_ENABLED:'false'})).status,404);assert.equal(reads,0);
    for(const value of [null,{...actors.student,active:0},{...actors.student,revoked:true},{...actors.student,role:'ROOT'}]){actor=value;assert.equal((await call()).status,401);}
    assert.equal(reads,0);actor=actors.student;
    assert.equal((await call('/proposals',env,body())).status,503);assert.equal(reads,0);
    assert.equal((await call()).status,200);
    assert.equal((await call('/speech/tasks/'+crypto.randomUUID()+'/history')).status,200);
    assert.equal((await call('/queue')).status,403);
    assert.equal((await call('/status?role=DEVELOPER')).status,400);
    const writes={...env,STAGE_WRITES:'true',LEARNING_WORKBENCH_WRITES:'true'},before=opens;
    assert.equal((await call('/proposals',writes,body(),'https://evil.invalid')).status,403);assert.equal(opens,before);
    assert.equal((await call('/proposals',writes,body({actor:actors.dev,role:'DEVELOPER'}))).status,400);
    const unwired=integratedWorker({authenticate:async()=>actors.dev});
    assert.equal((await unwired.fetch(new Request('https://test.invalid/api/learning-workbench/status'),writes)).status,503);
  }finally{f.close();}
});
test('API rejects malformed queries, unsupported methods and absent services',async()=>{
  const call=(path,method='GET')=>learningWorkbenchAPI(new Request('https://test.invalid/api/learning-workbench'+path,{method}),{actor:actors.student,services:{}});
  await rejects(call('/kit?cardId=1&cardId=2'),400);await rejects(call('/kit?cardId=1&groupId=1'),400);
  await rejects(call('/status','DELETE'),405);await rejects(call('/queue'),503);await rejects(call('/status','HEAD'),405);
});
function bucketFixture(){
  const objects=new Map();return {objects,
    async put(key,bytes,options){assert.equal(options.onlyIf.get('If-None-Match'),'*');if(objects.has(key))return null;const object={bytes:bytes.slice(),size:bytes.length,httpMetadata:options.httpMetadata,customMetadata:options.customMetadata};objects.set(key,object);return {...object};},
    async get(key){const object=objects.get(key);return object?{...object,body:new Blob([object.bytes]).stream()}:null;},
    async head(key){return objects.get(key)||null;},async delete(key){objects.delete(key);},
  };
}
test('dedicated R2 contract is off by default, immutable, bounded and validates the stored snapshot',async()=>{
  const bucket=bucketFixture(),bytes=new Uint8Array([1,2,3,4]),hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex'),key='quiz-media/'+crypto.randomUUID()+'/'+hash;
  const options={enabled:true,bucket,bucketName:WORKBENCH_TEST_BUCKET},store=quizR2MediaStore(options);
  await rejects(quizR2MediaStore({...options,enabled:false}).get(key),503);
  await rejects(quizR2MediaStore({...options,bucketName:'existing-production-bucket'}).get(key),503);
  await rejects(quizR2MediaStore({...options,forbiddenBucket:bucket}).get(key),503);
  await rejects(store.get('../secret'),503);await rejects(store.putImmutable(key,new Uint8Array([9]),{mime:'audio/wav'}),503);
  await store.putImmutable(key,bytes,{mime:'audio/wav'});await store.putImmutable(key,bytes,{mime:'audio/wav'});assert.equal(bucket.objects.size,1);
  const reopened=quizR2MediaStore(options),object=await reopened.get(key,{range:new Headers({Range:'bytes=1-2'})});
  assert.equal((await reopened.head(key)).size,4);assert.deepEqual([...object.body],[2,3]);
  const headers=new Headers();object.writeHttpMetadata(headers);assert.equal(headers.get('Content-Type'),'audio/wav');
  bucket.objects.values().next().value.bytes[0]=9;await assert.rejects(reopened.get(key));
  await reopened.delete(key);assert.equal(await reopened.get(key),null);
});
