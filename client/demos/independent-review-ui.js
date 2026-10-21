// Synthetic preview only. Model checks never grant teacher approval.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dimensions={meaning:'Meaning',naturalness:'Naturalness',grammar:'Grammar',translation:'Translation',level:'Level',ambiguity:'Ambiguity',explanation:'Explanation'};
const statuses={checked:'No model findings',needs_attention:'Needs attention',incomplete:'Not fully assessed'};
const deadlineDate=value=>Number.isFinite(value)?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Yerevan',dateStyle:'medium',timeStyle:'medium'}).format(new Date(value)):'Not reported';
const errors={review_not_configured:'Independent checker is off or unavailable. Ask the developer to select a checker.',quota_exceeded:'Shared request quota exhausted. No checker call was made.',quota_unavailable:'Request quota unavailable. No checker call was made.',timeout:'Check timed out.',interrupted:'Check interrupted: the waiting period expired. No result was accepted.',cancelled:'Check cancelled.',review_refused:'Checker declined this quiz.',invalid_review_response:'Checker returned an invalid report.',stale_review_response:'Checker returned a report for another revision.',review_unavailable:'Checker unavailable.'};
export function createIndependentReviewUI({api,isTeacher,sessionKey,getQuiz,date}){
  const cache=new Map(),expanded=new Set();
  function state(q){
    let value=cache.get(q.id);
    if(!value||value.revision!==q.revision){value={revision:q.revision,level:null,status:'idle',attempts:[],next:null};cache.set(q.id,value);}
    return value;
  }
  const valid=(id,entry,epoch)=>isTeacher()&&sessionKey()===epoch&&cache.get(id)===entry&&getQuiz(id)?.revision===entry.revision;
  const node=id=>document.querySelector('[data-independent-body="'+id+'"]');
  const path=(id,entry,more=false)=>'/local/quizzes/'+id+'/independent?limit=10'+(entry.level?'&level='+entry.level:'')+(more?'&before='+entry.next:'');
  function report(attempt){
    if(attempt.state==='pending')return '<p class="muted">Pending · waiting until '+esc(deadlineDate(attempt.expiresAt))+'.</p>';
    if(attempt.error)return '<p class="local-error">'+esc(errors[attempt.error]||'Check failed.')+'</p>';
    const result=attempt.result;
    return '<p class="muted">'+esc(attempt.current?statuses[result.status]:'Outdated · run a new check')+'</p><p class="small muted">'+esc(result.source.model)+' · '+esc(result.source.provider)+' · '+esc(result.source.version)+'</p>'+
      '<dl class="independent-dimensions">'+Object.entries(dimensions).map(([key,label])=>'<dt>'+label+'</dt><dd>'+esc({pass:'No finding',issue:'Finding',not_assessed:'Not assessed'}[result.dimensions[key]])+'</dd>').join('')+'</dl>'+
      result.findings.map(finding=>'<blockquote class="feedback"><strong>'+esc(dimensions[finding.dimension])+' · '+esc(finding.severity)+(finding.itemIndex===null?'':' · Item '+(finding.itemIndex+1))+'</strong><p>'+esc(finding.message)+'</p><p>'+esc(finding.suggestion)+'</p></blockquote>').join('');
  }
  function contents(entry,id){
    const latest=entry.attempts[0];
    const waiting=entry.running||entry.status==='loading'||entry.loadingMore;
    const pending=latest?.state==='pending'&&latest.revision===entry.revision;
    const blocked=entry.quotaReady!==true||entry.quota?.remaining===0||!!entry.quotaError;
    const quota=entry.quota?'<p class="'+(entry.quota.remaining===0?'local-error':'muted')+'" data-independent-quota>Shared requests remaining: '+esc(entry.quota.remaining)+' / '+esc(entry.quota.requestLimit)+' · Renews '+esc(deadlineDate(entry.quota.windowEnd))+'</p>':'';
    return '<p class="small muted">Synthetic report · Not teacher approval</p>'+quota+(entry.quotaError?'<p class="local-error" role="alert">'+esc(entry.quotaError)+'</p>':'')+'<div class="independent-controls"><label>Target CEFR<select data-independent-level'+(waiting?' disabled':'')+'><option value="">Not specified</option>'+['A1','A2','B1','B2','C1','C2'].map(level=>'<option'+(entry.level===level?' selected':'')+'>'+level+'</option>').join('')+'</select></label><button data-independent-action="run"'+(waiting||pending||blocked?' disabled':'')+'>'+(entry.running?'Checking...':'Run synthetic check')+'</button>'+(latest?.canRetry?'<button data-independent-action="retry"'+(waiting||blocked?' disabled':'')+'>Retry check · '+(2-latest.retryCount)+' left</button>':'')+'<button data-independent-action="refresh" aria-label="Refresh independent check" title="Refresh independent check"'+(waiting?' disabled':'')+'>&#8635;</button></div>'+
      (entry.running?'<p role="status">Checking this revision...</p>':'')+(entry.status==='loading'?'<p role="status">Loading checks...</p>':'')+
      (entry.error?'<p class="local-error" role="alert">'+esc(entry.error)+'</p>':'')+
      (latest?'<div data-independent-latest>'+report(latest)+'</div>':entry.status==='ready'?'<p class="muted">No independent checks.</p>':'')+
      '<details data-independent-history'+(expanded.has(id)?' open':'')+'><summary><strong>Independent check history</strong></summary><ol class="attempt-list">'+entry.attempts.map(attempt=>'<li class="attempt-entry"><p class="small muted">'+esc(date(attempt.requestedAt))+' · Revision '+attempt.revision+(attempt.retryOf?' · Retry '+attempt.retryCount+' / 2':'')+'</p>'+report(attempt)+'</li>').join('')+'</ol>'+(entry.next?'<button data-independent-action="more"'+(entry.loadingMore?' disabled':'')+'>Load more</button>':'')+'</details>';
  }
  function paint(id,entry){const target=node(id);if(!target)return;const open=target.querySelector('[data-independent-history]')?.open;target.innerHTML=contents(entry,id);target.querySelector('[data-independent-history]').open=open??expanded.has(id);}
  async function load(id,more=false){
    const q=getQuiz(id);if(!isTeacher()||!q)return;
    const entry=state(q),epoch=sessionKey();if(entry.running||entry.status==='loading'||entry.loadingMore||more&&!entry.next)return;
    if(more)entry.loadingMore=true;else entry.status='loading';entry.error=null;paint(id,entry);
    if(!more)entry.quotaReady=false;
    try{const [data,quota]=await Promise.all([api(path(id,entry,more)),more?null:api('/local/review-quota').then(value=>({value}),error=>({error:error.message}))]);if(!valid(id,entry,epoch))return;
      entry.attempts=more?[...entry.attempts,...data.attempts]:data.attempts;entry.next=data.next;entry.status='ready';
      if(quota){entry.quota=quota.value??null;entry.quotaError=quota.error??null;entry.quotaReady=!!quota.value;}
    }catch(error){if(!valid(id,entry,epoch))return;entry.error=error.message;entry.status='error';}
    finally{entry.loadingMore=false;if(valid(id,entry,epoch))paint(id,entry);}
  }
  async function run(id,retry=false){
    const q=getQuiz(id);if(!isTeacher()||!q)return;
    const entry=state(q),epoch=sessionKey();if(entry.running||entry.status==='loading'||entry.loadingMore)return;
    if(entry.quotaReady!==true||entry.quota?.remaining===0||entry.quotaError)return;
    const previous=entry.attempts[0];
    if(retry&&!previous?.canRetry||previous?.state==='pending'&&previous.revision===q.revision)return;
    entry.running=true;entry.error=null;paint(id,entry);
    try{await api('/local/quizzes/'+id+'/independent'+(retry?'/'+previous.id+'/retry':''),{expectedRevision:q.revision,...(retry?{}:{level:entry.level})});}
    catch(error){if(valid(id,entry,epoch))entry.error=error.message;}
    finally{entry.running=false;}
    if(!valid(id,entry,epoch))return;
    if(entry.error){paint(id,entry);return;}await load(id);
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-independent-action]'),panel=button?.closest('[data-independent]');if(!panel||!isTeacher())return;
    const action=button.dataset.independentAction;if(['run','retry'].includes(action))run(panel.dataset.independent,action==='retry');else load(panel.dataset.independent,action==='more');
  });
  document.addEventListener('change',event=>{
    if(!event.target.matches('[data-independent-level]')||!isTeacher())return;
    const id=event.target.closest('[data-independent]').dataset.independent,q=getQuiz(id);if(!q||state(q).running)return;
    cache.set(id,{revision:q.revision,level:event.target.value||null,status:'idle',attempts:[],next:null});load(id);
  });
  document.addEventListener('toggle',event=>{
    if(!event.target.isConnected||!isTeacher())return;
    if(event.target.matches('[data-independent-history]')){const id=event.target.closest('[data-independent]').dataset.independent;if(event.target.open)expanded.add(id);else expanded.delete(id);}
    if(event.target.matches('[data-independent]')&&event.target.open){const id=event.target.dataset.independent,q=getQuiz(id);if(q&&state(q).status==='idle')load(id);}
  },true);
  return {reset(){cache.clear();expanded.clear();},panel(q){
    if(!isTeacher()||!Number.isSafeInteger(q.revision))return '';
    return '<details class="independent-panel" data-independent="'+q.id+'" data-expand="independent-'+q.id+'"><summary><strong>Independent check</strong></summary><div data-independent-body="'+q.id+'">'+contents(state(q),q.id)+'</div></details>';
  },afterRender(){document.querySelectorAll('[data-independent][open]').forEach(panel=>{const q=getQuiz(panel.dataset.independent);if(q&&state(q).status==='idle')load(q.id);});}};
}
