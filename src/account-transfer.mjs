import {chatCipher} from './chat-encryption.mjs';
import {assertAccountTransferRunning} from './account-transfer-guard.mjs';
import {readDatabaseSelection,DATABASE_CONTROL} from './database-selection.mjs';
const names={room:['meta','members','messages','outbox','files'],inbox:['meta','rooms','events'],bridge:['meta','profiles']};
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),n=>n.toString(16).padStart(2,'0')).join('');
export async function trackTransferTask(store,operation){
 const tasks=store.transferTasks||=(new Set()),task=Promise.resolve().then(operation);tasks.add(task);
 try{return await task;}finally{tasks.delete(task);}
}
async function settleTransferTasks(store){
 await Promise.allSettled([store.flushing,store.loading,...(store.importing?.values()||[])]);
 while(store.transferTasks?.size)await Promise.allSettled([...store.transferTasks]);
}
async function restoreAlarm(store,marker){
 if(!marker.alarmPending)return false;
 if((store.baseEnv||store.env).ACCOUNT_TRANSFER_FROZEN==='true')return true;
 await store.ctx.storage.setAlarm(Math.max(Date.now()+1000,marker.alarm));
 store.set('_accountTransfer',{...marker,alarmPending:false});return false;
}
export function transferAuthorized(env,request){
 const expires=Number(env.ACCOUNT_TRANSFER_EXPIRES),key=env.ACCOUNT_TRANSFER_KEY;
 if(!['source','target'].includes(env.ACCOUNT_TRANSFER_ROLE)||!key||key.length<40||!Number.isFinite(expires)||expires<=Date.now()||request.method!=='POST')return false;
 const supplied=request.headers.get('Authorization')||'',expected='Bearer '+key;let different=supplied.length^expected.length;
 for(let i=0;i<expected.length;i++)different|=(supplied.charCodeAt(i)||0)^expected.charCodeAt(i);
 return different===0;
}
export async function transferObject(store,request,kind){
 const env=store.baseEnv||store.env;
 if(!transferAuthorized(env,request))return reply({error:'Not found.'},404);
 try{
 const action=new URL(request.url).pathname.split('/').at(-1),tables=names[kind];if(!tables)return reply({error:'Invalid transfer type.'},400);
 if(action==='export'&&env.ACCOUNT_TRANSFER_ROLE==='source'){
  if(env.ACCOUNT_TRANSFER_FROZEN!=='true')return reply({error:'Freeze the source before exporting.'},409);
  if(env.CONTENT_ENABLED==='true'){
   let frozen=false;
   try{await readDatabaseSelection(env[DATABASE_CONTROL]||env.CONTENT_MEDIA,{defaultProvider:env.DB_PROVIDER||'turso'});}catch(error){if(!error.migrationFrozen)throw error;frozen=true;}
   if(!frozen)return reply({error:'Persist the source migration fence before exporting.'},409);
  }
  await settleTransferTasks(store);
  const snapshot={version:1,kind,objectId:store.ctx.id?.toString()||'',logicalName:kind==='bridge'?'global':kind==='room'?store.get('room')?.id:store.get('profile')?.id,scope:store.get('_databaseScope'),tables:tables.map(name=>({name,rows:store.sql.exec('SELECT * FROM '+name+' ORDER BY rowid').toArray()})),sequence:store.sql.exec("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").toArray().length?store.sql.exec('SELECT name,seq FROM sqlite_sequence').toArray():[],alarm:await store.ctx.storage.getAlarm()};
  return reply({...snapshot,digest:await digest(snapshot)});
 }
 if(action==='import'&&env.ACCOUNT_TRANSFER_ROLE==='target'){
  const snapshot=await request.json(),{digest:expected,...value}=snapshot;
  if(value.version!==1||value.kind!==kind||expected!==await digest(value)||!Array.isArray(value.tables)||value.tables.map(t=>t.name).join(',')!==tables.join(',')||value.tables.some(t=>!Array.isArray(t.rows))||! /^[a-f0-9]{64}$/.test(value.objectId)||value.alarm!=null&&(!Number.isSafeInteger(value.alarm)||value.alarm<0))return reply({error:'Invalid transfer snapshot.'},400);
  const previous=store.get('_accountTransfer');if(previous?.digest===expected)return reply({imported:true,replayed:true,digest:expected,alarmDeferred:await restoreAlarm(store,previous)});
  if(tables.some(name=>store.sql.exec('SELECT COUNT(*) n FROM '+name).toArray()[0].n))return reply({error:'Target object is not empty.'},409);
  const cipher=kind==='bridge'?null:store.cipher,klass=kind==='room'?'ChatRoom':'ChatInbox',target=store.ctx.id?.toString()||'';
  const marker={digest:expected,sourceObjectId:value.objectId,at:Date.now(),alarm:value.alarm??null,alarmPending:value.alarm!=null};
  store.ctx.storage.transactionSync(()=>{
   for(const table of value.tables){const allowed=new Set(store.sql.exec('PRAGMA table_info('+table.name+')').toArray().map(c=>c.name));
    for(const row of table.rows){const columns=Object.keys(row);if(!columns.length||columns.some(name=>!allowed.has(name)))throw Error('Invalid columns');
     const values=columns.map(column=>{const raw=row[column];return cipher&&['body','format','payload','data','value'].includes(column)&&raw!=null?cipher.seal(cipher.open(raw,klass+':'+value.objectId+':'+column),klass+':'+target+':'+column):raw;});
     store.sql.exec('INSERT INTO '+table.name+' ('+columns.map(name=>'"'+name+'"').join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')',...values);
    }
   }
   for(const row of value.sequence||[]){if(!tables.includes(row.name)||!Number.isSafeInteger(row.seq)||row.seq<0)throw Error('Invalid sequence');store.sql.exec('DELETE FROM sqlite_sequence WHERE name=?',row.name);store.sql.exec('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)',row.name,row.seq);}
   store.set('_accountTransfer',marker);
  });
  return reply({imported:true,digest:expected,alarmDeferred:await restoreAlarm(store,marker),tables:value.tables.map(t=>({name:t.name,rows:t.rows.length}))});
 }
 return reply({error:'Not found.'},404);
 }catch{return reply({error:'Account transfer failed validation.'},400);}
}
export function accountTransferWorker(application){return {...application,async scheduled(event,env,ctx){
 if(env.ACCOUNT_TRANSFER_FROZEN==='true')return;
 return application.scheduled?.(event,env,ctx);
},async fetch(request,env,ctx){
 const path=new URL(request.url).pathname;
 if(path==='/__account-transfer'){
  if(!transferAuthorized(env,request))return reply({error:'Not found.'},404);
  try{const body=await request.json();
   if(body.action==='secrets'&&env.ACCOUNT_TRANSFER_ROLE==='source'){
    const keys=['CONTENT_SESSION_SECRET','CHAT_ENCRYPTION_KEY','CHAT_ENCRYPTION_KEY_ID','CHAT_ENCRYPTION_PREVIOUS_KEYS','EXPRESSION_ANALYZER_KEY','NEON_DATABASE_URL','TURSO_URL','TURSO_AUTH_TOKEN'];
    return reply({sealed:chatCipher({CHAT_ENCRYPTION_KEY:env.ACCOUNT_TRANSFER_KEY}).seal(JSON.stringify(Object.fromEntries(keys.filter(key=>env[key]).map(key=>[key,env[key]]))),'account-transfer:secrets')});
   }
   if(!['room','inbox','bridge'].includes(body.kind))return reply({error:'Invalid transfer type.'},400);
   const binding=env[{room:'CHAT_ROOM',inbox:'CHAT_INBOX',bridge:'CHAT_BRIDGE'}[body.kind]];
   if(body.action==='export'&&env.ACCOUNT_TRANSFER_ROLE==='source'&&/^[a-f0-9]{64}$/.test(body.objectId))return binding.get(binding.idFromString(body.objectId)).fetch(new Request('https://chat.internal/__account-transfer/export',{method:'POST',headers:{Authorization:request.headers.get('Authorization')}}));
   if(body.action==='import'&&env.ACCOUNT_TRANSFER_ROLE==='target'){
    const snapshot=body.snapshot;if(!snapshot?.logicalName||!['turso','neon'].includes(snapshot.scope?.provider))return reply({error:'Invalid logical object.'},400);
    const name=(snapshot.scope.provider==='neon'?'neon:v1:':'')+snapshot.logicalName;
    return binding.get(binding.idFromName(name)).fetch(new Request('https://chat.internal/__account-transfer/import',{method:'POST',headers:{Authorization:request.headers.get('Authorization'),'Content-Type':'application/json'},body:JSON.stringify(snapshot)}));
   }
   return reply({error:'Not found.'},404);
  }catch{return reply({error:'Account transfer unavailable.'},503);}
 }
 try{assertAccountTransferRunning(env);}catch(error){return reply({error:error.message},503);}
 return application.fetch(request,env,ctx);
}};}
