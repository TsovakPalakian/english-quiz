import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
test('pipeline HTTP is explicitly enabled, respects quota and roles, and never auto-approves',async()=>{
  const {server,url}=await createQuizReviewPreview({requestLimit:3});
  const get=async(path,role='teacher')=>fetch(url+path,{headers:{Cookie:'qr-preview='+role}});
  const post=async(path,data,role='dev',origin=url)=>fetch(url+path,{method:'POST',headers:{Origin:origin,Cookie:'qr-preview='+role,'Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),...data})});
  const until=async predicate=>{for(let n=0;n<150;n++){const data=await(await get('/local/pipeline')).json();if(predicate(data))return data;await new Promise(resolve=>setTimeout(resolve,25));}assert.fail('Pipeline did not finish.');};
  try{
    const initial=await(await get('/local/pipeline')).json();assert.equal(initial.enabled,false);assert.deepEqual(initial.jobs,[]);
    const setting={mutationId:crypto.randomUUID(),expectedRevision:1,enabled:true,reason:'Enable the local preparation chain.'};
    for(const role of ['student','teacher','outsider'])assert.equal((await post('/local/pipeline',setting,role)).status,403);
    assert.equal((await get('/local/pipeline','student')).status,403);assert.equal((await post('/local/pipeline',setting,'dev','https://other.invalid')).status,403);
    await post('/local/providers',{expectedRevision:1,selections:{generation:{adapterId:'local-fixture-a',locale:'en-US',mode:'text'},review:{adapterId:'local-checker-a',locale:'en-US',mode:'text'}},reason:'Use synthetic models.'});
    const {contexts}=await(await get('/local/boot')).json(),c=contexts[0];
    const enqueue=type=>post('/local/generation',{groupId:c.groupId,lessonId:c.lessonId,cardId:c.cardId,senseId:c.senseId,types:[type]},'teacher');
    await enqueue('Type');
    for(let n=0;n<100;n++){const {jobs}=await(await get('/local/generation')).json();if(jobs.some(job=>job.state==='submitted'))break;await new Promise(resolve=>setTimeout(resolve,25));}
    assert.equal((await(await get('/local/pipeline')).json()).jobs.length,0);
    assert.equal((await post('/local/pipeline',setting)).status,200);assert.equal((await post('/local/pipeline',setting)).status,200);
    const done=await until(data=>data.jobs.some(job=>job.state==='teacher_review'));const first=done.jobs[0];
    assert.equal((await(await get('/local/quizzes/'+first.versionId)).json()).quiz.state,'submitted');
    const historyPath='/local/pipeline/'+first.id+'/history';assert.equal((await get(historyPath,'student')).status,403);
    const history=await(await get(historyPath,'outsider')).json();assert.equal(history.events.length,3);assert.equal((await get(historyPath+'?before=bad')).status,400);
    await enqueue('Reverse');const blocked=await until(data=>data.jobs.some(job=>job.type==='Reverse'&&job.state==='attention'));
    assert.equal(blocked.jobs.find(job=>job.type==='Reverse').issue,'quota_exceeded');
    assert.equal((await(await get('/local/quota','dev')).json()).used,3);
    await new Promise(resolve=>setTimeout(resolve,250));assert.equal((await(await get('/local/quota','dev')).json()).used,3);
    assert.equal((await(await get('/local/shared/1')).json()).quizzes.length,1);
    assert.equal((await post('/local/pipeline',{expectedRevision:1,enabled:false,reason:'Stale settings.'})).status,409);
    await post('/local/pipeline',{expectedRevision:2,enabled:false,reason:'Pause the chain.'});assert.equal((await(await get('/local/pipeline')).json()).enabled,false);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
