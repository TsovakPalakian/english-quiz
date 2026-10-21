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
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/004_quota_limit_changes.sql',import.meta.url),'utf8'));
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
test('only developers initialize policies; absent policy fails closed and initialization cannot overwrite limits',async()=>{
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
test('limit changes retain started and reserved usage, window identity and immutable audit in SQLite/D1',async()=>{
  for(const d1 of [false,true]){const f=await setup({limit:5,d1});try{
    const started=await f.quota.reserve(source),reserved=await f.quota.reserve(source);await f.quota.start(started);
    const before=JSON.stringify(f.sql.prepare('SELECT * FROM qr_quota_reservations ORDER BY id').all());
    const update=body({expectedRevision:1,requestLimit:1,reason:'Lower the local quota.'});
    assert.deepEqual(await f.quota.updateLimit(actors.dev,'fixture',update),{revision:2,requestLimit:1});
    let status=await f.quota.inspect(actors.dev,'fixture');assert.equal(status.used,2);assert.equal(status.remaining,0);assert.equal(status.windowStart,10000);assert.equal(status.windowMs,1000);
    assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM qr_quota_reservations ORDER BY id').all()),before);
    await assert.rejects(f.quota.reserve(source),code('quota_or_access_denied'));
    await f.quota.start(reserved);assert.equal((await f.quota.inspect(actors.dev,'fixture')).used,2);
    await f.quota.updateLimit(actors.dev,'fixture',body({expectedRevision:2,requestLimit:4,reason:'Increase after review.'}));
    status=await f.quota.inspect(actors.dev,'fixture');assert.equal(status.used,2);assert.equal(status.remaining,2);
    const events=await f.quota.changes(actors.dev,'fixture');assert.deepEqual(events.changes.map(e=>[e.oldLimit,e.newLimit]),[[1,4],[5,1]]);
    assert.equal(events.changes[0].actorId,actors.dev.id);
    assert.throws(()=>f.sql.exec("UPDATE qr_quota_policies SET window_ms=2000"),/revision/);
    assert.throws(()=>f.sql.exec("DELETE FROM qr_quota_limit_changes"),/append only/);
    assert.throws(()=>f.sql.exec("UPDATE qr_quota_limit_changes SET reason='changed'"),/immutable/);
    const restarted=new GenerationQuota(f.db,{now:()=>10000});await restarted.initialize(actors.dev,{provider:'fixture',windowMs:1000,requestLimit:5});
    assert.equal((await restarted.inspect(actors.dev,'fixture')).requestLimit,4);
  }finally{f.close();}}
});
test('limit updates require developer rights, exact valid fields and the current revision',async()=>{
  const f=await setup();try{
    const input=body({expectedRevision:1,requestLimit:3,reason:'Reviewed quota.'});
    for(const actor of [actors.student,actors.teacher,{...actors.dev,revoked:true}]){
      await assert.rejects(f.quota.updateLimit(actor,'fixture',input),code('developer_required'));
      await assert.rejects(f.quota.changes(actor,'fixture'),code('developer_required'));
    }
    for(const extra of [{windowMs:2000},{actorId:'fake'},{requestLimit:0},{requestLimit:1.2},{requestLimit:1000001},{reason:' '},{expectedRevision:0},{mutationId:'bad'}])await assert.rejects(f.quota.updateLimit(actors.dev,'fixture',{...input,...extra}),code('invalid_request'));
    await f.quota.updateLimit(actors.dev,'fixture',input);
    await assert.rejects(f.quota.updateLimit(actors.dev,'fixture',body({expectedRevision:1,requestLimit:4,reason:'Stale change.'})),code('quota_configuration_conflict'));
    assert.equal((await f.quota.changes(actors.dev,'fixture')).changes.length,1);
  }finally{f.close();}
});
test('concurrent updates cannot overwrite changes and lost responses replay the original receipt',async()=>{
  const f=await setup({d1:true});try{
    const first=body({expectedRevision:1,requestLimit:3,reason:'Reviewed increase.'});
    const outcomes=await Promise.allSettled([first,body({expectedRevision:1,requestLimit:4,reason:'Another increase.'})].map(v=>f.quota.updateLimit(actors.dev,'fixture',v)));
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'quota_configuration_conflict');
    const current=await f.quota.inspect(actors.dev,'fixture'),next=body({expectedRevision:current.revision,requestLimit:5,reason:'Another reviewed limit.'});
    const atomic=f.db.atomic.bind(f.db);let once=true;f.db.atomic=async commands=>{const result=await atomic(commands);if(once){once=false;throw Error('Lost acknowledgement');}return result;};
    const saved=await f.quota.updateLimit(actors.dev,'fixture',next);assert.deepEqual(await f.quota.updateLimit(actors.dev,'fixture',next),saved);
    await assert.rejects(f.quota.updateLimit(actors.dev,'fixture',{...next,requestLimit:6}),code('quota_mutation_conflict'));
    assert.equal((await f.quota.changes(actors.dev,'fixture')).changes.length,2);
    const page=await f.quota.changes(actors.dev,'fixture',{limit:1}),last=await f.quota.changes(actors.dev,'fixture',{limit:1,before:page.next});assert.equal(last.next,null);assert.ok(page.changes[0].revision>last.changes[0].revision);
  }finally{f.close();}
});
test('concurrent duplicate saves have one audit event and cannot remove concurrently reserved usage',async()=>{
  const f=await setup({limit:5});try{
    const input=body({expectedRevision:1,requestLimit:2,reason:'Lower while preparing.'});
    const outcomes=await Promise.all([f.quota.updateLimit(actors.dev,'fixture',input),f.quota.updateLimit(actors.dev,'fixture',input),f.quota.reserve(source)]);
    assert.deepEqual(outcomes[0],outcomes[1]);assert.equal((await f.quota.changes(actors.dev,'fixture')).changes.length,1);
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).used,1);
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).remaining,1);
  }finally{f.close();}
});
test('failed audit insertion rolls back the policy revision and leaves reservations untouched',async()=>{
  const f=await setup();try{
    await f.quota.reserve(source);const before=await f.quota.inspect(actors.dev,'fixture');
    f.sql.exec("CREATE TRIGGER quota_test_audit_failure BEFORE INSERT ON qr_quota_limit_changes BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    await assert.rejects(f.quota.updateLimit(actors.dev,'fixture',body({expectedRevision:1,requestLimit:3,reason:'Must roll back with audit.'})),code('quota_unavailable'));
    assert.deepEqual(await f.quota.inspect(actors.dev,'fixture'),before);assert.equal((await f.quota.changes(actors.dev,'fixture')).changes.length,0);
  }finally{f.close();}
});
test('the draft upgrade preserves existing immutable-policy reservations',async()=>{
  const f=await fixture();try{
    f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/003_generation_quota.sql',import.meta.url),'utf8'));
    f.sql.prepare('INSERT INTO qr_quota_policies VALUES(?,?,?,?,?)').run('fixture',1000,2,'dev',10000);
    const reservation=crypto.randomUUID();f.sql.prepare("INSERT INTO qr_quota_reservations VALUES(?,?,?,'started',?,?,?)").run(reservation,'fixture',10000,JSON.stringify(source),10000,10000);
    f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/004_quota_limit_changes.sql',import.meta.url),'utf8'));
    const quota=new GenerationQuota(f.db,{now:()=>10000});assert.equal((await quota.inspect(actors.dev,'fixture')).used,1);
    await quota.updateLimit(actors.dev,'fixture',body({expectedRevision:1,requestLimit:1,reason:'Keep existing usage.'}));
    assert.equal((await quota.inspect(actors.dev,'fixture')).used,1);assert.equal(f.sql.prepare('SELECT id FROM qr_quota_reservations').get().id,reservation);
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
test('developer history is paginated with a stable timestamp/id cursor across equal timestamps',async()=>{
  for(const d1 of [false,true]){const f=await setup({d1});try{
    for(let i=0;i<7;i++){const id=await f.quota.reserve(source);await f.quota.release(id);}
    const first=await f.quota.history(actors.dev,'fixture',{limit:3});assert.equal(first.reservations.length,3);assert.ok(first.next);
    const second=await f.quota.history(actors.dev,'fixture',{limit:3,cursor:first.next});
    const third=await f.quota.history(actors.dev,'fixture',{limit:3,cursor:second.next});
    assert.equal(third.reservations.length,1);assert.equal(third.next,null);
    assert.equal(new Set([...first.reservations,...second.reservations,...third.reservations].map(r=>r.id)).size,7);
    assert.deepEqual(first.reservations[0].source,source);assert.equal(first.reservations[0].state,'released');
    assert.equal((await f.quota.inspect(actors.dev,'fixture')).windowEnd,11000);
    for(const actor of [actors.teacher,actors.student,{...actors.dev,revoked:true}])await assert.rejects(f.quota.history(actor,'fixture'),code('developer_required'));
    for(const options of [{cursor:'invalid'},{limit:101},{limit:0},{cursor:'9999999999999999:'+crypto.randomUUID()}])await assert.rejects(f.quota.history(actors.dev,'fixture',options),code('invalid_request'));
  }finally{f.close();}}
});
