// Store a scoped, short-lived database credential outside served assets.
// CLI output is captured; tokens are never printed or installed in the Worker.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {credentials} from './turso-staging.mjs';
const database='english-quiz-test-retained';
try{
  const run=args=>execFileSync('turso',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30_000}).trim();
  const url=run(['db','show',database,'--url']);
  if(!/^libsql:\/\/english-quiz-test-retained-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.turso\.io$/.test(url))throw new Error('Unexpected dedicated test database URL.');
  const token=run(['db','tokens','create',database,'--expiration','7d']);
  if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw new Error('Unexpected database credential format.');
  const directory=mkdtempSync('/private/tmp/english-quiz-retained-target-');
  const file=directory+'/test.vars';
  writeFileSync(file,`TURSO_URL=${url}\nTURSO_AUTH_TOKEN=${token}\n`,{mode:0o600,flag:'wx'});
  process.env.TURSO_STAGE_VARS_FILE=file;credentials();
  console.log(JSON.stringify({database,credentialFile:file,expiresInDays:7,existingConfigurationChanged:false,workerSecretsChanged:false}));
}catch{
  console.error('Dedicated test credentials unavailable. No existing secrets were changed; CLI diagnostics suppressed to protect credentials.');process.exitCode=1;
}
