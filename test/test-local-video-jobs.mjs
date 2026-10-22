import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalWorkbench,actors} from '../ops/local-workbench-services.mjs';
import {createLocalVideoJobs} from '../ops/local-video-jobs.mjs';
import {fakeMp4} from './quiz-media-fixture.mjs';
const inspect=async()=>({kind:'video',duration:1,width:320,height:180});
const rejected=(work,status)=>assert.rejects(Promise.resolve().then(work),error=>error.status===status);
test('local video jobs enforce Off, staff, mutation replay, cancellation, quotas and bounded retry',async()=>{
  const local=await createLocalWorkbench({inspect});let now=Date.now();const video=createLocalVideoJobs(local,{dailyLimit:2,now:()=>now});
  try{
    const context={groupId:1,lessonId:1,cardId:1,senseId:local.senseId},create=()=>video.create(actors.teacher,{mutationId:crypto.randomUUID(),...context});
    await rejected(()=>video.list(actors.student),403);await rejected(create,409);
    await rejected(()=>video.configure(actors.teacher,{provider:'local-fixture',expectedRevision:1}),403);
    video.configure(actors.dev,{provider:'local-fixture',expectedRevision:1});
    const body={mutationId:crypto.randomUUID(),...context},[a,b]=await Promise.all([video.create(actors.teacher,body),video.create(actors.teacher,body)]);assert.equal(a.id,b.id);
    await rejected(()=>video.create(actors.teacher,{...body,cardId:2}),409);
    const second=await create();await rejected(create,429);
    video.cancel(actors.teacher,second.id,{expectedRevision:1});await rejected(()=>video.start(actors.teacher,second.id,{expectedRevision:2}),409);
    const first=await video.start(actors.teacher,a.id,{expectedRevision:1});await rejected(()=>video.start(actors.second,a.id,{expectedRevision:first.revision}),403);
    now+=61000;assert.equal((await video.list(actors.teacher)).jobs.find(j=>j.id===a.id).state,'failed');
    const current=(await video.list(actors.teacher)).jobs.find(j=>j.id===a.id),retry=await video.start(actors.teacher,a.id,{expectedRevision:current.revision});video.failed(actors.teacher,a.id,{expectedRevision:retry.revision});
    const exhausted=(await video.list(actors.teacher));assert.equal(exhausted.quota.remaining,0);await rejected(()=>video.start(actors.teacher,a.id,{expectedRevision:5}),409);await rejected(create,429);
    video.configure(actors.dev,{provider:'off',expectedRevision:2});assert.equal((await video.list(actors.teacher)).provider,'off');
  }finally{await local.close();}
});
test('validated local clip enters teacher review, never shared automatically; cancelled jobs cannot finish',async()=>{
  const local=await createLocalWorkbench({inspect}),video=createLocalVideoJobs(local);
  try{
    video.configure(actors.dev,{provider:'local-fixture',expectedRevision:1});const context={groupId:1,lessonId:1,cardId:1,senseId:local.senseId};
    const job=await video.create(actors.teacher,{mutationId:crypto.randomUUID(),...context}),run=await video.start(actors.teacher,job.id,{expectedRevision:1});
    const result=await video.finish(actors.teacher,job.id,run.revision,fakeMp4);assert.equal(result.state,'submitted');
    const quiz=await local.services.review.get(actors.teacher,result.quizId);assert.equal(quiz.state,'submitted');assert.equal(quiz.author.kind,'automatic');assert.equal(quiz.type,'Video choice');
    assert.ok(!(await local.services.review.sharedForCard(actors.student,1)).some(row=>row.id===quiz.id));
    await rejected(()=>video.finish(actors.teacher,job.id,run.revision,fakeMp4),409);
    const other=await video.create(actors.teacher,{mutationId:crypto.randomUUID(),...context}),started=await video.start(actors.teacher,other.id,{expectedRevision:1});video.cancel(actors.teacher,other.id,{expectedRevision:started.revision});
    await rejected(()=>video.finish(actors.teacher,other.id,started.revision,fakeMp4),409);
    const changed=await video.create(actors.teacher,{mutationId:crypto.randomUUID(),...context});video.configure(actors.dev,{provider:'off',expectedRevision:2});assert.equal((await video.list(actors.teacher)).jobs.find(row=>row.id===changed.id).state,'cancelled');
  }finally{await local.close();}
});
