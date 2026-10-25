import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createLearningWorkbenchPreview} from '../ops/preview-learning-workbench.mjs';
import {closeQuizMediaInspector} from '../ops/quiz-media-native.mjs';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
test('video prototype renders a decodable MP4, submits for real review and withholds the student transcript',async()=>scenarioSubtests("video prototype renders a decodable MP4, submits for real review and withholds the student transcript phases",async function*(){
yield "00. Fixture and browser setup";

  const preview=await createLearningWorkbenchPreview();let browser;
  const post=async(path,value,actor='teacher')=>{const response=await fetch(preview.url+path,{method:'POST',headers:{Origin:preview.url,'Content-Type':'application/json',Cookie:'local-workbench-role='+actor},body:JSON.stringify(value)}),data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;};
  const get=async(path,actor='teacher')=>{const response=await fetch(preview.url+path,{headers:{Cookie:'local-workbench-role='+actor}});return response.json();};
  try{
    assert.equal((await fetch(preview.url+'/__local/video/api',{headers:{Cookie:'local-workbench-role=u1'}})).status,403);
    assert.equal((await fetch(preview.url+'/__local/video/api/settings',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
    browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    yield "01. context";
    await page.context().addCookies([{name:'local-workbench-role',value:'dev',url:preview.url}]);await page.goto(preview.url+'/__local/video');
    await page.locator('#video-provider:not([hidden])').waitFor();await page.selectOption('#video-provider [name=provider]','local-fixture');
    yield "02. getByRole";
    await page.getByRole('button',{name:'Save provider',exact:true}).click();
    await page.getByRole('button',{name:'Queue video quiz',exact:true}).click();await page.locator('[data-video-job]>summary').click();await page.getByRole('button',{name:'Run local simulation',exact:true}).click();
    yield "03. getByText";
    await page.getByText('Video choice submitted for teacher review. No automatic approval.',{exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('video')?.videoWidth===480);
    await page.locator('video').evaluate(video=>video.play());await page.waitForFunction(()=>document.querySelector('video').currentTime>0.2);
    yield "04. video / evaluate";
    assert.ok(await page.locator('video').evaluate(video=>{video.pause();const canvas=document.createElement('canvas');canvas.width=48;canvas.height=27;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,48,27);return new Set(new Uint32Array(ctx.getImageData(0,0,48,27).data.buffer)).size>3;}),'Rendered clip plays and contains a nonblank scene');
    const result=(await get('/__local/video/api','dev')).jobs[0];assert.equal(result.state,'submitted');assert.equal(result.synthetic,true);
    assert.ok(!(await get('/api/learning-workbench/templates?cardId=1','u1')).quizzes.some(q=>q.id===result.quizId));
    await page.setViewportSize({width:390,height:844});
    yield "05. evaluate";
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await Promise.resolve();
    await post('/api/learning-workbench/proposals/'+result.quizId+'/approve',{mutationId:crypto.randomUUID(),expectedRevision:1,checks:{meaning:true,answers:true,level:true,media:true}});
    const session=await post('/api/learning-workbench/sessions',{mutationId:crypto.randomUUID(),cardId:1,senseId:result.senseId,versionId:result.quizId,mode:'practice'},'u1');
    yield "06. checks";
    const before=await get('/api/learning-workbench/sessions/'+session.id,'u1');assert.ok(!JSON.stringify(before).includes('A fine drizzle started falling.'));assert.equal(before.questions[0].answer,undefined);
    await post('/api/learning-workbench/sessions/'+session.id+'/submit',{mutationId:crypto.randomUUID(),expectedRevision:before.revision,responses:[1]},'u1');
    const after=await get('/api/learning-workbench/sessions/'+session.id,'u1');assert.equal(after.content.items[0].transcript,'A fine drizzle started falling.');assert.equal(after.correctCount,0);assert.deepEqual(errors,[]);
  }finally{await browser?.close();await preview.close();await closeQuizMediaInspector();}

}));
