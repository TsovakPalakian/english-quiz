import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {notifyTelegram,telegramConfig} from './telegram-notify.mjs';

const secretFile='.local-secrets/ci.env';
if(existsSync(secretFile))process.loadEnvFile(secretFile);
try{telegramConfig();}catch(error){console.error(error.message+' Local commit tests were not started.');process.exit(1);}
const commit=spawnSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).stdout?.trim()||'unknown';
const env={...process.env,CHECK_MODE:'local'};
let stage='build',code=1;
try{
  let result=spawnSync(process.execPath,['ops/build-learning-production-assets.mjs'],{env,stdio:'inherit'});
  code=result.status??1;
  if(code===0){stage='tests';result=spawnSync(process.execPath,['ops/check-all.mjs','--mode=local'],{env,stdio:'inherit'});code=result.status??1;}
  await notifyTelegram('Lumiscia local commit '+commit+'\n'+(code===0?'Tests: success':'Failed stage: '+stage)+'\nNo deployment was requested.');
}catch(error){console.error(error.message);process.exitCode=1;}
if(code!==0)process.exitCode=code;
