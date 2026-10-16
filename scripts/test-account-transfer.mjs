import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ChatRoom,ChatInbox} from '../src/chat-durable.mjs';
import {ChatBridge} from '../src/chat-worker.mjs';
import {transferObject,accountTransferWorker} from '../src/account-transfer.mjs';
import {prepareChatDatabase} from '../src/chat-database.mjs';
import {productionWorker} from '../src/learning-production-worker.mjs';
function fixture(id,role,kind='room'){
 const db=new DatabaseSync(':memory:'),metrics={writes:0,alarms:0,deletes:0},sockets=[],pending=[];
 const env={CONTENT_SESSION_SECRET:'fixture',CHAT_ENCRYPTION_KEY:btoa('r'.repeat(32)),CHAT_ENCRYPTION_REQUIRED:'true',ACCOUNT_TRANSFER_ROLE:role,ACCOUNT_TRANSFER_KEY:btoa('t'.repeat(32)),ACCOUNT_TRANSFER_EXPIRES:String(Date.now()+60000),...(role==='source'?{ACCOUNT_TRANSFER_FROZEN:'true'}:{})};
 let alarm=null,alarmFailure=false;
 const ctx={id:{toString:()=>id},getWebSockets:()=>sockets,waitUntil(job){pending.push(job);},storage:{sql:{exec(query,...args){let rows=[];for(const sql of query.split(';').filter(s=>s.trim())){const statement=db.prepare(sql);if(statement.columns().length)rows=statement.all(...args);else{metrics.writes++;statement.run(...args);}}return {toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}},getAlarm:async()=>alarm,setAlarm:async value=>{metrics.alarms++;if(alarmFailure)throw Error('Alarm unavailable');alarm=value;},deleteAlarm:async()=>{metrics.deletes++;alarm=null;}}};
 const Type={room:ChatRoom,inbox:ChatInbox,bridge:ChatBridge}[kind],store=new Type(ctx,env);
 return {db,env,ctx,store,room:store,metrics,sockets,pending,get alarm(){return alarm;},set alarm(value){alarm=value;},set alarmFailure(value){alarmFailure=value;}};
}
const req=(env,action,body={})=>new Request('https://chat.internal/__account-transfer/'+action,{method:'POST',headers:{Authorization:'Bearer '+env.ACCOUNT_TRANSFER_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('source export reconstruction does not require schema writes after the daily write limit',()=>{
 const a=fixture('a'.repeat(64),'source');try{const sql=a.room.ctx.storage.sql,original=sql.exec;sql.exec=(query,...args)=>{if(/\b(?:CREATE|ALTER|DROP|INSERT|DELETE|UPDATE)\b/i.test(query))throw Error('Exceeded allowed rows written');return original(query,...args);};assert.doesNotThrow(()=>new ChatRoom(a.room.ctx,a.env));}finally{a.db.close();}
});
test('portable chat transfer preserves encrypted state across different object IDs',async()=>{
 const a=fixture('a'.repeat(64),'source'),b=fixture('b'.repeat(64),'target');try{
 a.room.set('room',{id:'direct:alice:bob',kind:'direct',active:true});a.room.set('_databaseScope',{provider:'d1',revision:1,scope:'site'});a.room.set('settings:alice',{pinOrder:2,sound:'bell'});
 a.db.prepare('INSERT INTO messages(sender,name,category,body,client_key,created_ms) VALUES(?,?,?,?,?,?)').run('alice','Alice','personal',a.room.seal('private text','body'),'retry-key',1);
 const exported=await(await transferObject(a.room,req(a.env,'export'),'room')).json();assert.equal(JSON.stringify(exported).includes('private text'),false);
 const imported=await transferObject(b.room,req(b.env,'import',exported),'room');assert.equal(imported.status,200);assert.equal(b.room.get('settings:alice').pinOrder,2);assert.equal(b.room.one('SELECT body FROM messages').body,'private text');
 assert.notEqual(a.db.prepare('SELECT body FROM messages').get().body,b.db.prepare('SELECT body FROM messages').get().body);
 assert.equal((await transferObject(b.room,req(b.env,'import',exported),'room')).status,200,'Retry is idempotent');
 }finally{a.db.close();b.db.close();}
});
test('transfer is closed by default, expires, validates integrity and refuses overwrites',async()=>{
 const a=fixture('a'.repeat(64),'source'),b=fixture('b'.repeat(64),'target');try{
 assert.equal((await transferObject(a.room,new Request('https://x/__account-transfer/export',{method:'POST'}),'room')).status,404);
 a.env.ACCOUNT_TRANSFER_EXPIRES='1';assert.equal((await transferObject(a.room,req(a.env,'export'),'room')).status,404);a.env.ACCOUNT_TRANSFER_EXPIRES=String(Date.now()+60000);
 const snapshot=await(await transferObject(a.room,req(a.env,'export'),'room')).json();snapshot.tables[0].rows.push({key:'tamper',value:'"bad"'});assert.equal((await transferObject(b.room,req(b.env,'import',snapshot),'room')).status,400);
 const good=await(await transferObject(a.room,req(a.env,'export'),'room')).json();b.room.set('existing',true);assert.equal((await transferObject(b.room,req(b.env,'import',good),'room')).status,409);assert.equal(b.room.get('existing'),true);
 }finally{a.db.close();b.db.close();}
});
const sign=async snapshot=>{const {digest:ignored,...value}=snapshot;return {...value,digest:Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))).toString('hex')};};
const exportState=async f=>{const response=await transferObject(f.store,req(f.env,'export'),f.store instanceof ChatBridge?'bridge':f.store.storageKind);assert.equal(response.status,200);return response.json();};

for(const kind of ['room','inbox','bridge'])test(kind+' reconstruction and frozen HTTP/alarm entry perform no persistent writes',async()=>{
 const f=fixture('a'.repeat(64),'source',kind);try{
  const Type={room:ChatRoom,inbox:ChatInbox,bridge:ChatBridge}[kind];
  const before=f.metrics.writes;new Type(f.ctx,f.env);assert.equal(f.metrics.writes,before);
  const response=await f.store.fetch(new Request('https://chat.internal/'+(kind==='room'?'status':kind==='inbox'?'snapshot':'flush'),{method:'POST',headers:{'X-Chat-Internal':'fixture'},body:'{}'}));
  assert.equal(response.status,503);await f.store.alarm();await Promise.all(f.pending);
  assert.equal(f.metrics.writes,before);assert.equal(f.metrics.alarms,0);assert.equal(f.metrics.deletes,0);
 }finally{f.db.close();}
});
test('inbox transfer preserves folders, encrypted events, unread counters and deleted sequence gaps',async()=>{
 const a=fixture('a'.repeat(64),'source','inbox'),b=fixture('b'.repeat(64),'target','inbox');try{
  a.store.set('profile',{id:'alice',name:'Alice',role:'USER',active:true});a.store.set('_databaseScope',{provider:'neon',revision:3,scope:'site'});
  a.store.set('folders',[{id:'family',name:'Family',roomIds:['direct:alice:bob']}]);
  const room={id:'direct:alice:bob',kind:'direct',title:'Bob',revision:8,unread:{personal:6,learning:2},lastMessage:{id:9,text:'private preview'}};
  a.db.prepare('INSERT INTO rooms(id,data) VALUES(?,?)').run(room.id,a.store.seal(JSON.stringify(room),'data'));
  a.db.prepare('INSERT INTO events(id,event_key,data) VALUES(?,?,?)').run(30,'message:9',a.store.seal(JSON.stringify({type:'message',room}),'data'));
  a.db.prepare('INSERT INTO events(id,event_key,data) VALUES(?,?,?)').run(50,'discarded',a.store.seal('{}','data'));a.db.exec('DELETE FROM events WHERE id=50');
  const snapshot=await exportState(a);assert.ok(!JSON.stringify(snapshot).includes('private preview'));
  assert.equal((await transferObject(b.store,req(b.env,'import',snapshot),'inbox')).status,200);
  assert.deepEqual(b.store.snapshot().unread,{personal:6,learning:2});assert.equal(b.store.snapshot().folders[0].name,'Family');
  assert.equal(JSON.parse(b.store.one('SELECT data FROM events').data).room.lastMessage.text,'private preview');
  b.db.prepare('INSERT INTO events(event_key,data) VALUES(?,?)').run('next',b.store.seal('{}','data'));
  assert.equal(b.db.prepare('SELECT MAX(id) id FROM events').get().id,51);
 }finally{a.db.close();b.db.close();}
});
test('bridge transfer preserves usernames, policy and private profile fields',async()=>{
 const a=fixture('a'.repeat(64),'source','bridge'),b=fixture('b'.repeat(64),'target','bridge');try{
  a.store.set('_databaseScope',{provider:'d1',revision:1,scope:'site'});a.store.set('username-owner:@alice','alice');a.store.set('policy',{users:[{id:'alice',active:1}],at:123});
  a.db.prepare('INSERT INTO profiles(user_id,phone,phone_visible,birthday,birthday_visible) VALUES(?,?,?,?,?)').run('alice','private-phone',0,'2000-01-01',0);
  const snapshot=await exportState(a);assert.equal(snapshot.logicalName,'global');
  assert.equal((await transferObject(b.store,req(b.env,'import',snapshot),'bridge')).status,200);
  assert.equal(b.store.get('username-owner:@alice'),'alice');assert.deepEqual(b.store.get('policy'),a.store.get('policy'));
  assert.deepEqual(b.db.prepare('SELECT * FROM profiles').get(),a.db.prepare('SELECT * FROM profiles').get());
 }finally{a.db.close();b.db.close();}
});
test('wrong encryption key rolls back every imported table and the completion marker',async()=>{
 const a=fixture('a'.repeat(64),'source'),b=fixture('b'.repeat(64),'target');try{
  a.store.set('room',{id:'direct:alice:bob'});const snapshot=await exportState(a);
  b.store.cipher=(await import('../src/chat-encryption.mjs')).chatCipher({CHAT_ENCRYPTION_KEY:btoa('x'.repeat(32))});
  assert.equal((await transferObject(b.store,req(b.env,'import',snapshot),'room')).status,400);
  for(const table of snapshot.tables)assert.equal(b.db.prepare('SELECT COUNT(*) n FROM '+table.name).get().n,0);
  assert.equal(b.store.get('_accountTransfer'),null);
 }finally{a.db.close();b.db.close();}
});
test('invalid later table rolls back rows inserted from earlier tables',async()=>{
 const a=fixture('a'.repeat(64),'source'),b=fixture('b'.repeat(64),'target');try{
  a.store.set('room',{id:'direct:alice:bob'});const snapshot=await exportState(a);
  snapshot.tables.at(-1).rows.push({unknown_column:'invalid'});
  assert.equal((await transferObject(b.store,req(b.env,'import',await sign(snapshot)),'room')).status,400);
  assert.equal(b.db.prepare('SELECT COUNT(*) n FROM meta').get().n,0);
 }finally{a.db.close();b.db.close();}
});
test('retry after alarm failure restores the pending alarm without reimporting rows',async()=>{
 const a=fixture('a'.repeat(64),'source'),b=fixture('b'.repeat(64),'target');try{
  a.store.set('room',{id:'direct:alice:bob'});a.alarm=Date.now()+60000;const snapshot=await exportState(a);b.alarmFailure=true;
  assert.notEqual((await transferObject(b.store,req(b.env,'import',snapshot),'room')).status,200);
  const rows=b.db.prepare('SELECT COUNT(*) n FROM meta').get().n;b.alarmFailure=false;
  assert.equal((await transferObject(b.store,req(b.env,'import',snapshot),'room')).status,200);
  assert.equal(b.alarm,a.alarm);assert.equal(b.db.prepare('SELECT COUNT(*) n FROM meta').get().n,rows);
 }finally{a.db.close();b.db.close();}
});
test('export refuses a running source and waits for pending object work',async()=>{
 const f=fixture('a'.repeat(64),'source');try{
  delete f.env.ACCOUNT_TRANSFER_FROZEN;
  assert.equal((await transferObject(f.store,req(f.env,'export'),'room')).status,409);
  f.env.ACCOUNT_TRANSFER_FROZEN='true';let release;f.store.flushing=new Promise(resolve=>{release=resolve;});
  let done=false;const exported=exportState(f).then(value=>{done=true;return value;});
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(done,false);release();await exported;
 }finally{f.db.close();}
});
test('an established socket cannot mutate or send events while frozen',async()=>{
 const f=fixture('a'.repeat(64),'source','inbox'),sent=[],closed=[];try{
  f.store.set('profile',{id:'alice',role:'USER',active:true});const before=f.metrics.writes;
  const ws={deserializeAttachment:()=>({expires:Date.now()+60000}),send:raw=>sent.push(JSON.parse(raw)),close:(...args)=>closed.push(args)};f.sockets.push(ws);
  await f.store.webSocketMessage(ws,JSON.stringify({requestId:'freeze-test',action:'folders',body:{op:'save',id:'test',name:'Test',roomIds:[]}}));
  f.store.broadcast({type:'event',event:{text:'must not deliver'}});await Promise.all(f.pending);
  assert.equal(f.metrics.writes,before);assert.ok(!sent.some(value=>value.type==='event'));
  assert.ok(closed.length);assert.equal(sent[0]?.status,503);
 }finally{f.db.close();}
});
test('frozen worker rejects all normal HTTP methods and never runs scheduled jobs',async()=>{
 let calls=0;const worker=accountTransferWorker({fetch:async()=>{calls++;return Response.json({ok:true});},scheduled:async()=>{calls++;}}),env={ACCOUNT_TRANSFER_FROZEN:'true'};
 for(const method of ['GET','HEAD','POST','PUT','DELETE','OPTIONS'])assert.equal((await worker.fetch(new Request('https://site.example/api/me',{method}),env,{})).status,503);
 await worker.scheduled({},env,{});assert.equal(calls,0);
 await worker.scheduled({}, {}, {});assert.equal(calls,1);
});
test('frozen production cron exits before opening databases or scheduling cleanup',async()=>{
 let calls=0;const env={ACCOUNT_TRANSFER_FROZEN:'true',CONTENT_ENABLED:'true',CONTENT_MEDIA_BUCKET:'learn-english-production-media',CONTENT_ALLOWED_HOST:'site.example',CONTENT_SESSION_SECRET:'fixture',DB:{},MEDIA:{},ASSETS:{},CONTENT_MEDIA:{get(){calls++;throw Error('Must not read');},head(){},put(){}}};
 await productionWorker({scheduled:async()=>{calls++;}}).scheduled({},env,{waitUntil(){calls++;}});assert.equal(calls,0);
});
test('persisted freeze is observed by existing objects before metadata or encryption writes',async()=>{
 const f=fixture('a'.repeat(64),'target');try{
  delete f.env.ACCOUNT_TRANSFER_ROLE;f.env.CONTENT_ENABLED='true';f.env.CONTENT_MEDIA={get:async()=>({json:async()=>({provider:'d1',revision:0,scope:'site',accountTransferFrozen:true})})};
  const before=f.metrics.writes;
  await assert.rejects(prepareChatDatabase(f.store),error=>error.status===503&&error.migrationFrozen===true);
  assert.equal(f.metrics.writes,before);
 }finally{f.db.close();}
});
test('a frozen target defers restored alarms until a later authorized import retry',async()=>{
 const a=fixture('a'.repeat(64),'source'),b=fixture('b'.repeat(64),'target');try{
  a.store.set('room',{id:'direct:alice:bob'});a.alarm=Date.now()-1000;const snapshot=await exportState(a);
  b.env.ACCOUNT_TRANSFER_FROZEN='true';const imported=await (await transferObject(b.store,req(b.env,'import',snapshot),'room')).json();
  assert.equal(imported.alarmDeferred,true);assert.equal(b.alarm,null);assert.equal(b.store.get('_accountTransfer').alarmPending,true);
  delete b.env.ACCOUNT_TRANSFER_FROZEN;const before=Date.now();
  assert.equal((await (await transferObject(b.store,req(b.env,'import',snapshot),'room')).json()).alarmDeferred,false);
  assert.ok(b.alarm>=before+1000);assert.equal(b.store.get('_accountTransfer').alarmPending,false);
  const alarms=b.metrics.alarms;await transferObject(b.store,req(b.env,'import',snapshot),'room');assert.equal(b.metrics.alarms,alarms);
 }finally{a.db.close();b.db.close();}
});
for(const kind of ['room','inbox','bridge'])test(kind+' observes a persisted freeze in alarms without rescheduling',async()=>{
 const f=fixture('a'.repeat(64),'target',kind);try{
  f.store.baseEnv.CONTENT_ENABLED='true';f.store.baseEnv.CONTENT_MEDIA={get:async()=>({json:async()=>({provider:'d1',revision:0,scope:'site',accountTransferFrozen:true})})};
  const before=f.metrics.writes;await f.store.alarm();await Promise.all(f.pending);
  assert.equal(f.metrics.writes,before);assert.equal(f.metrics.alarms,0);assert.equal(f.metrics.deletes,0);
 }finally{f.db.close();}
});
test('frozen room outbox is preserved and bridge flush never opens the study database',async()=>{
 const room=fixture('a'.repeat(64),'source'),bridge=fixture('b'.repeat(64),'source','bridge');try{
  room.db.prepare('INSERT INTO outbox(recipient,event_key,payload) VALUES(?,?,?)').run('alice','queued',room.store.seal('{"type":"room"}','payload'));
  bridge.store.database=()=>{throw Error('Must not open the database');};const before=room.metrics.writes;
  await room.store.flush();assert.deepEqual(await bridge.store.flush(),{frozen:true});
  assert.equal(room.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);assert.equal(room.metrics.writes,before);
  assert.equal(room.metrics.alarms+bridge.metrics.alarms,0);
 }finally{room.db.close();bridge.db.close();}
});
test('queued socket delivery preserves order and rechecks persistent freeze before sending',{timeout:2000},async()=>{
 const f=fixture('a'.repeat(64),'target','inbox'),sent=[],closed=[];try{
  let frozen=false;f.store.baseEnv.CONTENT_ENABLED='true';f.store.baseEnv.CONTENT_MEDIA={get:async()=>({json:async()=>({provider:'d1',revision:0,scope:'site',accountTransferFrozen:frozen})})};
  const ws={deserializeAttachment:()=>({expires:Date.now()+60000}),send:raw=>sent.push(JSON.parse(raw)),close:(...args)=>closed.push(args)};f.sockets.push(ws);
  f.store.broadcast({type:'event',seq:1});f.store.broadcast({type:'event',seq:2});await Promise.all(f.pending.splice(0));
  assert.deepEqual(sent.map(row=>row.seq),[1,2]);
  frozen=true;f.store.broadcast({type:'event',seq:3});await Promise.all(f.pending.splice(0));
  assert.deepEqual(sent.map(row=>row.seq),[1,2]);assert.equal(closed.length,1);
 }finally{f.db.close();}
});
test('persistent freeze stops normal production HTTP and cron before application code',async()=>{
 let calls=0;const env={CONTENT_ENABLED:'true',CONTENT_MEDIA_BUCKET:'learn-english-production-media',CONTENT_ALLOWED_HOST:'site.example',CONTENT_SESSION_SECRET:'fixture',DB:{},MEDIA:{},ASSETS:{},CONTENT_MEDIA:{get:async()=>({json:async()=>({provider:'d1',revision:0,scope:'site',accountTransferFrozen:true})}),head(){},put(){}}};
 const worker=productionWorker({fetch:async()=>{calls++;return Response.json({});},scheduled:async()=>{calls++;}});
 assert.equal((await worker.fetch(new Request('https://site.example/api/me'),env,{})).status,503);
 await worker.scheduled({},env,{waitUntil(){calls++;}});assert.equal(calls,0);
});
for(const corrupt of [
 snapshot=>{snapshot.alarm=-1;},
 snapshot=>{snapshot.alarm='tomorrow';},
 snapshot=>{snapshot.objectId='not-an-object-id';},
 snapshot=>{snapshot.sequence=[{name:'other_table',seq:1}];},
 snapshot=>{snapshot.tables[0].rows={};},
 snapshot=>{snapshot.kind='inbox';}
])test('structurally invalid but checksummed snapshot is rejected atomically: '+corrupt.toString(),async()=>{
 const a=fixture('a'.repeat(64),'source'),b=fixture('b'.repeat(64),'target');try{
  a.store.set('room',{id:'direct:alice:bob'});const snapshot=await exportState(a);corrupt(snapshot);
  assert.equal((await transferObject(b.store,req(b.env,'import',await sign(snapshot)),'room')).status,400);
  assert.equal(b.db.prepare('SELECT COUNT(*) n FROM meta').get().n,0);
 }finally{a.db.close();b.db.close();}
});
test('export waits for an already accepted request before taking the snapshot',{timeout:2000},async()=>{
 const f=fixture('a'.repeat(64),'source');try{
  delete f.env.ACCOUNT_TRANSFER_FROZEN;
  let body;const stream=new ReadableStream({start(controller){body=controller;}});
  const request=new Request('https://chat.internal/configure',{method:'POST',headers:{'X-Chat-Internal':'fixture'},body:stream,duplex:'half'});
  const accepted=f.store.fetch(request);await new Promise(resolve=>setTimeout(resolve,10));f.env.ACCOUNT_TRANSFER_FROZEN='true';
  let complete=false;const exported=exportState(f).then(value=>{complete=true;return value;});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(complete,false);
  body.enqueue(new TextEncoder().encode(JSON.stringify({room:{id:'direct:alice:bob',kind:'direct'},members:[]})));body.close();
  assert.equal((await accepted).status,200);const snapshot=await exported;
  assert.equal(snapshot.logicalName,'direct:alice:bob');assert.equal(f.store.transferTasks.size,0);
 }finally{await Promise.all(f.pending);f.db.close();}
});
test('production export requires the persisted fence as well as the deployment flag',async()=>{
 const f=fixture('a'.repeat(64),'source');try{
  let frozen=false;f.env.CONTENT_ENABLED='true';f.env.CONTENT_MEDIA={get:async()=>({json:async()=>({provider:'d1',revision:0,scope:'site',accountTransferFrozen:frozen})})};
  assert.equal((await transferObject(f.store,req(f.env,'export'),'room')).status,409);
  frozen=true;assert.equal((await transferObject(f.store,req(f.env,'export'),'room')).status,200);
  f.env.CONTENT_MEDIA.get=async()=>{throw Error('Storage unavailable');};assert.notEqual((await transferObject(f.store,req(f.env,'export'),'room')).status,200);
 }finally{f.db.close();}
});
for(const kind of ['room','inbox','bridge'])test(kind+' repeated preparation preserves persisted metadata without SQL writes',async()=>{
 const f=fixture('a'.repeat(64),'target',kind);try{
  await prepareChatDatabase(f.store);
  const original=f.db.prepare('SELECT key,value FROM meta ORDER BY key').all(),before=f.metrics.writes;
  for(let i=0;i<100;i++)await prepareChatDatabase(f.store);
  assert.equal(f.metrics.writes-before,0);assert.deepEqual(f.db.prepare('SELECT key,value FROM meta ORDER BY key').all(),original);
  if(kind!=='bridge')assert.ok(original.every(row=>row.value.startsWith('chatenc:aes256gcm:')));
  assert.equal(f.store.get('_databaseWritable'),true);assert.equal(f.store.get('_databaseScope').provider,'d1');
 }finally{f.db.close();}
});
