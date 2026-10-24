import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
test('developer quota UI is read-only, lazy, paginated, responsive and isolated across role changes',async()=>{
  const {server,url}=await createQuizReviewPreview({requestLimit:1,generationEnabled:true});let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
    const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    await page.goto(url);await page.locator('#account:not([disabled])').waitFor();
    assert.equal(await page.locator('[data-view="quota"]').isVisible(),false);assert.equal(requests.some(r=>r.includes('/local/quota')),false);
    await page.selectOption('#account','dev');await page.locator('#account:not([disabled])').waitFor();
    await page.locator('[data-view="quota"]').click();await page.locator('.quota-counts').waitFor();
    assert.deepEqual(await page.locator('.quota-counts dd').allTextContents(),['1','0','1']);
    assert.equal(requests.some(r=>r.includes('/local/quota/history')),false);
    await page.locator('#quota-history > summary').click();await page.getByText('No reservations.',{exact:true}).waitFor();
    const count=requests.filter(r=>r.includes('/local/quota/history')).length;
    await page.locator('#quota-history > summary').press('Enter');await page.locator('#quota-history > summary').press('Enter');
    assert.equal(requests.filter(r=>r.includes('/local/quota/history')).length,count);
    const boot=await (await fetch(url+'/local/boot')).json(),c=boot.contexts[0];
    const enqueue=await fetch(url+'/local/generation',{method:'POST',headers:{Origin:url,'Content-Type':'application/json',Cookie:'qr-preview=teacher'},body:JSON.stringify({mutationId:crypto.randomUUID(),groupId:c.groupId,lessonId:c.lessonId,cardId:c.cardId,senseId:c.senseId,types:['Type']})});assert.equal(enqueue.status,202);
    for(let i=0;i<50;i++){const jobs=(await (await fetch(url+'/local/generation')).json()).jobs;if(jobs.some(j=>j.state==='submitted'))break;await new Promise(resolve=>setTimeout(resolve,50));}
    await page.locator('[data-action="quota-refresh"]').click();await page.getByText('Quota exhausted',{exact:true}).waitFor();
    await page.locator('#quota-history .attempt-entry').waitFor();assert.deepEqual(await page.locator('.quota-counts dd').allTextContents(),['0','1','1']);
    assert.match(await page.locator('#quota-history').innerText(),/Started/);
    await Promise.resolve();
    let mode='error',release,historyCalls=0;
    const rows=['reserved','started','released'].map((state,i)=>({id:crypto.randomUUID(),state,windowStart:0,createdAt:10000+i,changedAt:20000+i,source:{model:'<img src=x onerror=alert(1)>/'+('long-model-'.repeat(12)),provider:'fixture',version:'v1',configurationRevision:2}}));
    await page.route('**/local/quota/history**',async route=>{
      historyCalls++;
      if(mode==='late')await new Promise(resolve=>release=resolve);
      if(mode==='error'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'History temporarily unavailable.'})});return;}
      const more=new URL(route.request().url()).searchParams.has('cursor');
      await route.fulfill({contentType:'application/json',body:JSON.stringify({reservations:more?[{...rows[0],id:crypto.randomUUID()}]:rows,next:more?null:'10000:'+crypto.randomUUID()})});
    });
    await page.locator('[data-action="quota-refresh"]').click();await page.locator('[data-action="quota-history-retry"]').waitFor();
    mode='ready';await page.locator('[data-action="quota-history-retry"]').click();await page.waitForFunction(()=>document.querySelectorAll('#quota-history .attempt-entry').length===3);
    assert.equal(await page.locator('#quota-history img').count(),0);assert.match(await page.locator('#quota-history').innerText(),/Released/);
    await page.locator('[data-action="quota-history-more"]').click();await page.waitForFunction(()=>document.querySelectorAll('#quota-history .attempt-entry').length===4);
    assert.equal(await page.locator('[data-action="quota-history-more"]').count(),0);assert.ok(historyCalls>=3);
    await page.setViewportSize({width:390,height:844});await page.selectOption('#theme','ocean');await page.locator('#quota-history .attempt-entry').first().scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await Promise.resolve();
    let summaryError=true;
    await page.route('**/local/quota',route=>route.fulfill({status:summaryError?503:200,contentType:'application/json',body:JSON.stringify(summaryError?{error:'Quota temporarily unavailable.'}:{provider:'fixture',remaining:0,used:1,requestLimit:1,windowStart:0,windowEnd:86400000})}));
    await page.locator('[data-action="quota-refresh"]').click();await page.getByText('Quota temporarily unavailable.',{exact:true}).waitFor();
    summaryError=false;await page.locator('[data-action="quota-refresh"]').click();await page.locator('.quota-counts').waitFor();
    mode='late';await page.locator('[data-action="quota-refresh"]').click();await page.waitForFunction(()=>document.querySelector('#quota-history-body')?.textContent.includes('Loading reservations'));
    for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(typeof release,'function');
    await page.selectOption('#account','teacher');await page.locator('#account:not([disabled])').waitFor();
    release();await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-view="quota"]').isVisible(),false);assert.equal(await page.locator('.quota-panel').count(),0);assert.equal(await page.locator('#quota-history-body').count(),0);
    await page.selectOption('#account','student');await page.locator('#account:not([disabled])').waitFor();assert.equal(await page.locator('[data-view="quota"]').isVisible(),false);
    assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.startsWith(url+'/')));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
