import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
import {LANGUAGE_TASKS} from '../src/language-providers.mjs';
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
async function preview(work){
  const {server,url}=await createQuizReviewPreview();let browser;
  try{browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});const page=await browser.newPage({viewport:{width:1280,height:1050}});await work(page,url);}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
test('provider settings UI persists selections, disables tasks, preserves audit and handles conflicts and lost responses',async()=>preview(async(page,url)=>{
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  const read=async path=>(await fetch(url+path,{headers:{Cookie:'qr-preview=dev'}})).json();
  await page.goto(url);await page.locator('#account:not([disabled])').waitFor();assert.equal(await page.locator('[data-view="providers"]').isVisible(),false);assert.equal(requests.some(r=>r.includes('/local/providers')),false);
  await page.selectOption('#account','dev');await page.locator('#account:not([disabled])').waitFor();await page.locator('[data-view="providers"]').click();await page.locator('#provider-settings-form').waitFor();
  assert.equal(await page.locator('[data-provider-task]').count(),LANGUAGE_TASKS.length);assert.equal(await page.locator('#provider-dictionary').inputValue(),'off');assert.equal(await page.locator('#provider-tts').inputValue(),'off');assert.equal(await page.locator('#provider-review').isDisabled(),false);assert.equal(await page.locator('#provider-review').inputValue(),'off');assert.equal(await page.locator('#provider-settings-form [type="submit"]').isDisabled(),true);
  assert.equal(requests.some(r=>r.includes('/local/providers/history')),false);
  const save=async(value,reason)=>{await page.selectOption('#provider-generation',value);await page.locator('#provider-reason').fill(reason);await page.locator('#provider-settings-form [type="submit"]').click();};
  const saved=async value=>page.waitForFunction(expected=>document.querySelector('#provider-generation')?.value===expected&&document.querySelector('#provider-reason')?.value==='',value);
  await save('0','Choose the first fixture model.');await saved('0');
  assert.equal((await read('/local/providers')).revision,2);assert.equal(requests.some(r=>r.includes('/local/providers/history')),false);
  await page.locator('#provider-history > summary').click();await page.locator('#provider-history .attempt-entry').waitFor();assert.match(await page.locator('#provider-history').innerText(),/local-fixture-a/);
  await save('1','Choose the second fixture model.');await saved('1');assert.equal((await read('/local/providers')).revision,3);
  await page.reload();await page.locator('#account:not([disabled])').waitFor();await page.locator('[data-view="providers"]').click();await page.locator('#provider-settings-form').waitFor();assert.equal(await page.locator('#provider-generation').inputValue(),'1');
  const external=await fetch(url+'/local/providers',{method:'POST',headers:{Cookie:'qr-preview=dev',Origin:url,'Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),expectedRevision:3,selections:{generation:null},reason:'Disable from another tab.'})});assert.equal(external.status,200);
  await save('0','Stale changes must not overwrite another tab.');await page.locator('#provider-save-error:not([hidden])').waitFor();assert.match(await page.locator('#provider-save-error').innerText(),/changed/);assert.equal((await read('/local/providers')).selections.generation,null);
  await page.locator('[data-provider-action="refresh"]').click();await saved('off');await save('1','Re-enable the chosen fixture.');await saved('1');
  let lose=true;const ids=[];
  await page.route('**/local/providers',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}ids.push(route.request().postDataJSON().mutationId);const response=await route.fetch();if(lose){lose=false;await route.abort('failed');return;}await route.fulfill({response});});
  await save('0','Retry a committed save after its response is lost.');await page.locator('#provider-save-error:not([hidden])').waitFor();assert.equal((await read('/local/providers')).revision,6);
  await page.locator('#provider-settings-form [type="submit"]').click();await saved('0');assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.equal((await read('/local/providers/history')).changes.length,5);
  await save('off','Disable generation.');await saved('off');assert.equal((await read('/local/providers')).selections.generation,null);
  await page.locator('#provider-history > summary').click();await page.locator('#provider-history .attempt-entry').first().waitFor();
  await Promise.resolve();
  await page.setViewportSize({width:390,height:844});await page.selectOption('#theme','ocean');await page.locator('#provider-generation').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await Promise.resolve();
  assert.equal((await read('/local/quota')).used,0);assert.equal((await read('/local/generation')).jobs.length,0);
  await page.selectOption('#account','teacher');await page.locator('#account:not([disabled])').waitFor();assert.equal(await page.locator('#provider-settings-form').count(),0);assert.equal(await page.locator('[data-view="providers"]').isVisible(),false);
  assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.startsWith(url+'/')));
}));
test('provider UI retries loading, confirms changed models explicitly, paginates escaped history and drops late private responses',async()=>preview(async(page,url)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const baseline=await (await fetch(url+'/local/providers',{headers:{Cookie:'qr-preview=dev'}})).json();let summaryError=true,phase='error',release;
  const data={...baseline,selections:{...baseline.selections,generation:{adapterId:'local-fixture-a',locale:'en-US',mode:'text'}},unavailable:[{task:'generation',code:'provider_configuration_changed'}]};
  await page.route('**/local/providers',route=>route.fulfill({status:summaryError?503:200,contentType:'application/json',body:JSON.stringify(summaryError?{error:'Settings temporarily unavailable.'}:data)}));
  await page.goto(url);await page.locator('#account:not([disabled])').waitFor();await page.selectOption('#account','dev');await page.locator('#account:not([disabled])').waitFor();await page.locator('[data-view="providers"]').click();await page.getByText('Settings temporarily unavailable.',{exact:true}).waitFor();
  summaryError=false;await page.locator('[data-provider-action="refresh"]').click();await page.locator('#provider-settings-form').waitFor();assert.equal(await page.locator('#provider-generation').inputValue(),'saved');
  await page.locator('#provider-reason').fill('Confirm the changed model.');assert.equal(await page.locator('#provider-settings-form [type="submit"]').isDisabled(),true);await page.selectOption('#provider-generation','0');assert.equal(await page.locator('#provider-settings-form [type="submit"]').isDisabled(),false);
  await page.route('**/local/providers/history**',async route=>{
    if(phase==='late')await new Promise(resolve=>release=resolve);
    if(phase==='error'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'History temporarily unavailable.'})});return;}
    const more=new URL(route.request().url()).searchParams.has('before');
    await route.fulfill({contentType:'application/json',body:JSON.stringify({changes:[{revision:more?2:3,actorId:'dev',changedAt:0,reason:'<img src=x onerror=alert(1)>',selections:baseline.selections,adapters:{}}],next:more?null:3})});
  });
  await page.locator('#provider-history > summary').click();await page.locator('[data-provider-action="history-retry"]').waitFor();phase='ready';await page.locator('[data-provider-action="history-retry"]').click();await page.locator('#provider-history .attempt-entry').waitFor();assert.equal(await page.locator('#provider-history img').count(),0);
  await page.locator('[data-provider-action="history-more"]').click();await page.waitForFunction(()=>document.querySelectorAll('#provider-history .attempt-entry').length===2);assert.equal(await page.locator('[data-provider-action="history-more"]').count(),0);
  phase='late';await page.locator('[data-provider-action="refresh"]').click();await page.waitForFunction(()=>document.querySelector('#provider-history-body')?.textContent.includes('Loading provider history'));
  for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(typeof release,'function');
  await page.selectOption('#account','student');await page.locator('#account:not([disabled])').waitFor();release();await page.waitForTimeout(100);assert.equal(await page.locator('#provider-history-body').count(),0);assert.equal(await page.locator('[data-view="providers"]').isVisible(),false);assert.deepEqual(errors,[]);
}));
