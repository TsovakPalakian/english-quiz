import {chatCall} from './chat-durable.mjs';
const staff=user=>['ADMIN','DEVELOPER'].includes(user?.role);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function profileAllowed(inbox,id){
  const actor=inbox.get('profile');if(!actor||actor.active===false)return false;
  if(id.startsWith('group:'))return inbox.get('groups',[]).some(g=>'group:'+g.id===id);
  if(id===actor.id||staff(actor))return true;
  const rooms=inbox.rows('SELECT data FROM rooms').map(row=>JSON.parse(row.data)).filter(room=>room.peerId===id&&room.active!==false);
  if(rooms.some(room=>room.access?.blocked))return false;
  return inbox.get('contacts',[]).some(u=>u.id===id)||rooms.length>0||inbox.get('discovered:'+id)?.expires>Date.now();
}
export function profileDetails(store,id){const row=store.sql.exec('SELECT phone,phone_visible,birthday,birthday_visible FROM profiles WHERE user_id=?',id).toArray()[0];return {phone:row?.phone||'',phoneVisible:!!row?.phone_visible,birthday:row?.birthday||'',birthdayVisible:!!row?.birthday_visible};}
function record(store,id){const saved=store.get('avatar:'+id)||{},presence=store.get('presence:'+id)||{online:false};return {id,...saved,...presence,username:store.get('username:'+id)||'',...profileDetails(store,id)};}
export function readProfiles(store,body){
  const ids=body.ids;if(!Array.isArray(ids)||ids.length>100)fail(400,'Choose up to 100 profiles.');
  const profiles=[];
  for(const id of new Set(ids)){if(typeof id!=='string'||!/^[A-Za-z0-9:_-]{1,180}$/.test(id))fail(400,'Invalid profile.');profiles.push(record(store,id));const watchers=new Set(store.get('watchers:'+id)||[]);if(!watchers.has(body.actor.id)){watchers.add(body.actor.id);store.set('watchers:'+id,[...watchers]);}}
  return {profiles};
}
async function publish(store,id){
  const profile=record(store,id);
  await Promise.all((store.get('watchers:'+id)||[]).map(viewer=>chatCall(store.env,'CHAT_INBOX',viewer,'/event',{key:'profile:'+id+':'+crypto.randomUUID(),type:'profile',profile:publicProfile(profile)}).catch(()=>{})));
  return {profile};
}
export async function setPresence(store,body){
  const id=body.id;if(typeof id!=='string'||!/^[A-Za-z0-9:_-]{1,180}$/.test(id)||id.startsWith('group:')||typeof body.online!=='boolean')fail(400,'Invalid presence.');
  if(store.get('presence:'+id)?.online===body.online)return {unchanged:true};
  store.set('presence:'+id,{online:body.online,lastSeen:body.online?null:Date.now()});return publish(store,id);
}
export async function setAvatar(store,body){
  if(body.actor.active===false)fail(403,'Account unavailable.');
  if(body.groupId&&!staff(body.actor))fail(403,'Only teachers can change group avatars.');
  const id=body.groupId?'group:'+body.groupId:body.actor.id;
  if(typeof body.storageKey!=='string'||!body.storageKey.startsWith('chat/avatars/'))fail(400,'Invalid avatar.');
  const old=store.get('avatar:'+id),revision=crypto.randomUUID();
  store.set('avatar:'+id,{avatarUrl:'/api/messages/avatar?subject='+encodeURIComponent(id)+'&v='+revision,storageKey:body.storageKey,mime:body.mime,size:body.size});
  return {...await publish(store,id),previousKey:old?.storageKey};
}
export async function setUsername(store,body){
  if(!body.actor?.id||body.actor.active===false)fail(403,'Account unavailable.');
  const username=String(body.username??'').trim().toLowerCase();
  if(username&&!/^@[a-z0-9_]{3,32}$/.test(username))fail(400,'Username must start with @ and contain 3 to 32 Latin letters, numbers or underscores.');
  const id=body.actor.id,previous=store.get('username:'+id)||'',owner=username?store.get('username-owner:'+username):null;
  if(owner&&owner!==id)fail(409,'That username is already in use.');
  if(body.expectedUsername!==undefined&&body.expectedUsername!==previous)fail(409,'Your username changed in another window. Reopen Profile.');
  if(previous===username)return {profile:record(store,id)};
  store.ctx.storage.transactionSync(()=>{if(previous)store.set('username-owner:'+previous,null);if(username)store.set('username-owner:'+username,id);store.set('username:'+id,username);});
  return publish(store,id);
}
export function signupUsername(store,body){
  const username='@'+String(body.login||'').toLowerCase(),reservation='signup:'+body.reservationId;
  if(!/^@[a-z0-9_]{3,32}$/.test(username)||! /^[A-Za-z0-9_-]{1,100}$/.test(body.reservationId||''))fail(400,'Invalid signup username.');
  if(!['reserve','activate','release','rollback'].includes(body.action))fail(400,'Invalid signup action.');
  if(['activate','rollback'].includes(body.action)&&! /^[A-Za-z0-9_-]{1,100}$/.test(body.userId||''))fail(400,'Invalid account.');
  store.ctx.storage.transactionSync(()=>{
    const owner=store.get('username-owner:'+username);
    if(body.action==='reserve'){
      if(owner&&owner!==reservation)fail(409,'That username is already in use.');
      store.set('username-owner:'+username,reservation);
    }else if(body.action==='activate'){
      if(owner&&owner!==reservation&&owner!==body.userId)fail(409,'That username is already in use.');
      const previous=store.get('username:'+body.userId);
      if(previous&&previous!==username)fail(409,'This account already has a username.');
      store.set('username-owner:'+username,body.userId);store.set('username:'+body.userId,username);
    }else if(body.action==='release'){
      if(owner===reservation)store.set('username-owner:'+username,null);
    }else if(owner===body.userId){
      store.set('username-owner:'+username,reservation);store.set('username:'+body.userId,null);
    }
  });
  return {username};
}
export async function setProfileDetails(store,body){
  if(!body.actor?.id||body.actor.active===false)fail(403,'Account unavailable.');
  if(typeof body.phone!=='string'||typeof body.phoneVisible!=='boolean'||typeof body.birthday!=='string'||typeof body.birthdayVisible!=='boolean')fail(400,'Invalid profile details.');
  const phone=body.phone.trim(),birthday=body.birthday.trim(),digits=phone.replace(/\D/g,'');
  if(phone&&(!/^\+?[0-9 ().-]{5,32}$/.test(phone)||digits.length<5||digits.length>15))fail(400,'Enter a valid phone number.');
  if(birthday){const date=new Date(birthday+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(birthday)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==birthday||birthday>new Date().toISOString().slice(0,10))fail(400,'Enter a valid birthday in the past.');}
  store.sql.exec('INSERT INTO profiles(user_id,phone,phone_visible,birthday,birthday_visible) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,phone_visible=excluded.phone_visible,birthday=excluded.birthday,birthday_visible=excluded.birthday_visible',body.actor.id,phone,body.phoneVisible?1:0,birthday,body.birthdayVisible?1:0);
  return {...await publish(store,body.actor.id),details:profileDetails(store,body.actor.id)};
}
export function publicProfile(profile){const {storageKey,mime,size,phone,birthday,...value}=profile;return {...value,...(profile.phoneVisible&&phone?{phone}:{}),...(profile.birthdayVisible&&birthday?{birthday}:{})};}
