import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
import {workbenchMigrationPlan} from '../ops/learning-workbench-migration-plan.mjs';
import {learningWorkbenchReadiness} from '../src/learning-workbench-schema.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';
import {learningWorkbenchAPI} from '../src/learning-workbench-api.mjs';
import {quizR2MediaStore,WORKBENCH_TEST_BUCKET} from '../src/quiz-r2-media-store.mjs';
import {createLearningWorkbenchFactory} from '../src/learning-workbench-services.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {rehearseWorkbench} from '../ops/rehearse-learning-workbench.mjs';
import {LOCAL_SPEECH_RUBRIC,LOCAL_LANGUAGE_RUBRIC} from '../ops/local-speech-provider.mjs';
import {QuizGenerationService} from '../src/quiz-generation.mjs';
const rejects=(promise,status)=>assert.rejects(promise,error=>error.status===status);
async function readyFixture(){
  const f=await fixture({d1:true,extendedLifecycle:true});
  for(const step of workbenchMigrationPlan().steps.slice(1))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8'));
  return f;
}
test('author API preserves lesson-only drafts, returned revisions, ownership and paged origins',async()=>{
  const f=await readyFixture();try{
    const services=await createLearningWorkbenchFactory({inspect:async()=>{throw Error('No media.');}})({db:f.db,actor:actors.student});
    const call=async(path,payload,actor=actors.student,writable=true)=>learningWorkbenchAPI(new Request('https://test.invalid/api/learning-workbench'+path,{method:payload?'POST':'GET',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})}),{actor,services,writable});
    const input=body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,type:'Choice',content:{explanation:'Light rain.',items:[{prompt:'What is drizzle?',options:['Light rain','A storm'],answer:0}]}});
    const q=await(await call('/proposals',input)).json();assert.equal((await(await call('/proposals',input)).json()).id,q.id);
    const page=await(await call('/mine?offset=0')).json();assert.equal(page.quizzes[0].origin.lessonName,'Weather');assert.equal(page.quizzes[0].id,q.id);assert.equal(page.nextOffset,null);
    assert.equal((await(await call('/mine',null,actors.other)).json()).quizzes.length,0);
    await rejects(call('/mine?offset=-1'),400);await rejects(call('/mine?offset=0&offset=1'),400);
    await rejects(call('/proposals',body({...input,mutationId:crypto.randomUUID(),cardId:3})),403);
    await rejects(call('/proposals/'+q.id+'/edit',body({expectedRevision:1,content:input.content}),actors.other),403);
    await rejects(call('/proposals/'+q.id+'/submit',body({expectedRevision:1}),actors.student,false),503);
    await call('/proposals/'+q.id+'/submit',body({expectedRevision:1}));
    await call('/proposals/'+q.id+'/return',body({expectedRevision:2,comment:'Clarify the question.'}),actors.outsider);
    const updated={...input.content,explanation:'Drizzle is fine, light rain.'};
    await call('/proposals/'+q.id+'/edit',body({expectedRevision:3,content:updated}));
    await rejects(call('/proposals/'+q.id+'/edit',body({expectedRevision:3,content:input.content})),409);
    await call('/proposals/'+q.id+'/submit',body({expectedRevision:4}));
    await call('/proposals/'+q.id+'/approve',body({expectedRevision:5,checks:{meaning:true,answers:true,level:true,media:false}}),actors.teacher);
    await rejects(call('/proposals/'+q.id+'/edit',body({expectedRevision:6,content:updated})),403);
    const final=await(await call('/proposals/'+q.id)).json();assert.equal(final.quiz.state,'approved');assert.equal(final.quiz.author.id,actors.student.id);assert.ok(final.quiz.history.some(row=>row.action==='return'));
    await f.draft();const first=await services.review.mine(actors.student,{limit:1,withPage:true});assert.equal(first.nextOffset,1);
    const second=await services.review.mine(actors.student,{limit:1,offset:1,withPage:true});assert.notEqual(first.quizzes[0].id,second.quizzes[0].id);
  }finally{f.close();}
});
test('explicit preparation queues only missing types and never starts inference or bypasses gates',async()=>{
  const f=await readyFixture();let calls=0,enabled=true,remaining=5;try{
    const base={inspect:async()=>{throw Error('No media.');}},openPreparation=async({review})=>({generation:new QuizGenerationService({review,worker:actors.dev,resolveActor:async()=>actors.teacher,generate:async()=>{calls++;throw Error('No inference allowed.');}}),availability:async()=>({enabled,remaining})});
    const services=await createLearningWorkbenchFactory({...base,openPreparation})({db:f.db,actor:actors.teacher});
    const ctx={groupId:1,lessonId:1,cardId:1,senseId:f.senseId},input=body({...ctx,types:['Choice','Gap','Match','Listen']});
    await f.draft();
    const call=(path,actor=actors.teacher,payload,writable=true)=>learningWorkbenchAPI(new Request('https://test.invalid/api/learning-workbench'+path,{method:payload?'POST':'GET',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})}),{actor,services,writable});
    assert.ok((await(await call('/status')).json()).features.includes('preparation'));
    await rejects(call('/kit/fill',actors.student,input),403);await rejects(call('/kit/fill',actors.teacher,input,false),503);
    const result=await(await call('/kit/fill',actors.outsider,input)).json();assert.equal(result.ids.length,1);
    assert.deepEqual((await(await call('/kit/fill',actors.outsider,input)).json()).ids,result.ids);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_generation_jobs').get().n,1);assert.equal(calls,0);
    assert.equal((await services.kits.coverage(actors.teacher,ctx)).types.find(row=>row.type==='Choice').status,'preparing');
    remaining=0;await rejects(call('/kit/fill',actors.teacher,body({...ctx,types:['Type']})),409);
    remaining=5;enabled=false;await rejects(call('/kit/fill',actors.dev,body({...ctx,types:['Type']})),409);
    const off=await createLearningWorkbenchFactory(base)({db:f.db,actor:actors.dev});assert.equal(off.kits.generation,null);
    await rejects(createLearningWorkbenchFactory({...base,openPreparation:async()=>({generation:{review:f.service},availability:async()=>({enabled:true,remaining:1})})})({db:f.db,actor:actors.dev}),503);
  }finally{f.close();}
});
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
test('lesson speech, training and comparison use read-only authenticated routes with strict queries',async()=>{
  const id=crypto.randomUUID(),repeatId=crypto.randomUUID(),calls=[],speech={rubrics:[],providers:{inspect:async()=>{throw Error('Off.');}},
    lessonCatalog:async(actor,context)=>{calls.push(['lesson',actor.id,context]);return {tasks:[],contexts:[]};},
    training:async(actor,attemptId)=>{calls.push(['training',actor.id,attemptId]);return {attemptId,focus:[]};},
    compare:async(actor,attemptId,other)=>{calls.push(['compare',actor.id,attemptId,other]);return {metrics:{}};}};
  const call=path=>learningWorkbenchAPI(new Request('https://test.invalid/api/learning-workbench'+path),{actor:actors.student,services:{speech},writable:false});
  assert.equal((await(await call('/speech/tasks?groupId=1&lessonId=1')).json()).trainingAvailable,true);
  assert.equal((await(await call('/speech/attempts/'+id+'/training')).json()).attemptId,id);
  await call('/speech/attempts/'+id+'/compare?attemptId='+repeatId);
  assert.deepEqual(calls,[['lesson',actors.student.id,{groupId:1,lessonId:1}],['training',actors.student.id,id],['compare',actors.student.id,id,repeatId]]);
  await rejects(call('/speech/tasks?groupId=1&lessonId=1&cardId=1'),400);
  await rejects(call('/speech/attempts/'+id+'/training?actor=dev'),400);
  await rejects(call('/speech/attempts/'+id+'/compare?attemptId='+repeatId+'&attemptId='+repeatId),400);
});
test('shared review API keeps global staff access, origin grouping, CAS and self-approval restrictions',async()=>{
  const f=await readyFixture();try{
    const services=await createLearningWorkbenchFactory({inspect:async()=>{throw Error('No media expected.');}})({db:f.db,actor:actors.teacher});
    const proposal=await f.draft();await f.service.submit(actors.student,proposal.id,body({expectedRevision:1}));
    const call=(path,actor=actors.teacher,payload,writable=true)=>learningWorkbenchAPI(new Request('https://test.invalid/api/learning-workbench'+path,{method:payload?'POST':'GET',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})}),{actor,services,writable});
    for(const actor of [actors.teacher,actors.outsider,actors.dev]){const data=await(await call('/queue?offset=0',actor)).json();assert.equal(data.quizzes.length,1);assert.equal(data.quizzes[0].origin.groupName,'A1 Monday');assert.equal(data.quizzes[0].origin.lessonName,'Weather');assert.equal(data.quizzes[0].origin.word,'drizzle');}
    await rejects(call('/queue',actors.student),403);await rejects(call('/queue?offset=0&offset=1'),400);
    assert.equal((await(await call('/queue?offset=100')).json()).quizzes.length,0);
    await rejects(call('/proposals/'+proposal.id,actors.other),403);
    const returned=body({expectedRevision:2,comment:'Please clarify the context.'});await rejects(call('/proposals/'+proposal.id+'/return',actors.outsider,returned,false),503);
    await call('/proposals/'+proposal.id+'/return',actors.outsider,returned);
    await rejects(call('/proposals/'+proposal.id+'/approve',actors.teacher,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true}})),409);
    const {quiz}=await(await call('/proposals/'+proposal.id)).json();assert.equal(quiz.state,'returned');assert.equal(quiz.history.at(-1).details.comment,returned.comment);
    const own=await f.draft(actors.teacher);await f.service.submit(actors.teacher,own.id,body({expectedRevision:1}));
    await rejects(call('/proposals/'+own.id+'/approve',actors.teacher,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true}})),403);
  }finally{f.close();}
});
test('speech assembly requires explicit trusted configuration and never initializes or selects providers',async()=>{
  const f=await readyFixture();try{
    const base={inspect:async()=>({kind:'audio',duration:1,width:0,height:0})},configuration={enabled:true,workerId:actors.dev.id,resolveActor:async()=>actors.dev,authorize:async()=>false,rubrics:[LOCAL_SPEECH_RUBRIC],languageRubric:LOCAL_LANGUAGE_RUBRIC,budgets:{audio:{day:60,month:120},language:{day:2,month:4}}};
    const disabled=await createLearningWorkbenchFactory({...base,speech:{...configuration,enabled:false}})({db:f.db,actor:actors.student});assert.equal(disabled.speech,undefined);
    const active=await createLearningWorkbenchFactory({...base,speech:configuration})({db:f.db,actor:actors.student});assert.ok(active.speech);assert.ok(active.transcripts);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_provider_configuration').get().n,0);
    await assert.rejects(active.speech.providers.inspect(actors.dev));
    await rejects(createLearningWorkbenchFactory({...base,speech:{...configuration,resolveActor:async()=>({...actors.dev,active:0})}})({db:f.db,actor:actors.student}),503);
    await rejects(createLearningWorkbenchFactory({...base,speech:{...configuration,resolveActor:null}})({db:f.db,actor:actors.student}),503);
    await rejects(createLearningWorkbenchFactory({...base,speech:{...configuration,authorize:null}})({db:f.db,actor:actors.student}),503);
  }finally{f.close();}
});
test('main session advertises the UI only when the server flag and trusted factory both exist',async()=>{
  const env={DB:{prepare(){throw Error('Unexpected SQL.');}},STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid'},request=new Request('https://test.invalid/api/me');
  const base={accountWorker:{fetch:async()=>Response.json({user:actors.student})},studyDatabase:()=>{throw Error('Session capability must not query Study.');}};
  const unwired=integratedWorker(base),wired=integratedWorker({...base,openWorkbench:async()=>{throw Error('Session must not construct services.');}});
  for(const [app,settings,expected] of [[unwired,env,undefined],[unwired,{...env,LEARNING_WORKBENCH_ENABLED:'true'},undefined],[wired,env,undefined],[wired,{...env,LEARNING_WORKBENCH_ENABLED:'true'},true]]){
    const response=await app.fetch(request,settings);assert.equal(response.status,200);assert.equal((await response.json()).migrationCapabilities.learningWorkbench,expected);
  }
});
test('session media links use authenticated routes instead of isolated preview routes',async()=>{
  const id=crypto.randomUUID();
  const response=await learningWorkbenchAPI(new Request('https://test.invalid/api/learning-workbench/sessions/'+id),{actor:actors.student,services:{sessions:{get:async()=>({questions:[{prompt:'Watch',mediaUrl:'/local/kit-sessions/'+id+'/media/0'}]})}}});
  assert.equal((await response.json()).questions[0].mediaUrl,'/api/learning-workbench/sessions/'+id+'/media/0');
});
test('trusted composition serves pinned practice sessions without changing legacy quizzes or enabling providers',async()=>{
  const f=await readyFixture();try{
    assert.throws(()=>createLearningWorkbenchFactory(),/inspector/);
    const open=createLearningWorkbenchFactory({inspect:async()=>{throw Error('No media inspection expected.');}}),services=await open({db:f.db,actor:actors.student});
    assert.deepEqual(Object.keys(services).sort(),['kits','media','review','sessions']);
    const proposal=await f.draft();await f.service.submit(actors.student,proposal.id,body({expectedRevision:1}));
    await f.service.approve(actors.teacher,proposal.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true}}));
    const call=async(path,data,actor=actors.student)=>learningWorkbenchAPI(new Request('https://test.invalid/api/learning-workbench'+path,{method:data?'POST':'GET',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),{actor,services,writable:true});
    const operation=body({cardId:1,senseId:f.senseId,versionId:proposal.id,mode:'practice'}),created=await(await call('/sessions',operation)).json();
    assert.equal((await(await call('/sessions',operation)).json()).id,created.id);
    const session=await(await call('/sessions/'+created.id)).json();assert.equal(session.content,undefined);assert.equal(session.type,'Gap');
    await rejects(call('/sessions/'+created.id,null,actors.other),404);
    await call('/sessions/'+created.id+'/submit',body({expectedRevision:session.revision,responses:['drizzle']}));
    assert.equal((await(await call('/sessions/'+created.id)).json()).correctCount,1);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM quizzes').get().n,1);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_provider_configuration').get().n,0);
    await rejects(services.review.createDraft(actors.student,body({cardId:3,senseId:f.senseId})),400);
  }finally{f.close();}
});
test('local migration rehearsal preserves source/schema/rows and verifies restore on disposable clones',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'workbench-source-test-')),sourcePath=join(directory,'source.sqlite');let report;
  try{
    const source=new DatabaseSync(sourcePath);applyLearningSchema(source);
    source.exec("INSERT INTO cards(id,scope,en,word_key,ru) VALUES(1,'shared','legacy','legacy','example')");source.close();
    const before=readFileSync(sourcePath);report=await rehearseWorkbench(sourcePath);
    assert.deepEqual(readFileSync(sourcePath),before);assert.equal(report.legacyRowsUnchanged,true);assert.equal(report.legacySchemaUnchanged,true);assert.equal(report.backupRestoreVerified,true);assert.equal(report.productionApproved,false);
    const copy=new DatabaseSync(join(report.directory,'candidate.sqlite'),{readOnly:true});assert.equal(copy.prepare('SELECT en FROM cards').get().en,'legacy');copy.close();
    await assert.rejects(rehearseWorkbench(join(report.directory,'candidate.sqlite')),/baseline\/upgrade/);
  }finally{if(report)rmSync(report.directory,{recursive:true,force:true});rmSync(directory,{recursive:true,force:true});}
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
