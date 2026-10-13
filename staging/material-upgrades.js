// Editor adapters keep new definitions separate from immutable submitted snapshots.
const materialModel=()=>window.MaterialScoring;
var materialReviewStudent=null;
const materialReviewActive=()=>!!materialReviewStudent&&!viewAccount&&!!authUser&&['ADMIN','DEVELOPER'].includes(authUser.role);
const materialCanEditBefore=canEditLessons,materialCanTuneBefore=canTuneStudentLessons,materialWorkAccountBefore=examWorkAccount;
canEditLessons=()=>materialReviewActive()?false:materialCanEditBefore();
canTuneStudentLessons=()=>materialReviewActive()||materialCanTuneBefore();
examWorkAccount=()=>materialReviewActive()?materialReviewStudent.id:materialWorkAccountBefore();
const materialShowBefore=show;
show=function(id){if(!['material','examblocks'].includes(id)&&materialReviewStudent){materialReviewStudent=null;examResetWork();}return materialShowBefore(id);};
document.addEventListener('click',event=>{const button=event.target.closest('[data-exam-open]');if(!button||viewAccount||!authUser||!['ADMIN','DEVELOPER'].includes(authUser.role))return;const exam=examFind(button.dataset.examOpen);if(exam?.studentId&&['ready','completed'].includes(exam.instanceStatus)){event.preventDefault();event.stopImmediatePropagation();materialReviewStudent={id:exam.studentId,name:exam.studentName,email:exam.studentEmail};examResetWork();examCurrentId=domEntityId(button.dataset.examOpen);visit('examblocks');}},true);
const materialV3=doc=>!!doc?.examOwned&&doc.blocks?.some(part=>part.scoringVersion>=3);
const materialWhole=part=>['task','text'].includes(part.type)||['Match','Memory'].includes(part.quizType);
const materialBlankBefore=lmBlank;
lmBlank=function(type,quizType){
  const part=materialBlankBefore(type,quizType);
  if(lmState?.examOwned&&['task','text','cards','vocab','exercise','quiz'].includes(type)){
    part.scoringVersion=3;part.assignmentId||='a-'+crypto.randomUUID();part.maxPoints='';
    if(!materialWhole(part))for(const item of part.items||[])item.maxPoints='';
  }else if(!lmState?.examOwned){delete part.assessed;delete part.maxPoints;delete part.criteria;}
  return part;
};
const materialBodyBefore=lmBody;
lmBody=function(part){
  if(part.contentGroup)return '<label>Title<input type="text" data-field="title" data-block="'+part.id+'" value="'+esc(part.title||'')+'"></label>';
  if(part.type==='heading')return '<label>Heading<input type="text" data-field="text" data-block="'+part.id+'" value="'+esc(part.text||'')+'"></label><label>Level<select data-field="level" data-block="'+part.id+'">'+['h1','h2','h3','h4','h5'].map(level=>'<option value="'+level+'"'+(part.level===level?' selected':'')+'>'+level.toUpperCase()+'</option>').join('')+'</select></label>';
  return materialBodyBefore(part);
};
const materialQuizItemBefore=lmQuizItemEditor;
lmQuizItemEditor=function(part,index){
  const html=materialQuizItemBefore(part,index);
  return ['Spell','Letters','Hangman'].includes(part.quizType)?lmItemField(part,'items',index,'prompt','Prompt / hint',true)+html:html;
};
const materialActiveBefore=assessmentActive;
assessmentActive=doc=>!!doc?.examOwned;
const materialMaxBefore=assessmentMax,materialUnitBefore=assessmentUnitMax,materialQuestionsBefore=assessmentQuestions,materialAnswerQuestionsBefore=assessmentAnswerQuestions;
assessmentMax=function(part,index){return part.scoringVersion>=3?materialModel().examAnswerQuestions([part]).find(q=>q.index===index)?.max??0:materialMaxBefore(part,index);};
assessmentUnitMax=function(part){return part.scoringVersion>=3||part.contentGroup?materialModel().examTaskMax(lmState.blocks,part):materialUnitBefore(part);};
assessmentQuestions=function(doc){return materialV3(doc)?materialModel().examGrading(doc.blocks):materialQuestionsBefore(doc);};
assessmentAnswerQuestions=function(doc){return materialV3(doc)?materialModel().examAnswerQuestions(doc.blocks):materialAnswerQuestionsBefore(doc);};
const materialChildrenBefore=examScoringChildren,materialTaskMaxBefore=examScoringMax;
examScoringChildren=(parts,part)=>part.scoringVersion>=3||parts.some(p=>p.contentGroup)?materialModel().examChildren(parts,part):materialChildrenBefore(parts,part);
examScoringMax=(parts,part,seen)=>part.scoringVersion>=3||part.contentGroup?materialModel().examTaskMax(parts,part,seen):materialTaskMaxBefore(parts,part,seen);
const materialGroupEditorBefore=assessmentGroupEditor;
assessmentGroupEditor=function(part){
  const containers=(lmState.blocks||[]).filter(p=>p.type==='task'||p.contentGroup);containers.forEach(p=>p.assignmentId||='a-'+crypto.randomUUID());
  const descendant=new Set([part.assignmentId||'part-'+part.id]);let expanded=true;
  while(expanded){expanded=false;for(const p of containers)if(descendant.has(p.assignmentKey)&&!descendant.has(p.assignmentId)){descendant.add(p.assignmentId);expanded=true;}}
  return '<label>Assignment<select data-field="assignmentKey" data-block="'+part.id+'"><option value="">Standalone</option>'+containers.filter(p=>p!==part&&!descendant.has(p.assignmentId)).map(p=>'<option value="'+esc(p.assignmentId)+'"'+(part.assignmentKey===p.assignmentId?' selected':'')+'>'+esc(p.title||'Task')+'</option>').join('')+'</select></label>';
};
function materialUpgradeTemplate(){
  if(!lmState?.examOwned||!canEditLessons()||viewAccount||examFind(lmState.examId)?.instanceStatus)return;
  for(const part of lmState.blocks||[]){
    if(!['task','text','cards','vocab','exercise','quiz'].includes(part.type)||part.contentGroup||part.scoringVersion>=3)continue;
    const oldMax=materialModel().examElementMax(part),items=part.items||[];
    part.scoringVersion=3;part.assignmentId||='a-'+crypto.randomUUID();
    if(!materialWhole(part))for(const item of items)if(item.maxPoints==null)item.maxPoints=Number((oldMax/Math.max(1,items.length)).toFixed(10));
  }
}
const materialEditorBefore=lmRenderEditor;
lmRenderEditor=function(){
  materialUpgradeTemplate();materialEditorBefore();const root=document.getElementById('lmBlocks');if(!root)return;
  for(const panel of root.querySelectorAll('[data-block-id]')){
    const part=lmBlock(panel.dataset.blockId);if(!part)continue;
    if(part.contentGroup)panel.querySelector('.lm-type').textContent='Content group';
    if(part.type==='exercise')panel.querySelector('.lm-type').textContent='Questions';
    if(part.type==='text'&&part.answerEnabled)panel.querySelector('.lm-type').textContent='Answer';
    if(part.quizType==='Memory')panel.querySelector('[data-field=memorySize]')?.closest('label')?.remove();
    panel.querySelector('[data-field=assessed]')?.closest('label')?.remove();
    if(!lmState.examOwned||part.contentGroup){panel.querySelector('.lm-max-score')?.remove();panel.querySelector('[data-field=criteria]')?.closest('label')?.remove();continue;}
    if(part.scoringVersion<3)continue;
    const scored=materialModel().examAnswered(part);if(!scored){panel.querySelector('.lm-max-score')?.remove();continue;}
    let label=panel.querySelector('.lm-max-score');
    if(!label){label=document.createElement('label');label.className='lm-max-score';label.innerHTML='Maximum points<input type="text" inputmode="decimal" data-field="maxPoints" data-block="'+part.id+'">';panel.querySelector('.lm-head-actions').prepend(label);}
    const input=label.querySelector('input'),derived=materialModel().examChildren(lmState.blocks,part).length||!materialWhole(part);
    input.readOnly=!!derived;input.value=derived?assessmentUnitMax(part):part.maxPoints??'';
    if(!materialWhole(part))panel.querySelector('[data-field=criteria]')?.closest('label')?.remove();
    if(!materialWhole(part))panel.querySelectorAll('.lm-card-list>.lm-card-row').forEach((row,index)=>{
      const item=part.items?.[index];if(!item)return;
      const points=document.createElement('label');points.className='material-item-max';points.innerHTML='Maximum points<input type="text" inputmode="decimal" data-item-list="items" data-item="'+index+'" data-item-field="maxPoints" data-block="'+part.id+'" value="'+esc(String(item.maxPoints??''))+'">';row.querySelector('.lm-card-fields').append(points);
    });
  }
  root.querySelectorAll('[data-opt]').forEach(field=>{
    const [id,index,option]=field.dataset.opt.split(':'),part=lmBlock(id),count=part.items[index].options.length;
    field.insertAdjacentHTML('afterend','<button class="lm-icon material-option-remove" type="button" data-material-option-remove="'+esc(field.dataset.opt)+'" aria-label="Remove option" title="Remove option"'+(count<=2?' disabled':'')+'><i data-lucide="minus"></i></button>');
  });
  window.ColorPicker?.scan(root);window.lucide?.createIcons();
};
document.addEventListener('input',event=>{if(!lmState?.examOwned||!canEditLessons()||!event.target.matches('[data-field=maxPoints],[data-item-field=maxPoints]'))return;for(const label of document.querySelectorAll('#lmBlocks .lm-max-score')){const input=label.querySelector('input'),part=lmBlock(input?.dataset.block);if(part&&input.readOnly)input.value=assessmentUnitMax(part);}});
const materialChromeBefore=lmPaintChrome;
lmPaintChrome=function(){
  materialChromeBefore();const picker=document.getElementById('lmPicker');if(!picker)return;
  const blocks=[['text','Text'],['heading','Heading'],['task','Task'],['cards','Cards'],['vocab','Vocabulary'],['exercise','Questions'],['pdf','PDF'],['image','Image'],['audio','Audio'],['video','Video'],['file','File'],['link','Link'],['note','Note'],['phrase','Phrase'],['dialogue','Dialogue'],['reading','Reading'],['pronunciation','Pronunciation'],['table','Table'],['divider','Divider'],['wordcard','Word'],['rule','Rule']];
  picker.innerHTML='<div class="lm-picker-grid">'+blocks.map(([type,label])=>'<button type="button" data-add-block="'+type+'">'+label+'</button>'+(type==='text'?'<button type="button" data-material-answer>Answer</button>':'')).join('')+'<button type="button" data-material-group>Content group</button><button type="button" data-material-quiz-menu aria-expanded="false">Quiz</button></div><div class="lm-picker-grid" data-material-quiz-types hidden>'+window.MaterialQuiz.types.filter(type=>!lmState?.examOwned||type!=='Flip').map(type=>'<button type="button" data-add-block="quiz" data-quiz="'+type+'">'+type+'</button>').join('')+'</div>';
};
document.addEventListener('click',event=>{
  const group=event.target.closest('[data-material-group]'),quiz=event.target.closest('[data-material-quiz-menu]'),remove=event.target.closest('[data-material-option-remove]'),deleted=event.target.closest('[data-lm-del]');
  if(quiz){event.preventDefault();event.stopImmediatePropagation();const list=document.querySelector('[data-material-quiz-types]');list.hidden=!list.hidden;quiz.setAttribute('aria-expanded',String(!list.hidden));return;}
  if(!canEditLessons()||!lmState)return;
  if(event.target.closest('[data-material-answer]')){event.preventDefault();event.stopImmediatePropagation();const part=lmBlank('text');part.answerEnabled=true;part.title='Answer';lmState.blocks.push(part);document.getElementById('lmPicker').hidden=true;lmSchedule();lmRenderEditor();return;}
  if(group){event.preventDefault();event.stopImmediatePropagation();const part=lmBlank('task');part.contentGroup=true;part.title='Content group';delete part.maxPoints;delete part.criteria;delete part.text;delete part.response;lmState.blocks.push(part);document.getElementById('lmPicker').hidden=true;lmSchedule();lmRenderEditor();return;}
  if(remove){event.preventDefault();event.stopImmediatePropagation();const [id,index,option]=remove.dataset.materialOptionRemove.split(':'),part=lmBlock(id),item=part?.items[index],oi=Number(option);if(!item||item.options.length<=2)return;item.options.splice(oi,1);if(item.answer!=null)item.answer=Number(item.answer)===oi?0:Number(item.answer)>oi?Number(item.answer)-1:item.answer;if(item.answers)item.answers=item.answers.filter(i=>i!==oi).map(i=>i>oi?i-1:i);lmSchedule();lmRenderEditor();return;}
  if(deleted){const part=lmBlock(deleted.dataset.lmDel);if(part)for(const child of lmState.blocks||[])if(child.assignmentKey===(part.assignmentId||'part-'+part.id))delete child.assignmentKey;}
},true);
const materialPreviewBlockBefore=lmPreviewBlock;
lmPreviewBlock=function(part){
  if(part.contentGroup)return '';
  if(part.type==='text'&&part.answerEnabled&&!lmState?.examOwned)return materialPreviewBlockBefore(part)+'<label>Answer<textarea data-material-answer-input="'+part.id+'"'+(viewAccount?' disabled':'')+'>'+esc(part.response||'')+'</textarea></label>';
  if(part.type==='heading'){const level=/^h[1-5]$/.test(part.level)?part.level:'h2';return '<'+level+'>'+esc(part.text||'')+'</'+level+'>';}
  if(part.type==='quiz'&&!lmState?.examOwned)return window.MaterialQuiz.render(part,{values:materialWhole(part)?{0:part.response||part.items[0]?.typed||''}:Object.fromEntries((part.items||[]).map((item,i)=>[i,item.given??item.typed??item.picked??''])),locked:!!viewAccount,exam:false});
  return materialPreviewBlockBefore(part);
};
const materialPreviewPartsBefore=lmPreviewParts;
lmPreviewParts=function(parts){
  if(!parts.some(part=>part.contentGroup))return materialPreviewPartsBefore(parts);
  const all=new Map(parts.map(part=>[part.assignmentId||'part-'+part.id,part])),visiting=new Set();
  const paint=part=>{if(visiting.has(part))return '';visiting.add(part);const key=part.assignmentId||'part-'+part.id,children=parts.filter(child=>child!==part&&child.assignmentKey===key),content=part.contentGroup?'':lmPreviewPartsFlat([part]);const body=content+children.map(paint).join('');visiting.delete(part);return part.contentGroup?'<section class="content-group" data-assignment="'+esc(key)+'"><header><h3>'+esc(part.title||'Content group')+'</h3></header>'+body+'</section>':children.length?'<section class="lm-assignment" data-assignment="'+esc(key)+'"><header><h3>'+esc(part.title||'Task')+'</h3></header>'+body+'</section>':body;};
  return parts.filter(part=>!part.assignmentKey||!all.has(part.assignmentKey)).map(paint).join('');
};
const materialRenderPreviewBefore=lmRenderPreview;
lmRenderPreview=function(){materialRenderPreviewBefore();if(!lmState?.examOwned)window.MaterialQuiz?.bind(document.getElementById('lmPreview'),{
  block:id=>(lmState.blocks||[]).find(part=>String(part.id)===id),locked:()=>!!viewAccount,
  get:(part,index)=>materialWhole(part)?part.response||part.items?.[0]?.typed||'':part.items[index]?.given??part.items[index]?.typed??part.items[index]?.picked??'',
  set:(part,index,value)=>{if(materialWhole(part)){part.response=value;if(part.items?.[0])part.items[0].typed=String(value);}else{part.items[index].typed=Array.isArray(value)?JSON.stringify(value):String(value);if(typeof value==='number')part.items[index].picked=value;}if(authUser&&accountReady&&part.stageBlockRevision)window.TursoMain.response(lmState.id,part,stageResponseValue(part,false),true);},
});if(!lmState?.examOwned)document.querySelectorAll('#lmPreview [data-response],#lmPreview [data-material-answer-input],#lmPreview input[data-write],#lmPreview input[data-mq-input]:not([readonly])').forEach(field=>{
  const widget=field.closest('[data-mq]'),key=field.dataset.write||field.dataset.response||field.dataset.materialAnswerInput||widget?.dataset.mq,[id,index]=String(key).split(':'),part=lmBlock(id);if(!part||viewAccount)return;const row=index!=null?part.items?.[Number(index)]:field.hasAttribute('data-mq-input')?part.items?.[Number(field.dataset.mqInput)]:part;
  if(!row)return;window.TextColors?.mount(field,{format:row===part?part.responseFormatting:row.typedFormatting,richTools:!!part.answerEnabled,onChange:format=>{if(row===part)part.responseFormatting=format;else row.typedFormatting=format;}});
});};
document.addEventListener('input',event=>{const field=event.target.closest('[data-material-answer-input]');if(!field||lmState?.examOwned||viewAccount)return;const part=lmBlock(field.dataset.materialAnswerInput);if(!part)return;part.response=field.value;if(accountReady&&part.stageBlockRevision)window.TursoMain.response(lmState.id,part,stageResponseValue(part));});
const materialApplyBefore=assessmentApply;
assessmentApply=function(doc,row){materialApplyBefore(doc,row);doc.recordings=row.recordings||{};doc.examSuggested=row.suggestedPoints||{};for(const part of doc.blocks||[]){if(part.scoringVersion>=3&&materialWhole(part))part.response=row.answers?.[part.id]?.[0]||'';if(row.saved&&canTuneStudentLessons()&&part.quizType==='Memory'&&doc.examSuggested[part.id]?.[0]!=null&&doc.examPoints?.[part.id]?.[0]==null)(doc.examPoints[part.id]||={})[0]=doc.examSuggested[part.id][0];}};
const materialCollectBefore=examCollectAnswers;
examCollectAnswers=function(doc){
  if(!materialV3(doc))return materialCollectBefore(doc);
  const answer={};for(const {part,index} of assessmentAnswerQuestions(doc)){const value=materialWhole(part)?part.response:part.items?.[index]?.given;if(value!==undefined&&value!==''&&(value!=null))(answer[part.id]||={})[index]=value;}return answer;
};
const materialPointBefore=examPointInput;
examPointInput=function(part,index,whole=false){
  if(part.scoringVersion<3)return materialPointBefore(part,index,whole);
  const max=assessmentMax(part,index),value=lmState.examPoints?.[part.id]?.[index]??'',error=lmState.examErrors?.[part.id]?.[index]||'';
  const item=materialWhole(part)?part:part.items?.[index]||{},rubric=assessmentRubric(item).map((criterion,i)=>'<label>'+esc(criterion.label)+' / '+criterion.max+'<input type="number" min="0" max="'+criterion.max+'" step="any" data-exam-criterion="'+part.id+':'+index+':'+i+'" value="'+esc(String(lmState.examCriteriaPoints?.[part.id]?.[index]?.[i]??''))+'"></label>').join('');
  return '<div class="assessment-grading">'+rubric+'<label>Points / '+max+'<input class="exam-points" type="text" inputmode="decimal" data-exam-points="'+part.id+':'+index+'" value="'+esc(String(value))+'"></label><label>Review<select data-exam-error="'+part.id+':'+index+'"><option value="">Unmarked</option><option value="correct"'+(error==='correct'?' selected':'')+'>Correct</option><option value="needs-work"'+(error==='needs-work'?' selected':'')+'>Needs work</option></select></label></div>';
};
function materialScoreHtml(part,index){return '<span class="material-maximum">Maximum '+assessmentMax(part,index)+(lmState.assessmentState==='published'?' · Score '+esc(String(lmState.examPoints?.[part.id]?.[index]??0)):'')+'</span>';}
function materialVoiceHtml(part,index){
  const target=lmState.reviewStudentId||viewAccount?.id;
  const recording=lmState.recordings?.[part.id]?.[index],query=new URLSearchParams({kind:'exam-block',id:lmState.blockId,part:part.id,index,...(target?{student:target}:{})});
  return '<div class="material-voice">'+(!canTuneStudentLessons()&&!lmState.studentSaved?'<button class="lm-icon" type="button" data-material-record="'+part.id+':'+index+'" aria-label="Record pronunciation" title="Record pronunciation"><i data-lucide="mic"></i></button>':'')+(recording?'<audio controls preload="none" src="/api/assessment/recording?'+esc(query.toString())+'"></audio>':'')+'<span data-material-record-status="'+part.id+':'+index+'" role="status"></span></div>';
}
const materialFillBefore=examFillAnswers;
examFillAnswers=function(){
  if(!materialV3(lmState))return materialFillBefore();
  const root=document.getElementById('lmPreview'),reviewer=canTuneStudentLessons(),locked=reviewer||lmState.studentSaved||!lmState.assessmentReady;
  for(const part of lmState.blocks||[]){
    if(!materialModel().examAnswered(part))continue;const panel=root.querySelector('[data-lm-panel="'+part.id+'"]');if(!panel)continue;
    if(materialModel().examChildren(lmState.blocks,part).length){panel.innerHTML='<h3>'+esc(part.title||'Task')+'</h3><p>'+esc(part.text||'')+'</p>';continue;}
    const feedback=index=>reviewer?examPointInput(part,index)+examFixInput(part,index):assessmentFeedback(part,index);
    if(part.type==='quiz')panel.innerHTML=window.MaterialQuiz.render(part,{exam:true,locked,values:materialWhole(part)?{0:part.response||''}:Object.fromEntries((part.items||[]).map((item,index)=>[index,item.given??''])),score:index=>materialScoreHtml(part,index),feedback,voice:index=>materialVoiceHtml(part,index)})+(materialWhole(part)?feedback(0):'')+(reviewer&&part.quizType==='Memory'&&lmState.examSuggested?.[part.id]?.[0]!=null?'<p>Suggested points: '+lmState.examSuggested[part.id][0]+'</p>':'');
    else if(['task','text'].includes(part.type))panel.innerHTML='<div class="material-question"><div class="material-question-head"><b>'+esc(part.title|| (part.type==='text'?'Answer':'Task'))+'</b>'+materialScoreHtml(part,0)+'</div>'+(part.type==='text'?'<div class="lm-copy"'+lmTextStyle(part)+'>'+lmClean(part.html)+'</div>':'<p>'+esc(part.text||'')+'</p>')+'<label>Your answer<textarea data-exam-response="'+part.id+'"'+(locked?' disabled':'')+'>'+esc(part.response||'')+'</textarea></label>'+feedback(0)+'</div>';
    else if(['cards','vocab'].includes(part.type))panel.innerHTML='<h3>'+esc(part.title|| (part.type==='cards'?'Cards':'Vocabulary'))+'</h3>'+(part.items||[]).map((item,index)=>'<div class="material-question"><div class="material-question-head"><b>'+esc(item.front||item.word||'Question')+'</b>'+materialScoreHtml(part,index)+'</div><label>Your answer<input type="text" data-exam-given="'+part.id+':'+index+'" value="'+esc(item.given||'')+'"'+(locked?' disabled':'')+'></label>'+feedback(index)+'</div>').join('');
    else if(part.type==='exercise')panel.innerHTML=(part.items||[]).map((item,index)=>window.MaterialQuiz.render({...part,id:part.id+'-'+index,quizType:item.kind==='write'?'Type':'Choice',items:[{...item,answer:item.kind==='write'?item.write:item.answer}]},{exam:true,locked,values:{0:item.given??''},score:()=>materialScoreHtml(part,index),feedback:()=>feedback(index)}).replace('data-mq="'+part.id+'-'+index+'"','data-mq="'+part.id+'" data-mq-offset="'+index+'"')).join('');
  }
  for(const group of root.querySelectorAll('.lm-assignment')){const owner=(lmState.blocks||[]).find(part=>(part.assignmentId||'part-'+part.id)===group.dataset.assignment);if(owner&&!owner.contentGroup){const header=group.querySelector('header');header?.querySelectorAll('.material-maximum,.exam-task-score').forEach(node=>node.remove());header?.insertAdjacentHTML('beforeend','<span class="material-maximum">Maximum '+assessmentUnitMax(owner)+((reviewer||lmState.assessmentState==='published')?' · Score <span data-exam-task-earned="'+esc(group.dataset.assignment)+'"></span>':'')+'</span>');}}
  window.MaterialQuiz.bind(root,{block:id=>(lmState.blocks||[]).find(part=>String(part.id)===id),locked:()=>canTuneStudentLessons()||lmState.studentSaved||!lmState.assessmentReady,
    get:(part,index)=>materialWhole(part)?part.response:part.items[index]?.given??'',
    set:(part,index,value)=>{if(materialWhole(part))part.response=value;else part.items[index].given=value;assessmentAutosave(lmState);}
  });
  root.querySelectorAll('textarea[data-exam-response],input[type=text][data-exam-given],textarea[data-exam-fix],input[data-mq-input]').forEach(field=>{
    const widget=field.closest('[data-mq]'),quizKey=widget?widget.dataset.mq+':'+(Number(field.dataset.mqInput||0)+Number(widget.dataset.mqOffset||0)):null;
    const key=field.dataset.examFix||field.dataset.examGiven||quizKey||field.dataset.examResponse+':0',[id,index]=key.split(':'),feedback=field.hasAttribute('data-exam-fix'),map=feedback?(lmState.examCommentFormatting||={}):(lmState.examAnswerText||={});
    if(reviewer&&!feedback){const part=lmState.blocks.find(p=>String(p.id)===id);field.hidden=true;field.insertAdjacentHTML('afterend',reviewEditor(part,Number(index),field.value));return;}
    const part=lmState.blocks.find(part=>String(part.id)===id),format=map[id]?.[index];
    if(field.disabled&&format){field.hidden=true;field.insertAdjacentHTML('afterend','<div class="text-color-rich">'+window.TextColors.html(field.value,format)+'</div>');return;}
    window.TextColors?.mount(field,{format,richTools:part?.type==='text'&&!feedback,onChange:value=>{(map[id]||={})[index]=value;}});
  });
  examRefreshTaskScores();window.ColorPicker?.scan(root);window.lucide?.createIcons();
};
const materialRefreshScoresBefore=examRefreshTaskScores;
examRefreshTaskScores=function(){
  if(!materialV3(lmState))return materialRefreshScoresBefore();
  document.querySelectorAll('[data-exam-task-earned]').forEach(node=>{
    const descendants=new Set([node.dataset.examTaskEarned]);let expanded=true;
    while(expanded){expanded=false;for(const part of lmState.blocks)if(descendants.has(part.assignmentKey)){const key=part.assignmentId||'part-'+part.id;if(!descendants.has(key)){descendants.add(key);expanded=true;}}}
    const total=assessmentQuestions(lmState).filter(q=>descendants.has(q.part.assignmentId||'part-'+q.part.id)).reduce((sum,q)=>sum+(Number(String(lmState.examPoints?.[q.part.id]?.[q.index]||0).replace(',','.'))||0),0);node.textContent=String(Number(total.toFixed(10)));
  });
};
const materialListBefore=examPaintList;
examPaintList=function(){
  const tabs=document.getElementById('examSections');if(tabs){tabs.innerHTML=['active','ready','completed'].map((key,index)=>'<button class="btn'+(examSection===key?' primary':'')+'" type="button" data-exam-section="'+key+'">'+['Exams','Ready for review','Completed'][index]+'</button>').join('');const add=document.getElementById('examNew');add?.before(tabs);}
  materialListBefore();const box=document.getElementById('examList');if(!box)return;
  const selected=examShown().filter(exam=>examSection==='ready'?exam.instanceStatus==='ready':examSection==='completed'?exam.instanceStatus==='completed':!exam.instanceStatus||exam.instanceStatus==='active');
  let previous;box.innerHTML=selected.filter(exam=>canEditLessons()||canTuneStudentLessons()||!!exam.studentId).sort((a,b)=>String(a.groupTitle||classGroups.find(g=>g.id===a.groupId)?.title||'Unassigned').localeCompare(String(b.groupTitle||classGroups.find(g=>g.id===b.groupId)?.title||'Unassigned'))||(b.created||0)-(a.created||0)).map(exam=>{
    const group=exam.groupTitle||classGroups.find(g=>g.id===exam.groupId)?.title||'Unassigned',heading=previous!==group?'<h2 class="lib-h">'+esc(group)+'</h2>':'';previous=group;
    const title=esc(exam.title||'Exam')+(exam.studentId&&canEditLessons()?'<span class="exam-student">'+esc(exam.studentName||exam.studentId)+' · '+esc(exam.studentEmail||'')+'</span>':''),maximum=exam.maximumPoints??examVisibleBlocks(exam).reduce((n,b)=>n+assessmentQuestions({...b.doc,examOwned:true}).reduce((m,q)=>m+q.max,0),0);
    const hidden=viewAccount?!!exam.personalHidden:!!exam.hidden;
    const about=(exam.instanceStatus==='ready'?'Ready for review':exam.instanceStatus==='completed'?'Completed':hidden?(viewAccount?'Hidden for this student':'Hidden'):exam.published?'Published':'Draft')+' · Maximum '+maximum+(exam.instanceStatus==='completed'?' · '+exam.earnedPoints+' points':'');
    const tools=exam.instanceStatus==='completed'&&canEditLessons()?'<div class="day-tools"><button class="day-del" type="button" data-material-remove-reference="'+exam.id+'" title="Remove from my list" aria-label="Remove from my list"><i data-lucide="trash-2"></i></button></div>':exam.instanceStatus?'':examTools('exam',exam.id,hidden);
    return heading+'<div class="day-row"><button class="day" type="button" data-exam-open="'+exam.id+'"><span class="date">'+esc(lmDateChip(exam.date).day)+'</span><b>'+title+'</b><span class="label about">'+esc(about)+'</span></button>'+tools+'</div>';
  }).join('');window.lucide?.createIcons();
};
document.addEventListener('click',event=>{const button=event.target.closest('[data-material-remove-reference]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(!canEditLessons()||!confirm('Remove this completed work from your list? The student keeps their exam.'))return;const id=Number(button.dataset.materialRemoveReference);void accountFetch('/api/exams/'+id,{method:'DELETE'}).then(()=>{examSave(examLoad().filter(exam=>exam.id!==id));examPaintList();}).catch(error=>window.TursoMain.notice(error.message,true));},true);
const materialNormalizeBefore=examFromWire;
examFromWire=function(row){const value=materialNormalizeBefore(row);value.studentEmail=row.studentEmail||'';return value;};
const materialVisibilityPending=new Set();
let materialVisibilityQueue=Promise.resolve();
function materialVisibilityWrite(work){const next=materialVisibilityQueue.catch(()=>{}).then(work);materialVisibilityQueue=next;return next;}
toggleManagedVisibility=function(row,type){
  if(!canTuneStudentLessons()||!accountReady||viewSwitching)return;const key=type+':'+row.id;if(materialVisibilityPending.has(key))return;
  const actor=viewAccount.id,generation=viewGen,previous=!!row.personalHidden;materialVisibilityPending.add(key);
  const update=flag=>{row.personalHidden=flag;if(type==='group'){const found=classGroups.find(group=>group.id===row.id);if(found)found.personalHidden=flag;}else{const exams=examLoad();const found=type==='exam'?exams.find(exam=>exam.id===row.id):exams.flatMap(exam=>exam.blocks||[]).find(block=>block.id===row.id);if(found)found.personalHidden=flag;localStorage.setItem('enquiz-exams',JSON.stringify(exams));}};update(!previous);
  const repaint=()=>{if(type==='group')paintGroups();else if(type==='exam')examPaintList();else examPaintBlocks();};repaint();
  return materialVisibilityWrite(()=>{if(generation!==viewGen||viewAccount?.id!==actor)throw new Error('Account changed.');return window.TursoMain.setManagedVisibility(actor,type,row.id,previous,!previous);}).then(()=>{if(generation===viewGen&&viewAccount?.id===actor){window.ContentCache?.invalidate('account:bootstrap');repaint();}}).catch(error=>{if(generation===viewGen&&viewAccount?.id===actor){update(previous);repaint();window.TursoMain.notice(error.message,true);}}).finally(()=>materialVisibilityPending.delete(key));
};
const materialHideLessonBefore=stageHideLesson;
stageHideLesson=function(id){
  if(!viewAccount)return materialHideLessonBefore(id);id=stageDomId(id);
  const part=lmLibrary?.materials.find(row=>row.id===id),key='lesson:'+id;if(!part?.stageRevision||!canTuneStudentLessons()||viewSwitching||!accountReady||materialVisibilityPending.has(key))return;
  const account=viewAccount.id,generation=viewGen,expected={allowHidden:lmAllowedForStudent(id),personalHidden:lmHiddenForStudent(id)},changes={...expected};if(part.hiddenFromStudents)changes.allowHidden=!expected.allowHidden;else changes.personalHidden=!expected.personalHidden;
  const update=flags=>{const toggle=(list,on)=>on?[...new Set([...list,String(id)])]:list.filter(value=>String(value)!==String(id));installAllowedLessons(toggle(loadAllowedLessons(),flags.allowHidden));installHiddenLessons(toggle(loadHiddenLessons(),flags.personalHidden));paintLmDays();};
  materialVisibilityPending.add(key);update(changes);
  return materialVisibilityWrite(()=>{if(generation!==viewGen||viewAccount?.id!==account)throw new Error('Account changed.');return window.TursoMain.setManagedLessonAccess(account,id,expected,changes);}).catch(error=>{if(generation===viewGen&&viewAccount?.id===account){update(expected);window.TursoMain.notice(error.message,true);}}).finally(()=>materialVisibilityPending.delete(key));
};
globalThis.lmHideLesson=stageHideLesson;
let materialRecording;
document.addEventListener('click',event=>{if(event.target.closest('#examSave')&&lmState?.recordingBusy){event.preventDefault();event.stopImmediatePropagation();assessmentStatus('Finish recording before submitting.');}},true);
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-material-record]');if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(materialRecording){materialRecording.recorder.stop();return;}
  const doc=lmState,actor=authUser?.id,generation=viewGen,key=button.dataset.materialRecord,[part,index]=key.split(':');
  if(!doc?.examOwned||canTuneStudentLessons()||doc.studentSaved||!doc.assessmentReady)return;
  const valid=()=>lmState===doc&&authUser?.id===actor&&viewGen===generation&&!viewAccount&&!doc.studentSaved&&document.getElementById('material')?.classList.contains('on');
  const status=document.querySelector('[data-material-record-status="'+key+'"]');
  doc.recordingBusy=true;
  try{
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Audio recording is unavailable in this browser.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!valid()){stream.getTracks().forEach(track=>track.stop());doc.recordingBusy=false;return;}
    const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(value=>MediaRecorder.isTypeSupported(value));
    const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream),chunks=[];
    materialRecording={recorder,stream,doc};status.textContent='Recording...';button.setAttribute('aria-label','Stop recording');button.title='Stop recording';
    recorder.ondataavailable=chunk=>{if(chunk.data.size)chunks.push(chunk.data);};
    const timeout=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},180000);
    recorder.onstop=async()=>{
      clearTimeout(timeout);stream.getTracks().forEach(track=>track.stop());materialRecording=null;
      if(!valid()){doc.recordingBusy=false;return;}
      try{
        const blob=new Blob(chunks,{type:recorder.mimeType});if(!blob.size)throw new Error('The recording is empty.');if(blob.size>25*1024*1024)throw new Error('Maximum recording size is 25 MB.');status.textContent='Saving recording...';
        if(assessmentPendingDoc===doc){clearTimeout(assessmentTimer);assessmentPendingDoc=null;await assessmentWrite(doc,'draft');}await assessmentQueue;
        if(!valid())return;const params=new URLSearchParams({kind:'exam-block',id:doc.blockId,part,index,expectedRevision:doc.assessmentRevision||0});
        const saved=await accountFetch('/api/assessment/recording?'+params,{method:'POST',headers:{'Content-Type':blob.type},body:blob});
        if(!valid())return;((doc.recordings||={})[part]||={})[index]=saved;examFillAnswers();
      }catch(error){if(valid())status.textContent=error.message;}finally{doc.recordingBusy=false;button.setAttribute('aria-label','Record pronunciation');button.title='Record pronunciation';}
    };
    recorder.onerror=()=>{stream.getTracks().forEach(track=>track.stop());clearTimeout(timeout);materialRecording=null;doc.recordingBusy=false;if(valid())status.textContent='Recording failed. Try again.';};recorder.start();
  }catch(error){doc.recordingBusy=false;status.textContent=error.message;}
},true);
new MutationObserver(()=>{if(materialRecording&&(!document.getElementById('material')?.classList.contains('on')||lmState!==materialRecording.doc)){const current=materialRecording;materialRecording=null;current.stream.getTracks().forEach(track=>track.stop());if(current.recorder.state==='recording')current.recorder.stop();}}).observe(document.getElementById('material'),{attributes:true,attributeFilter:['class']});
