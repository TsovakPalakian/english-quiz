// PDF drafts are staged in a dialog; nothing is applied before explicit selection.
var lmPdfDraftRequest = null;
function lmPdfApplyMetadata(draft,data,selected){
  if(selected){
    draft.title=data.title||draft.title||'';
    draft.description=data.description||'';
    if(data.unit)draft.unit=data.unit;
    if(data.lesson)draft.lesson=data.lesson;
    if(data.className)draft.className=data.className;
  }
  if(!String(draft.title||'').trim())draft.title=String(data.title||draft.title||'').trim();
  if(!draft.title)throw new Error('Enter a lesson title before applying the document.');
}
function lmPdfBlockBudget(occupied, incoming) {
  const used = Math.max(0, Math.trunc(Number(occupied) || 0));
  const added = Math.max(0, Math.trunc(Number(incoming) || 0));
  const room = Math.max(0, 200 - used);
  return { occupied: used, room, over: added > room };
}
function lmPdfBlockBudgetText(occupied, incoming) {
  const budget = lmPdfBlockBudget(occupied, incoming);
  return 'This lesson already has ' + budget.occupied + ' blocks. ' + budget.room + ' more can be added.';
}
function lmPdfIncomingBlocks(groups, selected, hasPdfBlock) {
  let count = 0;
  for (const [tab, rows] of Object.entries(groups || {})) if (selected?.has(tab)) count += Array.isArray(rows) ? rows.length : 0;
  if (selected?.has('pdf') && !hasPdfBlock) count += 1;
  return count;
}
function lmPdfPayloadBytes(draft) {
  const snapshot = window.LearningMain.lessonSnapshot(draft);
  const baseline = draft.stageLessonBaseline;
  const previous = new Map((baseline?.blocks || []).map(block => [block.id, block]));
  const upserts = snapshot.blocks.filter(block => JSON.stringify({ ...block, expectedRevision: 0 }) !== JSON.stringify({ ...(previous.get(block.id) || {}), expectedRevision: 0 }));
  const payload = baseline ? { changes: snapshot.changes, upserts, deletes: [], order: snapshot.blocks.map(block => block.id || null) } : snapshot;
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}
async function lmPdfSaveBounded(draft, current, active) {
  const target = (draft.blocks || []).slice();
  const occupied = (current?.blocks || []).length;
  const incoming = Math.max(0, target.length - occupied);
  if (lmPdfBlockBudget(occupied, incoming).over) throw new Error(lmPdfBlockBudgetText(occupied, incoming));
  let end = 0, batches = 0;
  if (!target.length) {
    await lmPdfSavePreparedDraft(draft, current, active);
    return 1;
  }
  while (end < target.length) {
    if (!active()) throw new Error('The lesson changed.');
    let next = end;
    while (next < target.length) {
      draft.blocks = target.slice(0, next + 1);
      if (lmPdfPayloadBytes(draft) > 58000) break;
      next += 1;
    }
    if (next === end) throw new Error('Selected content is too large for one save. Apply fewer sections.');
    draft.blocks = target.slice(0, next);
    await lmPdfSavePreparedDraft(draft, current, active);
    batches += 1;
    end = next;
  }
  return batches;
}
async function lmPdfSavePreparedDraft(draft,current,active){
  const oldId = current?.id;
  try{await window.LearningMain.saveLesson(draft);}
  finally{
    // Keep prepared content locally after a rejected or unconfirmed write.
    // The dialog and immutable import keys allow a retry without duplicates.
    if(active()){
      if(oldId && oldId !== draft.id){
        if(typeof classGroups !== 'undefined' && Array.isArray(classGroups)){
          classGroups.forEach(group=>{
            if(Array.isArray(group.lessonIds)){
              group.lessonIds = group.lessonIds.map(lessonId => lessonId === oldId ? draft.id : lessonId);
            }
          });
          if(typeof groupSave === 'function') groupSave();
        }
        if(typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary?.materials)){
          lmLibrary.materials = lmLibrary.materials.filter(row => row.id !== oldId);
        }
      }
      window.ContentCache?.drop(':' + draft.id + ':');
      if(oldId) window.ContentCache?.drop(':' + oldId + ':');
      window.ContentCache?.drop('lesson:');
      window.ContentCache?.drop('library:summary');
      if(typeof stageWriteBlock === 'function'){
        stageWriteBlock(draft.id, 'blocks', draft.stageRevision || 0, { blocks: draft.blocks || [] });
        if(typeof stageFlushBlocks === 'function') stageFlushBlocks();
      }
      Object.assign(current,draft);
      lmKeepLesson();
      lmPersist();
    }
  }
}
function lmPdfGrammarMatch(title){
  const clean=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  const app=typeof window==='undefined'?{}:window,key=clean(title),matches=[];
  for(const name of Object.keys(app.GrammarDetails||{}))if(clean(name)===key)matches.push({grammarRule:name});
  for(const [id,topic] of Object.entries(app.GRAMMAR?.topics||{}))if(topic&&clean(topic.name)===key)matches.push({topic:topic.id||id,name:topic.name,compare:false});
  for(const topic of app.GRAMMAR?.comparisons||[])if(clean(topic.title)===key)matches.push({topic:topic.id,name:topic.title,compare:true});
  return matches.length===1?matches[0]:null;
}
function lmPdfProgress(label,completed=[],done=null,total=null){
  const drop=document.querySelector('[data-lesson-pdf-import]');if(!drop)return;
  let node=document.getElementById('lmPdfProgress');
  if(!node){node=document.createElement('div');node.id='lmPdfProgress';node.className='lm-pdf-progress';drop.before(node);}
  const measurable=Number.isFinite(done)&&total>0,percent=measurable?Math.floor(done/total*100):null;
  node.innerHTML='<div class="lm-pdf-ring'+(measurable?'':' is-indeterminate')+'" role="progressbar" aria-label="'+esc(label)+'"'+(measurable?' aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"':'')+' style="--pdf-progress:'+((percent||0)*3.6)+'deg"><span>'+(measurable?'<b>'+percent+'%</b>':'')+'<span>'+esc(label)+'</span></span></div><ul>'+completed.map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul>';
  let nextUpload=document.getElementById('lmPdfNextUpload');
  if(label==='Draft ready'){
    if(!nextUpload){
      nextUpload=document.createElement('div');
      nextUpload.id='lmPdfNextUpload';
      nextUpload.className='lm-pdf-next-upload card saas-card';
      node.after(nextUpload);
    }
    nextUpload.innerHTML='<div class="lm-pdf-ready-box" style="padding:16px 20px;"><button type="button" class="btn" id="lmPdfImportAnotherBtn">Import another PDF</button><div class="lm-drop lm-pdf-import is-ready-drop" style="margin-top:12px;cursor:pointer;"><span>Drop another file here or choose a file</span><small>Supports any lesson file or PDF</small></div></div>';
    nextUpload.querySelector('#lmPdfImportAnotherBtn').onclick=()=>document.querySelector('[data-lesson-pdf-import-file]')?.click();
    const dropPrompt=nextUpload.querySelector('.is-ready-drop');
    dropPrompt.onclick=()=>document.querySelector('[data-lesson-pdf-import-file]')?.click();
    dropPrompt.ondragover=e=>{e.preventDefault();dropPrompt.classList.add('is-over');};
    dropPrompt.ondragleave=()=>{dropPrompt.classList.remove('is-over');};
    dropPrompt.ondrop=e=>{
      e.preventDefault();
      dropPrompt.classList.remove('is-over');
      const file=e.dataTransfer?.files?.[0];
      if(file)lmImportPdfDraft(file);
    };
  } else {
    document.getElementById('lmPdfNextUpload')?.remove();
  }
  drop.hidden=true;
}
function lmPdfProgressEnd(){
  document.getElementById('lmPdfProgress')?.remove();
  document.getElementById('lmPdfNextUpload')?.remove();
  const drop=document.querySelector('[data-lesson-pdf-import]');if(drop)drop.hidden=false;
}
async function lmPdfPrepareCards(draft,active,onProgress=()=>{},selected=new Set(['words','phrases'])){
  const blocks=draft.blocks.filter(b=>b.pdfImport&&selected.has(b.tab)&&['vocab','phrase'].includes(b.type));
  for(const [index,block] of blocks.entries()){
    if(!active())throw new Error('The lesson or account changed.');
    const row=block.items[0],context={meaning:row.meaning,translation:row.translation||'',example:row.sourceExample??row.example??''},word=row.word||row.phrase;
    if(!context.translation)throw new Error('Missing Russian translation for '+word+'. Analyse the PDF again.');
    let card;
    for(let attempt=1;attempt<=2;attempt++){
      try{
        card=await window.LearningMain.lookupLessonCard(word,context);
        break;
      }catch(err){
        if(err?.status===0 && attempt<2 && active()){
          await new Promise(r=>setTimeout(r,300));
          continue;
        }
        throw err;
      }
    }
    if(!active())throw new Error('The lesson or account changed.');
    let definition;
    for(let attempt=1;attempt<=2;attempt++){
      try{
        definition=await window.LearningMain.dictionary({stageId:card.id});
        break;
      }catch(err){
        if(err?.status===0 && attempt<2 && active()){
          await new Promise(r=>setTimeout(r,300));
          continue;
        }
        throw err;
      }
    }
    if(!active())throw new Error('The lesson or account changed.');
    const content={pdfImport:block.pdfImport,pdfVocabulary:{word, ...context},collapsed:false};
    Object.assign(block,definition,{id:block.id,type:'wordcard',word,ru:context.translation,stageId:card.id,stageScope:'shared',...content,
      stageDefinition:{type:'wordcard',tab:block.tab,cardId:card.id,content:JSON.parse(JSON.stringify(content))}});
    delete block.items;onProgress(index+1,blocks.length);
  }
}
function lmPdfIdentity(block){
  const tab=block.pdfImport?.section||block.tab,item=block.items?.[0]||{};
  const clean=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  let identity;
  if(tab==='overview')identity=['overview'];
  else if(tab==='words')identity=[item.word,item.meaning||String(item.example||'').split(' — ')[0]||item.translation];
  else if(tab==='phrases')identity=[item.phrase,item.meaning];
  else if(block.type==='exercise')identity=[block.type,...(block.items||[]).map(row=>JSON.stringify([
    clean(row.prompt),row.kind,(row.options||[]).map(clean).sort(),clean(row.kind==='write'?row.write:(row.options||[])[Number(row.answer)])
  ]))];
  else if(block.type==='task')identity=[block.type,block.title,block.text];
  else identity=[block.type,block.html||block.text||block.title];
  return JSON.stringify([tab,...identity.map(clean)]);
}
async function lmPdfContentKey(block){
  const bytes=new TextEncoder().encode(lmPdfIdentity(block));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return (block.pdfImport?.section||block.tab)+':v2:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function lmPdfAppendSections(draft,groups,selected,hash,fileName,pdfTitle) {
  const known=new Set(),vocabulary=new Set();
  for(const old of draft.blocks){
    if(!old.pdfImport)continue;
    // v2 keys stay immutable after teacher edits. Old positional keys are compared
    // by content only; their numeric positions never identify an imported item.
    const key=/:v2:[a-f0-9]{64}$/.test(old.pdfImport.key||'')?old.pdfImport.key:await lmPdfContentKey(old);
    known.add(old.pdfImport.source+'|'+key);
    if(['words','phrases'].includes(old.tab))vocabulary.add(key);
  }
  let added=0;
  for(const [tab,blocks] of Object.entries(groups))if(selected.has(tab)){
    if(tab === 'overview' && draft.blocks.some(b => b.tab === 'overview')){
      const existing = draft.blocks.find(b => b.tab === 'overview');
      const newOverview = blocks[0];
      if (existing && newOverview && newOverview.html && !existing.html.includes(newOverview.html)) {
        existing.html = (existing.html || '') + '<hr style="margin:16px 0; border:none; border-top:1px dashed var(--line);">' + newOverview.html;
        added++;
      }
      continue;
    }
    for(const block of blocks){
      const key=block.pdfImport.key;
      if(known.has(hash+'|'+key)||['words','phrases'].includes(tab)&&vocabulary.has(key))continue;
      draft.blocks.push(JSON.parse(JSON.stringify(block)));added++;
      known.add(hash+'|'+key);if(['words','phrases'].includes(tab))vocabulary.add(key);
    }
  }
  if(selected.has('pdf')&&!draft.blocks.some(b=>b.type==='pdf'&&b.pdfImport?.source===hash)){
    draft.blocks.push({...lmBlank('pdf'),tab:'pdf',title:pdfTitle||fileName,pdfImport:{source:hash,section:'pdf',key:'pdf:0'}});
  }
  return added;
}
async function lmPdfDraftBlocks(data, hash) {
  const groups = {overview:[],words:[],phrases:[],rules:[],classwork:[]};
  if (Array.isArray(data.homework) && data.homework.length) groups.homework = [];
  const add=(tab,type,content,source,index)=>{
    groups[tab].push({...lmBlank(type),...content,tab,pdfImport:{source:hash,section:tab,pages:source.pages||[],generated:!!source.generated,...(source.stage?{stage:source.stage}:{})}});
  };
  add('overview','text',{html:'<p>'+esc(data.overview).replace(/\n/g,'<br>')+'</p>'},{},0);
  data.words.forEach((r,i)=>add('words','vocab',{title:r.word,items:[{word:r.word,meaning:r.meaning,translation:r.translation||'',ipa:'',sourceExample:r.example,example:r.meaning+(r.example?' — '+r.example:'')}]},r,i));
  data.phrases.forEach((r,i)=>add('phrases','phrase',{items:[{phrase:r.phrase,meaning:r.meaning,translation:r.translation||'',example:r.example}]},r,i));
  data.rules.forEach((r,i)=>add('rules','text',{html:'<h3>'+esc(r.title)+'</h3><p>'+esc(r.explanation).replace(/\n/g,'<br>')+'</p>'+r.examples.map(e=>'<p>'+esc(e)+'</p>').join('')},r,i));

  const addTasks = (tab, list) => {
    (list || []).forEach((r, i) => {
      if (r.kind === 'explanation') {
        add(tab, 'text', { html: '<h3>' + esc(r.title) + '</h3><p>' + esc(r.text).replace(/\n/g, '<br>') + '</p>' }, r, i);
      } else if (r.kind === 'choice') {
        add(tab, 'exercise', { items: [{ prompt: (r.title ? r.title + '\n' : '') + r.text, kind: 'choice', options: r.options, answer: r.answer, write: '' }], pdfTeacherNotes: r.feedback }, r, i);
      } else if (r.quizType && r.quizType !== 'Choice') {
        add(tab, 'quiz', {
          title: r.title || r.quizType,
          quizType: r.quizType,
          items: r.items || (r.quizType === 'Match' ? r.items : (r.quizType === 'Gap' ? [{ shown: r.shown, answer: r.answer, hint: r.hint }] : (r.quizType === 'Build' ? [{ parts: r.parts, answer: r.answer }] : (r.quizType === 'True / false' ? [{ prompt: r.prompt, answer: r.answer }] : (r.quizType === 'Select all' ? [{ prompt: r.prompt, options: r.options, answers: r.answers }] : (r.quizType === 'Odd one out' ? [{ options: r.options, answer: r.answer }] : [{ prompt: r.prompt, answer: r.answer }])))))),
          pdfTeacherNotes: r.feedback
        }, r, i);
      } else {
        add(tab, 'task', { title: r.title, text: r.text, criteria: r.criteria || 'Grammar and accuracy | 3\nVocabulary usage | 2', maxPoints: (r.criteria || '').split('\n').reduce((sum, line) => sum + (Number(line.split('|').pop()) || 0), 0) || 5, pdfTeacherNotes: r.teacherAnswer }, r, i);
      }
    });
  };

  addTasks('classwork', data.classwork);
  if (Array.isArray(data.homework) && data.homework.length) addTasks('homework', data.homework);

  await Promise.all(Object.values(groups).flat().map(async block=>{
    block.pdfImport.key=await lmPdfContentKey(block);
  }));
  groups.rules.forEach((block,index)=>{
    const title=data.rules[index].title,match=lmPdfGrammarMatch(title);
    if(match){block.pdfRuleSource=block.html;delete block.html;Object.assign(block,match,{type:'rule'});}
    else block.pdfGrammarMissing=title;
  });
  return groups;
}

