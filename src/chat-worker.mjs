import {currentUser,sessionIdentity} from './worker.js';
import {notificationSoundRoute} from './notification-sounds.mjs';
import {studyClient} from './learning-stage-worker.mjs';
import {MessageService} from './learning-messages.mjs';
import {chatCall,ChatRoom,ChatInbox} from './chat-durable.mjs';
import {statement} from './learning-study.mjs';
import {CHAT_FILE_LIMIT,chatFileMetadata,chatFileResponse} from './chat-attachments.mjs';
import {chatLinkPreview,chatPreviewImage} from './chat-previews.mjs';
import {readProfiles,setPresence,setAvatar,setUsername,signupUsername,profileDetails,setProfileDetails,publicProfile} from './chat-profiles.mjs';
import {chatStorageName,chatDatabaseHeaders,prepareChatDatabase,assertChatRunning} from './chat-database.mjs';
import {chatCipher} from './chat-encryption.mjs';
import {transferObject,trackTransferTask} from './account-transfer.mjs';
export {ChatRoom,ChatInbox};
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const staff=user=>['ADMIN','DEVELOPER'].includes(user?.role);
const database=studyClient;
async function mapPool(items,limit,fn){
  const queue=[...items];
  await Promise.all(Array.from({length:Math.min(limit,queue.length)||0},async()=>{
    while(queue.length)await fn(queue.shift());
  }));
}

