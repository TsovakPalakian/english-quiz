import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
test('local preview enforces its synthetic quota and keeps budget details developer-only',async()=>{
  const {server,url}=await createQuizReviewPreview({requestLimit:1});
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
