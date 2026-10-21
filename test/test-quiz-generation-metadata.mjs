import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors,body,content} from './quiz-review-fixture.mjs';
import {QuizGenerationService} from '../src/quiz-generation.mjs';
import {QuizReviewService} from '../src/quiz-review.mjs';
import {validateGenerationMetadata} from '../src/quiz-generation-metadata.mjs';
import {createRoutedQuizGenerator} from '../src/workers-ai-quiz-provider.mjs';

const metadata=()=>({source:{task:'generation',adapterId:'workers-ai-quiz',locale:'en-US',mode:'text',provider:'cloudflare',model:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',version:'rest-v1-json-v1',configurationRevision:2},usage:{prompt_tokens:30,completion_tokens:20,total_tokens:50},instructionVersion:'quiz-contract-v1',generatedAt:'2026-10-21T10:00:00.000Z',contentRevision:1});
const input=(f,extra={})=>body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,type:'Gap',content,...extra});
async function setup({d1=false,generate=async()=>({content,generation:metadata()})}={}){
  const f=await fixture({d1});f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/002_generation_jobs.sql',import.meta.url),'utf8'));
  let now=10000;const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate,now:()=>now,backoffMs:1});
  const enqueue=()=>generation.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Gap']}));
  return {...f,generation,enqueue,advance:()=>{now+=100;}};
}
test('metadata validates an exact whitelist, immutable copy, timestamp and honest token counters',()=>{
  const original=metadata(),validated=validateGenerationMetadata(original);original.source.provider='changed';assert.equal(validated.source.provider,'cloudflare');
  for(const mutate of [v=>v.apiToken='secret',v=>v.source.accountId='private',v=>v.usage.prompt_tokens=-1,v=>v.usage.total_tokens=100,v=>v.generatedAt='yesterday',v=>v.contentRevision=2,v=>v.source.task='tts',v=>v.source.configurationRevision=0,v=>v.instructionVersion='bad\nversion',v=>v.usage=null]){
    const value=metadata();mutate(value);assert.throws(()=>validateGenerationMetadata(value),error=>error.status===400);
  }
  const unknown=metadata();unknown.usage={};assert.deepEqual(validateGenerationMetadata(unknown).usage,{},'Missing counters remain unknown, not invented zeroes');
});
test('generation content, metadata and creation event persist together in SQLite and the D1 compilation path',async()=>{
  for(const d1 of [false,true]){
    const f=await setup({d1});try{
      const old=JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all());await f.enqueue();await f.generation.runOne();
      const [job]=await f.generation.list(actors.teacher),q=await f.service.get(actors.teacher,job.versionId);
      assert.deepEqual(q.generation,metadata());assert.deepEqual(q.history[0].details.generation,metadata());assert.deepEqual(q.history[0].details.content,content);
      const cached=f.sql.prepare('SELECT candidate_json,candidate_generation_json FROM qr_generation_jobs').get();
      assert.deepEqual(JSON.parse(cached.candidate_json),content);assert.deepEqual(JSON.parse(cached.candidate_generation_json),metadata());
      const reopened=new QuizReviewService(f.db,{allowGlobalApproval:true});assert.deepEqual((await reopened.get(actors.teacher,q.id)).generation,metadata());
      assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all()),old);
    }finally{f.close();}
  }
});
test('receipt replay includes provenance and rejects reuse with a different model',async()=>{
  const f=await fixture();try{
    const value=input(f,{generation:metadata()}),q=await f.service.createGeneratedDraft(actors.dev,actors.teacher,value);
    assert.deepEqual(await f.service.createGeneratedDraft(actors.dev,actors.teacher,value),q);
    const changed=structuredClone(value);changed.generation.source.model='other-model';
    await assert.rejects(f.service.createGeneratedDraft(actors.dev,actors.teacher,changed),error=>error.status===409);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,1);
  }finally{f.close();}
});
test('failure while writing the creation event rolls back both content and metadata',async()=>{
  const f=await fixture();try{
    f.sql.exec("CREATE TRIGGER reject_generated_event BEFORE INSERT ON qr_events WHEN NEW.action='generated-for-review' BEGIN SELECT RAISE(ABORT,'immutable test failure'); END;");
    await assert.rejects(f.service.createGeneratedDraft(actors.dev,actors.teacher,input(f,{generation:metadata()})),error=>error.status===409);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_events').get().n,0);
  }finally{f.close();}
});
test('a crash after version creation reuses the cached source without a second model call',async()=>{
  let calls=0;const f=await setup({generate:async()=>{calls++;return {content,generation:metadata()};}});try{
    const create=f.service.createGeneratedDraft.bind(f.service);let crashed=false;
    f.service.createGeneratedDraft=async(...args)=>{const result=await create(...args);if(!crashed){crashed=true;throw new Error('Simulated crash after commit');}return result;};
    await f.enqueue();await f.generation.runOne();f.advance();await f.generation.runOne();
    const [job]=await f.generation.list(actors.teacher);assert.equal(job.state,'submitted');assert.equal(calls,1);
    assert.deepEqual((await f.service.get(actors.teacher,job.versionId)).generation,metadata());
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,1);assert.equal(f.sql.prepare("SELECT count(*) AS n FROM qr_events WHERE action='generated-for-review'").get().n,1);
  }finally{f.close();}
});
test('expired leases recover cached metadata even when a different generator is configured',async()=>{
  let calls=0;const f=await setup({generate:async()=>{calls++;return content;}});try{
    const {ids}=await f.enqueue();f.sql.prepare("UPDATE qr_generation_jobs SET state='running',attempts=1,lease_until=9999,lease_token='lost',candidate_json=?,candidate_generation_json=? WHERE id=?").run(JSON.stringify(content),JSON.stringify(metadata()),ids[0]);
    await f.generation.runOne();const [job]=await f.generation.list(actors.teacher);assert.equal(calls,0);assert.deepEqual((await f.service.get(actors.teacher,job.versionId)).generation,metadata());
  }finally{f.close();}
});
test('manual drafts cannot spoof generation; invalid worker metadata never creates a version',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.draft(actors.student,{generation:metadata()}),error=>error.status===400);
    const invalid=metadata();invalid.usage.apiToken='private';
    await assert.rejects(f.service.createGeneratedDraft(actors.dev,actors.teacher,input(f,{generation:invalid})),error=>error.status===400);
    await assert.rejects(f.service.createGeneratedDraft(actors.teacher,actors.teacher,input(f,{generation:metadata()})),error=>error.status===403);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,0);
    const manual=await f.draft();assert.equal((await f.service.get(actors.student,manual.id)).generation,null);
  }finally{f.close();}
});
test('metadata stays immutable after approval, remains private, and is not inherited by a manual revision',async()=>{
  const f=await fixture();try{
    const q=await f.service.createGeneratedDraft(actors.dev,actors.teacher,input(f,{generation:metadata()}));
    assert.throws(()=>f.sql.prepare('UPDATE qr_versions SET generation_json=NULL WHERE id=?').run(q.id),/immutable/);
    assert.deepEqual((await f.service.get(actors.outsider,q.id)).generation,metadata());await assert.rejects(f.service.get(actors.student,q.id),error=>error.status===403);
    await f.service.approve(actors.teacher,q.id,body({expectedRevision:1,checks:{meaning:true,answers:true,level:true}}));
    const [shared]=await f.service.sharedForCard(actors.student,1);assert.equal(Object.hasOwn(shared,'generation'),false);assert.equal(JSON.stringify(shared).includes('prompt_tokens'),false);
    const revision=await f.service.proposeRevision(actors.teacher,q.id,body({expectedRevision:2}));
    assert.equal((await f.service.get(actors.teacher,revision.id)).generation,null);assert.deepEqual((await f.service.get(actors.teacher,q.id)).generation,metadata());
    assert.throws(()=>f.sql.prepare('UPDATE qr_versions SET generation_json=? WHERE id=?').run(JSON.stringify({...metadata(),usage:{}}),q.id),/immutable/);
  }finally{f.close();}
});
test('routed metadata capture is opt-in and isolated across simultaneous requests',async()=>{
  const providers={execute:async(_,request)=>{
    if(request.meaning.en==='drizzle')await new Promise(resolve=>setTimeout(resolve,5));
    const source={...metadata().source,model:request.meaning.en,configurationRevision:request.meaning.en==='drizzle'?2:3};
    return {source,data:{usage:{},text:JSON.stringify({type:'Flip',meaning:request.meaning,content:{explanation:'Meaning.',items:[{front:request.meaning.en,back:request.meaning.translation}]}})}};
  }};
  const generate=createRoutedQuizGenerator({providers,includeMetadata:true});
  const meaning={en:'drizzle',translation:'rain',definition:'Light rain.',part_of_speech:'noun'};
  const [first,second]=await Promise.all([generate({type:'Flip',meaning}),generate({type:'Flip',meaning:{...meaning,en:'bank'}})]);
  assert.equal(first.generation.source.model,'drizzle');assert.equal(second.generation.source.model,'bank');assert.deepEqual(first.generation.usage,{});
  const legacy=await createRoutedQuizGenerator({providers})({type:'Flip',meaning});assert.deepEqual(legacy,first.content);
});
test('invalid cached provenance is discarded with the candidate rather than misattributed',async()=>{
  const f=await setup();try{
    const {ids}=await f.enqueue();f.sql.prepare('UPDATE qr_generation_jobs SET candidate_json=?,candidate_generation_json=? WHERE id=?').run(JSON.stringify(content),JSON.stringify({source:'invalid'}),ids[0]);
    await f.generation.runOne();const row=f.sql.prepare('SELECT * FROM qr_generation_jobs').get();
    assert.equal(row.issue,'invalid_content');assert.equal(row.candidate_json,null);assert.equal(row.candidate_generation_json,null);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,0);
  }finally{f.close();}
});
