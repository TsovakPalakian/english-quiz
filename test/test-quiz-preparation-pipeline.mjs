import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors,body,content} from './quiz-review-fixture.mjs';
import {QuizGenerationService} from '../src/quiz-generation.mjs';
import {StoredQuizIndependentReview} from '../src/stored-quiz-independent-review.mjs';
import {QuizPreparationPipeline} from '../src/quiz-preparation-pipeline.mjs';
import {localQuizReviewer} from '../ops/quiz-review-local-provider.mjs';
async function setup({d1=false}={}){
  const f=await fixture({d1});
  for(const migration of ['002_generation_jobs','006_independent_reviews','007_independent_review_recovery','008_preparation_pipeline'])f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+migration+'.sql',import.meta.url),'utf8'));
  let time=10000,calls=0;const checker=localQuizReviewer('synthetic-checker');
  const independent=new StoredQuizIndependentReview(f.service,{now:()=>time,reviewer:async input=>{calls++;return checker(input);}});
  const make=(check=independent)=>new QuizPreparationPipeline({review:f.service,independent:check,worker:actors.dev,now:()=>time,resolveActor:async id=>Object.values(actors).find(actor=>actor.id===id)});
  const pipeline=make();await pipeline.initialize(actors.dev);
  const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate:async()=>content,now:()=>time});
  await generation.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Gap']}));await generation.runOne();
  const [generated]=await generation.list(actors.teacher);
  const enable=()=>pipeline.configure(actors.dev,body({expectedRevision:1,enabled:true,reason:'Enable synthetic pipeline.'}));
  return {...f,pipeline,independent,generation,make,id:generated.versionId,enable,advance:n=>time+=n,calls:()=>calls};
}
test('chain is Off by default, settings persist with CAS/replay and require developer rights',async()=>{
  const f=await setup({d1:true});try{
    assert.equal(await f.pipeline.runOne(),false);assert.equal(f.calls(),0);assert.equal((await f.pipeline.list(actors.teacher)).jobs.length,0);
    const operation=body({expectedRevision:1,enabled:true,reason:'Enable once.'});
    for(const actor of [actors.student,actors.teacher,{...actors.dev,revoked:true}])await assert.rejects(f.pipeline.configure(actor,operation),error=>error.status===403);
    await f.pipeline.configure(actors.dev,operation);await f.pipeline.configure(actors.dev,operation);
    assert.equal((await f.make().initialize(actors.dev)).enabled,true);
    await assert.rejects(f.pipeline.configure(actors.dev,body({expectedRevision:1,enabled:false,reason:'Stale.'})),error=>error.status===409);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_pipeline_setting_events').get().n,1);
  }finally{f.close();}
});
test('prepared version is checked once, remains submitted and has immutable preparation history',async()=>{
  const f=await setup();try{
    const before=await f.service.get(actors.teacher,f.id);await f.enable();assert.equal(await f.pipeline.runOne(),true);assert.equal(await f.pipeline.runOne(),false);
    assert.equal(f.calls(),1);assert.deepEqual(await f.service.get(actors.teacher,f.id),before);
    const {jobs}=await f.pipeline.list(actors.outsider);assert.equal(jobs.length,1);assert.equal(jobs[0].status,'teacher_review');
    assert.equal((await f.pipeline.history(actors.dev,jobs[0].id)).events.length,3);
    assert.deepEqual(await f.service.sharedForCard(actors.teacher,1),[]);
    for(const sql of ['DELETE FROM qr_pipeline_events','UPDATE qr_pipeline_events SET issue=\'changed\'','DELETE FROM qr_pipeline_setting_events'])assert.throws(()=>f.sql.exec(sql),/append only/);
    assert.throws(()=>f.sql.exec('UPDATE qr_preparation_pipeline SET expected_revision=99,revision=revision+1'),/identity is immutable/);
    await assert.rejects(f.pipeline.list(actors.student),error=>error.status===403);await assert.rejects(f.pipeline.history(actors.student,jobs[0].id),error=>error.status===403);
  }finally{f.close();}
});
test('revoked requesters stop before a check and teacher approval still remains independent',async()=>{
  const f=await setup();try{
    await f.enable();f.pipeline.resolveActor=async()=>({...actors.teacher,revoked:true});await f.pipeline.runOne();
    assert.equal(f.calls(),0);assert.equal((await f.pipeline.list(actors.dev)).jobs[0].issue,'access_changed');
    await f.service.approve(actors.teacher,f.id,body({expectedRevision:1,checks:{meaning:true,answers:true,level:true}}));
    assert.equal((await f.pipeline.list(actors.dev)).jobs[0].status,'approved');assert.equal(await f.pipeline.runOne(),false);
  }finally{f.close();}
});
test('concurrent workers cannot dispatch the same version twice',async()=>{
  const f=await setup({d1:true});try{await f.enable();await Promise.all([f.pipeline.runOne(),f.make().runOne()]);assert.equal(f.calls(),1);assert.equal((await f.pipeline.list(actors.teacher)).jobs.length,1);}
  finally{f.close();}
});
test('crash after saving the check recovers using the stable request identity without another model call',async()=>{
  const f=await setup();try{
    await f.enable();f.pipeline.finish=async()=>{throw Error('Simulated worker disappearance');};
    await assert.rejects(f.pipeline.runOne());assert.equal(f.calls(),1);
    f.advance(30001);const replacement=f.make();await replacement.runOne();
    assert.equal(f.calls(),1);assert.equal((await replacement.list(actors.teacher)).jobs[0].state,'teacher_review');
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_independent_requests').get().n,1);
  }finally{f.close();}
});
test('Off pauses queued work, and changed revisions are never checked automatically',async()=>{
  const f=await setup();try{
    await f.enable();await f.pipeline.discover();await f.pipeline.configure(actors.dev,body({expectedRevision:2,enabled:false,reason:'Pause.'}));
    assert.equal(await f.pipeline.runOne(),false);assert.equal((await f.pipeline.list(actors.teacher)).jobs[0].status,'paused');
    const q=await f.service.get(actors.teacher,f.id);await f.service.requestChanges(actors.teacher,f.id,body({expectedRevision:q.revision,comment:'Revise.'}));
    await f.pipeline.configure(actors.dev,body({expectedRevision:3,enabled:true,reason:'Resume.'}));await f.pipeline.runOne();
    assert.equal(f.calls(),0);assert.equal((await f.pipeline.list(actors.teacher)).jobs[0].state,'stale');
  }finally{f.close();}
});
test('existing pending check is adopted; its interruption stops the pipeline without auto retry',async()=>{
  const f=await setup();let release,running;
  try{
    let started;const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
    const check=new StoredQuizIndependentReview(f.service,{now:()=>10000,reviewer:async input=>{started();await gate;return localQuizReviewer('late')(input);}});
    running=check.run(actors.teacher,f.id,body({expectedRevision:1}));await entered;
    const pipeline=f.make(check);await f.enable();await pipeline.runOne();assert.equal((await pipeline.list(actors.teacher)).jobs[0].state,'running');
    f.advance(12001);
    const recovered=f.make();await recovered.runOne();assert.equal((await recovered.list(actors.teacher)).jobs[0].issue,'interrupted');
    release();await running;assert.equal(f.calls(),0);assert.equal(await recovered.runOne(),false);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_independent_requests').get().n,1);
  }finally{release?.();if(running)await running;f.close();}
});
