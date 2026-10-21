import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
test('synthetic worker follows stored Off/model selections without resetting quota or rewriting prior candidates',async()=>{
  const {server,url}=await createQuizReviewPreview({requestLimit:2});
  const get=async(path,role='teacher')=>{const response=await fetch(url+path,{headers:{Cookie:'qr-preview='+role}});assert.equal(response.status,200);return response.json();};
  const post=async(path,data,role='teacher')=>{
    const response=await fetch(url+path,{method:'POST',headers:{Origin:url,'Content-Type':'application/json',Cookie:'qr-preview='+role},body:JSON.stringify({mutationId:crypto.randomUUID(),...data})});
    assert.ok(response.ok,await response.clone().text());return response.json();
  };
  const terminal=async type=>{
    for(let i=0;i<100;i++){const {jobs}=await get('/local/generation'),job=jobs.find(row=>row.type===type);if(job&&!['queued','running','retry'].includes(job.state))return job;await new Promise(resolve=>setTimeout(resolve,30));}
    assert.fail('Synthetic worker did not reach a terminal state.');
  };
  try{
    const {contexts}=await get('/local/boot'),c=contexts[0],enqueue=type=>post('/local/generation',{groupId:c.groupId,lessonId:c.lessonId,cardId:c.cardId,senseId:c.senseId,types:[type]});
    const configure=async(adapterId,expectedRevision)=>post('/local/providers',{expectedRevision,selections:{generation:adapterId?{adapterId,locale:'en-US',mode:'text'}:null},reason:'Verify synthetic worker settings.'},'dev');
    await enqueue('Type');const blocked=await terminal('Type');assert.equal(blocked.issue,'provider_not_configured');assert.equal(blocked.attempts,1);assert.equal((await get('/local/quota','dev')).used,0);
    await configure('local-fixture-a',1);await post('/local/generation/'+blocked.id+'/retry',{expectedRevision:blocked.revision});
    const first=await terminal('Type');assert.equal(first.state,'submitted');const firstQuiz=(await get('/local/quizzes/'+first.versionId)).quiz;
    assert.equal(firstQuiz.generation.source.model,'local-fixture-a');assert.equal(firstQuiz.generation.source.configurationRevision,2);
    await configure('local-fixture-b',2);await enqueue('Reverse');const second=await terminal('Reverse');assert.equal(second.state,'submitted');
    const secondQuiz=(await get('/local/quizzes/'+second.versionId)).quiz;assert.equal(secondQuiz.generation.source.model,'local-fixture-b');assert.equal(secondQuiz.generation.source.configurationRevision,3);
    await configure(null,3);await enqueue('Spell');assert.equal((await terminal('Spell')).issue,'provider_not_configured');assert.equal((await get('/local/quota','dev')).used,2);
    await post('/local/quizzes/'+firstQuiz.id+'/approve',{expectedRevision:firstQuiz.revision,checks:{meaning:true,answers:true,level:true}});
    assert.deepEqual((await get('/local/quizzes/'+firstQuiz.id)).quiz.generation,firstQuiz.generation);
    await configure('local-fixture-a',4);await enqueue('Letters');const exhausted=await terminal('Letters');assert.equal(exhausted.issue,'quota_exceeded');assert.equal(exhausted.attempts,1);
    assert.equal((await get('/local/quota','dev')).used,2);const {reservations}=await get('/local/quota/history','dev');assert.deepEqual(new Set(reservations.map(r=>r.source.model)),new Set(['local-fixture-a','local-fixture-b']));
    const attempts=(await get('/local/generation/'+second.id+'/attempts')).attempts;assert.equal(attempts[0].source.model,'local-fixture-b');assert.equal(attempts[0].state,'accepted');
  }finally{await new Promise(resolve=>server.close(resolve));}
});
