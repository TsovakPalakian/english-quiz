import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,actors,body,content} from './quiz-review-fixture.mjs';
import {wav} from './quiz-media-fixture.mjs';
import {LanguageAccessPolicy} from '../src/language-access-policy.mjs';
import {LanguageProviders} from '../src/language-providers.mjs';
import {createConfiguredLanguageProviders} from '../src/configured-language-providers.mjs';
import {GenerationQuota} from '../src/generation-quota.mjs';
const schema=readFileSync(new URL('../migrations/quiz-review-draft/014_language_access.sql',import.meta.url),'utf8');
const code=(promise,value)=>assert.rejects(promise,error=>error.code===value);
const scope='a'.repeat(64),pick=(adapterId,mode='text')=>({adapterId,mode,locale:'en-US'});
const identity=({id,provider,model,version,billing})=>({id,provider,model,version,billing});
const adapter=(task='tts',extra={})=>({id:'fixture-'+task,provider:'fixture',model:'synthetic',version:'v1',billing:'self-hosted',capabilities:[{task,locales:['en-US'],modes:['text']}],invoke:async()=>({ok:true}),validate:raw=>raw,...extra});
const policy=(bindings,extra={})=>({enabled:true,bindings:bindings.map(identity),tasks:['tts','stt','review','pronunciation','dictionary'],termsRevision:'fixture-terms-v1',dataProcessingApproved:true,noPaidOverageConfirmed:true,expiresAt:100000+86400000,dailyRequests:10,dailyInputBytes:1000000,maxInputBytes:100000,...extra});
const confirmation=(value,expectedRevision=0,chosenScope=scope)=>body({scope:chosenScope,expectedRevision,policy:value,reason:'Synthetic confirmation; no external account activated.'});
async function setup(d1=false){const f=await fixture({d1});f.sql.exec(schema);let at=100000;return {...f,access:new LanguageAccessPolicy(f.db,{now:()=>at}),advance:value=>{at=value;}};}
function registry(access,rows,{authorize=async()=>true}={}){const providers=new LanguageProviders({adapters:rows.map(row=>access.wrap(row,{scope})),authorize});providers.configure(actors.dev,{expectedRevision:1,selections:Object.fromEntries(rows.map(row=>[row.capabilities[0].task,pick(row.id)]))});return providers;}
test('missing, disabled, expired or unconfirmed policies never call transports; only developers confirm and inspect',async()=>{
  const f=await setup();let calls=0;const row=adapter('tts',{invoke:async()=>{calls++;return {};}}),providers=registry(f.access,[row]);try{
    await code(providers.execute('tts',{}),'access_policy_denied');
    for(const actor of [actors.teacher,actors.student,{...actors.dev,active:false},{...actors.dev,revoked:true}]){
      await code(f.access.confirm(actor,confirmation(policy([row]))),'developer_required');await code(f.access.inspect(actor,scope),'developer_required');await code(f.access.history(actor,scope),'developer_required');
    }
    for(const extra of [{dataProcessingApproved:false},{noPaidOverageConfirmed:false},{expiresAt:100000},{expiresAt:100000+32*86400000},{dailyRequests:0},{maxInputBytes:1000001},{unexpected:true}])await code(f.access.confirm(actors.dev,confirmation(policy([row],extra))),'invalid_access_policy');
    await f.access.confirm(actors.dev,confirmation(policy([row],{enabled:false})));await code(providers.execute('tts',{}),'access_policy_denied');
    await f.access.confirm(actors.dev,confirmation(policy([row]),1));f.advance(100000+86400000);await code(providers.execute('tts',{}),'access_policy_denied');assert.equal(calls,0);
  }finally{f.close();}
});
test('account-wide admissions are atomic across tasks and instances; failures stay charged and UTC day resets',async()=>{
  for(const d1 of [false,true]){const f=await setup(d1);let calls=0;const rows=['tts','stt'].map(task=>adapter(task,{invoke:async()=>{calls++;throw Error('Secret failure.');}}));try{
    await f.access.confirm(actors.dev,confirmation(policy(rows,{dailyRequests:1})));
    const other=new LanguageAccessPolicy(f.db,{now:()=>100000}),first=registry(f.access,rows),second=registry(other,rows);
    const results=await Promise.allSettled([first.execute('tts',{word:'rain'}),second.execute('stt',{word:'rain'})]);
    assert.ok(results.every(result=>result.status==='rejected'));assert.equal(calls,1);assert.equal((await f.access.inspect(actors.dev,scope)).usedRequests,1);
    await code(first.execute('stt',{}),'access_budget_or_policy_changed');assert.equal(calls,1);
    f.advance(86400000);await code(first.execute('tts',{}),'provider_failed');assert.equal(calls,2);
    assert.equal((await f.access.inspect(actors.dev,scope)).usedRequests,1);
    assert.throws(()=>f.sql.exec('DELETE FROM qr_language_access_usage'),/cannot be deleted/);assert.throws(()=>f.sql.exec('UPDATE qr_language_access_usage SET input_bytes=1'),/cannot be refunded/);
    const stored=JSON.stringify(f.sql.prepare('SELECT * FROM qr_language_access_usage').all());assert.ok(!stored.includes('rain'));assert.ok(!stored.includes('Secret'));
  }finally{f.close();}}
});
test('input limits count binary and UTF-8, block before admission and cannot be bypassed with task or model switching',async()=>{
  const f=await setup();const rows=[adapter('tts'),adapter('stt')],providers=registry(f.access,rows);try{
    await f.access.confirm(actors.dev,confirmation(policy(rows,{dailyInputBytes:30,maxInputBytes:25})));
    const input={bytes:new Uint8Array(10),text:'я'},size=10+new TextEncoder().encode(JSON.stringify({bytes:null,text:'я'})).length;
    await code(providers.execute('tts',input),'input_budget_exceeded');assert.equal((await f.access.inspect(actors.dev,scope)).usedRequests,0);
    await f.access.confirm(actors.dev,confirmation(policy(rows,{dailyInputBytes:size+5,maxInputBytes:size}),1));await providers.execute('stt',input);
    assert.equal((await f.access.inspect(actors.dev,scope)).usedInputBytes,size);await code(providers.execute('tts',{word:'rain'}),'access_budget_or_policy_changed');
    const replacement=registry(f.access,[adapter('tts',{version:'v2'})]);await code(replacement.execute('tts',{}),'access_policy_denied');
    await f.access.confirm(actors.dev,confirmation(policy(rows,{tasks:['stt']}),2));await code(providers.execute('tts',{}),'access_policy_denied');
    const controller=new AbortController();controller.abort();await code(providers.execute('stt',{}, {signal:controller.signal}),'cancelled');
  }finally{f.close();}
});
test('confirmation is replayable, conflicts on stale revisions, audits atomically and never resets consumed budget',async()=>{
  const f=await setup(true),row=adapter(),providers=registry(f.access,[row]);try{
    const change=confirmation(policy([row]));await f.access.confirm(actors.dev,change);assert.deepEqual(await f.access.confirm(actors.dev,change),{scope,revision:1});
    await code(f.access.confirm(actors.dev,{...change,reason:'Changed request.'}),'access_policy_conflict');
    await providers.execute('tts',{});
    const results=await Promise.allSettled([f.access.confirm(actors.dev,confirmation(policy([row],{dailyRequests:1}),1)),f.access.confirm(actors.dev,confirmation(policy([row],{dailyRequests:2}),1))]);assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
    assert.equal((await f.access.inspect(actors.dev,scope)).usedRequests,1);
    f.sql.exec("CREATE TRIGGER fail_access_audit BEFORE INSERT ON qr_language_access_changes BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    await code(f.access.confirm(actors.dev,confirmation(policy([row]),2)),'access_policy_unavailable');assert.equal((await f.access.inspect(actors.dev,scope)).revision,2);
    const history=await f.access.history(actors.dev,scope,{limit:1});assert.equal(history.changes[0].revision,2);assert.equal((await f.access.history(actors.dev,scope,{before:history.next})).changes.length,1);
    assert.throws(()=>f.sql.exec("UPDATE qr_language_access_changes SET reason='rewrite'"),/immutable/);
  }finally{f.close();}
});
test('revocation, expiration and cancellation while admission is pending win before transport',async()=>{
  for(const action of ['revoke','expire','cancel','midnight']){const f=await setup();let calls=0;const row=adapter('tts',{invoke:async()=>{calls++;return {};}}),providers=registry(f.access,[row]),controller=new AbortController();try{
    await f.access.confirm(actors.dev,confirmation(policy([row])));
    const atomic=f.db.atomic.bind(f.db);let once=true;
    f.db.atomic=async commands=>{await atomic(commands);if(once){once=false;if(action==='revoke')await f.access.confirm(actors.dev,confirmation(policy([row],{enabled:false}),1));if(action==='expire')f.advance(100000+86400000);if(action==='midnight')f.advance(86400000);if(action==='cancel')controller.abort();}};
    await assert.rejects(providers.execute('tts',{}, {signal:controller.signal}));assert.equal(calls,0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_language_access_usage').get().n,1);
  }finally{f.close();}}
});
test('unavailable or corrupt policies fail closed without exposing storage errors or invoking transports',async()=>{
  const f=await setup();let calls=0;const row=adapter('tts',{invoke:async()=>{calls++;return {};}});try{
    await f.access.confirm(actors.dev,confirmation(policy([row])));
    const missing=new LanguageAccessPolicy({read:async()=>{throw Error('SYNTHETIC-SECRET');},atomic:f.db.atomic});await code(registry(missing,[row]).execute('tts',{}),'access_policy_unavailable');
    f.sql.exec("UPDATE qr_language_access SET revision=revision+1,policy_json='{}'");await code(registry(f.access,[row]).execute('tts',{}),'access_policy_unavailable');assert.equal(calls,0);
  }finally{f.close();}
});
const pcm=()=>{const bytes=wav(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);view.setUint32(24,16000,true);view.setUint32(28,32000,true);return bytes;};
const azure=(fetchImpl,extra={})=>({enabled:true,freeTierVerified:true,credentialRevision:'fixture-key-v1',resourceName:'lumiscia-test',apiKey:'SYNTHETIC-KEY',termsRevision:'fixture-v1',reuseConditions:'Synthetic test reuse.',fetchImpl,...extra});
async function initialize(composition,selections){await composition.providers.initialize(actors.dev);await composition.providers.configure(actors.dev,body({expectedRevision:1,selections,reason:'Mock-only composed services.'}));}
test('composed Azure services use one persisted account budget; source pins rotate without refund and credentials stay private',async()=>{
  const f=await setup(true);f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/005_provider_settings.sql',import.meta.url),'utf8'));let calls=0;const options=azure(async url=>{calls++;return url.includes('/tts/')?new Response(pcm(),{headers:{'content-type':'audio/wav'}}):Response.json({RecognitionStatus:'Success',NBest:[{Display:'rain',AccuracyScore:90,FluencyScore:80}]});});try{
    const service=await createConfiguredLanguageProviders({db:f.db,authorize:async()=>true,azure:options,now:()=>100000});assert.equal(calls,0);
    await initialize(service,{tts:pick('azure-tts'),pronunciation:pick('azure-pronunciation','scripted')});
    await code(service.providers.execute('tts',{word:'rain',voice:'en-US-JennyNeural'}),'access_policy_denied');
    const account=service.accounts[0];await service.access.confirm(actors.dev,confirmation(policy(account.bindings,{dailyRequests:1}),0,account.scope));
    assert.equal((await service.providers.execute('tts',{word:'rain',voice:'en-US-JennyNeural'})).data.mime,'audio/wav');
    const restored=await createConfiguredLanguageProviders({db:f.db,authorize:async()=>true,azure:options,now:()=>100000});await code(restored.providers.execute('pronunciation',{bytes:pcm(),mime:'audio/wav',mode:'scripted',reference:'rain',locale:'en-US'}),'access_budget_or_policy_changed');
    const rotated=await createConfiguredLanguageProviders({db:f.db,authorize:async()=>true,azure:{...options,credentialRevision:'fixture-key-v2'},now:()=>100000});
    await code(rotated.providers.execute('tts',{word:'rain',voice:'en-US-JennyNeural'}),'provider_configuration_changed');
    await rotated.providers.configure(actors.dev,body({expectedRevision:2,selections:{tts:pick('azure-tts'),pronunciation:null},reason:'Explicit new credential revision.'}));
    await code(rotated.providers.execute('tts',{word:'rain',voice:'en-US-JennyNeural'}),'access_policy_denied');
    const newAccount=rotated.accounts[0];assert.equal(newAccount.scope,account.scope);await rotated.access.confirm(actors.dev,confirmation(policy(newAccount.bindings,{dailyRequests:1}),1,account.scope));
    await code(rotated.providers.execute('tts',{word:'rain',voice:'en-US-JennyNeural'}),'access_budget_or_policy_changed');assert.equal(calls,1);
    const metadata=JSON.stringify([await service.providers.inspect(actors.dev),await service.access.inspect(actors.dev,account.scope),await service.access.history(actors.dev,account.scope),service.accounts]);assert.ok(!metadata.includes('SYNTHETIC-KEY'));assert.ok(!metadata.includes('lumiscia-test'));
  }finally{f.close();}
});
test('composition is default-off, requires trusted authorization and preserves existing generation/review quota',async()=>{
  const f=await setup();for(const file of ['005_provider_settings.sql','003_generation_quota.sql','004_quota_limit_changes.sql'])f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+file,import.meta.url),'utf8'));
  const config={enabled:true,freeTierVerified:true,credentialRevision:'key-v1',allowDataProcessing:true,model:'gemini-fixture',quotaProject:'synthetic-project',apiKey:'SYNTHETIC-KEY',termsRevision:'fixture-v1',fetchImpl:async(_url,options)=>{const {checked,dimensions}=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({fingerprint:checked.fingerprint,revision:checked.revision,status:'reviewed',dimensions:Object.fromEntries(dimensions.map(key=>[key,'pass'])),findings:[]})}]}}]});}};
  try{
    await assert.rejects(createConfiguredLanguageProviders({db:f.db}));
    const empty=await createConfiguredLanguageProviders({db:f.db,authorize:async()=>false});await empty.providers.initialize(actors.dev);assert.ok(Object.values((await empty.providers.inspect(actors.dev)).selections).every(value=>value===null));
    const quota=new GenerationQuota(f.db,{now:()=>100000});await quota.initialize(actors.dev,{provider:'google',windowMs:86400000,requestLimit:1});
    const service=await createConfiguredLanguageProviders({db:f.db,authorize:async()=>true,gemini:config,quota,now:()=>100000});await service.providers.configure(actors.dev,body({expectedRevision:1,selections:{review:pick('gemini-quiz-review')},reason:'Fixture-only review.'}));
    const account=service.accounts[0];await service.access.confirm(actors.dev,confirmation(policy(account.bindings),0,account.scope));
    const input={type:'Gap',meaning:{en:'drizzle',translation:'изморось',definition:'Light rain.',part_of_speech:'noun'},content,revision:2,level:'A1'};
    const response=await service.providers.execute('review',input);assert.equal(response.data.result.source.version,response.source.version);assert.equal(response.data.result.requiresTeacherReview,true);
    await code(service.providers.execute('review',input),'quota_or_access_denied');assert.equal((await service.access.inspect(actors.dev,account.scope)).usedRequests,1);
    const denied=await createConfiguredLanguageProviders({db:f.db,authorize:async()=>false,gemini:config,now:()=>100000});await code(denied.providers.execute('review',input),'quota_or_access_denied');
    await assert.rejects(createConfiguredLanguageProviders({db:f.db,authorize:async()=>true,gemini:{...config,credentialRevision:''}}));
    const off=await createConfiguredLanguageProviders({db:f.db,authorize:async()=>true,azure:{...azure(async()=>{throw Error('No network');}),enabled:false},now:()=>100000});assert.equal(off.accounts.length,1);
    await off.providers.configure(actors.dev,body({expectedRevision:2,selections:{review:null,tts:pick('azure-tts')},reason:'Off adapter fixture.'}));
    await off.access.confirm(actors.dev,confirmation(policy(off.accounts[0].bindings),0,off.accounts[0].scope));await code(off.providers.execute('tts',{word:'rain',voice:'en-US-JennyNeural'}),'provider_disabled');
  }finally{f.close();}
});
test('WordNet and Whisper compose independently with explicit task policies and no pronunciation claims',async()=>{
  const f=await setup();f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/005_provider_settings.sql',import.meta.url),'utf8'));let calls=0;try{
    const wordnet={enabled:true,dataset:{version:'3.0',sha256:'b'.repeat(64),licenseNotice:'Princeton University synthetic test notice.',lookup:async()=>[{word:'rain',senseKey:'rain%1:19:00::',pos:'n',definition:'Water falling from clouds.',examples:[],forms:[]}]}};
    const whisper={enabled:true,freeTierVerified:true,credentialRevision:'fixture-key-v1',accountId:'a'.repeat(32),apiToken:'SYNTHETIC-TOKEN',fetchImpl:async()=>{calls++;return Response.json({success:true,result:{text:'Rain.'}});}};
    const service=await createConfiguredLanguageProviders({db:f.db,authorize:async()=>true,wordnet,whisper,now:()=>100000});await initialize(service,{dictionary:pick('wordnet'),stt:pick('workers-ai-whisper','scripted')});
    for(const account of service.accounts)await service.access.confirm(actors.dev,confirmation(policy(account.bindings),0,account.scope));
    const dictionary=await service.providers.execute('dictionary',{word:'rain'});assert.equal(dictionary.data.entries[0].ipa,null);assert.equal(dictionary.data.entries[0].translation,null);
    const transcription=await service.providers.execute('stt',{bytes:pcm(),mime:'audio/wav',mode:'scripted',reference:'Rain.',locale:'en-US'});assert.deepEqual(transcription.data.metrics,{});assert.equal(calls,1);
    await code(service.providers.execute('pronunciation',{}),'provider_disabled');
  }finally{f.close();}
});
test('policy, immutable audit and uncertain usage survive closing and reopening a real SQLite file',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'lumiscia-access-')),path=join(directory,'policy.sqlite');let sql;
  const db={read:async(query,args=[])=>sql.prepare(query).all(...args),atomic:async commands=>{sql.exec('BEGIN IMMEDIATE');try{for(const command of commands)sql.prepare(command.sql).run(...command.args.map(arg=>arg.type==='null'?null:['integer','float'].includes(arg.type)?Number(arg.value):arg.value));sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
  try{
    sql=new DatabaseSync(path);sql.exec(schema);const row=adapter(),access=new LanguageAccessPolicy(db,{now:()=>100000});await access.confirm(actors.dev,confirmation(policy([row],{dailyRequests:1})));await registry(access,[row]).execute('tts',{});sql.close();
    sql=new DatabaseSync(path);const restored=new LanguageAccessPolicy(db,{now:()=>100000});assert.equal((await restored.inspect(actors.dev,scope)).usedRequests,1);assert.equal((await restored.history(actors.dev,scope)).changes.length,1);await code(registry(restored,[row]).execute('tts',{}),'access_budget_or_policy_changed');
  }finally{sql?.close();rmSync(directory,{recursive:true,force:true});}
});
test('existing Workers AI generation and Whisper share the same account admission limit',async()=>{
  const f=await setup(true);f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/005_provider_settings.sql',import.meta.url),'utf8'));let calls=0;try{
    const configuration={enabled:true,freeTierVerified:true,credentialRevision:'fixture-v1',accountId:'a'.repeat(32),apiToken:'SYNTHETIC-TOKEN',fetchImpl:async()=>{calls++;return Response.json({success:true,result:{response:{type:'Flip'},usage:{}}});}};
    const service=await createConfiguredLanguageProviders({db:f.db,authorize:async()=>true,whisper:configuration,generation:configuration,now:()=>100000});assert.equal(service.accounts.length,1);assert.equal(service.accounts[0].bindings.length,2);
    await initialize(service,{generation:pick('workers-ai-quiz'),stt:pick('workers-ai-whisper','scripted')});const account=service.accounts[0];
    await service.access.confirm(actors.dev,confirmation(policy(account.bindings,{dailyRequests:1,tasks:['generation','stt']}),0,account.scope));
    await service.providers.execute('generation',{instruction:'Synthetic generation fixture.',type:'Flip',meaning:{en:'rain',translation:'дождь',definition:'Falling water.',part_of_speech:'noun'},itemFields:['front','back'],maxItems:1,maxOutputChars:4000});
    await code(service.providers.execute('stt',{bytes:pcm(),mime:'audio/wav',mode:'scripted',reference:'rain',locale:'en-US'}),'access_budget_or_policy_changed');assert.equal(calls,1);
  }finally{f.close();}
});
