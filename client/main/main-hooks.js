// App-private hooks appended to the isolated copy of preview.js.
let stageCopyJob=null;
function stageCopyOptions(select,rows,preferred){
  select.innerHTML=rows.map(row=>'<option value="'+row.id+'">'+esc(row.title||'Untitled')+'</option>').join('');
  if(rows.some(row=>String(row.id)===String(preferred)))select.value=String(preferred);
}
function stageCopyDestinations(){
  if(!stageCopyJob)return;
  const kind=document.getElementById('contentCopyKind').value;
  const container=document.getElementById('contentCopyContainer'),item=document.getElementById('contentCopyItem');
  const containerLabel=document.getElementById('contentCopyContainerLabel'),itemLabel=document.getElementById('contentCopyItemLabel');
  const tabLabel=document.getElementById('contentCopyTabLabel');
  containerLabel.hidden=kind==='new-exam';itemLabel.hidden=!['lesson','exam-block'].includes(kind);tabLabel.hidden=kind!=='lesson';
  if(kind==='new-exam'){document.getElementById('contentCopySubmit').disabled=false;return;}
  const group=kind==='group'||kind==='lesson';
  containerLabel.firstChild.textContent=group?'Group':'Exam';itemLabel.firstChild.textContent=group?'Lesson':'Examination block';
  const rows=group?classGroups.filter(row=>Number.isSafeInteger(row.id)):examLoad().filter(row=>Number.isSafeInteger(row.id));
  const previous=container.value;stageCopyOptions(container,rows,previous);
  if(kind==='lesson'){
    const selected=classGroups.find(row=>String(row.id)===container.value);
    const lessons=(lmLibrary?.materials||[]).filter(row=>selected?.lessonIds.includes(row.id)&&Number.isSafeInteger(row.id));
    stageCopyOptions(item,lessons,item.value);
  }else if(kind==='exam-block'){
    const selected=examFind(Number(container.value));
    stageCopyOptions(item,(selected?.blocks||[]).map(block=>({id:block.id,title:block.doc?.title||block.title||'Examination block'})),item.value);
  }
  const ready=!!container.value&&(!['lesson','exam-block'].includes(kind)||!!item.value);
  document.getElementById('contentCopySubmit').disabled=!ready;
  document.getElementById('contentCopyStatus').textContent=ready?'':'No saved destination available.';
}
function stageCloseCopy(){
  if(stageCopyJob?.busy)return;
  const trigger=stageCopyJob?.trigger;stageCopyJob=null;
  document.getElementById('contentCopyDialog').hidden=true;
  if(trigger?.isConnected)trigger.focus();
}
async function stageOpenCopy(token,trigger){
  if(!canEditLessons()||!accountReady||viewSwitching)return;
  const [type,rawId,parent,rawParent]=String(token||'').split(':'),id=Number(rawId);
  if(!Number.isSafeInteger(id)||id<1)return;
  const source={type,id,...(parent?{parent,parentId:Number(rawParent)}:{})};
  const active=lmState&&(type==='lesson'&&lmState.id===id||type==='exam-block'&&lmState.examOwned&&lmState.id===id||type==='material'&&lmState.id===source.parentId);
  if(active&&lmState.mode==='edit'&&(lmState.examOwned||window.LearningMain.lessonDirty(lmState))){window.LearningMain.notice('Save draft or Publish before copying your changes.',true);return;}
  let title='Material';
  if(type==='lesson')title=lmLibrary?.materials?.find(row=>row.id===id)?.title||title;
  if(type==='exam')title=examFind(id)?.title||title;
  if(type==='exam-block')for(const exam of examLoad()){const block=exam.blocks?.find(row=>row.id===id);if(block)title=block.doc?.title||block.title||title;}
  if(type==='material'){const block=lmState?.blocks?.find(row=>row.id===id);title=block?.title||lmSummary(block||{})||title;}
  const job=stageCopyJob={source,trigger,actor:authUser.id,generation:viewGen,busy:false};
  const dialog=document.getElementById('contentCopyDialog');dialog.hidden=false;
  document.getElementById('contentCopySource').textContent=title;
  document.getElementById('contentCopyName').value=(title+' - copy').slice(0,120);
  document.getElementById('contentCopyStatus').textContent='Loading destinations…';
  document.getElementById('contentCopySubmit').disabled=true;
  document.getElementById('contentCopyFields').disabled=true;
  try{
    await Promise.all([classGroupsReady?Promise.resolve():groupPull(),examReady?Promise.resolve():examPull()]);
    if(stageCopyJob!==job||job.actor!==authUser?.id||job.generation!==viewGen){if(stageCopyJob===job)stageCloseCopy();return;}
    const kinds=type==='material'?[{id:'lesson',title:'Lesson'},{id:'exam-block',title:'Examination block'}]:type==='exam'?[{id:'new-exam',title:'Exams - new exam'},{id:'group',title:'Group - new lessons'}]:[{id:'group',title:'Group - new lesson'},{id:'exam',title:'Exam - new examination block'}];
    stageCopyOptions(document.getElementById('contentCopyKind'),kinds);
    document.getElementById('contentCopyTab').value=type==='material'?(lmState?.blocks?.find(row=>row.id===id)?.tab||'overview'):'overview';
    stageCopyDestinations();document.getElementById('contentCopyName').focus();
  }catch(error){document.getElementById('contentCopyStatus').textContent=error.message;}
  finally{if(stageCopyJob===job)document.getElementById('contentCopyFields').disabled=false;}
}
async function stageRefreshCopies(detail){
  if(detail.actorId!==authUser?.id)return;
  const generation=viewGen,target=viewAccount?.id||'';
  for(const key of ['account:bootstrap','lesson:','block:','library:summary'])window.ContentCache?.invalidate?.(key);
  const destinationLesson=(detail.ids||[]).find(row=>row.type==='lesson')?.id;
  const destinationBlock=(detail.ids||[]).find(row=>row.type==='block')?.id;
  await Promise.all([stagePullLessons().then(()=>groupPull(true)),examPull(true)]);
  if(detail.actorId!==authUser?.id||generation!==viewGen||target!==(viewAccount?.id||''))return;
  if(detail.destination==='lesson'&&lmState?.id===destinationLesson&&!lmState.examOwned){
    const data=await accountFetch('/api/lessons?id='+destinationLesson),fresh=data.materials?.find(row=>row.id===destinationLesson);
    if(fresh){lmState=fresh;lmKeepLesson();paintMaterial();}
  }
  if(detail.destination==='exam-block'&&lmState?.examOwned&&lmState.id===destinationBlock)examOpenBlock(destinationBlock);
  stageLibrarySummary().catch(()=>{});
}
document.addEventListener('learning-content-copied',event=>{event.detail.refresh=stageRefreshCopies(event.detail);});
document.addEventListener('click',event=>{
  const copy=event.target.closest('[data-content-copy]');
  if(copy){event.preventDefault();event.stopImmediatePropagation();void stageOpenCopy(copy.dataset.contentCopy,copy);return;}
  if(event.target.closest('[data-copy-close]'))stageCloseCopy();
},true);
document.addEventListener('change',event=>{
  if(['contentCopyKind','contentCopyContainer'].includes(event.target.id))stageCopyDestinations();
  if(event.target.id==='contentCopyItem')document.getElementById('contentCopySubmit').disabled=!event.target.value;
});
document.addEventListener('keydown',event=>{
  const dialog=document.getElementById('contentCopyDialog');if(!dialog||dialog.hidden)return;
  if(event.key==='Escape'){event.preventDefault();stageCloseCopy();}
  if(event.key==='Tab'){
    const controls=[...dialog.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='contentCopyForm')return;
  event.preventDefault();const job=stageCopyJob;
  if(!job||job.busy||!canEditLessons()||!accountReady||viewSwitching||job.actor!==authUser?.id||job.generation!==viewGen)return;
  const kind=document.getElementById('contentCopyKind').value;
  const container=Number(document.getElementById('contentCopyContainer').value),item=Number(document.getElementById('contentCopyItem').value);
  const destination={type:kind==='new-exam'?'exam':kind,...(kind==='new-exam'?{}:{id:['lesson','exam-block'].includes(kind)?item:container}),...(kind==='lesson'?{tab:document.getElementById('contentCopyTab').value}:{})};
  const title=document.getElementById('contentCopyName').value.trim();if(!title)return;
  job.busy=true;document.getElementById('contentCopyFields').disabled=true;document.getElementById('contentCopySubmit').disabled=true;
  document.getElementById('contentCopyStatus').textContent='Creating copy…';
  try{
    await examSaveQueue;
    const result=await window.LearningMain.copyContent({source:job.source,destination,title});
    job.busy=false;stageCloseCopy();
    if(result.unattachedFiles)window.LearningMain.notice('Copy created. '+result.unattachedFiles+' file placeholder(s) had no uploaded file.');
  }catch(error){document.getElementById('contentCopyStatus').textContent=error.message;job.busy=false;document.getElementById('contentCopySubmit').disabled=false;}
  finally{document.getElementById('contentCopyFields').disabled=false;}
});
let stageTenseLoading=null;
function stageEnsureTenseBank(){
  if(tenseBankReady)return Promise.resolve(tenseBank);
  if(!stageTenseLoading)stageTenseLoading=(window.LearningLoadCatalog?window.LearningLoadCatalog('TENSE_BANK'):
    fetch('tense-bank.json').then(response=>{if(!response.ok)throw new Error('Unable to load tense examples.');return response.json();}))
    .then(data=>{tenseBank=data||{};tenseBankReady=true;return tenseBank;})
    .catch(error=>{stageTenseLoading=null;throw error;});
  return stageTenseLoading;
}
function stageLoadTenseView(section,id){
  const generation=viewGen;
  const active=()=>generation===viewGen&&document.querySelector('section.on')?.id===section&&(section==='tense'?openTenseId===id:openMarkerName===id);
  return stageEnsureTenseBank().then(()=>{if(active()){if(section==='tense')openTopic(id,true);else openMarker(id,true);}})
    .catch(error=>{if(active())window.LearningMain.notice(error.message,true);});
}
let stagePdfModule=null,stagePdfTask=null,stagePdfJob=0;
function stageExternalKind(value){
  let url;try{url=new URL(String(value||''));}catch{return {kind:'',href:''};}
  if(url.protocol!=='https:'||url.username||url.password||url.port)return {kind:'',href:''};
  const file=stageMediaSource(url.href);
  if(file)return {kind:/\.(mp4|webm)$/i.test(url.pathname)?'video-file':'audio-file',href:file,src:file};
  const src=stageEmbedSource(url.href);
  return src?{kind:'video-embed',href:url.href,src}:{kind:'page',href:url.href,src:url.href};
}
function stageExternalPlayer(value,label){
  const media=stageExternalKind(value);if(!media.href)return '';
  if(!media.src||media.kind!=='video-embed')return openLink('Open '+label.toLowerCase(),media.href);
  let src=media.src;
  const spotify=/^https:\/\/open\.spotify\.com\/embed\/(track|episode|album|playlist)\//.exec(src);
  const height=spotify?(['track','episode'].includes(spotify[1])?152:352):null;
  const youtube=/youtube(?:-nocookie)?\.com/i.test(src);
  if(youtube)src+=(src.includes('?')?'&':'?')+'origin='+encodeURIComponent(location.origin);
  const frame='<iframe class="player'+(spotify?'':' tall')+'"'+(height?' data-spotify-height="'+height+'" style="height:'+height+'px"':'')+(youtube?' id="'+esc('yt'+embedSerial())+'"':'')+' src="'+esc(src)+'" title="'+esc(label)+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>';
  return songPlayerHtml(label==='Music'?'music':'video','<p class="label">'+esc(label)+'</p>'+frame);
}
let stageDictionaryToken=0;
function stageShowCard(id){
  const here=(typeof document!=='undefined'&&document.querySelector)?(document.querySelector('section.on')||{}).id:'';
  if(here!==id&&typeof pushHistory==='function')pushHistory();
  if(typeof show==='function')show(id);
}
async function stageHydrateCatalogWord(card){
  if(!cardVisible(card)){stageShowCard('library');return;}
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
    const full=await window.LearningMain.catalogDictionary(card);
    if(!still())return;
    if(full&&typeof full==='object')Object.assign(card,full,{stageDataDeferred:false});
    stageWriteBlock(card.stageId,'dictionary',card.stageRevision||0,card);stageFlushBlocks();window.LearningMain.register(card);renderWord(card);
  }catch(error){if(still()){card.stageDataDeferred=false;try{renderWord(card);}catch(e){if(box)box.textContent=error.message;}window.LearningMain.notice(error.message,true);}}
}
async function stageHydrateMade(item){
  if(!cardVisible(item)){stageShowCard('add');return;}
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
      window.LearningMain?.register?.(ready);
    }catch(e){}
    renderMade(ready);
  };
  try{
    const saved=stageReadBlock(item.stageId,'dictionary');
    if(saved&&saved.data&&typeof saved.data==='object'){paint(saved.data);if((saved.revision||0)>=(item.stageRevision||0))return;}
    if(!item.stagePublicCatalog&&(!authUser||!accountReady||viewSwitching)){paint(item);return;}
    if(box&&!(saved&&saved.data))box.textContent='Loading saved dictionary…';
    const full=await (item.stagePublicCatalog?window.LearningMain.catalogDictionary(item):window.LearningMain.dictionary(item,target));
    if(!still()||actor!==(authUser?.id||'')||target!==((typeof viewAccount!=='undefined'&&viewAccount?.id)||''))return;
    if(!full||(full.stageId&&item.stageId&&full.stageId!==item.stageId))throw new Error('Dictionary changed. Reload the profile before opening it.');
    paint(full);
  }catch(error){if(still()){paint(item);window.LearningMain?.notice?.(error.message,true);}}
}
function stageDomId(value){return /^[1-9]\d{0,15}$/.test(String(value||''))?Number(value):value;}
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
      if(row&&row.id&&!row.examOwned&&!row.stageRevision&&typeof lmIsDemoId==='function'&&!lmIsDemoId(row.id)&&!seen.has(row.id)){drafts.push(row);seen.add(row.id);}
    }
    if(typeof lmState!=='undefined'&&lmState&&lmState.id&&!lmState.examOwned&&!lmState.stageRevision&&typeof lmIsDemoId==='function'&&!lmIsDemoId(lmState.id)&&!seen.has(lmState.id))drafts.unshift(lmState);
    lmServerReady=true;lmApplyRemote(drafts.concat(next),{push:false});
    if(typeof classGroupsDirty!=='undefined'&&classGroupsDirty&&typeof groupSave==='function')groupSave();
  }catch(error){if(generation===viewGen)window.LearningMain.notice(error.message,true);}
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
    const index=lmLibrary.materials.findIndex(row=>row.id===material.id&&row.stageRevision===material.stageRevision);if(index<0)return;
    const extras=(material.blocks||[]).filter(b=>b&&b.id&&!(full.blocks||[]).some(row=>row.id===b.id));
    const blocks=extras.length?[...(full.blocks||[]),...extras]:full.blocks;
    const opened={...full,blocks,stageLessonDeferred:false,stageLessonOwner:actor+':'+target};
    stageStampLesson(opened);
    lmLibrary.materials[index]=opened;
    stageLoadedLessons.add(opened);
    stageWriteBlock(material.id,'blocks',full.stageRevision||material.stageRevision||0,{blocks});stageFlushBlocks();
    lmOpenLesson(material.id);
  }catch(error){if(token===stageLessonOpenToken&&generation===viewGen){window.LearningMain.notice(error.message,true);const note=document.getElementById('lmNote');if(note)note.innerHTML=esc(error.message)+' <button class="btn" type="button" data-stage-retry="lesson" data-lesson-id="'+esc(material.id)+'">Retry</button>';}}
  finally{stageLessonLoads.delete(key);if(root&&token===stageLessonOpenToken)root.inert=false;}
}
function stageStatsIntro(){
  for(const id of ['statsRole','statsUser']){const field=document.getElementById(id);if(field){field.hidden=true;field.value='';}}
  for(const id of ['stageHistoryOwn','stageHistoryAll'])document.getElementById(id)?.remove();
  const sub=document.getElementById('statsSub');
  if(sub)sub.textContent=viewAccount?'Progress and learning activity for the selected student.':'Choose a period and a view to explore progress.';
}
async function stagePaintStats(){
  const box=document.getElementById('statsBody');if(!box)return;
  stageStatsIntro();if(!document.getElementById('statsFrom').value)statsShift(30);
  const token=++statsToken,generation=viewGen,target=viewAccount?.id||'';
  if(!authUser||!accountReady||viewSwitching){box.textContent='Sign in and wait for the profile to load.';return;}
  box.textContent='Loading Learning activity…';
  const params=new URLSearchParams({from:document.getElementById('statsFrom').value,to:document.getElementById('statsTo').value});
  try{
    const path=target?'/api/admin/users/'+encodeURIComponent(target)+'/stats':'/api/stats';
    const developer=typeof isDeveloper==='function'&&isDeveloper();
    const results=await Promise.all([accountFetch(path+'?'+params),developer&&!target?accountFetch('/api/bugs?heads=1').catch(()=>({heads:[]})):Promise.resolve(null)]),data=results[0],bugData=results[1];
    if(token!==statsToken||generation!==viewGen||target!==(viewAccount?.id||''))return;
    if(data.statisticsSource!=='learning-activity'||data.legacyHistoryIncluded!==false)throw new Error('Unverified statistics source.');
    if(bugData){const heads=bugData.heads||[],counts=typeof stageLiveCounts==='function'?stageLiveCounts():{};data.developerBugs={active:heads.filter(row=>!row.resolved).length,resolved:heads.filter(row=>row.resolved).length,hits:heads.reduce((n,row)=>n+(Number(row.hits)||0),0)};data.developerSystem={cards:counts.words||0,materials:(counts.songs||0)+(counts.texts||0),online:typeof navigator==='undefined'||navigator.onLine!==false,viewport:typeof innerWidth==='number'?innerWidth+' × '+innerHeight:'',preloadActive:window.PreloadQueue?.active?.()||0,preloadWaiting:window.PreloadQueue?.waiting?.()||0};}
    box.innerHTML=renderStats(data,document.getElementById('statsCompare').checked);
  }catch(error){if(token===statsToken&&generation===viewGen)box.textContent=error.message;}
}
async function stageStatsHistory(all){
  if(!stageOwnReady()||!window.LearningMain.capabilities().legacyHistory)return;
  const token=++statsToken,box=document.getElementById('statsBody');if(!box)return;
  box.textContent='Loading read-only archive…';
  const params=new URLSearchParams({from:document.getElementById('statsFrom').value,to:document.getElementById('statsTo').value});
  if(all)params.set('scope','all');
  try{
    const data=await accountFetch('/api/stats/history?'+params.toString());if(token!==statsToken)return;
    if(data.historySource!=='legacy-r2-readonly'||data.combinedWithNewActivity!==false)throw new Error('Unverified archive source.');
    box.innerHTML=renderStats(data,document.getElementById('statsCompare').checked);
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
  }catch{window.LearningMain.notice('Недопустимый адрес PDF. Файл не открыт.',true);return;}
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
  if(kind==='essential')return stageEssentialCard(id);
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
function stageAddedActions(item,sidebar=false){
  return typeof editActions==='function'?editActions(sidebar):'<span class="edit-actions"><button class="icon-btn" type="button" data-edit-toggle aria-label="Edit"></button>'+(!viewAccount||authUser?.role==='DEVELOPER'?'<button class="icon-btn" type="button" data-card-delete aria-label="Delete"></button>':'')+'</span>';
}
function stageAddedEditHtml(item){
  const index=addedIndexOf(item);
  if(index<0 || !canEditAdded(item))return '';
  return '<div data-edit-host class="card-edit" data-edit-kind="added" data-edit-id="'+index+'">'+stageAddedActions(item)+'</div>';
}
function stageAddedRow(item,index){
  const main='<button class="path" type="button" data-added="'+index+'"><b>'+esc(item.word)+'</b><span class="to">'+esc(item.ru)+'</span></button>';
  return canEditAdded(item)?'<div data-edit-host data-edit-kind="added" data-edit-id="'+index+'"><div class="edit-line">'+main+stageAddedActions(item,true)+'</div></div>':main;
}
function stageStampLinks(list,revision){stageListEpoch.cards++;for(const item of list)item.stageLinksRevision=revision;stageSettled.mine=true;rememberAdded(list);window.ContentCache?.drop('cards:personal');paintAdded();paintAllWords();stagePaintCounts();if(typeof paintHomeStats==='function')paintHomeStats();stageRefreshLyricMarks();}
function stageRefreshLyricMarks(){
  if(typeof document==='undefined'||!document.querySelector||typeof lyricHtml!=='function')return;
  const user=document.getElementById('songUser'),body=user?.querySelector('.lyric-text');
  if(!body)return;
  const song=loadSongs().find(row=>String(row.id)===String(user.dataset.songId));
  if(song&&!song.stageLyricsDeferred)body.innerHTML=lyricHtml(song.lyrics||'',song.marks||{});
}
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
  if(!authUser || !accountReady || viewSwitching || viewAccount&&!managed){window.LearningMain.notice('Дождитесь загрузки разрешённого профиля.',true);return Promise.resolve();}
  const accountId=viewAccount?.id||'',generation=typeof viewGen==='number'?viewGen:0;
  const word=input.value.trim();if(!word){status.textContent='Введите слово или выражение.';return Promise.resolve();}
  const missing='В тестовой Learning такой карточки нет. Создание новых слов и внешний словарь пока не подключены.';
  const popupDuplicate=place==='mine'&&!!input.closest?.('#add');let duplicate=false;
  const duplicateError=()=>{duplicate=true;return Object.assign(new Error('Эта карточка уже добавлена на страницу.'),popupDuplicate?{reported:true}:{});};
  return window.LearningMain.perform(async()=>{
    let card=null;
    try{card=await window.LearningMain.findCard(word);}catch(error){if(error.message!==missing)throw error;}
    if(generation!==(typeof viewGen==='number'?viewGen:0)||accountId!==(viewAccount?.id||''))return;
    let result;
    if(card){
      if(loadAdded().some(row=>row.stageId===card.id&&(row.place||'mine')===place))throw duplicateError();
      result=managed?await window.LearningMain.linkManagedCard(accountId,card,place):await window.LearningMain.linkCard(card,place);
    }else{
      const data=await accountFetch('/lookup?word='+encodeURIComponent(word));
      const en=String(data&&data.word||word).trim(),ru=String(data&&data.ru||'').trim();
      if(!data||!data.found||!en||!ru)throw new Error('No translation came back for this word.');
      if(loadAdded().some(row=>(row.place||'mine')===place&&String(row.word||row.en||'').toLowerCase()===en.toLowerCase()))throw duplicateError();
      result=managed?await window.LearningMain.newManagedCard(accountId,en,ru,place):await window.LearningMain.newCard(en,ru,place);
      result={...result,card:{...result.card,word:en,ru,place:result.card.place||place,data}};
    }
    if(generation!==(typeof viewGen==='number'?viewGen:0)||accountId!==(viewAccount?.id||''))return;
    const list=loadAdded();list.unshift(result.card);stageStampLinks(list,result.revision);if(!managed)trackEvent('card',place,'add');
    input.value='';if(openCard)renderMade(result.card);
  },status).finally(()=>{if(duplicate&&popupDuplicate){status.textContent='';status.classList.remove('bad');window.LearningMain.notice('Эта карточка уже добавлена на страницу.',true);}});
}
let stageTextDraft=null,stageSongDraft=null;
let stageDatabaseRegistry=null,stageDatabaseBusy=false;
function stageDatabasePaint(){
  const modal=document.getElementById('databaseAdmin');if(!modal)return;
  const provider=stageDatabaseRegistry?.providers?.find(provider=>provider.id===document.getElementById('databaseProvider').value);
  document.getElementById('databaseRegistry').innerHTML=[['Scope','Entire site · All users'],['Active content database',stageDatabaseRegistry?.active||'Unknown'],['Authentication',stageDatabaseRegistry?.authentication||'Unknown'],['Chat',stageDatabaseRegistry?.chat||'Unknown'],['Server connection secret',provider?.configured?'Configured':'Not configured'],['Authentication adapter',provider?.authenticationAdapterReady?'Ready':'Pending'],['Application adapter',provider?.adapterReady?'Ready':'Pending']].map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('');
  modal.querySelectorAll('[data-database-action]').forEach(button=>{button.disabled=stageDatabaseBusy||!provider?.configured;button.hidden=button.dataset.databaseAction==='prepare'&&provider?.id!=='neon';});
  document.getElementById('databaseActivate').disabled=stageDatabaseBusy||!provider?.adapterReady||provider?.active;
  document.getElementById('databaseBlocker').textContent=provider?.blocker||(provider?.active?'Already active.':'');
}
document.addEventListener('change',event=>{if(event.target.id==='databaseProvider'){document.getElementById('databaseResult').textContent='';stageDatabasePaint();}});
document.addEventListener('click',async event=>{
  const open=event.target.closest('[data-database-admin]'),close=event.target.closest('[data-database-close]'),action=event.target.closest('[data-database-action],#databaseActivate');
  if(!open&&!close&&!action)return;
  const modal=document.getElementById('databaseAdmin');if(close){modal.close();return;}
  if(!authUser||authUser.role!=='DEVELOPER'||viewAccount||stageDatabaseBusy)return;
  const actor=authUser.id,generation=viewGen,current=()=>authUser?.id===actor&&authUser?.role==='DEVELOPER'&&!viewAccount&&generation===viewGen;
  const result=document.getElementById('databaseResult');
  if(open){stageDatabaseRegistry=null;result.textContent='Loading...';modal.showModal();window.lucide?.createIcons({root:modal});}
  const operation=action?.dataset.databaseAction||(action?'activate':null),provider=document.getElementById('databaseProvider').value;
  if(operation==='prepare'&&!confirm('Create empty foundation tables in Neon? No data will be copied and Learning will remain active.'))return;
  if(operation==='activate'&&!confirm('Switch the database for the entire site and all users? Data will not be copied between databases.'))return;
  stageDatabaseBusy=true;stageDatabasePaint();
  try{
    const data=await accountFetch('/api/developer/databases',operation?{method:'POST',body:JSON.stringify({provider,action:operation,...(operation==='activate'?{expectedRevision:stageDatabaseRegistry?.revision}:{})})}:undefined);
    if(!current()){modal.close();return;}
    if(!operation){stageDatabaseRegistry=data;result.textContent='';}
    else if(operation==='activate'){stageDatabaseRegistry=data;result.textContent=data.message||'Database switched.';}
    else result.textContent=data.provider==='neon'?'Connected · '+data.database+' · Schema '+(data.schemaVersion||'not prepared')+(data.tableCount!=null?' · '+data.tableCount+' tables':'')+(data.authenticationSchemaReady?' · Auth ready':'')+' · No data transferred':data.message||'Connected';
  }catch(error){if(current())result.textContent=error.message;}
  finally{stageDatabaseBusy=false;if(current())stageDatabasePaint();}
});
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
  if(time){time.textContent=!authUser?'0 min':stageActivity.tracked?Math.floor(stageActivity.seconds/60)+' min':'—';time.title='Только подтверждённое время в тестовой Learning; прежняя история не включена.';}
  if(exams){exams.textContent=!authUser?'0':stageActivity.tracked?String(stageActivity.examPass):'—';exams.title='Клиентская учебная статистика, не сертифицированный экзамен.';}
}
function stageRecordTime(flush=false){
  if(!stageOwnReady()){stageTimeAt=0;stageTimeSeconds=0;return;}
  const now=Date.now(),section=document.querySelector('section.on');
  if(stageTimeAt)stageTimeSeconds+=Math.max(0,Math.min(60,Math.floor((now-stageTimeAt)/1000)));
  stageTimeAt=['word','made','dayq','daychoice','dayflip','dayjudge','material','textread','song','musicword'].includes(section?.id)&&!document.hidden?now:0;
  if(stageTimeSeconds>=300||flush&&stageTimeSeconds>0){
    const seconds=Math.min(300,stageTimeSeconds);
    try{window.LearningMain.event('duration','study','',seconds);stageTimeSeconds-=seconds;}catch(error){window.LearningMain.notice(error.message,true);}
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
async function stageRequestAnalysis(text,contentType,write){
  const generation=viewGen,actor=authUser?.id,target=viewAccount?.id||'';
  const current=()=>generation===viewGen&&actor===authUser?.id&&target===(viewAccount?.id||'');
  const key=item=>item.type+'|'+String(item.canonicalForm||item.exactText||'').toLowerCase();
  let result=await accountFetch('/api/analyze',{method:'POST',body:JSON.stringify({text,contentType})});
  const expressions=new Map((result.expressions||[]).map(item=>[key(item),item]));
  const reviewed=new Set((result.stats?.reviewedExpressions||[]).map(key));
  let offset=0;
  while(current()&&Number.isSafeInteger(result.stats?.nextReviewOffset)&&result.stats.nextReviewOffset>offset){
    offset=result.stats.nextReviewOffset;
    if(write)write('Reviewing expressions '+reviewed.size+' of '+result.stats.llmCandidates+'…',false);
    let next;
    try{next=await accountFetch('/api/analyze',{method:'POST',body:JSON.stringify({text,contentType,reviewOffset:offset})});}
    catch(error){result.error=error.message||'Expression review failed.';break;}
    if(!current())throw new Error('Analysis cancelled after changing account.');
    for(const item of next.stats?.reviewedExpressions||[]){reviewed.add(key(item));expressions.delete(key(item));}
    for(const item of next.expressions||[]){const previous=expressions.get(key(item));if(!previous||item.llmDecision||!previous.llmDecision)expressions.set(key(item),item);}
    result={...next,wordLemmas:{...result.wordLemmas,...next.wordLemmas}};
  }
  if(result.stats)result.stats={...result.stats,llmReviewed:reviewed.size||result.stats.llmReviewed||0,llmPartial:!!(result.stats.llmPartial&&reviewed.size<(result.stats.llmCandidates||0)||result.error)};
  return {...result,expressions:[...expressions.values()]};
}
async function stageRunTextAnalysis(item,status){
  if(!item?.text)return;
  const generation=viewGen;
  let result;
  try{result=await stageRequestAnalysis(item.text,'TEXT',text=>{if(status)status.textContent=text;});}
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
        const stored=managed?await window.LearningMain.saveManagedText(viewAccount.id,saved,{analysis}):await window.LearningMain.saveLibrary(saved,'text',{analysis});
        if(generation!==viewGen)return;
        if(stored?.item)Object.assign(saved,stored.item);
        if(stored?.revision)saved.stageRevision=stored.revision;
      }
    }
    saved.analysis=analysis;
    localStorage.setItem(TEXT_KEY,JSON.stringify(list));
    paintTextCount();
    if(status)status.textContent=(result.expressions||[]).length+' expressions.'+(result.stats?.partial||result.stats?.llmPartial?' Analysis was partial.':'');
    showText(saved.id);
  }catch(error){if(status)status.textContent=error.message||'Analysis service temporarily unavailable.';}
}
function stageStoreText(analyze){
  const managed=!!(viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching);
  if(!stageOwnReady()&&!managed){window.LearningMain.notice('Дождитесь загрузки профиля.',true);return;}
  const accountId=viewAccount?.id||'',generation=viewGen;
  const title=document.getElementById('textTitle').value.trim(),text=document.getElementById('textBody').value.replace(/\r\n/g,'\n').trim();
  const item=loadTexts().find(row=>row.id===openTextId)|| (stageTextDraft ||= {});
  const format=window.TextColors?.trim(window.TextColors.format(document.getElementById('textBody')),document.getElementById('textBody').value)||null;
  if(managed&&item.stageId&&item.stageScope!=='profile'){window.LearningMain.notice('Общие тексты нельзя менять в личном профиле.',true);return;}
  return window.LearningMain.perform(async()=>{
    const result=managed?await window.LearningMain.saveManagedText(accountId,item,{title,text,colorText:format}):await window.LearningMain.saveLibrary(item,'text',{title,text,colorText:format});
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    stageInstallLibrary(result.item,'text');openTextId=result.item.id;stageTextDraft=null;showText(openTextId);
    if(analyze)await stageRunTextAnalysis(result.item,document.getElementById('textReadStatus'));
  },document.getElementById('textStatus'));
}
function stageStoreSong(existingId){
  if(existingId)existingId=stageDomId(existingId);
  const managed=stageManagedSongReady();
  if(!stageOwnReady()&&!managed){window.LearningMain.notice('Дождитесь загрузки разрешённого профиля.',true);return;}
  const accountId=viewAccount?.id||'',generation=viewGen;
  const item=existingId?loadSongs().find(row=>row.id===existingId):(stageSongDraft ||= {});
  if(!item)return;
  const changes=existingId?{lyrics:document.querySelector('#songUser [data-lyric-draft]').value}
    :{title:document.getElementById('lyricTitle').value.trim(),artist:document.getElementById('lyricArtist').value.trim(),lyrics:document.getElementById('lyricText').value,
      videoUrl:document.getElementById('lyricVideo').value.trim(),musicUrl:document.getElementById('lyricMusic').value.trim()};
  changes.colorText=window.TextColors?.format(existingId?document.querySelector('#songUser [data-lyric-draft]'):document.getElementById('lyricText'))||null;
  const file=!managed&&(existingId?pendingEditFile:pendingLyricFile);
  return window.LearningMain.perform(async()=>{
    const result=managed?await window.LearningMain.saveManagedLibrary(accountId,item,'song',changes):await window.LearningMain.saveLibrary(item,'song',changes);
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    let saved=result.item;
    if(file){
      const uploaded=await stageUploadSongFile(saved,file,existingId);
      saved=uploaded.item||saved;
      if(existingId){pendingEditFile=null;editFileSent=true;}
      else{pendingLyricFile=null;lyricFileSent=true;}
    }
    stageInstallLibrary(saved,'song');stageSongDraft=null;
    renderUserSong(saved);show('song');
    try{if(typeof accountFetch==='function')await stageAnalyzeSong(saved,existingId?document.querySelector('#songUser [data-lyric-edit-status]'):document.getElementById('lyricStatus'));}
    finally{if(!existingId&&!managed)trackEvent('song','lyrics','add');}
  },existingId?document.querySelector('#songUser [data-lyric-edit-status]'):document.getElementById('lyricStatus'));
}
if(typeof window!=='undefined'&&typeof document!=='undefined')window.TextColors?.mount(document.getElementById('lyricText'));
let stageTextHeightFrame=0;
function stageGrowTextEditors(){
  if(stageTextHeightFrame)return;
  stageTextHeightFrame=requestAnimationFrame(()=>{
    stageTextHeightFrame=0;
    document.querySelectorAll('#lyricText,#textBody,[data-lyric-draft]').forEach(input=>{
      const rich=input.parentElement?.querySelector('.text-color-rich:not([hidden])'),field=rich||input;
      if(!field.getClientRects().length)return;
      const minimum=Math.max(100,parseFloat(getComputedStyle(field).minHeight)||0);
      field.style.maxHeight='none';field.style.overflowY='hidden';field.style.height='auto';
      field.style.height=Math.max(minimum,field.scrollHeight+2)+'px';
    });
  });
}
document.addEventListener('input',event=>{if(event.target.matches('#lyricText,#textBody,[data-lyric-draft]')||event.target.closest('.text-color-rich')?.parentElement.querySelector('#lyricText,#textBody,[data-lyric-draft]'))stageGrowTextEditors();});
if(typeof MutationObserver!=='undefined'&&document.body){const observer=new MutationObserver(stageGrowTextEditors);document.querySelectorAll('#lyricadd,#songUser,#textedit').forEach(root=>observer.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']}));window.addEventListener('resize',stageGrowTextEditors);stageGrowTextEditors();}
async function stageKeepExpression(card,managed=stageManagedSongReady(),resolved){
  const generation=viewGen,actor=authUser?.id;
  const word=String(card.word||'').trim();
  const place=card.fromText&&(!card.place||card.place==='mine')?'text':(['phrasal','idioms','mine','music','text'].includes(card.place)?card.place:'mine');
  if(!word||loadAdded().some(row=>String(row.word||row.en||'').toLowerCase()===word.toLowerCase()&&(row.place||'mine')===place))return false;
  const accountId=viewAccount?.id||'';
  const current=()=>generation===viewGen&&actor===authUser?.id&&accountId===(viewAccount?.id||'');
  let found=resolved;
  if(found===undefined){
    try{found=await window.LearningMain.findCard(word);}
    catch(error){if(error.code!=='CARD_NOT_FOUND')throw error;found=null;}
  }
  if(found){
    if(!current())return false;
    if(loadAdded().some(row=>row.stageId===found.id&&(row.place||'mine')===place))return false;
    const linked=managed?await window.LearningMain.linkManagedCard(accountId,found,place):await window.LearningMain.linkCard(found,place);
    if(!current())return false;
    const list=loadAdded();list.unshift(linked.card);stageStampLinks(list,linked.revision);return true;
  }else{
    if(!current())return false;
    const ru=String(card.ru||'').trim();
    if(!ru)return false;
    const created=managed?await window.LearningMain.newManagedCard(accountId,word,ru,place):await window.LearningMain.newCard(word,ru,place);
    if(!current())return false;
    const list=loadAdded();list.unshift(created.card);stageStampLinks(list,created.revision);return true;
  }
}
function stageManagedCardReady(){return !!(viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching);}
function stageStoreTextExpression(expr,button,item){
  const place=item.fromText&&(!item.place||item.place==='mine')?'text':(item.place||expressionPlace(expr)),fromText=!!item.fromText;
  const deck=expressionDeckName(place,fromText),status=document.getElementById('textReadStatus');
  if(expressionSaved(expr)){
    if(status)status.textContent='Already in '+deck+'.';
    markExpressionButton(button,place,fromText);return;
  }
  if(!String(item.ru||'').trim()){
    const meaning=String((expr&&expr.meaning)||(item.data&&item.data.grammar&&item.data.grammar.note)||'').trim();
    if(meaning)item.ru=meaning;
  }
  if(!String(item.ru||'').trim()){
    if(button){button.disabled=false;button.textContent='Add to Cards';}
    if(status){status.textContent='A translation is required before this expression can be saved.';if(status.classList)status.classList.add('bad');}
    return;
  }
  return window.LearningMain.perform(async()=>{
    if(viewAccount&&!stageManagedCardReady())throw new Error('Wait for the selected profile to load.');
    const added=await stageKeepExpression(item,stageManagedCardReady());
    if(status)status.textContent=added?'Added to '+deck+'.':'Already in '+deck+'.';
    markExpressionButton(button,place,fromText);
  },status);
}
function stageLyricRu(data){
  const cam=data&&data.cambridge||{},wh=data&&data.wooordhunt||{};
  return String((data&&data.ru)||wh.gloss||wh.verbGloss||cam.definition||data?.oxford?.definition||data?.longman?.definition||data?.collins?.definition||data?.merriam?.definition||data?.wiktionary?.definition||data?.englishClub?.meaning||data?.englishAtHome?.meaning||'').trim();
}
async function stageMarkLyricWords(song,marks,write,lemmas={}){
  const generation=viewGen,actor=authUser?.id,target=viewAccount?.id||'';
  const current=()=>generation===viewGen&&actor===authUser?.id&&target===(viewAccount?.id||'');
  const seen=new Set(),keys=[];
  const baseOf=key=>Object.hasOwn(lemmas,key)&&typeof lemmas[key]==='string'?lemmas[key]:key;
  (typeof lyricTokens==='function'?lyricTokens(song.lyrics||''):[]).forEach(key=>{
    if(!key||seen.has(key))return;
    seen.add(key);keys.push(key);
  });
  const todo=[];
  keys.forEach(key=>{
    const known=typeof lyricCard==='function'?lyricCard(baseOf(key)):typeof cardIndex==='function'?cardIndex().get(key):null;
    if(known){
      if(!marks[key]||!['new','have'].includes(marks[key].state))marks[key]={state:'have',word:known.en||key};
      else {delete marks[key].needsRetry;delete marks[key].lastError;}
      return;
    }
    todo.push(key);
  });
  let cursor=0,done=0;
  async function worker(){
    while(cursor<todo.length){
      if(!current())return;
      const key=todo[cursor++];
      write('Checked '+(++done)+' of '+todo.length+' new words…',false);
      const previous=marks[key];
      try{
        const candidates=[...new Set([key,baseOf(key)])];
        let found=null;
        for(const candidate of candidates){
          try{found=await window.LearningMain.findCard(candidate);break;}
          catch(error){if(error.code!=='CARD_NOT_FOUND')throw error;}
        }
        if(!current())return;
        if(found){
          await stageKeepExpression({word:found.en||key,place:'music'},stageManagedSongReady(),found);
          if(!current())return;
          marks[key]={state:'have',word:found.en||key,cardId:found.id};continue;
        }
        const query=baseOf(key);
        const data=typeof lookupLyricWord==='function'?await lookupLyricWord(query,typeof lyricLine==='function'?lyricLine(song.lyrics||'',key):'',25000,true):null;
        if(!current())return;
        const ru=stageLyricRu(data);
        if(!data){marks[key]={state:'miss'};continue;}
        if(!ru){marks[key]={state:'untranslated'};continue;}
        const word=data.base||query;
        const added=await stageKeepExpression({word,ru,place:'music'},stageManagedSongReady(),null);
        if(!current())return;
        marks[key]={state:added?'new':'have',word};
      }catch(error){
        if(!current())return;
        marks[key]=previous&&['new','have'].includes(previous.state)?{...previous,lastError:String(error.message||'Check failed').slice(0,120),needsRetry:true}:{state:'error',reason:String(error.message||'Check failed').slice(0,120)};
        if(Number(error.status)===0&&error.reported)throw error;
      }
    }
  }
  if(todo.length){
    write('Looking up '+todo.length+' new words…',false);
    await worker();
  }
  return keys;
}
async function stageAnalyzeSong(song,status){
  const generation=viewGen,actor=authUser?.id,target=viewAccount?.id||'';
  const current=()=>generation===viewGen&&actor===authUser?.id&&target===(viewAccount?.id||'');
  const write=(text,bad)=>{if(!current())return;const visible=document.getElementById('songUser'),live=visible&&String(visible.dataset.songId)===String(song.id)?visible.querySelector('[data-lyric-check]'):status;if(!live)return;live.textContent=text;live.classList.toggle('bad',!!bad);};
  const finish=(text,bad)=>setTimeout(()=>{
    if(!current())return;
    const visible=document.getElementById('songUser');if(visible&&String(visible.dataset.songId)!==String(song.id))return;
    const live=document.querySelector('#songUser [data-lyric-check]')||status;
    if(!live)return;live.textContent=text;live.classList.toggle('bad',!!bad);
  },0);
  write('Reading the lyrics…',false);
  const marks={...(song.marks||{})};
  let keys=[];
  const storeMarks=async()=>{
    if(!current())return;
    if(!song.stageId||!Object.keys(marks).length)return;
    const managed=stageManagedSongReady();
    const saved=managed?await window.LearningMain.saveManagedLibrary(viewAccount.id,song,'song',{marks}):await window.LearningMain.saveLibrary(song,'song',{marks});
    const next=saved&&saved.item?saved.item:{...song,marks};
    stageInstallLibrary(next,'song');
    const visible=document.getElementById('songUser');if(!visible||String(visible.dataset.songId)===String(song.id))renderUserSong(next);
  };
  let analyzed;
  try{analyzed=await stageRequestAnalysis(song.lyrics,'LYRICS',write);}
  catch(error){analyzed={expressions:[],stats:{partial:true},error:error.message||'Analysis service temporarily unavailable.'};}
  if(!current())return;
  const lemmas=analyzed.wordLemmas||{};
  keys=await stageMarkLyricWords(song,marks,write,lemmas);
  if(!current())return;
  const expressions=typeof uniqueExpressions==='function'?uniqueExpressions(analyzed.expressions||[]):(analyzed.expressions||[]);
  let added=0,failed=0;
  for(let i=0;i<expressions.length;i++){
    if(!current())return;
    const expr=expressions[i];
    write('Looking up phrase '+(i+1)+' of '+expressions.length+'…',false);
    try{
      const built=await accountFetch('/api/phrase-card',{method:'POST',body:JSON.stringify({exactText:expr.exactText,canonicalForm:expr.canonicalForm,type:expr.type,meaning:expr.meaning,context:expr.context,source:'song'})});
      const card=built&&built.card;
      if(!current())return;
      if(!card?.word){failed++;continue;}
      const kept=await stageKeepExpression(card);
      if(kept)added++;
      const key=String(card.word).trim().toLowerCase();
      const mark={state:kept?'new':'have',word:card.word,deck:card.place||'mine'};
      marks[key]=mark;
      const surface=String(expr.exactText||'').trim().toLowerCase().replace(/\u2019/g,"'");
      if(surface)marks[surface]=mark;
    }catch{failed++;}
  }
  try{await storeMarks();}catch(error){finish(error.message||'Could not save the analysis. Try again.',true);throw error;}
  const displayed=typeof lyricKeys==='function'?lyricKeys(song.lyrics||'',marks):keys;
  const missing=displayed.filter(key=>marks[key]?.state==='miss').length;
  const errors=displayed.filter(key=>marks[key]?.state==='error'||marks[key]?.state==='untranslated'||marks[key]?.needsRetry).length;
  const partial=analyzed.stats?.partial||analyzed.stats?.llmPartial;
  finish((missing?missing+(missing===1?' word not found. ':' words not found. '):'Checked the words. ')+(added?'Added '+added+' expressions. ':'')+(errors?errors+(errors===1?' word needs another check. ':' words need another check. '):'')+(failed?failed+' expressions could not be saved. ':'')+(partial?'Expression analysis was partial. ':'')+(analyzed.error||''),!!(failed||errors||partial||analyzed.error));
}
function stageSaveSongMeta(){
  const managed=stageManagedSongReady();if(!stageOwnReady()&&!managed)return;
  const accountId=viewAccount?.id||'',generation=viewGen;
  const item=loadSongs().find(row=>row.id===stageDomId(document.getElementById('songUser').dataset.songId));if(!item)return;
  if(editFileRemoved){window.LearningMain.unsupported('Изменение файла песни');return;}
  const file=!managed&&pendingEditFile&&!editFileSent?pendingEditFile:null;
  const read=key=>document.querySelector('#songUser [data-lyric-'+key+']').value.trim();
  return window.LearningMain.perform(async()=>{
    const changes={title:read('title'),artist:read('artist'),videoUrl:read('video'),musicUrl:read('music')};
    const result=managed?await window.LearningMain.saveManagedLibrary(accountId,item,'song',changes):await window.LearningMain.saveLibrary(item,'song',changes);
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
  return window.LearningMain.uploadSongAudio(saved,file,ratio=>paint(ratio,'Uploading…')).then(uploaded=>{paint(1,'Saved.');return uploaded;},error=>{paint(null);throw error;});
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
function stageCanManageLibrary(item,kind){
  if(!item?.stageId||item.stageScope!=='profile')return false;
  if(!viewAccount)return stageOwnReady();
  return !!(authUser?.role==='DEVELOPER'&&accountReady&&!viewSwitching);
}
function stageLibraryTools(item,kind){
  if(!stageCanManageLibrary(item,kind))return '';
  const hidden=!!item.archived;
  const eye=hidden
    ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
    :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
  const trash='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';
  const attrs=' data-library-kind="'+kind+'" data-library-id="'+esc(item.id)+'"';
  return '<div class="day-tools"><button class="day-hide'+(hidden?' is-on':'')+'" type="button" data-stage-library-action="toggle"'+attrs+' aria-label="'+(hidden?'Show':'Hide')+'" title="'+(hidden?'Show':'Hide')+'">'+eye+'</button>'+(!viewAccount||authUser?.role==='DEVELOPER'?'<button class="day-del" type="button" data-stage-library-action="delete"'+attrs+' aria-label="Delete" title="Delete">'+trash+'</button>':'')+'</div>';
}
function stagePaintLibraryList(kind){
  if(hideStudentSongs())return;
  const song=kind==='song',list=song?loadSongs():loadTexts(),visible=list.filter(item=>!item.archived);
  const count=document.getElementById(song?'lyricCount':'textCount');if(count)count.textContent=String(visible.length);
  if(song){const title=document.querySelector('#music h1');if(title)title.textContent='Song lyrics · '+visible.length;}
  const box=document.getElementById(song?'lyricList':'textList');if(!box)return;
  if(!list.length){box.innerHTML='<p class="hint">No '+(song?'songs':'texts')+' yet.</p>';return;}
  box.innerHTML=(authUser?.role==='USER'&&!viewAccount?visible:list).map((item,index)=>{
    let about='Hidden';
    if(!item.archived){
      if(song){try{about=statsLine(songStat(Object.keys(item.marks||{}),item.marks||{}));}catch{about='';}}
      else about=textAbout(item);
    }
    const attr=song?'data-lyric="'+esc(item.id)+'"':'data-text-open="'+esc(item.id)+'"';
    return '<div class="day-row'+(item.archived?' is-hidden':'')+'">'+songRow(index+1,item.title||'Untitled',song?item.artist||'':'',about,attr)+stageLibraryTools(item,kind)+'</div>';
  }).join('');
  if(typeof applyCardSearch==='function')applyCardSearch(box.closest('section'));
}
function stageRemoveLibrary(item,kind){
  const list=(kind==='song'?loadSongs():loadTexts()).filter(row=>row.id!==item.id);
  stageListEpoch[kind==='song'?'songs':'texts']++;
  stageSettled[kind==='song'?'songs':'texts']=true;
  window.ContentCache?.drop(kind==='song'?'songs:list':'texts:list');
  if(item.stageId)window.ContentCache?.drop(stageItemKey(kind,item.stageId));
  if(kind==='song')writeSongs(list);else localStorage.setItem(TEXT_KEY,JSON.stringify(list));
  stagePaintLibraryList(kind);stagePaintCounts();
}
function stageLibraryAction(action,kind,rawId){
  if(!['song','text'].includes(kind)||!['toggle','delete'].includes(action))return;
  if(action==='delete'&&viewAccount&&authUser?.role!=='DEVELOPER')return;
  const item=(kind==='song'?loadSongs():loadTexts()).find(row=>row.id===stageDomId(rawId));if(!stageCanManageLibrary(item,kind))return;
  if(action==='delete'&&!confirm('Move this '+kind+' to Archive?'))return;
  const managed=!!viewAccount,accountId=viewAccount?.id||'',generation=viewGen;
  return window.LearningMain.perform(async()=>{
    if(action==='toggle'){
      const result=managed?await window.LearningMain.saveManagedLibrary(accountId,item,kind,{archived:!item.archived}):await window.LearningMain.saveLibrary(item,kind,{archived:!item.archived});
      if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
      stageInstallLibrary(result.item,kind);stagePaintLibraryList(kind);
    }else{
      if(managed)await window.LearningMain.deleteManagedLibrary(accountId,item,kind);else await window.LearningMain.deleteLibrary(item);
      if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
      stageRemoveLibrary(item,kind);
    }
  });
}
function stageMountTextArchive(id){
  const item=loadTexts().find(row=>row.id===id),host=document.getElementById('textEdit')?.parentNode;if(!host)return;
  let button=host.querySelector('[data-stage-text-archive]');
  if(!button){button=document.createElement('button');button.type='button';button.className='btn';button.dataset.stageTextArchive='';button.textContent='Delete text';host.append(button);}
  button.hidden=!(viewAccount&&authUser?.role==='DEVELOPER'&&accountReady&&!viewSwitching&&item?.stageScope==='profile'&&item.stageId);
  button.onclick=()=>stageArchiveText(id);
}
function stageArchiveText(id){
  if(!viewAccount||authUser?.role!=='DEVELOPER'||!accountReady||viewSwitching)return;
  const item=loadTexts().find(row=>row.id===id);if(!item?.stageId||item.stageScope!=='profile')return;
  if(!confirm('Move this text to Archive?'))return;
  const accountId=viewAccount.id,generation=viewGen;
  return window.LearningMain.perform(async()=>{
    await window.LearningMain.archiveManagedText(accountId,item);
    if(viewAccount?.id!==accountId||viewGen!==generation)return;
    localStorage.setItem(TEXT_KEY,JSON.stringify(loadTexts().filter(row=>row.id!==id)));paintTextCount();renderTextList();show('texts');
  });
}
function stageMountSongAudio(){}
document.addEventListener('click',event=>{
  const archive=event.target.closest('[data-lyric-archive]');if(!archive)return;
  event.preventDefault();event.stopPropagation();const managed=stageManagedSongReady();if(!stageOwnReady()&&!managed)return;
  const accountId=viewAccount?.id||'',generation=viewGen;
  const item=loadSongs().find(row=>row.id===stageDomId(document.getElementById('songUser').dataset.songId));if(!item)return;
  if(!confirm('Move this song to Archive?'))return;
  window.LearningMain.perform(async()=>{
    if(managed)await window.LearningMain.deleteManagedLibrary(accountId,item,'song');else await window.LearningMain.deleteLibrary(item);
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    stageRemoveLibrary(item,'song');if(!managed)trackEvent('song','lyrics','archive');show('music');
  });
},true);
document.addEventListener('DOMContentLoaded',()=>{
  const host=document.getElementById('groupAdd');if(!host)return;
  const form=document.createElement('form');form.id='stageNewCard';
  form.innerHTML='<details><summary>Новая личная карточка вручную</summary><label>English<input name="en" required maxlength="200"></label><label>Russian<input name="ru" required maxlength="10000"></label><button class="btn primary" type="submit">Сохранить новую карточку</button><p role="status"></p></details>';
  form.addEventListener('submit',event=>{
    event.preventDefault();const managed=!!(viewAccount&&authUser&&['ADMIN','DEVELOPER'].includes(authUser.role)&&accountReady&&!viewSwitching);
    if(!stageOwnReady()&&!managed){window.LearningMain.notice('Дождитесь загрузки профиля.',true);return;}
    const accountId=viewAccount?.id||'',generation=viewGen;
    const en=form.elements.en.value.trim(),ru=form.elements.ru.value.trim();
    window.LearningMain.perform(async()=>{
      const result=managed?await window.LearningMain.newManagedCard(accountId,en,ru):await window.LearningMain.newCard(en,ru);
      if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
      const list=loadAdded();list.unshift(result.card);stageStampLinks(list,result.revision);form.reset();renderMade(result.card);if(!managed)trackEvent('card','mine','add');
    },form.querySelector('[role="status"]'));
  });host.append(form);
});
function stageSaveTranslation(host){
  const card=stageHostCard(host),input=host.querySelector('[data-edit-field="ru"]'),status=host.querySelector('[data-edit-status]');
  if(!card || !input||!stageCanEditTranslation(card))return;
  const accountId=viewAccount?.id||'',generation=viewGen;
  const ru=input.value.trim();if(!ru){if(status)status.textContent='Введите перевод.';return;}
  return window.LearningMain.perform(async()=>{
    const saved=accountId?await window.LearningMain.editManagedCard(accountId,card,ru):await window.LearningMain.editCard(card,ru);
    if(generation!==viewGen||accountId!==(viewAccount?.id||''))return;
    card.ru=saved.ru;card.stageRevision=saved.revision;if(card.original)card.original.ru=saved.ru;
    if(host.dataset.editKind==='essential'){
      for(const entry of stageEssentialEntries())if(entry.card.stageId===card.stageId){entry.card.ru=saved.ru;entry.card.stageRevision=saved.revision;}
      for(const group of stageEverydayData.groups)for(const topic of group.topics)for(const entry of topic.entries)if(entry.card.stageId===card.stageId)Object.assign(entry.card,{ru:saved.ru,stageRevision:saved.revision});
      stageEverydayPaint();paintAllWords();return;
    }
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
  if(host.dataset.editKind==='essential'){stageRemoveEssential(host);return;}
  if(viewSwitching)return;
  if(viewAccount&&authUser?.role!=='DEVELOPER')return;
  const card=stageHostCard(host);if(!card)return;
  const personal=['added','made'].includes(host.dataset.editKind)&&addedIndexOf(card)>=0;
  if(typeof confirm==='function'&&!confirm(card.stageScope==='profile'?'Move this card to Archive?':'Remove this card?'))return;
  if(viewAccount){
    if(!personal||!stageCanManageAdded(card))return;
    const accountId=viewAccount.id,generation=viewGen;
    return window.LearningMain.perform(async()=>{
      const result=card.stageScope==='profile'?await window.LearningMain.archiveItem('card',card.stageId):await window.LearningMain.unlinkManagedCard(accountId,card);
      if(viewAccount?.id!==accountId||viewGen!==generation)return;
      const next=loadAdded().filter(row=>card.stageScope==='profile'?row.stageId!==card.stageId:!(row.stageId===card.stageId&&(row.place||'mine')===(card.place||'mine')));
      if(result.revision&&!result.archived)stageStampLinks(next,result.revision);else{rememberAdded(next);paintAdded();paintAllWords();stagePaintCounts();}
      if(madeItem?.stageId===card.stageId){madeItem=null;show('add');}
    });
  }
  if(personal){
    if(!canEditAdded(card))return;
    return window.LearningMain.perform(async()=>{
      const result=card.stageScope==='profile'?await window.LearningMain.archiveItem('card',card.stageId):await window.LearningMain.unlinkCard(card);
      const next=loadAdded().filter(row=>card.stageScope==='profile'?row.stageId!==card.stageId:!(row.stageId===card.stageId&&(row.place||'mine')===(card.place||'mine')));
      if(result.revision&&!result.archived)stageStampLinks(next,result.revision);else{rememberAdded(next);paintAdded();paintAllWords();stagePaintCounts();}
      if(madeItem?.stageId===card.stageId){madeItem=null;show('add');}
    });
  }
  if(!canEditLessons())return;
  window.LearningMain.perform(async()=>{
    await window.LearningMain.deleteCard(card);
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
  window.LearningMain.perform(async()=>{
    await window.LearningMain.writeQuiz(word,quiz,!!del);
    window.ContentCache?.invalidate?.('quizzes:');
    const state=await accountFetch('/api/me/state');
    installCardQuizzes(state.stats.cardQuizzes);refreshCardQuizBox(box);
  });
  return true;
}
function stageNoteAnswer(item,ok){
  if(!item || item.type==='Flip')return;
  if(!authUser || viewAccount || viewSwitching || !accountReady){window.LearningMain.notice('Прогресс сохраняется только в загруженный профиль вошедшего пользователя.',true);return;}
  try{window.LearningMain.event('answer',item.type,ok?'ok':'miss');if(item.card)window.LearningMain.answer(item.card,item.type,!!ok);}catch(error){window.LearningMain.notice(error.message,true);}
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
  if(block.type==='task'||block.type==='text'&&block.answerEnabled)return block.responseFormatting?{text:block.response||'',format:block.responseFormatting}:block.response||'';
  return {items:(block.items||[]).map(item=>({...('picked' in item?{picked:item.picked}:{}),...('typed' in item?{typed:item.typed}:{}),...(item.typedFormatting?{format:item.typedFormatting}:{})})),...(checked?{checked:true}:{})};
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
  if(!material||material.stageLessonBaseline||!material.stageRevision||typeof window.LearningMain?.lessonSnapshot!=='function')return;
  const saved=(material.blocks||[]).filter(block=>block&&block.stageBlockRevision);
  material.stageLessonBaseline=window.LearningMain.lessonSnapshot({...material,blocks:saved});
}
function stageSaveLesson(published){
  if(document.getElementById('material')?.dataset?.lmKind==='exam'&&!lmState?.examOwned){
    window.LearningMain.notice('Open the examination block again before saving.',true);return Promise.resolve();
  }
  if(lmState&&lmState.examOwned){
    if(!canEditLessons()||viewSwitching)return Promise.resolve();
    const current=lmState,generation=viewGen;
    clearTimeout(lmSaveTimer);
    if(published!==undefined){current.published=!!published;current.mode=published?'preview':'edit';}
    if(typeof examSync==='function')return window.LearningMain.perform(async()=>{
      await examSync();
      if(current!==lmState||generation!==viewGen||viewSwitching)return;
      if(typeof lmShow==='function')lmShow(current.mode);
      if(typeof lmNote==='function')lmNote(current.published?'':'Draft saved.');
      if(typeof examDress==='function')examDress();
    });
    return Promise.resolve();
  }
  const bound=stageDomId(document.getElementById('material')?.dataset?.lmBound||'');
  if(bound&&lmState?.id!==bound){
    const found=lmLibrary?.materials?.find(row=>row.id===bound);
    if(!found){window.LearningMain.notice('This editor is no longer attached to its lesson. Open the lesson again.',true);return Promise.resolve();}
    lmState=found;
  }
  if(!canEditLessons()||viewSwitching||!lmState){
    window.LearningMain.notice('Урок не отправлен: дождитесь загрузки собственного профиля учителя и откройте редактор.',true);return Promise.resolve();
  }
  if(lmState.stageLessonDeferred){
    window.LearningMain.notice('The lesson is still opening. Wait, then click Publish again.',true);return Promise.resolve();
  }
  clearTimeout(lmSaveTimer);
  const current=lmState,generation=viewGen,target=viewAccount?.id||'';
  return window.LearningMain.perform(async()=>{
    const draft=JSON.parse(JSON.stringify(current));
    const baseline=stageServerBaseline(draft);
    if(baseline)await baseline;
    if(published!==undefined){draft.published=published;draft.mode=published?'preview':'edit';}
    await window.LearningMain.saveLesson(draft);
    if(generation!==viewGen||target!==(viewAccount?.id||'')||lmState!==current)return;
    window.ContentCache?.drop(':'+current.id+':');
    window.ContentCache?.drop('lesson:');
    Object.assign(current,draft,stageLessonCounts(draft.blocks));lmState=current;lmKeepLesson();lmPersist();
    if(typeof groupSave==='function')await groupSave();
    lmShow(current.published?'preview':'edit');lmNote('Сохранено в тестовую Learning.');
  },document.getElementById('lmNote'));
}
function stageServerBaseline(material){
  if(!material||material.stageLessonBaseline||!material.stageRevision||typeof accountFetch!=='function'||typeof window.LearningMain?.lessonSnapshot!=='function')return null;
  const target=(typeof viewAccount!=='undefined'&&viewAccount?.id)||'';
  const path=target?'/api/admin/users/'+encodeURIComponent(target)+'/lessons':'/api/lessons';
  return accountFetch(path+'?id='+encodeURIComponent(material.id)).then(data=>{
    const full=(data.materials||[]).find(row=>row.id===material.id);
    if(full)material.stageLessonBaseline=window.LearningMain.lessonSnapshot(full);
  });
}
async function stageLookupLessonWord(){
  if(!canEditLessons()||!accountReady||viewSwitching||!lmState)return;
  const input=document.getElementById('lmWordInput'),status=document.getElementById('lmWordStatus'),button=document.getElementById('lmWordGo');
  const word=input?.value.trim(),current=lmState,tab=lmTab(),generation=viewGen;
  if(!word||!['words','phrases'].includes(tab))return;
  if(button)button.disabled=true;
  status.textContent='Finding shared cards…';
  const add=async card=>{
    const definition=await window.LearningMain.dictionary({stageId:card.id});
    if(current!==lmState||generation!==viewGen||viewAccount||viewSwitching)return;
    if(current.blocks.some(block=>block.tab===tab&&block.stageId===card.id)){status.textContent='This card is already on this page.';return;}
    const item={...definition,id:lmId(),type:'wordcard',tab,collapsed:false,word:definition.en,stageId:card.id,stageScope:'shared'};
    lmInsertBlockFront(item);input.value='';status.textContent='';lmRenderEditor();lmSchedule();
  };
  try{
    const rows=await window.LearningMain.lessonCards(word);
    if(current!==lmState||generation!==viewGen||viewAccount||viewSwitching)return;
    if(!rows.length){
      status.textContent='Looking up and saving this card…';
      const card=await window.LearningMain.lookupLessonCard(word);
      await add(card);return;
    }
    if(rows.length===1){await add(rows[0]);return;}
    const select=document.createElement('select'),choose=document.createElement('button');
    for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=row.en+' — '+row.ru+' ['+row.id.slice(-8)+']';select.append(option);}
    choose.type='button';choose.className='btn';choose.textContent='Add selected card';choose.onclick=()=>{choose.disabled=true;void add(rows.find(row=>row.id===select.value)).catch(error=>{status.textContent=error.message;window.LearningMain.notice(error.message,true);}).finally(()=>{choose.disabled=false;});};
    status.replaceChildren(document.createTextNode('Select the exact card: '),select,choose);
  }catch(error){status.textContent=error.message;window.LearningMain.notice(error.message,true);}
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
  if(!canEditLessons()||viewSwitching||!file)return;
  const block=lmBlock(id);if(!block)return;
  const current=lmState,generation=viewGen,target=viewAccount?.id||'';
  return window.LearningMain.perform(async()=>{
    await stageServerBaseline(current);
    const dirty=typeof window.LearningMain.lessonDirty==='function'?window.LearningMain.lessonDirty(current):!current.stageLessonBaseline;
    if(!current.stageRevision||!block.stageBlockRevision||dirty){
      const draft=JSON.parse(JSON.stringify(current));
      await stageServerBaseline(draft);
      await window.LearningMain.saveLesson(draft);
      if(lmState!==current||viewGen!==generation||target!==(viewAccount?.id||''))return;
      Object.assign(current,draft);
    }
    const saved=(current.blocks||[]).find(row=>row.id===id)||block;
    await window.LearningMain.uploadLessonFile(current,saved,file);
    if(lmState!==current||viewGen!==generation||target!==(viewAccount?.id||''))return;
    if(lmFiles[id]){URL.revokeObjectURL(lmFiles[id]);delete lmFiles[id];}
    lmKeepLesson();lmPersist();lmRenderEditor();lmNote('Файл сохранён в изолированном тестовом хранилище; ссылка — в тестовой Learning.');
  },document.getElementById('lmNote'));
}
function stageClearLessonFile(id){
  if(lmState&&lmState.examOwned){
    const block=lmBlock(id);if(!block)return;
    block.name='';block.size='';block.sample=false;block.hasFile=false;block.fileType='';
    for(const key of ['fileId','localMediaKey','remoteUrl'])delete block[key];
    if(lmFiles[id]){URL.revokeObjectURL(lmFiles[id]);delete lmFiles[id];}
    if(typeof examSync==='function')examSync();
    if(typeof lmRenderEditor==='function')lmRenderEditor();
    return;
  }
  if(!canEditLessons()||viewSwitching)return;
  const block=lmBlock(id);if(!block)return;
  const current=lmState,generation=viewGen,target=viewAccount?.id||'';
  return window.LearningMain.perform(async()=>{
    await window.LearningMain.detachLessonFile(current,block);
    if(lmState!==current||viewGen!==generation||target!==(viewAccount?.id||''))return;
    if(lmFiles[id]){URL.revokeObjectURL(lmFiles[id]);delete lmFiles[id];}
    lmKeepLesson();lmPersist();lmRenderEditor();lmNote('Ссылка снята на тестовом сервере. Сам файл не удалён.');
  },document.getElementById('lmNote'));
}
function stageDeleteLesson(id){
  id=stageDomId(id);
  if(!canEditLessons()||viewSwitching)return;
  const current=lmLibrary?.materials.find(row=>row.id===id)||(lmState?.id===id?lmState:null);
  if(!current)return;
  if(!confirm('Move this lesson to Archive?'))return;
  return window.LearningMain.perform(async()=>{
    if(!current.stageRevision){
      if(Number.isSafeInteger(current.id)){
        const data=await accountFetch('/api/lessons?id='+encodeURIComponent(current.id));
        const saved=data.materials?.find(row=>row.id===current.id);
        if(!saved)throw new Error('Lesson not found. Refresh Classes.');
        Object.assign(current,saved);
      }else await window.LearningMain.saveLesson(current);
    }
    await window.LearningMain.deleteLesson(current);
    window.ContentCache?.drop(':'+id+':');
    lmLibrary.materials=lmLibrary.materials.filter(row=>row.id!==id&&row.id!==current.id);
    if(lmState===current||lmState?.id===id||lmState?.id===current.id)lmState=null;
    lmLibrary.activeId=lmLibrary.materials[0]?.id||'';
    lmPersist();show('days');
  });
}
globalThis.lmDeleteLesson=stageDeleteLesson;
function stageHideLesson(id){
  id=stageDomId(id);
  if(viewSwitching||!accountReady)return;
  if(viewAccount){
    if(!canTuneStudentLessons())return;
    const current=lmLibrary?.materials.find(row=>row.id===id);if(!current?.stageRevision){window.LearningMain.notice('Урок не связан с тестовой Learning.',true);return;}
    const accountId=viewAccount.id,generation=viewGen;
    const expected={allowHidden:lmAllowedForStudent(id),personalHidden:lmHiddenForStudent(id)};
    const changes={...expected};if(current.hiddenFromStudents)changes.allowHidden=!expected.allowHidden;else changes.personalHidden=!expected.personalHidden;
    return window.LearningMain.perform(async()=>{
      await window.LearningMain.setManagedLessonAccess(accountId,id,expected,changes);
      if(viewAccount?.id!==accountId||viewGen!==generation)return;
      const update=(list,flag)=>flag?[...new Set([...list,String(id)])]:list.filter(value=>String(value)!==String(id));
      installAllowedLessons(update(loadAllowedLessons(),changes.allowHidden));
      installHiddenLessons(update(loadHiddenLessons(),changes.personalHidden));paintLmDays();
    });
  }
  if(!canEditLessons())return;
  const current=lmLibrary?.materials.find(row=>row.id===id);if(!current)return;
  return window.LearningMain.perform(async()=>{
    if(!current.stageRevision){
      if(!Number.isSafeInteger(current.id))throw new Error('Save this lesson before changing its visibility.');
      const data=await accountFetch('/api/lessons?id='+encodeURIComponent(current.id));
      const saved=data.materials?.find(row=>row.id===current.id);
      if(!saved)throw new Error('Lesson not found. Refresh Groups.');
      Object.assign(current,saved);
    }
    await window.LearningMain.hideLesson(current,!current.hiddenFromStudents);paintLmDays();
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
  if(!authUser || viewAccount || viewSwitching || !accountReady){window.LearningMain.notice('Ответы сохраняются только в собственный профиль.',true);return;}
  const raw=input.dataset.response||input.dataset.write||input.dataset.pick||input.dataset.quizCheck||input.dataset.exCheck;
  const bits=raw.split(':'),block=(lmState?.blocks||[]).find(row=>row.id===stageDomId(input.dataset.response||input.dataset.quizCheck||input.dataset.exCheck||bits[0]));
  if(!block || !block.stageBlockRevision){window.LearningMain.notice('Задание не связано с серверным ID. Перезагрузите урок.',true);return;}
  if(input.dataset.response)block.response=input.value;
  if(input.dataset.write && block.items?.[Number(bits[1])])block.items[Number(bits[1])].typed=input.value;
  if(input.dataset.pick){
    if(!input.checked)return;
    if(block.items?.[Number(bits[1])])block.items[Number(bits[1])].picked=Number(bits[2]);
  }
  try{window.LearningMain.response(lmState.id,block,stageResponseValue(block,checking),checking||event.type==='focusout');}
  catch(error){window.LearningMain.notice(error.message,true);}
}
document.addEventListener('click',event=>{
  const action=event.target.closest&&event.target.closest('[data-stage-library-action]');
  if(action){event.preventDefault();event.stopPropagation();stageLibraryAction(action.dataset.stageLibraryAction,action.dataset.libraryKind,action.dataset.libraryId);return;}
  const song=event.target.closest&&event.target.closest('[data-lyric]');
  if(song){event.preventDefault();event.stopPropagation();stageOpenSongId(song.dataset.lyric);return;}
  const text=event.target.closest&&event.target.closest('[data-text-open]');
  if(text){event.preventDefault();event.stopPropagation();stageOpenText(text.getAttribute('data-text-open'));return;}
},true);
document.addEventListener('click',event=>{
  const more=event.target.closest&&event.target.closest('[data-stage-more]');
  if(more){stageLibraryBatch(more.dataset.stageMore);return;}
  const retry=event.target.closest&&event.target.closest('[data-stage-retry]');
  if(!retry)return;
  const kind=retry.dataset.stageRetry;
  if(kind==='lesson'){const row=lmLibrary?.materials?.find(item=>item.id===stageDomId(retry.dataset.lessonId));if(row)stageOpenLesson(row);return;}
  if(kind==='speak'){stageLoadSpeak('level',speakLevel,-1,-1);return;}
  if(kind==='verbs'){show('verbs');return;}
  if(kind==='texts'){stagePaintTexts();return;}
  if(kind==='song'){stageOpenSongId(retry.dataset.songId);return;}
  stageLibraryBatch(kind);
});
for(const event of ['input','change','focusout','click'])document.addEventListener(event,stageResponseEvent,true);
document.addEventListener('learning-personal-saved',event=>{
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
    const card=window.LearningMain.cardForProgress?.(result.id);
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
  const phrases=(data.phrasalWords||[]).filter(cardVisible).length+(typeof loadAdded==='function'?loadAdded().filter(item=>['phrasal','chat-phrasal'].includes(item.place)&&!item.fromText).length:0);
  const idioms=(data.idiomWords||[]).filter(cardVisible).length+(typeof loadAdded==='function'?loadAdded().filter(item=>['idioms','chat-idioms'].includes(item.place)&&!item.fromText).length:0);
  const words=typeof allRows==='function'?allRows().length:((data.words||[]).length+(data.extraWords||[]).length+(data.lines21||[]).length+(data.ask07||[]).length+(data.phrases09||[]).length+(data.adverbs14||[]).length+(data.talk16||[]).length+(data.likes23||[]).length+mine+phrases+idioms);
  return {words,mine,phrases,idioms,verbs:(window.IRREGULAR||[]).filter(cardVisible).length,songs:typeof loadSongs==='function'?loadSongs().filter(row=>!row.archived).length:0,texts:typeof loadTexts==='function'?loadTexts().filter(row=>!row.archived).length:0};
}
function stagePaintCounts(counts){
  const live=stageLiveCounts();
  const merged={...(counts||{})};
  for(const [key,value] of Object.entries(live))if(value||stageSettled[key])merged[key]=value;
  const set=(id,value)=>{const node=typeof document!=='undefined'&&document.getElementById?document.getElementById(id):null;if(node&&value!=null)node.textContent=String(value);};
  set('allWordCount',merged.words);set('myWordCount',merged.mine);set('phrasalCount',merged.phrases);set('idiomCount',merged.idioms);set('verbCount',merged.verbs);set('lyricCount',merged.songs);set('textCount',merged.texts);
  if(hideStudentSongs()){
    const data=window.LESSON_DATA||{},personal=typeof loadAdded==='function'?loadAdded():[];
    const pools=[['myWordCount',personal.filter(row=>(row.place||'mine')==='mine'),merged.mine],['phrasalCount',[...(data.phrasalWords||[]),...personal.filter(row=>row.place==='phrasal')],merged.phrases],['idiomCount',[...(data.idiomWords||[]),...personal.filter(row=>row.place==='idioms')],merged.idioms],['allWordCount',[...Object.values(data).filter(Array.isArray).flat(),...personal],merged.words]];
    for(const [id,rows,total] of pools){const count=new Set(rows.filter(row=>hiddenCardIds.has(String(row.stageId||row.cardId||''))).map(row=>String(row.stageId||row.cardId))).size;if(count&&total){set(id,count+' / '+total);const node=document.getElementById(id);if(node)node.title=count+' hidden of '+total+' materials';}}
  }
}
var stageSettled={};
const stagePersonalPlaces=['mine','phrasal','idioms','text','chat','chat-phrasal','chat-idioms','music','tenses','lesson-07','lesson-09','lesson-14','lesson-16','lesson-21','lesson-23'];
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
  const generation=viewGen,target=viewAccount?.id||'';
  return window.ContentCache.load('library:summary',()=>accountFetch(stageAccountBase()+'/state?summary=1')).then(state=>{if(generation!==viewGen||target!==(viewAccount?.id||''))return;window.ContentCache.set('account:bootstrap',state);stagePaintCounts(state.counts);return state.counts;});
}
function stageRepaint(section){
  stageRefreshLyricMarks();
  if(section==='allwords'&&typeof paintAllWords==='function')paintAllWords();
  if(section==='phrasal'||section==='idioms')paintDeckGrids(section);
  const host=document.getElementById(section==='allwords'?'allWordGrid':section==='phrasal'?'phrasalGrid':'idiomGrid');
  return host;
}
var stageBatchJobs;
function stageLibraryBatch(section,follow=true){
  if(!stageBatchJobs)stageBatchJobs=new Map();
  if(stageBatchJobs.has(section))return stageBatchJobs.get(section);
  const job=stageLibraryBatchRun(section,follow).finally(()=>stageBatchJobs.delete(section));
  stageBatchJobs.set(section,job);
  return job;
}
async function stageLibraryBatchRun(section,follow=true){
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
    if(host&&!(window.LESSON_DATA[bank]||[]).length&&!(section==='allwords'&&typeof allRows==='function'&&allRows().length))host.innerHTML='<p class="hint">No cards yet.</p>';
    if(follow)stageFollow('library:'+section,page.next,after,()=>stageLibraryBatch(section));
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
  if(!stageSettled.mine&&!window.ContentCache?.has('cards:personal:mine:after:start'))return true;
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
let stageCardWavePromise=null;
function stageCardFirstWave(){
  if(stageSettled.firstWave)return Promise.resolve();
  if(stageCardWavePromise)return stageCardWavePromise;
  stageCardWavePromise=(async()=>{
    const mine=await stagePersonalPage('mine','',false);
    const phrasal=await stageLibraryBatch('phrasal',false);
    const personalPhrasal=await stagePersonalPage('phrasal','',false);
    const idioms=await stageLibraryBatch('idioms',false);
    const personalIdioms=await stagePersonalPage('idioms','',false);
    if(mine?.next)stageFollow('cards:mine',mine.next,'',next=>stagePersonalPage('mine',next));
    if(phrasal?.next)stageFollow('library:phrasal',phrasal.next,'',()=>stageLibraryBatch('phrasal'));
    if(personalPhrasal?.next)stageFollow('cards:phrasal',personalPhrasal.next,'',next=>stagePersonalPage('phrasal',next));
    if(idioms?.next)stageFollow('library:idioms',idioms.next,'',()=>stageLibraryBatch('idioms'));
    if(personalIdioms?.next)stageFollow('cards:idioms',personalIdioms.next,'',next=>stagePersonalPage('idioms',next));
    const queue=window.PreloadQueue;
    const rest=stagePersonalPlaces.slice(3).map(place=>({id:'cards:personal:'+place,priority:6,run:()=>stagePersonalPage(place,'')}));
    rest.push({id:'library:allwords',priority:6,run:()=>stageLibraryBatch('allwords')});
    if(queue)for(const job of rest)queue.add(job);else for(const job of rest)await job.run();
    stageSettled.firstWave=true;
  })().finally(()=>{stageCardWavePromise=null;});
  return stageCardWavePromise;
}
function stageDemand(id){
  try{
    if(['lyricadd','song','textedit'].includes(id))stageGrowTextEditors();
    if(['grammarcategories','grammarcategory','grammarrule'].includes(id))stageGrammarPaint();
    if(['everyday','everydaygroup','everydaytopic'].includes(id))stageEverydayLoad();
    if(['library','allwords','home'].includes(id)&&authUser)stageEverydayLoad();
    if(id==='library'){stageLibrarySummary().catch(error=>window.LearningMain.notice(error.message,true));if(typeof authUser!=='undefined'&&authUser)stageKick('cards:first-wave',stageCardFirstWave);}
    if(id==='verbs')stageKick('irregular',()=>stageEnsureStatic('IRREGULAR').then(()=>{if((document.querySelector('section.on')||{}).id==='verbs')paintVerbs();}).catch(error=>window.LearningMain.notice(error.message,true)));
    if(id==='tenses'||id==='tense'||id==='marker')stageKick('grammar',()=>stageEnsureStatic('GRAMMAR').catch(error=>window.LearningMain.notice(error.message,true)));
    if(id==='allwords')stageLibrarySection(id);
    if(id==='phrasal'||id==='idioms')stageKick('cards:first-wave',stageCardFirstWave);
    if(id==='music'||id==='song')stageKick('songs:list',()=>stageSongPage(''));
    if(id==='add'||id==='made')stageKick('cards:personal:mine',()=>stagePersonalPage('mine','').then(()=>{if((document.querySelector('section.on')||{}).id===id&&typeof paintAdded==='function')paintAdded();}));
    if(['setup','exam','errors','made','add','word','cardstat'].includes(id)){stageKick('progress',()=>stageProgressPage(''));stageKick('quizzes',()=>stageQuizPage(''));}
    if(id==='home'){stageKick('progress',()=>stageProgressPage(''));stageKick('cards:first-wave',stageCardFirstWave);}
    if(id==='days'||id==='material')stageKick('lesson:summary',()=>stageQueueLessons());
  }catch(error){window.LearningMain?.notice?.(error.message,true);}
}
var stageDemandFrame=0,stageDemandNext='';
function stageDemandLater(id){
  stageDemandNext=id;
  if(stageDemandFrame)return;
  const run=()=>{stageDemandFrame=0;const next=stageDemandNext;stageDemandNext='';setTimeout(()=>stageDemand(next),0);};
  if(typeof requestAnimationFrame==='function')stageDemandFrame=requestAnimationFrame(run);
  else setTimeout(run,0);
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
const stageSpeakVersions=new Map();
let stageSpeakRevisionJob;
function stageSpeakVersion(){return (window.ContentCache.get('account:bootstrap')||{}).versions?.speakout||'';}
function stageSpeakAudience(){return (authUser?.id||'guest')+':'+(authUser?.role||'guest');}
function stageSpeakNeedsLoad(level){
  return !window.SPEAKOUT?.[level]?.level || stageSpeakVersions.get(level)!==stageSpeakAudience()+':'+(stageSpeakVersion()||stageSpeakVersions.get('public'));
}
async function stageSpeakCatalog(level){
  const name=(stageLevels()[level]||[])[0];if(!name)return;
  const audience=stageSpeakAudience(),generation=viewGen;
  let version=stageSpeakVersion();
  if(!version){
    stageSpeakRevisionJob ||= fetch('/api/catalogs/SPEAKOUT?revision=1',{cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('Unable to load Speakout.');return (await response.json()).revision;}).catch(error=>{stageSpeakRevisionJob=null;throw error;});
    version=await stageSpeakRevisionJob;stageSpeakVersions.set('public',version);
  }
  const data=await window.ContentCache.load('speakout:'+audience+':'+name+':'+version,()=>fetch('/api/catalogs/SPEAKOUT?level='+encodeURIComponent(name)+'&v='+encodeURIComponent(version)+'&audience='+encodeURIComponent(audience),{cache:'default'}).then(response=>{if(!response.ok)throw new Error('Unable to load this level.');return response.json();}));
  if(audience===stageSpeakAudience()&&generation===viewGen){window.SPEAKOUT[level]=data.content;stageSpeakVersions.set(level,audience+':'+version);}return data;
}
function stageSpeakCacheOptions(){
  const actor=authUser?.id,role=authUser?.role,generation=viewGen;
  return {actor,role,read:accountFetch,active:()=>authUser?.id===actor&&authUser?.role===role&&!viewAccount&&viewGen===generation,catalog:revision=>{
    if(!revision||stageSpeakVersion()===revision)return;
    const bootstrap=window.ContentCache.get('account:bootstrap');
    if(bootstrap){bootstrap.versions={...bootstrap.versions,speakout:revision};window.ContentCache.set('account:bootstrap',bootstrap);}
    stageSpeakVersions.clear();stageSpeakVersions.set('public',revision);stageSpeakRevisionJob=Promise.resolve(revision);window.SPEAKOUT=[];
  }};
}
let stageSpeakEditorLoad,stageSpeakEditorRestore;
function stageSpeakEditorModule(){
  if(window.SpeakoutEditor)return Promise.resolve();
  stageSpeakEditorLoad ||= new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/speakout-editor.js?v=20261012-independent';script.onload=resolve;script.onerror=()=>{stageSpeakEditorLoad=null;script.remove();reject(new Error('Unable to load Speakout editor.'));};document.body.append(script);});
  return stageSpeakEditorLoad;
}
function stageResumeSpeakEditor(place){
  if(!authUser||!accountReady||viewAccount||viewSwitching)return;
  const level=place.speakLevel,unit=place.speakUnit,lesson=place.speakLesson,name=stageLevels()[level]?.[0];if(!name)return;
  const actor=authUser.id,generation=viewGen,key=actor+':'+level+':'+unit+':'+lesson;
  if(stageSpeakEditorRestore===key)return;
  stageSpeakEditorRestore=key;speakLevel=level;speakUnit=unit;speakLesson=lesson;speakView='lesson';
  stageSpeakEditorModule().then(async()=>{
    if(actor!==authUser?.id||generation!==viewGen||viewAccount)return;
    await window.SpeakoutEditor.open({level:name,unit,lesson},{actor,editor:canEditLessons(),cache:stageSpeakCacheOptions(),read:accountFetch,navigate:view=>openSpeak(view,view==='levels'?-1:level,view==='unit'?unit:-1,-1),active:()=>authUser?.id===actor&&!viewAccount&&viewGen===generation});
    if(actor===authUser?.id&&generation===viewGen&&!viewAccount)show('speakouteditor');
  }).catch(error=>window.LearningMain.notice(error.message,true)).finally(()=>{if(stageSpeakEditorRestore===key)stageSpeakEditorRestore=null;});
}
async function stageOpenSpeakMaterial(event,lesson){
  const button=event.target.closest('[data-speak-lesson]');if(!button||!authUser||viewAccount||viewSwitching)return;
  const level=speakLevel,unit=speakUnit,actor=authUser.id,generation=viewGen;
  const name=(stageLevels()[level]||[])[0],editor=canEditLessons();button.disabled=true;
  try{
    const location={level:name,unit,lesson};
    await stageSpeakEditorModule();
    if(actor!==authUser?.id||generation!==viewGen||viewAccount||speakLevel!==level||speakUnit!==unit||!document.getElementById('speakout')?.classList.contains('on'))return;
    await window.SpeakoutEditor.open(location,{actor,editor,cache:stageSpeakCacheOptions(),read:accountFetch,navigate:view=>openSpeak(view,view==='levels'?-1:level,view==='unit'?unit:-1,-1),active:()=>authUser?.id===actor&&!viewAccount&&viewGen===generation});
    if(actor===authUser?.id&&generation===viewGen&&!viewAccount){button.disabled=false;button.focus({preventScroll:true});pushHistory();speakLesson=lesson;speakView='lesson';show('speakouteditor');}
  }catch(error){window.LearningMain.notice(error.message,true);}finally{button.disabled=false;}
}
function stageLoadSpeak(view,level,unit,lesson,quiet){
  const name=(stageLevels()[level]||[])[0];
  const audience=stageSpeakAudience(),generation=viewGen;
  const list=document.getElementById('speakoutList');
  if(!name)return;
  if(list&&view!=='levels')list.innerHTML='<p class="hint">Loading level…</p>';
  return stageSpeakCatalog(level).then(data=>{
    if(audience===stageSpeakAudience()&&generation===viewGen)openSpeak(view,level,unit,lesson,quiet);
    return data;
  }).catch(error=>{if(list)list.innerHTML='<p class="hint">'+esc(error.message)+' <button class="btn" type="button" data-stage-retry="speak">Retry</button></p>';});
}
function stagePaintTexts(after){
  if(hideStudentSongs())return Promise.resolve({texts:[],next:null});
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
    paintTextCount();renderTextList();
    stagePaintCounts();
    stageFollow('texts',data.next,cursor,stagePaintTexts);
    for(const row of loadTexts())stageApplyLibraryBlocks(row,'text');
    stageFlushBlocks();stageScheduleHydration();
    return data;
  }).catch(error=>{if(box)box.innerHTML='<p class="hint">'+esc(error.message)+' <button class="btn" type="button" data-stage-retry="texts">Retry</button></p>';throw error;});
}
function stageOpenText(id){
  id=stageDomId(id);
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
  }).catch(error=>{window.LearningMain.notice(error.message,true);if(box)box.innerHTML='<p class="hint">'+esc(error.message)+' <button class="btn" type="button" data-stage-retry="texts">Retry</button></p>';});
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
  if(status&&!status.classList.contains('bad'))status.textContent='Added to '+(place==='idioms'?'Idioms':place==='phrasal'?'Phrasal verbs':'My cards')+'.';
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
  }).catch(error=>{window.LearningMain.notice(error.message,true);if(user)user.innerHTML='<p class="hint">'+esc(error.message)+' <button class="btn" type="button" data-stage-retry="song" data-song-id="'+esc(song.id||'')+'">Retry</button></p>';});
}
function stageOpenSongId(id){
  const song=loadSongs().find(row=>row.id===stageDomId(id));
  if(song&&!song.archived)return stageOpenSong(song);
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
  if(hideStudentSongs())return [];
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
    const song=user&&typeof loadSongs==='function'?loadSongs().find(row=>row.id===stageDomId(user.dataset.songId)):null;
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
    if(more)setTimeout(stageScheduleHydration,50);
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
  }catch(error){window.LearningMain?.notice?.(error.message,true);return false;}
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
  for(const place of stagePersonalPlaces)for(const page of stageCachedPages('cards:personal:'+place+':after:'))for(const card of page.cards||[])if(card&&card.stageId)remote.push(card);
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
  if((previous.archiveRevision||0)!==(state.archiveRevision||0))drop('archive:');
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
  try{const saved=JSON.parse(localStorage.getItem('learning-main-prefs')||'{}');return saved&&typeof saved==='object'?saved:{};}catch(e){return {};}
}
function stageKeepSetting(change){
  const keys=['lyricSize','customThemes','dayLinks','demonstratives'];
  if(!change||change.op!=='put-setting'||!keys.includes(change.key)||(typeof viewAccount!=='undefined'&&viewAccount))return false;
  const prefs=stageReadPrefs();
  prefs[change.key]=change.value;
  try{localStorage.setItem('learning-main-prefs',JSON.stringify(prefs));}
  catch(e){if(change.key==='customThemes'&&Array.isArray(change.value)){prefs.customThemes=change.value.map(row=>({...row,photo:row&&typeof row.photo==='string'&&row.photo.indexOf('stage-local/themes/')===0?row.photo:''}));try{localStorage.setItem('learning-main-prefs',JSON.stringify(prefs));}catch(err){}}}
  return true;
}
function stageApplyPrefs(){
  const prefs=stageReadPrefs();
  if(prefs.lyricSize){
    try{localStorage.setItem('enquiz-lyric-size',String(prefs.lyricSize));}catch(e){}
    if(typeof lyricSize!=='undefined')lyricSize=Number(prefs.lyricSize)||lyricSize;
    if(typeof applyLyricSize==='function')applyLyricSize(document);
  }
  if(prefs.dayLinks){try{localStorage.setItem('enquiz-day-links',JSON.stringify(prefs.dayLinks));}catch(e){}}
  if(prefs.demonstratives){try{localStorage.setItem('enquiz-demonstratives',JSON.stringify(prefs.demonstratives));}catch(e){}if(typeof window.paintDemonstratives==='function'&&document.getElementById('demonstratives')?.classList.contains('on'))window.paintDemonstratives();}
}
let stageCacheAudience='';
function stageApplyBootstrap(state){
  const audience=(authUser?.id||'')+':'+(viewAccount?.id||'');
  if(stageCacheAudience&&stageCacheAudience!==audience){
    groupReset();examResetAccount();
    localStorage.removeItem('enquiz-exams');
    for(const prefix of ['account:','cards:personal:','progress:','quizzes:','songs:','texts:','lesson:','library:summary','block:'])window.ContentCache?.invalidate(prefix);
    for(const key of Object.keys(stageListEpoch))stageListEpoch[key]++;
    stageProgressEpoch++;stageLessonOpenToken++;stageSettled={};stageCycles.clear();stagePreloadOn=false;
  }
  stageCacheAudience=audience;
  stageDropStale(window.ContentCache?.get('account:bootstrap'),state);
  window.ContentCache?.set('account:bootstrap',state);
  if(authUser&&!viewAccount)window.SpeakoutCache?.configure(stageSpeakCacheOptions());
  window.__archiveRevision=Number(state.archiveRevision)||0;
  stageSetActivity(state.stageActivity);
  if(state.stats){
    hiddenCardIds=new Set((state.stats.hiddenCardIds||[]).map(String));
    if(!viewAccount)applyAccountThemes({theme:state.stats.theme,themes:state.stats.customThemes});
    if(state.stats.lyricSize)localStorage.setItem('enquiz-lyric-size',String(state.stats.lyricSize));
    if(typeof installHiddenLessons==='function')installHiddenLessons(state.stats.hiddenLessons);
    if(typeof installAllowedLessons==='function')installAllowedLessons(state.stats.allowedLessons);
    if(state.stats.dayLinks)localStorage.setItem(LINK_KEY,JSON.stringify(state.stats.dayLinks));
    if(state.stats.demonstratives)localStorage.setItem('enquiz-demonstratives',JSON.stringify(state.stats.demonstratives));
  }
  stageApplyPrefs();
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
  if(window.PreloadQueue){
    if(!viewAccount)window.PreloadQueue.add({id:'archive:preload',priority:4,run:()=>!viewAccount?window.LearningMain.archiveList():Promise.resolve()});
    if(!hideStudentSongs()){
      window.PreloadQueue.add({id:'songs:preload',priority:5,run:()=>stageSongPage('')});
      window.PreloadQueue.add({id:'texts:preload',priority:5,run:()=>stagePaintTexts('')});
    }
    window.PreloadQueue.add({id:'irregular:page',priority:6,run:()=>stageEnsureStatic('IRREGULAR')});
    if(authUser&&!viewAccount){
      const options=stageSpeakCacheOptions();
      window.PreloadQueue.add({id:'speakout:manifest:'+stageSpeakAudience(),priority:9,run:()=>options.active()?window.SpeakoutCache?.refresh():Promise.resolve()});
      window.PreloadQueue.add({id:'speakout:catalogs:'+stageSpeakAudience(),priority:10,run:()=>stageFetchSpeak(0,options.active)});
    }
  }
}
async function stageRefreshArchiveSources(detail){
  if(!authUser||authUser.id!==detail.actorId)return;
  const cache=window.ContentCache,type=detail.type,id=stageDomId(detail.id),jobs=[];
  cache?.invalidate('library:summary');cache?.invalidate('account:bootstrap');
  if(type==='song'||type==='text'){
    const key=type==='song'?'songs':'texts';stageListEpoch[key]++;stageSettled[key]=false;
    cache?.invalidate(key+':');cache?.drop(stageItemKey(type,id));
    if(detail.archived||detail.removed){
      const list=(type==='song'?loadSongs():loadTexts()).filter(row=>row.stageId!==id&&row.id!==id);
      if(type==='song')writeSongs(list);else localStorage.setItem(TEXT_KEY,JSON.stringify(list));
      stagePaintLibraryList(type);
    }
    jobs.push(type==='song'?stageSongPage(''):stagePaintTexts(''));
  }
  if(type==='lesson'||type==='group'){
    cache?.invalidate('lesson:');cache?.drop('block:lesson:'+id+':');
    stageLessonOpenToken++;
    jobs.push(stagePullLessons().then(()=>groupPull(true)));
  }
  if(type==='exam'||type==='exam-block')jobs.push(examPull(true));
  if(type==='card'){
    stageListEpoch.cards++;stageSettled.firstWave=false;stageSettled.mine=false;
    cache?.invalidate('cards:personal:');cache?.invalidate('library:');
    for(const section of ['words','phrases','idioms'])cache?.invalidate('cards:'+section+':');
    if(detail.archived||detail.removed){
      rememberAdded(loadAdded().filter(row=>row.stageId!==id));
      for(const key of ['words','extraWords','phrasalWords','idiomWords'])if(Array.isArray(window.LESSON_DATA[key]))window.LESSON_DATA[key]=window.LESSON_DATA[key].filter(row=>row.stageId!==id);
    }
    jobs.push(stageCardFirstWave(),stageLibraryBatch('allwords'));
  }
  jobs.push(window.LearningMain.archiveList());
  await Promise.all(jobs).catch(error=>window.LearningMain.notice(error.message,true));
  if(authUser?.id!==detail.actorId)return;
  await stageLibrarySummary().catch(error=>window.LearningMain.notice(error.message,true));
  if(document.querySelector('section.on')?.id==='archive')paintArchive();
  stageRefreshHome();
}
document.addEventListener('learning-archive-changed',event=>{event.detail.refresh=stageRefreshArchiveSources(event.detail);});
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
  const generation=viewGen,target=viewAccount?.id||'',actor=authUser.id,path=target?'/api/admin/users/'+encodeURIComponent(target)+'/lessons':'/api/lessons';
  const cacheKey='lesson:'+actor+':'+target+':'+material.id+':'+material.stageRevision;
  return window.ContentCache.load(cacheKey,()=>accountFetch(path+'?id='+encodeURIComponent(material.id))).then(data=>{
    if(generation!==viewGen||target!==(viewAccount?.id||'')||actor!==authUser?.id||viewSwitching)return data;
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
function stagePersonalPage(place,after,follow=true){
  if(hideStudentSongs()&&['text','music'].includes(place))return Promise.resolve({cards:[],next:null});
  const epoch=stageListEpoch.cards,cursor=after||'',prefix='cards:personal:'+place+':after:';
  const generation=viewGen,target=viewAccount?.id||'',actor=authUser?.id;
  return window.ContentCache.load(prefix+(cursor||'start'),()=>accountFetch(stageAccountBase()+'/cards?place='+encodeURIComponent(place)+'&limit=50'+(cursor?'&after='+encodeURIComponent(cursor):''))).then(page=>{
    if(generation!==viewGen||target!==(viewAccount?.id||'')||actor!==authUser?.id)return page;
    if(stageListStale('cards',epoch,'cards:personal'))return page;
    const seen=stageCycle('cards:'+place,cursor);
    const list=loadAdded();
    for(const card of page.cards||[]){
      const id=(card.stageId||'')+':'+(card.place||'mine');
      if(card.stageId)seen.ids.add(id);
      const index=list.findIndex(row=>row.stageId===card.stageId&&(row.place||'mine')===(card.place||'mine'));
      if(index<0)list.push(card);
      else if((card.stageRevision||0)>=(list[index].stageRevision||0))list[index]={...list[index],...card,place:card.place||list[index].place,word:card.word||card.en||list[index].word};
    }
    const next=!page.next&&seen.started?list.filter(row=>(row.place||'mine')!==place||!row.stageId||seen.ids.has(row.stageId+':'+place)):list;
    if(place==='mine'&&!page.next&&seen.started)stageSettled.mine=true;
    rememberAdded(next);
    const on=(document.querySelector('section.on')||{}).id;
    if((on==='add'||on==='made'||on==='phrasal'||on==='idioms')&&typeof paintAdded==='function')paintAdded();
    if(typeof paintDeckCounts==='function')paintDeckCounts();
    stagePaintCounts();
    stageRefreshHome();
    if(follow)stageFollow('cards:'+place,page.next,cursor,next=>stagePersonalPage(place,next));
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
  if(hideStudentSongs())return Promise.resolve({songs:[],next:null});
  const epoch=stageListEpoch.songs,cursor=after||'';
  const generation=viewGen,target=viewAccount?.id||'',actor=authUser?.id;
  return window.ContentCache.load('songs:list:after:'+(cursor||'start'),()=>accountFetch(stageAccountBase()+'/songs?limit=50'+(cursor?'&after='+encodeURIComponent(cursor):''))).then(page=>{
    if(generation!==viewGen||target!==(viewAccount?.id||'')||actor!==authUser?.id)return page;
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
function stageFetchSpeak(index,active=()=>true){
  const name=(stageLevels()[index]||[])[0];
  if(!name||!active())return Promise.resolve();
  return stageSpeakCatalog(index).then(data=>{
    if(active()&&index+1<stageLevels().length)window.PreloadQueue.add({id:'speakout:'+stageSpeakAudience()+':'+stageLevels()[index+1][0],priority:10,run:()=>stageFetchSpeak(index+1,active)});
    return data;
  });
}

let stageEverydayState={group:'speech',topic:'',groupSearch:'',wordSearch:''};
var stageGrammarGroup='classes';
var stageGrammarRule='';
function stageGrammarPaint(){
  const groups=window.GrammarCategories||[];
  const list=document.getElementById('grammarCategoryGroups');if(!list)return;
  list.innerHTML=groups.map(group=>stageEverydayButton(group.id,group.title+' / '+(window.GrammarGroupNames?.[group.id]||''),group.cards.length,'data-grammar-group','categories')).join('');
  const group=groups.find(group=>group.id===stageGrammarGroup);if(!group)return;
  document.getElementById('grammarCategoryTitle').textContent=group.title+' / '+(window.GrammarGroupNames?.[group.id]||'');
  document.getElementById('grammarCategoryCards').innerHTML=group.cards.map(([title,meaning])=>'<button class="wcard grammar-rule-card" type="button" data-grammar-rule="'+esc(title)+'">'+wordPic(title)+'<span class="en">'+esc(title)+'</span><span class="label">'+esc(window.GrammarDetails?.[title]?.ru||meaning)+'</span></button>').join('');
  const detail=window.GrammarDetails?.[stageGrammarRule];if(!detail)return;
  document.getElementById('grammarRuleTitle').textContent=stageGrammarRule+' / '+detail.ru;
  const pair=(en,ru)=>'<p lang="en">'+esc(en)+'</p><p lang="ru" class="label">'+esc(ru)+'</p>';
  const labels=window.GrammarUi;
  document.getElementById('grammarRuleBody').innerHTML='<div class="grammar-band"><h2>'+esc(labels.meaning)+'</h2>'+pair(detail.en,detail.definition)+'</div><div class="grammar-band"><h2>'+esc(labels.structure)+'</h2>'+pair(detail.pattern,detail.patternRu)+'</div><div class="grammar-band"><h2>'+esc(labels.distinctions)+'</h2>'+pair(detail.contrast,detail.contrastRu)+'</div><div class="grammar-band"><h2>'+esc(labels.examples)+'</h2><ol>'+detail.examples.map(([en,ru])=>'<li>'+pair(en,ru)+'</li>').join('')+'</ol></div><button class="btn" type="button" data-grammar-vocabulary>'+esc(labels.vocabulary)+'</button><div class="grammar-band"><h2>'+esc(labels.references)+'</h2><ul>'+window.GrammarReferences.map(([label,url])=>'<li><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a></li>').join('')+'</ul></div>';
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-grammar-group],[data-grammar-rule],[data-grammar-vocabulary]');if(!button)return;
  pushHistory();
  if(button.hasAttribute('data-grammar-vocabulary')){stageEverydayState={group:'topics',topic:'topic-grammar',groupSearch:'',wordSearch:''};show('everydaytopic');stageEverydayLoad();return;}
  if(button.dataset.grammarGroup){stageGrammarGroup=button.dataset.grammarGroup;stageGrammarRule='';stageGrammarPaint();show('grammarcategory');}
  else {stageGrammarRule=button.dataset.grammarRule;stageGrammarPaint();show('grammarrule');}
});
var stageEverydayData=null,stageEverydayAudience='',stageEverydayFlight=null;
function stageEverydayAudienceKey(){return [authUser?.id||'',authUser?.role||'',viewAccount?.id||'',viewGen].join(':');}
function stageEverydayCount(group){return group.topics.reduce((count,topic)=>count+topic.entries.length,0);}
function stageEssentialEntries(){
  if(!stageEverydayData||stageEverydayAudience!==stageEverydayAudienceKey())return [];
  return stageEverydayData.groups.flatMap(group=>group.topics.flatMap(topic=>topic.entries.map(entry=>({...entry,source:'Essential English · '+group.title+' · '+topic.title+(entry.source?' · '+entry.source:'')}))));
}
function stageEssentialCard(id){
  const entry=stageEssentialEntries().find(item=>String(item.card.stageId)===String(id));if(!entry)return null;
  const example={en:entry.example,ru:entry.exampleRu,kind:'simple',source:'Essential English'};
  return {...entry.card,essentialSource:entry.source,ex:entry.example,data:{wooordhunt:{examples:[example]},usages:[example]},stageEverydayReference:true};
}
function stageEssentialCollect(rows){
  if(!stageEverydayData)return;
  const known=new Map(rows.map(row=>[rowToCard(row)?.stageId,row]).filter(([id])=>id));
  for(const entry of stageEssentialEntries()){
    let row=known.get(entry.card.stageId);
    if(!row){row={en:entry.card.en,ru:entry.card.ru,where:[],kind:'essential',key:String(entry.card.stageId)};rows.push(row);known.set(entry.card.stageId,row);}
    for(const source of ['Essential English',entry.source.slice('Essential English · '.length)])if(!row.where.includes(source))row.where.push(source);
  }
}
function stageWordSources(row){
  const targets=[],add=source=>{if(!targets.some(item=>JSON.stringify(item)===JSON.stringify(source)))targets.push(source);};
  const pages={'7 Sep':'lesson07','9 Sep':'lesson09','14 Sep':'lesson14','16 Sep':'lesson16','21 Sep':'lesson','23 Sep':'lesson23',Lessons:'groups','Additional word':'add','Additional words':'add',Grammar:'tenses','My words':'add','Phrasal verbs':'phrasal',Idioms:'idioms','Irregular verbs':'verbs','Song lyrics':'music',Text:'texts',Chat:'messages','From chat':'messages','Essential English':'everyday'};
  pages['My cards']='add';
  const cardId=rowToCard(row)?.stageId;
  const essential=stageEverydayData?.groups.flatMap(group=>group.topics.flatMap(topic=>topic.entries.filter(entry=>entry.card.stageId===cardId).map(()=>({label:group.title+' · '+topic.title,page:'everydaytopic',groupId:group.id,topicId:topic.id}))))||[];
  for(const label of row.where||[]){
    const topic=essential.find(source=>label===source.label||label.startsWith(source.label+' · '));
    if(topic){add({...topic,label});continue;}
    if(label==='Song lyrics'){
      const songs=songCatalog().filter(song=>rowInKeys(row,song.keys));
      if(songs.length){for(const song of songs)add({label:'Song lyrics · '+song.title,page:song.id==='sample'?'song':'music',...(song.id==='sample'?{}:{songId:song.id})});continue;}
    }
    if(label==='Text'){
      const texts=loadTexts().filter(text=>!text.archived&&rowInKeys(row,keysOfMarks(text.marks)));
      if(texts.length){for(const text of texts)add({label:'Text · '+text.title,page:'texts',textId:text.id});continue;}
    }
    add({label:label==='My words'?'My cards':label,page:pages[label]||'groups'});
  }
  return targets;
}
function stageEssentialSourceLinks(card){
  const sources=stageEssentialEntries().filter(entry=>entry.card.stageId===card.stageId);
  const row={kind:'essential',key:String(card.stageId),where:['Essential English',...sources.map(entry=>entry.source.slice('Essential English · '.length))]};
  return '<p class="label word-source-links">'+stageWordSources(row).map(source=>'<a href="#'+esc(source.page)+'" data-word-source="'+esc(JSON.stringify(source))+'">'+esc(source.label)+'</a>').join('')+'</p>';
}
document.addEventListener('click',event=>{
  const link=event.target.closest('[data-word-source]');if(!link)return;
  event.preventDefault();event.stopImmediatePropagation();
  const source=JSON.parse(link.dataset.wordSource);
  if(source.page==='everydaytopic'){
    const topic=stageEverydayData?.groups.find(group=>group.id===source.groupId)?.topics.find(topic=>topic.id===source.topicId);if(!topic)return;
    pushHistory();stageEverydayState={group:source.groupId,topic:source.topicId,groupSearch:'',wordSearch:''};show('everydaytopic');stageEverydayPaint();return;
  }
  if(source.songId){pushHistory();stageOpenSongId(source.songId);return;}
  if(source.textId){pushHistory();stageOpenText(source.textId);return;}
  if(source.page==='add'){pushHistory();addGroup='';addSong='';paintAdded();show('add');return;}
  visit(source.page);
},true);
function stageEssentialWord(entry,group,topic){
  const card=entry.card;
  const html='<button class="wcard" type="button" data-everyday-card="'+card.stageId+'">'+wordPic(card.en)+'<div class="en">'+esc(card.en)+'</div><div class="pos">'+esc(card.pos||'')+'</div>'+ipaHtml(card)+'<div class="label">'+esc(card.ru)+'</div><div class="label">'+esc(entry.example)+'</div><div class="label">'+esc(entry.exampleRu)+'</div><div class="label">'+esc('Essential English · '+group.title+' · '+topic.title)+'</div></button>';
  if(!stageCanEditTranslation(card))return html;
  const tools=canEditLessons()&&!viewAccount?editActions():'<span class="edit-actions"><button class="icon-btn" type="button" data-edit-toggle title="Edit" aria-label="Edit"><i data-lucide="pencil"></i></button></span>';
  return '<div class="wcard-tools" data-edit-host data-edit-kind="essential" data-edit-id="'+card.stageId+'" data-essential-link="'+entry.cardId+'" data-essential-topic="'+topic.id+'">'+html+tools+'</div>';
}
async function stageRemoveEssential(host){
  if(!canEditLessons()||viewAccount||!stageEverydayData)return;
  if(!confirm('Remove this card from Essential English?'))return;
  const generation=viewGen;
  try{
    await accountFetch('/api/everyday/reference',{method:'DELETE',body:JSON.stringify({topicId:host.dataset.essentialTopic,cardId:Number(host.dataset.essentialLink),expectedVersion:stageEverydayData.version})});
    if(generation!==viewGen)return;
    stageEverydayData=null;await stageEverydayLoad();paintAllWords();
  }catch(error){window.LearningMain.notice(error.message,true);if(error.status===409){stageEverydayData=null;await stageEverydayLoad();}}
}
function stageEverydayButton(id,title,count,attribute,label){return '<button class="file-card" type="button" '+attribute+'="'+esc(id)+'"><span class="num">'+count+'</span><b>'+esc(title)+'</b><span class="label">'+esc(label)+'</span></button>';}
function stageEverydayPaint(){
  if(!stageEverydayData)return;
  const groups=stageEverydayData.groups||[];
  document.getElementById('everydayGroups').innerHTML=groups.map(group=>stageEverydayButton(group.id,group.title,stageEverydayCount(group),'data-everyday-group',group.topics.length+' subgroups')).join('')||'<p class="hint">No words yet.</p>';
  const group=groups.find(item=>item.id===stageEverydayState.group)||groups[0];if(!group)return;
  stageEverydayState.group=group.id;
  document.getElementById('everydayGroupTitle').textContent=group.title;
  const groupSearch=document.getElementById('everydayGroupSearch');groupSearch.value=stageEverydayState.groupSearch;
  const query=stageEverydayState.groupSearch.trim().toLocaleLowerCase();
  const matches=entry=>[entry.card.en,entry.card.ru,entry.example,entry.exampleRu].join(' ').toLocaleLowerCase().includes(query);
  const topics=group.topics.filter(topic=>!query||topic.title.toLocaleLowerCase().includes(query)||topic.entries.some(matches));
  document.getElementById('everydayTopics').innerHTML=topics.map(topic=>stageEverydayButton(topic.id,topic.title,topic.entries.length,'data-everyday-topic',topic.entries.length?'words':'Coming soon')).join('')||'<p class="hint">No results.</p>';
  document.querySelector('[data-essential-study="group"]').disabled=!stageEverydayCount(group);
  const topic=group.topics.find(item=>item.id===stageEverydayState.topic);if(!topic)return;
  document.getElementById('everydayTopicTitle').textContent=topic.title;
  const wordSearch=document.getElementById('everydayWordSearch');wordSearch.hidden=topic.entries.length<20;wordSearch.value=stageEverydayState.wordSearch;
  const wordQuery=stageEverydayState.wordSearch.trim().toLocaleLowerCase();
  const entries=topic.entries.filter(entry=>!wordQuery||[entry.card.en,entry.card.ru,entry.example,entry.exampleRu].join(' ').toLocaleLowerCase().includes(wordQuery));
  const ordered=['basic-1','basic-2','basic-3','basic-4','basic-5','basic-6','basic-7','basic-8','basic-9','basic-15','basic-16','basic-17','basic-18'];
  if(!ordered.includes(topic.id))entries.sort((a,b)=>a.card.en.localeCompare(b.card.en,'en',{sensitivity:'base'}));
  document.getElementById('everydayWords').innerHTML=entries.map(entry=>stageEssentialWord(entry,group,topic)).join('')||'<p class="hint">'+(wordQuery?'No results.':'No words yet.')+'</p>';
  window.lucide?.createIcons({root:document.getElementById('everydayWords')});
  document.querySelector('[data-essential-study="topic"]').disabled=!topic.entries.length;
  const active=document.querySelector('section.on')?.id;if(active?.startsWith('everyday'))paintPagePath(active);
}
async function stageEverydayLoad(){
  const audience=stageEverydayAudienceKey();
  if(stageEverydayAudience!==audience){stageEverydayAudience=audience;stageEverydayData=null;stageEverydayFlight=null;}
  if(stageEverydayData){stageEverydayPaint();return;}
  if(stageEverydayFlight)return stageEverydayFlight;
  const activeId=document.querySelector('section.on')?.id,host=document.getElementById(activeId==='everydaygroup'?'everydayTopics':activeId==='everydaytopic'?'everydayWords':'everydayGroups');
  if(host)host.innerHTML='<p class="hint">Loading…</p>';
  const flight=Promise.resolve().then(()=>accountFetch('/api/everyday'+(viewAccount?'?accountId='+encodeURIComponent(viewAccount.id):''))).then(data=>{
    if(audience!==stageEverydayAudienceKey())return;
    if(!Array.isArray(data?.groups))throw new Error('Unable to load Essential English.');
    stageEverydayData=data;window.LearningMain.register(data.groups.flatMap(group=>group.topics.flatMap(topic=>topic.entries.map(entry=>entry.card))));stageEverydayPaint();
    const count=document.getElementById('allWordCount');if(count)count.textContent=allRows().length;
    if(document.querySelector('section.on')?.id==='allwords')paintAllWords();
    if(document.querySelector('section.on')?.id==='home')paintHomeStats();
  }).catch(error=>{if(audience===stageEverydayAudienceKey()&&host)host.textContent=error.message;}).finally(()=>{if(stageEverydayFlight===flight)stageEverydayFlight=null;});
  stageEverydayFlight=flight;return flight;
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-everyday-group],[data-everyday-topic],[data-everyday-card]');if(!button||!stageEverydayData)return;
  if(button.dataset.everydayGroup){pushHistory();stageEverydayState={group:button.dataset.everydayGroup,topic:'',groupSearch:'',wordSearch:''};stageEverydayPaint();show('everydaygroup');return;}
  if(button.dataset.everydayTopic){pushHistory();stageEverydayState.topic=button.dataset.everydayTopic;stageEverydayState.wordSearch='';stageEverydayPaint();show('everydaytopic');return;}
  const group=stageEverydayData.groups.find(item=>item.id===stageEverydayState.group),topic=group?.topics.find(item=>item.id===stageEverydayState.topic),entry=topic?.entries.find(item=>String(item.card.stageId)===button.dataset.everydayCard);if(!entry)return;
  const card=stageEssentialCard(entry.card.stageId);
  pushHistory();renderMade(card);show('made');
});
document.addEventListener('input',event=>{
  if(event.target.id==='everydayGroupSearch'){stageEverydayState.groupSearch=event.target.value;stageEverydayPaint();}
  if(event.target.id==='everydayWordSearch'){stageEverydayState.wordSearch=event.target.value;stageEverydayPaint();}
});
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-essential-study],[data-all-kind="essential"]');if(!target)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(target.dataset.allKind==='essential'){const card=stageEssentialCard(target.dataset.allKey);if(card){pushHistory();renderMade(card);show('made');}return;}
  if(!authUser||viewAccount||!accountReady)return;
  const group=stageEverydayData?.groups.find(item=>item.id===stageEverydayState.group),topic=group?.topics.find(item=>item.id===stageEverydayState.topic);
  const mode=target.dataset.essentialStudy;
  const entries=mode==='group'?group?.topics.flatMap(item=>item.entries):mode==='topic'?topic?.entries:madeItem?[{card:madeItem}]:[];
  const cards=[...new Map((entries||[]).map(entry=>[entry.card.stageId,stageEssentialCard(entry.card.stageId)])).values()].filter(Boolean);
  if(cards.length)openListedStudy(cards,mode==='group'?group.title:mode==='topic'?topic.title:madeItem.word,mode==='group'?'everydaygroup':mode==='topic'?'everydaytopic':'made');
},true);
