import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{productionEnvironment,productionWorker} from '../src/learning-production-worker.mjs';
import {integratedWorker,accountDatabase} from '../src/learning-integrated-worker.mjs';
import {stageR2Media,PRODUCTION_MEDIA_BUCKET,TEST_MEDIA_BUCKET} from '../src/learning-r2-media.mjs';
test('Production media requires dedicated exact bucket, never legacy MEDIA or TEST bucket',()=>{
  const bucket={get(){},head(){},put(){}},env={STORAGE_MODE:'production',STAGE_MEDIA_BUCKET:PRODUCTION_MEDIA_BUCKET,STAGE_MEDIA:bucket,MEDIA:{}};
  assert.ok(stageR2Media(env));
  assert.throws(()=>stageR2Media({...env,STAGE_MEDIA_BUCKET:TEST_MEDIA_BUCKET}));
  assert.throws(()=>stageR2Media({...env,STAGE_MEDIA:env.MEDIA}));
  assert.throws(()=>stageR2Media({...env,STORAGE_MODE:'test'}));
});
test('Production activation is disabled by default; incomplete bindings fail closed without a query',async()=>{
  const request=new Request('https://production.example/api/me');
  assert.equal((await worker.fetch(request,{},{})).status,503);
  assert.equal((await worker.fetch(request,{CONTENT_ENABLED:'true'},{})).status,503);
  assert.equal(productionEnvironment({}),null);
});
test('Production environment maps only explicit content controls, keeps read-only and rejects test credentials',()=>{
  const env={CONTENT_MEDIA_BUCKET:PRODUCTION_MEDIA_BUCKET,CONTENT_ALLOWED_HOST:'production.example',SESSION_SECRET:'fixture',DB:{},MEDIA:{},ASSETS:{},
    CONTENT_MEDIA:{get(){},head(){},put(){}},STAGE_WRITES:'true'};
  const value=productionEnvironment(env);assert.ok(value);assert.equal(value.STAGE_WRITES,'false');
  assert.equal(value.STORAGE_MODE,'production');assert.equal(value.STAGE_MEDIA,env.CONTENT_MEDIA);
  assert.equal(productionEnvironment({...env,SESSION_SECRET:undefined,CONTENT_SESSION_SECRET:'preserved-key'}).SESSION_SECRET,'preserved-key');
  assert.equal(productionEnvironment({...env,CONTENT_SESSION_SECRET:'preserved-key'}).SESSION_SECRET,'preserved-key');
  assert.equal(productionEnvironment({...env,CONTENT_MEDIA:undefined}),null);
});
test('Production wrapper preserves HTTPS/host/Origin/auth and write gates before querying either database',async()=>{
  let accounts=0,study=0;
  const app=integratedWorker({authenticate:async()=>{accounts++;return null;},studyDatabase:()=>{study++;throw Error('Unexpected study query');}});
  const raw={prepare(){throw Error('Unexpected D1 SQL');}},env={CONTENT_ENABLED:'true',CONTENT_WRITES:'false',CONTENT_MEDIA_BUCKET:PRODUCTION_MEDIA_BUCKET,
    CONTENT_ALLOWED_HOST:'production.example',SESSION_SECRET:'fixture',DB:raw,MEDIA:{},ASSETS:{},CONTENT_MEDIA:{get(){},head(){},put(){}},
    DB_PROVIDER:'d1',STUDY_DB:{prepare(){},batch(){}},ACCOUNT_QUERY_LIMIT_ENABLED:'false'};
  const candidate=productionWorker(app),call=(url,method='GET',origin='https://production.example')=>candidate.fetch(new Request(url,{method,headers:{Origin:origin},...(method==='PATCH'?{body:'{"role":"DEVELOPER"}'}:{})}),env,{});
  assert.equal((await call('http://production.example/api/cards')).status,403);
  assert.equal((await call('https://other.example/api/cards')).status,403);
  assert.equal((await call('https://production.example/api/cards/card','PATCH','https://other.example')).status,403);
  assert.equal((await call('https://production.example/api/admin/users/'+'a'.repeat(32)+'/cards/1','PATCH')).status,503);
  assert.equal(accounts,0);assert.equal(study,0);
  assert.equal((await call('https://production.example/api/admin/users/'+'a'.repeat(32)+'/stats')).status,401);
  assert.equal(accounts,1);assert.equal(study,0);
});
test('Account D1 adapter rejects educational reads/writes and arbitrary SQL before reaching raw storage',async()=>{
  let rawCalls=0;const db=accountDatabase({prepare(){rawCalls++;return {first:async()=>({id:'fixture'})};}},async()=>{}, {allowWrites:true});
  for(const sql of ['SELECT * FROM cards','SELECT * FROM user_state','INSERT INTO lessons(id) VALUES(?)','UPDATE user_added SET value=?',
    'DELETE FROM user_state','SELECT * FROM users; DELETE FROM users','SELECT * FROM users JOIN lesson_responses ON 1=1'])assert.throws(()=>db.prepare(sql));
  assert.equal(rawCalls,0);assert.deepEqual(await db.prepare('SELECT id FROM users LIMIT 1').first(),{id:'fixture'});
  assert.equal(rawCalls,1);await assert.rejects(db.exec('DROP TABLE users'));
});
test('Production wrapper injects baseline security headers on HTML responses',async()=>{
  const app={async fetch(){return new Response('<!DOCTYPE html><html><body>Test</body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});}};
  const env={CONTENT_ENABLED:'true',CONTENT_WRITES:'false',CONTENT_MEDIA_BUCKET:PRODUCTION_MEDIA_BUCKET,CONTENT_ALLOWED_HOST:'production.example',SESSION_SECRET:'fixture',DB:{prepare(){}},MEDIA:{},ASSETS:{},CONTENT_MEDIA:{get(){},head(){},put(){}},DB_PROVIDER:'d1',STUDY_DB:{prepare(){},batch(){}}};
  const candidate=productionWorker(app);
  const response=await candidate.fetch(new Request('https://production.example/'),env,{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-Frame-Options'),'DENY');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'),'strict-origin-when-cross-origin');
  const cspApp={async fetch(){return new Response('<!DOCTYPE html><html><body>Test</body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; connect-src 'self'"}});}};
  const cspResponse=await productionWorker(cspApp).fetch(new Request('https://production.example/'),env,{});
  assert.match(cspResponse.headers.get('Content-Security-Policy'),/script-src 'self' https:\/\/static\.cloudflareinsights\.com/);
  assert.match(cspResponse.headers.get('Content-Security-Policy'),/connect-src 'self' https:\/\/cloudflareinsights\.com/);
  assert.match(cspResponse.headers.get('Content-Security-Policy'),/worker-src 'self' blob:/);
});
