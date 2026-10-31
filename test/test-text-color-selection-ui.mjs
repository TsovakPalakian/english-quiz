import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
const textColors=readFileSync(new URL('../client/shared/text-colors.js',import.meta.url),'utf8');
const colorPicker=readFileSync(new URL('../production/color-picker.js',import.meta.url),'utf8');

async function boot(page,mode='formatted',text='alpha beta gamma'){
  await page.setContent('<textarea id="field">'+text+'</textarea><div id="toolbar"></div>');
  await page.addScriptTag({content:textColors});
  await page.evaluate(({mode,text})=>{
    const field=document.getElementById('field');
    field.value=text;
    TextColors.mount(field,mode==='plain'?{}:{format:{runs:[{text,marks:{color:'#173832'}}]},richTools:mode==='rich-tools'});
    document.getElementById('toolbar').append(document.querySelector('.text-color-tools'));
  },{mode,text});
  await page.addScriptTag({content:colorPicker});
}

async function setOffsets(page,start,end){
  await page.evaluate(({start,end})=>{
    const field=document.getElementById('field'),rich=document.querySelector('.text-color-rich');
    if(!rich||rich.hidden){field.focus();field.setSelectionRange(start,end);return;}
    rich.focus();
    const range=document.createRange(),walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);
    let offset=0,node,started=false;
    while((node=walker.nextNode())){
      const next=offset+node.length;
      if(!started&&start>=offset&&start<=next){range.setStart(node,start-offset);started=true;}
      if(started&&end>=offset&&end<=next){range.setEnd(node,end-offset);break;}
      offset=next;
    }
    const selected=getSelection();selected.removeAllRanges();selected.addRange(range);
  },{start,end});
}

async function assertColoredSlice(page,color,start,end,fullText){
  const saved=await page.evaluate(()=>({text:document.getElementById('field').value,format:TextColors.format(document.getElementById('field'))}));
  assert.equal(saved.text,fullText);
  const letters=saved.format.runs.flatMap(run=>[...run.text].map(letter=>({letter,color:run.marks.color})));
  assert.ok(letters.slice(start,end).every(row=>row.color===color),'slice colored');
  assert.ok([...letters.slice(0,start),...letters.slice(end)].every(row=>row.color!==color),'outside slice unchanged');
}

async function assertClosedAndEditable(page){
  assert.equal(await page.locator('.color-picker-popup').count(),0,'popup closed');
  const focus=await page.evaluate(()=>{
    const rich=document.querySelector('.text-color-rich');
    const active=document.activeElement;
    return {onRich:!!(rich&&!rich.hidden&&rich.contains(active)),tag:active?.tagName||'',editable:active?.isContentEditable||false};
  });
  assert.equal(focus.onRich,true,'focus returned to rich text');
  assert.equal(focus.editable,true,'focused node is editable');
}

test('spectrum, HEX and swatch close the popup and restore typing focus',async()=>{
  const browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
  try{
    for(const mode of ['plain','formatted','rich-tools']){
      const page=await browser.newPage();
      await boot(page,mode);
      await setOffsets(page,6,10);
      await page.locator('.color-picker-button').click();
      await page.getByLabel('Choose any color and shade').fill('#3aebee');
      await assertColoredSlice(page,'#3aebee',6,10,'alpha beta gamma');
      await assertClosedAndEditable(page);

      await setOffsets(page,6,10);
      await page.locator('.color-picker-button').click();
      await page.getByLabel('Choose any color and shade').fill('#ff2244');
      await assertColoredSlice(page,'#ff2244',6,10,'alpha beta gamma');
      await assertClosedAndEditable(page);

      await setOffsets(page,6,10);
      await page.locator('.color-picker-button').click();
      await page.getByLabel('HEX color').fill('#119955');
      await page.getByLabel('HEX color').press('Enter');
      await assertColoredSlice(page,'#119955',6,10,'alpha beta gamma');
      await assertClosedAndEditable(page);

      await setOffsets(page,6,10);
      await page.locator('.color-picker-button').click();
      await page.getByRole('button',{name:'#2563eb',exact:true}).click();
      await assertColoredSlice(page,'#2563eb',6,10,'alpha beta gamma');
      await assertClosedAndEditable(page);

      await page.evaluate(()=>{const field=document.getElementById('field');TextColors.sync(field,TextColors.format(field));});
      await assertColoredSlice(page,'#2563eb',6,10,'alpha beta gamma');
      await page.close();
    }
  }finally{await browser.close();}
});

