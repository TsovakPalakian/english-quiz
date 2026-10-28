// Optional main-app consumer. Existing Study and exam runners remain untouched.
(() => {
  const prefix='/api/learning-workbench',valid=id=>Number.isSafeInteger(id)&&id>0;
  let job=null,dialog=null,observer=null,serial=0;
  const displayedCards=new Map();
  let speechUI=null,providerUI=null;
  const quizTypes=['Flip','Choice','Type','Gap','Build','Match','True / false','Tap','Select all','Reverse','Spell','Letters','Listen','Definition','Odd one out','Memory','Hangman','Video choice'];
  const staff=()=>['ADMIN','DEVELOPER'].includes(authUser?.role);
  const enabled=()=>!!authUser&&accountReady&&!viewAccount&&!viewSwitching&&window.LearningMain?.capabilities?.().learningWorkbench===true;
  const identity=()=>String(authUser?.id||'')+':'+authUser?.role+':'+viewGen;
  const speechHost=()=>document.querySelector('#lmEditor:not([hidden]) #lmSpeechPanel,#lmPreview:not([hidden]) #lmSpeechPanel')||document.getElementById('material');
  const current=entry=>job===entry&&enabled()&&(!entry.lessonSpeech||dialog?.isConnected&&dialog.parentElement===speechHost())&&(!entry.queue||staff())&&(!entry.providerSettings||authUser?.role==='DEVELOPER')&&entry.identity===identity()&&entry.screen===document.querySelector('section.on')?.id&&(!entry.lessonId||entry.lessonId===lmState?.id)&&(!entry.examBridge||lmState?.examOwned&&entry.examId===lmState.examId&&entry.blockId===lmState.blockId);
  function close(){serial++;job?.uploadController?.abort();for(const file of job?.report?.files||[])if(file.url)URL.revokeObjectURL(file.url);speechUI?.reset();providerUI?.reset();job=null;observer?.disconnect();observer=null;if(dialog?.open)dialog.close();dialog?.remove();dialog=null;}
  const request=(path)=>window.LearningMain.fetch(prefix+path,{quietBug:true});
  async function write(entry,path,value){
    const signature=path+JSON.stringify(value);
    if(entry.intent?.signature!==signature)entry.intent={signature,body:JSON.stringify({mutationId:crypto.randomUUID(),...value})};
    const result=await window.LearningMain.fetch(prefix+path,{method:'POST',body:entry.intent.body,quietBug:true});entry.intent=null;return result;
  }
  function render(entry,html){if(!current(entry)){close();return;}const expanded=new Set([...dialog.querySelectorAll('[data-review-key][open]')].map(node=>node.dataset.reviewKey));dialog.querySelector('[data-workbench-body]').innerHTML=html;dialog.querySelectorAll('[data-review-key]').forEach(node=>{node.open=expanded.has(node.dataset.reviewKey);});}
  function speech(){
    if(!speechUI)speechUI=createIntegratedSpeechPracticeUI({endpoint:prefix+'/speech',
      api:(path,data)=>{const entry=job;if(!entry||entry.view!=='speech'||!current(entry))return Promise.reject(Error('Speech view closed.'));const route=path.replace(/^\/local\/speech(?=\?|$)/,prefix+'/speech/tasks').replace(/^\/local\/speech\//,prefix+'/speech/').replace(/^\/local\/media\/([a-f0-9-]+)$/,prefix+'/media/$1/remove');return data===undefined?request(route.slice(prefix.length)):write(entry,route.slice(prefix.length),data);},
      run:action=>job?run(job,action):Promise.resolve(),context:()=>job?.view==='speech'?job:null,isTeacher:staff,sessionKey:()=>job?.identity+':'+serial,
      renderPage:()=>{if(job?.view==='speech')paintSpeech(job);},notify:message=>{if(dialog)dialog.querySelector('[data-workbench-status]').textContent=message;}});
    return speechUI;
  }
  function tabButtons(entry){if(entry.lessonSpeech)return entry.groups.length>1?'<label>Group<select data-workbench-group>'+options(entry.groups)+'</select></label>':'';return '<div class="seg" role="tablist" aria-label="Learning kit"><button type="button" data-workbench-back role="tab" aria-selected="'+(entry.view!=='speech')+'">Learning kit</button>'+(entry.lessonId&&entry.senseId&&entry.features?.includes('speech')?'<button type="button" data-workbench-speech role="tab" aria-selected="'+(entry.view==='speech')+'" '+(!entry.writable?'disabled':'')+'>Speech practice</button>':'')+'</div>';}
  function paintSpeech(entry){
    render(entry,tabButtons(entry)+speechUI.render());speechUI.afterRender();
    dialog?.querySelectorAll('.speech-panel button').forEach(node=>node.classList.add('btn'));
    dialog?.querySelectorAll('.speech-panel input:not([type=checkbox]):not([type=radio]),.speech-panel select,.speech-panel textarea,[data-workbench-group]').forEach(node=>node.classList.add('input'));
    const group=dialog?.querySelector('[data-workbench-group]');if(group)group.value=String(entry.groupId);
    if(!entry.writable)dialog?.querySelectorAll('.speech-panel form button,.speech-panel form input,.speech-panel form textarea,.speech-panel form select,#speech-file,[data-speech-action]:not([data-speech-action="more"]):not([data-speech-action="training"]):not([data-speech-action="compare"]):not([data-speech-action="end-training"])').forEach(node=>{node.disabled=true;});
  }
  function providers(){
    if(!providerUI)providerUI=createIntegratedProviderSettingsUI({endpoint:'/settings/providers',connectionLabel:'Server-configured providers',
      api:(path,data)=>{const entry=job;if(!entry?.providerSettings||!current(entry))return Promise.reject(Error('Provider settings closed.'));return data===undefined?request(path):write(entry,path,data);},
      isDeveloper:()=>authUser?.role==='DEVELOPER',writable:()=>!!job?.writable,sessionKey:()=>job?.identity+':'+serial,active:()=>!!job?.providerSettings&&current(job),
      renderPage:()=>{if(job?.providerSettings)paintProviders(job);},notify:message=>{if(dialog)dialog.querySelector('[data-workbench-status]').textContent=message;},
      actorName:id=>id,date:at=>new Date(at).toLocaleDateString()});
    return providerUI;
  }
  async function loadProviders(entry){
    entry.view='providers';const data=await request('/settings/provider-access');if(!current(entry))return;entry.providerAccess=data;
    entry.preparationSettings=entry.features.includes('preparation')?await request('/preparation/settings'):null;if(!current(entry))return;
    entry.pipelineSettings=entry.features.includes('independent')?(await request('/pipeline/settings')).settings:undefined;if(!current(entry))return;
    if(data.initialized)await providers().load();else paintProviders(entry);
  }
  function paintProviders(entry){
    const data=entry.providerAccess;if(!data){render(entry,'<p role="status">Loading provider settings...</p>');return;}
    render(entry,(data.initialized?providers().render():'<button class="btn saas-btn" type="button" data-workbench-provider-init '+(!entry.writable?'disabled':'')+'>Initialize providers</button>')+
      data.accounts.map(account=>{
        const saved=account.access.policy,tasks=account.tasks;
        return '<details class="provider-access saas-card"><summary>'+esc(account.provider)+' · '+esc(saved?.enabled?'Enabled':'Off')+'</summary><p>'+esc(account.bindings.map(binding=>binding.model).join(' · '))+'</p><p>'+account.access.usedRequests+' requests · '+account.access.usedInputBytes+' input bytes today</p><form class="saas-form-grid" data-workbench-provider-access="'+esc(account.scope)+'"><fieldset '+(!entry.writable||!data.initialized?'disabled':'')+'><label><input name="enabled" type="checkbox" '+(saved?.enabled?'checked':'')+'> Allow requests</label><label>Terms revision<input name="termsRevision" required maxlength="200" value="'+esc(saved?.termsRevision||'')+'"></label>'+tasks.map(task=>'<label><input name="tasks" type="checkbox" value="'+esc(task)+'" '+(saved?.tasks.includes(task)?'checked':'')+'>'+esc(task)+'</label>').join('')+'<label>Daily requests<input name="dailyRequests" type="number" min="1" max="1000000" value="'+(saved?.dailyRequests||10)+'" required></label><label>Maximum input bytes<input name="maxInputBytes" type="number" min="1" max="11000000" value="'+(saved?.maxInputBytes||12000)+'" required></label><label>Daily input bytes<input name="dailyInputBytes" type="number" min="1" max="10000000000" value="'+(saved?.dailyInputBytes||120000)+'" required></label><label>Expires after days<input name="days" type="number" min="1" max="31" value="7" required></label><label><input name="dataProcessingApproved" type="checkbox" '+(saved?.dataProcessingApproved?'checked':'')+'> Data processing approved</label><label><input name="noPaidOverageConfirmed" type="checkbox" '+(saved?.noPaidOverageConfirmed?'checked':'')+'> No paid overage confirmed</label><label>Reason<textarea name="reason" required maxlength="500"></textarea></label><button class="btn saas-btn" type="submit">Save access policy</button></fieldset></form><form class="saas-form-grid" data-workbench-provider-budget="'+esc(account.provider)+'"><fieldset '+(!entry.writable?'disabled':'')+'><label>Generation and review daily budget<input name="requestLimit" type="number" min="1" max="1000000" value="'+(account.quota?.requestLimit||10)+'" required></label><label>Reason<textarea name="reason" '+(account.quota?'required':'')+' maxlength="500"></textarea></label><button class="btn saas-btn" type="submit">'+(account.quota?'Update':'Initialize')+' budget</button></fieldset></form></details>';
      }).join('')+(entry.preparationSettings?'<form class="saas-form-grid" data-workbench-provider-preparation><fieldset '+(!entry.writable?'disabled':'')+'><legend>Automatic preparation</legend><label><input name="enabled" type="checkbox" '+(entry.preparationSettings.enabled?'checked':'')+'> Enabled</label><label>Reason<textarea name="reason" maxlength="500" required></textarea></label><button class="btn saas-btn" type="submit">Save preparation settings</button></fieldset></form>':''));
    if(data.initialized)providers().afterRender();
    if(entry.pipelineSettings!==undefined){const section=document.createElement('div');section.innerHTML=entry.pipelineSettings?'<form class="saas-form-grid" data-workbench-provider-pipeline><fieldset '+(!entry.writable?'disabled':'')+'><legend>Independent AI review</legend><label><input name="enabled" type="checkbox" '+(entry.pipelineSettings.enabled?'checked':'')+'> Enabled</label><label>Reason<textarea name="reason" maxlength="500" required></textarea></label><button class="btn saas-btn" type="submit">Save review settings</button></fieldset></form>':'<button class="btn saas-btn" type="button" data-workbench-pipeline-init '+(!entry.writable?'disabled':'')+'>Initialize independent review</button>';dialog.querySelector('[data-workbench-body]').append(section);}
  }
  async function lessonSpeech(entry){
    if(!entry.features?.includes('speech'))throw Error('Speech practice is not configured.');
    entry.view='speech';render(entry,tabButtons(entry)+'<p role="status">Loading speech practice...</p>');
    const group=dialog?.querySelector('[data-workbench-group]');if(group)group.value=String(entry.groupId);
    await speech().load();if(current(entry))paintSpeech(entry);
  }
  const options=items=>items.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.title)+'</option>').join('');
  const authorable=entry=>entry.writable&&entry.lessonId&&entry.groupId&&entry.senseId&&entry.features?.includes('review');
  const contextBody=entry=>({groupId:entry.groupId,lessonId:entry.lessonId,cardId:entry.cardId,senseId:entry.senseId});
  function discard(entry){return !entry.dirty||window.confirm('Discard unsaved quiz changes?');}
  async function mine(entry,more=false){
    speechUI?.deactivate();entry.view='mine';entry.dirty=false;
    const data=await request('/mine?offset='+(more?entry.nextOffset:0));if(!current(entry))return;
    entry.rows=more?[...entry.rows,...data.quizzes]:data.quizzes;entry.nextOffset=data.nextOffset;paintQueue(entry);
  }
  function editor(entry){
    const q=entry.edit,locked=q&&(!['draft','returned'].includes(q.state)||q.author.id!==authUser.id);
    if(locked||!entry.writable)return;
    const draft=entry.draft;
    const media=['Listen','Video choice','Pronunciation'].includes(draft.type)?'<fieldset><legend>Media</legend><label>Item<select data-workbench-media-index>'+draft.items.map((_,index)=>'<option value="'+index+'">Item '+(index+1)+'</option>').join('')+'</select></label><label>File<input type="file" data-workbench-media accept="'+(draft.type==='Video choice'?'video/mp4':'audio/wav,audio/mpeg')+'"></label><label>Source and usage permission<textarea data-workbench-media-source maxlength="500"></textarea></label><button class="btn saas-btn" type="button" data-workbench-upload>Upload media</button></fieldset>':'';
    render(entry,'<button class="btn saas-btn" type="button" data-workbench-editor-back>Back</button><h3>'+esc(q?'Edit '+q.type:'New quiz')+'</h3><p>'+esc([entry.contextLabel,entry.kit?.meaning?.definition].filter(Boolean).join(' · '))+'</p>'+(q?.feedback?'<blockquote>'+esc(q.feedback)+'</blockquote>':'')+'<form data-workbench-editor><label>Type<select data-workbench-type '+(q?'disabled':'')+'>'+[...quizTypes,...(entry.pronunciationQuizzes?['Pronunciation']:[])].map(type=>'<option '+(type===draft.type?'selected':'')+'>'+esc(type)+'</option>').join('')+'</select></label><div data-workbench-items>'+integratedReviewEditor.renderReviewItems(draft.type,draft.items,entry.pronunciationRubrics||[])+'</div><button class="btn saas-btn" type="button" id="add-quiz-item">Add item</button><label>Explanation<textarea name="explanation" maxlength="4000" required>'+esc(draft.explanation)+'</textarea></label>'+media+'<div class="learning-workbench-actions"><button class="btn saas-btn" type="submit" value="save">Save draft</button><button class="btn primary saas-btn" type="submit" value="submit">Send for review</button></div></form>');
  }
  function readEditor(entry){
    const form=dialog.querySelector('[data-workbench-editor]');if(!form)return;
    entry.draft.items=integratedReviewEditor.readReviewItems(entry.draft.type,form);entry.draft.explanation=form.elements.explanation.value;
  }
  async function editProposal(entry,id){
    const {quiz}=await request('/proposals/'+id);if(!current(entry))return;
    if(quiz.author.id!==authUser.id||!['draft','returned'].includes(quiz.state)||!entry.writable)throw Error('Only your own draft or returned quiz can be edited.');
    entry.edit=quiz;entry.editorBack=entry.view;entry.view='editor';entry.dirty=false;entry.drafts={};entry.contextLabel=[quiz.origin?.groupName,quiz.origin?.lessonName,quiz.origin?.word].filter(Boolean).join(' · ');
    entry.draft={type:quiz.type,items:structuredClone(quiz.content.items),explanation:quiz.content.explanation};editor(entry);
  }
  async function saveProposal(entry,submit){
    if(!entry.writable)return;readEditor(entry);
    const content={items:entry.draft.items,explanation:entry.draft.explanation};
    let q=entry.edit;
    if(!q){if(!authorable(entry))throw Error('Choose a lesson word and meaning.');
      const result=await write(entry,'/proposals',{...contextBody(entry),type:entry.draft.type,content});
      if(!current(entry))return;q=entry.edit={...result,type:entry.draft.type,content,author:{id:authUser.id}};
    }else if(JSON.stringify(q.content)!==JSON.stringify(content)){
      const result=await write(entry,'/proposals/'+q.id+'/edit',{expectedRevision:q.revision,content});
      if(!current(entry))return;q=entry.edit={...q,...result,content};
    }
    entry.dirty=false;
    if(submit){await write(entry,'/proposals/'+q.id+'/submit',{expectedRevision:q.revision});if(!current(entry))return;await mine(entry);}
    else{const {quiz}=await request('/proposals/'+q.id);if(!current(entry))return;entry.edit=quiz;editor(entry);dialog.querySelector('[data-workbench-status]').textContent='Draft saved.';}
  }
  async function uploadQuizMedia(entry,form){
    readEditor(entry);const file=form.querySelector('[data-workbench-media]').files[0],rights=form.querySelector('[data-workbench-media-source]').value.trim(),index=Number(form.querySelector('[data-workbench-media-index]').value);
    if(!file||!rights||!entry.draft.items[index])throw Error('Select a file, item and usage permission.');
    const mime=entry.draft.type==='Video choice'?'video/mp4':file.type==='audio/mpeg'?'audio/mpeg':'audio/wav';
    if(file.size>20*1024*1024)throw Error('Media file is too large.');
    const ctx=entry.edit?{groupId:entry.edit.groupId,lessonId:entry.edit.lessonId,cardId:entry.edit.cardId,senseId:entry.edit.senseId}:contextBody(entry);
    const signature=JSON.stringify([ctx,file.name,file.size,file.lastModified,mime,rights]);
    if(entry.upload?.signature!==signature)entry.upload={signature,id:crypto.randomUUID()};
    entry.uploadController=new AbortController();
    const result=await window.LearningMain.fetch(prefix+'/media',{method:'POST',headers:{'Content-Type':mime,'X-Upload-Metadata':encodeURIComponent(JSON.stringify({mutationId:entry.upload.id,...ctx,purpose:'quiz',mime,name:file.name,rights,sourceUrl:null}))},body:file,signal:entry.uploadController.signal,quietBug:true});
    if(!current(entry))return;entry.upload=null;entry.draft.items[index].mediaId=result.id;entry.dirty=true;editor(entry);
  }
  const reason={not_generated:'Not prepared',word_set_required:'Word set required',audio_required:'Audio required',video_required:'Video required',provider_not_configured:'Generation is off',quota_exceeded:'Quota exhausted',quota_unavailable:'Quota unavailable'};
  function paintEntry(){
    for(const nav of document.querySelectorAll('.side nav,.tabbar')){
      let button=nav.querySelector('[data-workbench-queue]');
      if(!button&&enabled()&&staff()){
        button=document.createElement('button');button.type='button';button.dataset.workbenchQueue='';button.dataset.jump='workbenchqueue';button.innerHTML='<i data-lucide="clipboard-check" aria-hidden="true"></i>Review queue';nav.append(button);window.lucide?.createIcons({root:button});
      }
      if(button){button.hidden=!enabled()||!staff();if(enabled()&&staff())button.dataset.jump='workbenchqueue';}
      let mineButton=nav.querySelector('[data-workbench-mine]');
      if(!mineButton&&enabled()){mineButton=document.createElement('button');mineButton.type='button';mineButton.dataset.workbenchMine='';mineButton.dataset.jump='workbenchmine';mineButton.innerHTML='<i data-lucide="notebook-pen" aria-hidden="true"></i>My quizzes';nav.append(mineButton);window.lucide?.createIcons({root:mineButton});}
      if(mineButton){mineButton.hidden=!enabled();if(enabled())mineButton.dataset.jump='workbenchmine';}
      let providerButton=nav.querySelector('[data-workbench-providers]');
      if(!providerButton&&enabled()&&authUser?.role==='DEVELOPER'){providerButton=document.createElement('button');providerButton.type='button';providerButton.dataset.workbenchProviders='';providerButton.dataset.jump='workbenchproviders';providerButton.innerHTML='<i data-lucide="settings" aria-hidden="true"></i>AI providers';nav.append(providerButton);window.lucide?.createIcons({root:providerButton});}
      if(providerButton){providerButton.hidden=!enabled()||authUser?.role!=='DEVELOPER';if(enabled()&&authUser?.role==='DEVELOPER')providerButton.dataset.jump='workbenchproviders';}
    }
  }
  async function loadQueue(entry,more=false){
    if(!staff())throw Error('Teacher access required.');entry.view='queue';
    const offset=more?entry.nextOffset:0,data=await request('/queue?offset='+offset);if(!current(entry))return;
    entry.rows=more?[...entry.rows,...data.quizzes]:data.quizzes;entry.nextOffset=data.nextOffset;
    if(entry.features?.includes('feedback')){const signals=await request('/feedback/signals');if(!current(entry))return;entry.reportSignals=new Map(signals.signals.map(row=>[row.versionId,row]));}
    paintQueue(entry);
  }
  function preview(q){
    if(q.type==='Pronunciation')return q.content.items.map(item=>integratedReviewEditor.reviewItemPreview(q.type,{...item,...(item.mediaId?{mediaUrl:prefix+'/media/'+item.mediaId}:{})})).join('')+'<p>'+esc(q.content.explanation)+'</p>';
    return q.content.items.map(item=>'<div class="learning-kit-result">'+(item.mediaId?'<'+(q.type==='Video choice'?'video':'audio')+' controls preload="none" src="'+prefix+'/media/'+esc(item.mediaId)+'"></'+(q.type==='Video choice'?'video':'audio')+'>':'')+'<p>'+esc(item.prompt||item.front||item.shown||item.text||item.left||item.word||'')+'</p>'+(item.parts?'<p>'+esc(item.parts)+'</p>':'')+(item.options?'<ol>'+item.options.map((option,index)=>'<li>'+esc(option)+((item.answers||[item.answer]).includes(index)?' · Correct':'')+'</li>').join('')+'</ol>':'<p>Answer: '+esc(item.back||item.right||item.word||item.answer||'')+'</p>')+(item.transcript?'<p>'+esc(item.transcript)+'</p>':'')+'</div>').join('')+'<p>'+esc(q.content.explanation)+'</p>';
  }
  function reviewRow(entry,q){
    const allowed=staff()&&entry.writable&&q.state==='submitted'&&q.author.id!==authUser.id;
    const signal=entry.reportSignals?.get(q.id);
    const attribution=entry.features?.includes('authors')&&q.author.id===authUser.id&&q.author.kind!=='automatic'?'<button class="btn saas-btn" type="button" data-workbench-attribution="'+esc(q.id)+'">Public attribution</button><div data-workbench-attribution-panel="'+esc(q.id)+'"></div>':'';
    const edit=(entry.writable&&q.author.id===authUser.id&&['draft','returned'].includes(q.state)?'<button class="btn saas-btn" type="button" data-workbench-edit="'+esc(q.id)+'">Edit quiz</button>':'')+attribution+(signal?'<p>'+signal.reports+' reports from '+signal.reporters+' accounts · Requires review; no automatic decision</p>':'');
    const speechChecks=q.type==='Pronunciation'?'<label><input type="checkbox" name="reference" required>Reading reference and locale checked</label><label><input type="checkbox" name="rubric" required>Scoring weights, scales and sufficiency checked</label>':'';
    return '<details class="saas-card" data-review-key="version-'+esc(q.id)+'"><summary>v'+q.version+' · '+esc(q.state)+(q.reviewer?' · Teacher checked':'')+'</summary><p>'+esc(q.author.name)+' · '+esc(q.author.group)+' · '+esc(q.author.date)+'</p>'+(q.origin?.meaning?'<p>'+esc(q.origin.meaning)+'</p>':'')+preview(q)+(q.feedback?'<blockquote>'+esc(q.feedback)+'</blockquote>':'')+edit+'<button class="btn saas-btn" data-workbench-history="'+esc(q.id)+'">History</button><div data-review-history="'+esc(q.id)+'"></div>'+(allowed?'<form data-workbench-decision="approve" data-id="'+esc(q.id)+'"><label><input type="checkbox" name="meaning" required>Meaning, translation and naturalness checked</label><label><input type="checkbox" name="answers" required>Answers and explanation checked</label><label><input type="checkbox" name="level" required>Level checked</label>'+speechChecks+(['Listen','Video choice'].includes(q.type)||q.type==='Pronunciation'&&q.content.items.some(item=>item.mediaId)?'<label><input type="checkbox" name="media" required>Media, transcript and usage rights checked</label>':'')+'<button class="btn primary saas-btn" type="submit">Approve</button></form><form data-workbench-decision="return" data-id="'+esc(q.id)+'"><label>Changes requested<textarea name="comment" maxlength="2000" required></textarea></label><button class="btn saas-btn" type="submit">Return for changes</button></form>':edit?'':'<p>'+esc(q.author.id===authUser.id?'Your own version cannot be approved by you.':q.state==='returned'?'Awaiting changes by the author.':'Read-only.')+'</p>')+'</details>';
  }
  function paintQueue(entry){
    const query=(entry.search||'').trim().toLocaleLowerCase(),rows=entry.rows.filter(q=>(!entry.filter||q.state===entry.filter)&&(!query||[q.origin?.groupName,q.origin?.lessonName,q.origin?.word,q.type,q.author.name,q.author.group,q.origin?.meaning].join(' ').toLocaleLowerCase().includes(query)));
    function group(list,depth=0){if(depth===4)return list.map(q=>reviewRow(entry,q)).join('');
      const keys=['groupId','lessonId','senseId','type'],labels=[q=>q.origin?.groupName||q.author.group,q=>q.origin?.lessonName||'Lesson '+q.lessonId,q=>q.origin?.word||'Word '+q.cardId,q=>q.type],groups=new Map();
      for(const q of list){const key=String(q[keys[depth]]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(q);}
      return [...groups].map(([key,items])=>'<details data-review-key="'+esc(keys.slice(0,depth+1).map(field=>items[0][field]).join(':'))+'"><summary>'+esc(labels[depth](items[0]))+' · '+items.length+'</summary><div class="learning-review-group">'+group(items,depth+1)+'</div></details>').join('');
    }
    render(entry,'<div class="learning-review-filters"><label>Search<input type="search" data-workbench-search value="'+esc(entry.search||'')+'"></label><label>Status<select data-workbench-filter><option value="">All</option>'+['draft','submitted','returned','approved'].filter(state=>entry.view==='mine'||['submitted','returned'].includes(state)).map(state=>'<option value="'+state+'" '+(entry.filter===state?'selected':'')+'>'+esc({draft:'Draft',submitted:'Needs review',returned:'Changes requested',approved:'Teacher checked'}[state])+'</option>').join('')+'</select></label></div><p>'+rows.length+' matching · '+entry.rows.length+' loaded</p>'+group(rows)+(!rows.length?'<p>No matching quizzes.</p>':'')+(entry.nextOffset!==null?'<button class="btn saas-btn" data-workbench-more>Load more</button>':''));
    if(staff()&&entry.features?.includes('independent'))for(const q of rows){const host=dialog.querySelector('[data-review-key="version-'+q.id+'"]'),panel=document.createElement('details');panel.innerHTML='<summary>Independent AI review</summary><div class="learning-workbench-actions"><button class="btn saas-btn" type="button" data-workbench-checks="'+esc(q.id)+'">Review history</button><button class="btn saas-btn" type="button" data-workbench-check-run="'+esc(q.id)+'" '+(!entry.writable||q.state!=='submitted'?'disabled':'')+'>Request AI review</button></div><div data-workbench-check-results="'+esc(q.id)+'"></div>';host?.append(panel);}
  }
  async function coverage(entry){
    speechUI?.deactivate();entry.view='kit';
    const token=++serial,query=new URLSearchParams({cardId:entry.cardId,...(entry.senseId?{senseId:entry.senseId}:{}),...(entry.groupId?{groupId:entry.groupId,lessonId:entry.lessonId}:{})});
    const data=await request('/kit?'+query);
    if(!current(entry)||token!==serial)return;entry.kit=data;entry.senseId=data.meaning?.id||entry.senseId||'';entry.session=null;
    const group=tabButtons(entry)+(entry.groups?.length>1?'<label>Group<select data-workbench-group>'+options(entry.groups)+'</select></label>':'');
    const senses='<label>Meaning<select data-workbench-sense><option value="">Select a meaning</option>'+data.senses.map(sense=>'<option value="'+esc(sense.id)+'" '+(sense.id===entry.senseId?'selected':'')+'>'+esc([sense.part_of_speech,sense.translation,sense.definition].filter(Boolean).join(' · '))+'</option>').join('')+'</select></label>';
    const prepare=staff()&&entry.writable&&entry.features?.includes('preparation')&&authorable(entry)?data.types.filter(type=>type.canPrepare):[];
    render(entry,group+senses+(data.selectionRequired?'<p>No meaning selected.</p>':'<div class="learning-workbench-actions">'+(authorable(entry)?'<button class="btn" type="button" data-workbench-new>New quiz</button>':'')+'<button class="btn" type="button" data-workbench-own>My quizzes</button></div><h3>'+data.counts.ready+' / '+data.counts.total+' types ready</h3>'+[...data.types,...(data.additionalTypes||[])].map(type=>'<details><summary>'+esc(type.type)+' · '+esc(type.status==='ready'?'Teacher checked · '+type.approvedCount+' variants':reason[type.reason]||type.reason||type.status)+'</summary>'+type.versionIds.map((id,index)=>'<p>Variant '+(index+1)+' <button class="btn" type="button" data-workbench-practice="'+esc(id)+'" '+(!entry.writable?'disabled':'')+'>Practice</button></p>').join('')+'</details>').join('')+(prepare.length?'<form data-workbench-prepare><fieldset><legend>Prepare missing types</legend>'+prepare.map(type=>'<label><input type="checkbox" name="types" value="'+esc(type.type)+'">'+esc(type.type)+'</label>').join('')+'</fieldset><button class="btn" type="submit">Queue preparation</button></form>':'')+(!entry.writable?'<p>Read-only. New practice sessions are disabled.</p>':'')));
    if(entry.groupId&&dialog?.querySelector('[data-workbench-group]'))dialog.querySelector('[data-workbench-group]').value=String(entry.groupId);
    if(entry.features?.includes('mapping')&&staff()||entry.features?.includes('statistics')){const actions=document.createElement('div');actions.className='learning-workbench-actions';actions.innerHTML=(entry.features.includes('mapping')&&staff()?'<button class="btn" type="button" data-workbench-meaning-map>Link an exact meaning</button>':'')+(entry.features.includes('statistics')?'<button class="btn" type="button" data-workbench-history-list>Practice history</button>':'')+(staff()&&entry.features.includes('examQuizzes')&&entry.senseId?'<button class="btn" type="button" data-workbench-assign-exam '+(!entry.writable?'disabled':'')+'>Assign reviewed quiz to exam</button>':'');dialog.querySelector('[data-workbench-body]').append(actions);}
    if(entry.features?.includes('feedback')&&entry.senseId){const actions=document.createElement('div');actions.className='learning-workbench-actions';actions.innerHTML='<button class="btn" type="button" data-workbench-report '+(!entry.writable?'disabled':'')+'>Report a problem</button><button class="btn" type="button" data-workbench-reports>My reports</button>';dialog.querySelector('[data-workbench-body]').append(actions);}
  }
  const reportState=value=>({saved_locally:'Saved privately · Not sent',queued:'Queued',started:'Sending',accepted:'Accepted by mail service · Mailbox delivery unconfirmed',rejected:'Rejected · Not sent',uncertain:'Delivery unknown · Do not resend automatically'}[value]||value);
  async function examSessions(entry){
    if(!entry.features.includes('examQuizzes'))throw Error('Reviewed exam quizzes are not enabled.');
    const data=await request('/exam-quizzes?'+new URLSearchParams({examId:entry.examId,blockId:entry.blockId}));if(!current(entry))return;entry.view='exam-quizzes';
    render(entry,'<h3>Reviewed quiz tasks</h3><p>Additional results · Not included in the existing exam grade</p>'+data.sessions.map(row=>'<p>'+esc(row.type)+' · '+esc(row.state)+' <button class="btn" type="button" data-workbench-open-session="'+row.id+'" '+(!entry.writable&&row.state==='open'&&!staff()?'disabled':'')+'>'+esc(staff()?'Review':'Open')+'</button></p>').join('')+(!data.sessions.length?'<p>No reviewed quiz tasks assigned.</p>':''));
  }
  document.addEventListener('click',event=>{
    const exam=event.target.closest('[data-workbench-exam]');if(exam){if(!enabled()||!lmState?.examOwned||!valid(lmState.examId)||!valid(lmState.blockId))return;void open({examBridge:true,examId:lmState.examId,blockId:lmState.blockId,title:'Reviewed exam quizzes'});return;}
    const node=event.target.closest('[data-workbench-meaning-map],[data-workbench-history-list],[data-workbench-open-session],[data-workbench-assign-exam],[data-workbench-release-session],[data-workbench-pronunciation-history]'),entry=job;
    if(!node||!entry||!dialog?.contains(node))return;
    void run(entry,async()=>{
      if(node.hasAttribute('data-workbench-meaning-map')){
        const data=await request('/legacy/candidates?cardId='+entry.cardId);if(!current(entry))return;entry.meaningMap=data;entry.view='meaning-map';
        render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>'+esc(data.word)+'</h3><form data-workbench-meaning-link><label>Exact meaning<select name="senseId" required><option value="">Choose the intended meaning</option>'+data.candidates.map(row=>'<option value="'+esc(row.id)+'" '+(data.linked.includes(row.id)?'disabled':'')+'>'+esc([row.part_of_speech,row.translation,row.definition].join(' · '))+'</option>').join('')+'</select></label><label>Reason<textarea name="reason" maxlength="1000" required></textarea></label><button class="btn" type="submit" '+(!entry.writable?'disabled':'')+'>Link meaning</button></form>'+(data.truncated?'<p>More meanings exist. Use an explicit reviewed source mapping.</p>':''));return;
      }
      if(node.hasAttribute('data-workbench-history-list')){
        const data=await request('/study/history?cardId='+entry.cardId);if(!current(entry))return;entry.history=data.sessions;entry.view='history';
        render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>Practice history</h3>'+data.sessions.map(row=>'<p>'+esc(row.type)+' · '+esc(row.mode)+' · '+esc(new Date(row.createdAt).toLocaleDateString('en-GB'))+' · '+esc(row.percent===null?row.state:row.percent+' / 100')+' <button class="btn" data-workbench-open-session="'+row.id+'">Open</button>'+(row.type==='Pronunciation'?'<button class="btn" data-workbench-pronunciation-history="'+row.versionId+'">Comparable speech progress</button>':'')+'</p>').join('')+(!data.sessions.length?'<p>No sessions yet.</p>':'')+(data.truncated?'<p>Showing the latest 500 sessions.</p>':''));return;
      }
      if(node.hasAttribute('data-workbench-pronunciation-history')){
        const data=await request('/study/pronunciation?'+new URLSearchParams({cardId:entry.cardId,versionId:node.dataset.workbenchPronunciationHistory,itemIndex:0,period:'week'}));if(!current(entry))return;
        render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>Pronunciation progress · Item 1</h3>'+data.periods.map((series,index)=>'<section><h4>Comparable series '+(index+1)+'</h4>'+(series.synthetic?'<p>Synthetic demonstration</p>':'')+series.buckets.map(bucket=>'<p>'+esc(bucket.date)+' · '+bucket.attempts+' attempts · '+esc(bucket.metrics.overall?bucket.metrics.overall.average+' / 100':'Score unavailable')+'</p>').join('')+'</section>').join('')+(!data.periods.length?'<p>No comparable attempts yet.</p>':''));return;
      }
      if(node.hasAttribute('data-workbench-assign-exam')){
        entry.view='assign-exam';const types=[...entry.kit.types,...(entry.kit.additionalTypes||[])].filter(row=>row.type!=='Pronunciation');
        render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>Assign reviewed quiz</h3><form data-workbench-exam-assign><label>Assigned exam ID<input name="examId" type="number" min="1" required></label><label>Block ID<input name="blockId" type="number" min="1" required></label><label>Reviewed variant<select name="versionId" required><option value="">Choose a variant</option>'+types.flatMap(row=>row.versionIds.map((id,index)=>'<option value="'+id+'">'+esc(row.type)+' · Variant '+(index+1)+'</option>')).join('')+'</select></label><button class="btn" type="submit">Assign to this exam instance</button></form>');return;
      }
      if(node.hasAttribute('data-workbench-release-session')){await write(entry,'/sessions/'+node.dataset.workbenchReleaseSession+'/release',{expectedRevision:Number(node.dataset.revision)});if(current(entry))await examSessions(entry);return;}
      const id=node.dataset.workbenchOpenSession;
      if(entry.examBridge&&staff()){
        const row=await request('/exam-quizzes/'+id+'/review');if(!current(entry))return;
        render(entry,'<button class="btn" data-workbench-back>Exam quizzes</button><h3>'+esc(row.type)+'</h3>'+preview(row)+(row.responses?'<p>Responses: '+esc(JSON.stringify(row.responses))+'</p><p>'+row.correct.filter(Boolean).length+' / '+row.correct.length+'</p>':'<p>Not submitted.</p>')+(row.state==='submitted'&&entry.writable?'<button class="btn" data-workbench-release-session="'+id+'" data-revision="'+row.revision+'">Release after exam review publication</button>':''));return;
      }
      const session=await request('/sessions/'+id);if(!current(entry))return;entry.session=session;answers(entry);
    });
  });
  document.addEventListener('submit',event=>{
    const form=event.target;if(!form.matches('[data-workbench-meaning-link],[data-workbench-exam-assign]'))return;event.preventDefault();const entry=job;if(!entry?.writable||!dialog?.contains(form))return;const data=new FormData(form);
    void run(entry,async()=>{
      if(form.hasAttribute('data-workbench-meaning-link')){const result=await write(entry,'/legacy/link',{cardId:entry.cardId,senseId:data.get('senseId'),expectedSenseIds:entry.meaningMap.linked,reason:data.get('reason')});if(!current(entry))return;entry.senseId=result.senseId;await coverage(entry);}
      else{await write(entry,'/exam-quizzes/assign',{examId:Number(data.get('examId')),blockId:Number(data.get('blockId')),cardId:entry.cardId,senseId:entry.senseId,versionId:data.get('versionId')});if(current(entry)){await coverage(entry);dialog.querySelector('[data-workbench-status]').textContent='Assigned as an additional quiz. Existing exam grades were not changed.';}}
    });
  });
  async function reports(entry){
    speechUI?.deactivate();entry.view='reports';const data=await request('/feedback');if(!current(entry))return;
    entry.reports=data.reports;
    entry.feedbackPolicy=data.policy;
    render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>My reports</h3>'+data.reports.map(row=>'<details><summary>'+esc(row.category)+' · '+esc(new Date(row.createdAt).toLocaleDateString('en-GB'))+'</summary><p>'+esc(row.description)+'</p><p>'+esc(reportState(row.state))+'</p><p>Recipient: '+esc(row.recipient)+'</p>'+(row.state==='saved_locally'&&entry.writable?'<form data-workbench-report-send="'+esc(row.id)+'"><label><input name="consent" type="checkbox" required>Send this report and its attachments to '+esc(row.recipient)+'</label><button class="btn" type="submit">Send report</button></form>':'')+(entry.writable?'<button class="btn" data-workbench-report-remove="'+esc(row.id)+'">Delete local report</button>':'')+'<p>Deleting the local copy cannot recall an email already sent.</p></details>').join('')+(!data.reports.length?'<p>No reports.</p>':''));
  }
  async function newReport(entry){
    speechUI?.deactivate();const [policy,templates]=await Promise.all([request('/feedback/policy'),request('/templates?cardId='+entry.cardId)]);if(!current(entry))return;
    for(const file of entry.report?.files||[])if(file.url)URL.revokeObjectURL(file.url);
    entry.view='report';entry.report={policy,versions:templates.quizzes.filter(row=>row.senseId===entry.senseId),files:[],description:'',category:'remark',versionId:null};paintReport(entry);
  }
  function paintReport(entry,preview=false){
    const r=entry.report,identity=[entry.contextLabel,entry.title,entry.kit?.meaning?.definition].filter(Boolean).join(' · ');
    const files=r.files.map(item=>'<li>'+esc(item.file.name)+' · '+Math.ceil(item.file.size/1024)+' KiB'+(item.file.type.startsWith('image/')?'<img alt="Attachment preview" src="'+esc(item.url)+'" style="max-width:100%;max-height:240px">':item.file.type.startsWith('audio/')?'<audio controls preload="none" src="'+esc(item.url)+'"></audio>':'<video controls playsinline preload="none" src="'+esc(item.url)+'" style="max-width:100%;max-height:240px"></video>')+'</li>').join('');
    render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>'+esc(preview?'Review report':'Report a problem')+'</h3><p>'+esc(identity)+'</p><p>Recipient: '+esc(r.policy.recipient)+' · Local retention: '+r.policy.retentionDays+' days</p><p>Do not include passwords, tokens or unrelated personal data. Check screenshots, recordings and filenames. Sent email copies may remain in the recipient mailbox.</p>'+(preview?'<p>'+esc(r.category)+' · '+esc(r.versions.find(row=>row.id===r.versionId)?.type||'Word and meaning')+'</p><p>'+esc(r.description)+'</p><ul>'+files+'</ul><form data-workbench-report-save><label><input name="privacyConsent" type="checkbox" required>I reviewed the text and attachments and consent to storing this private report.</label><button class="btn" type="submit">Save privately</button></form>':'<form data-workbench-report-preview><label>Category<select name="category">'+['complaint','remark','suggestion','bug'].map(value=>'<option '+(r.category===value?'selected':'')+'>'+value+'</option>').join('')+'</select></label><label>Quiz version<select name="versionId"><option value="">Word and meaning</option>'+r.versions.map(row=>'<option value="'+esc(row.id)+'">'+esc(row.type+' · v'+row.version)+'</option>').join('')+'</select></label><label>Description<textarea name="description" maxlength="4000" required>'+esc(r.description)+'</textarea></label><label>Attachments · PNG, JPEG, WAV, MP3 or MP4 · 3 MiB total<input type="file" multiple name="attachments" accept="image/png,image/jpeg,audio/wav,audio/mpeg,video/mp4"></label><button class="btn" type="submit">Review report</button></form>'));
  }
  document.addEventListener('click',event=>{
    const node=event.target.closest('[data-workbench-report],[data-workbench-reports],[data-workbench-report-remove],[data-workbench-attribution]'),entry=job;if(!node||!entry||!dialog?.contains(node))return;
    void run(entry,async()=>{
      if(node.hasAttribute('data-workbench-report')){if(entry.writable)await newReport(entry);return;}
      if(node.hasAttribute('data-workbench-reports')){await reports(entry);return;}
      if(node.hasAttribute('data-workbench-report-remove')){
        if(!entry.writable||!window.confirm('Delete the local report and unused attachments? Already sent email cannot be recalled.'))return;
        await write(entry,'/feedback/'+node.dataset.workbenchReportRemove+'/remove',{});if(current(entry))await reports(entry);return;
      }
      const id=node.dataset.workbenchAttribution,settings=await request('/proposals/'+id+'/attribution');if(!current(entry))return;
      const host=dialog.querySelector('[data-workbench-attribution-panel="'+id+'"]');if(host)host.innerHTML='<form data-workbench-attribution-save="'+id+'" data-revision="'+settings.revision+'"><label><input name="publicName" type="checkbox" '+(settings.publicName?'checked':'')+'>Show my recorded author name in shared templates</label><label><input name="publicGroup" type="checkbox" '+(settings.publicGroup?'checked':'')+'>Show my recorded group in shared templates</label><button class="btn" type="submit" '+(!entry.writable?'disabled':'')+'>Save public attribution</button></form>';
    });
  });
  document.addEventListener('submit',event=>{
    const form=event.target;if(!form.matches('[data-workbench-report-preview],[data-workbench-report-save],[data-workbench-report-send],[data-workbench-attribution-save]'))return;event.preventDefault();
    const entry=job;if(!entry||!entry.writable||!dialog?.contains(form))return;const data=new FormData(form);
    void run(entry,async()=>{
      if(form.hasAttribute('data-workbench-attribution-save')){await write(entry,'/proposals/'+form.dataset.workbenchAttributionSave+'/attribution',{expectedRevision:Number(form.dataset.revision),publicName:data.has('publicName'),publicGroup:data.has('publicGroup')});if(current(entry))await mine(entry);return;}
      if(form.hasAttribute('data-workbench-report-send')){if(!entry.feedbackPolicy?.deliveryEnabled)throw Error('Email sending is not configured. This report is saved privately and has not been sent.');const result=await write(entry,'/feedback/'+form.dataset.workbenchReportSend+'/send',{consent:data.has('consent')});if(current(entry)){await reports(entry);dialog.querySelector('[data-workbench-status]').textContent=reportState(result.state);}return;}
      const r=entry.report;if(!r)return;
      if(form.hasAttribute('data-workbench-report-preview')){
        const files=data.getAll('attachments').filter(file=>file instanceof File&&file.size);
        if(files.length>5||files.reduce((sum,file)=>sum+file.size,0)>r.policy.maxAttachmentBytes||files.some(file=>!['image/png','image/jpeg','audio/wav','audio/mpeg','video/mp4'].includes(file.type)))throw Error('Choose up to five supported attachments, 3 MiB total.');
        r.description=String(data.get('description')).trim();r.category=data.get('category');r.versionId=data.get('versionId')||null;
        for(const item of r.files)if(item.url)URL.revokeObjectURL(item.url);r.files=files.map(file=>({file,url:URL.createObjectURL(file),mutationId:crypto.randomUUID()}));paintReport(entry,true);return;
      }
      if(!data.has('privacyConsent'))throw Error('Review and consent to private report storage.');
      for(const item of r.files){
        if(item.id)continue;entry.uploadController=new AbortController();
        const asset=await window.LearningMain.fetch(prefix+'/media',{method:'POST',headers:{'Content-Type':item.file.type,'X-Upload-Metadata':encodeURIComponent(JSON.stringify({mutationId:item.mutationId,purpose:'feedback',cardId:entry.cardId,senseId:entry.senseId,mime:item.file.type,name:item.file.name}))},body:item.file,signal:entry.uploadController.signal,quietBug:true});
        if(!current(entry))return;item.id=asset.id;
      }
      await write(entry,'/feedback',{cardId:entry.cardId,senseId:entry.senseId,versionId:r.versionId,category:r.category,description:r.description,attachments:r.files.map(item=>item.id),privacyConsent:true});if(!current(entry))return;
      for(const item of r.files)URL.revokeObjectURL(item.url);entry.report=null;await reports(entry);
    });
  });
  function answers(entry){
    const session=entry.session,pairs=['Match','Memory'].includes(session.type),items=pairs?session.questions.left.map(prompt=>({prompt,options:session.questions.right})):session.questions;
    if(session.state!=='open'&&!session.content){render(entry,'<button class="btn" data-workbench-back>Back</button><h3>'+esc(session.type)+'</h3><p>Submitted · Results are waiting for published exam review.</p>');return;}
    if(session.type==='Pronunciation'){
      render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>Pronunciation</h3>'+items.map((item,index)=>'<section><p>'+esc(item.prompt)+'</p><blockquote>'+esc(item.reference)+'</blockquote><p>'+esc(item.locale)+' · '+esc(item.rubric.id)+' · '+esc(item.rubric.version)+'</p><button class="btn" type="button" data-workbench-pronunciation="'+index+'">Practice pronunciation</button></section>').join(''));return;
    }
    if(session.content){render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>'+esc(session.type)+' · '+session.correctCount+' / '+session.total+'</h3>'+session.content.items.map((item,index)=>'<div class="learning-kit-result"><p>'+esc(session.correct[index]?'Correct':'Try again')+'</p><p>'+esc(item.prompt||item.front||item.shown||item.text||item.left||item.hint||'')+'</p><p>'+esc(Array.isArray(item.answers)?item.answers.map(n=>item.options[n]).join(', '):item.options?item.options[item.answer]:item.back||item.right||item.word||item.answer||'')+'</p>'+(item.transcript?'<p>'+esc(item.transcript)+'</p>':'')+'</div>').join('')+'<p>'+esc(session.content.explanation)+'</p>');return;}
    render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>'+esc(session.type)+'</h3><form data-workbench-answers>'+items.map((item,index)=>'<fieldset><legend>Item '+(index+1)+'</legend>'+(item.mediaUrl?(session.type==='Video choice'?'<video controls playsinline preload="metadata" src="'+esc(item.mediaUrl)+'"></video>':'<audio controls preload="metadata" src="'+esc(item.mediaUrl)+'"></audio>'):'')+'<p>'+esc(item.prompt||item.front||item.shown||item.text||item.hint||(Array.isArray(item.parts)?item.parts.join(' '):item.parts)||'')+'</p>'+(item.letters?'<p>'+esc(item.letters.join(' '))+'</p>':'')+(item.length?'<p>'+item.length+' letters</p>':'')+(item.options?(session.type==='Select all'?item.options.map((option,n)=>'<label><input type="checkbox" name="answer-'+index+'" value="'+n+'"> '+esc(option)+'</label>').join(''):'<label>Answer<select required name="answer-'+index+'"><option value="">Choose an answer</option>'+item.options.map((option,n)=>'<option value="'+n+'">'+esc(option)+'</option>').join('')+'</select></label>'):'<label>Answer<input required name="answer-'+index+'" maxlength="4000" autocomplete="off"></label>')+'</fieldset>').join('')+'<button class="btn primary" type="submit">Check answers</button></form>');
  }
  async function run(entry,action){
    if(entry.busy||!current(entry))return;entry.busy=true;dialog.querySelector('[data-workbench-status]').textContent='';
    const controls=[...dialog.querySelectorAll('button,input,select,textarea')].map(node=>[node,node.disabled]);controls.forEach(([node])=>{node.disabled=true;});
    try{await action();}catch(error){if(current(entry))dialog.querySelector('[data-workbench-status]').textContent=error.message;}
    finally{entry.busy=false;controls.forEach(([node,disabled])=>{if(node.isConnected)node.disabled=disabled;});if(!current(entry)&&job===entry)close();}
  }
  async function open(card,groups=[],lessonId=null){
    if(!enabled()||!card.providerSettings&&!card.examBridge&&!card.lessonSpeech&&!card.mine&&!(card.queue&&staff())&&!valid(card.cardId)||card.providerSettings&&authUser?.role!=='DEVELOPER')return;close();
    const pageId = card.queue ? 'workbenchqueue' : card.mine ? 'workbenchmine' : card.providerSettings ? 'workbenchproviders' : null;
    const host = pageId ? document.getElementById(pageId === 'workbenchqueue' ? 'workbenchQueueHost' : pageId === 'workbenchmine' ? 'workbenchMineHost' : 'workbenchProvidersHost') : null;
    if (pageId && host && document.querySelector('section.on')?.id !== pageId && typeof show === 'function') {
      show(pageId);
    }
    const entry=job={...card,groups,lessonId,identity:identity(),screen:document.querySelector('section.on')?.id,writable:false};
    dialog=document.createElement(card.lessonSpeech?'div':'dialog');dialog.className=card.lessonSpeech?'learning-speech-inline':host?'learning-kit-dialog workbench-page-view saas-card':'learning-kit-dialog saas-card';dialog.setAttribute('aria-label',card.lessonSpeech?'Speech':'Learning kit');
    dialog.innerHTML=(card.lessonSpeech?'':'<header><h2>'+esc(card.title||'Learning kit')+'</h2><button class="icon-btn saas-btn" type="button" data-workbench-close aria-label="Close" title="Close"><i data-lucide="x"></i><span aria-hidden="true">×</span></button></header>')+'<p data-workbench-status role="status"></p><div data-workbench-body>Loading...</div>';
    if(card.lessonSpeech){const host=speechHost();if(!host){close();return;}host.append(dialog);}
    else if(host){
      host.replaceChildren(dialog);
      window.lucide?.createIcons({root:dialog});
      dialog.setAttribute('open','');
      dialog.open=true;
      dialog.addEventListener('cancel',event=>{if(!discard(entry))event.preventDefault();});
      dialog.addEventListener('close',()=>{if(job===entry)close();});
    }
    else{document.body.append(dialog);window.lucide?.createIcons({root:dialog});dialog.addEventListener('cancel',event=>{if(!discard(entry))event.preventDefault();});dialog.addEventListener('close',()=>{if(job===entry)close();});dialog.showModal();}
    observer=new MutationObserver(()=>{if(job===entry&&!current(entry))close();});observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','data-role']});
    await run(entry,async()=>{
      const status=await request('/status');if(!current(entry))return;entry.writable=status.writable;entry.features=status.features;entry.pronunciationQuizzes=status.pronunciationQuizzes;entry.pronunciationRubrics=status.pronunciationRubrics||[];
      if(card.providerSettings){await loadProviders(entry);return;}
      if(card.examBridge){await examSessions(entry);return;}
      if(card.queue){entry.view='queue';await loadQueue(entry);return;}
      if(card.mine){await mine(entry);return;}
      if(groups.length>1){render(entry,'<label>Group<select data-workbench-group><option value="">Select a group</option>'+options(groups)+'</select></label>');return;}
      entry.groupId=groups[0]?.id||null;if(entry.lessonSpeech)await lessonSpeech(entry);else await coverage(entry);
    });
  }
  function lessonButton(block){
    const cardId=block.stageDefinition?.cardId||block.stageId;
    if(!enabled()||lmState?.examOwned||!valid(lmState?.id)||!valid(cardId)||!classGroups.some(group=>valid(group.id)&&group.lessonIds?.includes(lmState.id)))return '';
    return '<button class="btn" type="button" data-workbench-lesson="'+esc(block.id)+'">Learning kit</button>';
  }
  function lessonSpeechButton(){
    if(!enabled()||lmState?.examOwned||!valid(lmState?.id)||!classGroups.some(group=>valid(group.id)&&group.lessonIds?.includes(lmState.id)))return '';
    const selected=lmState?.tab==='speech';
    return '<button type="button" data-lm-tab="speech" data-workbench-lesson-speech role="tab" class="'+(selected?'on':'')+'" aria-selected="'+selected+'">Speech</button>';
  }
  function mountLessonSpeech(){
    if(!enabled()||lmState?.examOwned)return;
    if(job?.lessonSpeech&&current(job))return;
    const groups=classGroups.filter(group=>valid(group.id)&&group.lessonIds?.includes(lmState.id));
    if(groups.length)void open({lessonSpeech:true,title:'Speech'},groups,lmState.id);
  }
  function examButton(){if(!enabled()||window.LearningMain?.capabilities?.().learningStudyBridge!==true||!lmState?.examOwned||!valid(lmState.examId)||!valid(lmState.blockId))return '';return '<button class="btn" type="button" data-workbench-exam>Reviewed quiz tasks</button>';}
  function cardButton(card){if(!enabled()||!valid(card?.stageId))return '';displayedCards.set(card.stageId,card);return '<button class="btn" type="button" data-workbench-card="'+card.stageId+'">Learning kit</button>';}
  function reset(){displayedCards.clear();close();paintEntry();}
  document.addEventListener('learning-workbench-session',reset);
  document.addEventListener('click',event=>{
    const checkButton=event.target.closest('[data-workbench-checks],[data-workbench-check-run]');
    if(checkButton){const entry=job,id=checkButton.dataset.workbenchChecks||checkButton.dataset.workbenchCheckRun,q=entry?.rows?.find(row=>row.id===id);if(!q||!current(entry)||!staff()||!dialog.contains(checkButton))return;void run(entry,async()=>{
      if(checkButton.hasAttribute('data-workbench-check-run')){if(!entry.writable||q.state!=='submitted')return;await write(entry,'/proposals/'+id+'/checks',{expectedRevision:q.revision,level:null});}
      const result=await request('/proposals/'+id+'/checks');if(!current(entry))return;const host=dialog.querySelector('[data-workbench-check-results="'+id+'"]');
      if(host)host.innerHTML=result.attempts.map(attempt=>'<details><summary>'+esc(new Date(attempt.requestedAt).toLocaleDateString())+' · '+esc(attempt.state)+' · '+esc(attempt.result?.status||attempt.error||'Pending')+'</summary>'+(attempt.result?'<p>'+esc(attempt.result.source.provider+' · '+attempt.result.source.model)+' · '+esc(attempt.current?'Current version':'Older version')+'</p><p>Advisory only · Teacher approval required</p>'+attempt.result.findings.map(row=>'<p>'+esc(row.dimension)+' · '+esc(row.message)+'</p><blockquote>'+esc(row.suggestion)+'</blockquote>').join(''):'')+'</details>').join('')||'<p>No AI reviews.</p>';
    });return;}
    const providerButton=event.target.closest('[data-workbench-providers],[data-workbench-provider-init],[data-workbench-pipeline-init]');
    if(providerButton){if(!enabled()||authUser?.role!=='DEVELOPER')return;if(providerButton.hasAttribute('data-workbench-providers'))void open({providerSettings:true,title:'AI providers'});else if(job?.providerSettings&&job.writable){const entry=job;void run(entry,async()=>{await write(entry,providerButton.hasAttribute('data-workbench-pipeline-init')?'/pipeline/initialize':'/settings/providers/initialize',{});await loadProviders(entry);});}return;}
    const pronunciation=event.target.closest('[data-workbench-pronunciation]');
    if(pronunciation&&job&&dialog?.contains(pronunciation)){
      const entry=job;if(!entry.writable||entry.session?.type!=='Pronunciation')return;
      void run(entry,async()=>{const task=await write(entry,'/sessions/'+entry.session.id+'/pronunciation',{itemIndex:Number(pronunciation.dataset.workbenchPronunciation)});if(!current(entry))return;entry.pronunciationTaskId=task.id;entry.view='speech';await speech().load();if(current(entry))paintSpeech(entry);});return;
    }
    const button=event.target.closest('[data-workbench-lesson],[data-workbench-lesson-speech],[data-workbench-card],[data-workbench-close],[data-workbench-back],[data-workbench-practice],[data-workbench-speech],[data-workbench-queue],[data-workbench-history],[data-workbench-more],[data-workbench-mine],[data-workbench-own],[data-workbench-new],[data-workbench-edit],[data-workbench-editor-back],[data-workbench-upload],#add-quiz-item,[data-add-option],[data-remove-option],[data-remove-item]');if(!button)return;
    if(button.hasAttribute('data-workbench-close')){
      const pageView = ['workbenchqueue', 'workbenchmine', 'workbenchproviders'].includes(document.querySelector('section.on')?.id);
      if(job&&discard(job)){
        close();
        if(pageView && typeof goBack === 'function') goBack('home');
      }
      return;
    }
    if(button.hasAttribute('data-workbench-queue')){if(enabled()&&staff())void open({queue:true,title:'Review queue'});return;}
    if(button.hasAttribute('data-workbench-mine')){if(enabled())void open({mine:true,title:'My quizzes'});return;}
    if(button.hasAttribute('data-workbench-lesson-speech')){
      mountLessonSpeech();return;
    }
    if(button.hasAttribute('data-workbench-lesson')){
      if(!enabled()||lmState?.examOwned)return;
      const block=lmState?.blocks?.find(row=>String(row.id)===button.dataset.workbenchLesson),groups=classGroups.filter(group=>group.lessonIds?.includes(lmState.id)&&valid(group.id));
      if(!block||!groups.length)return;
      void open({cardId:block.stageDefinition?.cardId||block.stageId,title:block.word},groups,lmState.id);return;
    }
    if(button.hasAttribute('data-workbench-card')){
      // Resolve only a currently displayed server card; do not infer a meaning from spelling.
      const shown=displayedCards.get(Number(button.dataset.workbenchCard));
      if(shown)void open({cardId:shown.stageId,title:shown.word||shown.en});return;
    }
    const entry=job;if(!entry||!dialog?.contains(button))return;
    if(entry.view==='editor'&&(button.hasAttribute('data-workbench-editor-back'))&&!discard(entry))return;
    void run(entry,async()=>{
      if(button.hasAttribute('data-workbench-own')){await mine(entry);return;}
      if(button.hasAttribute('data-workbench-editor-back')){entry.dirty=false;if(entry.editorBack==='kit')await coverage(entry);else if(entry.editorBack==='queue')await loadQueue(entry);else await mine(entry);return;}
      if(button.hasAttribute('data-workbench-edit')){if(entry.rows?.some(q=>q.id===button.dataset.workbenchEdit))await editProposal(entry,button.dataset.workbenchEdit);return;}
      if(button.hasAttribute('data-workbench-new')){
        if(!authorable(entry))return;entry.edit=null;entry.editorBack='kit';entry.view='editor';entry.dirty=false;entry.drafts={};entry.contextLabel=[entry.groups.find(group=>group.id===entry.groupId)?.title,entry.title].filter(Boolean).join(' · ');
        entry.draft={type:'Choice',items:integratedReviewEditor.emptyReviewItems('Choice',{word:entry.title}),explanation:''};editor(entry);return;
      }
      if(entry.view==='editor'&&entry.writable&&(button.id==='add-quiz-item'||button.matches('[data-add-option],[data-remove-option],[data-remove-item]'))){readEditor(entry);entry.draft.items=integratedReviewEditor.editReviewItems(entry.draft.type,entry.draft.items,button);entry.dirty=true;editor(entry);return;}
      if(button.hasAttribute('data-workbench-upload')){if(entry.view==='editor'&&entry.writable)await uploadQuizMedia(entry,button.closest('form'));return;}
      if(button.hasAttribute('data-workbench-speech')){if(!entry.writable||!entry.lessonId||!entry.senseId||!entry.features.includes('speech'))return;entry.view='speech';await speech().load();if(current(entry))paintSpeech(entry);return;}
      if(button.hasAttribute('data-workbench-more')){if(entry.view==='mine')await mine(entry,true);else await loadQueue(entry,true);return;}
      if(button.hasAttribute('data-workbench-history')){const id=button.dataset.workbenchHistory;if(!entry.rows?.some(row=>row.id===id))return;const {quiz}=await request('/proposals/'+id);if(!current(entry))return;const host=dialog.querySelector('[data-review-history="'+id+'"]');if(host)host.innerHTML='<details><summary>History · '+quiz.history.length+'</summary>'+quiz.history.map(row=>'<p>'+esc(row.date)+' · '+esc(row.actor)+' · '+esc(row.action)+'</p>'+(row.details.comment?'<blockquote>'+esc(row.details.comment)+'</blockquote>':'')).join('')+'</details>';return;}
      if(button.hasAttribute('data-workbench-back')){delete entry.pronunciationTaskId;if(entry.examBridge)await examSessions(entry);else await coverage(entry);return;}
      if(!entry.writable)return;
      const versionId=button.dataset.workbenchPractice;
      if(![...entry.kit.types,...(entry.kit.additionalTypes||[])].some(type=>type.versionIds.includes(versionId)))return;
      const result=await write(entry,'/sessions',{cardId:entry.cardId,senseId:entry.senseId,versionId,mode:'practice'});
      if(!current(entry))return;
      const session=await request('/sessions/'+result.id);if(!current(entry))return;entry.session=session;answers(entry);
    });
  });
  document.addEventListener('change',event=>{
    if(job?.view==='editor'&&dialog?.contains(event.target)){
      job.dirty=true;
      if(event.target.matches('[data-workbench-type]')&&!job.edit){readEditor(job);job.drafts[job.draft.type]=job.draft;const type=event.target.value;job.draft=job.drafts[type]||{type,items:integratedReviewEditor.emptyReviewItems(type,{word:job.title,translation:job.kit?.meaning?.translation}),explanation:''};editor(job);}return;
    }
    if(event.target.matches('[data-workbench-filter]')&&['queue','mine'].includes(job?.view)){job.filter=event.target.value;paintQueue(job);return;}
    const entry=job;if(!entry||!event.target.matches('[data-workbench-group],[data-workbench-sense]'))return;
    if(event.target.hasAttribute('data-workbench-group'))entry.groupId=entry.groups.find(group=>String(group.id)===event.target.value)?.id||null;
    else entry.senseId=event.target.value;
    if(entry.groups.length&& !entry.groupId)return;
    void run(entry,()=>entry.lessonSpeech?lessonSpeech(entry):coverage(entry));
  });
  document.addEventListener('submit',event=>{
    if(event.target.matches('[data-workbench-provider-access],[data-workbench-provider-budget],[data-workbench-provider-preparation],[data-workbench-provider-pipeline]')){
      event.preventDefault();const entry=job,form=event.target;if(!entry?.providerSettings||!current(entry)||!entry.writable||!form.reportValidity())return;
      const data=new FormData(form);void run(entry,async()=>{
        if(form.hasAttribute('data-workbench-provider-access')){const account=entry.providerAccess.accounts.find(row=>row.scope===form.dataset.workbenchProviderAccess);if(!account)return;
          await write(entry,'/settings/provider-access',{scope:account.scope,expectedRevision:account.access.revision,reason:data.get('reason'),policy:{enabled:data.has('enabled'),bindings:account.bindings,tasks:data.getAll('tasks'),termsRevision:data.get('termsRevision'),dataProcessingApproved:data.has('dataProcessingApproved'),noPaidOverageConfirmed:data.has('noPaidOverageConfirmed'),expiresAt:Date.now()+Number(data.get('days'))*86400000,dailyRequests:Number(data.get('dailyRequests')),dailyInputBytes:Number(data.get('dailyInputBytes')),maxInputBytes:Number(data.get('maxInputBytes'))}});
        }else if(form.hasAttribute('data-workbench-provider-budget')){const account=entry.providerAccess.accounts.find(row=>row.provider===form.dataset.workbenchProviderBudget);if(!account)return;
          await write(entry,account.quota?'/settings/provider-limit':'/settings/provider-budget',{provider:account.provider,requestLimit:Number(data.get('requestLimit')),...(account.quota?{expectedRevision:account.quota.revision,reason:data.get('reason')}:{})});
        }else {const pipeline=form.hasAttribute('data-workbench-provider-pipeline');await write(entry,pipeline?'/pipeline/settings':'/preparation/settings',{expectedRevision:(pipeline?entry.pipelineSettings:entry.preparationSettings).revision,enabled:data.has('enabled'),reason:data.get('reason')});}
        if(current(entry))await loadProviders(entry);
      });return;
    }
    if(event.target.matches('[data-workbench-editor]')){event.preventDefault();const entry=job;if(entry?.view==='editor'&&entry.writable){readEditor(entry);const submit=event.submitter?.value==='submit';void run(entry,()=>saveProposal(entry,submit));}return;}
    if(event.target.matches('[data-workbench-prepare]')){event.preventDefault();const entry=job;if(!entry||!staff()||!authorable(entry))return;const types=new FormData(event.target).getAll('types');void run(entry,async()=>{if(!types.length)throw Error('Select at least one missing type.');const result=await write(entry,'/kit/fill',{...contextBody(entry),types});if(!current(entry))return;await coverage(entry);if(current(entry))dialog.querySelector('[data-workbench-status]').textContent=result.ids.length+' preparation tasks queued. No quiz has been approved.';});return;}
    if(event.target.matches('[data-workbench-decision]')){
      event.preventDefault();const entry=job,q=entry?.rows?.find(row=>row.id===event.target.dataset.id);if(!q||!staff()||!entry.writable)return;
      const action=event.target.dataset.workbenchDecision,data=new FormData(event.target);
      void run(entry,async()=>{await write(entry,'/proposals/'+q.id+'/'+action,{expectedRevision:q.revision,...(action==='return'?{comment:data.get('comment')}:{checks:Object.fromEntries(['meaning','answers','level','media',...(q.type==='Pronunciation'?['reference','rubric']:[])].map(key=>[key,data.get(key)==='on']))})});await loadQueue(entry);});return;
    }
    if(!event.target.matches('[data-workbench-answers]'))return;event.preventDefault();const entry=job;if(!entry?.session||!entry.writable)return;
    const form=new FormData(event.target),session=entry.session,pairs=['Match','Memory'].includes(session.type),items=pairs?session.questions.left:session.questions;
    const responses=items.map((item,index)=>session.type==='Select all'?form.getAll('answer-'+index).map(Number):pairs||item.options?Number(form.get('answer-'+index)):form.get('answer-'+index));
    void run(entry,async()=>{await write(entry,'/sessions/'+session.id+'/submit',{expectedRevision:session.revision,responses});if(!current(entry))return;const value=await request('/sessions/'+session.id);if(current(entry)){entry.session=value;answers(entry);}});
  });
  document.addEventListener('input',event=>{if(job?.view==='editor'&&dialog?.contains(event.target))job.dirty=true;if(event.target.matches('[data-workbench-search]')&&['queue','mine'].includes(job?.view)){const value=event.target.value,start=event.target.selectionStart;job.search=value;paintQueue(job);const field=dialog?.querySelector('[data-workbench-search]');field?.focus();field?.setSelectionRange(start,start);}});
  window.LearningWorkbench={open,lessonButton,lessonSpeechButton,mountLessonSpeech,examButton,cardButton,close,reset,paintEntry};
})();
