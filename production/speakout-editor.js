(() => {
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const url=value=>{try{const parsed=new URL(value);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?parsed.href:'';}catch{return '';}};
  const types=['text','heading','pdf','link','cards','image','audio','video','vocab','exercise','note','dialogue','reading','pronunciation','table','task','file','divider','phrase','quiz','wordcard','rule'];
  const quizzes=['Choice','Select all','True / false','Type','Gap','Build','Match','Listen','Spell','Memory'];
  const labels={wordcard:'Word',vocab:'Vocabulary',phrase:'Phrases'};
  const lists={cards:['front','back','example'],vocab:['word','translation','ipa','example'],phrase:['phrase','meaning','example'],dialogue:['speaker','text'],exercise:['prompt','write','options'],quiz:['prompt','answer','options']};
  const fonts={'':'',serif:'Georgia, serif',sans:'Arial, sans-serif',mono:'monospace',georgia:'Georgia',verdana:'Verdana',palatino:'Palatino',trebuchet:'Trebuchet MS',courier:'Courier New'};
  const caption=value=>labels[value]||value[0].toUpperCase()+value.slice(1);
  const itemLabel={ipa:'Transcription',prompt:'Question',write:'Correct answer',answer:'Correct answer',text:'Line'};
  const sizeOf=block=>Math.min(96,Math.max(10,Number(block.fontSize)||17));
  let root,location,api,authorized,navigate,owner='',editing=false,canEdit=false,doc,answers={},busy=false,token=0,tab='overview',dirty=false,pending=null,selection;
  const drafts=new Map();
  const draftKey=()=>owner+':'+JSON.stringify(location);
  const cacheKey=()=> 'speakout-lesson:'+owner+':'+(canEdit?'staff':'student')+':'+JSON.stringify(location);
  let changeSerial=0;
  function cacheCurrent(){window.ContentCache.set(cacheKey(),{cacheRevision:null,materials:[{...structuredClone(doc),answers:structuredClone(answers)}]});}
  const $=id=>root.querySelector('#'+id);
  function clean(html){
    const box=document.createElement('div');box.innerHTML=html||'';
    const allowed=new Set(['P','BR','B','STRONG','I','EM','U','S','STRIKE','SPAN','FONT','DIV','UL','OL','LI','H2','H3','BLOCKQUOTE','A']);
    for(const node of [...box.querySelectorAll('*')]){
      if(['SCRIPT','STYLE','IFRAME','OBJECT','IMG','SVG'].includes(node.tagName)){node.remove();continue;}
      if(!allowed.has(node.tagName)){node.replaceWith(...node.childNodes);continue;}
      if(node.tagName==='FONT'){
        const span=document.createElement('span');span.style.color=node.getAttribute('color')||node.style.color;
        const sizes=['','12px','14px','16px','18px','24px','32px','40px'];span.style.fontSize=sizes[Number(node.getAttribute('size'))]||node.style.fontSize;
        span.append(...node.childNodes);node.replaceWith(span);continue;
      }
      const href=node.tagName==='A'?url(node.getAttribute('href')):'';
      const color=node.style.color,size=node.style.fontSize,family=node.style.fontFamily,weight=node.style.fontWeight,italic=node.style.fontStyle,decoration=node.style.textDecorationLine;
      for(const attr of [...node.attributes])node.removeAttribute(attr.name);
      if(color)node.style.color=color;
      if(/^\d+(?:\.\d+)?(?:px|em|rem|%)$/.test(size))node.style.fontSize=size;
      if(Object.values(fonts).some(value=>value===family.replace(/["']/g,'')))node.style.fontFamily=family;
      if(/^(?:[1-9]00|normal|bold|bolder|lighter)$/.test(weight))node.style.fontWeight=weight;
      if(['normal','italic','oblique'].includes(italic))node.style.fontStyle=italic;
      if(/^(?:none|underline|line-through|underline line-through)$/.test(decoration))node.style.textDecorationLine=decoration;
      if(href){node.href=href;node.target='_blank';node.rel='noopener noreferrer';}
    }return box.innerHTML;
  }
  function init(){
    if(root)return;
    const css=document.createElement('link');css.rel='stylesheet';css.href='/speakout-editor.css?v=20261012-independent';document.head.append(css);
    root=document.getElementById('speakouteditor');
    root.innerHTML='<div class="lm"><div class="meta lm-meta"><button class="btn ghost" type="button" data-nav-back data-fallback="speakout">Back</button><h1 id="seName">Learning material</h1><div class="lm-actions"><button class="lm-btn" id="seEdit" type="button">Editor</button><button class="lm-btn" id="seSave" type="button">Save draft</button><button class="lm-btn lm-btn-primary" id="sePublish" type="button">Publish</button></div></div><nav id="sePath" class="page-path" aria-label="Breadcrumb"></nav><div id="seIntro"><p class="lm-kicker">Create learning material</p><p class="lm-lead">Build a complete lesson from reusable content blocks.</p></div><p id="seStatus" class="lm-note" role="status"></p><div id="seFields" class="lm-sheet"><h2>Basic information</h2><label>Description<textarea id="seDescription" maxlength="5000"></textarea></label></div><div class="lm-content-head"><h2 id="sePageTitle">Overview</h2><span id="sePublished" class="lm-status">Draft</span></div><div id="seBlocks"></div><div id="seAddRow" class="lm-add-wrap"><select id="seType" aria-label="Content type" hidden>'+types.map(type=>'<option value="'+type+'">'+(labels[type]||type[0].toUpperCase()+type.slice(1))+'</option>').join('')+'</select><button class="lm-add" type="button" id="seAdd">+ Add content</button><div class="lm-picker" id="sePicker" hidden><p>Add content</p><div class="lm-picker-grid">'+types.map(type=>'<button type="button" data-se-add="'+type+'">'+(labels[type]||type[0].toUpperCase()+type.slice(1))+'</button>').join('')+'</div></div></div><button class="lm-preview-btn" id="sePreview" type="button">Preview</button><button class="lm-btn lm-btn-primary" type="button" id="seAnswers">Save answers</button></div>';
    window.enquizMountCrumbs?.(root);
    root.addEventListener('input',input);root.addEventListener('change',input);root.addEventListener('click',click);
    root.addEventListener('mousedown',event=>{if(event.target.closest('[data-se-format],[data-se-font-step]'))event.preventDefault();});
    root.addEventListener('dragstart',event=>{const grip=event.target.closest('[data-se-grip]');if(!grip||!editing||busy)return;event.dataTransfer.setData('application/x-speakout-block',grip.closest('[data-se-block]').dataset.seBlock);});
    root.addEventListener('dragover',event=>{if(editing&&!busy&&(event.target.closest('[data-se-block]')||event.target.closest('.lm-drop')))event.preventDefault();});
    root.addEventListener('drop',event=>{
      if(!editing||busy||!canEdit||!authorized())return;
      const fileInput=event.target.closest('.lm-drop')?.querySelector('[data-se-file]');
      if(fileInput&&event.dataTransfer.files.length){event.preventDefault();fileInput.files=event.dataTransfer.files;void input({target:fileInput});return;}
      const id=event.dataTransfer.getData('application/x-speakout-block'),target=event.target.closest('[data-se-block]')?.dataset.seBlock;
      if(!id||!target||id===target)return;event.preventDefault();const from=doc.blocks.findIndex(block=>block.id===id),to=doc.blocks.findIndex(block=>block.id===target);if(from<0||to<0)return;doc.blocks.splice(to,0,doc.blocks.splice(from,1)[0]);remember();render();
    });
    document.addEventListener('selectionchange',()=>{const selected=getSelection();if(selected?.rangeCount&&selected.anchorNode?.parentElement?.closest('#speakouteditor [data-se-rich]'))selection=selected.getRangeAt(0).cloneRange();});
    new MutationObserver(()=>{if(!root.classList.contains('on'))stopMedia();else if(doc)render();}).observe(root,{attributes:true,attributeFilter:['class']});
  }
  function stopMedia(){root.querySelectorAll('audio,video').forEach(node=>node.pause());root.querySelectorAll('iframe').forEach(node=>node.remove());}
  function note(text){$('seStatus').textContent=text;}
  function field(block,key,multiline=false){const value=Array.isArray(block[key])?block[key].join('\n'):block[key]||'';return '<label>'+escape(key[0].toUpperCase()+key.slice(1))+(multiline?'<textarea':'<input')+' data-se-field="'+key+'"'+(Array.isArray(block[key])?' data-se-array':'')+'>'+(multiline?escape(value)+'</textarea>':'')+(multiline?'':'</input>')+'</label>';}
  function inputField(block,key,multiline=false){if(multiline)return field(block,key,true);return '<label>'+escape(key[0].toUpperCase()+key.slice(1))+'<input type="text" data-se-field="'+key+'" value="'+escape(block[key]||'')+'"></label>';}
  function textStyle(block){return 'font-size:'+sizeOf(block)+'px;'+(fonts[block.fontFamily]?'font-family:'+fonts[block.fontFamily]+';':'');}
  function rich(block){return '<div class="lm-tools"><select data-se-font-family aria-label="Font">'+Object.keys(fonts).map(key=>'<option value="'+key+'"'+(key===(block.fontFamily||'')?' selected':'')+'>'+({sans:'Sans',mono:'Mono',trebuchet:'Trebuchet',courier:'Courier'}[key]|| (key?caption(key):'Font'))+'</option>').join('')+'</select><button type="button" data-se-font-step="1" title="Larger text" aria-label="Larger text">A+</button><button type="button" data-se-font-step="-1" title="Smaller text" aria-label="Smaller text">A&#8722;</button><input class="lm-font-size" type="number" min="10" max="96" step="1" data-se-font-size value="'+sizeOf(block)+'" aria-label="Font size"><button type="button" data-se-format="bold" title="Bold"><b>B</b></button><button type="button" data-se-format="italic" title="Italic"><i>I</i></button><button type="button" data-se-format="underline" title="Underline"><u>U</u></button><button type="button" data-se-format="insertUnorderedList">List</button><button type="button" data-se-format="link">Link</button><input type="color" data-se-color title="Text color" aria-label="Text color"></div><div class="lm-rich" style="'+escape(textStyle(block))+'" contenteditable="true" role="textbox" aria-label="Text" data-se-rich>'+clean(block.html)+'</div>';}
  function rows(block){
    const key=block.type==='dialogue'?'lines':'items',schema=lists[block.type];
    return '<div class="lm-card-list'+(block.type==='dialogue'?' lm-lines':'')+'">'+(block[key]||[]).map((item,index)=>'<div class="lm-card-row" data-se-item="'+index+'"><div class="lm-card-fields">'+schema.map(name=>name==='options'?'<label>Options<textarea data-se-item-field="options">'+escape((item.options||[]).join('\n'))+'</textarea></label>':'<label>'+escape(itemLabel[name]||caption(name))+'<input type="text" data-se-item-field="'+name+'" value="'+escape(item[name]??'')+'"></label>').join('')+'</div><div class="lm-card-actions"><button class="lm-icon" type="button" data-se-item-move="-1" title="Move up" aria-label="Move item up">&#8593;</button><button class="lm-icon" type="button" data-se-item-move="1" title="Move down" aria-label="Move item down">&#8595;</button><button class="lm-icon danger" type="button" data-se-remove-item="'+index+'" title="Delete" aria-label="Delete item">&#215;</button></div></div>').join('')+'</div><button class="lm-add-card" type="button" data-se-add-item>+ Add '+({cards:'card',vocab:'word',phrase:'phrase',dialogue:'line',quiz:'question',exercise:'question'}[block.type]||'item')+'</button>';
  }
  function assignmentOptions(block){return '<option value="">Standalone</option>'+doc.blocks.filter(other=>['task','quiz','exercise'].includes(other.type)&&other.id!==block.id&&!other.assignmentKey).map(other=>{const key=other.assignmentId||other.id;return '<option value="'+escape(key)+'"'+(block.assignmentKey===key?' selected':'')+'>'+escape(other.title||caption(other.type))+'</option>';}).join('');}
  function assignment(block){return '<label>Assignment<select data-se-field="assignmentKey">'+assignmentOptions(block)+'</select></label>';}
  function head(block){return '<div class="lm-block-head"><button class="lm-grip" type="button" draggable="true" data-se-grip title="Drag to move" aria-label="Drag to move">&#8801;</button><span class="lm-type">'+caption(block.type)+'</span><div class="lm-head-actions"><button class="lm-icon" type="button" data-se-fold title="'+(block.collapsed?'Expand':'Collapse')+'" aria-label="'+(block.collapsed?'Expand':'Collapse')+'">'+(block.collapsed?'&#9656;':'&#9662;')+'</button><button class="lm-icon" type="button" data-se-move="-1" title="Move up" aria-label="Move up">&#8593;</button><button class="lm-icon" type="button" data-se-move="1" title="Move down" aria-label="Move down">&#8595;</button><button class="lm-icon" type="button" data-se-menu title="More" aria-label="More">&#8942;</button><button class="lm-icon danger" type="button" data-se-delete title="Delete" aria-label="Delete block"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button><div class="lm-pop" data-se-pop hidden><button type="button" data-se-focus>Edit</button></div></div></div><p class="lm-summary">'+escape(block.title||block.text||block.word||caption(block.type))+'</p>';}
  function fileBox(block){
    const kind=block.type==='pronunciation'?'audio':block.type,accept={pdf:'application/pdf,.pdf',image:'image/*',audio:'audio/*',pronunciation:'audio/*',file:'.pdf,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.ogg'}[block.type]||'*/*';
    const picker='<input type="file" accept="'+accept+'" data-se-file>';
    if(block.localMediaKey)return '<div class="lm-file"><div class="lm-file-copy"><b>'+escape(block.name||'File')+'</b><small>'+escape(block.fileType||'')+'</small></div><div class="lm-file-actions"><a class="lm-linkish" href="'+escape(media(block))+'" target="_blank" rel="noopener noreferrer">Open</a><label class="lm-linkish">'+picker+'Replace</label><button class="lm-icon danger" type="button" data-se-detach aria-label="Remove attachment" title="Remove attachment">&#215;</button></div></div>';
    return '<label class="lm-drop">'+picker+'<span>Drop '+kind+' here</span><small>or click to upload</small></label>'+inputField(block,'remoteUrl');
  }
  function editor(block){
    if(block.type==='text')return rich(block);
    if(lists[block.type])return inputField(block,'title')+(block.type==='quiz'?'<label>Quiz type<select data-se-field="quizType">'+quizzes.map(type=>'<option'+(type===block.quizType?' selected':'')+'>'+escape(type)+'</option>').join('')+'</select></label>':'')+rows(block);
    if(block.type==='table')return '<div class="se-table"><table class="lm-grid"><thead><tr>'+(block.columns||[]).map((column,index)=>'<th><input type="text" data-se-column="'+index+'" value="'+escape(column)+'"></th>').join('')+'<th></th></tr></thead><tbody>'+(block.rows||[]).map((row,index)=>'<tr>'+(block.columns||[]).map((_,column)=>'<td><input type="text" data-se-cell="'+index+':'+column+'" value="'+escape(row[column]||'')+'"></td>').join('')+'<td><button class="lm-icon danger" type="button" data-se-row-delete="'+index+'" aria-label="Delete row">&#215;</button></td></tr>').join('')+'</tbody></table></div><button class="lm-add-card" type="button" data-se-column-add>+ Column</button><button class="lm-add-card" type="button" data-se-column-delete>&#8722; Column</button><button class="lm-add-card" type="button" data-se-row-add>+ Row</button>';
    if(block.type==='heading')return inputField(block,'text')+'<label>Level<select data-se-field="level"><option value="h2"'+(block.level!=='h3'?' selected':'')+'>H2</option><option value="h3"'+(block.level==='h3'?' selected':'')+'>H3</option></select></label>';
    if(block.type==='note')return '<label>Kind<select data-se-field="tone"><option value="note"'+(block.tone!=='tip'?' selected':'')+'>Note</option><option value="tip"'+(block.tone==='tip'?' selected':'')+'>Tip</option></select></label>'+inputField(block,'text',true);
    const keys={heading:['text'],note:['title','text'],reading:['title','text'],task:['title','text'],divider:['label'],wordcard:['word','ru','ipa','example'],rule:['title','text','example'],link:['title','description','url'],pronunciation:['word','ipa','remoteUrl'],image:['caption','remoteUrl'],audio:['title','remoteUrl'],pdf:['title','remoteUrl'],file:['title','remoteUrl'],video:['title','url']}[block.type]||['title','text'];
    if(['image','audio','pronunciation','pdf','file'].includes(block.type))return keys.filter(key=>key!=='remoteUrl').map(key=>inputField(block,key)).join('')+fileBox(block);
    return keys.map(key=>inputField(block,key,['text','description'].includes(key))).join('');
  }
  function media(block){return block.localMediaKey?'/api/speakout/media?'+new URLSearchParams({...location,block:block.id}):url(block.remoteUrl||block.url);}
  function preview(block){
    const source=media(block);
    if(block.type==='text')return '<div style="'+escape(textStyle(block))+'">'+clean(block.html)+'</div>';
    if(block.type==='image')return source?'<img src="'+escape(source)+'" alt="'+escape(block.caption||'')+'" loading="lazy">':'';
    if(['audio','pronunciation'].includes(block.type))return '<p>'+escape(block.word||block.title||'')+' '+escape(block.ipa||'')+'</p>'+(source?'<audio controls src="'+escape(source)+'"></audio>':'');
    if(block.type==='video'){let embed='';try{const parsed=new URL(source);if(['youtube.com','www.youtube.com','youtu.be'].includes(parsed.hostname)){const id=parsed.hostname==='youtu.be'?parsed.pathname.slice(1):parsed.searchParams.get('v');if(/^[\w-]{11}$/.test(id||''))embed='https://www.youtube.com/embed/'+id;}}catch{}return embed?'<iframe src="'+embed+'" title="'+escape(block.title||'Video')+'" allow="fullscreen" loading="lazy"></iframe>':source?'<video controls src="'+escape(source)+'"></video>':'';}
    if(['pdf','file','link'].includes(block.type))return source?'<a class="btn" href="'+escape(source)+'" target="_blank" rel="noopener noreferrer">'+escape(block.title||block.name||'Open')+'</a>':'';
    if(block.type==='task')return '<p>'+escape(block.text||'')+'</p><textarea data-se-answer aria-label="Your answer">'+escape(answers[block.id]||'')+'</textarea>';
    if(block.type==='table')return '<div class="se-table"><table><thead><tr>'+(block.columns||[]).map(value=>'<th>'+escape(value)+'</th>').join('')+'</tr></thead><tbody>'+(block.rows||[]).map(row=>'<tr>'+row.map(value=>'<td>'+escape(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
    if(['quiz','exercise'].includes(block.type))return (block.items||[]).map((item,index)=>'<label>'+escape(item.prompt||'Question '+(index+1))+'<input data-se-question="'+index+'" value="'+escape(answers[block.id]?.[index]||'')+'"></label>'+(item.options||[]).map(option=>'<span class="se-option">'+escape(option)+'</span>').join('')).join('');
    if(lists[block.type]){const key=block.type==='dialogue'?'lines':'items',schema=lists[block.type];return '<div class="se-cards">'+(block[key]||[]).map(item=>'<details><summary>'+escape(item[schema[0]]||'Card')+'</summary>'+schema.slice(1).map(name=>'<p>'+escape(item[name]||'')+'</p>').join('')+'</details>').join('')+'</div>';}
    return '<p>'+escape(block.text||block.word||block.label||'')+'</p>'+(block.type==='wordcard'?'<details><summary>'+escape(block.word||'Word')+'</summary><p>'+escape(block.ru||'')+'</p><p>'+escape(block.ipa||'')+'</p><p>'+escape(block.example||'')+'</p></details>':'')+(block.example?'<p>'+escape(block.example)+'</p>':'');
  }
  function readBlocks(){
    const leaders=doc.blocks.filter(block=>['task','quiz','exercise'].includes(block.type)&&!block.assignmentKey),keys=new Set(leaders.map(block=>block.assignmentId||block.id));
    return doc.blocks.filter(block=>!keys.has(block.assignmentKey)).map(block=>{
      const number=leaders.indexOf(block),children=number>=0?doc.blocks.filter(child=>child.assignmentKey===(block.assignmentId||block.id)):[];
      const body=children.map(child=>'<div class="lm-panel" data-se-block="'+escape(child.id)+'">'+preview(child)+'</div>').join('')+preview(block);
      return '<article class="se-block lm-block'+(number>=0?' se-assignment se-tone-'+number%4:'')+'" data-se-block="'+escape(block.id)+'"><details><summary>'+(number>=0?'Task '+(number+1)+' · ':'')+escape(block.title||block.word||caption(block.type))+'</summary>'+body+'</details></article>';
    }).join('');
  }
  function render(){
    selection=null;
    stopMedia();$('seName').textContent=doc.title;
    root.querySelector('.lm-content-head').hidden=false;
    $('sePath').className='page-path';$('sePath').innerHTML='<ol>'+[['levels','Speakout'],['level',location.level],['unit','Unit '+(location.unit+1)],['lesson',doc.title]].map(([view,title])=>'<li><button type="button" data-se-path="'+view+'">'+escape(title)+'</button></li>').join('')+(editing?'<li><strong>Edit</strong></li>':'')+'</ol>';
    $('seDescription').value=doc.description||'';
    window.TextColors?.mount($('seDescription'),{format:doc.descriptionFormatting,onChange:format=>{doc.descriptionFormatting=format;remember();}});window.TextColors?.sync($('seDescription'),doc.descriptionFormatting);
    for(const id of ['seIntro','seFields','seAddRow','seSave','sePublish','sePreview'])$(id).hidden=!editing;
    $('sePicker').hidden=true;
    $('sePageTitle').textContent='Overview';$('sePublished').textContent=doc.published?'Published':'Draft';$('sePublished').classList.toggle('is-live',!!doc.published);
    $('seEdit').hidden=editing||!canEdit;
    $('seAnswers').hidden=editing||!doc.published||!doc.blocks.some(block=>['quiz','exercise','task'].includes(block.type));
    $('seBlocks').innerHTML=editing?doc.blocks.map(block=>'<article class="se-block lm-block'+(block.collapsed?' is-shut':'')+'" data-se-block="'+escape(block.id)+'">'+head(block)+'<div class="lm-body">'+assignment(block)+editor(block)+'</div></article>').join(''):readBlocks();
    if(!doc.blocks.length)$('seBlocks').innerHTML='<p class="lm-lead">Nothing on this page yet.</p>';
    if(editing)root.querySelectorAll('[data-se-field], [data-se-item-field]').forEach(field=>{
      if(!field.matches('textarea,input[type=text]'))return;const name=field.dataset.seField||field.dataset.seItemField;if(['criteria','url','remoteUrl','ipa','answer','write'].includes(name))return;
      const part=doc.blocks.find(part=>part.id===field.closest('[data-se-block]').dataset.seBlock),key=name+':'+(field.closest('[data-se-item]')?.dataset.seItem??'');
      window.TextColors?.mount(field,{format:part.textFormatting?.[key],onChange:format=>{part.textFormatting||={};part.textFormatting[key]=format;remember();}});
    });
    else root.querySelectorAll('[data-se-block]').forEach(panel=>{const part=doc.blocks.find(part=>part.id===panel.dataset.seBlock);if(part)window.TextColors?.paint(panel,part);});
    if(!editing)root.querySelectorAll('[data-se-answer],[data-se-question]').forEach(field=>{
      const id=field.closest('[data-se-block]').dataset.seBlock,index=field.dataset.seQuestion??'0';
      window.TextColors?.mount(field,{format:answers._formatting?.[id]?.[index],onChange:format=>{answers._formatting||={};(answers._formatting[id]||={})[index]=format;changeSerial++;}});
    });
  }
  function remember(){changeSerial++;dirty=true;pending=null;if(location&&doc)drafts.set(draftKey(),structuredClone(doc));}
  async function save(published){
    if(!canEdit||!authorized())throw new Error('Access changed. Reopen Speakout.');
    changeSerial++;doc.description=$('seDescription').value;
    const metadata=Object.fromEntries(['date','className','unit','lesson','descriptionFormatting'].filter(key=>doc[key]!==undefined).map(key=>[key,doc[key]]));
    const body={...location,action:'save',expectedRevision:doc.revision||0,published,content:{title:doc.title,description:doc.description,...metadata,blocks:doc.blocks}};
    const signature=JSON.stringify(body);if(!pending||pending.signature!==signature)pending={signature,mutationId:crypto.randomUUID()};
    const result=await api('/api/speakout/lesson',{method:'POST',body:JSON.stringify({...body,mutationId:pending.mutationId})});
    if(!authorized())return;doc.revision=result.revision;doc.published=result.published;pending=null;dirty=false;drafts.delete(draftKey());
    cacheCurrent();note('Saved.');
  }
  async function input(event){
    const target=event.target,block=doc?.blocks.find(item=>item.id===target.closest('[data-se-block]')?.dataset.seBlock);
    if(!authorized())return;
    if(target.hasAttribute('data-se-answer')&&block){changeSerial++;answers[block.id]=target.value;return;}
    if(target.dataset.seQuestion!==undefined&&block){changeSerial++;answers[block.id]||={};answers[block.id][target.dataset.seQuestion]=target.value;return;}
    if(!editing||!canEdit||busy)return;
    if(target.id==='seDescription')doc.description=target.value;
    else if(block){
      if(target.dataset.seField)block[target.dataset.seField]=target.hasAttribute('data-se-array')?target.value.split('\n'):target.value;
      if(target.hasAttribute('data-se-rich'))block.html=clean(target.innerHTML);
      if(target.dataset.seColumn!==undefined)block.columns[Number(target.dataset.seColumn)]=target.value;
      if(target.dataset.seCell){const [row,column]=target.dataset.seCell.split(':').map(Number);block.rows[row][column]=target.value;}
      if(target.hasAttribute('data-se-font-family')){if(Object.hasOwn(fonts,target.value))applyFont(block,'fontFamily',target.value);return;}
      if(target.hasAttribute('data-se-font-size')){applyFont(block,'fontSize',Math.min(96,Math.max(10,Number(target.value)||17)));return;}
      if(target.dataset.seItemField){const key=block.type==='dialogue'?'lines':'items',item=block[key][Number(target.closest('[data-se-item]').dataset.seItem)];item[target.dataset.seItemField]=target.dataset.seItemField==='options'?target.value.split('\n').filter(Boolean):target.value;}
      if(target.hasAttribute('data-se-table-columns'))block.columns=target.value.split('\t');
      if(target.hasAttribute('data-se-table-rows'))block.rows=target.value.split('\n').map(row=>row.split('\t'));
      if(target.hasAttribute('data-se-color')||target.hasAttribute('data-se-size')){const command=target.hasAttribute('data-se-color')?'foreColor':'fontSize';target.closest('[data-se-block]').querySelector('[data-se-rich]').focus();if(selection){const selected=getSelection();selected.removeAllRanges();selected.addRange(selection);}document.execCommand(command,false,target.value);block.html=clean(target.closest('[data-se-block]').querySelector('[data-se-rich]').innerHTML);}
      if(target.hasAttribute('data-se-file')&&target.files[0]){
        const file=target.files[0];busy=true;lock(true);
        try{await save(doc.published);const params=new URLSearchParams({...location,block:block.id,expectedRevision:doc.revision,mutationId:crypto.randomUUID(),name:file.name});const result=await api('/api/speakout/media?'+params,{method:'POST',headers:{'Content-Type':file.type},body:file});doc.revision=result.revision;Object.assign(block,result.block);cacheCurrent();render();note('File saved.');}catch(error){note(error.message);}finally{busy=false;lock(false);}return;
      }
    }remember();if(block&&target.dataset.seField==='assignmentKey')render();
    else if(block&&target.dataset.seField==='title')root.querySelectorAll('[data-se-field="assignmentKey"]').forEach(select=>{const item=doc.blocks.find(row=>row.id===select.closest('[data-se-block]').dataset.seBlock);select.innerHTML=assignmentOptions(item);});
  }
  function richSelection(block){
    const rich=root.querySelector('[data-se-block="'+CSS.escape(block.id)+'"] [data-se-rich]');
    rich.focus();const selected=getSelection();if(selection&&rich.contains(selection.commonAncestorContainer)){selected.removeAllRanges();selected.addRange(selection);}return {rich,selected};
  }
  function applyFont(block,key,value){
    const {rich,selected}=richSelection(block),style=key==='fontSize'?'fontSize':'fontFamily',css=key==='fontSize'?value+'px':fonts[value];
    if(selected.rangeCount&&!selected.isCollapsed&&rich.contains(selected.anchorNode)&&rich.contains(selected.focusNode)){const range=selected.getRangeAt(0),span=document.createElement('span');span.style[style]=css;span.append(range.extractContents());range.insertNode(span);range.selectNodeContents(span);selected.removeAllRanges();selected.addRange(range);selection=range.cloneRange();}
    else{block[key]=value;rich.style[style]=css;}
    block.html=clean(rich.innerHTML);const field=rich.closest('[data-se-block]').querySelector('[data-se-font-size]');if(key==='fontSize')field.value=value;remember();
  }
  function lock(value){root.querySelectorAll('button,input,textarea,select,[contenteditable]').forEach(node=>{if(node.hasAttribute('data-nav-back'))return;if(node.hasAttribute('contenteditable'))node.contentEditable=String(!value);else node.disabled=value;});}
  async function click(event){
    const button=event.target.closest('button');if(!button||busy||!authorized())return;
    if(button.dataset.sePath){if(button.dataset.sePath==='lesson'){editing=false;render();}else navigate?.(button.dataset.sePath);return;}
    if(button.id==='seAnswers'){changeSerial++;busy=true;lock(true);try{await api('/api/speakout/answers',{method:'POST',body:JSON.stringify({...location,expectedRevision:doc.revision,answers})});cacheCurrent();note('Answers saved.');}catch(error){note(error.message);}finally{busy=false;lock(false);}return;}
    if(!canEdit)return;
    if(button.id==='seEdit'){editing=true;render();return;}
    if(button.id==='sePreview'){editing=false;render();return;}
    if(['seSave','sePublish'].includes(button.id)){busy=true;lock(true);try{await save(button.id==='sePublish');if(button.id==='sePublish')editing=false;render();}catch(error){note(error.message);}finally{busy=false;lock(false);}return;}
    if(!editing)return;
    const block=doc.blocks.find(item=>item.id===button.closest('[data-se-block]')?.dataset.seBlock);
    if(button.id==='seAdd'){$('sePicker').hidden=!$('sePicker').hidden;return;}
    if(button.dataset.seAdd){const type=button.dataset.seAdd;doc.blocks.push({id:crypto.randomUUID(),type,tab,title:type==='cards'?'Vocabulary':'',html:'',text:'',items:type==='cards'?[{front:'',back:'',example:''}]:[],lines:[],columns:['Column 1','Column 2'],rows:[],quizType:'Choice'});}
    else if(block){
      if(button.hasAttribute('data-se-menu')){const pop=button.closest('[data-se-block]').querySelector('[data-se-pop]');pop.hidden=!pop.hidden;return;}
      if(button.hasAttribute('data-se-focus')){block.collapsed=false;render();root.querySelector('[data-se-block="'+CSS.escape(block.id)+'"] .lm-body input, [data-se-block="'+CSS.escape(block.id)+'"] [data-se-rich]')?.focus();return;}
      if(button.hasAttribute('data-se-fold'))block.collapsed=!block.collapsed;
      if(button.hasAttribute('data-se-detach')){if(!confirm('Remove this attachment from Speakout?'))return;for(const key of ['localMediaKey','name','fileType','hasFile','fileId','size'])delete block[key];}
      if(button.hasAttribute('data-se-delete')){if(!confirm('Remove this Speakout block?'))return;doc.blocks=doc.blocks.filter(item=>item!==block);for(const item of doc.blocks)if(item.assignmentKey===(block.assignmentId||block.id))item.assignmentKey='';}
      if(button.dataset.seMove){const index=doc.blocks.indexOf(block),next=index+Number(button.dataset.seMove);if(next>=0&&next<doc.blocks.length)[doc.blocks[index],doc.blocks[next]]=[doc.blocks[next],doc.blocks[index]];}
      if(button.hasAttribute('data-se-add-item'))block[block.type==='dialogue'?'lines':'items'].push({options:[]});
      if(button.dataset.seRemoveItem!==undefined)block[block.type==='dialogue'?'lines':'items'].splice(Number(button.dataset.seRemoveItem),1);
      if(button.dataset.seItemMove){const rows=block[block.type==='dialogue'?'lines':'items'],index=Number(button.closest('[data-se-item]').dataset.seItem),next=index+Number(button.dataset.seItemMove);if(next>=0&&next<rows.length)[rows[index],rows[next]]=[rows[next],rows[index]];}
      if(button.hasAttribute('data-se-column-add')){block.columns.push('Column '+(block.columns.length+1));block.rows.forEach(row=>row.push(''));}
      if(button.hasAttribute('data-se-column-delete')&&block.columns.length>1){block.columns.pop();block.rows.forEach(row=>row.pop());}
      if(button.hasAttribute('data-se-row-add'))block.rows.push(block.columns.map(()=>''));
      if(button.dataset.seRowDelete!==undefined)block.rows.splice(Number(button.dataset.seRowDelete),1);
      if(button.dataset.seFontStep){const field=button.closest('[data-se-block]').querySelector('[data-se-font-size]');applyFont(block,'fontSize',Math.min(96,Math.max(10,Number(field.value)+Number(button.dataset.seFontStep))));return;}
      if(button.dataset.seFormat){
        const {rich,selected}=richSelection(block);let command=button.dataset.seFormat,value;
        if(command==='link'){if(selected.isCollapsed){note('Select the text for the link.');return;}selection=selected.getRangeAt(0).cloneRange();const entered=prompt('Link URL','https://');if(entered===null)return;value=url(entered);if(!value){note('Use an HTTPS link.');return;}richSelection(block);command='createLink';}
        document.execCommand(command,false,value);block.html=clean(rich.innerHTML);remember();return;
      }
    }remember();render();
  }
  function display(data){
    const opened=structuredClone(data);doc=opened.materials?.[0];
    if(!doc){stopMedia();$('seName').textContent='Speakout';$('seBlocks').replaceChildren();root.querySelector('.lm-content-head').hidden=true;note('No published material yet.');for(const id of ['seIntro','seFields','seAddRow','seEdit','seSave','sePreview','sePublish','seAnswers'])$(id).hidden=true;return;}
    answers=doc.answers||{};delete doc.answers;const draft=canEdit&&drafts.get(draftKey());if(draft&&draft.revision===doc.revision)doc=draft;dirty=!!draft;
    render();note(dirty?'Unsaved draft restored.':'');
  }
  window.SpeakoutEditor={async open(where,options){
    if(busy)throw new Error('Wait until Speakout finishes saving.');
    init();const seq=++token;location={...where};owner=options.actor;api=options.read;authorized=options.active;navigate=options.navigate;canEdit=options.editor;editing=false;tab='overview';pending=null;selection=null;
    root.dataset.speakLocation=JSON.stringify(where);dirty=false;
    const path='/api/speakout/lesson?'+new URLSearchParams(where);
    const key=cacheKey(),cached=window.ContentCache.get(key),serial=changeSerial;
    const valid=()=>seq===token&&authorized();
    const refresh=async()=>{
      const stamp=await api(path+'&revision=1');if(!valid()||changeSerial!==serial)return;
      if(cached&&cached.cacheRevision===stamp.cacheRevision)return;
      const data=stamp.available?await api(path):stamp;if(!valid()||changeSerial!==serial)return;
      const next={...data,cacheRevision:stamp.cacheRevision};window.ContentCache.set(key,next);
      if(editing||dirty||busy){if(doc?.revision!==next.materials?.[0]?.revision)note('This material changed. Reopen it before saving.');return;}
      display(next);
    };
    if(cached){display(cached);void refresh().catch(()=>{});return;}
    doc=null;note('Loading...');$('seBlocks').replaceChildren();await refresh();
  }};
})();
