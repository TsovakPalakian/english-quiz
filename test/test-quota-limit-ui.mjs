import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
test('developer changes quota without resetting usage; conflicts, audit, lost responses and mobile layout stay safe',async()=>{
  const {server,url}=await createQuizReviewPreview({requestLimit:3,generationEnabled:true});let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
    const page=await browser.newPage({viewport:{width:1280,height:1050}}),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    const read=async path=>(await fetch(url+path,{headers:{Cookie:'qr-preview=dev'}})).json();
    await page.goto(url);await page.locator('#account:not([disabled])').waitFor();
    assert.equal(await page.locator('#quota-limit-form').count(),0);
    await page.selectOption('#account','dev');await page.locator('#account:not([disabled])').waitFor();
    await page.locator('[data-view="quota"]').click();await page.locator('#quota-limit-form').waitFor();
    assert.equal(await page.locator('#quota-limit-form button').isDisabled(),true);
    assert.equal(requests.some(r=>r.includes('/local/quota/changes')),false);
    const save=async(limit,reason)=>{
      await page.locator('[name="requestLimit"]').fill(String(limit));await page.locator('[name="reason"]').fill(reason);
      await page.locator('#quota-limit-form button').click();
    };
    await save(5,'Increase for the local test.');await page.waitForFunction(()=>document.querySelectorAll('.quota-counts dd')[2]?.textContent==='5');
    assert.deepEqual(await page.locator('.quota-counts dd').allTextContents(),['5','0','5']);
    await page.locator('#quota-changes > summary').click();await page.locator('#quota-changes .attempt-entry').waitFor();
    assert.match(await page.locator('#quota-changes').innerText(),/3 → 5/);
    const {contexts}=await read('/local/boot'),c=contexts[0];
    const queued=await fetch(url+'/local/generation',{method:'POST',headers:{Origin:url,'Content-Type':'application/json',Cookie:'qr-preview=teacher'},body:JSON.stringify({mutationId:crypto.randomUUID(),groupId:c.groupId,lessonId:c.lessonId,cardId:c.cardId,senseId:c.senseId,types:['Type','Reverse']})});assert.equal(queued.status,202);
    for(let i=0;i<100;i++){const jobs=await read('/local/generation');if(jobs.jobs.length===2&&jobs.jobs.every(j=>j.state==='submitted'))break;await new Promise(resolve=>setTimeout(resolve,50));}
    const reservations=await read('/local/quota/history');assert.equal(reservations.reservations.length,2);
    await save(1,'Lower the quota without removing prior usage.');await page.getByText('Quota exhausted',{exact:true}).waitFor();
    assert.deepEqual(await page.locator('.quota-counts dd').allTextContents(),['0','2','1']);
    assert.deepEqual(await read('/local/quota/history'),reservations);
    const external=await fetch(url+'/local/quota',{method:'POST',headers:{Origin:url,'Content-Type':'application/json',Cookie:'qr-preview=dev'},body:JSON.stringify({mutationId:crypto.randomUUID(),expectedRevision:3,requestLimit:4,reason:'Changed in another tab.'})});assert.equal(external.status,200);
    await save(2,'This tab has stale settings.');await page.locator('#quota-save-error:not([hidden])').waitFor();
    assert.match(await page.locator('#quota-save-error').innerText(),/changed/);assert.equal((await read('/local/quota')).requestLimit,4);
    await page.locator('[data-action="quota-refresh"]').click();await page.waitForFunction(()=>document.querySelectorAll('.quota-counts dd')[2]?.textContent==='4');
    let lose=true;const mutationIds=[];
    await page.route('**/local/quota',async route=>{
      if(route.request().method()!=='POST'){await route.continue();return;}
      mutationIds.push(route.request().postDataJSON().mutationId);const response=await route.fetch();
      if(lose){lose=false;await route.abort('failed');return;}await route.fulfill({response});
    });
    await save(6,'Retry after a lost response.');await page.locator('#quota-save-error:not([hidden])').waitFor();
    assert.equal((await read('/local/quota')).requestLimit,6);
    await page.locator('#quota-limit-form button').click();await page.waitForFunction(()=>document.querySelectorAll('.quota-counts dd')[2]?.textContent==='6');
    assert.equal(mutationIds.length,2);assert.equal(mutationIds[0],mutationIds[1]);
    const changes=await read('/local/quota/changes');assert.equal(changes.changes.length,4);assert.equal(changes.changes[0].newLimit,6);
    await page.locator('#quota-changes .attempt-entry').first().waitFor();
    await page.locator('#quota-limit-form').scrollIntoViewIfNeeded();await Promise.resolve();
    await page.setViewportSize({width:390,height:844});await page.selectOption('#theme','ocean');await page.locator('#quota-limit-form').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await Promise.resolve();
    await page.selectOption('#account','teacher');await page.locator('#account:not([disabled])').waitFor();assert.equal(await page.locator('#quota-limit-form').count(),0);assert.equal(await page.locator('#quota-changes-body').count(),0);
    assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.startsWith(url+'/')));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
