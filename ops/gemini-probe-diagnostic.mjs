import {boundedProviderBytes} from '../src/bounded-provider-body.mjs';
const statuses=new Set(['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','RESOURCE_EXHAUSTED','FAILED_PRECONDITION','UNAVAILABLE','INTERNAL','DEADLINE_EXCEEDED']);
const reasons=new Set(['API_KEY_INVALID','API_KEY_SERVICE_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_IP_ADDRESS_BLOCKED','SERVICE_DISABLED','BILLING_DISABLED','CONSUMER_INVALID','ACCESS_TOKEN_SCOPE_INSUFFICIENT','RATE_LIMIT_EXCEEDED','QUOTA_EXCEEDED']);
// Never return free-form provider strings, even when they look like error codes.
export async function geminiProbeDiagnostic(response,{signal,timeoutMs=1000}={}){
  const diagnostic={httpStatus:response.status};
  const controller=new AbortController();
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  let timer;
  const stopped=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve();},timeoutMs);});
  const read=(async()=>{
    try{
      if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'){await response.body?.cancel();return null;}
      const bytes=await boundedProviderBytes(response.body,16384,controller.signal);
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    }catch{return null;}
  })();
  try{
    const data=await Promise.race([read,stopped]);
    if(statuses.has(data?.error?.status))diagnostic.apiStatus=data.error.status;
    const details=data?.error?.details;
    if(Array.isArray(details)){
      const found=details.slice(0,20).find(row=>reasons.has(row?.reason));
      if(found)diagnostic.reason=found.reason;
    }
    return diagnostic;
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();
    if(response.body&&!response.body.locked)response.body.cancel().catch(()=>{});
  }
}
