// Disabled migration candidate. Existing accounts stay in the original D1/R2
// implementation; ONLY explicitly migrated educational routes go to Turso.
import accounts,{currentUser,managedAccount,twinStudyAccountId,pairManageDenied,sessionIdentity} from './worker.js';
import {observeSession,listSessions,endSession} from './security-sessions.mjs';
import study,{ACCOUNT_AUTH,StageAuthBudget,studyClient} from './turso-stage-worker.mjs';
import {StudyError,StudyService,statement as s} from './turso-study.mjs';
import {ensureStudyProfile} from './turso-profile.mjs';
import {everydayCatalog,removeEssentialReference} from './essential-catalog.mjs';
import {ensurePairedThemes} from './turso-paired-themes.mjs';
import {VisibilityService} from './turso-visibility.mjs';
import {GroupService} from './turso-groups.mjs';
import {ExamService} from './turso-exams.mjs';
import {TursoStudyClient} from './turso-study.mjs';
import {legacyTexts,legacyLessons,legacyCard,accountBootstrap,accountCards,accountQuizzes,accountProgress,accountSongs,pageLimit} from './turso-legacy-read.mjs';
import {mediaPlaceholders,mediaKey,storedMediaResponse} from './turso-media.mjs';
import {stageR2Media} from './turso-r2-media.mjs';
import {PersonalService} from './turso-personal.mjs';
import {ActivityService} from './turso-activity.mjs';
import {ArchiveService} from './turso-archive.mjs';
import {AssessmentService} from './turso-assessment.mjs';
import {ExamWorkflowService} from './exam-workflow.mjs';
import {examRecommendation} from './exam-recommendations.mjs';
import {listBugHeads,listBugs,listBugsByIds,recordHttpBug,resolveBug,saveBug} from './bug-log.mjs';
import {analyzerAiIssue} from './analyzer-client.js';
import {databaseStatus,databaseAction} from './database-administration.mjs';
import {chatCall} from './chat-durable.mjs';
import {JSON_BODY_LIMIT,LIBRARY_BODY_LIMIT} from './turso-request-limits.mjs';
export {StageAuthBudget};
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const decoder=new TextDecoder();
const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
async function verifyAccountPassword(db,actor,password){
  if(typeof password!=='string'||!password||password.length>32)throw new StudyError(401,'Wrong password.');
  const row=await db.prepare('SELECT password_salt,password_hash,password_iterations FROM users WHERE id=?').bind(actor.id).first();
  if(!row||row.password_iterations!==100000||! /^[a-f0-9]{32}$/.test(row.password_salt)||! /^[a-f0-9]{64}$/.test(row.password_hash))throw new StudyError(401,'Wrong password.');
  const salt=Uint8Array.from(row.password_salt.match(/../g),value=>parseInt(value,16));
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const actual=hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},key,256));
  let difference=0;for(let i=0;i<64;i++)difference|=actual.charCodeAt(i)^row.password_hash.charCodeAt(i);
  if(difference!==0)throw new StudyError(401,'Wrong password.');
  return true;
}
function deploymentContext(env){
  const meta=env.CF_VERSION_METADATA||{};
  return {name:'English Quiz',service:'learn-english',host:env.STAGE_ALLOWED_HOST||'',deploymentId:String(meta.id||''),deploymentTag:String(meta.tag||''),deployedAt:String(meta.timestamp||'')};
}
async function boundedText(request,limit,message){
  if(Number(request.headers.get('content-length')||0)>limit)throw new StudyError(413,message);
  const reader=request.body?.getReader();if(!reader)return '';let size=0,chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new StudyError(413,message);}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return decoder.decode(bytes);
}
const identity='[a-f0-9]{16,64}';
const cardKey=value=>{const id=Number(value);if(!/^[1-9]\d{0,15}$/.test(value||'')||!Number.isSafeInteger(id))throw new StudyError(400,'Invalid card ID.');return id;};
// The source handler uses HTTP-quoted ETags for CAS. R2Conditional needs raw
// ETags; preserve its CAS and restrict this adapter to the account directory.
export function accountMedia(bucket){
  if(!bucket)return bucket;
  return new Proxy(bucket,{get(target,key){
    if(key==='put')return (path,value,options)=>target.put(path,value,
      path==='directory/accounts.json'&&/^"[^"\r\n]+"$/.test(options?.onlyIf?.etagMatches||'')
        ?{...options,onlyIf:{...options.onlyIf,etagMatches:options.onlyIf.etagMatches.slice(1,-1)}}:options);
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
}
export function accountRoute(path,method){
  if(method==='GET'&&['/api/me','/api/me/account','/api/admin/users','/api/admin/registrations','/api/admin/changes'].includes(path))return true;
  if(method==='POST'&&['/api/register','/api/login','/api/logout','/api/me/activity','/api/me/account','/api/me/account/cancel','/api/me/password','/api/me/revoke'].includes(path))return true;
  if(['GET','DELETE'].includes(method)&&new RegExp('^/api/admin/users/'+identity+'$').test(path))return true;
  if(method==='POST'&&new RegExp('^/api/admin/users/'+identity+'/(profile|hidden|active|role)$').test(path))return true;
  return method==='POST'&&new RegExp('^/api/admin/(registrations|changes)/'+identity+'/(approve|reject)$').test(path);
}
// Charge EVERY account query, not just the first auth SELECT. Nothing in this
// adapter may touch old educational tables, or run arbitrary DDL/SQL via exec.
export function accountDatabase(db,reserve,{allowWrites=false}={}){
  if(!db?.prepare)throw new StudyError(503,'Account database unavailable.');
  const allowed=new Set(['users','registrations','account_changes']);
  const statements=new WeakMap();
  const check=sql=>{
    if(typeof sql!=='string'||sql.includes(';')||/--|\/\*/.test(sql))throw new StudyError(500,'Unsafe account query.');
    const write=!/^\s*SELECT\b/i.test(sql);
    if(write&&!allowWrites)throw new StudyError(503,'Account changes disabled.');
    const tables=[...sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+([a-z_][a-z0-9_]*)/ig)].map(m=>m[1].toLowerCase());
    // Preserve explicit account revocation/deletion cleanup, never permit
    // reads or general writes to these legacy educational tables.
    const cleanup=/^\s*DELETE FROM (user_state|user_added|user_card_gone) WHERE user_id\s*=\s*\?\s*$/i.test(sql);
    const index=/^\s*CREATE UNIQUE INDEX IF NOT EXISTS account_changes_[a-z_]+ ON account_changes\s*\(/i.test(sql);
    const create=/^\s*CREATE TABLE IF NOT EXISTS account_changes\s*\(/i.test(sql);
    if(!tables.length&&!index||tables.some(table=>!allowed.has(table))&&!cleanup
      ||!/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)&&!index&&!create)throw new StudyError(500,'Only account tables are allowed.');
  };
  const prepare=sql=>{check(sql);const wrap=statement=>{
    const result={bind:(...args)=>wrap(statement.bind(...args))};
    for(const method of ['first','all','run','raw'])result[method]=async(...args)=>{await reserve();return statement[method](...args);};
    statements.set(result,statement);return result;
  };return wrap(db.prepare(sql));};
  return {prepare,async exec(){throw new StudyError(500,'Account exec disabled.');},async batch(commands){
    if(!Array.isArray(commands)||!commands.length||commands.length>10||commands.some(command=>!statements.has(command)))throw new StudyError(500,'Only validated account statements may be batched.');
    for(const command of commands)await reserve();
    return db.batch(commands.map(command=>statements.get(command)));
  }};
}
export function integratedWorker({accountWorker=accounts,authenticate=currentUser,studyWorker=study,
  authorizeManaged=managedAccount,studyDatabase=studyClient}={}){
  return {async fetch(request,env,ctx){
    const bugProbe=env.BUG_LOG==='true'&&bugWatch(request)?request.clone():null;
    let bugActor=null;
    const originalAuth=authenticate;
    const identify=async(...args)=>{const user=await originalAuth(...args);if(user)bugActor=user;return user;};
    const response=await (async()=>{
    try{
      if(env.STAGE_ENABLED!=='true')return json({error:'Integrated TEST candidate disabled. Production unchanged.'},503);
      const url=new URL(request.url),path=url.pathname,method=request.method;
      if(url.protocol!=='https:'||url.hostname!==env.STAGE_ALLOWED_HOST)throw new StudyError(403,'Configured test host only.');
      if(!['GET','HEAD'].includes(method)&&request.headers.get('origin')!==url.origin)throw new StudyError(403,'Invalid origin.');
      const reserve=async()=>{
        // Explicit TEST configuration only; live authentication and the
        // account-only SQL whitelist remain enforced on every request.
        if(env.ACCOUNT_QUERY_LIMIT_ENABLED==='false')return;
        const budget=env.AUTH_BUDGET?.get(env.AUTH_BUDGET.idFromName('global-auth-limit'));
        if(!budget)throw new StudyError(503,'Persistent account query limit unavailable.');
        const response=await budget.fetch('https://budget.internal/',{method:'POST',body:JSON.stringify({kind:'read'})});
        if(!response.ok)throw new StudyError(response.status,'Account query limit reached.');
      };
      const accountEnv={...env,MEDIA:accountMedia(env.MEDIA),DB:accountDatabase(env.DB,reserve,{allowWrites:env.ACCOUNT_MUTATIONS_ENABLED==='true'})};
      if(path==='/api/me/sessions'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const session=await sessionIdentity(accountEnv,request);if(!session||session.id!==actor.id)throw new StudyError(401,'Sign in first.');
        if(method==='GET'){
          await observeSession(studyDatabase(env),request,session);
          return json(await listSessions(studyDatabase(env),session,{view:url.searchParams.get('view')||'active',cursor:url.searchParams.get('cursor')}));
        }
        if(method!=='POST')throw new StudyError(405,'Use GET or POST.');
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let body;try{body=JSON.parse(await boundedText(request,512,'Session request too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid session request.');}
        if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='id'))throw new StudyError(400,'Invalid session request.');
        const result=await endSession(studyDatabase(env),accountEnv.MEDIA,session,body.id);
        if(env.CHAT_INBOX)try{await chatCall(env,'CHAT_INBOX',actor.id,'/revoke-session',{sid:result.sid});}catch{console.error('Session socket closure deferred to revocation checks.');}
        const response=json({ended:result.ended,current:result.current});
        if(result.current)response.headers.set('Set-Cookie','enquiz_sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
        return response;
      }
      if(path==='/api/developer/databases'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(actor.role!=='DEVELOPER')throw new StudyError(403,'Developers only.');
        if(method==='GET')return json(databaseStatus(env));
        if(method!=='POST')throw new StudyError(405,'Use GET or POST.');
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let body;try{body=JSON.parse(await boundedText(request,512,'Database action too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid JSON.');}
        const result=await databaseAction(env,body,{actor,readTurso:()=>new TursoStudyClient({endpoint:'https://'+new URL(env.TURSO_URL).hostname+'/v2/pipeline',token:env.TURSO_AUTH_TOKEN,mode:env.STORAGE_MODE||'test'}).read('SELECT 1 AS ok')});
        if(body.action==='activate'&&result.revision!==env.DATABASE_SELECTION?.revision){
          if(env.CHAT_BRIDGE)ctx.waitUntil(chatCall(env,'CHAT_BRIDGE','global','/invalidate',{}).catch(()=>console.error('Previous database chat invalidation failed; epoch fencing remains active.')));
        }
        const response=json(result);
        if(body.action==='activate')response.headers.set('X-Database-Context',result.active+':'+result.revision);
        return response;
      }
      if(path==='/api/everyday'&&method==='GET'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        let viewer=actor;const accountId=url.searchParams.get('accountId');
        if(accountId){const found=await authorizeManaged(accountEnv,actor,accountId);if(found.error)return found.error;if(pairManageDenied(actor,found.row.login,'read'))throw new StudyError(403,'You cannot do that.');viewer={id:found.row.id,role:found.row.role};}
        return json(await everydayCatalog(studyDatabase(env),viewer));
      }
      if(path==='/api/everyday/reference'&&method==='DELETE'){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const raw=await request.text();if(raw.length>1024)throw new StudyError(413,'Reference too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        return json(await removeEssentialReference(studyDatabase(env),actor,body));
      }
      if(['/api/groups/manage','/api/groups/members'].includes(path)&&['GET','POST'].includes(method)){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(!['ADMIN','DEVELOPER'].includes(actor.role))throw new StudyError(403,'Teachers only.');
        if(method==='GET'){
          if(path!=='/api/groups/members')throw new StudyError(405,'Use POST.');
          const target=new URL(request.url);target.pathname='/api/admin/users';target.search='';
          const response=await accountWorker.fetch(new Request(target,{headers:request.headers}),accountEnv,ctx);if(!response.ok)return response;
          const users=await response.json(),ids=new Set((users.users||[]).filter(user=>user.role==='USER').map(user=>user.id));
          return json({members:(await new GroupService(studyDatabase(env)).members(actor)).filter(member=>ids.has(member.accountId))});
        }
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let value;try{value=JSON.parse(await boundedText(request,4096,'Group request too large.'));}catch{throw new StudyError(400,'Invalid group request.');}
        if(!value||typeof value!=='object'||Array.isArray(value))throw new StudyError(400,'Invalid group request.');
        if(path==='/api/groups/manage')return json(await new GroupService(studyDatabase(env)).manage(actor,value));
        const found=await authorizeManaged(accountEnv,actor,value.accountId);if(found.error)return found.error;
        if(found.row.role!=='USER')throw new StudyError(400,'Only students can be assigned to a group.');
        return json(await new GroupService(studyDatabase(env)).assignStudent(actor,value.accountId,value.groupId));
      }
      if(path==='/api/exams/work'&&['GET','POST'].includes(method)){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        let value={studentId:url.searchParams.get('student')||''};
        if(method==='POST'){
          if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
          try{value=JSON.parse(await boundedText(request,100000,'Exam work too large.'));}catch{throw new StudyError(400,'Invalid exam work.');}
        }
        if(!value||typeof value!=='object'||Array.isArray(value))throw new StudyError(400,'Invalid exam work.');
        if(value.studentId&&value.studentId!==actor.id){const found=await authorizeManaged(accountEnv,actor,value.studentId);if(found.error)return found.error;}
        const service=new ExamService(studyDatabase(env));
        return json(method==='GET'?{work:await service.listWork(actor,value.studentId)}:await service.saveWork(actor,value));
      }
      if(path==='/api/assessment/recording'&&['GET','HEAD','POST'].includes(method)){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(method==='POST'&&env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        const query={kind:url.searchParams.get('kind'),id:Number(url.searchParams.get('id')),part:Number(url.searchParams.get('part')),index:Number(url.searchParams.get('index')),studentId:url.searchParams.get('student')||'',expectedRevision:Number(url.searchParams.get('expectedRevision'))};
        if(query.studentId&&query.studentId!==actor.id){const found=await authorizeManaged(accountEnv,actor,query.studentId);if(found.error)return found.error;}
        const value=await new AssessmentService(studyDatabase(env)).recording(actor,query,request,stageR2Media(env));
        return value instanceof Response?value:json(value);
      }
      if(path==='/api/assessment'&&['GET','POST'].includes(method)){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        let value;if(method==='GET')value={kind:url.searchParams.get('kind'),id:Number(url.searchParams.get('id')),studentId:url.searchParams.get('student')||'',history:url.searchParams.get('history')==='1'};
        else{if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');try{value=JSON.parse(await boundedText(request,100000,'Assessment too large.'));}catch{throw new StudyError(400,'Invalid assessment.');}}
        if(!value||typeof value!=='object'||Array.isArray(value))throw new StudyError(400,'Invalid assessment.');
        if(value.studentId&&value.studentId!==actor.id){const found=await authorizeManaged(accountEnv,actor,value.studentId);if(found.error)return found.error;}
        const service=new AssessmentService(studyDatabase(env));
        return json(method==='POST'?await service.write(actor,value):value.history?{history:await service.history(actor,value)}:await service.get(actor,value));
      }
      if(path==='/api/exams/workflow'&&['GET','POST'].includes(method)){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(method==='POST'&&env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let value;try{value=method==='GET'?{examId:Number(url.searchParams.get('examId'))}:JSON.parse(await boundedText(request,512,'Workflow request too large.'));}catch{throw new StudyError(400,'Invalid workflow request.');}
        if(!value||Object.keys(value).some(key=>!['examId','action'].includes(key)))throw new StudyError(400,'Invalid workflow request.');
        const service=new ExamWorkflowService(studyDatabase(env));return json(method==='GET'?await service.status(actor,value):await service.write(actor,value));
      }
      if(path==='/api/exams/recommendation'&&method==='POST'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let value;try{value=JSON.parse(await boundedText(request,1000,'Review request too large.'));}catch{throw new StudyError(400,'Invalid review request.');}
        if(!value||Object.keys(value).some(key=>!['id','studentId','partId','index','expectedRevision'].includes(key)))throw new StudyError(400,'Invalid review request.');
        const found=await authorizeManaged(accountEnv,actor,value.studentId);if(found.error)return found.error;
        return json(await examRecommendation(studyDatabase(env),env,actor,value));
      }
      if(path==='/api/archive'&&['GET','POST'].includes(method)){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const archive=new ArchiveService(studyDatabase(env));
        if(method==='GET'){
          const params=new URL(request.url).searchParams;
          return json(params.has('type')||params.has('id')?await archive.preview(actor,{type:params.get('type'),id:params.get('id')}):await archive.list(actor));
        }
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
        const raw=await boundedText(request,JSON_BODY_LIMIT,'Archive request too large.');let value;
        try{value=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        if(value.action==='archive')return json(await archive.archive(actor,value));
        if(value.action==='restore')return json(await archive.restore(actor,value));
        if(value.action==='remove')return json(await archive.remove(actor,value,{passwordVerified:actor.role!=='ADMIN'||await verifyAccountPassword(accountEnv.DB,actor,value.password)}));
        throw new StudyError(400,'Invalid archive action.');
      }
      if(path==='/api/bugs'&&method==='POST'){
        let actor=null;try{actor=await identify(accountEnv,request);}catch{actor=null;}
        const raw=await request.text();if(raw.length>64000)throw new StudyError(413,'Bug report too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        const reported=String(body.path||'/');
        const status=Number(body.status);
        if(!reported.startsWith('/')||!Number.isInteger(status)||status<0||status>599)throw new StudyError(400,'Invalid bug report.');
        await saveBug(studyDatabase(env),{
          account:actor?{id:actor.id||'',login:actor.login||'',role:actor.role||''}:{id:'',login:'',role:''},
          method:String(body.method||'GET').slice(0,16),path:reported.slice(0,300),status,
          error:String(body.error||'Client failure').slice(0,500),timeZone:body.timeZone,
          request:body.request&&typeof body.request==='object'&&!Array.isArray(body.request)?{...body.request,context:{...(body.request.context&&typeof body.request.context==='object'&&!Array.isArray(body.request.context)?body.request.context:{}),application:{...(body.request.context?.application&&typeof body.request.context.application==='object'?body.request.context.application:{}),...deploymentContext(env)}}}:{context:{application:deploymentContext(env)}},
          response:body.response&&typeof body.response==='object'&&!Array.isArray(body.response)?body.response:{}
        });
        return new Response(null,{status:204});
      }
      if(path==='/api/bugs/resolve'&&method==='POST'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(actor.role!=='DEVELOPER')throw new StudyError(403,'You cannot do that.');
        const raw=await request.text();if(raw.length>200)throw new StudyError(413,'Bug request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        if(!await resolveBug(studyDatabase(env),body.id))throw new StudyError(404,'Bug not found.');
        return new Response(null,{status:204});
      }
      if(path==='/api/bugs'&&method==='GET'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(actor.role!=='DEVELOPER')throw new StudyError(403,'You cannot do that.');
        const db=studyDatabase(env);
        if(url.searchParams.get('heads')==='1'){
          if(url.searchParams.has('ids'))throw new StudyError(400,'Invalid bug ids.');
          return json({heads:await listBugHeads(db)});
        }
        if(url.searchParams.has('ids')){
          const ids=[...new Set((url.searchParams.get('ids')||'').split(',').map(id=>id.trim()).filter(Boolean))];
          if(!ids.length||ids.length>20||ids.some(id=>!/^[a-f0-9]{32}$/.test(id)))throw new StudyError(400,'Invalid bug ids.');
          return json({bugs:await listBugsByIds(db,ids)});
        }
        return json({bugs:await listBugs(db)});
      }
      if(path==='/api/cards/lookup'&&method==='POST'){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(!['ADMIN','DEVELOPER'].includes(actor.role))throw new StudyError(403,'Teachers only.');
        const raw=await request.text();if(raw.length>4096)throw new StudyError(413,'Lookup request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        const result=await new StudyService(studyDatabase(env)).lookupSharedCard(actor,body,async word=>{
          const target=new URL(request.url);target.pathname='/lookup';target.search='';target.searchParams.set('word',word);
          const response=await accountWorker.fetch(new Request(target,{headers:request.headers}),accountEnv,ctx);
          if(!response.ok)throw new StudyError(response.status,'Dictionary lookup failed. Try again.');
          return response.json();
        });
        return json(result);
      }
      // Recover registration visibility even when the legacy directory CAS
      // failed. Developer-only, account fields only, one budgeted query.
      if(path==='/api/admin/registrations'&&method==='GET'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(actor.role==='DEVELOPER'){
          const rows=await accountEnv.DB.prepare('SELECT r.id,r.login,r.email,r.name,r.status,r.role,r.user_id,r.created_at,r.decided_at FROM registrations r LEFT JOIN users u ON u.id=r.user_id WHERE r.user_id IS NULL OR r.user_id=\'\' OR u.is_personal_data_revoked=0 ORDER BY r.created_at DESC').all();
          return json({registrations:(rows.results||[]).map(row=>({id:row.id,login:row.login,email:row.email,name:row.name,status:row.status,role:row.role,user_id:row.user_id,createdAt:row.created_at,decidedAt:row.decided_at}))});
        }
      }
      const managedLink=path.match(new RegExp('^/api/admin/users/('+identity+')/cards(/new)?$'));
      if(managedLink&&method==='POST'){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedLink[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'study'))throw new StudyError(403,'You cannot do that.');
        const raw=await request.text();if(raw.length>(managedLink[2]?64000:4096))throw new StudyError(413,'Card request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        if(!found.songs&&['music','text'].includes(body.place||body.card?.place))throw new StudyError(403,'This material is unavailable.');
        const db=studyDatabase(env);
        return json(managedLink[2]?await new PersonalService(db).createManagedCard(actor,found.row.id,body):await new StudyService(db).linkManagedCard(actor,found.row.id,body));
      }
      const managedCard=path.match(new RegExp('^/api/admin/users/('+identity+')/cards/([1-9]\\d{0,15})$'));
      if(managedCard&&['PATCH','DELETE'].includes(method)){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(method==='DELETE'&&actor.role!=='DEVELOPER')throw new StudyError(403,'You cannot remove another account\'s data.');
        const found=await authorizeManaged(accountEnv,actor,managedCard[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'study'))throw new StudyError(403,'You cannot do that.');
        const raw=await request.text();if(raw.length>12000)throw new StudyError(413,'Card request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        if(method==='DELETE'){
          if(!found.songs&&body.place==='music')throw new StudyError(403,'Teacher cannot manage student songs.');
          return json(await new StudyService(studyDatabase(env)).unlinkManagedCard(actor,found.row.id,cardKey(managedCard[2]),body));
        }
        return json(await new PersonalService(studyDatabase(env)).editManagedCard(actor,found.row.id,cardKey(managedCard[2]),body));
      }
      const managedText=path.match(new RegExp('^/api/admin/users/('+identity+')/(texts|songs)(?:/([A-Za-z0-9_-]{1,100}))?$'));
      if(managedText&&method==='GET'&&managedText[3]){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedText[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'read'))throw new StudyError(403,'You cannot do that.');
        const kind=managedText[2]==='texts'?'text':'song';
        if(actor.role!=='DEVELOPER'||kind==='song'&&!found.songs)throw new StudyError(403,'This material is unavailable.');
        const target={id:found.row.id,role:actor.role};
        return json({item:await new PersonalService(studyDatabase(env)).libraryItem(target,cardKey(managedText[3]))});
      }
      if(managedText&&(managedText[3]?['PATCH','DELETE'].includes(method):method==='POST')){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(method==='DELETE'&&actor.role!=='DEVELOPER')throw new StudyError(403,'You cannot remove another account\'s data.');
        const found=await authorizeManaged(accountEnv,actor,managedText[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'study'))throw new StudyError(403,'You cannot do that.');
        const kind=managedText[2]==='texts'?'text':'song';
        if(actor.role!=='DEVELOPER'||kind==='song'&&!found.songs)throw new StudyError(403,'This material is unavailable.');
        const raw=await boundedText(request,kind==='text'?LIBRARY_BODY_LIMIT:JSON_BODY_LIMIT,'Text request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        const service=new PersonalService(studyDatabase(env));
        return json(method==='POST'?await service.createManagedLibrary(actor,found.row.id,kind,body):await service.editManagedLibrary(actor,found.row.id,cardKey(managedText[3]),kind,body,method==='DELETE'));
      }
      const managedAccess=path.match(new RegExp('^/api/admin/users/('+identity+')/lessons/([1-9]\\d{0,15})/access$'));
      const managedVisibility=path.match(new RegExp('^/api/admin/users/('+identity+')/visibility$'));
      if(managedVisibility&&method==='PATCH'){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedVisibility[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'restrict'))throw new StudyError(403,'You cannot do that.');
        let body;try{body=JSON.parse(await boundedText(request,4096,'Visibility request too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid JSON.');}
        return json(await new VisibilityService(studyDatabase(env)).set(actor,found.row.id,body));
      }
      if(['/api/groups','/api/exams'].includes(path)&&method==='GET'&&url.searchParams.has('for')){
        if([...url.searchParams.keys()].some(key=>key!=='for')||url.searchParams.getAll('for').length!==1)throw new StudyError(400,'Invalid account filter.');
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,url.searchParams.get('for'));if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'read'))throw new StudyError(403,'You cannot do that.');
        const target={id:found.row.id,role:actor.role,managedStudent:found.row.role==='USER'},db=studyDatabase(env);
        return json(path==='/api/groups'?{groups:await new GroupService(db).list(target)}:{exams:await new ExamService(db).list(target)});
      }
      if(managedAccess&&method==='PATCH'){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedAccess[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'restrict'))throw new StudyError(403,'You cannot do that.');
        const raw=await request.text();if(raw.length>4096)throw new StudyError(413,'Access request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        return json(await new StudyService(studyDatabase(env)).setLessonAccess(actor,found.row.id,cardKey(managedAccess[2]),body));
      }
      if(['/api/song-file','/api/lesson-file'].includes(path)&&['GET','HEAD'].includes(method)&&new URL(request.url).searchParams.has('for')){
        const params=new URL(request.url).searchParams;
        if([...params.keys()].some(key=>!['id','for'].includes(key)||params.getAll(key).length!==1)||!new RegExp('^'+identity+'$').test(params.get('for')||''))throw new StudyError(400,'Invalid managed media request.');
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,params.get('for'));if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,path==='/api/lesson-file'?'read':'study'))throw new StudyError(403,'You cannot do that.');
        if(path==='/api/song-file'&&(actor.role!=='DEVELOPER'||!found.songs))throw new StudyError(403,'This material is unavailable.');
        const target={id:found.row.id,role:actor.role},key=await mediaKey(studyDatabase(env),target,path==='/api/song-file'?'song':'lesson',params.get('id')||'');
        return key.startsWith('stage-local/')?await stageR2Media(env).response(key,method,request.headers.get('range')||''):await storedMediaResponse(env.MEDIA,key,request);
      }
      const managedDictionaries=path.match(new RegExp('^/api/admin/users/('+identity+')/cards/dictionary$'));
      if(managedDictionaries&&method==='GET'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedDictionaries[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'read'))throw new StudyError(403,'You cannot do that.');
        const db=studyDatabase(env),target={id:found.row.id,role:found.row.role};
        let rows=await new StudyService(db).readableCards(target,url.searchParams.get('ids')||'');
        if(!found.songs&&rows.length){
          const visible=await db.read(`SELECT p.card_id FROM profile_cards p JOIN profile_members m ON m.profile_id=p.profile_id WHERE m.account_id=? AND p.place<>'music' AND p.card_id IN (${rows.map(()=>'?').join(',')})`,[target.id,...rows.map(row=>row.id)]);
          const allowed=new Set(visible.map(row=>row.card_id));
          rows=rows.filter(row=>allowed.has(row.id));
        }
        return json({cards:rows.map(legacyCard)});
      }
      const managedDictionary=path.match(new RegExp('^/api/admin/users/('+identity+')/cards/([1-9]\\d{0,15})/dictionary$'));
      if(managedDictionary&&method==='GET'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedDictionary[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'read'))throw new StudyError(403,'You cannot do that.');
        const db=studyDatabase(env),target={id:found.row.id,role:found.row.role};
        const id=cardKey(managedDictionary[2]);
        if(!found.songs){const rows=await db.read("SELECT p.card_id FROM profile_cards p JOIN profile_members m ON m.profile_id=p.profile_id WHERE m.account_id=? AND p.card_id=? AND p.place<>'music'",[target.id,id]);if(!rows.length)throw new StudyError(403,'Song cards are unavailable to teachers.');}
        return json(legacyCard(await new StudyService(db).readableCard(target,id)));
      }
      const managedRead=path.match(new RegExp('^/api/admin/users/('+identity+')/(state|texts|lessons|stats|cards|quizzes|progress|songs)$'));
      if(managedRead&&method==='GET'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        // Source account authorization remains authoritative and budgeted.
        const found=await authorizeManaged(accountEnv,actor,managedRead[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'read'))throw new StudyError(403,'You cannot do that.');
        const target={id:found.row.id,role:found.row.role},db=studyDatabase(env);
        if(managedRead[2]==='stats'){
          const params=new URL(request.url).searchParams;
          if([...params.keys()].some(key=>!['from','to'].includes(key)||params.getAll(key).length!==1))throw new StudyError(400,'Only date filters are allowed.');
          const value=await new ActivityService(db).stats(target,Object.fromEntries(params));
          if(!found.songs){for(const key of ['songs','texts','archives','previousSongs','previousTexts','previousArchives'])delete value.activity[key];
            for(const row of value.activity.series){delete row.songs;delete row.texts;delete row.archives;if(row.cardAreas){delete row.cardAreas.music;delete row.cardAreas.lyrics;delete row.cardAreas.text;}}
            delete value.activity.cardAreas.music;delete value.activity.cardAreas.lyrics;delete value.activity.cardAreas.text;}
          return json({...value,hideSongs:!found.songs,statisticsSource:'turso-activity',targetAccountId:target.id});
        }
        // Teacher may inspect definitions; responses belong strictly to target.
        if(managedRead[2]==='lessons'){
          const params=new URL(request.url).searchParams,lessonId=params.get('id');
          return json(mediaPlaceholders(await legacyLessons(db,{id:target.id,role:actor.role},{summary:params.get('summary')==='1',lessonId:lessonId?cardKey(lessonId):''})));
        }
        const params=new URL(request.url).searchParams,query={after:params.get('after')||'',limit:pageLimit(params.get('limit')),place:params.get('place')||''};
        if(managedRead[2]==='texts'){if(actor.role!=='DEVELOPER')throw new StudyError(403,'This material is unavailable.');return json(await legacyTexts(db,{...target,role:actor.role},{summary:params.get('summary')!=='0',...query}));}
        if(managedRead[2]==='cards')return json(await accountCards(db,{...target,role:actor.role},{...query,excludePlaces:actor.role==='ADMIN'?['music','text']:[]}));
        if(managedRead[2]==='quizzes')return json(await accountQuizzes(db,target,query));
        if(managedRead[2]==='progress')return json(await accountProgress(db,target,query));
        if(managedRead[2]==='songs'){if(actor.role!=='DEVELOPER'||!found.songs)throw new StudyError(403,'This material is unavailable.');return json(await accountSongs(db,{...target,role:actor.role},query));}
        const value=await accountBootstrap(db,target);
        if(actor.role==='ADMIN'){
          if(value.counts){value.counts.songs=0;value.counts.texts=0;}
          if(value.stats){delete value.stats.theme;delete value.stats.customThemes;}
          delete value.stageThemeRevision;delete value.stageCustomRevision;
        }
        // Inspection does not provision accounts or permit whole-state writes.
        return json(value);
      }
      if(path==='/api/stats/history'&&method==='GET'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const target=new URL(request.url);target.pathname='/api/stats';
        const all=target.searchParams.get('scope')==='all';
        if(all&&actor.role!=='DEVELOPER')throw new StudyError(403,'You cannot do that.');
        target.searchParams.delete('scope');target.searchParams.delete('role');
        if(all){target.searchParams.delete('user');target.searchParams.delete('as');}
        else{target.searchParams.set('user',actor.id);target.searchParams.set('as','user');}
        const response=await accountWorker.fetch(new Request(target,{headers:request.headers}),accountEnv,ctx);
        if(!response.ok)return response;
        const value=await response.json();return json({...value,historySource:'legacy-r2-readonly',importedIntoTurso:false,combinedWithNewActivity:false});
      }
      if(accountRoute(path,method)){
        if(!['GET','HEAD'].includes(method)&&env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,'Original account mutations disabled on this candidate.');
        let approvalGroup=null,approvalActor=null;
        if(method==='POST'&&new RegExp('^/api/admin/registrations/'+identity+'/approve$').test(path)){
          const body=await request.clone().json();
          if(body.groupId!=null){
            approvalActor=await identify(accountEnv,request);if(!approvalActor||!['ADMIN','DEVELOPER'].includes(approvalActor.role))throw new StudyError(403,'Teachers only.');
            const pending=await accountEnv.DB.prepare('SELECT role FROM registrations WHERE id=?').bind(path.split('/')[4]).first();
            if(pending?.role!=='ADMIN'){
              if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
              await new GroupService(studyDatabase(env)).activeGroup(body.groupId);approvalGroup=body.groupId;
            }
          }
        }
        let response=await accountWorker.fetch(request,accountEnv,ctx);
        if(response.ok&&approvalGroup!=null){
          const result=await response.clone().json();
          if(!result.userId)throw new StudyError(500,'Account approved. Assign its group in Accounts.');
          try{if(result.role==='USER')await new GroupService(studyDatabase(env)).assignStudent(approvalActor,result.userId,approvalGroup);}
          catch{throw new StudyError(503,'Account approved, but its group could not be saved. Assign the group in Accounts.');}
        }
        // Only a trusted authentication response may attach the reserved pair.
        if((path==='/api/login'&&method==='POST'||path==='/api/me'&&method==='GET')&&response.ok&&env.STAGE_WRITES==='true'){
          const value=await response.clone().json();
          let newStudyAccount=false;
          if(value.user&&(path==='/api/login'||['TsovakDev','Tsovak'].includes(value.user.login))){
            const twinId=await twinStudyAccountId(accountEnv.DB,value.user.login);
            const db=studyClient(env);
            if(path==='/api/login')newStudyAccount=!(await db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[value.user.id])).length;
            await ensurePairedThemes(db,value.user,twinId);
            try{await ensureStudyProfile(db,value.user,twinId);}
            catch(error){
              if(!(error instanceof StudyError)||error.status!==409)throw error;
              // Keep authentication usable if existing profiles need an explicit merge.
              const headers=new Headers(response.headers);headers.delete('Content-Length');
              return Response.json({...value,studyPairNeedsMerge:true},{status:response.status,headers});
            }
          }
          if(value.user&&path==='/api/login'){
            const db=studyClient(env),[seen]=await db.read("SELECT value_json FROM account_settings WHERE account_id=? AND key='welcomeSeen'",[value.user.id]);
            const recent=Number(value.user.createdAt)>Date.now()/1000-30*86400;
            await db.atomic([s("INSERT OR IGNORE INTO account_settings(account_id,key,value_json) VALUES(?,'welcomeSeen','true')",[value.user.id])]);
            value.user.firstLogin=!seen&&recent&&newStudyAccount;
            const headers=new Headers(response.headers);headers.delete('Content-Length');
            response=Response.json(value,{status:response.status,headers});
          }
        }
        if(response.ok&&['/api/me','/api/login'].includes(path)){
          const value=await response.clone().json(),headers=new Headers(response.headers);headers.delete('Content-Length');
          return Response.json({...value,migrationCapabilities:value.user?{legacyHistory:true,originalAccounts:true}:{}},{status:response.status,headers});
        }
        return response;
      }
      // These helpers return dictionary/preview results, not legacy study saves.
      if(method==='POST'&&path==='/api/analyze'){
        const response=await accountWorker.fetch(request,accountEnv,ctx);
        if(response.ok){
          const payload=await response.clone().json(),error=analyzerAiIssue(payload);
          if(error){
            const actor=await identify(accountEnv,request);
            await saveBug(studyDatabase(env),{method:'POST',path:'/api/analyze',status:503,error,account:actor,request:{component:'expression-analyzer'},response:{llm:payload.stats?.llm}}).catch(()=>{});
          }
        }
        return response;
      }
      if(['GET /lookup','GET /translate','GET /api/link-preview','POST /api/analyze','POST /api/phrase-card'].includes(method+' '+path))return await accountWorker.fetch(request,accountEnv,ctx);
      return await studyWorker.fetch(request,{...env,[ACCOUNT_AUTH]:{current:request=>identify(accountEnv,request)}},ctx);
    }catch(error){return json({error:error instanceof StudyError?error.message:'Integrated test service unavailable.'},error instanceof StudyError?error.status:503);}
    })();
    if(bugProbe&&response&&(response.status<200||response.status>=300)&&request.headers.get('x-client-bug')!=='1'){
      try{await recordHttpBug(studyDatabase(env),bugActor,bugProbe,response.clone(),deploymentContext(env));}catch{}
    }
    return response;
  }};
}
function bugWatch(request){
  try{const path=new URL(request.url).pathname;return (path.startsWith('/api/')||path==='/lookup'||path==='/translate')&&!path.startsWith('/api/bugs')&&!path.endsWith('/media');}
  catch{return false;}
}
export default integratedWorker();
