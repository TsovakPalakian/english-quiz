// One command for every automatic local test: npm run check
import {spawn} from 'node:child_process';
import {readdirSync} from 'node:fs';

// Need a live site, manual sign-in or the retired TEST messaging UI.
const excluded=new Set(['test-settings-production-ui.mjs','test-messages-ui.mjs']);
const only=process.argv.slice(2);
// Neon is optional and slow; include it with CHECK_NEON=1.
const neon=process.env.CHECK_NEON==='1';
const scripts=readdirSync('scripts').filter(name=>/^test-.*\.mjs$/.test(name)&&!excluded.has(name)&&(neon||!name.startsWith('test-neon-'))&&(!only.length||only.some(part=>name.includes(part)))).sort();
const timeout=Number(process.env.CHECK_TIMEOUT_MS||300000),parallel=Number(process.env.CHECK_PARALLEL||4);

function run(command,args){
  return new Promise(resolve=>{
    const started=Date.now(),child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let output='';
    child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
    const timer=setTimeout(()=>{output+='\nTimed out after '+timeout+' ms.';child.kill('SIGKILL');},timeout);
    child.on('close',code=>{clearTimeout(timer);resolve({code,output,seconds:Math.round((Date.now()-started)/1000)});});
  });
}

const jobs=[...(only.length?[]:[['vitest',()=>run('npx',['vitest','run'])]]),...scripts.map(name=>[name,()=>run(process.execPath,['scripts/'+name])])];
const results=[];let next=0;
await Promise.all(Array.from({length:Math.min(parallel,jobs.length)},async()=>{
  while(next<jobs.length){const [name,start]=jobs[next++];const result=await start();results.push({name,...result});
    console.log((result.code===0?'ok  ':'FAIL')+' '+name+' ('+result.seconds+'s)');}
}));
const failed=results.filter(result=>result.code!==0);
for(const result of failed)console.log('\n===== '+result.name+' =====\n'+result.output.trim().split('\n').slice(-25).join('\n'));
console.log('\n'+(results.length-failed.length)+' passed, '+failed.length+' failed.');
process.exit(failed.length?1:0);
