import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actors,body} from './quiz-review-fixture.mjs';
import {mediaFixture,wav} from './quiz-media-fixture.mjs';
import {QuizFeedbackDelivery,createFeedbackEmailTransport} from '../src/quiz-feedback-delivery.mjs';
const denied=(promise,status)=>assert.rejects(promise,error=>error.status===status);
async function setup({send=async()=>({messageId:'test-only-message'}),dailyLimit=20,timeoutMs=1000}={}){
  const f=await mediaFixture();f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/011_feedback_delivery.sql',import.meta.url),'utf8'));
  const messages=[],transport=createFeedbackEmailTransport({enabled:true,recipientVerified:true,policyRevision:'fixture-policy-v1',binding:{send:async message=>{messages.push(message);return send(message);}}});
  let now=Date.now();const delivery=new QuizFeedbackDelivery(f.feedback,{transport,dailyLimit,timeoutMs,now:()=>now});
  const report=async(attachments=[])=>f.feedback.create(actors.student,body({cardId:1,senseId:f.senseId,versionId:null,category:'bug',description:'Synthetic test report.',attachments}));
  return {...f,delivery,transport,messages,report,advance:ms=>now+=ms};
}
test('email defaults off; saving a report never sends, consent and ownership are required',async()=>{
  const f=await setup();try{
    const report=await f.report();assert.equal(report.delivered,false);assert.equal(f.messages.length,0);
    await denied(new QuizFeedbackDelivery(f.feedback).send(actors.student,report.id,body({consent:true})),503);
    await denied(f.delivery.send(actors.student,report.id,body({consent:false})),400);
    await denied(f.delivery.send(actors.teacher,report.id,body({consent:true})),404);
    await denied(f.delivery.send({...actors.student,active:false},report.id,body({consent:true})),401);
    await denied(f.delivery.send(actors.student,report.id,body({consent:true,to:'other@example.org'})),400);
    assert.equal(f.messages.length,0);assert.equal((await f.delivery.status(actors.student,report.id)).state,'saved_locally');
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_feedback_delivery').get().n,0);
  }finally{f.close();}
});
test('fixed-recipient EMAIL contract includes exact private attachments; acceptance is not mailbox delivery',async()=>{
  const f=await setup();try{
    const asset=await f.upload(actors.student,'feedback','audio/wav',wav()),report=await f.report([asset.id]);
    const operation=body({consent:true}),state=await f.delivery.send(actors.student,report.id,operation);
    assert.equal(state.state,'accepted');assert.equal(state.accepted,true);assert.equal(state.delivered,false);assert.equal(state.messageId,'test-only-message');
    assert.equal(f.messages.length,1);const message=f.messages[0];assert.equal(message.to,'info@lumiscia.org');assert.equal(message.from.email,'noreply@lumiscia.org');assert.equal(message.attachments.length,1);
    assert.equal(message.attachments[0].type,'audio/wav');assert.equal(message.attachments[0].disposition,'attachment');assert.deepEqual(Buffer.from(message.attachments[0].content,'base64'),Buffer.from(wav()));assert.match(message.text,/Synthetic test report/);
    assert.equal((await f.delivery.send(actors.student,report.id,operation)).state,'accepted');await f.delivery.send(actors.student,report.id,body({consent:true}));assert.equal(f.messages.length,1);
    assert.throws(()=>f.sql.exec("UPDATE qr_feedback_delivery SET recipient='other@example.org'"),/immutable/);assert.throws(()=>f.sql.exec('DELETE FROM qr_feedback_delivery'),/immutable/);
  }finally{f.close();}
});
test('simultaneous sends claim once and a persisted deadline prevents restart or late-result resends',async()=>{
  let finish;const f=await setup({send:async()=>new Promise(resolve=>finish=resolve)});try{
    const report=await f.report(),first=f.delivery.send(actors.student,report.id,body({consent:true}));
    for(let n=0;n<100&&!finish;n++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(finish);
    assert.equal((await f.delivery.send(actors.student,report.id,body({consent:true}))).state,'started');assert.equal(f.messages.length,1);
    f.advance(1001);assert.equal((await f.delivery.status(actors.student,report.id)).state,'uncertain');
    const restarted=new QuizFeedbackDelivery(f.feedback,{transport:f.transport,now:()=>Date.now()+10000});
    assert.equal((await restarted.send(actors.student,report.id,body({consent:true}))).state,'uncertain');
    finish({messageId:'late-result'});assert.equal((await first).state,'uncertain');assert.equal(f.messages.length,1);
  }finally{f.close();}
});
test('two consent requests racing before the outbox insert still dispatch exactly once',async()=>{
  const f=await setup();try{
    const report=await f.report();const results=await Promise.all([f.delivery.send(actors.student,report.id,body({consent:true})),f.delivery.send(actors.student,report.id,body({consent:true}))]);
    assert.ok(results.every(result=>['queued','started','accepted'].includes(result.state)));assert.equal(f.messages.length,1);
    assert.equal((await f.delivery.status(actors.student,report.id)).state,'accepted');
    await denied(f.transport.send({to:'other@example.org',cc:'another@example.org'}),400);
  }finally{f.close();}
});
test('provider rejection, unknown failure and malformed acceptance are distinct and never retried automatically',async()=>{
  for(const [send,state,code] of [
    [async()=>{throw Object.assign(new Error('Do not expose provider data'),{code:'E_RECIPIENT_NOT_ALLOWED'});},'rejected','E_RECIPIENT_NOT_ALLOWED'],
    [async()=>{throw new Error('Private error details');},'uncertain','delivery_unknown'],
    [async()=>undefined,'uncertain','delivery_unknown'],
  ]){
    const f=await setup({send});try{
      const report=await f.report(),result=await f.delivery.send(actors.student,report.id,body({consent:true}));assert.equal(result.state,state);assert.equal(result.errorCode,code);assert.equal(result.delivered,false);
      await f.delivery.send(actors.student,report.id,body({consent:true}));assert.equal(f.messages.length,1);assert.doesNotMatch(JSON.stringify(result),/Private|provider data/);
    }finally{f.close();}
  }
});
test('timeout is uncertain even if the binding ignores cancellation; no implicit retry occurs',async()=>{
  const f=await setup({send:async()=>new Promise(()=>{}),timeoutMs:10});try{
    const report=await f.report();assert.equal((await f.delivery.send(actors.student,report.id,body({consent:true}))).state,'uncertain');
    assert.equal((await f.delivery.send(actors.student,report.id,body({consent:true}))).state,'uncertain');assert.equal(f.messages.length,1);
  }finally{f.close();}
});
test('missing and oversized attachments, revoked access and global daily cap fail without silently omitting files',async()=>{
  const f=await setup({dailyLimit:1});try{
    const asset=await f.upload(actors.student,'feedback','audio/wav',wav()),missing=await f.report([asset.id]),row=await f.media.row(asset.id);
    await f.store.delete('quiz-media/'+asset.id+'/'+row.digest);await denied(f.delivery.send(actors.student,missing.id,body({consent:true})),503);assert.equal(f.messages.length,0);
    const first=await f.report();await f.delivery.send(actors.student,first.id,body({consent:true}));const second=await f.report();await denied(f.delivery.send(actors.student,second.id,body({consent:true})),409);assert.equal(f.messages.length,1);
    f.sql.exec("DELETE FROM class_group_students WHERE account_id='u1'");await denied(f.delivery.status(actors.student,first.id),404);
    const bytes=new Uint8Array(3*1024*1024+1);assert.throws(()=>f.transport.prepare({id:crypto.randomUUID(),category:'bug',text:'Test',attachments:[{filename:'test.wav',type:'audio/wav',content:bytes}]}),error=>error.status===413);
  }finally{f.close();}
});
