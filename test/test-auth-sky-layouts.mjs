import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const preview=await previewAuthStudio();let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const page=await browser.newPage({viewport,reducedMotion:'reduce'});
    await page.route('**/preview.js*',async route=>{
      const response=await route.fetch(),body=await response.text();
      const probe=`window.auditSkyLayouts=()=>catalogue.map(c=>{const l=chooseLayout(c);return {abbr:c.abbr,placed:!!l,overlaps:l?!astro.clearFigure(c,l.stars.filter(p=>astro.inViewport(p,w,h)),uiRects)||l.labels.some(box=>c.lines.some(([i,j])=>astro.segmentHitsBox(l.stars[i],l.stars[j],box))):false,scaleVisible:l?.labels.some(b=>b.star.caption&&b.star.scaleLabel)||false};});let current=next(),previous=null`;
      await route.fulfill({response,body:body.replace('let current=next(),previous=null',probe)});
    });
    await page.goto(preview.url);await page.waitForSelector('body.guest-home');
    for(const mode of ['home','login','registration','recovery']){
      if(mode==='login')await page.getByRole('button',{name:'Enter the Learning Studio',exact:true}).click();
      if(mode==='registration')await page.locator('.auth-create button').click();
      if(mode==='recovery'){
        await page.locator('[data-studio-back]').click();
        await page.locator('[data-password-recovery]').click();
      }
      const report=await page.evaluate(()=>window.auditSkyLayouts());
      assert.equal(report.length,88);
      const missing=report.filter(r=>!r.placed).map(r=>r.abbr);
      console.log(JSON.stringify({viewport,mode,placed:88-missing.length,missing}));
      assert.equal(report.some(r=>r.overlaps),false,'No complete figure intersects UI');
      assert.deepEqual(missing,[],'Every constellation has a safe complete placement');
      assert.ok(report.every(r=>r.scaleVisible),'Every title has its angular scale');
    }
    await page.close();
  }
}finally{await browser?.close();await preview.close();}
