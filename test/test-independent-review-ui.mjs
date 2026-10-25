import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
async function preview(work,options={}){
  const {server,url}=await createQuizReviewPreview(options);let browser;
  try{browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});const page=await browser.newPage({viewport:{width:1280,height:960}});await work(page,url);}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
const expand=async node=>node.evaluate(element=>{for(let n=element;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;});
test('queue UI runs configured synthetic reviews, preserves collapsed history and hides teacher tools from students',async()=>preview(async(page,url)=>scenarioSubtests("queue UI runs configured synthetic reviews, preserves collapsed history and hides teacher tools from students phases",async function*(){
yield "00. Fixture and browser setup";

  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(url);await page.locator('#account:not([disabled])').waitFor();
  assert.equal(requests.some(path=>path.includes('/independent?')),false);
  await page.selectOption('#account','dev');await page.locator('#account:not([disabled])').waitFor();
  yield "01. [data-view=\"providers\"] / click";
  await page.locator('[data-view="providers"]').click();await page.locator('#provider-review').waitFor();
  assert.equal(await page.locator('#provider-review').inputValue(),'off');
  await page.selectOption('#provider-review','0');
    yield "02. #provider-reason / fill";
    await page.locator('#provider-reason').fill('Enable the local synthetic checker.');
  await page.locator('#provider-settings-form [type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#provider-reason')?.value==='');
  await page.locator('[data-view="queue"]').click();
  yield "03. checks";
  const {quizzes}=await(await fetch(url+'/local/queue')).json(),q=quizzes.find(quiz=>quiz.type==='Choice');
  const panel=page.locator('[data-independent="'+q.id+'"]');await expand(panel);
  await panel.getByText('No independent checks.',{exact:true}).waitFor();
  yield "04. [data-independent-level] / checks";
  await panel.locator('[data-independent-level]').selectOption('A1');
  await panel.getByText('No independent checks.',{exact:true}).waitFor();
  await panel.locator('[data-independent-action="run"]').click();
  await panel.locator('[data-independent-latest]').getByText('Not fully assessed',{exact:true}).waitFor();
  yield "05. [data-independent-latest] / checks";
  assert.match(await panel.locator('[data-independent-latest]').innerText(),/local-checker-a/);
  assert.match(await panel.locator('[data-independent-latest]').innerText(),/Synthetic example/);
  assert.equal(await panel.locator('[data-independent-history]').evaluate(n=>n.open),false);
  assert.equal(await page.locator('[data-item="'+q.id+'"] .verified').count(),0);
  yield "06. [data-independent-history] > summary / click";
  await panel.locator('[data-independent-history] > summary').click();
  assert.equal(await panel.locator('.attempt-entry').count(),1);
  await page.locator('[data-view="word"]').click();await page.locator('[data-view="queue"]').click();
  yield "07. [data-independent-history] / evaluate";
  assert.equal(await panel.locator('[data-independent-history]').evaluate(n=>n.open),true);
  await panel.locator('[data-independent-history] > summary').click();
  await panel.locator('[data-independent-action="run"]').click();
  await page.waitForFunction(id=>document.querySelector('[data-independent="'+id+'"]')?.querySelectorAll('.attempt-entry').length===2,q.id);
  yield "08. [data-independent-history] / evaluate";
  assert.equal(await panel.locator('[data-independent-history]').evaluate(n=>n.open),false);
  await Promise.resolve();
  await page.setViewportSize({width:390,height:844});await panel.scrollIntoViewIfNeeded();
  yield "09. evaluate";
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await Promise.resolve();
  await page.selectOption('#account','student');await page.locator('#account:not([disabled])').waitFor();
  yield "10. [data-independent] / checks";
  assert.equal(await page.locator('[data-independent]').count(),0);assert.equal(await page.locator('[data-view="queue"]').isVisible(),false);
  assert.deepEqual(errors,[]);assert.ok(requests.every(path=>path.startsWith(url+'/')));

})));

