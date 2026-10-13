(() => {
  'use strict';
  const valid=value=>/^#[a-f0-9]{6}$/i.test(value),bound=new WeakSet();let open;
  function close(restore=false){if(!open)return;const current=open;open=null;current.popup.remove();current.button.setAttribute('aria-expanded','false');if(restore)current.button.focus({preventScroll:true});}
  function mount(field){
    if(bound.has(field))return;bound.add(field);
    const button=document.createElement('button');button.type='button';button.className='color-picker-button';button.title=field.title||'Text color';button.setAttribute('aria-label',field.getAttribute('aria-label')||button.title);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
    const sample=document.createElement('span');sample.className='color-picker-sample';button.append(sample);field.before(button);field.hidden=true;field.style.display='none';
    const sync=()=>{sample.style.background=field.value;button.disabled=field.disabled;};sync();field.addEventListener('input',sync);
    new MutationObserver(sync).observe(field,{attributes:true,attributeFilter:['disabled','value']});
    button.addEventListener('pointerdown',event=>{event.preventDefault();field.dispatchEvent(new PointerEvent('pointerdown',{bubbles:false}));field.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));});
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();if(open?.button===button){close();return;}close();
      const popup=document.createElement('div');popup.className='color-picker-popup';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Text color');
      const colors=['#173832','#000000','#ffffff','#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2','#2563eb','#7c3aed','#db2777','#64748b'];
      const grid=document.createElement('div');grid.className='color-picker-swatches';
      const apply=value=>{if(!valid(value))return;field.value=value.toLowerCase();field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));sync();close();};
      colors.forEach(color=>{const swatch=document.createElement('button');swatch.type='button';swatch.style.background=color;swatch.title=color;swatch.setAttribute('aria-label',color);swatch.addEventListener('click',()=>apply(color));grid.append(swatch);});
      const label=document.createElement('label');label.textContent='HEX';const input=document.createElement('input');input.type='text';input.value=field.value;input.maxLength=7;input.setAttribute('aria-label','HEX color');label.append(input);popup.append(grid,label);
      input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(valid(input.value))apply(input.value);else input.setCustomValidity('Use #RRGGBB.');}});
      input.addEventListener('change',()=>{if(valid(input.value))apply(input.value);});input.addEventListener('input',()=>input.setCustomValidity(''));
      document.body.append(popup);const rect=button.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-244))+'px';popup.style.top=Math.max(8,Math.min(rect.bottom+6,innerHeight-180))+'px';
      open={button,popup,field};button.setAttribute('aria-expanded','true');
    });
  }
  function scan(root=document){root.querySelectorAll('input[type=color]').forEach(mount);if(open&&!open.button.isConnected)close();}
  document.addEventListener('pointerdown',event=>{if(open&&event.target!==open.field&&!open.popup.contains(event.target)&&!open.button.contains(event.target))close();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){event.preventDefault();close(true);}},true);
  let scheduled=false;new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;scan();});}}).observe(document.documentElement,{childList:true,subtree:true});
  window.ColorPicker={scan,close};scan();
})();
