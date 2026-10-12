(() => {
  'use strict';
  const mounted=new WeakMap();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=color=>/^#[a-f0-9]{6}$/i.test(color||'');
  function html(text,format){
    if(!format?.runs||format.runs.map(run=>run.text).join('')!==text)return escape(text);
    return format.runs.map(run=>'<span'+(valid(run.marks?.color)?' style="color:'+run.marks.color+'"':'')+'>'+escape(run.text)+'</span>').join('');
  }
  function read(rich){
    const runs=[];
    function walk(node,color){
      if(node.nodeType===3){runs.push({text:node.textContent,marks:color?{color}:{}});return;}
      if(node.nodeType!==1)return;
      if(node.tagName==='BR'){runs.push({text:'\n',marks:{}});return;}
      if(node.style.color){const match=/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(node.style.color);color=match?'#'+match.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):valid(node.style.color)?node.style.color:color;}
      if(node.tagName==='FONT'&&valid(node.getAttribute('color')))color=node.getAttribute('color');
      if(['DIV','P','LI'].includes(node.tagName)&&runs.length&&!runs.at(-1).text.endsWith('\n'))runs.push({text:'\n',marks:{}});
      node.childNodes.forEach(child=>walk(child,color));
    }
    rich.childNodes.forEach(node=>walk(node,''));return {runs};
  }
  function mount(field,options={}){
    if(!field||mounted.has(field)||field.disabled||field.readOnly)return;
    const wrap=document.createElement('div');wrap.className='text-color-input';
    const tools=document.createElement('div');tools.className='text-color-tools';
    const palette=document.createElement('input');palette.type='color';palette.value='#173832';palette.title='Text color';palette.setAttribute('aria-label','Text color');
    const single=field.tagName==='INPUT';
    const rich=document.createElement('div');rich.className='text-color-rich'+(single?' is-single-line':'');rich.contentEditable='true';rich.setAttribute('role','textbox');rich.setAttribute('aria-multiline',String(!single));rich.setAttribute('aria-label',field.getAttribute('aria-label')||'Formatted text');
    rich.hidden=true;field.before(wrap);wrap.append(tools,field,rich);tools.append(palette);
    const state={field,rich,options,format:options.format,active:false};mounted.set(field,state);
    function update(){if(field.disabled||field.readOnly)return;const format=read(rich);field.value=format.runs.map(run=>run.text).join('');state.format=format;options.onChange?.(format);field.dispatchEvent(new Event('input',{bubbles:true}));}
    function activate(){
      if(state.active)return;rich.innerHTML=html(field.value,state.format);field.hidden=true;rich.hidden=false;state.active=true;
    }
    if(options.format?.runs&&options.format.runs.some(run=>valid(run.marks?.color))){activate();}
    let start=0,end=0,range;
    palette.addEventListener('pointerdown',()=>{if(!state.active){start=field.selectionStart||0;end=field.selectionEnd||0;}else{const selected=getSelection();if(selected.rangeCount&&rich.contains(selected.anchorNode))range=selected.getRangeAt(0).cloneRange();}});
    palette.addEventListener('input',()=>{
      if(field.disabled||field.readOnly)return;
      const wasActive=state.active;activate();rich.focus();const selected=getSelection();
      if(wasActive&&range&&rich.contains(range.commonAncestorContainer)){selected.removeAllRanges();selected.addRange(range);}
      else if(!wasActive){
        const walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT),nodes=[];let node;while((node=walker.nextNode()))nodes.push(node);
        let offset=0;const next=document.createRange();next.selectNodeContents(rich);next.collapse(false);
        for(const text of nodes){if(start>=offset&&start<=offset+text.length){next.setStart(text,start-offset);break;}offset+=text.length;}
        offset=0;for(const text of nodes){if(end>=offset&&end<=offset+text.length){next.setEnd(text,end-offset);break;}offset+=text.length;}
        selected.removeAllRanges();selected.addRange(next);
      }
      const previous=document.queryCommandState('styleWithCSS');
      try{document.execCommand('styleWithCSS',false,true);document.execCommand('foreColor',false,palette.value);}finally{document.execCommand('styleWithCSS',false,previous);}
      update();
    });
    rich.addEventListener('input',update);
    rich.addEventListener('beforeinput',event=>{if(single&&['insertParagraph','insertLineBreak'].includes(event.inputType))event.preventDefault();});
    rich.addEventListener('blur',()=>{const selected=getSelection();if(selected.rangeCount&&rich.contains(selected.anchorNode))state.range=selected.getRangeAt(0).cloneRange();});
    new MutationObserver(()=>{palette.disabled=field.disabled||field.readOnly;rich.contentEditable=String(!palette.disabled);}).observe(field,{attributes:true,attributeFilter:['disabled','readonly']});
    rich.addEventListener('paste',event=>{event.preventDefault();const text=event.clipboardData.getData('text/plain');document.execCommand('insertText',false,single?text.replace(/[\r\n]+/g,' '):text);update();});
    for(const type of ['keydown','keyup','compositionstart','compositionend'])rich.addEventListener(type,event=>{const forwarded=type.startsWith('composition')?new CompositionEvent(type,{data:event.data}):new KeyboardEvent(type,{key:event.key,code:event.code,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,isComposing:event.isComposing,cancelable:true});if(!field.dispatchEvent(forwarded))event.preventDefault();});
  }
  function sync(field,format){const state=mounted.get(field);if(!state)return;if(arguments.length>1)state.format=format;if(state.active){state.rich.innerHTML=html(field.value,state.format);state.rich.contentEditable=String(!field.disabled&&!field.readOnly);} }
  function insert(field,text){const state=mounted.get(field);if(!state?.active)return false;state.rich.focus();if(state.range&&state.rich.contains(state.range.commonAncestorContainer)){const selected=getSelection();selected.removeAllRanges();selected.addRange(state.range);}document.execCommand('insertText',false,text);state.rich.dispatchEvent(new Event('input'));return true;}
  function paint(element,part){
    for(const [key,format] of Object.entries(part.textFormatting||{})){
      const [name,index]=key.split(':'),item=index!==''?(part.items||part.lines||[])[Number(index)]:part,value=String(item?.[name]||'');if(!value||format.runs?.map(run=>run.text).join('')!==value)continue;
      const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;
      while((node=walker.nextNode()))if(!node.parentElement.closest('textarea,input,select,.text-color-rendered')&&node.textContent.includes(value)){
        const at=node.textContent.indexOf(value),span=document.createElement('span');span.className='text-color-rendered';span.innerHTML=html(value,format);const fragment=document.createDocumentFragment();fragment.append(document.createTextNode(node.textContent.slice(0,at)),span,document.createTextNode(node.textContent.slice(at+value.length)));node.replaceWith(fragment);break;
      }
    }
  }
  function trim(format,text){
    if(!format?.runs||format.runs.map(run=>run.text).join('')!==text)return null;const trimmed=text.trim(),start=text.indexOf(trimmed),end=start+trimmed.length;let offset=0;
    return {runs:format.runs.flatMap(run=>{const from=Math.max(start-offset,0),to=Math.min(end-offset,run.text.length);offset+=run.text.length;return to>from?[{text:run.text.slice(from,to),marks:run.marks}]:[];})};
  }
  function format(field){const state=mounted.get(field);return state?.format?.runs?.map(run=>run.text).join('')===field.value?state.format:null;}
  function paintValue(element,text,format){
    if(!element||!format?.runs||format.runs.map(run=>run.text).join('')!==text)return;
    const ranges=[];let start=0;for(const run of format.runs){ranges.push({...run,start,end:start+run.text.length});start+=run.text.length;}
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),nodes=[];let node;while((node=walker.nextNode()))nodes.push(node);let offset=0;
    for(const item of nodes){const at=text.indexOf(item.textContent,offset);if(at<0||!item.textContent)continue;const end=at+item.textContent.length;offset=end;
      const sliced={runs:ranges.filter(run=>run.end>at&&run.start<end).map(run=>({text:text.slice(Math.max(at,run.start),Math.min(end,run.end)),marks:run.marks}))};const span=document.createElement('span');span.innerHTML=html(item.textContent,sliced);item.replaceWith(span);
    }
  }
  window.TextColors={mount,html,read,sync,insert,paint,paintValue,trim,format};
})();
