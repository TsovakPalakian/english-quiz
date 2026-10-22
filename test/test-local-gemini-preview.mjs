import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalGeminiProvider} from '../ops/local-gemini-preview-provider.mjs';
import {createLocalWorkbench,actors} from '../ops/local-workbench-services.mjs';
import {createLearningWorkbenchPreview} from '../ops/preview-learning-workbench.mjs';
const config={apiKey:'fixture-only-key',quotaProject:'fixture-only-project',confirmFreeTier:true,allowDataProcessing:true};
const reply=init=>{
  const {type,meaning}=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({type,meaning,content:{explanation:'Drizzle means light rain.',items:[{front:meaning.en,back:meaning.translation}]}})}]}}],usageMetadata:{promptTokenCount:30,candidatesTokenCount:20,totalTokenCount:50}});
};
test('real local mode starts Off and sends one queued task only after a developer step',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gemini-preview-'));let gemini,local,calls=0;
  try{
    gemini=await openLocalGeminiProvider({...config,filename:join(dir,'budget.sqlite'),fetchImpl:async(_,init)=>{calls++;return reply(init);}});
    local=await createLocalWorkbench({gemini});assert.equal(calls,0);
    const services=local.services,settings=await services.providers.inspect(actors.dev);
    assert.equal(settings.selections.generation,null);assert.equal((await services.preparation.settings(actors.dev)).enabled,false);
    await assert.rejects(local.runOne(actors.dev),error=>error.status===409);assert.equal(calls,0);
    await services.providers.configure(actors.dev,{mutationId:crypto.randomUUID(),expectedRevision:settings.revision,selections:{generation:{adapterId:'gemini-quiz',locale:'en-US',mode:'text'}},reason:'Fixture-only real provider.'});
    await services.kits.fill(actors.teacher,{mutationId:crypto.randomUUID(),groupId:1,lessonId:1,cardId:1,senseId:local.senseId,types:['Flip']});
    await local.tick();assert.equal(calls,0);
    await assert.rejects(local.runOne(actors.teacher),error=>error.status===403);
    const first=local.runOne(actors.dev);
    await assert.rejects(local.runOne(actors.dev),error=>error.status===409);
    await first;assert.equal(calls,1);assert.equal(await gemini.remaining(),4);
    const [job]=await services.kits.generation.list(actors.teacher);assert.equal(job.state,'submitted');
    const result=await services.review.get(actors.teacher,job.versionId);assert.equal(result.generation.source.provider,'google');assert.equal(result.generation.usage.total_tokens,50);
    assert.equal(result.state,'submitted');await local.tick();assert.equal(calls,1);
  }finally{await local?.close();gemini?.close();rmSync(dir,{recursive:true,force:true});}
});
test('local budget survives closing, reopening, concurrency and key rotation',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gemini-budget-')),filename=join(dir,'budget.sqlite');let gemini,at=86400000,calls=0;
  try{
    const make=()=>openLocalGeminiProvider({...config,filename,now:()=>at,fetchImpl:async()=>{calls++;return new Response('limited',{status:429});}});
    gemini=await make();assert.equal(statSync(filename).mode&0o777,0o600);
    const invoke=()=>gemini.adapter.invoke({}, {source:{task:'generation',adapterId:gemini.adapter.id,provider:'google',model:gemini.adapter.model,version:gemini.adapter.version}});
    // Invalid model input is still an uncertain admission; it must not refund limits.
    await Promise.allSettled(Array.from({length:5},invoke));assert.equal(await gemini.remaining(),3);
    gemini.close();gemini=await make();assert.equal(await gemini.remaining(),3);
    at+=60001;await Promise.allSettled([invoke(),invoke()]);assert.equal(await gemini.remaining(),1);
    at+=60001;await assert.rejects(invoke());assert.equal(await gemini.remaining(),0);
    gemini.close();gemini=await openLocalGeminiProvider({...config,apiKey:'rotated-fixture-key',filename,now:()=>at,fetchImpl:async()=>calls++});assert.equal(await gemini.remaining(),0);
    await assert.rejects(invoke(),error=>error.code==='access_budget_or_policy_changed');assert.equal(calls,0);
  }finally{gemini?.close();rmSync(dir,{recursive:true,force:true});}
});
test('local HTTP exposes real mode honestly but never calls AI on page loads or foreign/student steps',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gemini-http-'));let gemini,preview,calls=0;
  try{
    gemini=await openLocalGeminiProvider({...config,filename:join(dir,'budget.sqlite'),fetchImpl:async()=>calls++});
    preview=await createLearningWorkbenchPreview({gemini});
    const initial=await(await fetch(preview.url+'/__local/status')).json();assert.equal(initial.environment,'local-gemini');assert.equal(initial.gemini.automaticDispatch,false);
    const html=await(await fetch(preview.url)).text();assert.ok(html.includes('Gemini available'));assert.ok(!html.includes('No AI charges'));
    const post=(cookie,origin,data)=>fetch(preview.url+'/__local/gemini/step',{method:'POST',headers:{cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
    assert.equal((await post('local-workbench-role=dev','https://evil.invalid',{confirmed:true})).status,403);
    assert.equal((await post('local-workbench-role=u1',preview.url,{confirmed:true})).status,403);
    assert.equal((await post('local-workbench-role=dev',preview.url,{confirmed:false})).status,400);
    const providers=await(await fetch(preview.url+'/__local/providers',{headers:{cookie:'local-workbench-role=dev'}})).text();assert.ok(providers.includes('Run one queued job'));assert.ok(!providers.includes('No external AI or charges'));
    assert.equal(calls,0);assert.ok(!JSON.stringify(initial).includes(config.apiKey));assert.ok(!html.includes(config.apiKey));
  }finally{await preview?.close();gemini?.close();rmSync(dir,{recursive:true,force:true});}
});
