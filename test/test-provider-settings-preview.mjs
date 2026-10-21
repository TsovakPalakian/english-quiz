import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
test('local provider settings default off and enforce developer rights, CSRF, CAS, replay and audit without generation',async()=>{
  const {server,url}=await createQuizReviewPreview();
  const get=(path,role='dev')=>fetch(url+path,{headers:{Cookie:'qr-preview='+role}});
  const post=(data,role='dev',origin=url)=>fetch(url+'/local/providers',{method:'POST',headers:{Cookie:'qr-preview='+role,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
  try{
    const initial=await (await get('/local/providers')).json();assert.equal(initial.revision,1);assert.ok(Object.values(initial.selections).every(v=>v===null));assert.equal(initial.adapters.length,4);
    const data={mutationId:crypto.randomUUID(),expectedRevision:1,selections:{generation:{adapterId:initial.adapters[0].id,locale:'en-US',mode:'text'}},reason:'Choose the synthetic test model.'};
    for(const role of ['student','teacher','outsider']){
      for(const path of ['/local/providers','/local/providers/history'])assert.equal((await get(path,role)).status,403);
      assert.equal((await post(data,role)).status,403);
    }
    assert.equal((await post(data,'dev','https://other.invalid')).status,403);
    assert.equal((await post({...data,endpoint:'http://private'})).status,400);
    assert.equal((await post(data)).status,200);assert.equal((await post(data)).status,200);
    assert.equal((await post({...data,mutationId:crypto.randomUUID()})).status,409);
    const saved=await (await get('/local/providers')).json();assert.equal(saved.revision,2);assert.deepEqual(saved.selections.generation,data.selections.generation);
    const history=await (await get('/local/providers/history')).json();assert.equal(history.changes.length,1);assert.equal(history.changes[0].reason,data.reason);assert.equal(history.changes[0].adapters.generation.model,initial.adapters[0].model);
    assert.equal((await get('/local/providers/history?before=bad')).status,400);
    assert.equal((await (await get('/local/generation')).json()).jobs.length,0);assert.equal((await (await get('/local/quota')).json()).used,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
