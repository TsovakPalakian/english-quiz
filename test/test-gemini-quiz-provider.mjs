import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGeminiQuizAdapter,GEMINI_QUIZ_MODEL} from '../src/gemini-quiz-provider.mjs';
import {createGeminiReviewAdapter} from '../src/gemini-review-provider.mjs';
import {createModelQuizGenerator} from '../src/quiz-generation-model.mjs';
import {createRoutedQuizGenerator} from '../src/workers-ai-quiz-provider.mjs';
import {LanguageProviders} from '../src/language-providers.mjs';
import {createConfiguredLanguageProviders} from '../src/configured-language-providers.mjs';
import {LanguageAccessPolicy} from '../src/language-access-policy.mjs';
import {QuizGenerationService} from '../src/quiz-generation.mjs';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
const meaning={en:'drizzle',translation:'light rain',definition:'Fine rain.',part_of_speech:'noun'};
const quiz={type:'Flip',meaning,content:{explanation:'Drizzle is light rain.',items:[{front:'drizzle',back:'light rain'}]}};
let request;
await createModelQuizGenerator({enabled:true,complete:async value=>{request=value;return JSON.stringify(quiz);}})({type:'Flip',meaning});
const reply=(value=quiz,extra={})=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:typeof value==='string'?value:JSON.stringify(value)}]}}],usageMetadata:{promptTokenCount:30,candidatesTokenCount:20,totalTokenCount:50},...extra});
const options={enabled:true,freeTierVerified:true,allowDataProcessing:true,apiKey:'fixture-key',termsRevision:'fixture-terms-v1'};
const adapter=extra=>createGeminiQuizAdapter({...options,fetchImpl:async()=>reply(),...extra});
const code=value=>error=>error.code===value;
function registry(row){const providers=new LanguageProviders({adapters:[row],authorize:async()=>true});providers.configure(actors.dev,{expectedRevision:1,selections:{generation:{adapterId:row.id,locale:'en-US',mode:'text'}}});return providers;}
test('Gemini remains opt-in, requires data consent and never leaks the key in metadata',async()=>{
  let calls=0;
  await assert.rejects(createGeminiQuizAdapter({fetchImpl:async()=>calls++}).invoke(request),code('provider_disabled'));
  for(const extra of [{allowDataProcessing:false},{termsRevision:null},{apiKey:''},{apiKey:'private\nkey'}])await assert.rejects(adapter({...extra,fetchImpl:async()=>calls++}).invoke(request),code('provider_not_configured'));
  assert.equal(calls,0);assert.throws(()=>registry(adapter({freeTierVerified:false})),code('paid_provider_blocked'));
  assert.ok(!JSON.stringify(registry(adapter()).inspect(actors.dev)).includes('fixture-key'));
  assert.throws(()=>adapter({model:'../../private'}),code('invalid_configuration'));
});
test('fixed Gemini endpoint sends bounded structured output without tools, redirects or client credentials',async()=>{
  let sent;const providers=registry(adapter({fetchImpl:async(url,init)=>{sent={url,init};return reply();}}));
  assert.deepEqual(await createRoutedQuizGenerator({providers})({type:'Flip',meaning}),quiz.content);
  assert.equal(sent.url,'https://generativelanguage.googleapis.com/v1beta/models/'+GEMINI_QUIZ_MODEL+':generateContent');
  assert.equal(sent.init.headers['x-goog-api-key'],'fixture-key');assert.equal(sent.init.redirect,'error');assert.equal(sent.init.credentials,'omit');
  const input=JSON.parse(sent.init.body);assert.equal(input.tools,undefined);assert.equal(input.generationConfig.maxOutputTokens,4096);
  assert.deepEqual(input.generationConfig.responseFormat.text.schema.properties.meaning.properties.en.enum,['drizzle']);
  assert.equal(input.generationConfig.responseFormat.text.mimeType,'APPLICATION_JSON');assert.ok(!sent.init.body.includes('fixture-key'));
  assert.match(providers.inspect(actors.dev).adapters[0].version,/^generate-content-json-v2\./);
});
test('invalid input and oversized UTF-8 context never reach Gemini',async()=>{
  let calls=0;const row=adapter({fetchImpl:async()=>calls++});
  for(const input of [{...request,actor:{email:'private@example.test'}},{...request,itemFields:['arbitrary']},{...request,maxItems:99}])await assert.rejects(row.invoke(input),code('invalid_request'));
  const long={...meaning,definition:'界'.repeat(2000)};
  await assert.rejects(createModelQuizGenerator({enabled:true,complete:value=>row.invoke(value)})({type:'Flip',meaning:long}),error=>error.code==='temporary_failure');
  assert.equal(calls,0);
});
test('Gemini review uses the same REST MIME enum and a new transport identity',async()=>{
  let calls=0;
  const row=createGeminiReviewAdapter({...options,model:GEMINI_QUIZ_MODEL,fetchImpl:async(_,init)=>{
    calls++;const payload=JSON.parse(init.body);
    assert.equal(payload.generationConfig.responseFormat.text.mimeType,'APPLICATION_JSON');
    assert.equal(payload.generationConfig.responseMimeType,undefined);
    const {checked,dimensions}=JSON.parse(payload.contents[0].parts[0].text);
    return reply('',{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({fingerprint:checked.fingerprint,revision:checked.revision,status:'reviewed',dimensions:Object.fromEntries(dimensions.map(key=>[key,'pass'])),findings:[]})}]}}]});
  }});
  const result=await row.invoke({type:'Gap',meaning,content:{explanation:'Light rain.',items:[{shown:'A fine ____ fell.',answer:'drizzle',hint:'Rain'}]},revision:1,level:'A1'});
  assert.equal(calls,1);assert.equal(result.result.requiresTeacherReview,true);assert.match(row.version,/^generate-content-json-v2\./);
});
test('HTTP errors are classified without automatic retries or upstream secret details',async()=>{
  for(const [status,expected] of [[429,'rate_limited'],[401,'provider_access_denied'],[403,'provider_access_denied'],[500,'provider_unavailable'],[400,'provider_request_rejected'],[302,'provider_request_rejected']]){
    let calls=0;
    await assert.rejects(adapter({fetchImpl:async()=>{calls++;return new Response('private-key',{status});}}).invoke(request),error=>code(expected)(error)&&!error.message.includes('private-key'));
    assert.equal(calls,1);
  }
});
test('invalid, blocked, truncated, oversized and non-text replies fail closed and retain observed usage',async()=>{
  for(const response of [reply('```json {} ```'),reply([]),reply('x'.repeat(50001)),reply(quiz,{promptFeedback:{blockReason:'SAFETY'}}),reply(quiz,{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}),reply(quiz,{candidates:[{finishReason:'STOP',content:{parts:[{functionCall:{name:'run'}}]}}]})]){
    await assert.rejects(adapter({fetchImpl:async()=>response}).invoke(request),error=>code('invalid_provider_result')(error)&&error.usage.total_tokens===50);
  }
  for(const response of [new Response('bad json',{headers:{'content-type':'application/json'}}),new Response('data: {}',{headers:{'content-type':'text/event-stream'}}),new Response('x'.repeat(150001),{headers:{'content-type':'application/json'}}),reply(quiz,{usageMetadata:{totalTokenCount:-1}})])await assert.rejects(adapter({fetchImpl:async()=>response}).invoke(request),code('invalid_provider_result'));
});
test('thinking usage is counted, thought text excluded, missing usage stays unknown and wrong meaning fails quality checks',async()=>{
  const result=await adapter({fetchImpl:async()=>reply(quiz,{candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private thought'},{text:JSON.stringify(quiz)}]}}],usageMetadata:{promptTokenCount:30,candidatesTokenCount:20,thoughtsTokenCount:10,totalTokenCount:60}})}).invoke(request);
  assert.deepEqual(result.usage,{prompt_tokens:30,completion_tokens:30,total_tokens:60});assert.ok(!result.text.includes('private thought'));
  assert.deepEqual((await adapter({fetchImpl:async()=>reply(quiz,{usageMetadata:undefined})}).invoke(request)).usage,{});
  await assert.rejects(createRoutedQuizGenerator({providers:registry(adapter({fetchImpl:async()=>reply({...quiz,meaning:{...meaning,definition:'Pour over food.'}})}))})({type:'Flip',meaning}),code('quality_check_failed'));
});
test('timeout, cancellation and a stalled response stream abort without retries',async()=>{
  for(const afterHeaders of [false,true]){
    let sent;
    await assert.rejects(adapter({timeoutMs:10,fetchImpl:async(_,init)=>{sent=init.signal;return afterHeaders?new Response(new ReadableStream({start(){},cancel(){}}),{headers:{'content-type':'application/json'}}):new Promise(()=>{});}}).invoke(request),code('timeout'));
    assert.equal(sent.aborted,true);
  }
  const controller=new AbortController();controller.abort();let calls=0;
  await assert.rejects(adapter({fetchImpl:async()=>calls++}).invoke(request,{signal:controller.signal}),code('cancelled'));assert.equal(calls,0);
  const active=new AbortController();let sent;
  const pending=adapter({fetchImpl:async(_,init)=>{sent=init.signal;active.abort();return reply();}}).invoke(request,{signal:active.signal});
  await assert.rejects(pending,code('cancelled'));assert.equal(sent.aborted,true);
});
const schema=readFileSync(new URL('../migrations/quiz-review-draft/014_language_access.sql',import.meta.url),'utf8');
const policy=bindings=>({enabled:true,bindings,tasks:['generation'],termsRevision:'fixture-terms-v1',dataProcessingApproved:true,noPaidOverageConfirmed:true,expiresAt:3*86400000,dailyRequests:1000,dailyInputBytes:10000000,maxInputBytes:100000});
test('configured Gemini shares its project scope with review, persists selection and requires explicit policy',async()=>{
  const f=await fixture({d1:true});f.sql.exec(schema);f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/005_provider_settings.sql',import.meta.url),'utf8'));let calls=0;
  const config={...options,credentialRevision:'fixture-key-v1',quotaProject:'fixture-project',fetchImpl:async()=>{calls++;return reply();}};
  try{
    const make=()=>createConfiguredLanguageProviders({db:f.db,authorize:async()=>true,geminiGeneration:config,gemini:config,now:()=>86400000});
    const service=await make();assert.equal(calls,0);assert.equal(service.accounts.length,1);assert.equal(service.accounts[0].bindings.length,2);
    await service.providers.initialize(actors.dev);
    await service.providers.configure(actors.dev,body({expectedRevision:1,selections:{generation:{adapterId:'gemini-quiz',locale:'en-US',mode:'text'}},reason:'Fixture generation.'}));
    await assert.rejects(service.providers.execute('generation',request),code('access_policy_denied'));
    const account=service.accounts[0];await service.access.confirm(actors.dev,body({scope:account.scope,expectedRevision:0,policy:policy(account.bindings),reason:'Fixture consent.'}));
    const restored=await make();assert.equal((await restored.providers.inspect(actors.dev)).selections.generation.adapterId,'gemini-quiz');
    assert.deepEqual(await createRoutedQuizGenerator({providers:restored.providers})({type:'Flip',meaning}),quiz.content);assert.equal(calls,1);
    const rotated=await createConfiguredLanguageProviders({db:f.db,authorize:async()=>true,geminiGeneration:{...config,credentialRevision:'fixture-key-v2'},now:()=>86400000});
    await assert.rejects(rotated.providers.execute('generation',request),code('provider_configuration_changed'));assert.equal(calls,1);
    const burst=await Promise.allSettled(Array.from({length:12},()=>service.providers.execute('generation',request)));
    assert.equal(burst.filter(row=>row.status==='fulfilled').length,9);assert.equal(calls,10);
    await assert.rejects(restored.providers.execute('generation',request),code('access_budget_or_policy_changed'));
  }finally{f.close();}
});
test('Gemini uses the existing queue: candidates need teacher approval and 429 stops after one attempt',async()=>{
  for(const limited of [false,true]){
    const f=await fixture();let calls=0;
    try{
      f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/002_generation_jobs.sql',import.meta.url),'utf8'));
      const before=JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all());
      const providers=registry(adapter({fetchImpl:async(_,init)=>{
        calls++;if(limited)return new Response('quota',{status:429});
        const {type,meaning}=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);
        return reply({type,meaning,content:{explanation:'From the selected meaning.',items:[{front:meaning.en,back:meaning.translation}]}});
      }}));
      const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate:createRoutedQuizGenerator({providers,includeMetadata:true})});
      await generation.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Flip']}));
      await generation.runOne();await generation.runOne();const [job]=await generation.list(actors.teacher);
      assert.equal(calls,1);assert.equal(job.attempts,1);assert.equal(job.state,limited?'review':'submitted');
      if(limited){assert.equal(job.issue,'quota_exceeded');assert.equal(job.versionId,null);}
      else{const saved=await f.service.get(actors.teacher,job.versionId);assert.equal(saved.author.kind,'automatic');assert.equal(saved.generation.source.model,GEMINI_QUIZ_MODEL);assert.equal(saved.generation.usage.total_tokens,50);}
      assert.deepEqual(await f.service.sharedForCard(actors.teacher,1),[]);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all()),before);
    }finally{f.close();}
  }
});
test('project rolling limits survive new wrapper instances, concurrent admissions and a UTC date boundary',async()=>{
  for(const d1 of [false,true]){
    const f=await fixture({d1});f.sql.exec(schema);let at=86400000-30000,calls=0;
    const access=new LanguageAccessPolicy(f.db,{now:()=>at}),scope='a'.repeat(64),row=adapter({fetchImpl:async()=>{calls++;return reply();}}),bindings=[(({id,provider,model,version,billing})=>({id,provider,model,version,billing}))(row)];
    try{
      await access.confirm(actors.dev,body({scope,expectedRevision:0,policy:policy(bindings),reason:'Fixture dispatch limits.'}));
      const make=()=>registry(access.wrap(row,{scope,limits:{minuteRequests:2,dayRequests:3}}));
      const outcomes=await Promise.allSettled(Array.from({length:6},()=>make().execute('generation',request)));
      assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,2);assert.equal(calls,2);
      at+=30001;await assert.rejects(make().execute('generation',request),code('access_budget_or_policy_changed'));
      at+=30000;await make().execute('generation',request);assert.equal(calls,3);
      at+=60001;await assert.rejects(make().execute('generation',request),code('access_budget_or_policy_changed'));
      at+=86400000;await make().execute('generation',request);assert.equal(calls,4);
    }finally{f.close();}
  }
});
