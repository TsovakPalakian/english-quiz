import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/miniflare'),{build}=require('/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/esbuild');
const directory=await mkdtemp('/private/tmp/english-transfer-merge-'),bundle=await build({entryPoints:['test/account-transfer-runtime-fixture.mjs'],bundle:true,write:false,format:'esm',platform:'browser'});
const key=btoa('t'.repeat(32)),expires=String(Date.now()+600000),snapshots=[];
function options(name,role,frozen){return {...convertV4MiniflareOptions({name,modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-08-01',bindings:{CONTENT_SESSION_SECRET:'fixture-secret',CHAT_ENCRYPTION_KEY:btoa('r'.repeat(32)),CHAT_ENCRYPTION_REQUIRED:'true',ACCOUNT_TRANSFER_ROLE:role,ACCOUNT_TRANSFER_KEY:key,ACCOUNT_TRANSFER_EXPIRES:expires,ACCOUNT_TRANSFER_FROZEN:String(frozen)},durableObjects:{CHAT_ROOM:{className:'ChatRoom',useSQLite:true},CHAT_INBOX:{className:'ChatInbox',useSQLite:true},CHAT_BRIDGE:{className:'ChatBridge',useSQLite:true}}}),resourcePersistencePath:directory};}
let mf;
async function json(path,body){const response=await mf.dispatchFetch('http://fixture'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});assert.equal(response.status,200,await response.clone().text());return response.json();}
async function transfer(body){const response=await mf.dispatchFetch('http://fixture/__account-transfer',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
async function rpc(action,body,account='alice'){return json('/command?account='+account,{action,body});}
async function restart(name,role,frozen){if(mf)await mf.dispose();mf=new Miniflare(options(name,role,frozen));}
try{
  const roomId='direct:alice:bob';
  await restart('merge-source','source',false);await json('/seed');
  await rpc('send',{roomId,text:'Before migration',clientKey:'merge-before'});
  await rpc('relation',{roomId,action:'accept'},'bob');
  await rpc('room-settings',{roomId,archived:true},'bob');
  await rpc('folders',{op:'save',id:'family',name:'Family',roomIds:[roomId]},'bob');
  const objects=[];
  for(const [kind,name] of [['room',roomId],['inbox','alice'],['inbox','bob']])objects.push({kind,objectId:(await json('/identity?'+new URLSearchParams({kind,name}))).id});
  await restart('merge-source','source',true);
  for(const object of objects){const result=await transfer({action:'export',...object});assert.equal(result.status,200);snapshots.push(result.body);}
  await restart('merge-target','target',false);await json('/seed');
  await rpc('send',{roomId,text:'After migration',clientKey:'merge-after'});
  for(const snapshot of snapshots)assert.equal((await transfer({action:'import',kind:snapshot.kind,snapshot})).status,409);
  for(const snapshot of snapshots){const result=await transfer({action:'import',kind:snapshot.kind,snapshot,merge:true});assert.equal(result.status,200);assert.equal(result.body.imported,true);assert.ok(result.body.previous);}
  const history=await rpc('history',{roomId,category:'personal'});
  assert.deepEqual(history.messages.map(m=>m.text),['Before migration','After migration']);
  const bob=await json('/snapshot?account=bob'),room=bob.rooms.find(r=>r.id===roomId);
  assert.equal(room.archived,true);assert.equal(bob.folders[0].name,'Family');
  for(const snapshot of snapshots)assert.equal((await transfer({action:'import',kind:snapshot.kind,snapshot,merge:true})).body.replayed,true);
  console.log('Local merge migration: source history, archive and folders restored; target-only messages kept; replay safe.');
}finally{if(mf)await mf.dispose();await rm(directory,{recursive:true,force:true});}