export class ChatBridge{
  constructor(ctx,env,{studyDatabase=database}={}){this.ctx=ctx;this.baseEnv={...env,STORAGE_MODE:'production'};this.env=this.baseEnv;this.database=studyDatabase;this.sql=ctx.storage.sql;this.loading=null;this.flushing=null;this.importing=new Map();if(env.ACCOUNT_TRANSFER_ROLE==='source'&&this.sql.exec("SELECT name FROM sqlite_master WHERE name='profiles'").toArray().length)return;this.sql.exec('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');this.sql.exec("CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY,phone TEXT NOT NULL DEFAULT '',phone_visible INTEGER NOT NULL DEFAULT 0,birthday TEXT NOT NULL DEFAULT '',birthday_visible INTEGER NOT NULL DEFAULT 0)");}
  async prepare(request){await prepareChatDatabase(this,request);}
  get(key){const row=this.sql.exec('SELECT value FROM meta WHERE key=?',key).toArray()[0];return row?JSON.parse(row.value):null;}
  set(key,value){this.sql.exec('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
  async ensureJournal(){if(this.get('journalVersion')!==1){await new MessageService(this.database(this.env),async()=>[]).ensure();this.set('journalVersion',1);}}
  async policy(force=false,release=false){
    if(this.get('policyDirtyAt')&&!release){
      const dirty=this.get('policy');
      if(dirty){this.ctx.waitUntil(this.policy(true,true).catch(()=>{}));return dirty;}
      fail(503,'Permissions are being synchronized.');
    }
    const cached=this.get('policy');
    if(!force&&cached?.at>Date.now()-60000)return cached;
    if(!force&&cached){if(!this.loading)this.ctx.waitUntil(this.policy(true,release).catch(()=>{}));return cached;}
    if(this.loading){const value=await this.loading;return force?this.policy(true,release):value;}
    this.loading=(async()=>{
      const db=this.database(this.env);await this.ensureJournal();
      const users=(await this.env.DB.prepare('SELECT id,login,name,email,role,active,hidden,is_personal_data_revoked FROM users').all()).results||[];
      const [groups,members,teacherDocs]=await db.readMany([
        statement('SELECT id,title FROM class_groups WHERE deleted_at IS NULL'),
        statement('SELECT account_id,group_id FROM class_group_students'),
        statement("SELECT key,value_json FROM catalog_documents WHERE namespace='accounts-group-teachers'"),
      ]);
      const teachersByGroup=new Map();
      for(const row of teacherDocs||[]){
        try{
          const value=JSON.parse(row.value_json);
          teachersByGroup.set(Number(row.key),new Set((value.teacherIds||[]).map(String)));
        }catch{}
      }
      const groupTeachers=groupId=>{
        const assigned=teachersByGroup.get(Number(groupId));
        return assigned&&assigned.size?assigned:null;
      };
      const studentMaySeeStaff=(studentGroupId,staffUser)=>{
        if(staffUser.role==='DEVELOPER')return true;
        const assigned=groupTeachers(studentGroupId);
        if(!assigned)return staffUser.role==='ADMIN';
        return assigned.has(staffUser.id);
      };
      for(const user of users)user.groupId=members.find(m=>m.account_id===user.id)?.group_id??null;
      const active=users.filter(u=>u.active!==0&&!u.is_personal_data_revoked),allRooms=new Map(),configs=new Map();
      const indexed=this.get('roomIndex');
      if(indexed?.rooms?.length){
        for(const room of indexed.rooms)allRooms.set(room.id,{id:room.id,kind:room.kind,groupId:room.groupId||null});
      }else{
        await mapPool(users,8,async user=>{
          const old=await chatCall(this.env,'CHAT_INBOX',user.id,'/snapshot',{});
          for(const room of old.rooms)allRooms.set(room.id,{id:room.id,kind:room.kind,groupId:room.groupId||null});
        });
      }
      for(const group of groups)allRooms.set('group:'+group.id,{id:'group:'+group.id,kind:'group',groupId:group.id});
      await mapPool(users,8,async user=>{
        const own=members.find(m=>m.account_id===user.id)?.group_id;
        const contacts=active.filter(u=>{
          if(u.id===user.id||(u.hidden&&user.role!=='DEVELOPER'))return false;
          if(staff(user))return true;
          if(u.role==='USER')return !!(own&&members.some(m=>m.account_id===u.id&&m.group_id===own));
          if(staff(u))return !!(own&&studentMaySeeStaff(own,u));
          return false;
        });
        configs.set(user.id,{profile:{id:user.id,name:user.name,login:user.login,email:user.email,groupId:user.groupId,role:user.role,active:user.active!==0&&!user.is_personal_data_revoked},contacts,groups:groups.filter(g=>staff(user)||g.id===own)});
      });
      await mapPool(groups,8,async group=>{
        const assigned=groupTeachers(group.id);
        await chatCall(this.env,'CHAT_ROOM','group:'+group.id,'/configure',{room:{id:'group:'+group.id,kind:'group',groupId:group.id,title:group.title},members:active.filter(u=>{
          if(members.some(m=>m.group_id===group.id&&m.account_id===u.id))return true;
          if(!staff(u))return false;
          if(u.role==='DEVELOPER')return true;
          if(!assigned)return true;
          return assigned.has(u.id);
        })});
      });
      await mapPool([...allRooms.values()],8,async room=>{
        if(room.kind==='group'&&!groups.some(g=>g.id===room.groupId))await chatCall(this.env,'CHAT_ROOM',room.id,'/configure',{room:{...room,active:false},members:[]});
        if(room.kind==='direct'){
          const ids=room.id.slice('direct:'.length).split(':');
          await chatCall(this.env,'CHAT_ROOM',room.id,'/configure',{room:{id:room.id,kind:'direct',title:'Private conversation'},members:users.filter(u=>ids.includes(u.id)).map(u=>({...u,active:active.some(a=>a.id===u.id)}))});
        }
      });
      await mapPool(users,8,async user=>{await chatCall(this.env,'CHAT_INBOX',user.id,'/configure',configs.get(user.id));});
      this.set('roomIndex',{at:Date.now(),rooms:[...allRooms.values()].map(room=>({id:room.id,kind:room.kind,groupId:room.groupId||null}))});
      const result={at:Date.now(),users,groups,members,teachersByGroup:[...teachersByGroup.entries()].map(([groupId,ids])=>({groupId,teacherIds:[...ids]}))};this.set('policy',result);if(release)this.set('policyDirtyAt',null);return result;
    })().finally(()=>{this.loading=null;});return this.loading;
  }
  registerRoom(room){
    if(!room?.id||!room?.kind)fail(400,'Room id and kind are required.');
    const indexed=this.get('roomIndex')||{rooms:[]};
    const next={id:room.id,kind:room.kind,groupId:room.groupId||null};
    const rooms=indexed.rooms.filter(row=>row.id!==next.id);
    rooms.push(next);
    this.set('roomIndex',{at:Date.now(),rooms});
    return {registered:true};
  }
  async purgeAccount(accountId){
    if(!/^[a-f0-9]{16,64}$/.test(accountId||''))fail(400,'Invalid account.');
    const policy=await this.policy(true,true),index=this.get('roomIndex')||{rooms:[]};
    const db=this.database(this.env),hasInstances=(await db.read("SELECT name FROM sqlite_master WHERE type='table' AND name='exam_instances'")).length;
    const examIds=hasInstances?(await db.read('SELECT exam_id FROM exam_instances WHERE account_id=?',[accountId])).map(row=>row.exam_id):[];
    for(const room of index.rooms)await chatCall(this.env,'CHAT_ROOM',room.id,'/purge-account',{accountId,examIds});
    for(const id of new Set([accountId,...policy.users.map(user=>user.id)]))await chatCall(this.env,'CHAT_INBOX',id,'/purge-account',{accountId});
    const avatar=this.get('avatar:'+accountId);
    if(avatar?.storageKey){if(!this.env.CONTENT_MEDIA?.delete)fail(503,'Avatar deletion unavailable.');await this.env.CONTENT_MEDIA.delete(avatar.storageKey);}
    const username=this.get('username:'+accountId);
    this.ctx.storage.transactionSync(()=>{
      this.sql.exec('DELETE FROM profiles WHERE user_id=?',accountId);
      for(const row of this.sql.exec('SELECT key,value FROM meta').toArray()){
        if(row.key==='roomIndex'){const value=JSON.parse(row.value);this.set('roomIndex',{...value,rooms:value.rooms.filter(room=>!room.id.split(':').includes(accountId))});}
        else if(row.key.startsWith('watchers:'))this.set(row.key,JSON.parse(row.value).filter(id=>id!==accountId));
        else if(row.key.includes(accountId)||row.key==='username-owner:'+username||row.value.includes(accountId))this.sql.exec('DELETE FROM meta WHERE key=?',row.key);
      }
      this.set('policy',null);
    });
    return {removed:true};
  }
  async migrate(roomId,policy){
    if(this.importing.has(roomId))return this.importing.get(roomId);
    const job=this.importRoom(roomId,policy).finally(()=>this.importing.delete(roomId));this.importing.set(roomId,job);return job;
  }
  async importRoom(roomId,policy){
    const cipher=chatCipher(this.env),scope=column=>'journal:'+roomId+':'+column;
    const sealRows=async(db,rows)=>{if(!cipher||!rows.length)return;const statements=[];for(const row of rows){for(const column of ['body','format_json'])if(row[column]!=null&&!row[column].startsWith('chatenc:'))statements.push(statement('UPDATE chat_messages SET '+column+'=? WHERE id=? AND '+column+'=?',[cipher.seal(row[column],scope(column)),row.id,row[column]]));}if(statements.length)await db.atomic(statements);};
    const state=await chatCall(this.env,'CHAT_ROOM',roomId,'/status',{});
    if(state.migrated){if(cipher){const db=this.database(this.env),rows=await db.read("SELECT id,body,format_json FROM chat_messages WHERE room_id=? AND (body NOT LIKE 'chatenc:%' OR (format_json IS NOT NULL AND format_json NOT LIKE 'chatenc:%')) LIMIT 100",[roomId]);await sealRows(db,rows);}return;}
    const db=this.database(this.env),[source]=await db.read('SELECT * FROM chat_rooms WHERE id=?',[roomId]);
    if(source){
      const members=await db.read('SELECT * FROM chat_members WHERE room_id=?',[roomId]);
      await chatCall(this.env,'CHAT_ROOM',roomId,'/configure',{room:{id:roomId,kind:source.kind,groupId:source.group_id,title:policy.groups.find(g=>g.id===source.group_id)?.title||'Private conversation'},members:source.kind==='group'?policy.users.filter(u=>u.active!==0&&!u.is_personal_data_revoked&&(staff(u)||policy.members.some(m=>m.account_id===u.id&&m.group_id===source.group_id))):members.map(m=>{const user=policy.users.find(u=>u.id===m.account_id);return user?{...user,active:user.active!==0&&!user.is_personal_data_revoked}:{id:m.account_id,name:'Unavailable account',role:'USER',active:false};})});
      let after=0;
      while(true){
        const rows=await db.read('SELECT m.*,a.exam_id,a.active assignment_active FROM chat_messages m LEFT JOIN chat_assignments a ON a.id=m.assignment_id WHERE m.room_id=? AND m.id>? ORDER BY m.id LIMIT 200',[roomId,after]);
        const messages=cipher?rows.map(row=>({...row,body:cipher.open(row.body,scope('body')),format_json:cipher.open(row.format_json,scope('format_json'))})):rows;
        await chatCall(this.env,'CHAT_ROOM',roomId,'/import',{initial:true,messages,complete:rows.length<200,members});
        await sealRows(db,rows);
        if(rows.length<200)break;after=rows.at(-1).id;
      }
    }else await chatCall(this.env,'CHAT_ROOM',roomId,'/import',{initial:true,messages:[],complete:true});
  }
  async bootstrap(actor){
    const policy=await this.policy(),known=policy.users.find(u=>u.id===actor.id);
    if(!known||known.role!==actor.role||known.active===0||known.is_personal_data_revoked)await this.policy(true);
    const activePolicy=this.get('policy'),db=this.database(this.env),legacy=await db.read('SELECT r.id FROM chat_rooms r JOIN chat_members m ON m.room_id=r.id WHERE m.account_id=?',[actor.id]);
    const groups=activePolicy.groups.filter(g=>staff(actor)||activePolicy.members.some(m=>m.account_id===actor.id&&m.group_id===g.id));
    const roomIds=[...new Set([...legacy.map(r=>r.id),...groups.map(g=>'group:'+g.id)])].filter(id=>!(id.startsWith('group:')&&!groups.some(g=>'group:'+g.id===id)));
    await mapPool(roomIds,8,async id=>{
      await this.migrate(id,activePolicy);
      const result=await chatCall(this.env,'CHAT_ROOM',id,'/summary',{actor});
      if(result.room)await chatCall(this.env,'CHAT_INBOX',actor.id,'/event',{key:'bootstrap:'+id+':'+result.room.revision,type:'room',room:result.room});
    });
    const version=this.get('catalogVersion');if(version&&staff(actor))await chatCall(this.env,'CHAT_INBOX',actor.id,'/event',{key:'catalog:'+version,type:'catalog',catalogVersion:version});
    this.ctx.waitUntil(this.flush().catch(()=>{}));return {ready:true};
  }
  async flush(){
    if(this.flushing)return this.flushing;
    this.flushing=(async()=>{
      await assertChatRunning(this);
      const db=this.database(this.env);await this.ensureJournal();
      const rows=await db.read('SELECT m.*,a.exam_id,a.active assignment_active FROM chat_delivery_outbox o JOIN chat_messages m ON m.id=o.message_id LEFT JOIN chat_assignments a ON a.id=m.assignment_id ORDER BY m.id LIMIT 100');
      if(!rows.length)return {delivered:0};
      const policy=await this.policy(),done=[];
      for(const roomId of new Set(rows.map(r=>r.room_id))){
        await this.migrate(roomId,policy);
        const cipher=chatCipher(this.env),batch=rows.filter(r=>r.room_id===roomId);
        await chatCall(this.env,'CHAT_ROOM',roomId,'/import',{initial:false,messages:cipher?batch.map(row=>({...row,body:cipher.open(row.body,'journal:'+roomId+':body'),format_json:cipher.open(row.format_json,'journal:'+roomId+':format_json')})):batch});
        if(cipher){const updates=batch.flatMap(row=>['body','format_json'].filter(column=>row[column]!=null&&!row[column].startsWith('chatenc:')).map(column=>statement('UPDATE chat_messages SET '+column+'=? WHERE id=? AND '+column+'=?',[cipher.seal(row[column],'journal:'+roomId+':'+column),row.id,row[column]])));if(updates.length)await db.atomic(updates);}
        done.push(...rows.filter(r=>r.room_id===roomId).map(r=>r.id));
      }
      if(done.length)await db.atomic([statement('DELETE FROM chat_delivery_outbox WHERE message_id IN ('+done.map(()=>'?').join(',')+')',done)]);
      if(rows.length===100)await this.ctx.storage.setAlarm(Date.now()+1000);
      return {delivered:done.length};
    })().catch(async error=>{if(error.migrationFrozen)return {frozen:true};await this.ctx.storage.setAlarm(Date.now()+10000);return {retrying:true};}).finally(()=>{this.flushing=null;});return this.flushing;
  }
  async alarm(){return trackTransferTask(this,async()=>{try{await this.prepare();}catch(error){if(!error.inactiveDatabase&&!error.migrationFrozen)await this.ctx.storage.setAlarm(Date.now()+10000);return;}const dirty=this.get('policyDirtyAt');if(dirty&&Date.now()-dirty>=120000)try{await this.policy(true,true);}catch(error){if(!error.migrationFrozen)await this.ctx.storage.setAlarm(Date.now()+10000);}await this.flush();});}
  async catalog(){const policy=await this.policy(),version=this.get('catalogVersion')+1||1;this.set('catalogVersion',version);for(const user of policy.users.filter(u=>staff(u)&&u.active!==0&&!u.is_personal_data_revoked))await chatCall(this.env,'CHAT_INBOX',user.id,'/event',{key:'catalog:'+version,type:'catalog',catalogVersion:version});return {updated:true};}
  async discover(actor,query){
    const policy=await this.policy(),self=policy.users.find(u=>u.id===actor.id&&u.active!==0&&!u.is_personal_data_revoked);
    if(!self)fail(403,'Account unavailable.');const q=String(query||'').trim().toLocaleLowerCase();if(q.length<3||q.length>254)fail(400,'Enter the full email, login or @username.');
    const usernameOwner=q.startsWith('@')?this.get('username-owner:'+q):null;
    const own=policy.members.find(m=>m.account_id===self.id)?.group_id;
    const assigned=own==null?null:new Set((policy.teachersByGroup||[]).find(row=>Number(row.groupId)===Number(own))?.teacherIds||[]);
    const visible=u=>{
      if(staff(self))return true;
      if(u.role==='USER')return !!(own&&policy.members.some(m=>m.account_id===u.id&&m.group_id===own));
      if(!staff(u)||!own)return false;
      if(u.role==='DEVELOPER')return true;
      if(!assigned?.size)return u.role==='ADMIN';
      return assigned.has(u.id);
    };
    const matches=policy.users.filter(u=>u.id!==self.id&&u.active!==0&&!u.is_personal_data_revoked&&(!u.hidden||self.role==='DEVELOPER')&&visible(u)&&(q.startsWith('@')?u.id===usernameOwner:[u.login,u.email].some(v=>v&&v.toLocaleLowerCase()===q)));
    if(matches.length>1)fail(409,'Use the full email to identify this account.');return {person:matches[0]||null};
  }
  fetch(request){
    if(new URL(request.url).pathname.startsWith('/__account-transfer/'))return transferObject(this,request,'bridge');
    return trackTransferTask(this,()=>this.receiveRequest(request));
  }
  async receiveRequest(request){
    try{await this.prepare(request);}catch(error){return json({error:error.status?error.message:'Chat database unavailable.'},error.status||503);}
    if(new URL(request.url).pathname==='/signup-username'){try{return json(signupUsername(this,await request.json()));}catch(error){return json({error:error.status?error.message:'Signup username unavailable.'},error.status||503);}}
    if(new URL(request.url).pathname==='/purge-account'){try{return json(await this.purgeAccount((await request.json()).accountId));}catch(error){return json({error:error.status?error.message:'Account cleanup failed.'},error.status||503);}}
    if(new URL(request.url).pathname==='/profile'){try{const body=await request.json();return json(body.read?{details:profileDetails(this,body.actor.id)}:await setProfileDetails(this,body));}catch(error){return json({error:error.status?error.message:'Profile could not be saved.'},error.status||503);}}
    if(new URL(request.url).pathname==='/username'){try{return json(await setUsername(this,await request.json()));}catch(error){return json({error:error.status?error.message:'Username could not be saved.'},error.status||503);}}
    try{const path=new URL(request.url).pathname,body=await request.json();if(path==='/profiles')return json(readProfiles(this,body));if(path==='/presence')return json(await setPresence(this,body));if(path==='/avatar')return json(await setAvatar(this,body));if(path==='/discover')return json(await this.discover(body.actor,body.query));if(path==='/bootstrap')return json(await this.bootstrap(body.actor));if(path==='/catalog')return json(await this.catalog());if(path==='/register-room')return json(this.registerRoom(body.room||body));if(path==='/policy')return json(await this.policy(true,true));if(path==='/invalidate'){if(this.loading)await this.loading.catch(()=>{});this.set('policyDirtyAt',Date.now());await this.ctx.storage.setAlarm(Date.now()+120000);for(const user of this.get('policy')?.users||[])await chatCall(this.env,'CHAT_INBOX',user.id,'/suspend',{});this.set('policy',null);return json({invalidated:true});}if(path==='/flush')return json(await this.flush());return json({error:'Not found.'},404);}catch(error){return json({error:error.status?error.message:'Chat initialization failed.'},error.status||503);}
  }
}

export function durableChatWorker(application,{authenticate=currentUser}={}){return {
  async fetch(request,env,ctx){
    if(env.CHAT_V2_ENABLED!=='true')return application.fetch(request,env,ctx);
    const url=new URL(request.url),path=url.pathname,route=path==='/api/messages/socket',legacyChat=path==='/api/messages'||['/api/messages/history','/api/messages/send','/api/messages/open','/api/messages/read','/api/messages/mute'].includes(path);
    if(legacyChat)return json({error:'Reload the page to connect to the new chat.'},410);
      const mutation=!['GET','HEAD','OPTIONS'].includes(request.method),policyMutation=mutation&&(path.startsWith('/api/admin/')||path.startsWith('/api/groups/')||['/api/me/account','/api/me/revoke'].includes(path)),logout=mutation&&['/api/logout','/api/me/password'].includes(path);
    try{
      if(path==='/api/me/notification-sounds'){
        if(url.hostname!==env.CONTENT_ALLOWED_HOST||env.STORAGE_MODE!=='production')fail(403,'Unavailable.');
        const actor=await authenticate(env,request);if(!actor)fail(401,'Sign in first.');
        if(mutation&&(request.headers.get('Origin')!==url.origin||env.CONTENT_WRITES!=='true'))fail(403,'Unavailable.');
        return await notificationSoundRoute(request,env.CONTENT_MEDIA,actor);
      }
      if(path==='/api/messages/profile'){
        if(url.hostname!==env.CONTENT_ALLOWED_HOST||env.STORAGE_MODE!=='production')fail(403,'Unavailable.');const actor=await authenticate(env,request);if(!actor)fail(401,'Sign in first.');
        const allowed=await chatCall(env,'CHAT_INBOX',actor.id,'/command',{action:'profiles',body:{ids:[actor.id]}});if(!allowed.profiles.length)fail(403,'Account unavailable.');
        if(request.method==='GET'){const result=await chatCall(env,'CHAT_BRIDGE','global','/profile',{actor,read:true});return json(result);}
        if(request.method!=='POST'||request.headers.get('Origin')!==url.origin||env.CONTENT_WRITES!=='true')fail(403,'Unavailable.');const raw=await request.text();if(raw.length>1024)fail(413,'Profile request is too large.');let body;try{body=JSON.parse(raw);}catch{fail(400,'Invalid profile.');}if(!body||typeof body!=='object')fail(400,'Invalid profile.');
        const result=await chatCall(env,'CHAT_BRIDGE','global','/profile',{actor,phone:body.phone,phoneVisible:body.phoneVisible,birthday:body.birthday,birthdayVisible:body.birthdayVisible});return json({details:result.details,profile:publicProfile(result.profile)});
      }
      if(path==='/api/messages/username'){
        if(url.hostname!==env.CONTENT_ALLOWED_HOST||env.STORAGE_MODE!=='production')fail(403,'Unavailable.');
        const actor=await authenticate(env,request);if(!actor)fail(401,'Sign in first.');
        if(request.method!=='POST'||request.headers.get('Origin')!==url.origin||env.CONTENT_WRITES!=='true')fail(403,'Unavailable.');
        const raw=await request.text();if(raw.length>1024)fail(413,'Username request is too large.');let body;try{body=JSON.parse(raw);}catch{fail(400,'Invalid username.');}
        if(!body||typeof body.username!=='string'||body.expectedUsername!==undefined&&typeof body.expectedUsername!=='string')fail(400,'Invalid username.');
        const allowed=await chatCall(env,'CHAT_INBOX',actor.id,'/command',{action:'profiles',body:{ids:[actor.id]}});if(!allowed.profiles.length)fail(403,'Account unavailable.');
        const result=await chatCall(env,'CHAT_BRIDGE','global','/username',{actor,username:body.username,expectedUsername:body.expectedUsername});return json({profile:publicProfile(result.profile)});
      }
      if(path==='/api/messages/avatar'){
        if(url.hostname!==env.CONTENT_ALLOWED_HOST||env.STORAGE_MODE!=='production')fail(403,'Unavailable.');
        const actor=await authenticate(env,request);if(!actor)fail(401,'Sign in first.');
        const subject=url.searchParams.get('subject')||actor.id;
        const allowed=await chatCall(env,'CHAT_INBOX',actor.id,'/command',{action:'profiles',body:{ids:[subject]}});
        if(!allowed.profiles.some(p=>p.id===subject))fail(403,'This profile is unavailable.');
        if(request.method==='GET'||request.method==='HEAD'){
          const saved=await chatCall(env,'CHAT_BRIDGE','global','/profiles',{actor,ids:[subject]});const profile=saved.profiles[0];if(!profile?.storageKey)fail(404,'No avatar.');
          const response=await chatFileResponse(env.CONTENT_MEDIA,{storage_key:profile.storageKey,mime:profile.mime,name:'avatar'},request);
          if(response.status===200&&url.searchParams.get('v'))response.headers.set('Cache-Control','private, max-age=31536000, immutable');
          return response;
        }
        if(request.method!=='POST'||request.headers.get('Origin')!==url.origin||env.CONTENT_WRITES!=='true')fail(403,'Unavailable.');
        if(subject!==actor.id&&!subject.startsWith('group:'))fail(403,'Only the owner can change this avatar.');
        if(subject.startsWith('group:')&&!staff(actor))fail(403,'Only teachers can change group avatars.');
        const reader=request.body?.getReader();if(!reader)fail(400,'Empty avatar.');const chunks=[];let size=0;
        try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024){await reader.cancel();fail(413,'Maximum avatar size is 2 MB.');}chunks.push(part.value);}}finally{reader.releaseLock();}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        const metadata=await chatFileMetadata(bytes,request.headers.get('Content-Type')||'');if(!['image/jpeg','image/png','image/webp','image/avif'].includes(metadata.mime))fail(400,'Use JPEG, PNG, WebP or AVIF.');
        const storageKey='chat/avatars/'+crypto.randomUUID();await env.CONTENT_MEDIA.put(storageKey,bytes,{httpMetadata:{contentType:metadata.mime}});
        const result=await chatCall(env,'CHAT_BRIDGE','global','/avatar',{actor,groupId:subject.startsWith('group:')?subject.slice(6):null,storageKey,mime:metadata.mime,size});
        if(result.previousKey&&env.CONTENT_MEDIA.delete)ctx.waitUntil(env.CONTENT_MEDIA.delete(result.previousKey).catch(()=>{}));return json({profile:publicProfile(result.profile)});
      }
      if(path==='/api/messages/preview'||path==='/api/messages/preview-image'){
        if(url.hostname!==env.CONTENT_ALLOWED_HOST||env.STORAGE_MODE!=='production')fail(403,'Unavailable.');const actor=await authenticate(env,request);if(!actor)fail(401,'Sign in first.');
        if(path.endsWith('/preview-image')){if(request.method!=='GET')fail(405,'Use GET.');return chatPreviewImage(url.searchParams.get('id'),url.origin);}
        if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)fail(403,'Unavailable.');const raw=await request.text();if(raw.length>4096)fail(413,'Link too long.');let body;try{body=JSON.parse(raw);}catch{fail(400,'Invalid link.');}
        return json(await chatLinkPreview(body.url,url.origin,()=>chatCall(env,'CHAT_INBOX',actor.id,'/command',{action:'preview-budget',body:{}})));
      }
      if(path==='/api/messages/file'||path==='/api/messages/upload'){
        if(url.hostname!==env.CONTENT_ALLOWED_HOST||env.STORAGE_MODE!=='production')fail(403,'Unavailable.');
        const actor=await authenticate(env,request);if(!actor)fail(401,'Sign in first.');const roomId=url.searchParams.get('roomId');
        await chatCall(env,'CHAT_INBOX',actor.id,'/command',{action:'members',body:{roomId}});
        if(path.endsWith('/file')){if(!['GET','HEAD'].includes(request.method))fail(405,'Use GET.');const file=await chatCall(env,'CHAT_ROOM',roomId,'/file',{actor,id:url.searchParams.get('id')});return chatFileResponse(env.CONTENT_MEDIA,file,request);}
        if(request.method!=='POST'||request.headers.get('Origin')!==url.origin||env.CONTENT_WRITES!=='true')fail(403,'Unavailable.');
        await chatCall(env,'CHAT_ROOM',roomId,'/write-access',{actor});
        const reader=request.body?.getReader(),chunks=[];let size=0;if(!reader)fail(400,'Empty attachment.');
        try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>CHAT_FILE_LIMIT){await reader.cancel();fail(413,'Maximum attachment size is 25 MB.');}chunks.push(part.value);}}finally{reader.releaseLock();}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        const name=String(url.searchParams.get('name')||'attachment').slice(0,160),metadata=await chatFileMetadata(bytes,request.headers.get('Content-Type')||''),id=crypto.randomUUID(),storageKey='chat/files/'+id+'/'+metadata.sha256;
        await env.CONTENT_MEDIA.put(storageKey,bytes,{httpMetadata:{contentType:metadata.mime},customMetadata:{name}});
        return json(await chatCall(env,'CHAT_ROOM',roomId,'/file/register',{actor,file:{id,name,mime:metadata.mime,size,storageKey}}));
      }
      if(route){
        if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'Use WebSocket.'},426);
        if(env.STORAGE_MODE!=='production'||url.hostname!==env.CONTENT_ALLOWED_HOST||request.headers.get('Origin')!==url.origin)fail(403,'Chat is unavailable here.');
        const actor=await authenticate(env,request);if(!actor)fail(401,'Sign in to open messages.');
        const identity=await sessionIdentity(env,request);
        await chatCall(env,'CHAT_BRIDGE','global','/bootstrap',{actor});
        const target='https://chat.internal/connect?after='+Math.max(0,Number(url.searchParams.get('after'))||0);
        return env.CHAT_INBOX.get(env.CHAT_INBOX.idFromName(chatStorageName(env,actor.id))).fetch(new Request(target,{headers:{Upgrade:'websocket','X-Chat-Internal':env.CONTENT_SESSION_SECRET||env.SESSION_SECRET,...(identity?{'X-Chat-Session':identity.sid,'X-Chat-Session-Expires':String(identity.exp*1000),'X-Chat-Session-Namespace':env.AUTH_DATABASE_PROVIDER==='neon'?'auth/neon/':''}:{}),...chatDatabaseHeaders(env)}}));
      }
      const actor=logout||policyMutation?await authenticate(env,request):null;
      const syncPolicy=policyMutation&&actor&&(path.startsWith('/api/me/')||staff(actor))&&request.headers.get('Origin')===url.origin;
      if(syncPolicy)await chatCall(env,'CHAT_BRIDGE','global','/invalidate',{});
      const response=await application.fetch(request,env,ctx);
      if(response.ok&&mutation){
        // The session is already ended; sockets re-check it, so a failed closure must not hide the cookie reset.
        if(logout&&actor)try{await chatCall(env,'CHAT_INBOX',actor.id,'/revoke',{});}
          catch{console.error('Chat socket revocation deferred after logout.');ctx.waitUntil(chatCall(env,'CHAT_INBOX',actor.id,'/revoke',{}).catch(()=>console.error('Chat socket revocation retry failed.')));}
      }
      if(syncPolicy)try{await chatCall(env,'CHAT_BRIDGE','global','/policy',{});}catch{ctx.waitUntil(chatCall(env,'CHAT_BRIDGE','global','/policy',{}).catch(()=>{}));}
      if(response.ok&&mutation&&['/api/assessment','/api/exams/workflow','/api/exams/assign','/api/messages/assignment','/api/messages/pdf-grammar','/api/groups/manage','/api/groups/members'].includes(path))ctx.waitUntil(chatCall(env,'CHAT_BRIDGE','global','/flush',{}).catch(()=>{}));
      if(response.ok&&mutation&&path.startsWith('/api/exams'))ctx.waitUntil(chatCall(env,'CHAT_BRIDGE','global','/catalog',{}).catch(()=>{}));
      return response;
    }catch(error){return json({error:error.status?error.message:'Chat temporarily unavailable.'},error.status||503);}
  },
  async scheduled(event,env,ctx){if(env.CHAT_V2_ENABLED==='true')ctx.waitUntil(chatCall(env,'CHAT_BRIDGE','global','/flush',{}));}
};}
