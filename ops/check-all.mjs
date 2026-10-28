// Both modes run the same suite; remote execution is a separate command.
import {spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {availableParallelism,cpus} from 'node:os';
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
const cpuCount=(typeof availableParallelism==='function'?availableParallelism():cpus().length)||4;
const timeout=Number(env.CHECK_TIMEOUT_MS||300000);
const parallel=Number(env.CHECK_PARALLEL||(mode==='ci'?Math.min(3,cpuCount):Math.min(8,Math.max(4,cpuCount-1))));
const browserParallel=Number(env.CHECK_BROWSER_PARALLEL||(mode==='ci'?Math.min(3,cpuCount):Math.min(4,Math.max(1,Math.floor(cpuCount/3)))));
if(!Number.isSafeInteger(timeout)||timeout<1||!Number.isSafeInteger(parallel)||parallel<1||!Number.isSafeInteger(browserParallel)||browserParallel<1){
  console.error('CHECK_TIMEOUT_MS, CHECK_PARALLEL, and CHECK_BROWSER_PARALLEL must be positive integers.');
  process.exit(2);
}
console.log('Check mode: '+mode+'; automatic scripts: '+scripts.length+'; fast workers: '+parallel+'; browser workers: '+browserParallel+'; screenshots: disabled.');

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
const browserCache=new Map();
const browser=name=>{
  if(!browserCache.has(name)){
    browserCache.set(name,/-ui\.mjs$|ui-boot/.test(name)||/chromium|playwright|newCDPSession/.test(readFileSync('test/'+name,'utf8')));
  }
  return browserCache.get(name);
};
const WEIGHTS=new Map([
  ['test-chat-ui.mjs',48],['test-auth-studio-ui.mjs',25],['test-constellation-return-pause-ui.mjs',20],
  ['test-ui-boot.mjs',14],['test-quiz-media-preview.mjs',11],['test-chat-recording-ui.mjs',10],
  ['test-invite-registration-ui.mjs',9],['test-quiz-generation-ui.mjs',9],['test-quiz-review-editor-ui.mjs',9],
  ['test-material-quiz-ui.mjs',8],['test-quiz-attempt-history-ui.mjs',8],['test-independent-review-ui.mjs',8],
  ['test-role-navigation-ui.mjs',7],['test-local-video-preview-ui.mjs',7],['test-learning-workbench-ui.mjs',6],
  ['test-learning-kits-preview.mjs',6],['test-feedback-ui.mjs',5],['test-local-workbench-launch-ui.mjs',5],
  ['test-provider-settings-ui.mjs',5],['test-lesson-pdf-ui.mjs',5],['test-speech-practice-ui.mjs',5],
  ['test-preparation-pipeline-ui.mjs',5],['test-learning-main.mjs',4],['test-d1-study.mjs',3]
]);
const sortByWeight=list=>list.slice().sort((a,b)=>(WEIGHTS.get(b)||1)-(WEIGHTS.get(a)||1)||a.localeCompare(b));
const fastScripts=sortByWeight(scripts.filter(name=>!browser(name)));
const browserScripts=sortByWeight(scripts.filter(browser));
const fast=[...(filters.length?[]:[['vitest',()=>run(process.execPath,[fileURLToPath(new URL('../node_modules/vitest/vitest.mjs',import.meta.url)),'run'])]]),...fastScripts.map(job)];
const results=[];
const totalJobs=fast.length+browserScripts.length;
let completed=0;
async function pool(jobs,width){
  let next=0;
  await Promise.all(Array.from({length:Math.min(width,jobs.length)},async()=>{
    while(next<jobs.length){const [name,start]=jobs[next++];const result=await start();
      const skipped=[...result.output.matchAll(/(?:^|\n)\s*(?:#\s*|\u2139\s*)?skipped\s+(\d+)/g)].reduce((sum,match)=>sum+Number(match[1]),0);
      results.push({name,...result,skipped});
      completed++;
      const prefix='['+String(completed).padStart(String(totalJobs).length,' ')+'/'+totalJobs+'] ';
      console.log(prefix+(result.code===0?'ok  ':'FAIL')+' '+name+' ('+result.seconds+'s)'+(result.subtests.length?'; '+result.subtests.length+' subtests; longest '+(Math.max(...result.subtests.map(t=>t.milliseconds))/1000).toFixed(2)+'s':'')+(skipped?'; '+skipped+' inner tests SKIPPED (not passed)':''));
      for(const step of result.subtests.filter(step=>step.milliseconds>5000))console.log('  SLOW '+step.name+' ('+(step.milliseconds/1000).toFixed(2)+'s)');}
  }));
}
await pool(fast,parallel);
await pool(browserScripts.map(job),browserParallel);
const failed=results.filter(result=>result.code!==0);
for(const result of failed)console.log('\n===== '+result.name+' =====\n'+result.output.trim().split('\n').slice(-25).join('\n'));
console.log('\n'+(results.length-failed.length)+' scripts passed, '+failed.length+' scripts failed; '+results.reduce((sum,result)=>sum+result.skipped,0)+' inner tests skipped; '+exclusions.size+' manual test excluded (skips are not counted as passed).');
process.exit(failed.length?1:0);
