import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';
const {chromium}=createRequire(import.meta.url)('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const preview=await previewAuthStudio();let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(preview.url);await page.waitForSelector('body.guest-home');
  assert.equal(await page.locator('#studyExam,#dayExam,[data-exam-pass]').count(),0);
  for(const [section,start,mistakes] of [['setup','studyStart','studyMistakes'],['daysetup','dayStart','dayMistakes']]){
    const labels=await page.locator('#'+section+' button').allTextContents();
    assert.equal(labels.some(label=>/^Exam\b/.test(label.trim())),false);
    for(const id of [start,mistakes]){
      assert.equal(await page.locator('#'+id).count(),1);
      assert.equal(await page.locator('#'+id).evaluate(button=>typeof button.onclick),'function');
    }
  }
  assert.ok(await page.locator('[data-jump="exams"]').count()>0,'Separate Exams navigation remains');
  assert.equal(await page.locator('#exams').count(),1);
  assert.deepEqual(errors,[]);
  console.log('Study UI: Exam buttons/pass marks absent, Study/Mistakes handlers and separate Exams preserved; boot passed without screenshots.');
}finally{await browser?.close();await preview.close();}
