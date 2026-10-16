import {readDatabaseSelection,DATABASE_CONTROL} from './database-selection.mjs';

const fail=(status,message,inactiveDatabase=false)=>{throw Object.assign(new Error(message),{status,inactiveDatabase});};
function scope(value){
  if(!value||!['neon','turso'].includes(value.provider)||!Number.isSafeInteger(value.revision)||value.revision<0)fail(503,'Invalid chat database selection.');
  return {provider:value.provider,revision:value.revision,scope:'site'};
}
export function chatDatabaseScope(env){return scope(env.DATABASE_SELECTION||{provider:env.DB_PROVIDER||'turso',revision:0});}
export function chatStorageName(env,id){return chatDatabaseScope(env).provider==='neon'?'neon:v1:'+id:id;}
export function chatDatabaseHeaders(env){const selected=chatDatabaseScope(env);return {'X-Chat-Database':selected.provider,'X-Chat-Database-Revision':String(selected.revision),'X-Chat-Writes':env.CONTENT_WRITES==='false'?'0':'1'};}

// Object names are provider-specific; the stored scope survives DO hibernation.
// Every HTTP entry and WebSocket command checks the current global selection.
export async function prepareChatDatabase(store,request){
  const base=store.baseEnv||store.env;
  if(request&&request.headers.get('X-Chat-Internal')!==(base.CONTENT_SESSION_SECRET||base.SESSION_SECRET))fail(403,'Unavailable.');
  const previous=store.get('_databaseScope'),selected=request?scope({provider:request.headers.get('X-Chat-Database')||'turso',revision:Number(request.headers.get('X-Chat-Database-Revision')||0)}):scope(previous||{provider:'turso',revision:0});
  if(previous&&previous.provider!==selected.provider)fail(403,'This conversation belongs to another database.');
  const inactiveAllowed=request&&['/suspend','/revoke','/revoke-session','/invalidate'].includes(new URL(request.url).pathname);
  if(base.CONTENT_ENABLED==='true'){
    const {selection}=await readDatabaseSelection(base[DATABASE_CONTROL]||base.CONTENT_MEDIA,{defaultProvider:base.DB_PROVIDER||'turso'});
    if((selection.provider!==selected.provider||selection.revision!==selected.revision)&&!inactiveAllowed)fail(503,'The active database changed. Reconnect to messages.',true);
  }
  if(previous&&previous.revision!==selected.revision){
    store.set('policy',null);
    for(const ws of store.ctx.getWebSockets?.()||[])ws.close(4001,'Database changed.');
  }
  store.set('_databaseScope',selected);
  const flag=request?.headers.get('X-Chat-Writes');
  if(flag!=null&&!['0','1'].includes(flag))fail(403,'Invalid chat write configuration.');
  const writable=base.CONTENT_WRITES!=='false'&&(request?(flag==null?true:flag==='1'):store.get('_databaseWritable')!==false);
  store.set('_databaseWritable',writable);
  store.env={...base,SESSION_SECRET:base.CONTENT_SESSION_SECRET||base.SESSION_SECRET,DB_PROVIDER:selected.provider,DATABASE_SELECTION:Object.freeze(selected),CONTENT_WRITES:writable?'true':'false'};
  return selected;
}
