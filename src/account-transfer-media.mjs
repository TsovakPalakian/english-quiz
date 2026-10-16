const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const encode=value=>{const bytes=new TextEncoder().encode(JSON.stringify(value));let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw);};
function storage(env,name){if(!['MEDIA','CONTENT_MEDIA'].includes(name)||!env[name])throw Error('Invalid bucket');return env[name];}
export async function transferMedia(request,env,body){
  const action=body?.action||new URL(request.url).searchParams.get('action');
  if(action==='media-put'&&env.ACCOUNT_TRANSFER_ROLE!=='target'||['media-list','media-get'].includes(action)&&env.ACCOUNT_TRANSFER_ROLE!=='source')return reply({error:'Not found.'},404);
  if(env.ACCOUNT_TRANSFER_FROZEN!=='true')return reply({error:'Freeze this account before transferring media.'},409);
  try{
    if(action==='media-put'){
      const raw=request.headers.get('X-Transfer-Metadata')||'';if(raw.length>24000)throw Error('Invalid metadata');
      const meta=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw),c=>c.charCodeAt(0)))),bucket=storage(env,meta.bucket);
      if(typeof meta.key!=='string'||!meta.key||meta.key.length>1024||! /^[a-f0-9]{64}$/.test(meta.sha256))throw Error('Invalid object');
      const reader=request.body?.getReader(),parts=[];let size=0;if(!reader)throw Error('Missing body');
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>64*1024*1024){await reader.cancel();return reply({error:'Object too large.'},413);}parts.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
      if(await hash(bytes)!==meta.sha256)throw Error('Checksum mismatch');
      const httpMetadata={...meta.httpMetadata};if(httpMetadata.cacheExpiry)httpMetadata.cacheExpiry=new Date(httpMetadata.cacheExpiry);
      const options={httpMetadata,customMetadata:meta.customMetadata||{},onlyIf:{etagDoesNotMatch:'*'}};
      const previous=await bucket.get(meta.key);
      if(previous){
        if(await hash(await previous.arrayBuffer())!==meta.sha256||JSON.stringify(previous.customMetadata||{})!==JSON.stringify(options.customMetadata)||JSON.stringify(previous.httpMetadata||{})!==JSON.stringify(httpMetadata))return reply({error:'Target object already differs.'},409);
        return reply({imported:true,replayed:true,sha256:meta.sha256,size});
      }
      if(!await bucket.put(meta.key,bytes,options))return reply({error:'Target object changed.'},409);
      return reply({imported:true,sha256:meta.sha256,size});
    }
    if(action==='media-fence'){
      if(typeof body.frozen!=='boolean'||body.frozen!==(env.ACCOUNT_TRANSFER_ROLE==='source'))return reply({error:'Invalid fence direction.'},403);
      const bucket=storage(env,'CONTENT_MEDIA'),key='system/database-selection-v1.json',object=await bucket.get(key);if(!object)throw Error('Missing selection');
      const selection=await object.json();if(!['d1','neon'].includes(selection.provider)||!Number.isSafeInteger(selection.revision))throw Error('Invalid selection');
      const next={...selection,accountTransferFrozen:body.frozen};
      if(!await bucket.put(key,JSON.stringify(next),{onlyIf:{etagMatches:object.etag},httpMetadata:object.httpMetadata,customMetadata:object.customMetadata}))return reply({error:'Database selection changed.'},409);
      return reply({frozen:body.frozen,provider:next.provider,revision:next.revision});
    }
    const bucket=storage(env,body.bucket);
    if(action==='media-list')return reply(await bucket.list({limit:1000,include:['httpMetadata','customMetadata'],...(body.cursor?{cursor:body.cursor}:{})}));
    if(action==='media-get'){
      if(typeof body.key!=='string'||!body.key||body.key.length>1024)throw Error('Invalid key');
      const object=await bucket.get(body.key);if(!object)return reply({error:'Missing object.'},404);
      return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Transfer-Metadata':encode({bucket:body.bucket,key:body.key,httpMetadata:object.httpMetadata||{},customMetadata:object.customMetadata||{}})}});
    }
    return reply({error:'Not found.'},404);
  }catch{return reply({error:'Media transfer failed validation.'},400);}
}
