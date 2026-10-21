// Optional main-app consumer. Existing Study and exam runners remain untouched.
(() => {
  const prefix='/api/learning-workbench',valid=id=>Number.isSafeInteger(id)&&id>0;
  let job=null,dialog=null,observer=null,serial=0;
  const displayedCards=new Map();
  const enabled=()=>!!authUser&&accountReady&&!viewAccount&&!viewSwitching&&window.LearningMain?.capabilities?.().learningWorkbench===true;
  const identity=()=>String(authUser?.id||'')+':'+viewGen;
  const current=entry=>job===entry&&enabled()&&entry.identity===identity()&&entry.screen===document.querySelector('section.on')?.id&&(!entry.lessonId||entry.lessonId===lmState?.id);
  function close(){serial++;job=null;observer?.disconnect();observer=null;if(dialog?.open)dialog.close();dialog?.remove();dialog=null;}
  const request=(path)=>window.LearningMain.fetch(prefix+path,{quietBug:true});
  async function write(entry,path,value){
    const signature=path+JSON.stringify(value);
    if(entry.intent?.signature!==signature)entry.intent={signature,body:JSON.stringify({mutationId:crypto.randomUUID(),...value})};
    const result=await window.LearningMain.fetch(prefix+path,{method:'POST',body:entry.intent.body,quietBug:true});entry.intent=null;return result;
  }
  function render(entry,html){if(!current(entry)){close();return;}dialog.querySelector('[data-workbench-body]').innerHTML=html;}
  const options=items=>items.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.title)+'</option>').join('');
  const reason={not_generated:'Not prepared',word_set_required:'Word set required',audio_required:'Audio required',video_required:'Video required',provider_not_configured:'Generation is off',quota_exceeded:'Quota exhausted',quota_unavailable:'Quota unavailable'};
  async function coverage(entry){
    const token=++serial,query=new URLSearchParams({cardId:entry.cardId,...(entry.senseId?{senseId:entry.senseId}:{}),...(entry.groupId?{groupId:entry.groupId,lessonId:entry.lessonId}:{})});
    const data=await request('/kit?'+query);
    if(!current(entry)||token!==serial)return;entry.kit=data;entry.senseId=data.meaning?.id||entry.senseId||'';entry.session=null;
    const group=entry.groups?.length>1?'<label>Group<select data-workbench-group>'+options(entry.groups)+'</select></label>':'';
    const senses='<label>Meaning<select data-workbench-sense><option value="">Select a meaning</option>'+data.senses.map(sense=>'<option value="'+esc(sense.id)+'" '+(sense.id===entry.senseId?'selected':'')+'>'+esc([sense.part_of_speech,sense.translation,sense.definition].filter(Boolean).join(' · '))+'</option>').join('')+'</select></label>';
    render(entry,group+senses+(data.selectionRequired?'<p>No meaning selected.</p>':'<h3>'+data.counts.ready+' / '+data.counts.total+' types ready</h3>'+[...data.types,...(data.additionalTypes||[])].map(type=>'<details><summary>'+esc(type.type)+' · '+esc(type.status==='ready'?'Teacher checked · '+type.approvedCount+' variants':reason[type.reason]||type.reason||type.status)+'</summary>'+type.versionIds.map((id,index)=>'<p>Variant '+(index+1)+' <button class="btn" type="button" data-workbench-practice="'+esc(id)+'" '+(!entry.writable?'disabled':'')+'>Practice</button></p>').join('')+'</details>').join('')+(!entry.writable?'<p>Read-only. New practice sessions are disabled.</p>':'')));
    if(entry.groupId&&dialog?.querySelector('[data-workbench-group]'))dialog.querySelector('[data-workbench-group]').value=String(entry.groupId);
  }
  function answers(entry){
    const session=entry.session,pairs=['Match','Memory'].includes(session.type),items=pairs?session.questions.left.map(prompt=>({prompt,options:session.questions.right})):session.questions;
    if(session.content){render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>'+esc(session.type)+' · '+session.correctCount+' / '+session.total+'</h3>'+session.content.items.map((item,index)=>'<div class="learning-kit-result"><p>'+esc(session.correct[index]?'Correct':'Try again')+'</p><p>'+esc(item.prompt||item.front||item.shown||item.text||item.left||item.hint||'')+'</p><p>'+esc(Array.isArray(item.answers)?item.answers.map(n=>item.options[n]).join(', '):item.options?item.options[item.answer]:item.back||item.right||item.word||item.answer||'')+'</p>'+(item.transcript?'<p>'+esc(item.transcript)+'</p>':'')+'</div>').join('')+'<p>'+esc(session.content.explanation)+'</p>');return;}
    render(entry,'<button class="btn" data-workbench-back>Learning kit</button><h3>'+esc(session.type)+'</h3><form data-workbench-answers>'+items.map((item,index)=>'<fieldset><legend>Item '+(index+1)+'</legend>'+(item.mediaUrl?(session.type==='Video choice'?'<video controls playsinline preload="metadata" src="'+esc(item.mediaUrl)+'"></video>':'<audio controls preload="metadata" src="'+esc(item.mediaUrl)+'"></audio>'):'')+'<p>'+esc(item.prompt||item.front||item.shown||item.text||item.hint||(Array.isArray(item.parts)?item.parts.join(' '):item.parts)||'')+'</p>'+(item.letters?'<p>'+esc(item.letters.join(' '))+'</p>':'')+(item.length?'<p>'+item.length+' letters</p>':'')+(item.options?(session.type==='Select all'?item.options.map((option,n)=>'<label><input type="checkbox" name="answer-'+index+'" value="'+n+'"> '+esc(option)+'</label>').join(''):'<label>Answer<select required name="answer-'+index+'"><option value="">Choose an answer</option>'+item.options.map((option,n)=>'<option value="'+n+'">'+esc(option)+'</option>').join('')+'</select></label>'):'<label>Answer<input required name="answer-'+index+'" maxlength="4000" autocomplete="off"></label>')+'</fieldset>').join('')+'<button class="btn primary" type="submit">Check answers</button></form>');
  }
  async function run(entry,action){
    if(entry.busy||!current(entry))return;entry.busy=true;dialog.querySelector('[data-workbench-status]').textContent='';
    const controls=[...dialog.querySelectorAll('button,input,select')].map(node=>[node,node.disabled]);controls.forEach(([node])=>{node.disabled=true;});
    try{await action();}catch(error){if(current(entry))dialog.querySelector('[data-workbench-status]').textContent=error.message;}
    finally{entry.busy=false;controls.forEach(([node,disabled])=>{if(node.isConnected)node.disabled=disabled;});if(!current(entry)&&job===entry)close();}
  }
  async function open(card,groups=[],lessonId=null){
    if(!enabled()||!valid(card.cardId))return;close();
    const entry=job={...card,groups,lessonId,identity:identity(),screen:document.querySelector('section.on')?.id,writable:false};
    dialog=document.createElement('dialog');dialog.className='learning-kit-dialog';dialog.setAttribute('aria-label','Learning kit');
    dialog.innerHTML='<header><h2>'+esc(card.title||'Learning kit')+'</h2><button class="icon-btn" type="button" data-workbench-close aria-label="Close" title="Close"><i data-lucide="x"></i><span aria-hidden="true">×</span></button></header><p data-workbench-status role="status"></p><div data-workbench-body>Loading...</div>';
    document.body.append(dialog);window.lucide?.createIcons({root:dialog});dialog.addEventListener('close',()=>{if(job===entry)close();});dialog.showModal();
    observer=new MutationObserver(()=>{if(job===entry&&!current(entry))close();});observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
    await run(entry,async()=>{
      const status=await request('/status');if(!current(entry))return;entry.writable=status.writable;
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
  function reset(){displayedCards.clear();close();}
  document.addEventListener('learning-workbench-session',reset);
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-workbench-lesson],[data-workbench-card],[data-workbench-close],[data-workbench-back],[data-workbench-practice]');if(!button)return;
    if(button.hasAttribute('data-workbench-close')){close();return;}
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
    const entry=job;if(!entry)return;
    void run(entry,async()=>{
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
    const entry=job;if(!entry||!event.target.matches('[data-workbench-group],[data-workbench-sense]'))return;
    if(event.target.hasAttribute('data-workbench-group'))entry.groupId=entry.groups.find(group=>String(group.id)===event.target.value)?.id||null;
    else entry.senseId=event.target.value;
    if(entry.groups.length&& !entry.groupId)return;
    void run(entry,()=>coverage(entry));
  });
  document.addEventListener('submit',event=>{
    if(!event.target.matches('[data-workbench-answers]'))return;event.preventDefault();const entry=job;if(!entry?.session||!entry.writable)return;
    const form=new FormData(event.target),session=entry.session,pairs=['Match','Memory'].includes(session.type),items=pairs?session.questions.left:session.questions;
    const responses=items.map((item,index)=>session.type==='Select all'?form.getAll('answer-'+index).map(Number):pairs||item.options?Number(form.get('answer-'+index)):form.get('answer-'+index));
    void run(entry,async()=>{await write(entry,'/sessions/'+session.id+'/submit',{expectedRevision:session.revision,responses});if(!current(entry))return;const value=await request('/sessions/'+session.id);if(current(entry)){entry.session=value;answers(entry);}});
  });
  window.LearningWorkbench={lessonButton,cardButton,close,reset};
})();
