(() => {
  'use strict';
  let current;
  const place=where=>[where.level,where.unit,where.lesson].join(':');
  const valid=state=>current===state&&state.options.active();
  const key=(state,where)=>'speakout-lesson:'+state.options.actor+':'+(['ADMIN','DEVELOPER'].includes(state.options.role)?'staff':'student')+':'+JSON.stringify(where);
  function configure(options){
    const audience=options.actor+':'+options.role;
    if(current?.audience!==audience)current={audience,options,value:null,job:null,at:0,serial:0};
    else current.options=options;
    return current;
  }
  async function refresh(force=false){
    const state=current;
    if(!state||!valid(state))throw new Error('Access changed. Reopen Speakout.');
    if(!force&&state.value)return state.value;
    if(state.job)return state.job;
    const serial=state.serial;
    state.job=state.options.read('/api/speakout/revisions').then(value=>{
      if(!valid(state))throw new Error('Access changed. Reopen Speakout.');
      if(!value.lessons||typeof value.defaultRevision!=='string')throw new Error('Unable to check Speakout.');
      if(serial!==state.serial&&state.value)return state.value;
      const previous=state.value,changed=[];
      if(previous)for(const id of new Set([...Object.keys(previous.lessons),...Object.keys(value.lessons)])){
        if((previous.lessons[id]||previous.defaultRevision)!==(value.lessons[id]||value.defaultRevision))changed.push(id);
      }
      state.value=value;state.at=Date.now();
      state.options.catalog?.(value.catalogRevision);
      if(changed.length)window.dispatchEvent(new CustomEvent('speakout-cache-change',{detail:{actor:state.options.actor,changed}}));
      return value;
    }).finally(()=>{state.job=null;});
    return state.job;
  }
  function put(where,options,data){
    const state=configure(options);
    if(!valid(state))return;
    state.serial++;
    window.ContentCache.set(key(state,where),structuredClone(data));
    if(state.value&&data.cacheRevision)state.value.lessons[place(where)]=data.cacheRevision;
  }
  window.SpeakoutCache={configure,refresh,put,async load(where,options){
    const state=configure(options),manifest=await refresh();
    if(!valid(state))throw new Error('Access changed. Reopen Speakout.');
    const cacheKey=key(state,where),stamp=manifest.lessons[place(where)]||manifest.defaultRevision;
    const cached=window.ContentCache.get(cacheKey);
    if(cached?.cacheRevision===stamp)return cached;
    if(cached)window.ContentCache.invalidate(cacheKey);
    const data=await window.ContentCache.load(cacheKey,()=>state.options.read('/api/speakout/lesson?'+new URLSearchParams(where)));
    if(!valid(state))throw new Error('Access changed. Reopen Speakout.');
    const latest=state.value.lessons[place(where)]||state.value.defaultRevision;
    if(latest!==stamp&&data.cacheRevision!==latest){
      if(window.ContentCache.get(cacheKey)?.cacheRevision===data.cacheRevision)window.ContentCache.invalidate(cacheKey);
      return window.SpeakoutCache.load(where,options);
    }
    if(data.cacheRevision&&(state.value.lessons[place(where)]||state.value.defaultRevision)===stamp)state.value.lessons[place(where)]=data.cacheRevision;
    return data;
  }};
  function check(){if(current&&valid(current)&&Date.now()-current.at>=60000)void refresh(true).catch(()=>{});}
  window.addEventListener?.('focus',check);
  document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)check();});
  window.addEventListener?.('storage',event=>{
    if(event.key==='english-speakout-materials-v1'&&current&&valid(current))void refresh(true).catch(()=>{});
  });
})();
