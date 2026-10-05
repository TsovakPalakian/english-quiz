// Bounded live read-only probe: test Turso only; no D1, session or content output.
import assert from 'node:assert/strict';
import {TursoStudyClient} from '../src/turso-study.mjs';
import {legacyState} from '../src/turso-legacy-read.mjs';
import {credentials} from './turso-staging.mjs';
try{
  const db=new TursoStudyClient(credentials()),[member]=await db.read('SELECT account_id FROM profile_members ORDER BY account_id LIMIT 1');
  assert.ok(member);const actor={id:member.account_id,role:'DEVELOPER'};
  if(process.argv.includes('--compact-only')){
    const start=performance.now(),value=await legacyState(db,actor,{compact:true});
    console.log(JSON.stringify({testOnly:true,readOnly:true,cards:value.added.length,compactBytes:new TextEncoder().encode(JSON.stringify(value)).length,compactMs:Math.round(performance.now()-start),d1Queries:0,baselineMeasured:false}));
    process.exit(0);
  }
  const t=performance.now(),full=await legacyState(db,actor),fullMs=Math.round(performance.now()-t);
  const t2=performance.now(),compact=await legacyState(db,actor,{compact:true}),compactMs=Math.round(performance.now()-t2);
  assert.equal(compact.added.length,full.added.length);
  for(let i=0;i<full.added.length;i++){
    const a=full.added[i],b=compact.added[i];for(const key of ['stageId','stageRevision','word','ru','place'])assert.deepEqual(b[key],a[key]);
    for(const key of ['usages','grammar','direction','query','uk','us'])assert.deepEqual(b.data?.[key],a.data?.[key]);
  }
  const fullBytes=new TextEncoder().encode(JSON.stringify(full)).length,compactBytes=new TextEncoder().encode(JSON.stringify(compact)).length;
  console.log(JSON.stringify({testOnly:true,readOnly:true,cards:full.added.length,fullBytes,compactBytes,fullMs,compactMs,quizInputsEquivalent:true,performanceSample:'one sequential run, not a latency benchmark',d1Queries:0}));
}catch(error){console.error(JSON.stringify({error:'Test performance check failed',kind:error.name,status:error.status||null,noDataChanged:true}));process.exitCode=1;}
