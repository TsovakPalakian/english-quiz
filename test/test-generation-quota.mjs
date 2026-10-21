import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
import {GenerationQuota} from '../src/generation-quota.mjs';
import {LanguageProviders} from '../src/language-providers.mjs';
import {QuizGenerationService} from '../src/quiz-generation.mjs';
import {createRoutedQuizGenerator} from '../src/workers-ai-quiz-provider.mjs';
const source={task:'generation',adapterId:'local',provider:'fixture',model:'model-a',version:'v1',locale:'en-US',mode:'text',configurationRevision:2};
const code=value=>error=>error.code===value;
async function setup({limit=2,d1=false}={}){
  const f=await fixture({d1});f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/003_generation_quota.sql',import.meta.url),'utf8'));
  let time=10000;const quota=new GenerationQuota(f.db,{now:()=>time});
  await quota.initialize(actors.dev,{provider:'fixture',windowMs:1000,requestLimit:limit});
  return {...f,quota,advance:n=>time+=n};
}
function providers(quota,invoke,authorize=async()=>true){
  const service=new LanguageProviders({quota,authorize,adapters:['a','b'].map(id=>({id,provider:'fixture',model:'model-'+id,version:'v1',billing:'self-hosted',capabilities:[{task:'generation',locales:['en-US'],modes:['text']}],invoke,validate:raw=>raw}))});
  const select=id=>service.configure(actors.dev,{expectedRevision:service.inspect(actors.dev).revision,selections:{generation:{adapterId:id,locale:'en-US',mode:'text'}}});
  select('a');return {service,select};
}
test('parallel reservations across clients share one atomic provider window, including D1 compilation',async()=>{
  for(const d1 of [false,true]){const f=await setup({d1});try{
    const other=new GenerationQuota(f.db,{now:()=>10000});
    const results=await Promise.allSettled(Array.from({length:10},(_,i)=>(i%2?other:f.quota).reserve({...source,model:'model-'+i})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
    assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='quota_or_access_denied'));
    assert.equal((await other.inspect(actors.dev,'fixture')).remaining,0);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM qr_quota_reservations').get().n,2);
    assert.deepEqual(f.sql.prepare("SELECT name FROM sqlite_master WHERE name LIKE '_study_batch_%'").all(),[]);
  }finally{f.close();}}
});
test('only developers initialize immutable policies; absent policy fails closed',async()=>{
  const f=await setup();try{
    for(const actor of [actors.student,actors.teacher,{...actors.dev,active:false}]){
      await assert.rejects(f.quota.initialize(actor,{provider:'other',windowMs:1000,requestLimit:1}),code('developer_required'));
      await assert.rejects(f.quota.inspect(actor,'fixture'),code('developer_required'));
    }
    await assert.rejects(f.quota.reserve({...source,provider:'unconfigured'}),code('quota_or_access_denied'));
    await assert.rejects(f.quota.initialize(actors.dev,{provider:'fixture',windowMs:1000,requestLimit:100}));
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).requestLimit,2);
    for(const requestLimit of [0,-1,Infinity,1.1])await assert.rejects(f.quota.initialize(actors.dev,{provider:'x',windowMs:1000,requestLimit}),code('invalid_configuration'));
    assert.throws(()=>f.sql.exec("DELETE FROM qr_quota_policies"),/immutable/);
  }finally{f.close();}
});
test('only unstarted reservations can be released; repeated start cannot duplicate a call',async()=>{
  const f=await setup({limit:1});try{
    const first=await f.quota.reserve(source);await f.quota.release(first);await f.quota.release(first);
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).remaining,1);
    const second=await f.quota.reserve(source);await f.quota.start(second);await f.quota.release(second);
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).remaining,0);
    await assert.rejects(f.quota.start(second),code('quota_or_access_denied'));
    assert.throws(()=>f.sql.prepare("UPDATE qr_quota_reservations SET state='released' WHERE id=?").run(second),/immutable/);
    assert.throws(()=>f.sql.exec('DELETE FROM qr_quota_reservations'),/append only/);
  }finally{f.close();}
});
test('window rollover does not dispatch stale reservations; restart retains uncertain holds',async()=>{
  const f=await setup({limit:1});try{
    const first=await f.quota.reserve(source);
    const restarted=new GenerationQuota(f.db,{now:()=>10000});
    await assert.rejects(restarted.reserve(source),code('quota_or_access_denied'));
    f.advance(1000);await assert.rejects(f.quota.start(first),code('quota_or_access_denied'));
    const next=await f.quota.reserve(source);await f.quota.start(next);
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).remaining,0);
    assert.equal(f.sql.prepare('SELECT state FROM qr_quota_reservations WHERE id=?').get(first).state,'reserved');
  }finally{f.close();}
});
test('provider switching cannot reset quota and every failed or malformed invocation remains charged',async()=>{
  const f=await setup({limit:2});try{
    let calls=0;const {service,select}=providers(f.quota,async()=>{calls++;throw Error('private provider failure');});
    await assert.rejects(service.execute('generation',{}),code('provider_failed'));select('b');
    await assert.rejects(service.execute('generation',{}),code('provider_failed'));
    await assert.rejects(service.execute('generation',{}),code('quota_or_access_denied'));assert.equal(calls,2);
    assert.ok(f.sql.prepare('SELECT state FROM qr_quota_reservations').all().every(r=>r.state==='started'));
    f.advance(1000);await assert.rejects(service.execute('generation',{}),code('provider_failed'));assert.equal(calls,3);
  }finally{f.close();}
});
test('authorization denial and cancelled requests never dispatch or consume a reservation',async()=>{
  const f=await setup({limit:1});try{
    let calls=0;const {service}=providers(f.quota,async()=>{calls++;return {};},async()=>false);
    await assert.rejects(service.execute('generation',{}),code('quota_or_access_denied'));
    const controller=new AbortController();controller.abort();
    await assert.rejects(f.quota.reserve(source,{signal:controller.signal}),code('cancelled'));
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).used,0);assert.equal(calls,0);
  }finally{f.close();}
});
test('timeout during a delayed reserve releases it without starting a provider',async()=>{
  const f=await setup({limit:1});try{
    let done,calls=0;const waiting=new Promise(resolve=>done=resolve);
    const gate={reserve:async(...args)=>{const id=await f.quota.reserve(...args);await waiting;return id;},start:id=>f.quota.start(id),release:id=>f.quota.release(id)};
    const {service}=providers(gate,async()=>{calls++;return {};});
    await assert.rejects(service.execute('generation',{}, {timeoutMs:10}),code('timeout'));
    done();await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(calls,0);assert.equal((await f.quota.inspect(actors.dev,'fixture')).remaining,1);
  }finally{f.close();}
});
test('timeout after dispatch retains quota even if a late response succeeds',async()=>{
  const f=await setup({limit:1});try{
    let done,calls=0;const waiting=new Promise(resolve=>done=resolve);
    const {service}=providers(f.quota,async()=>{calls++;await waiting;return {};});
    await assert.rejects(service.execute('generation',{}, {timeoutMs:10}),code('timeout'));
    done();await new Promise(resolve=>setTimeout(resolve,10));
    await assert.rejects(service.execute('generation',{}),code('quota_or_access_denied'));
    assert.equal(calls,1);assert.equal((await f.quota.inspect(actors.dev,'fixture')).used,1);
  }finally{f.close();}
});
test('database failure blocks transport without exposing the storage error',async()=>{
  const f=await setup();try{
    let calls=0;const broken=new GenerationQuota({read:f.db.read,atomic:async()=>{throw Error('private storage detail');}});
    const {service}=providers(broken,async()=>{calls++;return {};});
    await assert.rejects(service.execute('generation',{}),e=>e.code==='quota_unavailable'&&!e.message.includes('private'));
    assert.equal(calls,0);
  }finally{f.close();}
});
test('invalid provider output still consumes its request reservation',async()=>{
  const f=await setup({limit:1});try{
    const service=new LanguageProviders({quota:f.quota,authorize:async()=>true,adapters:[{
      id:'invalid',provider:'fixture',model:'model',version:'v1',billing:'self-hosted',
      capabilities:[{task:'generation',locales:['en-US'],modes:['text']}],invoke:async()=>null,
      validate:()=>{throw Error('Invalid output');},
    }]});
    service.configure(actors.dev,{expectedRevision:1,selections:{generation:{adapterId:'invalid',locale:'en-US',mode:'text'}}});
    await assert.rejects(service.execute('generation',{}),code('provider_failed'));
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).remaining,0);
  }finally{f.close();}
});
test('queue exhaustion stops without transport or retries while the first candidate remains submitted',async()=>{
  const f=await setup({limit:1});try{
    f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/002_generation_jobs.sql',import.meta.url),'utf8'));
    let calls=0;const {service}=providers(f.quota,async request=>{
      calls++;return {text:JSON.stringify({type:request.type,meaning:request.meaning,content:{explanation:'A fine rain.',items:[request.type==='Flip'?{front:request.meaning.en,back:request.meaning.translation}:{prompt:request.meaning.translation,answer:request.meaning.en}]}}),usage:{}};
    });
    const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate:createRoutedQuizGenerator({providers:service})});
    await generation.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Flip','Type']}));
    await generation.runOne();await generation.runOne();assert.equal(await generation.runOne(),false);
    const jobs=await generation.list(actors.teacher);
    assert.equal(calls,1);assert.equal(jobs.filter(j=>j.state==='submitted').length,1);
    const stopped=jobs.find(j=>j.state==='review');assert.ok(stopped);assert.equal(stopped.issue,'quota_exceeded');assert.equal(stopped.attempts,1);
    assert.deepEqual(await f.service.sharedForCard(actors.student,1),[]);
  }finally{f.close();}
});
