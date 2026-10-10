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
  const KEEP=/^(account:bootstrap|library:|cards:|irregular:|progress:|songs:list:|texts:list:|quizzes:after:|lesson:summary|block:)/;
  function restore(){
    try{
      const saved=JSON.parse(sessionStorage.getItem(STORE)||'null');
      if(!saved||typeof saved!=='object')return;
      for(const [key,value] of Object.entries(saved))if(KEEP.test(key))memory.set(key,{value,at:Date.now()});
    }catch(e){try{sessionStorage.removeItem(STORE);}catch(err){}}
  }
  restore();
  function persist(){
    const dump={};
    for(const [key,row] of memory)if(KEEP.test(key))dump[key]=row.value;
    try{sessionStorage.setItem(STORE,JSON.stringify(dump));}
    catch(e){for(const key of Object.keys(dump))if(key.endsWith(':dictionary'))delete dump[key];try{sessionStorage.setItem(STORE,JSON.stringify(dump));}catch(err){}}
  }
  let held=false;
  function remember(key,value){memory.set(key,{value,at:Date.now()});if(KEEP.test(key))persist();return value;}
  window.ContentCache={
    get(key){return memory.has(key)?memory.get(key).value:undefined;},
    at(key){return memory.get(key)?.at||0;},
    has(key){return memory.has(key);},
    set:remember,
    hold(key,value){memory.set(key,{value,at:Date.now()});held=true;return value;},
    flush(){if(!held)return;held=false;persist();},
    drop(part){for(const key of [...memory.keys()])if(String(key).includes(part))memory.delete(key);persist();},
    invalidate(prefix){for(const key of [...memory.keys()])if(String(key).startsWith(prefix))memory.delete(key);persist();},
    clear(){memory.clear();try{sessionStorage.removeItem(STORE);}catch(e){}},
    load(key,fetcher){
      if(memory.has(key))return Promise.resolve(memory.get(key).value);
      if(loads.has(key))return loads.get(key);
      const job=Promise.resolve().then(fetcher).then(value=>{loads.delete(key);return remember(key,value);},error=>{loads.delete(key);throw error;});
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
  window.TursoCatalogPage=(key,after)=>window.ContentCache.load('catalog:'+key+':page:'+(after||'start'),()=>fetchPage(key,after||''));
  window.TursoLoadCatalog=key=>window.ContentCache.load('catalog:'+key,()=>loadAll(key));
  window.TursoHydrateCatalog=key=>hydrate(documents[key]);
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
      const job=Promise.resolve().then(task.run).then(()=>{active--;inflight.delete(task.id);pump();},()=>{active--;inflight.delete(task.id);pump();});
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
  const script=document.createElement('script');script.src='/preview.js';
  document.body.append(script);
  window.TursoCatalogReady=Promise.resolve();
})();
