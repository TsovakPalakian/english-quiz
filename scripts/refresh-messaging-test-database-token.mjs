// Credentials remain in memory and travel to the fixed TEST Worker on stdin.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
try {
  const config='staging/wrangler.messages.toml';
  const text=readFileSync(root+config,'utf8');
  assert.match(text,/^name = "learn-english-turso-integrated-test"$/m);
  assert.match(text,/^MESSAGES_ENABLED = "true"$/m);
  const cli=process.env.TURSO_STAGE_WRANGLER;
  assert.match(cli||'',/^\/Users\/tsovakpalakian\/\.npm\/_npx\/[a-f0-9]+\/node_modules\/wrangler\/bin\/wrangler\.js$/);
  const run=args=>execFileSync('turso',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim();
  const database='english-quiz-test-retained';
  const url=run(['db','show',database,'--url']);
  assert.match(url,/^libsql:\/\/english-quiz-test-retained-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.turso\.io$/);
  const token=run(['db','tokens','create',database,'--expiration','30d']);
  assert.match(token,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
  assert.ok(claims.exp*1000>Date.now()+29*86400000);
  const response=await fetch('https://'+new URL(url).hostname+'/v2/pipeline',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({requests:[{type:'execute',stmt:{sql:"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('profile_members','account_settings')"}},{type:'close'}]})
  });
  assert.ok(response.ok);
  const body=await response.json();
  assert.equal(body.results?.[0]?.type,'ok');
  assert.equal(body.results[0].response.result.rows.length,2);
  const result=spawnSync(process.execPath,[cli,'secret','bulk','--config',config],{
    cwd:root,input:JSON.stringify({TURSO_URL:url,TURSO_AUTH_TOKEN:token}),
    encoding:'utf8',timeout:120000,
    env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:'/private/tmp/english-quiz-test-token-refresh-logs'}
  });
  assert.equal(result.status,0);
  console.log(JSON.stringify({status:'test-database-verified-and-credentials-refreshed',expiresAt:new Date(claims.exp*1000).toISOString(),sessionsChanged:false,productionChanged:false}));
} catch {
  console.error('TEST credential refresh failed. Sensitive diagnostics suppressed; no production configuration was changed.');
  process.exitCode=1;
}
