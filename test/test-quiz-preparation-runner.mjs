import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,actors,body,content} from './quiz-review-fixture.mjs';
import {workbenchMigrationPlan} from '../ops/learning-workbench-migration-plan.mjs';
import {QuizGenerationService,GenerationIssue} from '../src/quiz-generation.mjs';
import {QuizGenerationContext} from '../src/quiz-generation-context.mjs';
import {QuizPreparationPipeline} from '../src/quiz-preparation-pipeline.mjs';
import {StoredQuizIndependentReview} from '../src/stored-quiz-independent-review.mjs';
import {QuizPreparationRunner,createPreparationScheduled} from '../src/quiz-preparation-runner.mjs';
import {StudyService,StudyError} from '../src/learning-study.mjs';
import {localQuizReviewer} from '../ops/quiz-review-local-provider.mjs';
import {learningWorkbenchAPI} from '../src/learning-workbench-api.mjs';
import {QuizReviewService} from '../src/quiz-review.mjs';
import {createLearningWorkbenchFactory} from '../src/learning-workbench-services.mjs';
async function setup({d1=false,authorize=async()=>true,generate=null,filename=':memory:'}={}){
  const f=await fixture({d1,extendedLifecycle:true,filename});for(const migration of workbenchMigrationPlan().steps.slice(1))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+migration.name,import.meta.url),'utf8'));
  let time=10000,calls=0,checks=0,worker=actors.dev;const resolveActor=async id=>id===actors.dev.id?worker:Object.values(actors).find(actor=>actor.id===id);
  const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor,preparation:new QuizGenerationContext({review:f.service}),generate:generate||(async({type})=>{calls++;if(type!=='Gap')throw new GenerationIssue('context_required',false);return content;}),now:()=>time,timeoutMs:1000,leaseMs:5000,backoffMs:1});
  const independent=new StoredQuizIndependentReview(f.service,{now:()=>time,reviewer:async input=>{checks++;return localQuizReviewer('synthetic-runner')(input);}});
  const pipeline=new QuizPreparationPipeline({review:f.service,independent,worker:actors.dev,resolveActor,now:()=>time});await pipeline.initialize(actors.dev);
  const make=()=>new QuizPreparationRunner({review:f.service,generation,pipeline,workerId:actors.dev.id,resolveActor,authorize,now:()=>time,leaseMs:1000}),runner=make();
  const enable=async()=>{const current=await runner.settings(actors.dev);await runner.configure(actors.dev,body({expectedRevision:current.revision,enabled:true,reason:'Synthetic local runner.'}));};
  const signalWord=()=>f.sql.exec("UPDATE lesson_blocks SET deleted_at=1 WHERE id=1; UPDATE lesson_blocks SET deleted_at=NULL,revision=revision+1 WHERE id=1");
  const insertWord=()=>new StudyService(f.db).editLesson(actors.teacher,1,body({expectedRevision:1,changes:{},upserts:[{expectedRevision:0,type:'word',tab:'',cardId:5,content:{word:'storm'}}],deletes:[]}));
  const addCard=()=>f.sql.exec("INSERT INTO cards(id,scope,en,word_key,ru) VALUES(5,'shared','storm','storm','буря')");
  return {...f,runner,generation,pipeline,make,enable,signalWord,insertWord,addCard,advance:n=>{time+=n;},revoke:()=>{worker={...actors.dev,revoked:true};},calls:()=>calls,checks:()=>checks};
}
test('source saves only write a transactional outbox, default off; rollback and replay preserve the word and receipt',async()=>{
  for(const d1 of [false,true]){const f=await setup({d1});try{
    f.addCard();await f.insertWord();assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_preparation_outbox').get().n,0);assert.equal(f.calls(),0);
    await f.enable();f.signalWord();assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_preparation_outbox').get().n,1);assert.equal(f.calls(),0);
    f.sql.exec("CREATE TRIGGER fail_dispatch_insert BEFORE INSERT ON qr_preparation_outbox BEGIN SELECT RAISE(ABORT,'test outbox failure'); END");
    const request=body({expectedRevision:2,changes:{},upserts:[{expectedRevision:0,type:'word',tab:'',cardId:2,content:{word:'bank'}}],deletes:[]}),study=new StudyService(f.db);
    await assert.rejects(study.editLesson(actors.teacher,1,request));assert.equal(f.sql.prepare('SELECT revision FROM lessons WHERE id=1').get().revision,2);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM lesson_blocks WHERE lesson_id=1 AND card_id=2').get().n,0);
    f.sql.exec('DROP TRIGGER fail_dispatch_insert');const saved=await study.editLesson(actors.teacher,1,request),count=f.sql.prepare('SELECT COUNT(*) AS n FROM qr_dispatch_events').get().n;assert.deepEqual(await study.editLesson(actors.teacher,1,request),saved);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_dispatch_events').get().n,count);assert.equal(f.calls(),0);
  }finally{f.close();}}
});
test('missing or ambiguous meaning waits without inference; explicit sense mapping and group assignment wake the dispatcher',async()=>{
  const f=await setup({d1:true});try{
    await f.enable();f.addCard();await f.insertWord();await f.runner.dispatch();let [row]=(await f.runner.summary(actors.teacher)).rows;assert.equal(row.issue,'meaning_required');assert.equal(f.calls(),0);
    await f.service.createSense(actors.dev,body({cardId:5,meaning:{partOfSpeech:'noun',translation:'буря',definition:'Violent weather.'}}));await f.runner.dispatch();assert.equal((await f.runner.summary(actors.teacher)).rows[0].state,'done');assert.equal((await f.generation.list(actors.teacher)).length,17);assert.equal(f.calls(),0);
    await f.service.createSense(actors.dev,body({cardId:5,meaning:{partOfSpeech:'verb',translation:'штурмовать',definition:'Attack a place.'}}));await f.runner.dispatch();assert.equal((await f.runner.summary(actors.teacher)).rows[0].issue,'meaning_ambiguous');
    f.sql.exec('DELETE FROM class_group_lessons WHERE lesson_id=1');f.signalWord();await f.runner.dispatch();assert.ok((await f.runner.summary(actors.teacher)).rows.some(row=>row.issue==='group_required'));
    f.sql.exec('INSERT INTO class_group_lessons(group_id,lesson_id) VALUES(1,1)');assert.ok((await f.runner.summary(actors.teacher)).rows.every(row=>row.state==='queued'));
  }finally{f.close();}
});
test('ticks feed generation and independent review, remain bounded and never publish approved content',async()=>{
  const f=await setup();try{
    await f.enable();await f.pipeline.configure(actors.dev,body({expectedRevision:1,enabled:true,reason:'Synthetic checks.'}));f.signalWord();
    const result=await f.runner.tick({maxSteps:90,maxMs:10000});assert.equal(result.reason,'idle');assert.equal(f.calls(),17);assert.equal(f.checks(),1);
    const summary=await f.runner.summary(actors.outsider);assert.equal(summary.rows[0].state,'done');assert.ok(summary.review.some(row=>row.state==='teacher_review'));assert.equal(summary.eventAuthorKnown,false);assert.deepEqual(await f.service.sharedForCard(actors.student,1),[]);
    assert.equal((await f.runner.tick()).reason,'idle');assert.equal(f.calls(),17);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_versions').get().n,1);
    f.signalWord();await f.runner.tick({maxSteps:90,maxMs:10000});assert.equal(f.calls(),17);assert.ok((await f.generation.list(actors.teacher)).every(job=>job.cycle===0));
  }finally{f.close();}
});
test('concurrent dispatchers and lost acknowledgements enqueue a package once across recreated services',async()=>{
  const f=await setup({d1:true});try{
    await f.enable();f.signalWord();let enqueues=0;const enqueue=f.generation.enqueuePackage.bind(f.generation);f.generation.enqueuePackage=async(...args)=>{enqueues++;return enqueue(...args);};
    await Promise.all([f.runner.dispatch(),f.make().dispatch()]);assert.equal(enqueues,1);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_generation_jobs').get().n,17);
    f.sql.exec("UPDATE qr_preparation_outbox SET state='running',lease_token='lost',lease_until=1,revision=revision+1 WHERE id=1");await f.make().dispatch();assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_generation_jobs').get().n,17);assert.equal((await f.runner.summary(actors.teacher)).rows[0].state,'done');
  }finally{f.close();}
});
test('dispatcher failures are bounded, audits are immutable and reconciliation recovers events missed while off',async()=>{
  const f=await setup();try{
    await f.enable();f.signalWord();f.generation.enqueuePackage=async()=>{throw Error('PRIVATE failure');};
    for(let n=0;n<3;n++){await f.runner.dispatch();f.advance(5000);}assert.equal((await f.runner.summary(actors.teacher)).rows[0].state,'attention');assert.equal(await f.runner.dispatch(),false);
    const page=await f.runner.history(actors.teacher,1,{limit:1});assert.ok(page.next);assert.equal(typeof page.events[0].changedAt,'number');assert.ok(!JSON.stringify(page).includes('PRIVATE'));assert.throws(()=>f.sql.exec('UPDATE qr_dispatch_events SET issue=\'rewrite\''),/immutable/);
    for(const actor of [actors.student,{...actors.teacher,revoked:true}]){await assert.rejects(f.runner.summary(actor),error=>error.status===403);await assert.rejects(f.runner.history(actor,1),error=>error.status===403);}
    await assert.rejects(f.runner.configure(actors.teacher,body({expectedRevision:2,enabled:false,reason:'Not permitted.'})),error=>error.status===403);
    const current=await f.runner.settings(actors.dev);await f.runner.configure(actors.dev,body({expectedRevision:current.revision,enabled:false,reason:'Pause.'}));f.addCard();await f.insertWord();await f.enable();
    await f.runner.reconcile(actors.dev,{limit:100});assert.ok((await f.runner.summary(actors.teacher)).rows.some(row=>row.cardId===5));assert.equal(f.calls(),0);
  }finally{f.close();}
});
test('off, denied and revoked workers cannot dispatch; deadlines abort started generation and discard late output',async()=>{
  const denied=await setup({authorize:async()=>false});try{await denied.enable();denied.signalWord();assert.equal((await denied.runner.tick()).reason,'denied');assert.equal(denied.calls(),0);}finally{denied.close();}
  const f=await setup({generate:({signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new GenerationIssue('cancelled',false)),{once:true}))});try{
    assert.equal((await f.runner.tick()).reason,'off');await f.enable();f.signalWord();const result=await f.runner.tick({maxSteps:3,maxMs:15});assert.equal(result.reason,'deadline');await Promise.allSettled([...f.runner.running]);assert.equal((await f.generation.list(actors.teacher)).filter(row=>row.issue==='cancelled').length,1);
    f.revoke();assert.equal((await f.runner.tick()).reason,'denied');
  }finally{f.close();}
});
test('authenticated preparation inspection is read-only; no public tick or implicit scheduler activation exists',async()=>{
  const f=await setup();try{
    const call=(path,actor=actors.teacher,payload)=>learningWorkbenchAPI(new Request('https://test.invalid/api/learning-workbench'+path,{method:payload?'POST':'GET',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})}),{actor,services:{preparation:f.runner},writable:true});
    const before=f.sql.prepare('SELECT total_changes() AS n').get().n;assert.equal((await call('/preparation')).status,200);assert.equal(f.sql.prepare('SELECT total_changes() AS n').get().n,before);await assert.rejects(call('/preparation',actors.student),error=>error.status===403);await assert.rejects(call('/preparation/tick',actors.dev,{}),error=>error.status===404);
    let opened=0;const scheduled=createPreparationScheduled({openRunner:async()=>{opened++;return f.runner;}});assert.equal((await scheduled({},{})).reason,'off');assert.equal(opened,0);
    const active=createPreparationScheduled({enabled:true,openRunner:async()=>{opened++;return f.runner;}}),env={LEARNING_PREPARATION_ENABLED:'true',LEARNING_WORKBENCH_ENABLED:'true',LEARNING_WORKBENCH_WRITES:'true',STAGE_WRITES:'true'};let pending;
    assert.equal((await active({}, {...env,ACCOUNT_TRANSFER_FROZEN:'true'})).reason,'off');assert.equal(opened,0);assert.equal((await active({},env,{waitUntil:promise=>{pending=promise;}})).reason,'off');await pending;assert.equal(opened,1);
  }finally{f.close();}
});
test('a closed SQLite outbox recovers an expired lease without duplicating persisted package jobs',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'lumiscia-dispatch-')),filename=join(directory,'learning.sqlite');let sql,f;
  try{
    f=await setup({filename});await f.enable();f.signalWord();await f.runner.dispatch();f.sql.exec("UPDATE qr_preparation_outbox SET state='running',lease_token='interrupted',lease_until=1,revision=revision+1 WHERE id=1");f.close();f=null;
    sql=new DatabaseSync(filename);const db={read:async(query,args=[])=>sql.prepare(query).all(...args),atomic:async commands=>{sql.exec('BEGIN IMMEDIATE');try{for(const command of commands)sql.prepare(command.sql).run(...command.args.map(arg=>arg.type==='null'?null:['integer','float'].includes(arg.type)?Number(arg.value):arg.value));sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
    const review=new QuizReviewService(db,{extendedLifecycle:true}),resolveActor=async()=>actors.dev,now=()=>10000;
    const generation=new QuizGenerationService({review,worker:actors.dev,resolveActor,generate:async()=>{throw Error('No inference.');},preparation:new QuizGenerationContext({review}),now});
    const pipeline=new QuizPreparationPipeline({review,independent:new StoredQuizIndependentReview(review),worker:actors.dev,resolveActor,now});
    const runner=new QuizPreparationRunner({review,generation,pipeline,workerId:actors.dev.id,resolveActor,authorize:async()=>true,now});await runner.dispatch();
    assert.equal((await runner.summary(actors.teacher)).rows[0].state,'done');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM qr_generation_jobs').get().n,17);assert.ok((await runner.history(actors.teacher,1)).events.some(event=>event.state==='running'));
  }finally{f?.close();sql?.close();rmSync(directory,{recursive:true,force:true});}
});
test('workbench composition accepts only its own trusted runner and does not initialize or enable background work',async()=>{
  const f=await setup();try{
    const before=f.sql.prepare('SELECT total_changes() AS n').get().n;
    const openPreparation=async({review})=>{
      const resolveActor=async()=>actors.dev,generation=new QuizGenerationService({review,worker:actors.dev,resolveActor,generate:async()=>{throw Error('No inference.');},preparation:new QuizGenerationContext({review})});
      const pipeline=new QuizPreparationPipeline({review,independent:new StoredQuizIndependentReview(review),worker:actors.dev,resolveActor});
      return {generation,availability:async()=>({enabled:false,remaining:0}),runner:new QuizPreparationRunner({review,generation,pipeline,workerId:actors.dev.id,resolveActor})};
    };
    const base={inspect:async()=>{throw Error('No media.');}},services=await createLearningWorkbenchFactory({...base,openPreparation})({db:f.db,actor:actors.teacher});assert.ok(services.preparation instanceof QuizPreparationRunner);assert.equal(f.sql.prepare('SELECT total_changes() AS n').get().n,before);
    await assert.rejects(createLearningWorkbenchFactory({...base,openPreparation:async context=>({...await openPreparation(context),runner:f.runner})})({db:f.db,actor:actors.teacher}),error=>error.status===503);
  }finally{f.close();}
});
test('an explicit new retry cycle captures fresh context instead of reusing an unpublishable candidate',async()=>{
  const f=await setup();try{
    const create=f.service.createGeneratedDraft.bind(f.service);f.service.createGeneratedDraft=async()=>{throw new StudyError(409,'Simulated conflict.');};
    await f.generation.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Gap']}));await f.generation.runOne();const [job]=await f.generation.list(actors.teacher);assert.equal(job.state,'review');assert.equal(f.calls(),1);
    f.service.createGeneratedDraft=create;await f.generation.retry(actors.teacher,job.id,body({expectedRevision:job.revision}));await f.generation.runOne();assert.equal((await f.generation.list(actors.teacher))[0].state,'submitted');assert.equal(f.calls(),2);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_generation_contexts').get().n,2);
  }finally{f.close();}
});
