import test from 'node:test';
import assert from 'node:assert/strict';
import {LanguageProviders} from '../src/language-providers.mjs';
import {createModelQuizGenerator} from '../src/quiz-generation-model.mjs';
const dev={id:'dev',role:'DEVELOPER'};
const pick=(adapterId='local-a',mode='scripted')=>({adapterId,locale:'en-US',mode});
const make=(id='local-a',extra={})=>({id,provider:'test',model:'fixture',version:'v1',billing:'self-hosted',capabilities:[{task:'pronunciation',locales:['en-US'],modes:['scripted']}],invoke:async()=>({score:80}),validate:raw=>{assert.ok(raw.score>=0&&raw.score<=100);return raw;},...extra});
const set=(service,selections)=>service.configure(dev,{expectedRevision:service.inspect(dev).revision,selections});
const code=expected=>error=>error.code===expected;
test('all tasks are disabled by default and registered transports cannot bypass the default gate',async()=>{
  let calls=0;const service=new LanguageProviders({adapters:[make('local-a',{invoke:async()=>calls++})]});
  await assert.rejects(service.execute('pronunciation',{}),code('provider_disabled'));
  set(service,{pronunciation:pick()});await assert.rejects(service.execute('pronunciation',{}),code('quota_or_access_denied'));assert.equal(calls,0);
});
test('developer authorization, revision and capability validation prevent partial configuration',()=>{
  const service=new LanguageProviders({adapters:[make()]});
  for(const actor of [null,{id:'a',role:'ADMIN'},{...dev,active:false},{...dev,revoked:true}])assert.throws(()=>service.configure(actor,{expectedRevision:1,selections:{pronunciation:pick()}}),code('developer_required'));
  assert.throws(()=>set(service,{pronunciation:pick(),stt:pick()}),code('unsupported_capability'));
  assert.equal(service.inspect(dev).selections.pronunciation,null);
  assert.throws(()=>set(service,{pronunciation:pick('local-a','unscripted')}),code('unsupported_capability'));
  set(service,{pronunciation:pick()});
  assert.throws(()=>service.configure(dev,{expectedRevision:1,selections:{pronunciation:null}}),code('configuration_conflict'));
});
test('paid or unknown providers, arbitrary endpoints and unknown configuration fields fail closed',()=>{
  const service=new LanguageProviders({adapters:[make('paid',{billing:'paid'}),make('unknown',{billing:'unknown'})]});
  for(const id of ['paid','unknown'])assert.throws(()=>set(service,{pronunciation:pick(id)}),code('paid_provider_blocked'));
  assert.throws(()=>set(service,{pronunciation:{...pick(),endpoint:'http://private'}}),code('invalid_selection'));
  assert.throws(()=>set(service,{other:null}),code('invalid_configuration'));
});
test('free-tier still requires a successful per-request quota gate and never falls back',async()=>{
  let calls=0;const service=new LanguageProviders({authorize:async()=>false,adapters:[make('free',{billing:'free-tier',invoke:async()=>calls++}),make('paid',{billing:'paid'})]});
  set(service,{pronunciation:pick('free')});await assert.rejects(service.execute('pronunciation',{}),code('quota_or_access_denied'));assert.equal(calls,0);
});
test('switching retains the original provider for requests already waiting on authorization',async()=>{
  let release;const waiting=new Promise(resolve=>release=resolve);
  const service=new LanguageProviders({authorize:async()=>{await waiting;return true;},adapters:[make(),make('local-b',{model:'better',invoke:async()=>({score:95})})]});
  set(service,{pronunciation:pick()});const pending=service.execute('pronunciation',{});
  set(service,{pronunciation:pick('local-b')});release();
  const old=await pending,current=await service.execute('pronunciation',{});
  assert.equal(old.source.adapterId,'local-a');assert.equal(old.source.configurationRevision,2);assert.equal(old.data.score,80);
  assert.equal(current.source.adapterId,'local-b');assert.equal(current.source.configurationRevision,3);assert.equal(current.data.score,95);
  set(service,{pronunciation:null});await assert.rejects(service.execute('pronunciation',{}),code('provider_disabled'));
});
test('caller mutations cannot replace registered capabilities, saved settings or audit snapshots',()=>{
  const adapter=make(),service=new LanguageProviders({adapters:[adapter]});adapter.capabilities[0].modes.push('unscripted');
  assert.throws(()=>set(service,{pronunciation:pick('local-a','unscripted')}),code('unsupported_capability'));
  const selection=pick();set(service,{pronunciation:selection});selection.adapterId='evil';
  const state=service.inspect(dev);state.selections.pronunciation.adapterId='evil';service.history(dev)[0].selections.pronunciation.adapterId='evil';
  assert.equal(service.inspect(dev).selections.pronunciation.adapterId,'local-a');assert.equal(service.history(dev)[0].selections.pronunciation.adapterId,'local-a');
  assert.equal(JSON.stringify(state).includes('invoke'),false);
});
test('cancellation and timeout abort transports; provider error details never escape',async()=>{
  let aborted=false;const service=new LanguageProviders({authorize:async()=>true,adapters:[make('hang',{invoke:(_, {signal})=>new Promise(()=>{signal.addEventListener('abort',()=>aborted=true);})}),make('broken',{invoke:async()=>{throw new Error('private API key');}})]});
  set(service,{pronunciation:pick('hang')});await assert.rejects(service.execute('pronunciation',{}, {timeoutMs:5}),code('timeout'));assert.equal(aborted,true);
  const controller=new AbortController(),pending=service.execute('pronunciation',{}, {signal:controller.signal});controller.abort();await assert.rejects(pending,code('cancelled'));
  set(service,{pronunciation:pick('broken')});await assert.rejects(service.execute('pronunciation',{}),error=>error.code==='provider_failed'&&!error.message.includes('private'));
});
test('invalid provider scores are rejected instead of recorded as zero',async()=>{
  const service=new LanguageProviders({authorize:async()=>true,adapters:[make('invalid',{invoke:async()=>({score:101})})]});set(service,{pronunciation:pick('invalid')});
  await assert.rejects(service.execute('pronunciation',{}),code('provider_failed'));
});
test('invalid registry entries fail at construction and cannot silently overwrite adapters',()=>{
  for(const adapters of [[make(),make()],[make('bad',{validate:null})],[make('bad',{capabilities:[{task:'stt',locales:['en-US'],modes:['invalid']}]})]])assert.throws(()=>new LanguageProviders({adapters}),code('invalid_adapter'));
});
test('an authorization result arriving after timeout cannot start a provider call',async()=>{
  let release,calls=0;const waiting=new Promise(resolve=>release=resolve);
  const service=new LanguageProviders({authorize:async()=>{await waiting;return true;},adapters:[make('local-a',{invoke:async()=>{calls++;return {score:80};}})]});set(service,{pronunciation:pick()});
  await assert.rejects(service.execute('pronunciation',{}, {timeoutMs:5}),code('timeout'));
  release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,0);
});
test('independent task selections route generation through the existing strict model adapter',async()=>{
  const adapter=make('text',{capabilities:[{task:'generation',locales:['en-US'],modes:['text']}],
    invoke:async request=>JSON.stringify({type:request.type,meaning:request.meaning,content:{explanation:'A fine rain.',items:[{front:request.meaning.en,back:request.meaning.translation}]}}),
    validate:raw=>{assert.equal(typeof raw,'string');return raw;}});
  const service=new LanguageProviders({authorize:async()=>true,adapters:[adapter,make()]});
  set(service,{generation:pick('text','text'),pronunciation:pick()});
  const generate=createModelQuizGenerator({enabled:true,complete:async(request,{signal})=>(await service.execute('generation',request,{signal})).data});
  const quiz=await generate({type:'Flip',meaning:{en:'drizzle',translation:'light rain',definition:'Fine rain.',part_of_speech:'noun'}});
  assert.equal(quiz.items[0].front,'drizzle');assert.equal((await service.execute('pronunciation',{})).data.score,80);
  assert.equal(service.inspect(dev).selections.review,null);
});
