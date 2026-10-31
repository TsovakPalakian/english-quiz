// Disabled migration candidate. Existing accounts stay in the original D1/R2
// implementation; ONLY explicitly migrated educational routes go to Learning.
import accounts,{currentUser,managedAccount,twinStudyAccountId,pairManageDenied,sessionIdentity,approveRegistration,sessionForEmail,sessionForPasskey,sessionForFederated,completeGoogleSignIn,completeFederatedSignIn,resetPasswordForEmail} from './worker.js';
import {observeSession,listSessions,endSession} from './security-sessions.mjs';
import study,{ACCOUNT_AUTH,StageAuthBudget,studyClient} from './learning-stage-worker.mjs';
import {StudyError,StudyService,statement as s} from './learning-study.mjs';
import {ensureStudyProfile} from './learning-profile.mjs';
import {everydayCatalog,removeEssentialReference} from './essential-catalog.mjs';
import {ensurePairedThemes} from './learning-paired-themes.mjs';
import {VisibilityService} from './learning-visibility.mjs';
import {GroupService} from './learning-groups.mjs';
import {AccountGroupTeachers} from './account-group-teachers.mjs';
import {AccountInvites} from './account-invites.mjs';
import {GuideVisits} from './guide-visits.mjs';
import {EmailOtp} from './email-otp.mjs';
import {Passkeys,passkeyCookie,passkeyCookieHeader} from './passkeys.mjs';
import {isSensitiveFileProbe,sensitiveFileNotFound} from './sensitive-paths.mjs';
import {MicrosoftOAuth,microsoftConfigured,microsoftCookie,microsoftCookieHeader,microsoftAuthorizeUrl,exchangeMicrosoftCode} from './microsoft-oauth.mjs';
import {TelegramOAuth,telegramConfigured,telegramCookie,telegramCookieHeader,telegramAuthorizeUrl,exchangeTelegramCode} from './telegram-oauth.mjs';
const oauthProviders={
  microsoft:{Service:MicrosoftOAuth,configured:microsoftConfigured,cookie:microsoftCookie,cookieHeader:microsoftCookieHeader,authorize:microsoftAuthorizeUrl,exchange:exchangeMicrosoftCode,label:'Microsoft'},
  telegram:{Service:TelegramOAuth,configured:telegramConfigured,cookie:telegramCookie,cookieHeader:telegramCookieHeader,authorize:telegramAuthorizeUrl,exchange:exchangeTelegramCode,label:'Telegram'},
};
import {createGoogleState,readGoogleState,googleAuthorizeUrl,exchangeGoogleCode,googleConfigured,googleCookie,googleCookieHeader} from './google-oauth.mjs';
import {ExamService} from './learning-exams.mjs';
import {legacyTexts,legacyLessons,legacyCard,accountBootstrap,accountCards,accountQuizzes,accountProgress,accountSongs,pageLimit} from './learning-legacy-read.mjs';
import {mediaPlaceholders,mediaKey,storedMediaResponse} from './learning-media.mjs';
import {stageR2Media} from './learning-r2-media.mjs';
import {PersonalService} from './learning-personal.mjs';
import {ActivityService} from './learning-activity.mjs';
import {ArchiveService} from './learning-archive.mjs';
import {AccountArchive,ensureAccountArchive} from './account-archive.mjs';
import {purgeStudyAccount} from './account-study-purge.mjs';
import {AssessmentService} from './learning-assessment.mjs';
import {ExamWorkflowService} from './exam-workflow.mjs';
import {examRecommendation} from './exam-recommendations.mjs';
import {essayCopilot} from './learning-essay-copilot.mjs';
import {ErrorBankService} from './learning-error-bank.mjs';
import {LearningSpeechScenariosService} from './learning-speech-scenarios.mjs';
import {listBugHeads,listBugs,listBugsByIds,recordHttpBug,resolveBug,saveBug} from './bug-log.mjs';
import {saveFeedback,listFeedback,countFeedback,resolveFeedback,notifyFeedbackTelegram,checkFeedbackRateLimit,defaultFeedbackLimitForRole,getUserFeedbackLimit,setUserFeedbackLimit,listUserFeedbackLimits,getFeedbackBreadcrumbsLimit,setFeedbackBreadcrumbsLimit,DEFAULT_ROLE_FEEDBACK_LIMITS,DEFAULT_BREADCRUMBS_LIMIT} from './feedback.mjs';
import {analyzerAiIssue} from './analyzer-client.js';
import {chatCall} from './chat-durable.mjs';
import {JSON_BODY_LIMIT,LIBRARY_BODY_LIMIT} from './learning-request-limits.mjs';
import {isWorkbenchPath,learningWorkbenchAPI} from './learning-workbench-api.mjs';
import {learningWorkbenchReadiness} from './learning-workbench-schema.mjs';
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
  authorizeManaged=managedAccount,studyDatabase=studyClient,approveRegistration:approveReg=approveRegistration,openWorkbench=null}={}){
  const capabilities=(env,user)=>user?{legacyHistory:true,originalAccounts:true,...(env.LEARNING_WORKBENCH_ENABLED==='true'&&typeof openWorkbench==='function'?{learningWorkbench:true,...(env.LEARNING_STUDY_BRIDGE==='true'?{learningStudyBridge:true}:{})}:{})}:{};
  async function approveInvitedStudent(env,accountEnv,registrationId){
    const invites=new AccountInvites(studyDatabase(env));
    // Only a server-claimed student invitation may authorize automatic approval.
    const invitation=await invites.registrationInvite({role:'DEVELOPER'},registrationId);
    if(!invitation||(invitation.kind||'student')!=='student'||invitation.uses!==1||!invitation.acceptedAt)throw new StudyError(403,'A valid student invitation is required.');
    const registration=await accountEnv.DB.prepare('SELECT role,email FROM registrations WHERE id=?').bind(registrationId).first();
    if(registration?.role!=='USER'||String(registration.email).toLowerCase()!==invitation.registrationEmail)throw new StudyError(403,'The registration does not match this student invite.');
    const sender={id:invitation.createdBy,role:'ADMIN'};
    const response=await approveReg(accountEnv,sender,registrationId);
    const result=await response.json();
    if(!response.ok)throw new StudyError(response.status,result.error||'The invited account could not be approved.');
    const person=await accountEnv.DB.prepare('SELECT id,email,role,active FROM users WHERE id=?').bind(result.userId).first();
    await invites.completeApproval(sender,registrationId,person,[person],(teacher,id,group)=>new GroupService(studyDatabase(env)).assignStudent(teacher,id,group));
    try{await chatCall(env,'CHAT_BRIDGE','global','/invalidate',{});}catch{}
  }
  async function finishIdentitySignIn(response,env,accountEnv,inviteWarning=''){
    const session=await response.clone().json();
    if(env.STAGE_WRITES==='true'&&session.user){
      const twinId=await twinStudyAccountId(accountEnv.DB,session.user.login);
      const db=studyDatabase(env);
      const newStudyAccount=!(await db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[session.user.id])).length;
      await ensurePairedThemes(db,session.user,twinId);
      try{await ensureStudyProfile(db,session.user,twinId);}
      catch(error){
        if(!(error instanceof StudyError)||error.status!==409)throw error;
        const headers=new Headers(response.headers);headers.delete('Content-Length');
        return Response.json({...session,studyPairNeedsMerge:true,inviteWarning:inviteWarning||undefined,migrationCapabilities:capabilities(env,session.user)},{status:response.status,headers});
      }
      const [seen]=await db.read("SELECT value_json FROM account_settings WHERE account_id=? AND key='welcomeSeen'",[session.user.id]);
      const recent=Number(session.user.createdAt)>Date.now()/1000-30*86400;
      await db.atomic([s("INSERT OR IGNORE INTO account_settings(account_id,key,value_json) VALUES(?,'welcomeSeen','true')",[session.user.id])]);
      session.user.firstLogin=!seen&&recent&&newStudyAccount;
    }
    const headers=new Headers(response.headers);headers.delete('Content-Length');
    return Response.json({...session,inviteWarning:inviteWarning||undefined,migrationCapabilities:capabilities(env,session.user)},{status:response.status,headers});
  }
  return {async fetch(request,env,ctx){
    if(isSensitiveFileProbe(request))return sensitiveFileNotFound(request);
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
      if(isWorkbenchPath(path)){
        if(env.LEARNING_WORKBENCH_ENABLED!=='true')return json({error:'Not found.'},404);
        const actor=await identify(accountEnv,request);
        if(!actor||actor.active===false||actor.active===0||actor.revoked||!['USER','ADMIN','DEVELOPER'].includes(actor.role))throw new StudyError(401,'Active account required.');
        const writable=env.STAGE_WRITES==='true'&&env.LEARNING_WORKBENCH_WRITES==='true';
        if(!['GET','HEAD'].includes(method)&&!writable)throw new StudyError(503,'Workbench writes are off.');
        if(typeof openWorkbench!=='function')throw new StudyError(503,'Workbench integration is not configured.');
        const database=studyDatabase(env),readiness=await learningWorkbenchReadiness(database,{studyBridge:env.LEARNING_STUDY_BRIDGE==='true'});
        if(!readiness.ready)throw new StudyError(503,'Workbench schema requires an offline migration review.');
        // A factory receives a read-only contract when writes are off, including background recovery.
        const db=writable?database:{read:database.read.bind(database),atomic:async()=>{throw new StudyError(503,'Workbench writes are off.');}};
        const services=await openWorkbench({db,actor,env,ctx,writable});
        return await learningWorkbenchAPI(request,{actor,services,writable,waitUntil:writable&&typeof ctx?.waitUntil==='function'?promise=>ctx.waitUntil(promise):null});
      }
      const provider=path.match(/^\/api\/auth\/(microsoft|telegram)(?:\/|$)/)?.[1],oauth=oauthProviders[provider];
      if(path==='/api/auth/providers'&&method==='GET')return json({google:googleConfigured(env),...Object.fromEntries(Object.entries(oauthProviders).map(([key,value])=>[key,value.configured(env)&&env.STAGE_WRITES==='true'&&env.ACCOUNT_MUTATIONS_ENABLED==='true']))});
      if(oauth&&path!=='/api/auth/'+provider+'/code'&&path!=='/api/auth/'+provider+'/verify'){
        if(!oauth.configured(env)||env.STAGE_WRITES!=='true'||env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,oauth.label+' sign-in is not configured.');
        if(method!=='GET')throw new StudyError(405,'Use GET.');
        const service=new oauth.Service(studyDatabase(env),url.origin);
        const redirect=(auth,token='',headers=new Headers())=>{headers.set('Location',url.origin+'/?auth='+auth);headers.append('Set-Cookie',oauth.cookieHeader(token));headers.delete('Content-Length');return new Response(null,{status:302,headers});};
        if(path==='/api/auth/'+provider){
          const invite=String(url.searchParams.get('invite')||'').trim();if(invite)await new AccountInvites(studyDatabase(env)).peek(invite);
          const {token,state}=await service.start(invite,request.headers.get('CF-Connecting-IP')||'unknown');
          return new Response(null,{status:302,headers:{Location:await oauth.authorize(env,url,token,state),'Set-Cookie':oauth.cookieHeader(token)}});
        }
        if(path==='/api/auth/'+provider+'/profile'){
          const {value}=await service.peek(oauth.cookie(request),'email');return json({email:value.email||value.profile.emailSuggestion,name:value.profile.name});
        }
        if(path==='/api/auth/'+provider+'/callback'){
          try{
            const token=url.searchParams.get('state');
            if(!token||token!==oauth.cookie(request))throw new StudyError(403,oauth.label+' sign-in browser does not match.');
            const state=await service.consume(token,'authorize');
            if(url.searchParams.get('error'))return redirect(provider+'_denied');
            const profile=await oauth.exchange(env,url,url.searchParams.get('code'),state);
            const linked=await service.identity(profile.subject);
            const invite=state.invite?await new AccountInvites(studyDatabase(env)).peek(state.invite):null;
            let accountId=linked?.accountId,inviteAccepted=false;
            if(linked?.registrationId&&!accountId){
              const reg=await accountEnv.DB.prepare('SELECT id,status,user_id,role,email FROM registrations WHERE id=?').bind(linked.registrationId).first();
              if(reg?.status==='pending'&&invite?.kind==='student'&&reg.role==='USER'){
                await new AccountInvites(studyDatabase(env)).acceptPendingRegistration(state.invite,reg.email,reg.id,'student');
                await approveInvitedStudent(env,accountEnv,reg.id);
                const approved=await accountEnv.DB.prepare('SELECT user_id FROM registrations WHERE id=?').bind(reg.id).first();
                accountId=approved.user_id;inviteAccepted=true;await service.approved(reg.id,accountId);
              }else if(reg?.status==='pending')return redirect('pending');
              else if(reg?.status==='approved'){accountId=reg.user_id;await service.approved(reg.id,accountId);}
              else return redirect(provider+'_error');
            }
            if(accountId&&invite?.kind!=='teacher'){
              let response=await sessionForFederated(accountEnv,request,accountId,true,provider);if(!response.ok)return redirect(provider+'_error');
              let warning='';
              if(state.invite&&!inviteAccepted){
                try{const {user}=await response.clone().json();await new AccountInvites(studyDatabase(env)).redeem(user,state.invite,(teacher,id,group)=>new GroupService(studyDatabase(env)).assignStudent(teacher,id,group));}
                catch(error){warning=error instanceof StudyError?error.message:'Group invite could not be applied.';}
              }
              response=await finishIdentitySignIn(response,env,accountEnv,warning);
              return redirect(warning?'invite_warning':provider,'',new Headers(response.headers));
            }
            const pending=await service.newFlow({kind:'email',profile,invite:state.invite});return redirect(provider+'_verify',pending);
          }catch{return redirect(provider+'_error');}
        }
        throw new StudyError(404,'Not found.');
      }
      if(path.startsWith('/api/me/passkeys')&&path!=='/api/me/passkeys/code'||path==='/api/auth/passkeys/options'){
        if(env.STAGE_WRITES!=='true'||env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,'Passkeys unavailable.');
        const service=new Passkeys(studyDatabase(env),url.origin);
        const login=path==='/api/auth/passkeys/options';
        const actor=login?null:await identify(accountEnv,request);
        if(!login&&!actor)throw new StudyError(401,'Sign in first.');
        if(path==='/api/me/passkeys'&&method==='GET'){
          const rows=await service.list(actor.id);
          return json({passkeys:rows.map(({id,label,createdAt,lastUsedAt})=>({id,label,createdAt,lastUsedAt}))});
        }
        if(method!=='POST')throw new StudyError(405,'Use POST.');
        let body;try{body=JSON.parse(await boundedText(request,32768,'Passkey response too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid passkey request.');}
        if(login){
          const issued=await service.issue('login',{rateKey:request.headers.get('CF-Connecting-IP')||'unknown'});
          const response=json({options:issued.options});response.headers.set('Set-Cookie',passkeyCookieHeader(issued.token));return response;
        }
        const session=await sessionIdentity(accountEnv,request);
        if(!session||session.id!==actor.id)throw new StudyError(401,'Sign in first.');
        if(path==='/api/me/passkeys/options'||path==='/api/me/passkeys/delete'){
          const proof=await new EmailOtp(studyDatabase(env)).consume(actor.email,body.emailCode);
          if(proof.purpose!=='passkey')throw new StudyError(403,'Request a passkey confirmation code.');
          if(path.endsWith('/delete'))return json(await service.remove(actor.id,body.id));
          const issued=await service.issue('register',{actor,session,rateKey:actor.id});
          const response=json({options:issued.options});response.headers.set('Set-Cookie',passkeyCookieHeader(issued.token));return response;
        }
        if(path==='/api/me/passkeys/verify')return json(await service.register(passkeyCookie(request),body.response,actor,session,body.label));
        throw new StudyError(404,'Not found.');
      }
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
        if(result.current){
          response.headers.set('Set-Cookie','__Host-enquiz_sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
          response.headers.append('Set-Cookie','enquiz_sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
        }
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
      if(path==='/api/accounts/group-teachers'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(!['ADMIN','DEVELOPER'].includes(actor.role))throw new StudyError(403,'Teachers only.');
        if(!['GET','POST'].includes(method))throw new StudyError(405,'Use GET or POST.');
        const target=new URL(request.url);target.pathname='/api/admin/users';target.search='';
        const response=await accountWorker.fetch(new Request(target,{headers:request.headers}),accountEnv,ctx);if(!response.ok)return response;
        const {users=[]}=await response.json(),service=new AccountGroupTeachers(studyDatabase(env));
        if(method==='GET')return json(await service.list(actor,users));
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let value;try{value=JSON.parse(await boundedText(request,10000,'Teacher assignment too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid teacher assignment.');}
        return json(await service.save(actor,value,users));
      }
      if(path==='/api/accounts/invites'){
        const service=new AccountInvites(studyDatabase(env));
        if(method==='GET'&&url.searchParams.get('token')){
          return json(await service.peek(url.searchParams.get('token')));
        }
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(method==='GET'){
          if(!['ADMIN','DEVELOPER'].includes(actor.role))throw new StudyError(403,'Teachers only.');
          return json(await service.list(actor));
        }
        if(method!=='POST')throw new StudyError(405,'Use GET or POST.');
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let value;try{value=JSON.parse(await boundedText(request,4096,'Invite request too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid invite request.');}
        if(!value||typeof value!=='object'||Array.isArray(value))throw new StudyError(400,'Invalid invite request.');
        if(value.action==='revoke'){
          if(!['ADMIN','DEVELOPER'].includes(actor.role))throw new StudyError(403,'Teachers only.');
          return json(await service.revoke(actor,value));
        }
        if(value.action==='redeem'){
          const groups=new GroupService(studyDatabase(env));
          const result=await service.redeem(actor,value.token,(teacher,accountId,groupId)=>groups.assignStudent(teacher,accountId,groupId));
          try{await chatCall(env,'CHAT_BRIDGE','global','/invalidate',{});}catch{}
          return json(result);
        }
        if(!['ADMIN','DEVELOPER'].includes(actor.role))throw new StudyError(403,'Teachers only.');
        const target=new URL(request.url);target.pathname='/api/admin/users';target.search='';
        const response=await accountWorker.fetch(new Request(target,{headers:request.headers}),accountEnv,ctx);if(!response.ok)return response;
        const {users=[]}=await response.json();
        const created=await service.create(actor,value,users);
        try{await chatCall(env,'CHAT_BRIDGE','global','/invalidate',{});}catch{}
        return json(created);
      }
      if(path==='/api/guide/visits'){
        const service=new GuideVisits(studyDatabase(env));
        if(method==='GET')return json(await service.stats());
        if(method!=='POST')throw new StudyError(405,'Use GET or POST.');
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let value;try{value=JSON.parse(await boundedText(request,512,'Visit payload too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid visit.');}
        const actor=await identify(accountEnv,request).catch(()=>null);
        const visitor=actor?.id||value?.visitor;
        return json(await service.hit(visitor));
      }
      if(path==='/api/auth/google'&&method==='GET'){
        if(!googleConfigured(env))throw new StudyError(503,'Google sign-in is not configured.');
        const invite=String(url.searchParams.get('invite')||'').trim();
        if(invite)await new AccountInvites(studyDatabase(env)).peek(invite);
        const {state,nonce}=await createGoogleState(env,invite?{invite}:{});
        const secure=url.protocol==='https:';
        const headers=new Headers({
          'Location':googleAuthorizeUrl(env,url,state),
          'Set-Cookie':googleCookieHeader(nonce,secure)
        });
        return new Response(null,{status:302,headers});
      }
      if(path==='/api/auth/google/callback'&&method==='GET'){
        if(!googleConfigured(env))throw new StudyError(503,'Google sign-in is not configured.');
        if(env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,'Original account mutations disabled on this candidate.');
        const err=url.searchParams.get('error');
        if(err)return Response.redirect(url.origin+'/?auth=google_denied',302);
        const secure=url.protocol==='https:';
        const cookieNonce=googleCookie(request);
        const state=await readGoogleState(env,url.searchParams.get('state'));
        if(cookieNonce&&cookieNonce!==state.n)throw new StudyError(401,'Google sign-in does not match this session.');
        const profile=await exchangeGoogleCode(env,url,url.searchParams.get('code'));
        const inviteToken=typeof state.invite==='string'?state.invite.trim():'';
        if(inviteToken&&env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        const inviteInfo=inviteToken?await new AccountInvites(studyDatabase(env)).peek(inviteToken,profile.email):null;
        let response=await completeGoogleSignIn(accountEnv,request,profile,{create:false,role:inviteInfo?.kind==='teacher'?'ADMIN':'USER'},secure);
        if(response.status===200){
          let value=await response.clone().json(),inviteAccepted=false;
          if(value.status==='pending'){
            if(inviteInfo){
              const reg=await accountEnv.DB.prepare("SELECT id,role FROM registrations WHERE status='pending' AND email=?").bind(profile.email.toLowerCase()).first();
              if(!reg||reg.role!==(inviteInfo.kind==='teacher'?'ADMIN':'USER'))throw new StudyError(403,'The registration role does not match this invite.');
              await new AccountInvites(studyDatabase(env)).acceptPendingRegistration(inviteToken,profile.email,reg.id,inviteInfo.kind);
              if(inviteInfo.kind==='student'){
                await approveInvitedStudent(env,accountEnv,reg.id);
                response=await completeGoogleSignIn(accountEnv,request,profile,{create:false},secure);
                if(!response.ok)return response;
                value=await response.clone().json();
                inviteAccepted=true;
              }
            }
            if(value.status==='pending')return Response.redirect(url.origin+'/?auth=pending',302);
          }
          if(value.user){
            let inviteWarning='';
            if(inviteToken&&!inviteAccepted&&env.STAGE_WRITES==='true'){
              try{
                await new AccountInvites(studyDatabase(env)).redeem(value.user,inviteToken,(teacher,accountId,groupId)=>new GroupService(studyDatabase(env)).assignStudent(teacher,accountId,groupId),{verifiedEmail:profile.email,users:[value.user]});
                try{await chatCall(env,'CHAT_BRIDGE','global','/invalidate',{});}catch{}
              }catch(error){
                inviteWarning=error instanceof StudyError?error.message:'Signed in, but the group invite could not be applied.';
              }
            }
            if(env.STAGE_WRITES==='true'){
              const twinId=await twinStudyAccountId(accountEnv.DB,value.user.login);
              const db=studyDatabase(env);
              const newStudyAccount=!(await db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[value.user.id])).length;
              await ensurePairedThemes(db,value.user,twinId);
              try{await ensureStudyProfile(db,value.user,twinId);}
              catch(error){
                if(!(error instanceof StudyError)||error.status!==409)throw error;
              }
              const [seen]=await db.read("SELECT value_json FROM account_settings WHERE account_id=? AND key='welcomeSeen'",[value.user.id]);
              const recent=Number(value.user.createdAt)>Date.now()/1000-30*86400;
              await db.atomic([s("INSERT OR IGNORE INTO account_settings(account_id,key,value_json) VALUES(?,'welcomeSeen','true')",[value.user.id])]);
              value.user.firstLogin=!seen&&recent&&newStudyAccount;
            }
            const headers=new Headers(response.headers);
            const dest=new URL(url.origin+'/');
            if(inviteWarning)dest.searchParams.set('auth','invite_warning');
            else dest.searchParams.set('auth','google');
            headers.set('Location',dest.toString());
            headers.delete('Content-Length');
            headers.append('Set-Cookie',googleCookieHeader('',secure));
            return new Response(null,{status:302,headers});
          }
        }
        if(response.status===403){
          const value=await response.clone().json().catch(()=>({}));
          if(value.status==='pending')return new Response(null,{status:302,headers:{'Location':url.origin+'/?auth=pending','Set-Cookie':googleCookieHeader('',secure)}});
        }
        return new Response(null,{status:302,headers:{'Location':url.origin+'/?auth=google_error','Set-Cookie':googleCookieHeader('',secure)}});
      }
      if(path==='/api/auth/password/reset'&&method==='POST'){
        if(env.STAGE_WRITES!=='true'||env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,'Password recovery is unavailable.');
        let value;try{value=JSON.parse(await boundedText(request,2048,'Recovery request too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid recovery request.');}
        if(typeof value?.password!=='string'||value.password.length<8||value.password.length>32)throw new StudyError(400,'Password needs 8 to 32 characters.');
        const proof=await new EmailOtp(studyDatabase(env)).consume(value?.email,value?.code);
        if(proof.purpose!=='password-reset')throw new StudyError(403,'Request a password reset code.');
        return resetPasswordForEmail(accountEnv,proof.email,value.password);
      }
      if(['/api/auth/otp/request','/api/auth/password/code','/api/me/passkeys/code','/api/auth/microsoft/code','/api/auth/telegram/code'].includes(path)&&method==='POST'){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        if(!env.EMAIL||typeof env.EMAIL.send!=='function')throw new StudyError(503,'Email sending is not configured.');
        let value;try{value=JSON.parse(await boundedText(request,1024,'OTP request too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid OTP request.');}
        const passkey=path==='/api/me/passkeys/code';
        const recovery=path==='/api/auth/password/code';
        if(recovery&&env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,'Password recovery is unavailable.');
        const federated=!!oauth;
        if(federated&&(!oauth.configured(env)||env.ACCOUNT_MUTATIONS_ENABLED!=='true'))throw new StudyError(503,oauth.label+' sign-in is not configured.');
        if(passkey&&env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,'Passkeys unavailable.');
        const actor=passkey?await identify(accountEnv,request):null;
        if(passkey&&!actor)throw new StudyError(401,'Sign in first.');
        const federatedToken=federated?oauth.cookie(request):'';
        if(federated)await new oauth.Service(studyDatabase(env),url.origin).peek(federatedToken,'email');
        const issued=await new EmailOtp(studyDatabase(env)).issue(passkey?actor.email:value?.email,{purpose:recovery?'password-reset':passkey?'passkey':federated?provider+':'+federatedToken:'login'});
        if(federated)await new oauth.Service(studyDatabase(env),url.origin).setEmail(federatedToken,issued.email);
        const from=String(env.EMAIL_FROM||'noreply@lumiscia.org');
        try{
          await env.EMAIL.send({
            to:issued.email,
            from:{email:from,name:'Lumiscia'},
            subject:recovery?'Reset your Lumiscia password':passkey?'Confirm your Lumiscia passkey change':'Your Lumiscia sign-in code',
            text:'Your '+(recovery?'password reset':passkey?'passkey confirmation':'sign-in')+' code is '+issued.code+'. It expires in '+issued.ttlSec+' seconds. If you did not request this, ignore the email.',
            html:'<p>Your '+(recovery?'password reset':passkey?'passkey confirmation':'sign-in')+' code is <b style="font-size:20px;letter-spacing:0.12em">'+issued.code+'</b>.</p><p>It expires in '+issued.ttlSec+' seconds.</p><p>If you did not request this, ignore the email.</p>',
          });
        }catch(error){
          const code=error?.code||'';
          if(code==='E_DAILY_LIMIT_EXCEEDED'||code==='E_RATE_LIMIT_EXCEEDED')throw new StudyError(429,'Email limit reached. Try again later.');
          if(code==='E_SENDER_NOT_VERIFIED'||code==='E_SENDER_DOMAIN_NOT_AVAILABLE')throw new StudyError(503,'Sender domain is not ready.');
          throw new StudyError(503,'Could not send the email. Try again shortly.');
        }
        return json({ok:true,email:issued.email,expiresAt:issued.expiresAt,ttlSec:issued.ttlSec});
      }
      if(oauth&&path==='/api/auth/'+provider+'/verify'&&method==='POST'){
        if(!oauth.configured(env)||env.ACCOUNT_MUTATIONS_ENABLED!=='true'||env.STAGE_WRITES!=='true')throw new StudyError(503,oauth.label+' sign-in is not configured.');
        let body;try{body=JSON.parse(await boundedText(request,2048,'Verification too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid verification.');}
        const service=new oauth.Service(studyDatabase(env),url.origin),token=oauth.cookie(request);
        const {value:flow}=await service.peek(token,'email');
        if(String(body.email||'').trim().toLowerCase()!==flow.email)throw new StudyError(400,'Request a code for this email first.');
        const proof=await new EmailOtp(studyDatabase(env)).consume(flow.email,body.code);
        if(proof.purpose!==provider+':'+token)throw new StudyError(403,'Request a '+oauth.label+' confirmation code.');
        const linked=await service.identity(flow.profile.subject);
        if(linked){
          const person=linked.accountId?await accountEnv.DB.prepare('SELECT email FROM users WHERE id=?').bind(linked.accountId).first():await accountEnv.DB.prepare('SELECT email FROM registrations WHERE id=?').bind(linked.registrationId).first();
          if(!person||person.email.toLowerCase()!==proof.email)throw new StudyError(403,'Use the email of the connected Lumiscia account.');
        }
        const invite=flow.invite?await new AccountInvites(studyDatabase(env)).peek(flow.invite,proof.email):null;
        await service.consume(token,'email');
        let response=await completeFederatedSignIn(accountEnv,request,{email:proof.email,name:flow.profile.name},{create:false,role:invite?.kind==='teacher'?'ADMIN':'USER',authMethod:provider},true);
        if(!response.ok)return response;
        let result=await response.clone().json(),registrationId='',inviteAccepted=false;
        if(result.status==='pending'){
          const reg=await accountEnv.DB.prepare("SELECT id,role FROM registrations WHERE status='pending' AND email=?").bind(proof.email).first();
          if(!reg)throw new StudyError(500,'Registration was not saved.');registrationId=reg.id;
          if(invite){
            if(reg.role!==(invite.kind==='teacher'?'ADMIN':'USER'))throw new StudyError(403,'The registration role does not match this invite.');
            await new AccountInvites(studyDatabase(env)).acceptPendingRegistration(flow.invite,proof.email,reg.id,invite.kind);
            if(invite.kind==='student'){
              await approveInvitedStudent(env,accountEnv,reg.id);inviteAccepted=true;
              const approved=await accountEnv.DB.prepare('SELECT user_id FROM registrations WHERE id=?').bind(reg.id).first();
              response=await sessionForFederated(accountEnv,request,approved.user_id,true,provider);if(!response.ok)return response;
              result=await response.clone().json();
            }
          }
        }
        await service.link(flow.profile.subject,{accountId:result.user?.id||'',registrationId:linked?.registrationId||registrationId});
        let warning='';
        if(result.user&&flow.invite&&!inviteAccepted){
          try{await new AccountInvites(studyDatabase(env)).redeem(result.user,flow.invite,(teacher,id,group)=>new GroupService(studyDatabase(env)).assignStudent(teacher,id,group),{verifiedEmail:proof.email,users:[result.user]});}
          catch(error){warning=error instanceof StudyError?error.message:'Group invite could not be applied.';}
        }
        response=await finishIdentitySignIn(response,env,accountEnv,warning);
        const headers=new Headers(response.headers);headers.append('Set-Cookie',oauth.cookieHeader());
        return new Response(response.body,{status:response.status,headers});
      }
      if(['/api/auth/otp/verify','/api/auth/passkeys/verify'].includes(path)&&method==='POST'){
        if(env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,'Original account mutations disabled on this candidate.');
        const passkey=path==='/api/auth/passkeys/verify';
        if(passkey&&env.STAGE_WRITES!=='true')throw new StudyError(503,'Passkeys unavailable.');
        let value;try{value=JSON.parse(await boundedText(request,passkey?32768:2048,'Authentication response too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid authentication response.');}
        const consumed=passkey?await new Passkeys(studyDatabase(env),url.origin).authenticate(passkeyCookie(request),value?.response,request.headers.get('CF-Connecting-IP')||'unknown'):await new EmailOtp(studyDatabase(env)).consume(value?.email,value?.code);
        if(!passkey&&consumed.purpose!=='login')throw new StudyError(403,'Request a sign-in code.');
        const secure=url.protocol==='https:';
        const inviteToken=typeof value?.invite==='string'?value.invite.trim():'';
        const emailInvite=!passkey&&inviteToken?await new AccountInvites(studyDatabase(env)).peek(inviteToken,consumed.email):null;
        let response=passkey?await sessionForPasskey(accountEnv,request,consumed.accountId,secure):await sessionForEmail(accountEnv,request,consumed.email,secure);
        if(emailInvite?.kind==='teacher'&&[403,404].includes(response.status)){
          if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
          if(response.status===404){
            if(typeof value.name!=='string'||!value.name.trim()||value.name.trim().length>80)throw new StudyError(400,'Enter your name before requesting a new code.');
            response=await completeFederatedSignIn(accountEnv,request,{email:consumed.email,name:value.name.trim()},{create:false,role:'ADMIN',authMethod:'email-code'},secure);
            if(!response.ok)return response;
          }
          const pending=await accountEnv.DB.prepare("SELECT id,role FROM registrations WHERE status='pending' AND email=?").bind(consumed.email).first();
          if(pending){
            if(pending.role!=='ADMIN')throw new StudyError(403,'The registration role does not match this invite.');
            await new AccountInvites(studyDatabase(env)).acceptPendingRegistration(inviteToken,consumed.email,pending.id,'teacher');
            return json({status:'pending'});
          }
        }
        if(!response.ok)return response;
        let inviteWarning='';
        const session=await response.clone().json();
        if(inviteToken&&session.user&&env.STAGE_WRITES==='true'){
          try{
            await new AccountInvites(studyDatabase(env)).redeem(session.user,inviteToken,(teacher,accountId,groupId)=>new GroupService(studyDatabase(env)).assignStudent(teacher,accountId,groupId),{verifiedEmail:consumed.email,users:[session.user]});
            try{await chatCall(env,'CHAT_BRIDGE','global','/invalidate',{});}catch{}
          }catch(error){
            inviteWarning=error instanceof StudyError?error.message:'Signed in, but the group invite could not be applied.';
          }
        }
        return finishIdentitySignIn(response,env,accountEnv,inviteWarning);
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
      if(path==='/api/exams'&&method==='GET'&&!url.searchParams.has('for')){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        let exams=await new ExamService(studyDatabase(env)).list(actor);
        if(['ADMIN','DEVELOPER'].includes(actor.role)){
          const result=await accountEnv.DB.prepare('SELECT id FROM users WHERE active=1 AND is_personal_data_revoked=0').all();
          const live=new Set((result.results||[]).map(row=>row.id));exams=exams.filter(exam=>!exam.studentId||live.has(exam.studentId));
        }
        return json({exams});
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
      if(path==='/api/exams/essay-copilot'&&method==='POST'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let value;try{value=JSON.parse(await boundedText(request,1000,'Review request too large.'));}catch{throw new StudyError(400,'Invalid review request.');}
        if(!value||Object.keys(value).some(key=>!['id','studentId','partId','index','expectedRevision','targetMinWords'].includes(key)))throw new StudyError(400,'Invalid review request.');
        const found=await authorizeManaged(accountEnv,actor,value.studentId);if(found.error)return found.error;
        return json(await essayCopilot(studyDatabase(env),env,actor,value));
      }
      if(path==='/api/error-bank'&&['GET','POST'].includes(method)){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const service=new ErrorBankService(studyDatabase(env));
        if(method==='GET'){
          const action=url.searchParams.get('action')||'queue';
          if(action==='stats')return json(await service.stats(actor));
          if(action==='subgroup-diagnostic')return json(await service.subgroupDiagnostic(actor,{groupId:url.searchParams.get('groupId')}));
          return json({queue:await service.queue(actor,{limit:Number(url.searchParams.get('limit'))||20})});
        }
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let body;try{body=JSON.parse(await boundedText(request,10000,'Request too large.'));}catch{throw new StudyError(400,'Invalid request.');}
        return json(await service.submitReview(actor,body));
      }
      if(path==='/api/speech-scenarios'&&['GET','POST'].includes(method)){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const service=new LearningSpeechScenariosService(studyDatabase(env));
        if(method==='GET'){
          const action=url.searchParams.get('action')||'lesson';
          if(action==='audio')return json(await service.getLessonScenarioAudio(actor,{groupId:Number(url.searchParams.get('groupId')),lessonId:Number(url.searchParams.get('lessonId')),blockId:Number(url.searchParams.get('blockId'))}));
          return json(await service.listLessonScenarios(actor,{groupId:Number(url.searchParams.get('groupId')),lessonId:Number(url.searchParams.get('lessonId'))}));
        }
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        let body;try{body=JSON.parse(await boundedText(request,10000,'Request too large.'));}catch{throw new StudyError(400,'Invalid request.');}
        return json(await service.startLessonSpeechTask(actor,body));
      }
      if(path==='/api/archive'&&['GET','POST'].includes(method)){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const archive=new ArchiveService(studyDatabase(env));
        const accountArchive=new AccountArchive(studyDatabase(env),accountEnv.DB);
        if(method==='GET'){
          const params=new URL(request.url).searchParams;
          if(params.get('type')==='account')return json(await accountArchive.preview(actor,params.get('id')));
          if(!params.has('type')&&!params.has('id')){
            const data=await archive.list(actor);
            return json({...data,items:[...data.items,...await accountArchive.list(actor)]});
          }
          return json(params.has('type')||params.has('id')?await archive.preview(actor,{type:params.get('type'),id:params.get('id')}):await archive.list(actor));
        }
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
        const raw=await boundedText(request,JSON_BODY_LIMIT,'Archive request too large.');let value;
        try{value=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        if(value.type==='account'){
          if(env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,'Account changes disabled.');
          if(!new RegExp('^'+identity+'$').test(value.id||''))throw new StudyError(400,'Invalid account.');
          accountArchive.staff(actor);
          const mutateAccount=async operation=>{
            if(env.CHAT_BRIDGE)await chatCall(env,'CHAT_BRIDGE','global','/invalidate',{});
            try{
              const result=await operation();
              if(env.CHAT_BRIDGE)await chatCall(env,'CHAT_BRIDGE','global','/policy',{});
              return result instanceof Response?result:json(result);
            }catch(error){
              if(env.CHAT_BRIDGE)ctx.waitUntil?.(chatCall(env,'CHAT_BRIDGE','global','/policy',{}).catch(()=>{}));
              throw error;
            }
          };
          if(value.action==='archive')return mutateAccount(()=>accountArchive.archive(actor,value.id));
          if(value.action==='restore')return mutateAccount(()=>accountArchive.restore(actor,value.id));
          if(value.action==='remove'){
            if(actor.role==='ADMIN'){
              await verifyAccountPassword(accountEnv.DB,actor,value.password);
              return mutateAccount(()=>accountArchive.hide(actor,value.id));
            }
            if(actor.role!=='DEVELOPER')throw new StudyError(403,'Developer only.');
            await accountArchive.entry(actor,value.id);
            const headers=new Headers(request.headers);headers.delete('Content-Length');
            return mutateAccount(()=>this.fetch(new Request(new URL('/api/admin/users/'+value.id,url),{method:'DELETE',headers}),env,ctx));
          }
          throw new StudyError(400,'Invalid archive action.');
        }
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
        return json({bug:(await listBugsByIds(studyDatabase(env),[body.id]))[0]});
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
      if(path==='/api/feedback'&&method==='POST'){
        let actor=null;try{actor=await identify(accountEnv,request);}catch{actor=null;}
        const db=studyDatabase(env);
        const clientIp=(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'anonymous').trim();
        const rateKey=actor?.id?`user:${actor.id}`:`ip:${clientIp}`;

        let effectiveLimit=null;
        if(actor?.id){
          effectiveLimit=await getUserFeedbackLimit(db,actor.id);
          if(effectiveLimit===null&&actor.login){
            effectiveLimit=await getUserFeedbackLimit(db,actor.login);
          }
        }
        if(effectiveLimit===null){
          effectiveLimit=defaultFeedbackLimitForRole(actor?.role);
        }

        const rate=checkFeedbackRateLimit(rateKey,Date.now(),effectiveLimit);
        if(!rate.ok){
          const minutes=Math.max(1,Math.ceil(rate.retryAfterSec/60));
          const msg=effectiveLimit===1
            ?`Отправка отзыва возможна не чаще одного раза в час. Пожалуйста, подождите ${minutes} мин. перед отправкой следующего сообщения.`
            :`Лимит отправки отзывов исчерпан (${effectiveLimit} в час, не чаще одного раза в час при превышении). Пожалуйста, подождите ${minutes} мин. перед отправкой следующего сообщения.`;
          throw new StudyError(429,msg);
        }
        const raw=await request.text();if(raw.length>35000000)throw new StudyError(413,'Feedback report too large (max 25 MiB).');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        if(!body.message||!String(body.message).trim())throw new StudyError(400,'Message is required.');

        // Process attachments and store large binaries in R2 if available
        const processedAttachments=[];
        let totalAttachmentBytes=0;
        const incomingAttachments=Array.isArray(body.attachments)?body.attachments:(body.screenshot?[{name:'screenshot.png',mime:'image/png',dataUrl:body.screenshot}]:[]);

        for(const item of incomingAttachments){
          if(!item||typeof item!=='object')continue;
          const fileId=crypto.randomUUID();
          const name=String(item.name||'attachment').slice(0,150);
          const mime=String(item.mime||item.type||'application/octet-stream').slice(0,100);
          let size=Number(item.size)||0;
          let storageKey='';
          let dataUrl=typeof item.dataUrl==='string'&&item.dataUrl.startsWith('data:')?item.dataUrl:'';

          if(dataUrl){
            const comma=dataUrl.indexOf(',');
            if(comma>0){
              const b64=dataUrl.slice(comma+1);
              try{
                const binary=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
                size=binary.length;
                totalAttachmentBytes+=size;
                storageKey=`feedback-attachments/${fileId}/${name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
                if(env.MEDIA?.put){
                  await env.MEDIA.put(storageKey,binary,{httpMetadata:{contentType:mime}});
                }
              }catch{}
            }
          }else{
            totalAttachmentBytes+=size;
          }

          processedAttachments.push({
            id:fileId,
            name,
            mime,
            size,
            storageKey,
            ...(size<65536&&dataUrl?{dataUrl}:{})
          });
        }

        if(totalAttachmentBytes>25*1024*1024){
          throw new StudyError(413,'Total attachments size exceeds 25 MiB.');
        }

        const saved=await saveFeedback(db,{
          category:body.category,
          message:body.message,
          screenshot:body.screenshot,
          attachments:processedAttachments,
          user:actor,
          contact:body.contact,
          context:body.context
        });
        ctx?.waitUntil?.(notifyFeedbackTelegram(env,saved).catch(()=>{}));
        return json({ok:true,id:saved.id});
      }
      if(path==='/api/feedback'&&method==='GET'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(!['DEVELOPER','ADMIN'].includes(actor.role))throw new StudyError(403,'You cannot do that.');
        const db=studyDatabase(env);
        const resolved=url.searchParams.get('resolved')==='1'?1:0;
        const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||50));
        const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
        const counts=await countFeedback(db);
        const feedback=await listFeedback(db,{resolved,limit,offset});
        const breadcrumbsLimit=await getFeedbackBreadcrumbsLimit(db);
        const userLimits=await listUserFeedbackLimits(db);
        return json({
          feedback,
          total:resolved?counts.resolved:counts.open,
          counts,
          limit,
          offset,
          breadcrumbsLimit,
          defaultLimits:DEFAULT_ROLE_FEEDBACK_LIMITS,
          userLimits
        });
      }
      if(path==='/api/feedback/settings'&&method==='GET'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(!['DEVELOPER','ADMIN'].includes(actor.role))throw new StudyError(403,'You cannot do that.');
        const db=studyDatabase(env);
        return json({
          breadcrumbsLimit:await getFeedbackBreadcrumbsLimit(db),
          defaultLimits:DEFAULT_ROLE_FEEDBACK_LIMITS,
          userLimits:await listUserFeedbackLimits(db)
        });
      }
      if(path==='/api/feedback/settings'&&method==='POST'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(actor.role!=='DEVELOPER')throw new StudyError(403,'Developer access required.');
        const raw=await request.text();if(raw.length>1000)throw new StudyError(413,'Request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        const db=studyDatabase(env);
        const breadcrumbsLimit=await setFeedbackBreadcrumbsLimit(db,body.breadcrumbsLimit);
        return json({ok:true,breadcrumbsLimit});
      }
      if(path==='/api/feedback/limit'&&method==='POST'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(actor.role!=='DEVELOPER')throw new StudyError(403,'Developer access required.');
        const raw=await request.text();if(raw.length>1000)throw new StudyError(413,'Request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        if(!body.userId&&!body.login)throw new StudyError(400,'userId or login is required.');
        const db=studyDatabase(env);
        const targetId=String(body.userId||body.login).trim();
        await setUserFeedbackLimit(db,targetId,body.limit);
        return json({ok:true,userId:targetId,limit:body.limit??null});
      }
      if(path==='/api/feedback/attachment'&&method==='GET'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(!['DEVELOPER','ADMIN'].includes(actor.role))throw new StudyError(403,'You cannot do that.');
        const key=url.searchParams.get('key');
        if(!key||!key.startsWith('feedback-attachments/'))throw new StudyError(400,'Invalid attachment key.');
        const obj=await env.MEDIA?.get?.(key);
        if(!obj)throw new StudyError(404,'Attachment not found.');
        return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Content-Disposition':'inline','Cache-Control':'private, max-age=86400'}});
      }
      if(path==='/api/feedback/resolve'&&method==='POST'){
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(!['DEVELOPER','ADMIN'].includes(actor.role))throw new StudyError(403,'You cannot do that.');
        const raw=await request.text();if(raw.length>200)throw new StudyError(413,'Request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        if(!body.id)throw new StudyError(400,'Feedback id is required.');
        const db=studyDatabase(env);
        const resolved=body.resolved!==false;
        if(!await resolveFeedback(db,body.id,resolved))throw new StudyError(404,'Feedback not found.');
        return json({ok:true,id:body.id,resolved});
      }
      if(path==='/api/cards/lookup'&&method==='POST'){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        const actor=await identify(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(!['ADMIN','DEVELOPER'].includes(actor.role))throw new StudyError(403,'Teachers only.');
        const raw=await request.text();if(raw.length>4096)throw new StudyError(413,'Lookup request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        const result=await new StudyService(studyDatabase(env)).lookupSharedCard(actor,body,async(word,context)=>{
          // The interactive dictionary accepts short queries only. Longer PDF
          // phrases retain their explicitly sourced contextual definition.
          if(context&&word.length>80)return {found:false};
          const target=new URL(request.url);target.pathname='/lookup';target.search='';target.searchParams.set('word',word);
          if(context)target.searchParams.set('context',context.meaning);
          const response=await accountWorker.fetch(new Request(target,{headers:request.headers}),accountEnv,ctx);
          if(context&&response.status===404){const data=await response.json();if(data.found===false)return data;}
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
          return json({...value,hideSongs:!found.songs,statisticsSource:'learning-activity',targetAccountId:target.id});
        }
        // Teacher may inspect definitions; responses belong strictly to target.
        if(managedRead[2]==='lessons'){
          const params=new URL(request.url).searchParams,lessonId=params.get('id'),idsParam=params.get('ids')||'';
          const lessonIds=idsParam?idsParam.split(',').map(part=>cardKey(part.trim())).filter(id=>Number.isSafeInteger(id)&&id>=1):[];
          return json(mediaPlaceholders(await legacyLessons(db,{id:target.id,role:actor.role},{summary:params.get('summary')==='1',lessonId:lessonId?cardKey(lessonId):'',lessonIds})));
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
        const value=await response.json();return json({...value,historySource:'legacy-r2-readonly',importedIntoLearning:false,combinedWithNewActivity:false});
      }
      if(accountRoute(path,method)){
        if(!['GET','HEAD'].includes(method)&&env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,'Original account mutations disabled on this candidate.');
        let approvalGroup=null,approvalActor=null,approvalGroups=null,approvalInvite=null;
        let forward=request,inviteToken='',effectivePath=path,inviteWarning='',signupBody=null,signupInvite=null;
        const accountDelete=method==='DELETE'&&new RegExp('^/api/admin/users/'+identity+'$').test(path);
        if(accountDelete){
          const actor=await identify(accountEnv,request);
          if(actor?.role!=='DEVELOPER')throw new StudyError(403,'Developer only.');
          if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
          const id=path.split('/')[4],db=studyDatabase(env);
          if(id===actor.id)throw new StudyError(400,'You cannot delete your own account.');
          await new AccountArchive(db,accountEnv.DB).beginPurge(actor,id);
          if(env.CHAT_BRIDGE)await chatCall(env,'CHAT_BRIDGE','global','/purge-account',{accountId:id});
          await purgeStudyAccount(db,id,env.STAGE_MEDIA);
        }
        if(method==='POST'&&new RegExp('^/api/admin/users/'+identity+'/(active|hidden|role|profile)$').test(path)){
          const db=studyDatabase(env);await ensureAccountArchive(db);
          if((await db.read('SELECT account_id FROM account_archives WHERE account_id=?',[path.split('/')[4]])).length)throw new StudyError(409,'Restore the account from Archive first.');
        }
        const passkeysAccount=path==='/api/me/revoke'&&method==='POST'?(await identify(accountEnv,request))?.id:method==='DELETE'&&new RegExp('^/api/admin/users/'+identity+'$').test(path)?path.split('/')[4]:null;
        if(path==='/api/register'&&method==='POST'){
          let body;try{body=JSON.parse(await boundedText(request,8192,'Registration too large.'));}catch(error){if(error instanceof StudyError)throw error;throw new StudyError(400,'Invalid registration.');}
          inviteToken=typeof body?.invite==='string'?body.invite.trim():'';
          body={...body,role:'USER'};
          if(inviteToken){
            if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
            signupInvite=await new AccountInvites(studyDatabase(env)).peek(inviteToken,body.email);
            if(signupInvite.kind==='teacher'){
              const proof=await new EmailOtp(studyDatabase(env)).consume(body.email,body.emailCode);
              if(proof.email!==String(body.email).trim().toLowerCase())throw new StudyError(403,'Verify the invited email.');
            }
            body={...body,role:signupInvite.kind==='teacher'?'ADMIN':'USER'};
            delete body.invite;
            delete body.emailCode;
          }
          signupBody=body;
          forward=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(body)});
        }
        if(method==='POST'&&new RegExp('^/api/admin/registrations/'+identity+'/approve$').test(path)){
          const body=await request.clone().json();
          const reviewer=await identify(accountEnv,request);
          approvalActor=reviewer;
          approvalInvite=await new AccountInvites(studyDatabase(env)).registrationInvite(reviewer,path.split('/')[4]);
          if(approvalInvite&&body.role!=null&&body.role!==(approvalInvite.kind==='teacher'?'ADMIN':'USER'))throw new StudyError(400,'Use the role selected by the verified invitation.');
          if(approvalInvite&&body.groupId!=null&&Number(body.groupId)!==approvalInvite.groupId)throw new StudyError(400,'Use the group selected by the invitation.');
          if(body.groupId!=null&&!approvalInvite){
            const [actor,pending]=await Promise.all([identify(accountEnv,request),accountEnv.DB.prepare('SELECT role FROM registrations WHERE id=?').bind(path.split('/')[4]).first()]);
            approvalActor=actor;if(!approvalActor||!['ADMIN','DEVELOPER'].includes(approvalActor.role))throw new StudyError(403,'Teachers only.');
            if((body.role??pending?.role)!=='ADMIN'){
              if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
              approvalGroups=new GroupService(studyDatabase(env));await approvalGroups.activeGroup(body.groupId);approvalGroup=body.groupId;
            }
          }
        }
        let response=approvalInvite?.kind==='teacher'&&approvalActor?.role==='ADMIN'
          ?await approveReg(accountEnv,approvalActor,path.split('/')[4],approvalInvite)
          :await accountWorker.fetch(forward,{...accountEnv,...(signupInvite?.kind==='teacher'?{TRUSTED_INVITE_ROLE:'ADMIN'}:{}),...(accountDelete?{ACCOUNT_ARCHIVE_DELETE_ID:path.split('/')[4]}:{})},ctx);
        if(accountDelete&&response.status===404&&!(await accountEnv.DB.prepare('SELECT id FROM users WHERE id=?').bind(path.split('/')[4]).first()))response=json({ok:true});
        if(response.ok&&accountDelete)await studyDatabase(env).atomic([s('DELETE FROM account_archives WHERE account_id=?',[path.split('/')[4]]),s('UPDATE content_archive_state SET revision=revision+1 WHERE id=1')]);
        if(response.ok&&method==='GET'&&path==='/api/admin/users'){
          const db=studyDatabase(env);await ensureAccountArchive(db);
          const archived=new Set((await db.read('SELECT account_id FROM account_archives')).map(row=>row.account_id));
          const data=await response.json();
          let users=(data.users||[]).filter(row=>!archived.has(row.id));
          let reviewerPayload=null;
          try{
            const match=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)session=([^;]+)/);
            if(match){
              const dot=match[1].indexOf('.');
              if(dot>0){
                const raw=match[1].slice(0,dot).replace(/-/g,'+').replace(/_/g,'/');
                reviewerPayload=JSON.parse(atob(raw.padEnd(raw.length+(4-raw.length%4)%4,'=')));
              }
            }
          }catch{}
          if(reviewerPayload&&reviewerPayload.role==='ADMIN'){
            const teacherDocs=await db.read("SELECT key,value_json FROM catalog_documents WHERE namespace='accounts-group-teachers'");
            const coTeacherIds=new Set([reviewerPayload.id]);
            for(const doc of teacherDocs){
              try{
                const val=JSON.parse(doc.value_json);
                const ids=val.teacherIds||[];
                if(ids.includes(reviewerPayload.id)){
                  for(const id of ids)coTeacherIds.add(id);
                }
              }catch{}
            }
            users=users.filter(user=>user.role!=='ADMIN'||coTeacherIds.has(user.id));
          }
          response=json({...data,users});
        }
        if(response.ok&&passkeysAccount){
          try{await new Passkeys(studyDatabase(env),url.origin).removeAccount(passkeysAccount);}catch{console.error('Passkey cleanup unavailable; revoked account remains blocked.');}
          for(const value of Object.values(oauthProviders))try{await new value.Service(studyDatabase(env),url.origin).removeAccount(passkeysAccount);}catch{console.error('Federated identity cleanup unavailable; revoked account remains blocked.');}
        }
        if(response.ok&&env.STAGE_WRITES==='true'&&method==='POST'&&new RegExp('^/api/admin/registrations/'+identity+'/approve$').test(path)){
          const approved=await response.clone().json();
          if(approved.userId)for(const value of Object.values(oauthProviders))try{await new value.Service(studyDatabase(env),url.origin).approved(path.split('/')[4],approved.userId);}catch{console.error('Federated account mapping update deferred until sign-in.');}
        }
        if(response.ok&&path==='/api/admin/registrations'&&method==='GET'){
          const value=await response.json(),reviewer=await identify(accountEnv,request);
          response=json({...value,registrations:await new AccountInvites(studyDatabase(env)).registrationPermissions(reviewer,value.registrations||[])});
        }
        if(response.ok&&inviteToken&&signupBody){
          const result=await response.clone().json();
          if(result.status==='pending'){
            const reg=await accountEnv.DB.prepare("SELECT id FROM registrations WHERE status='pending' AND login=?").bind(String(signupBody.login).trim()).first();
            if(!reg)throw new StudyError(500,'Invite registration was not saved.');
            await new AccountInvites(studyDatabase(env)).acceptPendingRegistration(inviteToken,signupBody.email,reg.id,signupInvite.kind);
            if(signupInvite.kind==='student'){
              await approveInvitedStudent(env,accountEnv,reg.id);
              const loginUrl=new URL(request.url);loginUrl.pathname='/api/login';
              response=await accountWorker.fetch(new Request(loginUrl,{method:'POST',headers:request.headers,body:JSON.stringify({login:signupBody.login,password:signupBody.password})}),accountEnv,ctx);
              effectivePath='/api/login';
            }
          }
        }
        if(response.ok&&approvalInvite&&method==='POST'&&new RegExp('^/api/admin/registrations/'+identity+'/approve$').test(path)){
          const approved=await response.clone().json();
          if(approved.userId){
            try{
              if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
              const reviewer=await identify(accountEnv,request);
              const person=await accountEnv.DB.prepare('SELECT id,email,role,active FROM users WHERE id=?').bind(approved.userId).first();
              const groups=new GroupService(studyDatabase(env));
              await new AccountInvites(studyDatabase(env)).completeApproval(reviewer,path.split('/')[4],person,[person],(teacher,id,group)=>groups.assignStudent(teacher,id,group));
            }catch(error){
              const headers=new Headers(response.headers);headers.delete('Content-Length');
              response=Response.json({...approved,groupWarning:'Account approved, but the invited group could not be assigned. Assign it in Accounts.'},{headers});
            }
          }
        }
        if(response.ok&&approvalGroup!=null){
          const result=await response.clone().json();
          if(!result.userId)throw new StudyError(500,'Account approved. Assign its group in Accounts.');
          if(result.role==='USER'){
            try{
              await approvalGroups.assignStudent(approvalActor,result.userId,approvalGroup);
              try{await chatCall(env,'CHAT_BRIDGE','global','/invalidate',{});}catch{}
            }catch(error){
              // Account is already approved; do not turn a group write failure into a failed Approve / bug log.
              const headers=new Headers(response.headers);headers.delete('Content-Length');
              response=Response.json({
                ...result,
                groupWarning:error instanceof StudyError?error.message:'Account approved, but its group could not be saved. Assign the group in Accounts.',
              },{status:200,headers});
            }
          }
        }
        // Only a trusted authentication response may attach the reserved pair.
        if((effectivePath==='/api/login'&&method==='POST'||effectivePath==='/api/me'&&method==='GET')&&response.ok&&env.STAGE_WRITES==='true'){
          const value=await response.clone().json();
          let newStudyAccount=false;
          if(value.user&&(effectivePath==='/api/login'||['TsovakDev','Tsovak'].includes(value.user.login))){
            const twinId=await twinStudyAccountId(accountEnv.DB,value.user.login);
            const db=studyDatabase(env);
            if(effectivePath==='/api/login')newStudyAccount=!(await db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[value.user.id])).length;
            await ensurePairedThemes(db,value.user,twinId);
            try{await ensureStudyProfile(db,value.user,twinId);}
            catch(error){
              if(!(error instanceof StudyError)||error.status!==409)throw error;
              // Keep authentication usable if existing profiles need an explicit merge.
              const headers=new Headers(response.headers);headers.delete('Content-Length');
              return Response.json({...value,studyPairNeedsMerge:true,inviteWarning:inviteWarning||undefined},{status:response.status,headers});
            }
          }
          if(value.user&&effectivePath==='/api/login'){
            const db=studyDatabase(env),[seen]=await db.read("SELECT value_json FROM account_settings WHERE account_id=? AND key='welcomeSeen'",[value.user.id]);
            const recent=Number(value.user.createdAt)>Date.now()/1000-30*86400;
            await db.atomic([s("INSERT OR IGNORE INTO account_settings(account_id,key,value_json) VALUES(?,'welcomeSeen','true')",[value.user.id])]);
            value.user.firstLogin=!seen&&recent&&newStudyAccount;
            const headers=new Headers(response.headers);headers.delete('Content-Length');
            response=Response.json({...value,inviteWarning:inviteWarning||undefined},{status:response.status,headers});
          }
        }
        if(response.ok&&['/api/me','/api/login'].includes(effectivePath)){
          const value=await response.clone().json(),headers=new Headers(response.headers);headers.delete('Content-Length');
          return Response.json({...value,migrationCapabilities:capabilities(env,value.user),inviteWarning:inviteWarning||undefined},{status:response.status,headers});
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
  // Authentication payloads contain one-time codes, OAuth state and credentials.
  try{
    const userAgent=request.headers.get('user-agent')||'';
    if(/l9scan|leakix|shodan|censys|nikto|sqlmap|nmap|securityresearch|nuclei|zgrab|masscan/i.test(userAgent))return false;
    const path=new URL(request.url).pathname;
    if(/\.(?:php|asp|aspx|jsp|env)(?:$|\/)/i.test(path))return false;
    if(/^\/api\/v\d+\//i.test(path))return false;
    if(/^\/api\/(?:config|setup|system|global|backup|info|apikey|ping)(?:\/|$|\.|\-)/i.test(path))return false;
    if(['/api/graphql','/api/gql','/api/swagger','/api/openapi'].includes(path))return false;
    return (path.startsWith('/api/')||path==='/lookup'||path==='/translate')&&!path.startsWith('/api/bugs')&&!path.startsWith('/api/feedback')&&!path.startsWith('/api/auth/')&&!path.startsWith('/api/me/passkeys')&&!isWorkbenchPath(path)&&!path.endsWith('/media');
  }
  catch{return false;}
}
export default integratedWorker();
