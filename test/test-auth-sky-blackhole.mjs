import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
const preview=await previewAuthStudio();
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
  
  const consoleErrors=[];
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  page.on('pageerror',err=>consoleErrors.push(err.message));

  await page.goto(preview.url);
  await page.waitForFunction(()=>document.getElementById('authSky'));

  // 1. Initial idle state
  const initial=await page.evaluate(()=>{
    const canvas=document.getElementById('authSky');
    return {status:canvas.dataset.skyBlackHole,count:canvas.dataset.skyBlackHoleCount};
  });
  assert.equal(initial.status,'idle','Initial state is idle');
  assert.equal(initial.count,'0','Initial count is 0');

  // 2. Trigger black hole
  await page.evaluate(()=>document.getElementById('authSky').__triggerBlackHole());
  const active=await page.evaluate(()=>{
    const canvas=document.getElementById('authSky');
    return {status:canvas.dataset.skyBlackHole,count:canvas.dataset.skyBlackHoleCount};
  });
  assert.equal(active.status,'active','Black hole transitioned to active');
  assert.equal(active.count,'1','Black hole count incremented');

  // 3. Reduced motion suppression
  const reducedMotionPage=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await reducedMotionPage.goto(preview.url);
  await reducedMotionPage.waitForFunction(()=>document.getElementById('authSky'));
  await reducedMotionPage.evaluate(()=>document.getElementById('authSky').__triggerBlackHole());
  const reduced=await reducedMotionPage.evaluate(()=>document.getElementById('authSky').dataset.skyBlackHole);
  assert.equal(reduced,'idle','Reduced motion suppresses black hole');

  assert.equal(consoleErrors.length,0,'Zero errors during black hole event: '+consoleErrors.join(', '));
  console.log('Black hole interactive celestial tests passed.');
}finally{
  await browser?.close();
  await preview.close();
}
