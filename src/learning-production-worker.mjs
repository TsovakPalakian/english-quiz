// Deployment candidate only; activation is a separate, explicit operation.
import integrated,{StageAuthBudget,integratedWorker} from './learning-integrated-worker.mjs';
import {createWorkbenchRuntime} from './learning-workbench-runtime.mjs';
import {studyClient} from './learning-stage-worker.mjs';
import {stageR2Media,PRODUCTION_MEDIA_BUCKET} from './learning-r2-media.mjs';
import {messagesWorker} from './learning-messages-worker.mjs';
import {durableChatWorker} from './chat-worker.mjs';
import {ACTIVE_DATABASE} from './database-selection.mjs';
import {STUDY_DATABASE,STATIC_STUDY_DATABASE} from './study-database.mjs';
import {pruneSessionHistory} from './security-sessions.mjs';
import {accountTransferWorker} from './account-transfer.mjs';
import {assertAccountTransferRunning} from './account-transfer-guard.mjs';
import {isSensitiveFileProbe,sensitiveFileNotFound} from './sensitive-paths.mjs';
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
const active=ACTIVE_DATABASE.provider+':'+ACTIVE_DATABASE.revision;
export function productionWorker(application=integrated){
  const compose=env=>{const data={...env,DB_PROVIDER:'d1',DATABASE_SELECTION:ACTIVE_DATABASE};delete data[STUDY_DATABASE];return {...data,[STUDY_DATABASE]:studyClient(data)};};
  return {async scheduled(event,env,ctx){
    if(env.ACCOUNT_TRANSFER_FROZEN==='true')return;
    let configured=productionEnvironment(env);
    if(configured){
      configured=compose(configured);
      ctx.waitUntil(pruneSessionHistory(studyClient(configured)).catch(()=>console.error('Session history cleanup deferred.')));
      if(application.scheduled)await application.scheduled(event,configured,ctx);
    }
  },async fetch(request,env,ctx){
  if(isSensitiveFileProbe(request))return sensitiveFileNotFound(request);
  try{assertAccountTransferRunning(env);}catch(error){return Response.json({error:error.message},{status:503,headers:{'Cache-Control':'no-store'}});}
  if(env.CONTENT_ENABLED!=='true')return unavailable();
  let configured=productionEnvironment(env);
  if(!configured)return unavailable();
  const data=databaseBackedRequest(request);
  if(data){
    if(new URL(request.url).pathname==='/api/database-context')return Response.json(ACTIVE_DATABASE,{status:request.method==='GET'?200:405,headers:{'Cache-Control':'no-store','X-Database-Context':active}});
    configured=compose(configured);
  }
  const response=await application.fetch(request,configured,ctx);
  if(response.status===101)return response;
  const headers=new Headers(response.headers);
  if(data&&!headers.has('X-Database-Context'))headers.set('X-Database-Context',active);
  if(headers.get('Content-Type')?.includes('text/html')&&headers.has('Content-Security-Policy'))headers.set('Content-Security-Policy',headers.get('Content-Security-Policy')+"; worker-src 'self' blob:");
  return new Response(response.body,{status:response.status,headers});
}};}
const workbenchRuntime=createWorkbenchRuntime();
const workbenchBase=integratedWorker({openWorkbench:workbenchRuntime.open});
const application=durableChatWorker(messagesWorker({mode:'production',baseWorker:workbenchBase}));
export default accountTransferWorker(productionWorker({...application,async scheduled(event,env,ctx){
  if(application.scheduled)await application.scheduled(event,env,ctx);
  if(env.LEARNING_WORKBENCH_ENABLED==='true'&&env.LEARNING_WORKBENCH_WRITES==='true')ctx.waitUntil(workbenchRuntime.scheduled(event,env,ctx,{db:studyClient(env)}).catch(()=>console.error('Workbench maintenance deferred.')));
}}));
