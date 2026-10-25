import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
import {QUIZ_TYPES} from '../src/learning-study.mjs';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";
const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));

test('attempt history is lazy, collapsible, refreshed by revision, escaped and account-scoped on desktop/mobile',async()=>scenarioSubtests("attempt history is lazy, collapsible, refreshed by revision, escaped and account-scoped on desktop/mobile phases",async function*(){
yield "00. Fixture and browser setup";

  const {server,url}=await createQuizReviewPreview({generationEnabled:true});let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
    const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    await page.goto(url);await page.locator('#context').waitFor();
    // Include failed/context-only types so history covers outcomes excluded by kit selection.
    yield "01. evaluate";
    await page.evaluate(async types=>{
      const {contexts}=await(await fetch('/local/boot')).json(),c=contexts[0];
      const response=await fetch('/local/generation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),groupId:c.groupId,lessonId:c.lessonId,cardId:c.cardId,senseId:c.senseId,types})});
      if(!response.ok)throw new Error(await response.text());
    },QUIZ_TYPES);
    await page.locator('[data-view="word"]').click();
    await page.waitForFunction(async()=>{const {jobs}=await(await fetch('/local/generation')).json();return jobs.length===16&&jobs.every(j=>!['queued','running','retry'].includes(j.state));},{},{timeout:20000});
    await page.waitForFunction(()=>document.querySelectorAll('[data-job]').length===16&&![...document.querySelectorAll('[data-job]')].some(node=>['queued','running','retry'].includes(node.dataset.jobState)));
    assert.equal(requests.filter(request=>request.endsWith('/attempts')).length,0,'Closed histories do not fetch');
    yield "02. evaluate";
    const {jobs}=await page.evaluate(async()=>await(await fetch('/local/generation')).json()),choice=jobs.find(job=>job.type==='Choice'),match=jobs.find(job=>job.type==='Match');
    const selector='[data-attempt-history="'+choice.id+'"]',path='/local/generation/'+choice.id+'/attempts';
    await page.locator('[data-job="'+choice.id+'"] > summary').click();
    await page.locator(selector+' > summary').click();await page.locator(selector+' .attempt-entry').nth(2).waitFor();
    yield "03. locator";
    assert.equal(await page.locator(selector+' .attempt-entry').count(),3);assert.match(await page.locator(selector).innerText(),/Cycle 1 · Attempt 3/);
    assert.equal(await page.locator(selector+' .attempt-heading .status').first().innerText(),'Rejected');
    assert.ok((await page.locator(selector+' .attempt-entry').first().innerText()).includes('Not reported'));
    yield "04. locator";
    assert.equal(await page.locator(selector+' .attempt-tokens dd').first().innerText(),'Not reported');
    const fetched=requests.filter(request=>request.endsWith(path)).length;
    await page.locator(selector+' > summary').press('Enter');assert.equal(await page.locator(selector).evaluate(node=>node.open),false);
    await page.locator(selector+' > summary').press('Enter');
    yield "05. locator";
    assert.equal(await page.locator(selector).evaluate(node=>node.open),true);
    assert.equal(requests.filter(request=>request.endsWith(path)).length,fetched,'Reopen uses current revision cache');
    await page.locator('[data-view="queue"]').click();await page.locator(selector+' .attempt-entry').nth(2).waitFor({state:'visible'});
    assert.equal(requests.filter(request=>request.endsWith(path)).length,fetched,'Rendering a different view preserves expansion and cache');
    await page.locator('[data-job="'+choice.id+'"] [data-action="retry-job"]').click();
    yield "06. waitForFunction";
    await page.waitForFunction(async id=>{const {jobs}=await(await fetch('/local/generation')).json(),job=jobs.find(j=>j.id===id);return job.cycle===1&&job.state==='review';},choice.id);
    await page.locator(selector+' .attempt-entry').nth(5).waitFor({state:'visible'});assert.match(await page.locator(selector).innerText(),/Cycle 2 · Attempt 3/);
    assert.ok(requests.filter(request=>request.endsWith(path)).length>fetched,'A new revision refreshes the history');
    await Promise.resolve();

    yield "07. evaluate";
    const recorded=await page.evaluate(async path=>(await(await fetch(path)).json()).attempts,path);
    const reported=structuredClone(recorded[0]);reported.state='accepted';reported.issue='';reported.usage={prompt_tokens:0};
    reported.source={provider:'fixture',model:'<img src=x onerror=alert(1)>/'+'long-model-name-'.repeat(10),version:'test-version',configurationRevision:7};
    let mode='error',release;
    await page.route('**'+path,async route=>{
      if(mode==='late')await new Promise(resolve=>release=resolve);
      if(mode==='error'){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'History unavailable <script>alert(1)</script>'})});return;}
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({attempts:[reported,{...recorded[0],state:'running',finishedAt:null,issue:''},{...recorded[0],state:'interrupted',issue:'worker_interrupted'}]})});
    });
    await page.locator('#account').selectOption('second');await page.locator(selector+' [role="alert"]').waitFor();
    yield "08. locator";
    assert.equal(await page.locator(selector+' script').count(),0);mode='ready';
    await page.locator(selector+' [data-action="reload-attempts"]').click();await page.locator(selector+' .attempt-entry').nth(2).waitFor();
    assert.equal(await page.locator(selector+' .attempt-entry').count(),3);
    yield "09. locator";
    assert.match(await page.locator(selector).innerText(),/Candidate prepared/);assert.match(await page.locator(selector).innerText(),/In progress/);assert.match(await page.locator(selector).innerText(),/Interrupted/);
    assert.equal(await page.locator(selector+' .attempt-tokens dd').first().innerText(),'0');
    yield "10. locator";
    assert.equal(await page.locator(selector+' .attempt-tokens dd').nth(1).innerText(),'Not reported');
    assert.equal(await page.locator(selector+' img').count(),0);assert.match(await page.locator(selector).innerText(),/<img src=x/);
    await page.setViewportSize({width:390,height:844});
    yield "11. #theme / checks";
    await page.locator('#theme').selectOption('ocean');
    await page.locator(selector+' .attempt-entry').first().scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const geometry=await page.locator(selector+' .attempt-meta dd').evaluateAll(nodes=>nodes.map(node=>({width:node.clientWidth,scroll:node.scrollWidth})));
    assert.ok(geometry.every(item=>item.scroll<=item.width+1));
    yield "12. checks";
    await Promise.resolve();

    await page.locator('[data-view="word"]').click();await page.locator('[data-job="'+match.id+'"] > summary').click();
    await page.locator('[data-attempt-history="'+match.id+'"] > summary').click();
    yield "13. getByText";
    await page.getByText('No attempts recorded.',{exact:true}).waitFor();

    mode='late';await page.locator('#account').selectOption('teacher');await page.locator(selector+' [role="status"]').waitFor();
    await page.waitForFunction(()=>!document.querySelector('#account').disabled);
    yield "14. #account / checks";
    await page.locator('#account').selectOption('student');await page.waitForFunction(()=>document.querySelector('#account').value==='student'&&!document.querySelector('#account').disabled);
    assert.ok(release,'A history request is pending before the role changes');release();
    await page.waitForResponse(response=>response.url().endsWith(path));
    assert.equal(await page.locator('[data-attempt-history]').count(),0,'Late teacher data is not rendered for a student');
    yield "15. checks";
    assert.equal((await fetch(url+path,{headers:{Cookie:'qr-preview=student'}})).status,403);
    assert.equal((await fetch(url+path,{headers:{Cookie:'qr-preview=outsider'}})).status,200);
    assert.deepEqual(errors,[]);assert.ok(requests.every(request=>request.startsWith(url+'/')));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

}));
