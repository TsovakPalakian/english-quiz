// Structured fields for the isolated local review pilot, not the production editor.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isPairs=type=>['Match','Memory'].includes(type);
const optionTypes=['Choice','Reverse','Listen','Definition','Select all','Odd one out','Video choice'];
const fields={
  Flip:[['front','Front'],['back','Back']],
  Choice:[['prompt','Question']],
  Type:[['prompt','Question'],['answer','Correct answer']],
  Gap:[['shown','Sentence with a blank'],['answer','Missing word'],['hint','Hint',true]],
  Build:[['parts','Shuffled words'],['answer','Complete sentence']],
  Match:[['left','Left'],['right','Right']],Memory:[['left','Left'],['right','Right']],
  'True / false':[['prompt','Statement']],Tap:[['text','Sentence'],['answer','Word to select']],
  'Select all':[['prompt','Question']],Reverse:[['front','Question'],['back','Answer on reverse']],
  Spell:[['word','Word'],['hint','Hint',true]],Letters:[['word','Word'],['hint','Hint',true]],Hangman:[['word','Word'],['hint','Hint',true]],
  Listen:[['prompt','Question'],['word','Word to pronounce'],['mediaId','Audio asset',true]],Definition:[['prompt','Definition'],['word','Target word']],
  'Odd one out':[['prompt','Grouping rule / question']],
  'Video choice':[['prompt','Question'],['mediaId','Video asset'],['transcript','Transcript']],
};
export function defaultReviewItems(type,c){
  const sentence=c.word==='bank'?'She opened an account at the bank.':'A fine drizzle started falling.';
  let item;
  if(type==='Flip')item={front:c.word,back:c.translation};
  else if(type==='Gap')item={shown:sentence.replace(c.word,'____'),answer:c.word,hint:c.translation};
  else if(type==='Type')item={prompt:c.translation,answer:c.word};
  else if(type==='Build')item={parts:sentence.split(' ').reverse().join(' '),answer:sentence};
  else if(isPairs(type))return [{left:c.word,right:c.translation},{left:'',right:''}];
  else if(type==='True / false')item={prompt:c.word+' means '+c.translation+'.',answer:'true'};
  else if(type==='Tap')item={text:sentence,answer:c.word};
  else if(['Spell','Letters','Hangman'].includes(type))item={word:c.word,hint:c.translation};
  else if(type==='Reverse')item={front:c.translation,back:c.word,options:[c.word,''],answer:0};
  else if(type==='Listen')item={prompt:'Choose the meaning of the word you hear.',word:c.word,options:[c.translation,''],answer:0};
  else if(type==='Video choice')item={prompt:'What does the speaker mean?',mediaId:'',transcript:'',options:[c.translation,''],answer:0};
  else if(type==='Definition')item={prompt:c.meaning,word:c.word,options:[c.word,''],answer:0};
  else if(type==='Select all')item={prompt:'Select all words that match the category.',options:[c.word,''],answers:[0]};
  else if(type==='Odd one out')item={prompt:'Which word does not belong to this category?',options:[c.word,''],answer:1};
  else item={prompt:c.word,options:[c.translation,''],answer:0};
  return [item];
}
function inputId(index,key){return (key==='front'||key==='shown'||key==='prompt'?'edit-prompt':key==='back'||key==='answer'?'edit-answer':'edit-'+key)+(index?'-'+index:'');}
export function renderReviewItems(type,items){
  return items.map((item,index)=>'<fieldset class="editor-item" data-editor-item="'+index+'"><legend>'+(isPairs(type)?'Pair':'Item')+' '+(index+1)+'</legend><div class="item-tools"><button type="button" data-remove-item="'+index+'" aria-label="Remove '+(isPairs(type)?'pair':'item')+' '+(index+1)+'" title="Remove" '+(items.length<=(isPairs(type)?2:1)?'disabled':'')+'>&times;</button></div>'+fields[type].map(([key,label,optional])=>'<label>'+label+'<input id="'+inputId(index,key)+'" data-field="'+key+'" maxlength="'+(key==='word'?200:2000)+'" '+(optional?'':'required')+' value="'+esc(item[key])+'"></label>').join('')+(type==='True / false'?'<label>Correct answer<select data-field="answer"><option value="true" '+(item.answer==='true'?'selected':'')+'>True</option><option value="false" '+(item.answer==='false'?'selected':'')+'>False</option></select></label>':'')+(optionTypes.includes(type)?'<div class="option-editor"><p class="muted small">'+(type==='Select all'?'Correct answers':'Correct answer')+'</p>'+item.options.map((text,i)=>'<div class="option-row"><input type="'+(type==='Select all'?'checkbox':'radio')+'" name="answer-'+index+'" data-correct="'+i+'" aria-label="Option '+(i+1)+' is correct" '+((type==='Select all'?item.answers.includes(i):item.answer===i)?'checked':'')+'><input data-option="'+i+'" aria-label="Option '+(i+1)+'" value="'+esc(text)+'" maxlength="1000" required><button type="button" data-remove-option="'+i+'" aria-label="Remove option '+(i+1)+'" title="Remove option" '+(item.options.length<=2?'disabled':'')+'>&times;</button></div>').join('')+'<button type="button" data-add-option aria-label="Add option to item '+(index+1)+'" '+(item.options.length>=12?'disabled':'')+'>+ Add option</button></div>':'')+'</fieldset>').join('');
}
export function readReviewItems(type,root){
  return [...root.querySelectorAll('[data-editor-item]')].map(row=>{
    const item={};row.querySelectorAll('[data-field]').forEach(input=>{if(input.value.trim()||!fields[type].some(f=>f[0]===input.dataset.field&&f[2]))item[input.dataset.field]=input.value.trim();});
    if(optionTypes.includes(type)){
      item.options=[...row.querySelectorAll('[data-option]')].map(input=>input.value.trim());
      const checked=[...row.querySelectorAll('[data-correct]:checked')].map(input=>Number(input.dataset.correct));
      if(type==='Select all')item.answers=checked;else item.answer=checked[0]??-1;
    }
    return item;
  });
}
export function editReviewItems(type,items,target){
  if(target.id==='add-quiz-item'){
    if(items.length>=50)return items;
    return [...items,isPairs(type)?{left:'',right:''}:structuredClone(items[0])];
  }
  const row=target.closest('[data-editor-item]');if(!row)return items;
  const index=Number(row.dataset.editorItem),item=items[index];
  if(target.hasAttribute('data-remove-item'))return items.length>(isPairs(type)?2:1)?items.filter((_,i)=>i!==index):items;
  if(target.hasAttribute('data-add-option')&&item.options.length<12)item.options.push('');
  if(target.hasAttribute('data-remove-option')&&item.options.length>2){
    const removed=Number(target.dataset.removeOption);item.options.splice(removed,1);
    if(type==='Select all')item.answers=item.answers.filter(i=>i!==removed).map(i=>i>removed?i-1:i);
    else item.answer=item.answer===removed?-1:item.answer>removed?item.answer-1:item.answer;
  }
  return items;
}
export function reviewItemPreview(type,item){
  if(isPairs(type))return '<div class="pair-preview"><span>'+esc(item.left)+'</span><span>'+esc(item.right)+'</span></div>';
  const prompt=item.shown||item.prompt||item.front||item.text||item.word||(type==='Build'?'Arrange the words':'');
  const answer=item.back??item.answer??item.word;
  const mediaUrl=item.mediaUrl||(item.mediaId?'/local/media/'+item.mediaId:null),tag=type==='Video choice'?'video':'audio';
  return '<div class="quiz-preview">'+(mediaUrl?'<'+tag+' controls preload="metadata" src="'+esc(mediaUrl)+'"'+(tag==='video'?' playsinline':'')+'></'+tag+'>':'')+'<strong class="quiz-content">'+esc(prompt)+'</strong>'+(type==='Build'?'<p class="muted">'+esc(item.parts)+'</p>':'')+(item.hint?'<p class="muted small">'+esc(item.hint)+'</p>':'')+(item.options?'<ol class="options">'+item.options.map((o,i)=>'<li class="'+((type==='Select all'?item.answers.includes(i):i===item.answer)?'correct':'')+'">'+esc(o)+((type==='Select all'?item.answers.includes(i):i===item.answer)?' ✓':'')+'</li>').join('')+'</ol>':'<p>Answer: '+esc(answer)+'</p>')+(type==='Listen'?'<p class="muted small">Word to pronounce: '+esc(item.word)+'</p>':'')+(item.transcript?'<p class="quiz-content"><strong>Transcript</strong>'+esc(item.transcript)+'</p>':'')+'</div>';
}
