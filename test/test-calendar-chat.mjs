import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {extractFunction} from './helpers/extract-function.mjs';

const source=readFileSync(new URL('../client/53a-group-calendar.js',import.meta.url),'utf8');

test('calendar reports use the chat socket and do not call retired message routes',async()=>{
  assert.equal(source.includes('/api/messages/send'),false);
  assert.equal(source.includes('/api/messages/open'),false);
  assert.equal(source.includes('/api/groups/absence'),true);
  const http=[];
  const sandbox={window:{
    sendGroupChatMessage:async(groupId,text,options)=>{
      assert.equal(groupId,7);
      assert.equal(text,'Attendance Report');
      assert.equal(options.category,'learning');
      return {message:{id:1}};
    },
    fetch:()=>{http.push('fetch');}
  }};
  const send=runInNewContext(extractFunction(source,'dispatchCalendarChat')+'\ndispatchCalendarChat',sandbox);
  const sent=await send(7,'Attendance Report',{category:'learning'});
  assert.equal(sent.message.id,1);
  assert.deepEqual(http,[]);
  sandbox.window.sendGroupChatMessage=async()=>{throw new Error('Chat is reconnecting. Your draft is saved.');};
  await assert.rejects(send(7,'Attendance Report',{category:'learning'}),e=>e.message==='Chat is reconnecting. Your draft is saved.');
  sandbox.window.sendGroupChatMessage=undefined;
  await assert.rejects(send(7,'Attendance Report',{category:'learning'}),e=>e.message==='Chat is unavailable.');
  assert.deepEqual(http,[]);
});
