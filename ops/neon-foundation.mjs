import {spawnSync} from 'node:child_process';
import {databaseAction,neonConnection,verifyNeonSchema} from '../src/database-administration.mjs';
const mode=process.argv[2];
if(!['--check','--prepare','--setup','--verify'].includes(mode))throw new Error('Use --check, --prepare, --setup or --verify. Supply the connection URL through stdin, never as an argument.');
async function secretInput(){
  if(!process.stdin.isTTY){let input='';for await(const chunk of process.stdin)input+=chunk;return input.trim();}
  process.stdout.write('Neon URL (hidden): ');process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{let input='';const done=()=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
    const read=chunk=>{for(const char of chunk.toString()){if(char==='\u0003'){done();reject(new Error('Cancelled'));return;}if(char==='\r'||char==='\n'){done();resolve(input.trim());return;}if(char==='\u007f'){input=input.slice(0,-1);}else input+=char;}};process.stdin.on('data',read);
  });
}
try{
  const connection=neonConnection(await secretInput());
  const env={NEON_DATABASE_URL:connection};
  const result=mode==='--verify'?await verifyNeonSchema(env):await databaseAction(env,{provider:'neon',action:mode==='--check'?'check':'prepare'});
  if(mode==='--prepare'||mode==='--setup')result.verification=await verifyNeonSchema(env);
  if(mode==='--setup'){
    const configured=spawnSync('npx',['wrangler','secret','put','NEON_DATABASE_URL'],{input:connection+'\n',encoding:'utf8',timeout:120_000});
    if(configured.error||configured.status!==0)throw new Error('Neon foundation was prepared, but the Cloudflare secret could not be configured.');
    result.workerSecretConfigured=true;
  }
  console.log(JSON.stringify(result));
}catch(error){console.error(error.message?.startsWith('Neon ')?error.message:'Neon setup failed. No connection credentials were printed.');process.exitCode=1;}
