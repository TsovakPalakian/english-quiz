import {boundedProviderBytes} from './bounded-provider-body.mjs';
const limits={'image/png':5*1024*1024,'image/jpeg':5*1024*1024,'audio/wav':10*1024*1024,'audio/mpeg':10*1024*1024,'video/mp4':20*1024*1024};
const reply=(status,error)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export function createWorkbenchInspector({fetchImpl=globalThis.fetch}={}){
  return {async fetch(request,env){
    if(request.method!=='POST'||new URL(request.url).pathname!=='/inspect')return reply(404,'Not found.');
    if(env.INSPECTOR_ENABLED!=='true')return reply(503,'Inspector is off.');
    let endpoint;try{endpoint=new URL(env.INSPECTOR_ENDPOINT);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/inspect')throw Error();}catch{return reply(503,'Inspector configuration unavailable.');}
    if(typeof env.INSPECTOR_TOKEN!=='string'||!/^[a-zA-Z0-9_-]{32,256}$/.test(env.INSPECTOR_TOKEN))return reply(503,'Inspector configuration unavailable.');
    const mime=request.headers.get('Content-Type'),max=Object.hasOwn(limits,mime)?limits[mime]:null;if(!max)return reply(415,'Unsupported media.');
    const length=request.headers.get('Content-Length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))return reply(413,'Media exceeds limits.');
    const controller=new AbortController(),abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)controller.abort();
    const timer=setTimeout(abort,9000);let dispatch=false;
    try{
      const bytes=await boundedProviderBytes(request.body,max,controller.signal);if(!bytes.length)return reply(415,'Empty media.');
      dispatch=true;
      const response=await fetchImpl(endpoint.href,{method:'POST',headers:{'Content-Type':mime,Authorization:'Bearer '+env.INSPECTOR_TOKEN},body:bytes,redirect:'manual',credentials:'omit',signal:controller.signal});
      if(!response.ok){await response.body?.cancel();return reply([413,415,429].includes(response.status)?response.status:503,'Media inspection failed.');}
      if(response.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw Error();
      const value=JSON.parse(new TextDecoder().decode(await boundedProviderBytes(response.body,8192,controller.signal)));
      const kind=mime.startsWith('image/')?'image':mime.startsWith('audio/')?'audio':'video';
      if(!value||Object.keys(value).length!==4||!['kind','duration','width','height'].every(key=>Object.hasOwn(value,key))||value.kind!==kind||!Number.isFinite(value.duration)||value.duration<0||!Number.isSafeInteger(value.width)||!Number.isSafeInteger(value.height)||value.width<0||value.height<0)throw Error();
      return Response.json(value,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }catch(error){return reply(controller.signal.aborted?504:!dispatch&&error.code==='invalid_provider_result'?413:503,'Media inspection unavailable.');}
    finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
  }};
}
export default createWorkbenchInspector();
