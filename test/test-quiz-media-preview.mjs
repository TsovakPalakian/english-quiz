import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
import {inspectQuizMedia,localSpeech,closeQuizMediaInspector} from '../ops/quiz-media-native.mjs';
import {wav} from './quiz-media-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
const launch=()=>chromium.launch({headless:true,executablePath:chromiumExecutable()});
async function clip(page){return Buffer.from(await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d'),stream=canvas.captureStream(8),chunks=[];
  const recorder=new MediaRecorder(stream,{mimeType:'video/mp4;codecs=avc1.42001E'});
  const done=new Promise(resolve=>{recorder.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(chunks,{type:'video/mp4'}).arrayBuffer())));recorder.ondataavailable=event=>chunks.push(event.data);});
  let frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame++%2?'#247a76':'#5c5eb5';ctx.fillRect(0,0,320,180);ctx.fillStyle='#fff';ctx.font='24px Arial';ctx.fillText('Light rain',70,90);},100);
  recorder.start();await new Promise(resolve=>setTimeout(resolve,700));recorder.stop();const result=await done;clearInterval(timer);stream.getTracks().forEach(track=>track.stop());return result;
}));}
test('native decoder validates actual WAV, installed-voice output and a playable generated MP4',async()=>{
  let browser;try{
    assert.equal((await inspectQuizMedia(wav(),'audio/wav')).kind,'audio');
    for(const voice of ['Samantha','Daniel']){const spoken=await localSpeech('Light rain.',voice);assert.ok((await inspectQuizMedia(spoken,'audio/wav')).duration>0);}
    browser=await launch();const page=await browser.newPage();await page.goto('about:blank');const video=await clip(page);const metadata=await inspectQuizMedia(new Uint8Array(video),'video/mp4');assert.equal(metadata.kind,'video');assert.equal(metadata.width,320);assert.ok(metadata.duration<=2);
    await assert.rejects(inspectQuizMedia(new Uint8Array([0,0,0,24,102,116,121,112]),'video/mp4'),error=>error.status===415);
  }finally{await browser?.close();await closeQuizMediaInspector();}
});
test('local UI uploads media, reviews Video choice, discloses transcript after answer and previews a private report',async()=>{
  const {server,url}=await createQuizReviewPreview();let browser;
  const call=async(path,data,role='teacher')=>{
    const response=await fetch(url+path,{method:data?'POST':'GET',headers:{Cookie:'qr-preview='+role,...(data?{Origin:url,'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify({mutationId:crypto.randomUUID(),...data})}:{})});return {status:response.status,data:await response.json()};
  };
  const expand=async node=>node.evaluate(element=>{for(let n=element;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;});
  try{
    browser=await launch();const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    await page.goto(url);await page.locator('#account:not([disabled])').waitFor();const video=await clip(page);
    const choose=async role=>{await page.selectOption('#account',role);await page.locator('#account:not([disabled])').waitFor();};
    const nav=async view=>{await page.locator('[data-view="'+view+'"]').click();await page.waitForFunction(view=>document.querySelector('[data-view="'+view+'"]')?.getAttribute('aria-current')==='page'&&!document.querySelector('#account')?.disabled,view);};
    await choose('student');const upload=page.locator('[data-material-form="upload"]');await upload.locator('[name="rights"]').fill('Original locally generated test clip, educational reuse permitted.');await upload.locator('[name="file"]').setInputFiles({name:'rain.mp4',mimeType:'video/mp4',buffer:video});await upload.getByRole('button',{name:'Upload media',exact:true}).click();await page.locator('#account:not([disabled])').waitFor();
    const assets=(await call('/local/media?purpose=quiz',null,'student')).data.media;assert.equal(assets.length,1);const asset=assets[0];
    await page.locator('[data-action="create"]').click();await page.selectOption('#edit-type','Video choice');await page.locator('[data-field="mediaId"]').selectOption(asset.id);await page.locator('[data-field="transcript"]').fill('A fine drizzle started falling.');await page.locator('[data-option="0"]').fill('Light rain');await page.locator('[data-option="1"]').fill('Snow');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.locator('#editor').waitFor({state:'hidden'});
    const q=(await call('/local/mine',null,'student')).data.quizzes.find(row=>row.type==='Video choice');assert.ok(q);
    const item=page.locator('[data-item="'+q.id+'"]');await expand(item);await item.locator('[data-action="submit"]').click();await page.locator('#account:not([disabled])').waitFor();
    await choose('teacher');await nav('queue');await expand(item);await item.locator('video').waitFor();await page.waitForFunction(()=>{const video=document.querySelector('[data-item] video');return video?.readyState>=2;});
    await item.locator('video').evaluate(video=>video.play());await page.waitForFunction(()=>document.querySelector('[data-item] video')?.currentTime>0.05);await item.locator('video').evaluate(video=>video.pause());
    await item.locator('[data-action="approve"]').click();assert.equal(await page.locator('#decision input[type="checkbox"]').count(),4);for(const checkbox of await page.locator('#decision input[type="checkbox"]').all())await checkbox.check();await page.locator('#decision-confirm').click();await page.locator('#decision').waitFor({state:'hidden'});
    await choose('student');await nav('word');await expand(item);await item.getByRole('button',{name:'Practice this version',exact:true}).click();const modal=page.locator('#kit-session');await modal.waitFor({state:'visible'});assert.doesNotMatch(await modal.innerText(),/fine drizzle/);await modal.locator('select').selectOption('1');assert.doesNotMatch(await modal.innerText(),/fine drizzle/);await modal.getByRole('button',{name:'Check answers',exact:true}).click();await modal.getByText('A fine drizzle started falling.',{exact:false}).waitFor();assert.match(await modal.innerText(),/0 \/ 1 correct/);await modal.getByRole('button',{name:'Close',exact:true}).click();
    // A synthetic PNG attachment replaces the former screenshot fixture.
    const attachment=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const ctx=canvas.getContext('2d');ctx.fillStyle='#247a76';ctx.fillRect(0,0,16,16);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
    await upload.locator('[name="purpose"]').selectOption('feedback');await upload.locator('[name="file"]').setInputFiles({name:'screen.png',mimeType:'image/png',buffer:attachment});await upload.getByRole('button',{name:'Upload media',exact:true}).click();await page.locator('#account:not([disabled])').waitFor();
    const report=page.locator('[data-material-form="report"]');await report.locator('[name="versionId"]').selectOption(q.id);await report.locator('[name="description"]').fill('Please check this video question.');await report.locator('[name="attachments"]').check();await report.getByRole('button',{name:'Preview report',exact:true}).click();assert.equal((await call('/local/feedback',null,'student')).data.reports.length,0);assert.match(await page.locator('#material-report').innerText(),/screen.png/);assert.match(await page.locator('#material-report').innerText(),/Video choice/);await page.getByRole('button',{name:'Save report locally',exact:true}).click();await page.locator('#material-report').waitFor({state:'hidden'});const savedReport=(await call('/local/feedback',null,'student')).data.reports[0];assert.equal(savedReport.delivered,false);assert.equal(savedReport.versionId,q.id);
    await choose('teacher');assert.equal((await call('/local/feedback')).data.reports.length,0);
    const settings=(await call('/local/providers',null,'dev')).data;assert.equal((await call('/local/providers',{expectedRevision:settings.revision,selections:{tts:{adapterId:'macos-local-tts',locale:'en-US',mode:'text'},dictionary:{adapterId:'local-dictionary-fixture',locale:'en-US',mode:'text'}},reason:'Local material test.'},'dev')).status,200);await nav('word');
    await page.getByRole('button',{name:'Prepare word audio',exact:true}).click();await page.locator('.material-result audio').waitFor();assert.match(await page.locator('.material-result').innerText(),/Teacher check pending/);await page.getByRole('button',{name:'Look up dictionary reference',exact:true}).click();await page.getByText('Synthetic dictionary fixture; not an external dictionary',{exact:false}).waitFor();
    await page.locator('.materials-panel').first().scrollIntoViewIfNeeded();await Promise.resolve();await page.setViewportSize({width:390,height:844});await page.locator('.materials-panel').first().scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await Promise.resolve();
    assert.deepEqual(errors,[]);assert.ok(requests.every(request=>request.startsWith(url)));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await closeQuizMediaInspector();}
});
