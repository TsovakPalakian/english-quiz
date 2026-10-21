import test from 'node:test';
import assert from 'node:assert/strict';
import {actors,body} from './quiz-review-fixture.mjs';
import {mediaFixture,wav} from './quiz-media-fixture.mjs';
import {StoredLanguageProviders} from '../src/stored-language-providers.mjs';
import {QuizLanguageMaterials} from '../src/quiz-language-materials.mjs';
const denied=(promise,status)=>assert.rejects(promise,error=>error.status===status);
async function setup({dictionaryDay=3,dictionaryMonth=10,ttsDay=30,invoke=null}={}){
  const f=await mediaFixture(),calls=[];
  const adapters=['a','b'].map(id=>({id,provider:'local-test',model:id,version:'v1',billing:'self-hosted',capabilities:[{task:'dictionary',locales:['en-US'],modes:['text']},{task:'tts',locales:['en-US'],modes:['text']}],
    invoke:async(input,options)=>{calls.push(options.source);if(invoke)return invoke(input,options);return options.source.task==='tts'?{bytes:wav(),voice:input.voice,mime:'audio/wav'}:{entries:[{word:input.word,partOfSpeech:'noun',definition:'Light rain.',translation:'изморось',ipa:'/ˈdrɪzəl/',forms:['drizzles'],examples:[],source:{title:'Local test source',url:'https://example.org/fixture',license:'Test data only'}}]};},validate:result=>result}));
  const providers=new StoredLanguageProviders(f.db,{adapters,authorize:async()=>true});await providers.initialize(actors.dev);
  const pick=adapterId=>({adapterId,locale:'en-US',mode:'text'});
  const configure=async selections=>providers.configure(actors.dev,body({expectedRevision:(await providers.inspect(actors.dev)).revision,selections,reason:'Local test configuration.'}));
  let now=Date.UTC(2026,9,21,12);
  const materials=new QuizLanguageMaterials(f.kits,f.media,{providers,worker:actors.dev,voices:[{id:'Test',locale:'en-US'}],budgets:{dictionary:{day:dictionaryDay,month:dictionaryMonth},tts:{day:ttsDay,month:100}},now:()=>now});
  return {...f,materials,providers,configure,pick,calls,advance:milliseconds=>now+=milliseconds};
}
test('material tasks default off, enforce roles, preserve source/IPA and cache without repeated calls',async()=>{
  const f=await setup();try{
    await denied(f.materials.create(actors.student,'dictionary',body(f.context)),403);await denied(f.materials.create(actors.teacher,'dictionary',body(f.context)),409);
    await f.configure({dictionary:f.pick('a'),tts:f.pick('a')});
    const operation=body(f.context),first=await f.materials.create(actors.teacher,'dictionary',operation);assert.equal(first.state,'complete');assert.equal(first.result.entries[0].ipa,'/ˈdrɪzəl/');assert.equal(first.result.source.model,'a');
    assert.equal((await f.materials.create(actors.teacher,'dictionary',operation)).id,first.id);assert.equal((await f.materials.create(actors.teacher,'dictionary',body(f.context))).id,first.id);assert.equal(f.calls.length,1);
    assert.equal((await f.kits.metadata(f.senseId)).source,null,'Reference lookup cannot silently change meaning metadata');
    const audio=await f.materials.create(actors.teacher,'tts',body({...f.context,voice:'Test'}));assert.equal(audio.state,'complete');assert.equal(audio.result.media.source.kind,'tts');assert.equal(audio.result.teacherCheckRequired,true);
    const status=await f.materials.status(actors.teacher);assert.equal(status.tasks.find(row=>row.task==='dictionary').dayUsed,1);assert.equal(status.tasks.find(row=>row.task==='tts').dayUsed,7);
    await denied(f.materials.get(actors.second,audio.id),404);await denied(f.materials.create(actors.teacher,'tts',body({...f.context,voice:'https://arbitrary.invalid/voice'})),400);
    await f.configure({tts:null});await denied(f.materials.create(actors.teacher,'tts',body({...f.context,voice:'Test'})),409);
    await f.configure({tts:f.pick('a')});assert.equal((await f.materials.create(actors.teacher,'tts',body({...f.context,voice:'Test'}))).id,audio.id);assert.equal(f.calls.length,2);
  }finally{f.close();}
});
test('provider switches do not reset unit budgets and separate characters from request counts',async()=>{
  const f=await setup({dictionaryDay:1,ttsDay:7});try{
    await f.configure({dictionary:f.pick('a'),tts:f.pick('a')});await f.materials.create(actors.teacher,'dictionary',body(f.context));await f.materials.create(actors.teacher,'tts',body({...f.context,voice:'Test'}));
    await f.configure({dictionary:f.pick('b'),tts:f.pick('b')});await denied(f.materials.create(actors.teacher,'dictionary',body(f.context)),429);await denied(f.materials.create(actors.teacher,'tts',body({...f.context,voice:'Test'})),429);assert.equal(f.calls.length,2);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_language_usage').get().n,2);
  }finally{f.close();}
});
test('concurrent cached preparation dispatches once and records failures without free retries',async()=>{
  let finish;
  const f=await setup({invoke:async()=>new Promise(resolve=>finish=resolve)});try{
    await f.configure({dictionary:f.pick('a')});const operation=body(f.context),running=f.materials.create(actors.teacher,'dictionary',operation);
    for(let n=0;n<100&&!finish;n++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(finish);
    const duplicate=await f.materials.create(actors.teacher,'dictionary',body(f.context));assert.equal(duplicate.state,'started');assert.equal(f.calls.length,1);
    finish({entries:[{word:'wrong'}]});const failed=await running;assert.equal(failed.state,'failed');assert.equal((await f.materials.create(actors.teacher,'dictionary',operation)).id,failed.id);assert.equal(f.calls.length,1);
    assert.equal((await f.materials.status(actors.teacher)).tasks.find(task=>task.task==='dictionary').dayUsed,1);
  }finally{f.close();}
});
test('legacy six-task settings load with dictionary disabled without rewriting their audit',async()=>{
  const f=await setup();try{
    f.sql.exec("UPDATE qr_provider_configuration SET revision=revision+1,selections_json=json_remove(selections_json,'$.dictionary')");
    const state=await f.providers.inspect(actors.dev);assert.equal(state.selections.dictionary,null);assert.equal((await f.providers.history(actors.dev)).changes.length,0);
    await f.configure({dictionary:f.pick('a')});assert.equal((await f.providers.inspect(actors.dev)).selections.dictionary.adapterId,'a');
  }finally{f.close();}
});
test('interrupted requests fail at a saved deadline, retain reservations and cannot accept a late result',async()=>{
  let finish;const f=await setup({invoke:async()=>new Promise(resolve=>finish=resolve)});try{
    await f.configure({dictionary:f.pick('a')});const running=f.materials.create(actors.teacher,'dictionary',body(f.context));
    for(let n=0;n<100&&!finish;n++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(finish);
    const id=f.sql.prepare('SELECT id FROM qr_language_usage').get().id;f.advance(120001);assert.equal((await f.materials.get(actors.teacher,id)).state,'failed');assert.equal(f.calls.length,1);
    finish({entries:[]});assert.equal((await running).state,'failed');assert.match((await f.materials.get(actors.teacher,id)).result.error,/interrupted/);
    assert.throws(()=>f.sql.exec('UPDATE qr_language_usage SET quantity=0'),/immutable/);assert.throws(()=>f.sql.exec('DELETE FROM qr_language_usage'),/immutable/);
    assert.equal((await f.materials.status(actors.teacher)).tasks.find(task=>task.task==='dictionary').dayUsed,1);
  }finally{f.close();}
});
test('a new day does not reset the monthly provider allowance',async()=>{
  const f=await setup({dictionaryDay:1,dictionaryMonth:1});try{
    await f.configure({dictionary:f.pick('a')});await f.materials.create(actors.teacher,'dictionary',body(f.context));f.advance(86400000);await f.configure({dictionary:f.pick('b')});
    await denied(f.materials.create(actors.teacher,'dictionary',body(f.context)),429);const status=(await f.materials.status(actors.teacher)).tasks.find(task=>task.task==='dictionary');assert.equal(status.dayUsed,0);assert.equal(status.monthUsed,1);assert.equal(f.calls.length,1);
  }finally{f.close();}
});
