import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
import {StoredLanguageProviders} from '../src/stored-language-providers.mjs';
import {GenerationQuota} from '../src/generation-quota.mjs';
const schema=readFileSync(new URL('../migrations/quiz-review-draft/005_provider_settings.sql',import.meta.url),'utf8');
const code=value=>error=>error.code===value;
const pick=(adapterId='a')=>({adapterId,locale:'en-US',mode:'text'});
const adapter=(id='a',extra={})=>({id,provider:'fixture',model:'model-'+id,version:'v1',billing:'self-hosted',capabilities:[{task:'generation',locales:['en-US'],modes:['text']},{task:'review',locales:['en-US'],modes:['text']}],invoke:async payload=>({model:id,payload}),validate:raw=>raw,...extra});
const options=extra=>({adapters:[adapter(),adapter('b')],authorize:async()=>true,...extra});
async function setup({d1=false,config=options()}={}){
  const f=await fixture({d1});f.sql.exec(schema);const service=new StoredLanguageProviders(f.db,config);
  await service.initialize(actors.dev);return {...f,service};
}
const change=(selections,expectedRevision=1)=>body({expectedRevision,selections,reason:'Reviewed provider settings.'});
test('all tasks default to disabled; selection and audit survive service recreation and reinitialization',async()=>{
  for(const d1 of [false,true]){const f=await setup({d1});try{
    assert.ok(Object.values((await f.service.inspect(actors.dev)).selections).every(v=>v===null));
    await assert.rejects(f.service.execute('generation',{}),code('provider_disabled'));
    await f.service.configure(actors.dev,change({generation:pick()}));
    const restored=new StoredLanguageProviders(f.db,options());await restored.initialize(actors.dev);
    assert.equal((await restored.inspect(actors.dev)).revision,2);assert.equal((await restored.execute('generation',{word:'drizzle'})).source.model,'model-a');
    assert.equal((await restored.history(actors.dev)).changes.length,1);
    await restored.configure(actors.dev,change({generation:null},2));await assert.rejects(f.service.execute('generation',{}),code('provider_disabled'));
    const history=await f.service.history(actors.dev);assert.equal(history.changes[0].selections.generation,null);assert.equal(history.changes[1].adapters.generation.model,'model-a');
    assert.throws(()=>f.sql.exec("UPDATE qr_provider_changes SET reason='rewrite'"),/immutable/);
    assert.throws(()=>f.sql.exec('DELETE FROM qr_provider_changes'),/append only/);
  }finally{f.close();}}
});
test('only active developers can read or configure settings; unknown fields, models and paid adapters fail closed',async()=>{
  const f=await setup({config:options({adapters:[adapter(),adapter('paid',{billing:'paid'})]})});try{
    for(const actor of [actors.teacher,actors.student,{...actors.dev,active:false},{...actors.dev,revoked:true}]){
      await assert.rejects(f.service.initialize(actor),code('developer_required'));await assert.rejects(f.service.inspect(actor),code('developer_required'));
      await assert.rejects(f.service.configure(actor,change({generation:pick()})),code('developer_required'));await assert.rejects(f.service.history(actor),code('developer_required'));
    }
    for(const selections of [{generation:pick('missing')},{generation:pick('paid')},{generation:{...pick(),endpoint:'http://private'}},{unknown:null},{generation:{...pick(),locale:'ru-RU'}}])await assert.rejects(f.service.configure(actors.dev,change(selections)));
    await assert.rejects(f.service.configure(actors.dev,{...change({generation:pick()}),snapshot:{}}),code('invalid_configuration'));
    assert.equal((await f.service.inspect(actors.dev)).revision,1);assert.equal((await f.service.history(actors.dev)).changes.length,0);
  }finally{f.close();}
});
test('concurrent stale saves conflict, identical retries replay and lost acknowledgements do not duplicate audit',async()=>{
  const f=await setup({d1:true});try{
    const data=change({generation:pick()});const results=await Promise.allSettled([data,change({generation:pick('b')})].map(v=>f.service.configure(actors.dev,v)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'configuration_conflict');
    const second=change({review:pick()},2),atomic=f.db.atomic.bind(f.db);let once=true;
    f.db.atomic=async commands=>{const result=await atomic(commands);if(once){once=false;throw Error('Lost acknowledgement');}return result;};
    const saved=await f.service.configure(actors.dev,second);assert.deepEqual(await f.service.configure(actors.dev,second),saved);
    await assert.rejects(f.service.configure(actors.dev,{...second,selections:{review:null}}),code('configuration_conflict'));
    assert.equal((await f.service.history(actors.dev)).changes.length,2);
    const first=await f.service.history(actors.dev,{limit:1}),last=await f.service.history(actors.dev,{limit:1,before:first.next});assert.equal(last.next,null);assert.equal(last.changes.length,1);
  }finally{f.close();}
});
test('a changed or missing adapter cannot silently replace a saved model; explicit confirmation or disabling recovers',async()=>{
  const f=await setup();try{
    await f.service.configure(actors.dev,change({generation:pick()}));
    const changed=new StoredLanguageProviders(f.db,options({adapters:[adapter('a',{model:'replacement',version:'v2'}),adapter('b')]}));
    assert.equal((await changed.inspect(actors.dev)).unavailable[0].code,'provider_configuration_changed');
    await assert.rejects(changed.execute('generation',{}),code('provider_configuration_changed'));
    await assert.rejects(changed.configure(actors.dev,change({review:pick('b')},2)),code('provider_configuration_changed'));
    await changed.configure(actors.dev,change({generation:pick()},2));assert.equal((await changed.execute('generation',{})).source.model,'replacement');
    const missing=new StoredLanguageProviders(f.db,options({adapters:[adapter('b')]}));await assert.rejects(missing.execute('generation',{}),code('provider_configuration_changed'));
    await missing.configure(actors.dev,change({generation:null},3));await assert.rejects(missing.execute('generation',{}),code('provider_disabled'));
    assert.equal((await f.service.history(actors.dev)).changes.at(-1).adapters.generation.model,'model-a');
  }finally{f.close();}
});
test('in-flight calls keep their original configuration while subsequent calls read the newest database revision',async()=>{
  let release,entered;const waiting=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);let first=true;
  const f=await setup({config:options({authorize:async()=>{if(first){first=false;entered();await waiting;}return true;}})});try{
    await f.service.configure(actors.dev,change({generation:pick()}));const pending=f.service.execute('generation',{});await started;
    await f.service.configure(actors.dev,change({generation:pick('b')},2));release();
    const previous=await pending,current=await f.service.execute('generation',{});assert.equal(previous.source.model,'model-a');assert.equal(previous.source.configurationRevision,2);assert.equal(current.source.model,'model-b');assert.equal(current.source.configurationRevision,3);
  }finally{f.close();}
});
test('audit failure rolls back configuration; unavailable or corrupt storage never invokes a transport',async()=>{
  let calls=0;const f=await setup({config:options({adapters:[adapter('a',{invoke:async()=>{calls++;return {};}})]})});try{
    f.sql.exec("CREATE TRIGGER provider_audit_failure BEFORE INSERT ON qr_provider_changes BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    await assert.rejects(f.service.configure(actors.dev,change({generation:pick()})),code('provider_configuration_unavailable'));assert.equal((await f.service.inspect(actors.dev)).revision,1);
    f.sql.exec('DROP TRIGGER provider_audit_failure');await f.service.configure(actors.dev,change({generation:pick()}));
    const broken=new StoredLanguageProviders({read:async()=>{throw Error('private storage detail');},atomic:f.db.atomic},options());await assert.rejects(broken.execute('generation',{}),e=>e.code==='provider_configuration_unavailable'&&!e.message.includes('private'));
    f.sql.exec("UPDATE qr_provider_configuration SET revision=revision+1,selections_json='{}'");await assert.rejects(f.service.execute('generation',{}),code('provider_configuration_unavailable'));assert.equal(calls,0);
  }finally{f.close();}
});
test('saved settings survive closing and reopening a real local SQLite file without writing production data',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'lumiscia-provider-test-')),path=join(directory,'settings.sqlite');let sql;
  const client=()=>({read:async(query,args=[])=>sql.prepare(query).all(...args),atomic:async commands=>{sql.exec('BEGIN IMMEDIATE');try{for(const c of commands)sql.prepare(c.sql).run(...c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value));sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}});
  try{
    sql=new DatabaseSync(path);sql.exec(schema);const service=new StoredLanguageProviders(client(),options());await service.initialize(actors.dev);await service.configure(actors.dev,change({generation:pick('b')}));sql.close();
    sql=new DatabaseSync(path);const restored=new StoredLanguageProviders(client(),options());await restored.initialize(actors.dev);assert.equal((await restored.execute('generation',{})).source.model,'model-b');assert.equal((await restored.history(actors.dev)).changes.length,1);
  }finally{sql?.close();rmSync(directory,{recursive:true,force:true});}
});
test('stored selections retain the default authorization gate and shared quota across model changes',async()=>{
  const f=await setup();try{
    await f.service.configure(actors.dev,change({generation:pick()}));
    const denied=new StoredLanguageProviders(f.db,{adapters:[adapter(),adapter('b')]});await assert.rejects(denied.execute('generation',{}),code('quota_or_access_denied'));
    for(const migration of ['003_generation_quota.sql','004_quota_limit_changes.sql'])f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+migration,import.meta.url),'utf8'));
    const quota=new GenerationQuota(f.db);await quota.initialize(actors.dev,{provider:'fixture',windowMs:86400000,requestLimit:1});
    const limited=new StoredLanguageProviders(f.db,options({quota}));await limited.execute('generation',{});
    await limited.configure(actors.dev,change({generation:pick('b')},2));await assert.rejects(limited.execute('generation',{}),code('quota_or_access_denied'));
    assert.equal((await quota.inspect(actors.dev,'fixture')).used,1);
  }finally{f.close();}
});
