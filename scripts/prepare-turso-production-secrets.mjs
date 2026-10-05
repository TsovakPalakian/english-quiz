// Dedicated new Worker only. No secret is printed or passed on the command line.
import {readFileSync,writeFileSync,mkdtempSync,chmodSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli='/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js';
try{
  const config=readFileSync(root+'production/wrangler.toml','utf8');
  for(const line of ['name = "learn-english-turso-production"','main = "disabled-worker.mjs"','workers_dev = false','preview_urls = false','CONTENT_ENABLED = "false"','CONTENT_WRITES = "false"'])
    if(!config.split(/\r?\n/).includes(line))throw Error();
  if(/\broutes?\s*=/.test(config))throw Error();
  const run=args=>execFileSync('turso',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim();
  const url=run(['db','show','english-quiz-production','--url']);
  if(!/^libsql:\/\/english-quiz-production-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.turso\.io$/.test(url))throw Error();
  const token=run(['db','tokens','create','english-quiz-production','--expiration','30d']);
  if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error();
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
  if(!Number.isFinite(claims.exp)||claims.exp*1000<Date.now()+29*86400000)throw Error();
  const directory=mkdtempSync('/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/production-credentials-');
  chmodSync(directory,0o700);
  writeFileSync(directory+'/worker.vars',`TURSO_URL=${url}\nTURSO_AUTH_TOKEN=${token}\n`,{mode:0o600,flag:'wx'});
  const result=spawnSync(process.execPath,[cli,'secret','bulk','--config','production/wrangler.toml'],{
    cwd:root,input:JSON.stringify({TURSO_URL:url,TURSO_AUTH_TOKEN:token}),encoding:'utf8',timeout:60000,
    env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:'/private/tmp/english-quiz-production-secret-logs'}
  });
  if(result.status!==0){console.error('Secret installation failed; credential retained privately at '+directory+'. No retry.');process.exitCode=1;}
  else console.log(JSON.stringify({worker:'learn-english-turso-production',secretsInstalled:2,credentialDirectory:directory,
    tokenExpiresAt:new Date(claims.exp*1000).toISOString(),publicEndpointEnabled:false,existingWorkerChanged:false}));
}catch{console.error('Production secret preparation stopped; diagnostics suppressed to protect credentials.');process.exitCode=1;}
