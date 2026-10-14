import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ChatRoom,ChatInbox,chatCall,directRoomId} from '../src/chat-durable.mjs';
import {ChatBridge,durableChatWorker} from '../src/chat-worker.mjs';
import {CHAT_FILE_LIMIT,chatFileMetadata,chatFileResponse} from '../src/chat-attachments.mjs';
import {chatPreviewUrl,chatLinkPreview} from '../src/chat-previews.mjs';
import {MessageService} from '../src/turso-messages.mjs';
import {AssessmentService} from '../src/turso-assessment.mjs';
import {ExamService} from '../src/turso-exams.mjs';
import {applyTursoSchema} from './turso-test-schema.mjs';
function fixture(journal){
  const env={CONTENT_SESSION_SECRET:'fixture-secret'},databases=[],pending=[];
  for(const [binding,Type] of [['CHAT_ROOM',ChatRoom],['CHAT_INBOX',ChatInbox],...(journal?[['CHAT_BRIDGE',class extends ChatBridge{constructor(ctx,env){super(ctx,env,{studyDatabase:()=>journal});}}]]:[])]){
    const objects=new Map();env[binding]={idFromName:id=>id,get(id){
      if(!objects.has(id)){
        const db=new DatabaseSync(':memory:');databases.push(db);const sockets=[];
        const ctx={storage:{sql:{exec(query,...args){let result=[];for(const text of query.split(';').filter(s=>s.trim())){if(/CREATE TRIGGER/.test(query)){db.exec(query);return {toArray:()=>[]};}const stmt=db.prepare(text);if(stmt.columns().length)result=stmt.all(...args);else stmt.run(...args);}return {toArray:()=>result};}},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}},setAlarm:async()=>{},deleteAlarm:async()=>{}},waitUntil(job){pending.push(job);},getWebSockets:()=>sockets};
        objects.set(id,new Type(ctx,env));
      }return objects.get(id);
    }};
  }
  const alice={id:'alice',name:'Alice',role:'USER',groupId:1},bob={id:'bob',name:'Bob',role:'USER',groupId:1},teacher={id:'teacher',name:'Teacher',role:'ADMIN'};
  env.DB={prepare:()=>({all:async()=>({results:[alice,bob,teacher].map(u=>({...u,active:1}))})})};
  const boot=async()=>{for(const p of [alice,bob,teacher])await chatCall(env,'CHAT_INBOX',p.id,'/configure',{profile:p,contacts:[alice,bob,teacher].filter(q=>q!==p),groups:[{id:1,title:'A1'}]});};
  const drain=async()=>{while(pending.length)await Promise.all(pending.splice(0));};
  return {env,alice,bob,teacher,boot,drain,close:()=>databases.forEach(db=>db.close())};
}
test('Avatars are private, group photos require staff and presence updates subscribers',async()=>{
  const f=fixture({});try{
    await f.boot();const {env,alice,teacher}=f;
    await chatCall(env,'CHAT_BRIDGE','global','/presence',{id:alice.id,online:true});
    const subscribed=await chatCall(env,'CHAT_INBOX',alice.id,'/command',{action:'profiles',body:{ids:['alice','bob','group:1','outsider','group:9']}});
    assert.deepEqual(subscribed.profiles.map(p=>p.id),['alice','bob','group:1']);
    await chatCall(env,'CHAT_BRIDGE','global','/presence',{id:'bob',online:true});await f.drain();
    assert.equal((await chatCall(env,'CHAT_INBOX',alice.id,'/snapshot',{})).profiles.bob.online,true);
    await chatCall(env,'CHAT_BRIDGE','global','/presence',{id:'bob',online:false});await f.drain();
    const offline=(await chatCall(env,'CHAT_INBOX',alice.id,'/snapshot',{})).profiles.bob;assert.equal(offline.online,false);assert.ok(offline.lastSeen);
    const body={groupId:1,storageKey:'chat/avatars/test',mime:'image/jpeg',size:20};
    await assert.rejects(chatCall(env,'CHAT_BRIDGE','global','/avatar',{...body,actor:alice}),e=>e.status===403);
    await chatCall(env,'CHAT_BRIDGE','global','/avatar',{...body,actor:teacher});await f.drain();
    const group=(await chatCall(env,'CHAT_INBOX',alice.id,'/snapshot',{})).profiles['group:1'];assert.ok(group.avatarUrl.startsWith('/api/messages/avatar?'));assert.equal(group.storageKey,undefined);
    const inbox=env.CHAT_INBOX.get('bob'),socket=()=>({readyState:1,deserializeAttachment:()=>({expires:Date.now()+10000})}),a=socket(),b=socket();inbox.ctx.getWebSockets().push(a,b);
    await inbox.presence(a);assert.equal((await chatCall(env,'CHAT_BRIDGE','global','/profiles',{actor:alice,ids:['bob']})).profiles[0].online,true);
    b.readyState=3;await inbox.presence(a);assert.equal((await chatCall(env,'CHAT_BRIDGE','global','/profiles',{actor:alice,ids:['bob']})).profiles[0].online,false);
    inbox.ctx.getWebSockets().length=0;
    env.CHAT_V2_ENABLED='true';env.CONTENT_ALLOWED_HOST='example.test';env.STORAGE_MODE='production';env.CONTENT_WRITES='true';
    const blobs=new Map();env.CONTENT_MEDIA={put:async(k,v)=>blobs.set(k,v)};
    const app=durableChatWorker({fetch:()=>new Response('unused')},{authenticate:async()=>alice});
    const post=(subject,bytes,type='image/png')=>app.fetch(new Request('https://example.test/api/messages/avatar?subject='+encodeURIComponent(subject),{method:'POST',headers:{Origin:'https://example.test','Content-Type':type},body:bytes}),env,{waitUntil:()=>{}});
    assert.equal((await post('bob',new Uint8Array(10))).status,403);
    assert.equal((await post('group:1',new Uint8Array(10))).status,403);
    assert.equal((await post('alice',new Uint8Array(2*1024*1024+1))).status,413);
    const jpeg=new Uint8Array([255,216,255,224,0,16,74,70,73,70]);const saved=await post('alice',jpeg,'image/jpeg');assert.equal(saved.status,200);assert.ok((await saved.json()).profile.avatarUrl);assert.equal(blobs.size,1);
    const usernameRequest=(body,origin='https://example.test')=>app.fetch(new Request('https://example.test/api/messages/username',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env,{});
    assert.equal((await usernameRequest({username:'@alice',actor:{id:'bob'}})).status,200);assert.equal((await chatCall(env,'CHAT_BRIDGE','global','/profiles',{actor:alice,ids:['alice','bob']})).profiles[0].username,'@alice');
    assert.equal((await usernameRequest({username:'@other'},'https://evil.test')).status,403);assert.equal((await usernameRequest(null)).status,400);
  }finally{await f.drain();f.close();}
});
test('Usernames are case-insensitively unique, independent of login and searchable without bypassing privacy',async()=>{
  const f=fixture({});try{
    await f.boot();const {env,alice,bob}=f,bridge=env.CHAT_BRIDGE.get('global');
    bridge.set('policy',{at:Date.now(),users:[alice,bob,{id:'hidden',role:'USER',hidden:true},{id:'inactive',role:'USER',active:0}],groups:[],members:[]});
    const claim=(actor,username,extra={})=>chatCall(env,'CHAT_BRIDGE','global','/username',{actor,username,...extra});
    assert.equal((await claim(bob,'@BoB_123')).profile.username,'@bob_123');
    await assert.rejects(claim(alice,'@BOB_123'),e=>e.status===409);
    for(const invalid of ['missing_at','@ab','@1name','@has space','@hello-world'])await assert.rejects(claim(alice,invalid),e=>e.status===400);
    assert.equal((await chatCall(env,'CHAT_INBOX',alice.id,'/command',{action:'lookup',body:{query:'@BOB_123'}})).person.id,bob.id);
    await assert.rejects(claim(bob,'@new_bob',{expectedUsername:'@wrong'}),e=>e.status===409);
    await claim(bob,'@new_bob',{expectedUsername:'@bob_123'});assert.equal((await bridge.discover(alice,'@bob_123')).person,null);
    await claim(alice,'@bob_123');assert.equal((await bridge.discover(alice,'@bob_123')).person,null,'Cannot discover self');
    await claim({id:'hidden',role:'USER'},'@hidden');await claim({id:'inactive',role:'USER'},'@inactive');assert.equal((await bridge.discover(alice,'@hidden')).person,null);assert.equal((await bridge.discover(alice,'@inactive')).person,null);
    const concurrent=await Promise.allSettled([claim(alice,'@shared'),claim(bob,'@shared')]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.filter(r=>r.status==='rejected')[0].reason.status,409);
  }finally{await f.drain();f.close();}
});
test('Phone and birthday are stored in separate columns and visibility toggles filter public profiles',async()=>{
  const f=fixture({});try{
    await f.boot();const {env,alice}=f;await chatCall(env,'CHAT_INBOX','bob','/command',{action:'profiles',body:{ids:['alice']}});
    const fields={phone:'+374 99123456',phoneVisible:false,birthday:'1990-04-25',birthdayVisible:false};
    const update=body=>chatCall(env,'CHAT_BRIDGE','global','/profile',{actor:alice,...body});await update(fields);await f.drain();
    assert.deepEqual((await chatCall(env,'CHAT_BRIDGE','global','/profile',{actor:alice,read:true})).details,fields);
    let peer=(await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).profiles.alice;assert.equal(peer.phone,undefined);assert.equal(peer.birthday,undefined);
    await update({...fields,phoneVisible:true});await f.drain();peer=(await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).profiles.alice;assert.equal(peer.phone,fields.phone);assert.equal(peer.birthday,undefined);
    await update({...fields,birthdayVisible:true});await f.drain();peer=(await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).profiles.alice;assert.equal(peer.phone,undefined);assert.equal(peer.birthday,fields.birthday);
    await assert.rejects(update({...fields,birthday:'2024-02-30'}),e=>e.status===400);await assert.rejects(update({...fields,phone:'not a phone'}),e=>e.status===400);
  }finally{await f.drain();f.close();}
});
test('Selected quotes persist, reject forged text, retain retry safety and follow study author restrictions',async()=>{
  const f=fixture();try{await f.boot();const {env,alice,bob,teacher}=f,id=directRoomId(alice.id,bob.id);
    await chatCall(env,'CHAT_INBOX',alice.id,'/command',{action:'open',body:{kind:'direct',accountId:bob.id}});const original=await chatCall(env,'CHAT_ROOM',id,'/send',{actor:bob,text:'Hello Alice, how are you?',clientKey:'quote-source'});
    const body={actor:alice,text:'Fine',replyTo:original.message.id,quote:'how are you?',clientKey:'quote-answer'};const quoted=await chatCall(env,'CHAT_ROOM',id,'/send',body);assert.equal(quoted.message.replyText,body.quote);assert.equal((await chatCall(env,'CHAT_ROOM',id,'/send',body)).message.id,quoted.message.id);
    assert.equal((await chatCall(env,'CHAT_ROOM',id,'/history',{actor:bob})).messages.at(-1).replyText,body.quote);
    await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/send',{...body,quote:'Hello Alice'}),e=>e.status===409);await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/send',{...body,clientKey:'forged',quote:'Invented words'}),e=>e.status===400);
    await chatCall(env,'CHAT_INBOX',alice.id,'/command',{action:'open',body:{kind:'direct',accountId:teacher.id}});const alertRoom=directRoomId(alice.id,teacher.id),alert=await chatCall(env,'CHAT_ROOM',alertRoom,'/send',{actor:teacher,category:'learning',text:'Important study announcement',clientKey:'quote-alert'});
    const result=await chatCall(env,'CHAT_INBOX',alice.id,'/command',{action:'study-reply',body:{sourceRoomId:alertRoom,messageId:alert.message.id,quote:'study announcement',text:'My question',clientKey:'quoted-alert-reply'}});assert.equal(result.roomId,alertRoom);assert.equal(result.message.forwarded.text,'study announcement');
  }finally{await f.drain();f.close();}
});
test('Durable chat persists, deduplicates, searches, publishes counters and read receipts',async()=>{
  const f=fixture();try{
    await f.boot();const {env,alice,bob}=f,id=directRoomId(alice.id,bob.id);
    await chatCall(env,'CHAT_INBOX','alice','/command',{action:'open',body:{kind:'direct',accountId:'bob'}});await f.drain();
    const body={actor:alice,text:'Hello durable chat',clientKey:'message-one',category:'personal'};
    const result=await chatCall(env,'CHAT_ROOM',id,'/send',body);await f.drain();
    assert.equal(result.message.id,1);assert.equal((await chatCall(env,'CHAT_ROOM',id,'/send',body)).message.id,1);
    assert.equal((await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).total,1);
    assert.equal((await chatCall(env,'CHAT_ROOM',id,'/history',{actor:bob,category:'personal',q:'durable'})).messages.length,1);
    await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/history',{actor:{id:'stranger',role:'USER'},category:'personal'}),e=>e.status===403);
    await chatCall(env,'CHAT_ROOM',id,'/read',{actor:bob,category:'personal',through:1});await f.drain();
    assert.equal((await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).total,0);
    assert.equal((await chatCall(env,'CHAT_ROOM',id,'/history',{actor:alice,category:'personal'})).messages[0].read,true);
    assert.equal((await chatCall(env,'CHAT_ROOM',id,'/read',{actor:bob,category:'personal',through:1})).unchanged,true);
    await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/send',{...body,text:'Changed payload'}),e=>e.status===409);
    await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/send',{...body,clientKey:'learning',category:'learning'}),e=>e.status===403);
  }finally{f.close();}
});
test('Academic bridge imports once, retains colored replies and dispatches assignment/review/publication notices',async()=>{
  const sqlite=new DatabaseSync(':memory:');applyTursoSchema(sqlite);let reads=0;
  const values=cmd=>cmd.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value);
  const journal={read:async(sql,args=[])=>{reads++;return sqlite.prepare(sql).all(...args);},readMany:async cmds=>cmds.map(c=>sqlite.prepare(c.sql).all(...values(c))),atomic:async cmds=>{sqlite.exec('BEGIN');try{const result=cmds.map(c=>{const stmt=sqlite.prepare(c.sql);if(stmt.columns().length)return {rows:stmt.all(...values(c)).map(r=>Object.values(r).map(value=>({value:String(value)})))};stmt.run(...values(c));return {rows:[]};});sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const f=fixture(journal);try{
    const {env,alice,bob,teacher}=f,legacy=new MessageService(journal,async()=>[alice,bob,teacher]);await legacy.ensure();
    sqlite.exec("INSERT INTO class_groups(id,title) VALUES(1,'A1');INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES('alice',1,'teacher'),('bob',1,'teacher');INSERT INTO exams(id,title,published) VALUES(1,'Bridge exam',1);INSERT INTO exam_blocks(id,exam_id,position,title,published) VALUES(1,1,0,'Block',1)");
    sqlite.prepare("INSERT INTO exam_materials(id,exam_id,block_id,position,type,content_json) VALUES(1,1,1,0,'task',?)").run(JSON.stringify({type:'task',title:'Answer',text:'Explain',maxPoints:2,scoringVersion:2}));
    const {roomId}=await legacy.open(alice,{kind:'direct',accountId:'bob'}),sent=await legacy.send(alice,{roomId,category:'personal',text:'Colored legacy',format:{runs:[{text:'Colored legacy',marks:{color:'#ff0000'}}]},clientKey:'legacy-color'});
    await legacy.send(bob,{roomId,category:'personal',text:'Reply',replyTo:sent.id,clientKey:'legacy-reply'});await legacy.read(bob,{roomId,category:'personal',through:sent.id});
    await env.CHAT_BRIDGE.get('global').bootstrap(alice);await f.drain();
    const history=await chatCall(env,'CHAT_ROOM',roomId,'/history',{actor:alice,category:'personal'});assert.equal(history.messages.length,2);assert.equal(history.messages[0].id,sent.id);assert.equal(history.messages[0].format.runs[0].marks.color,'#ff0000');assert.equal(history.messages[1].replyText,'Colored legacy');
    const before=reads;await chatCall(env,'CHAT_ROOM',roomId,'/send',{actor:alice,category:'personal',text:'No Turso read',clientKey:'new-chat'});await f.drain();assert.equal(reads,before,'Normal chat does not query Turso');
    await legacy.assign(teacher,{targetKind:'student',targetId:'alice',examId:1,action:'assign',clientKey:'bridge-assignment'});await chatCall(env,'CHAT_BRIDGE','global','/flush',{});await f.drain();
    const id='direct:alice:teacher',notices=await chatCall(env,'CHAT_ROOM',id,'/history',{actor:alice,category:'learning'});assert.equal(notices.messages.length,1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM chat_delivery_outbox').get().n,0);
    await chatCall(env,'CHAT_BRIDGE','global','/flush',{});assert.equal((await chatCall(env,'CHAT_ROOM',id,'/history',{actor:alice,category:'learning'})).messages.length,1);
    const exams=new ExamService(journal),instance=(await exams.list(alice)).find(e=>e.instanceStatus),block=instance.blocks[0],assessment=new AssessmentService(journal),part=block.materials[0];
    await assessment.write(alice,{kind:'exam-block',id:block.id,action:'submit',answers:{[part.id]:{0:'Answer'}}});await chatCall(env,'CHAT_BRIDGE','global','/flush',{});await f.drain();
    const review=await chatCall(env,'CHAT_ROOM',id,'/history',{actor:teacher,category:'learning'});assert.ok(review.messages.some(m=>m.text.startsWith('Ready for review')&&m.examId===instance.id));
    const work=await assessment.get(teacher,{studentId:'alice',kind:'exam-block',id:block.id});
    await assessment.write(teacher,{studentId:'alice',kind:'exam-block',id:block.id,action:'publish',expectedRevision:work.revision,points:{[part.id]:{0:1}},feedback:'Reviewed'});await chatCall(env,'CHAT_BRIDGE','global','/flush',{});await f.drain();
    assert.ok((await chatCall(env,'CHAT_ROOM',id,'/history',{actor:alice,category:'learning'})).messages.some(m=>m.text.includes('Results published')&&m.examId===instance.id));
    await chatCall(env,'CHAT_BRIDGE','global','/invalidate',{});await assert.rejects(chatCall(env,'CHAT_INBOX','alice','/command',{action:'history',body:{roomId,category:'personal'}}),e=>e.status===403);await chatCall(env,'CHAT_BRIDGE','global','/policy',{});assert.equal((await chatCall(env,'CHAT_INBOX','alice','/command',{action:'history',body:{roomId,category:'personal'}})).messages.length,3);
    await chatCall(env,'CHAT_BRIDGE','global','/catalog',{});assert.equal((await chatCall(env,'CHAT_INBOX','teacher','/snapshot',{})).catalogVersion,1);assert.equal((await chatCall(env,'CHAT_INBOX','alice','/snapshot',{})).catalogVersion,0);
  }finally{f.close();sqlite.close();}
});
test('Room outbox retries safely, stale room updates do not erase counters, and attachments remain private',async()=>{
  const f=fixture();try{
    await f.boot();const {env,alice,bob}=f,id=directRoomId(alice.id,bob.id);await chatCall(env,'CHAT_INBOX',alice.id,'/command',{action:'open',body:{kind:'direct',accountId:bob.id}});await f.drain();
    const namespace=env.CHAT_INBOX,original=namespace.get;namespace.get=function(name){if(name==='bob')return {fetch:async()=>Response.json({error:'Temporary failure'},{status:503})};return original.call(namespace,name);};
    await chatCall(env,'CHAT_ROOM',id,'/send',{actor:alice,text:'Retry outbox',category:'personal',clientKey:'outbox-one'});await f.drain();namespace.get=original;
    await env.CHAT_ROOM.get(id).alarm();assert.equal((await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).total,1);await env.CHAT_ROOM.get(id).alarm();assert.equal((await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).total,1);
    const snapshot=await chatCall(env,'CHAT_INBOX','bob','/snapshot',{});await chatCall(env,'CHAT_INBOX','bob','/event',{key:'stale',type:'room',room:{...snapshot.rooms[0],revision:0,unread:{personal:0,learning:0}}});assert.equal((await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).total,1);
    await chatCall(env,'CHAT_ROOM',id,'/file/register',{actor:alice,file:{id:'file-one',name:'test.pdf',mime:'application/pdf',size:100,storageKey:'chat/files/test'}});
    await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/file',{actor:bob,id:'file-one'}),e=>e.status===404);
    await chatCall(env,'CHAT_ROOM',id,'/send',{actor:alice,text:'',files:['file-one'],category:'personal',clientKey:'attachment'});await f.drain();assert.equal((await chatCall(env,'CHAT_ROOM',id,'/file',{actor:bob,id:'file-one'})).name,'test.pdf');
    await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/send',{actor:bob,text:'stolen',files:['file-one'],category:'personal',clientKey:'stolen-file'}),e=>e.status===403);
  }finally{f.close();}
});
test('Room migration preserves history and group changes revoke access without exposing old personal messages',async()=>{
  const f=fixture();try{
    await f.boot();const {env,alice,bob,teacher}=f,id='group:1',room={id,kind:'group',title:'A1',groupId:1};
    await chatCall(env,'CHAT_ROOM',id,'/configure',{room,members:[alice,teacher]});
    await chatCall(env,'CHAT_ROOM',id,'/import',{initial:true,complete:true,messages:[{id:20,sender_id:'teacher',sender_name:'Teacher',category:'personal',body:'Old message',client_key:'legacy-one',created_at:100}]});await f.drain();
    assert.equal((await chatCall(env,'CHAT_ROOM',id,'/history',{actor:alice,category:'personal'})).messages[0].id,20);
    await chatCall(env,'CHAT_ROOM',id,'/configure',{room,members:[alice,bob,teacher]});
    assert.equal((await chatCall(env,'CHAT_ROOM',id,'/history',{actor:bob,category:'personal'})).messages.length,0);
    await chatCall(env,'CHAT_ROOM',id,'/send',{actor:teacher,category:'personal',text:'New message',clientKey:'new-message'});await f.drain();
    await chatCall(env,'CHAT_ROOM',id,'/configure',{room,members:[bob,teacher]});
    await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/history',{actor:alice,category:'personal'}),e=>e.status===403);
    assert.equal((await chatCall(env,'CHAT_ROOM',id,'/history',{actor:bob,category:'personal'})).messages.length,1);
  }finally{f.close();}
});
test('Forwarding preserves content and files, deduplicates retries and rejects study alerts and spoofed origins',async()=>{
  const f=fixture();try{
    await f.boot();const {env,alice,bob,teacher}=f,source=directRoomId(alice.id,bob.id),target=directRoomId(alice.id,teacher.id);
    for(const accountId of ['bob','teacher'])await chatCall(env,'CHAT_INBOX','alice','/command',{action:'open',body:{kind:'direct',accountId}});await f.drain();
    await chatCall(env,'CHAT_ROOM',source,'/file/register',{actor:alice,file:{id:'zip-file',name:'Archive.zip',mime:'application/octet-stream',size:4,storageKey:'chat/files/source-zip'}});
    const original=await chatCall(env,'CHAT_ROOM',source,'/send',{actor:alice,text:'Forward this',format:{runs:[{text:'Forward this',marks:{color:'#ff0000'}}]},files:['zip-file'],category:'personal',clientKey:'source-forward'});await f.drain();
    const body={sourceRoomId:source,messageId:original.message.id,targetRoomId:target,clientKey:'forward-retry'};
    const result=await chatCall(env,'CHAT_INBOX','alice','/command',{action:'forward',body});await f.drain();assert.equal(result.message.forwarded.sender,'Alice');assert.equal(result.message.format.runs[0].marks.color,'#ff0000');assert.notEqual(result.message.files[0].id,'zip-file');
    assert.equal((await chatCall(env,'CHAT_INBOX','alice','/command',{action:'forward',body})).message.id,result.message.id);
    assert.equal((await chatCall(env,'CHAT_ROOM',target,'/history',{actor:teacher,category:'personal'})).messages.length,1);
    assert.equal((await chatCall(env,'CHAT_ROOM',target,'/file',{actor:teacher,id:result.message.files[0].id})).storage_key,'chat/files/source-zip');
    await assert.rejects(chatCall(env,'CHAT_ROOM',source,'/file',{actor:teacher,id:'zip-file'}),e=>e.status===403);
    const alert=await chatCall(env,'CHAT_ROOM',target,'/send',{actor:teacher,text:'Study alert',category:'learning',clientKey:'alert-forward'});await f.drain();
    await assert.rejects(chatCall(env,'CHAT_INBOX','alice','/command',{action:'forward',body:{...body,sourceRoomId:target,targetRoomId:source,messageId:alert.message.id,clientKey:'blocked-forward'}}),e=>e.status===403);
    const spoof=await chatCall(env,'CHAT_ROOM',source,'/send',{actor:alice,text:'Normal',category:'personal',clientKey:'spoof',forwarded:{sender:'Teacher'},payload:{source:'fake'}});assert.equal(spoof.message.forwarded,null);await f.drain();
  }finally{f.close();}
});
test('Chat accepts arbitrary file formats to 25 MB without weakening media rules elsewhere',async()=>{
  const f=fixture();try{
    await f.boot();const {env,alice}=f,roomId=directRoomId('alice','bob');await chatCall(env,'CHAT_INBOX','alice','/command',{action:'open',body:{kind:'direct',accountId:'bob'}});await f.drain();
    const stored=new Map();Object.assign(env,{CHAT_V2_ENABLED:'true',CONTENT_ALLOWED_HOST:'fixture.example',STORAGE_MODE:'production',CONTENT_WRITES:'true',CONTENT_MEDIA:{put:async(key,bytes,meta)=>stored.set(key,{bytes,meta}),get:async key=>{const file=stored.get(key);return file?{size:file.bytes.length,body:file.bytes}:null;}}});
    const worker=durableChatWorker({fetch:()=>{throw new Error('Unexpected unrelated route.');}},{authenticate:async()=>alice});
    const origin='https://fixture.example',path='/api/messages/upload?'+new URLSearchParams({roomId,name:'Archive.zip'});
    const upload=bytes=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/zip'},body:bytes}),env,{});
    const small=await upload(new Uint8Array([80,75,3,4]));assert.equal(small.status,200);const {file}=await small.json();assert.equal(file.mime,'application/octet-stream');
    const exact=await upload(new Uint8Array(CHAT_FILE_LIMIT));assert.equal(exact.status,200);
    const large=await upload(new Uint8Array(CHAT_FILE_LIMIT+1));assert.equal(large.status,413);assert.match((await large.json()).error,/25 MB/);assert.equal(stored.size,2);
    await assert.rejects(chatFileMetadata(new Uint8Array(CHAT_FILE_LIMIT+1),'text/plain'),e=>e.status===413);
    const html=await chatFileMetadata(new TextEncoder().encode('<script>alert(1)</script>'),'text/html');assert.equal(html.mime,'application/octet-stream');
    const box=brand=>{const bytes=new Uint8Array(24);new DataView(bytes.buffer).setUint32(0,24);bytes.set(new TextEncoder().encode('ftyp'+brand),4);bytes.set(new TextEncoder().encode(brand),16);return bytes;};
    assert.equal((await chatFileMetadata(box('heic'),'image/heic')).mime,'image/heic');assert.equal((await chatFileMetadata(box('avif'),'image/avif')).mime,'image/avif');assert.equal((await chatFileMetadata(box('qt  '),'video/quicktime')).mime,'video/quicktime');
    const response=await worker.fetch(new Request(origin+'/api/messages/file?'+new URLSearchParams({roomId,id:file.id})),env,{});assert.equal(response.status,200);assert.match(response.headers.get('Content-Disposition'),/^attachment/);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[80,75,3,4]);
    const range=await chatFileResponse({get:async()=>({size:10,range:{offset:2,length:3},body:new Uint8Array([1,2,3])})},{storage_key:'key',mime:'application/octet-stream',name:'file.bin'},new Request(origin,{headers:{Range:'bytes=2-4'}}));assert.equal(range.status,206);assert.equal(range.headers.get('Content-Range'),'bytes 2-4/10');
  }finally{f.close();}
});
test('Link previews reject unsafe targets, use cached URL cards and never fetch arbitrary private hosts',async()=>{
  for(const url of ['javascript:alert(1)','file:///etc/passwd','https://localhost','https://127.0.0.1','https://2130706433','https://[::1]','https://example.com:8443','https://user:password@example.com','https://server.internal'])assert.equal(chatPreviewUrl(url),null);
  assert.equal(chatPreviewUrl('https://example.com/path')?.hostname,'example.com');
  const map=new Map(),cache={match:async key=>map.get(key)?.clone(),put:async(key,value)=>map.set(key,value.clone())};let calls=0;
  const result=await chatLinkPreview('https://example.com/path','https://fixture.example',()=>{calls++;},cache);assert.equal(result.title,'example.com');assert.equal(result.description,'/path');assert.equal(calls,0);assert.deepEqual(await chatLinkPreview(result.url,'https://fixture.example',()=>{throw new Error('Unexpected network request.');},cache),result);
});
test('Outside-group discovery is exact, rate limited and requires consent; peers and teachers cannot be blocked',async()=>{
  const journal={readMany:async()=>[[{id:1,title:'A1'},{id:2,title:'B1'}],[{account_id:'alice',group_id:1},{account_id:'bob',group_id:2}]]},f=fixture(journal);
  try{
    const {env,alice,bob,teacher}=f;env.DB={prepare:()=>({all:async()=>({results:[{...alice,login:'alice',email:'alice@example.com',active:1},{...bob,login:'bob',email:'bob@example.com',active:1},{...teacher,active:1}]})})};
    const bridge=env.CHAT_BRIDGE.get('global');bridge.set('journalVersion',1);await bridge.policy();await f.drain();
    await assert.rejects(chatCall(env,'CHAT_INBOX','alice','/command',{action:'open',body:{kind:'direct',accountId:'bob'}}),e=>e.status===403);
    assert.equal((await chatCall(env,'CHAT_INBOX','alice','/command',{action:'lookup',body:{query:'bob@exam'}})).person,null);
    assert.equal((await chatCall(env,'CHAT_INBOX','alice','/command',{action:'lookup',body:{query:'BOB@example.com'}})).person.id,'bob');
    const {roomId}=await chatCall(env,'CHAT_INBOX','alice','/command',{action:'open',body:{kind:'direct',accountId:'bob'}});await f.drain();
    const send=()=>chatCall(env,'CHAT_INBOX','alice','/command',{action:'send',body:{roomId,category:'personal',text:'May we chat?',clientKey:'request-one'}});
    await send();await f.drain();assert.equal((await send()).sent,true,'Request retries are idempotent');
    await assert.rejects(chatCall(env,'CHAT_INBOX','alice','/command',{action:'send',body:{roomId,text:'Another',clientKey:'request-two'}}),e=>e.status===403);
    assert.equal((await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).rooms.find(r=>r.id===roomId).access.canAccept,true);
    await chatCall(env,'CHAT_INBOX','bob','/command',{action:'send',body:{roomId,text:'Accepted by replying',clientKey:'accept-reply'}});await f.drain();
    assert.equal((await chatCall(env,'CHAT_ROOM',roomId,'/summary',{actor:alice})).room.access.state,'accepted');
    await chatCall(env,'CHAT_INBOX','bob','/command',{action:'relation',body:{roomId,action:'block'}});await f.drain();
    assert.equal((await chatCall(env,'CHAT_INBOX','bob','/command',{action:'blocked'})).users[0].id,'alice');
    await assert.rejects(chatCall(env,'CHAT_INBOX','alice','/command',{action:'send',body:{roomId,text:'Blocked',clientKey:'blocked'}}),e=>e.status===403);
    await chatCall(env,'CHAT_INBOX','bob','/command',{action:'relation',body:{roomId,action:'unblock'}});await f.drain();
    assert.equal((await chatCall(env,'CHAT_INBOX','bob','/command',{action:'blocked'})).users.length,0);
    const peer=await chatCall(env,'CHAT_INBOX','alice','/command',{action:'open',body:{kind:'direct',accountId:'teacher'}});
    await assert.rejects(chatCall(env,'CHAT_INBOX','alice','/command',{action:'relation',body:{roomId:peer.roomId,action:'block'}}),e=>e.status===403);
    env.CHAT_ROOM.get(roomId).configure({room:{id:roomId,kind:'direct'},members:[alice,{...bob,groupId:1}]});
    await assert.rejects(chatCall(env,'CHAT_ROOM',roomId,'/relation',{actor:alice,action:'block'}),e=>e.status===403);
    await f.drain();for(let i=0;i<8;i++)await chatCall(env,'CHAT_INBOX','alice','/command',{action:'lookup',body:{query:'nobody'}});
    await assert.rejects(chatCall(env,'CHAT_INBOX','alice','/command',{action:'lookup',body:{query:'bob'}}),e=>e.status===429);
  }finally{await f.drain();f.close();}
});
test('Declining stops further requests, and only the incoming recipient can accept',async()=>{
  const f=fixture();try{await f.boot();const {alice,bob,env}=f,id=directRoomId('alice','bob');await chatCall(env,'CHAT_ROOM',id,'/configure',{room:{id,kind:'direct'},members:[alice,{...bob,groupId:2}]});await chatCall(env,'CHAT_ROOM',id,'/import',{initial:true,complete:true,messages:[]});
    await chatCall(env,'CHAT_ROOM',id,'/send',{actor:alice,text:'Request',clientKey:'first'});
    await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/relation',{actor:alice,action:'accept'}),e=>e.status===403);
    await chatCall(env,'CHAT_ROOM',id,'/relation',{actor:bob,action:'reject'});
    await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/send',{actor:alice,text:'Retry after rejection',clientKey:'second'}),e=>e.status===403);
    await assert.rejects(chatCall(env,'CHAT_ROOM',id,'/send',{actor:bob,text:'No bypass either',clientKey:'third'}),e=>e.status===403);
  }finally{await f.drain();f.close();}
});
test('Edit, delete, pin and reactions persist with per-viewer permissions, search and unread counters',async()=>{
  const f=fixture();try{await f.boot();const {alice,bob,env}=f,{roomId}=await chatCall(env,'CHAT_INBOX','alice','/command',{action:'open',body:{kind:'direct',accountId:'bob'}});
    await chatCall(env,'CHAT_ROOM',roomId,'/file/register',{actor:alice,file:{id:'audio',name:'audio.wav',mime:'audio/wav',size:44,storageKey:'chat/files/audio'}});
    const {message}=await chatCall(env,'CHAT_ROOM',roomId,'/send',{actor:alice,text:'Original words',files:['audio'],clientKey:'editable'});await f.drain();
    assert.equal((await chatCall(env,'CHAT_ROOM',roomId,'/history',{actor:bob})).messages[0].canEdit,false);
    await assert.rejects(chatCall(env,'CHAT_ROOM',roomId,'/edit',{actor:bob,id:message.id,text:'Stolen'}),e=>e.status===403);
    const edited=await chatCall(env,'CHAT_ROOM',roomId,'/edit',{actor:alice,id:message.id,text:'Improved words',expectedEditedMs:0});await f.drain();assert.ok(edited.message.editedMs);
    assert.equal((await chatCall(env,'CHAT_ROOM',roomId,'/history',{actor:bob,q:'Original'})).messages.length,0);assert.equal((await chatCall(env,'CHAT_ROOM',roomId,'/history',{actor:bob,q:'Improved'})).messages.length,1);
    await assert.rejects(chatCall(env,'CHAT_ROOM',roomId,'/edit',{actor:alice,id:message.id,text:'Stale',expectedEditedMs:0}),e=>e.status===409);
    await chatCall(env,'CHAT_ROOM',roomId,'/pin',{actor:bob,id:message.id});assert.equal((await chatCall(env,'CHAT_ROOM',roomId,'/summary',{actor:alice})).room.pinned.id,message.id);
    await chatCall(env,'CHAT_ROOM',roomId,'/react',{actor:bob,id:message.id,emoji:'\u{1f44d}'});await f.drain();const reactions=(await chatCall(env,'CHAT_ROOM',roomId,'/history',{actor:bob})).messages[0].reactions;assert.equal(reactions[0].mine,true);assert.equal((await chatCall(env,'CHAT_ROOM',roomId,'/history',{actor:alice})).messages[0].reactions[0].mine,false);
    assert.equal((await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).total,1,'Edits and reactions do not add unread messages');
    await chatCall(env,'CHAT_ROOM',roomId,'/delete',{actor:alice,id:message.id});await f.drain();const deleted=(await chatCall(env,'CHAT_ROOM',roomId,'/history',{actor:bob})).messages[0];assert.equal(deleted.deleted,true);assert.deepEqual(deleted.files,[]);assert.equal((await chatCall(env,'CHAT_INBOX','bob','/snapshot',{})).total,0);assert.equal((await chatCall(env,'CHAT_ROOM',roomId,'/summary',{actor:bob})).room.pinned,null);
    await assert.rejects(chatCall(env,'CHAT_ROOM',roomId,'/file',{actor:alice,id:'audio'}),e=>e.status===404);await assert.rejects(chatCall(env,'CHAT_ROOM',roomId,'/forward/source',{actor:bob,id:message.id}),e=>e.status===403);
  }finally{await f.drain();f.close();}
});
test('Study references from a group go strictly to the teacher, including media and a comment',async()=>{
  const f=fixture();try{await f.boot();const {env,alice,bob,teacher}=f,group='group:1';await chatCall(env,'CHAT_ROOM',group,'/configure',{room:{id:group,kind:'group',groupId:1,title:'A1'},members:[alice,bob,teacher]});await chatCall(env,'CHAT_ROOM',group,'/import',{initial:true,complete:true,messages:[]});await f.drain();
    await chatCall(env,'CHAT_ROOM',group,'/file/register',{actor:teacher,file:{id:'teacher-video',name:'lesson.mp4',mime:'video/mp4',size:100,storageKey:'chat/files/lesson-video'}});
    const {message}=await chatCall(env,'CHAT_ROOM',group,'/send',{actor:teacher,text:'Important homework',category:'learning',files:['teacher-video'],clientKey:'group-alert'});await f.drain();
    await assert.rejects(chatCall(env,'CHAT_ROOM',group,'/send',{actor:alice,text:'Do not quote to group',replyTo:message.id,clientKey:'wrong-group'}),e=>e.status===403);
    const result=await chatCall(env,'CHAT_INBOX','alice','/command',{action:'study-reply',body:{sourceRoomId:group,messageId:message.id,text:'My question',clientKey:'study-comment',targetRoomId:directRoomId('alice','bob')}});await f.drain();
    assert.equal(result.roomId,directRoomId('alice','teacher'));assert.equal(result.message.text,'My question');assert.equal(result.message.forwarded.text,'Important homework');assert.equal(result.message.files[0].mime,'video/mp4');assert.equal(result.message.forwardTo,'teacher');
    assert.equal((await chatCall(env,'CHAT_ROOM',result.roomId,'/file',{actor:teacher,id:result.message.files[0].id})).storage_key,'chat/files/lesson-video');
    assert.equal((await chatCall(env,'CHAT_INBOX','alice','/command',{action:'study-reply',body:{sourceRoomId:group,messageId:message.id,text:'My question',clientKey:'study-comment'}})).message.id,result.message.id);
    const other=await chatCall(env,'CHAT_INBOX','alice','/command',{action:'open',body:{kind:'direct',accountId:'bob'}});await f.drain();
    await assert.rejects(chatCall(env,'CHAT_INBOX','alice','/command',{action:'forward',body:{sourceRoomId:result.roomId,messageId:result.message.id,targetRoomId:other.roomId,clientKey:'leak-alert'}}),e=>e.status===403);
    assert.equal((await chatCall(env,'CHAT_ROOM',group,'/history',{actor:bob,category:'personal'})).messages.length,0);
  }finally{await f.drain();f.close();}
});
test('Download disposition preserves playable MIME and range responses for forwarded media',async()=>{
  const file={storage_key:'chat/files/audio',mime:'audio/wav',name:'voice.wav'},store={get:async()=>({size:44,body:new Uint8Array(44)}),head:async()=>({size:44})};
  const inline=await chatFileResponse(store,file,new Request('https://fixture.example/api/messages/file?id=one'));assert.equal(inline.headers.get('Content-Type'),'audio/wav');assert.match(inline.headers.get('Content-Disposition'),/^inline/);
  const download=await chatFileResponse(store,file,new Request('https://fixture.example/api/messages/file?id=one&download=1'));assert.match(download.headers.get('Content-Disposition'),/^attachment/);assert.equal(download.headers.get('Content-Type'),'audio/wav');
});
