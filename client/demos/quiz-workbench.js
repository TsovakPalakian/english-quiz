// Isolated UI fixtures, outside the app bundle: no network calls or persistence.
const types = ['Flip','Choice','Type','Gap','Build','Match','True / false','Tap','Select all','Reverse','Spell','Letters','Listen','Definition','Odd one out','Memory','Hangman'];
const meanings = {
  rain: {label:'Noun · light rain · изморось', definition:'Light rain falling in very small drops.', example:'A fine drizzle started falling.', answer:'изморось', group:'A1 · Monday', lesson:'Weather and seasons'},
  food: {label:'Verb · pour a little liquid · сбрызнуть', definition:'To pour a small amount of liquid over something.', example:'Drizzle olive oil over the salad.', answer:'сбрызнуть', group:'A2 · Thursday', lesson:'Cooking together'},
};
const today = () => new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Yerevan',day:'2-digit',month:'short',year:'numeric'}).format(new Date());
const labels = {ready:'Ready · Not teacher-reviewed',approved:'Teacher checked',review:'Needs review',returned:'Changes requested',draft:'Draft',failed:'Failed',pending:'Preparing',context:'Needs a word set'};
const contextual = ['Match','Select all','Odd one out','Memory'];
const rows = Object.entries(meanings).flatMap(([key,m]) => types.map((type,i) => {
  const student = ['Choice','Gap'].includes(type);
  return {
    id:key+'-'+i,meaning:key,type,group:m.group,lesson:m.lesson,source:student?'student':'automatic',
    author:student?'Anna Petrova':'Automatic generation',date:'21 Oct 2026',
    status:contextual.includes(type)?'context':student?'review':type==='Listen'?'failed':type==='Definition'?'pending':'ready',
    manual:type==='Type',attempts:type==='Listen'?2:1,version:1,
    prompt:type==='Gap'?m.example.replace(/drizzle/i,'____'):type==='Definition'?m.definition:['Build','Tap'].includes(type)?m.example:['Type','Reverse'].includes(type)?'Translate: '+m.answer:'Translate “drizzle” ('+(key==='rain'?'light rain':'pour liquid')+').',
    answer:['Gap','Type','Reverse','Definition','Spell','Letters','Hangman'].includes(type)?'drizzle':type==='Build'?m.example:m.answer,
    options:type==='Choice'?[m.answer,key==='rain'?'мелкий дождь':'полить тонкой струйкой','гроза','снег']:null,
    explanation:key==='rain'?'Here drizzle means light rain, not pouring liquid over food.':'Here drizzle is a cooking verb describing a small stream of liquid.',
    reason:type==='Choice'?'Two options may express the same meaning. Review the distractors.':type==='Gap'?'Check that the context makes the intended answer clear.':type==='Listen'?'Audio could not be prepared after 2 attempts.':type==='Definition'?'Waiting for definition validation.':'',
    history:[{text:student?'Submitted by Anna Petrova':'Automatic draft prepared',date:'21 Oct 2026'}],
  };
}));
rows.push({...structuredClone(rows.find(q=>q.id==='rain-3')),id:'rain-other',group:'A1 · Friday',lesson:'A rainy weekend',author:'Mark Evans'});
rows.push({...structuredClone(rows.find(q=>q.id==='food-1')),id:'food-choice-2',author:'Mark Evans',prompt:'What does drizzle mean in “Drizzle oil over the salad”?',answer:'полить тонкой струйкой',options:['полить тонкой струйкой','варить','заморозить','нарезать'],reason:'Check the distractors and cooking context.',history:[{text:'Submitted by Mark Evans',date:'21 Oct 2026'}]});
Object.assign(rows[0],{status:'approved',source:'student',author:'Anna Petrova',checkedBy:'Elena Teacher',checkedDate:'21 Oct 2026'});
rows[0].history=[{text:'Submitted by Anna Petrova',date:'21 Oct 2026'},{text:'Approved as a shared template by Elena Teacher',date:'21 Oct 2026'}];
let selected='rain',view='word',role='teacher',source='lesson',filter='review',query='',editing=null,decision=null,noticeTimer,serial=0;
const expanded = new Map();
const $ = s=>document.querySelector(s);
const esc = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const own = q=>q.source==='student'&&q.author==='Anna Petrova';
const editAllowed = q=>!['approved','context','pending'].includes(q.status)&&(role==='teacher'||own(q)&&['draft','returned'].includes(q.status));
const history = (q,text)=>q.history.push({text,date:today()});
const find = id=>rows.find(q=>q.id===id);
function status(q){return '<span class="status '+q.status+'">'+(q.status==='approved'?'✓ ':'')+labels[q.status]+'</span>';}
function notice(text){$('#notice').textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').textContent='',4500);}
function button(action,q,text,primary=false){return '<button '+(primary?'class="primary" ':'')+'data-action="'+action+'" data-id="'+q.id+'">'+text+'</button>';}
function controls(q){
  let html='';
  if(editAllowed(q))html+=button('edit',q,'Edit draft');
  if(role==='teacher'&&q.status==='review')html+=button('approve',q,'Review & approve',true)+(q.source==='student'?button('return',q,'Request changes'):'');
  if(role==='teacher'&&q.source==='automatic'&&!q.manual&&['ready','failed','review'].includes(q.status))html+=button('retry',q,'Regenerate');
  if(role==='student'&&own(q)&&['draft','returned'].includes(q.status))html+=button('submit',q,'Submit for review',true);
  if(role==='teacher'&&q.status==='approved')html+=button('revision',q,'Propose a new version');
  if(q.status!=='context')html+=button('report',q,'Report / suggest');
  return '<div class="actions">'+html+'</div>';
}
function preview(q){return '<div class="quiz-preview"><span class="muted small">Question</span><strong>'+esc(q.prompt)+'</strong>'+(q.options?'<ol class="options">'+q.options.map(o=>'<li class="'+(o===q.answer?'correct':'')+'">'+esc(o)+(o===q.answer?' ✓':'')+'</li>').join('')+'</ol>':'<p><span class="muted">Answer:</span> '+esc(q.answer)+'</p>')+'<p class="muted small">'+esc(q.explanation)+'</p></div>';}
function detail(q){
  return '<p class="attribution">'+esc(q.author)+' · '+esc(q.group)+' · '+esc(q.date)+'</p>'+(q.checkedBy?'<p class="verified">✓ Teacher checked · '+esc(q.checkedBy)+' · '+esc(q.checkedDate)+'</p><p class="muted small">Shared template · All matching lessons and personal cards · Version '+q.version+' is locked</p>':'')+(q.reason?'<p class="reason">'+esc(q.reason)+'</p>':'')+(q.status==='context'?'<p class="muted">Requires a word set and a clear grouping rule; not a missing individual exercise.</p>':preview(q))+(q.comment?'<blockquote class="feedback"><strong>Teacher feedback</strong><br>'+esc(q.comment)+'</blockquote>':'')+(q.manual?'<p class="muted small">Manually edited · Protected from automatic replacement</p>':'')+controls(q)+'<details class="history" data-expand="history-'+q.id+'"><summary>History · '+q.history.length+'</summary><ul>'+q.history.map(h=>'<li>'+esc(h.date)+' · '+esc(h.text)+'</li>').join('')+'</ul></details>';
}
function wordRows(){return rows.filter(q=>q.meaning===selected&&(q.status==='approved'||source==='lesson'&&q.group===meanings[selected].group&&q.lesson===meanings[selected].lesson&&(role==='teacher'||own(q))));}
function renderWord(){
  const m=meanings[selected],list=wordRows();
  const missing=types.filter(t=>!contextual.includes(t)&&!list.some(q=>q.type===t&&['ready','approved'].includes(q.status)));
  return '<section class="meaning"><h2>Meaning</h2><div class="word-selectors"><label><span class="muted small">Selected meaning</span><select id="meaning">'+Object.entries(meanings).map(([id,m])=>'<option value="'+id+'" '+(selected===id?'selected':'')+'>'+esc(m.label)+'</option>').join('')+'</select></label><label><span class="muted small">Card location</span><select id="source"><option value="lesson" '+(source==='lesson'?'selected':'')+'>Lesson word</option><option value="personal" '+(source==='personal'?'selected':'')+'>Personal card</option></select></label></div><p class="muted small">'+(source==='lesson'?esc(m.group+' / '+m.lesson):'Personal card · Shared approved templates only')+'</p><p>'+esc(m.definition)+'</p><blockquote>'+esc(m.example)+'</blockquote></section><section><div class="section-heading"><h2>Quizzes</h2><div class="actions">'+(role==='teacher'?'<button data-action="review-open">Review flagged quizzes</button>':source==='lesson'?'<button class="primary" data-action="propose">Propose a quiz</button>':'')+'<button data-action="report-card">Report / suggest</button></div></div><div class="counts">'+['approved','ready','review','returned','failed','pending','context'].map(s=>'<span><b>'+list.filter(q=>q.status===s).length+'</b> '+labels[s]+'</span>').join('')+'</div><p class="coverage"><strong>Missing ready types:</strong> '+(missing.length?missing.map(esc).join(', '):'None')+'</p><p class="muted small">Match, Memory, Select all and Odd one out require a word set. Checkmarks apply only to approved versions.</p>'+(role==='student'&&source==='personal'?'<p class="muted">Student proposals can only be created from lesson words.</p>':'')+list.map(q=>'<details data-quiz="'+q.id+'" data-expand="quiz-'+q.id+'"><summary><span>'+esc(q.type)+'<span class="locked">'+(q.source==='student'?esc(q.author):'Automatic')+' · v'+q.version+'</span></span>'+status(q)+'</summary><div class="detail">'+detail(q)+'</div></details>').join('')+(!list.length?'<p class="empty">No approved templates for this meaning yet.</p>':'')+'</section>';
}
function article(q){return '<details class="review-item" data-item="'+q.id+'" data-expand="item-'+q.id+'"><summary><span><strong>'+esc(q.type)+' · v'+q.version+'</strong><span class="locked">'+esc(q.author)+' · '+esc(q.date)+'</span></span>'+status(q)+'</summary><div class="detail"><p class="muted small">'+esc(meanings[q.meaning].label)+'</p>'+detail(q)+'</div></details>';}
function groupBy(list,fn){const groups=new Map();list.forEach(q=>{const key=fn(q);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(q);});return [...groups];}
function quizTypes(list,key){return groupBy(list,q=>q.type).map(([type,quizzes])=>'<details class="queue-type" data-type="'+esc(type)+'" data-expand="type-'+esc(key+'-'+type)+'"><summary><strong>'+esc(type)+' · '+quizzes.length+'</strong><span class="muted small">'+quizzes.filter(q=>q.status==='review').length+' need review</span></summary>'+quizzes.map(article).join('')+'</details>').join('');}
function grouped(list){
  return groupBy(list,q=>q.group).map(([group,entries])=>'<details class="queue-group" data-expand="group-'+esc(group)+'" open><summary><strong>'+esc(group)+'</strong><span class="muted small">'+entries.length+' quizzes</span></summary><div class="group-content">'+groupBy(entries,q=>q.lesson).map(([lesson,quizzes])=>'<details class="queue-lesson" data-expand="lesson-'+esc(group+'-'+lesson)+'" open><summary><strong>'+esc(lesson)+'</strong><span class="muted small">'+quizzes.length+'</span></summary><details class="queue-word" data-expand="word-'+esc(group+'-'+lesson)+'" open><summary><strong>drizzle</strong><span class="muted small">'+quizzes.length+'</span></summary>'+quizTypes(quizzes,group+'-'+lesson)+'</details></details>').join('')+'</div></details>').join('');
}
function renderReview(){const list=rows.filter(q=>(filter==='all'?['review','returned','draft','failed','pending'].includes(q.status):q.status===filter)&&('drizzle '+q.type+' '+q.group+' '+q.lesson+' '+q.author+' '+meanings[q.meaning].label).toLowerCase().includes(query.toLowerCase()));return '<section><h2>Review queue</h2><div class="filters"><input id="search" aria-label="Search review queue" placeholder="Search group, lesson, word or author" value="'+esc(query)+'"><select id="filter" aria-label="Quiz status">'+['review','returned','failed','pending','all'].map(s=>'<option value="'+s+'" '+(filter===s?'selected':'')+'>'+(labels[s]||'All unresolved')+'</option>').join('')+'</select></div><p class="muted small">'+list.length+' quizzes · Group / Lesson / Word · Approval publishes a shared template for this meaning</p>'+grouped(list)+(!list.length?'<p class="empty">No quizzes match this filter.</p>':'')+'</section>';}
function render(){
  const titles={word:'drizzle',review:'Review queue',proposals:'My proposals',shared:'Shared templates'};
  $('#title').textContent=$('#crumb').textContent=titles[view];$('#role-label').textContent=role==='teacher'?'Teacher view':'Student · Anna Petrova';$('#nav-count').textContent=rows.filter(q=>q.status==='review').length;
  document.querySelectorAll('[data-view]').forEach(b=>{b.hidden=b.dataset.view==='review'&&role!=='teacher';if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('#content').innerHTML=view==='word'?renderWord():view==='review'&&role==='teacher'?renderReview():view==='proposals'?'<section><h2>My proposals · Anna Petrova</h2><p class="muted">Submitted versions are locked during review. Returned drafts can be revised and submitted again.</p>'+grouped(rows.filter(own))+'</section>':'<section><h2>Shared templates</h2><p class="muted">Available for matching words and meanings in all lessons and personal cards, including cards added before approval.</p>'+rows.filter(q=>q.status==='approved').map(article).join('')+'</section>';
  document.querySelectorAll('[data-expand]').forEach(d=>{if(expanded.has(d.dataset.expand))d.open=expanded.get(d.dataset.expand);});
}
document.addEventListener('toggle',e=>{if(e.target.dataset?.expand)expanded.set(e.target.dataset.expand,e.target.open);},true);
function openEditor(q){if(!editAllowed(q))return;editing=q;$('#editor-title').textContent='Edit '+q.type+' · drizzle · v'+q.version;$('#edit-prompt').value=q.prompt;$('#edit-answer').value=q.answer;$('#edit-options').value=q.options?.join('\n')||'';$('#options-field').hidden=!q.options;$('#edit-explanation').value=q.explanation;$('#editor').showModal();}
function openDecision(q,action){decision={q,action};$('#decision-title').textContent=action==='approve'?'Approve a shared template':'Return to the student';$('#decision-body').innerHTML='<p>drizzle · '+esc(q.type)+' · '+esc(q.group)+'</p>'+(action==='approve'?'<p>This version will be locked and available in all matching lessons and personal cards.</p>'+['Meaning, translation and example are correct','The answer and distractors are unambiguous','The explanation and level are appropriate'].map(t=>'<label class="check"><input type="checkbox" required>'+t+'</label>').join(''):'<label>What needs to change?<textarea id="return-comment" required maxlength="2000"></textarea></label>');$('#decision-submit').textContent=action==='approve'?'Approve & share':'Request changes';$('#decision').showModal();}
function openReport(q){$('#report-form').reset();$('#attachment-list').replaceChildren();$('#report-result').textContent='';$('#report-context').textContent='drizzle / '+meanings[q?.meaning||selected].label+(q?' / '+q.type+' / v'+q.version+' / '+q.id:' / Word card');$('#report').showModal();}
document.addEventListener('click',e=>{
  const close=e.target.closest('[data-close]');if(close){$('#'+close.dataset.close).close();return;}
  const nav=e.target.closest('[data-view]');if(nav){if(nav.dataset.view==='review'&&role!=='teacher')return;view=nav.dataset.view;render();return;}
  const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,q=find(b.dataset.id);
  if(action==='review-open'&&role==='teacher'){view='review';filter='review';render();return;}
  if(action==='report-card'){openReport();return;}
  if(action==='propose'&&role==='student'&&source==='lesson'){
    const draft={...structuredClone(find(selected+'-3')),id:'proposal-'+ ++serial,group:meanings[selected].group,lesson:meanings[selected].lesson,author:'Anna Petrova',source:'student',date:today(),status:'draft',manual:true,version:1,reason:'',comment:'',history:[{date:today(),text:'Lesson-word draft created by Anna Petrova'}]};
    delete draft.checkedBy;delete draft.checkedDate;rows.push(draft);view='proposals';render();openEditor(draft);return;
  }
  if(!q)return;
  if(action==='report'){openReport(q);return;}
  if(action==='edit')openEditor(q);
  if(action==='approve'&&role==='teacher'&&q.status==='review')openDecision(q,action);
  if(action==='return'&&role==='teacher'&&q.status==='review'&&q.source==='student')openDecision(q,action);
  if(action==='submit'&&role==='student'&&own(q)&&['draft','returned'].includes(q.status)){q.status='review';q.reason='Student submission awaiting teacher review.';history(q,'Submitted by Anna Petrova');render();notice('Submitted locally. This version is locked during review.');}
  if(action==='revision'&&role==='teacher'&&q.status==='approved'){
    const draft={...structuredClone(q),id:'revision-'+ ++serial,status:'review',version:q.version+1,manual:true,date:today(),reason:'Proposed revision. The approved version remains unchanged.'};delete draft.checkedBy;delete draft.checkedDate;history(draft,'New revision proposed by Elena Teacher');rows.push(draft);view='review';filter='review';render();openEditor(draft);
  }
  if(action==='retry'&&role==='teacher'&&q.source==='automatic'&&!q.manual&&['ready','failed','review'].includes(q.status)){q.status='pending';q.reason='Preparing another sample draft…';q.attempts++;render();setTimeout(()=>{q.status='review';q.reason='New sample draft prepared. Teacher review required.';history(q,'Automatic retry sent for review');render();notice('Sample regeneration completed. No generator was called.');},1000);}
});
document.addEventListener('change',e=>{
  if(e.target.id==='meaning'){selected=e.target.value;render();}
  if(e.target.id==='source'){source=e.target.value;render();}
  if(e.target.id==='filter'){filter=e.target.value;render();}
  if(e.target.id==='theme')document.documentElement.dataset.theme=e.target.value;
  if(e.target.id==='role'){role=e.target.value;if(view==='review'&&role==='student')view='proposals';render();}
  if(e.target.id==='report-files')$('#attachment-list').replaceChildren(...[...e.target.files].map(f=>{const li=document.createElement('li');li.textContent=f.name+' · '+Math.ceil(f.size/1024)+' KB';return li;}));
});
document.addEventListener('input',e=>{if(e.target.id!=='search')return;query=e.target.value;const pos=e.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(pos,pos);});
$('#edit-form').addEventListener('submit',e=>{
  e.preventDefault();if(!editing||!editAllowed(editing))return;
  const prompt=$('#edit-prompt').value.trim(),answer=$('#edit-answer').value.trim(),explanation=$('#edit-explanation').value.trim(),options=editing.options?$('#edit-options').value.split('\n').map(t=>t.trim()).filter(Boolean):null;
  if(!prompt||!answer||!explanation||options&&(options.length<2||new Set(options.map(t=>t.toLowerCase())).size!==options.length||options.filter(o=>o===answer).length!==1)){$('#edit-answer').setCustomValidity('Provide a unique correct answer included in the options.');$('#edit-answer').reportValidity();$('#edit-answer').setCustomValidity('');return;}
  Object.assign(editing,{prompt,answer,explanation,options,manual:true});if(role==='teacher')editing.status='review';history(editing,'Draft edited by '+(role==='teacher'?'Elena Teacher':'Anna Petrova'));$('#editor').close();render();notice('Draft saved in this preview only.');
});
$('#decision-form').addEventListener('submit',e=>{
  e.preventDefault();if(!decision||role!=='teacher'||decision.q.status!=='review')return;
  const {q,action}=decision;if(action==='approve'){Object.assign(q,{status:'approved',reason:'',checkedBy:'Elena Teacher',checkedDate:today()});history(q,'Approved as a shared template by Elena Teacher');}
  else{const comment=$('#return-comment').value.trim();if(q.source!=='student'||!comment)return;Object.assign(q,{status:'returned',comment,reason:'Returned to the author for revision.'});history(q,'Changes requested by Elena Teacher: '+comment);}
  $('#decision').close();render();notice(action==='approve'?'Approved sample template is now shared and locked.':'Returned to the student with feedback.');
});
$('#report-form').addEventListener('submit',e=>{e.preventDefault();$('#report-result').textContent='Preview ready for info@lumiscia.org · '+$('#report-category').value+' · '+$('#report-files').files.length+' attachments. Nothing was sent.';});
render();
