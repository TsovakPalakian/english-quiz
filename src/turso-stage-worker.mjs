// Separate, fail-closed TEST Worker. Never routes study data to production D1/R2 writes.
import {StudyService,TursoStudyClient,StudyError} from './turso-study.mjs';
import {PersonalService} from './turso-personal.mjs';
import {ActivityService} from './turso-activity.mjs';
import {legacyState,legacyTexts,legacyLessons,publicCatalogs,legacyCard} from './turso-legacy-read.mjs';
import {mediaKey,mediaPlaceholders,storedMediaResponse,inlineMedia} from './turso-media.mjs';
import {SongMediaService} from './turso-song-media.mjs';
import {LessonMediaService} from './turso-lesson-media.mjs';
import {stageR2Media,boundedMediaBytes} from './turso-r2-media.mjs';
import {inlineAssetResponse} from './turso-inline-assets.mjs';
import {ensureStudyProfile} from './turso-profile.mjs';
import {pdfAsset} from './turso-pdf-assets.mjs';
import {stageContentPolicy} from './turso-embed.mjs';
const encoder=new TextEncoder(),decoder=new TextDecoder();
export const studyClient=env=>new TursoStudyClient({endpoint:'https://'+new URL(env.TURSO_URL).hostname+'/v2/pipeline',token:env.TURSO_AUTH_TOKEN,mode:env.STORAGE_MODE||'test'});
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const unbase64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const authFields='id,login,email,name,role,password_salt,password_hash,password_iterations,active,is_personal_data_revoked,created_at';
const currentSql=`SELECT ${authFields} FROM users WHERE id=? LIMIT 1`;
const loginSql=`SELECT ${authFields} FROM users WHERE is_personal_data_revoked=0 AND (login=? OR email=?) LIMIT 1`;
const publicUser=row=>({id:row.id,login:row.login,email:row.email,name:row.name||'',role:row.role,revoked:false,createdAt:row.created_at||0});
const valid=row=>row&&row.active===1&&!row.is_personal_data_revoked&&['USER','ADMIN','DEVELOPER'].includes(row.role);
// Server-only injection for the integrated candidate. A client cannot set an
// environment Symbol through headers/body/query parameters.
export const ACCOUNT_AUTH=Symbol('verified-existing-account-auth');
export function reserveBudget(state,kind,now){
  if(!state||now-state.start>=3600000)state={start:now,reads:0,logins:[],revoked:{}};
  state.logins=state.logins.filter(at=>now-at<900000);
  state.revoked=Object.fromEntries(Object.entries(state.revoked).filter(([,exp])=>exp>now));
  if(['login','read'].includes(kind)){
    if(state.reads>=50)return {state,status:503};
    if(kind==='login'&&state.logins.length>=8)return {state,status:429};
    state.reads++;if(kind==='login')state.logins.push(now);
  }
  return {state,status:200};
}
export class StageAuthBudget {
  constructor(ctx){this.ctx=ctx;}
  async fetch(request){
    const body=await request.json();if(!['login','read','revoke'].includes(body.kind))return json({},400);
    return this.ctx.storage.transaction(async txn=>{
      let state=await txn.get('budget');const now=Date.now();
      // Revocations outlive the rolling auth quota window.
      const revoked=Object.fromEntries(Object.entries(state?.revoked||{}).filter(([,exp])=>exp>now));
      const result=reserveBudget(state,body.kind,now);state=result.state;state.revoked={...state.revoked,...revoked};
      if(body.kind==='revoke'){
        if(!/^[a-f0-9-]{36}$/.test(body.nonce)||!Number.isSafeInteger(body.expires)||body.expires>now+3600000)return json({},400);
        state.revoked[body.nonce]=body.expires;
      }
      if(body.kind==='read'&&state.revoked[body.nonce])return json({},401);
      await txn.put('budget',state);return json({ok:result.status===200},result.status);
    });
  }
}
async function body(request){
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new StudyError(415,'Use JSON.');
  if(Number(request.headers.get('content-length')||0)>65536)throw new StudyError(413,'Body too large.');
  const reader=request.body?.getReader();if(!reader)throw new StudyError(400,'Missing body.');let size=0,chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new StudyError(413,'Body too large.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{const value=JSON.parse(decoder.decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new StudyError(400,'Invalid JSON.');}
}
export class StageAuth {
  constructor(env){this.env=env;}
  async key(){if(!/^[a-f0-9]{64,128}$/.test(this.env.STAGE_SESSION_SECRET||''))throw new StudyError(503,'Test session secret missing.');return crypto.subtle.importKey('raw',encoder.encode(this.env.STAGE_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
  async budget(kind,extra={}){const stub=this.env.AUTH_BUDGET?.get(this.env.AUTH_BUDGET.idFromName('global-auth-limit'));if(!stub)throw new StudyError(503,'Persistent test auth limiter missing.');const response=await stub.fetch('https://budget.internal/',{method:'POST',body:JSON.stringify({kind,...extra})});if(!response.ok)throw new StudyError(response.status,'Test authentication limit or revocation.');}
  async row(sql,args){if(![loginSql,currentSql].includes(sql))throw new StudyError(500,'Only authentication SELECTs.');return this.env.DB.prepare(sql).bind(...args).first();}
  async gone(id){if(!/^[a-f0-9]{16,64}$/.test(id))throw new StudyError(503,'Invalid account identity.');if(!this.env.MEDIA)throw new StudyError(503,'Revocation provider missing.');return !!(await this.env.MEDIA.head('gone/'+id));}
  async login(value){
    if(!value||Object.keys(value).some(k=>!['login','password'].includes(k))||typeof value.login!=='string'||!value.login.trim()||value.login.length>120||typeof value.password!=='string'||!value.password||value.password.length>32)throw new StudyError(400,'Invalid login.');
    await this.budget('login');const row=await this.row(loginSql,[value.login.trim(),value.login.trim().toLowerCase()]);
    if(!valid(row)||row.password_iterations!==100000||! /^[a-f0-9]{32}$/.test(row.password_salt)||! /^[a-f0-9]{64}$/.test(row.password_hash))throw new StudyError(401,'Wrong login or password.');
    const salt=Uint8Array.from(row.password_salt.match(/../g),v=>parseInt(v,16));
    const key=await crypto.subtle.importKey('raw',encoder.encode(value.password),'PBKDF2',false,['deriveBits']);
    const actual=hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},key,256));
    let difference=0;for(let i=0;i<64;i++)difference|=actual.charCodeAt(i)^row.password_hash.charCodeAt(i);
    if(difference!==0||await this.gone(row.id))throw new StudyError(401,'Wrong login or password.');
    const payload={id:row.id,proof:await digest(row.password_hash),expires:Date.now()+3600000,nonce:crypto.randomUUID()};
    const part=base64(encoder.encode(JSON.stringify(payload))),signature=base64(await crypto.subtle.sign('HMAC',await this.key(),encoder.encode(part)));
    return {user:publicUser(row),cookie:`turso_stage=${part}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`};
  }
  async payload(request){
    const token=request.headers.get('cookie')?.match(/(?:^|;\s*)turso_stage=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)(?:;|$)/);if(!token)return null;
    if(token[0].length>1000)return null;try{
      if(!await crypto.subtle.verify('HMAC',await this.key(),unbase64(token[2]),encoder.encode(token[1])))return null;
      const p=JSON.parse(decoder.decode(unbase64(token[1])));return Number.isSafeInteger(p.expires)&&p.expires>Date.now()&&p.expires<=Date.now()+3600000&&/^[a-f0-9-]{36}$/.test(p.nonce)&&typeof p.id==='string'&&/^[a-f0-9]{64}$/.test(p.proof)?p:null;
    }catch{return null;}
  }
  async current(request){const p=await this.payload(request);if(!p)return null;await this.budget('read',{nonce:p.nonce});const row=await this.row(currentSql,[p.id]);return valid(row)&&await digest(row.password_hash)===p.proof&&!await this.gone(row.id)?publicUser(row):null;}
  async logout(request){const p=await this.payload(request);if(p)await this.budget('revoke',{nonce:p.nonce,expires:p.expires});return 'turso_stage=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';}
}
export default {async fetch(request,env){
  try{
    // Enabling/public access needs a separate explicit decision after acceptance.
    if(env.STAGE_ENABLED!=='true')return json({error:'TEST Worker disabled. Production is unchanged.'},503);
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(url.hostname!==env.STAGE_ALLOWED_HOST||url.protocol!=='https:')throw new StudyError(403,'Only the explicitly configured test host.');
    if(!['GET','HEAD'].includes(method)&&request.headers.get('origin')!==url.origin)throw new StudyError(403,'Invalid origin.');
    const auth=env[ACCOUNT_AUTH]||new StageAuth(env);
    if(path==='/api/login'&&method==='POST'){
      const result=await auth.login(await body(request));
      if(env.STAGE_WRITES==='true')await ensureStudyProfile(studyClient(env),result.user);
      return json({user:result.user},200,{'Set-Cookie':result.cookie});
    }
    if(path==='/api/logout'&&method==='POST')return json({ok:true},200,{'Set-Cookie':await auth.logout(request)});
    if(path==='/api/me'&&method==='GET')return json({user:await auth.current(request)});
    const allowedRead=['/api/me/account','/api/me/state','/api/lessons','/api/texts','/api/cards','/api/library','/api/stats','/api/song-file','/api/lesson-file'];
    const dictionary=path.match(/^\/api\/cards\/([A-Za-z0-9_-]{1,100})\/dictionary$/);
    const card=path.match(/^\/api\/(cards|quizzes)\/([^/]+)(\/quizzes)?$/),progress=path.match(/^\/api\/cards\/([^/]+)\/(progress|answers)$/),response=path.match(/^\/api\/lessons\/([^/]+)\/blocks\/([^/]+)\/response$/),lesson=path.match(/^\/api\/lessons\/([^/]+)$/),own=path.match(/^\/api\/me\/cards\/([^/]+)$/),library=path.match(/^\/api\/library\/([^/]+)$/);
    const songUpload=path.match(/^\/api\/library\/([A-Za-z0-9_-]{1,100})\/media$/),lessonUpload=path.match(/^\/api\/lessons\/([A-Za-z0-9_-]{1,100})\/blocks\/([A-Za-z0-9_-]{1,100})\/media$/);
    const binaryWrite=method==='POST'&&(songUpload||lessonUpload),inline=path.match(/^\/api\/migration-media\/([a-f0-9]{64})$/);
    const write=(method==='POST'&&['/api/lessons','/api/me/cards','/api/me/cards/new','/api/library','/api/stats/event'].includes(path))
      ||(card&&(card[3]?method==='POST'&&card[1]==='cards':['PATCH','DELETE'].includes(method)))
      ||(progress&&method===(progress[2]==='answers'?'POST':'PATCH'))||(response&&method==='PUT')||(lesson&&['PATCH','DELETE'].includes(method))||(own&&method==='DELETE')||(library&&['PATCH','DELETE'].includes(method))||binaryWrite||(lessonUpload&&method==='DELETE');
    const read=method==='GET'&&(allowedRead.includes(path)||dictionary||card?.[1]==='cards'&&!card[3])
      ||method==='HEAD'&&['/api/song-file','/api/lesson-file'].includes(path)||inline&&['GET','HEAD'].includes(method);
    const publicPaths=['/','/preview.html','/preview.js','/preview.css','/main-bridge.js','/main-stage.css','/almond-blossom.jpg','/grammar.js','/lesson-data.js','/irregular.js','/speakout.js','/tense-bank.json','/demonstratives.js'];
    const publicAsset=publicPaths.includes(path)||!!pdfAsset(path);
    if(!read&&!write&&!(method==='GET'&&publicAsset))throw new StudyError(501,'Not migrated. No production fallback.');
    const db=studyClient(env);
    const banks={'/grammar.js':['GRAMMAR'],'/lesson-data.js':['LESSON_DATA'],'/irregular.js':['IRREGULAR','VERB_IPA','VERB_IPA_CASE'],'/speakout.js':['SPEAKOUT'],'/tense-bank.json':['TENSE_BANK']};
    // Explicit public assets/catalogs only. Never spend an auth SELECT per asset.
    if(method==='GET'&&publicAsset){
      if(banks[path]){const data=await publicCatalogs(db,banks[path]);if(path.endsWith('.json'))return json(data.TENSE_BANK);return new Response(banks[path].map(k=>'window.'+k+'='+JSON.stringify(data[k]).replace(/</g,'\\u003c')+';').join('\n'),{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});}
      const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
      headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');
      headers.set('Content-Security-Policy',stageContentPolicy);
      return new Response(response.body,{status:response.status,headers});
    }
    // All non-public content requires a live, owner-bound test session.
    const actor=await auth.current(request);if(!actor)throw new StudyError(401,'Sign in first.');
    if(write&&env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
    if(binaryWrite){
      const allowed=['mutationId','expectedRevision','name',...(lessonUpload?['expectedBlockRevision']:[])];
      if([...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1))throw new StudyError(400,'Invalid upload parameters.');
      if(lessonUpload&&!['ADMIN','DEVELOPER'].includes(actor.role))throw new StudyError(403,'Only teacher/developer can upload lesson files.');
      const store=stageR2Media(env),bytes=await boundedMediaBytes(request),value={mutationId:url.searchParams.get('mutationId'),expectedRevision:Number(url.searchParams.get('expectedRevision')),
        name:url.searchParams.get('name'),mime:request.headers.get('content-type')?.split(';')[0].trim()||''};
      return json(lessonUpload?await new LessonMediaService(db,store).upload(actor,lessonUpload[1],lessonUpload[2],{...value,expectedBlockRevision:Number(url.searchParams.get('expectedBlockRevision'))},bytes)
        :await new SongMediaService(db,store).upload(actor,songUpload[1],value,bytes));
    }
    if(inline){const entry=await inlineMedia(db,actor,inline[1]);return await inlineAssetResponse(env.ASSETS,request,entry);}
    const s=new StudyService(db),p=new PersonalService(db),a=new ActivityService(db);
    const value=write?await body(request):null,id=match=>decodeURIComponent(match[1]);
    if(lessonUpload&&method==='DELETE')return json(await new LessonMediaService(db,null).detach(actor,lessonUpload[1],lessonUpload[2],value));
    if(path==='/api/me/account')return json({user:actor,testReadonly:true,locked:true});
    if(path==='/api/me/state')return json(mediaPlaceholders(await legacyState(db,actor,{compact:true})));
    if(dictionary)return json(legacyCard(await s.readableCard(actor,dictionary[1])));
    if(path==='/api/texts')return json(await legacyTexts(db,actor));
    if(path==='/api/library')return json(method==='POST'?await p.createLibrary(actor,value):{items:await p.library(actor)});
    if(library)return json(await p.editLibrary(actor,id(library),value,method==='DELETE'));
    if(path==='/api/stats/event')return json(await a.events(actor,value));
    if(path==='/api/stats')return json(await a.stats(actor,Object.fromEntries(url.searchParams)));
    if(path==='/api/me/cards/new')return json(await p.createOwnCard(actor,value));
    if(path==='/api/me/cards')return json(await s.linkCard(actor,value));
    if(own)return json(await s.unlinkCard(actor,id(own),value));
    if(path==='/api/lessons')return json(method==='POST'?await s.createLesson(actor,value):mediaPlaceholders(await legacyLessons(db,actor)));
    if(lesson)return json(await s[method==='DELETE'?'deleteLesson':'editLesson'](actor,id(lesson),value));
    if(path==='/api/cards')return json(await s.cards(actor,{query:url.searchParams.get('q')||'',exact:url.searchParams.get('exact')==='1',offset:Number(url.searchParams.get('offset')||0),lessonId:url.searchParams.get('lessonId')||''}));
    if(progress)return json(await s[progress[2]==='answers'?'answerCard':'saveCardProgress'](actor,id(progress),value));
    if(response)return json(await s.saveLessonResponse(actor,id(response),decodeURIComponent(response[2]),value));
    if(card){const key=decodeURIComponent(card[2]);return json(method==='GET'?await s.card(actor,key):await s[card[1]==='cards'?card[3]?'createQuiz':method==='PATCH'?'editCard':'deleteCard':method==='PATCH'?'editQuiz':'deleteQuiz'](actor,key,value));}
    if(['/api/song-file','/api/lesson-file'].includes(path)){
      if(url.searchParams.get('for'))throw new StudyError(403,'Only own media.');const key=await mediaKey(db,actor,path==='/api/song-file'?'song':'lesson',url.searchParams.get('id')||'');
      if(key.startsWith('stage-local/'))return await stageR2Media(env).response(key,method,request.headers.get('range')||'');
      return await storedMediaResponse(env.MEDIA,key,request);
    }
    throw new StudyError(404,'Not found.');
  }catch(error){return json({error:error instanceof StudyError?error.message:'Test service unavailable.'},error instanceof StudyError?error.status:503);}
}};
