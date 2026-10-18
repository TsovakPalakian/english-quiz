import test from 'node:test';
import assert from 'node:assert/strict';
import {messagesWorker} from '../src/learning-messages-worker.mjs';
for(const host of ['learn-english.east-tarsal.workers.dev','lumiscia.org'])test('messaging assets work on the configured host: '+host,async()=>{
 const env={STORAGE_MODE:'production',MESSAGES_ENABLED:'true',STAGE_ENABLED:'true',CONTENT_ALLOWED_HOST:host,STAGE_ALLOWED_HOST:host,ASSETS:{fetch:async()=>new Response('fixture')}};
 const worker=messagesWorker({mode:'production'});
 assert.equal((await worker.fetch(new Request('https://'+host+'/messages.js'),env,{})).status,200);
 assert.equal((await worker.fetch(new Request('https://other.example/messages.js'),env,{})).status,403);
 assert.equal((await worker.fetch(new Request('http://'+host+'/messages.js'),env,{})).status,403);
 assert.equal((await worker.fetch(new Request('https://'+host+'/messages.js'),{...env,STAGE_ALLOWED_HOST:'other.example'},{})).status,403);
});
