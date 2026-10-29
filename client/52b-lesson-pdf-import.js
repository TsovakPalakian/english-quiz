// PDF drafts are staged in a dialog; nothing is applied before explicit selection.
var lmPdfDraftRequest = null;
function lmPdfApplyMetadata(draft,data,selected){
  if(selected){draft.title=data.title;draft.description=data.description;if(data.unit)draft.unit=data.unit;if(data.lesson)draft.lesson=data.lesson;}
  // A new lesson still needs its required title when only content sections
  // were selected. Preserve any title/description the teacher already entered.
  if(!String(draft.title||'').trim())draft.title=String(data.title||'').trim();
  if(!draft.title)throw new Error('Enter a lesson title before applying the PDF.');
}
async function lmPdfSavePreparedDraft(draft,current,active){
  try{await window.LearningMain.saveLesson(draft);}
  finally{
    // Keep prepared content locally after a rejected or unconfirmed write.
    // The dialog and immutable import keys allow a retry without duplicates.
    if(active()){Object.assign(current,draft);lmKeepLesson();lmPersist();}
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
  if(label==='Draft ready'){
    const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Import another PDF';button.onclick=()=>document.querySelector('[data-lesson-pdf-import-file]')?.click();node.append(button);
  }
  drop.hidden=true;
}
function lmPdfProgressEnd(){
  document.getElementById('lmPdfProgress')?.remove();
  const drop=document.querySelector('[data-lesson-pdf-import]');if(drop)drop.hidden=false;
}
async function lmPdfPrepareCards(draft,active,onProgress=()=>{},selected=new Set(['words','phrases'])){
  const blocks=draft.blocks.filter(b=>b.pdfImport&&selected.has(b.tab)&&['vocab','phrase'].includes(b.type));
  for(const [index,block] of blocks.entries()){
    if(!active())throw new Error('The lesson or account changed.');
    const row=block.items[0],context={meaning:row.meaning,translation:row.translation||'',example:row.sourceExample??row.example??''},word=row.word||row.phrase;
    if(!context.translation)throw new Error('Missing Russian translation for '+word+'. Analyse the PDF again.');
    const card=await window.LearningMain.lookupLessonCard(word,context);
    if(!active())throw new Error('The lesson or account changed.');
    const definition=await window.LearningMain.dictionary({stageId:card.id});
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
async function lmPdfAppendSections(draft,groups,selected,hash,fileName) {
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
    for(const block of blocks){
      const key=block.pdfImport.key;
      if(known.has(hash+'|'+key)||['words','phrases'].includes(tab)&&vocabulary.has(key))continue;
      draft.blocks.push(JSON.parse(JSON.stringify(block)));added++;
      known.add(hash+'|'+key);if(['words','phrases'].includes(tab))vocabulary.add(key);
    }
  }
  if(selected.has('pdf')&&!draft.blocks.some(b=>b.type==='pdf'&&b.pdfImport?.source===hash)){
    draft.blocks.push({...lmBlank('pdf'),tab:'pdf',title:fileName,pdfImport:{source:hash,section:'pdf',key:'pdf:0'}});
  }
  return added;
}
async function lmPdfDraftBlocks(data, hash) {
  const groups = {overview:[],words:[],phrases:[],rules:[],classwork:[]};
  const add=(tab,type,content,source,index)=>{
    groups[tab].push({...lmBlank(type),...content,tab,pdfImport:{source:hash,section:tab,pages:source.pages||[],generated:!!source.generated,...(source.stage?{stage:source.stage}:{})}});
  };
  add('overview','text',{html:'<p>'+esc(data.overview).replace(/\n/g,'<br>')+'</p>'},{},0);
  data.words.forEach((r,i)=>add('words','vocab',{title:r.word,items:[{word:r.word,meaning:r.meaning,translation:r.translation||'',ipa:'',sourceExample:r.example,example:r.meaning+(r.example?' — '+r.example:'')}]},r,i));
  data.phrases.forEach((r,i)=>add('phrases','phrase',{items:[{phrase:r.phrase,meaning:r.meaning,translation:r.translation||'',example:r.example}]},r,i));
  data.rules.forEach((r,i)=>add('rules','text',{html:'<h3>'+esc(r.title)+'</h3><p>'+esc(r.explanation).replace(/\n/g,'<br>')+'</p>'+r.examples.map(e=>'<p>'+esc(e)+'</p>').join('')},r,i));
  data.classwork.forEach((r,i)=>{
    if(r.kind==='explanation')add('classwork','text',{html:'<h3>'+esc(r.title)+'</h3><p>'+esc(r.text).replace(/\n/g,'<br>')+'</p>'},r,i);
    else if(r.kind==='choice')add('classwork','exercise',{items:[{prompt:r.title+'\n'+r.text,kind:'choice',options:r.options,answer:r.answer,write:''}],pdfTeacherNotes:r.feedback},r,i);
    else add('classwork','task',{title:r.title,text:r.text,criteria:r.criteria,maxPoints:r.criteria.split('\n').reduce((sum,line)=>sum+Number(line.split('|').pop()),0),pdfTeacherNotes:r.teacherAnswer},r,i);
  });
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
async function lmImportPdfDraft(file) {
  if(!canEditLessons()||!lmState||!file)return;
  if(file.size>25*1024*1024||!file.size||((file.type&&file.type!=='application/pdf')||(!file.type&&!/\.pdf$/i.test(file.name||'')))){
    lmPdfImportStatus('Choose a PDF under 25 MB.',true);return;
  }
  lmPdfDraftRequest?.abort();
  document.getElementById('lmPdfDraftDialog')?.remove();
  const controller=new AbortController();lmPdfDraftRequest=controller;
  const current=lmState, generation=viewGen, owner=authUser;
  const active=()=>!controller.signal.aborted&&lmState===current&&viewGen===generation&&authUser===owner&&canEditLessons();
  const drop=document.querySelector('[data-lesson-pdf-import]');drop?.classList.add('is-busy');
  lmPdfImportStatus('',false);lmPdfProgress('Analysing PDF');
  try{
    const bytes=await file.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(!active())return;
    const data=await accountFetch('/api/lessons/parse-pdf?scope=full',{method:'POST',headers:{'Content-Type':'application/pdf'},body:file,signal:controller.signal});
    if(!active())return;
    if(typeof stageEnsureStatic==='function')await stageEnsureStatic('GRAMMAR');
    if(!active())return;
    let groups=await lmPdfDraftBlocks(data,hash);
    if(!active())return;
    const dialog=document.createElement('dialog');dialog.id='lmPdfDraftDialog';dialog.className='lm-pdf-draft saas-card';dialog.setAttribute('open','');
    const heading=document.createElement('h2');heading.textContent='Review PDF lesson draft';dialog.append(heading);
    const hint=document.createElement('p');hint.textContent='Select additional sections for this draft. Existing blocks and manual edits stay unchanged. If the lesson title is empty, the PDF title is used. Words and phrases become full dictionary cards after applying. Verify AI-extracted page references against the PDF.';dialog.append(hint);
    const choices=new Map();
    const section=(key,title,renderContent,checked)=>{
      const details=document.createElement('details'),summary=document.createElement('summary'),label=document.createElement('label'),input=document.createElement('input');
      input.type='checkbox';input.checked=checked;choices.set(key,input);
      const titleSpan=document.createElement('span');titleSpan.textContent=' '+title;
      label.append(input,titleSpan);summary.append(label);details.append(summary);
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
        '<div class="saas-form-group"><label class="saas-label">Lesson</label><input class="saas-input" data-pdf-field="lesson" value="'+esc(data.lesson||'')+'" placeholder="Lesson number"></div></div>';
      container.append(box);
    },!current.title&&!current.description);
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
    for(const key of ['phrases','classwork']){
      section(key,key[0].toUpperCase()+key.slice(1)+' · '+data[key].length,(container)=>{
        const preview=document.createElement('pre');
        preview.textContent=data[key].map(r=>[r.word||r.phrase||r.title,r.meaning||r.explanation||r.text,r.translation,r.example,...(r.examples||[]),...(r.options||[]),r.kind==='choice'?'Teacher key: '+r.options[r.answer]:'',r.criteria,r.teacherAnswer,r.feedback,'Pages: '+r.pages.join(', ')+(r.generated?' · generated practice':'')].filter(Boolean).join('\n')).join('\n\n');
        container.append(preview);
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
    section('pdf','Lesson PDF',(container)=>{
      const preview=document.createElement('pre');preview.textContent=file.name;container.append(preview);
    },true);
    if(data.warnings.length){const warnings=document.createElement('p');warnings.textContent='Review required: '+data.warnings.join(' ');dialog.append(warnings);}
    let draftConsent=null;
    if(current.published){const label=document.createElement('label');draftConsent=document.createElement('input');draftConsent.type='checkbox';label.append(draftConsent,document.createTextNode(' I agree to unpublish this lesson and save it as a draft until I publish it again.'));dialog.append(label);}
    const status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>{controller.abort();lmPdfProgressEnd();dialog.remove();};
    const apply=document.createElement('button');apply.type='button';apply.textContent='Apply selected sections to draft';dialog.append(cancel,apply);
    dialog.addEventListener('cancel',event=>{if(apply.disabled){event.preventDefault();return;}controller.abort();lmPdfProgressEnd();dialog.remove();});
    apply.onclick=async()=>{
      if(!active()){status.textContent='The lesson or account changed. Import again in the intended lesson.';return;}
      if(current.published&&!draftConsent?.checked){status.textContent='Confirm saving the published lesson as a draft.';return;}
      if(![...choices.values()].some(input=>input.checked)){status.textContent='Select at least one section.';return;}
      if(!window.LearningMain?.saveLesson||!window.LearningMain?.uploadLessonFile){status.textContent='Server lesson storage is unavailable.';return;}
      status.classList.remove('bad');
      apply.disabled=true;cancel.disabled=true;
      try{
        await window.LearningMain.perform(async()=>{
          if(!active())throw new Error('The lesson changed.');
          const titleInput=dialog.querySelector('[data-pdf-field="title"]');if(titleInput)data.title=titleInput.value.trim();
          const descInput=dialog.querySelector('[data-pdf-field="description"]');if(descInput)data.description=descInput.value.trim();
          const unitInput=dialog.querySelector('[data-pdf-field="unit"]');if(unitInput)data.unit=unitInput.value.trim();
          const lessonInput=dialog.querySelector('[data-pdf-field="lesson"]');if(lessonInput)data.lesson=lessonInput.value.trim();
          const overviewInput=dialog.querySelector('[data-pdf-field="overview"]');if(overviewInput)data.overview=overviewInput.value.trim();
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
          const added=await lmPdfAppendSections(draft,groups,selected,hash,file.name);
          status.textContent='Preparing dictionary cards…';
          await lmPdfPrepareCards(draft,active,(done,total)=>lmPdfProgress('Preparing cards',[],done,total),selected);
          if(!active())throw new Error('The lesson changed.');
          let pdf=draft.blocks.find(b=>b.type==='pdf'&&b.pdfImport?.source===hash);
          if(draft.blocks.length>200)throw new Error('The lesson would exceed 200 blocks. Select fewer sections.');
          const snapshot=window.LearningMain.lessonSnapshot(draft),baseline=draft.stageLessonBaseline;
          const previous=new Map((baseline?.blocks||[]).map(b=>[b.id,b]));
          const upserts=snapshot.blocks.filter(b=>JSON.stringify({...b,expectedRevision:0})!==JSON.stringify({...previous.get(b.id),expectedRevision:0}));
          const payload=baseline?{changes:snapshot.changes,upserts,deletes:[],order:snapshot.blocks.map(b=>b.id||null)}:snapshot;
          if(new TextEncoder().encode(JSON.stringify(payload)).length>58000)throw new Error('Selected content is too large for one save. Apply fewer sections.');
          lmPdfProgress('Saving draft');status.textContent='Saving draft…';
          await lmPdfSavePreparedDraft(draft,current,active);
          // Keep confirmed server revisions even if upload fails; retry reuses the same PDF block.
          if(!active())throw new Error('Draft saved, but the lesson or account changed. Reopen the lesson to attach its PDF.');
          if(selected.has('pdf')){
            pdf=draft.blocks.find(b=>b.type==='pdf'&&b.pdfImport?.source===hash);
            if(!pdf?.hasFile)await window.LearningMain.uploadLessonFile(draft,pdf,file);
            if(active()){Object.assign(current,draft);lmKeepLesson();lmPersist();}
          }
          let alertWarning='';
          if(!active())throw new Error('Draft saved, but the lesson or account changed. Reopen the lesson to continue.');
          if(selected.has('rules')&&draft.blocks.some(b=>b.pdfImport?.source===hash&&b.pdfGrammarMissing)){
            try{await window.LearningMain.pdfGrammarAlerts(draft.id,hash);}catch{alertWarning=' Missing Grammar alert could not be delivered. Apply Rules again to retry.';}
          }
          if(active()){lmRenderEditor();lmPdfProgress('Draft ready',[...['words','phrases','rules','classwork'].filter(key=>selected.has(key)).map(key=>key[0].toUpperCase()+key.slice(1)+' saved'),...(selected.has('pdf')?['Lesson PDF attached']:[])],1,1);lmPdfImportStatus('Draft saved: '+added+' new blocks. Review before publishing.'+alertWarning,false);}
          dialog.remove();
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
