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
  return '<iframe class="player tall" src="'+esc(media.src)+'" title="'+esc(label)+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>';
}
let stageDictionaryToken=0;
async function stageHydrateCatalogWord(card){
  current=card;const token=++stageDictionaryToken,generation=viewGen;
  const box=document.getElementById('wordView');if(box)box.textContent='Loading card…';show('word');
  try{
    const full=await window.TursoMain.catalogDictionary(card);
    if(token!==stageDictionaryToken||generation!==viewGen||current!==card||document.querySelector('section.on')?.id!=='word')return;
    Object.assign(card,full,{stageDataDeferred:false});window.TursoMain.register(card);renderWord(card);
  }catch(error){if(token===stageDictionaryToken&&generation===viewGen){if(box)box.textContent=error.message;window.TursoMain.notice(error.message,true);}}
}
async function stageHydrateMade(item){
  if(!item.stagePublicCatalog&&(!authUser||!accountReady||viewSwitching))return;
  const token=++stageDictionaryToken,generation=viewGen,target=viewAccount?.id||'',actor=authUser.id;
  const box=document.getElementById('madeView');if(box)box.textContent='Loading saved dictionary…';
  show('made');
  try{
    const full=await (item.stagePublicCatalog?window.TursoMain.catalogDictionary(item):window.TursoMain.dictionary(item,target));
    if(token!==stageDictionaryToken||generation!==viewGen||actor!==authUser?.id||target!==(viewAccount?.id||'')||document.querySelector('section.on')?.id!=='made')return;
    if(full.stageId!==item.stageId||full.stageRevision!==item.stageRevision)throw new Error('Dictionary changed. Reload the profile before opening it.');
    const ready={...item,...full,word:full.en,stageDataDeferred:false};
    const rows=loadAdded();let changed=false;
    for(let i=0;i<rows.length;i++)if(rows[i].stageId===ready.stageId&&rows[i].stageRevision===ready.stageRevision){rows[i]={...rows[i],...ready,place:rows[i].place};changed=true;}
    if(changed)rememberAdded(rows);
    window.TursoMain.register(ready);renderMade(ready);
  }catch(error){if(token===stageDictionaryToken&&generation===viewGen){if(box)box.textContent=error.message;window.TursoMain.notice(error.message,true);}}
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
    lmServerReady=true;lmApplyRemote(next,{push:false});
  }catch(error){if(generation===viewGen)window.TursoMain.notice(error.message,true);}
}
async function stageOpenLesson(material){
  if(!authUser||!accountReady||viewSwitching||!lmLessonVisibleToViewer(material))return;
  const generation=viewGen,target=viewAccount?.id||'',actor=authUser.id,token=++stageLessonOpenToken,section=document.querySelector('section.on')?.id;
  const key=actor+':'+target+':'+generation+':'+material.id+':'+material.stageRevision;
  const path=target?'/api/admin/users/'+encodeURIComponent(target)+'/lessons':'/api/lessons';
  const root=document.getElementById('material');if(root)root.inert=true;
  try{
    if(!stageLessonLoads.has(key))stageLessonLoads.set(key,accountFetch(path+'?id='+encodeURIComponent(material.id)));
    const data=await stageLessonLoads.get(key);
    if(token!==stageLessonOpenToken||generation!==viewGen||target!==(viewAccount?.id||'')||actor!==authUser?.id||viewSwitching||section!==document.querySelector('section.on')?.id)return;
    const full=data.materials?.find(row=>row.id===material.id);if(!full)throw new Error('Lesson not found.');
    const index=lmLibrary.materials.findIndex(row=>row===material);if(index<0)return;
    lmLibrary.materials[index]={...full,stageLessonDeferred:false,stageLessonOwner:actor+':'+target};
    stageLoadedLessons.add(lmLibrary.materials[index]);
    lmOpenLesson(material.id);
  }catch(error){if(token===stageLessonOpenToken&&generation===viewGen)window.TursoMain.notice(error.message,true);}
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
  return canEditLessons()||!!(viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching&&card?.stageScope==='profile'&&card.stageId);
}
function stageCanManageAdded(card){
  return !!(card?.stageId&&viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching);
}
function stageAddedActions(item){
  if(stageCanManageAdded(item))return '<span class="edit-actions">'+(stageCanEditTranslation(item)?'<button class="icon-btn" type="button" data-edit-toggle aria-label="Edit">'+actionIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>')+'</button>':'')+'<button class="icon-btn" type="button" data-card-delete aria-label="Remove from student cards">×</button></span>';
  return canEditLessons()?editActions():'<span class="edit-actions"><button class="icon-btn" type="button" data-card-delete aria-label="Remove from my cards">×</button></span>';
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
function stageStampLinks(list,revision){for(const item of list)item.stageLinksRevision=revision;rememberAdded(list);paintAdded();paintAllWords();if(typeof paintHomeStats==='function')paintHomeStats();}
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
  return window.TursoMain.perform(async()=>{
    const card=await window.TursoMain.findCard(word);
    if(generation!==(typeof viewGen==='number'?viewGen:0)||accountId!==(viewAccount?.id||''))return;
    if(loadAdded().some(row=>row.stageId===card.id&&(row.place||'mine')===place))throw new Error('Эта карточка уже добавлена на страницу.');
    const result=managed?await window.TursoMain.linkManagedCard(accountId,card,place):await window.TursoMain.linkCard(card,place);
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
let stageActivity={tracked:false,seconds:0,examPass:0},stageTimeAt=0,stageTimeSeconds=0;
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
function stageOwnReady(){return !!(authUser&&accountReady&&!viewAccount&&!viewSwitching);}
function stageInstallLibrary(item,kind){
  const list=kind==='text'?loadTexts():loadSongs(),at=list.findIndex(row=>row.id===item.id);
  if(at<0)list.unshift(item);else list[at]=item;
  if(kind==='text'){localStorage.setItem(TEXT_KEY,JSON.stringify(list));paintTextCount();}
  else{writeSongs(list);paintLyrics();}
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
    if(analyze)document.getElementById('textReadStatus').textContent='Текст сохранён. Внешний анализатор в тестовом контуре пока отключён.';
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
  if(pendingLyricFile||pendingEditFile){window.TursoMain.unsupported('Файл песни: сначала сохраните метаданные');return;}
  return window.TursoMain.perform(async()=>{
    const result=managed?await window.TursoMain.saveManagedLibrary(accountId,item,'song',changes):await window.TursoMain.saveLibrary(item,'song',changes);
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    stageInstallLibrary(result.item,'song');stageSongDraft=null;if(!existingId&&!managed)trackEvent('song','lyrics','add');
    renderUserSong(result.item);show('song');
  },existingId?document.querySelector('#songUser [data-lyric-edit-status]'):document.getElementById('lyricStatus'));
}
function stageSaveSongMeta(){
  const managed=stageManagedSongReady();if(!stageOwnReady()&&!managed)return;
  const accountId=viewAccount?.id||'',generation=viewGen;
  const item=loadSongs().find(row=>row.id===document.getElementById('songUser').dataset.songId);if(!item)return;
  if(pendingEditFile||editFileRemoved){window.TursoMain.unsupported('Изменение файла песни');return;}
  const read=key=>document.querySelector('#songUser [data-lyric-'+key+']').value.trim();
  return window.TursoMain.perform(async()=>{
    const changes={title:read('title'),artist:read('artist'),videoUrl:read('video'),musicUrl:read('music')};
    const result=managed?await window.TursoMain.saveManagedLibrary(accountId,item,'song',changes):await window.TursoMain.saveLibrary(item,'song',changes);
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    stageInstallLibrary(result.item,'song');renderUserSong(result.item);
  },document.querySelector('#songUser [data-lyric-meta-status]'));
}
function stagePaintLocalAudio(song,box){
  if(!song?.stageLocalMedia||!box)return false;
  // Never prefer an IndexedDB blob over the acknowledged server version.
  box.innerHTML=filePlayerHtml(songFilePath(song.stageId),song.fileType,song.fileName);return true;
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
function stageMountSongAudio(song,box){
  if(!box||!stageOwnReady()||song?.stageScope!=='profile'||!song.stageId||!window.TursoMain.mediaAllowed())return;
  box.parentNode.querySelector('[data-stage-audio-form]')?.remove();
  const form=document.createElement('form');form.dataset.stageAudioForm='';
  form.innerHTML='<details><summary>Аудиофайл (тест)</summary><p class="hint">MP3, WAV или OGG, до 10 MiB. Старый файл не удаляется. Не доступно на рабочем сайте.</p><input type="file" name="audio" accept="audio/mpeg,audio/wav,audio/ogg" required><button class="btn" type="submit">Сохранить / заменить аудио</button><p role="status"></p></details>';
  box.insertAdjacentElement('afterend',form);
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!stageOwnReady())return;
    const file=form.elements.audio.files[0];if(!file)return;
    void window.TursoMain.perform(async()=>{
      const result=await window.TursoMain.uploadSongAudio(song,file);
      stageInstallLibrary(result.item,'song');renderUserSong(result.item);
    },form.querySelector('[role="status"]'));
  });
}
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
  window.TursoMain.perform(async()=>{
    await window.TursoMain.writeQuiz(word,quiz,!!del);
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
function stageSaveLesson(published){
  if(!canEditLessons()||viewAccount||viewSwitching||!lmState){
    window.TursoMain.notice('Урок не отправлен: дождитесь загрузки собственного профиля учителя и откройте редактор.',true);return Promise.resolve();
  }
  clearTimeout(lmSaveTimer);
  const current=lmState,draft=JSON.parse(JSON.stringify(current));
  if(published!==undefined){draft.published=published;draft.mode=published?'preview':'edit';}
  return window.TursoMain.perform(async()=>{
    await window.TursoMain.saveLesson(draft);
    Object.assign(current,draft);lmState=current;lmKeepLesson();lmPersist();
    lmShow(current.published?'preview':'edit');lmNote('Сохранено в тестовую Turso.');
  },document.getElementById('lmNote'));
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
  if(!canEditLessons()||viewAccount||viewSwitching||!file)return;
  const block=lmBlock(id);if(!block)return;
  const current=lmState,generation=viewGen;
  return window.TursoMain.perform(async()=>{
    await window.TursoMain.uploadLessonFile(current,block,file);
    if(lmState!==current||viewGen!==generation||viewAccount)return;
    if(lmFiles[id]){URL.revokeObjectURL(lmFiles[id]);delete lmFiles[id];}
    lmKeepLesson();lmPersist();lmRenderEditor();lmNote('Файл сохранён в изолированном тестовом хранилище; ссылка — в тестовой Turso.');
  },document.getElementById('lmNote'));
}
function stageClearLessonFile(id){
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
    paintHomeStats();
    if(document.getElementById('cardstat')?.classList.contains('on'))paintStat();
  }
  if(job.kind==='response'&&result.response?.checked){
    const response=result.response,items=response.items||[];
    if(items.length&&items.every(item=>item.marked===true&&typeof item.correct==='boolean')){
      for(const item of items)trackEvent('answer','Lesson exercise',item.correct?'ok':'miss');
    }else if(typeof response.score==='string'&&/^\d+ \/ \d+$/.test(response.score)){
      const [correct,total]=response.score.split(' / ').map(Number);
      if(total===items.length&&correct<=total)for(let i=0;i<total;i++)trackEvent('answer','Lesson quiz',i<correct?'ok':'miss');
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
