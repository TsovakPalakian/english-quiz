// Operator-only controls. Writes to live D1 databases are categorically denied.
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
const account='42a9ebe47d529e3664b914aaf0813a21';
const liveDatabases=new Set(['e2739e2e-6693-4cc8-8054-d90173b032c0','dd640d1f-abbe-4236-8741-5638e89d890f']);
export function workbenchCloudControl({token,fetchImpl=fetch,maxRequests=1500}={}){
  if(typeof token!=='string'||!token.trim()||typeof fetchImpl!=='function'||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>2000)throw Error('Explicit bounded operator credentials required.');
  let used=0;const owned=new Set();
  async function request(path,{method='GET',body,allow404=false}={}){
    method=method.toUpperCase();
    if(typeof path!=='string'||!/^\/(?:accounts|zones)(?:\/|\?|$)/.test(path)||/[\\%#\s]/.test(path)||path.includes('..')||path.includes('//'))throw Error('Cloud control scope denied.');
    if(path.startsWith('/accounts/')&&!path.startsWith('/accounts/'+account+'/'))throw Error('Cloud account scope denied.');
    const target=/^\/accounts\/[^/]+\/d1\/database\/([^/?]+)(?:\/|\?|$)/.exec(path);
    if(method!=='GET'&&target&&(liveDatabases.has(target[1])||!owned.has(target[1])))throw Error('Only newly created rehearsal D1 databases may be changed.');
    const cleanup=method==='DELETE'&&target&&owned.has(target[1]);
    if(used>=maxRequests&&!cleanup)throw Error('Cloud request budget denied.');
    used++;const response=await fetchImpl('https://api.cloudflare.com/client/v4'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(allow404&&response.status===404)return null;
    let value;try{value=await response.json();}catch{throw Error('Invalid Cloudflare control response.');}
    if(!response.ok||value.success!==true)throw Object.assign(Error('Cloud control request failed.'),{status:response.status,codes:(value.errors||[]).map(row=>row.code)});
    return value.result;
  }
  const scoped=(path,options)=>request('/accounts/'+account+path,options);
  return {request,scoped,usage:()=>used,async createRehearsal(){
    const row=await scoped('/d1/database',{method:'POST',body:{name:'lumiscia-workbench-rehearsal-'+Date.now()}});
    if(!row||!/^[a-f0-9-]{36}$/.test(row.uuid)||liveDatabases.has(row.uuid))throw Error('Unexpected rehearsal identity.');owned.add(row.uuid);return row.uuid;
  },async removeRehearsal(id){if(!owned.has(id)||liveDatabases.has(id))throw Error('Rehearsal ownership required.');await scoped('/d1/database/'+id,{method:'DELETE'});owned.delete(id);}};
}
export function existingCloudToken(){
  if(process.env.CLOUDFLARE_API_TOKEN)return process.env.CLOUDFLARE_API_TOKEN;
  const data=readFileSync(homedir()+'/.wrangler/config/default.toml','utf8'),token=data.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],expiry=data.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
  if(!token||!expiry||Date.parse(expiry)<=Date.now())throw Error('Existing Cloudflare login expired.');return token;
}
