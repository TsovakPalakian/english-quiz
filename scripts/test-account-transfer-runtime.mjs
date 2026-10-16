import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/miniflare'),{build}=require('/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/esbuild');
const directory=await mkdtemp('/private/tmp/english-transfer-runtime-'),bundle=await build({entryPoints:['scripts/account-transfer-runtime-fixture.mjs'],bundle:true,write:false,format:'esm',platform:'browser'});
const key=btoa('t'.repeat(32)),expires=String(Date.now()+600000),snapshots=[],sockets=[];
function options(name,role,frozen){return {...convertV4MiniflareOptions({name,modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-08-01',bindings:{CONTENT_SESSION_SECRET:'fixture-secret',CHAT_ENCRYPTION_KEY:btoa('r'.repeat(32)),CHAT_ENCRYPTION_REQUIRED:'true',ACCOUNT_TRANSFER_ROLE:role,ACCOUNT_TRANSFER_KEY:key,ACCOUNT_TRANSFER_EXPIRES:expires,ACCOUNT_TRANSFER_FROZEN:String(frozen)},durableObjects:{CHAT_ROOM:{className:'ChatRoom',useSQLite:true},CHAT_INBOX:{className:'ChatInbox',useSQLite:true},CHAT_BRIDGE:{className:'ChatBridge',useSQLite:true}}}),resourcePersistencePath:directory};}
let mf;
async function json(path,body){const response=await mf.dispatchFetch('http://fixture'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});assert.equal(response.status,200);return response.json();}
async function transfer(body){const response=await mf.dispatchFetch('http://fixture/__account-transfer',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();}
async function rpc(action,body,account='alice'){return json('/command?account='+account,{action,body});}
async function restart(name,role,frozen){for(const ws of sockets.splice(0))if(ws.readyState<2)ws.close();if(mf)await mf.dispose();mf=new Miniflare(options(name,role,frozen));}
try{
  await restart('transfer-source','source',false);await json('/seed');
  const roomId='direct:alice:bob',sent=await rpc('send',{roomId,text:'Encrypted migration fixture',clientKey:'transfer-runtime-message'});
  await rpc('relation',{roomId,action:'accept'},'bob');
  await rpc('read',{roomId,category:'personal',through:sent.message.id},'bob');
  await rpc('room-settings',{roomId,archived:true,pinOrder:1,muteUntil:-1,sound:'common-toad'},'bob');
  await rpc('folders',{op:'save',id:'practice',name:'Practice',roomIds:[roomId]},'bob');
  await json('/bridge-fixture',{});
  const objects=[];
  for(const [kind,name] of [['room',roomId],['inbox','alice'],['inbox','bob'],['bridge','global']])objects.push({kind,name,objectId:(await json('/identity?'+new URLSearchParams({kind,name}))).id});
  const connection=await mf.dispatchFetch('http://fixture/socket?account=alice',{headers:{Upgrade:'websocket'}});assert.equal(connection.status,101);connection.webSocket.accept();sockets.push(connection.webSocket);
  await restart('transfer-source','source',true);
  assert.equal((await mf.dispatchFetch('http://fixture/seed')).status,503);
  for(const object of objects){const snapshot=await transfer({action:'export',kind:object.kind,objectId:object.objectId});assert.equal(snapshot.objectId,object.objectId);snapshots.push(snapshot);}
  assert.ok(!JSON.stringify(snapshots.filter(s=>s.kind!=='bridge')).includes('Encrypted migration fixture'));
  await restart('transfer-target','target',true);
  for(const snapshot of snapshots)assert.equal((await transfer({action:'import',kind:snapshot.kind,snapshot})).imported,true);
  assert.equal((await mf.dispatchFetch('http://fixture/snapshot')).status,503);
  await restart('transfer-target','target',false);
  for(const snapshot of snapshots)assert.equal((await transfer({action:'import',kind:snapshot.kind,snapshot})).replayed,true);
  for(const object of objects)assert.notEqual((await json('/identity?'+new URLSearchParams({kind:object.kind,name:object.name}))).id,object.objectId);
  const history=await rpc('history',{roomId,category:'personal'});assert.equal(history.messages.length,1);assert.equal(history.messages[0].text,'Encrypted migration fixture');assert.equal(history.messages[0].read,true);
  const bob=await json('/snapshot?account=bob'),room=bob.rooms.find(r=>r.id===roomId);
  assert.equal(room.archived,true);assert.equal(room.pinOrder,1);assert.equal(room.muteUntil,-1);assert.equal(room.sound,'common-toad');assert.equal(bob.folders[0].name,'Practice');assert.equal(bob.total,0);
  assert.equal((await json('/bridge-fixture')).details.phone,'+10000000000');
  assert.equal((await rpc('send',{roomId,text:'After migration',clientKey:'transfer-runtime-after'})).message.id,sent.message.id+1);
  console.log('Local Cloudflare migration: Room, both Inboxes and Bridge restored across different object IDs; encryption, history, receipts, preferences, folders, frozen access and retry passed.');
}finally{for(const ws of sockets)if(ws.readyState<2)ws.close();if(mf)await mf.dispose();await rm(directory,{recursive:true,force:true});}
