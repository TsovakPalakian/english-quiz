import {StudyError} from './turso-study.mjs';

export const DATABASE_SELECTION_KEY='system/database-selection-v1.json';
export const DATABASE_CONTROL=Symbol('unscoped-database-control-bucket');
const initial=(provider='turso')=>checked({provider,revision:0,scope:'site'});
function checked(value){
  if(!value||!['turso','neon'].includes(value.provider)||!Number.isSafeInteger(value.revision)||value.revision<0||value.scope!=='site')throw new StudyError(503,'Global database configuration is invalid. No fallback was selected.');
  return {provider:value.provider,revision:value.revision,scope:'site',...(value.updatedAt?{updatedAt:value.updatedAt}:{}),...(value.updatedBy?{updatedBy:value.updatedBy}:{})};
}

export async function readDatabaseSelection(bucket,{defaultProvider='turso'}={}){
  const fallback=initial(defaultProvider);
  if(!bucket?.get)throw new StudyError(503,'Global database configuration storage is unavailable.');
  try{
    const object=await bucket.get(DATABASE_SELECTION_KEY);
    if(!object)return {selection:fallback,etag:null};
    return {selection:checked(await object.json()),etag:object.etag};
  }catch(error){if(error instanceof StudyError)throw error;throw new StudyError(503,'Global database configuration could not be read. No fallback was selected.');}
}

export async function changeDatabaseSelection(bucket,{provider,expectedRevision,actor,verifyTarget,defaultProvider='turso'}){
  if(actor?.role!=='DEVELOPER'||!actor.id)throw new StudyError(403,'Developers only.');
  if(!['turso','neon'].includes(provider)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new StudyError(400,'A valid database and configuration revision are required.');
  const current=await readDatabaseSelection(bucket,{defaultProvider});
  if(current.selection.revision!==expectedRevision)throw new StudyError(409,'The active database changed. Reopen Databases before switching.');
  if(provider===current.selection.provider)return current.selection;
  // Readiness must be checked by the server before committing the global choice.
  if(typeof verifyTarget!=='function')throw new StudyError(503,'Database activation checks are unavailable.');
  await verifyTarget(provider,actor);
  const next={provider,revision:expectedRevision+1,scope:'site',updatedAt:new Date().toISOString(),updatedBy:actor.id};
  let saved;
  try{
    saved=await bucket.put(DATABASE_SELECTION_KEY,JSON.stringify(next),{
      onlyIf:current.etag?{etagMatches:current.etag}:{etagDoesNotMatch:'*'},
      httpMetadata:{contentType:'application/json',cacheControl:'no-store'}
    });
  }catch{throw new StudyError(503,'Global database selection could not be saved. Reload its status before retrying.');}
  if(!saved)throw new StudyError(409,'The active database changed. Reopen Databases before switching.');
  return next;
}

export async function withDatabaseSelection(env,{openNeon}={}){
  const {selection}=await readDatabaseSelection(env[DATABASE_CONTROL]||env.CONTENT_MEDIA,{defaultProvider:env.DB_PROVIDER||'turso'});
  const configured={...env,DB_PROVIDER:selection.provider,DATABASE_SELECTION:Object.freeze(selection)};
  if(selection.provider==='turso')return configured;
  // Never silently read or write Turso after Neon has been selected globally.
  if(!openNeon)throw new StudyError(503,'Neon application adapter is unavailable. The site did not fall back to Turso.');
  return openNeon(configured);
}
