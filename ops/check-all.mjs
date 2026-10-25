// Both modes run the same suite; remote execution is a separate command.
import {spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {checkMode} from './check-environment.mjs';

let settings;
try{settings=checkMode(process.argv.slice(2));}catch(error){console.error(error.message);process.exit(2);}
const {mode,filters}=settings;
const env={...process.env,CHECK_MODE:mode,...(mode==='ci'?{CI:'true'}:{})};
const exclusions=new Map([['test-settings-production-ui.mjs','Requires a live account and manual sign-in; not an automatic test.']]);
const all=readdirSync('test').filter(name=>/^test-.*\.mjs$/.test(name)).sort();
const scripts=all.filter(name=>!exclusions.has(name)&&(!filters.length||filters.some(part=>name.includes(part))));
if(filters.length&&!scripts.length){console.error('No automatic tests matched the supplied filters.');process.exit(2);}
for(const [name,reason] of exclusions)if(!filters.length||filters.some(part=>name.includes(part)))console.log('EXCLUDED '+name+': '+reason);
const timeout=Number(env.CHECK_TIMEOUT_MS||300000),parallel=Number(env.CHECK_PARALLEL||(mode==='ci'?2:4));
if(!Number.isSafeInteger(timeout)||timeout<1||!Number.isSafeInteger(parallel)||parallel<1){console.error('CHECK_TIMEOUT_MS and CHECK_PARALLEL must be positive integers.');process.exit(2);}
console.log('Check mode: '+mode+'; automatic scripts: '+scripts.length+'; screenshots: disabled.');

function run(command,args){
  return new Promise(resolve=>{
    const started=Date.now(),child=spawn(command,args,{env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
    let output='',finished=false,timedOut=false,phaseBuffer='';const subtests=[];
    const append=chunk=>{output=(output+chunk).slice(-65536);};
    child.stdout?.on('data',chunk=>{
      append(chunk);phaseBuffer+=chunk.toString();
      const lines=phaseBuffer.split('\n');phaseBuffer=lines.pop().slice(-65536);
      for(const line of lines){const at=line.indexOf('@@CHECK_PHASE@@');if(at<0)continue;
        try{const phase=JSON.parse(line.slice(at+15));
          if(typeof phase.name==='string'&&Number.isSafeInteger(phase.milliseconds)&&phase.milliseconds>=0&&typeof phase.failed==='boolean')subtests.push(phase);
        }catch{}
      }
    });child.stderr?.on('data',append);
    const timer=setTimeout(()=>{
      timedOut=true;append('\nTimed out after '+timeout+' ms.');
      try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{}
    },timeout);
    const finish=code=>{
      if(finished)return;finished=true;clearTimeout(timer);
      resolve({code:timedOut?124:code??1,output,subtests,seconds:Math.round((Date.now()-started)/1000)});
    };
    child.on('error',error=>{append(error.message);finish(1);});child.on('close',finish);
  });
}

const job=name=>[name,()=>run(process.execPath,['test/'+name])];
// Browser tests assert on rendering timing; they run one at a time after the rest.
const browser=name=>/-ui\.mjs$|ui-boot/.test(name)||/chromium|playwright|newCDPSession/.test(readFileSync('test/'+name,'utf8'));
const fast=[...(filters.length?[]:[['vitest',()=>run(process.execPath,[fileURLToPath(new URL('../node_modules/vitest/vitest.mjs',import.meta.url)),'run'])]]),...scripts.filter(name=>!browser(name)).map(job)];
const results=[];
async function pool(jobs,width){
  let next=0;
  await Promise.all(Array.from({length:Math.min(width,jobs.length)},async()=>{
    while(next<jobs.length){const [name,start]=jobs[next++];const result=await start();
      const skipped=[...result.output.matchAll(/(?:^|\n)\s*(?:#\s*|\u2139\s*)?skipped\s+(\d+)/g)].reduce((sum,match)=>sum+Number(match[1]),0);
      results.push({name,...result,skipped});
      console.log((result.code===0?'ok  ':'FAIL')+' '+name+' ('+result.seconds+'s)'+(result.subtests.length?'; '+result.subtests.length+' subtests; longest '+(Math.max(...result.subtests.map(t=>t.milliseconds))/1000).toFixed(2)+'s':'')+(skipped?'; '+skipped+' inner tests SKIPPED (not passed)':''));
      for(const step of result.subtests.filter(step=>step.milliseconds>5000))console.log('  SLOW '+step.name+' ('+(step.milliseconds/1000).toFixed(2)+'s)');}
  }));
}
await pool(fast,parallel);
await pool(scripts.filter(browser).map(job),1);
const failed=results.filter(result=>result.code!==0);
for(const result of failed)console.log('\n===== '+result.name+' =====\n'+result.output.trim().split('\n').slice(-25).join('\n'));
console.log('\n'+(results.length-failed.length)+' scripts passed, '+failed.length+' scripts failed; '+results.reduce((sum,result)=>sum+result.skipped,0)+' inner tests skipped; '+exclusions.size+' manual test excluded (skips are not counted as passed).');
process.exit(failed.length?1:0);
