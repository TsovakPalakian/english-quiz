import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';
const {chromium}=createRequire(import.meta.url)(resolveTestDependency('playwright'));
const preview=await previewAuthStudio();let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
  for(const reducedMotion of ['no-preference','reduce']){
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install();
    await page.addInitScript(()=>{
      window.skyFocused=true;window.skyHidden=false;
      sessionStorage.setItem('lumiscia-catalogue-sky-recent','["Cru"]');
      document.hasFocus=()=>window.skyFocused;
      Object.defineProperty(document,'hidden',{get:()=>window.skyHidden});
    });
    await page.route('**/preview.js*',async route=>{
      const response=await route.fetch(),body=await response.text();
      await route.fulfill({response,body:body.replace('let current=frozen?.constellation||next(),previous=null',"let current=frozen?.constellation||catalogue.find(c=>c.abbr==='Cru'),previous=null")});
    });
    await page.goto(preview.url);await page.waitForSelector('body.guest-home');
    if(reducedMotion==='no-preference')await page.clock.runFor(16500);
    await page.locator('.auth-sky-title:visible').waitFor();
    // Keep the real click handler, without opening any external page.
    const clickCaption=()=>page.evaluate(()=>{
      const link=document.querySelector('.auth-sky-title:not([hidden])');
      link.removeAttribute('href');link.click();
    });
    const sky=page.locator('#authSky'),initial=await sky.getAttribute('data-sky-constellation');
    await clickCaption();
    await page.evaluate(()=>{
      window.skyFocused=false;window.skyHidden=true;
      window.dispatchEvent(new Event('blur'));document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(120000);
    assert.equal(await sky.getAttribute('data-sky-constellation'),initial,'The constellation survives a long absence');
    await page.setViewportSize({width:1360,height:1000});await page.clock.runFor(100);
    assert.equal(await sky.getAttribute('data-sky-constellation'),initial,'Relayout during absence preserves the frozen constellation');
    const back=()=>page.evaluate(()=>{
      window.skyHidden=false;window.skyFocused=true;
      document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));
    });
    await back();await page.clock.runFor(4900);
    assert.equal(await sky.getAttribute('data-sky-constellation'),initial,'Returning does not skip the five-second wait');
    await page.evaluate(()=>{window.skyFocused=false;window.dispatchEvent(new Event('blur'));});
    await page.clock.fastForward(30000);
    assert.equal(await sky.getAttribute('data-sky-constellation'),initial,'Leaving for another window cancels the countdown');
    await back();await page.clock.runFor(4900);
    assert.equal(await sky.getAttribute('data-sky-constellation'),initial,'A new return starts a full five-second wait');
    await page.clock.runFor(150);
    assert.notEqual(await sky.getAttribute('data-sky-constellation'),initial,'A new constellation follows the wait');
    assert.equal(await sky.getAttribute('data-sky-frozen'),'false');
    assert.equal(await sky.getAttribute('data-sky-phase'),reducedMotion==='reduce'?'hold':'morph');
    if(reducedMotion==='no-preference')await page.clock.runFor(19500);
    await page.locator('.auth-sky-title:visible').waitFor();
    const before=await sky.getAttribute('data-sky-constellation');
    await clickCaption();
    await page.clock.runFor(5100);
    assert.notEqual(await sky.getAttribute('data-sky-constellation'),before,'A background-tab link does not leave the visible page frozen indefinitely');
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Constellation pause: long absence, five seconds after return, repeated departure, focus/visibility and reduced motion passed without screenshots.');
}finally{await browser?.close();await preview.close();}
