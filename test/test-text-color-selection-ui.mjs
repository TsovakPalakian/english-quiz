import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  for(const mode of ['plain','formatted','rich-tools']){
    const page=await browser.newPage();
    await page.setContent('<textarea id="field">alpha beta gamma</textarea><div id="toolbar"></div>');
    await page.addScriptTag({content:readFileSync('rollback/production-assets/text-colors.js','utf8')});
    await page.evaluate(mode=>{
      const field=document.getElementById('field');
      TextColors.mount(field,mode==='plain'?{}:{format:{runs:[{text:field.value,marks:{color:'#173832'}}]},richTools:mode==='rich-tools'});
      document.getElementById('toolbar').append(document.querySelector('.text-color-tools'));
    },mode);
    await page.addScriptTag({content:readFileSync('rollback/production-assets/color-picker.js','utf8')});
    const select=async()=>page.evaluate(()=>{
      const field=document.getElementById('field'),rich=document.querySelector('.text-color-rich');
      if(rich.hidden){field.focus();field.setSelectionRange(6,10);return;}
      rich.focus();const range=document.createRange(),walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);let offset=0,node;
      while((node=walker.nextNode())){if(6>=offset&&6<offset+node.length)range.setStart(node,6-offset);if(10>offset&&10<=offset+node.length){range.setEnd(node,10-offset);break;}offset+=node.length;}
      getSelection().removeAllRanges();getSelection().addRange(range);
    });
    const check=async color=>{
      const saved=await page.evaluate(()=>({text:document.getElementById('field').value,format:TextColors.format(document.getElementById('field'))}));
      assert.equal(saved.text,'alpha beta gamma',mode+' retains text');
      const letters=saved.format.runs.flatMap(run=>[...run.text].map(letter=>({letter,color:run.marks.color})));
      assert.ok(letters.slice(6,10).every(row=>row.color===color),mode+' colors the full original selection');
      assert.ok([...letters.slice(0,6),...letters.slice(10)].every(row=>row.color!==color),mode+' leaves other text unchanged');
    };
    await select();await page.locator('.color-picker-button').click();
    await page.getByLabel('Choose any color and shade').fill('#3aebee');await check('#3aebee');
    await page.getByLabel('Choose any color and shade').fill('#ff2244');await check('#ff2244');
    await page.getByLabel('HEX color').fill('#119955');await page.getByLabel('HEX color').press('Enter');await check('#119955');
    await select();await page.locator('.color-picker-button').click();
    await page.getByRole('button',{name:'#2563eb',exact:true}).click();await check('#2563eb');
    await page.evaluate(()=>{const field=document.getElementById('field'),format=TextColors.format(field);TextColors.sync(field,format);});
    await check('#2563eb');await page.close();
  }
  console.log('Color selection: native repeated shades, HEX, swatches, reparented toolbar and formatting persistence passed');
}finally{await browser.close();}
