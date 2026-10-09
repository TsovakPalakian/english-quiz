// App-private hooks appended to the isolated copy of preview.js.
let stageTenseLoading=null;
function stageEnsureTenseBank(){
  if(tenseBankReady)return Promise.resolve(tenseBank);
  if(!stageTenseLoading)stageTenseLoading=(window.TursoLoadCatalog?window.TursoLoadCatalog('TENSE_BANK'):
    fetch('tense-bank.json').then(response=>{if(!response.ok)throw new Error('Unable to load tense examples.');return response.json();}))
    .then(data=>{tenseBank=data||{};tenseBankReady=true;return tenseBank;})
    .catch(error=>{stageTenseLoading=null;throw error;});
  return stageTenseLoading;
}
function stageLoadTenseView(section,id){
  const generation=viewGen;
  const active=()=>generation===viewGen&&document.querySelector('section.on')?.id===section&&(section==='tense'?openTenseId===id:openMarkerName===id);
  return stageEnsureTenseBank().then(()=>{if(active()){if(section==='tense')openTopic(id,true);else openMarker(id,true);}})
    .catch(error=>{if(active())window.TursoMain.notice(error.message,true);});
}
let stagePdfModule=null,stagePdfTask=null,stagePdfJob=0;
function stageExternalKind(value){
  let url;try{url=new URL(String(value||''));}catch{return {kind:'',href:''};}
  if(url.protocol!=='https:'||url.username||url.password||url.port)return {kind:'',href:''};
  const src=stageEmbedSource(url.href);
  return src?{kind:'video-embed',href:url.href,src}:{kind:'page',href:url.href,src:url.href};
}
function stageExternalPlayer(value,label){
  const media=stageExternalKind(value);if(!media.href)return '';
  if(!media.src||media.kind!=='video-embed')return openLink('Open '+label.toLowerCase(),media.href);
  let src=media.src;
  const youtube=/youtube(?:-nocookie)?\.com/i.test(src);
  if(youtube)src+=(src.includes('?')?'&':'?')+'origin='+encodeURIComponent(location.origin);
  const frame='<iframe class="player tall"'+(youtube?' id="'+esc('yt'+embedSerial())+'"':'')+' src="'+esc(src)+'" title="'+esc(label)+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>';
  return songPlayerHtml(label==='Music'?'music':'video','<p class="label">'+esc(label)+'</p>'+frame);
}
let stageDictionaryToken=0;
function stageShowCard(id){
  const here=(typeof document!=='undefined'&&document.querySelector)?(document.querySelector('section.on')||{}).id:'';
  if(here!==id&&typeof pushHistory==='function')pushHistory();
  if(typeof show==='function')show(id);
}
async function stageHydrateCatalogWord(card){
  current=card;const token=++stageDictionaryToken,generation=viewGen;
  const box=document.getElementById('wordView');
  stageShowCard('word');
  const still=()=>token===stageDictionaryToken&&generation===viewGen&&document.querySelector('section.on')?.id==='word';
  try{
    const saved=stageReadBlock(card.stageId,'dictionary');
    if(saved&&saved.data&&typeof saved.data==='object'){
      Object.assign(card,saved.data,{stageDataDeferred:false});
      renderWord(card);
      if((saved.revision||0)>=(card.stageRevision||0))return;
    }else if(box)box.textContent='Loading card…';
    const full=await window.TursoMain.catalogDictionary(card);
    if(!still())return;
    if(full&&typeof full==='object')Object.assign(card,full,{stageDataDeferred:false});
    stageWriteBlock(card.stageId,'dictionary',card.stageRevision||0,card);stageFlushBlocks();window.TursoMain.register(card);renderWord(card);
  }catch(error){if(still()){card.stageDataDeferred=false;try{renderWord(card);}catch(e){if(box)box.textContent=error.message;}window.TursoMain.notice(error.message,true);}}
}
async function stageHydrateMade(item){
  const token=++stageDictionaryToken,generation=viewGen,target=(typeof viewAccount!=='undefined'&&viewAccount?.id)||'',actor=authUser?.id||'';
  const box=document.getElementById('madeView');
  stageShowCard('made');
  const still=()=>token===stageDictionaryToken&&generation===viewGen&&document.querySelector('section.on')?.id==='made';
  const paint=full=>{
    if(!still())return;
    const ready={...item,...(full&&typeof full==='object'?full:{}),word:(full&&(full.en||full.word))||item.word||item.en||'',stageDataDeferred:false};
    try{
      if(typeof loadAdded==='function'&&ready.stageId){
        const rows=loadAdded();let changed=false;
        for(let i=0;i<rows.length;i++)if(rows[i].stageId===ready.stageId){rows[i]={...rows[i],...ready,place:rows[i].place||ready.place};changed=true;}
        if(changed&&typeof rememberAdded==='function')rememberAdded(rows);
      }
      if(ready.stageId){stageWriteBlock(ready.stageId,'dictionary',ready.stageRevision||item.stageRevision||0,ready);stageFlushBlocks();}
      window.TursoMain?.register?.(ready);
    }catch(e){}
    renderMade(ready);
  };
  try{
    const saved=stageReadBlock(item.stageId,'dictionary');
    if(saved&&saved.data&&typeof saved.data==='object'){paint(saved.data);if((saved.revision||0)>=(item.stageRevision||0))return;}
    if(!item.stagePublicCatalog&&(!authUser||!accountReady||viewSwitching)){paint(item);return;}
    if(box&&!(saved&&saved.data))box.textContent='Loading saved dictionary…';
    const full=await (item.stagePublicCatalog?window.TursoMain.catalogDictionary(item):window.TursoMain.dictionary(item,target));
    if(!still()||actor!==(authUser?.id||'')||target!==((typeof viewAccount!=='undefined'&&viewAccount?.id)||''))return;
    if(!full||(full.stageId&&item.stageId&&full.stageId!==item.stageId))throw new Error('Dictionary changed. Reload the profile before opening it.');
    paint(full);
  }catch(error){if(still()){paint(item);window.TursoMain?.notice?.(error.message,true);}}
}
const stageLessonLoads=new Map();
const stageLoadedLessons=new WeakSet();
let stageLessonOpenToken=0;
async function stagePullLessons(){
  if(!authUser||viewSwitching)return;
  const generation=viewGen,target=viewAccount?.id||'',actor=authUser.id;
  const path=target?'/api/admin/users/'+encodeURIComponent(target)+'/lessons':'/api/lessons';
  try{
    const data=await accountFetch(path+'?summary=1');
    if(generation!==viewGen||target!==(viewAccount?.id||'')||actor!==authUser?.id||viewSwitching)return;
    // Keep an open editor/draft, but only within the same profile and revision.
    const old=new Map((lmLibrary?.materials||[]).map(row=>[row.id,row]));
    const next=(data.materials||[]).map(row=>{
      const previous=old.get(row.id);
      return previous&&stageLoadedLessons.has(previous)&&!previous.stageLessonDeferred&&previous.stageLessonOwner===actor+':'+target&&previous.stageRevision===row.stageRevision?previous:{...row,stageLessonOwner:actor+':'+target};
    });
    const seen=new Set(next.map(row=>row&&row.id).filter(Boolean));
    const drafts=[];
    for(const row of lmLibrary?.materials||[]){
      if(row&&row.id&&!row.stageRevision&&typeof lmIsDemoId==='function'&&!lmIsDemoId(row.id)&&!seen.has(row.id)){drafts.push(row);seen.add(row.id);}
    }
    if(lmState&&lmState.id&&!lmState.stageRevision&&typeof lmIsDemoId==='function'&&!lmIsDemoId(lmState.id)&&!seen.has(lmState.id))drafts.unshift(lmState);
    lmServerReady=true;lmApplyRemote(drafts.concat(next),{push:false});
  }catch(error){if(generation===viewGen)window.TursoMain.notice(error.message,true);}
}
async function stageOpenLesson(material){
  if(!authUser||!accountReady||viewSwitching||!lmLessonVisibleToViewer(material))return;
  const generation=viewGen,target=viewAccount?.id||'',actor=authUser.id,token=++stageLessonOpenToken,section=document.querySelector('section.on')?.id;
  const key=actor+':'+target+':'+generation+':'+material.id+':'+material.stageRevision;
  const path=target?'/api/admin/users/'+encodeURIComponent(target)+'/lessons':'/api/lessons';
  const savedLesson=stageReadBlock(material.id,'blocks');
  if(savedLesson&&savedLesson.revision===(material.stageRevision||0)){
    const at=lmLibrary.materials.findIndex(row=>row===material);
    if(at>=0){const opened={...material,blocks:savedLesson.data?.blocks||[],stageLessonDeferred:false,stageLessonOwner:actor+':'+target};stageStampLesson(opened);lmLibrary.materials[at]=opened;stageLoadedLessons.add(opened);lmOpenLesson(material.id);return;}
  }
  const root=document.getElementById('material');if(root)root.inert=true;
  try{
    const cacheKey='lesson:'+actor+':'+target+':'+material.id+':'+material.stageRevision;
    if(!stageLessonLoads.has(key))stageLessonLoads.set(key,window.ContentCache?.load?window.ContentCache.load(cacheKey,()=>accountFetch(path+'?id='+encodeURIComponent(material.id))):accountFetch(path+'?id='+encodeURIComponent(material.id)));
    const data=await stageLessonLoads.get(key);
    if(token!==stageLessonOpenToken||generation!==viewGen||target!==(viewAccount?.id||'')||actor!==authUser?.id||viewSwitching||section!==document.querySelector('section.on')?.id)return;
    const full=data.materials?.find(row=>row.id===material.id);if(!full)throw new Error('Lesson not found.');
    const index=lmLibrary.materials.findIndex(row=>row===material);if(index<0)return;
    const extras=(material.blocks||[]).filter(b=>b&&b.id&&!(full.blocks||[]).some(row=>row.id===b.id));
    const blocks=extras.length?[...(full.blocks||[]),...extras]:full.blocks;
    const opened={...full,blocks,stageLessonDeferred:false,stageLessonOwner:actor+':'+target};
    stageStampLesson(opened);
    lmLibrary.materials[index]=opened;
    stageLoadedLessons.add(opened);
    stageWriteBlock(material.id,'blocks',full.stageRevision||material.stageRevision||0,{blocks});stageFlushBlocks();
    lmOpenLesson(material.id);
  }catch(error){if(token===stageLessonOpenToken&&generation===viewGen){window.TursoMain.notice(error.message,true);const note=document.getElementById('lmNote');if(note)note.innerHTML=esc(error.message)+' <button class="btn" type="button" data-stage-retry="lesson" data-lesson-id="'+esc(material.id)+'">Retry</button>';}}
  finally{stageLessonLoads.delete(key);if(root&&token===stageLessonOpenToken)root.inert=false;}
}
function stageStatsIntro(){
  for(const id of ['statsRole','statsUser']){const field=document.getElementById(id);if(field){field.hidden=true;field.value='';}}
  const sub=document.getElementById('statsSub');
  if(sub)sub.textContent=(viewAccount?'Selected student: ':'Your study: ')+'new Turso activity only. Dates are UTC. Legacy history is not combined.';
  if(viewAccount)return;
  if(typeof window==='undefined'||!window.TursoMain?.capabilities?.().legacyHistory||!sub)return;
  sub.textContent='New Turso activity and legacy R2 archive are separate reports. Dates are UTC; totals are not combined.';
  for(const [id,label,all] of [['stageHistoryOwn','Legacy: my history',false],...(isDeveloper()?[['stageHistoryAll','Legacy: administrative history',true]]:[])]){
    if(document.getElementById(id))continue;
    const button=document.createElement('button');button.id=id;button.type='button';button.className='btn ghost';button.textContent=label;
    button.onclick=()=>stageStatsHistory(all);sub.insertAdjacentElement('afterend',button);
  }
}
async function stagePaintStats(){
  const box=document.getElementById('statsBody');if(!box)return;
  stageStatsIntro();if(!document.getElementById('statsFrom').value)statsShift(30);
  const token=++statsToken,generation=viewGen,target=viewAccount?.id||'';
  if(!authUser||!accountReady||viewSwitching){box.textContent='Sign in and wait for the profile to load.';return;}
  box.textContent='Loading Turso activity…';
  const params=new URLSearchParams({from:document.getElementById('statsFrom').value,to:document.getElementById('statsTo').value});
  try{
    const path=target?'/api/admin/users/'+encodeURIComponent(target)+'/stats':'/api/stats';
    const data=await accountFetch(path+'?'+params);
    if(token!==statsToken||generation!==viewGen||target!==(viewAccount?.id||''))return;
    if(data.statisticsSource!=='turso-activity'||data.legacyHistoryIncluded!==false)throw new Error('Unverified statistics source.');
    box.innerHTML='<p class="hint">New Turso activity only; client-reported study, not certified exam results.</p>'+renderStats(data,document.getElementById('statsCompare').checked);
  }catch(error){if(token===statsToken&&generation===viewGen)box.textContent=error.message;}
}
async function stageStatsHistory(all){
  if(!stageOwnReady()||!window.TursoMain.capabilities().legacyHistory)return;
  const token=++statsToken,box=document.getElementById('statsBody');if(!box)return;
  box.textContent='Loading read-only archive…';
  const params=new URLSearchParams({from:document.getElementById('statsFrom').value,to:document.getElementById('statsTo').value});
  if(all)params.set('scope','all');
  try{
    const data=await accountFetch('/api/stats/history?'+params.toString());if(token!==statsToken)return;
    if(data.historySource!=='legacy-r2-readonly'||data.combinedWithNewActivity!==false)throw new Error('Unverified archive source.');
    box.innerHTML='<p class="hint">Legacy R2 archive — read only; not combined with new Turso activity.</p>'+renderStats(data,document.getElementById('statsCompare').checked);
  }catch(error){if(token===statsToken)box.textContent=error.message;}
}
async function stageLoadPdf(){
  if(!stagePdfModule)stagePdfModule=import('/pdfjs/pdf.mjs').then(lib=>{
    lib.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.mjs';return lib;
  }).catch(error=>{stagePdfModule=null;throw error;});
  return stagePdfModule;
}
async function stageOpenPdf(href,title){
  // The isolated stage forbids CDN scripts. Renderer, worker, maps and fonts
  // are pinned same-origin assets; a direct-file fallback remains available.
  let url;
  try{
    url=new URL(href,location.origin);
    if(url.origin!==location.origin || url.username || url.password || url.hash)throw new Error();
    const localPdf=/^\/pdf\/[A-Za-z0-9._-]+\.pdf$/.test(url.pathname)&&!url.search;
    const keys=[...url.searchParams.keys()];
    const managedPdf=keys.length===2&&keys.includes('id')&&keys.includes('for')&&url.searchParams.get('for')===viewAccount?.id;
    const lessonPdf=url.pathname==='/api/lesson-file'&&(keys.length===1&&keys[0]==='id'||managedPdf)&&/^[A-Za-z0-9_-]{1,100}$/.test(url.searchParams.get('id')||'');
    if(!localPdf&&!lessonPdf)throw new Error();
  }catch{window.TursoMain.notice('Недопустимый адрес PDF. Файл не открыт.',true);return;}
  const heading=document.getElementById('pdfTitle'),status=document.getElementById('pdfStatus'),box=document.getElementById('pdfPages');
  if(!heading||!status||!box)return;
  const name=String(title||'PDF');heading.textContent=name;status.textContent='Opening…';
  box.replaceChildren();
  const link=document.createElement('a');link.href=url.pathname+url.search;link.textContent='Open PDF file';
  link.target='_blank';link.rel='noopener noreferrer';
  box.append(link);visit('pdfview');
  const job=++stagePdfJob;
  if(stagePdfTask){void stagePdfTask.destroy().catch(()=>{});stagePdfTask=null;}
  try{
    const lib=await stageLoadPdf();if(job!==stagePdfJob)return;
    const task=lib.getDocument({url:link.href,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,
      standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',
      isEvalSupported:false,useWasm:false,disableFontFace:true,enableXfa:false});
    stagePdfTask=task;const doc=await task.promise;if(job!==stagePdfJob)return;
    const count=Math.min(doc.numPages,30),width=Math.max(280,Math.min(1200,box.clientWidth||640));
    status.textContent=doc.numPages===1?'1 page':doc.numPages+' pages'+(count<doc.numPages?' · preview: first 30 pages':'');
    for(let i=1;i<=count;i++){
      const page=await doc.getPage(i);if(job!==stagePdfJob)return;
      const base=page.getViewport({scale:1});
      if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||base.width<=0||base.height<=0)throw new Error('Invalid PDF page size');
      const viewport=page.getViewport({scale:Math.min(width/base.width,2000/base.height)});
      const canvas=document.createElement('canvas');canvas.className='pdf-page';canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
      box.append(canvas);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;page.cleanup();
    }
  }catch(error){if(job===stagePdfJob)status.textContent='Preview unavailable. Use Open PDF file.';}
}
function stageQuizMap(value){
  if(!value || typeof value!=='object' || Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([word,list])=>word.trim() && Array.isArray(list)).map(([word,list])=>[
    word.trim().toLowerCase(),list.filter(q=>q && typeof q==='object' && !Array.isArray(q)).map((q,index)=>({
      ...q,id:String(q.id||cardQuizStableId(word,q,index)).slice(0,100)
    }))
  ]));
}
function stageHostCard(host){
  const kind=host.dataset.editKind,id=host.dataset.editId;
  if(kind==='added')return loadAdded()[Number(id)]||null;
  if(kind==='made')return madeItem||null;
  return findCatalog(id);
}
function stageCanEditTranslation(card){
  if(canEditLessons())return true;
  if(!card||!card.stageId||card.stageScope!=='profile')return false;
  if(viewAccount)return !!(authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching);
  return !!(authUser&&accountReady&&!viewSwitching);
}
function stageCanManageAdded(card){
  return !!(card&&viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching);
}
function stageAddedActions(item){
  return typeof editActions==='function'?editActions():'<span class="edit-actions"><button class="icon-btn" type="button" data-edit-toggle aria-label="Edit"></button><button class="icon-btn" type="button" data-card-delete aria-label="Delete"></button></span>';
}
function stageAddedEditHtml(item){
  const index=addedIndexOf(item);
  if(index<0 || !canEditAdded(item))return '';
  return '<div data-edit-host class="card-edit" data-edit-kind="added" data-edit-id="'+index+'">'+stageAddedActions(item)+'</div>';
}
function stageAddedRow(item,index){
  const main='<button class="path" type="button" data-added="'+index+'"><b>'+esc(item.word)+'</b><span class="to">'+esc(item.ru)+'</span></button>';
  return canEditAdded(item)?'<div data-edit-host data-edit-kind="added" data-edit-id="'+index+'"><div class="edit-line">'+main+stageAddedActions(item)+'</div></div>':main;
}
function stageStampLinks(list,revision){stageListEpoch.cards++;for(const item of list)item.stageLinksRevision=revision;stageSettled.mine=true;rememberAdded(list);window.ContentCache?.drop('cards:personal');paintAdded();paintAllWords();stagePaintCounts();if(typeof paintHomeStats==='function')paintHomeStats();}
function stageEnsureAddGroup(){
  // Selecting a local navigation group is safe before accountReady flips;
  // stageSaveWord still refuses writes until the server profile has loaded.
  if(authUser && (!viewAccount||['ADMIN','DEVELOPER'].includes(authUser.role)) && !viewSwitching && !addGroup && !loadAdded().length)addGroup='My words';
}
if(typeof renderAddedList==='function'){
  const stageOriginalRenderAddedList=renderAddedList;
  renderAddedList=function(){stageEnsureAddGroup();return stageOriginalRenderAddedList();};
}
function stageSaveWord(place,input,status,button,openCard){
  const managed=!!(viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role));
  if(!authUser || !accountReady || viewSwitching || viewAccount&&!managed){window.TursoMain.notice('Дождитесь загрузки разрешённого профиля.',true);return Promise.resolve();}
  const accountId=viewAccount?.id||'',generation=typeof viewGen==='number'?viewGen:0;
  const word=input.value.trim();if(!word){status.textContent='Введите слово или выражение.';return Promise.resolve();}
  const missing='В тестовой Turso такой карточки нет. Создание новых слов и внешний словарь пока не подключены.';
  return window.TursoMain.perform(async()=>{
    let card=null;
    try{card=await window.TursoMain.findCard(word);}catch(error){if(error.message!==missing)throw error;}
    if(generation!==(typeof viewGen==='number'?viewGen:0)||accountId!==(viewAccount?.id||''))return;
    let result;
    if(card){
      if(loadAdded().some(row=>row.stageId===card.id&&(row.place||'mine')===place))throw new Error('Эта карточка уже добавлена на страницу.');
      result=managed?await window.TursoMain.linkManagedCard(accountId,card,place):await window.TursoMain.linkCard(card,place);
    }else{
      const data=await accountFetch('/lookup?word='+encodeURIComponent(word));
      const en=String(data&&data.word||word).trim(),ru=String(data&&data.ru||'').trim();
      if(!data||!data.found||!en||!ru)throw new Error('No translation came back for this word.');
      if(loadAdded().some(row=>(row.place||'mine')===place&&String(row.word||row.en||'').toLowerCase()===en.toLowerCase()))throw new Error('Эта карточка уже добавлена на страницу.');
      const id='own_'+crypto.randomUUID();
      result=managed?await window.TursoMain.newManagedCard(accountId,id,en,ru,place):await window.TursoMain.newCard(id,en,ru,place);
      result={...result,card:{...result.card,word:en,ru,place:result.card.place||place,data}};
    }
    if(generation!==(typeof viewGen==='number'?viewGen:0)||accountId!==(viewAccount?.id||''))return;
    const list=loadAdded();list.unshift(result.card);stageStampLinks(list,result.revision);if(!managed)trackEvent('card',place,'add');
    input.value='';if(openCard)renderMade(result.card);
  },status);
}
let stageNewCardId='',stageTextDraft=null,stageSongDraft=null;
const stageMadeAttempts=new Map();
function stageMadeAnswer(type,key,ok,value){
  if(!stageOwnReady())return;
  const signature=JSON.stringify([madeItem?.stageId||madeItem?.word||'',type,key,value]);
  if(stageMadeAttempts.get(type+'|'+key)===signature)return;
  stageMadeAttempts.set(type+'|'+key,signature);trackEvent('answer',type,ok?'ok':'miss');
}
let stageActivity={tracked:false,seconds:0,examPass:0},stageTimeAt=0,stageTimeSeconds=0,stageProgressEpoch=0,stageListEpoch={cards:0,songs:0,texts:0,quizzes:0};
function stageSetActivity(value){stageActivity=value||{tracked:false,seconds:0,examPass:0};stagePaintActivity();}
function stagePaintActivity(){
  const time=document.querySelector('#homeDemo .overview > div:nth-child(1) b'),exams=document.querySelector('#homeDemo .overview > div:nth-child(2) b');
  if(time){time.textContent=stageActivity.tracked?Math.floor(stageActivity.seconds/60)+' min':'—';time.title='Только подтверждённое время в тестовой Turso; прежняя история не включена.';}
  if(exams){exams.textContent=stageActivity.tracked?String(stageActivity.examPass):'—';exams.title='Клиентская учебная статистика, не сертифицированный экзамен.';}
}
function stageRecordTime(flush=false){
  if(!stageOwnReady()){stageTimeAt=0;stageTimeSeconds=0;return;}
  const now=Date.now(),section=document.querySelector('section.on');
  if(stageTimeAt)stageTimeSeconds+=Math.max(0,Math.min(60,Math.floor((now-stageTimeAt)/1000)));
  stageTimeAt=['word','made','dayq','daychoice','dayflip','dayjudge','material','textread','song','musicword'].includes(section?.id)&&!document.hidden?now:0;
  if(stageTimeSeconds>=300||flush&&stageTimeSeconds>0){
    const seconds=Math.min(300,stageTimeSeconds);
    try{window.TursoMain.event('duration','study','',seconds);stageTimeSeconds-=seconds;}catch(error){window.TursoMain.notice(error.message,true);}
  }
}
for(const name of ['pointerdown','keydown'])document.addEventListener(name,()=>stageRecordTime(),true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stageRecordTime(true);});
if(typeof setInterval==='function')setInterval(()=>stageRecordTime(),15000);
function stageOwnReady(){return !!(authUser&&accountReady&&!viewAccount&&!viewSwitching);}
function stageInstallLibrary(item,kind){
  stageListEpoch[kind==='text'?'texts':'songs']++;
  const list=kind==='text'?loadTexts():loadSongs(),at=list.findIndex(row=>row.id===item.id);
  if(at<0){list.unshift(item);const boot=window.ContentCache?.get('account:bootstrap');if(boot?.counts){boot.counts[kind==='text'?'texts':'songs']+=1;stagePaintCounts(boot.counts);}}
  else {
    if(kind==='song'){
      const prev=list[at];
      if(!item.fileName&&prev.fileName)item.fileName=prev.fileName;
      if(!item.fileType&&prev.fileType)item.fileType=prev.fileType;
      if(!item.stageLocalMedia&&prev.stageLocalMedia)item.stageLocalMedia=true;
    }
    list[at]=item;
  }
  if(item.stageId){window.ContentCache?.set(stageItemKey(kind,item.stageId),{item});stageStoreLibraryBlocks(item,kind);stageFlushBlocks();}
  stageSettled[kind==='text'?'texts':'songs']=true;
  window.ContentCache?.drop(kind==='text'?'texts:list':'songs:list');
  if(kind==='text'){localStorage.setItem(TEXT_KEY,JSON.stringify(list));paintTextCount();}
  else{writeSongs(list);paintLyrics();}
  stagePaintCounts();
}
async function stageRunTextAnalysis(item,status){
  if(!item?.text)return;
  const generation=viewGen;
  let result;
  try{result=await accountFetch('/api/analyze',{method:'POST',body:JSON.stringify({text:item.text,contentType:'TEXT'})});}
  catch(error){if(status)status.textContent=error.message||'Analysis service temporarily unavailable.';return;}
  if(generation!==viewGen)return;
  const analysis={expressions:(typeof uniqueExpressions==='function'?uniqueExpressions(result.expressions||[]):(result.expressions||[])),stats:result.stats||null,at:new Date().toISOString()};
  const list=loadTexts();
  const saved=list.find(row=>row.id===item.id);
  if(!saved)return;
  try{
    if(saved.stageId&&saved.stageScope==='profile'){
      const managed=!!(viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching);
      if(managed||stageOwnReady()){
        const stored=managed?await window.TursoMain.saveManagedText(viewAccount.id,saved,{analysis}):await window.TursoMain.saveLibrary(saved,'text',{analysis});
        if(generation!==viewGen)return;
        if(stored?.item)Object.assign(saved,stored.item);
        if(stored?.revision)saved.stageRevision=stored.revision;
      }
    }
    saved.analysis=analysis;
    localStorage.setItem(TEXT_KEY,JSON.stringify(list));
    paintTextCount();
    if(status)status.textContent=(result.expressions||[]).length+' expressions.';
    showText(saved.id);
  }catch(error){if(status)status.textContent=error.message||'Analysis service temporarily unavailable.';}
}
function stageStoreText(analyze){
  const managed=!!(viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching);
  if(!stageOwnReady()&&!managed){window.TursoMain.notice('Дождитесь загрузки профиля.',true);return;}
  const accountId=viewAccount?.id||'',generation=viewGen;
  const title=document.getElementById('textTitle').value.trim(),text=document.getElementById('textBody').value.replace(/\r\n/g,'\n').trim();
  const item=loadTexts().find(row=>row.id===openTextId)|| (stageTextDraft ||= {id:'text_'+crypto.randomUUID()});
  if(managed&&item.stageId&&item.stageScope!=='profile'){window.TursoMain.notice('Общие тексты нельзя менять в личном профиле.',true);return;}
  return window.TursoMain.perform(async()=>{
    const result=managed?await window.TursoMain.saveManagedText(accountId,item,{title,text}):await window.TursoMain.saveLibrary(item,'text',{title,text});
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    stageInstallLibrary(result.item,'text');openTextId=result.item.id;stageTextDraft=null;showText(openTextId);
    if(analyze)await stageRunTextAnalysis(result.item,document.getElementById('textReadStatus'));
  },document.getElementById('textStatus'));
}
function stageStoreSong(existingId){
  const managed=stageManagedSongReady();
  if(!stageOwnReady()&&!managed){window.TursoMain.notice('Дождитесь загрузки разрешённого профиля.',true);return;}
  const accountId=viewAccount?.id||'',generation=viewGen;
  const item=existingId?loadSongs().find(row=>row.id===existingId):(stageSongDraft ||= {id:'song_'+crypto.randomUUID()});
  if(!item)return;
  const changes=existingId?{lyrics:document.querySelector('#songUser [data-lyric-draft]').value}
    :{title:document.getElementById('lyricTitle').value.trim(),artist:document.getElementById('lyricArtist').value.trim(),lyrics:document.getElementById('lyricText').value,
      videoUrl:document.getElementById('lyricVideo').value.trim(),musicUrl:document.getElementById('lyricMusic').value.trim()};
  const file=!managed&&(existingId?pendingEditFile:pendingLyricFile);
  return window.TursoMain.perform(async()=>{
    const result=managed?await window.TursoMain.saveManagedLibrary(accountId,item,'song',changes):await window.TursoMain.saveLibrary(item,'song',changes);
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    let saved=result.item;
    if(file){
      const uploaded=await stageUploadSongFile(saved,file,existingId);
      saved=uploaded.item||saved;
      if(existingId){pendingEditFile=null;editFileSent=true;}
      else{pendingLyricFile=null;lyricFileSent=true;}
    }
    stageInstallLibrary(saved,'song');stageSongDraft=null;if(!existingId&&!managed)trackEvent('song','lyrics','add');
    renderUserSong(saved);show('song');
    if(typeof accountFetch==='function')await stageAnalyzeSong(saved,existingId?document.querySelector('#songUser [data-lyric-edit-status]'):document.getElementById('lyricStatus'));
  },existingId?document.querySelector('#songUser [data-lyric-edit-status]'):document.getElementById('lyricStatus'));
}
async function stageKeepExpression(card){
  const word=String(card.word||'').trim();
  const place=['phrasal','idioms','mine','music'].includes(card.place)?card.place:'mine';
  if(!word||cardIndex().has(word.toLowerCase()))return false;
  const managed=stageManagedSongReady();
  const accountId=viewAccount?.id||'';
  try{
    const found=await window.TursoMain.findCard(word);
    if(loadAdded().some(row=>row.stageId===found.id&&(row.place||'mine')===place))return false;
    const linked=managed?await window.TursoMain.linkManagedCard(accountId,found,place):await window.TursoMain.linkCard(found,place);
    const list=loadAdded();list.unshift(linked.card);stageStampLinks(list,linked.revision);return true;
  }catch{
    const ru=String(card.ru||'').trim();
    if(!ru)return false;
    const id='expr_'+crypto.randomUUID();
    const created=managed?await window.TursoMain.newManagedCard(accountId,id,word,ru,place):await window.TursoMain.newCard(id,word,ru,place);
    const list=loadAdded();list.unshift(created.card);stageStampLinks(list,created.revision);return true;
  }
}
function stageLyricRu(data){
  const cam=data&&data.cambridge||{},wh=data&&data.wooordhunt||{};
  return String((data&&data.ru)||cam.definition||wh.gloss||wh.verbGloss||(data&&data.englishClub&&data.englishClub.meaning)||(data&&data.englishAtHome&&data.englishAtHome.meaning)||'').trim();
}
async function stageMarkLyricWords(song,marks,write){
  const seen=new Set(),keys=[];
  (typeof lyricTokens==='function'?lyricTokens(song.lyrics||''):[]).forEach(key=>{
    if(!key||seen.has(key))return;
    seen.add(key);keys.push(key);
  });
  const todo=[];
  keys.forEach(key=>{
    if(typeof cardIndex==='function'&&cardIndex().has(key)){
      if(!marks[key]||marks[key].state==='miss'||marks[key].state==='error')marks[key]={state:'have',word:key};
      return;
    }
    todo.push(key);
  });
  let cursor=0,done=0;
  async function worker(){
    while(cursor<todo.length){
      const key=todo[cursor++];
      write('Checked '+(++done)+' of '+todo.length+' new words…',false);
      try{
        const data=typeof lookupLyricWord==='function'?await lookupLyricWord(key,typeof lyricLine==='function'?lyricLine(song.lyrics||'',key):'',25000):null;
        const ru=stageLyricRu(data);
        if(!data||!ru){marks[key]={state:'miss'};continue;}
        const added=await stageKeepExpression({word:key,ru,place:'music'});
        if(added)marks[key]={state:'new',word:key};
        else if(typeof cardIndex==='function'&&cardIndex().has(key))marks[key]={state:'have',word:key};
        else marks[key]={state:'miss'};
      }catch{marks[key]={state:'error'};}
    }
  }
  if(todo.length){
    write('Looking up '+todo.length+' new words…',false);
    await Promise.all(Array.from({length:Math.min(3,todo.length)},worker));
  }
  return keys;
}
async function stageAnalyzeSong(song,status){
  const write=(text,bad)=>{if(!status)return;status.textContent=text;status.classList.toggle('bad',!!bad);};
  const finish=(text,bad)=>setTimeout(()=>{
    const live=document.querySelector('#songUser [data-lyric-check]')||status;
    if(!live)return;live.textContent=text;live.classList.toggle('bad',!!bad);
  },0);
  write('Reading the lyrics…',false);
  const marks={...(song.marks||{})};
  const keys=await stageMarkLyricWords(song,marks,write);
  const storeMarks=async()=>{
    if(!song.stageId||!Object.keys(marks).length)return;
    const managed=stageManagedSongReady();
    const saved=managed?await window.TursoMain.saveManagedLibrary(viewAccount.id,song,'song',{marks}):await window.TursoMain.saveLibrary(song,'song',{marks});
    const next=saved&&saved.item?saved.item:{...song,marks};
    stageInstallLibrary(next,'song');renderUserSong(next);
  };
  let analyzed;
  try{analyzed=await accountFetch('/api/analyze',{method:'POST',body:JSON.stringify({text:song.lyrics,contentType:'LYRICS'})});}
  catch(error){await storeMarks();finish(error.message||'Analysis service temporarily unavailable.',true);return;}
  const expressions=typeof uniqueExpressions==='function'?uniqueExpressions(analyzed.expressions||[]):(analyzed.expressions||[]);
  let added=0;
  for(let i=0;i<expressions.length;i++){
    const expr=expressions[i];
    write('Looking up phrase '+(i+1)+' of '+expressions.length+'…',false);
    try{
      const built=await accountFetch('/api/phrase-card',{method:'POST',body:JSON.stringify({exactText:expr.exactText,canonicalForm:expr.canonicalForm,type:expr.type,meaning:expr.meaning,context:expr.context,source:'song'})});
      const card=built&&built.card;
      if(card&&card.word&&await stageKeepExpression(card)){
        added++;
        marks[String(card.word).trim().toLowerCase()]={state:'new',word:card.word,deck:card.place||'mine'};
      }
    }catch{/* one missed phrase does not stop the rest */}
  }
  await storeMarks();
  const red=keys.filter(key=>!marks[key]||marks[key].state==='miss'||marks[key].state==='error').length;
  finish((red?red+(red===1?' word is red. ':' words are red. '):'Checked the words. ')+(added?'Added '+added+' expressions.':''),false);
}
function stageSaveSongMeta(){
  const managed=stageManagedSongReady();if(!stageOwnReady()&&!managed)return;
  const accountId=viewAccount?.id||'',generation=viewGen;
  const item=loadSongs().find(row=>row.id===document.getElementById('songUser').dataset.songId);if(!item)return;
  if(editFileRemoved){window.TursoMain.unsupported('Изменение файла песни');return;}
  const file=!managed&&pendingEditFile&&!editFileSent?pendingEditFile:null;
  const read=key=>document.querySelector('#songUser [data-lyric-'+key+']').value.trim();
  return window.TursoMain.perform(async()=>{
    const changes={title:read('title'),artist:read('artist'),videoUrl:read('video'),musicUrl:read('music')};
    const result=managed?await window.TursoMain.saveManagedLibrary(accountId,item,'song',changes):await window.TursoMain.saveLibrary(item,'song',changes);
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    let saved=result.item;
    if(file){
      const uploaded=await stageUploadSongFile(saved,file,true);
      saved=uploaded.item||saved;
      pendingEditFile=null;editFileSent=true;
    }
    stageInstallLibrary(saved,'song');renderUserSong(saved);
  },document.querySelector('#songUser [data-lyric-meta-status]'));
}
function stageUploadSongFile(saved,file,editing){
  const paint=editing&&typeof paintEditRing==='function'?paintEditRing:!editing&&typeof paintLyricRing==='function'?paintLyricRing:()=>{};
  paint(0,'Uploading…');
  return window.TursoMain.uploadSongAudio(saved,file,ratio=>paint(ratio,'Uploading…')).then(uploaded=>{paint(1,'Saved.');return uploaded;},error=>{paint(null);throw error;});
}
function stagePaintLocalAudio(song,box){
  if(!box||!(song&&(song.fileName||song.stageLocalMedia)))return false;
  const slots=typeof mediaOf==='function'?mediaOf(song):{};
  const video=typeof videoHtml==='function'?videoHtml(slots.video):'';
  const music=typeof musicHtml==='function'?musicHtml(slots.music):'';
  const file=filePlayerHtml(songFilePath(song.stageId||song.id),song.fileType,song.fileName);
  box.innerHTML=video+music;
  if(typeof mountSongFile==='function')mountSongFile(box,file);
  else box.insertAdjacentHTML('beforeend',file);
  if(typeof watchSongPlayers==='function')watchSongPlayers(document.getElementById('songUser')||box);
  return true;
}
function stageManagedSongReady(){return !!(viewAccount&&authUser?.role==='DEVELOPER'&&accountReady&&!viewSwitching);}
function stageMountTextArchive(id){
  const item=loadTexts().find(row=>row.id===id),host=document.getElementById('textEdit')?.parentNode;if(!host)return;
  let button=host.querySelector('[data-stage-text-archive]');
  if(!button){button=document.createElement('button');button.type='button';button.className='btn';button.dataset.stageTextArchive='';button.textContent='Archive text';host.append(button);}
  button.hidden=!(viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching&&item?.stageScope==='profile'&&item.stageId);
  button.onclick=()=>stageArchiveText(id);
}
function stageArchiveText(id){
  if(!viewAccount||!authUser||!['ADMIN','DEVELOPER'].includes(authUser.role)||!accountReady||viewSwitching)return;
  const item=loadTexts().find(row=>row.id===id);if(!item?.stageId||item.stageScope!=='profile')return;
  const accountId=viewAccount.id,generation=viewGen;
  return window.TursoMain.perform(async()=>{
    await window.TursoMain.archiveManagedText(accountId,item);
    if(viewAccount?.id!==accountId||viewGen!==generation)return;
    localStorage.setItem(TEXT_KEY,JSON.stringify(loadTexts().filter(row=>row.id!==id)));paintTextCount();renderTextList();show('texts');
  });
}
function stageMountSongAudio(){}
document.addEventListener('click',event=>{
  const archive=event.target.closest('[data-lyric-archive]');if(!archive)return;
  event.preventDefault();event.stopPropagation();const managed=stageManagedSongReady();if(!stageOwnReady()&&!managed)return;
  const accountId=viewAccount?.id||'',generation=viewGen;
  const item=loadSongs().find(row=>row.id===document.getElementById('songUser').dataset.songId);if(!item)return;
  window.TursoMain.perform(async()=>{
    const result=managed?await window.TursoMain.saveManagedLibrary(accountId,item,'song',{archived:true}):await window.TursoMain.saveLibrary(item,'song',{archived:true});
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    stageInstallLibrary(result.item,'song');if(!managed)trackEvent('song','lyrics','archive');show('music');
  });
},true);
document.addEventListener('DOMContentLoaded',()=>{
  const host=document.getElementById('groupAdd');if(!host)return;
  const form=document.createElement('form');form.id='stageNewCard';
  form.innerHTML='<details><summary>Новая личная карточка вручную</summary><label>English<input name="en" required maxlength="200"></label><label>Russian<input name="ru" required maxlength="10000"></label><button class="btn primary" type="submit">Сохранить новую карточку</button><p role="status"></p></details>';
  form.addEventListener('submit',event=>{
    event.preventDefault();const managed=!!(viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching);
    if(!stageOwnReady()&&!managed){window.TursoMain.notice('Дождитесь загрузки профиля.',true);return;}
    const accountId=viewAccount?.id||'',generation=viewGen;
    stageNewCardId ||= 'own_'+crypto.randomUUID();
    const en=form.elements.en.value.trim(),ru=form.elements.ru.value.trim();
    window.TursoMain.perform(async()=>{
      const result=managed?await window.TursoMain.newManagedCard(accountId,stageNewCardId,en,ru):await window.TursoMain.newCard(stageNewCardId,en,ru);
      stageNewCardId='';if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
      const list=loadAdded();list.unshift(result.card);stageStampLinks(list,result.revision);form.reset();renderMade(result.card);if(!managed)trackEvent('card','mine','add');
    },form.querySelector('[role="status"]'));
  });host.append(form);
});
function stageSaveTranslation(host){
  const card=stageHostCard(host),input=host.querySelector('[data-edit-field="ru"]'),status=host.querySelector('[data-edit-status]');
  if(!card || !input||!stageCanEditTranslation(card))return;
  const accountId=viewAccount?.id||'',generation=viewGen;
  const ru=input.value.trim();if(!ru){if(status)status.textContent='Введите перевод.';return;}
  return window.TursoMain.perform(async()=>{
    const saved=accountId?await window.TursoMain.editManagedCard(accountId,card,ru):await window.TursoMain.editCard(card,ru);
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    card.ru=saved.ru;card.stageRevision=saved.revision;if(card.original)card.original.ru=saved.ru;
    if(host.dataset.editKind==='added' || (host.dataset.editKind==='made' && addedIndexOf(card)>=0)){
      rememberAdded(loadAdded());paintAdded();if(madeItem===card)renderMade(card);
    }else{
      const map=loadEdits(),origin=card.origin||String(card.en||card.base||card.word||'').toLowerCase();
      map[origin]={ru:saved.ru};localStorage.setItem(EDIT_KEY,JSON.stringify(map));refreshCatalog();
    }
    if(host.isConnected){host.querySelector('[data-edit-form]')?.remove();}
  },status);
}
function stageDeleteDefinition(host){
  if(viewSwitching)return;
  const card=stageHostCard(host);if(!card)return;
  const personal=['added','made'].includes(host.dataset.editKind)&&addedIndexOf(card)>=0;
  if(viewAccount){
    if(!personal||!stageCanManageAdded(card))return;
    const accountId=viewAccount.id,generation=viewGen;
    return window.TursoMain.perform(async()=>{
      const result=await window.TursoMain.unlinkManagedCard(accountId,card);
      if(viewAccount?.id!==accountId||viewGen!==generation)return;
      stageStampLinks(loadAdded().filter(row=>!(row.stageId===card.stageId&&(row.place||'mine')===(card.place||'mine'))),result.revision);
      if(madeItem?.stageId===card.stageId){madeItem=null;show('add');}
    });
  }
  if(personal){
    if(!canEditAdded(card))return;
    return window.TursoMain.perform(async()=>{
      const result=await window.TursoMain.unlinkCard(card);
      stageStampLinks(loadAdded().filter(row=>!(row.stageId===card.stageId&&(row.place||'mine')===(card.place||'mine'))),result.revision);
      if(madeItem?.stageId===card.stageId){madeItem=null;show('add');}
    });
  }
  if(!canEditLessons())return;
  window.TursoMain.perform(async()=>{
    await window.TursoMain.deleteCard(card);
    if(host.dataset.editKind==='added' || host.dataset.editKind==='made'){
      rememberAdded(loadAdded().filter(row=>row!==card));paintAdded();paintAllWords();madeItem=null;show('add');
    }else{
      card.deleted=true;
      const map=loadEdits(),origin=card.origin||String(card.en||card.base||'').toLowerCase();
      map[origin]={deleted:true};localStorage.setItem(EDIT_KEY,JSON.stringify(map));refreshCatalog();
    }
  });
}
function stageQuizWrite(event){
  const save=event.target.closest('[data-card-quiz-save]'),del=event.target.closest('[data-card-quiz-del]');
  if(!save && !del)return false;
  event.preventDefault();event.stopPropagation();if(!cardQuizCanEdit())return true;
  const button=save||del,box=button.closest('.card-quiz-box');if(!box)return true;
  const word=box.dataset.cardQuizWord||'',index=Number(save?save.dataset.cardQuizSave:del.dataset.cardQuizDel);
  const original=cardQuizzesOf(word)[index];if(!original)return true;
  const quiz=JSON.parse(JSON.stringify(original));
  if(save)writeCardQuizFromEditor(save.closest('.card-quiz-item'),quiz);
  stageListEpoch.quizzes++;
  window.TursoMain.perform(async()=>{
    await window.TursoMain.writeQuiz(word,quiz,!!del);
    window.ContentCache?.invalidate?.('quizzes:');
    const state=await accountFetch('/api/me/state');
    installCardQuizzes(state.stats.cardQuizzes);refreshCardQuizBox(box);
  });
  return true;
}
function stageNoteAnswer(item,ok){
  if(!item || item.type==='Flip')return;
  if(!authUser || viewAccount || viewSwitching || !accountReady){window.TursoMain.notice('Прогресс сохраняется только в загруженный профиль вошедшего пользователя.',true);return;}
  try{window.TursoMain.event('answer',item.type,ok?'ok':'miss');if(item.card)window.TursoMain.answer(item.card,item.type,!!ok);}catch(error){window.TursoMain.notice(error.message,true);}
}
function stageHomeBuckets(rows){
  const learnedIds=loadLearned(),weakWords=new Set(),seen=new Set();
  for(const row of Object.values(loadMistakeMap())){
    if(row && !row.cleared && Number(row.misses)>0){
      const word=String(row.en||'').trim().toLowerCase();if(word)weakWords.add(word);
    }
  }
  const weak=rows.filter(row=>{
    const word=String(row.en||'').trim().toLowerCase();
    if(!weakWords.has(word)||seen.has(word))return false;
    seen.add(word);return true;
  });
  return {learned:rows.filter(row=>learnedIds.has(String(row.en).toLowerCase())).sort(byLesson),
    weak:weak.sort(byLesson),learning:rows.filter(row=>!learnedIds.has(String(row.en).toLowerCase())).sort(byLesson)};
}
function stagePaintWeakCount(buckets){
  const count=document.querySelector('#homeDemo [data-stat="weak"] b');
  if(count)count.textContent=String(buckets.weak.length);
  stagePaintActivity();
}
// The appended staging hooks are read afresh for every script request. Install
// here so this UI-only change does not require restarting auth/session storage.
if(typeof homeBuckets==='function')homeBuckets=function(rows){
  const buckets=stageHomeBuckets(rows);stagePaintWeakCount(buckets);return buckets;
};
function stageResponseValue(block,checked=false){
  if(block.type==='task')return block.response||'';
  return {items:(block.items||[]).map(item=>({...('picked' in item?{picked:item.picked}:{}),...('typed' in item?{typed:item.typed}:{})})),...(checked?{checked:true}:{})};
}
function stageLessonCounts(blocks){
  let words=0,phrases=0,rules=0;
  for(const block of blocks||[]){
    if(block.type==='wordcard'||block.type==='word'){if((block.tab||'')==='phrases')phrases+=1;else if((block.tab||'')==='words')words+=1;}
    else if(block.type==='phrase')phrases+=1;
    else if(block.type==='rule')rules+=1;
  }
  return {wordCount:words,phraseCount:phrases,ruleCount:rules};
}
function stageStampLesson(material){
  if(!material||material.stageLessonBaseline||!material.stageRevision||typeof window.TursoMain?.lessonSnapshot!=='function')return;
  const saved=(material.blocks||[]).filter(block=>block&&block.stageBlockRevision);
  material.stageLessonBaseline=window.TursoMain.lessonSnapshot({...material,blocks:saved});
}
function stageSaveLesson(published){
  if(lmState&&lmState.examOwned){
    lmState.published=!!published;
    lmState.mode=published?'preview':'edit';
    if(typeof examSync==='function')return Promise.resolve(examSync()).then(()=>{
      if(typeof lmShow==='function')lmShow(lmState.mode);
      if(typeof lmNote==='function')lmNote(published?'':'Draft saved.');
      if(typeof examDress==='function')examDress();
    });
    return Promise.resolve();
  }
  const bound=document.getElementById('material')?.dataset.lmBound||'';
  if(bound&&lmState?.id!==bound){
    const found=lmLibrary?.materials?.find(row=>row.id===bound);
    if(!found){window.TursoMain.notice('This editor is no longer attached to its lesson. Open the lesson again.',true);return Promise.resolve();}
    lmState=found;
  }
  if(!canEditLessons()||viewAccount||viewSwitching||!lmState){
    window.TursoMain.notice('Урок не отправлен: дождитесь загрузки собственного профиля учителя и откройте редактор.',true);return Promise.resolve();
  }
  if(lmState.stageLessonDeferred){
    window.TursoMain.notice('The lesson is still opening. Wait, then click Publish again.',true);return Promise.resolve();
  }
  clearTimeout(lmSaveTimer);
  const current=lmState;
  return window.TursoMain.perform(async()=>{
    const draft=JSON.parse(JSON.stringify(current));
    const baseline=stageServerBaseline(draft);
    if(baseline)await baseline;
    if(published!==undefined){draft.published=published;draft.mode=published?'preview':'edit';}
    await window.TursoMain.saveLesson(draft);
    window.ContentCache?.drop(':'+current.id+':');
    window.ContentCache?.drop('lesson:');
    Object.assign(current,draft,stageLessonCounts(draft.blocks));lmState=current;lmKeepLesson();lmPersist();
    lmShow(current.published?'preview':'edit');lmNote('Сохранено в тестовую Turso.');
  },document.getElementById('lmNote'));
}
function stageServerBaseline(material){
  if(!material||material.stageLessonBaseline||!material.stageRevision||typeof accountFetch!=='function'||typeof window.TursoMain?.lessonSnapshot!=='function')return null;
  const target=(typeof viewAccount!=='undefined'&&viewAccount?.id)||'';
  const path=target?'/api/admin/users/'+encodeURIComponent(target)+'/lessons':'/api/lessons';
  return accountFetch(path+'?id='+encodeURIComponent(material.id)).then(data=>{
    const full=(data.materials||[]).find(row=>row.id===material.id);
    if(full)material.stageLessonBaseline=window.TursoMain.lessonSnapshot(full);
  });
}
async function stageLookupLessonWord(){
  if(!canEditLessons()||!accountReady||viewAccount||viewSwitching||!lmState)return;
  const input=document.getElementById('lmWordInput'),status=document.getElementById('lmWordStatus'),button=document.getElementById('lmWordGo');
  const word=input?.value.trim(),current=lmState,tab=lmTab(),generation=viewGen;
  if(!word||!['words','phrases'].includes(tab))return;
  if(button)button.disabled=true;
  status.textContent='Finding shared cards…';
  const add=async card=>{
    const definition=await window.TursoMain.dictionary({stageId:card.id});
    if(current!==lmState||generation!==viewGen||viewAccount||viewSwitching)return;
    if(current.blocks.some(block=>block.tab===tab&&block.stageId===card.id)){status.textContent='This card is already on this page.';return;}
    const item={...definition,id:lmId(),type:'wordcard',tab,collapsed:false,word:definition.en,stageId:card.id,stageScope:'shared'};
    lmInsertBlockFront(item);input.value='';status.textContent='';lmRenderEditor();lmSchedule();
  };
  try{
    const rows=await window.TursoMain.lessonCards(word);
    if(current!==lmState||generation!==viewGen||viewAccount||viewSwitching)return;
    if(!rows.length){
      status.textContent='Looking up and saving this card…';
      const card=await window.TursoMain.lookupLessonCard(word);
      await add(card);return;
    }
    if(rows.length===1){await add(rows[0]);return;}
    const select=document.createElement('select'),choose=document.createElement('button');
    for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=row.en+' — '+row.ru+' ['+row.id.slice(-8)+']';select.append(option);}
    choose.type='button';choose.className='btn';choose.textContent='Add selected card';choose.onclick=()=>{choose.disabled=true;void add(rows.find(row=>row.id===select.value)).catch(error=>{status.textContent=error.message;window.TursoMain.notice(error.message,true);}).finally(()=>{choose.disabled=false;});};
    status.replaceChildren(document.createTextNode('Select the exact card: '),select,choose);
  }catch(error){status.textContent=error.message;window.TursoMain.notice(error.message,true);}
  finally{if(button)button.disabled=false;}
}
function stageUploadLessonFile(id,file){
  if(lmState&&lmState.examOwned){
    const block=lmBlock(id);if(!block||!file)return;
    block.name=file.name;block.size=typeof lmFileSize==='function'?lmFileSize(file.size):'';block.sample=false;block.hasFile=true;block.fileType=file.type||'';
    if(lmFiles[id])URL.revokeObjectURL(lmFiles[id]);
    lmFiles[id]=URL.createObjectURL(file);
    if(typeof examSync==='function')examSync();
    if(typeof lmRenderEditor==='function')lmRenderEditor();
    return;
  }
  if(!canEditLessons()||viewAccount||viewSwitching||!file)return;
  const block=lmBlock(id);if(!block)return;
  const current=lmState,generation=viewGen;
  return window.TursoMain.perform(async()=>{
    await stageServerBaseline(current);
    const dirty=typeof window.TursoMain.lessonDirty==='function'?window.TursoMain.lessonDirty(current):!current.stageLessonBaseline;
    if(!current.stageRevision||!block.stageBlockRevision||dirty){
      const draft=JSON.parse(JSON.stringify(current));
      await stageServerBaseline(draft);
      await window.TursoMain.saveLesson(draft);
      if(lmState!==current||viewGen!==generation||viewAccount)return;
      Object.assign(current,draft);
    }
    const saved=(current.blocks||[]).find(row=>row.id===id)||block;
    await window.TursoMain.uploadLessonFile(current,saved,file);
    if(lmState!==current||viewGen!==generation||viewAccount)return;
    if(lmFiles[id]){URL.revokeObjectURL(lmFiles[id]);delete lmFiles[id];}
    lmKeepLesson();lmPersist();lmRenderEditor();lmNote('Файл сохранён в изолированном тестовом хранилище; ссылка — в тестовой Turso.');
  },document.getElementById('lmNote'));
}
function stageClearLessonFile(id){
  if(lmState&&lmState.examOwned){
    const block=lmBlock(id);if(!block)return;
    block.name='';block.size='';block.sample=false;block.hasFile=false;block.fileType='';
    if(lmFiles[id]){URL.revokeObjectURL(lmFiles[id]);delete lmFiles[id];}
    if(typeof examSync==='function')examSync();
    if(typeof lmRenderEditor==='function')lmRenderEditor();
    return;
  }
  if(!canEditLessons()||viewAccount||viewSwitching)return;
  const block=lmBlock(id);if(!block)return;
  const current=lmState,generation=viewGen;
  return window.TursoMain.perform(async()=>{
    await window.TursoMain.detachLessonFile(current,block);
    if(lmState!==current||viewGen!==generation||viewAccount)return;
    if(lmFiles[id]){URL.revokeObjectURL(lmFiles[id]);delete lmFiles[id];}
    lmKeepLesson();lmPersist();lmRenderEditor();lmNote('Ссылка снята на тестовом сервере. Сам файл не удалён.');
  },document.getElementById('lmNote'));
}
function stageDeleteLesson(id){
  if(!canEditLessons()||viewAccount||viewSwitching)return;
  const current=lmLibrary?.materials.find(row=>row.id===id);
  if(!current?.stageRevision){window.TursoMain.notice('Это несохранённый черновик, а не серверный урок.',true);return;}
  if(!confirm('Delete this lesson?'))return;
  return window.TursoMain.perform(async()=>{
    await window.TursoMain.deleteLesson(current);
    window.ContentCache?.drop(':'+id+':');
    lmLibrary.materials=lmLibrary.materials.filter(row=>row.id!==id);
    if(lmState?.id===id)lmState=null;
    lmLibrary.activeId=lmLibrary.materials[0]?.id||'';
    lmPersist();show('days');
  });
}
function stageHideLesson(id){
  if(viewSwitching||!accountReady)return;
  if(viewAccount){
    if(!canTuneStudentLessons())return;
    const current=lmLibrary?.materials.find(row=>row.id===id);if(!current?.stageRevision){window.TursoMain.notice('Урок не связан с тестовой Turso.',true);return;}
    const accountId=viewAccount.id,generation=viewGen;
    const expected={allowHidden:lmAllowedForStudent(id),personalHidden:lmHiddenForStudent(id)};
    const changes={...expected};if(current.hiddenFromStudents)changes.allowHidden=!expected.allowHidden;else changes.personalHidden=!expected.personalHidden;
    return window.TursoMain.perform(async()=>{
      await window.TursoMain.setManagedLessonAccess(accountId,id,expected,changes);
      if(viewAccount?.id!==accountId||viewGen!==generation)return;
      const update=(list,flag)=>flag?[...new Set([...list,id])]:list.filter(value=>value!==id);
      installAllowedLessons(update(loadAllowedLessons(),changes.allowHidden));
      installHiddenLessons(update(loadHiddenLessons(),changes.personalHidden));paintLmDays();
    });
  }
  if(!canEditLessons())return;
  const current=lmLibrary?.materials.find(row=>row.id===id);if(!current)return;
  return window.TursoMain.perform(async()=>{
    await window.TursoMain.hideLesson(current,!current.hiddenFromStudents);paintLmDays();
  });
}
document.addEventListener('click',event=>{
  const button=event.target.closest('#lmSave,#lmPublish');if(!button)return;
  event.preventDefault();event.stopPropagation();stageSaveLesson(button.id==='lmPublish');
},true);
function stageResponseEvent(event){
  if(lmState&&lmState.examOwned)return;
  const input=event.target.closest('[data-response],[data-write],[data-pick],[data-quiz-check],[data-ex-check]');
  if(!input)return;
  const checking=input.hasAttribute('data-quiz-check')||input.hasAttribute('data-ex-check');
  if((checking && event.type!=='click') || (!checking && !['input','change','focusout'].includes(event.type)))return;
  // Capture before the old lesson-wide persistence handlers.
  event.stopPropagation();
  if(!authUser || viewAccount || viewSwitching || !accountReady){window.TursoMain.notice('Ответы сохраняются только в собственный профиль.',true);return;}
  const raw=input.dataset.response||input.dataset.write||input.dataset.pick||input.dataset.quizCheck||input.dataset.exCheck;
  const bits=raw.split(':'),block=(lmState?.blocks||[]).find(row=>row.id===(input.dataset.response||input.dataset.quizCheck||input.dataset.exCheck||bits[0]));
  if(!block || !block.stageBlockRevision){window.TursoMain.notice('Задание не связано с серверным ID. Перезагрузите урок.',true);return;}
  if(input.dataset.response)block.response=input.value;
  if(input.dataset.write && block.items?.[Number(bits[1])])block.items[Number(bits[1])].typed=input.value;
  if(input.dataset.pick){
    if(!input.checked)return;
    if(block.items?.[Number(bits[1])])block.items[Number(bits[1])].picked=Number(bits[2]);
  }
  try{window.TursoMain.response(lmState.id,block,stageResponseValue(block,checking),checking||event.type==='focusout');}
  catch(error){window.TursoMain.notice(error.message,true);}
}
document.addEventListener('click',event=>{
  const more=event.target.closest&&event.target.closest('[data-stage-more]');
  if(more){stageLibraryBatch(more.dataset.stageMore);return;}
  const retry=event.target.closest&&event.target.closest('[data-stage-retry]');
  if(!retry)return;
  const kind=retry.dataset.stageRetry;
  if(kind==='lesson'){const row=lmLibrary?.materials?.find(item=>item.id===retry.dataset.lessonId);if(row)stageOpenLesson(row);return;}
  if(kind==='speak'){stageLoadSpeak('level',speakLevel,-1,-1);return;}
  if(kind==='verbs'){show('verbs');return;}
  if(kind==='texts'){stagePaintTexts();return;}
  if(kind==='song'){const song=loadSongs().find(row=>row.id===retry.dataset.songId);if(song)stageOpenSong(song);return;}
  stageLibraryBatch(kind);
});
for(const event of ['input','change','focusout','click'])document.addEventListener(event,stageResponseEvent,true);
document.addEventListener('turso-personal-saved',event=>{
  const {job,result}=event.detail;
  if(!authUser || authUser.id!==job.actorId || viewAccount || viewSwitching)return;
  if(job.kind==='activity'){
    stageActivity.tracked=true;stageActivity.seconds+=result.increments?.seconds||0;stageActivity.examPass+=result.increments?.examPass||0;stagePaintActivity();return;
  }
  if(job.kind==='answer'){
    const map=loadMistakeMap(),key=result.progress.en.toLowerCase()+'|'+result.type;
    if(result.progress.cleared)delete map[key];else map[key]=result.progress;
    if(result.progress.cleared&&typeof trackEvent==='function')trackEvent('learned',result.type,'ok');
    localStorage.setItem(MISTAKE_KEY,JSON.stringify(map));
  }
  if(job.kind==='progress'){
    const card=window.TursoMain.cardForProgress?.(result.id);
    if(card){
      const learned=loadLearned(),key=card.en.toLowerCase();
      if(result.learned)learned.add(key);else learned.delete(key);
      localStorage.setItem(LEARNED_KEY,JSON.stringify([...learned]));
      const variants=loadVariantMap();variants[key]=result.variants;localStorage.setItem(VARIANT_KEY,JSON.stringify(variants));
    }
  }
  if(job.kind==='answer'||job.kind==='progress'){
    stageProgressEpoch++;
    if(typeof window!=='undefined')window.ContentCache?.invalidate?.('progress:');
    paintHomeStats();
    if(document.getElementById('cardstat')?.classList.contains('on'))paintStat();
  }
  if(job.kind==='response'&&result.response?.checked){
    const response=result.response,items=response.items||[];
    if(items.length&&items.every(item=>item.marked===true&&typeof item.correct==='boolean')){
      for(const item of items)trackEvent('answer','Lesson exercise',item.correct?'ok':'miss');
    }
  }
  if(job.kind==='response' && lmState && lmState.id===result.lessonId){
    const block=(lmState.blocks||[]).find(row=>row.id===result.blockId);
    if(block){
      block.stageResponseRevision=result.revision;
      const current=JSON.stringify(stageResponseValue(block,job.response?.checked===true))===JSON.stringify(job.response);
      if(current && typeof result.response?.score==='string'){
        block.score=result.response.score;
        const output=[...document.querySelectorAll('[data-quiz-score]')].find(el=>el.dataset.quizScore===block.id);
        if(output)output.textContent=block.score;
      }
      if(current && block.type==='exercise' && result.response?.checked){
        for(const [i,answer] of result.response.items.entries())if(block.items[i]){block.items[i].marked=answer.marked;block.items[i].correct=answer.correct;}
        lmRenderPreview();
      }
    }
  }
});
var stageSpeakLevels=[['A1','A1'],['A2','A2'],['A2+','A2+'],['B1','B1'],['B1+','B1+'],['B2','B2'],['B2+','B2+'],['C1-C2','C1-C2']];
function stageLevels(){return stageSpeakLevels||[['A1','A1'],['A2','A2'],['A2+','A2+'],['B1','B1'],['B1+','B1+'],['B2','B2'],['B2+','B2+'],['C1-C2','C1-C2']];}
function stageIds(node){
  if(Array.isArray(node))return node.flatMap(item=>item&&item.cardId?[item.cardId]:stageIds(item));
  if(node&&typeof node==='object')return Object.values(node).flatMap(stageIds);
  return [];
}
function stageEnsureStatic(key){
  const version=(window.ContentCache.get('account:bootstrap')||{}).versions?.[key==='GRAMMAR'?'grammar':'irregular']||0;
  const cacheKey=(key==='GRAMMAR'?'grammar:':'irregular:')+version;
  if(window.ContentCache?.has(cacheKey))return Promise.resolve(window.ContentCache.get(cacheKey));
  if(key==='GRAMMAR')return window.ContentCache.load(cacheKey,()=>fetch('/api/catalogs/GRAMMAR?document=1',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Unable to load grammar.');return response.json();})).then(data=>{if(data.document)window.GRAMMAR=data.document;if((document.querySelector('section.on')||{}).id==='tenses'&&typeof paintHub==='function')paintHub();return data.document;});
  return stageIrregularPage('');
}
function stageIrregularPage(after){
  const version=(window.ContentCache.get('account:bootstrap')||{}).versions?.irregular||0;
  const seen=stageCycle('irregular',after||'');
  return window.ContentCache.load('irregular:page:'+(after||'start'),()=>fetch('/api/catalogs/IRREGULAR?slice=1&limit=50'+(after?'&after='+encodeURIComponent(after):''),{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Unable to load irregular verbs.');return response.json();})).then(page=>{
    for(const card of page.cards||[])if(!window.IRREGULAR.some(row=>row.stageId&&row.stageId===card.stageId))window.IRREGULAR.push(card);
    if(!page.next){window.ContentCache.set('irregular:'+version,window.IRREGULAR.slice());if(seen.started)stageSettled.verbs=true;}
    else stageFollow('irregular',page.next,after,stageIrregularPage);
    if((document.querySelector('section.on')||{}).id==='verbs'&&typeof paintVerbs==='function')paintVerbs();
    stagePaintCounts();
    return page;
  });
}
function stageItemKey(kind,stageId){
  const who=(viewAccount&&viewAccount.id)||(authUser&&authUser.id)||'';
  return (kind==='text'?'text:':'song:')+who+':'+stageId;
}
function stageItemPath(kind,stageId){
  if(viewAccount&&viewAccount.id)return '/api/admin/users/'+encodeURIComponent(viewAccount.id)+'/'+(kind==='text'?'texts':'songs')+'/'+encodeURIComponent(stageId);
  return '/api/library/'+encodeURIComponent(stageId);
}
function stageWordsPending(){
  const keys=['words','extraWords','lines21','ask07','phrases09','adverbs14','talk16','likes23'];
  if(keys.some(key=>(window.LESSON_DATA[key]||[]).length))return false;
  return !window.ContentCache?.get('library:opened:allwords');
}
function stageLiveCounts(){
  const data=window.LESSON_DATA||{};
  const mine=typeof loadAdded==='function'?loadAdded().filter(item=>(item.place||'mine')==='mine'&&!item.fromText).length:0;
  const phrases=(data.phrasalWords||[]).length+(typeof loadAdded==='function'?loadAdded().filter(item=>item.place==='phrasal'&&!item.fromText).length:0);
  const idioms=(data.idiomWords||[]).length+(typeof loadAdded==='function'?loadAdded().filter(item=>item.place==='idioms'&&!item.fromText).length:0);
  const words=typeof allRows==='function'?allRows().length:((data.words||[]).length+(data.extraWords||[]).length+(data.lines21||[]).length+(data.ask07||[]).length+(data.phrases09||[]).length+(data.adverbs14||[]).length+(data.talk16||[]).length+(data.likes23||[]).length+mine+phrases+idioms);
  return {words,mine,phrases,idioms,verbs:(window.IRREGULAR||[]).length,songs:typeof loadSongs==='function'?loadSongs().filter(row=>!row.archived).length:0,texts:typeof loadTexts==='function'?loadTexts().length:0};
}
function stagePaintCounts(counts){
  const live=stageLiveCounts();
  const merged={...(counts||{})};
  for(const [key,value] of Object.entries(live))if(value||stageSettled[key])merged[key]=value;
  const set=(id,value)=>{const node=typeof document!=='undefined'&&document.getElementById?document.getElementById(id):null;if(node&&value!=null)node.textContent=String(value);};
  set('allWordCount',merged.words);set('myWordCount',merged.mine);set('phrasalCount',merged.phrases);set('idiomCount',merged.idioms);set('verbCount',merged.verbs);set('lyricCount',merged.songs);set('textCount',merged.texts);
}
var stageSettled={};
const stageCycles=new Map();
function stageCycle(name,cursor){
  if(!cursor)stageCycles.set(name,{ids:new Set(),extra:new Map(),started:true});
  let cycle=stageCycles.get(name);
  if(!cycle){cycle={ids:new Set(),extra:new Map(),started:false};stageCycles.set(name,cycle);}
  return cycle;
}
function stageListStale(key,epoch,part){
  if(epoch===stageListEpoch[key])return false;
  window.ContentCache?.drop(part);
  return true;
}
function stageLibrarySection(id){
  const bank=id==='phrasal'?'phrasalWords':id==='idioms'?'idiomWords':'words';
  const list=window.LESSON_DATA&&window.LESSON_DATA[bank];
  if(!list||!list.length){
    window.ContentCache?.drop?.('library:after:'+id);
    window.ContentCache?.drop?.('library:opened:'+id);
  }
  if(!(list&&list.length)||!window.ContentCache?.get('library:opened:'+id)||window.ContentCache.get('library:after:'+id))stageLibraryBatch(id);
}
function stageLibrarySummary(){
  const cached=window.ContentCache?.get('account:bootstrap');
  if(cached?.counts){stagePaintCounts(cached.counts);return Promise.resolve(cached.counts);}
  if(typeof authUser==='undefined'||!authUser)return Promise.resolve(null);
  return window.ContentCache.load('library:summary',()=>accountFetch('/api/me/state?summary=1')).then(state=>{window.ContentCache.set('account:bootstrap',state);stagePaintCounts(state.counts);return state.counts;});
}
function stageRepaint(section){
  if(section==='allwords'&&typeof paintAllWords==='function')paintAllWords();
  if(section==='phrasal'||section==='idioms')paintDeckGrids(section);
  const host=document.getElementById(section==='allwords'?'allWordGrid':section==='phrasal'?'phrasalGrid':'idiomGrid');
  return host;
}
var stageBatchJobs;
function stageLibraryBatch(section){
  if(!stageBatchJobs)stageBatchJobs=new Map();
  if(stageBatchJobs.has(section))return stageBatchJobs.get(section);
  const job=stageLibraryBatchRun(section).finally(()=>stageBatchJobs.delete(section));
  stageBatchJobs.set(section,job);
  return job;
}
async function stageLibraryBatchRun(section){
  const hostId=section==='allwords'?'allWordGrid':section==='phrasal'?'phrasalGrid':'idiomGrid';
  const box=document.getElementById(hostId);
  const apiSection=section==='phrasal'?'phrases':section==='idioms'?'idioms':'words';
  const bank=section==='phrasal'?'phrasalWords':section==='idioms'?'idiomWords':'words';
  const after=window.ContentCache.get('library:after:'+section)||'';
  try{
    if(box&&!(window.LESSON_DATA[bank]||[]).length)box.innerHTML='<p class="hint">Loading…</p>';
    const page=await window.ContentCache.load('cards:'+apiSection+':after:'+(after||'start'),()=>accountFetch('/api/catalogs/LESSON_DATA?section='+apiSection+'&limit=50'+(after?'&after='+encodeURIComponent(after):'')));
    for(const card of page.cards||[])if(!(window.LESSON_DATA[bank]||[]).some(row=>row.stageId===card.stageId))window.LESSON_DATA[bank].push(card);
    window.ContentCache.set('library:after:'+section,page.next||'');
    window.ContentCache.set('library:opened:'+section,true);
    if(!page.next)stageSettled[section==='phrasal'?'phrases':section==='idioms'?'idioms':'words']=true;
    if((document.querySelector('section.on')||{}).id===section)stageRepaint(section);
    if(typeof paintDeckCounts==='function')paintDeckCounts();
    stagePaintCounts();
    stageRefreshHome();
    const host=document.getElementById(hostId);
    if(host&&!(window.LESSON_DATA[bank]||[]).length)host.innerHTML='<p class="hint">No cards yet.</p>';
    stageFollow('library:'+section,page.next,after,()=>stageLibraryBatch(section));
    stageScheduleHydration();
    return page;
  }catch(error){if(box)box.innerHTML='<p class="hint">'+esc(error.message)+' <button class="btn" type="button" data-stage-retry="'+section+'">Retry</button></p>';throw error;}
}
function stageFollow(key,next,cursor,run){
  if(!next||next===cursor)return;
  const depth=window.ContentCache?.get(key+':depth')||0;
  if(depth>=80)return;
  window.ContentCache?.set(key+':depth',depth+1);
  const job=()=>run(next);
  const queue=window.PreloadQueue;
  if(!queue)return job();
  return queue.add({id:key+':'+next,priority:6,run:job});
}
function stageWeakPending(){
  if(typeof authUser==='undefined'||!authUser)return false;
  if(!window.ContentCache?.has('progress:after:start'))return true;
  if(!(window.LESSON_DATA?.words||[]).length&&!window.ContentCache?.get('library:opened:allwords'))return true;
  if(window.ContentCache?.get('library:after:allwords'))return true;
  if(!stageSettled.mine&&!window.ContentCache?.has('cards:personal:after:start'))return true;
  return false;
}
function stageRefreshHome(){
  if(typeof paintHomeStats==='function')paintHomeStats();
  if(typeof paintHomeStudy==='function')paintHomeStudy();
  if(document.getElementById('cardstat')?.classList.contains('on')&&typeof paintStat==='function')paintStat();
}
function stageKick(id,run){
  const queue=window.PreloadQueue;
  if(!queue)return run();
  return queue.add({id,priority:0,run});
}
function stageDemand(id){
  try{
    if(id==='library'){stageLibrarySummary().catch(error=>window.TursoMain.notice(error.message,true));for(const section of ['allwords','phrasal','idioms'])stageLibrarySection(section);if(typeof authUser!=='undefined'&&authUser)stageKick('cards:personal',()=>stagePersonalPage(''));}
    if(id==='verbs')stageKick('irregular',()=>stageEnsureStatic('IRREGULAR').then(()=>{if((document.querySelector('section.on')||{}).id==='verbs')paintVerbs();}).catch(error=>window.TursoMain.notice(error.message,true)));
    if(id==='tenses'||id==='tense'||id==='marker')stageKick('grammar',()=>stageEnsureStatic('GRAMMAR').catch(error=>window.TursoMain.notice(error.message,true)));
    if(['allwords','phrasal','idioms'].includes(id))stageLibrarySection(id);
    if(id==='phrasal'||id==='idioms')stageKick('cards:personal',()=>stagePersonalPage(''));
    if(id==='music'||id==='song')stageKick('songs:list',()=>stageSongPage(''));
    if(id==='add'||id==='made')stageKick('cards:personal',()=>stagePersonalPage('').then(()=>{if((document.querySelector('section.on')||{}).id===id&&typeof paintAdded==='function')paintAdded();}));
    if(['setup','exam','errors','made','add','word','cardstat'].includes(id)){stageKick('progress',()=>stageProgressPage(''));stageKick('quizzes',()=>stageQuizPage(''));}
    if(id==='home'){stageKick('progress',()=>stageProgressPage(''));stageKick('cards:personal',()=>stagePersonalPage(''));for(const section of ['allwords','phrasal','idioms'])stageLibrarySection(section);}
    if(id==='days'||id==='material')stageKick('lesson:summary',()=>stageQueueLessons());
  }catch(error){window.TursoMain?.notice?.(error.message,true);}
}
function stageSpeakCount(index){
  const level=window.SPEAKOUT&&window.SPEAKOUT[index];
  const units=level&&Array.isArray(level.units)?level.units:[];
  return {units:units.length,lessons:units.reduce((n,unit)=>n+(unit&&Array.isArray(unit.lessons)?unit.lessons.length:0),0)};
}
function stagePaintSpeakLevels(){
  const title=document.getElementById('speakoutTitle'),sub=document.getElementById('speakoutSub'),list=document.getElementById('speakoutList');
  if(title)title.textContent='Speakout';
  if(sub)sub.textContent='Eight levels. Open a level to load it.';
  if(!list)return;
  list.className='decks';
  list.innerHTML=stageLevels().map((row,i)=>{
    const count=stageSpeakCount(i);
    const num=count.lessons?String(count.lessons):'';
    const label=count.units?count.units+(count.units===1?' unit':' units'):'Open';
    return '<button class="file-card" type="button" data-speak-level="'+i+'"><b>'+esc(row[0])+'</b><span class="num">'+num+'</span><span class="label">'+label+'</span></button>';
  }).join('');
}
function stageSpeakIncomplete(){return stageLevels().some((_,index)=>!(window.SPEAKOUT&&window.SPEAKOUT[index]&&window.SPEAKOUT[index].level));}
function stageLoadSpeak(view,level,unit,lesson,quiet){
  const name=(stageLevels()[level]||[])[0];
  const list=document.getElementById('speakoutList');
  if(!name)return;
  if(list&&view!=='levels')list.innerHTML='<p class="hint">Loading level…</p>';
  const version=(window.ContentCache.get('account:bootstrap')||{}).versions?.speakout||0;
  return window.ContentCache.load('speakout:'+name+':'+version,()=>fetch('/api/catalogs/SPEAKOUT?level='+encodeURIComponent(name),{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Unable to load this level.');return response.json();})).then(data=>{
    if(!Array.isArray(window.SPEAKOUT))window.SPEAKOUT=[];
    window.SPEAKOUT[level]=data.content;
    openSpeak(view,level,unit,lesson,quiet);
  }).catch(error=>{if(list)list.innerHTML='<p class="hint">'+esc(error.message)+' <button class="btn" type="button" data-stage-retry="speak">Retry</button></p>';});
}
function stagePaintTexts(after){
  const box=document.getElementById('textList');
  const cursor=after||window.ContentCache.get('texts:after')||'';
  if(box&&!loadTexts().length)box.innerHTML='<p class="hint">Loading…</p>';
  const epoch=stageListEpoch.texts,forId=viewAccount&&viewAccount.id||'',gen=viewGen,base=textsApiPath(forId);
  const path=base+(base.includes('?')?'&':'?')+'summary=1&limit=50'+(cursor?'&after='+encodeURIComponent(cursor):'');
  return window.ContentCache.load('texts:list:after:'+(cursor||'start'),()=>accountFetch(path)).then(data=>{
    if(gen!==viewGen)return data;
    if(stageListStale('texts',epoch,'texts:list'))return data;
    const seen=stageCycle('texts',cursor);
    const local=loadTexts();
    for(const row of data.texts||[]){
      if(row.stageId)seen.ids.add(row.stageId);
      const have=local.find(item=>item&&(item.id===row.id||item.stageId===row.stageId));
      if(have){
        const text=have.text,deferred=!!have.stageTextDeferred;
        Object.assign(have,row,{id:row.id||row.stageId});
        if(!deferred&&typeof text==='string'){have.text=text;have.stageTextDeferred=false;}
        else have.stageTextDeferred=true;
      }
      else local.push({...row,id:row.id||row.stageId,stageTextDeferred:true});
    }
    const next=!data.next&&seen.started?local.filter(row=>!row.stageId||seen.ids.has(row.stageId)):local;
    if(!data.next&&seen.started)stageSettled.texts=true;
    localStorage.setItem(TEXT_KEY,JSON.stringify(next));
    window.ContentCache.set('texts:after',data.next||'');
    renderTextList();paintTextCount();
    stagePaintCounts();
    stageFollow('texts',data.next,cursor,stagePaintTexts);
    for(const row of loadTexts())stageApplyLibraryBlocks(row,'text');
    stageFlushBlocks();stageScheduleHydration();
    return data;
  }).catch(error=>{if(box)box.innerHTML='<p class="hint">'+esc(error.message)+' <button class="btn" type="button" data-stage-retry="texts">Retry</button></p>';throw error;});
}
function stageOpenText(id){
  const item=loadTexts().find(row=>row.id===id);
  const box=document.getElementById('textList');
  if(!item||!item.stageId)return;
  const body=stageReadBlock(item.stageId,'body');
  if(!item.stageTextDeferred&&typeof item.text==='string'){stageStoreLibraryBlocks(item,'text');stageFlushBlocks();showText(id);return Promise.resolve();}
  if(body&&body.revision===(item.stageRevision||0)&&typeof body.data?.text==='string'){
    const list=loadTexts().map(row=>row.id===id?{...row,...body.data,stageTextDeferred:false}:row);
    localStorage.setItem(TEXT_KEY,JSON.stringify(list));showText(id);return Promise.resolve();
  }
  if(box)box.insertAdjacentHTML('afterbegin','<p class="hint" data-stage-text-status>Loading text…</p>');
  return window.ContentCache.load(stageItemKey('text',item.stageId),()=>accountFetch(stageItemPath('text',item.stageId))).then(data=>{
    const full=data.item||data;
    stageMergeLibraryItem('text',{...full,id});stageFlushBlocks();
    showText(id);
  }).catch(error=>{window.TursoMain.notice(error.message,true);if(box)box.innerHTML='<p class="hint">'+esc(error.message)+' <button class="btn" type="button" data-stage-retry="texts">Retry</button></p>';});
}
function stageEnter(id){
  const here=(typeof document!=='undefined'&&document.querySelector)?(document.querySelector('section.on')||{}).id:'';
  if(here===id)return;
  if(typeof visit==='function')visit(id);
  else if(typeof show==='function')show(id);
}
const stageParticles=new Set(['up','down','off','on','out','in','over','away','back','through','around','about','along','across','apart','aside','forward','together','under','ahead','after']);
function stagePhrasePlace(word,expressions){
  const key=String(word||'').trim().toLowerCase().replace(/\s+/g,' ');
  const same=(expressions||[]).filter(expr=>[expr.exactText,expr.canonicalForm,String(expr.canonicalForm||'').split(' + ')[0]].some(form=>String(form||'').trim().toLowerCase().replace(/\s+/g,' ')===key));
  if(same.some(expr=>expr.type==='IDIOM'))return 'idioms';
  if(same.some(expr=>expr.type==='PHRASAL_VERB'))return 'phrasal';
  if(typeof idiomWords!=='undefined'&&idiomWords.some(row=>String(row.en||'').trim().toLowerCase()===key))return 'idioms';
  if(typeof phrasalWords!=='undefined'&&phrasalWords.some(row=>String(row.en||'').trim().toLowerCase()===key))return 'phrasal';
  const bits=key.split(' ').filter(Boolean);
  if(bits.length>=2&&bits.length<=3&&stageParticles.has(bits[bits.length-1])&&/^[a-z]+(?:'[a-z]+)?$/.test(bits[0]))return 'phrasal';
  return 'mine';
}
async function stageAddLibraryPhrase(input,status,button){
  const word=input.value.trim();
  if(!word){status.textContent='Type a word or a phrase.';status.classList.add('bad');return;}
  status.classList.remove('bad');status.textContent='Looking up the phrase…';
  let expressions=[];
  try{const analyzed=await accountFetch('/api/analyze',{method:'POST',body:JSON.stringify({text:word,contentType:'TEXT'})});expressions=analyzed.expressions||[];}
  catch(error){if(error&&error.status&&error.status!==503){status.textContent=error.message;status.classList.add('bad');return;}}
  const place=stagePhrasePlace(word,expressions);
  const before=typeof loadAdded==='function'?loadAdded().length:0;
  await stageSaveWord(place,input,status,button,false);
  if(typeof loadAdded!=='function'||loadAdded().length===before)return;
  if(typeof paintDeckCounts==='function')paintDeckCounts();
  if(status&&!status.classList.contains('bad'))status.textContent='Added to '+(place==='idioms'?'Idioms':place==='phrasal'?'Phrasal verbs':'My words')+'.';
}
function stageOpenSong(song){
  const user=document.getElementById('songUser');
  const key=song.stageId||song.id;
  if(!song.stageLyricsDeferred&&typeof song.lyrics==='string'){stageStoreLibraryBlocks(song,'song');stageFlushBlocks();stageEnter('song');renderUserSong(song);return Promise.resolve();}
  const lyrics=stageReadBlock(key,'lyrics'),urls=stageReadBlock(key,'urls'),file=stageReadBlock(key,'file');
  if(lyrics&&urls&&lyrics.revision===(song.stageRevision||0)&&urls.revision===(song.stageRevision||0)){
    const fileData=file&&file.data&&file.revision===(song.stageRevision||0)?file.data:{};
    const list=loadSongs().map(row=>(row.stageId===key||row.id===song.id)?{...row,...fileData,...urls.data,...lyrics.data,stageLyricsDeferred:false}:row);
    writeSongs(list);stageEnter('song');renderUserSong(list.find(row=>row.stageId===key||row.id===song.id)||song);return Promise.resolve();
  }
  if(user)user.innerHTML='<p class="hint">Loading lyrics…</p>';
  stageEnter('song');
  return window.ContentCache.load(stageItemKey('song',key),()=>accountFetch(stageItemPath('song',key))).then(data=>{
    const full=data.item||data;
    stageMergeLibraryItem('song',full);stageFlushBlocks();
    const list=loadSongs();
    renderUserSong(list.find(row=>row.stageId===key||row.id===song.id)||{...song,...full,stageLyricsDeferred:false});
  }).catch(error=>{window.TursoMain.notice(error.message,true);if(user)user.innerHTML='<p class="hint">'+esc(error.message)+' <button class="btn" type="button" data-stage-retry="song" data-song-id="'+esc(song.id||'')+'">Retry</button></p>';});
}
function stageAccountBase(){return viewAccount&&viewAccount.id?'/api/admin/users/'+encodeURIComponent(viewAccount.id):'/api/me';}
function stageWho(){return (typeof viewAccount!=='undefined'&&viewAccount&&viewAccount.id)||(typeof authUser!=='undefined'&&authUser&&authUser.id)||'';}
function stageBlockKey(cardId,blockId){return 'block:'+stageWho()+':'+cardId+':'+blockId;}
function stageReadBlock(cardId,blockId){const row=cardId&&window.ContentCache?.get(stageBlockKey(cardId,blockId));return row&&typeof row==='object'?row:null;}
function stageWriteBlock(cardId,blockId,revision,data){
  if(!cardId||!window.ContentCache)return false;
  const prev=stageReadBlock(cardId,blockId);
  if(prev&&prev.revision>=revision)return false;
  const value={revision,data};
  if(typeof window.ContentCache.hold==='function')window.ContentCache.hold(stageBlockKey(cardId,blockId),value);
  else window.ContentCache.set(stageBlockKey(cardId,blockId),value);
  return true;
}
function stageFlushBlocks(){window.ContentCache?.flush?.();}
const stageBlockMiss=new Set();
function stageLocalLibraryBlock(item,kind,block){
  if(kind==='song'){
    if(block==='meta')return {id:item.id,title:item.title||'',artist:item.artist||'',level:item.level||'',archived:!!item.archived,stageScope:item.stageScope||''};
    if(block==='file')return item.fileName||item.stageLocalMedia?{fileName:item.fileName||'',fileType:item.fileType||'',stageLocalMedia:!!item.stageLocalMedia}:null;
    if(item.stageLyricsDeferred)return null;
    if(block==='urls')return {videoUrl:item.videoUrl||'',musicUrl:item.musicUrl||''};
    if(block==='lyrics'&&typeof item.lyrics==='string')return {lyrics:item.lyrics,marks:item.marks||{}};
  }
  if(kind==='text'){
    if(block==='meta')return {id:item.id,title:item.title||'',level:item.level||'',preview:item.preview||''};
    if(item.stageTextDeferred||typeof item.text!=='string')return null;
    if(block==='body')return {text:item.text};
  }
  return null;
}
function stageStoreLibraryBlocks(item,kind){
  const id=item&&item.stageId;if(!id)return;
  const rev=item.stageRevision||0;
  for(const block of kind==='song'?['meta','file','urls','lyrics']:['meta','body']){
    const data=stageLocalLibraryBlock(item,kind,block);
    if(data)stageWriteBlock(id,block,rev,data);
  }
}
function stageApplyLibraryBlocks(item,kind){
  const id=item&&item.stageId;if(!id)return false;
  const rev=item.stageRevision||0;let changed=false;
  for(const block of kind==='song'?['file','urls','lyrics']:['body']){
    if(stageLocalLibraryBlock(item,kind,block))continue;
    const saved=stageReadBlock(id,block);
    if(!saved||saved.revision<rev||!saved.data)continue;
    Object.assign(item,saved.data);
    if(saved.revision>rev)item.stageRevision=saved.revision;
    if(block==='lyrics')item.stageLyricsDeferred=false;
    if(block==='body')item.stageTextDeferred=false;
    changed=true;
  }
  stageStoreLibraryBlocks(item,kind);
  return changed;
}
function stageLibraryGap(item,kind){
  const id=item&&item.stageId;if(!id||stageBlockMiss.has(id+':'+kind))return false;
  stageApplyLibraryBlocks(item,kind);
  const rev=item.stageRevision||0;
  return (kind==='song'?['urls','lyrics']:['body']).some(block=>{const saved=stageReadBlock(id,block);return !saved||saved.revision<rev;});
}
function stageLessonGap(material){
  if(!material?.id||stageBlockMiss.has(material.id+':blocks'))return false;
  const rev=material.stageRevision||0,saved=stageReadBlock(material.id,'blocks');
  if(saved&&saved.revision>=rev){
    if(material.stageLessonDeferred||saved.revision>rev){material.blocks=saved.data?.blocks||[];material.stageLessonDeferred=false;if(saved.revision>rev)material.stageRevision=saved.revision;stageStampLesson(material);stageLoadedLessons.add(material);}
    return false;
  }
  if(!material.stageLessonDeferred&&Array.isArray(material.blocks)){stageWriteBlock(material.id,'blocks',rev,{blocks:material.blocks});return false;}
  return !!material.stageLessonDeferred;
}
function stageDictionaryGap(card){
  if(!card?.stageId||stageBlockMiss.has(card.stageId+':dictionary'))return false;
  const rev=card.stageRevision||0,saved=stageReadBlock(card.stageId,'dictionary');
  if(!card.stageDataDeferred){if(card.data)stageWriteBlock(card.stageId,'dictionary',rev,card);return false;}
  if(saved&&saved.data&&typeof saved.data==='object'&&saved.revision>=rev){Object.assign(card,saved.data,{stageDataDeferred:false});if(saved.revision>rev)card.stageRevision=saved.revision;return false;}
  return true;
}
function stageMissingLibrary(){
  const rows=[];
  if(typeof loadSongs==='function')for(const song of loadSongs())if(song&&!song.archived&&stageLibraryGap(song,'song'))rows.push({id:song.stageId,kind:'song'});
  if(typeof loadTexts==='function')for(const text of loadTexts())if(text&&stageLibraryGap(text,'text'))rows.push({id:text.stageId,kind:'text'});
  return rows;
}
function stageMissingLessons(){
  if(typeof authUser==='undefined'||!authUser||typeof lmLibrary==='undefined'||!lmLibrary)return [];
  return (lmLibrary.materials||[]).filter(row=>stageLessonGap(row));
}
function stageMissingDictionary(){
  const rows=[],seen=new Set();
  const take=card=>{if(!card?.stageId||seen.has(card.stageId)||!stageDictionaryGap(card))return;seen.add(card.stageId);rows.push(card);};
  const data=window.LESSON_DATA||{};
  for(const key of ['words','extraWords','lines21','ask07','phrases09','adverbs14','talk16','likes23','phrasalWords','idiomWords'])for(const card of data[key]||[])take(card);
  for(const card of window.IRREGULAR||[])take(card);
  if(typeof loadAdded==='function'&&typeof authUser!=='undefined'&&authUser)for(const card of loadAdded())take(card);
  return rows;
}
function stageMergeLibraryItem(kind,item){
  if(!item?.stageId)return;
  const rev=item.stageRevision||0;
  const blocks=kind==='text'
    ?{meta:{id:item.id,title:item.title||'',level:item.level||'',preview:(item.text||'').slice(0,140)},body:{text:item.text||''}}
    :{meta:{id:item.id,title:item.title||'',artist:item.artist||'',level:item.level||'',archived:!!item.archived,stageScope:item.stageScope||''},urls:{videoUrl:item.videoUrl||'',musicUrl:item.musicUrl||''},lyrics:{lyrics:item.lyrics||'',marks:item.marks||{}}};
  for(const [block,data] of Object.entries(blocks)){
    const prev=stageReadBlock(item.stageId,block);
    if(!prev||prev.revision<rev)stageWriteBlock(item.stageId,block,rev,data);
  }
  const list=kind==='text'?loadTexts():loadSongs();
  const have=list.find(row=>row&&(row.stageId===item.stageId||row.id===item.id));
  if(!have||(have.stageRevision||0)>rev)return;
  Object.assign(have,item);
  if(kind==='text')have.stageTextDeferred=false;else have.stageLyricsDeferred=false;
  if(kind==='text'){try{localStorage.setItem(TEXT_KEY,JSON.stringify(list));}catch(e){}}
  else if(typeof writeSongs==='function')writeSongs(list);
}
function stageMergeDictionary(full){
  if(!full?.stageId)return;
  const rev=full.stageRevision||0;
  stageWriteBlock(full.stageId,'dictionary',rev,{...full,stageDataDeferred:false});
  const apply=card=>{if(!card||card.stageId!==full.stageId)return;if((card.stageRevision||0)>rev)return;Object.assign(card,full,{stageDataDeferred:false});};
  const data=window.LESSON_DATA||{};
  for(const key of ['words','extraWords','lines21','ask07','phrases09','adverbs14','talk16','likes23','phrasalWords','idiomWords'])for(const card of data[key]||[])apply(card);
  for(const card of window.IRREGULAR||[])apply(card);
  if(typeof loadAdded==='function'){const list=loadAdded();let changed=false;for(const card of list)if(card.stageId===full.stageId&&(card.stageRevision||0)<=rev){Object.assign(card,full,{stageDataDeferred:false,word:full.en||card.word});changed=true;}if(changed&&typeof rememberAdded==='function')rememberAdded(list);}
}
function stageRepaintHydrated(){
  const on=typeof document!=='undefined'&&document.querySelector?(document.querySelector('section.on')||{}).id:'';
  if(on==='song'&&typeof renderUserSong==='function'){
    const user=document.getElementById('songUser');
    const song=user&&typeof loadSongs==='function'?loadSongs().find(row=>row.id===user.dataset.songId):null;
    if(song&&!song.stageLyricsDeferred&&user&&!user.querySelector('.lyric-text'))renderUserSong(song);
  }
  if(on==='textread'&&typeof showText==='function'&&typeof openTextId!=='undefined'&&openTextId){
    const item=typeof loadTexts==='function'?loadTexts().find(row=>row.id===openTextId):null;
    const box=document.getElementById('textRead');
    if(item&&!item.stageTextDeferred&&box&&/Loading text/.test(box.textContent||''))showText(openTextId);
  }
  if(on==='word'&&typeof renderWord==='function'&&typeof current!=='undefined'&&current&&!current.stageDataDeferred){
    const box=document.getElementById('wordView');
    if(box&&box.textContent==='Loading card…')renderWord(current);
  }
  if(on==='made'&&typeof renderMade==='function'&&typeof current!=='undefined'&&current&&!current.stageDataDeferred){
    const box=document.getElementById('madeView');
    if(box&&box.textContent==='Loading saved dictionary…')renderMade(current);
  }
}
let stageHydrateQueued=false,stageHydrateSerial=0;
function stageScheduleHydration(){
  if(stageHydrateQueued||typeof authUser==='undefined'||!authUser)return;
  stageHydrateQueued=true;
  const run=()=>stageHydrateStep().then(more=>{
    stageHydrateQueued=false;
    if(more)stageScheduleHydration();
  },()=>{stageHydrateQueued=false;});
  const queue=window.PreloadQueue;
  if(queue)queue.add({id:'blocks:hydrate:'+(++stageHydrateSerial),priority:7,run});
  else run();
}
async function stageHydrateStep(){
  try{
    const library=stageMissingLibrary();
    if(library.length){
      const managed=!!(viewAccount&&viewAccount.id);
      const batch=library.slice(0,managed?1:8);
      if(managed){
        const row=batch[0],data=await accountFetch(stageItemPath(row.kind==='text'?'text':'song',row.id));
        const item=data.item||data;
        if(item&&item.stageId)stageMergeLibraryItem(row.kind,item);else stageBlockMiss.add(row.id+':'+row.kind);
      }else{
        const data=await accountFetch('/api/library?ids='+batch.map(row=>encodeURIComponent(row.id)).join(','));
        const found=new Map((data.items||[]).map(item=>[item.stageId,item]));
        for(const row of batch){const item=found.get(row.id);if(item)stageMergeLibraryItem(row.kind,item);else stageBlockMiss.add(row.id+':'+row.kind);}
      }
      stageFlushBlocks();stageRepaintHydrated();
      return !!(stageMissingLibrary().length||stageMissingLessons().length||stageMissingDictionary().length);
    }
    const lesson=stageMissingLessons()[0];
    if(lesson){
      await stageFetchLesson(lesson);
      if(stageLessonGap(lesson))stageBlockMiss.add(lesson.id+':blocks');
      stageFlushBlocks();stageRepaintHydrated();
      return !!(stageMissingLessons().length||stageMissingDictionary().length);
    }
    const cards=stageMissingDictionary();
    if(!cards.length){stageFlushBlocks();return false;}
    const pub=cards.filter(card=>card.stagePublicCatalog).slice(0,8);
    if(pub.length){
      const response=await fetch('/api/catalogs/cards?ids='+pub.map(card=>encodeURIComponent(card.stageId)).join(','),{cache:'no-store'});
      if(!response.ok)throw new Error('Unable to load cards.');
      const data=await response.json(),found=new Map((data.cards||[]).map(card=>[card.stageId,card]));
      for(const card of pub){const full=found.get(card.stageId);if(full)stageMergeDictionary(full);else stageBlockMiss.add(card.stageId+':dictionary');}
    }else{
      const own=cards.slice(0,50);
      const data=await accountFetch(stageAccountBase()+'/cards/dictionary?ids='+own.map(card=>encodeURIComponent(card.stageId)).join(','));
      const found=new Map((data.cards||[]).map(card=>[card.stageId,card]));
      for(const card of own){const full=found.get(card.stageId);if(full)stageMergeDictionary(full);else stageBlockMiss.add(card.stageId+':dictionary');}
    }
    stageFlushBlocks();stageRepaintHydrated();
    return !!stageMissingDictionary().length;
  }catch(error){window.TursoMain?.notice?.(error.message,true);return false;}
}
function stageCachedPages(prefix){
  const cache=window.ContentCache;if(!cache||typeof cache.get!=='function')return [];
  const start=cache.get(prefix+'start');
  const pages=[];let page=start,guard=0;
  while(page&&guard++<80){
    pages.push(page);
    if(!page.next)break;
    page=cache.get(prefix+page.next);
  }
  return pages;
}
function stageSyncPersonal(){
  if(typeof loadAdded!=='function'||typeof rememberAdded!=='function')return;
  const remote=[];
  for(const page of stageCachedPages('cards:personal:after:'))for(const card of page.cards||[])if(card&&card.stageId)remote.push(card);
  if(!remote.length)return;
  const local=loadAdded();
  const key=row=>row.stageId+':'+(row.place||'mine');
  const sig=row=>[row.stageId,row.place||'mine',row.stageRevision||0,row.word||row.en||'',row.ru||''].join('\t');
  const localMap=new Map(local.filter(row=>row&&row.stageId).map(row=>[key(row),row]));
  const next=[];const seen=new Set();
  for(const card of remote){
    const id=key(card);seen.add(id);
    const prev=localMap.get(id);
    if(!prev||(card.stageRevision||0)>=(prev.stageRevision||0))next.push({...(prev||{}),...card,place:card.place||prev?.place||'mine',word:card.word||card.en||prev?.word||''});
    else next.push(prev);
  }
  for(const row of local)if(row&&(!row.stageId||!seen.has(key(row))))next.push(row);
  if(next.map(sig).join('\n')!==local.map(sig).join('\n'))rememberAdded(next);
}
function stageDropStale(previous,state){
  const cache=window.ContentCache;
  if(!cache||typeof cache.invalidate!=='function'||!previous||!state)return;
  const drop=prefix=>cache.invalidate(prefix);
  if((previous.stageAddedRevision||0)!==(state.stageAddedRevision||0))drop('cards:personal:');
  const prevV=previous.versions||{},nextV=state.versions||{};
  if(prevV.lessonData!==nextV.lessonData){drop('cards:words:');drop('cards:phrases:');drop('cards:idioms:');drop('library:');}
  if(prevV.irregular!==nextV.irregular)drop('irregular:');
  const prevC=previous.counts||{},nextC=state.counts||{};
  const changed=(countKey,revisionKey)=>(prevC[countKey]||0)!==(nextC[countKey]||0)||(prevC[revisionKey]||0)!==(nextC[revisionKey]||0);
  if(changed('songs','songRevision'))drop('songs:list:');
  if(changed('texts','textRevision'))drop('texts:list:');
  if(changed('quizzes','quizRevision'))drop('quizzes:');
  if(changed('progress','progressRevision'))drop('progress:');
  if(changed('lessons','lessonRevision'))drop('lesson:');
}
function stageRestoreSession(){try{stageRestoreSessionNow();}catch(e){}}
function stageRestoreSessionNow(){
  const data=window.LESSON_DATA||{};
  const take=(bank,pages)=>{
    for(const page of pages||[])for(const card of page.cards||[])if(!(data[bank]||[]).some(row=>row.stageId===card.stageId))data[bank].push(card);
  };
  take('words',stageCachedPages('cards:words:after:'));
  take('phrasalWords',stageCachedPages('cards:phrases:after:'));
  take('idiomWords',stageCachedPages('cards:idioms:after:'));
  if(!(window.IRREGULAR||[]).length){
    window.IRREGULAR=window.IRREGULAR||[];
    for(const page of stageCachedPages('irregular:page:'))for(const card of page.cards||[])if(!window.IRREGULAR.some(row=>row.stageId&&row.stageId===card.stageId))window.IRREGULAR.push(card);
  }
  if(typeof loadSongs==='function'&&!loadSongs().length){
    const list=loadSongs();
    for(const page of stageCachedPages('songs:list:after:'))for(const song of page.songs||[])if(!list.some(row=>row.stageId===song.stageId||row.id===song.id))list.push({...song,stageLyricsDeferred:true});
    if(typeof writeSongs==='function')writeSongs(list);
  }
  stageSyncPersonal();
  if(typeof loadTexts==='function'&&!loadTexts().length){
    const local=loadTexts();
    for(const page of stageCachedPages('texts:list:after:'))for(const row of page.texts||[])if(!local.some(item=>item.id===row.id||item.stageId===row.stageId))local.push({...row,id:row.id||row.stageId,stageTextDeferred:true});
    try{localStorage.setItem(TEXT_KEY,JSON.stringify(local));}catch(e){}
  }
  stagePaintCounts();
  if(typeof paintDeckCounts==='function')paintDeckCounts();
    if(typeof paintHomeStats==='function')paintHomeStats();
    if(typeof loadSongs==='function')for(const song of loadSongs())stageApplyLibraryBlocks(song,'song');
    if(typeof loadTexts==='function')for(const text of loadTexts())stageApplyLibraryBlocks(text,'text');
    if(typeof loadAdded==='function')for(const card of loadAdded())stageDictionaryGap(card);
    if(typeof lmLibrary!=='undefined'&&lmLibrary&&!(lmLibrary.materials||[]).length&&typeof lmApplyRemote==='function'){
      const summary=window.ContentCache?.get('lesson:summary');
      if(Array.isArray(summary)&&summary.length)lmApplyRemote(summary,{push:false});
    }
    if(typeof lmLibrary!=='undefined'&&lmLibrary)for(const material of lmLibrary.materials||[])stageLessonGap(material);
    stageFlushBlocks();
  }
function stageReadPrefs(){
  try{const saved=JSON.parse(localStorage.getItem('turso-main-prefs')||'{}');return saved&&typeof saved==='object'?saved:{};}catch(e){return {};}
}
function stageKeepSetting(change){
  const keys=['lyricSize','customThemes','dayLinks','demonstratives'];
  if(!change||change.op!=='put-setting'||!keys.includes(change.key)||(typeof viewAccount!=='undefined'&&viewAccount))return false;
  const prefs=stageReadPrefs();
  prefs[change.key]=change.value;
  try{localStorage.setItem('turso-main-prefs',JSON.stringify(prefs));}
  catch(e){if(change.key==='customThemes'&&Array.isArray(change.value)){prefs.customThemes=change.value.map(row=>({...row,photo:row&&typeof row.photo==='string'&&row.photo.indexOf('stage-local/themes/')===0?row.photo:''}));try{localStorage.setItem('turso-main-prefs',JSON.stringify(prefs));}catch(err){}}}
  return true;
}
function stageApplyPrefs(){
  const prefs=stageReadPrefs();
  if(prefs.lyricSize){
    try{localStorage.setItem('enquiz-lyric-size',String(prefs.lyricSize));}catch(e){}
    if(typeof lyricSize!=='undefined')lyricSize=Number(prefs.lyricSize)||lyricSize;
    if(typeof applyLyricSize==='function')applyLyricSize(document);
  }
  if(Array.isArray(prefs.customThemes)&&typeof installCustomThemes==='function'){
    const login=typeof authUser!=='undefined'&&authUser&&authUser.login?authUser.login:'';
    const own=prefs.customThemes.filter(row=>{const owner=row&&row.owner?String(row.owner):'';return login?!owner||owner===login:!owner;});
    if(own.length){installCustomThemes(own);if(typeof paintThemeSegs==='function')paintThemeSegs();}
  }
  if(prefs.dayLinks){try{localStorage.setItem('enquiz-day-links',JSON.stringify(prefs.dayLinks));}catch(e){}}
  if(prefs.demonstratives){try{localStorage.setItem('enquiz-demonstratives',JSON.stringify(prefs.demonstratives));}catch(e){}if(typeof window.paintDemonstratives==='function'&&document.getElementById('demonstratives')?.classList.contains('on'))window.paintDemonstratives();}
}
function stageApplyBootstrap(state){
  stageDropStale(window.ContentCache?.get('account:bootstrap'),state);
  window.ContentCache?.set('account:bootstrap',state);
  stageSetActivity(state.stageActivity);
  if(state.stats){
    if(state.stats.lyricSize)localStorage.setItem('enquiz-lyric-size',String(state.stats.lyricSize));
    if(typeof installHiddenLessons==='function')installHiddenLessons(state.stats.hiddenLessons);
    if(typeof installAllowedLessons==='function')installAllowedLessons(state.stats.allowedLessons);
    if(state.stats.dayLinks)localStorage.setItem(LINK_KEY,JSON.stringify(state.stats.dayLinks));
    if(state.stats.demonstratives)localStorage.setItem('enquiz-demonstratives',JSON.stringify(state.stats.demonstratives));
  }
  stageApplyPrefs();
  if(state.stats&&Array.isArray(state.stats.customThemes)&&typeof installCustomThemes==='function')installCustomThemes(state.stats.customThemes);
  const paintedRoot=typeof document!=='undefined'?document.documentElement:null;
  const painted=paintedRoot&&paintedRoot.dataset?paintedRoot.dataset.paintedTheme:'';
  const holdPaint=!!painted&&!(typeof viewAccount!=='undefined'&&viewAccount);
  if(!holdPaint&&state.stats&&typeof state.stats.theme==='string'&&typeof applyTheme==='function')applyTheme(state.stats.theme,{sync:false});
  else if(holdPaint&&typeof cacheThemePicture==='function'&&typeof loadCustomThemes==='function'){const row=loadCustomThemes().find(item=>item&&item.id===painted);if(row)cacheThemePicture(row);}
  stagePaintCounts(state.counts);
  if(typeof paintHomeAccount==='function')paintHomeAccount();
  stageStartPreload();
}
let stagePreloadOn=false;
function stageStartPreload(){
  if(stagePreloadOn)return;
  stagePreloadOn=true;
  const here=(document.querySelector('section.on')||{}).id||'home';
  const later=typeof setTimeout==='function'?setTimeout:(fn)=>fn();
  later(()=>stageDemand(here),0);
  later(()=>{
    const cached=id=>!!(window.ContentCache?.has(id+':after:start')||window.ContentCache?.has(id)||window.ContentCache?.get('library:opened:'+id.replace('library:','')));
    const add=(id,priority,run)=>{if(cached(id))return;const queue=window.PreloadQueue;if(queue)queue.add({id,priority,run});else run();};
    add('progress',3,()=>stageProgressPage(''));
    add('songs:list',4,()=>stageSongPage(''));
    add('cards:personal',4,()=>stagePersonalPage(''));
    add('quizzes',5,()=>stageQuizPage(''));
    add('texts:list',5,()=>stagePaintTexts(''));
    add('lesson:summary',5,()=>stageQueueLessons());
    add('library:allwords',6,()=>stageLibraryBatch('allwords'));
    add('library:phrasal',6,()=>stageLibraryBatch('phrasal'));
    add('library:idioms',6,()=>stageLibraryBatch('idioms'));
    add('irregular:page',6,()=>stageIrregularPage(''));
    stageScheduleHydration();
  },400);
}
function stageQueueLibrary(section,depth){
  return stageLibraryBatch(section).then(page=>{if(page&&page.next&&depth<8)window.PreloadQueue.add({id:'library:'+section+':'+page.next,priority:6,run:()=>stageQueueLibrary(section,depth+1)});return page;});
}
function stageFetchLesson(material){
  if(!material?.id||!authUser)return Promise.resolve();
  const saved=stageReadBlock(material.id,'blocks');
  if(saved&&saved.revision===(material.stageRevision||0)){
    const index=lmLibrary?.materials?.findIndex(row=>row.id===material.id)??-1;
    if(index>=0){const opened={...lmLibrary.materials[index],blocks:saved.data?.blocks||[],stageLessonDeferred:false};stageStampLesson(opened);lmLibrary.materials[index]=opened;stageLoadedLessons.add(opened);}
    return Promise.resolve();
  }
  const target=viewAccount?.id||'',actor=authUser.id,path=target?'/api/admin/users/'+encodeURIComponent(target)+'/lessons':'/api/lessons';
  const cacheKey='lesson:'+actor+':'+target+':'+material.id+':'+material.stageRevision;
  return window.ContentCache.load(cacheKey,()=>accountFetch(path+'?id='+encodeURIComponent(material.id))).then(data=>{
    const full=(data.materials||[]).find(row=>row.id===material.id);
    if(!full||!lmLibrary)return data;
    const index=lmLibrary.materials.findIndex(row=>row.id===material.id);
    if(index>=0){const opened={...full,stageLessonDeferred:false,stageLessonOwner:actor+':'+target};stageStampLesson(opened);lmLibrary.materials[index]=opened;stageLoadedLessons.add(opened);stageWriteBlock(material.id,'blocks',full.stageRevision||material.stageRevision||0,{blocks:full.blocks||[]});stageFlushBlocks();}
    return data;
  });
}
function stageQueueLessons(){
  return Promise.resolve(stagePullLessons()).then(()=>{
    window.ContentCache?.set('lesson:summary',lmLibrary?.materials||[]);
    if((document.querySelector('section.on')||{}).id==='days'&&typeof paintLmDays==='function')paintLmDays();
    for(const material of lmLibrary?.materials||[])stageLessonGap(material);
    stageFlushBlocks();stageScheduleHydration();
  });
}
function stagePersonalPage(after){
  const epoch=stageListEpoch.cards,cursor=after||'';
  return window.ContentCache.load('cards:personal:after:'+(cursor||'start'),()=>accountFetch(stageAccountBase()+'/cards?limit=50'+(cursor?'&after='+encodeURIComponent(cursor):''))).then(page=>{
    if(stageListStale('cards',epoch,'cards:personal'))return page;
    const seen=stageCycle('cards',cursor);
    const list=loadAdded();
    for(const card of page.cards||[]){
      const id=(card.stageId||'')+':'+(card.place||'mine');
      if(card.stageId)seen.ids.add(id);
      const index=list.findIndex(row=>row.stageId===card.stageId&&(row.place||'mine')===(card.place||'mine'));
      if(index<0)list.push(card);
      else if((card.stageRevision||0)>=(list[index].stageRevision||0))list[index]={...list[index],...card,place:card.place||list[index].place,word:card.word||card.en||list[index].word};
    }
    const next=!page.next&&seen.started?list.filter(row=>!row.stageId||seen.ids.has(row.stageId+':'+(row.place||'mine'))):list;
    if(!page.next&&seen.started)stageSettled.mine=true;
    rememberAdded(next);
    const on=(document.querySelector('section.on')||{}).id;
    if((on==='add'||on==='made'||on==='phrasal'||on==='idioms')&&typeof paintAdded==='function')paintAdded();
    if(typeof paintDeckCounts==='function')paintDeckCounts();
    stagePaintCounts();
    stageRefreshHome();
    stageFollow('cards',page.next,cursor,stagePersonalPage);
    stageScheduleHydration();
    return page;
  });
}
function stageQuizPage(after){
  const epoch=stageListEpoch.quizzes,cursor=after||'';
  return window.ContentCache.load('quizzes:after:'+(cursor||'start'),()=>accountFetch(stageAccountBase()+'/quizzes?limit=50'+(cursor?'&after='+encodeURIComponent(cursor):''))).then(page=>{
    if(stageListStale('quizzes',epoch,'quizzes:'))return page;
    const seen=stageCycle('quizzes',cursor);
    const map=typeof loadCardQuizzes==='function'?loadCardQuizzes():{};
    for(const quiz of page.quizzes||[]){
      if(quiz.id)seen.ids.add(quiz.id);
      const key=String(quiz.word||'').toLowerCase();map[key]=map[key]||[];
      const index=map[key].findIndex(row=>row.id===quiz.id);
      if(index<0)map[key].push(quiz);
      else if((quiz.stageRevision||0)>=(map[key][index].stageRevision||0))map[key][index]=quiz;
    }
    if(!page.next&&seen.started)for(const key of Object.keys(map))map[key]=(map[key]||[]).filter(row=>!row.stageRevision||seen.ids.has(row.id));
    if(typeof installCardQuizzes==='function')installCardQuizzes(map);
    stageFollow('quizzes',page.next,cursor,stageQuizPage);
    return page;
  });
}
function stageProgressPage(after){
  const epoch=stageProgressEpoch,cursor=after||'';
  return window.ContentCache.load('progress:after:'+(cursor||'start'),()=>accountFetch(stageAccountBase()+'/progress?limit=50'+(cursor?'&after='+encodeURIComponent(cursor):''))).then(page=>{
    if(epoch!==stageProgressEpoch){window.ContentCache?.invalidate?.('progress:');return page;}
    const seen=stageCycle('progress',cursor);
    const learned=JSON.parse(localStorage.getItem(LEARNED_KEY)||'[]');
    for(const word of page.learned||[]){seen.ids.add(word);if(!learned.includes(word))learned.push(word);}
    const variants=JSON.parse(localStorage.getItem(VARIANT_KEY)||'{}');
    for(const [word,value] of Object.entries(page.variants||{})){seen.extra.set(word,value);variants[word]=value;}
    const mistakes=typeof loadMistakeMap==='function'?loadMistakeMap():{};
    for(const row of page.mistakes||[])if(row&&row.en&&row.type){const key=String(row.en).toLowerCase()+'|'+row.type;if(row.misses>0){seen.extra.set('mistake:'+key,row);mistakes[key]=row;}}
    if(!page.next&&seen.started){
      localStorage.setItem(LEARNED_KEY,JSON.stringify([...seen.ids]));
      localStorage.setItem(VARIANT_KEY,JSON.stringify(Object.fromEntries([...seen.extra].filter(([key])=>!key.startsWith('mistake:')))));
      const fresh={};for(const [key,value] of seen.extra)if(key.startsWith('mistake:'))fresh[key.slice(8)]=value;
      localStorage.setItem(MISTAKE_KEY,JSON.stringify(fresh));
    }else{
      localStorage.setItem(LEARNED_KEY,JSON.stringify(learned));
      localStorage.setItem(VARIANT_KEY,JSON.stringify(variants));
      localStorage.setItem(MISTAKE_KEY,JSON.stringify(mistakes));
    }
    stageRefreshHome();
    stageFollow('progress',page.next,cursor,stageProgressPage);
    return page;
  });
}
function stageSongPage(after){
  const epoch=stageListEpoch.songs,cursor=after||'';
  return window.ContentCache.load('songs:list:after:'+(cursor||'start'),()=>accountFetch(stageAccountBase()+'/songs?limit=50'+(cursor?'&after='+encodeURIComponent(cursor):''))).then(page=>{
    if(stageListStale('songs',epoch,'songs:list'))return page;
    const seen=stageCycle('songs',cursor);
    const list=loadSongs();
    for(const song of page.songs||[]){
      if(song.stageId)seen.ids.add(song.stageId);
      const have=list.find(row=>row&&(row.stageId===song.stageId||row.id===song.id));
      if(have){
        const lyrics=have.lyrics,marks=have.marks,video=have.videoUrl,music=have.musicUrl,deferred=!!have.stageLyricsDeferred;
        Object.assign(have,song);
        if(!deferred){have.lyrics=typeof lyrics==='string'?lyrics:have.lyrics;have.marks=marks||have.marks;have.videoUrl=video??have.videoUrl;have.musicUrl=music??have.musicUrl;have.stageLyricsDeferred=false;}
        else have.stageLyricsDeferred=true;
        stageApplyLibraryBlocks(have,'song');
      }else{
        list.push({...song,stageLyricsDeferred:true});
        stageApplyLibraryBlocks(list[list.length-1],'song');
      }
    }
    const next=!page.next&&seen.started?list.filter(row=>!row.stageId||seen.ids.has(row.stageId)):list;
    if(!page.next&&seen.started)stageSettled.songs=true;
    writeSongs(next);
    if(typeof paintLyrics==='function')paintLyrics();
    stagePaintCounts();
    stageFollow('songs',page.next,cursor,stageSongPage);
    stageFlushBlocks();stageScheduleHydration();
    return page;
  });
}
function stageFetchSpeak(index){
  const name=(stageLevels()[index]||[])[0];
  if(!name)return Promise.resolve();
  const version=(window.ContentCache.get('account:bootstrap')||{}).versions?.speakout||0;
  return window.ContentCache.load('speakout:'+name+':'+version,()=>fetch('/api/catalogs/SPEAKOUT?level='+encodeURIComponent(name),{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Unable to load this level.');return response.json();})).then(data=>{
    if(!Array.isArray(window.SPEAKOUT))window.SPEAKOUT=[];
    window.SPEAKOUT[index]=data.content;
    if(index+1<stageLevels().length)window.PreloadQueue.add({id:'speakout:'+stageLevels()[index+1][0],priority:6,run:()=>stageFetchSpeak(index+1)});
    return data;
  });
}
