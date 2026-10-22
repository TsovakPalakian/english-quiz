import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runGeminiQuizProbe,geminiProbeFlags} from '../ops/probe-gemini-quiz.mjs';
const options={run:true,confirmFreeTier:true,allowDataProcessing:true,apiKey:'fixture-key-not-a-secret',quotaProject:'fixture-project'};
test('probe requires all explicit confirmations and credentials before any network call',async()=>{
  let requests=0;const fetchImpl=async()=>{requests++;throw Error('must not call');};
  for(const change of [{run:false},{confirmFreeTier:false},{allowDataProcessing:false}])await assert.rejects(runGeminiQuizProbe({...options,...change,fetchImpl}),error=>error.code==='explicit_probe_consent_required');
  for(const change of [{apiKey:''},{apiKey:'bad\nkey'},{quotaProject:'Default Gemini Project'}])await assert.rejects(runGeminiQuizProbe({...options,...change,fetchImpl}),error=>error.code==='local_credentials_required');
  for(const flags of [[],['--run'],['--run','--confirm-free-tier','--run'],['--run','--confirm-free-tier','--allow-data-processing','--model=private']])assert.throws(()=>geminiProbeFlags(flags));
  assert.deepEqual(geminiProbeFlags(['--run','--confirm-free-tier','--allow-data-processing']),{run:true,confirmFreeTier:true,allowDataProcessing:true});
  assert.equal(requests,0);
});
test('one real-transport-shaped request creates only a disposable teacher-review candidate',async()=>{
  let calls=0;
  const result=await runGeminiQuizProbe({...options,fetchImpl:async(url,init)=>{
    calls++;assert.match(url,/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent$/);
    const payload=JSON.parse(init.body),input=JSON.parse(payload.contents[0].parts[0].text);
    assert.equal(payload.generationConfig.maxOutputTokens,2048);assert.equal(input.type,'Gap');assert.equal(input.meaning.en,'drizzle');
    assert.equal(payload.generationConfig.responseFormat.text.mimeType,'APPLICATION_JSON');
    assert.ok(!init.body.includes(options.apiKey));assert.ok(!init.body.includes('example.invalid'));
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({type:input.type,meaning:input.meaning,content:{explanation:'Drizzle means light rain.',items:[{shown:'A fine ____ began to fall.',answer:'drizzle',hint:'Light rain'}]}})}]}}],usageMetadata:{promptTokenCount:30,candidatesTokenCount:20,totalTokenCount:50}});
  }});
  assert.equal(calls,1);assert.equal(result.requests,1);assert.equal(result.state,'submitted');assert.equal(result.published,false);assert.equal(result.requiresTeacherReview,true);
  assert.equal(result.generation.source.provider,'google');assert.equal(result.generation.usage.total_tokens,50);assert.equal(result.content.items[0].answer,'drizzle');
  assert.ok(!JSON.stringify(result).includes(options.apiKey));assert.ok(!JSON.stringify(result).includes(options.quotaProject));
});
test('provider rate limits and invalid output never retry or produce an approved quiz',async()=>{
  for(const status of [429,500,200]){
    let calls=0;const result=await runGeminiQuizProbe({...options,fetchImpl:async()=>{calls++;return status===200?Response.json({candidates:[]}):new Response('private upstream error',{status});}});
    assert.equal(calls,1);assert.equal(result.requests,1);assert.notEqual(result.state,'submitted');assert.equal(result.published,false);assert.equal(result.content,undefined);
    if(status===429){assert.equal(result.issue,'quota_exceeded');assert.equal(result.state,'review');}
    assert.ok(!JSON.stringify(result).includes('private upstream error'));
  }
});
test('probe is separate from preview, production builders and Worker imports',()=>{
  const ignore=readFileSync(new URL('../.gitignore',import.meta.url),'utf8');assert.ok(ignore.split('\n').includes('.gemini.local.env'));
  for(const file of ['../ops/preview-learning-workbench.mjs','../ops/build-learning-production-assets.mjs','../src/learning-stage-worker.mjs'])assert.ok(!readFileSync(new URL(file,import.meta.url),'utf8').includes('probe-gemini-quiz'));
});
