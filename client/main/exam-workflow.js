// Exam-only presentation; lesson definitions and rendering delegate unchanged.
const examTones=['#247b78','#9265ad','#ac6741','#4e78a8','#988024','#b64d70','#44845c','#986173'];
function examTone(part){
  if(/^#[a-f0-9]{6}$/i.test(part.blockColor||''))return part.blockColor;
  const seed=String(part.id||part.assignmentId||'').split('').reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,17);
  return examTones[seed%examTones.length];
}
const examBlankOriginal=lmBlank;
lmBlank=function(type,quizType){const part=examBlankOriginal(type,quizType);if(lmState?.examOwned)part.blockColor=examTones[crypto.getRandomValues(new Uint32Array(1))[0]%examTones.length];return part;};
document.addEventListener('input',event=>{
  const field=event.target;if(!lmState?.examOwned||!canEditLessons()||!field.matches('[data-field="maxPoints"],[data-field="criteria"]'))return;
  const part=lmBlock(field.dataset.block);if(!part||part.scoringVersion<3)return;
  event.stopImmediatePropagation();part[field.dataset.field]=field.value;lmSchedule();
  for(const label of document.querySelectorAll('#lmBlocks .lm-max-score')){const input=label.querySelector('input'),owner=lmBlock(input?.dataset.block);if(owner&&input.readOnly)input.value=assessmentUnitMax(owner);}
},true);
const examBodyOriginal=lmBody;
lmBody=function(part){
  const body=examBodyOriginal(part);if(!lmState?.examOwned||!part.answerEnabled)return body;
  const field=name=>'data-field="'+name+'" data-block="'+part.id+'"';
  return body+'<div class="exam-answer-settings"><label>Checking<select '+field('checkMode')+'>'+[['teacher','Teacher review'],['exact','Exact match'],['meaning','By meaning']].map(([value,label])=>'<option value="'+value+'"'+((part.checkMode||'teacher')===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Answer purpose<select '+field('answerPurpose')+'><option value="reference"'+(part.answerPurpose!=='example'?' selected':'')+'>Reference answer</option><option value="example"'+(part.answerPurpose==='example'?' selected':'')+'>Example answer</option></select></label><label>Allowed answers<textarea '+field('allowedAnswers')+'>'+esc(part.allowedAnswers||'')+'</textarea></label>'+[['ignoreCase','Ignore case',true],['ignoreWhitespace','Normalize whitespace',true],['ignorePunctuation','Ignore punctuation',false]].map(([name,label,defaultValue])=>'<label class="exam-answer-option"><input type="checkbox" '+field(name)+((part[name]??defaultValue)?' checked':'')+'>'+label+'</label>').join('')+'</div>';
};
const examEditorOriginal=lmRenderEditor;
lmRenderEditor=function(){
  examEditorOriginal();if(!lmState?.examOwned)return;
  for(const panel of document.querySelectorAll('#lmBlocks [data-block-id]')){const part=lmBlock(panel.dataset.blockId);if(part){panel.classList.add('exam-colored-block');panel.style.setProperty('--exam-block-color',examTone(part));}}
};
const examPartsOriginal=lmPreviewParts;
const examPreviewBlockOriginal=lmPreviewBlock;
lmPreviewBlock=function(part){
  if(!lmState?.examOwned)return examPreviewBlockOriginal(part);
  if(part.type==='rule'&&part.ruleSnapshot)return lmClean(part.ruleSnapshot);
  if(part.type==='task'&&!part.contentGroup&&materialModel().examChildren(lmState.blocks,part).length)return '<p>'+esc(part.text||'')+'</p>';
  if(part.type==='text'&&part.answerEnabled&&canEditLessons())return '<div class="exam-model-answer"><strong>Answer:</strong><div>'+lmClean(part.teacherAnswer||part.html||'')+'</div></div>';
  if(part.type==='quiz')return window.MaterialQuiz.render(part,{exam:true,locked:canEditLessons()||canTuneStudentLessons()||lmState.studentSaved||!lmState.assessmentReady});
  return examPreviewBlockOriginal(part);
};
lmPreviewParts=function(parts){
  if(!lmState?.examOwned)return examPartsOriginal(parts);
  const known=new Set(parts.map(part=>part.assignmentId||'part-'+part.id)),visiting=new Set();
  const paint=part=>{
    if(visiting.has(part))return '';visiting.add(part);
    const key=part.assignmentId||'part-'+part.id,children=parts.filter(child=>child!==part&&child.assignmentKey===key);
    const content=part.contentGroup?'':lmPreviewPartsFlat([part]);
    const body=content+children.map(paint).join('');visiting.delete(part);
    const style=' style="--exam-block-color:'+examTone(part)+'"';
    if(part.contentGroup||children.length)return '<div class="exam-colored-block '+(part.contentGroup?'content-group':'lm-assignment')+'" data-assignment="'+esc(key)+'"'+style+'><header><span class="exam-container-kind">'+(part.contentGroup?'Content group':'Task')+'</span><h3>'+esc(part.title||'')+'</h3></header>'+body+'</div>';
    return '<div class="exam-colored-block"'+style+'>'+body+'</div>';
  };
  return parts.filter(part=>!part.assignmentKey||!known.has(part.assignmentKey)).map(paint).join('');
};
const examFillOriginal=examFillAnswers;
const examApplyOriginal=assessmentApply;
assessmentApply=function(doc,row){examApplyOriginal(doc,row);if(doc.examOwned){doc.examOverallComment=row.overallComment||'';doc.examPrivateNote=row.privateNote||'';}};
const examWriteOriginal=assessmentWrite;
assessmentWrite=function(doc,action,extra={}){return examWriteOriginal(doc,action,doc.examOwned&&['review','publish'].includes(action)?{...extra,overallComment:doc.examOverallComment||'',privateNote:doc.examPrivateNote||''}:extra);};
const examPointsOriginal=examPointInput;
examPointInput=function(part,index,whole=false){const html=examPointsOriginal(part,index,whole),score=lmState?.examOwned?lmState.examSuggested?.[part.id]?.[index]:null;return score==null?html:html+'<span class="exam-suggestion">Suggested points: '+esc(String(score))+'</span>';};
examFillAnswers=function(){
  if(lmState?.examOwned)document.querySelectorAll('#lmPreview .exam-review-notes,#lmPreview [data-exam-fill-decoration]').forEach(node=>node.remove());
  examFillOriginal();if(!lmState?.examOwned)return;
  const reviewer=canTuneStudentLessons();
  if(authUser?.role==='USER'&&!viewAccount)document.querySelectorAll('#lmPreview .text-color-tools').forEach(node=>node.remove());
  for(const part of lmState.blocks||[]){
    if(!part.answerEnabled)continue;
    const panel=document.querySelector('#lmPreview [data-lm-panel="'+part.id+'"]');if(!panel)continue;
    // The editor's HTML is the reference, never the question shown before Submit.
    panel.querySelector('.lm-copy')?.remove();
    if(reviewer||lmState.studentSaved){const html=reviewer?(part.teacherAnswer||part.html||''):part.modelAnswer||'';
      if(html)panel.insertAdjacentHTML('beforeend','<div class="exam-model-answer" data-exam-fill-decoration><strong>Answer:</strong><div>'+lmClean(html)+'</div>'+(part.answerPurpose==='example'?'<span>Example answer</span>':'')+'</div>');}
    if(reviewer&&lmState.examSuggested?.[part.id]?.[0]!=null)panel.insertAdjacentHTML('beforeend','<p class="exam-suggestion" data-exam-fill-decoration>Suggested points: '+esc(String(lmState.examSuggested[part.id][0]))+' / '+assessmentMax(part,0)+'</p>');
    if(reviewer&&part.checkMode==='meaning')panel.insertAdjacentHTML('beforeend','<div class="exam-suggestion" data-exam-fill-decoration><button class="btn" type="button" data-exam-recommendation="'+part.id+'"'+(!lmState.studentSaved||lmState.assessmentState==='published'?' disabled':'')+'>Request AI review</button><p data-exam-recommendation-result="'+part.id+'" role="status"></p></div>');
  }
  const root=document.getElementById('lmPreview');
  if(reviewer){const locked=lmState.assessmentState==='published'||!lmState.studentSaved;root.insertAdjacentHTML('beforeend','<div class="exam-review-notes"><label>Overall feedback<textarea data-exam-review-note="examOverallComment" maxlength="6000"'+(locked?' disabled':'')+'>'+esc(lmState.examOverallComment||'')+'</textarea></label><label>Private note<textarea data-exam-review-note="examPrivateNote" maxlength="6000"'+(locked?' disabled':'')+'>'+esc(lmState.examPrivateNote||'')+'</textarea></label></div>');}
  else if(lmState.assessmentState==='published'&&lmState.examOverallComment)root.insertAdjacentHTML('beforeend','<div class="exam-review-notes"><strong>Teacher feedback</strong><p>'+esc(lmState.examOverallComment)+'</p></div>');
  root.querySelectorAll('[data-exam-review-note]').forEach(examResizeReviewNote);
};
function examResizeReviewNote(field){field.style.height='auto';field.style.height=(field.scrollHeight+field.offsetHeight-field.clientHeight)+'px';}
window.addEventListener('resize',()=>{if(lmState?.examOwned)document.querySelectorAll('#lmPreview [data-exam-review-note]').forEach(examResizeReviewNote);});
document.addEventListener('input',event=>{const field=event.target.closest('[data-exam-review-note]');if(field&&lmState?.examOwned&&canTuneStudentLessons()&&['examOverallComment','examPrivateNote'].includes(field.dataset.examReviewNote)){lmState[field.dataset.examReviewNote]=field.value;examResizeReviewNote(field);}});
let examWorkflowLoading='',examWorkflowRow=null;
async function examLoadWorkflow(doc){
  const id=doc?.examId,exam=examFind(id);if(!doc?.examOwned||!exam?.studentId)return;
  const key=id+':'+(doc.assessmentRevision||0);if(examWorkflowLoading===key)return;examWorkflowLoading=key;
  try{
    examWorkflowRow=await accountFetch('/api/exams/workflow?examId='+id);
    if(!viewAccount&&authUser?.id===exam.studentId){const action=['results_published','completed'].includes(examWorkflowRow.state)?'results_viewed':'viewed';if(!examWorkflowRow.history.some(event=>event.action===action))examWorkflowRow=await accountFetch('/api/exams/workflow',{method:'POST',body:JSON.stringify({examId:id,action})});}
    examPaintWorkflow();
  }
  catch{examWorkflowLoading='';}
}
function examPaintWorkflow(){
  const row=examWorkflowRow,box=document.getElementById('assessmentSummary');if(!row||!box||row.examId!==lmState?.examId)return;
  document.getElementById('examWorkflowStatus')?.remove();
  const own=!viewAccount&&authUser?.id===examFind(row.examId)?.studentId;
  const submit=document.getElementById('examSave');
  const needsStart=own&&!row.history.some(event=>event.action==='started')&&!lmState.studentSaved;
  if(needsStart&&submit)submit.disabled=true;
  const labels={assigned:'Assigned',in_progress:'In progress',submitted:'Submitted for review',under_review:'Under review',results_published:'Results published',completed:'Completed'};
  const node=document.createElement('div');node.id='examWorkflowStatus';node.innerHTML='<strong>'+esc(labels[row.state]||row.state)+'</strong>'+(row.submitted?'<span>'+row.submitted+' / '+row.blocks+' blocks submitted</span>':'')+(needsStart?'<p>Start at least one examination block before submitting.</p>':'')+(own&&row.canStart?'<button class="btn primary" type="button" data-exam-workflow="started">Start</button>':'')+(!own&&canTuneStudentLessons()&&row.state==='submitted'?'<button class="btn primary" type="button" data-exam-workflow="review_started">Start review</button>':'')+(own&&row.canComplete?'<button class="btn primary" type="button" data-exam-workflow="completed">Mark as reviewed</button>':'');box.append(node);
}
const examStatusOriginal=assessmentStatus;
assessmentStatus=function(message,doc=lmState){examStatusOriginal(message,doc);if(doc?.examOwned){if(authUser?.role==='USER'&&!viewAccount&&!doc.studentSaved){const submit=document.getElementById('examSave');if(submit&&(!examWorkflowRow||examWorkflowRow.examId!==doc.examId||!examWorkflowRow.history.some(event=>event.action==='started')))submit.disabled=true;}void examLoadWorkflow(doc);examPaintWorkflow();}};
const examBlocksHeadingOriginal=examPaintBlocks;
const examListHeadingOriginal=examPaintList;
examSummary=function(rows,groups,compact=false){
  const counts=groups?.map(groupLiveStudentCount),students=counts?.every(count=>count!==undefined)?counts.reduce((sum,count)=>sum+count,0):'…';
  const selected=!compact&&examViewGroup!=null&&groups?.length===1&&String(groups[0].id)===String(examViewGroup);
  const works=rows.filter(exam=>exam.instanceStatus==='active'),templates=rows.filter(exam=>!exam.instanceStatus);
  return metricPairs([...(groups?[...(!selected?[['group',groups.length]]:[]),['students',students]]:[]),['exam',canEditLessons()?templates.length:rows.length],...(canEditLessons()?[['assigned works',works.length]]:[]),['ready for review',rows.filter(examNeedsReview).length],['completed',rows.filter(exam=>exam.instanceStatus==='completed').length]],compact).replace(/(students)? · <b>0<\/b>/g,(match,students)=>students?match:'').replace(/(assigned(?: works)?|ready(?: for review)?) · <b>/g,'$1 · <b class="exam-attention-count">');
};
const groupStudentCountsShowOriginal=show;
show=function(id){
  const result=groupStudentCountsShowOriginal(id);
  if(['days','exams'].includes(id)&&document.querySelector('section.on')?.id===id)void refreshGroupStudentCounts();
  return result;
};
examPaintList=function(){
  examListHeadingOriginal();
  const heading=document.querySelector('#exams .meta h1');
  if(heading)heading.textContent='Exams';
  const context=document.getElementById('examGroupName');
  if(context){
    const group=classGroups.find(row=>String(row.id)===String(examViewGroup));
    context.textContent=group?.title||(examViewGroup==='unassigned'?'Unassigned':'');
    context.hidden=!context.textContent;
  }
};
examPaintBlocks=function(){examBlocksHeadingOriginal();const exam=examFind(examCurrentId),title=classGroups.find(group=>String(group.id)===String(exam?.groupId))?.title||exam?.groupTitle;const heading=document.querySelector('#examblocks .meta h1');if(heading)heading.textContent='Examination blocks';const context=document.getElementById('examBlocksName');if(context)context.textContent=[title,exam?.title].filter(Boolean).join(' · ');};
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-exam-workflow]');if(!button||!lmState?.examOwned)return;button.disabled=true;
  try{examWorkflowRow=await accountFetch('/api/exams/workflow',{method:'POST',body:JSON.stringify({examId:lmState.examId,action:button.dataset.examWorkflow})});examDress();examPaintWorkflow();}
  catch(error){button.disabled=false;assessmentStatus(error.message);}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-exam-recommendation]');if(!button||!lmState?.examOwned||!canTuneStudentLessons())return;
  const doc=lmState,partId=Number(button.dataset.examRecommendation),output=document.querySelector('[data-exam-recommendation-result="'+partId+'"]');button.disabled=true;
  try{const result=await accountFetch('/api/exams/recommendation',{method:'POST',body:JSON.stringify({id:doc.blockId,studentId:examWorkAccount(),partId,index:0,expectedRevision:doc.assessmentRevision})});if(lmState!==doc||doc.assessmentRevision!==result.revision)return;output.textContent=result.status==='recommended'?'Suggested: '+result.points+' · '+result.explanation+' · Teacher confirmation required':result.message;}
  catch(error){if(output?.isConnected)output.textContent=error.message;}
  finally{if(button.isConnected)button.disabled=false;}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-exam-assign]');if(!button||!canEditLessons())return;
  const examId=Number(button.dataset.examAssign),groupId=Number(examViewGroup),actor=authUser?.id;
  button.disabled=true;
  try{
    const [membership,accounts]=await Promise.all([accountFetch('/api/groups/members'),accountFetch('/api/admin/users')]);
    if(authUser?.id!==actor||Number(examViewGroup)!==groupId)return;
    const ids=new Set((membership.members||[]).filter(row=>Number(row.groupId)===groupId).map(row=>row.accountId));
    const students=(accounts.users||[]).filter(user=>user.role==='USER'&&user.active!==0&&user.active!==false&&!user.revoked&&!user.is_personal_data_revoked&&ids.has(user.id));
    const exam=examFind(examId),group=classGroups.find(item=>Number(item.id)===groupId);
    const dialog=document.createElement('dialog');dialog.className='display-panel content-copy-panel exam-assign-dialog';
    dialog.innerHTML='<form><div class="display-head"><h2>Assign exam</h2><button type="button" class="btn icon" data-close aria-label="Close" title="Close">&times;</button></div><p class="sub">'+esc(exam?.title||'Exam')+'</p><fieldset><label>Recipient<select name="student" required><option value="group">'+esc('Whole group · '+(group?.title||'Current subgroup'))+'</option>'+students.map(user=>'<option value="'+esc(user.id)+'">'+esc(user.name||user.login)+'</option>').join('')+'</select></label></fieldset><p class="sub" role="status">'+(students.length?'':'No active students in this subgroup.')+'</p><div class="content-copy-actions"><button class="btn" type="button" data-cancel>Cancel</button><button type="submit" class="btn primary"'+(students.length?'':' disabled')+'>Assign exam</button></div></form>';
    dialog.querySelector('select').insertAdjacentHTML('afterbegin','<option value="" selected disabled>Choose recipient</option>');
    document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>{dialog.remove();button.focus();};
    const outside=event=>{const rect=dialog.getBoundingClientRect();return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;};let pressedOutside=false;
    dialog.addEventListener('pointerdown',event=>{pressedOutside=event.target===dialog&&outside(event);});dialog.addEventListener('click',event=>{if(pressedOutside&&event.target===dialog&&outside(event))dialog.close();});
    const keys=new Map();dialog.querySelector('form').onsubmit=async submit=>{
      submit.preventDefault();const form=submit.currentTarget,studentId=form.elements.student.value,save=form.querySelector('[type=submit]');save.disabled=true;
      try{
        if(authUser?.id!==actor||Number(examViewGroup)!==groupId)throw Error('Account or subgroup changed. Reopen assignment.');
        if(!keys.has(studentId))keys.set(studentId,crypto.randomUUID());
        await accountFetch('/api/exams/assign',{method:'POST',body:JSON.stringify({examId,groupId,...(studentId==='group'?{targetKind:'group'}:{studentId}),clientKey:keys.get(studentId)})});
        dialog.close();examSection='assigned';await examPull(true);examPaintList();
      }catch(error){form.querySelector('[role=status]').textContent=error.message;}finally{save.disabled=false;}
    };
  }catch(error){window.LearningMain.notice(error.message,true);}finally{button.disabled=false;}
});
const roleExamListBefore=examPaintList;
examPaintList=function(){
  roleExamListBefore();
  document.querySelectorAll('nav [data-exam-menu-label]').forEach(label=>{
    const text=[...label.childNodes].find(node=>node.nodeType===3);if(text)text.textContent='Exam';
  });
};
