import test from 'node:test';
import assert from 'node:assert/strict';
import {chatCipher} from '../src/chat-encryption.mjs';
const env={CHAT_ENCRYPTION_KEY:btoa('a'.repeat(32))};
test('chat cipher uses authenticated AES-256-GCM compatible with Web Crypto',async()=>{
  const cipher=chatCipher(env),value=cipher.seal('private Привет','room:alice:body');assert.ok(!value.includes('private'));
  assert.equal(cipher.open(value,'room:alice:body'),'private Привет');assert.notEqual(cipher.seal('private Привет','room:alice:body'),value);
  const [, ,id,nonce,body]=value.split(':');assert.equal(id,'v1');
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),key=await crypto.subtle.importKey('raw',bytes(env.CHAT_ENCRYPTION_KEY),'AES-GCM',false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(nonce),additionalData:new TextEncoder().encode('room:alice:body')},key,bytes(body));
  assert.equal(new TextDecoder().decode(plain),'private Привет');
});
test('chat cipher fails closed for corruption, wrong context, missing or wrong keys',()=>{
  const cipher=chatCipher(env),value=cipher.seal('secret','room:1');
  assert.throws(()=>cipher.open(value,'room:2'));
  assert.throws(()=>chatCipher({CHAT_ENCRYPTION_KEY:btoa('b'.repeat(32))}).open(value,'room:1'));
  assert.throws(()=>chatCipher({CHAT_ENCRYPTION_REQUIRED:'true'}));
  assert.throws(()=>chatCipher({CHAT_ENCRYPTION_KEY:'broken'}));
  const parts=value.split(':');parts[4]='A'+parts[4].slice(1);if(parts.join(':')!==value)assert.throws(()=>cipher.open(parts.join(':'),'room:1'));
  assert.equal(cipher.open('legacy text','room:1'),'legacy text');
});
test('chat key rotation retains old reads and uses only the new active key for writes',()=>{
  const old=chatCipher(env),value=old.seal('old text','test');
  const next=chatCipher({CHAT_ENCRYPTION_KEY:btoa('b'.repeat(32)),CHAT_ENCRYPTION_KEY_ID:'v2',CHAT_ENCRYPTION_PREVIOUS_KEYS:JSON.stringify({v1:env.CHAT_ENCRYPTION_KEY})});
  assert.equal(next.open(value,'test'),'old text');assert.ok(next.seal('new text','test').startsWith('chatenc:aes256gcm:v2:'));
});
