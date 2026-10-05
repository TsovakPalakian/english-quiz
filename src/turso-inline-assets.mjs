// Called only AFTER the database has authorized this exact inline reference.
import {StudyError} from './turso-study.mjs';
import {boundedMediaBytes} from './turso-r2-media.mjs';
import {mediaRange} from './turso-media.mjs';
export async function inlineAssetResponse(assets,request,entry){
  if(!assets||!['GET','HEAD'].includes(request.method))throw new StudyError(503,'Protected inline assets unavailable.');
  const range=mediaRange(request.method==='HEAD'?'':request.headers.get('range')||'');
  const url=new URL(request.url);url.pathname='/private-migration-media/'+entry.sha256+'.bin';url.search='';
  const source=await assets.fetch(new Request(url,{method:'GET'}));
  if(!source.ok)throw new StudyError(503,'Protected inline asset missing.');
  const bytes=await boundedMediaBytes(source);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(bytes.length!==entry.bytes||digest!==entry.sha256)throw new StudyError(503,'Inline asset checksum mismatch.');
  const headers={'Content-Type':entry.mime,'Content-Length':String(bytes.length),'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Accept-Ranges':'bytes',
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
  if(request.method==='HEAD')return new Response(null,{headers});
  if(!range)return new Response(bytes,{headers});
  const [,a,b]=/^bytes=(\d*)-(\d*)$/.exec(range),start=a?Number(a):Math.max(0,bytes.length-Number(b)),end=a?(b?Math.min(Number(b),bytes.length-1):bytes.length-1):bytes.length-1;
  if(start>=bytes.length)return new Response(null,{status:416,headers:{...headers,'Content-Length':'0','Content-Range':`bytes */${bytes.length}`}});
  const body=bytes.subarray(start,end+1);return new Response(body,{status:206,headers:{...headers,'Content-Length':String(body.length),'Content-Range':`bytes ${start}-${end}/${bytes.length}`}});
}
