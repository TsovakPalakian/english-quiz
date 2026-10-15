import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {productionWorker,databaseBackedRequest} from '../src/turso-production-worker.mjs';
import {PRODUCTION_MEDIA_BUCKET} from '../src/turso-r2-media.mjs';
import {studyClient,STUDY_DATABASE,STATIC_STUDY_DATABASE} from '../src/study-database.mjs';
import {withDatabaseSelection,changeDatabaseSelection,DATABASE_SELECTION_KEY} from '../src/database-selection.mjs';
import {neonProductionReadiness} from '../src/database-readiness.mjs';
import {neonFoundation} from '../src/neon-foundation.mjs';
import {neonStudyMigration} from '../src/neon-study-migration.mjs';

const url='https://app.example';
function fixture(provider='turso'){
  const bucket={async get(key){assert.equal(key,DATABASE_SELECTION_KEY);return {json:async()=>({provider,revision:1,scope:'site'})};},async head(){},async put(){}};
  return {CONTENT_ENABLED:'true',CONTENT_MEDIA_BUCKET:PRODUCTION_MEDIA_BUCKET,CONTENT_ALLOWED_HOST:'app.example',SESSION_SECRET:'test-only',DB:{prepare(){}},MEDIA:{},ASSETS:{},CONTENT_MEDIA:bucket,TURSO_URL:'libsql://english-quiz-production-fixture.turso.io',TURSO_AUTH_TOKEN:'test-only'};
}
test('all database-backed paths, including legacy catalog assets, use the global selector',()=>{
  for(const path of ['/api/me','/api/messages/socket','/api/groups','/lookup?word=test','/translate','/grammar.js?v=1','/lesson-data.js','/irregular.js','/speakout.js','/tense-bank.json'])assert.equal(databaseBackedRequest(new Request(url+path)),true,path);
  for(const path of ['/','/preview.html','/preview.js','/preview.css','/favicon.png','/messages.js'])assert.equal(databaseBackedRequest(new Request(url+path)),false,path);
});
test('missing Neon configuration blocks data routes before any old application or Turso query',async()=>{
  let calls=0;const app=productionWorker({async fetch(){calls++;return new Response('old application');}}),env=fixture('neon');
  for(const path of ['/api/me','/lookup','/translate','/grammar.js','/lesson-data.js','/irregular.js','/speakout.js','/tense-bank.json']){
    const response=await app.fetch(new Request(url+path),env,{});
    assert.equal(response.status,503,path);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match((await response.json()).error,/Neon connection/);
  }
  assert.equal(calls,0);
  assert.equal((await app.fetch(new Request(url+'/preview.js'),env,{})).status,200);assert.equal(calls,1);
});
test('public database context is independent of SQL credentials and exposes no account data',async()=>{
  const app=productionWorker({fetch(){throw Error('Must not dispatch to the application');}}),env=fixture('neon');
  const response=await app.fetch(new Request(url+'/api/database-context'),env,{});assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{provider:'neon',revision:1,scope:'site'});assert.equal(response.headers.get('X-Database-Context'),'neon:1');
});
test('stale client context is rejected before authentication or writes to the new database',async()=>{
  let calls=0;const app=productionWorker({fetch(){calls++;throw Error('Must not dispatch');}});
  const response=await app.fetch(new Request(url+'/api/me/cards/new',{method:'POST',headers:{'X-Database-Context':'turso:0'},body:'{}'}),fixture('neon'),{});
  assert.equal(response.status,409);assert.equal(response.headers.get('X-Database-Context'),'neon:1');assert.equal(calls,0);
});
test('static shell requests never construct a hidden fallback SQL client',async()=>{
  const app=productionWorker({async fetch(request,env){assert.equal(studyClient(env),STATIC_STUDY_DATABASE);await assert.rejects(studyClient(env).read('SELECT 1'),error=>error.status===503);return new Response('asset');}});
  assert.equal((await app.fetch(new Request(url+'/preview.js'),{...fixture('neon'),DB_PROVIDER:'neon'},{})).status,200);
});
test('responses from requests started before a switch cannot acknowledge old-provider data as new',async()=>{
  let current={provider:'turso',revision:0,scope:'site'};
  const env=fixture();env.CONTENT_MEDIA.get=async()=>({json:async()=>current});
  const app=productionWorker({async fetch(){current={provider:'neon',revision:1,scope:'site'};return Response.json({secret:'old-provider-result'});}});
  const response=await app.fetch(new Request(url+'/api/lessons',{headers:{'X-Database-Context':'turso:0'}}),env,{});
  assert.equal(response.status,409);assert.equal(response.headers.get('X-Database-Context'),'neon:1');assert.ok(!(await response.text()).includes('old-provider-result'));
});
test('each request captures its own client and selection; services reuse it only in that request',async()=>{
  const contexts=[],app=productionWorker({async fetch(request,env){contexts.push(env);assert.equal(env.DB_PROVIDER,'turso');assert.equal(studyClient(env),env[STUDY_DATABASE]);return new Response('ok');}}),env=fixture();
  await app.fetch(new Request(url+'/api/me'),env,{});await app.fetch(new Request(url+'/api/groups'),env,{});
  assert.notEqual(contexts[0][STUDY_DATABASE],contexts[1][STUDY_DATABASE]);assert.equal(env[STUDY_DATABASE],undefined);
  assert.equal(Object.isFrozen(contexts[0].DATABASE_SELECTION),true);
});
test('scheduled tasks cannot write Turso after Neon was selected',async()=>{
  let calls=0;const app=productionWorker({async scheduled(event,env){calls++;assert.equal(env.DB_PROVIDER,'turso');assert.ok(env[STUDY_DATABASE]);}});
  await assert.rejects(app.scheduled({},fixture('neon'),{}),error=>error.status===503);assert.equal(calls,0);
  await app.scheduled({},fixture(),{});assert.equal(calls,1);
});
test('direct study callers cannot bypass provider selection and there is no silent fallback',()=>{
  for(const env of [{DB_PROVIDER:'neon'},{DB_PROVIDER:'unknown'},{DATABASE_SELECTION:{provider:'neon'}},{DB_PROVIDER:'turso',DATABASE_SELECTION:{provider:'neon'}}])assert.throws(()=>studyClient(env),error=>error.status===503);
});
test('DB_PROVIDER is the validated default and a shared registry override is exposed consistently',async()=>{
  const absent={get:async()=>null};
  await assert.rejects(withDatabaseSelection({CONTENT_MEDIA:absent,DB_PROVIDER:'typo'}),error=>error.status===503);
  await assert.rejects(withDatabaseSelection({CONTENT_MEDIA:absent,DB_PROVIDER:'neon'}),error=>error.status===503);
  const env=await withDatabaseSelection({...fixture(),DB_PROVIDER:'neon'});
  assert.equal(env.DB_PROVIDER,'turso');assert.equal(env.DATABASE_SELECTION.provider,'turso');
  let written;
  await changeDatabaseSelection({get:async()=>null,put:async(key,value)=>{written=JSON.parse(value);return {etag:'new'};}},{provider:'turso',expectedRevision:0,actor:{id:'dev',role:'DEVELOPER'},verifyTarget:async()=>{},defaultProvider:'neon'});
  assert.equal(written.provider,'turso');assert.equal(written.revision,1);
});
test('read-only PostgreSQL preflight distinguishes a prepared foundation from a working runtime',async()=>{
  const pg=new PGlite();
  try{
    for(const statement of neonFoundation)await pg.exec(statement);
    await pg.query("INSERT INTO english_app.users(id,login,email,password_salt,password_hash,password_iterations,role) VALUES('fixture','TsovakDev','fixture@example.test','salt','hash',100000,'DEVELOPER')");
    let queries=0;
    const sql={query:(text,params)=>({text,params,then(resolve,reject){return pg.query(text,params).then(result=>result.rows).then(resolve,reject);}}),transaction:async(commands,options)=>{
      assert.equal(options.readOnly,true);return pg.transaction(async tx=>{await tx.exec('SET TRANSACTION READ ONLY');const results=[];for(const command of commands){queries++;assert.match(command.text,/^SELECT\b/);results.push((await tx.query(command.text,command.params)).rows);}return results;});
    }};
    const result=await neonProductionReadiness({}, {sql});
    assert.equal(result.ready,false);assert.equal(result.readOnly,true);assert.equal(result.siteSwitched,false);assert.equal(queries,4);
    assert.equal(result.checks.find(check=>check.id==='schema').ready,true);
    assert.equal(result.checks.find(check=>check.id==='developer').ready,true);
    assert.equal(result.checks.find(check=>check.id==='child-identities').ready,false);
    assert.equal(result.checks.find(check=>check.id==='learning-repositories').ready,false);
    const account=(await pg.query('SELECT count(*)::integer n FROM english_app.users')).rows[0];assert.equal(account.n,1);
    assert.ok(!JSON.stringify(result).includes('fixture@example.test'));
    for(const statement of neonStudyMigration)await pg.exec(statement);
    const ready=await neonProductionReadiness({}, {sql});assert.equal(ready.ready,true);assert.equal(ready.runtimeVersion,1);
  }finally{await pg.close();}
});
test('preflight never returns secrets or raw driver errors',async()=>{
  await assert.rejects(neonProductionReadiness({}, {sql:{query(){throw new Error('postgresql://secret');}}}),error=>error.status===503&&!error.message.includes('secret'));
});
