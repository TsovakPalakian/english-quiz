import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorkersAIQuizAdapter,createRoutedQuizGenerator,WORKERS_QUIZ_MODEL} from '../src/workers-ai-quiz-provider.mjs';
import {LanguageProviders} from '../src/language-providers.mjs';
import {createModelQuizGenerator} from '../src/quiz-generation-model.mjs';
import {QuizGenerationService} from '../src/quiz-generation.mjs';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
const accountId='a'.repeat(32),apiToken='test-only-token';
const meaning={en:'drizzle',translation:'light rain',definition:'Fine rain.',part_of_speech:'noun'};
const quiz={type:'Flip',meaning,content:{explanation:'Light rain.',items:[{front:'drizzle',back:'light rain'}]}};
let request;
await createModelQuizGenerator({enabled:true,complete:async value=>{request=value;return JSON.stringify(quiz);}})({type:'Flip',meaning});
const reply=(response=quiz,extra={})=>Response.json({success:true,result:{response,usage:{prompt_tokens:30,completion_tokens:20,total_tokens:50}},errors:[],...extra});
const adapter=extra=>createWorkersAIQuizAdapter({enabled:true,freeTierVerified:true,accountId,apiToken,fetchImpl:async()=>reply(),...extra});
const code=value=>error=>error.code===value;
function registry(adapters){const providers=new LanguageProviders({adapters,authorize:async()=>true});providers.configure(actors.dev,{expectedRevision:1,selections:{generation:{adapterId:adapters[0].id,locale:'en-US',mode:'text'}}});return providers;}
test('disabled adapter never invokes fetch and unverified billing is blocked by free-only registry',async()=>{
  let calls=0;const disabled=createWorkersAIQuizAdapter({fetchImpl:async()=>calls++});
  await assert.rejects(disabled.invoke(request),code('provider_disabled'));assert.equal(calls,0);
  assert.throws(()=>registry([adapter({freeTierVerified:false})]),code('paid_provider_blocked'));
});
test('request uses fixed endpoint, bounded JSON schema, no streams, redirects, extra data or exposed keys',async()=>{
  let sent;const selected=adapter({fetchImpl:async(url,options)=>{sent={url,options};return reply();}});
  const providers=registry([selected]),result=await providers.execute('generation',request);
  assert.equal(sent.url,`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${WORKERS_QUIZ_MODEL}`);
  assert.equal(sent.options.redirect,'error');assert.equal(sent.options.credentials,'omit');assert.equal(sent.options.headers.authorization,'Bearer '+apiToken);
  const input=JSON.parse(sent.options.body);assert.equal(input.max_tokens,1024);assert.equal(input.stream,false);
  assert.equal(input.response_format.type,'json_schema');assert.deepEqual(input.response_format.json_schema.properties.meaning.properties.en.enum,['drizzle']);
  assert.equal(input.response_format.json_schema.properties.content.properties.items.maxItems,5);
  assert.equal(JSON.stringify(input).includes(apiToken),false);assert.equal(JSON.stringify(providers.inspect(actors.dev)).includes(apiToken),false);
  assert.equal(result.source.model,WORKERS_QUIZ_MODEL);assert.equal(result.data.usage.total_tokens,50);
});
test('valid object and string model responses pass the existing semantic checks',async()=>{
  for(const response of [quiz,JSON.stringify(quiz)]){
    const providers=registry([adapter({fetchImpl:async()=>reply(response)})]);
    assert.deepEqual(await createRoutedQuizGenerator({providers})({type:'Flip',meaning}),quiz.content);
  }
});
test('invalid credentials, extra fields and forged item definitions fail before transport',async()=>{
  let calls=0;for(const options of [{accountId:'../private'},{apiToken:'bad\nkey'}])await assert.rejects(adapter({...options,fetchImpl:async()=>calls++}).invoke(request),code('provider_not_configured'));
  for(const bad of [{...request,actor:{email:'private@example.com'}},{...request,itemFields:['arbitrary']},{...request,maxItems:100}])await assert.rejects(adapter({fetchImpl:async()=>calls++}).invoke(bad),code('invalid_request'));
  assert.equal(calls,0);
});
test('HTTP failures are classified without retries or leaking provider bodies',async()=>{
  for(const [status,expected] of [[429,'rate_limited'],[401,'provider_access_denied'],[403,'provider_access_denied'],[500,'provider_unavailable'],[400,'provider_request_rejected'],[302,'provider_request_rejected']]){
    let calls=0;await assert.rejects(adapter({fetchImpl:async()=>{calls++;return new Response('private key and upstream details',{status});}}).invoke(request),error=>code(expected)(error)&&!error.message.includes('private'));
    assert.equal(calls,1);
  }
});
test('malformed, oversized, failed and streaming responses are rejected',async()=>{
  const responses=[new Response('not json',{headers:{'content-type':'application/json'}}),new Response('data: content',{headers:{'content-type':'text/event-stream'}}),reply(quiz,{success:false}),reply('```json {} ```'),reply([]),reply({...quiz,content:'x'.repeat(51000)}),reply(quiz,{errors:[{message:'private'}]}),new Response('x'.repeat(100001),{headers:{'content-type':'application/json'}})];
  for(const response of responses)await assert.rejects(adapter({fetchImpl:async()=>response}).invoke(request),error=>['invalid_provider_result','provider_unavailable'].includes(error.code));
  await assert.rejects(adapter({fetchImpl:async()=>reply(quiz,{result:{response:quiz,usage:{total_tokens:-1}}})}).invoke(request),code('invalid_provider_result'));
});
test('wrong meaning remains rejected even when the model returns valid JSON',async()=>{
  const providers=registry([adapter({fetchImpl:async()=>reply({...quiz,meaning:{...meaning,definition:'Pour over food.'}})})]);
  await assert.rejects(createRoutedQuizGenerator({providers})({type:'Flip',meaning}),code('quality_check_failed'));
});
test('all twelve individual text types build bounded schemas and pass valid fixture results',async()=>{
  const samples={Flip:{front:'drizzle',back:'light rain'},Choice:{prompt:'drizzle',options:['light rain','snow'],answer:0},Type:{prompt:'light rain',answer:'drizzle'},Gap:{shown:'Fine ____ fell.',answer:'drizzle',hint:'Rain'},Build:{parts:'fell drizzle Fine',answer:'Fine drizzle fell'},'True / false':{prompt:'Drizzle is rain.',answer:'true'},Tap:{text:'Fine drizzle fell.',answer:'drizzle'},Reverse:{front:'light rain',back:'drizzle',options:['drizzle','storm'],answer:0},Spell:{word:'drizzle',hint:'Rain'},Letters:{word:'drizzle',hint:'Rain'},Definition:{prompt:'Fine rain.',word:'drizzle',options:['drizzle','storm'],answer:0},Hangman:{word:'drizzle',hint:'Rain'}};
  for(const [type,item] of Object.entries(samples)){
    const content={explanation:'An English example.',items:[item]};
    const providers=registry([adapter({fetchImpl:async(_,options)=>{
      const input=JSON.parse(options.body),schema=input.response_format.json_schema;
      assert.deepEqual(schema.properties.type.enum,[type]);
      assert.deepEqual(schema.properties.content.properties.items.items.required,Object.keys(item));
      return reply({type,meaning,content});
    }})]);
    assert.deepEqual(await createRoutedQuizGenerator({providers})({type,meaning}),content);
  }
});
test('registry denial and unsupported audio do not call the HTTP transport',async()=>{
  let calls=0;const selected=adapter({fetchImpl:async()=>calls++}),providers=new LanguageProviders({adapters:[selected]});
  providers.configure(actors.dev,{expectedRevision:1,selections:{generation:{adapterId:selected.id,locale:'en-US',mode:'text'}}});
  const generate=createRoutedQuizGenerator({providers});
  await assert.rejects(generate({type:'Flip',meaning}),error=>error.code==='quota_exceeded'&&!error.retryable);
  await assert.rejects(generate({type:'Listen',meaning}),code('audio_unavailable'));assert.equal(calls,0);
});
test('timeout and caller cancellation abort injected transport; late success is discarded',async()=>{
  let aborted=false;const hanging=adapter({timeoutMs:5,fetchImpl:(_,options)=>new Promise(()=>{options.signal.addEventListener('abort',()=>aborted=true);})});
  await assert.rejects(hanging.invoke(request),code('timeout'));assert.equal(aborted,true);
  const controller=new AbortController(),pending=adapter({fetchImpl:async()=>{controller.abort();return reply();}}).invoke(request,{signal:controller.signal});
  await assert.rejects(pending,code('cancelled'));
  await assert.rejects(adapter({fetchImpl:async()=>{throw new Error('private token');}}).invoke(request),error=>error.code==='provider_unavailable'&&!error.message.includes('private'));
});
test('routed rate limits stop background generation after one attempt without creating a quiz',async()=>{
  const f=await fixture();try{
    f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/002_generation_jobs.sql',import.meta.url),'utf8'));
    let calls=0;const providers=registry([adapter({fetchImpl:async()=>{calls++;return new Response('',{status:429});}})]);
    const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate:createRoutedQuizGenerator({providers})});
    await generation.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Flip']}));
    await generation.runOne();await generation.runOne();const [job]=await generation.list(actors.teacher);
    assert.equal(calls,1);assert.equal(job.state,'review');assert.equal(job.issue,'quota_exceeded');assert.equal(job.attempts,1);assert.equal(job.versionId,null);
  }finally{f.close();}
});
test('mocked Workers AI candidate reaches teacher review without changing existing quizzes',async()=>{
  const f=await fixture();try{
    f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/002_generation_jobs.sql',import.meta.url),'utf8'));
    const before=JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all());
    const providers=registry([adapter({fetchImpl:async(_,options)=>{
      const {type,meaning:context}=JSON.parse(JSON.parse(options.body).messages[1].content);
      return reply({type,meaning:context,content:{explanation:'From the supplied meaning.',items:[{front:context.en,back:context.translation}]}});
    }})]);
    const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate:createRoutedQuizGenerator({providers})});
    await generation.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Flip']}));await generation.runOne();
    const [job]=await generation.list(actors.teacher);assert.equal(job.state,'submitted');
    assert.equal((await f.service.get(actors.teacher,job.versionId)).author.kind,'automatic');
    assert.deepEqual(await f.service.sharedForCard(actors.teacher,1),[]);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all()),before);
  }finally{f.close();}
});