test('UI retries load failures, escapes findings, paginates and discards late responses after role change',async()=>preview(async(page,url)=>scenarioSubtests("UI retries load failures, escapes findings, paginates and discards late responses after role change phases",async function*(){
yield "00. Fixture and browser setup";

  const {quizzes}=await(await fetch(url+'/local/queue')).json(),q=quizzes.find(quiz=>quiz.type==='Choice');
  const endpoint=url+'/local/quizzes/'+q.id+'/independent';
  const post=(path,data)=>fetch(path,{method:'POST',headers:{Origin:url,Cookie:'qr-preview=dev','Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),...data})});
  await post(url+'/local/providers',{expectedRevision:1,selections:{review:{adapterId:'local-checker-a',locale:'en-US',mode:'text'}},reason:'Fixture checker.'});
  const saved=await(await post(endpoint,{expectedRevision:q.revision,level:null})).json();
  let phase='error',release;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  yield "01. route";
  await page.route('**/local/quizzes/'+q.id+'/independent?*',async route=>{
    if(phase==='late')await new Promise(resolve=>release=resolve);
    if(phase==='error'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'History temporarily unavailable.'})});return;}
    const row=structuredClone(saved);row.result.findings[0].message='<img src=x onerror=alert(1)>';
    const more=new URL(route.request().url()).searchParams.has('before');
    await route.fulfill({contentType:'application/json',body:JSON.stringify({attempts:[row],next:more?null:row.sequence})});
  });
  await page.goto(url);await page.locator('#account:not([disabled])').waitFor();await page.locator('[data-view="queue"]').click();
  const panel=page.locator('[data-independent="'+q.id+'"]');
    yield "02. checks";
    await expand(panel);
  await panel.getByRole('alert').waitFor();phase='ready';await panel.locator('[data-independent-action="refresh"]').click();
  await panel.locator('[data-independent-latest]').waitFor();
    yield "03. img / checks";
    assert.equal(await panel.locator('img').count(),0);
  assert.match(await panel.locator('[data-independent-latest]').innerText(),/<img/);
  await panel.locator('[data-independent-history] > summary').click();await panel.locator('[data-independent-action="more"]').click();
  yield "04. waitForFunction";
  await page.waitForFunction(id=>document.querySelector('[data-independent="'+id+'"]')?.querySelectorAll('.attempt-entry').length===2,q.id);
  phase='late';await panel.locator('[data-independent-action="refresh"]').click();
  await page.waitForFunction(id=>document.querySelector('[data-independent="'+id+'"]')?.textContent.includes('Loading checks...'),q.id);
  for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(typeof release,'function');
  await page.selectOption('#account','student');
    yield "05. #account:not([disabled]) / checks";
    await page.locator('#account:not([disabled])').waitFor();release();
  await page.waitForTimeout(100);assert.equal(await page.locator('[data-independent]').count(),0);assert.deepEqual(errors,[]);

})));

test('UI shows deadline and interruption, blocks pending runs and offers bounded linked retries',async()=>preview(async(page,url)=>scenarioSubtests("UI shows deadline and interruption, blocks pending runs and offers bounded linked retries phases",async function*(){
yield "00. Fixture and browser setup";

  const {quizzes}=await(await fetch(url+'/local/queue')).json(),q=quizzes.find(quiz=>quiz.type==='Choice');
  const endpoint=url+'/local/quizzes/'+q.id+'/independent';
  const saved=await(await fetch(endpoint,{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),expectedRevision:q.revision,level:null})})).json();
  let phase='pending';const errors=[];page.on('pageerror',e=>errors.push(e.message));
  yield "01. route";
  await page.route('**/local/quizzes/'+q.id+'/independent?*',async route=>{
    if(phase==='real'){await route.continue();return;}
    const row={...saved,...(phase==='pending'?{state:'pending',error:null,finishedAt:null,canRetry:false}:{error:'interrupted',canRetry:true})};
    await route.fulfill({contentType:'application/json',body:JSON.stringify({attempts:[row],next:null})});
  });
  await page.goto(url);await page.locator('#account:not([disabled])').waitFor();await page.locator('[data-view="queue"]').click();
  const panel=page.locator('[data-independent="'+q.id+'"]');
    yield "02. checks";
    await expand(panel);
  await panel.locator('[data-independent-latest]').waitFor();assert.match(await panel.locator('[data-independent-latest]').innerText(),/waiting until/);
  assert.match(await panel.locator('[data-independent-latest]').innerText(),/\d{2}:\d{2}:\d{2}/);
  yield "03. [data-independent-action=\"run\"] / checks";
  assert.equal(await panel.locator('[data-independent-action="run"]').isDisabled(),true);
  assert.equal(await panel.locator('[data-independent-action="retry"]').count(),0);
  phase='expired';await panel.locator('[data-independent-action="refresh"]').click();
  await panel.getByRole('button',{name:'Retry check · 2 left',exact:true}).waitFor();
  yield "04. [data-independent-latest] / checks";
  assert.match(await panel.locator('[data-independent-latest]').innerText(),/Check interrupted/);
  await page.setViewportSize({width:390,height:844});await panel.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  yield "05. checks";
  await Promise.resolve();
  phase='real';await panel.locator('[data-independent-action="retry"]').click();
  await panel.getByRole('button',{name:'Retry check · 1 left',exact:true}).waitFor();
  await panel.locator('[data-independent-history] > summary').click();
  yield "06. [data-independent-history] / checks";
  assert.match(await panel.locator('[data-independent-history]').innerText(),/Retry 1 \/ 2/);
  await panel.locator('[data-independent-action="retry"]').click();
  await page.waitForFunction(id=>document.querySelector('[data-independent="'+id+'"]')?.querySelectorAll('.attempt-entry').length===3,q.id);
  assert.equal(await panel.locator('[data-independent-action="retry"]').count(),0);
  yield "07. [data-independent-history] / checks";
  assert.match(await panel.locator('[data-independent-history]').innerText(),/Retry 2 \/ 2/);
  const data=await(await fetch(endpoint)).json();assert.equal(data.attempts[0].retryOf,data.attempts[1].id);assert.equal(data.attempts[0].canRetry,false);
  assert.deepEqual(errors,[]);

})));

