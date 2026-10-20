import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
import {reviewSamples} from './quiz-review-samples.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
test('all 17 quiz types save and reopen in the local browser editor, retaining every item',async()=>{
  const {server,url}=await createQuizReviewPreview();let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    await page.goto(url);await page.locator('#context').waitFor();
    await page.locator('#account').selectOption('student');await page.waitForFunction(()=>document.querySelector('#account').value==='student'&&!document.querySelector('#account').disabled);
    const created=[];
    for(const [type,items] of Object.entries(reviewSamples)){
      await page.locator('[data-view="word"]').click();await page.locator('[data-action="create"]').waitFor();await page.locator('[data-action="create"]').click();
      await page.locator('#edit-type').selectOption(type);
      while(await page.locator('[data-editor-item]').count()<items.length)await page.locator('#add-quiz-item').click();
      for(const [index,item] of items.entries()){
        const row=page.locator('[data-editor-item="'+index+'"]');
        for(const input of await row.locator('[data-field]').all()){
          const key=await input.getAttribute('data-field'),value=item[key]??'';
          if(await input.evaluate(n=>n.tagName==='SELECT'))await input.selectOption(value);else await input.fill(value);
        }
        if(item.options){
          while(await row.locator('[data-option]').count()<item.options.length)await row.locator('[data-add-option]').click();
          for(const [i,option] of item.options.entries())await row.locator('[data-option="'+i+'"]').fill(option);
          if(type==='Select all'){
            for(const input of await row.locator('[data-correct]').all())await input.uncheck();
            for(const i of item.answers)await row.locator('[data-correct="'+i+'"]').check();
          }else await row.locator('[data-correct="'+item.answer+'"]').check();
        }
      }
      await page.locator('#edit-explanation').fill('Editor round trip: '+type);
      if(type==='Select all'){
        await page.setViewportSize({width:390,height:844});
        assert.ok(await page.locator('#editor').evaluate(n=>n.scrollWidth<=n.clientWidth),'Mobile editor overflow');
        await page.screenshot({path:'/private/tmp/lumiscia-quiz-editor-mobile.png',fullPage:false});await page.setViewportSize({width:1280,height:960});
      }
      await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.locator('#editor').waitFor({state:'hidden'});
      const data=await page.evaluate(async()=>await(await fetch('/local/mine')).json());
      const q=data.quizzes.find(q=>q.content.explanation==='Editor round trip: '+type);assert.ok(q,type);assert.deepEqual(q.content.items,items,type);created.push(q);
      await page.locator('[data-item="'+q.id+'"]').evaluate(node=>{for(let n=node;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;});
      assert.ok(!(await page.locator('[data-item="'+q.id+'"]').innerText()).includes('undefined'),type);
      await page.locator('[data-item="'+q.id+'"] [data-action="edit"]').click();
      assert.equal(await page.locator('[data-editor-item]').count(),items.length,type);
      assert.equal(await page.locator('#edit-type').isDisabled(),true);
      await page.locator('#edit-explanation').fill('Reopened: '+type);
      if(type==='Match')await page.screenshot({path:'/private/tmp/lumiscia-quiz-editor-pairs.png',fullPage:false});
      await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.locator('#editor').waitFor({state:'hidden'});
      const saved=await page.evaluate(async id=>(await(await fetch('/local/quizzes/'+id)).json()).quiz,q.id);
      assert.deepEqual(saved.content.items,items,'Reopen '+type);assert.equal(saved.revision,2);
    }
    assert.equal(created.length,17);
    await page.locator('[data-view="word"]').click();await page.locator('[data-action="create"]').click();
    await page.locator('#edit-prompt').fill('An invalid sentence without a blank.');
    await page.locator('#edit-type').selectOption('Choice');await page.locator('#edit-type').selectOption('Gap');
    assert.equal(await page.locator('#edit-prompt').inputValue(),'An invalid sentence without a blank.','Switching type preserves the unsaved draft');
    await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.locator('#edit-error').waitFor();
    assert.match(await page.locator('#edit-error').innerText(),/Invalid quiz content/);
    assert.equal(await page.locator('#editor').isVisible(),true,'Invalid content stays editable');
    await page.locator('#edit-prompt').fill('A fine ____ started falling.');
    await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.locator('#editor').waitFor({state:'hidden'});
    await page.locator('#theme').selectOption('ocean');await page.locator('[data-view="word"]').click();await page.locator('[data-action="create"]').click();
    await page.locator('#edit-type').selectOption('Memory');await page.setViewportSize({width:390,height:844});
    assert.ok(await page.locator('#editor').evaluate(n=>n.scrollWidth<=n.clientWidth));
    await page.screenshot({path:'/private/tmp/lumiscia-quiz-editor-ocean.png',fullPage:false});
    assert.deepEqual(errors,[]);assert.ok(requests.every(u=>u.startsWith(url)));
    console.log('Saved and reopened all 17 types, including multiple items, pairs and multiple correct answers.');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
