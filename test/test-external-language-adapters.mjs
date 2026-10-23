import test from 'node:test';
import assert from 'node:assert/strict';
import {createAzurePronunciationAdapter,createAzureTTSAdapter,AZURE_REFERENCE_VOICES,azurePcmDuration} from '../src/azure-speech-provider.mjs';
import {createWorkersAIWhisperAdapter,WHISPER_MODEL} from '../src/workers-ai-speech-provider.mjs';
import {createGeminiReviewAdapter} from '../src/gemini-review-provider.mjs';
import {languageProviderHTTP} from '../src/language-provider-http.mjs';
import {LanguageProviders} from '../src/language-providers.mjs';
import {actors,content} from './quiz-review-fixture.mjs';
import {wav} from './quiz-media-fixture.mjs';
import {fixture,body} from './quiz-review-fixture.mjs';
import {readFileSync} from 'node:fs';
import {workbenchMigrationPlan} from '../ops/learning-workbench-migration-plan.mjs';
import {StoredLanguageProviders} from '../src/stored-language-providers.mjs';
import {StoredQuizIndependentReview} from '../src/stored-quiz-independent-review.mjs';
const json=value=>Response.json(value),code=(promise,value)=>assert.rejects(promise,error=>error.code===value);
const pcm=()=>{const bytes=wav(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);view.setUint32(24,16000,true);view.setUint32(28,32000,true);return bytes;};
const audio=()=>({bytes:pcm(),mime:'audio/wav',mode:'scripted',reference:'drizzle',locale:'en-US'});
const azure=fetchImpl=>({enabled:true,freeTierVerified:true,resourceName:'lumiscia-test',apiKey:'SYNTHETIC-KEY',termsRevision:'fixture-v1',fetchImpl});
test('Azure pronunciation sends only scripted PCM16, requests no paid prosody and preserves null metrics',async()=>{
  let calls=0;const fetchImpl=async(url,options)=>{calls++;assert.equal(new URL(url).hostname,'lumiscia-test.cognitiveservices.azure.com');assert.equal(new URL(url).searchParams.get('language'),'en-US');
    const config=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(options.headers['Pronunciation-Assessment']),c=>c.charCodeAt(0))));assert.equal(config.ReferenceText,'drizzle');assert.equal(config.GradingSystem,'HundredMark');assert.equal(config.EnableProsodyAssessment,false);assert.equal(config.Granularity,'FullText');assert.equal(options.redirect,'manual');
    return json({RecognitionStatus:'Success',NBest:[{Display:'drizzle',AccuracyScore:0,FluencyScore:80,ProsodyScore:99}]});};
  const adapter=createAzurePronunciationAdapter(azure(fetchImpl));assert.equal(azurePcmDuration(pcm()),0.75);
  const result=await adapter.invoke(audio());assert.deepEqual(result.metrics,{accuracy:0,fluency:80,prosody:null});assert.deepEqual(adapter.validate(result),result);assert.deepEqual(result.findings,[]);
  await code(adapter.invoke({...audio(),mode:'unscripted'}),'invalid_request');await code(adapter.invoke({...audio(),bytes:wav()}),'unsupported_audio_format');assert.equal(calls,1);
  for(const status of ['InitialSilenceTimeout','BabbleTimeout','NoMatch']){const out=await createAzurePronunciationAdapter(azure(async()=>json({RecognitionStatus:status}))).invoke(audio());assert.notEqual(out.quality,'ok');assert.equal(out.metrics.accuracy,null);}
  const missing=await createAzurePronunciationAdapter(azure(async()=>json({RecognitionStatus:'Success',NBest:[{Display:'drizzle'}]}))).invoke(audio());assert.equal(missing.metrics.fluency,null);
  await code(createAzurePronunciationAdapter({...azure(fetchImpl),enabled:false}).invoke(audio()),'provider_disabled');
});
test('Azure PCM validator rejects malformed chunk sizes, non-mono/float audio and excessive duration',()=>{
  for(const at of [20,22,24,28,32,34,40]){const bytes=pcm(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);view.setUint16(at,65535,true);assert.throws(()=>azurePcmDuration(bytes));}
  const oversized=new Uint8Array(44+31*32000),head=pcm();oversized.set(head.subarray(0,44));const view=new DataView(oversized.buffer);view.setUint32(4,oversized.length-8,true);view.setUint32(40,oversized.length-44,true);assert.throws(()=>azurePcmDuration(oversized));
});
test('Azure TTS fixes voices/locale, escapes SSML and accepts only validated RIFF responses',async()=>{
  const fetchImpl=async(url,options)=>{assert.ok(url.endsWith('/tts/cognitiveservices/v1'));assert.match(options.body,/&lt;audio src=&quot;https:/);assert.ok(!options.body.includes('<audio src='));assert.equal(options.headers['X-Microsoft-OutputFormat'],'riff-16khz-16bit-mono-pcm');return new Response(pcm(),{headers:{'content-type':'audio/x-wav'}});};
  const adapter=createAzureTTSAdapter({...azure(fetchImpl),reuseConditions:'Synthetic test permission.'}),input={word:'<audio src="https://bad.invalid"/>',voice:AZURE_REFERENCE_VOICES[0].id};
  const result=await adapter.invoke(input,{source:{locale:'en-US'}});assert.equal(result.mime,'audio/wav');assert.equal(result.rights,'Synthetic test permission.');assert.deepEqual(adapter.validate(result),result);
  await code(adapter.invoke({...input,voice:'arbitrary'}),'invalid_request');await code(adapter.invoke(input,{source:{locale:'en-GB'}}),'invalid_request');
  const wrong=createAzureTTSAdapter({...azure(async()=>new Response('{}',{headers:{'content-type':'application/json'}})),reuseConditions:'Test'});await code(wrong.invoke(input),'invalid_provider_result');
  assert.ok(!JSON.stringify(adapter).includes('SYNTHETIC-KEY'));assert.throws(()=>createAzurePronunciationAdapter({termsRevision:'bad/terms'}));
});
test('Whisper is transcript-only, posts bounded binary audio to a fixed server endpoint and never invents scores',async()=>{
  let calls=0;const fetchImpl=async(url,options)=>{calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/ai/run/'+WHISPER_MODEL);assert.equal(options.headers['content-type'],'application/octet-stream');assert.deepEqual(options.body,pcm());return json({success:true,result:{text:'A fine drizzle.',words:[{word:'invented',accuracy:100}]}});};
  const config={enabled:true,freeTierVerified:true,accountId:'a'.repeat(32),apiToken:'SYNTHETIC-TOKEN',fetchImpl},adapter=createWorkersAIWhisperAdapter(config),result=await adapter.invoke(audio());
  assert.deepEqual(result,{quality:'ok',transcript:'A fine drizzle.',metrics:{},findings:[]});assert.deepEqual(adapter.validate(result),result);
  await code(createWorkersAIWhisperAdapter({...config,enabled:false}).invoke(audio()),'provider_disabled');await code(adapter.invoke({...audio(),mime:'text/plain'}),'invalid_request');assert.equal(calls,1);
  const empty=await createWorkersAIWhisperAdapter({...config,fetchImpl:async()=>json({success:true,result:{text:' '}})}).invoke(audio());assert.equal(empty.quality,'no_speech');
  await code(createWorkersAIWhisperAdapter({...config,fetchImpl:async()=>json({success:false,result:{text:'wrong'}})}).invoke(audio()),'invalid_provider_result');
});
const meaning={en:'drizzle',translation:'изморось',definition:'Light rain.',part_of_speech:'noun'};
test('Gemini review uses a separate provider, bounded schema, exact revision and trusted thinking-inclusive usage',async()=>{
  let calls=0;const adapter=createGeminiReviewAdapter({enabled:true,allowDataProcessing:true,freeTierVerified:true,model:'gemini-fixture',apiKey:'SYNTHETIC-KEY',termsRevision:'adult-fixture-v1',fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-fixture:generateContent');assert.equal(options.headers['x-goog-api-key'],'SYNTHETIC-KEY');
    const request=JSON.parse(options.body),{checked,dimensions}=JSON.parse(request.contents[0].parts[0].text);assert.equal(request.generationConfig.responseFormat.text.mimeType,'APPLICATION_JSON');
    return json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'Do not display internal reasoning.'},{text:JSON.stringify({fingerprint:checked.fingerprint,revision:checked.revision,status:'reviewed',dimensions:Object.fromEntries(dimensions.map(key=>[key,key==='level'?'not_assessed':'pass'])),findings:[]})}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:5,totalTokenCount:35}});
  }});
  const providers=new LanguageProviders({adapters:[adapter],authorize:async()=>true});providers.configure(actors.dev,{expectedRevision:1,selections:{review:{adapterId:adapter.id,locale:'en-US',mode:'text'}}});
  const input={type:'Gap',meaning,content,revision:2,level:null},response=await providers.execute('review',input),result=response.data.result;
  assert.equal(result.status,'incomplete');assert.equal(result.requiresTeacherReview,true);assert.deepEqual(result.usage,{prompt_tokens:10,completion_tokens:25,total_tokens:35});assert.equal(calls,1);assert.equal(result.revision,2);assert.ok(!JSON.stringify(result).includes('internal reasoning'));assert.equal(content.items[0].answer,'drizzle');
});
test('new adapters remain default-off/free-only and never expose credentials or arbitrary endpoints',async()=>{
  let called=false;const fetchImpl=async()=>{called=true;throw Error('SYNTHETIC-SECRET');};
  const adapters=[createAzurePronunciationAdapter({...azure(fetchImpl),enabled:false}),createAzureTTSAdapter({...azure(fetchImpl),enabled:false}),createWorkersAIWhisperAdapter({fetchImpl}),createGeminiReviewAdapter({fetchImpl})];
  for(const adapter of adapters)await code(adapter.invoke({}),'provider_disabled');assert.equal(called,false);
  const registry=new LanguageProviders({adapters:[createWorkersAIWhisperAdapter({enabled:true,accountId:'a'.repeat(32),apiToken:'SYNTHETIC-TOKEN',fetchImpl})]});
  assert.throws(()=>registry.configure(actors.dev,{expectedRevision:1,selections:{stt:{adapterId:'workers-ai-whisper',locale:'en-US',mode:'unscripted'}}}),error=>error.code==='paid_provider_blocked');
  const pronunciation=new LanguageProviders({adapters:[createAzurePronunciationAdapter(azure(fetchImpl))]});assert.throws(()=>pronunciation.configure(actors.dev,{expectedRevision:1,selections:{pronunciation:{adapterId:'azure-pronunciation',locale:'en-US',mode:'unscripted'}}}),error=>error.code==='unsupported_capability');
  await code(createAzurePronunciationAdapter({...azure(fetchImpl),resourceName:'evil.invalid/path'}).invoke(audio()),'provider_not_configured');assert.equal(called,false);
});
test('real review transport fits the persisted advisory pipeline, pins the source and never approves the submitted version',async()=>{
  const f=await fixture({d1:true,extendedLifecycle:true});try{
    for(const step of workbenchMigrationPlan().steps.slice(1))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8'));
    let calls=0;const options={enabled:true,allowDataProcessing:true,freeTierVerified:true,model:'gemini-fixture',apiKey:'SYNTHETIC-KEY',termsRevision:'adult-fixture-v1',fetchImpl:async(url,settings)=>{
      calls++;const {checked,dimensions}=JSON.parse(JSON.parse(settings.body).contents[0].parts[0].text);
      return json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({fingerprint:checked.fingerprint,revision:checked.revision,status:'reviewed',dimensions:Object.fromEntries(dimensions.map(key=>[key,key==='level'?'not_assessed':'pass'])),findings:[]})}]}}]});
    }};
    const adapter=createGeminiReviewAdapter(options);options.enabled=false;
    const providers=new StoredLanguageProviders(f.db,{adapters:[adapter],authorize:async()=>true});await providers.initialize(actors.dev);
    await providers.configure(actors.dev,body({expectedRevision:1,selections:{review:{adapterId:adapter.id,locale:'en-US',mode:'text'}},reason:'Mock-only transport integration.'}));
    const independent=new StoredQuizIndependentReview(f.service,{reviewer:async({signal,...input})=>(await providers.execute('review',input,{signal})).data.result});
    const q=await f.draft();await f.service.submit(actors.student,q.id,body({expectedRevision:1}));
    const operation=body({expectedRevision:2,level:null}),result=await independent.run(actors.teacher,q.id,operation);
    assert.equal(result.state,'completed');assert.equal(result.result.requiresTeacherReview,true);assert.equal(result.result.source.provider,'google');assert.deepEqual(result.result.usage,{});
    await independent.run(actors.teacher,q.id,operation);assert.equal(calls,1);assert.equal((await f.service.get(actors.teacher,q.id)).state,'submitted');
  }finally{f.close();}
});
test('Gemini refuses unsupported data processing, safety refusals and altered revision reports',async()=>{
  const input={type:'Gap',meaning,content,revision:2,level:null},base={enabled:true,allowDataProcessing:true,model:'gemini-fixture',apiKey:'SYNTHETIC-KEY',termsRevision:'fixture-v1'};
  let called=false;await code(createGeminiReviewAdapter({...base,allowDataProcessing:false,fetchImpl:async()=>{called=true;}}).invoke(input),'review_not_configured');assert.equal(called,false);
  await code(createGeminiReviewAdapter({...base,fetchImpl:async()=>json({promptFeedback:{blockReason:'SAFETY'}})}).invoke(input),'review_refused');
  await code(createGeminiReviewAdapter({...base,fetchImpl:async()=>json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'partial'}]}}]})}).invoke(input),'review_refused');
  await code(createGeminiReviewAdapter({...base,fetchImpl:async()=>json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"status":"approved"}'}]}}]})}).invoke(input),'stale_review_response');
});
test('shared HTTP guard rejects redirects/errors/oversized bodies and cancels waiting streams without leaking secrets',async()=>{
  for(const [status,expected] of [[429,'rate_limited'],[403,'provider_access_denied'],[500,'provider_unavailable'],[302,'provider_request_rejected']])await code(languageProviderHTTP(async()=>new Response('SYNTHETIC-SECRET',{status}),'https://test.invalid',{},{}),expected);
  await code(languageProviderHTTP(async()=>Response.json({large:'x'.repeat(100)}),'https://test.invalid',{}, {maxBytes:8}),'invalid_provider_result');
  await code(languageProviderHTTP(async()=>{throw Error('SYNTHETIC-SECRET');},'https://test.invalid',{}),'provider_unavailable');
  await code(languageProviderHTTP(async()=>new Promise(()=>{}),'https://test.invalid',{}, {timeoutMs:5}),'timeout');
  const controller=new AbortController();controller.abort();let called=false;await code(languageProviderHTTP(async()=>{called=true;},'https://test.invalid',{}, {signal:controller.signal}),'cancelled');assert.equal(called,false);
  let cancelled=false;const stream=new ReadableStream({cancel(){cancelled=true;}}),request=languageProviderHTTP(async()=>new Response(stream,{headers:{'content-type':'application/json'}}),'https://test.invalid',{}, {timeoutMs:10});await code(request,'timeout');assert.equal(cancelled,true);
  let resolve,lateCancelled=false;const late=languageProviderHTTP(()=>new Promise(done=>{resolve=done;}),'https://test.invalid',{}, {timeoutMs:5});await code(late,'timeout');resolve(new Response(new ReadableStream({cancel(){lateCancelled=true;}}),{headers:{'content-type':'application/json'}}));await new Promise(done=>setTimeout(done,0));assert.equal(lateCancelled,true);
});
