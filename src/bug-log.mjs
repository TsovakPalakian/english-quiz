// Developer-only failure journal. One row per repeated failure. The latest exchange replaces the stored one.
import {statement} from './turso-study.mjs';
const CLIP=4000;
const SECRET=new Set(['cookie','authorization','set-cookie','proxy-authorization']);
const CREATE=`CREATE TABLE IF NOT EXISTS bug_reports (
  signature TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  error TEXT NOT NULL,
  hits INTEGER NOT NULL,
  accounts_json TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  time_zone TEXT NOT NULL DEFAULT ''
)`;
let ready=false;
export function resetBugStoreForTests(){ready=false;}
export function clipText(value){
  const text=String(value??'');
  return text.length<=CLIP?text:text.slice(0,CLIP)+'…';
}
export function headerMap(headers){
  const out={};
  headers.forEach((value,key)=>{
    const name=String(key||'').toLowerCase();
    out[name]=SECRET.has(name)?'[hidden]':clipText(value);
  });
  return out;
}
export function routeKey(pathname){
  return String(pathname||'/').split('/').map(part=>{
    if(!part)return part;
    if(/^lesson_[A-Za-z0-9_]+$/.test(part)||/^[a-f0-9-]{16,}$/i.test(part)||part.length>24)return ':id';
    return part;
  }).join('/');
}
export async function bugSignature(method,pathname,status,error){
  const raw=[method,routeKey(pathname),status,error].join('\n');
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].slice(0,16).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function formatBugTime(ms,zone){
  const time=Number(ms);
  if(!time)return '';
  const timeZone=zoneName(zone);
  try{
    const shown=new Intl.DateTimeFormat('en-GB',{timeZone,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'}).format(new Date(time));
    return timeZone==='UTC'?shown:shown+' '+timeZone;
  }catch{return new Date(time).toISOString()+' UTC';}
}
export function zoneName(value){
  const zone=String(value||'UTC');
  return /^[A-Za-z0-9_+\-/]{1,80}$/.test(zone)?zone:'UTC';
}
function bugRequest(event,previous,now){
  const request=Object.assign({},event.request||{});
  delete request.history;
  const context=request.context&&typeof request.context==='object'&&!Array.isArray(request.context)?Object.assign({},request.context):{};
  for(const key of ['screen','href','language','userAgent','viewport','stack','role']){
    if(context[key]==null||context[key]==='')delete context[key];
    else context[key]=clipText(context[key]).slice(0,key==='stack'?1500:500);
  }
  if(typeof context.online!=='boolean')delete context.online;
  if(event.account?.role)context.role=String(event.account.role).slice(0,40);
  if(Object.keys(context).length)request.context=context;
  else delete request.context;
  if(!previous)return request;
  let history=[];
  try{
    const prev=JSON.parse(previous.request_json||'{}');
    history=Array.isArray(prev.history)?prev.history.slice(-7):[];
    history.push({at:Number(previous.last_at)||now,url:String(prev.url||'').slice(0,300),body:String(prev.body||'').slice(0,180)});
  }catch{history=[];}
  request.history=history;
  return request;
}
async function ensure(db){
  if(ready)return;
  await db.atomic([statement(CREATE)]);
  try{await db.atomic([statement("ALTER TABLE bug_reports ADD COLUMN time_zone TEXT NOT NULL DEFAULT ''")]);}catch{/* column already exists */}
  try{await db.atomic([statement('ALTER TABLE bug_reports ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0')]);}catch{/* column already exists */}
  ready=true;
}
export async function saveBug(db,event){
  await ensure(db);
  const method=String(event.method||'GET');
  const path=String(event.path||'/');
  const status=Number(event.status)||0;
  const error=clipText(event.error||('HTTP '+status)).slice(0,500);
  const signature=await bugSignature(method,path,status,error);
  const login=String(event.account?.login||event.account?.id||'');
  const now=Date.now();
  const timeZone=zoneName(event.timeZone);
  const existing=await db.read('SELECT hits, accounts_json, first_at, last_at, request_json FROM bug_reports WHERE signature = ?',[signature]);
  const request=bugRequest(event,existing[0],now);
  const requestJson=JSON.stringify(request);
  const responseJson=JSON.stringify(event.response||{});
  if(existing.length){
    let accounts=[];
    try{accounts=JSON.parse(existing[0].accounts_json)||[];}catch{accounts=[];}
    if(login&&!accounts.includes(login))accounts=accounts.concat(login).slice(-8);
    const hits=Number(existing[0].hits)+1;
    await db.atomic([
      statement('UPDATE bug_reports SET hits=?, accounts_json=?, request_json=?, response_json=?, error=?, last_at=?, time_zone=? WHERE signature=?',
        [hits,JSON.stringify(accounts),requestJson,responseJson,error,now,timeZone,signature]),
      statement('UPDATE bug_reports SET resolved=0 WHERE signature=?',[signature])
    ]);
    return {signature,hits};
  }
  await db.atomic([statement(
    `INSERT INTO bug_reports(signature,method,path,status,error,hits,accounts_json,request_json,response_json,first_at,last_at,time_zone)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [signature,method,routeKey(path),status,error,1,JSON.stringify(login?[login]:[]),requestJson,responseJson,now,now,timeZone])]);
  return {signature,hits:1};
}
export async function resolveBug(db,signature){
  await ensure(db);
  if(!/^[a-f0-9]{32}$/.test(String(signature||'')))return false;
  const existing=await db.read('SELECT signature FROM bug_reports WHERE signature=?',[signature]);
  if(!existing.length)return false;
  await db.atomic([statement('UPDATE bug_reports SET resolved=1 WHERE signature=?',[signature])]);
  return true;
}
function bugView(row){
  return {
    id:row.signature,method:row.method,path:row.path,status:Number(row.status),error:row.error,hits:Number(row.hits),
    accounts:JSON.parse(row.accounts_json||'[]'),request:JSON.parse(row.request_json||'{}'),response:JSON.parse(row.response_json||'{}'),
    firstAt:Number(row.first_at),lastAt:Number(row.last_at),timeZone:zoneName(row.time_zone),
    when:formatBugTime(row.last_at,row.time_zone),firstWhen:formatBugTime(row.first_at,row.time_zone),
    resolved:Number(row.resolved)===1
  };
}
export async function listBugs(db){
  await ensure(db);
  const rows=await db.read(`SELECT signature,method,path,status,error,hits,accounts_json,request_json,response_json,first_at,last_at,time_zone,resolved
    FROM bug_reports ORDER BY resolved, last_at DESC, hits DESC LIMIT 100`);
  return rows.map(bugView);
}
export async function listBugHeads(db){
  await ensure(db);
  const rows=await db.read(`SELECT signature,hits,last_at,resolved FROM bug_reports ORDER BY last_at DESC LIMIT 100`);
  return rows.map(row=>({id:row.signature,hits:Number(row.hits),lastAt:Number(row.last_at),resolved:Number(row.resolved)===1}));
}
export async function listBugsByIds(db,ids){
  await ensure(db);
  const wanted=[...new Set(ids)];
  if(!wanted.length)return [];
  const rows=await db.read(`SELECT signature,method,path,status,error,hits,accounts_json,request_json,response_json,first_at,last_at,time_zone,resolved
    FROM bug_reports WHERE signature IN (${wanted.map(()=>'?').join(',')})`,wanted);
  const byId=new Map(rows.map(row=>[row.signature,bugView(row)]));
  return wanted.map(id=>byId.get(id)).filter(Boolean);
}
export async function recordHttpBug(db,actor,request,response){
  if(!db||!response)return;
  const url=new URL(request.url);
  if((!url.pathname.startsWith('/api/')&&url.pathname!=='/lookup'&&url.pathname!=='/translate')||url.pathname==='/api/bugs'||url.pathname.endsWith('/media'))return;
  if(response.status>=200&&response.status<300)return;
  let responseText='';
  try{responseText=await response.text();}catch{responseText='';}
  let error='';
  try{error=JSON.parse(responseText).error||'';}catch{error='';}
  if(!error)error=clipText(responseText)||('HTTP '+response.status);
  let requestText='';
  if(!['GET','HEAD'].includes(request.method)){
    try{requestText=await request.text();}catch{requestText='';}
  }
  await saveBug(db,{
    account:actor?{id:actor.id||'',login:actor.login||'',role:actor.role||''}:{id:'',login:'',role:''},
    method:request.method,path:url.pathname,status:response.status,error,timeZone:'UTC',
    request:{method:request.method,url:url.pathname+url.search,headers:headerMap(request.headers),body:clipText(requestText)},
    response:{status:response.status,headers:headerMap(response.headers),body:clipText(responseText)}
  });
}
