// Local-only pilot. No imports into the app bundle; all requests stay on this origin.
import {defaultReviewItems,renderReviewItems,readReviewItems,editReviewItems,reviewItemPreview} from './review-editor.js';
import {createProviderSettingsUI} from './provider-settings.js';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={draft:'Draft',submitted:'Needs review',returned:'Changes requested',approved:'✓ Teacher checked'};
const types=['Flip','Choice','Type','Gap','Build','Match','True / false','Tap','Select all','Reverse','Spell','Letters','Listen','Definition','Odd one out','Memory','Hangman'];
let boot,view='word',contextId='',quizzes=[],shared=[],jobs=[],editing=null,decision=null,busy=false,noticeTimer,pollFailures=0;
let editorType='Gap';
const editorDrafts=new Map();
const expansion=new Map(),pending=new Map();
const attemptCache=new Map();let sessionEpoch=0;
let quotaState=null;
const developer=()=>boot?.actor.role==='DEVELOPER';
const teacher=()=>boot?.actor.role!=='USER';
const selected=()=>boot?.contexts.find(c=>c.id===contextId)||boot?.contexts[0];
const providerSettingsUI=createProviderSettingsUI({api,isDeveloper:developer,sessionKey:()=>sessionEpoch,active:()=>view==='providers',renderPage:render,notify:message,actorName:id=>boot?.roles.find(row=>row.id===id)?.name||id,date:value=>attemptDate(value)});
function message(text,error=false){clearTimeout(noticeTimer);$('#notice').textContent=text;$('#notice').classList.toggle('error',error);if(error&&$('#editor').open){$('#edit-error').hidden=false;$('#edit-error').textContent=text;}if(!error)noticeTimer=setTimeout(()=>$('#notice').textContent='',4500);}
async function api(path,payload){
  const options={};let pendingKey;
  if(payload!==undefined){
    pendingKey=(boot?.actor.id||'session')+path+JSON.stringify(payload);
    if(!pending.has(pendingKey))pending.set(pendingKey,{mutationId:crypto.randomUUID(),...payload});
    const data=path==='/local/session'?payload:pending.get(pendingKey);
    Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  }
  const response=await fetch(path,options),data=await response.json();
  if(!response.ok){if(response.status<500)pending.delete(pendingKey);throw new Error(data.error||'Local request failed.');}
  pending.delete(pendingKey);return data;
}
async function run(work){
  if(busy)return;busy=true;
  const buttons=[...document.querySelectorAll('button,select')].map(node=>({node,disabled:node.disabled}));buttons.forEach(({node})=>node.disabled=true);
  try{await work();}catch(error){message(error.message,true);}finally{busy=false;buttons.filter(({node})=>node.isConnected).forEach(({node,disabled})=>node.disabled=node.id==='account'?false:disabled);$('#edit-type').disabled=!!(editing?.id||editing?.repairJob);}
}
async function loadSession(){
  sessionEpoch++;attemptCache.clear();quotaState=null;providerSettingsUI.reset();
  if(view==='providers'){$('#content').innerHTML='';$('[data-view="providers"]').hidden=true;}
  if(view==='quota'){$('#content').innerHTML='';$('[data-view="quota"]').hidden=true;}
  boot=await api('/local/boot');
  $('#account').innerHTML=boot.roles.map(r=>'<option value="'+r.id+'" '+(r.id===boot.role?'selected':'')+'>'+esc(r.name)+' · '+esc(r.role)+'</option>').join('');
  if(!boot.contexts.some(c=>c.id===contextId))contextId=boot.contexts[0]?.id||'';
  if(view==='queue'&&!teacher())view='mine';await refresh();
}
async function refresh(){
  if(view==='providers'){
    if(!developer()){view='word';return refresh();}
    return providerSettingsUI.load();
  }
  if(view==='quota'){
    if(!developer()){view='word';return refresh();}
    return loadQuota();
  }
  const c=selected();shared=c?(await api('/local/shared/'+c.cardId)).quizzes.map(q=>({...q,state:'approved'})):[];
  quizzes=(await api(view==='queue'?'/local/queue':'/local/mine')).quizzes;
  jobs=teacher()?(await api('/local/generation')).jobs:[];
  render();
}
const jobLabels={queued:'Queued',running:'Preparing',retry:'Waiting to retry',review:'Needs teacher attention',submitted:'Sent for review',context:'Needs a word set',skipped:'Already approved'};
const jobIssues={invalid_content:'The generated content failed structural validation.',temporary_failure:'Temporary test-generator failure.',timeout:'The generator timed out.',audio_unavailable:'Audio preparation is not connected.',access_changed:'The requesting account no longer has access.',generator_failed:'The test generator could not complete this type.',attempt_limit:'The automatic attempt limit was reached.',write_conflict:'The saved state requires checking before another attempt.',quality_check_failed:'The candidate failed quality checks.',invalid_model_response:'The model response could not be validated.',quota_exceeded:'The quota or access check stopped preparation.',provider_not_configured:'The generator is not configured.',cancelled:'Preparation was cancelled.',worker_interrupted:'The worker stopped before completing this attempt.'};
const attemptStates={running:['Preparing','pending'],accepted:['Candidate prepared','ready'],rejected:['Rejected','failed'],error:['Failed','failed'],interrupted:['Interrupted','review']};
const attemptDate=value=>Number.isFinite(value)?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Yerevan',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Not reported';
async function loadQuota(){
  if(!developer())return;
  const epoch=sessionEpoch,entry={status:'loading',rows:[],historyStatus:'idle',next:null,changes:[],changesStatus:'idle',changesNext:null};quotaState=entry;render();
  try{const data=await api('/local/quota');if(epoch!==sessionEpoch||quotaState!==entry||!developer())return;Object.assign(entry,{status:'ready',summary:data});}
  catch(error){if(epoch!==sessionEpoch||quotaState!==entry||!developer())return;Object.assign(entry,{status:'error',error:error.message});}
  if(view==='quota')render();
}
async function loadQuotaHistory(more=false){
  const entry=quotaState;
  if(!developer()||view!=='quota'||entry?.status!=='ready'||entry.historyStatus==='loading'||more&&!entry.next)return;
  const epoch=sessionEpoch;entry.historyStatus='loading';renderQuotaHistory();
  try{
    const data=await api('/local/quota/history'+(more?'?cursor='+encodeURIComponent(entry.next):''));
    if(epoch!==sessionEpoch||quotaState!==entry||!developer())return;
    entry.rows=more?[...entry.rows,...data.reservations]:data.reservations;entry.next=data.next;entry.historyStatus='ready';
  }catch(error){if(epoch!==sessionEpoch||quotaState!==entry||!developer())return;entry.historyStatus='error';entry.historyError=error.message;entry.retryMore=more;}
  if(view==='quota')renderQuotaHistory();
}
function quotaHistoryRows(){
  const entry=quotaState,states={reserved:'Reserved',started:'Started',released:'Released'};
  return (entry.rows.length?'<ol class="attempt-list">'+entry.rows.map(row=>'<li class="attempt-entry"><div class="attempt-heading"><strong>'+esc(states[row.state]||'Unknown')+'</strong><span>'+esc(attemptDate(row.createdAt))+'</span></div><dl class="attempt-meta"><dt>Reservation</dt><dd>'+esc(row.id)+'</dd><dt>Model</dt><dd>'+esc(row.source.model)+'</dd><dt>Provider</dt><dd>'+esc(row.source.provider)+'</dd><dt>Version</dt><dd>'+esc(row.source.version)+'</dd><dt>Settings revision</dt><dd>'+esc(row.source.configurationRevision)+'</dd><dt>Window start</dt><dd>'+esc(attemptDate(row.windowStart))+'</dd><dt>Updated</dt><dd>'+esc(attemptDate(row.changedAt))+'</dd></dl></li>').join('')+'</ol>':entry.historyStatus==='ready'?'<p class="muted">No reservations.</p>':'')+
    (entry.historyStatus==='loading'?'<p role="status">Loading reservations...</p>':entry.historyStatus==='error'?'<p class="local-error" role="alert">'+esc(entry.historyError)+'</p><button data-action="quota-history-retry">Retry loading</button>':entry.next?'<button data-action="quota-history-more">Load more</button>':'');
}
function renderQuotaHistory(){const node=$('#quota-history-body');if(!node)return;node.innerHTML=quotaHistoryRows();node.setAttribute('aria-busy',String(quotaState.historyStatus==='loading'));}
async function loadQuotaChanges(more=false){
  const entry=quotaState;if(!developer()||view!=='quota'||entry?.status!=='ready'||entry.changesStatus==='loading'||more&&!entry.changesNext)return;
  const epoch=sessionEpoch;entry.changesStatus='loading';renderQuotaChanges();
  try{
    const data=await api('/local/quota/changes'+(more?'?before='+entry.changesNext:''));
    if(epoch!==sessionEpoch||quotaState!==entry||!developer())return;
    entry.changes=more?[...entry.changes,...data.changes]:data.changes;entry.changesNext=data.next;entry.changesStatus='ready';
  }catch(error){if(epoch!==sessionEpoch||quotaState!==entry||!developer())return;entry.changesStatus='error';entry.changesError=error.message;entry.retryChangesMore=more;}
  if(view==='quota')renderQuotaChanges();
}
function quotaChangeRows(){
  const entry=quotaState;
  return (entry.changes.length?'<ol class="attempt-list">'+entry.changes.map(row=>'<li class="attempt-entry"><div class="attempt-heading"><strong>Revision '+esc(row.revision)+' · '+esc(row.oldLimit)+' → '+esc(row.newLimit)+'</strong><span>'+esc(attemptDate(row.changedAt))+'</span></div><p class="small muted">'+esc(boot.roles.find(actor=>actor.id===row.actorId)?.name||row.actorId)+'</p><p>'+esc(row.reason)+'</p></li>').join('')+'</ol>':entry.changesStatus==='ready'?'<p class="muted">No limit changes.</p>':'')+
    (entry.changesStatus==='loading'?'<p role="status">Loading limit changes...</p>':entry.changesStatus==='error'?'<p class="local-error" role="alert">'+esc(entry.changesError)+'</p><button data-action="quota-changes-retry">Retry loading</button>':entry.changesNext?'<button data-action="quota-changes-more">Load more</button>':'');
}
function renderQuotaChanges(){const node=$('#quota-changes-body');if(!node)return;node.innerHTML=quotaChangeRows();node.setAttribute('aria-busy',String(quotaState.changesStatus==='loading'));}
function updateQuotaSaveButton(){
  const form=$('#quota-limit-form');if(!form)return;
  const limit=Number(form.elements.requestLimit.value);
  form.querySelector('button').disabled=!developer()||quotaState?.saving||!Number.isSafeInteger(quotaState?.summary?.revision)||!Number.isSafeInteger(limit)||limit<1||limit>1000000||limit===quotaState.summary.requestLimit||!form.elements.reason.value.trim();
}
async function saveQuotaLimit(form){
  const entry=quotaState;if(!developer()||entry?.status!=='ready'||!Number.isSafeInteger(entry.summary.revision)||entry.saving||!form.reportValidity())return;
  const requestLimit=Number(form.elements.requestLimit.value),reason=form.elements.reason.value.trim();
  if(!reason||requestLimit===entry.summary.requestLimit)return;
  const epoch=sessionEpoch;entry.saving=true;
  const controls=[...form.querySelectorAll('input,textarea,button'),$('[data-action="quota-refresh"]')];controls.forEach(node=>node.disabled=true);$('#quota-save-error').hidden=true;
  try{
    await api('/local/quota',{expectedRevision:entry.summary.revision,requestLimit,reason});
    if(epoch!==sessionEpoch||quotaState!==entry||!developer())return;
    if(view==='quota'){await loadQuota();message('Request limit saved.');}
  }catch(error){
    if(epoch!==sessionEpoch||quotaState!==entry||!developer()||view!=='quota')return;
    const node=$('#quota-save-error');if(node){node.textContent=error.message;node.hidden=false;}
  }finally{entry.saving=false;controls.filter(node=>node.isConnected).forEach(node=>node.disabled=false);updateQuotaSaveButton();}
}
function quotaPanel(){
  const entry=quotaState;
  if(!entry||entry.status==='loading')return '<p role="status">Loading quota...</p>';
  if(entry.status==='error')return '<p class="local-error" role="alert">'+esc(entry.error)+'</p><button data-action="quota-refresh">Retry loading</button>';
  const q=entry.summary;
  return '<section class="quota-panel"><div class="quota-heading"><h2>Local fixture</h2><button data-action="quota-refresh" class="quota-refresh" aria-label="Refresh quota" title="Refresh quota">&#8635;</button></div><p class="muted">Request quota · '+esc(q.provider)+'</p><dl class="quota-counts"><div><dt>Remaining</dt><dd>'+esc(q.remaining)+'</dd></div><div><dt>Used / reserved</dt><dd>'+esc(q.used)+'</dd></div><div><dt>Limit</dt><dd>'+esc(q.requestLimit)+'</dd></div></dl><p class="'+(q.remaining===0?'local-error':'muted')+'">'+(q.remaining===0?'Quota exhausted':'Quota available')+'</p><dl class="attempt-meta"><dt>Window start</dt><dd>'+esc(attemptDate(q.windowStart))+'</dd><dt>Window end</dt><dd>'+esc(attemptDate(q.windowEnd))+'</dd><dt>Time zone</dt><dd>Asia/Yerevan</dd><dt>Settings revision</dt><dd>'+esc(q.revision??'Not reported')+'</dd></dl><form id="quota-limit-form"><h3>Request limit</h3><label>Requests per window<input type="number" name="requestLimit" min="1" max="1000000" step="1" value="'+esc(q.requestLimit)+'" required></label><label>Reason<textarea name="reason" maxlength="500" required></textarea></label><p id="quota-save-error" class="local-error" role="alert" hidden></p><button type="submit"'+(!Number.isSafeInteger(q.revision)?' disabled':'')+'>Save limit</button></form><details id="quota-changes" data-expand="quota-changes"><summary><strong>Limit changes</strong></summary><div id="quota-changes-body">'+quotaChangeRows()+'</div></details><details id="quota-history" data-expand="quota-history"><summary><strong>Reservation history</strong></summary><div id="quota-history-body" aria-busy="'+(entry.historyStatus==='loading')+'">'+quotaHistoryRows()+'</div></details></section>';
}
const attemptTokens=(usage,key)=>Number.isSafeInteger(usage?.[key])?String(usage[key]):'Not reported';
function attemptRows(rows){
  if(!rows.length)return '<p class="muted small">No attempts recorded.</p>';
  return '<ol class="attempt-list">'+rows.map(row=>{
    const [label,color]=attemptStates[row.state]||['Unknown status','pending'],source=row.source;
    return '<li class="attempt-entry"><div class="attempt-heading"><strong>Cycle '+esc(row.cycle+1)+' · Attempt '+esc(row.attempt)+'</strong><span class="status '+color+'">'+label+'</span></div>'+
      '<dl class="attempt-meta"><dt>Started</dt><dd>'+esc(attemptDate(row.startedAt))+'</dd><dt>Finished</dt><dd>'+esc(row.finishedAt===null?(row.state==='running'?'In progress':'Not reported'):attemptDate(row.finishedAt))+'</dd>'+
      '<dt>Provider</dt><dd>'+esc(source?.provider||'Not reported')+'</dd><dt>Model</dt><dd>'+esc(source?.model||'Not reported')+'</dd>'+
      '<dt>Version</dt><dd>'+esc(source?.version||'Not reported')+'</dd><dt>Settings revision</dt><dd>'+esc(source?.configurationRevision??'Not reported')+'</dd></dl>'+
      '<dl class="attempt-tokens">'+[['Input tokens','prompt_tokens'],['Output tokens','completion_tokens'],['Total tokens','total_tokens']].map(([title,key])=>'<div><dt>'+title+'</dt><dd>'+esc(attemptTokens(row.usage,key))+'</dd></div>').join('')+'</dl>'+
      (row.issue?'<p class="small attempt-issue">'+esc(jobIssues[row.issue]||'Preparation needs checking.')+'</p>':'')+'</li>';
  }).join('')+'</ol>';
}
function attemptPane(job){
  const cached=attemptCache.get(job.id);
  if(cached?.revision===job.revision){
    if(cached.state==='ready')return attemptRows(cached.rows);
    if(cached.state==='error')return '<p class="local-error small" role="alert">'+esc(cached.error)+'</p><button data-action="reload-attempts" data-job-id="'+job.id+'">Retry loading</button>';
  }
  return '<p class="muted small" role="status">Loading attempts...</p>';
}
function updateAttemptPane(job){
  const node=$('[data-attempt-body="'+job.id+'"]');if(!node)return;
  node.innerHTML=attemptPane(job);node.setAttribute('aria-busy',String(attemptCache.get(job.id)?.state==='loading'));
}
async function loadAttempts(id,force=false){
  if(!teacher())return;const job=jobs.find(row=>row.id===id);if(!job)return;
  const existing=attemptCache.get(id);
  if(existing?.revision===job.revision&&(!force||existing.state==='loading'))return;
  const epoch=sessionEpoch,entry={revision:job.revision,state:'loading'};attemptCache.set(id,entry);updateAttemptPane(job);
  try{
    const {attempts}=await api('/local/generation/'+id+'/attempts');
    if(!Array.isArray(attempts))throw new Error('Attempt history is unavailable.');
    if(epoch!==sessionEpoch||attemptCache.get(id)!==entry||!jobs.some(row=>row.id===id&&row.revision===entry.revision))return;
    entry.rows=attempts;entry.state='ready';
  }catch(error){
    if(epoch!==sessionEpoch||attemptCache.get(id)!==entry||!jobs.some(row=>row.id===id&&row.revision===entry.revision))return;
    entry.state='error';entry.error=error.message;
  }
  updateAttemptPane(job);
}
function generationRows(list){return list.map(job=>{
  const replacement=job.state==='review'&&job.versionId,approved=replacement&&job.quizState==='approved';
  const label=replacement?(approved?'Replacement approved':job.quizState==='submitted'?'Replacement under review':job.quizState==='returned'?'Replacement needs changes':'Manual draft created'):jobLabels[job.state];
  return '<details class="generation-job" data-job="'+job.id+'" data-job-state="'+job.state+'" data-expand="job-'+job.id+'"><summary><strong>'+esc(job.type)+'</strong><span class="status '+(approved?'approved':['review','submitted'].includes(job.state)?'review':'pending')+'">'+label+'</span></summary><div class="detail"><p class="muted small">Attempts: '+job.attempts+' / 3 · Manual retries: '+job.cycle+' / 2</p>'+(job.issue?'<p>'+esc(jobIssues[job.issue]||'Preparation needs checking.')+'</p>':'')+(job.state==='context'?'<p class="muted">A word set and an explicit grouping rule are needed.</p>':'')+'<div class="actions">'+(job.state==='review'&&!job.versionId?'<button data-action="repair-job" data-job-id="'+job.id+'">Create corrected draft</button>':'')+(job.state==='review'&&!job.versionId&&job.cycle<2?'<button data-action="retry-job" data-job-id="'+job.id+'">Retry preparation</button>':'')+(job.versionId?'<button data-action="open-generated" data-job-id="'+job.id+'">Open linked quiz</button>':'')+'</div><details class="attempt-history" data-attempt-history="'+job.id+'" data-expand="attempts-'+job.id+'"><summary><strong>Attempt history</strong></summary><div data-attempt-body="'+job.id+'">'+attemptPane(job)+'</div></details></div></details>';
}).join('');}
function generationPanel(){
  const c=selected();
  if(!teacher())return '';
  if(view==='word'&&c&&!c.personal){const list=jobs.filter(j=>j.groupId===c.groupId&&j.lessonId===c.lessonId&&j.senseId===c.senseId);return '<section><div class="section-heading"><h2>Preparation</h2><button data-action="prepare">Prepare missing types</button></div><p class="muted small">Local test generator · No AI requests · Prepared drafts still need teacher approval</p>'+generationRows(list)+'</section>';}
  if(view==='queue'){
    const list=jobs.filter(j=>j.state==='review'&&j.quizState!=='approved');
    return '<section><h2>Preparation issues · '+list.length+'</h2>'+groupBy(list,j=>j.groupId).map(([id,entries])=>'<details class="queue-group" open><summary><strong>'+esc(boot.contexts.find(c=>c.groupId===id)?.group||'Group')+'</strong></summary>'+groupBy(entries,j=>j.lessonId).map(([lesson,lessonJobs])=>'<details class="queue-lesson" open><summary><strong>'+esc(boot.contexts.find(c=>c.lessonId===lesson)?.lesson||'Lesson')+'</strong></summary>'+groupBy(lessonJobs,j=>j.senseId).map(([sense,wordJobs])=>'<details class="queue-word" open><summary><strong>'+esc(boot.contexts.find(c=>c.senseId===sense)?.word||'Word')+'</strong></summary>'+generationRows(wordJobs)+'</details>').join('')+'</details>').join('')+'</details>').join('')+'</section>';
  }
  return '';
}
function identity(q){return '<p class="attribution">'+esc(q.author.name)+' · '+esc(q.author.group)+' · '+esc(q.author.date)+'</p>'+(q.reviewer?'<p class="verified">✓ '+esc(q.reviewer.name)+' · '+esc(q.reviewer.date)+'</p>':'')+(q.originalAuthor&&q.originalAuthor.name!==q.author.name?'<p class="muted small">Original author: '+esc(q.originalAuthor.name)+' · '+esc(q.originalAuthor.group)+' · '+esc(q.originalAuthor.date)+'</p>':'');}
function action(action,q,label){return '<button data-action="'+action+'" data-id="'+q.id+'">'+label+'</button>';}
function buttons(q){
  let out='';const mine=q.author.id===boot.actor.id;
  if(mine&&['draft','returned'].includes(q.state))out+=action('edit',q,'Edit draft')+action('submit',q,'Submit for review');
  if(teacher()&&q.state==='submitted'&&!mine)out+=action('return',q,'Request changes')+action('approve',q,'Review & approve');
  if(teacher()&&q.state==='approved')out+=action('revise',q,'Propose new version');
  if(q.author.id||teacher())out+=action('history',q,'Version history');
  return '<div class="actions">'+out+'</div>';
}
function entry(q){
  const items=q.content.items.map(item=>reviewItemPreview(q.type,item)).join('');
  return '<details class="review-item" data-item="'+q.id+'" data-expand="item-'+q.id+'"><summary><span><strong>'+esc(q.type)+' · v'+q.version+'</strong><span class="locked">'+esc(q.author.name)+' · '+esc(q.author.date)+'</span></span><span class="status '+q.state+'">'+labels[q.state]+'</span></summary><div class="detail">'+identity(q)+items+'<p class="muted">'+esc(q.content.explanation)+'</p>'+(q.feedback?'<blockquote class="feedback">'+esc(q.feedback)+'</blockquote>':'')+(q.state==='approved'?'<p class="muted small">Shared template · This approved version is locked.</p>':'')+buttons(q)+'</div></details>';
}
function groupBy(list,key){const result=new Map();list.forEach(q=>{const k=key(q);if(!result.has(k))result.set(k,[]);result.get(k).push(q);});return [...result];}
function byType(list,key){return groupBy(list,q=>q.type).map(([type,rows])=>'<details class="queue-type" data-expand="type-'+esc(key+'-'+type)+'"><summary><strong>'+esc(type)+' · '+rows.length+'</strong></summary>'+rows.map(entry).join('')+'</details>').join('');}
function groups(list){
  return groupBy(list,q=>q.groupId).map(([groupId,groupRows])=>'<details class="queue-group" open data-expand="group-'+groupId+'"><summary><strong>'+esc(groupRows[0].author.group)+'</strong><span>'+groupRows.length+'</span></summary><div class="group-content">'+groupBy(groupRows,q=>q.lessonId).map(([lessonId,lessonRows])=>'<details class="queue-lesson" open data-expand="lesson-'+lessonId+'"><summary><strong>'+esc(boot.contexts.find(c=>c.lessonId===lessonId)?.lesson||'Lesson '+lessonId)+'</strong></summary>'+groupBy(lessonRows,q=>q.senseId).map(([senseId,words])=>'<details class="queue-word" open data-expand="word-'+lessonId+'-'+senseId+'"><summary><strong>'+esc(boot.contexts.find(c=>c.senseId===senseId)?.word||'Word')+'</strong></summary>'+byType(words,lessonId+'-'+senseId)+'</details>').join('')+'</details>').join('')+'</div></details>').join('');
}
function render(){
  const c=selected();$('#title').textContent=view==='providers'?'Language providers':view==='quota'?'Generation quota':view==='word'?(c?.word||'Words'):view==='queue'?'Review queue':'My proposals';
  document.querySelectorAll('[data-view]').forEach(b=>{b.hidden=['quota','providers'].includes(b.dataset.view)?!developer():b.dataset.view==='queue'&&!teacher();if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(view==='providers'){$('#content').innerHTML=providerSettingsUI.render();providerSettingsUI.afterRender();$('#content').setAttribute('aria-busy','false');return;}
  if(view==='quota'){
    $('#content').innerHTML=developer()?quotaPanel():'';
    updateQuotaSaveButton();
    const history=$('#quota-history');if(history){history.open=expansion.get('quota-history')===true;if(history.open&&quotaState.historyStatus==='idle')loadQuotaHistory();}
    const changes=$('#quota-changes');if(changes){changes.open=expansion.get('quota-changes')===true;if(changes.open&&quotaState.changesStatus==='idle')loadQuotaChanges();}
    $('#content').setAttribute('aria-busy','false');return;
  }
  if(view==='word'){
    const own=quizzes.filter(q=>q.senseId===c?.senseId&&q.state!=='approved'&&!c.personal),list=[...shared,...own];
    const missing=types.filter(type=>!['Match','Memory','Select all','Odd one out'].includes(type)&&!shared.some(q=>q.type===type));
    $('#content').innerHTML='<div class="context-picker"><label>Card location<select id="context">'+boot.contexts.map(row=>'<option value="'+row.id+'" '+(row.id===c?.id?'selected':'')+'>'+esc(row.personal?'Personal card · '+row.word:row.group+' / '+row.lesson+' / '+row.word)+'</option>').join('')+'</select></label></div>'+(c?'<section><h2>Meaning</h2><p>'+esc(c.meaning)+' · '+esc(c.translation)+'</p><p class="coverage"><strong>Missing teacher-checked types:</strong> '+missing.map(esc).join(', ')+'</p><div class="actions">'+(!c.personal?'<button class="primary" data-action="create">Propose a quiz</button>':'<p class="muted">Personal cards use shared templates. Student proposals belong to lesson words only.</p>')+'</div></section><section><h2>Quizzes</h2>'+byType(list,c.id)+(!list.length?'<p class="empty">No quizzes yet.</p>':'')+'</section>':'<p>No lesson words available for this test account.</p>');
  }else $('#content').innerHTML='<section><p class="muted">'+(view==='queue'?'Submitted and returned work in your assigned groups.':'Your drafts and submitted versions. Editing during review is blocked by the server.')+'</p>'+groups(quizzes)+(!quizzes.length?'<p class="empty">No proposals.</p>':'')+'</section>';
  $('#content').insertAdjacentHTML('beforeend',generationPanel());
  document.querySelectorAll('[data-expand]').forEach(d=>{if(expansion.has(d.dataset.expand))d.open=expansion.get(d.dataset.expand);});$('#content').setAttribute('aria-busy','false');
}
document.addEventListener('toggle',e=>{
  if(!e.target.isConnected)return;
  if(e.target.dataset?.expand)expansion.set(e.target.dataset.expand,e.target.open);
  if(e.target.open&&e.target.dataset?.attemptHistory)loadAttempts(e.target.dataset.attemptHistory);
  if(e.target.open&&e.target.id==='quota-history'&&quotaState?.historyStatus==='idle')loadQuotaHistory();
  if(e.target.open&&e.target.id==='quota-changes'&&quotaState?.changesStatus==='idle')loadQuotaChanges();
},true);
function setupType(){
  if(editing?.id||editing?.repairJob)return;
  editorDrafts.set(editorType,readReviewItems(editorType,$('#edit-items')));
  editorType=$('#edit-type').value;
  const items=editorDrafts.get(editorType)||defaultReviewItems(editorType,editing.context);
  renderEditorItems(items);$('#editor').scrollTop=0;
}
function renderEditorItems(items){editorDrafts.set(editorType,items);$('#edit-items').innerHTML=renderReviewItems(editorType,items);$('#add-quiz-item').disabled=items.length>=50;$('#edit-error').hidden=true;}
function openEditor(q,repairJob=null){
  const context=repairJob?boot.contexts.find(c=>c.lessonId===repairJob.lessonId&&c.senseId===repairJob.senseId):selected();
  if(!q&&!context){message('This lesson context is no longer available.',true);return;}
  editing=q||{context:{...context},repairJob};$('#edit-type').disabled=!!(q||repairJob);
  $('#edit-title').textContent=q?'Edit draft · v'+q.version:repairJob?'Correct a preparation issue':'Propose a lesson quiz';
  $('#edit-context').textContent=q?String(q.author.group):context.group+' / '+context.lesson;
  editorType=q?.type||repairJob?.type||'Gap';$('#edit-type').value=editorType;editorDrafts.clear();
  renderEditorItems(q?structuredClone(q.content.items):defaultReviewItems(editorType,editing.context));
  $('#edit-explanation').value=q?.content.explanation||editing.context.meaning;
  $('#editor').showModal();$('#editor').scrollTop=0;
}
function contentFromForm(){
  return {type:editorType,content:{explanation:$('#edit-explanation').value.trim(),items:readReviewItems(editorType,$('#edit-items'))}};
}
document.addEventListener('click',e=>{
  const editorAction=e.target.closest('[data-remove-item],[data-add-option],[data-remove-option],#add-quiz-item');
  if(editorAction){if(!busy)renderEditorItems(editReviewItems(editorType,readReviewItems(editorType,$('#edit-items')),editorAction));return;}
  const close=e.target.closest('[data-close]');if(close){if(!busy)$('#'+close.dataset.close).close();return;}
  const nav=e.target.closest('[data-view]');if(nav){run(async()=>{view=nav.dataset.view;await refresh();});return;}
  const b=e.target.closest('[data-action]');if(!b||busy)return;
  const action=b.dataset.action,q=[...quizzes,...shared].find(row=>row.id===b.dataset.id);
  if(action==='quota-refresh'){loadQuota();return;}
  if(action==='quota-history-more'||action==='quota-history-retry'){loadQuotaHistory(action==='quota-history-more'||quotaState.retryMore);return;}
  if(action==='quota-changes-more'||action==='quota-changes-retry'){loadQuotaChanges(action==='quota-changes-more'||quotaState.retryChangesMore);return;}
  if(action==='reload-attempts'){loadAttempts(b.dataset.jobId,true);return;}
  if(action==='repair-job'){const job=jobs.find(j=>j.id===b.dataset.jobId);if(job)openEditor(null,job);return;}
  if(action==='prepare'){run(async()=>{const c=selected();await api('/local/generation',{groupId:c.groupId,lessonId:c.lessonId,cardId:c.cardId,senseId:c.senseId,types});pollFailures=0;await refresh();message('Queued locally. Existing approved templates are not replaced.');});return;}
  if(['retry-job','open-generated'].includes(action)){
    const job=jobs.find(j=>j.id===b.dataset.jobId);if(!job)return;
    run(async()=>{
      if(action==='retry-job')await api('/local/generation/'+job.id+'/retry',{expectedRevision:job.revision});
      else{
        const generated=(await api('/local/quizzes/'+job.versionId)).quiz;
        if(['draft','returned'].includes(generated.state)&&generated.author.id!==boot.actor.id){$('#history-content').innerHTML=identity(generated)+'<p class="muted">Awaiting changes or submission by the author.</p>'+generated.content.items.map(item=>reviewItemPreview(generated.type,item)).join('');$('#history').showModal();return;}
        view=generated.state==='approved'?'word':generated.state==='submitted'?'queue':'mine';
        if(view==='word')contextId=boot.contexts.find(c=>c.cardId===job.cardId&&c.lessonId===job.lessonId)?.id||contextId;
        expansion.set('type-'+(view==='word'?contextId:job.lessonId+'-'+job.senseId)+'-'+job.type,true);expansion.set('item-'+job.versionId,true);
      }
      pollFailures=0;await refresh();
    });return;
  }
  if(action==='create'){openEditor();return;}if(!q)return;
  if(action==='edit'){openEditor(q);return;}
  if(['return','approve'].includes(action)){
    decision={action,q};$('#decision-title').textContent=action==='return'?'Request changes':'Approve & share';
    $('#decision-content').innerHTML=action==='return'?'<label>Feedback<textarea id="feedback" required maxlength="2000"></textarea></label>':'<p>This version becomes a shared template and cannot be edited or deleted.</p>'+['Meaning, translation and context are correct','Answers are unambiguous','Explanation and level are appropriate'].map(text=>'<label class="check"><input type="checkbox" required>'+text+'</label>').join('');$('#decision').showModal();return;
  }
  run(async()=>{
    if(action==='submit'){await api('/local/quizzes/'+q.id+'/submit',{expectedRevision:q.revision});await refresh();message('Submitted. The server locked this version for review.');}
    if(action==='revise'){const current=(await api('/local/quizzes/'+q.id)).quiz;const result=await api('/local/quizzes/'+q.id+'/revise',{expectedRevision:current.revision});view='mine';await refresh();openEditor(quizzes.find(row=>row.id===result.id));}
    if(action==='history'){const data=(await api('/local/quizzes/'+q.id)).quiz;$('#history-content').innerHTML=data.history.map(h=>'<div class="history-event"><strong>'+esc(h.action)+'</strong><p>'+esc(h.actor)+' · '+esc(h.date)+'</p>'+(h.details.comment?'<p>'+esc(h.details.comment)+'</p>':'')+'<details><summary>Saved content</summary><pre>'+esc(JSON.stringify(h.details,null,2))+'</pre></details></div>').join('');$('#history').showModal();}
  });
});
document.addEventListener('change',e=>{
  if(e.target.id==='account'){const role=e.target.value;run(async()=>{await api('/local/session',{role});await loadSession();message('Selected a synthetic test account.');});}
  if(e.target.id==='context'){contextId=e.target.value;run(refresh);}
  if(e.target.id==='theme')document.documentElement.dataset.theme=e.target.value;
  if(e.target.id==='edit-type')setupType();
});
$('#edit-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
  const value=contentFromForm();
  if(editing.id)await api('/local/quizzes/'+editing.id+'/edit',{expectedRevision:editing.revision,content:value.content});
  else if(editing.repairJob)await api('/local/generation/'+editing.repairJob.id+'/repair',{expectedRevision:editing.repairJob.revision,content:value.content});
  else{const c=editing.context;await api('/local/quizzes',{groupId:c.groupId,lessonId:c.lessonId,cardId:c.cardId,senseId:c.senseId,...value});}
  $('#editor').close();view='mine';await refresh();message('Saved in the local test database.');
});});
$('#decision-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
  const {q,action}=decision,payload={expectedRevision:q.revision,...(action==='return'?{comment:$('#feedback').value.trim()}:{checks:{meaning:true,answers:true,level:true}})};
  await api('/local/quizzes/'+q.id+'/'+action,payload);$('#decision').close();await refresh();message(action==='return'?'Returned with feedback.':'Approved shared template. The version is locked.');
});});
$('#edit-type').innerHTML=types.map(type=>'<option>'+type+'</option>').join('');
document.addEventListener('submit',event=>{if(event.target.id==='quota-limit-form'){event.preventDefault();saveQuotaLimit(event.target);}});
document.addEventListener('input',event=>{if(event.target.closest('#quota-limit-form'))updateQuotaSaveButton();});
setInterval(()=>{if(!['quota','providers'].includes(view)&&!busy&&!document.querySelector('dialog[open]')&&pollFailures<3&&jobs.some(j=>['queued','running','retry'].includes(j.state)))run(async()=>{try{await refresh();pollFailures=0;}catch(error){pollFailures++;throw error;}});},1000);
run(loadSession);