test('shared quota UI fails closed, blocks exhausted runs/retries and refreshes after a developer limit change',async()=>preview(async(page,url)=>scenarioSubtests("shared quota UI fails closed, blocks exhausted runs/retries and refreshes after a developer limit change phases",async function*(){
yield "00. Fixture and browser setup";

  const post=(path,data)=>fetch(url+path,{method:'POST',headers:{Origin:url,Cookie:'qr-preview=dev','Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),...data})});
  await post('/local/providers',{expectedRevision:1,selections:{review:{adapterId:'local-checker-a',locale:'en-US',mode:'text'}},reason:'Fixture review.'});
  const {quizzes}=await(await fetch(url+'/local/queue')).json(),q=quizzes.find(row=>row.type==='Choice'),endpoint='/local/quizzes/'+q.id+'/independent';
  let unavailable=true;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/local/review-quota',route=>unavailable?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Request quota is unavailable.'})}):route.continue());
  yield "01. goto";
  await page.goto(url);await page.locator('#account:not([disabled])').waitFor();await page.locator('[data-view="queue"]').click();
  const panel=page.locator('[data-independent="'+q.id+'"]');await expand(panel);
    yield "02. alert / checks";
    await panel.getByRole('alert').waitFor();
  assert.equal(await panel.locator('[data-independent-action="run"]').isDisabled(),true);
  unavailable=false;await panel.locator('[data-independent-action="refresh"]').click();await panel.locator('[data-independent-quota]').waitFor();
  yield "03. [data-independent-quota] / checks";
  assert.match(await panel.locator('[data-independent-quota]').innerText(),/1 \/ 1/);
  await panel.locator('[data-independent-action="run"]').click();await page.waitForFunction(id=>document.querySelector('[data-independent="'+id+'"] [data-independent-quota]')?.textContent.includes('0 / 1'),q.id);
  assert.equal(await panel.locator('[data-independent-action="run"]').isDisabled(),true);
  yield "04. checks";
  const blocked=await(await post(endpoint,{expectedRevision:q.revision})).json();assert.equal(blocked.error,'quota_exceeded');
  await panel.locator('[data-independent-action="refresh"]').click();await panel.getByRole('button',{name:'Retry check · 2 left',exact:true}).waitFor();
  yield "05. [data-independent-latest] / checks";
  assert.match(await panel.locator('[data-independent-latest]').innerText(),/No checker call was made/);
  assert.equal(await panel.locator('[data-independent-action="retry"]').isDisabled(),true);
  await page.setViewportSize({width:390,height:844});await panel.scrollIntoViewIfNeeded();
    yield "06. evaluate";
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await Promise.resolve();
  await post('/local/quota',{expectedRevision:1,requestLimit:2,reason:'Permit the explicit retry.'});
  await panel.locator('[data-independent-action="refresh"]').click();
    yield "07. waitForFunction";
    await page.waitForFunction(id=>document.querySelector('[data-independent="'+id+'"] [data-independent-quota]')?.textContent.includes('1 / 2'),q.id);
  await panel.locator('[data-independent-action="retry"]').click();await page.waitForFunction(id=>document.querySelector('[data-independent="'+id+'"] [data-independent-quota]')?.textContent.includes('0 / 2'),q.id);
  assert.equal(await panel.locator('[data-independent-action="retry"]').count(),0);
    yield "08. [data-independent-action=\"run\"] / checks";
    assert.equal(await panel.locator('[data-independent-action="run"]').isDisabled(),true);
  await page.selectOption('#account','student');await page.locator('#account:not([disabled])').waitFor();assert.equal(await page.locator('[data-independent-quota]').count(),0);assert.deepEqual(errors,[]);

}),{requestLimit:1}));
