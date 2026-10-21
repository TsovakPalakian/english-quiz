const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={queued:'Queued for check',running:'Checking',teacher_review:'Awaiting teacher decision',attention:'Needs teacher attention',stale:'Revision changed',paused:'Paused',approved:'Teacher approved'};
const issues={quota_exceeded:'Shared request quota exhausted.',quota_unavailable:'Request quota unavailable.',review_not_configured:'Checker is off or unavailable.',interrupted:'Check interrupted.',timeout:'Check timed out.',cancelled:'Check cancelled.',access_changed:'Requester access changed.',revision_changed:'The quiz changed; this automatic task is no longer current.',review_conflict:'Another check or edit changed this task.',pipeline_unavailable:'Preparation could not finish.',awaiting_result:'Waiting for the saved check result.'};
export function createPreparationPipelineUI({api,isTeacher,isDeveloper,sessionKey,active,renderPage,date}){
  let state=null,saving=false;const histories=new Map(),expanded=new Set();
  const valid=epoch=>epoch===sessionKey()&&isTeacher()&&active();
  async function load(){
    if(!isTeacher())return;const epoch=sessionKey();
    try{const data=await api('/local/pipeline');if(!valid(epoch))return;
      if(!state?.data)state={data,draft:data.enabled,reason:'',dirty:false};else{state.data=data;state.error=null;if(!state.dirty)state.draft=data.enabled;}
    }catch(error){if(valid(epoch)){state=state||{};state.error=error.message;}}
  }
  const job=id=>state?.data?.jobs.find(row=>row.id===id);
  function rows(id){
    const entry=histories.get(id);if(!entry||entry.loading)return '<p role="status">Loading preparation history...</p>';
    return (entry.events||[]).map(event=>'<div class="history-event"><strong>'+esc(labels[event.state]||event.state)+'</strong><p class="small muted">'+esc(date(event.changedAt))+' · Revision '+event.revision+'</p>'+(event.issue?'<p>'+esc(issues[event.issue]||'Check needs teacher review.')+'</p>':'')+'</div>').join('')+
      (entry.error?'<p class="local-error" role="alert">'+esc(entry.error)+'</p><button data-pipeline-action="history" data-job="'+id+'">Retry loading</button>':entry.next?'<button data-pipeline-action="more" data-job="'+id+'">Load more</button>':'');
  }
  async function history(id,more=false){
    if(!job(id)||!isTeacher()||!active())return;const old=histories.get(id);if(old?.loading||more&&!old?.next)return;
    const entry={events:more?old.events:[],loading:true,revision:job(id).revision},epoch=sessionKey();histories.set(id,entry);paintHistory(id);
    try{const data=await api('/local/pipeline/'+id+'/history'+(more?'?before='+old.next:''));if(!valid(epoch)||histories.get(id)!==entry)return;entry.events.push(...data.events);entry.next=data.next;}
    catch(error){if(valid(epoch)&&histories.get(id)===entry)entry.error=error.message;}
    finally{entry.loading=false;if(valid(epoch)&&histories.get(id)===entry)paintHistory(id);}
  }
  function paintHistory(id){const node=document.querySelector('[data-pipeline-history-body="'+id+'"]');if(node)node.innerHTML=rows(id);}
  function header(){
    if(!isTeacher())return '';
    if(state?.error)return '<section><h2>Automatic checks</h2><p class="local-error" role="alert">'+esc(state.error)+'</p><button data-pipeline-action="refresh">Refresh chain</button></section>';
    if(!state?.data)return '';
    return '<section class="pipeline-settings"><div class="quota-heading"><h2>Automatic checks · '+(state.data.enabled?'On':'Off')+'</h2><button class="quota-refresh" data-pipeline-action="refresh" aria-label="Refresh chain settings" title="Refresh chain settings"'+(saving?' disabled':'')+'>&#8635;</button></div>'+(isDeveloper()?'<form id="pipeline-settings-form"><label class="check"><input type="checkbox" name="enabled"'+(state.draft?' checked':'')+(saving?' disabled':'')+'>After generation</label><label>Reason<input name="reason" maxlength="500" required value="'+esc(state.reason)+'"'+(saving?' disabled':'')+'></label><p data-pipeline-save-error class="local-error" role="alert" hidden></p><button type="submit"'+(!state.dirty||!state.reason.trim()||saving?' disabled':'')+'>Save chain settings</button></form>':'')+'</section>';
  }
  async function save(form){
    if(saving||!isDeveloper()||!active()||!state?.dirty||!form.reportValidity())return;
    const epoch=sessionKey();saving=true;form.querySelectorAll('input,button').forEach(node=>node.disabled=true);
    try{await api('/local/pipeline',{expectedRevision:state.editRevision,enabled:state.draft,reason:state.reason});if(!valid(epoch)||!isDeveloper())return;state.dirty=false;state.reason='';await load();saving=false;if(valid(epoch))renderPage();}
    catch(error){if(valid(epoch)&&isDeveloper()){const node=form.querySelector('[data-pipeline-save-error]');node.textContent=error.message;node.hidden=false;}}
    finally{saving=false;if(form.isConnected)form.querySelectorAll('input,button').forEach(node=>node.disabled=false);}
  }
  document.addEventListener('input',event=>{if(event.target.closest('#pipeline-settings-form')&&state&&!saving){state.reason=event.target.closest('form').elements.reason.value;event.target.closest('form').querySelector('[type="submit"]').disabled=!state.dirty||!state.reason.trim();}});
  document.addEventListener('change',event=>{if(event.target.matches('#pipeline-settings-form [name="enabled"]')&&isDeveloper()&&state&&!saving){if(!state.dirty)state.editRevision=state.data.revision;state.draft=event.target.checked;state.dirty=state.draft!==state.data.enabled;event.target.closest('form').querySelector('[type="submit"]').disabled=!state.dirty||!state.reason.trim();}});
  document.addEventListener('submit',event=>{if(event.target.id==='pipeline-settings-form'){event.preventDefault();save(event.target);}});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-pipeline-action]');if(!button||!isTeacher()||!active()||saving)return;if(button.dataset.pipelineAction==='refresh'){const epoch=sessionKey();if(state){state.dirty=false;state.reason='';}load().then(()=>{if(valid(epoch))renderPage();});return;}history(button.dataset.job,button.dataset.pipelineAction==='more');});
  document.addEventListener('toggle',event=>{if(!event.target.isConnected||!event.target.matches('[data-pipeline-history]')||!isTeacher())return;const id=event.target.dataset.pipelineHistory;if(event.target.open){expanded.add(id);if(!histories.has(id))history(id);}else expanded.delete(id);},true);
  return {load,header,pending:()=>!!state?.data?.jobs.some(row=>['queued','running'].includes(row.status)),reset(){state=null;saving=false;histories.clear();expanded.clear();},item(q){
    if(!isTeacher()||!active())return '';const row=state?.data?.jobs.find(value=>value.versionId===q.id);if(!row)return '';
    return '<details class="attempt-history" data-expand="pipeline-'+row.id+'"><summary><strong>Preparation chain · '+esc(labels[row.status]||row.status)+'</strong></summary>'+(row.issue?'<p>'+esc(issues[row.issue]||'Check needs teacher review.')+'</p>':'')+'<details data-pipeline-history="'+row.id+'"'+(expanded.has(row.id)?' open':'')+'><summary><strong>Preparation history</strong></summary><div data-pipeline-history-body="'+row.id+'">'+rows(row.id)+'</div></details></details>';
  },afterRender(){for(const id of expanded){const row=job(id),cached=histories.get(id);if(row&&(!cached||!cached.loading&&cached.revision!==row.revision))history(id);}}};
}
