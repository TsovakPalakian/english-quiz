// Boot the shell first. Catalogs load on demand through ContentCache.
(() => {
  const documents={},cards=new Map(),loads=new Map(),memory=new Map();
  window.LESSON_DATA=window.LESSON_DATA||{words:[],lines21:[],ask07:[],phrases09:[],adverbs14:[],talk16:[],likes23:[],extraWords:[],rules:[],lessonRules:[],phrasalWords:[],idiomWords:[],songCards:{}};
  window.IRREGULAR=window.IRREGULAR||[];
  window.GRAMMAR=window.GRAMMAR||{topics:{},areas:[],comparisons:[]};
  window.SPEAKOUT=window.SPEAKOUT||[];
  window.VERB_IPA=window.VERB_IPA||{};
  window.VERB_IPA_CASE=window.VERB_IPA_CASE||{};
  const STORE='enquiz-session-cache-v2';
  const STATIC_STORE='english-static-speakout-v1';
  const SPEAK_STORE='english-speakout-materials-v1';
  const KEEP=/^(account:bootstrap|archive:|library:|cards:|irregular:|progress:|songs:list:|texts:list:|quizzes:after:|lesson:summary|speakout-lesson:|block:)/;
  function restore(){
    try{
      const saved=JSON.parse(sessionStorage.getItem(STORE)||'null');
      if(!saved||typeof saved!=='object')return;
      for(const [key,value] of Object.entries(saved))if(KEEP.test(key))memory.set(key,{value,at:Date.now()});
    }catch(e){try{sessionStorage.removeItem(STORE);}catch(err){}}
  }
  restore();
  try{
    for(const [key,value] of Object.entries(JSON.parse(localStorage.getItem(SPEAK_STORE)||'{}')))
      if(key.startsWith('speakout-lesson:'))memory.set(key,{value,at:Date.now()});
  }catch{}
  try {
    for(const [key,value] of Object.entries(JSON.parse(localStorage.getItem(STATIC_STORE)||'{}')))
      if(key.startsWith('speakout:'))memory.set(key,{value,at:Date.now()});
  } catch {}
  function persist(){
    const dump={};
    for(const [key,row] of memory)if(KEEP.test(key))dump[key]=row.value;
    try{sessionStorage.setItem(STORE,JSON.stringify(dump));}
    catch(e){for(const key of Object.keys(dump))if(key.endsWith(':dictionary'))delete dump[key];try{sessionStorage.setItem(STORE,JSON.stringify(dump));}catch(err){}}
  }
  let held=false;
  let persistPending=false;
  function persistSpeak(){
    const rows=[...memory].filter(([key])=>key.startsWith('speakout-lesson:')).slice(-64);
    try{localStorage.setItem(SPEAK_STORE,JSON.stringify(Object.fromEntries(rows.map(([key,row])=>[key,row.value]))));}catch{}
  }
  function schedulePersist(){
    if(persistPending)return;
    persistPending=true;
    idle(()=>{persistPending=false;persist();});
  }
  function remember(key,value){
    if(key.startsWith('speakout:')){
      const prefix=key.slice(0,key.lastIndexOf(':')+1);
      for(const old of memory.keys())if(old.startsWith(prefix)&&old!==key)memory.delete(old);
      memory.set(key,{value,at:Date.now()});
      const dump={};for(const [name,row] of memory)if(name.startsWith('speakout:'))dump[name]=row.value;
      try{localStorage.setItem(STATIC_STORE,JSON.stringify(dump));}catch{}
    }else memory.set(key,{value,at:Date.now()});
    if(key.startsWith('speakout-lesson:'))persistSpeak();
    if(KEEP.test(key))schedulePersist();return value;
  }
  window.ContentCache={
    get(key){return memory.has(key)?memory.get(key).value:undefined;},
    at(key){return memory.get(key)?.at||0;},
    has(key){return memory.has(key);},
    set:remember,
    hold(key,value){memory.set(key,{value,at:Date.now()});held=true;return value;},
    flush(){if(!held)return;held=false;persist();},
    drop(part){for(const key of new Set([...memory.keys(),...loads.keys()]))if(String(key).includes(part)){memory.delete(key);loads.delete(key);}persistSpeak();schedulePersist();},
    invalidate(prefix){for(const key of new Set([...memory.keys(),...loads.keys()]))if(String(key).startsWith(prefix)){memory.delete(key);loads.delete(key);}persistSpeak();schedulePersist();},
    clear(){memory.clear();loads.clear();try{sessionStorage.removeItem(STORE);localStorage.removeItem(SPEAK_STORE);}catch(e){}},
    load(key,fetcher){
      if(!memory.has(key)&&key.startsWith('speakout:')){
        try{const saved=JSON.parse(localStorage.getItem(STATIC_STORE)||'{}');if(Object.hasOwn(saved,key))memory.set(key,{value:saved[key],at:Date.now()});}catch{}
      }
      if(memory.has(key))return Promise.resolve(memory.get(key).value);
      if(loads.has(key))return loads.get(key);
      const job=Promise.resolve().then(fetcher).then(value=>{if(loads.get(key)===job){loads.delete(key);remember(key,value);}return value;},error=>{if(loads.get(key)===job)loads.delete(key);throw error;});
      loads.set(key,job);return job;
    }
  };
  function hydrate(value){
    if(Array.isArray(value))return value.map(hydrate).filter(row=>row!==null);
    if(value&&typeof value==='object'){
      if(Object.keys(value).length===1&&value.cardId){const card=cards.get(value.cardId);if(!card)throw new Error('Catalog card is missing. Reload the page.');return card.deleted?null:card;}
      return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,hydrate(item)]));
    }
    return value;
  }
  async function fetchPage(key,after){
    const limit=after?'50':'50';
    const response=await fetch('/api/catalogs/'+key+'?limit='+limit+(after?'&after='+encodeURIComponent(after):''),{cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Unable to load catalog. Reload the page.');
    const page=await response.json();
    if(page.next===after&&after)throw new Error('Catalog pagination did not advance.');
    Object.assign(documents,page.documents||{});
    for(const card of page.cards||[])cards.set(card.stageId,card);
    return page;
  }
  async function loadAll(key){
    let after='',pages=0;
    do{
      if(++pages>200)throw new Error('Catalog page limit reached.');
      after=(await fetchPage(key,after)).next;
    }while(after);
    return hydrate(documents[key]);
  }
  window.LearningCatalogPage=(key,after)=>window.ContentCache.load('catalog:'+key+':page:'+(after||'start'),()=>fetchPage(key,after||''));
  window.LearningLoadCatalog=key=>window.ContentCache.load('catalog:'+key,()=>loadAll(key));
  window.LearningHydrateCatalog=key=>hydrate(documents[key]);
  const pending=[],inflight=new Map();
  let active=0;
  const limit=2;
  function idle(fn){
    if(typeof requestIdleCallback==='function')requestIdleCallback(()=>fn(),{timeout:1500});
    else setTimeout(fn,40);
  }
  function pump(){
    pending.sort((a,b)=>a.priority-b.priority);
    while(active<limit&&pending.length){
      const task=pending.shift();
      active++;
      const job=Promise.resolve().then(task.run).then(()=>{active--;inflight.delete(task.id);idle(pump);},()=>{active--;inflight.delete(task.id);idle(pump);});
      inflight.set(task.id,job);
    }
  }
  window.PreloadQueue={
    limit,
    add(task){
      if(inflight.has(task.id))return inflight.get(task.id);
      const queued=pending.find(row=>row.id===task.id);
      if(queued){queued.priority=Math.min(queued.priority,task.priority);if(task.priority<=1)pump();return inflight.get(task.id)||Promise.resolve();}
      pending.push({id:task.id,priority:task.priority,run:task.run});
      if(task.priority<=1)pump();else idle(pump);
      return inflight.get(task.id)||Promise.resolve();
    },
    promote(id){const task=pending.find(row=>row.id===id);if(task)task.priority=0;pump();return inflight.get(id)||null;},
    active:()=>active,
    waiting:()=>pending.length
  };
  const scriptJobs=new Map();
  window.loadSiteScript=(src)=>{
    if(!src)return Promise.reject(new Error('Script URL missing.'));
    if(scriptJobs.has(src))return scriptJobs.get(src);
    const existing=[...document.scripts].find(node=>node.getAttribute('src')===src);
    if(existing){
      const job=existing.dataset.loaded==='1'?Promise.resolve():new Promise((resolve,reject)=>{existing.addEventListener('load',()=>{existing.dataset.loaded='1';resolve();},{once:true});existing.addEventListener('error',()=>reject(new Error('Unable to load '+src)),{once:true});});
      scriptJobs.set(src,job);return job;
    }
    const job=new Promise((resolve,reject)=>{
      const node=document.createElement('script');
      node.src=src;
      node.onload=()=>{node.dataset.loaded='1';resolve();};
      node.onerror=()=>{scriptJobs.delete(src);node.remove();reject(new Error('Unable to load '+src));};
      document.body.append(node);
    });
    scriptJobs.set(src,job);return job;
  };
  // Replaced by production builder with versioned URLs.
  window.ensureChatIcons=()=>window.loadSiteScript('/chat-icons.js');
  window.ensureMessages=()=>{
    if(window.MessagesReady)return Promise.resolve();
    return window.ensureChatIcons().then(()=>window.loadSiteScript('/messages.js')).then(()=>{window.MessagesReady=true;});
  };
  window.ensureMaterialQuiz=()=>window.loadSiteScript('/material-quiz.js');
  window.ensureColorPicker=()=>window.loadSiteScript('/color-picker.js');
  document.addEventListener('click',(event)=>{
    const open=event.target.closest?.('[data-jump="messages"],[data-msg-open],[data-user-settings]');
    if(!open||window.MessagesReady)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.ensureMessages().then(()=>open.click()).catch((error)=>window.LearningMain?.notice?.(error.message,true));
  },true);
  window.ensureChatIcons();
  const script=document.createElement('script');script.src='/preview.js?v=20261010-13';
  document.body.append(script);
  window.LearningCatalogReady=Promise.resolve();
})();
