import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalAzureProvider} from '../ops/local-azure-preview-provider.mjs';
import {createAzurePronunciationAdapter,createAzureTTSAdapter} from '../src/azure-speech-provider.mjs';
import {createLocalWorkbench,actors} from '../ops/local-workbench-services.mjs';
const config={apiKey:'fixture-only-key',resourceName:'lumiscia-speech',region:'northeurope',endpoint:'https://northeurope.api.cognitive.microsoft.com/',tier:'F0',confirmFreeTier:true,allowDataProcessing:true};
function pcm(){const bytes=Buffer.alloc(44+3*32000);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);return new Uint8Array(bytes);}
const response=()=>Response.json({RecognitionStatus:'Success',NBest:[{Display:'A fine drizzle is falling outside.',PronunciationAssessment:{AccuracyScore:90,FluencyScore:80}}]});
test('regional STT/TTS use the correct Microsoft hosts without paid pronunciation extras',async()=>{
  const base={...config,enabled:true,freeTierVerified:true,termsRevision:'fixture-v1'},input={bytes:pcm(),mime:'audio/wav',mode:'scripted',reference:'A fine drizzle is falling outside.',locale:'en-US'};
  const speech=createAzurePronunciationAdapter({...base,fetchImpl:async(url,init)=>{
    assert.equal(new URL(url).host,'northeurope.stt.speech.microsoft.com');
    const parameters=JSON.parse(Buffer.from(init.headers['Pronunciation-Assessment'],'base64').toString());assert.equal(parameters.GradingSystem,'HundredMark');assert.equal(parameters.EnableProsodyAssessment,false);
    return response();
  }});
  assert.equal((await speech.invoke(input)).metrics.accuracy,90);
  const tts=createAzureTTSAdapter({...base,reuseConditions:'Test-only permission.',fetchImpl:async url=>{assert.equal(new URL(url).host,'northeurope.tts.speech.microsoft.com');return new Response(pcm(),{headers:{'Content-Type':'audio/wav'}});}});
  await tts.invoke({word:'drizzle',voice:'en-US-JennyNeural'});
  for(const region of ['x.evil.test','https://evil.test','../northeurope'])assert.throws(()=>createAzurePronunciationAdapter({...base,region}));
});
test('local Azure starts Off; recording uploads need explicit analysis consent and yield real-source 0–100 scores',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'azure-preview-'));let azure,local,calls=0;
  try{
    azure=await openLocalAzureProvider({...config,filename:join(dir,'budget.sqlite'),fetchImpl:async()=>{calls++;return response();}});
    local=await createLocalWorkbench({azure,inspect:async()=>({kind:'audio',duration:3,width:0,height:0})});assert.equal(calls,0);
    const speech=local.services.speech,settings=await local.services.providers.inspect(actors.dev);assert.equal(settings.selections.pronunciation,null);assert.equal(settings.selections.stt,null);
    await local.services.providers.configure(actors.dev,{mutationId:crypto.randomUUID(),expectedRevision:settings.revision,selections:{pronunciation:{adapterId:'azure-pronunciation',locale:'en-US',mode:'scripted'}},reason:'Fixture-only analysis.'});
    const task=local.sql.prepare('SELECT id FROM qr_speech_tasks').get();
    const asset=await speech.upload(actors.student,task.id,{mutationId:crypto.randomUUID(),mime:'audio/wav',name:'reference.wav'},pcm());assert.equal(calls,0);
    await assert.rejects(speech.analyze(actors.student,task.id,{mutationId:crypto.randomUUID(),mediaId:asset.id,consent:false}));assert.equal(calls,0);
    const result=await speech.analyze(actors.student,task.id,{mutationId:crypto.randomUUID(),mediaId:asset.id,consent:true});
    assert.equal(calls,1);assert.equal(result.state,'complete');assert.equal(result.result.overall,86);assert.equal(result.result.synthetic,false);assert.equal(result.result.provisional,true);assert.equal(result.result.scores.prosody,null);
    assert.equal(await azure.remaining(),9);await local.tick();assert.equal(calls,1);
    assert.ok(!JSON.stringify(await local.services.providers.inspect(actors.dev)).includes(config.apiKey));
  }finally{await local?.close();azure?.close();rmSync(dir,{recursive:true,force:true});}
});
test('Azure preview rejects S0/mismatched endpoints and preserves request limits after restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'azure-budget-'));let azure,at=86400000;
  try{
    const base={...config,filename:join(dir,'budget.sqlite'),now:()=>at,fetchImpl:async()=>response()};
    for(const patch of [{tier:'S0'},{endpoint:'https://evil.test/'},{allowDataProcessing:false},{apiKey:''}])await assert.rejects(openLocalAzureProvider({...base,...patch}));
    azure=await openLocalAzureProvider(base);
    const input={bytes:pcm(),mime:'audio/wav',mode:'scripted',reference:'A fine drizzle is falling outside.',locale:'en-US'};
    const invoke=()=>azure.adapter.invoke(input,{source:{task:'pronunciation',adapterId:azure.adapter.id,provider:azure.adapter.provider,model:azure.adapter.model,version:azure.adapter.version}});
    for(let i=0;i<10;i++){if(i&&i%2===0)at+=60001;await invoke();}
    assert.equal(await azure.remaining(),0);azure.close();azure=await openLocalAzureProvider({...base,apiKey:'rotated-fixture-key'});assert.equal(await azure.remaining(),0);
    await assert.rejects(invoke(),error=>error.code==='access_budget_or_policy_changed');
  }finally{azure?.close();rmSync(dir,{recursive:true,force:true});}
});
