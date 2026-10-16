(() => {
  'use strict';
  const KEY='app-database-context-v1',RESET='app-database-reset-v1',nativeFetch=window.fetch.bind(window),never=new Promise(()=>{});
  const banks=new Set(['/grammar.js','/lesson-data.js','/irregular.js','/speakout.js','/tense-bank.json']);
  let current='',confirmed=false,invalidating=false,checking=null,resolveReady,ready=new Promise(resolve=>{resolveReady=resolve;});
  try{current=localStorage.getItem(KEY)||'';}catch{}
  const valid=value=>typeof value==='string'&&/^(neon|d1):\d+$/.test(value)&&Number.isSafeInteger(Number(value.split(':')[1]));
  if(!valid(current))current='';
  function hide(){document.documentElement.setAttribute('data-database-pending','');if(confirmed){confirmed=false;ready=new Promise(resolve=>{resolveReady=resolve;});}}
  const style=document.createElement('style');style.textContent='html[data-database-pending] body{visibility:hidden!important}';document.head.append(style);hide();
  function errorNotice(){
    let node=document.getElementById('databaseConnectionError');if(node)return;
    node=document.createElement('div');node.id='databaseConnectionError';node.textContent='Connection required to verify access.';
    node.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;visibility:visible;background:var(--bg,#fff);color:var(--ink,#183a35);text-align:center';
    if(document.body)document.body.append(node);else document.addEventListener('DOMContentLoaded',()=>document.body.append(node),{once:true});
  }
  async function clearPrivateData(){
    window.LearningMain?.databaseReset?.();window.ContentCache?.clear?.();window.dispatchEvent(new Event('database-context-reset'));
    const keep=new Set(['enquiz-display-size','enquiz-high-visibility']);
    for(const storage of [localStorage,sessionStorage])for(const key of Object.keys(storage))if((/^(enquiz-|learning-|english-)/.test(key)||/^[a-z]+-main-/.test(key))&&!keep.has(key))storage.removeItem(key);
    if(window.indexedDB){
      let names=['enquiz-media'];
      try{if(indexedDB.databases)names=[...new Set([...names,...(await indexedDB.databases()).map(row=>row.name).filter(name=>name?.startsWith('enquiz-media'))])];}catch{}
      await Promise.all(names.map(name=>new Promise(resolve=>{
        try{const request=indexedDB.deleteDatabase(name);request.onsuccess=request.onerror=request.onblocked=resolve;}catch{resolve();}
      })));
    }
    if(window.caches)try{await Promise.all((await caches.keys()).filter(name=>/^(enquiz|english|learning)/.test(name)).map(name=>caches.delete(name)));}catch{}
  }
  async function invalidate(next){
    if(invalidating)return never;
    invalidating=true;hide();
    try{localStorage.setItem(RESET,next);await clearPrivateData();localStorage.setItem(KEY,next);localStorage.removeItem(RESET);location.reload();}
    catch{errorNotice();}
    return never;
  }
  async function check(){
    if(invalidating)return never;if(checking)return checking;
    checking=(async()=>{
      try{
        const response=await nativeFetch('/api/database-context',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});
        if(!response.ok)throw Error('Unavailable');
        const value=await response.json(),next=value.provider+':'+value.revision;
        if(!valid(next))throw Error('Invalid database context');
        let reset;try{reset=localStorage.getItem(RESET);}catch{}
        if(!current||current!==next||reset)return invalidate(next);
        confirmed=true;document.documentElement.removeAttribute('data-database-pending');document.getElementById('databaseConnectionError')?.remove();resolveReady(next);return next;
      }catch{hide();errorNotice();}
      finally{checking=null;}
    })();
    return checking;
  }
  window.DatabaseContext={get ready(){return invalidating?never:ready;},get confirmed(){return confirmed&&!invalidating;},get mediaDatabase(){return 'enquiz-media:'+current;},check};
  window.fetch=async(input,options={})=>{
    options ||= {};
    let url;try{url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);}catch{return nativeFetch(input,options);}
    const data=url.origin===location.origin&&(url.pathname.startsWith('/api/')||url.pathname==='/lookup'||url.pathname==='/translate'||banks.has(url.pathname));
    if(!data||url.pathname==='/api/database-context')return nativeFetch(input,options);
    const captured=await window.DatabaseContext.ready;if(invalidating)return never;
    const headers=new Headers(options.headers||(typeof input==='object'?input.headers:undefined));headers.set('X-Database-Context',captured);
    const response=await nativeFetch(input,{...options,headers,cache:'no-store'}),received=response.headers.get('X-Database-Context');
    if(invalidating)return never;
    if(received&&valid(received)&&received!==captured)return invalidate(received);
    return response;
  };
  window.addEventListener('storage',event=>{if(event.key===RESET&&valid(event.newValue)||event.key===KEY&&valid(event.newValue)&&event.newValue!==current)invalidate(event.newValue);});
  const recheck=()=>{if(!invalidating){hide();void check();}};
  window.addEventListener('focus',recheck);window.addEventListener('online',recheck);window.addEventListener('pageshow',event=>{if(event.persisted)recheck();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)recheck();});
  setInterval(()=>{if(!document.hidden)void check();},15000);void check();
})();