function lmParseScriptToLessonData(text, defaultTitle = 'New Lesson', targetCwCount = null, targetHwCount = null) {
  function lmGenerateExercisesList(targetCount, words, phrases, rules, title, isHw = false) {
    const pool = words.map(w => ({ word: w.word, meaning: w.translation || w.meaning || w.word, example: w.example || ('Example with ' + w.word) }));
    phrases.forEach(p => pool.push({ word: p.phrase, meaning: p.translation || p.meaning || p.phrase, example: p.example || ('Example with ' + p.phrase) }));
    if (!pool.length) {
      const fallbackWords = ['structure', 'expression', 'context', 'accuracy', 'communication', 'objective', 'practice', 'fluency'];
      fallbackWords.forEach(w => pool.push({ word: w, meaning: w, example: 'Practice with ' + w }));
    }
    const items = [];
    const types = ['Choice', 'Gap', 'Match', 'Build', 'True / false', 'Type', 'Select all', 'Odd one out', 'Task'];
    const coverageCount = Math.min(types.length, targetCount);

    for (let i = 0; i < coverageCount; i++) {
      const t = types[i];
      const targetObj = pool[i % pool.length];
      const target = targetObj.word;
      const targetMeaning = targetObj.meaning;
      const d1 = pool[(i + 1) % pool.length].word;
      const d2 = pool[(i + 2) % pool.length].word;

      if (t === 'Choice') {
        items.push({
          stage: 'comprehension',
          title: (isHw ? 'HW Choice: ' : 'CW Choice: ') + target,
          text: 'Select the statement or definition that matches "' + target + '":',
          kind: 'choice',
          options: [targetMeaning, 'Alternative: ' + d1, 'Opposite of ' + d2],
          answer: 0,
          feedback: '"' + target + '" matches: ' + targetMeaning + '.',
          criteria: '',
          teacherAnswer: '',
          pages: [1],
          generated: true
        });
      } else if (t === 'Gap') {
        items.push({
          stage: 'guided',
          title: (isHw ? 'HW Gap: ' : 'CW Gap: ') + target,
          text: 'Complete the sentence with the appropriate target word.',
          quizType: 'Gap',
          shown: 'Learners need to understand the role of ___ in this lesson.',
          answer: target,
          hint: 'First letter: ' + target[0],
          pages: [1],
          generated: true
        });
      } else if (t === 'Match') {
        const p1 = pool[i % pool.length], p2 = pool[(i + 1) % pool.length], p3 = pool[(i + 2) % pool.length];
        items.push({
          stage: 'guided',
          title: (isHw ? 'HW Match: ' : 'CW Match: ') + title,
          text: 'Match each term with its corresponding definition or translation.',
          quizType: 'Match',
          items: [
            { left: p1.word, right: p1.meaning },
            { left: p2.word, right: p2.meaning },
            { left: p3.word, right: p3.meaning }
          ],
          pages: [1],
          generated: true
        });
      } else if (t === 'Build') {
        items.push({
          stage: 'guided',
          title: (isHw ? 'HW Build: ' : 'CW Build: ') + target,
          text: 'Reconstruct the sentence in the correct word order.',
          quizType: 'Build',
          parts: 'regularly / we / ' + target + ' / practice / in / class',
          answer: 'we regularly practice ' + target + ' in class',
          pages: [1],
          generated: true
        });
      } else if (t === 'True / false') {
        items.push({
          stage: 'comprehension',
          title: (isHw ? 'HW True/False: ' : 'CW True/False: ') + target,
          text: 'Evaluate whether the following statement is accurate.',
          quizType: 'True / false',
          prompt: 'The term "' + target + '" is appropriate in formal context: ' + targetMeaning + '.',
          answer: 'true',
          pages: [1],
          generated: true
        });
      } else if (t === 'Type') {
        items.push({
          stage: 'guided',
          title: (isHw ? 'HW Type: ' : 'CW Type: ') + target,
          text: 'Type the target vocabulary word matching the description.',
          quizType: 'Type',
          prompt: 'Type the term meaning "' + targetMeaning + '":',
          answer: target,
          pages: [1],
          generated: true
        });
      } else if (t === 'Select all') {
        items.push({
          stage: 'independent',
          title: (isHw ? 'HW Select All: ' : 'CW Select All: ') + title,
          text: 'Select all correct statements that apply.',
          quizType: 'Select all',
          prompt: 'Which statements apply to "' + target + '"?',
          options: [
            'It means ' + targetMeaning,
            'It cannot be used in conversation',
            'It connects to ' + title,
            'It is completely unrelated'
          ],
          answers: [0, 2],
          pages: [1],
          generated: true
        });
      } else if (t === 'Odd one out') {
        items.push({
          stage: 'independent',
          title: (isHw ? 'HW Odd One Out: ' : 'CW Odd One Out: ') + title,
          text: 'Choose the item that does not belong with the others.',
          quizType: 'Odd one out',
          options: [pool[0].word, pool[1 % pool.length].word, pool[2 % pool.length].word, 'banana'],
          answer: 3,
          pages: [1],
          generated: true
        });
      } else if (t === 'Task') {
        items.push({
          stage: 'final',
          title: (isHw ? 'Homework Production: ' : 'Classwork Production: ') + title,
          text: 'Write 3-4 sentences applying "' + target + '" in a realistic dialogue or short description.',
          kind: 'task',
          criteria: 'Grammar and accuracy | 3\nVocabulary usage | 2',
          teacherAnswer: 'Sample production: In our discussion, ' + target + ' played a central role.',
          pages: [1],
          generated: true
        });
      }
    }

    const rapidKinds = [
      { type: 'Choice', weight: 35 },
      { type: 'Match', weight: 20 },
      { type: 'True / false', weight: 15 },
      { type: 'Select all', weight: 10 },
      { type: 'Odd one out', weight: 10 },
      { type: 'Gap', weight: 10 }
    ];

    let seq = coverageCount + 1;
    const remainder = [];
    while (items.length + remainder.length < targetCount) {
      const roll = Math.random() * 100;
      let acc = 0, picked = 'Choice';
      for (const rk of rapidKinds) {
        acc += rk.weight;
        if (roll <= acc) { picked = rk.type; break; }
      }
      const targetObj = pool[seq % pool.length];
      const target = targetObj.word;
      const targetMeaning = targetObj.meaning;
      const d1 = pool[(seq + 1) % pool.length].word;
      const d2 = pool[(seq + 2) % pool.length].word;

      if (picked === 'Choice') {
        remainder.push({
          stage: 'guided',
          title: (isHw ? 'HW Choice ' : 'CW Choice ') + seq + ': ' + target,
          text: 'Identify the most suitable usage of "' + target + '":',
          kind: 'choice',
          options: ['Proper use in context of ' + targetMeaning, 'Distractor context: ' + d1, 'Incorrect form: ' + d2],
          answer: 0,
          feedback: 'Accurate usage matches ' + targetMeaning + '.',
          criteria: '',
          teacherAnswer: '',
          pages: [1],
          generated: true
        });
      } else if (picked === 'Match') {
        const pA = pool[seq % pool.length], pB = pool[(seq + 1) % pool.length];
        remainder.push({
          stage: 'guided',
          title: (isHw ? 'HW Match ' : 'CW Match ') + seq,
          text: 'Match words with definitions.',
          quizType: 'Match',
          items: [
            { left: pA.word, right: pA.meaning },
            { left: pB.word, right: pB.meaning }
          ],
          pages: [1],
          generated: true
        });
      } else if (picked === 'True / false') {
        const isTrue = seq % 2 === 0;
        remainder.push({
          stage: 'comprehension',
          title: (isHw ? 'HW True/False ' : 'CW True/False ') + seq,
          text: 'Check if this statement is true or false.',
          quizType: 'True / false',
          prompt: isTrue ? ('"' + target + '" is related to ' + targetMeaning + '.') : ('"' + target + '" means the exact opposite of ' + targetMeaning + '.'),
          answer: isTrue ? 'true' : 'false',
          pages: [1],
          generated: true
        });
      } else if (picked === 'Select all') {
        remainder.push({
          stage: 'independent',
          title: (isHw ? 'HW Select All ' : 'CW Select All ') + seq,
          text: 'Select all accurate applications.',
          quizType: 'Select all',
          prompt: 'Which options apply to "' + target + '"?',
          options: ['Valid: ' + targetMeaning, 'Distractor ' + d1, 'Lesson target: ' + target, 'Unrelated: ' + d2],
          answers: [0, 2],
          pages: [1],
          generated: true
        });
      } else if (picked === 'Odd one out') {
        remainder.push({
          stage: 'independent',
          title: (isHw ? 'HW Odd One Out ' : 'CW Odd One Out ') + seq,
          text: 'Identify the odd term out of four.',
          quizType: 'Odd one out',
          options: [pool[seq % pool.length].word, pool[(seq + 1) % pool.length].word, pool[(seq + 2) % pool.length].word, 'airplane ' + seq],
          answer: 3,
          pages: [1],
          generated: true
        });
      } else {
        remainder.push({
          stage: 'guided',
          title: (isHw ? 'HW Gap ' : 'CW Gap ') + seq + ': ' + target,
          text: 'Fill in the blank with the appropriate word.',
          quizType: 'Gap',
          shown: 'The team must consider ___ to achieve the goal.',
          answer: target,
          hint: 'Starts with ' + target[0],
          pages: [1],
          generated: true
        });
      }
      seq++;
    }

    for (let idx = remainder.length - 1; idx > 0; idx--) {
      const swap = Math.floor(Math.random() * (idx + 1));
      const temp = remainder[idx];
      remainder[idx] = remainder[swap];
      remainder[swap] = temp;
    }

    return items.concat(remainder);
  }
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  let title = '', description = '', unit = '', lesson = '', className = '';
  const words = [], phrases = [], rules = [], classwork = [];

  let currentSection = '';
  let ruleCurrent = null;

  for (const line of lines) {
    const kv = line.match(/^(title|description|unit|lesson|class|level|topic)\s*:\s*(.+)$/i);
    if (kv) {
      const key = kv[1].toLowerCase(), val = kv[2].trim();
      if (key === 'title' || key === 'topic') title = val;
      else if (key === 'description') description = val;
      else if (key === 'unit') unit = val;
      else if (key === 'lesson') lesson = val;
      else if (key === 'class' || key === 'level') className = val;
      continue;
    }
    if (/^(words|vocabulary|слова)\s*[:]?\s*$/i.test(line)) { currentSection = 'words'; continue; }
    if (/^(phrases|фразы)\s*[:]?\s*$/i.test(line)) { currentSection = 'phrases'; continue; }
    if (/^(rules|grammar|правила|грамматика)\s*[:]?\s*$/i.test(line)) { currentSection = 'rules'; continue; }
    if (/^(classwork|practice|exercises|quizzes|упражнения|квизы)\s*[:]?\s*$/i.test(line)) { currentSection = 'classwork'; continue; }

    const wordPrefix = line.match(/^(?:word|слово)\s*:\s*(.+)$/i);
    const lineToParse = wordPrefix ? wordPrefix[1] : line;
    if (currentSection === 'words' || wordPrefix || /^[•\-\*]\s*[a-zA-Z\s]+[\s\-–—:|]/.test(line)) {
      const cleanLine = lineToParse.replace(/^[•\-\*]\s*/, '').trim();
      const parts = cleanLine.includes('|') ? cleanLine.split('|').map(p => p.trim()) : cleanLine.split(/\s*[-–—:]\s*/).map(p => p.trim());
      if (parts.length >= 2 && /^[a-zA-Z\s'-]+$/.test(parts[0])) {
        const word = parts[0];
        const translation = parts[1] || '';
        const meaning = parts[2] || word;
        const example = parts[3] || ('Example with ' + word);
        words.push({ word, meaning, translation, example, pages: [1] });
        continue;
      }
    }

    const phrasePrefix = line.match(/^(?:phrase|фраза)\s*:\s*(.+)$/i);
    if (currentSection === 'phrases' || phrasePrefix) {
      const cleanLine = (phrasePrefix ? phrasePrefix[1] : line).replace(/^[•\-\*]\s*/, '').trim();
      const parts = cleanLine.includes('|') ? cleanLine.split('|').map(p => p.trim()) : cleanLine.split(/\s*[-–—:]\s*/).map(p => p.trim());
      if (parts.length >= 2) {
        phrases.push({ phrase: parts[0], meaning: parts[2] || parts[0], translation: parts[1] || '', example: parts[3] || parts[0], pages: [1] });
        continue;
      }
    }

    const rulePrefix = line.match(/^(?:rule|правило)\s*:\s*(.+)$/i);
    if (rulePrefix) {
      if (ruleCurrent) rules.push(ruleCurrent);
      ruleCurrent = { title: rulePrefix[1], ru: rulePrefix[1], explanation: '', pattern: '', patternRu: '', contrast: '', contrastRu: '', examples: [], pages: [1] };
      continue;
    }
    if (ruleCurrent) {
      if (/^(?:examples|примеры)\s*[:]?\s*$/i.test(line)) {
        currentSection = 'rule_examples';
        continue;
      }
      if (currentSection === 'rule_examples') {
        if (/^(?:quiz|exercise|words|vocabulary|phrases|rule)\b/i.test(line)) {
          currentSection = '';
        } else {
          const p = line.split(/[\~—]/);
          ruleCurrent.examples.push(p.length > 1 ? p[0].trim() + ' — ' + p[1].trim() : p[0].trim());
          continue;
        }
      }
      const expMatch = line.match(/^(?:explanation|объяснение)\s*:\s*(.+)$/i);
      const patMatch = line.match(/^(?:pattern|формула)\s*:\s*(.+)$/i);
      const exMatch = line.match(/^(?:example|пример)\s*:\s*(.+)$/i);
      if (expMatch) { ruleCurrent.explanation = expMatch[1]; continue; }
      if (patMatch) { ruleCurrent.pattern = patMatch[1]; continue; }
      if (exMatch) {
        const p = exMatch[1].split(/[\~—]/);
        ruleCurrent.examples.push(p.length > 1 ? p[0].trim() + ' — ' + p[1].trim() : p[0].trim());
        continue;
      }
    }

    const quizMatch = line.match(/^(?:quiz|exercise|question|вопрос)\s*:\s*(.+)$/i);
    if (quizMatch || currentSection === 'classwork') {
      const raw = quizMatch ? quizMatch[1] : line;
      if (raw.includes('|')) {
        const parts = raw.split('|').map(p => p.trim());
        const prompt = parts[0];
        const options = (parts[1] || '').split(/,\s*/).map(o => o.trim()).filter(Boolean);
        const ans = Number(parts[2]) || 0;
        const feedback = parts[3] || 'Review the lesson target.';
        if (options.length >= 2) {
          classwork.push({
            stage: classwork.length < 2 ? 'comprehension' : 'guided',
            title: prompt,
            text: prompt,
            kind: 'choice',
            options,
            answer: ans,
            feedback,
            criteria: '',
            teacherAnswer: '',
            pages: [1],
            generated: true
          });
          continue;
        }
      }
    }

    if (!title && lines.indexOf(line) === 0 && (line.startsWith('#') || (!/[.?!]$/.test(line) && line.length < 60))) {
      title = line.replace(/^#+\s*/, '');
      continue;
    }
    if (!description && title && lines.indexOf(line) === 1 && line.length < 240) {
      description = line;
      continue;
    }
  }
  if (ruleCurrent) rules.push(ruleCurrent);

  if (!title) title = defaultTitle.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') || 'New Lesson';
  if (!description) description = 'Lesson generated from ' + defaultTitle;

  const BANNED_TOKENS = new Set([
    'word', 'docx', 'document', 'xmlns', 'schemas', 'openxmlformats', 'wordprocessingml', 'wps', 'w14', 'w15',
    'rsid', 'rpr', 'ppr', 'sectpr', 'fldsimple', 'hyperlink', 'shd', 'val', 'sz', 'space', 'preserve', 'theme',
    'color', 'font', 'fonts', 'style', 'table', 'cell', 'row', 'grid', 'span', 'lang', 'eastasia', 'bidi',
    'ascii', 'hansi', 'cs', 'hint', 'cantrip', 'left', 'right', 'center', 'both', 'top', 'bottom', 'inside',
    'outside', 'none', 'auto', 'true', 'false', 'null', 'undefined', 'http', 'https', 'www', 'com', 'org',
    'net', 'href', 'title', 'class', 'type', 'html', 'body', 'head', 'script', 'style', 'div', 'span',
    'paragraph', 'section', 'header', 'footer', 'the', 'and', 'that', 'have', 'for', 'not', 'with', 'you',
    'this', 'but', 'his', 'from', 'they', 'say', 'her', 'she', 'will', 'one', 'all', 'would', 'there',
    'their', 'what', 'out', 'up', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
    'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could',
    'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
    'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want',
    'because', 'any', 'these', 'give', 'day', 'most', 'us', 'are', 'was', 'were', 'been', 'being', 'had',
    'has', 'does', 'did', 'doing'
  ]);

  const catalogLookup = typeof findCatalog === 'function' ? findCatalog : (typeof window !== 'undefined' && typeof window.findCatalog === 'function' ? window.findCatalog : null);

  if (!words.length && text.length > 20) {
    const rawTokens = text.match(/\b[A-Za-z]{3,20}\b/g) || [];
    const candidates = [...new Set(rawTokens.map(w => w.toLowerCase()))].filter(w => !BANNED_TOKENS.has(w));

    for (const w of candidates) {
      if (words.length >= 6) break;
      let card = catalogLookup ? catalogLookup(w) : null;
      if (!card && catalogLookup && w.endsWith('s') && w.length > 3) card = catalogLookup(w.slice(0, -1));
      if (!card && catalogLookup && w.endsWith('es') && w.length > 4) card = catalogLookup(w.slice(0, -2));
      if (card && card.en) {
        words.push({
          word: card.en,
          meaning: card.en,
          translation: card.ru || card.en,
          example: card.example || ('Example with ' + card.en),
          pages: [1]
        });
      }
    }

    if (!words.length) {
      for (const w of candidates) {
        if (words.length >= 6) break;
        if (w.length >= 4 && !BANNED_TOKENS.has(w)) {
          words.push({
            word: w,
            meaning: w,
            translation: w,
            example: 'Example with ' + w,
            pages: [1]
          });
        }
      }
    }
  }

  const targetWord1 = words[0] ? words[0].word : title;
  const targetMeaning1 = words[0] ? (words[0].translation || words[0].meaning) : description;
  const distractor1A = words[1] ? (words[1].translation || words[1].meaning) : 'Contextual nuance in target usage';
  const distractor1B = words[2] ? (words[2].translation || words[2].meaning) : 'Opposite or unrelated grammatical structure';

  const targetWord2 = words[1] ? words[1].word : (words[0] ? words[0].word : title);
  const distractor2A = words[2] ? words[2].word : (words[0] && words[0].word !== targetWord2 ? words[0].word : 'alternative');
  const distractor2B = words[3] ? words[3].word : 'distractor';

  const presentStages = new Set(classwork.map(c => c.stage));
  if (!presentStages.has('explanation')) {
    classwork.unshift({
      stage: 'explanation',
      title: 'Lesson Overview: ' + title,
      text: description || 'Study the main points and rules of this lesson.',
      kind: 'explanation',
      options: [],
      answer: -1,
      feedback: '',
      criteria: '',
      teacherAnswer: '',
      pages: [1],
      generated: true
    });
  }
  if (!presentStages.has('comprehension')) {
    classwork.push({
      stage: 'comprehension',
      title: words.length ? ('Meaning: ' + targetWord1) : ('Comprehension check: ' + title),
      text: words.length ? ('Select the correct meaning of "' + targetWord1 + '":') : ('Select the statement that matches the lesson: ' + title),
      kind: 'choice',
      options: [targetMeaning1, distractor1A, distractor1B],
      answer: 0,
      feedback: words.length ? ('"' + targetWord1 + '" corresponds to: ' + targetMeaning1 + '.') : 'Review the lesson overview for details.',
      criteria: '',
      teacherAnswer: '',
      pages: [1],
      generated: true
    });
  }
  if (!presentStages.has('guided')) {
    classwork.push({
      stage: 'guided',
      title: 'Guided practice: ' + targetWord2,
      text: 'Choose the suitable word to complete the context: "The lesson highlights the importance of ___ in practice."',
      kind: 'choice',
      options: [targetWord2, distractor2A, distractor2B],
      answer: 0,
      feedback: 'Use "' + targetWord2 + '" to complete the target statement.',
      criteria: '',
      teacherAnswer: '',
      pages: [1],
      generated: true
    });
  }
  if (!presentStages.has('independent')) {
    const vocabList = words.slice(0, 3).map(w => w.word).join(', ');
    classwork.push({
      stage: 'independent',
      title: 'Independent production',
      text: vocabList ? ('Write original sentences incorporating the lesson vocabulary: ' + vocabList + '.') : 'Write three original sentences using the grammar and concepts from this lesson.',
      kind: 'open',
      options: [],
      answer: -1,
      feedback: '',
      criteria: 'Grammar and accuracy | 3\nVocabulary usage | 2',
      teacherAnswer: 'Sample student answer demonstrating lesson targets.',
      pages: [1],
      generated: true
    });
  }
  if (!presentStages.has('final')) {
    classwork.push({
      stage: 'final',
      title: 'Final task',
      text: 'Compose a short paragraph applying the material covered in ' + title + '.',
      kind: 'open',
      options: [],
      answer: -1,
      feedback: '',
      criteria: 'Content and structure | 3\nLanguage variety | 2',
      teacherAnswer: 'Exemplary paragraph covering all lesson objectives.',
      pages: [1],
      generated: true
    });
  }

  let finalCw = classwork;
  if (targetCwCount && targetCwCount > classwork.length) {
    finalCw = classwork.concat(lmGenerateExercisesList(targetCwCount - classwork.length, words, phrases, rules, title, false));
  }
  const homework = (targetHwCount && targetHwCount > 0) ? lmGenerateExercisesList(targetHwCount, words, phrases, rules, title, true) : [];

  return {
    title,
    description,
    unit: unit || '1',
    lesson: lesson || '1',
    className: className || 'B2',
    overview: description,
    words,
    phrases,
    rules,
    classwork: finalCw,
    homework,
    warnings: []
  };
}
async function lmImportPdfDraft(file) {
  if(!file||!canEditLessons())return;
  const appendTasks = typeof document !== 'undefined' && document.getElementById('lmAppendTasks')?.checked;
  const targetCwCount = Math.max(1, parseInt(typeof document !== 'undefined' && document.getElementById('lmClassworkCount')?.value, 10) || 48);
  const targetHwCount = Math.max(1, parseInt(typeof document !== 'undefined' && document.getElementById('lmHomeworkCount')?.value, 10) || 72);
  if(!appendTasks || !lmState){
    const create = typeof lmCreateLesson === 'function' ? lmCreateLesson : window.lmCreateLesson;
    if(typeof create === 'function') create();
  }
  if(!lmState)return;
  if(file.size>25*1024*1024||!file.size){
    lmPdfImportStatus('File must be under 25 MB.',true);return;
  }
  const isPdf = (file.type&&file.type==='application/pdf')||/\.pdf$/i.test(file.name||'');
  const isDocx = /\.docx$/i.test(file.name||'');
  lmPdfDraftRequest?.abort();
  document.getElementById('lmPdfDraftDialog')?.remove();
  const controller=new AbortController();lmPdfDraftRequest=controller;
  const current=lmState, generation=viewGen, owner=authUser;
  const active=()=>!controller.signal.aborted&&lmState===current&&viewGen===generation&&authUser===owner&&canEditLessons();
  const drop=document.querySelector('[data-lesson-pdf-import]');drop?.classList.add('is-busy');
  lmPdfImportStatus('',false);lmPdfProgress(isPdf ? 'Analysing PDF' : 'Processing document');
  try{
    const bytes=await file.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(!active())return;
    let data;
    if(isPdf){
      data=await accountFetch('/api/lessons/parse-pdf?scope=full',{method:'POST',headers:{'Content-Type':'application/pdf'},body:file,signal:controller.signal,quietBug:true});
    } else {
      const text = await lmExtractTextFromFile(file);
      if(/\.json$/i.test(file.name)){
        try{
          const parsed = JSON.parse(text);
          if(parsed && Array.isArray(parsed.words) && Array.isArray(parsed.classwork)) data = parsed;
          else data = lmParseScriptToLessonData(text, file.name, targetCwCount, targetHwCount);
        } catch{ data = lmParseScriptToLessonData(text, file.name, targetCwCount, targetHwCount); }
      } else {
        data = lmParseScriptToLessonData(text || file.name, file.name, targetCwCount, targetHwCount);
      }
    }
    if(!active())return;
    await lmMountLessonDraftDialog(data, hash, file, controller, active, !isPdf);
  }catch(error){if(active()){lmPdfProgressEnd();lmPdfImportStatus(error.message||'Could not process this file.',true);}}
  finally{if(lmPdfDraftRequest===controller){if(!active())lmPdfProgressEnd();drop?.classList.remove('is-busy');const input=document.querySelector('[data-lesson-pdf-import-file]');if(input)input.value='';}}
}
async function lmMountLessonDraftDialog(data, hash, file, controller, active, isDocument = false) {
  if(!active())return;
  const drop=document.querySelector('[data-lesson-pdf-import]');
  try{
    data.warnings = Array.isArray(data.warnings) ? data.warnings : [];
    data.words = Array.isArray(data.words) ? data.words : [];
    data.phrases = Array.isArray(data.phrases) ? data.phrases : [];
    data.rules = Array.isArray(data.rules) ? data.rules : [];
    data.classwork = Array.isArray(data.classwork) ? data.classwork : [];
    data.homework = Array.isArray(data.homework) ? data.homework : [];
    if(typeof stageEnsureStatic==='function')await stageEnsureStatic('GRAMMAR');
    if(!active())return;
    let groups=await lmPdfDraftBlocks(data,hash);
    if(!active())return;
    const current=lmState;
    const dialog=document.createElement('dialog');dialog.id='lmPdfDraftDialog';dialog.className='lm-pdf-draft saas-card';dialog.setAttribute('open','');
    const heading=document.createElement('h2');heading.textContent=isDocument ? 'Review lesson draft' : 'Review PDF lesson draft';dialog.append(heading);
    const hint=document.createElement('p');hint.textContent=isDocument ? 'Select sections to import into this draft. Existing blocks and manual edits stay unchanged.' : 'Select additional sections for this draft. Existing blocks and manual edits stay unchanged. If the lesson title is empty, the PDF title is used. Words and phrases become full dictionary cards after applying. Verify AI-extracted page references against the PDF.';dialog.append(hint);
    const budgetNote=document.createElement('p');budgetNote.id='lmPdfBlockBudget';dialog.append(budgetNote);
    function paintPdfBlockBudget(){
      const selected=new Set([...choices].filter(([,input])=>input.checked).map(([key])=>key));
      const occupied=(current.blocks||[]).length;
      const hasPdf=(current.blocks||[]).some(block=>block.type==='pdf'&&block.pdfImport?.source===hash);
      const incoming=lmPdfIncomingBlocks(groups,selected,hasPdf);
      const budget=lmPdfBlockBudget(occupied,incoming);
      budgetNote.textContent=lmPdfBlockBudgetText(occupied,incoming);
      budgetNote.classList.toggle('bad',budget.over);
    }
    const choices=new Map();
    let sectionCount = 0;
    const section=(key,title,renderContent,checked)=>{
      sectionCount += 1;
      const idx = sectionCount;
      const details=document.createElement('details'),summary=document.createElement('summary'),label=document.createElement('label'),input=document.createElement('input');
      input.type='checkbox';input.checked=checked;choices.set(key,input);
      const numBadge=document.createElement('span');numBadge.className='lm-pdf-section-num'+(checked?'':' is-off');numBadge.dataset.num=String(idx);
      numBadge.title='Click to toggle section import';
      const syncState=()=>{
        numBadge.classList.toggle('is-off',!input.checked);
        details.classList.toggle('is-section-off',!input.checked);
        paintPdfBlockBudget();
      };
      input.onchange=syncState;
      numBadge.onclick=(e)=>{
        e.stopPropagation();
        input.checked=!input.checked;
        syncState();
      };
      const titleSpan=document.createElement('span');titleSpan.className='lm-pdf-section-title';titleSpan.textContent=title;
      label.append(input,numBadge,titleSpan);summary.append(label);details.append(summary);
      const container=document.createElement('div');container.className='lm-pdf-section-content';details.append(container);
      let rendered=false;
      const mount=()=>{
        if(rendered)return;
        rendered=true;
        renderContent(container,titleSpan);
      };
      details.addEventListener('toggle',()=>{if(details.open)mount();});
      if(details.open)mount();
      dialog.append(details);
    };
    section('metadata','Basic information',(container)=>{
      const box=document.createElement('div');box.className='lm-pdf-form-box';
      box.innerHTML=
        '<div class="saas-form-group" style="margin-bottom:10px"><label class="saas-label">Lesson title</label><input class="saas-input" data-pdf-field="title" value="'+esc(data.title||'')+'" placeholder="Lesson title"></div>'+
        '<div class="saas-form-group" style="margin-bottom:10px"><label class="saas-label">Description</label><textarea class="saas-textarea" data-pdf-field="description" placeholder="Description" style="min-height:60px">'+esc(data.description||'')+'</textarea></div>'+
        '<div class="saas-form-grid"><div class="saas-form-group"><label class="saas-label">Unit</label><input class="saas-input" data-pdf-field="unit" value="'+esc(data.unit||'')+'" placeholder="Unit"></div>'+
        '<div class="saas-form-group"><label class="saas-label">Lesson</label><input class="saas-input" data-pdf-field="lesson" value="'+esc(data.lesson||'')+'" placeholder="Lesson number"></div></div>'+
        '<div class="saas-form-group" style="margin-top:10px"><label class="saas-label">Class</label><input class="saas-input" data-pdf-field="className" value="'+esc(data.className||'')+'" placeholder="Class / Level"></div>';
      container.append(box);
    },true);
    section('overview','Overview',(container)=>{
      const box=document.createElement('div');box.className='lm-pdf-form-box';
      box.innerHTML='<div class="saas-form-group"><label class="saas-label">Lesson overview</label><textarea class="saas-textarea" data-pdf-field="overview" style="min-height:96px" placeholder="Overview text">'+esc(data.overview||'')+'</textarea></div>';
      container.append(box);
    },true);
    section('words','Words · '+data.words.length,(container,titleSpan)=>{
      const wrap=document.createElement('div');wrap.className='lm-pdf-words-container';
      const toolbar=document.createElement('div');toolbar.className='lm-pdf-words-toolbar';
      toolbar.innerHTML='<span class="saas-text-muted" style="font-size:12.5px">Select words to import, edit entries, or add missing words.</span>';
      const addBtn=document.createElement('button');addBtn.type='button';addBtn.className='btn primary saas-btn saas-btn-sm';addBtn.textContent='+ Add word';
      toolbar.append(addBtn);wrap.append(toolbar);
      const list=document.createElement('div');list.className='lm-pdf-word-list';
      const updateCount=()=>{
        const rows=list.querySelectorAll('.lm-pdf-word-card');
        titleSpan.textContent=' Words · '+rows.length;
      };
      const renderWordCard=(r,selected=true)=>{
        const card=document.createElement('div');card.className='lm-pdf-word-card saas-card'+(selected?'':' is-unselected');card.dataset.pdfWordCard='';
        if(r.pages?.length)card.dataset.pages=JSON.stringify(r.pages);
        card.innerHTML=
          '<div class="lm-pdf-word-header">'+
            '<label class="lm-pdf-word-check"><input type="checkbox" data-word-select '+(selected?'checked':'')+'> <b data-word-title>'+esc(r.word||'New word')+'</b></label>'+
            '<div class="lm-pdf-word-actions">'+
              (r.pages?.length?'<span class="saas-badge saas-badge-muted" style="font-size:11px">Pages: '+esc(r.pages.join(', '))+'</span>':'')+
              '<button type="button" class="btn ghost saas-btn-sm saas-btn-danger" data-action="remove-word" title="Remove" style="padding:0 8px;min-height:28px">✕</button>'+
            '</div>'+
          '</div>'+
          '<div class="saas-form-grid" style="margin-top:8px">'+
            '<div class="saas-form-group"><label class="saas-label">Word</label><input class="saas-input" data-word-key="word" value="'+esc(r.word||'')+'" placeholder="English word"></div>'+
            '<div class="saas-form-group"><label class="saas-label">Russian translation</label><input class="saas-input" data-word-key="translation" value="'+esc(r.translation||'')+'" placeholder="Перевод"></div>'+
          '</div>'+
          '<div class="saas-form-grid" style="margin-top:8px">'+
            '<div class="saas-form-group"><label class="saas-label">Meaning</label><input class="saas-input" data-word-key="meaning" value="'+esc(r.meaning||'')+'" placeholder="English definition"></div>'+
            '<div class="saas-form-group"><label class="saas-label">Example</label><input class="saas-input" data-word-key="example" value="'+esc(r.example||'')+'" placeholder="Example sentence"></div>'+
          '</div>';
        const wordInput=card.querySelector('[data-word-key="word"]'),titleEl=card.querySelector('[data-word-title]'),checkEl=card.querySelector('[data-word-select]');
        wordInput.oninput=()=>{titleEl.textContent=wordInput.value.trim()||'New word';};
        checkEl.onchange=()=>{card.classList.toggle('is-unselected',!checkEl.checked);};
        card.querySelector('[data-action="remove-word"]').onclick=()=>{card.remove();updateCount();};
        return card;
      };
      data.words.forEach(r=>list.append(renderWordCard(r,true)));
      addBtn.onclick=()=>{
        const newCard=renderWordCard({word:'',translation:'',meaning:'',example:'',pages:[]},true);
        list.prepend(newCard);updateCount();newCard.querySelector('[data-word-key="word"]')?.focus();
      };
      wrap.append(list);container.append(wrap);
    },true);
    section('phrases','Phrases · '+data.phrases.length,(container,titleSpan)=>{
      const wrap=document.createElement('div');wrap.className='lm-pdf-words-container';
      const toolbar=document.createElement('div');toolbar.className='lm-pdf-words-toolbar';
      toolbar.innerHTML='<span class="saas-text-muted" style="font-size:12.5px">Select phrases to import, edit entries, or add missing phrases.</span>';
      const addBtn=document.createElement('button');addBtn.type='button';addBtn.className='btn primary saas-btn saas-btn-sm';addBtn.textContent='+ Add phrase';
      toolbar.append(addBtn);wrap.append(toolbar);
      const list=document.createElement('div');list.className='lm-pdf-word-list';
      const updateCount=()=>{
        const rows=list.querySelectorAll('.lm-pdf-phrase-card');
        titleSpan.textContent=' Phrases · '+rows.length;
      };
      const renderPhraseCard=(r,selected=true)=>{
        const card=document.createElement('div');card.className='lm-pdf-word-card lm-pdf-phrase-card saas-card'+(selected?'':' is-unselected');card.dataset.pdfPhraseCard='';
        if(r.pages?.length)card.dataset.pages=JSON.stringify(r.pages);
        card.innerHTML=
          '<div class="lm-pdf-word-header">'+
            '<label class="lm-pdf-word-check"><input type="checkbox" data-phrase-select '+(selected?'checked':'')+'> <b data-phrase-title>'+esc(r.phrase||'New phrase')+'</b></label>'+
            '<div class="lm-pdf-word-actions">'+
              (r.pages?.length?'<span class="saas-badge saas-badge-muted" style="font-size:11px">Pages: '+esc(r.pages.join(', '))+'</span>':'')+
              '<button type="button" class="btn ghost saas-btn-sm saas-btn-danger" data-action="remove-phrase" title="Remove" style="padding:0 8px;min-height:28px">✕</button>'+
            '</div>'+
          '</div>'+
          '<div class="saas-form-grid" style="margin-top:8px">'+
            '<div class="saas-form-group"><label class="saas-label">Phrase</label><input class="saas-input" data-phrase-key="phrase" value="'+esc(r.phrase||'')+'" placeholder="English phrase"></div>'+
            '<div class="saas-form-group"><label class="saas-label">Russian translation</label><input class="saas-input" data-phrase-key="translation" value="'+esc(r.translation||'')+'" placeholder="Перевод"></div>'+
          '</div>'+
          '<div class="saas-form-grid" style="margin-top:8px">'+
            '<div class="saas-form-group"><label class="saas-label">Meaning</label><input class="saas-input" data-phrase-key="meaning" value="'+esc(r.meaning||'')+'" placeholder="English definition"></div>'+
            '<div class="saas-form-group"><label class="saas-label">Example</label><input class="saas-input" data-phrase-key="example" value="'+esc(r.example||'')+'" placeholder="Example sentence"></div>'+
          '</div>';
        const phraseInput=card.querySelector('[data-phrase-key="phrase"]'),titleEl=card.querySelector('[data-phrase-title]'),checkEl=card.querySelector('[data-phrase-select]');
        phraseInput.oninput=()=>{titleEl.textContent=phraseInput.value.trim()||'New phrase';};
        checkEl.onchange=()=>{card.classList.toggle('is-unselected',!checkEl.checked);};
        card.querySelector('[data-action="remove-phrase"]').onclick=()=>{card.remove();updateCount();};
        return card;
      };
      data.phrases.forEach(r=>list.append(renderPhraseCard(r,true)));
      addBtn.onclick=()=>{
        const newCard=renderPhraseCard({phrase:'',translation:'',meaning:'',example:'',pages:[]},true);
        list.prepend(newCard);updateCount();newCard.querySelector('[data-phrase-key="phrase"]')?.focus();
      };
      wrap.append(list);container.append(wrap);
    },true);
    section('classwork','Classwork · '+data.classwork.length,(container,titleSpan)=>{
      const wrap=document.createElement('div');wrap.className='lm-pdf-classwork-container';
      const toolbar=document.createElement('div');toolbar.className='lm-pdf-words-toolbar';
      toolbar.innerHTML='<span class="saas-text-muted" style="font-size:12.5px">Select exercises and tasks to import, edit prompts, answers or criteria.</span>';
      const addBtn=document.createElement('button');addBtn.type='button';addBtn.className='btn primary saas-btn saas-btn-sm';addBtn.textContent='+ Add task';
      toolbar.append(addBtn);wrap.append(toolbar);
      const list=document.createElement('div');list.className='lm-pdf-classwork-list';
      const updateCount=()=>{
        const rows=list.querySelectorAll('.lm-pdf-classwork-card');
        titleSpan.textContent=' Classwork · '+rows.length;
      };
      const renderClassworkCard=(r,selected=true)=>{
        const card=document.createElement('div');card.className='lm-pdf-word-card lm-pdf-classwork-card saas-card'+(selected?'':' is-unselected');card.dataset.pdfClassworkCard='';
        if(r.pages?.length)card.dataset.pages=JSON.stringify(r.pages);
        card.dataset.kind=r.kind||'choice';
        card.dataset.stage=r.stage||'comprehension';
        card.dataset.generated=r.generated?'true':'false';
        if(r.quizType)card.dataset.quizType=r.quizType;
        const isChoice=r.kind==='choice',isExpl=r.kind==='explanation';
        const optionsText=Array.isArray(r.options)?r.options.join('\n'):'';
        card.innerHTML=
          '<div class="lm-pdf-word-header">'+
            '<label class="lm-pdf-word-check"><input type="checkbox" data-classwork-select '+(selected?'checked':'')+'> <b data-classwork-title>'+esc(r.title||'New task')+'</b></label>'+
            '<div class="lm-pdf-word-actions">'+
              '<span class="saas-badge" style="font-size:11px;text-transform:capitalize">'+esc(r.quizType||r.stage||'task')+'</span>'+
              (r.pages?.length?'<span class="saas-badge saas-badge-muted" style="font-size:11px">Pages: '+esc(r.pages.join(', '))+'</span>':'')+
              '<button type="button" class="btn ghost saas-btn-sm saas-btn-danger" data-action="remove-classwork" title="Remove" style="padding:0 8px;min-height:28px">✕</button>'+
            '</div>'+
          '</div>'+
          '<div class="saas-form-grid" style="margin-top:8px">'+
            '<div class="saas-form-group"><label class="saas-label">Task title</label><input class="saas-input" data-classwork-key="title" value="'+esc(r.title||'')+'" placeholder="Task title"></div>'+
            '<div class="saas-form-group"><label class="saas-label">Stage</label><select class="saas-input" data-classwork-key="stage">'+
              ['explanation','comprehension','guided','independent','final'].map(s=>'<option value="'+s+'"'+(s===(r.stage||'comprehension')?' selected':'')+'>'+s+'</option>').join('')+
            '</select></div>'+
          '</div>'+
          '<div class="saas-form-group" style="margin-top:8px">'+
            '<label class="saas-label">Instructions / prompt text</label><textarea class="saas-textarea" data-classwork-key="text" style="min-height:56px" placeholder="Task prompt">'+esc(r.text||'')+'</textarea>'+
          '</div>'+
          (isChoice?
            '<div class="saas-form-grid" style="margin-top:8px">'+
              '<div class="saas-form-group"><label class="saas-label">Options (one per line)</label><textarea class="saas-textarea" data-classwork-key="options" style="min-height:60px" placeholder="Option 1&#10;Option 2">'+esc(optionsText)+'</textarea></div>'+
              '<div class="saas-form-group">'+
                '<label class="saas-label">Correct answer index (0, 1, ...)</label><input type="number" min="0" class="saas-input" data-classwork-key="answer" value="'+esc(Number.isFinite(r.answer)?r.answer:0)+'">'+
                '<label class="saas-label" style="margin-top:8px">Teacher feedback / notes</label><input class="saas-input" data-classwork-key="feedback" value="'+esc(r.feedback||'')+'" placeholder="Feedback">'+
              '</div>'+
            '</div>':
            (!isExpl?
              '<div class="saas-form-grid" style="margin-top:8px">'+
                '<div class="saas-form-group"><label class="saas-label">Criteria (Category | Points)</label><textarea class="saas-textarea" data-classwork-key="criteria" style="min-height:60px" placeholder="Content | 3&#10;Accuracy | 2">'+esc(r.criteria||'')+'</textarea></div>'+
                '<div class="saas-form-group"><label class="saas-label">Teacher sample answer</label><textarea class="saas-textarea" data-classwork-key="teacherAnswer" style="min-height:60px" placeholder="Sample answer">'+esc(r.teacherAnswer||'')+'</textarea></div>'+
              '</div>':'')
          );
        const titleInput=card.querySelector('[data-classwork-key="title"]'),titleEl=card.querySelector('[data-classwork-title]'),checkEl=card.querySelector('[data-classwork-select]');
        titleInput.oninput=()=>{titleEl.textContent=titleInput.value.trim()||'New task';};
        checkEl.onchange=()=>{card.classList.toggle('is-unselected',!checkEl.checked);};
        card.querySelector('[data-action="remove-classwork"]').onclick=()=>{card.remove();updateCount();};
        return card;
      };
      data.classwork.forEach(r=>list.append(renderClassworkCard(r,true)));
      addBtn.onclick=()=>{
        const newCard=renderClassworkCard({title:'',text:'',kind:'choice',stage:'comprehension',options:['',''],answer:0,feedback:'',pages:[]},true);
        list.prepend(newCard);updateCount();newCard.querySelector('[data-classwork-key="title"]')?.focus();
      };
      wrap.append(list);container.append(wrap);
    },true);
    if (Array.isArray(data.homework) && data.homework.length) {
      section('homework','Homework · '+data.homework.length,(container,titleSpan)=>{
        const wrap=document.createElement('div');wrap.className='lm-pdf-homework-container';
        const toolbar=document.createElement('div');toolbar.className='lm-pdf-words-toolbar';
        toolbar.innerHTML='<span class="saas-text-muted" style="font-size:12.5px">Select exercises and tasks for homework.</span>';
        const addBtn=document.createElement('button');addBtn.type='button';addBtn.className='btn primary saas-btn saas-btn-sm';addBtn.textContent='+ Add task';
        toolbar.append(addBtn);wrap.append(toolbar);
        const list=document.createElement('div');list.className='lm-pdf-homework-list';
        const updateCount=()=>{
          const rows=list.querySelectorAll('.lm-pdf-homework-card');
          titleSpan.textContent=' Homework · '+rows.length;
        };
        const renderHomeworkCard=(r,selected=true)=>{
          const card=document.createElement('div');card.className='lm-pdf-word-card lm-pdf-homework-card saas-card'+(selected?'':' is-unselected');card.dataset.pdfHomeworkCard='';
          if(r.pages?.length)card.dataset.pages=JSON.stringify(r.pages);
          card.dataset.kind=r.kind||'choice';
          card.dataset.stage=r.stage||'independent';
          card.dataset.generated=r.generated?'true':'false';
          if(r.quizType)card.dataset.quizType=r.quizType;
          const isChoice=r.kind==='choice',isExpl=r.kind==='explanation';
          const optionsText=Array.isArray(r.options)?r.options.join('\n'):'';
          card.innerHTML=
            '<div class="lm-pdf-word-header">'+
              '<label class="lm-pdf-word-check"><input type="checkbox" data-homework-select '+(selected?'checked':'')+'> <b data-homework-title>'+esc(r.title||'New task')+'</b></label>'+
              '<div class="lm-pdf-word-actions">'+
                '<span class="saas-badge" style="font-size:11px;text-transform:capitalize">'+esc(r.quizType||r.stage||'task')+'</span>'+
                (r.pages?.length?'<span class="saas-badge saas-badge-muted" style="font-size:11px">Pages: '+esc(r.pages.join(', '))+'</span>':'')+
                '<button type="button" class="btn ghost saas-btn-sm saas-btn-danger" data-action="remove-homework" title="Remove" style="padding:0 8px;min-height:28px">✕</button>'+
              '</div>'+
            '</div>'+
            '<div class="saas-form-grid" style="margin-top:8px">'+
              '<div class="saas-form-group"><label class="saas-label">Task title</label><input class="saas-input" data-homework-key="title" value="'+esc(r.title||'')+'" placeholder="Task title"></div>'+
              '<div class="saas-form-group"><label class="saas-label">Stage</label><select class="saas-input" data-homework-key="stage">'+
                ['explanation','comprehension','guided','independent','final'].map(s=>'<option value="'+s+'"'+(s===(r.stage||'independent')?' selected':'')+'>'+s+'</option>').join('')+
              '</select></div>'+
            '</div>'+
            '<div class="saas-form-group" style="margin-top:8px">'+
              '<label class="saas-label">Instructions / prompt text</label><textarea class="saas-textarea" data-homework-key="text" style="min-height:56px" placeholder="Task prompt">'+esc(r.text||'')+'</textarea>'+
            '</div>'+
            (isChoice?
              '<div class="saas-form-grid" style="margin-top:8px">'+
                '<div class="saas-form-group"><label class="saas-label">Options (one per line)</label><textarea class="saas-textarea" data-homework-key="options" style="min-height:60px" placeholder="Option 1&#10;Option 2">'+esc(optionsText)+'</textarea></div>'+
                '<div class="saas-form-group">'+
                  '<label class="saas-label">Correct answer index (0, 1, ...)</label><input type="number" min="0" class="saas-input" data-homework-key="answer" value="'+esc(Number.isFinite(r.answer)?r.answer:0)+'">'+
                  '<label class="saas-label" style="margin-top:8px">Teacher feedback / notes</label><input class="saas-input" data-homework-key="feedback" value="'+esc(r.feedback||'')+'" placeholder="Feedback">'+
                '</div>'+
              '</div>':
              (!isExpl?
                '<div class="saas-form-grid" style="margin-top:8px">'+
                  '<div class="saas-form-group"><label class="saas-label">Criteria (Category | Points)</label><textarea class="saas-textarea" data-homework-key="criteria" style="min-height:60px" placeholder="Content | 3&#10;Accuracy | 2">'+esc(r.criteria||'')+'</textarea></div>'+
                  '<div class="saas-form-group"><label class="saas-label">Teacher sample answer</label><textarea class="saas-textarea" data-homework-key="teacherAnswer" style="min-height:60px" placeholder="Sample answer">'+esc(r.teacherAnswer||'')+'</textarea></div>'+
                '</div>':'')
            );
          const titleInput=card.querySelector('[data-homework-key="title"]'),titleEl=card.querySelector('[data-homework-title]'),checkEl=card.querySelector('[data-homework-select]');
          titleInput.oninput=()=>{titleEl.textContent=titleInput.value.trim()||'New task';};
          checkEl.onchange=()=>{card.classList.toggle('is-unselected',!checkEl.checked);};
          card.querySelector('[data-action="remove-homework"]').onclick=()=>{card.remove();updateCount();};
          return card;
        };
        data.homework.forEach(r=>list.append(renderHomeworkCard(r,true)));
        addBtn.onclick=()=>{
          const newCard=renderHomeworkCard({title:'',text:'',kind:'choice',stage:'independent',options:['',''],answer:0,feedback:'',pages:[]},true);
          list.prepend(newCard);updateCount();newCard.querySelector('[data-homework-key="title"]')?.focus();
        };
        wrap.append(list);container.append(wrap);
      },true);
    }
    section('rules','Rules · '+data.rules.length,(container,titleSpan)=>{
      const wrap=document.createElement('div');wrap.className='lm-pdf-rules-container';
      const toolbar=document.createElement('div');toolbar.className='lm-pdf-words-toolbar';
      const countLabel=document.createElement('span');countLabel.className='saas-badge';
      const updateCount=()=>{
        const activeCount=list.querySelectorAll('[data-pdf-rule-card]:not(.is-unselected)').length;
        const totalCount=list.querySelectorAll('[data-pdf-rule-card]').length;
        countLabel.textContent=activeCount+' of '+totalCount+' selected';
        titleSpan.textContent=' Rules · '+totalCount;
      };
      const addBtn=document.createElement('button');addBtn.type='button';addBtn.className='btn secondary saas-btn';addBtn.textContent='+ Add rule';
      toolbar.append(countLabel,addBtn);wrap.append(toolbar);
      const list=document.createElement('div');list.className='lm-pdf-rule-list';
      const renderRuleCard=(r,isSelected=true)=>{
        const card=document.createElement('div');card.className='lm-pdf-rule-card'+(isSelected?'':' is-unselected');
        card.setAttribute('data-pdf-rule-card','');
        if(r.pages)card.dataset.pages=JSON.stringify(r.pages);
        const match=lmPdfGrammarMatch(r.title);
        const matchBadge=match?'<span class="saas-badge" style="background:var(--saas-status-success-bg,#ecfdf5);color:var(--saas-status-success-text,#065f46);">In service</span>':'<span class="saas-badge" style="background:var(--saas-status-info-bg,#eff6ff);color:var(--saas-status-info-text,#1e40af);">Oxford / Trusted sources</span>';
        const exText=Array.isArray(r.examples)?r.examples.map(e=>Array.isArray(e)?(e[0]+(e[1]?' ~ '+e[1]:'')):String(e)).join('\n'):'';
        card.innerHTML=
          '<div class="lm-pdf-word-header">'+
            '<label class="lm-pdf-word-check"><input type="checkbox" data-rule-select '+(isSelected?'checked':'')+'><span data-rule-title>'+esc(r.title||'New rule')+'</span> '+matchBadge+'</label>'+
            '<div class="lm-pdf-word-actions">'+
              '<button type="button" class="btn ghost saas-btn" data-action="enrich-rule" title="Enrich from Oxford and trusted sources">Oxford</button>'+
              '<button type="button" class="btn ghost saas-btn" data-action="remove-rule" title="Remove rule">✕</button>'+
            '</div>'+
          '</div>'+
          '<div class="saas-form-grid" style="margin-top:10px">'+
            '<div class="saas-form-group"><label class="saas-label">Rule title</label><input class="saas-input" data-rule-key="title" value="'+esc(r.title||'')+'" placeholder="Rule name (English)"></div>'+
            '<div class="saas-form-group"><label class="saas-label">Russian name</label><input class="saas-input" data-rule-key="ru" value="'+esc(r.ru||r.title||'')+'" placeholder="Название на русском"></div>'+
          '</div>'+
          '<div class="saas-form-group" style="margin-top:8px">'+
            '<label class="saas-label">English explanation</label><textarea class="saas-textarea" data-rule-key="explanation" style="min-height:56px" placeholder="English explanation / definition">'+esc(r.explanation||r.en||'')+'</textarea>'+
          '</div>'+
          '<div class="saas-form-grid" style="margin-top:8px">'+
            '<div class="saas-form-group"><label class="saas-label">Structure / Pattern (EN)</label><input class="saas-input" data-rule-key="pattern" value="'+esc(r.pattern||'')+'" placeholder="Grammar pattern"></div>'+
            '<div class="saas-form-group"><label class="saas-label">Structure (RU)</label><input class="saas-input" data-rule-key="patternRu" value="'+esc(r.patternRu||'')+'" placeholder="Модель употребления"></div>'+
          '</div>'+
          '<div class="saas-form-grid" style="margin-top:8px">'+
            '<div class="saas-form-group"><label class="saas-label">Distinctions (EN)</label><input class="saas-input" data-rule-key="contrast" value="'+esc(r.contrast||'')+'" placeholder="Distinctions / common mistakes"></div>'+
            '<div class="saas-form-group"><label class="saas-label">Distinctions (RU)</label><input class="saas-input" data-rule-key="contrastRu" value="'+esc(r.contrastRu||'')+'" placeholder="Различия на русском"></div>'+
          '</div>'+
          '<div class="saas-form-group" style="margin-top:8px">'+
            '<label class="saas-label">Examples (one per line, English ~ Russian)</label><textarea class="saas-textarea" data-rule-key="examples" style="min-height:60px" placeholder="The car costs $200,000. ~ Машина стоит 200 000 $.">'+esc(exText)+'</textarea>'+
          '</div>';
        const titleInput=card.querySelector('[data-rule-key="title"]'),titleEl=card.querySelector('[data-rule-title]'),checkEl=card.querySelector('[data-rule-select]'),enrichBtn=card.querySelector('[data-action="enrich-rule"]');
        titleInput.oninput=()=>{titleEl.textContent=titleInput.value.trim()||'New rule';};
        checkEl.onchange=()=>{card.classList.toggle('is-unselected',!checkEl.checked);updateCount();};
        card.querySelector('[data-action="remove-rule"]').onclick=()=>{card.remove();updateCount();};
        enrichBtn.onclick=async()=>{
          const curTitle=titleInput.value.trim();if(!curTitle)return;
          enrichBtn.disabled=true;enrichBtn.textContent='…';
          try{
            const enriched=typeof stageEnrichGrammarRule==='function'?await stageEnrichGrammarRule(curTitle,card.querySelector('[data-rule-key="explanation"]')?.value||''):null;
            if(enriched){
              if(!card.querySelector('[data-rule-key="ru"]')?.value)card.querySelector('[data-rule-key="ru"]').value=enriched.ru||'';
              if(!card.querySelector('[data-rule-key="explanation"]')?.value)card.querySelector('[data-rule-key="explanation"]').value=enriched.en||'';
              if(!card.querySelector('[data-rule-key="pattern"]')?.value)card.querySelector('[data-rule-key="pattern"]').value=enriched.pattern||'';
              if(!card.querySelector('[data-rule-key="patternRu"]')?.value)card.querySelector('[data-rule-key="patternRu"]').value=enriched.patternRu||'';
              if(!card.querySelector('[data-rule-key="contrast"]')?.value)card.querySelector('[data-rule-key="contrast"]').value=enriched.contrast||'';
              if(!card.querySelector('[data-rule-key="contrastRu"]')?.value)card.querySelector('[data-rule-key="contrastRu"]').value=enriched.contrastRu||'';
              if(!card.querySelector('[data-rule-key="examples"]')?.value&&Array.isArray(enriched.examples)){
                card.querySelector('[data-rule-key="examples"]').value=enriched.examples.map(([e,r])=>e+(r?' ~ '+r:'')).join('\n');
              }
            }
          }finally{
            enrichBtn.disabled=false;enrichBtn.textContent='Oxford';
          }
        };
        return card;
      };
      data.rules.forEach(r=>list.append(renderRuleCard(r,true)));
      addBtn.onclick=()=>{
        const newCard=renderRuleCard({title:'',ru:'',explanation:'',pattern:'',patternRu:'',contrast:'',contrastRu:'',examples:[],pages:[]},true);
        list.prepend(newCard);updateCount();newCard.querySelector('[data-rule-key="title"]')?.focus();
      };
      wrap.append(list);container.append(wrap);
    },true);
    if(!isDocument && file && (file.type==='application/pdf'||/\.pdf$/i.test(file.name||''))){
      section('pdf','Lesson PDF',(container)=>{
        const box=document.createElement('div');box.className='lm-pdf-form-box';
        box.innerHTML=
          '<div class="saas-form-group"><label class="saas-label">PDF block title</label><input class="saas-input" data-pdf-field="pdf-title" value="'+esc(file.name)+'" placeholder="PDF title"></div>'+
          '<p class="saas-text-muted" style="margin-top:6px;font-size:12px">Source file: '+esc(file.name)+' ('+(typeof lmFileSize==='function'?lmFileSize(file.size):Math.round(file.size/1024)+' KB')+')</p>';
        container.append(box);
      },true);
    }
    if(data.warnings.length){const warnings=document.createElement('p');warnings.textContent='Review required: '+data.warnings.join(' ');dialog.append(warnings);}
    paintPdfBlockBudget();
    let draftConsent=null;
    if(current.published){const label=document.createElement('label');draftConsent=document.createElement('input');draftConsent.type='checkbox';label.append(draftConsent,document.createTextNode(' I agree to unpublish this lesson and save it as a draft until I publish it again.'));dialog.append(label);}
    const status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>{controller.abort();lmPdfProgressEnd();dialog.remove();};
    const apply=document.createElement('button');apply.type='button';apply.textContent='Apply selected sections to draft';dialog.append(cancel,apply);
    dialog.addEventListener('cancel',event=>{if(apply.disabled){event.preventDefault();return;}controller.abort();lmPdfProgressEnd();dialog.remove();});
    apply.onclick=async()=>{
      window.scrollTo({top:0,behavior:'smooth'});
      if(!active()){status.textContent='The lesson or account changed. Import again in the intended lesson.';return;}
      if(current.published&&!draftConsent?.checked){status.textContent='Confirm saving the published lesson as a draft.';return;}
      if(![...choices.values()].some(input=>input.checked)){status.textContent='Select at least one section.';status.classList.add('bad');return;}
      if(!window.LearningMain?.saveLesson||!window.LearningMain?.uploadLessonFile){status.textContent='Server lesson storage is unavailable.';return;}
      status.classList.remove('bad');
      apply.disabled=true;cancel.disabled=true;
      try{
        await window.LearningMain.perform(async()=>{
          if(!active())throw new Error('The lesson changed.');
          const titleInput=dialog.querySelector('[data-pdf-field="title"]');if(titleInput&&titleInput.value.trim())data.title=titleInput.value.trim();
          else if(!String(data.title||'').trim())data.title=file?.name?file.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').trim():'Untitled Lesson';
          const descInput=dialog.querySelector('[data-pdf-field="description"]');if(descInput)data.description=descInput.value.trim();
          const unitInput=dialog.querySelector('[data-pdf-field="unit"]');if(unitInput)data.unit=unitInput.value.trim();
          const lessonInput=dialog.querySelector('[data-pdf-field="lesson"]');if(lessonInput)data.lesson=lessonInput.value.trim();
          const classInput=dialog.querySelector('[data-pdf-field="className"]');if(classInput)data.className=classInput.value.trim();
          const overviewInput=dialog.querySelector('[data-pdf-field="overview"]');if(overviewInput)data.overview=overviewInput.value.trim();
          const pdfTitleInput=dialog.querySelector('[data-pdf-field="pdf-title"]');const pdfTitle=pdfTitleInput?.value.trim()||file.name;
          const wordCards=dialog.querySelectorAll('[data-pdf-word-card]');
          if(wordCards.length){
            const updatedWords=[];
            for(const card of wordCards){
              if(!card.querySelector('[data-word-select]')?.checked)continue;
              const word=card.querySelector('[data-word-key="word"]')?.value.trim()||'';
              if(!word)continue;
              const translation=card.querySelector('[data-word-key="translation"]')?.value.trim()||'';
              const meaning=card.querySelector('[data-word-key="meaning"]')?.value.trim()||word;
              const example=card.querySelector('[data-word-key="example"]')?.value.trim()||'';
              const pages=card.dataset.pages?JSON.parse(card.dataset.pages):[];
              updatedWords.push({word,meaning,translation,example,pages});
            }
            data.words=updatedWords;
          }
          const phraseCards=dialog.querySelectorAll('[data-pdf-phrase-card]');
          if(phraseCards.length){
            const updatedPhrases=[];
            for(const card of phraseCards){
              if(!card.querySelector('[data-phrase-select]')?.checked)continue;
              const phrase=card.querySelector('[data-phrase-key="phrase"]')?.value.trim()||'';
              if(!phrase)continue;
              const translation=card.querySelector('[data-phrase-key="translation"]')?.value.trim()||'';
              const meaning=card.querySelector('[data-phrase-key="meaning"]')?.value.trim()||phrase;
              const example=card.querySelector('[data-phrase-key="example"]')?.value.trim()||'';
              const pages=card.dataset.pages?JSON.parse(card.dataset.pages):[];
              updatedPhrases.push({phrase,meaning,translation,example,pages});
            }
            data.phrases=updatedPhrases;
          }
          const classworkCards=dialog.querySelectorAll('[data-pdf-classwork-card]');
          if(classworkCards.length){
            const updatedClasswork=[];
            for(const card of classworkCards){
              if(!card.querySelector('[data-classwork-select]')?.checked)continue;
              const title=card.querySelector('[data-classwork-key="title"]')?.value.trim()||'';
              if(!title)continue;
              const text=card.querySelector('[data-classwork-key="text"]')?.value.trim()||'';
              const stage=card.querySelector('[data-classwork-key="stage"]')?.value.trim()||card.dataset.stage||'comprehension';
              const kind=card.dataset.kind||'choice';
              const quizType=card.dataset.quizType||'';
              const generated=card.dataset.generated==='true';
              const pages=card.dataset.pages?JSON.parse(card.dataset.pages):[];
              const item={stage,title,text,kind,pages,generated,...(quizType?{quizType}:{})};
              if(kind==='choice'){
                const options=(card.querySelector('[data-classwork-key="options"]')?.value||'').split('\n').map(o=>o.trim()).filter(Boolean);
                const answer=Number(card.querySelector('[data-classwork-key="answer"]')?.value||0);
                const feedback=card.querySelector('[data-classwork-key="feedback"]')?.value.trim()||'';
                Object.assign(item,{options,answer:Number.isFinite(answer)?answer:0,feedback,criteria:'',teacherAnswer:''});
              } else if(kind==='explanation'){
                Object.assign(item,{options:[],answer:-1,feedback:'',criteria:'',teacherAnswer:''});
              } else {
                const criteria=card.querySelector('[data-classwork-key="criteria"]')?.value.trim()||'';
                const teacherAnswer=card.querySelector('[data-classwork-key="teacherAnswer"]')?.value.trim()||'';
                Object.assign(item,{options:[],answer:-1,feedback:'',criteria,teacherAnswer});
              }
              updatedClasswork.push(item);
            }
            data.classwork=updatedClasswork;
          }
          const homeworkCards=dialog.querySelectorAll('[data-pdf-homework-card]');
          if(homeworkCards.length){
            const updatedHomework=[];
            for(const card of homeworkCards){
              if(!card.querySelector('[data-homework-select]')?.checked)continue;
              const title=card.querySelector('[data-homework-key="title"]')?.value.trim()||'';
              if(!title)continue;
              const text=card.querySelector('[data-homework-key="text"]')?.value.trim()||'';
              const stage=card.querySelector('[data-homework-key="stage"]')?.value.trim()||card.dataset.stage||'independent';
              const kind=card.dataset.kind||'choice';
              const quizType=card.dataset.quizType||'';
              const generated=card.dataset.generated==='true';
              const pages=card.dataset.pages?JSON.parse(card.dataset.pages):[];
              const item={stage,title,text,kind,pages,generated,...(quizType?{quizType}:{})};
              if(kind==='choice'){
                const options=(card.querySelector('[data-homework-key="options"]')?.value||'').split('\n').map(o=>o.trim()).filter(Boolean);
                const answer=Number(card.querySelector('[data-homework-key="answer"]')?.value||0);
                const feedback=card.querySelector('[data-homework-key="feedback"]')?.value.trim()||'';
                Object.assign(item,{options,answer:Number.isFinite(answer)?answer:0,feedback,criteria:'',teacherAnswer:''});
              } else if(kind==='explanation'){
                Object.assign(item,{options:[],answer:-1,feedback:'',criteria:'',teacherAnswer:''});
              } else {
                const criteria=card.querySelector('[data-homework-key="criteria"]')?.value.trim()||'';
                const teacherAnswer=card.querySelector('[data-homework-key="teacherAnswer"]')?.value.trim()||'';
                Object.assign(item,{options:[],answer:-1,feedback:'',criteria,teacherAnswer});
              }
              updatedHomework.push(item);
            }
            data.homework=updatedHomework;
          }
          const ruleCards=dialog.querySelectorAll('[data-pdf-rule-card]');
          if(ruleCards.length){
            const updatedRules=[];
            for(const card of ruleCards){
              if(!card.querySelector('[data-rule-select]')?.checked)continue;
              const title=card.querySelector('[data-rule-key="title"]')?.value.trim()||'';
              if(!title)continue;
              const ru=card.querySelector('[data-rule-key="ru"]')?.value.trim()||title;
              const explanation=card.querySelector('[data-rule-key="explanation"]')?.value.trim()||title;
              const pattern=card.querySelector('[data-rule-key="pattern"]')?.value.trim()||'';
              const patternRu=card.querySelector('[data-rule-key="patternRu"]')?.value.trim()||'';
              const contrast=card.querySelector('[data-rule-key="contrast"]')?.value.trim()||'';
              const contrastRu=card.querySelector('[data-rule-key="contrastRu"]')?.value.trim()||'';
              const rawEx=(card.querySelector('[data-rule-key="examples"]')?.value||'').split('\n').map(l=>l.trim()).filter(Boolean);
              const examples=rawEx.map(line=>{const parts=line.split('~');return [parts[0].trim(),parts.slice(1).join('~').trim()];});
              const pages=card.dataset.pages?JSON.parse(card.dataset.pages):[];
              const detail={
                ru,
                en:explanation,
                definition:explanation,
                pattern,
                patternRu,
                contrast,
                contrastRu,
                examples:examples.length?examples:[[title,'']],
                source:'Oxford Practical English Usage'
              };
              const cat=typeof window.stageClassifyGrammarRule==='function'?window.stageClassifyGrammarRule(title,detail):(/\b(vs\.?|versus| or )\b/i.test(title)?'confused':'classes');
              detail.category=cat;
              if(typeof stageSaveGrammarRule==='function'){
                stageSaveGrammarRule(title,detail);
              } else if(window.GrammarDetails){
                window.GrammarDetails[title]=detail;
              }
              updatedRules.push({
                title,
                ru,
                explanation,
                pattern,
                patternRu,
                contrast,
                contrastRu,
                examples:examples.map(([e,r])=>e+(r?' — '+r:'')),
                pages
              });
            }
            data.rules=updatedRules;
          }
          groups=await lmPdfDraftBlocks(data,hash);
          if(!active())throw new Error('The lesson changed.');
          if(typeof stageServerBaseline==='function')await stageServerBaseline(current);
          if(!active())throw new Error('The lesson changed.');
          const draft=JSON.parse(JSON.stringify(current));draft.published=false;
          lmPdfApplyMetadata(draft,data,choices.get('metadata').checked);
          const selected=new Set([...choices].filter(([,input])=>input.checked).map(([key])=>key));
          const added=await lmPdfAppendSections(draft,groups,selected,hash,file.name,pdfTitle);
          status.textContent='Preparing dictionary cards…';
          await lmPdfPrepareCards(draft,active,(done,total)=>lmPdfProgress('Preparing cards',[],done,total),selected);
          if(!active())throw new Error('The lesson changed.');
          const occupied=(current.blocks||[]).length;
          const budget=lmPdfBlockBudget(occupied,draft.blocks.length-occupied);
          if(budget.over)throw new Error(lmPdfBlockBudgetText(occupied,draft.blocks.length-occupied));
          lmPdfProgress('Saving draft');status.textContent='Saving draft…';
          await lmPdfSaveBounded(draft,current,active);
          // Keep confirmed server revisions even if upload fails; retry reuses the same PDF block.
          if(!active())throw new Error('Draft saved, but the lesson or account changed. Reopen the lesson to attach its PDF.');
          if(selected.has('pdf') && !isDocument && file && (file.type==='application/pdf'||/\.pdf$/i.test(file.name||''))){
            const pdf=draft.blocks.find(b=>b.type==='pdf'&&b.pdfImport?.source===hash);
            if(!pdf?.hasFile)await window.LearningMain.uploadLessonFile(draft,pdf,file);
            if(active()){
              Object.assign(current,draft);
              if(typeof stageWriteBlock==='function'){
                stageWriteBlock(draft.id,'blocks',draft.stageRevision||0,{blocks:draft.blocks||[]});
                if(typeof stageFlushBlocks==='function')stageFlushBlocks();
              }
              lmKeepLesson();lmPersist();
            }
          }
          let alertWarning='';
          if(!active())throw new Error('Draft saved, but the lesson or account changed. Reopen the lesson to continue.');
          if(selected.has('rules')&&draft.blocks.some(b=>b.pdfImport?.source===hash&&b.pdfGrammarMissing)){
            try{await window.LearningMain.pdfGrammarAlerts(draft.id,hash);}catch{alertWarning=' Missing Grammar alert could not be delivered. Apply Rules again to retry.';}
          }
          if(active()){lmRenderEditor();lmPdfProgress('Draft ready',[...['words','phrases','rules','classwork','homework'].filter(key=>selected.has(key)).map(key=>key[0].toUpperCase()+key.slice(1)+' saved'),...(selected.has('pdf')?['Lesson PDF attached']:[])],1,1);lmPdfImportStatus('Draft saved: '+added+' new blocks. Review before publishing.'+alertWarning,false);}
          dialog.remove();
          window.scrollTo({top:0,behavior:'smooth'});
        },status);
      }catch(error){status.textContent=error.message;}
      finally{apply.disabled=false;cancel.disabled=false;}
    };
    const mount=document.getElementById('lmPdfProgress')||document.getElementById('material');
    if(mount&&mount.id==='lmPdfProgress'){mount.insertAdjacentElement('afterend',dialog);}
    else if(mount){mount.prepend(dialog);}
    else{document.body.append(dialog);}
    lmPdfProgress('Ready to review',Object.entries(groups).map(([key,rows])=>key[0].toUpperCase()+key.slice(1)+': '+rows.length),1,1);
    lmPdfImportStatus('Review the draft before applying it.',false);
  }catch(error){if(active()){lmPdfProgressEnd();lmPdfImportStatus(error.message||'Could not analyse this PDF.',true);}}
  finally{if(lmPdfDraftRequest===controller){if(!active())lmPdfProgressEnd();drop?.classList.remove('is-busy');const input=document.querySelector('[data-lesson-pdf-import-file]');if(input)input.value='';}}
}

async function lmGenerateLessonFromScript(text, defaultTitle) {
  if(!text||!canEditLessons())return;
  const scriptInputVal = typeof document !== 'undefined' ? document.getElementById('lmScriptInput')?.value : '';
  const appendTasks = typeof document !== 'undefined' && document.getElementById('lmAppendTasks')?.checked;
  const targetCwCount = Math.max(1, parseInt(typeof document !== 'undefined' && document.getElementById('lmClassworkCount')?.value, 10) || 48);
  const targetHwCount = Math.max(1, parseInt(typeof document !== 'undefined' && document.getElementById('lmHomeworkCount')?.value, 10) || 72);
  if(!appendTasks || !lmState){
    const create = typeof lmCreateLesson === 'function' ? lmCreateLesson : window.lmCreateLesson;
    if(typeof create === 'function') create();
  }
  if(!lmState)return;
  if(typeof document !== 'undefined') {
    const input = document.getElementById('lmScriptInput');
    if (input && (text || scriptInputVal)) input.value = text || scriptInputVal;
  }
  lmPdfDraftRequest?.abort();
  document.getElementById('lmPdfDraftDialog')?.remove();
  const controller=new AbortController();lmPdfDraftRequest=controller;
  const current=lmState, generation=viewGen, owner=authUser;
  const active=()=>!controller.signal.aborted&&lmState===current&&viewGen===generation&&authUser===owner&&canEditLessons();
  lmPdfProgress('Generating lesson');
  try{
    const fallbackTitle = defaultTitle || 'Lesson Script';
    const data = lmParseScriptToLessonData(text, fallbackTitle, targetCwCount, targetHwCount);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
    await lmMountLessonDraftDialog(data, hash, { name: (defaultTitle || 'lesson-script') + '.txt', size: text.length }, controller, active, true);
  }catch(error){if(active()){lmPdfProgressEnd();lmPdfImportStatus(error.message||'Could not generate lesson.',true);}}
  finally{if(lmPdfDraftRequest===controller){if(!active())lmPdfProgressEnd();}}
}

function lmStripHtmlOrXml(str) {
  if (!str) return '';
  return str
    .replace(/<(?:p|h[1-6]|li|tr|div|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function lmExtractRtfText(raw) {
  if (!raw) return '';
  let text = raw.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info)[^}]*\}/gi, '');
  text = text.replace(/\\(?:par|line|page)\b/gi, '\n');
  text = text.replace(/\\(?:tab)\b/gi, '\t');
  text = text.replace(/\\u(-?\d+)\??/g, (_, code) => {
    const num = Number(code);
    return num >= 0 ? String.fromCharCode(num) : String.fromCharCode(num + 65536);
  });
  text = text.replace(/\\[a-zA-Z]+(-?\d+)? ?/g, '');
  text = text.replace(/[{}]/g, '');
  return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

async function lmExtractTextFromFile(file) {
  if (!file) return '';
  const name = String(file.name || '').toLowerCase();
  const bytes = await file.arrayBuffer();
  const uint8 = new Uint8Array(bytes);

  const isZip = uint8.length >= 4 && uint8[0] === 0x50 && uint8[1] === 0x4B && uint8[2] === 0x03 && uint8[3] === 0x04;
  const fflate = typeof window !== 'undefined' ? window.fflate : null;

  if ((isZip || /\.(docx|odt|pptx|epub|zip)$/i.test(name)) && fflate?.unzipSync) {
    try {
      const unzipped = fflate.unzipSync(uint8);
      if (unzipped['word/document.xml']) {
        const xml = fflate.strFromU8(unzipped['word/document.xml']);
        return lmStripHtmlOrXml(xml);
      }
      if (unzipped['content.xml']) {
        const xml = fflate.strFromU8(unzipped['content.xml']);
        return lmStripHtmlOrXml(xml);
      }
      const slideKeys = Object.keys(unzipped).filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k)).sort();
      if (slideKeys.length) {
        const slidesText = slideKeys.map(k => lmStripHtmlOrXml(fflate.strFromU8(unzipped[k]))).join('\n\n');
        if (slidesText.trim()) return slidesText.trim();
      }
      const htmlKeys = Object.keys(unzipped).filter(k => /\.(xhtml|html|htm)$/i.test(k)).sort();
      if (htmlKeys.length) {
        const bookText = htmlKeys.map(k => lmStripHtmlOrXml(fflate.strFromU8(unzipped[k]))).join('\n\n');
        if (bookText.trim()) return bookText.trim();
      }
    } catch {}
  }

  let text = '';
  if (uint8.length >= 2 && uint8[0] === 0xFF && uint8[1] === 0xFE) {
    text = new TextDecoder('utf-16le', { fatal: false }).decode(uint8.subarray(2));
  } else if (uint8.length >= 2 && uint8[0] === 0xFE && uint8[1] === 0xFF) {
    text = new TextDecoder('utf-16be', { fatal: false }).decode(uint8.subarray(2));
  } else {
    text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
  }

  if (name.endsWith('.rtf') || text.startsWith('{\\rtf')) {
    const rtfClean = lmExtractRtfText(text);
    if (rtfClean) return rtfClean;
  }

  if (/\.(html|htm)$/i.test(name) || /<html[\s>]/i.test(text.slice(0, 500))) {
    const htmlClean = lmStripHtmlOrXml(text);
    if (htmlClean) return htmlClean;
  }

  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');

  const printableMatch = text.match(/[\w\s.,!?:;\-–—"'()]/g);
  const printableRatio = (printableMatch ? printableMatch.length : 0) / (text.length || 1);
  if (printableRatio < 0.6) {
    const runs = text.match(/[A-Za-z0-9\u0400-\u04FF\s.,!?:;\-–—"'()]{6,}/g) || [];
    text = runs.map(r => r.trim()).filter(r => r.length >= 6).join('\n');
  }

  return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

async function lmHandleScriptFileUpload(file) {
  if (!file || !canEditLessons()) return;
  if (!lmState) {
    const create = typeof lmCreateLesson === 'function' ? lmCreateLesson : window.lmCreateLesson;
    if (typeof create === 'function') create();
  }
  if (!lmState) return;
  const isPdf = (file.type && file.type === 'application/pdf') || /\.pdf$/i.test(file.name || '');
  if (isPdf) {
    return lmImportPdfDraft(file);
  }
  const status = document.getElementById('lmScriptStatus');
  const input = document.getElementById('lmScriptInput');
  if (status) status.textContent = 'Extracting content from ' + file.name + '…';
  try {
    const text = await lmExtractTextFromFile(file);
    if (!text) {
      if (status) status.textContent = 'No readable text found in ' + file.name + '.';
      return;
    }
    if (input) input.value = text;
    if (status) status.textContent = 'Generating lesson from ' + file.name + '…';
    const defaultTitle = file.name ? file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() : 'Lesson Script';
    await lmGenerateLessonFromScript(text, defaultTitle);
    if (status) status.textContent = '';
  } catch (err) {
    if (status) status.textContent = err.message || 'Could not process file.';
  }
}

if(typeof document!=='undefined'){
  document.addEventListener('change', async (e) => {
    const fileInput = e.target.closest('[data-lesson-script-file]');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      await lmHandleScriptFileUpload(file);
      fileInput.value = '';
    }
  });
  document.addEventListener('dragover', (e) => {
    const drop = e.target.closest('[data-lesson-script-drop]');
    if (drop) {
      e.preventDefault();
      drop.classList.add('is-over');
    }
  });
  document.addEventListener('dragleave', (e) => {
    const drop = e.target.closest('[data-lesson-script-drop]');
    if (drop) {
      drop.classList.remove('is-over');
    }
  });
  document.addEventListener('drop', (e) => {
    const drop = e.target.closest('[data-lesson-script-drop]');
    if (drop) {
      drop.classList.remove('is-over');
    }
  });
  document.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-lm-import-tab]');
    if (tab) {
      const isScript = tab.dataset.lmImportTab === 'script';
      const uploadBox = document.getElementById('lmUploadBox');
      const scriptBox = document.getElementById('lmScriptBox');
      if (uploadBox && scriptBox) {
        uploadBox.hidden = isScript;
        scriptBox.hidden = !isScript;
        document.getElementById('lmTabUpload')?.classList.toggle('primary', !isScript);
        document.getElementById('lmTabUpload')?.classList.toggle('ghost', isScript);
        document.getElementById('lmTabScript')?.classList.toggle('primary', isScript);
        document.getElementById('lmTabScript')?.classList.toggle('ghost', !isScript);
      }
      return;
    }
    const btn = e.target.closest('#lmGenerateFromScriptBtn');
    if (btn) {
      const input = document.getElementById('lmScriptInput');
      const status = document.getElementById('lmScriptStatus');
      const text = input?.value?.trim();
      if (!text) {
        if (status) status.textContent = 'Enter a script or topic description first.';
        return;
      }
      if (status) status.textContent = 'Generating lesson structure…';
      try {
        await lmGenerateLessonFromScript(text);
        if (status) status.textContent = '';
      } catch (err) {
        if (status) status.textContent = err.message || 'Generation failed.';
      }
    }
  });
}

if(typeof window!=='undefined'){
  window.lmImportPdfDraft = lmImportPdfDraft;
  window.lmParseScriptToLessonData = lmParseScriptToLessonData;
  window.lmGenerateLessonFromScript = lmGenerateLessonFromScript;
  window.lmPdfProgressEnd = lmPdfProgressEnd;
  window.lmExtractTextFromFile = lmExtractTextFromFile;
  window.lmHandleScriptFileUpload = lmHandleScriptFileUpload;
}
