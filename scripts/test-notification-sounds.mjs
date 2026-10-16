import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationSoundRoute,validateNotificationWav,SOUND_IDS,MAX_SOUND_BYTES} from '../src/notification-sounds.mjs';
import recordings from '../production/notification-catalog.json' with {type:'json'};
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
function wav(seconds){
  const bytes=new Uint8Array(44+Math.floor(seconds*24000)*2),view=new DataView(bytes.buffer);
  for(const [at,text] of [[0,'RIFF'],[8,'WAVEfmt '],[36,'data']])for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);
  for(const [at,value] of [[4,bytes.length-8],[16,16],[24,24000],[28,48000],[40,bytes.length-44]])view.setUint32(at,value,true);
  for(const [at,value] of [[20,1],[22,1],[32,2],[34,16]])view.setUint16(at,value,true);return bytes;
}
function fixture(){
  const objects=new Map();let revision=0;
  const bucket={async get(key){const entry=objects.get(key);return entry?{etag:entry.etag,json:async()=>JSON.parse(entry.value),body:entry.value}:null;},async put(key,value,options={}){const old=objects.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches||options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++revision);objects.set(key,{value,etag});return {etag};},async delete(key){objects.delete(key);}};
  const call=(method='GET',body,revision='',query='',actor='alice')=>notificationSoundRoute(new Request('https://example.test/api/me/notification-sounds'+query,{method,headers:{'If-Match':revision},body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined}),bucket,{id:actor});
  return {call,objects,bucket};
}
test('An omitted empty revision permits only the first save and cannot overwrite existing settings',async()=>{
  const {bucket,call}=fixture(),url='https://example.test/api/me/notification-sounds?name=First%20sound';
  const saved=await(await notificationSoundRoute(new Request(url,{method:'PUT',body:wav(1)}),bucket,{id:'alice'})).json();
  assert.equal(saved.sounds[0].name,'First sound');assert.equal((await(await call()).json()).sound,saved.sound);
  await assert.rejects(notificationSoundRoute(new Request(url,{method:'PUT',body:wav(1)}),bucket,{id:'alice'}),error=>error.status===409);
  assert.equal((await(await call()).json()).sounds.length,1);
});
test('Default sound, disabled state and volume persist on server and are private per account',async()=>{
  const {call}=fixture();const initial=await (await call()).json();assert.equal(initial.sound,'soft-double');assert.equal(initial.enabled,true);assert.ok(SOUND_IDS.length>=100);
  const saved=await (await call('POST',{enabled:false,volume:.2,sound:'bell'})).json();
  assert.equal(saved.enabled,false);assert.equal(saved.volume,.2);assert.equal((await (await call()).json()).sound,'bell');
  assert.equal((await (await call('GET',null,'','','bob')).json()).sound,'soft-double');
  await assert.rejects(call('POST',{enabled:true,volume:2,sound:'bell'},saved.revision),error=>error.status===400);
  await assert.rejects(call('POST',{enabled:true,volume:.5,sound:'unknown'},saved.revision),error=>error.status===400);
  await assert.rejects(call('POST',{enabled:true,volume:.5,sound:'ping'}),error=>error.status===409);
});
test('Custom audio accepts ten seconds, is authenticated to its owner and deletable',async()=>{
  const {call,objects}=fixture();const saved=await (await call('PUT',wav(10),'','?name=My%20sound')).json(),id=saved.sound;
  assert.equal(saved.sounds[0].duration,10);assert.equal(saved.sounds[0].name,'My sound');
  assert.equal((await call('GET',null,'','?id='+id)).headers.get('Content-Type'),'audio/wav');
  await assert.rejects(call('GET',null,'','?id='+id,'bob'),error=>error.status===404);
  await assert.rejects(call('PUT',wav(10.1),saved.revision),error=>error.status===413);
  const removed=await (await call('DELETE',null,saved.revision,'?id='+id)).json();assert.equal(removed.sound,'soft-double');assert.equal(removed.sounds.length,0);
  assert.equal([...objects.keys()].filter(key=>key.endsWith('.wav')).length,0);
});
test('Malformed or forged WAV metadata is rejected',()=>{
  for(const bytes of [new Uint8Array(80),wav(10.1),wav(.5).slice(0,-1)])assert.throws(()=>validateNotificationWav(bytes));
  const forged=wav(.5);new DataView(forged.buffer).setUint32(24,1,true);assert.throws(()=>validateNotificationWav(forged));
  assert.equal(validateNotificationWav(wav(.5)),.5);
});
test('100+ licensed recordings are distinct audible assets and every built-in ID saves',async()=>{
  assert.ok(recordings.length>=100);assert.equal(new Set(SOUND_IDS).size,SOUND_IDS.length);assert.ok(recordings.some(row=>row.id==='common-toad'));
  const hashes=new Set(),{call}=fixture();let revision='';
  for(const sound of recordings){
    const bytes=readFileSync('production'+sound.file);assert.equal(sound.license,'CC0-1.0');assert.ok(bytes.length<=MAX_SOUND_BYTES);assert.equal(validateNotificationWav(bytes),sound.duration);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),sound.sha256);hashes.add(sound.sha256);
    let energy=0;for(let i=44;i<bytes.length;i+=2)energy+=bytes.readInt16LE(i)**2;assert.ok(energy>10000,'Audible '+sound.id);
    const saved=await(await call('POST',{enabled:true,volume:.3,sound:sound.id},revision)).json();revision=saved.revision;assert.equal(saved.sound,sound.id);
  }
  assert.equal(hashes.size,recordings.length,'No duplicate audio passed off as different sounds');
});
