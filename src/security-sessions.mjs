import {StudyError,statement as s} from './learning-study.mjs';
const RETENTION=90*86400000;
const fail=(status,message)=>{throw new StudyError(status,message);};
const clean=(value,max=160)=>typeof value==='string'?value.slice(0,max):'';
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
const prefix=account=>{if(!validId(account))fail(400,'Invalid account.');return account;};
export async function ensureSecuritySessions(db){
  await db.atomic([s('CREATE TABLE IF NOT EXISTS security_sessions(account_id TEXT NOT NULL,id TEXT NOT NULL,value_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,expires_at INTEGER NOT NULL,PRIMARY KEY(account_id,id))'),s('CREATE INDEX IF NOT EXISTS security_sessions_expiry ON security_sessions(expires_at)')]);
}
export async function credentialMarker(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
export function sessionRecordId(session){
  if(!/^(?:[a-f0-9]{32}|[a-f0-9]{40})$/.test(session.sid)||!Number.isSafeInteger(session.sortAt)||session.sortAt<0)fail(400,'Invalid session.');
  return String(9999999999999-session.sortAt).padStart(13,'0')+'-'+session.sid;
}
function recordKey(account,id){if(!/^\d{13}-(?:[a-f0-9]{32}|[a-f0-9]{40})$/.test(id||''))fail(400,'Invalid session ID.');prefix(account);return id;}
export function requestSessionMetadata(request){
  const cf=request?.cf||{},ua=clean(request?.headers.get('User-Agent'),512);
  const browser=[['Edge',/Edg(?:e|A|iOS)?\/([\d.]+)/],['Opera',/OPR\/([\d.]+)/],['Firefox',/(?:Firefox|FxiOS)\/([\d.]+)/],['Chrome',/(?:Chrome|CriOS)\/([\d.]+)/],['Safari',/Version\/([\d.]+).*Safari/]].find(([,pattern])=>pattern.test(ua));
  const os=/Android/.test(ua)?'Android':/iPhone|iPad|iPod/.test(ua)?'iOS / iPadOS':/Windows/.test(ua)?'Windows':/Macintosh|Mac OS/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Unknown';
  const latitude=cf.latitude==null||cf.latitude===''?NaN:Number(cf.latitude),longitude=cf.longitude==null||cf.longitude===''?NaN:Number(cf.longitude);
  return {userAgent:ua,browser:browser?browser[0]+' '+ua.match(browser[1])[1]:'Unknown',os,device:/iPad|Tablet/.test(ua)?'Tablet':/Mobile|iPhone|Android/.test(ua)?'Mobile':'Desktop / unknown',
    ip:request?.cf?clean(request.headers.get('CF-Connecting-IP'),64):'',country:clean(cf.country,8),region:clean(cf.region),city:clean(cf.city),timezone:clean(cf.timezone,80),
    latitude:Number.isFinite(latitude)&&Math.abs(latitude)<=90?latitude:null,longitude:Number.isFinite(longitude)&&Math.abs(longitude)<=180?longitude:null,
    asn:Number.isSafeInteger(cf.asn)?cf.asn:null,network:clean(cf.asOrganization),tls:clean(cf.tlsVersion,32)};
}
async function storedRecord(db,account,key){const [record]=await db.read('SELECT value_json,revision FROM security_sessions WHERE account_id=? AND id=?',[account,key]);return record?{row:JSON.parse(record.value_json),revision:record.revision}:null;}
async function save(db,key,row,revision){
  const commands=revision?[s('UPDATE security_sessions SET value_json=?,expires_at=?,revision=revision+1 WHERE account_id=? AND id=? AND revision=?',[JSON.stringify(row),Math.max(row.expiresAt||0,row.endedAt||0),row.account,key,revision])]:[s('INSERT OR IGNORE INTO security_sessions(account_id,id,value_json,expires_at) VALUES(?,?,?,?)',[row.account,key,JSON.stringify(row),row.expiresAt])];
  const result=await db.atomic(commands);return result[0]?.affected_row_count===1;
}
export async function observeSession(db,request,session){
  await ensureSecuritySessions(db);
  const key=recordKey(session.id,sessionRecordId(session)),metadata=requestSessionMetadata(request),now=Date.now(),marker=await credentialMarker(session.pwdv||'');
  for(let attempt=0;attempt<3;attempt++){
    const stored=await storedRecord(db,session.id,key),old=stored?.row;if(old?.endedAt)return old;
    const row=old?{...old,lastActivityAt:now,expiresAt:session.exp*1000,lastOrigin:metadata}:{sid:session.sid,account:session.id,startedAt:session.legacy?null:session.sortAt,firstObservedAt:now,lastActivityAt:now,expiresAt:session.exp*1000,origin:metadata,lastOrigin:metadata,credential:marker,databaseRevision:session.databaseRevision||0};
    if(await save(db,key,row,stored?.revision))return row;
  }
  fail(409,'Session details changed.');
}
function publicSession(row,id,session,marker){
  const now=Date.now(),expired=row.expiresAt<=now,credentialsChanged=row.credential!==marker,changedDatabase=row.databaseRevision!==(session.databaseRevision||0);
  const ended=!!row.endedAt||expired||credentialsChanged||changedDatabase;
  const origin=row.origin||{},last=row.lastOrigin||origin;
  const maps=origin.latitude!==null&&origin.longitude!==null&&Number.isFinite(origin.latitude)&&Number.isFinite(origin.longitude)?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(origin.latitude+','+origin.longitude):null;
  return {id,current:row.sid===session.sid,active:!ended,startedAt:row.startedAt,firstObservedAt:row.firstObservedAt,lastActivityAt:row.lastActivityAt,expiresAt:row.expiresAt,
    endedAt:row.endedAt||(expired?row.expiresAt:null),endReason:row.endReason||(expired?'expired':credentialsChanged?'password_changed':changedDatabase?'database_changed':''),...origin,
    lastIp:last.ip,lastCity:last.city,lastCountry:last.country,mapsUrl:maps,outcome:'success'};
}
export async function listSessions(db,session,{view='active',cursor}={}){
  if(!['active','history'].includes(view))fail(400,'Invalid session view.');
  if(cursor!=null&&(typeof cursor!=='string'||cursor.length>2048))fail(400,'Invalid cursor.');
  if(cursor)recordKey(session.id,cursor);
  const marker=await credentialMarker(session.pwdv||''),rows=[];
  const page=await db.read('SELECT id,value_json FROM security_sessions WHERE account_id=? AND id>? AND expires_at>=? ORDER BY id LIMIT 21',[prefix(session.id),cursor||'',Date.now()-RETENTION]);
  for(const object of page.slice(0,20)){
    const row=JSON.parse(object.value_json),item=publicSession(row,object.id,session,marker);
    if(item.active===(view==='active'))rows.push(item);
  }
  return {sessions:rows,nextCursor:page.length>20?page[19].id:null,view,retentionDays:90};
}
export async function endSession(db,bucket,session,id,reason='terminated'){
  const key=recordKey(session.id,id),stored=await storedRecord(db,session.id,key);if(!stored)fail(404,'Session not found.');
  const row=stored.row;if(row.account!==session.id)fail(404,'Session not found.');
  await bucket.put('revoked-sid/'+row.sid,JSON.stringify({exp:Math.ceil(row.expiresAt/1000)}),{httpMetadata:{contentType:'application/json'}});
  for(let attempt=0;attempt<3;attempt++){
    const current=attempt?await storedRecord(db,session.id,key):stored;if(!current)fail(404,'Session not found.');const latest=current.row;
    if(latest.endedAt||await save(db,key,{...latest,endedAt:Date.now(),endReason:reason},current.revision))return {ended:true,current:row.sid===session.sid,sid:row.sid};
  }
  fail(409,'The session was revoked, but its history could not be updated.');
}
export async function finishSessionRecord(db,session,reason){
  await ensureSecuritySessions(db);
  const key=recordKey(session.id,sessionRecordId(session));
  for(let attempt=0;attempt<3;attempt++){
    const object=await storedRecord(db,session.id,key);if(!object)return;const row=object.row;if(row.endedAt)return;
    if(await save(db,key,{...row,endedAt:Date.now(),endReason:reason},object.revision))return;
  }
}
export async function pruneSessionHistory(db){
  await ensureSecuritySessions(db);
  await db.atomic([s('DELETE FROM security_sessions WHERE expires_at<?',[Date.now()-RETENTION])]);
}
