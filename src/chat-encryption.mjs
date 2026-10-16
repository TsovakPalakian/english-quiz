import {gcm} from '@noble/ciphers/aes.js';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true}),prefix='chatenc:aes256gcm:';
const fail=()=>{throw Object.assign(new Error('Chat encryption is unavailable.'),{status:503});};
const contexts=new WeakMap();
export function bindChatEncryption(db,env){contexts.set(db,env);return db;}
export function chatDatabaseCipher(db){const env=contexts.get(db);return env?chatCipher(env):null;}
const unpack=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
const pack=value=>{let text='';for(let i=0;i<value.length;i+=8192)text+=String.fromCharCode(...value.subarray(i,i+8192));return btoa(text);};
export function chatCipher(env){
  if(!env.CHAT_ENCRYPTION_KEY){if(env.CHAT_ENCRYPTION_REQUIRED==='true')fail();return null;}
  try{
    const active=env.CHAT_ENCRYPTION_KEY_ID||'v1',keys=new Map();if(!/^[A-Za-z0-9_-]{1,32}$/.test(active))fail();
    for(const [id,value] of Object.entries({...JSON.parse(env.CHAT_ENCRYPTION_PREVIOUS_KEYS||'{}'),[active]:env.CHAT_ENCRYPTION_KEY})){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(id))fail();const key=unpack(value);if(key.length!==32)fail();keys.set(id,key);}
    return {
      seal(value,context){if(value==null)return value;const nonce=crypto.getRandomValues(new Uint8Array(12)),data=gcm(keys.get(active),nonce,encoder.encode(context)).encrypt(encoder.encode(value));return prefix+active+':'+pack(nonce)+':'+pack(data);},
      open(value,context){if(typeof value!=='string'||!value.startsWith('chatenc:'))return value;try{const [tag,algorithm,id,nonce,body,...rest]=value.split(':');if(tag!=='chatenc'||algorithm!=='aes256gcm'||rest.length||!keys.has(id))fail();const iv=unpack(nonce);if(iv.length!==12)fail();return decoder.decode(gcm(keys.get(id),iv,encoder.encode(context)).decrypt(unpack(body)));}catch{fail();}}
    };
  }catch{fail();}
}
