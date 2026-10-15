import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseStatus,databaseAction,neonConnection} from '../src/database-administration.mjs';
import {neonFoundation,neonTables,NEON_FOUNDATION_VERSION} from '../src/neon-foundation.mjs';
import {integratedWorker} from '../src/turso-integrated-worker.mjs';
import {PGlite} from '@electric-sql/pglite';
import {neonStudyMigration} from '../src/neon-study-migration.mjs';
const connection='postgresql://fixture:fake-password@ep-test-name-pooler.c-8.eu-central-1.aws.neon.tech/english?sslmode=require&channel_binding=require';
test('Neon accepts server credentials only on TLS Neon endpoints and never returns secrets',()=>{
  assert.equal(neonConnection(connection),connection);
  for(const value of ['',connection.replace('sslmode=require','sslmode=disable'),connection.replace('neon.tech','example.com'),connection.replace('/english?','/english/extra?'),connection.replace('postgresql:','https:')])assert.throws(()=>neonConnection(value));
  const status=databaseStatus({NEON_DATABASE_URL:connection,TURSO_URL:'configured',TURSO_AUTH_TOKEN:'secret'});
  assert.equal(status.active,'turso');assert.equal(status.providers[1].adapterReady,true);
  assert.ok(!JSON.stringify(status).includes('fake-password'));assert.ok(!JSON.stringify(status).includes('ep-test-name'));
});
test('activation requires developer identity and a revision; no request can run arbitrary SQL',async()=>{
  let calls=0;const options={createNeon:()=>{calls++;throw Error('Must not connect');}};
  await assert.rejects(databaseAction({},{provider:'neon',action:'activate'},options),error=>error.status===403);
  await assert.rejects(databaseAction({},{provider:'neon',action:'check',sql:'DROP TABLE cards'},options),error=>error.status===400);
  assert.equal(calls,0);assert.equal((await databaseAction({},{provider:'turso',action:'activate',expectedRevision:0},{actor:{id:'dev',role:'DEVELOPER'}})).active,'turso');
});
test('Foundation is idempotent, schema-scoped, transactional, and does not import business data',async()=>{
  const calls=[],transactions=[],pg=new PGlite();
  const sql={query(query,params,options){calls.push(query);return {query,params,then(resolve,reject){return pg.query(query,params).then(result=>options?.fullResults?{...result,command:query.trim().split(/\s/)[0],rowCount:result.affectedRows||0}:result.rows).then(resolve,reject);}};},transaction:async queries=>{transactions.push(queries);return pg.transaction(async tx=>{const results=[];for(const command of queries)results.push((await tx.query(command.query,command.params)).rows);return results;});}};
  try{
  const result=await databaseAction({},{provider:'neon',action:'prepare'},{createNeon:()=>sql});
  assert.equal(transactions.length,2);assert.equal(transactions[0].length,neonFoundation.length+neonStudyMigration.length);assert.equal(result.schemaVersion,NEON_FOUNDATION_VERSION);assert.equal(result.schemaReady,true);assert.equal(result.adapterReady,true);assert.equal(result.dataTransferred,false);
  assert.equal(result.readiness.checks.find(check=>check.id==='learning-repositories').ready,true);
  assert.equal(result.runtimeReady,false); // Preparing schema does not create a developer account.
  assert.ok(neonFoundation.every(query=>!/\b(?:DROP\s+(?:TABLE|SCHEMA)|TRUNCATE)\b/i.test(query)&&!/^\s*(UPDATE|DELETE)\b/i.test(query)));
  assert.equal(neonFoundation.filter(query=>/^INSERT/i.test(query)).length,3);assert.match(neonFoundation.at(-1),/ON CONFLICT\(version\) DO NOTHING/);
  assert.ok(calls.some(query=>query.includes('english_app.cards')));
  }finally{await pg.close();}
});
test('Foundation covers every declared table and installs auth views without importing accounts',()=>{
  const created=neonFoundation.flatMap(query=>[...query.matchAll(/CREATE TABLE IF NOT EXISTS english_app\.([a-z_]+)/g)].map(match=>match[1]));
  assert.deepEqual([...created].sort(),[...neonTables].sort());assert.equal(new Set(neonTables).size,neonTables.length);
  for(const name of ['users','sessions','assessment_work','assessment_history','card_progress','quiz_progress','library_items','content_archive','speakout_answers','chat_assignments','bug_reports'])assert.ok(neonTables.includes(name));
  assert.ok(neonFoundation.every(query=>!/^\s*INSERT INTO english_app\.(users|cards)\b/.test(query)));
});
test('Connection failures never expose connection strings or driver messages',async()=>{
  await assert.rejects(databaseAction({},{provider:'neon',action:'check'},{createNeon:()=>{throw Error(connection);}}),error=>error.status===503&&!error.message.includes('fake-password')&&!error.message.includes('postgresql:'));
});
test('Database controls require live developer identity, CSRF and bounded input without Turso reads',async()=>{
  let actor={id:'developer',role:'DEVELOPER'},reads=0;
  const app=integratedWorker({authenticate:async()=>actor,studyDatabase:()=>{reads++;throw Error('Unexpected Turso read');}});
  const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'app.example',STAGE_WRITES:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false',DB:{prepare(){}},NEON_DATABASE_URL:connection};
  const call=(method='GET',body,origin='https://app.example')=>app.fetch(new Request('https://app.example/api/developer/databases',{method,headers:{Origin:origin},...(body?{body:JSON.stringify(body)}:{})}),env,{});
  let response=await call();assert.equal(response.status,200);assert.equal((await response.json()).active,'turso');
  response=await call('POST',{provider:'neon',action:'activate'});assert.equal(response.status,400);assert.equal(reads,0);
  assert.equal((await call('POST',{provider:'neon',action:'prepare'},'https://evil.example')).status,403);
  assert.equal((await call('POST',{provider:'neon',action:'check',padding:'x'.repeat(600)})).status,413);
  actor={id:'teacher',role:'ADMIN'};assert.equal((await call()).status,403);actor={id:'student',role:'USER'};assert.equal((await call()).status,403);actor=null;assert.equal((await call()).status,401);
});
