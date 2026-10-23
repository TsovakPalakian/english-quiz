import {LanguageProviderError} from './language-providers.mjs';
import {boundedProviderBytes} from './bounded-provider-body.mjs';
const fail=code=>{throw new LanguageProviderError(code);};
export function transportConfigurationVersion(value=null){
  if(value===null)return '';
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail('invalid_configuration');
  return '.cfg-'+value;
}
export function validateTransportOptions({enabled,freeTierVerified,timeoutMs}){
  if(typeof enabled!=='boolean'||typeof freeTierVerified!=='boolean'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)fail('invalid_configuration');
}
// Fixed URLs and credentials belong to the adapter, never to a client payload.
export async function languageProviderHTTP(fetchImpl,url,options,{signal,timeoutMs=15000,maxBytes=100000,mime='application/json',mimeAliases=[]}={}){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>10*1024*1024)fail('invalid_configuration');
  if(typeof fetchImpl!=='function')fail('provider_not_configured');if(signal?.aborted)fail('cancelled');
  const controller=new AbortController();let timer,abort;
  const stopped=new Promise((_,reject)=>{
    const stop=code=>{controller.abort();reject(new LanguageProviderError(code));};
    abort=()=>stop('cancelled');signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>stop('timeout'),timeoutMs);
  });
  try{return await Promise.race([stopped,(async()=>{
    if(controller.signal.aborted)fail('cancelled');
    const response=await fetchImpl(url,{...options,redirect:'manual',credentials:'omit',signal:controller.signal});
    if(!(response instanceof Response))fail('invalid_provider_result');
    if(controller.signal.aborted){await response.body?.cancel();fail('cancelled');}
    if(response.status!==200){await response.body?.cancel();fail(response.status===429?'rate_limited':[401,403].includes(response.status)?'provider_access_denied':response.status>=500?'provider_unavailable':'provider_request_rejected');}
    const size=response.headers.get('content-length');
    if(![mime,...mimeAliases].includes(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase())||size!==null&&(!/^\d+$/.test(size)||Number(size)>maxBytes)){await response.body?.cancel();fail('invalid_provider_result');}
    const bytes=await boundedProviderBytes(response.body,maxBytes,controller.signal);if(controller.signal.aborted)fail('cancelled');
    if(mime!=='application/json')return bytes;
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('invalid_provider_result');}
  })()]);}catch(error){if(error instanceof LanguageProviderError)throw error;fail('provider_unavailable');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
