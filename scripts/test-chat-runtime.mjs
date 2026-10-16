import {createRequire} from 'node:module';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/miniflare'),{build}=require('/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/esbuild');
const directory=await mkdtemp('/private/tmp/english-chat-runtime-'),bundle=await build({entryPoints:['scripts/chat-runtime-fixture.mjs'],bundle:true,write:false,format:'esm',platform:'browser'});
const options={...convertV4MiniflareOptions({name:'chat-runtime-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-08-01',bindings:{CONTENT_SESSION_SECRET:'fixture-secret',CHAT_ENCRYPTION_KEY:btoa('r'.repeat(32)),CHAT_ENCRYPTION_REQUIRED:'true'},durableObjects:{CHAT_ROOM:{className:'ChatRoom',useSQLite:true},CHAT_INBOX:{className:'ChatInbox',useSQLite:true},CHAT_BRIDGE:{className:'ChatBridge',useSQLite:true}}}),resourcePersistencePath:directory};
let mf=new Miniflare(options),sockets=[];
function wire(ws){const rows=[];ws.addEventListener('message',event=>rows.push(JSON.parse(event.data)));ws.accept();sockets.push(ws);return {ws,rows};}
async function waitFor(fn){const until=Date.now()+10000;while(Date.now()<until){const value=fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Runtime event timed out.');}
async function rpc(connection,action,body){const requestId=crypto.randomUUID();connection.ws.send(JSON.stringify({requestId,action,body}));const result=await waitFor(()=>connection.rows.find(r=>r.requestId===requestId));if(result.error)throw new Error(result.error);return result.result;}
try{
  assert.equal((await mf.dispatchFetch('http://fixture/seed')).status,200);
  assert.deepEqual(await (await mf.dispatchFetch('http://fixture/preview-fixture')).json(),{title:'English lesson',description:'Useful practice',image:'https://i.ytimg.com/vi/example/default.jpg'});
  const a=await mf.dispatchFetch('http://fixture/socket?account=alice',{headers:{Upgrade:'websocket'}}),b=await mf.dispatchFetch('http://fixture/socket?account=bob',{headers:{Upgrade:'websocket'}});
  assert.equal(a.status,101);assert.equal(b.status,101);const alice=wire(a.webSocket),bob=wire(b.webSocket);await waitFor(()=>alice.rows.some(r=>r.type==='snapshot'));
  assert.equal((await rpc(alice,'profiles',{ids:['bob']})).profiles[0].online,true);
  const extra=await mf.dispatchFetch('http://fixture/socket?account=bob',{headers:{Upgrade:'websocket'}});assert.equal(extra.status,101);const extraBob=wire(extra.webSocket);await waitFor(()=>extraBob.rows.some(r=>r.type==='snapshot'));extraBob.ws.close();await new Promise(resolve=>setTimeout(resolve,50));assert.equal((await rpc(alice,'profiles',{ids:['bob']})).profiles[0].online,true);
  const roomId='direct:alice:bob',body={roomId,category:'personal',text:'Persistent runtime message',clientKey:'runtime-message'};
  const sent=await rpc(alice,'send',body);assert.equal(sent.message.id,1);
  await waitFor(()=>bob.rows.some(r=>r.event?.message?.id===1));
  await rpc(bob,'delivered',{roomId,category:'personal',through:1});await rpc(bob,'read',{roomId,category:'personal',through:1});
  await waitFor(()=>alice.rows.some(r=>r.event?.receipt?.readers.some(member=>member.id==='bob'&&member.read===1)));
  const search=await rpc(bob,'history',{roomId,category:'personal',q:'Persistent'});assert.equal(search.messages.length,1);
  assert.equal((await rpc(alice,'send',body)).message.id,1);
  await rpc(bob,'relation',{roomId,action:'accept'});
  const edited=await rpc(alice,'edit',{roomId,id:1,text:'Updated runtime message',expectedEditedMs:0});assert.ok(edited.message.editedMs);
  assert.equal((await rpc(bob,'history',{roomId,category:'personal',q:'Persistent'})).messages.length,0);assert.equal((await rpc(bob,'history',{roomId,category:'personal',q:'Updated'})).messages.length,1);
  await rpc(bob,'react',{roomId,id:1,emoji:'\u{1f44d}'});await rpc(alice,'pin',{roomId,id:1,pinned:true});
  for(const ws of sockets)if(ws.readyState<2)ws.close();await mf.dispose();mf=new Miniflare(options);sockets=[];
  const reconnect=await mf.dispatchFetch('http://fixture/socket?account=alice&after=1',{headers:{Upgrade:'websocket'}});assert.equal(reconnect.status,101,reconnect.status===101?'':await reconnect.text());const again=wire(reconnect.webSocket);
  await waitFor(()=>again.rows.some(r=>r.type==='snapshot'));
  const history=await rpc(again,'history',{roomId,category:'personal'});assert.equal(history.messages.length,1);assert.equal(history.messages[0].read,true);
  assert.equal(history.messages[0].text,'Updated runtime message');assert.equal(history.messages[0].reactions[0].count,1);assert.equal(history.room.pinned.id,1);assert.equal(history.room.access.state,'accepted');
  assert.ok(again.rows.some(r=>r.type==='event'),'Events replay after restart');
  await rpc(again,'room-settings',{roomId,archived:true,muteUntil:Date.now()+60000,sound:'common-toad'});const archived=await rpc(again,'snapshot',{});assert.equal(archived.total,0);assert.equal(archived.rooms.find(r=>r.id===roomId).archived,true);
  await rpc(again,'folders',{op:'save',id:'runtime-folder',name:'Practice',roomIds:[roomId]});assert.equal((await rpc(again,'snapshot',{})).folders[0].name,'Practice');
  await rpc(again,'clear-history',{roomId,everyone:false});assert.equal((await rpc(again,'history',{roomId,category:'personal'})).messages.length,0);
  const bobAgain=wire((await mf.dispatchFetch('http://fixture/socket?account=bob',{headers:{Upgrade:'websocket'}})).webSocket);await waitFor(()=>bobAgain.rows.some(r=>r.type==='snapshot'));await rpc(again,'profiles',{ids:['bob']});bobAgain.ws.close();await waitFor(()=>again.rows.some(r=>r.event?.profile?.id==='bob'&&r.event.profile.online===false));
  const denied=await mf.dispatchFetch('http://fixture/command?account=bob',{method:'POST',body:JSON.stringify({action:'history',body:{roomId:'direct:alice:stranger',category:'personal'}})});assert.equal(denied.status,500);
  for(const file of await readdir(directory,{recursive:true}))if(/\.sqlite(?:-wal)?$/.test(file)){const bytes=await readFile(directory+'/'+file);for(const text of ['Persistent runtime message','Updated runtime message'])assert.equal(bytes.includes(Buffer.from(text)),false,'No plaintext in persisted SQLite: '+file);}
  console.log('Cloudflare runtime: encrypted SQLite, hibernatable sockets, receipts, retries, persisted restart, replay, archive, folders and history clearing passed.');
}finally{for(const ws of sockets)if(ws.readyState<2)ws.close();await mf.dispose();await rm(directory,{recursive:true,force:true});}
