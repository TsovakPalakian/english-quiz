import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {clockSubtests} from './helpers/scenario-subtests.mjs';

const helper=new URL('./helpers/scenario-subtests.mjs',import.meta.url).href;
function run(body){
  const result=spawnSync(process.execPath,['--input-type=module','-e',`import assert from 'node:assert/strict';import {scenarioSubtests} from ${JSON.stringify(helper)};${body}`],{encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);
  const phases=[...result.stdout.matchAll(/@@CHECK_PHASE@@(\{[^\n]+\})/g)].map(match=>JSON.parse(match[1]));
  return {...result,phases};
}
test('scenario subtests preserve lexical state, assertion order and awaited cleanup',()=>{
  const result=run(`const events=[];await scenarioSubtests('shared state',async function*(){
    yield 'prepare';let value=1;try{events.push('prepare');assert.equal(value,1);
      yield 'mutate';value++;events.push('mutate');assert.equal(value,2);
      yield 'verify';events.push('verify');assert.equal(value,2);
    }finally{await new Promise(resolve=>setTimeout(resolve,10));events.push('cleanup');}
  });assert.deepEqual(events,['prepare','mutate','verify','cleanup']);console.log('CLEANUP_CONFIRMED');`);
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.deepEqual(result.phases.map(p=>p.name),['prepare','mutate','verify']);
  assert.ok(result.phases.every(p=>!p.failed&&p.milliseconds>=0));
  assert.match(result.stdout,/CLEANUP_CONFIRMED/);
});
test('failed prerequisites retain the original failure, stop dependent phases and clean resources',()=>{
  const result=run(`const events=[];await scenarioSubtests('failure',async function*(){
    yield 'prepare';try{events.push('prepare');
    yield 'broken';assert.fail('original assertion failed');
      yield 'dependent';events.push('must not run');
    }finally{events.push('cleanup');}
  });assert.deepEqual(events,['prepare','cleanup']);console.log('CLEANUP_CONFIRMED');`);
  assert.equal(result.status,1,result.stdout+result.stderr);
  assert.deepEqual(result.phases.map(p=>[p.name,p.failed]),[['prepare',false],['broken',true]]);
  assert.match(result.stdout,/original assertion failed/);
  assert.match(result.stdout,/CLEANUP_CONFIRMED/);
});
test('clock subtests preserve exact elapsed time, execute each slice and do not fast-forward',async()=>{
  const calls=[],durations=[];
  const clock={async runFor(ms){durations.push(ms);calls.push('timer '+ms);},fastForward(){assert.fail('Timers must not be skipped');}};
  for await(const label of clockSubtests(clock,16500,'Sky'))calls.push(label);
  assert.deepEqual(durations,[4000,4000,4000,4000,500]);
  assert.equal(durations.reduce((sum,ms)=>sum+ms,0),16500);
  assert.equal(calls[0],'Sky: 0–4000 virtual ms');
  assert.equal(calls.at(-1),'timer 500');
  assert.equal(calls.length,10);
  await assert.rejects(async()=>{for await(const _ of clockSubtests(clock,1,'Sky',0)){}},TypeError);
});
