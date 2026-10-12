import {chatFileMime} from './chat-attachments.mjs';
// Unlisted links still get a URL card. Only established public providers are fetched.
const providers=['youtube.com','youtu.be','wikipedia.org','wikimedia.org','wordwall.net','youglish.com','playphrase.me','britishcouncil.org','cambridgeenglish.org','cambridge.org','bbc.com','bbc.co.uk','github.com','developer.mozilla.org','developers.cloudflare.com','openai.com','google.com'];
const images=[...providers,'ytimg.com','googleusercontent.com','gstatic.com','githubusercontent.com'];
const allowed=(host,list)=>list.some(name=>host===name||host.endsWith('.'+name));
export function chatPreviewUrl(value){
  let url;try{url=new URL(String(value));}catch{return null;}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port||url.href.length>2048)return null;
  if(!/^[a-z0-9.-]+$/i.test(url.hostname)||!url.hostname.includes('.')||/^\d+(?:\.\d+){3}$/.test(url.hostname)||/\.(?:localhost|local|internal|test|invalid)$/i.test(url.hostname))return null;
  return url;
}
const clean=(text,max)=>String(text||'').replace(/[\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export async function parseChatPreviewHTML(html,url){
  const tags={},title=[];
  await new HTMLRewriter().on('meta',{element(element){const key=(element.getAttribute('property')||element.getAttribute('name')||'').toLowerCase();if(['og:title','og:description','og:image','description','twitter:title','twitter:description','twitter:image'].includes(key)&&!tags[key])tags[key]=element.getAttribute('content');}}).on('title',{text(chunk){if(title.join('').length<300)title.push(chunk.text);}}).transform(new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}})).arrayBuffer();
  let image;try{image=chatPreviewUrl(new URL(tags['og:image']||tags['twitter:image']||'',url).href);}catch{}
  return {title:clean(tags['og:title']||tags['twitter:title']||title.join(''),3200),description:clean(tags['og:description']||tags['twitter:description']||tags.description,5120),image:image&&image.href!==url.href&&image.protocol==='https:'&&allowed(image.hostname,images)?image.href:null};
}
async function bytes(response,limit,truncate=false){
  if(!response.body)return new Uint8Array();const reader=response.body.getReader(),parts=[];let n=0;
  try{while(true){const next=await reader.read();if(next.done)break;const take=Math.min(limit-n,next.value.length);parts.push(next.value.slice(0,take));n+=take;if(n===limit){await reader.cancel();if(!truncate)throw new Error('Preview too large.');break;}}}finally{reader.releaseLock();}
  const result=new Uint8Array(n);let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;
}
async function publicFetch(url,list){
  let target=url;for(let i=0;i<3;i++){
    if(!target||target.protocol!=='https:'||!allowed(target.hostname,list))return null;
    const response=await fetch(target.href,{redirect:'manual',signal:AbortSignal.timeout(5000),headers:{Accept:'text/html,image/png,image/jpeg,image/webp,image/gif','User-Agent':'EnglishChatPreview/1.0'}});
    if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('Location');await response.body?.cancel();try{target=chatPreviewUrl(new URL(next,target).href);}catch{return null;}continue;}
    return response.ok?response:null;
  }return null;
}
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
export async function chatLinkPreview(value,origin,budget,cache=caches.default){
  const url=chatPreviewUrl(value);if(!url)throw Object.assign(new Error('Invalid link.'),{status:400});
  const id=await hash(url.href),key=origin+'/__chat_preview/v2/'+id,cached=await cache.match(key);if(cached)return cached.json();
  let path=url.pathname;try{path=decodeURI(path);}catch{}
  let title=url.hostname,description=clean(path==='/'?'':path,320),image=null;
  if(url.protocol==='https:'&&allowed(url.hostname,providers)){
    await budget();
    try{
      const response=await publicFetch(url,providers);
      if(response&&/text\/html/i.test(response.headers.get('Content-Type')||'')){
        const parsed=await parseChatPreviewHTML(new TextDecoder().decode(await bytes(response,256*1024,true)),url);title=parsed.title||title;description=parsed.description||description;
        if(parsed.image){const media=await publicFetch(chatPreviewUrl(parsed.image),images);if(media){const blob=await bytes(media,1024*1024),mime=chatFileMime(blob);if(mime.startsWith('image/')){await cache.put(origin+'/__chat_preview_image/'+id,new Response(blob,{headers:{'Content-Type':mime,'Cache-Control':'public, max-age=86400'}}));image='/api/messages/preview-image?id='+id;}}}
      }
    }catch{}
  }
  const result={url:url.href,site:url.hostname,title,description,image};await cache.put(key,Response.json(result,{headers:{'Cache-Control':'public, max-age=3600'}}));return result;
}
export async function chatPreviewImage(id,origin,cache=caches.default){
  if(!/^[a-f0-9]{64}$/.test(id||''))return new Response(null,{status:404});const response=await cache.match(origin+'/__chat_preview_image/'+id);if(!response)return new Response(null,{status:404});
  return new Response(response.body,{headers:{'Content-Type':response.headers.get('Content-Type'),'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'no-referrer'}});
}
