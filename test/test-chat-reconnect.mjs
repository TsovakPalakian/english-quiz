import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {extractFunction} from './helpers/extract-function.mjs';

const source=readFileSync(new URL('../production/chat/20-connection.js',import.meta.url),'utf8');
const plan=runInNewContext(extractFunction(source,'chatReconnectPlan')+'\nchatReconnectPlan');

test('close code 1005 reconnects and 1000 or 4003 does not',()=>{
  const again=plan(0,{code:1005});
  assert.equal(again.stop,false);
  assert.equal(again.count,1);
  assert.equal(again.delay,700);
  assert.equal(plan(3,{code:1000}).stop,true);
  assert.equal(plan(3,{code:1000}).signOut,false);
  assert.equal(plan(3,{code:4003}).stop,true);
  assert.equal(plan(3,{code:4003}).signOut,true);
});
test('eight failed opens stop and a snapshot or Chats resets the counter',()=>{
  let count=0;
  for(let i=0;i<8;i++)count=plan(count,{code:1006}).count;
  assert.equal(count,8);
  assert.equal(plan(count,{code:1006}).stop,true);
  assert.equal(plan(count,{opened:true}).count,0);
  assert.equal(plan(count,{force:true}).count,0);
});
test('an unacked send keeps its client key for the next snapshot',()=>{
  const messages=readFileSync(new URL('../production/chat/40-messages.js',import.meta.url),'utf8');
  const keep=runInNewContext(extractFunction(messages,'chatUnackedSend')+'\nchatUnackedSend');
  const saved={roomId:'direct:a:b',text:'hi',category:'personal',clientKey:'same-key'};
  assert.equal(keep(saved),saved);
  assert.equal(keep(saved).clientKey,'same-key');
  assert.equal(keep({text:'hi'}),null);
  assert.match(source,/flushUnacked\(\)/);
});
test('an open chat pings every 30 seconds',()=>{
  assert.match(extractFunction(source,'startPing'),/request\('ping'\)/);
  assert.match(extractFunction(source,'startPing'),/30000/);
  assert.match(extractFunction(source,'disconnect'),/stopPing\(\)/);
});
