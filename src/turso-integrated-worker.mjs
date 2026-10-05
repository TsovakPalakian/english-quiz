// Disabled migration candidate. Existing accounts stay in the original D1/R2
// implementation; ONLY explicitly migrated educational routes go to Turso.
import accounts,{currentUser,managedAccount,twinStudyAccountId,pairManageDenied} from './worker.js';
import study,{ACCOUNT_AUTH,StageAuthBudget,studyClient} from './turso-stage-worker.mjs';
import {StudyError,StudyService} from './turso-study.mjs';
import {ensureStudyProfile} from './turso-profile.mjs';
import {TursoStudyClient} from './turso-study.mjs';
import {legacyState,legacyTexts,legacyLessons,legacyCard} from './turso-legacy-read.mjs';
import {mediaPlaceholders,mediaKey,storedMediaResponse} from './turso-media.mjs';
import {stageR2Media} from './turso-r2-media.mjs';
import {PersonalService} from './turso-personal.mjs';
import {ActivityService} from './turso-activity.mjs';
export {StageAuthBudget};
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const identity='[a-f0-9]{16,64}';
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
  if(method==='POST'&&['/api/register','/api/login','/api/logout','/api/me/account','/api/me/account/cancel','/api/me/password','/api/me/revoke'].includes(path))return true;
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
      if(path==='/api/cards/lookup'&&method==='POST'){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Writes disabled.');
        const actor=await authenticate(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
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
        const actor=await authenticate(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        if(actor.role==='DEVELOPER'){
          const rows=await accountEnv.DB.prepare('SELECT r.id,r.login,r.email,r.name,r.status,r.role,r.user_id,r.created_at,r.decided_at FROM registrations r LEFT JOIN users u ON u.id=r.user_id WHERE r.user_id IS NULL OR r.user_id=\'\' OR u.is_personal_data_revoked=0 ORDER BY r.created_at DESC').all();
          return json({registrations:(rows.results||[]).map(row=>({id:row.id,login:row.login,email:row.email,name:row.name,status:row.status,role:row.role,user_id:row.user_id,createdAt:row.created_at,decidedAt:row.decided_at}))});
        }
      }
      const managedLink=path.match(new RegExp('^/api/admin/users/('+identity+')/cards(/new)?$'));
      if(managedLink&&method==='POST'){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
        const actor=await authenticate(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedLink[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'study'))throw new StudyError(403,'You cannot do that.');
        const raw=await request.text();if(raw.length>(managedLink[2]?64000:4096))throw new StudyError(413,'Card request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        if(!found.songs&&body.place==='music')throw new StudyError(403,'Teacher cannot manage student songs.');
        const db=studyDatabase(env);
        return json(managedLink[2]?await new PersonalService(db).createManagedCard(actor,found.row.id,body):await new StudyService(db).linkManagedCard(actor,found.row.id,body));
      }
      const managedCard=path.match(new RegExp('^/api/admin/users/('+identity+')/cards/([A-Za-z0-9_-]{1,100})$'));
      if(managedCard&&['PATCH','DELETE'].includes(method)){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
        const actor=await authenticate(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedCard[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'study'))throw new StudyError(403,'You cannot do that.');
        const raw=await request.text();if(raw.length>12000)throw new StudyError(413,'Card request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        if(method==='DELETE'){
          if(!found.songs&&body.place==='music')throw new StudyError(403,'Teacher cannot manage student songs.');
          return json(await new StudyService(studyDatabase(env)).unlinkManagedCard(actor,found.row.id,managedCard[2],body));
        }
        return json(await new PersonalService(studyDatabase(env)).editManagedCard(actor,found.row.id,managedCard[2],body));
      }
      const managedText=path.match(new RegExp('^/api/admin/users/('+identity+')/(texts|songs)(?:/([A-Za-z0-9_-]{1,100}))?$'));
      if(managedText&&(managedText[3]?['PATCH','DELETE'].includes(method):method==='POST')){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
        const actor=await authenticate(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedText[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'study'))throw new StudyError(403,'You cannot do that.');
        const kind=managedText[2]==='texts'?'text':'song';
        if(kind==='song'&&(actor.role!=='DEVELOPER'||!found.songs))throw new StudyError(403,'Developer song management only.');
        const raw=await request.text();if(raw.length>64000)throw new StudyError(413,'Text request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        const service=new PersonalService(studyDatabase(env));
        return json(method==='POST'?await service.createManagedLibrary(actor,found.row.id,kind,body):await service.editManagedLibrary(actor,found.row.id,managedText[3],kind,body,method==='DELETE'));
      }
      const managedAccess=path.match(new RegExp('^/api/admin/users/('+identity+')/lessons/([A-Za-z0-9_-]{1,100})/access$'));
      if(managedAccess&&method==='PATCH'){
        if(env.STAGE_WRITES!=='true')throw new StudyError(503,'Test writes disabled.');
        const actor=await authenticate(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedAccess[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'restrict'))throw new StudyError(403,'You cannot do that.');
        const raw=await request.text();if(raw.length>4096)throw new StudyError(413,'Access request too large.');
        let body;try{body=JSON.parse(raw);}catch{throw new StudyError(400,'Invalid JSON.');}
        return json(await new StudyService(studyDatabase(env)).setLessonAccess(actor,found.row.id,managedAccess[2],body));
      }
      if(['/api/song-file','/api/lesson-file'].includes(path)&&['GET','HEAD'].includes(method)&&new URL(request.url).searchParams.has('for')){
        const params=new URL(request.url).searchParams;
        if([...params.keys()].some(key=>!['id','for'].includes(key)||params.getAll(key).length!==1)||!new RegExp('^'+identity+'$').test(params.get('for')||''))throw new StudyError(400,'Invalid managed media request.');
        const actor=await authenticate(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,params.get('for'));if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,path==='/api/lesson-file'?'read':'study'))throw new StudyError(403,'You cannot do that.');
        if(path==='/api/song-file'&&(actor.role!=='DEVELOPER'||!found.songs))throw new StudyError(403,'Developer song inspection only.');
        const target={id:found.row.id,role:found.row.role},key=await mediaKey(studyDatabase(env),target,path==='/api/song-file'?'song':'lesson',params.get('id')||'');
        return key.startsWith('stage-local/')?await stageR2Media(env).response(key,method,request.headers.get('range')||''):await storedMediaResponse(env.MEDIA,key,request);
      }
      const managedDictionary=path.match(new RegExp('^/api/admin/users/('+identity+')/cards/([A-Za-z0-9_-]{1,100})/dictionary$'));
      if(managedDictionary&&method==='GET'){
        const actor=await authenticate(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const found=await authorizeManaged(accountEnv,actor,managedDictionary[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'read'))throw new StudyError(403,'You cannot do that.');
        const db=studyDatabase(env),target={id:found.row.id,role:found.row.role};
        if(!found.songs){const rows=await db.read("SELECT p.card_id FROM profile_cards p JOIN profile_members m ON m.profile_id=p.profile_id WHERE m.account_id=? AND p.card_id=? AND p.place<>'music'",[target.id,managedDictionary[2]]);if(!rows.length)throw new StudyError(403,'Song cards are unavailable to teachers.');}
        return json(legacyCard(await new StudyService(db).readableCard(target,managedDictionary[2])));
      }
      const managedRead=path.match(new RegExp('^/api/admin/users/('+identity+')/(state|texts|lessons|stats)$'));
      if(managedRead&&method==='GET'){
        const actor=await authenticate(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        // Source account authorization remains authoritative and budgeted.
        const found=await authorizeManaged(accountEnv,actor,managedRead[1]);if(found.error)return found.error;
        if(pairManageDenied(actor,found.row.login,'read'))throw new StudyError(403,'You cannot do that.');
        const target={id:found.row.id,role:found.row.role},db=studyDatabase(env);
        if(managedRead[2]==='stats'){
          const params=new URL(request.url).searchParams;
          if([...params.keys()].some(key=>!['from','to'].includes(key)||params.getAll(key).length!==1))throw new StudyError(400,'Only date filters are allowed.');
          const value=await new ActivityService(db).stats(target,Object.fromEntries(params));
          if(!found.songs){for(const key of ['songs','archives','previousSongs','previousArchives'])delete value.activity[key];
            for(const row of value.activity.series){delete row.songs;delete row.archives;if(row.cardAreas){delete row.cardAreas.music;delete row.cardAreas.lyrics;}}
            delete value.activity.cardAreas.music;delete value.activity.cardAreas.lyrics;}
          return json({...value,hideSongs:!found.songs,statisticsSource:'turso-activity',targetAccountId:target.id});
        }
        // Teacher may inspect definitions; responses belong strictly to target.
        if(managedRead[2]==='lessons')return json(mediaPlaceholders(await legacyLessons(db,{id:target.id,role:actor.role},{summary:new URL(request.url).searchParams.get('summary')==='1',lessonId:new URL(request.url).searchParams.get('id')||''})));
        if(managedRead[2]==='texts')return json(await legacyTexts(db,target));
        const value=mediaPlaceholders(await legacyState(db,target,{compact:true}));
        if(!found.songs){value.songs=[];value.added=value.added.filter(card=>(card.place||'mine')!=='music');}
        // Inspection does not provision accounts or permit whole-state writes.
        return json(value);
      }
      if(path==='/api/stats/history'&&method==='GET'){
        const actor=await authenticate(accountEnv,request);if(!actor)throw new StudyError(401,'Sign in first.');
        const target=new URL(request.url);target.pathname='/api/stats';
        const all=target.searchParams.get('scope')==='all';
        if(all&&actor.role!=='DEVELOPER')throw new StudyError(403,'Developer archive report only.');
        target.searchParams.delete('scope');target.searchParams.delete('role');
        if(all){target.searchParams.delete('user');target.searchParams.delete('as');}
        else{target.searchParams.set('user',actor.id);target.searchParams.set('as','user');}
        const response=await accountWorker.fetch(new Request(target,{headers:request.headers}),accountEnv,ctx);
        if(!response.ok)return response;
        const value=await response.json();return json({...value,historySource:'legacy-r2-readonly',importedIntoTurso:false,combinedWithNewActivity:false});
      }
      if(accountRoute(path,method)){
        if(!['GET','HEAD'].includes(method)&&env.ACCOUNT_MUTATIONS_ENABLED!=='true')throw new StudyError(503,'Original account mutations disabled on this candidate.');
        const response=await accountWorker.fetch(request,accountEnv,ctx);
        // Only the trusted original login response can provision an empty profile.
        if(path==='/api/login'&&method==='POST'&&response.ok&&env.STAGE_WRITES==='true'){
          const value=await response.clone().json();
          if(value.user){
            const twinId=await twinStudyAccountId(accountEnv.DB,value.user.login);
            await ensureStudyProfile(studyClient(env),value.user,twinId);
          }
        }
        if(response.ok&&['/api/me','/api/login'].includes(path)){
          const value=await response.clone().json(),headers=new Headers(response.headers);headers.delete('Content-Length');
          return Response.json({...value,migrationCapabilities:value.user?{legacyHistory:true,originalAccounts:true}:{}},{status:response.status,headers});
        }
        return response;
      }
      // These helpers return dictionary/preview results, not legacy study saves.
      if(['GET /lookup','GET /translate','GET /api/link-preview','POST /api/analyze','POST /api/phrase-card'].includes(method+' '+path))return await accountWorker.fetch(request,accountEnv,ctx);
      return await studyWorker.fetch(request,{...env,[ACCOUNT_AUTH]:{current:request=>authenticate(accountEnv,request)}},ctx);
    }catch(error){return json({error:error instanceof StudyError?error.message:'Integrated test service unavailable.'},error instanceof StudyError?error.status:503);}
  }};
}
export default integratedWorker();
