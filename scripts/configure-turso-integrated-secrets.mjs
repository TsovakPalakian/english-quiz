// One fixed test Worker only. Secrets travel on stdin, never in command arguments/logs.
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const file=process.env.TURSO_STAGE_VARS_FILE;
const cli=process.env.TURSO_STAGE_WRANGLER;
try {
  if(!file?.startsWith('/private/tmp/english-quiz-retained-target-')||!file.endsWith('/test.vars'))throw Error();
  if(!cli?.match(/^\/Users\/tsovakpalakian\/\.npm\/_npx\/[a-f0-9]+\/node_modules\/wrangler\/bin\/wrangler\.js$/))throw Error();
  const config=readFileSync(root+'staging/wrangler.integrated.toml','utf8');
  if(!/^name = "learn-english-turso-integrated-test"$/m.test(config)||!/^STAGE_ENABLED = "false"$/m.test(config))throw Error();
  const secrets={};
  for(const line of readFileSync(file,'utf8').split(/\r?\n/)){
    const match=line.match(/^\s*(TURSO_URL|TURSO_AUTH_TOKEN)\s*=\s*(.*?)\s*$/);if(!match)continue;
    if(secrets[match[1]])throw Error();
    secrets[match[1]]=match[2].replace(/^(["'])(.*)\1$/,'$2');
  }
  const url=new URL(secrets.TURSO_URL);
  if(!['libsql:','https:'].includes(url.protocol)||!/^english-quiz-test-retained-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.turso\.io$/.test(url.hostname)||url.username||url.password||url.port||url.search||url.hash||!['','/'].includes(url.pathname))throw Error();
  if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(secrets.TURSO_AUTH_TOKEN))throw Error();
  const claims=JSON.parse(Buffer.from(secrets.TURSO_AUTH_TOKEN.split('.')[1],'base64url').toString());
  if(!Number.isFinite(claims.exp)||claims.exp*1000<Date.now()+48*3600000)throw Error();
  secrets.SESSION_SECRET=randomBytes(32).toString('hex');
  const result=spawnSync(process.execPath,[cli,'secret','bulk','--config','staging/wrangler.integrated.toml'],{
    cwd:root,input:JSON.stringify(secrets),encoding:'utf8',timeout:120000,
    env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:'/private/tmp/english-quiz-turso-integrated-secret-logs'}
  });
  if(result.status!==0)throw Error();
  console.log('Three secrets installed on the fixed integrated TEST Worker. Existing Worker secrets unchanged.');
} catch {
  console.error('Test secret configuration failed; credential/CLI diagnostics suppressed. Do not activate.');process.exitCode=1;
}
