import {randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const run=(args,input)=>{const result=spawnSync('npx',['wrangler',...args],{cwd:resolve(import.meta.dirname,'..'),input,encoding:'utf8'});if(result.status!==0)throw Error('Wrangler command failed: '+(result.stderr||result.stdout));return result.stdout;};
const secrets=run(['secret','list']),start=secrets.indexOf('['),end=secrets.lastIndexOf(']');
if(start<0||end<start)throw Error('Cannot verify existing secrets.');
if(JSON.parse(secrets.slice(start,end+1)).some(secret=>secret.name==='CHAT_ENCRYPTION_KEY')){
  console.log(JSON.stringify({status:'existing-key-preserved'}));
}else{
  const directory=resolve(import.meta.dirname,'../.local-secrets'),path=resolve(directory,'chat-encryption-v1.key');
  mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
  if(!existsSync(path))writeFileSync(path,randomBytes(32).toString('base64')+'\n',{mode:0o600,flag:'wx'});
  chmodSync(path,0o600);const key=readFileSync(path,'utf8').trim();if(Buffer.from(key,'base64').length!==32)throw Error('Invalid recovery key.');
  run(['secret','put','CHAT_ENCRYPTION_KEY'],key+'\n');
  console.log(JSON.stringify({status:'chat-key-provisioned',recoveryFile:path,keyPrinted:false}));
}
