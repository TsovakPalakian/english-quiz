import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors,body,content} from './quiz-review-fixture.mjs';
import {QuizGenerationService,GenerationIssue} from '../src/quiz-generation.mjs';
import {StudyError} from '../src/learning-study.mjs';
async function setup(generate=async()=>content,options={}){
  const f=await fixture(options);f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/002_generation_jobs.sql',import.meta.url),'utf8'));
  let time=10000;const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async id=>Object.values(actors).find(a=>a.id===id),generate,now:()=>time,timeoutMs:30,leaseMs:100,backoffMs:10});
  const enqueue=(types=['Gap'],actor=actors.teacher)=>generation.enqueue(actor,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types}));
  return {...f,generation,enqueue,advance:n=>{time+=n;}};
}
test('preparation deduplicates tasks, preserves manual drafts and submits automatic content for review only',async()=>{
  let calls=0;const f=await setup(async()=>{calls++;return content;});try{
    const manual=await f.draft(),first=await f.enqueue();assert.deepEqual((await f.enqueue()).ids,first.ids);
    assert.equal(await f.generation.runOne(),true);assert.equal(await f.generation.runOne(),false);assert.equal(calls,1);
    const [job]=await f.generation.list(actors.teacher);assert.equal(job.state,'submitted');assert.equal(job.attempts,1);
    const q=await f.service.get(actors.teacher,job.versionId);assert.equal(q.author.kind,'automatic');assert.equal(q.author.name,'Automatic generator');assert.equal(q.reviewer,null);
    assert.equal((await f.service.get(actors.student,manual.id)).state,'draft');assert.deepEqual(await f.service.sharedForCard(actors.teacher,1),[]);
  }finally{f.close();}
});
test('invalid content retries three times, then creates a review issue, never an invalid quiz',async()=>{
  const f=await setup(async()=>({explanation:'Invalid',items:[{shown:'No blank',answer:'drizzle'}]}));try{
    await f.enqueue();for(let i=0;i<3;i++){await f.generation.runOne();f.advance(100);}
    const [job]=await f.generation.list(actors.teacher);assert.equal(job.state,'review');assert.equal(job.attempts,3);assert.equal(job.issue,'invalid_content');
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,0);
    assert.equal(await f.generation.runOne(),false);
  }finally{f.close();}
});
test('temporary errors back off and recover; permanent problems and word-set types do not loop',async()=>{
  const f=await setup(async({attempt,type})=>{if(type==='Listen')throw new GenerationIssue('audio_unavailable',false);if(attempt===1)throw new GenerationIssue('temporary_failure');return content;});try{
    await f.enqueue(['Gap','Listen','Match']);
    for(let i=0;i<6;i++){await f.generation.runOne();f.advance(100);}
    const jobs=await f.generation.list(actors.teacher);
    assert.equal(jobs.find(j=>j.type==='Gap').state,'submitted');assert.equal(jobs.find(j=>j.type==='Gap').attempts,2);
    assert.equal(jobs.find(j=>j.type==='Listen').state,'review');assert.equal(jobs.find(j=>j.type==='Listen').attempts,1);
    assert.equal(jobs.find(j=>j.type==='Match').state,'context');assert.equal(jobs.find(j=>j.type==='Match').attempts,0);
  }finally{f.close();}
});
test('manual retries have a hard cycle cap and use current revisions',async()=>{
  const f=await setup(async()=>{throw new GenerationIssue('audio_unavailable',false);});try{
    await f.enqueue(['Listen']);for(let i=0;i<3;i++){
      await f.generation.runOne();const [job]=await f.generation.list(actors.teacher);
      if(i<2){await assert.rejects(f.generation.retry(actors.teacher,job.id,body({expectedRevision:1})),e=>e.status===409);await f.generation.retry(actors.teacher,job.id,body({expectedRevision:job.revision}));}
      else await assert.rejects(f.generation.retry(actors.teacher,job.id,body({expectedRevision:job.revision})),e=>e.status===409);
    }
  }finally{f.close();}
});
test('parallel workers claim one task once and an expired lease is recoverable',async()=>{
  let calls=0;const f=await setup(async()=>{calls++;return content;});try{
    const {ids}=await f.enqueue();await Promise.all([f.generation.runOne(),f.generation.runOne()]);assert.equal(calls,1);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,1);
    f.sql.prepare("UPDATE qr_generation_jobs SET state='running',lease_until=9999,lease_token='abandoned',candidate_json=?,version_id=NULL WHERE id=?").run(JSON.stringify(content),ids[0]);
    await f.generation.runOne();assert.equal(calls,1);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,1,'Saved candidate and mutation receipt prevent duplicate versions');
    assert.equal((await f.generation.list(actors.teacher))[0].state,'submitted');
  }finally{f.close();}
});
test('timeout aborts the generator and revocation prevents subsequent generation',async()=>{
  let aborted=false;const f=await setup(({signal})=>new Promise(()=>{signal.addEventListener('abort',()=>aborted=true);}));try{
    await f.enqueue();await f.generation.runOne();assert.equal(aborted,true);assert.equal((await f.generation.list(actors.teacher))[0].issue,'timeout');
    f.sql.exec("UPDATE catalog_documents SET value_json='{\"teacherIds\":[]}' WHERE namespace='accounts-group-teachers' AND key='1'");f.advance(100);await f.generation.runOne();
    assert.deepEqual(await f.generation.list(actors.teacher),[]);
    assert.equal((await f.generation.list(actors.dev))[0].issue,'access_changed');assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,0);
  }finally{f.close();}
});
test('students and unrelated teachers cannot enqueue or inspect jobs; approved types are skipped',async()=>{
  const f=await setup();try{
    for(const actor of [actors.student,actors.outsider])await assert.rejects(f.enqueue(['Gap'],actor),e=>e.status===403);
    const {ids}=await f.enqueue();const result=await f.service.createDraft(actors.student,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,type:'Gap',content}));
    await f.service.submit(actors.student,result.id,body({expectedRevision:1}));await f.service.approve(actors.teacher,result.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true}}));
    await f.generation.runOne();const [job]=await f.generation.list(actors.teacher);assert.equal(job.id,ids[0]);assert.equal(job.state,'skipped');assert.equal(job.attempts,0);
    await assert.rejects(f.generation.list(actors.student),e=>e.status===403);
  }finally{f.close();}
});
test('generation works through D1 compilation and leaves existing quizzes unchanged',async()=>{
  const f=await setup(async()=>content,{d1:true});try{
    const old=JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all());await f.enqueue();await f.generation.runOne();
    assert.equal((await f.generation.list(actors.teacher))[0].state,'submitted');assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all()),old);
    assert.deepEqual(f.sql.prepare("SELECT name FROM sqlite_master WHERE name LIKE '_study_batch_%'").all(),[]);
  }finally{f.close();}
});
test('cached invalid content is discarded and an owned write conflict stops for review',async()=>{
  const f=await setup();try{
    const {ids}=await f.enqueue();f.sql.prepare('UPDATE qr_generation_jobs SET attempts=1,candidate_json=? WHERE id=?').run(JSON.stringify({explanation:'bad',items:[{shown:'no blank',answer:'x'}]}),ids[0]);
    await f.generation.runOne();assert.equal(f.sql.prepare('SELECT candidate_json FROM qr_generation_jobs').get().candidate_json,null);
    f.advance(100);f.service.createGeneratedDraft=async()=>{throw new StudyError(409,'Conflict');};
    await f.generation.runOne();const [job]=await f.generation.list(actors.teacher);assert.equal(job.state,'review');assert.equal(job.issue,'write_conflict');assert.equal(await f.generation.runOne(),false);
  }finally{f.close();}
});
