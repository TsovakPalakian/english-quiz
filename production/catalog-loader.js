// Small public pages, bounded concurrency, no D1/auth calls. Initialize the
// original interface only after its compact catalogs are ready.
(() => {
  const documents={},cards=new Map(),tasks=['LESSON_DATA','IRREGULAR','GRAMMAR','SPEAKOUT'],loads=new Map();
  async function load(key){
    let after='',pages=0;
    do{
      if(++pages>200)throw new Error('Catalog page limit reached.');
      const response=await fetch('/api/catalogs/'+key+(after?'?after='+encodeURIComponent(after):''),{cache:'no-store',signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error('Unable to load catalog. Reload the page.');
      const page=await response.json();Object.assign(documents,page.documents);
      for(const card of page.cards)cards.set(card.stageId,card);
      if(page.next===after&&after)throw new Error('Catalog pagination did not advance.');
      after=page.next;
    }while(after);
  }
  function hydrate(value){
    if(Array.isArray(value))return value.map(hydrate).filter(row=>row!==null);
    if(value&&typeof value==='object'){
      if(Object.keys(value).length===1&&value.cardId){const card=cards.get(value.cardId);if(!card)throw new Error('Catalog card is missing. Reload the page.');return card.deleted?null:card;}
      return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,hydrate(item)]));
    }
    return value;
  }
  async function worker(){while(tasks.length)await load(tasks.shift());}
  window.TursoLoadCatalog=key=>{
    if(!loads.has(key))loads.set(key,load(key).then(()=>hydrate(documents[key])).catch(error=>{loads.delete(key);throw error;}));
    return loads.get(key);
  };
  const ready=Promise.all([worker(),worker()]).then(()=>{
    for(const [key,value] of Object.entries(documents))window[key]=hydrate(value);
    window.TursoMain.register([window.LESSON_DATA,window.IRREGULAR,window.GRAMMAR,window.SPEAKOUT]);
    const script=document.createElement('script');script.src='/preview.js';
    return new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(new Error('Unable to load the interface. Reload the page.'));document.body.append(script);});
  }).catch(error=>{
    const banner=document.getElementById('turso-main-banner'),status=document.getElementById('turso-main-status');
    if(status)status.textContent=error.message;if(banner)banner.hidden=false;
  });
  window.TursoCatalogReady=ready;
})();
