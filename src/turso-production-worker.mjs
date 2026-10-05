// Deployment candidate only; activation is a separate, explicit operation.
import integrated,{StageAuthBudget} from './turso-integrated-worker.mjs';
import {studyClient} from './turso-stage-worker.mjs';
import {stageR2Media,PRODUCTION_MEDIA_BUCKET} from './turso-r2-media.mjs';
export {StageAuthBudget};
const unavailable=()=>Response.json({error:'Production content not activated.'},{status:503,headers:{'Cache-Control':'no-store'}});
export function productionEnvironment(env){
  env={...env,SESSION_SECRET:env.CONTENT_SESSION_SECRET||env.SESSION_SECRET};
  if(env.CONTENT_MEDIA_BUCKET!==PRODUCTION_MEDIA_BUCKET||!env.CONTENT_ALLOWED_HOST
    ||!env.SESSION_SECRET||!env.DB||!env.MEDIA||!env.ASSETS||!env.CONTENT_MEDIA)return null;
  const configured={...env,STORAGE_MODE:'production',STAGE_ENABLED:'true',
    STAGE_WRITES:env.CONTENT_WRITES==='true'?'true':'false',STAGE_ALLOWED_HOST:env.CONTENT_ALLOWED_HOST,
    STAGE_MEDIA:env.CONTENT_MEDIA,STAGE_MEDIA_BUCKET:PRODUCTION_MEDIA_BUCKET};
  try{studyClient(configured);stageR2Media(configured);}catch{return null;}
  return configured;
}
export function productionWorker(application=integrated){return {async fetch(request,env,ctx){
  if(env.CONTENT_ENABLED!=='true')return unavailable();
  const configured=productionEnvironment(env);
  if(!configured)return unavailable();
  return application.fetch(request,configured,ctx);
}};}
export default productionWorker();
