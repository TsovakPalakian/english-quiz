import {ACTIVE_DATABASE} from './database-selection.mjs';
import {assertAccountTransferRunning} from './account-transfer-guard.mjs';

const fail=(status,message,inactiveDatabase=false)=>{throw Object.assign(new Error(message),{status,inactiveDatabase});};
function scope(value){
  if(!value||value.provider!=='d1'||!Number.isSafeInteger(value.revision)||value.revision<0)fail(503,'Invalid chat database selection.');
  return {provider:'d1',revision:value.revision,scope:'site'};
}
export function chatDatabaseScope(env){return scope(env.DATABASE_SELECTION||ACTIVE_DATABASE);}
export function chatStorageName(env,id){return id;}
export function chatDatabaseHeaders(env){const selected=chatDatabaseScope(env);return {'X-Chat-Database':selected.provider,'X-Chat-Database-Revision':String(selected.revision),'X-Chat-Writes':env.CONTENT_WRITES==='false'?'0':'1'};}
export async function assertChatRunning(store){assertAccountTransferRunning(store.baseEnv||store.env);}

// Stored scope survives DO hibernation; D1 is the only provider.
export async function prepareChatDatabase(store,request){
  const base=store.baseEnv||store.env;
  assertAccountTransferRunning(base);
  if(request&&request.headers.get('X-Chat-Internal')!==(base.CONTENT_SESSION_SECRET||base.SESSION_SECRET))fail(403,'Unavailable.');
  const flag=request?.headers.get('X-Chat-Writes');
  if(flag!=null&&!['0','1'].includes(flag))fail(403,'Invalid chat write configuration.');
  const previous=store.get('_databaseScope');
  const selected=request?scope({provider:request.headers.get('X-Chat-Database')||'d1',revision:Number(request.headers.get('X-Chat-Database-Revision')||0)}):scope(previous||ACTIVE_DATABASE);
  if(previous&&previous.provider!=='d1')fail(403,'This conversation belongs to another database.');
  if(previous&&previous.revision!==selected.revision){
    store.set('policy',null);
    for(const ws of store.ctx.getWebSockets?.()||[])ws.close(4001,'Database changed.');
  }
  if(!previous||previous.provider!==selected.provider||previous.revision!==selected.revision||previous.scope!==selected.scope)store.set('_databaseScope',selected);
  const previousWritable=store.get('_databaseWritable');
  const writable=base.CONTENT_WRITES!=='false'&&(request?(flag==null?true:flag==='1'):previousWritable!==false);
  if(previousWritable!==writable)store.set('_databaseWritable',writable);
  store.env={...base,SESSION_SECRET:base.CONTENT_SESSION_SECRET||base.SESSION_SECRET,DB_PROVIDER:'d1',DATABASE_SELECTION:Object.freeze(selected),CONTENT_WRITES:writable?'true':'false'};
  return selected;
}
