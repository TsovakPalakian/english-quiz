import test from 'node:test';
import assert from 'node:assert/strict';
import {isSensitiveFileProbe} from '../src/sensitive-paths.mjs';
import {productionWorker} from '../src/learning-production-worker.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';

const request=(path,method='GET')=>new Request('https://fixture.invalid'+path,{method});
test('matches only private filenames and directories, including encoded probes',()=>{
  for(const path of ['/api/staging/.env','/.env','/.env.local','/.env.production.bak','/.env~','/.git/config','/api/.svn/entries','/.hg/store','/.ssh/id_rsa','/.aws/credentials','/.npmrc','/.dev.vars','/.dev.vars.production','/wrangler.toml','/wrangler.jsonc','/api/%2eenv','/api/%252eenv','/api/.ENV','/api%5c.git%5cconfig'])assert.equal(isSensitiveFileProbe(request(path)),true,path);
  for(const path of ['/','/preview.js','/api/me','/api/environment','/api/.environment','/.well-known/security.txt','/api/files/notes.env','/api/unknown','/api/lessons?file=.env','/api/search?q=/.git/config'])assert.equal(isSensitiveFileProbe(request(path)),false,path);
});
test('production returns 404 for private files before configuration, auth, database or assets',async()=>{
  let calls=0;
  const app=productionWorker({fetch:async()=>{calls++;throw Error('Must not reach application');}});
  for(const method of ['GET','HEAD','POST']){
    const response=await app.fetch(request('/api/staging/.env',method),{},{});
    assert.equal(response.status,404);assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
    assert.equal(await response.text(),method==='HEAD'?'':'{"error":"Not found."}');
  }
  assert.equal(calls,0);
});
test('integrated handler ignores probes without creating Bugs entries or changing real API failures',async()=>{
  let auth=0,db=0,application=0;
  const app=integratedWorker({authenticate:async()=>{auth++;throw Error('Must not authenticate a probe');},studyDatabase:()=>{db++;throw Error('Must not read or write Bugs for a probe');},studyWorker:{fetch:async()=>{application++;return Response.json({error:'Not migrated. No production fallback.'},{status:501});}}});
  const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'fixture.invalid',ACCOUNT_QUERY_LIMIT_ENABLED:'false',BUG_LOG:'true',DB:{prepare(){throw Error('Must not query account storage');}}};
  for(const path of ['/api/staging/.env','/.git/config','/api/%252eenv','/wrangler.toml'])assert.equal((await app.fetch(request(path),env,{})).status,404);
  assert.deepEqual({auth,db,application},{auth:0,db:0,application:0});
  const response=await app.fetch(request('/api/unknown'),env,{});
  assert.equal(response.status,501);assert.equal(application,1);assert.equal(db,1,'Real API failures still attempt Bugs recording');
});
