import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
async function fixture(work){const {server,url}=await createQuizReviewPreview({generationEnabled:true});try{await work(url);}finally{await new Promise(resolve=>server.close(resolve));}}
function client(url){return async(path,data,role='teacher',origin=url)=>{
  const response=await fetch(url+path,{method:data?'POST':'GET',headers:{Cookie:'qr-preview='+role,...(data?{Origin:origin,'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify({mutationId:crypto.randomUUID(),...data})}:{})});
  return {status:response.status,data:await response.json()};
};}
test('kit HTTP routes enforce roles, explicit senses, origin, CAS, frozen sessions and withdrawal',async()=>fixture(async url=>{
  const call=client(url),{contexts}= (await call('/local/boot')).data,c=contexts[0],context={cardId:c.cardId,senseId:c.senseId,groupId:c.groupId,lessonId:c.lessonId};
  for(const query of ['?cardId=1&groupId=1','?cardId=1&cardId=2','?cardId=1&unknown=2'])assert.equal((await call('/local/kit'+query)).status,400);
  assert.equal((await call('/local/kits/queue',null,'student')).status,403);assert.equal((await call('/local/kit?cardId=4',null,'student')).status,404);
  const metadata={level:'A2',forms:['drizzles'],examples:[],source:null};
  assert.equal((await call('/local/kit/metadata',{...context,expectedRevision:0,metadata},'student')).status,403);
  assert.equal((await call('/local/kit/metadata',{...context,expectedRevision:0,metadata},'teacher','https://evil.invalid')).status,403);
  assert.equal((await call('/local/kit/metadata',{...context,expectedRevision:0,metadata})).status,200);
  assert.equal((await call('/local/kit/metadata',{...context,expectedRevision:0,metadata})).status,409);
  const data=(await call('/local/kit?'+new URLSearchParams(context))).data;assert.equal(data.counts.total,17);
  const student=(await call('/local/kit?'+new URLSearchParams(context),null,'student')).data;assert.equal(student.library.length,0);assert.ok(student.types.every(row=>!Object.hasOwn(row,'proposalIds')));
  const id=data.library[0].id;
  const session=(await call('/local/kit-sessions',{cardId:1,senseId:c.senseId,versionId:id,mode:'practice'},'student')).data;
  assert.equal((await call('/local/kit-sessions/'+session.id,null,'other')).status,404);
  assert.equal((await call('/local/quizzes/'+id+'/publication',{expectedRevision:0,available:false,reason:'Check this template.'},'student')).status,403);
  assert.equal((await call('/local/quizzes/'+id+'/publication',{expectedRevision:0,available:false,reason:'Check this template.'})).status,200);
  assert.equal((await call('/local/kit-sessions',{cardId:1,senseId:c.senseId,versionId:id,mode:'practice'},'student')).status,409);
  assert.equal((await call('/local/kit-sessions/'+session.id+'/submit',{expectedRevision:1,responses:['изморось']},'student')).status,200);
  assert.equal((await call('/local/kit-sessions/'+session.id,null,'student')).data.correctCount,1);
  assert.equal((await call('/local/kit/meaning',{cardId:1,meaning:{partOfSpeech:'verb',translation:'полить',definition:'Pour liquid over food.'}},'teacher')).status,403);
  const meaning=await call('/local/kit/meaning',{cardId:1,meaning:{partOfSpeech:'verb',translation:'полить',definition:'Pour liquid over food.'}},'dev');assert.equal(meaning.status,201);
  assert.equal((await call('/local/kit?cardId=1')).data.selectionRequired,true);
  assert.equal((await call('/local/kit?cardId=1&senseId='+meaning.data.senseId)).data.counts.ready,0);
  assert.equal((await call('/local/kit/fill',{...context,types:['Type']},'student')).status,403);
  assert.equal((await call('/local/kit/fill',{...context,types:['Type']})).status,200);
}));
const expand=async node=>node.evaluate(element=>{for(let n=element;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;});
test('connected UI manages metadata, opinions, library, exact meanings, filters and practice locally',async()=>fixture(async url=>{
  let browser;try{
    browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
    const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    const call=client(url),choose=async role=>{await page.selectOption('#account',role);await page.locator('#account:not([disabled])').waitFor();};
    const nav=async view=>{await page.locator('[data-view="'+view+'"]').click();await page.waitForFunction(view=>document.querySelector('[data-view="'+view+'"]')?.getAttribute('aria-current')==='page'&&!document.querySelector('#account')?.disabled,view);};
    await page.goto(url);await page.locator('#account:not([disabled])').waitFor();assert.equal(await page.locator('.kit-type').count(),17);
    const metadata=page.locator('[data-kit-form="metadata"]');await expand(metadata);await metadata.locator('[name="level"]').selectOption('A2');await metadata.locator('[name="forms"]').fill('drizzles');await metadata.locator('[type="submit"]').click();await page.locator('#account:not([disabled])').waitFor();assert.match(await page.locator('.kit-panel').innerText(),/Level: A2/);
    const gapId=(await call('/local/queue')).data.quizzes.find(row=>row.type==='Gap').id;await page.locator('[data-kit-action="open-version"][data-id="'+gapId+'"]').click();await page.locator('#account:not([disabled])').waitFor();assert.equal(await page.locator('[data-item="'+gapId+'"]').evaluate(node=>node.open),true);
    await nav('queue');await page.locator('[data-queue-filter="search"]').fill('bank');assert.match(await page.locator('#queue-result-count').innerText(),/1 \/ 4/);await page.locator('[data-queue-filter="search"]').fill('');
    const q=(await call('/local/queue')).data.quizzes.find(row=>row.type==='Gap'),item=page.locator('[data-item="'+q.id+'"]');await expand(item);
    const opinions=item.locator('[data-expand="kit-opinions-'+q.id+'"]');await expand(opinions);await opinions.getByRole('button',{name:'Load teacher opinions',exact:true}).click();await opinions.locator('textarea').fill('Is the sentence unambiguous?');await opinions.getByRole('button',{name:'Request second opinion',exact:true}).click();await page.locator('#account:not([disabled])').waitFor();
    await choose('outsider');await expand(item);await expand(opinions);await opinions.getByRole('button',{name:'Load teacher opinions',exact:true}).click();await opinions.locator('textarea').fill('The meaning and the gap are clear.');await opinions.getByRole('button',{name:'Save second opinion',exact:true}).click();await page.locator('#account:not([disabled])').waitFor();assert.match(await opinions.innerText(),/Confirmed/);
    await item.locator('[data-action="approve"]').click();for(const checkbox of await page.locator('#decision input[type="checkbox"]').all())await checkbox.check();await page.locator('#decision-confirm').click();await page.locator('#decision').waitFor({state:'hidden'});
    await nav('word');const lib=page.locator('[data-kit-form="publication"]').first();await expand(lib);await lib.locator('textarea').fill('Temporary withdrawal for review.');await lib.locator('[type="submit"]').click();await page.locator('#account:not([disabled])').waitFor();assert.match(await page.locator('[data-expand^="kit-library-"]').first().innerText(),/Withdrawn/);
    const restore=page.getByRole('button',{name:'Restore availability',exact:true});await restore.locator('..').locator('textarea').fill('Teacher confirmed the template.');await restore.click();await page.locator('#account:not([disabled])').waitFor();
    await page.locator('input[name="types"][value="Type"]').check();await page.getByRole('button',{name:'Prepare selected types',exact:true}).click();await page.locator('#account:not([disabled])').waitFor();assert.ok((await call('/local/generation')).data.jobs.some(row=>row.type==='Type'));
    await choose('student');const quiz=page.locator('[data-item]').filter({has:page.locator('strong').getByText('Flip · v1',{exact:true})});await expand(quiz);await quiz.getByRole('button',{name:'Practice this version',exact:true}).click();await page.locator('#kit-session[open]').waitFor();await page.locator('#kit-session input').fill('изморось');await page.getByRole('button',{name:'Check answers',exact:true}).click();await page.getByText('1 / 1 correct',{exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.locator('[data-kit-form="metadata"]').count(),0);
    const choice=(await call('/local/queue')).data.quizzes.find(row=>row.type==='Choice');await call('/local/quizzes/'+choice.id+'/approve',{expectedRevision:choice.revision,checks:{meaning:true,answers:true,level:true}});await nav('word');const choiceNode=page.locator('[data-item="'+choice.id+'"]');await expand(choiceNode);await choiceNode.getByRole('button',{name:'Practice this version',exact:true}).click();await page.locator('#kit-session select').selectOption(String(choice.content.items[0].answer));await page.getByRole('button',{name:'Check answers',exact:true}).click();await page.getByText('1 / 1 correct',{exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
    await choose('dev');const newMeaning=page.locator('[data-kit-form="meaning"]');await expand(newMeaning);await newMeaning.locator('[name="partOfSpeech"]').fill('verb');await newMeaning.locator('[name="translation"]').fill('полить');await newMeaning.locator('[name="definition"]').fill('Pour liquid over food.');await newMeaning.locator('[type="submit"]').click();await page.locator('#account:not([disabled])').waitFor();assert.match(await page.locator('.kit-panel h3').innerText(),/0 \/ 17/);assert.equal(await page.locator('[data-item]').count(),0);
    // Select the original noun explicitly rather than relying on option order.
    await page.selectOption('#kit-sense',{label:(await page.locator('#kit-sense option').allTextContents()).find(label=>label.startsWith('noun'))});await page.locator('#account:not([disabled])').waitFor();
    await page.locator('.kit-panel details').evaluateAll(nodes=>nodes.forEach(node=>node.open=false));await page.locator('.kit-panel h2').scrollIntoViewIfNeeded();await Promise.resolve();await page.setViewportSize({width:390,height:844});await page.locator('.kit-panel h3').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await Promise.resolve();
    assert.deepEqual(errors,[]);assert.ok(requests.every(request=>request.startsWith(url)));
  }finally{await browser?.close();}
}));
test('kit UI retains failed edits and queue filters, and reports empty results without losing controls',async()=>fixture(async url=>{
  let browser;try{
    browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
    const page=await browser.newPage({viewport:{width:1280,height:960}}),call=client(url);await page.goto(url);await page.locator('#account:not([disabled])').waitFor();
    const {contexts}=(await call('/local/boot')).data,c=contexts[0];
    const form=page.locator('[data-kit-form="metadata"]');await expand(form);await form.locator('[name="level"]').selectOption('B1');await form.locator('[name="forms"]').fill('drizzles');
    await call('/local/kit/metadata',{groupId:c.groupId,lessonId:c.lessonId,cardId:c.cardId,senseId:c.senseId,expectedRevision:0,metadata:{level:'A1',forms:[],examples:[],source:null}});
    await form.locator('[type="submit"]').click();await page.locator('#notice.error').waitFor();await page.locator('#account:not([disabled])').waitFor();assert.equal(await form.locator('[name="level"]').inputValue(),'B1');assert.equal(await form.locator('[name="forms"]').inputValue(),'drizzles');
    await page.locator('[data-view="queue"]').click();await page.locator('[data-queue-filter="search"]').fill('no such word');assert.equal(await page.locator('#queue-results [data-item]').count(),0);assert.match(await page.locator('#queue-results').innerText(),/No matching/);
    await page.locator('[data-view="word"]').click();await page.locator('#kit-sense').waitFor();await page.locator('[data-view="queue"]').click();await page.locator('[data-queue-filter="search"]').waitFor();assert.equal(await page.locator('[data-queue-filter="search"]').inputValue(),'no such word');
    await page.locator('[data-queue-filter="search"]').fill('');await page.selectOption('[data-queue-filter="group"]','2');await page.waitForFunction(()=>document.querySelectorAll('#queue-results [data-item]').length===1);
    await page.selectOption('#theme','ocean');await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }finally{await browser?.close();}
}));
