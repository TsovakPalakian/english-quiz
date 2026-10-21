import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
import {GenerationQuota} from '../src/generation-quota.mjs';
import {LanguageProviders} from '../src/language-providers.mjs';
import {validateGenerationSource} from '../src/quiz-generation-metadata.mjs';
import {StoredQuizIndependentReview} from '../src/stored-quiz-independent-review.mjs';
import {createIndependentQuizReviewer,IndependentReviewIssue,REVIEW_DIMENSIONS} from '../src/quiz-independent-review.mjs';
const source={task:'review',adapterId:'a',provider:'fixture',model:'a',version:'v1',locale:'en-US',mode:'text',configurationRevision:2};
const code=expected=>error=>error.code===expected;
async function setup({limit=2,d1=false}={}){
  const f=await fixture({d1});
  for(const migration of ['003_generation_quota','004_quota_limit_changes','006_independent_reviews','007_independent_review_recovery'])f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+migration+'.sql',import.meta.url),'utf8'));
  const quota=new GenerationQuota(f.db,{now:()=>10000});await quota.initialize(actors.dev,{provider:'fixture',windowMs:1000,requestLimit:limit});
  const draft=await f.draft();return {...f,quota,id:draft.id};
}
function registry(quota,invoke,authorize=async()=>true){
  const service=new LanguageProviders({quota,authorize,adapters:['a','b'].map(id=>({id,provider:'fixture',model:id,version:'v1',billing:'self-hosted',
    capabilities:['generation','review'].map(task=>({task,locales:['en-US'],modes:['text']})),invoke,validate:value=>value}))});
  const select=(task,id)=>service.configure(actors.dev,{expectedRevision:service.inspect(actors.dev).revision,selections:{[task]:id?{adapterId:id,locale:'en-US',mode:'text'}:null}});
  select('generation','a');select('review','a');return {service,select};
}
const complete=request=>({text:JSON.stringify({fingerprint:request.checked.fingerprint,revision:request.checked.revision,status:'reviewed',
  dimensions:Object.fromEntries(REVIEW_DIMENSIONS.map(key=>[key,'not_assessed'])),findings:[]})});

test('mixed generation/review clients reserve one provider limit atomically and preserve old source validation',async()=>{
  for(const d1 of [false,true]){const f=await setup({d1});try{
    const another=new GenerationQuota(f.db,{now:()=>10000});
    const results=await Promise.allSettled(Array.from({length:12},(_,n)=>(n%2?another:f.quota).reserve({...source,task:n%2?'review':'generation',model:'model-'+n})));
    assert.equal(results.filter(result=>result.status==='fulfilled').length,2);
    assert.ok(results.filter(result=>result.status==='rejected').every(result=>result.reason.code==='quota_or_access_denied'));
    assert.equal((await another.summary(actors.teacher,'fixture')).remaining,0);
    const log=await f.quota.history(actors.dev,'fixture');assert.equal(log.reservations.length,2);assert.ok(log.reservations.every(row=>['review','generation'].includes(row.source.task)));
    assert.throws(()=>validateGenerationSource(source));
    await assert.rejects(f.quota.reserve({...source,task:'tts'}));
    assert.deepEqual(Object.keys(await f.quota.summary(actors.teacher,'fixture')).sort(),['provider','remaining','requestLimit','used','windowEnd'].sort());
    for(const actor of [actors.student,{...actors.teacher,active:false},{...actors.dev,revoked:true}])await assert.rejects(f.quota.summary(actor,'fixture'),code('teacher_required'));
  }finally{f.close();}}
});

test('review model changes and Off/On cannot reset shared usage or invoke a fallback',async()=>{
  const f=await setup();try{
    let calls=0;const {service,select}=registry(f.quota,async()=>{calls++;return {};});
    await service.execute('generation',{});select('review','b');await service.execute('review',{});
    select('review',null);await assert.rejects(service.execute('review',{}),code('provider_disabled'));
    select('review','a');await assert.rejects(service.execute('review',{}),code('quota_or_access_denied'));
    assert.equal(calls,2);assert.equal((await f.quota.inspect(actors.dev,'fixture')).used,2);
    const restart=new GenerationQuota(f.db,{now:()=>10000});await restart.initialize(actors.dev,{provider:'fixture',windowMs:1000,requestLimit:2});
    assert.equal((await restart.inspect(actors.dev,'fixture')).remaining,0);
    const {reservations}=await restart.history(actors.dev,'fixture');assert.deepEqual(new Set(reservations.map(row=>row.source.task)),new Set(['generation','review']));
  }finally{f.close();}
});

