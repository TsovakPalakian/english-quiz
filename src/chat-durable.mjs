import {validateColorDocument} from './text-formatting.mjs';
import {profileAllowed,publicProfile} from './chat-profiles.mjs';
import {chatStorageName,chatDatabaseHeaders,prepareChatDatabase,assertChatRunning} from './chat-database.mjs';
import {SOUND_IDS} from './notification-sounds.mjs';
import {chatCipher} from './chat-encryption.mjs';
import {transferObject,trackTransferTask} from './account-transfer.mjs';
import {assertAccountTransferRunning} from './account-transfer-guard.mjs';

const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const staff=actor=>['ADMIN','DEVELOPER'].includes(actor?.role);
const publicName=actor=>actor.role==='DEVELOPER'?'Support':actor.name||actor.login||'Student';
const publicRole=actor=>actor.role==='USER'?'Student':actor.role==='DEVELOPER'?'Support':'Teacher';
const ref=value=>{if(typeof value!=='string'||! /^[A-Za-z0-9:_-]{1,180}$/.test(value))fail(400,'Invalid reference.');return value;};
const integer=value=>{if(!Number.isSafeInteger(value)||value<0)fail(400,'Invalid cursor.');return value;};
const category=value=>{if(!['personal','learning'].includes(value))fail(400,'Invalid category.');return value;};
export const directRoomId=(a,b)=>'direct:'+ [ref(a),ref(b)].sort().join(':');
export async function chatCall(env,binding,id,path,body){
  assertAccountTransferRunning(env);
  const namespace=env[binding];if(!namespace)fail(503,'Chat storage unavailable.');
  const response=await namespace.get(namespace.idFromName(chatStorageName(env,id))).fetch(new Request('https://chat.internal'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Chat-Internal':env.CONTENT_SESSION_SECRET||env.SESSION_SECRET,...chatDatabaseHeaders(env)},body:JSON.stringify(body)}));
  const value=await response.json();if(!response.ok)fail(response.status,value.error||'Chat request failed.');return value;
}
class Store{
  constructor(ctx,env){this.ctx=ctx;this.baseEnv=env;this.env=env;this.sql=ctx.storage.sql;this.cipher=chatCipher(env);}
  rows(query,...args){return this.sql.exec(query,...args).toArray().map(row=>{if(this.cipher)for(const column of ['body','format','payload','data','value'])if(column in row)row[column]=this.cipher.open(row[column],this.cryptoScope(column));return row;});}
  cryptoScope(column){return (this.storageKind==='room'?'ChatRoom':'ChatInbox')+':'+(this.ctx.id?.toString()||'')+':'+column;}
  seal(value,column){return this.cipher?this.cipher.seal(value,this.cryptoScope(column)):value;}
  one(query,...args){return this.rows(query,...args)[0];}
  tx(fn){return this.ctx.storage.transactionSync(fn);}
  get(key,fallback=null){const row=this.one('SELECT value FROM meta WHERE key=?',key);return row?JSON.parse(row.value):fallback;}
  set(key,value){this.sql.exec('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,this.seal(JSON.stringify(value),'value'));}
  async trusted(request){const selected=await prepareChatDatabase(this,request);if(!this.cipher)this.cipher=chatCipher(this.env);if(this.cipher)this.encryptLegacy();return selected;}
  encryptLegacy(){
    if(this.get('crypto:migrated')==='aes256gcm-v1')return;
    const tables=this.storageKind==='room'?[['meta','key',['value']],['messages','id',['body','format']],['outbox','id',['payload']]]:[['meta','key',['value']],['rooms','id',['data']],['events','id',['data']]];
    let more=false;
    this.tx(()=>{for(const [table,key,columns] of tables)for(const column of columns){const rows=this.sql.exec('SELECT '+key+','+column+' FROM '+table+' WHERE '+column+" IS NOT NULL AND "+column+" NOT LIKE 'chatenc:%' LIMIT 100").toArray();for(const row of rows)this.sql.exec('UPDATE '+table+' SET '+column+'=? WHERE '+key+'=?',this.seal(row[column],column),row[key]);if(rows.length===100)more=true;}if(!more)this.set('crypto:migrated','aes256gcm-v1');});
    if(more)this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now()+1000));
  }
  async handle(request,fn){return trackTransferTask(this,async()=>{try{await this.trusted(request);return json(await fn(new URL(request.url).pathname,await request.json()));}catch(error){return json({error:error.status?error.message:'Chat temporarily unavailable.'},error.status||503);}});}
}

export class ChatRoom extends Store{
  constructor(ctx,env){super(ctx,env);this.storageKind='room';this.flushing=null;if(env.ACCOUNT_TRANSFER_ROLE==='source'&&this.sql.exec("SELECT name FROM sqlite_master WHERE name='messages'").toArray().length)return;this.sql.exec(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,joined INTEGER NOT NULL DEFAULT 0,read_personal INTEGER NOT NULL DEFAULT 0,read_learning INTEGER NOT NULL DEFAULT 0,delivered_personal INTEGER NOT NULL DEFAULT 0,delivered_learning INTEGER NOT NULL DEFAULT 0,unread_personal INTEGER NOT NULL DEFAULT 0,unread_learning INTEGER NOT NULL DEFAULT 0,muted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,sender TEXT NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL,body TEXT NOT NULL,format TEXT,reply INTEGER,exam_id INTEGER,assignment_active INTEGER,client_key TEXT NOT NULL,created_ms INTEGER NOT NULL,UNIQUE(sender,client_key));
    CREATE INDEX IF NOT EXISTS messages_category_sequence ON messages(category,id);
    CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,recipient TEXT NOT NULL,event_key TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(recipient,event_key));
    CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,storage_key TEXT NOT NULL,created_ms INTEGER NOT NULL,message_id INTEGER);
  `);
    const columns=new Set(this.rows('PRAGMA table_info(messages)').map(c=>c.name));
    if(!columns.has('edited_ms'))this.sql.exec('ALTER TABLE messages ADD COLUMN edited_ms INTEGER NOT NULL DEFAULT 0');
    if(!columns.has('deleted'))this.sql.exec('ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
    this.sql.exec('DROP TRIGGER IF EXISTS message_search_insert;DROP TRIGGER IF EXISTS message_search_update;DROP TABLE IF EXISTS message_search;');
    this.flushing=null;
  }
  member(actor){
    if(!actor?.id||!this.get('room')?.active)fail(403,'This conversation is unavailable.');
    let row=this.one('SELECT * FROM members WHERE id=? AND active=1',actor.id);
    if(!row&&staff(actor)&&this.get('room').kind==='group'){
      const last=this.one('SELECT COALESCE(MAX(id),0) id FROM messages').id;
      this.sql.exec('INSERT INTO members(id,name,role,read_personal,read_learning) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=1,name=excluded.name,role=excluded.role,joined=0',actor.id,publicName(actor),actor.role,last,last);
      row=this.one('SELECT * FROM members WHERE id=?',actor.id);
    }
    if(!row)fail(403,'This is a private conversation.');return {...row,joined:this.visibilityFloor(actor.id,row.joined)};
  }
  visibilityFloor(account,joined=0){return Math.max(joined,this.get('cleared:'+account,0),this.get('cleared:everyone',0));}
  settings(account){const value=this.get('settings:'+account,{}),legacy=this.one('SELECT muted FROM members WHERE id=?',account);return {...value,muted:value.muteUntil===undefined?!!legacy?.muted:value.muteUntil===-1||value.muteUntil>Date.now()};}
  summary(account){
    const m=this.one('SELECT * FROM members WHERE id=? AND active=1',account),room=this.get('room');if(!m||!room?.active)return null;
    const peer=room.kind==='direct'?this.one('SELECT id,name,role FROM members WHERE id<>? LIMIT 1',account):null;
    const floor=this.visibilityFloor(account,m.joined),settings=this.settings(account);
    const last=this.one("SELECT * FROM messages WHERE deleted=0 AND (id>? OR category='learning') ORDER BY id DESC LIMIT 1",floor);
    const counts=this.get('counts',{personal:0,learning:0});
    return {id:room.id,kind:room.kind,groupId:room.groupId||null,peerId:peer?.id,peerRole:peer?publicRole(peer):null,title:peer?.name||room.title,access:this.access(account),pinned:this.pinned(account),revision:this.get('revision',0),unread:{personal:m.unread_personal,learning:m.unread_learning},has:{personal:counts.personal>0,learning:counts.learning>0},hadPersonal:counts.personal>0||this.get('hadPersonal',false),...settings,lastId:last?.id||0,lastMessage:last?{id:last.id,text:last.body.slice(0,160),category:last.category,sender:last.name,createdMs:last.created_ms}:null,members:this.one('SELECT COUNT(*) n FROM members WHERE active=1').n};
  }
  access(account){
    if(this.get('room')?.kind==='group'&&this.get('settings:'+account,{})?.deletedGroup)return {protected:true,blocked:true,blockedByMe:true,state:'accepted',canSend:false};
    const protectedChat=this.get('protected',true),blocks=this.get('blocks',[]),consent=this.get('consent',{state:'new'}),blocked=!protectedChat&&blocks.length>0;
    return {protected:protectedChat,blocked,blockedByMe:!protectedChat&&blocks.includes(account),state:protectedChat?'accepted':consent.state,requestedBy:consent.requestedBy,canAccept:!protectedChat&&!blocked&&consent.state==='pending'&&consent.requestedBy!==account,canSend:!blocked&&(protectedChat||consent.state==='accepted'||consent.state==='new'||consent.state==='pending'&&consent.requestedBy!==account)};
  }
  writable(actor){const access=this.access(actor.id);if(!access.canSend)fail(403,access.blocked?'This conversation is blocked.':access.state==='rejected'?'The message request was declined.':'Wait for this person to accept your message request.');}
  pinned(account){const id=this.get('pinned'),m=this.one('SELECT joined FROM members WHERE id=?',account),row=id?this.one("SELECT id,body,category FROM messages WHERE id=? AND deleted=0 AND (id>? OR category='learning')",id,this.visibilityFloor(account,m?.joined||0)):null;return row?{id:row.id,text:row.body.slice(0,120),category:row.category}:null;}
  message(row,account){
    const peer=this.one('SELECT MIN(read_'+row.category+') read,MIN(delivered_'+row.category+') delivered FROM members WHERE active=1 AND id<>?',account);
    const member=this.one('SELECT joined FROM members WHERE id=?',account);if(member)member.joined=this.visibilityFloor(account,member.joined);
    const reply=row.reply?this.one("SELECT body,name,category,deleted FROM messages WHERE id=? AND (id>? OR category='learning')",row.reply,member?.joined||0):null;
    if(reply&&!reply.deleted&&!reply.body)reply.body=this.get('files:'+row.reply,[]).map(file=>file.name).join(', ')||'Message';
    if(reply&&!reply.deleted){const quote=this.get('quote:'+row.id);if(quote)reply.body=quote;}
    const files=this.get('files:'+row.id,[]),forward=this.get('forward:'+row.id);
    const peers=this.rows('SELECT id,role FROM members WHERE active=1'),sender=peers.find(p=>p.id===row.sender);
    return {id:row.id,senderId:row.sender,sender:row.name,category:row.category,text:row.deleted?'Message deleted':row.body,deleted:!!row.deleted,editedMs:row.edited_ms,canEdit:!row.deleted&&!row.exam_id&&row.sender===account,canStudyReply:!row.deleted&&row.category==='learning'&&row.sender!==account&&staff(sender),reactions:row.deleted?[]:Object.entries(this.get('reactions:'+row.id,{})).map(([emoji,ids])=>({emoji,count:ids.length,mine:ids.includes(account)})),format:!row.deleted&&row.format?JSON.parse(row.format):null,files:row.deleted?[]:files,forwarded:row.deleted?null:forward?.label||null,forwardTo:forward?.recipientId||null,createdMs:row.created_ms,created:Math.floor(row.created_ms/1000),clientKey:row.client_key,replyTo:row.deleted?null:row.reply,replyText:reply?.deleted?'Message deleted':reply?.body,replySender:reply?.name,replyCategory:reply?.category,examId:row.deleted?null:row.exam_id,assignmentActive:row.assignment_active==null?null:!!row.assignment_active,read:(peer?.read||0)>=row.id,delivered:(peer?.delivered||0)>=row.id};
  }
  emit(key,type,extra={},recipients=null){
    const room=this.get('room');
    this.set('revision',this.get('revision',0)+1);
    for(const member of this.rows('SELECT id,joined FROM members WHERE active=1')){
      if(recipients&&!recipients.has(member.id))continue;
      if(extra.message&&extra.message.category==='personal'&&extra.message.id<=this.visibilityFloor(member.id,member.joined))continue;
      const summary=this.summary(member.id),payload={type,room:summary,...extra};
      if(extra.message)payload.message=this.message(this.one('SELECT * FROM messages WHERE id=?',extra.message.id),member.id);
      this.sql.exec('INSERT OR IGNORE INTO outbox(recipient,event_key,payload) VALUES(?,?,?)',member.id,room.id+':'+key,this.seal(JSON.stringify(payload),'payload'));
    }
  }
  deliver(){this.ctx.waitUntil(this.flush());}
  async flush(){
    if(this.flushing)return this.flushing;
    this.flushing=(async()=>{
      await assertChatRunning(this);
      try{
        for(const row of this.rows('SELECT * FROM outbox ORDER BY id LIMIT 100')){
          await chatCall(this.env,'CHAT_INBOX',row.recipient,'/event',{key:row.event_key,...JSON.parse(row.payload)});
          this.sql.exec('DELETE FROM outbox WHERE id=?',row.id);
        }
      }finally{await assertChatRunning(this);if(this.one('SELECT COUNT(*) n FROM outbox').n||this.cipher&&this.get('crypto:migrated')!=='aes256gcm-v1')await this.ctx.storage.setAlarm(Date.now()+3000);else await this.ctx.storage.deleteAlarm();}
    })().catch(()=>{}).finally(()=>{this.flushing=null;});return this.flushing;
  }
  async alarm(){return trackTransferTask(this,async()=>{try{await this.trusted();await this.flush();}catch(error){if(!error.inactiveDatabase&&!error.migrationFrozen)await this.ctx.storage.setAlarm(Date.now()+10000);}});}
  configure(body){
    const room={...body.room,active:body.room.active!==false};ref(room.id);
    const old=this.get('room'),previousMembers=new Map(this.rows('SELECT * FROM members').map(m=>[m.id,m])),last=this.one('SELECT COALESCE(MAX(id),0) id FROM messages').id;
    this.tx(()=>{
      this.set('room',room);
      const members=body.members||[],protectedChat=room.kind==='group'||members.some(staff)||members.length===2&&members[0].groupId!=null&&members[0].groupId===members[1].groupId;
      const oldProtected=this.get('protected',null);this.set('protected',!!protectedChat);if(protectedChat)this.set('blocks',[]);
      if(old&&oldProtected===null&&!protectedChat&&this.get('counts')?.personal)this.set('consent',{state:'accepted'});
      if(room.kind==='group')this.sql.exec('UPDATE members SET active=0');
      for(const member of body.members||[]){
        const previous=previousMembers.get(member.id),joined=previous?.active?previous.joined:old&&member.role==='USER'?last:member.joined||0;
        this.sql.exec('INSERT INTO members(id,name,role,active,joined,read_personal,read_learning,delivered_personal,delivered_learning,muted) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,active=excluded.active,joined=excluded.joined',ref(member.id),publicName(member),member.role,member.active===false?0:1,joined,member.readPersonal||joined,member.readLearning||0,member.readPersonal||joined,member.readLearning||0,+!!member.muted);
        if(room.kind==='group'&&previous&&!previous.active&&member.role==='USER')this.sql.exec('UPDATE members SET read_personal=MAX(read_personal,?),delivered_personal=MAX(delivered_personal,?),unread_personal=0 WHERE id=?',joined,joined,member.id);
      }
      const changed=oldProtected!==!!protectedChat||JSON.stringify(old)!==JSON.stringify(room)||JSON.stringify([...previousMembers.values()].map(m=>[m.id,m.name,m.role,m.active]).sort())!==JSON.stringify(this.rows('SELECT * FROM members').map(m=>[m.id,m.name,m.role,m.active]).sort());
      if(changed)this.emit('configured:'+this.get('revision',0),'room',room.active?{}:{removeRoom:room.id});
    });
    this.deliver();
    return {configured:true,migrated:!!this.get('migrated')};
  }
  import(body){
    this.tx(()=>{
      for(const m of body.messages||[]){
        const found=this.one('SELECT id FROM messages WHERE sender=? AND client_key=?',m.sender_id,m.client_key);if(found)continue;
        const counts=this.get('counts',{personal:0,learning:0});counts[m.category]++;this.set('counts',counts);
        const columns='sender,name,category,body,format,reply,exam_id,assignment_active,client_key,created_ms';
        const values=[m.sender_id,m.sender_name,m.category,this.seal(m.body,'body'),this.seal(m.format_json||null,'format'),m.reply_to||null,m.exam_instance_id||m.exam_id||null,m.exam_instance_id?1:m.assignment_active==null?null:+m.assignment_active,m.client_key,m.created_ms||m.created_at*1000];
        if(body.initial)this.sql.exec('INSERT INTO messages(id,'+columns+') VALUES(?,?,?,?,?,?,?,?,?,?,?)',m.id,...values);
        else{
          this.sql.exec('INSERT INTO messages('+columns+') VALUES(?,?,?,?,?,?,?,?,?,?)',...values);
          const id=this.one('SELECT last_insert_rowid() id').id;
          this.sql.exec('UPDATE members SET unread_learning=unread_learning+1 WHERE active=1 AND id<>?',m.sender_id);
          this.emit('message:'+id,'message',{message:this.message(this.one('SELECT * FROM messages WHERE id=?',id),m.sender_id)});
        }
      }
      if(body.complete){
        if(body.initial&&this.get('counts')?.personal)this.set('consent',{state:'accepted'});
        if(body.initial)for(const member of body.members||[])this.sql.exec('UPDATE members SET joined=?,read_personal=?,read_learning=?,delivered_personal=?,delivered_learning=?,muted=? WHERE id=?',member.joined_seq||0,member.read_personal||0,member.read_learning||0,member.read_personal||0,member.read_learning||0,member.muted||0,member.account_id);
        this.set('migrated',true);
        for(const member of this.rows('SELECT * FROM members'))for(const kind of ['personal','learning'])this.sql.exec('UPDATE members SET unread_'+kind+'=? WHERE id=?',this.one("SELECT COUNT(*) n FROM messages WHERE deleted=0 AND category=? AND sender<>? AND id>? AND (id>? OR category='learning')",kind,member.id,member['read_'+kind],member.joined).n,member.id);
        this.emit('import','room');
      }
    });this.deliver();return {imported:true};
  }
  history(actor,body){
    const member=this.member(actor),kind=category(body.category||'personal'),before=integer(body.before||0),after=integer(body.after||0),q=String(body.q||'').trim().slice(0,120);
    const terms=(q.match(/[\p{L}\p{N}_]+/gu)||[]).map(word=>word.toLocaleLowerCase());
    const rows=[];let cursor=0;
    do{const batch=this.rows("SELECT m.* FROM messages m WHERE m.category=? AND (m.id>? OR m.category='learning') AND (?=0 OR m.id<?) AND (?=0 OR m.id>?) AND (?=0 OR "+(after?'m.id>?':'m.id<?')+") ORDER BY m.id "+(after?'ASC':'DESC')+' LIMIT 100',kind,member.joined,before,before,after,after,cursor,cursor);
      for(const row of batch){const words=terms.length?(row.body.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu)||[]):[];if(terms.every(term=>words.some(word=>word.startsWith(term))))rows.push(row);if(rows.length===51)break;}
      if(rows.length===51||batch.length<100)break;cursor=batch.at(-1).id;
    }while(true);
    const page=rows.slice(0,50);if(!after)page.reverse();
    return {messages:page.map(row=>this.message(row,actor.id)),more:rows.length>50,readThrough:member['read_'+kind],room:this.summary(actor.id)};
  }
  forwardSource(actor,id,study=false){
    const member=this.member(actor),row=this.one('SELECT * FROM messages WHERE id=?',integer(id));
    if(!row||row.deleted||row.category==='personal'&&row.id<=member.joined)fail(403,'Original message unavailable.');
    const sender=this.one('SELECT role FROM members WHERE id=? AND active=1',row.sender);
    if(study?row.category!=='learning'||row.sender===actor.id||!staff(sender):row.category!=='personal')fail(403,'Study alerts can only be sent back to their teacher.');
    const previous=this.get('forward:'+row.id),origin=previous?.origin||{roomId:this.get('room').id,messageId:row.id,category:row.category};
    return {source:this.get('room').id+':'+row.id,origin,recipientId:study?row.sender:previous?.recipientId||null,text:row.body,format:row.format?JSON.parse(row.format):null,label:study?{sender:row.name,senderId:row.sender,createdMs:row.created_ms,text:row.body,study:true}:previous?.label||{sender:row.name,senderId:row.sender,createdMs:row.created_ms},files:this.rows('SELECT * FROM files WHERE message_id=?',row.id)};
  }
  original(actor,id){
    const member=this.member(actor),row=this.one('SELECT * FROM messages WHERE id=?',integer(id));
    if(!row||row.deleted||row.category==='personal'&&row.id<=member.joined)fail(404,'Original message unavailable.');
    const forwarded=this.get('forward:'+row.id);
    if(forwarded?.origin)return {reference:forwarded.origin};
    if(forwarded?.source){const split=forwarded.source.lastIndexOf(':');return {reference:{roomId:forwarded.source.slice(0,split),messageId:Number(forwarded.source.slice(split+1))}};}
    return {roomId:this.get('room').id,messageId:row.id,category:row.category};
  }
  forward(actor,body){
    this.member(actor);const client=ref(body.clientKey),payload=body.payload,old=this.one('SELECT * FROM messages WHERE sender=? AND client_key=?',actor.id,client);
    if(payload.recipientId&&this.get('room').id!==directRoomId(actor.id,payload.recipientId))fail(403,'Send this alert only to its teacher.');
    if(old&&(this.get('forward:'+old.id)?.label?.quote??null)!==(payload.label?.quote??null))fail(409,'This message key was already used.');
    const text=payload.recipientId&&body.comment?String(body.comment).trim():payload.text,format=payload.recipientId&&body.comment?body.format:payload.format;
    if(old){if(this.get('forward:'+old.id)?.source!==payload.source||old.body!==text)fail(409,'This message key was already used.');return {message:this.message(old,actor.id),sent:true};}
    this.writable(actor);
    const ids=[];
    try{
      for(const file of payload.files){const id=crypto.randomUUID();this.sql.exec('INSERT INTO files(id,owner,name,mime,size,storage_key,created_ms) VALUES(?,?,?,?,?,?,?)',id,actor.id,file.name,file.mime,file.size,file.storage_key,Date.now());ids.push(id);}
      return this.send(actor,{text,format,category:'personal',clientKey:client,files:ids},payload);
    }catch(error){for(const id of ids)this.sql.exec('DELETE FROM files WHERE id=? AND message_id IS NULL',id);throw error;}
  }
  send(actor,body,forwarded=null){
    this.member(actor);if(!this.get('migrated'))fail(409,'The conversation is still being imported.');
    const kind=category(body.category||'personal'),client=ref(body.clientKey),text=typeof body.text==='string'?body.text.trim():'';
    if((!text&&!(body.files||[]).length)||text.length>4000)fail(400,'Enter a message of up to 4000 characters.');
    if(!Array.isArray(body.files||[])||(body.files||[]).length>5)fail(400,'Attach up to five files.');
    const files=(body.files||[]).map(id=>{const file=this.one('SELECT * FROM files WHERE id=? AND owner=?',ref(id),actor.id);if(!file)fail(403,'Attachment unavailable.');return {id:file.id,name:file.name,mime:file.mime,size:file.size,url:'/api/messages/file?'+new URLSearchParams({roomId:this.get('room').id,id:file.id})};});
    if(kind==='learning'&&!staff(actor))fail(403,'Only teachers can send learning announcements.');
    const format=body.format?JSON.stringify(validateColorDocument(body.format,text)):null,reply=body.replyTo?integer(body.replyTo):null,quote=body.quote==null?null:body.quote;
    if(quote!==null&&(typeof quote!=='string'||!quote.trim()||quote.length>4000||!reply))fail(400,'Choose text from an original message.');
    if(reply){const parent=this.one('SELECT * FROM messages WHERE id=?',reply),member=this.member(actor);if(!parent||parent.deleted||parent.category!=='learning'&&parent.id<=member.joined)fail(404,'Original message unavailable.');if(parent.category==='learning'&&this.get('room').id!==directRoomId(actor.id,parent.sender))fail(403,'Reply to this alert in its author\'s personal chat.');const restricted=this.get('forward:'+parent.id)?.recipientId;if(restricted&&this.get('room').id!==directRoomId(actor.id,restricted))fail(403,'Reply to this study reference only in its teacher\'s personal chat.');}
    const old=this.one('SELECT * FROM messages WHERE sender=? AND client_key=?',actor.id,client);
    if(old&&old.category==='personal'&&old.id<=this.member(actor).joined)fail(404,'Original message unavailable.');
    if(old&&(this.get('quote:'+old.id)||null)!==quote)fail(409,'This message key was already used.');
    if(old){if(old.body!==text||old.category!==kind||old.reply!==reply||old.format!==format||JSON.stringify(this.get('files:'+old.id,[]).map(f=>f.id))!==JSON.stringify(files.map(f=>f.id)))fail(409,'This message key was already used.');return {message:this.message(old,actor.id),sent:true};}
    this.writable(actor);
    if(quote!==null&&!this.one('SELECT body FROM messages WHERE id=?',reply)?.body.includes(quote))fail(400,'The quote must be part of the original message.');
    for(const file of files)if(this.one('SELECT message_id FROM files WHERE id=?',file.id).message_id)fail(409,'This attachment has already been sent.');
    const budget=this.get('budget:'+actor.id,{at:0,n:0});if(budget.at<Date.now()-60000){budget.at=Date.now();budget.n=0;}if(budget.n>=30)fail(429,'Please wait before sending more messages.');
    let result;
    this.tx(()=>{
      this.set('budget:'+actor.id,{...budget,n:budget.n+1});
      const access=this.access(actor.id);if(!access.protected&&access.state!=='accepted')this.set('consent',access.canAccept?{state:'accepted'}:{state:'pending',requestedBy:actor.id});
      this.sql.exec('INSERT INTO messages(sender,name,category,body,format,reply,client_key,created_ms) VALUES(?,?,?,?,?,?,?,?)',actor.id,publicName(actor),kind,this.seal(text,'body'),this.seal(format,'format'),reply,client,Date.now());
      const id=this.one('SELECT last_insert_rowid() id').id;
      if(quote!==null)this.set('quote:'+id,quote);
      if(forwarded)this.set('forward:'+id,{source:forwarded.source,origin:forwarded.origin||null,label:forwarded.label,recipientId:forwarded.recipientId||null});
      if(files.length){this.set('files:'+id,files);for(const file of files)this.sql.exec('UPDATE files SET message_id=? WHERE id=?',id,file.id);}
      this.sql.exec('UPDATE members SET unread_'+kind+'=unread_'+kind+'+1 WHERE active=1 AND id<>?',actor.id);
      const counts=this.get('counts',{personal:0,learning:0});counts[kind]++;this.set('counts',counts);
      result=this.message(this.one('SELECT * FROM messages WHERE id=?',id),actor.id);
      this.emit('message:'+id,'message',{message:result});
    });this.deliver();return {message:result,sent:true};
  }
  visibleMessage(actor,id){const member=this.member(actor),row=this.one("SELECT * FROM messages WHERE id=? AND (id>? OR category='learning')",integer(id),member.joined);if(!row||row.deleted)fail(404,'Original message unavailable.');return row;}
  mutate(actor,action,body){
    const row=this.visibleMessage(actor,body.id);if(this.access(actor.id).blocked)fail(403,'This conversation is blocked.');
    const budget=this.get('mutations:'+actor.id,{at:0,n:0});if(budget.at<Date.now()-60000){budget.at=Date.now();budget.n=0;}if(budget.n>=60)fail(429,'Please wait before changing more messages.');
    if(['edit','delete'].includes(action)&&(row.sender!==actor.id||row.exam_id))fail(403,'Only your own non-system messages can be changed.');
    this.tx(()=>{
      this.set('mutations:'+actor.id,{...budget,n:budget.n+1});
      if(action==='edit'){
        const text=typeof body.text==='string'?body.text.trim():'';if(!text||text.length>4000)fail(400,'Enter a message of up to 4000 characters.');
        if(integer(body.expectedEditedMs||0)!==row.edited_ms)fail(409,'This message changed. Reopen it before editing.');
        const format=body.format?JSON.stringify(validateColorDocument(body.format,text)):null;
        this.sql.exec('UPDATE messages SET body=?,format=?,edited_ms=? WHERE id=?',this.seal(text,'body'),this.seal(format,'format'),Math.max(Date.now(),row.edited_ms+1),row.id);
      }else if(action==='delete'){
        this.sql.exec('UPDATE messages SET body=\'\',format=NULL,deleted=1 WHERE id=?',row.id);
        this.sql.exec('UPDATE members SET unread_'+row.category+'=MAX(0,unread_'+row.category+'-1) WHERE id<>? AND read_'+row.category+'<? AND (joined<? OR ?=\'learning\')',row.sender,row.id,row.id,row.category);
        const counts=this.get('counts',{personal:0,learning:0});counts[row.category]=Math.max(0,counts[row.category]-1);this.set('counts',counts);if(this.get('pinned')===row.id)this.set('pinned',null);
      }else if(action==='pin'){this.set('pinned',body.pinned===false?null:row.id);}
      else if(action==='react'){
        const emoji=String(body.emoji||'');if(emoji.length>16||!/^\p{Extended_Pictographic}[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f]*$/u.test(emoji))fail(400,'Choose an emoji reaction.');
        const reactions=this.get('reactions:'+row.id,{}),mine=!!reactions[emoji]?.includes(actor.id);
        for(const key of Object.keys(reactions)){reactions[key]=reactions[key].filter(id=>id!==actor.id);if(!reactions[key].length)delete reactions[key];}
        if(!mine){if(Object.keys(reactions).length>=20&&!reactions[emoji])fail(400,'This message already has twenty different reactions.');(reactions[emoji]||=[]).push(actor.id);}this.set('reactions:'+row.id,reactions);
      }else fail(400,'Invalid message action.');
      this.emit('updated:'+row.id+':'+this.get('revision',0),'update',{message:this.message(this.one('SELECT * FROM messages WHERE id=?',row.id),actor.id)});
      if(action==='edit'||action==='delete')for(const reply of this.rows('SELECT * FROM messages WHERE reply=? AND deleted=0',row.id))this.emit('quote:'+reply.id+':'+this.get('revision',0),'update',{message:this.message(reply,actor.id)});
    });this.deliver();return {message:this.message(this.one('SELECT * FROM messages WHERE id=?',row.id),actor.id),room:this.summary(actor.id)};
  }
  relation(actor,body){
    if(!['accept','reject','block','unblock'].includes(body.action))fail(400,'Invalid request action.');const access=this.access(actor.id);
    if(body.action==='unblock'&&this.get('room').kind==='group'&&access.blockedByMe){this.set('settings:'+actor.id,{...this.get('settings:'+actor.id,{}),deletedGroup:false});this.emit('unblock-group:'+this.get('revision',0),'room',{},new Set([actor.id]));this.deliver();return {room:this.summary(actor.id)};}
    if(access.protected)fail(403,'Teachers and people in your group cannot be blocked or require approval.');
    this.tx(()=>{
      if(body.action==='accept'||body.action==='reject'){if(!access.canAccept)fail(403,'No incoming message request.');this.set('consent',{state:body.action==='accept'?'accepted':'rejected'});}
      else{const blocks=new Set(this.get('blocks',[]));if(body.action==='block')blocks.add(actor.id);else{blocks.delete(actor.id);if(this.get('consent')?.state==='rejected')this.set('consent',{state:'new'});}this.set('blocks',[...blocks]);}
      this.emit('relation:'+this.get('revision',0),'room');
    });this.deliver();return {room:this.summary(actor.id)};
  }
  read(actor,body,delivered=false){
    const member=this.member(actor),kind=category(body.category),through=integer(body.through),column=(delivered?'delivered_':'read_')+kind;
    if(through<=member[column])return {read:true,unchanged:true};
    const last=this.one("SELECT COALESCE(MAX(id),0) id FROM messages WHERE category=? AND id<=? AND (id>? OR category='learning')",kind,through,member.joined).id;
    if(last<=member[column])return {read:true,unchanged:true};
    this.tx(()=>{
      if(delivered)this.sql.exec('UPDATE members SET '+column+'=? WHERE id=?',last,actor.id);
      else{
        const count=this.one("SELECT COUNT(*) n FROM messages WHERE deleted=0 AND category=? AND sender<>? AND id>? AND id<=? AND (id>? OR category='learning')",kind,actor.id,member[column],last,member.joined).n;
        this.sql.exec('UPDATE members SET '+column+'=?,delivered_'+kind+'=MAX(delivered_'+kind+',?),unread_'+kind+'=MAX(0,unread_'+kind+'-?) WHERE id=?',last,last,count,actor.id);
      }
      const readers=this.rows('SELECT id,read_'+kind+' read,delivered_'+kind+' delivered FROM members WHERE active=1');
      const recipients=new Set([actor.id,...this.rows('SELECT DISTINCT sender FROM messages WHERE category=? AND id>? AND id<=?',kind,member[column],last).map(m=>m.sender)]);
      this.emit((delivered?'delivered:':'read:')+actor.id+':'+kind+':'+last,'receipt',{receipt:{category:kind,readers}},recipients);
    });this.deliver();return {read:true,room:this.summary(actor.id)};
  }
  roomSettings(actor,body){
    const allowed=['roomId','actor','archived','pinOrder','muteUntil','sound'];if(Object.keys(body).some(key=>!allowed.includes(key)))fail(400,'Invalid chat setting.');
    if('archived' in body&&typeof body.archived!=='boolean'||'pinOrder' in body&&(!Number.isSafeInteger(body.pinOrder)||body.pinOrder<0)||'muteUntil' in body&&(!Number.isSafeInteger(body.muteUntil)||body.muteUntil< -1||body.muteUntil> Date.now()+366*86400000))fail(400,'Invalid chat setting.');
    if('sound' in body&&body.sound!==''&&!SOUND_IDS.includes(body.sound)&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.sound||''))fail(400,'Invalid notification sound.');
    this.tx(()=>{const value=this.get('settings:'+actor.id,{});for(const key of ['archived','pinOrder','muteUntil','sound'])if(key in body)value[key]=body[key];this.set('settings:'+actor.id,value);this.emit('settings:'+this.get('revision',0),'room',{},new Set([actor.id]));});this.deliver();return {room:this.summary(actor.id)};
  }
  clearHistory(actor,body){
    if(typeof body.everyone!=='boolean'||body.deleteChat!==undefined&&typeof body.deleteChat!=='boolean')fail(400,'Choose who should lose the history.');
    if(body.everyone&&this.get('room').kind==='group'&&!staff(actor))fail(403,'Only a teacher can clear history for all group members.');
    if(body.deleteChat&&this.get('room').kind==='direct'&&this.access(actor.id).protected)fail(403,'This educational conversation cannot be deleted and blocked.');
    const through=this.one("SELECT COALESCE(MAX(id),0) id FROM messages WHERE category='personal'").id;
    this.tx(()=>{
      if(through)this.set('hadPersonal',true);
      const recipients=body.everyone?this.rows('SELECT id FROM members WHERE active=1').map(m=>m.id):[actor.id];
      this.set('cleared:'+(body.everyone?'everyone':actor.id),through);
      for(const id of recipients){this.sql.exec('UPDATE members SET unread_personal=0,read_personal=MAX(read_personal,?),delivered_personal=MAX(delivered_personal,?) WHERE id=?',through,through,id);}
      if(body.deleteChat){if(this.get('room').kind==='group')this.set('settings:'+actor.id,{...this.get('settings:'+actor.id,{}),deletedGroup:true});else{const blocks=new Set(this.get('blocks',[]));blocks.add(actor.id);this.set('blocks',[...blocks]);}}
      this.emit('cleared:'+this.get('revision',0),'history-cleared',{cleared:{category:'personal',through}},new Set(recipients));
      if(body.deleteChat)this.emit('blocked:'+this.get('revision',0),'room');
    });this.deliver();return {cleared:{category:'personal',through},room:this.summary(actor.id)};
  }
  fetch(request){if(new URL(request.url).pathname.startsWith('/__account-transfer/'))return transferObject(this,request,'room');return this.handle(request,async(path,body)=>{
    if(path==='/configure')return this.configure(body);
    if(path==='/status')return {migrated:!!this.get('migrated')};
    if(path==='/import')return this.import(body);
    const actor=body.actor;this.member(actor);
    if(path==='/history')return this.history(actor,body);
    if(path==='/room-settings')return this.roomSettings(actor,body);
    if(path==='/clear-history')return this.clearHistory(actor,body);
    if(path==='/send')return this.send(actor,body);
    if(path==='/forward/source')return this.forwardSource(actor,body.id,body.study===true);
    if(path==='/original')return this.original(actor,body.id);
    if(path==='/forward')return this.forward(actor,body);
    if(['/edit','/delete','/pin','/react'].includes(path))return this.mutate(actor,path.slice(1),body);
    if(path==='/relation')return this.relation(actor,body);
    if(path==='/read'||path==='/delivered')return this.read(actor,body,path==='/delivered');
    if(path==='/mute'){if(typeof body.muted!=='boolean')fail(400,'Invalid mute setting.');return this.roomSettings(actor,{muteUntil:body.muted?-1:0});}
    if(path==='/members')return {members:this.rows('SELECT id,name,role FROM members WHERE active=1').map(m=>({...m,role:publicRole(m)}))};
    if(path==='/file/register'){this.writable(actor);const f=body.file;ref(f.id);this.sql.exec('INSERT INTO files(id,owner,name,mime,size,storage_key,created_ms) VALUES(?,?,?,?,?,?,?)',f.id,actor.id,f.name,f.mime,f.size,f.storageKey,Date.now());return {file:{id:f.id,name:f.name,mime:f.mime,size:f.size}};}
    if(path==='/file'){const file=this.one('SELECT * FROM files WHERE id=?',ref(body.id)),member=this.member(actor),message=file?.message_id?this.one('SELECT id,category,deleted FROM messages WHERE id=?',file.message_id):null;if(!file||message?.deleted||message?.category==='personal'&&message.id<=member.joined||file.owner!==actor.id&&!message)fail(404,'Attachment unavailable.');return file;}
    if(path==='/summary')return {room:this.summary(actor.id)};
    if(path==='/write-access'){this.writable(actor);return {allowed:true};}
    fail(404,'Chat route not found.');
  });}
}

export class ChatInbox extends Store{
  constructor(ctx,env){super(ctx,env);this.storageKind='inbox';this.sessionDeliveries=new WeakMap();if(env.ACCOUNT_TRANSFER_ROLE==='source'&&this.sql.exec("SELECT name FROM sqlite_master WHERE name='events'").toArray().length)return;this.sql.exec(`CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT UNIQUE NOT NULL,data TEXT NOT NULL);`);}
  snapshot(){
    const profile=this.get('profile'),rooms=this.rows('SELECT data FROM rooms').map(r=>JSON.parse(r.data)).filter(r=>r.active!==false).sort((a,b)=>(b.lastMessage?.createdMs||0)-(a.lastMessage?.createdMs||0));
    for(const room of rooms)if(room.muteUntil!==undefined)room.muted=room.muteUntil===-1||room.muteUntil>Date.now();
    const unread={personal:0,learning:0};for(const room of rooms){if(room.archived||room.access?.blockedByMe)continue;unread.personal+=room.unread.personal;unread.learning+=room.unread.learning;}
    return {rooms,folders:this.get('folders',[]).sort((a,b)=>a.name.localeCompare(b.name)),groups:this.get('groups',[]),contacts:this.get('contacts',[]).map(u=>({id:u.id,name:publicName(u),role:publicRole(u)})),profile:profile?{id:profile.id,name:publicName(profile),login:profile.login,email:profile.email,role:publicRole(profile)}:null,profiles:Object.fromEntries(Object.entries(this.get('profileViews',{})).filter(([id])=>profileAllowed(this,id))),unread,total:unread.personal+unread.learning,catalogVersion:this.get('catalogVersion',0),seq:this.one('SELECT COALESCE(MAX(id),0) id FROM events').id};
  }
  event(body){
    const profile=this.get('profile');
    if(body.profile&&!profileAllowed(this,body.profile.id))return {received:true,ignored:true};
    if(profile?.active===false||body.room?.kind==='group'&&!this.get('groups',[]).some(g=>g.id===body.room.groupId))return {received:true,ignored:true};
    if(this.one('SELECT id FROM events WHERE event_key=?',ref(body.key)))return {received:true,duplicate:true};
    let seq;
    this.tx(()=>{
      if(body.profile)this.set('profileViews',{...this.get('profileViews',{}),[body.profile.id]:publicProfile(body.profile)});
      if(body.catalogVersion)this.set('catalogVersion',Math.max(this.get('catalogVersion',0),body.catalogVersion));
      if(body.cleared&&body.room){for(const row of this.rows('SELECT id,data FROM events')){const event=JSON.parse(row.data);if(event.room?.id===body.room.id)this.sql.exec('DELETE FROM events WHERE id=?',row.id);}}
      if(body.room){const old=this.one('SELECT data FROM rooms WHERE id=?',body.room.id);if(!old||(JSON.parse(old.data).revision||0)<=(body.room.revision||0))this.sql.exec('INSERT INTO rooms(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',body.room.id,this.seal(JSON.stringify(body.room),'data'));}
      if(body.removeRoom)this.sql.exec('DELETE FROM rooms WHERE id=?',body.removeRoom);
      this.sql.exec('INSERT INTO events(event_key,data) VALUES(?,?)',body.key,this.seal(JSON.stringify(body),'data'));seq=this.one('SELECT last_insert_rowid() id').id;
      if(seq%100===0)this.sql.exec('DELETE FROM events WHERE id<?',seq-2000);
    });this.broadcast({type:'event',seq,event:body});return {received:true,seq};
  }
  async sessionAllowed(ws){
    const session=ws.deserializeAttachment();if(!session.sessionId)return true;
    try{if(!this.env.MEDIA)throw Error('Unavailable');if(await this.env.MEDIA.head((session.sessionNamespace||'')+'revoked-sid/'+session.sessionId)){ws.close(4003,'Session ended.');return false;}return true;}
    catch{ws.close(1011,'Session verification unavailable.');return false;}
  }
  broadcast(value){try{assertAccountTransferRunning(this.baseEnv);}catch{for(const ws of this.ctx.getWebSockets())ws.close(1013,'Account migration in progress.');return;}for(const ws of this.ctx.getWebSockets()){
    if(ws.deserializeAttachment().sessionId||this.baseEnv.CONTENT_ENABLED==='true'){const previous=this.sessionDeliveries.get(ws)||Promise.resolve();const delivery=trackTransferTask(this,async()=>{await previous;try{await assertChatRunning(this);if(await this.sessionAllowed(ws))ws.send(JSON.stringify(value));}catch(error){if(error.migrationFrozen)ws.close(1013,'Account migration in progress.');}}).catch(()=>{});this.sessionDeliveries.set(ws,delivery);this.ctx.waitUntil(delivery);}
    else try{ws.send(JSON.stringify(value));}catch{}
  }}
  async configure(body){
    const old=this.get('profile'),profile=body.profile;ref(profile.id);
    this.tx(()=>{this.set('profile',profile);this.set('contacts',body.contacts||[]);this.set('groups',body.groups||[]);this.sql.exec("DELETE FROM meta WHERE key LIKE 'discovered:%'");});
    const allowed=new Set((body.groups||[]).map(g=>'group:'+g.id));
    for(const room of this.rows('SELECT id,data FROM rooms'))if(JSON.parse(room.data).kind==='group'&&!allowed.has(room.id))this.event({key:'remove:'+room.id+':'+Date.now(),type:'room',removeRoom:room.id});
    if(profile.active===false||old&&old.role!==profile.role){for(const ws of this.ctx.getWebSockets())ws.close(4001,'Account access changed.');}
    this.broadcast({type:'snapshot',data:this.snapshot()});return {configured:true};
  }
  async command(action,body){
    const actor=this.get('profile');if(!actor||actor.active===false)fail(403,'Account unavailable.');
    if(this.env.CONTENT_WRITES==='false'&&!['snapshot','history','members','sessions','profiles','original'].includes(action))fail(403,'Chat writes are unavailable.');
    if(action==='snapshot')return this.snapshot();
    if(action==='folders'){
      const folders=this.get('folders',[]),id=ref(body.id);if(!['save','delete'].includes(body.op))fail(400,'Invalid folder action.');
      const index=folders.findIndex(f=>f.id===id);
      if(body.op==='delete'){if(index>=0)folders.splice(index,1);}
      else{const name=typeof body.name==='string'?body.name.trim():'';if(!name||name.length>60||!Array.isArray(body.roomIds)||body.roomIds.length>200||folders.length>=30&&index<0)fail(400,'Choose a folder name and up to 200 chats.');
        if(body.roomIds.some(room=>typeof room!=='string'||!this.one('SELECT id FROM rooms WHERE id=?',room)))fail(403,'Conversation unavailable.');
        const folder={id,name,roomIds:[...new Set(body.roomIds)]};if(index<0)folders.push(folder);else folders[index]=folder;
      }
      this.set('folders',folders);this.broadcast({type:'snapshot',data:this.snapshot()});return {folders:this.snapshot().folders};
    }
    if(action==='profiles'){
      if(!Array.isArray(body.ids)||body.ids.length>100)fail(400,'Choose up to 100 profiles.');
      const ids=body.ids.filter(id=>typeof id==='string'&&profileAllowed(this,id));
      if(!this.env.CHAT_BRIDGE)return {profiles:[]};
      const result=await chatCall(this.env,'CHAT_BRIDGE','global','/profiles',{actor,ids});const profiles=result.profiles.map(publicProfile);
      this.set('profileViews',{...this.get('profileViews',{}),...Object.fromEntries(profiles.map(p=>[p.id,p]))});return {profiles};
    }
    if(action==='lookup'){
      const budget=this.get('lookupBudget',{at:0,n:0});if(budget.at<Date.now()-60000){budget.at=Date.now();budget.n=0;}if(budget.n>=10)fail(429,'Please wait before searching for more people.');this.set('lookupBudget',{...budget,n:budget.n+1});
      const result=await chatCall(this.env,'CHAT_BRIDGE','global','/discover',{actor,query:body.query});
      if(!result.person)return {person:null};const p=result.person;this.set('discovered:'+p.id,{person:p,expires:Date.now()+20*60*1000});return {person:{id:p.id,name:publicName(p),role:publicRole(p)}};
    }
    if(action==='blocked')return {users:this.snapshot().rooms.filter(r=>r.access?.blockedByMe).map(r=>({id:r.peerId,roomId:r.id,name:r.title}))};
    if(action==='preview-budget'){const budget=this.get('previews',{at:0,n:0});if(budget.at<Date.now()-60000){budget.at=Date.now();budget.n=0;}if(budget.n>=30)fail(429,'Please wait before loading more previews.');this.set('previews',{...budget,n:budget.n+1});return {allowed:true};}
    if(action==='sessions')return {sessions:this.ctx.getWebSockets().map(ws=>{const a=ws.deserializeAttachment();return {current:true,expires:a.expires};})};
    if(action==='original'){
      let roomId=ref(body.roomId),id=integer(body.id);const seen=new Set();
      for(let depth=0;depth<8;depth++){
        if(!this.one('SELECT id FROM rooms WHERE id=?',roomId)||seen.has(roomId+':'+id))fail(404,'Original message unavailable.');
        seen.add(roomId+':'+id);
        const original=await chatCall(this.env,'CHAT_ROOM',roomId,'/original',{actor,id});
        if(!original.reference)return original;
        roomId=ref(original.reference.roomId);id=integer(original.reference.messageId);
      }
      fail(404,'Original message unavailable.');
    }
    if(action==='forward'){
      const source=ref(body.sourceRoomId),target=ref(body.targetRoomId);for(const id of [source,target])if(!this.one('SELECT id FROM rooms WHERE id=?',id))fail(403,'Conversation unavailable.');
      const payload=await chatCall(this.env,'CHAT_ROOM',source,'/forward/source',{actor,id:body.messageId});
      return chatCall(this.env,'CHAT_ROOM',target,'/forward',{actor,clientKey:body.clientKey,payload});
    }
    if(action==='study-reply'){
      const source=ref(body.sourceRoomId);if(!this.one('SELECT id FROM rooms WHERE id=?',source))fail(403,'Conversation unavailable.');
      const payload=await chatCall(this.env,'CHAT_ROOM',source,'/forward/source',{actor,id:body.messageId,study:true});
      if(body.quote!=null){if(typeof body.quote!=='string'||!body.quote.trim()||body.quote.length>4000||!payload.text.includes(body.quote))fail(400,'The quote must be part of the original message.');payload.text=body.quote;payload.format=null;payload.label.text=body.quote;payload.label.quote=body.quote;payload.files=[];}
      const opened=await this.command('open',{kind:'direct',accountId:payload.recipientId});
      const result=await chatCall(this.env,'CHAT_ROOM',opened.roomId,'/forward',{actor,payload,comment:body.text,format:body.format,clientKey:body.clientKey});
      return {...result,roomId:opened.roomId,room:opened.room};
    }
    if(action==='open'){
      let id;
      if(body.kind==='direct'){
        ref(body.accountId);if(body.accountId===actor.id)fail(400,'Choose another person.');
        const discovery=this.get('discovered:'+body.accountId),peer=this.get('contacts',[]).find(u=>u.id===body.accountId)||(discovery?.expires>Date.now()?discovery.person:null);
        id=directRoomId(actor.id,body.accountId);
        if(!peer){if(!this.one('SELECT id FROM rooms WHERE id=?',id))fail(403,'Find this person by their full email or login first.');return {roomId:id,...await chatCall(this.env,'CHAT_ROOM',id,'/summary',{actor})};}
        id=directRoomId(actor.id,peer.id);const status=await chatCall(this.env,'CHAT_ROOM',id,'/status',{});
        await chatCall(this.env,'CHAT_ROOM',id,'/configure',{room:{id,kind:'direct',title:'Private conversation'},members:[actor,peer]});
        if(!status.migrated)await chatCall(this.env,'CHAT_ROOM',id,'/import',{messages:[],complete:true});
      }else if(body.kind==='group'){
        const group=this.get('groups',[]).find(g=>g.id===body.groupId);if(!group)fail(403,'This group is unavailable.');id='group:'+group.id;
      }else fail(400,'Choose a conversation type.');
      const result=await chatCall(this.env,'CHAT_ROOM',id,'/summary',{actor});
      if(result.room)this.sql.exec('INSERT INTO rooms(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',id,this.seal(JSON.stringify(result.room),'data'));
      return {roomId:id,room:result.room};
    }
    const room=ref(body.roomId);if(!this.one('SELECT id FROM rooms WHERE id=?',room))fail(403,'Conversation unavailable.');
    if(!['history','send','read','delivered','mute','members','edit','delete','pin','react','relation','room-settings','clear-history'].includes(action))fail(400,'Invalid chat command.');
    return chatCall(this.env,'CHAT_ROOM',room,'/'+action,{...body,actor});
  }
  async webSocketMessage(ws,raw){return trackTransferTask(this,()=>this.receiveWebSocketMessage(ws,raw));}
  async receiveWebSocketMessage(ws,raw){
    let request;
    try{
      await this.trusted();
      const attachment=ws.deserializeAttachment();if(attachment.expires<Date.now())fail(401,'Reconnect to renew your session.');
      if(!await this.sessionAllowed(ws))return;
      if(typeof raw!=='string'||raw.length>24000)fail(413,'Message too large.');request=JSON.parse(raw);ref(request.requestId);
      const result=await this.command(request.action,request.body||{});ws.send(JSON.stringify({type:'response',requestId:request.requestId,result}));
    }catch(error){if(error.inactiveDatabase)ws.close(4001,'Database changed.');try{ws.send(JSON.stringify({type:'response',requestId:request?.requestId,error:error.status?error.message:'Chat temporarily unavailable.',status:error.status||503}));}catch{}if(error.migrationFrozen)ws.close(1013,'Account migration in progress.');}
  }
  async presence(exclude=null){try{await this.trusted();}catch(error){if(error.inactiveDatabase)return;throw error;}if(this.env.CHAT_BRIDGE&&this.get('profile'))await chatCall(this.env,'CHAT_BRIDGE','global','/presence',{id:this.get('profile').id,online:this.ctx.getWebSockets().some(ws=>ws!==exclude&&ws.readyState===1&&ws.deserializeAttachment().expires>Date.now())});}
  async webSocketClose(ws){await this.presence(ws);await this.scheduleExpiry();}
  async webSocketError(ws){ws.close(1011,'Reconnect.');await this.presence(ws);await this.scheduleExpiry();}
  async scheduleExpiry(){try{await assertChatRunning(this);}catch(error){if(error.migrationFrozen)return;throw error;}const times=this.ctx.getWebSockets().map(ws=>ws.deserializeAttachment().expires).filter(t=>t>Date.now());if(this.cipher&&this.get('crypto:migrated')!=='aes256gcm-v1')times.push(Date.now()+1000);if(times.length)await this.ctx.storage.setAlarm(Math.min(...times));else await this.ctx.storage.deleteAlarm();}
  async alarm(){return trackTransferTask(this,async()=>{try{await this.trusted();}catch(error){for(const ws of this.ctx.getWebSockets())ws.close(4001,'Database unavailable.');if(!error.inactiveDatabase&&!error.migrationFrozen)await this.ctx.storage.setAlarm(Date.now()+10000);return;}for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment().expires<=Date.now())ws.close(4000,'Renew session.');await this.presence();await this.scheduleExpiry();});}
  fetch(request){
    if(new URL(request.url).pathname.startsWith('/__account-transfer/'))return transferObject(this,request,'inbox');
    return trackTransferTask(this,()=>this.receiveRequest(request));
  }
  async receiveRequest(request){
    if(new URL(request.url).pathname!=='/connect')return this.handle(request,async(path,body)=>{
      if(path==='/configure')return this.configure(body);if(path==='/event')return this.event(body);if(path==='/snapshot')return this.snapshot();if(path==='/command')return this.command(body.action,body.body||{});if(path==='/suspend'){const profile=this.get('profile');if(profile)this.set('profile',{...profile,active:false});for(const ws of this.ctx.getWebSockets())ws.close(4002,'Permissions changed.');return {closed:true};}if(path==='/revoke'){for(const ws of this.ctx.getWebSockets())ws.close(4001,'Session closed.');return {closed:true};}
      if(path==='/revoke-session'){if(!/^(?:[a-f0-9]{32}|[a-f0-9]{40})$/.test(body.sid||''))fail(400,'Invalid session.');for(const ws of this.ctx.getWebSockets()){const id=ws.deserializeAttachment().sessionId;if(!id||id===body.sid)ws.close(id?4003:4001,'Session ended.');}return {closed:true};}fail(404,'Inbox route not found.');
    });
    try{
      await this.trusted(request);if(!this.get('profile')||this.get('profile').active===false)fail(403,'Sign in first.');
      const sessionId=request.headers.get('X-Chat-Session'),sessionNamespace=request.headers.get('X-Chat-Session-Namespace')||'';
      if(sessionId&&(!/^(?:[a-f0-9]{32}|[a-f0-9]{40})$/.test(sessionId)||!['','auth/neon/'].includes(sessionNamespace)))fail(403,'Invalid session.');
      if(sessionId&&(!this.env.MEDIA||await this.env.MEDIA.head(sessionNamespace+'revoked-sid/'+sessionId)))fail(401,'Session ended.');
      const sessionExpires=Number(request.headers.get('X-Chat-Session-Expires'));
      const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({expires:Math.min(Date.now()+20*60*1000,sessionExpires>0?sessionExpires:Infinity),...(sessionId?{sessionId,sessionNamespace}:{})});
      const after=Number(new URL(request.url).searchParams.get('after')||0),min=this.one('SELECT COALESCE(MIN(id),0) id FROM events').id;
      if(after&&after>=min-1&&after<=this.snapshot().seq){for(const row of this.rows('SELECT id,data FROM events WHERE id>? ORDER BY id',after)){const event=JSON.parse(row.data);if(!event.profile||profileAllowed(this,event.profile.id))server.send(JSON.stringify({type:'event',seq:row.id,event}));}}
      await this.presence();server.send(JSON.stringify({type:'snapshot',data:this.snapshot()}));await this.scheduleExpiry();return new Response(null,{status:101,webSocket:client});
    }catch(error){return json({error:error.status?error.message:'Chat unavailable.'},error.status||503);}
  }
}
