// Deployment candidate only; activation is a separate, explicit operation.
import integrated,{StageAuthBudget} from './turso-integrated-worker.mjs';
import {studyClient} from './turso-stage-worker.mjs';
import {stageR2Media,PRODUCTION_MEDIA_BUCKET} from './turso-r2-media.mjs';
import {messagesWorker} from './turso-messages-worker.mjs';
import {durableChatWorker} from './chat-worker.mjs';
import {withDatabaseSelection,readDatabaseSelection,DATABASE_CONTROL} from './database-selection.mjs';
import {STUDY_DATABASE,STATIC_STUDY_DATABASE} from './study-database.mjs';
import {neonApplicationEnvironment} from './neon-application.mjs';
export {ChatRoom,ChatInbox,ChatBridge} from './chat-worker.mjs';
export {StageAuthBudget};
const unavailable=()=>Response.json({error:'Production content not activated.'},{status:503,headers:{'Cache-Control':'no-store'}});
const databaseAssets=new Set(['/grammar.js','/lesson-data.js','/irregular.js','/speakout.js','/tense-bank.json']);
export function databaseBackedRequest(request){
  const path=new URL(request.url).pathname;
  return path.startsWith('/api/')||path==='/lookup'||path==='/translate'||databaseAssets.has(path);
}
export function productionEnvironment(env){
  env={...env,SESSION_SECRET:env.CONTENT_SESSION_SECRET||env.SESSION_SECRET};
  if(env.CONTENT_MEDIA_BUCKET!==PRODUCTION_MEDIA_BUCKET||!env.CONTENT_ALLOWED_HOST
    ||!env.SESSION_SECRET||!env.DB||!env.MEDIA||!env.ASSETS||!env.CONTENT_MEDIA)return null;
  const configured={...env,STORAGE_MODE:'production',STAGE_ENABLED:'true',
    STAGE_WRITES:env.CONTENT_WRITES==='true'?'true':'false',STAGE_ALLOWED_HOST:env.CONTENT_ALLOWED_HOST,
    STAGE_MEDIA:env.CONTENT_MEDIA,STAGE_MEDIA_BUCKET:PRODUCTION_MEDIA_BUCKET,[STUDY_DATABASE]:STATIC_STUDY_DATABASE};
  try{stageR2Media(configured);}catch{return null;}
  return configured;
}
const context=value=>value.provider+':'+value.revision;
const selectedConfiguration=env=>withDatabaseSelection(env,{openNeon:configured=>configured});
export function productionWorker(application=integrated,{openNeon=neonApplicationEnvironment}={}){
  const compose=env=>{
    if(env.DATABASE_SELECTION.provider==='neon')return openNeon(env);
    const data={...env};delete data[STUDY_DATABASE];return {...data,[STUDY_DATABASE]:studyClient(data)};
  };
  const selected=async env=>compose(await selectedConfiguration(env));
  return {async scheduled(event,env,ctx){let configured=productionEnvironment(env);if(configured&&application.scheduled){configured=await selected(configured);await application.scheduled(event,configured,ctx);}},async fetch(request,env,ctx){
  if(env.CONTENT_ENABLED!=='true')return unavailable();
  let configured=productionEnvironment(env);
  if(!configured)return unavailable();
  if(databaseBackedRequest(request)){
    try{
      configured=await selectedConfiguration(configured);
      const active=context(configured.DATABASE_SELECTION),path=new URL(request.url).pathname;
      if(path==='/api/database-context')return Response.json({provider:configured.DATABASE_SELECTION.provider,revision:configured.DATABASE_SELECTION.revision,scope:'site'},{status:request.method==='GET'?200:405,headers:{'Cache-Control':'no-store','X-Database-Context':active}});
      if(request.headers.has('X-Database-Context')&&request.headers.get('X-Database-Context')!==active)return Response.json({error:'The active database changed. Reload before continuing.',code:'DATABASE_CHANGED'},{status:409,headers:{'Cache-Control':'no-store','X-Database-Context':active}});
      configured=compose(configured);
    }
    catch(error){return Response.json({error:error.status?error.message:'Global database configuration is unavailable.'},{status:error.status||503,headers:{'Cache-Control':'no-store'}});}
  }
  const response=await application.fetch(request,configured,ctx);
  if(response.status===101)return response;
  const headers=new Headers(response.headers);
  if(configured.DATABASE_SELECTION){
    if(response.ok&&!headers.has('X-Database-Context')){
      try{
        const latest=(await readDatabaseSelection(configured[DATABASE_CONTROL]||configured.CONTENT_MEDIA,{defaultProvider:env.DB_PROVIDER||'turso'})).selection;
        if(context(latest)!==context(configured.DATABASE_SELECTION))return Response.json({error:'The database changed while this request was running. Its result belongs to the previous database.',code:'DATABASE_CHANGED'},{status:409,headers:{'Cache-Control':'no-store','X-Database-Context':context(latest)}});
      }catch{return Response.json({error:'Database configuration could not be confirmed. Retry the same operation.'},{status:503,headers:{'Cache-Control':'no-store'}});}
    }
    if(!headers.has('X-Database-Context'))headers.set('X-Database-Context',context(configured.DATABASE_SELECTION));
  }
  if(headers.get('Content-Type')?.includes('text/html')&&headers.has('Content-Security-Policy'))headers.set('Content-Security-Policy',headers.get('Content-Security-Policy')+"; worker-src 'self' blob:");
  return new Response(response.body,{status:response.status,headers});
}};}
export default productionWorker(durableChatWorker(messagesWorker({mode:'production'})));
