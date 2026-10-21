import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
import {closeQuizMediaInspector} from '../ops/quiz-media-native.mjs';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
test('local speech UI records privately, analyzes only with consent, displays provisional progress and deletes results',async()=>{
  const {server,url}=await createQuizReviewPreview();let browser;
  const api=async(path,data,role='student')=>{
    const response=await fetch(url+path,{method:data?'POST':'GET',headers:{Cookie:'qr-preview='+role,...(data?{Origin:url,'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify({mutationId:crypto.randomUUID(),...data})}:{})});return {status:response.status,data:await response.json()};
  };
  try{
    const settings=(await api('/local/providers',null,'dev')).data;assert.equal((await api('/local/providers',{expectedRevision:settings.revision,selections:{pronunciation:{adapterId:'local-speech-fixture',locale:'en-US',mode:'scripted'}},reason:'Synthetic local speech UI test.'},'dev')).status,200);
    browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    const context=await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:960}}),page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    await page.goto(url);await page.locator('#account:not([disabled])').waitFor();await page.selectOption('#account','student');await page.locator('#account:not([disabled])').waitFor();
    await page.locator('[data-view="speech"]').click();await page.locator('#speech-task').waitFor();await page.locator('#account:not([disabled])').waitFor();
    const tasks=(await api('/local/speech?'+new URLSearchParams({groupId:1,lessonId:1,cardId:1,senseId:(await api('/local/boot')).data.contexts[0].senseId}))).data.tasks,task=tasks.find(task=>task.mode==='pronunciation');assert.ok(task);
    await page.selectOption('#speech-task',task.id);await page.locator('#account:not([disabled])').waitFor();
    await page.getByRole('button',{name:'Record speech',exact:true}).click();await page.getByText('Recording locally...', {exact:true}).waitFor();await new Promise(resolve=>setTimeout(resolve,750));
    assert.equal((await api('/local/speech/tasks/'+task.id+'/history')).data.attempts.length,0);assert.ok(!requests.some(request=>/\/upload$|\/analyze$/.test(request)));
    await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.locator('[data-speech-local]').waitFor();await page.locator('[data-speech-local]').evaluate(audio=>audio.play());await page.waitForFunction(()=>document.querySelector('[data-speech-local]')?.currentTime>0.01);await page.locator('[data-speech-local]').evaluate(audio=>audio.pause());
    await page.locator('[data-speech-form="analyze"] [name="consent"]').check();await page.getByRole('button',{name:'Analyze recording',exact:true}).click();await page.locator('#account:not([disabled])').waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-speech-stats]')?.textContent.includes('Count: 1'));
    let history=(await api('/local/speech/tasks/'+task.id+'/history')).data.attempts;assert.equal(history.length,1);assert.equal(history[0].result.synthetic,true);assert.equal(history[0].result.overall,71);
    const attempt=page.locator('[data-speech-id="'+history[0].id+'"]');await attempt.evaluate(node=>{for(let n=node;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;});await attempt.locator('[name="text"]').fill('My corrected transcript.');await attempt.getByRole('button',{name:'Save transcript correction',exact:true}).click();await page.locator('#account:not([disabled])').waitFor();
    assert.equal((await api('/local/speech/attempts/'+history[0].id)).data.correction.text,'My corrected transcript.');assert.equal((await api('/local/speech/attempts/'+history[0].id,null,'teacher')).status,404);
    await page.screenshot({path:'/private/tmp/lumiscia-speech-desktop.png'});assert.equal(await page.locator('[data-speech-chart]').evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data).some(value=>value!==0)),true);
    await page.selectOption('[data-speech-metric]','fluency');await page.selectOption('#theme','ocean');assert.equal(await page.locator('[data-speech-metric]').inputValue(),'fluency');assert.match(await page.locator('[data-speech-stats]').innerText(),/Latest: 80/);await page.selectOption('#theme','light');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/private/tmp/lumiscia-speech-mobile.png'});
    await attempt.evaluate(node=>{for(let n=node;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;});page.once('dialog',dialog=>dialog.accept());await attempt.getByRole('button',{name:'Delete attempt and recording',exact:true}).click();await page.locator('#account:not([disabled])').waitFor();assert.equal((await api('/local/speech/tasks/'+task.id+'/history')).data.attempts.length,0);
    assert.deepEqual(errors,[]);assert.ok(requests.every(request=>request.startsWith(url)||request.startsWith('blob:')));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await closeQuizMediaInspector();}
});
