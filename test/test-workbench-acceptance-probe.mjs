import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../ops/workbench-inspector/acceptance-worker.mjs';
test('operator preview uses synthetic media and a fixed recipient, never sends on GET or duplicate attempts',async()=>{
  let inspections=0,emails=0;
  const env={WORKBENCH_MEDIA_INSPECTOR:{async fetch(url,options){
    inspections++;assert.equal(url,'https://media-inspector.internal/inspect');
    assert.equal(options.headers['Content-Type'],'audio/wav');
    assert.equal(new TextDecoder().decode(options.body.subarray(0,4)),'RIFF');
    assert.equal(options.body.length,3244);return Response.json({kind:'audio'});
  }},WORKBENCH_EMAIL:{async send(message){
    emails++;assert.equal(message.to,'info@lumiscia.org');
    assert.match(message.text,/Synthetic operator test/);assert.deepEqual(message.attachments,[]);
  }}};
  assert.equal((await worker.fetch(new Request('https://probe/email'),env)).status,404);
  assert.equal(emails,0);
  assert.equal((await worker.fetch(new Request('https://probe/inspect',{method:'POST'}),env)).status,200);
  assert.equal(inspections,1);
  assert.deepEqual(await (await worker.fetch(new Request('https://probe/email',{method:'POST'}),env)).json(),{accepted:true,delivered:false});
  assert.equal((await worker.fetch(new Request('https://probe/email',{method:'POST'}),env)).status,409);
  assert.equal(emails,1);
});