test('review cancellation while reserving releases only the unstarted hold',async()=>{
  const f=await setup({limit:1});let release;
  try{
    const gate=new Promise(resolve=>release=resolve);let reserved,calls=0;
    const ready=new Promise(resolve=>reserved=resolve);
    const quota={reserve:async(...args)=>{const id=await f.quota.reserve(...args);reserved();await gate;return id;},start:id=>f.quota.start(id),release:id=>f.quota.release(id)};
    const {service}=registry(quota,async()=>{calls++;return {};});const controller=new AbortController();
    const executing=service.execute('review',{}, {signal:controller.signal});await ready;controller.abort();
    await assert.rejects(executing,code('cancelled'));release();await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(calls,0);assert.equal((await f.quota.inspect(actors.dev,'fixture')).remaining,1);
  }finally{release?.();f.close();}
});

test('review failures and timeouts after dispatch retain quota, malformed input before dispatch does not',async()=>{
  const f=await setup({limit:2});let release;
  try{
    let calls=0;const gate=new Promise(resolve=>release=resolve);
    const {service}=registry(f.quota,async()=>{calls++;await gate;return {};});
    await assert.rejects(service.execute('review',{callback:()=>{}}),code('provider_failed'));assert.equal((await f.quota.inspect(actors.dev,'fixture')).used,0);
    await assert.rejects(service.execute('review',{}, {timeoutMs:10}),code('timeout'));release();await new Promise(resolve=>setTimeout(resolve,10));
    const broken=registry(f.quota,async()=>{calls++;throw Error('private provider detail');});
    await assert.rejects(broken.service.execute('review',{}),code('provider_failed'));
    await assert.rejects(broken.service.execute('review',{}),code('quota_or_access_denied'));
    assert.equal(calls,2);assert.equal((await f.quota.inspect(actors.dev,'fixture')).used,2);
  }finally{release?.();f.close();}
});

test('review replay spends nothing extra, manual retry spends one, exhaustion is recorded without another call',async()=>{
  const f=await setup({limit:1,d1:true});try{
    let calls=0;const {service}=registry(f.quota,async()=>{calls++;throw Error('synthetic failure');});
    const stored=new StoredQuizIndependentReview(f.service,{reviewer:async input=>{
      try{const {signal,...payload}=input;return (await service.execute('review',payload,{signal})).data;}
      catch(error){throw new IndependentReviewIssue(error.code==='quota_or_access_denied'?'quota_exceeded':'review_unavailable');}
    }});
    const operation=body({expectedRevision:1,level:null});
    const first=await stored.run(actors.teacher,f.id,operation);assert.equal(first.error,'review_unavailable');
    assert.equal((await stored.run(actors.teacher,f.id,operation)).id,first.id);assert.equal(calls,1);
    const retry=await stored.retry(actors.dev,f.id,first.id,body({expectedRevision:1}));assert.equal(retry.error,'quota_exceeded');assert.equal(calls,1);
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).used,1);assert.equal((await stored.history(actors.teacher,f.id)).attempts.length,2);
    await f.quota.updateLimit(actors.dev,'fixture',body({expectedRevision:1,requestLimit:2,reason:'Allow one reviewed retry.'}));
    await stored.retry(actors.teacher,f.id,retry.id,body({expectedRevision:1}));assert.equal(calls,2);
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).remaining,0);
  }finally{f.close();}
});

test('recovering a dispatched pending check does not refund the uncertain call',async()=>{
  const f=await setup({limit:1});let release;
  try{
    let started,time=1000;const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
    const {service}=registry(f.quota,async(input,{signal,source})=>{
      started();await gate;
      return createIndependentQuizReviewer({enabled:true,source:{provider:source.provider,model:source.model,version:source.version},complete:async request=>complete(request)})({...input,signal});
    });
    const stored=new StoredQuizIndependentReview(f.service,{now:()=>time,timeoutMs:10000,reviewer:async({signal,...input})=>(await service.execute('review',input,{signal})).data});
    const running=stored.run(actors.teacher,f.id,body({expectedRevision:1}));await entered;time=11000;
    assert.equal((await stored.history(actors.dev,f.id)).attempts[0].error,'interrupted');
    release();assert.equal((await running).error,'interrupted');assert.equal((await f.quota.inspect(actors.dev,'fixture')).used,1);
  }finally{release?.();f.close();}
});
