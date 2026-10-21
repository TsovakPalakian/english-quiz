import test from 'node:test';
import assert from 'node:assert/strict';
import {actors,body} from './quiz-review-fixture.mjs';
import {mediaFixture} from './quiz-media-fixture.mjs';
import {createWordNetAdapter} from '../src/wordnet-language-provider.mjs';
import {createMeloTTSAdapter,MELOTTS_MODEL,MELOTTS_VOICE} from '../src/melotts-language-provider.mjs';
import {boundedProviderBytes} from '../src/bounded-provider-body.mjs';
import {LanguageProviders} from '../src/language-providers.mjs';
import {StoredLanguageProviders} from '../src/stored-language-providers.mjs';
import {QuizLanguageMaterials,validateDictionaryResult} from '../src/quiz-language-materials.mjs';
const code=(promise,value)=>assert.rejects(promise,error=>error.code===value);
// Synthetic imported-record contract, NOT a downloaded WordNet definition or playable MP3.
const record={word:'drizzle',senseKey:'drizzle%1:00:00::',pos:'n',definition:'Synthetic test meaning.',examples:['Synthetic test example.'],forms:[]};
const mp3=new Uint8Array([73,68,51,4,0,0,0,0,0,0,255,251,144,0]);
const dataset=(lookup=async()=>[record],sha256='a'.repeat(64))=>({version:'3.0',sha256,licenseNotice:'Princeton University. Synthetic test notice; not licensed production data.',lookup});
test('WordNet is off by default, requires a pinned import and never invents translations, IPA or CEFR',async()=>{
  let calls=0;const data=dataset(async()=>{calls++;return [record];});
  await code(createWordNetAdapter({dataset:data}).invoke({word:'drizzle'}),'provider_disabled');assert.equal(calls,0);
  await code(createWordNetAdapter({enabled:true}).invoke({word:'drizzle'}),'provider_not_configured');
  const adapter=createWordNetAdapter({enabled:true,dataset:data}),out=await adapter.invoke({word:'drizzle'});
  assert.equal(out.entries[0].referenceId,record.senseKey);assert.equal(out.entries[0].translation,null);assert.equal(out.entries[0].ipa,null);assert.equal(out.entries[0].level,null);assert.equal(out.entries[0].examples[0].translation,null);
  assert.deepEqual(adapter.validate(out),out);assert.match(adapter.version,/a{64}/);
  assert.throws(()=>createWordNetAdapter({dataset:{...data,licenseNotice:''}}),error=>error.code==='invalid_configuration');
});
test('WordNet rejects wrong lemmas/POS, duplicates, unbounded or empty results and cancelled calls',async()=>{
  for(const records of [[{...record,word:'bank'}],[{...record,pos:'v'}],[{...record,senseKey:'bank%1:00:00::'}],[record,record],Array(9).fill(record),[{...record,examples:[null]}]]){
    await code(createWordNetAdapter({enabled:true,dataset:dataset(async()=>records)}).invoke({word:'drizzle'}),'invalid_provider_result');
  }
  await code(createWordNetAdapter({enabled:true,dataset:dataset(async()=>[])}).invoke({word:'drizzle'}),'dictionary_not_found');
  const controller=new AbortController();controller.abort();await code(createWordNetAdapter({enabled:true,dataset:dataset()}).invoke({word:'drizzle'},{signal:controller.signal}),'cancelled');
  assert.throws(()=>validateDictionaryResult({entries:[{...( {word:'drizzle',partOfSpeech:'noun',definition:'test',translation:null,ipa:null,forms:[],examples:[],source:{title:'Test',url:'https://example.org',license:'Test'}}),level:'B2'}]}),/level/);
});
test('MeloTTS requires explicit configuration and conditions; validates binary response, locale and voice',async()=>{
  let calls=0;const run=async(model,input)=>{calls++;assert.equal(model,MELOTTS_MODEL);assert.deepEqual(input,{prompt:'drizzle',lang:'en'});return new Response(mp3,{headers:{'content-type':'audio/mpeg'}});};
  const input={word:'drizzle',voice:MELOTTS_VOICE.id};
  await code(createMeloTTSAdapter({run}).invoke(input),'provider_disabled');
  await code(createMeloTTSAdapter({enabled:true,run}).invoke(input),'provider_not_configured');assert.equal(calls,0);
  const adapter=createMeloTTSAdapter({enabled:true,run,reuseConditions:'Synthetic test terms.',termsRevision:'fixture-v1'});
  const result=await adapter.invoke(input);assert.equal(result.mime,'audio/mpeg');assert.deepEqual(result.bytes,mp3);assert.deepEqual(adapter.validate(result),result);
  await code(adapter.invoke({...input,voice:'Daniel'}),'invalid_request');
  for(const value of [new Response('{}',{headers:{'content-type':'application/json'}}),new Response('x',{status:429}),new Uint8Array([1,2,3]),{audio:'https://arbitrary.invalid/audio'}]){
    await assert.rejects(createMeloTTSAdapter({enabled:true,run:async()=>value,reuseConditions:'Test',termsRevision:'fixture-v1'}).invoke(input));
  }
  const registry=new LanguageProviders({adapters:[adapter],authorize:async()=>true});
  assert.throws(()=>registry.configure(actors.dev,{expectedRevision:1,selections:{tts:{adapterId:adapter.id,locale:'en',mode:'text'}}}),error=>error.code==='paid_provider_blocked');
});
test('bounded binary reads cancel on oversize and abort instead of storing partial audio',async()=>{
  let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2]));},cancel(){cancelled=true;}});
  await code(boundedProviderBytes(stream,1),'invalid_provider_result');assert.equal(cancelled,true);
  const controller=new AbortController(),waiting=new ReadableStream({cancel(){cancelled=true;}}),result=boundedProviderBytes(waiting,10,controller.signal);controller.abort();await code(result,'cancelled');
  await code(boundedProviderBytes(new Uint8Array(),10),'invalid_provider_result');
});
test('real-adapter contracts use saved settings, cache, provenance, media inspection and unchanged sense metadata',async()=>{
  let lookups=0,speech=0,inspected=0;
  const f=await mediaFixture({inspect:async(bytes,mime)=>{inspected++;assert.equal(mime,'audio/mpeg');assert.deepEqual(bytes,mp3);return {kind:'audio',duration:0.5,width:0,height:0};}});
  try{
    const dictionary=createWordNetAdapter({enabled:true,dataset:dataset(async()=>{lookups++;return [record];})});
    const tts=createMeloTTSAdapter({enabled:true,freeTierVerified:true,run:async()=>{speech++;return mp3;},reuseConditions:'Synthetic test reuse conditions.',termsRevision:'fixture-v1'});
    const providers=new StoredLanguageProviders(f.db,{adapters:[dictionary,tts],authorize:async()=>true});await providers.initialize(actors.dev);
    const configure=async selections=>providers.configure(actors.dev,body({expectedRevision:(await providers.inspect(actors.dev)).revision,selections,reason:'Fixture-only integration.'}));
    const materials=new QuizLanguageMaterials(f.kits,f.media,{providers,worker:actors.dev,voices:[MELOTTS_VOICE],budgets:{dictionary:{day:3,month:10},tts:{day:50,month:100}}});
    await assert.rejects(materials.create(actors.teacher,'dictionary',body(f.context)),error=>error.status===409);
    await configure({dictionary:{adapterId:dictionary.id,locale:'en',mode:'text'},tts:{adapterId:tts.id,locale:'en',mode:'text'}});
    const reference=await materials.create(actors.teacher,'dictionary',body(f.context));assert.equal(reference.state,'complete');assert.equal(reference.result.entries[0].referenceId,record.senseKey);
    assert.equal((await materials.create(actors.teacher,'dictionary',body(f.context))).id,reference.id);assert.equal(lookups,1);
    const audio=await materials.create(actors.teacher,'tts',body({...f.context,voice:MELOTTS_VOICE.id}));assert.equal(audio.state,'complete');assert.equal(audio.result.media.mime,'audio/mpeg');assert.equal(audio.result.media.name,'reference.mp3');assert.equal(audio.result.media.source.rights,'Synthetic test reuse conditions.');
    assert.equal((await materials.create(actors.teacher,'tts',body({...f.context,voice:MELOTTS_VOICE.id}))).id,audio.id);assert.equal(speech,1);assert.equal(inspected,1);
    assert.equal((await f.kits.metadata(f.senseId)).source,null);assert.equal(audio.result.teacherCheckRequired,true);
    await configure({tts:null});await assert.rejects(materials.create(actors.teacher,'tts',body({...f.context,voice:MELOTTS_VOICE.id})),error=>error.status===409);
    assert.equal(speech,1);
  }finally{f.close();}
});
test('changing a WordNet import or TTS terms requires reconfirming the saved adapter pin',async()=>{
  const f=await mediaFixture();try{
    const first=createWordNetAdapter({enabled:true,dataset:dataset()}),tts=createMeloTTSAdapter({freeTierVerified:true,termsRevision:'fixture-v1'});
    const providers=new StoredLanguageProviders(f.db,{adapters:[first,tts]});await providers.initialize(actors.dev);
    await providers.configure(actors.dev,body({expectedRevision:1,selections:{dictionary:{adapterId:first.id,locale:'en',mode:'text'},tts:{adapterId:tts.id,locale:'en',mode:'text'}},reason:'Fixture-only pinned configuration.'}));
    const changed=new StoredLanguageProviders(f.db,{adapters:[createWordNetAdapter({enabled:true,dataset:dataset(async()=>[record],'b'.repeat(64))}),createMeloTTSAdapter({freeTierVerified:true,termsRevision:'fixture-v2'})]});
    assert.deepEqual((await changed.inspect(actors.dev)).unavailable.map(row=>row.task).sort(),['dictionary','tts']);
    await code(changed.execute('dictionary',{word:'drizzle'}),'provider_configuration_changed');
  }finally{f.close();}
});
