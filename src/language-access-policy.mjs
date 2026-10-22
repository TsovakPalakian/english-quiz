import {LanguageProviderError,LANGUAGE_TASKS} from './language-providers.mjs';
import {statement as s} from './learning-study.mjs';
const fail=code=>{throw new LanguageProviderError(code);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const canonical=value=>JSON.stringify(value,(_,item)=>object(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const token=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]{0,199}$/.test(value);
const developer=actor=>{if(!actor?.id||actor.role!=='DEVELOPER'||actor.active===false||actor.active===0||actor.revoked)fail('developer_required');};
const scopeOK=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const identity=adapter=>({id:adapter.id,provider:adapter.provider,model:adapter.model,version:adapter.version,billing:adapter.billing});
const guard=()=>[s('DROP TABLE IF EXISTS temp.mutation_guard'),s('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))')];
const positive=(value,max)=>Number.isSafeInteger(value)&&value>0&&value<=max;
function validatePolicy(value){
  if(!exact(value,['enabled','bindings','tasks','termsRevision','dataProcessingApproved','noPaidOverageConfirmed','expiresAt','dailyRequests','dailyInputBytes','maxInputBytes'])||typeof value.enabled!=='boolean'||
    !Array.isArray(value.bindings)||!value.bindings.length||value.bindings.length>20||new Set(value.bindings.map(row=>row?.id)).size!==value.bindings.length||
    !value.bindings.every(row=>exact(row,['id','provider','model','version','billing'])&&['id','provider','version'].every(key=>token(row[key]))&&typeof row.model==='string'&&row.model.length<=200&&['free-tier','self-hosted'].includes(row.billing))||
    !Array.isArray(value.tasks)||!value.tasks.length||new Set(value.tasks).size!==value.tasks.length||!value.tasks.every(task=>LANGUAGE_TASKS.includes(task))||
    !token(value.termsRevision)||typeof value.dataProcessingApproved!=='boolean'||typeof value.noPaidOverageConfirmed!=='boolean'||
    !Number.isSafeInteger(value.expiresAt)||value.expiresAt<0||!positive(value.dailyRequests,1000000)||!positive(value.dailyInputBytes,10000000000)||!positive(value.maxInputBytes,11000000)||value.maxInputBytes>value.dailyInputBytes||
    value.enabled&&(!value.dataProcessingApproved||!value.noPaidOverageConfirmed))fail('invalid_access_policy');
  return structuredClone(value);
}
// Budgets count conservative admissions, not measured currency or provider invoices.
export class LanguageAccessPolicy{
  #db;#now;
  constructor(db,{now=Date.now}={}){if(typeof db?.read!=='function'||typeof db?.atomic!=='function'||typeof now!=='function')fail('invalid_configuration');this.#db=db;this.#now=now;}
  #time(){const at=this.#now();if(!Number.isSafeInteger(at)||at<0)fail('access_policy_unavailable');return at;}
  async #read(scope){
    if(!scopeOK(scope))fail('invalid_access_policy');
    try{const [row]=await this.#db.read('SELECT * FROM qr_language_access WHERE scope=?',[scope]);if(!row)return null;if(!positive(row.revision,Number.MAX_SAFE_INTEGER))throw Error();return {revision:row.revision,policy:validatePolicy(JSON.parse(row.policy_json))};}catch{fail('access_policy_unavailable');}
  }
  async inspect(actor,scope){
    developer(actor);const state=await this.#read(scope);if(!state)return {scope,revision:0,policy:null,usedRequests:0,usedInputBytes:0};
    try{const [row]=await this.#db.read('SELECT COUNT(*) AS requests,COALESCE(SUM(input_bytes),0) AS bytes FROM qr_language_access_usage WHERE scope=? AND day=?',[scope,Math.floor(this.#time()/86400000)]);return {scope,...state,usedRequests:Number(row.requests),usedInputBytes:Number(row.bytes)};}catch{fail('access_policy_unavailable');}
  }
  async confirm(actor,body){
    developer(actor);
    if(!exact(body,['mutationId','scope','expectedRevision','policy','reason'])||typeof body.mutationId!=='string'||!/^[a-f0-9-]{36}$/.test(body.mutationId)||!scopeOK(body.scope)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||body.expectedRevision>=Number.MAX_SAFE_INTEGER||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500)fail('invalid_access_policy');
    body=structuredClone(body);
    const policy=validatePolicy(body.policy),at=this.#time(),revision=body.expectedRevision+1;
    const request=canonical({scope:body.scope,expectedRevision:body.expectedRevision,policy,reason:body.reason.trim()});
    const replay=async()=>{let row;try{[row]=await this.#db.read('SELECT * FROM qr_language_access_changes WHERE mutation_id=?',[body.mutationId]);}catch{fail('access_policy_unavailable');}if(!row)return false;if(row.actor_id!==actor.id||row.request_json!==request)fail('access_policy_conflict');return true;};
    if(await replay())return {scope:body.scope,revision};
    if(policy.enabled&&(policy.expiresAt<=at||policy.expiresAt>at+31*86400000))fail('invalid_access_policy');
    try{
      await this.#db.atomic([...guard(),...(body.expectedRevision===0?
        [s('INSERT INTO qr_language_access(scope,revision,policy_json) VALUES(?,1,?)',[body.scope,JSON.stringify(policy)])]:
        [s('UPDATE qr_language_access SET revision=?,policy_json=? WHERE scope=? AND revision=?',[revision,JSON.stringify(policy),body.scope,body.expectedRevision]),s('INSERT INTO mutation_guard SELECT changes()=1')]),
        s('INSERT INTO qr_language_access_changes(mutation_id,scope,revision,actor_id,changed_at,reason,request_json) VALUES(?,?,?,?,?,?,?)',[body.mutationId,body.scope,revision,actor.id,at,body.reason.trim(),request]),s('DROP TABLE mutation_guard')]);
    }catch(error){if(await replay())return {scope:body.scope,revision};if(error.status===409||/constraint/i.test(error.message))fail('access_policy_conflict');fail('access_policy_unavailable');}
    return {scope:body.scope,revision};
  }
  async history(actor,scope,{before=null,limit=50}={}){
    developer(actor);if(!scopeOK(scope)||!positive(limit,100)||before!==null&&!positive(before,Number.MAX_SAFE_INTEGER))fail('invalid_request');
    try{const rows=await this.#db.read(`SELECT revision,actor_id,changed_at,reason,request_json FROM qr_language_access_changes WHERE scope=? ${before===null?'':'AND revision<?'} ORDER BY revision DESC LIMIT ?`,[scope,...(before===null?[]:[before]),limit+1]),page=rows.slice(0,limit);return {changes:page.map(row=>({revision:row.revision,actorId:row.actor_id,changedAt:row.changed_at,reason:row.reason,policy:JSON.parse(row.request_json).policy})),next:rows.length>limit?page.at(-1).revision:null};}catch{fail('access_policy_unavailable');}
  }
  wrap(adapter,{scope}={}){
    if(!scopeOK(scope)||typeof adapter?.invoke!=='function')fail('invalid_configuration');
    const expected=identity(adapter),invoke=adapter.invoke;
    return {...adapter,invoke:async(input,options={})=>{
      const {signal,source}=options;if(signal?.aborted)fail('cancelled');
      if(!source||source.adapterId!==expected.id||source.provider!==expected.provider||source.model!==expected.model||source.version!==expected.version||!LANGUAGE_TASKS.includes(source.task))fail('access_policy_denied');
      const state=await this.#read(scope),at=this.#time();
      if(!state||!state.policy.enabled||state.policy.expiresAt<=at||!state.policy.tasks.includes(source.task)||!state.policy.bindings.some(binding=>canonical(binding)===canonical(expected)))fail('access_policy_denied');
      // Count UTF-8 JSON plus actual binary bytes; never persist their content.
      let size=0;try{const json=JSON.stringify(input,(_,value)=>{if(value instanceof Uint8Array){size+=value.byteLength;return null;}return value;});if(typeof json!=='string')throw Error();size+=new TextEncoder().encode(json).length;}catch{fail('invalid_request');}
      if(size>state.policy.maxInputBytes)fail('input_budget_exceeded');if(signal?.aborted)fail('cancelled');
      try{await this.#db.atomic([...guard(),s(`INSERT INTO qr_language_access_usage(id,scope,revision,day,task,adapter_id,input_bytes,admitted_at)
        SELECT ?,scope,revision,?,?,?, ?,? FROM qr_language_access WHERE scope=? AND revision=? AND
        (SELECT COUNT(*) FROM qr_language_access_usage WHERE scope=? AND day=?)<? AND
        (SELECT COALESCE(SUM(input_bytes),0) FROM qr_language_access_usage WHERE scope=? AND day=?)+?<=?`,
        [crypto.randomUUID(),Math.floor(at/86400000),source.task,expected.id,size,at,scope,state.revision,scope,Math.floor(at/86400000),state.policy.dailyRequests,scope,Math.floor(at/86400000),size,state.policy.dailyInputBytes]),s('INSERT INTO mutation_guard SELECT changes()=1'),s('DROP TABLE mutation_guard')]);}
      catch(error){if(error.status===409||/constraint/i.test(error.message))fail('access_budget_or_policy_changed');fail('access_policy_unavailable');}
      // Recheck after asynchronous admission: revocation or expiry must win before dispatch.
      const current=await this.#read(scope),dispatchAt=this.#time();
      if(!current||current.revision!==state.revision||!current.policy.enabled||current.policy.expiresAt<=dispatchAt||Math.floor(dispatchAt/86400000)!==Math.floor(at/86400000))fail('access_budget_or_policy_changed');
      // Once admitted, timeout/failure/cancellation is uncertain and stays charged.
      if(signal?.aborted)fail('cancelled');return invoke(input,options);
    }};
  }
}