test('caret at start, middle and end: color then type continues in the field',async()=>{
  const browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
  try{
    const page=await browser.newPage();
    await boot(page,'formatted','abcd');
    for(const [label,offset,typed,expected] of [
      ['start',0,'Z','Zabcd'],
      ['middle',2,'Y','ZaYbcd'],
      ['end',6,'X','ZaYbcdX'],
    ]){
      await setOffsets(page,offset,offset);
      await page.locator('.color-picker-button').click();
      await page.getByRole('button',{name:'#dc2626',exact:true}).click();
      await assertClosedAndEditable(page);
      await page.keyboard.type(typed);
      const text=await page.evaluate(()=>document.getElementById('field').value);
      assert.equal(text,expected,label+' typing after color');
    }
    await page.close();
  }finally{await browser.close();}
});

test('boundary: full selection, escape, outside click',async()=>{
  const browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
  try{
    const page=await browser.newPage();
    await boot(page,'formatted','alpha');
    await setOffsets(page,0,5);
    await page.locator('.color-picker-button').click();
    await page.getByRole('button',{name:'#16a34a',exact:true}).click();
    const all=await page.evaluate(()=>TextColors.format(document.getElementById('field')).runs.every(run=>run.marks.color==='#16a34a'));
    assert.equal(all,true,'full selection colored');
    await assertClosedAndEditable(page);

    await page.locator('.color-picker-button').click();
    assert.equal(await page.locator('.color-picker-popup').count(),1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.color-picker-popup').count(),0,'escape closes');

    await page.locator('.color-picker-button').click();
    assert.equal(await page.locator('.color-picker-popup').count(),1);
    await page.locator('.text-color-rich').click({position:{x:8,y:8}});
    assert.equal(await page.locator('.color-picker-popup').count(),0,'outside click closes');
    await page.close();
  }finally{await browser.close();}
});

test('chat edit reopen preserves colored runs',async()=>{
  const browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
  try{
    const page=await browser.newPage();
    await page.setContent('<main></main>');
    await page.addScriptTag({content:textColors});
    const actions=readFileSync(new URL('../production/chat/85-message-actions.js',import.meta.url),'utf8');
    const edit=actions.slice(actions.indexOf('  function editMessage('),actions.indexOf('  function deleteMessages('));
    await page.addScriptTag({content:`
      const data={rooms:[]},icon=()=>'';
      let message={id:1,text:'alpha beta gamma',format:{runs:[{text:'alpha ',marks:{}},{text:'beta',marks:{color:'#3aebee'}},{text:' gamma',marks:{color:'#ff2244'}}]}};
      async function request(action,value){message={...message,...value};}
      function dialog(title,html,save){
        const node=document.createElement('div');node.innerHTML='<form>'+html+'</form>';
        document.querySelector('main').replaceChildren(node);window.saveEdit=save;return node;
      }
      ${edit}
      window.openEdit=()=>editMessage(message,'room');
    `});
    for(let attempt=0;attempt<3;attempt++){
      await page.evaluate(()=>openEdit());
      assert.equal(await page.locator('.text-color-rich').isVisible(),true);
      assert.equal(await page.locator('textarea').isVisible(),false);
      const colors=await page.locator('.text-color-rich span').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,color:node.style.color})));
      assert.ok(colors.some(run=>run.text==='beta'&&run.color==='rgb(58, 235, 238)'));
      assert.ok(colors.some(run=>run.text===' gamma'&&run.color==='rgb(255, 34, 68)'));
      await page.evaluate(()=>saveEdit());
    }
    await page.close();
  }finally{await browser.close();}
});
