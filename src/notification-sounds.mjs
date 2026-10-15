export const SOUND_IDS=['soft-double','triple','bell','ping','wood','glass','rise','fall','pulse','sparkle','low','classic'];
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function validateNotificationWav(bytes){
  if(bytes.length<46||bytes.length>144044)fail(400,'Use an audio clip up to 3 seconds.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=at=>String.fromCharCode(...bytes.slice(at,at+4));
  if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||tag(12)!=='fmt '||view.getUint32(16,true)!==16||view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||view.getUint32(24,true)!==24000||view.getUint32(28,true)!==48000||view.getUint16(32,true)!==2||view.getUint16(34,true)!==16||tag(36)!=='data'||view.getUint32(40,true)!==bytes.length-44||view.getUint32(4,true)!==bytes.length-8||(bytes.length-44)%2)fail(400,'Invalid notification audio.');
  return (bytes.length-44)/48000;
}
export async function notificationSoundRoute(request,bucket,actor){
  if(!bucket)fail(503,'Sound storage unavailable.');
  const url=new URL(request.url),key='notifications/'+actor.id+'/settings.json',stored=await bucket.get(key);
  const settings=stored?await stored.json():{enabled:true,volume:0.65,sound:'soft-double',sounds:[]};
  const revision=stored?.etag||'';
  const response=()=>Response.json({...settings,revision},{headers});
  const asset=url.searchParams.get('id');
  if(request.method==='GET'){
    if(!asset)return response();
    const entry=settings.sounds.find(item=>item.id===asset);if(!entry)fail(404,'Sound not found.');
    const object=await bucket.get('notifications/'+actor.id+'/'+asset+'.wav');if(!object)fail(404,'Sound not found.');
    return new Response(object.body,{headers:{...headers,'Content-Type':'audio/wav'}});
  }
  if(!['POST','PUT','DELETE'].includes(request.method))fail(405,'Method not allowed.');
  if(request.headers.get('If-Match')!==revision)fail(409,'Sound settings changed. Reopen settings.');
  let uploaded,removed;
  if(request.method==='PUT'){
    if(settings.sounds.length>=20)fail(400,'Remove an unused custom sound first.');
    const reader=request.body?.getReader();if(!reader)fail(400,'Empty audio.');
    const chunks=[];let size=0;
    try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>144044){await reader.cancel();fail(413,'Sound is too large.');}chunks.push(part.value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    const duration=validateNotificationWav(bytes),id=crypto.randomUUID();
    uploaded='notifications/'+actor.id+'/'+id+'.wav';
    await bucket.put(uploaded,bytes,{httpMetadata:{contentType:'audio/wav'}});
    settings.sounds.push({id,name:(url.searchParams.get('name')||'Custom sound').slice(0,80),duration});settings.sound=id;
  }else if(request.method==='DELETE'){
    if(!settings.sounds.some(item=>item.id===asset))fail(404,'Sound not found.');
    settings.sounds=settings.sounds.filter(item=>item.id!==asset);if(settings.sound===asset)settings.sound='soft-double';
    removed='notifications/'+actor.id+'/'+asset+'.wav';
  }else{
    const raw=await request.text();if(raw.length>1024)fail(413,'Settings are too large.');
    let body;try{body=JSON.parse(raw);}catch{fail(400,'Invalid settings.');}
    if(!body||typeof body.enabled!=='boolean'||!Number.isFinite(body.volume)||body.volume<0||body.volume>1||![...SOUND_IDS,...settings.sounds.map(item=>item.id)].includes(body.sound))fail(400,'Invalid sound settings.');
    Object.assign(settings,{enabled:body.enabled,volume:body.volume,sound:body.sound});
  }
  let saved;
  try{saved=await bucket.put(key,JSON.stringify(settings),{onlyIf:revision?{etagMatches:revision}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});}catch(error){if(uploaded)await bucket.delete(uploaded);throw error;}
  if(!saved){if(uploaded)await bucket.delete(uploaded);fail(409,'Sound settings changed. Reopen settings.');}
  if(removed)await bucket.delete(removed);
  return Response.json({...settings,revision:saved.etag},{headers});
}
