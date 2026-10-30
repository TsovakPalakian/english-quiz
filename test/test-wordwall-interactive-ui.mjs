import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
import {StudyService} from '../src/learning-study.mjs';
import {createLearningWorkbenchPreview} from '../ops/preview-learning-workbench.mjs';
const url='https://wordwall.net/ru/embed/4a43ff424bd24618b71c8d13ae4f663e?themeId=1001&templateId=2&fontStackId=1';
test('Interactive blocks persist in both lesson tabs and reject unsafe addresses and student writes',async()=>{
  const f=await fixture({d1:true});
  try{
    const service=new StudyService(f.db);
    const request=()=>body({changes:{title:'Interactive lesson',published:true},blocks:['classwork','homework'].map(tab=>({type:'interactive',tab,expectedRevision:0,cardId:null,content:{title:'Practice',url}}))});
    const created=await service.createLesson(actors.teacher,request());
    const saved=await f.db.read('SELECT tab,content_json FROM lesson_blocks WHERE lesson_id=? ORDER BY position',[created.id]);
    assert.deepEqual(saved.map(row=>row.tab),['classwork','homework']);
    for(const row of saved)assert.equal(JSON.parse(row.content_json).url,url);
    for(const bad of ['javascript:alert(1)',url.replace('wordwall.net','evil.test')]){
      const value=request();value.blocks[0].content.url=bad;
      await assert.rejects(service.createLesson(actors.teacher,value),error=>error.status===400);
    }
    const value=request();value.blocks[0].tab='overview';
    await assert.rejects(service.createLesson(actors.teacher,value),error=>error.status===400);
    await assert.rejects(service.createLesson(actors.student,request()),error=>error.status===403);
  }finally{f.close();}
});
test('Interactive editor extracts only iframe src and renders responsive safe frames',async()=>{
  const preview=await createLearningWorkbenchPreview();let browser;
  try{
    const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
    browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
    const page=await browser.newPage();page.setDefaultTimeout(10000);
    await page.route('https://wordwall.net/**',route=>route.fulfill({contentType:'text/html',body:'<p>Local Wordwall fixture</p>'}));
    await page.goto(preview.url);await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady);
    await page.locator('[data-group-level="A1"]').click();await page.locator('[data-group-open="1"]').click();
    await page.locator('[data-detail-lessons]').click();await page.locator('[data-lm-open="1"]').click();
    await page.evaluate(()=>{lmState.mode='edit';lmShow('edit');});
    for(const tab of ['classwork','homework']){
      await page.evaluate(tab=>lmSelectTab(tab),tab);await page.locator('#lmAdd').click();
      await page.locator('[data-add-block="interactive"]').click();
      const field=page.locator('[data-interactive-source]').last();
      await field.fill('<iframe src="'+url.replaceAll('&','&amp;')+'" onload="window.injected=true" style="position:fixed" width="500" height="380"></iframe>');
      const frame=page.locator('[data-interactive-preview] iframe').last();
      assert.equal(await frame.getAttribute('src'),url);assert.equal(await frame.getAttribute('onload'),null);
      assert.equal(await page.evaluate(()=>window.injected),undefined);
      assert.equal(await page.evaluate(()=>lmState.blocks.filter(row=>row.type==='interactive').at(-1).url),url);
      await field.fill('https://evil.test/embed/anything');assert.equal(await field.evaluate(node=>node.checkValidity()),false);
      await field.fill(url);
    }
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.locator('[data-interactive-preview] iframe').last().evaluate(node=>node.getBoundingClientRect().width<=node.parentElement.clientWidth+1));
    await page.evaluate(()=>lmShow('preview'));
    assert.equal(await page.locator('#lmPreview .lm-frame-interactive iframe').count(),1);
  }finally{if(browser)await browser.close();await preview.close();}
});
