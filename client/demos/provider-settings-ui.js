// Shared settings controls; the host supplies the authenticated endpoint and mode.
const labels={generation:'Generation',review:'Independent review',tts:'Text to speech',stt:'Speech to text',pronunciation:'Pronunciation',conversation:'Conversation',dictionary:'Dictionary'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const same=(a,b)=>a===null?b===null:b!==null&&a.adapterId===b.adapterId&&a.locale===b.locale&&a.mode===b.mode;
export function createProviderSettingsUI({api,isDeveloper,sessionKey,active,renderPage,notify,actorName,date,endpoint='/local/providers',connectionLabel='Synthetic generation and review',writable=()=>true}){
  let state=null,expanded=false;
  const valid=entry=>state===entry&&entry.epoch===sessionKey()&&isDeveloper();
  const choices=(data,task)=>data.adapters.filter(a=>!data.freeOnly||['free-tier','self-hosted'].includes(a.billing)).flatMap(a=>a.capabilities.filter(cap=>cap.task===task).flatMap(cap=>cap.locales.flatMap(locale=>cap.modes.map(mode=>({selection:{adapterId:a.id,locale,mode},adapter:a})))));
  const modelText=(selection,adapters)=>{
    if(selection==null)return 'Off';
    const adapter=adapters.find(a=>a.id===selection.adapterId);
    return [adapter?.model||selection.adapterId,adapter?.provider,adapter?.version,selection.locale,selection.mode].filter(Boolean).join(' · ');
  };
  const patch=()=>Object.fromEntries([...state.touched].filter(task=>!same(state.draft[task],state.data.selections[task])||state.data.unavailable.some(row=>row.task===task)).map(task=>[task,state.draft[task]]));
  function updateSave(){
    const form=document.querySelector('#provider-settings-form');
    if(form){
      const disabled=!writable()||!isDeveloper()||state?.saving||!state?.reason?.trim()||Object.keys(patch()).length===0;
      const submitBtn=form.querySelector('[type="submit"]');
      if(submitBtn)submitBtn.disabled=disabled;
      const bannerSave=form.querySelector('.ai-btn-save-banner');
      if(bannerSave)bannerSave.disabled=disabled;
      const has=state?Object.keys(patch()).length>0:false;
      const badge=document.querySelector('.ai-unsaved-badge');
      if(badge)badge.hidden=!has;
      const banner=document.querySelector('.ai-unsaved-banner');
      if(banner)banner.hidden=!has;
    }
  }
  async function load(){
    if(!isDeveloper())return;
    const entry={epoch:sessionKey(),status:'loading',historyStatus:'idle',history:[],next:null,touched:new Set(),reason:''};state=entry;renderPage();
    try{const data=await api(endpoint);if(!valid(entry))return;Object.assign(entry,{status:'ready',data,draft:structuredClone(data.selections)});}
    catch(error){if(!valid(entry))return;Object.assign(entry,{status:'error',error:error.message});}
    if(active())renderPage();
  }
  function historyRows(){
    const entry=state;
    return (entry.history.length?'<ol class="attempt-list">'+entry.history.map(row=>'<li class="attempt-entry"><div class="attempt-heading"><strong>Revision '+esc(row.revision)+'</strong><span>'+esc(date(row.changedAt))+'</span></div><p class="small muted">'+esc(actorName(row.actorId))+'</p><p>'+esc(row.reason)+'</p><dl class="attempt-meta">'+Object.keys(labels).map(task=>'<dt>'+esc(labels[task])+'</dt><dd>'+esc(modelText(row.selections[task],Object.values(row.adapters)))+'</dd>').join('')+'</dl></li>').join('')+'</ol>':entry.historyStatus==='ready'?'<p class="muted">No provider changes.</p>':'')+
      (entry.historyStatus==='loading'?'<p role="status">Loading provider history...</p>':entry.historyStatus==='error'?'<p class="local-error" role="alert">'+esc(entry.historyError)+'</p><button data-provider-action="history-retry">Retry loading</button>':entry.next?'<button data-provider-action="history-more">Load more</button>':'');
  }
  function renderHistory(){const node=document.querySelector('#provider-history-body');if(node){node.innerHTML=historyRows();node.setAttribute('aria-busy',String(state.historyStatus==='loading'));}}
  async function history(more=false){
    const entry=state;if(!isDeveloper()||!active()||entry?.status!=='ready'||entry.historyStatus==='loading'||more&&!entry.next)return;
    entry.historyStatus='loading';renderHistory();
    try{const data=await api(endpoint+'/history'+(more?'?before='+entry.next:''));if(!valid(entry))return;entry.history=more?[...entry.history,...data.changes]:data.changes;entry.next=data.next;entry.historyStatus='ready';}
    catch(error){if(!valid(entry))return;entry.historyStatus='error';entry.historyError=error.message;entry.retryMore=more;}
    if(active())renderHistory();
  }
  async function save(form){
    const entry=state;if(!writable()||!isDeveloper()||!active()||entry?.status!=='ready'||entry.saving||!form.reportValidity())return;
    const selections=patch(),reason=entry.reason.trim();if(!reason||!Object.keys(selections).length)return;
    entry.saving=true;const controls=[...form.querySelectorAll('select,textarea,button'),document.querySelector('[data-provider-action="refresh"]')].map(node=>({node,disabled:node.disabled}));controls.forEach(({node})=>node.disabled=true);
    const errorNode=document.querySelector('#provider-save-error');errorNode.hidden=true;
    try{await api(endpoint,{expectedRevision:entry.data.revision,selections,reason});if(!valid(entry))return;if(active()){await load();if(entry.epoch===sessionKey()&&isDeveloper()&&active())notify('Provider settings saved.');}}
    catch(error){if(!valid(entry)||!active())return;errorNode.textContent=error.message;errorNode.hidden=false;}
    finally{entry.saving=false;controls.filter(({node})=>node.isConnected).forEach(({node,disabled})=>node.disabled=disabled);if(active()&&state?.status==='ready')updateSave();}
  }
  function render(){
    if(!isDeveloper())return '';
    const entry=state;
    if(!entry||entry.status==='loading')return '<p role="status">Loading provider settings...</p>';
    if(entry.status==='error')return '<p class="local-error" role="alert">'+esc(entry.error)+'</p><button data-provider-action="refresh">Retry loading</button>';
    const data=entry.data;
    const hasUnsaved=Object.keys(patch()).length>0;

    return '<section class="provider-panel ai-providers-page">' +
      '<div class="ai-providers-header">' +
        '<div class="ai-providers-title-group">' +
          '<h1>AI Providers</h1>' +
          '<p class="ai-providers-subtitle">Configure and manage external AI services for speech, text, and analysis</p>' +
        '</div>' +
        '<div class="ai-providers-header-badge">' +
          '<span class="badge-dot-green"></span> Active Configuration' +
        '</div>' +
      '</div>' +

      '<div class="ai-providers-card saas-card">' +
        '<div class="ai-card-header">' +
          '<div class="ai-card-title-group">' +
            '<h2>Service selections</h2>' +
          '</div>' +
          '<div class="ai-card-actions">' +
            '<span class="ai-unsaved-badge"' + (hasUnsaved ? '' : ' hidden') + '>UNSAVED CHANGES</span>' +
            '<button type="button" class="quota-refresh ai-refresh-btn" data-provider-action="refresh" aria-label="Refresh providers" title="Refresh providers">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<dl class="attempt-meta ai-meta-grid">' +
          '<dt class="ai-meta-label">Settings revision</dt><dd class="ai-meta-val">' + esc(data.revision) + '</dd>' +
          '<dt class="ai-meta-label">Billing policy</dt><dd class="ai-meta-val">' + esc(data.freeOnly ? 'Free-only' : 'Server configured') + '</dd>' +
          '<dt class="ai-meta-label">Worker connection</dt><dd class="ai-meta-val">' + esc(connectionLabel) + '</dd>' +
        '</dl>' +

        '<form id="provider-settings-form" class="ai-providers-form">' +
          '<div class="ai-tasks-list">' +
            Object.keys(labels).map(task => {
              const options = choices(data, task), selection = entry.draft[task], unavailable = data.unavailable.some(row => row.task === task);
              const info = selection === null && !options.length ? 'No registered adapters' : unavailable ? 'Saved model requires confirmation' : modelText(selection, data.adapters);
              return '<div class="ai-task-row">' +
                '<div class="ai-task-info">' +
                  '<label class="ai-task-name" for="provider-' + task + '">' + esc(labels[task]) + '</label>' +
                  '<div class="ai-task-tag-wrap">' +
                    '<span class="ai-tech-tag" data-provider-info="' + task + '">' + esc(info) + '</span>' +
                  '</div>' +
                '</div>' +
                '<div class="ai-task-select-wrap">' +
                  '<select id="provider-' + task + '" class="saas-control ai-select" data-provider-task="' + task + '"' + (!options.length && selection === null ? ' disabled' : '') + '>' +
                    '<option value="off"' + (selection === null ? ' selected' : '') + '>Off</option>' +
                    (selection !== null && (unavailable || !options.some(row => same(row.selection, selection))) ? '<option value="saved" selected disabled>Unavailable · ' + esc(selection.adapterId) + '</option>' : '') +
                    options.map((row, i) => '<option value="' + i + '"' + (!unavailable && same(selection, row.selection) ? ' selected' : '') + '>' + esc(modelText(row.selection, [row.adapter])) + '</option>').join('') +
                  '</select>' +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>' +

          '<div class="ai-unsaved-banner"' + (hasUnsaved ? '' : ' hidden') + '>' +
            '<div class="ai-unsaved-text"><span class="warn-dot">●</span> You have unsaved changes to your provider configuration.</div>' +
            '<div class="ai-unsaved-actions">' +
              '<button type="button" class="btn ghost ai-btn-discard" data-provider-action="discard-draft">Discard</button>' +
              '<button type="button" class="btn primary ai-btn-save-banner" data-provider-action="submit-banner" disabled>Save changes</button>' +
            '</div>' +
          '</div>' +

          '<div class="ai-reason-section">' +
            '<label class="provider-reason" for="provider-reason">Reason' +
              '<textarea id="provider-reason" name="reason" class="saas-control" maxlength="500" placeholder="Describe the reason for this configuration change..." required>' + esc(entry.reason) + '</textarea>' +
            '</label>' +
          '</div>' +

          '<div class="ai-info-callout">' +
            '<span class="info-icon" aria-hidden="true">ℹ️</span>' +
            '<span class="info-text">Provider changes require developer role and take effect immediately across all active sessions upon confirmation.</span>' +
          '</div>' +

          '<p id="provider-save-error" class="local-error" role="alert" hidden></p>' +

          '<div class="ai-form-actions-footer">' +
            '<button type="submit" class="btn primary ai-submit-btn" disabled>Save settings</button>' +
          '</div>' +
        '</form>' +
      '</div>' +

      '<details id="provider-history" class="provider-history-accordion saas-card">' +
        '<summary class="saas-card-header"><strong>Settings history</strong></summary>' +
        '<div id="provider-history-body">' + historyRows() + '</div>' +
      '</details>' +
    '</section>';
  }
  document.addEventListener('change',event=>{
    const task=event.target.dataset?.providerTask;if(!task||!isDeveloper()||!active()||state?.status!=='ready'||state.saving)return;
    const options=choices(state.data,task),value=event.target.value;
    if(value!=='off'&&!options[Number(value)])return;
    state.draft[task]=value==='off'?null:structuredClone(options[Number(value)].selection);state.touched.add(task);
    const infoNode=document.querySelector('[data-provider-info="'+task+'"]');
    if(infoNode)infoNode.textContent=modelText(state.draft[task],state.data.adapters);
    updateSave();
  });
  document.addEventListener('input',event=>{if(event.target.id==='provider-reason'&&isDeveloper()&&active()&&state?.status==='ready'){state.reason=event.target.value;updateSave();}});
  document.addEventListener('submit',event=>{if(event.target.id==='provider-settings-form'){event.preventDefault();save(event.target);}});
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-provider-action]');if(!button||!isDeveloper()||!active()||state?.saving)return;
    const action=button.dataset.providerAction;
    if(action==='refresh')load();
    else if(action==='submit-banner'){
      document.querySelector('#provider-settings-form')?.requestSubmit();
    }
    else if(action==='discard-draft'){
      state.draft=structuredClone(state.data.selections);
      state.touched.clear();
      renderPage();
    }
    else history(action==='history-more'||state.retryMore);
  });
  document.addEventListener('toggle',event=>{if(event.target.id==='provider-history'&&event.target.isConnected){expanded=event.target.open;if(expanded&&state?.historyStatus==='idle')history();}},true);
  return {load,render,reset(){state=null;expanded=false;},afterRender(){const node=document.querySelector('#provider-history');if(node){node.open=expanded;if(expanded&&state.historyStatus==='idle')history();}if(state?.status==='ready')updateSave();if(!writable())document.querySelectorAll('#provider-settings-form select,#provider-settings-form textarea').forEach(node=>node.disabled=true);}};
}
