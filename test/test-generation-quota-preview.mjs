import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
test('local preview enforces its synthetic quota and keeps budget details developer-only',async()=>{
  const {server,url}=await createQuizReviewPreview({requestLimit:1,generationEnabled:true});
  const get=(path,role='teacher')=>fetch(url+path,{headers:{Cookie:'qr-preview='+role}});
  try{
    for(const role of ['student','teacher','outsider'])for(const path of ['/local/quota','/local/quota/history'])assert.equal((await get(path,role)).status,403);
    assert.equal((await get('/local/quota/history?cursor=invalid','dev')).status,400);
    assert.equal((await get('/local/quota/history?cursor=a&cursor=b','dev')).status,400);
    assert.equal((await (await get('/local/quota','dev')).json()).remaining,1);
    const {contexts}=await (await get('/local/boot')).json(),context=contexts[0];
    const response=await fetch(url+'/local/generation',{method:'POST',headers:{Origin:url,'Content-Type':'application/json',Cookie:'qr-preview=outsider'},body:JSON.stringify({mutationId:crypto.randomUUID(),groupId:context.groupId,lessonId:context.lessonId,cardId:context.cardId,senseId:context.senseId,types:['Type','Reverse']})});
    assert.equal(response.status,202);let jobs=[];
    for(let i=0;i<50;i++){
      jobs=(await (await get('/local/generation')).json()).jobs;
      if(jobs.length===2&&jobs.every(j=>['submitted','review'].includes(j.state)))break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(jobs.filter(j=>j.state==='submitted').length,1);
    assert.equal(jobs.filter(j=>j.issue==='quota_exceeded'&&j.attempts===1).length,1);
    const quota=await (await get('/local/quota','dev')).json();assert.equal(quota.used,1);assert.equal(quota.remaining,0);
    const history=await (await get('/local/quota/history','dev')).json();assert.equal(history.reservations.length,1);assert.equal(history.reservations[0].state,'started');assert.equal(history.next,null);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('local limit updates enforce roles, CSRF, exact fields, revision conflicts and immutable audit',async()=>{
  const {server,url}=await createQuizReviewPreview({requestLimit:3});
  const get=path=>fetch(url+path,{headers:{Cookie:'qr-preview=dev'}});
  const post=(data,role='dev',origin=url)=>fetch(url+'/local/quota',{method:'POST',headers:{Cookie:'qr-preview='+role,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
  try{
    const data={mutationId:crypto.randomUUID(),expectedRevision:1,requestLimit:2,reason:'Lower after review.'};
    for(const role of ['student','teacher','outsider'])assert.equal((await post(data,role)).status,403);
    assert.equal((await post(data,'dev','https://other.invalid')).status,403);
    assert.equal((await post({...data,windowMs:1000})).status,400);
    const response=await post(data);assert.equal(response.status,200);assert.deepEqual(await response.json(),{revision:2,requestLimit:2});
    assert.equal((await post(data)).status,200);
    assert.equal((await post({...data,mutationId:crypto.randomUUID(),requestLimit:4})).status,409);
    const summary=await (await get('/local/quota')).json();assert.equal(summary.requestLimit,2);assert.equal(summary.revision,2);assert.equal(summary.used,0);
    const history=await (await get('/local/quota/changes')).json();assert.equal(history.changes.length,1);assert.equal(history.changes[0].reason,data.reason);assert.equal(history.changes[0].oldLimit,3);
    assert.equal((await get('/local/quota/changes?before=invalid')).status,400);
    for(const role of ['student','teacher','outsider'])assert.equal((await fetch(url+'/local/quota/changes',{headers:{Cookie:'qr-preview='+role}})).status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
