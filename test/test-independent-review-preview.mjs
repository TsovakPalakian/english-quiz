import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
test('synthetic review HTTP follows stored selections, Off, roles, revisions, replay and paginated history',async()=>{
  const {server,url}=await createQuizReviewPreview();
  const get=async(path,role='teacher')=>fetch(url+path,{headers:{Cookie:'qr-preview='+role}});
  const post=async(path,data,role='teacher',origin=url)=>fetch(url+path,{method:'POST',headers:{Origin:origin,Cookie:'qr-preview='+role,'Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),...data})});
  const select=async adapterId=>{
    const settings=await(await get('/local/providers','dev')).json();
    assert.equal((await post('/local/providers',{expectedRevision:settings.revision,selections:{review:adapterId?{adapterId,locale:'en-US',mode:'text'}:null},reason:'Synthetic review integration test.'},'dev')).status,200);
  };
  try{
    const {quizzes}=await(await get('/local/queue')).json(),quiz=quizzes.find(q=>q.type==='Choice');
    const endpoint='/local/quizzes/'+quiz.id+'/independent',request={expectedRevision:quiz.revision,level:'A1'};
    for(const role of ['student','other']){assert.equal((await get(endpoint,role)).status,403);assert.equal((await post(endpoint,request,role)).status,403);}
    assert.equal((await post(endpoint,request,'teacher','https://other.invalid')).status,403);
    assert.equal((await post(endpoint,{...request,approved:true})).status,400);
    assert.equal((await get(endpoint+'?before=bad')).status,400);
    assert.equal((await get(endpoint+'?level=A1&level=A2')).status,400);
    const off=await(await post(endpoint,request)).json();assert.equal(off.error,'review_not_configured');assert.equal(off.result,null);
    const retryEndpoint=endpoint+'/'+off.id+'/retry';
    assert.equal((await post(retryEndpoint,{expectedRevision:quiz.revision},'student')).status,403);
    assert.equal((await post(retryEndpoint,{expectedRevision:quiz.revision},'teacher','https://other.invalid')).status,403);
    assert.equal((await post(retryEndpoint,{...request})).status,400);
    await select('local-checker-a');
    const operation={expectedRevision:quiz.revision,mutationId:crypto.randomUUID()};
    const first=await(await post(retryEndpoint,operation)).json();assert.equal(first.current,true);assert.equal(first.result.status,'incomplete');assert.equal(first.retryOf,off.id);
    assert.equal(first.result.findings[0].dimension,'ambiguity');assert.equal(first.result.source.model,'local-checker-a');
    assert.equal((await(await post(retryEndpoint,operation)).json()).id,first.id);
    assert.equal((await post(retryEndpoint,{expectedRevision:quiz.revision})).status,409);
    await select('local-checker-b');const second=await(await post(endpoint,request,'outsider')).json();assert.equal(second.result.source.model,'local-checker-b');
    await select(null);const disabled=await(await post(endpoint,request)).json();assert.equal(disabled.state,'failed');
    const page=await(await get(endpoint+'?limit=2&level=A1','outsider')).json();assert.equal(page.attempts.length,2);assert.ok(page.next);
    const older=await(await get(endpoint+'?before='+page.next+'&level=A1','dev')).json();assert.equal(older.attempts.length,2);assert.equal(older.next,null);
    assert.equal(older.attempts[0].result.source.model,'local-checker-a');
    assert.equal((await(await get('/local/quota','dev')).json()).used,2);
    assert.equal((await(await get('/local/quizzes/'+quiz.id)).json()).quiz.state,'submitted');
    assert.equal((await(await get('/local/shared/1')).json()).quizzes.length,1);
    await post('/local/quizzes/'+quiz.id+'/return',{expectedRevision:quiz.revision,comment:'Please revise.'});
    const stale=await(await get(endpoint+'?level=A1')).json();assert.ok(stale.attempts.every(a=>!a.current));
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('review quota summary is teacher-safe, shared with generation, and exhaustion survives replay and model switches',async()=>{
  const {server,url}=await createQuizReviewPreview({requestLimit:2});
  const get=async(path,role='teacher')=>fetch(url+path,{headers:{Cookie:'qr-preview='+role}});
  const post=async(path,data,role='teacher')=>fetch(url+path,{method:'POST',headers:{Origin:url,Cookie:'qr-preview='+role,'Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),...data})});
  const terminal=async type=>{
    for(let n=0;n<100;n++){const {jobs}=await(await get('/local/generation')).json(),job=jobs.find(row=>row.type===type);if(job&&!['queued','running','retry'].includes(job.state))return job;await new Promise(resolve=>setTimeout(resolve,25));}
    assert.fail('Generation did not finish.');
  };
  try{
    for(const role of ['student','other'])assert.equal((await get('/local/review-quota',role)).status,403);
    const initial=await(await get('/local/review-quota','outsider')).json();assert.deepEqual(Object.keys(initial).sort(),['provider','remaining','requestLimit','used','windowEnd'].sort());
    await post('/local/providers',{expectedRevision:1,selections:{generation:{adapterId:'local-fixture-a',locale:'en-US',mode:'text'},review:{adapterId:'local-checker-a',locale:'en-US',mode:'text'}},reason:'Share the synthetic provider limit.'},'dev');
    const {contexts}=await(await get('/local/boot')).json(),c=contexts[0];
    const enqueue=type=>post('/local/generation',{groupId:c.groupId,lessonId:c.lessonId,cardId:c.cardId,senseId:c.senseId,types:[type]});
    await enqueue('Type');assert.equal((await terminal('Type')).state,'submitted');
    const {quizzes}=await(await get('/local/queue')).json(),quiz=quizzes.find(row=>row.type==='Choice'),endpoint='/local/quizzes/'+quiz.id+'/independent';
    const operation={expectedRevision:quiz.revision,level:null,mutationId:crypto.randomUUID()};
    const first=await(await post(endpoint,operation)).json();assert.equal(first.state,'completed');
    assert.equal((await(await post(endpoint,operation)).json()).id,first.id);
    await post('/local/providers',{expectedRevision:2,selections:{review:{adapterId:'local-checker-b',locale:'en-US',mode:'text'}},reason:'Switch without resetting the quota.'},'dev');
    const blocked=await(await post(endpoint,{expectedRevision:quiz.revision})).json();assert.equal(blocked.error,'quota_exceeded');assert.equal(blocked.result,null);
    await enqueue('Reverse');const stopped=await terminal('Reverse');assert.equal(stopped.issue,'quota_exceeded');assert.equal(stopped.attempts,1);
    const full=await(await get('/local/review-quota')).json();assert.equal(full.used,2);assert.equal(full.remaining,0);assert.equal(full.windowEnd,initial.windowEnd);
    const change={mutationId:crypto.randomUUID(),expectedRevision:1,requestLimit:3,reason:'Permit one reviewed retry.'};
    assert.equal((await post('/local/quota',change,'teacher')).status,403);assert.equal((await post('/local/quota',change,'dev')).status,200);assert.equal((await post('/local/quota',change,'dev')).status,200);
    const retried=await(await post(endpoint+'/'+blocked.id+'/retry',{expectedRevision:quiz.revision},'outsider')).json();assert.equal(retried.state,'completed');assert.equal(retried.result.source.model,'local-checker-b');
    assert.equal((await(await get('/local/review-quota')).json()).used,3);
    const audit=await(await get('/local/quota/history','dev')).json();assert.equal(audit.reservations.length,3);assert.deepEqual(new Set(audit.reservations.map(row=>row.source.task)),new Set(['generation','review']));
    assert.equal((await get('/local/quota/history','teacher')).status,403);assert.equal((await get('/local/quota/changes','teacher')).status,403);
    assert.equal((await(await get('/local/shared/1')).json()).quizzes.length,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
