// Optional main-app consumer. Existing Study and exam runners remain untouched.
(() => {
  const prefix='/api/learning-workbench',valid=id=>Number.isSafeInteger(id)&&id>0;
  let job=null,dialog=null,observer=null,serial=0;
  const displayedCards=new Map();
  let speechUI=null;
  const quizTypes=['Flip','Choice','Type','Gap','Build','Match','True / false','Tap','Select all','Reverse','Spell','Letters','Listen','Definition','Odd one out','Memory','Hangman','Video choice'];
  const staff=()=>['ADMIN','DEVELOPER'].includes(authUser?.role);
  const enabled=()=>!!authUser&&accountReady&&!viewAccount&&!viewSwitching&&window.LearningMain?.capabilities?.().learningWorkbench===true;
  const identity=()=>String(authUser?.id||'')+':'+authUser?.role+':'+viewGen;
  const current=entry=>job===entry&&enabled()&&(!entry.queue||staff())&&entry.identity===identity()&&entry.screen===document.querySelector('section.on')?.id&&(!entry.lessonId||entry.lessonId===lmState?.id);
  function close(){serial++;job?.uploadController?.abort();speechUI?.reset();job=null;observer?.disconnect();observer=null;if(dialog?.open)dialog.close();dialog?.remove();dialog=null;}
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
      renderPage:()=>{if(job?.view==='speech'){render(job,tabButtons(job)+speechUI.render());speechUI.afterRender();}},notify:message=>{if(dialog)dialog.querySelector('[data-workbench-status]').textContent=message;}});
    return speechUI;
  }
  function tabButtons(entry){return '<div class="seg" role="tablist" aria-label="Learning kit"><button type="button" data-workbench-back role="tab" aria-selected="'+(entry.view!=='speech')+'">Learning kit</button>'+(entry.lessonId&&entry.senseId&&entry.features?.includes('speech')?'<button type="button" data-workbench-speech role="tab" aria-selected="'+(entry.view==='speech')+'" '+(!entry.writable?'disabled':'')+'>Speech practice</button>':'')+'</div>';}
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
    const media=['Listen','Video choice'].includes(draft.type)?'<fieldset><legend>Media</legend><label>Item<select data-workbench-media-index>'+draft.items.map((_,index)=>'<option value="'+index+'">Item '+(index+1)+'</option>').join('')+'</select></label><label>File<input type="file" data-workbench-media accept="'+(draft.type==='Video choice'?'video/mp4':'audio/wav,audio/mpeg')+'"></label><label>Source and usage permission<textarea data-workbench-media-source maxlength="500"></textarea></label><button class="btn" type="button" data-workbench-upload>Upload media</button></fieldset>':'';
    render(entry,'<button class="btn" type="button" data-workbench-editor-back>Back</button><h3>'+esc(q?'Edit '+q.type:'New quiz')+'</h3><p>'+esc([entry.contextLabel,entry.kit?.meaning?.definition].filter(Boolean).join(' · '))+'</p>'+(q?.feedback?'<blockquote>'+esc(q.feedback)+'</blockquote>':'')+'<form data-workbench-editor><label>Type<select data-workbench-type '+(q?'disabled':'')+'>'+quizTypes.map(type=>'<option '+(type===draft.type?'selected':'')+'>'+esc(type)+'</option>').join('')+'</select></label><div data-workbench-items>'+integratedReviewEditor.renderReviewItems(draft.type,draft.items)+'</div><button class="btn" type="button" id="add-quiz-item">Add item</button><label>Explanation<textarea name="explanation" maxlength="4000" required>'+esc(draft.explanation)+'</textarea></label>'+media+'<div class="learning-workbench-actions"><button class="btn" type="submit" value="save">Save draft</button><button class="btn primary" type="submit" value="submit">Send for review</button></div></form>');
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
        button=document.createElement('button');button.type='button';button.dataset.workbenchQueue='';button.innerHTML='<i data-lucide="clipboard-check" aria-hidden="true"></i>Review queue';nav.append(button);window.lucide?.createIcons({root:button});
      }
      if(button)button.hidden=!enabled()||!staff();
      let mineButton=nav.querySelector('[data-workbench-mine]');
      if(!mineButton&&enabled()){mineButton=document.createElement('button');mineButton.type='button';mineButton.dataset.workbenchMine='';mineButton.innerHTML='<i data-lucide="notebook-pen" aria-hidden="true"></i>My quizzes';nav.append(mineButton);window.lucide?.createIcons({root:mineButton});}
      if(mineButton)mineButton.hidden=!enabled();
    }
  }
  async function loadQueue(entry,more=false){
    if(!staff())throw Error('Teacher access required.');entry.view='queue';
    const offset=more?entry.nextOffset:0,data=await request('/queue?offset='+offset);if(!current(entry))return;
    entry.rows=more?[...entry.rows,...data.quizzes]:data.quizzes;entry.nextOffset=data.nextOffset;paintQueue(entry);
  }
  function preview(q){
    return q.content.items.map(item=>'<div class="learning-kit-result">'+(item.mediaId?'<'+(q.type==='Video choice'?'video':'audio')+' controls preload="none" src="'+prefix+'/media/'+esc(item.mediaId)+'"></'+(q.type==='Video choice'?'video':'audio')+'>':'')+'<p>'+esc(item.prompt||item.front||item.shown||item.text||item.left||item.word||'')+'</p>'+(item.parts?'<p>'+esc(item.parts)+'</p>':'')+(item.options?'<ol>'+item.options.map((option,index)=>'<li>'+esc(option)+((item.answers||[item.answer]).includes(index)?' · Correct':'')+'</li>').join('')+'</ol>':'<p>Answer: '+esc(item.back||item.right||item.word||item.answer||'')+'</p>')+(item.transcript?'<p>'+esc(item.transcript)+'</p>':'')+'</div>').join('')+'<p>'+esc(q.content.explanation)+'</p>';
  }
  function reviewRow(entry,q){
    const allowed=staff()&&entry.writable&&q.state==='submitted'&&q.author.id!==authUser.id;
    const edit=entry.writable&&q.author.id===authUser.id&&['draft','returned'].includes(q.state)?'<button class="btn" type="button" data-workbench-edit="'+esc(q.id)+'">Edit quiz</button>':'';
    return '<details data-review-key="version-'+esc(q.id)+'"><summary>v'+q.version+' · '+esc(q.state)+(q.reviewer?' · Teacher checked':'')+'</summary><p>'+esc(q.author.name)+' · '+esc(q.author.group)+' · '+esc(q.author.date)+'</p>'+(q.origin?.meaning?'<p>'+esc(q.origin.meaning)+'</p>':'')+preview(q)+(q.feedback?'<blockquote>'+esc(q.feedback)+'</blockquote>':'')+edit+'<button class="btn" data-workbench-history="'+esc(q.id)+'">History</button><div data-review-history="'+esc(q.id)+'"></div>'+(allowed?'<form data-workbench-decision="approve" data-id="'+esc(q.id)+'"><label><input type="checkbox" name="meaning" required>Meaning, translation and naturalness checked</label><label><input type="checkbox" name="answers" required>Answers and explanation checked</label><label><input type="checkbox" name="level" required>Level checked</label>'+(['Listen','Video choice'].includes(q.type)?'<label><input type="checkbox" name="media" required>Media, transcript and usage rights checked</label>':'')+'<button class="btn primary" type="submit">Approve</button></form><form data-workbench-decision="return" data-id="'+esc(q.id)+'"><label>Changes requested<textarea name="comment" maxlength="2000" required></textarea></label><button class="btn" type="submit">Return for changes</button></form>':edit?'':'<p>'+esc(q.author.id===authUser.id?'Your own version cannot be approved by you.':q.state==='returned'?'Awaiting changes by the author.':'Read-only.')+'</p>')+'</details>';
  }
  function paintQueue(entry){
    const query=(entry.search||'').trim().toLocaleLowerCase(),rows=entry.rows.filter(q=>(!entry.filter||q.state===entry.filter)&&(!query||[q.origin?.groupName,q.origin?.lessonName,q.origin?.word,q.type,q.author.name,q.author.group,q.origin?.meaning].join(' ').toLocaleLowerCase().includes(query)));
    function group(list,depth=0){if(depth===4)return list.map(q=>reviewRow(entry,q)).join('');
      const keys=['groupId','lessonId','senseId','type'],labels=[q=>q.origin?.groupName||q.author.group,q=>q.origin?.lessonName||'Lesson '+q.lessonId,q=>q.origin?.word||'Word '+q.cardId,q=>q.type],groups=new Map();
      for(const q of list){const key=String(q[keys[depth]]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(q);}
      return [...groups].map(([key,items])=>'<details data-review-key="'+esc(keys.slice(0,depth+1).map(field=>items[0][field]).join(':'))+'"><summary>'+esc(labels[depth](items[0]))+' · '+items.length+'</summary><div class="learning-review-group">'+group(items,depth+1)+'</div></details>').join('');
    }
    render(entry,'<div class="learning-review-filters"><label>Search<input type="search" data-workbench-search value="'+esc(entry.search||'')+'"></label><label>Status<select data-workbench-filter><option value="">All</option>'+['draft','submitted','returned','approved'].filter(state=>entry.view==='mine'||['submitted','returned'].includes(state)).map(state=>'<option value="'+state+'" '+(entry.filter===state?'selected':'')+'>'+esc({draft:'Draft',submitted:'Needs review',returned:'Changes requested',approved:'Teacher checked'}[state])+'</option>').join('')+'</select></label></div><p>'+rows.length+' matching · '+entry.rows.length+' loaded</p>'+group(rows)+(!rows.length?'<p>No matching quizzes.</p>':'')+(entry.nextOffset!==null?'<button class="btn" data-workbench-more>Load more</button>':''));
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
  }
  function answers(entry){
    const session=entry.session,pairs=['Match','Memory'].includes(session.type),items=pairs?session.questions.left.map(prompt=>({prompt,options:session.questions.right})):session.questions;
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
    if(!enabled()||!card.mine&&!(card.queue&&staff())&&!valid(card.cardId))return;close();
    const entry=job={...card,groups,lessonId,identity:identity(),screen:document.querySelector('section.on')?.id,writable:false};
    dialog=document.createElement('dialog');dialog.className='learning-kit-dialog';dialog.setAttribute('aria-label','Learning kit');
    dialog.innerHTML='<header><h2>'+esc(card.title||'Learning kit')+'</h2><button class="icon-btn" type="button" data-workbench-close aria-label="Close" title="Close"><i data-lucide="x"></i><span aria-hidden="true">×</span></button></header><p data-workbench-status role="status"></p><div data-workbench-body>Loading...</div>';
    document.body.append(dialog);window.lucide?.createIcons({root:dialog});dialog.addEventListener('cancel',event=>{if(!discard(entry))event.preventDefault();});dialog.addEventListener('close',()=>{if(job===entry)close();});dialog.showModal();
    observer=new MutationObserver(()=>{if(job===entry&&!current(entry))close();});observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','data-role']});
    await run(entry,async()=>{
      const status=await request('/status');if(!current(entry))return;entry.writable=status.writable;entry.features=status.features;
      if(card.queue){entry.view='queue';await loadQueue(entry);return;}
      if(card.mine){await mine(entry);return;}
      if(groups.length>1){render(entry,'<label>Group<select data-workbench-group><option value="">Select a group</option>'+options(groups)+'</select></label>');return;}
      entry.groupId=groups[0]?.id||null;await coverage(entry);
    });
  }
  function lessonButton(block){
    const cardId=block.stageDefinition?.cardId||block.stageId;
    if(!enabled()||lmState?.examOwned||!valid(lmState?.id)||!valid(cardId)||!classGroups.some(group=>valid(group.id)&&group.lessonIds?.includes(lmState.id)))return '';
    return '<button class="btn" type="button" data-workbench-lesson="'+esc(block.id)+'">Learning kit</button>';
  }
  function cardButton(card){if(!enabled()||!valid(card?.stageId))return '';displayedCards.set(card.stageId,card);return '<button class="btn" type="button" data-workbench-card="'+card.stageId+'">Learning kit</button>';}
  function reset(){displayedCards.clear();close();paintEntry();}
  document.addEventListener('learning-workbench-session',reset);
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-workbench-lesson],[data-workbench-card],[data-workbench-close],[data-workbench-back],[data-workbench-practice],[data-workbench-speech],[data-workbench-queue],[data-workbench-history],[data-workbench-more],[data-workbench-mine],[data-workbench-own],[data-workbench-new],[data-workbench-edit],[data-workbench-editor-back],[data-workbench-upload],#add-quiz-item,[data-add-option],[data-remove-option],[data-remove-item]');if(!button)return;
    if(button.hasAttribute('data-workbench-close')){if(job&&discard(job))close();return;}
    if(button.hasAttribute('data-workbench-queue')){if(enabled()&&staff())void open({queue:true,title:'Review queue'});return;}
    if(button.hasAttribute('data-workbench-mine')){if(enabled())void open({mine:true,title:'My quizzes'});return;}
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
      if(button.hasAttribute('data-workbench-speech')){if(!entry.writable||!entry.lessonId||!entry.senseId||!entry.features.includes('speech'))return;entry.view='speech';await speech().load();if(current(entry)){render(entry,tabButtons(entry)+speechUI.render());speechUI.afterRender();}return;}
      if(button.hasAttribute('data-workbench-more')){if(entry.view==='mine')await mine(entry,true);else await loadQueue(entry,true);return;}
      if(button.hasAttribute('data-workbench-history')){const id=button.dataset.workbenchHistory;if(!entry.rows?.some(row=>row.id===id))return;const {quiz}=await request('/proposals/'+id);if(!current(entry))return;const host=dialog.querySelector('[data-review-history="'+id+'"]');if(host)host.innerHTML='<details><summary>History · '+quiz.history.length+'</summary>'+quiz.history.map(row=>'<p>'+esc(row.date)+' · '+esc(row.actor)+' · '+esc(row.action)+'</p>'+(row.details.comment?'<blockquote>'+esc(row.details.comment)+'</blockquote>':'')).join('')+'</details>';return;}
      if(button.hasAttribute('data-workbench-back')){await coverage(entry);return;}
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
    void run(entry,()=>coverage(entry));
  });
  document.addEventListener('submit',event=>{
    if(event.target.matches('[data-workbench-editor]')){event.preventDefault();const entry=job;if(entry?.view==='editor'&&entry.writable){readEditor(entry);const submit=event.submitter?.value==='submit';void run(entry,()=>saveProposal(entry,submit));}return;}
    if(event.target.matches('[data-workbench-prepare]')){event.preventDefault();const entry=job;if(!entry||!staff()||!authorable(entry))return;const types=new FormData(event.target).getAll('types');void run(entry,async()=>{if(!types.length)throw Error('Select at least one missing type.');const result=await write(entry,'/kit/fill',{...contextBody(entry),types});if(!current(entry))return;await coverage(entry);if(current(entry))dialog.querySelector('[data-workbench-status]').textContent=result.ids.length+' preparation tasks queued. No quiz has been approved.';});return;}
    if(event.target.matches('[data-workbench-decision]')){
      event.preventDefault();const entry=job,q=entry?.rows?.find(row=>row.id===event.target.dataset.id);if(!q||!staff()||!entry.writable)return;
      const action=event.target.dataset.workbenchDecision,data=new FormData(event.target);
      void run(entry,async()=>{await write(entry,'/proposals/'+q.id+'/'+action,{expectedRevision:q.revision,...(action==='return'?{comment:data.get('comment')}:{checks:Object.fromEntries(['meaning','answers','level','media'].map(key=>[key,data.get(key)==='on']))})});await loadQueue(entry);});return;
    }
    if(!event.target.matches('[data-workbench-answers]'))return;event.preventDefault();const entry=job;if(!entry?.session||!entry.writable)return;
    const form=new FormData(event.target),session=entry.session,pairs=['Match','Memory'].includes(session.type),items=pairs?session.questions.left:session.questions;
    const responses=items.map((item,index)=>session.type==='Select all'?form.getAll('answer-'+index).map(Number):pairs||item.options?Number(form.get('answer-'+index)):form.get('answer-'+index));
    void run(entry,async()=>{await write(entry,'/sessions/'+session.id+'/submit',{expectedRevision:session.revision,responses});if(!current(entry))return;const value=await request('/sessions/'+session.id);if(current(entry)){entry.session=value;answers(entry);}});
  });
  document.addEventListener('input',event=>{if(job?.view==='editor'&&dialog?.contains(event.target))job.dirty=true;if(event.target.matches('[data-workbench-search]')&&['queue','mine'].includes(job?.view)){const value=event.target.value,start=event.target.selectionStart;job.search=value;paintQueue(job);const field=dialog?.querySelector('[data-workbench-search]');field?.focus();field?.setSelectionRange(start,start);}});
  window.LearningWorkbench={lessonButton,cardButton,close,reset,paintEntry};
})();
