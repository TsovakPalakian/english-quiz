import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const preview=await previewAuthStudio();let browser;
const results=[];
try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const page=await browser.newPage({viewport,reducedMotion:'reduce'});
    await page.route('**/preview.js*',async route=>{
      const response=await route.fetch(),body=await response.text();
      const probe=`window.auditSkyLayouts=()=>catalogue.map(c=>{const result=astro.fitFigure(c,w,h,uiRects,(text,size)=>{ctx.font=size+'px Georgia,serif';return ctx.measureText(text).width;},constellationScale),l=result.layout;return {...result.diagnostic,overlaps:l?!astro.clearFigure(c,l.stars.filter(p=>astro.inViewport(p,w,h)),uiRects)||l.labels.some(box=>uiRects.some(r=>astro.intersects(box,r))||c.lines.some(([i,j])=>astro.segmentHitsBox(l.stars[i],l.stars[j],box))):false,cropped:l?l.stars.slice(0,c.stars.length).some(p=>p.x<18||p.x>w-18||p.y<18||p.y>h-18):false,scaleVisible:l?.labels.some(b=>b.star.caption&&b.star.scaleLabel)||false};});let current=next(),previous=null`;
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
      results.push({viewport,mode,figures:report});
      assert.equal(report.length,88);
      const missing=report.filter(r=>!r.placed).map(r=>r.abbr);
      console.log(JSON.stringify({viewport,mode,placed:88-missing.length,missing}));
      assert.equal(report.some(r=>r.overlaps),false,'No complete figure intersects UI');
      assert.equal(report.some(r=>r.cropped),false,'Every core star fits the current viewport');
      assert.ok(report.every(r=>!r.scaleVisible),'Scale text is absent from every title');
      if(mode==='home'){
        const resized=viewport.width===1440?{width:1280,height:800}:{width:430,height:932};
        await page.setViewportSize(resized);
        await page.waitForFunction(()=>{const c=document.getElementById('authSky'),r=Math.min(devicePixelRatio||1,2);return c.height===Math.round(innerHeight*r)&&c.width===Math.round(innerWidth*r);});
        const fitted=await page.evaluate(()=>window.auditSkyLayouts());
        results.push({viewport:resized,mode:'home-resized',figures:fitted});
        assert.ok(fitted.every(f=>f.viewport.width===resized.width&&f.viewport.height===resized.height),'Resize recalculates the actual viewport');
        assert.ok(fitted.every(f=>f.placed&&!f.cropped&&!f.overlaps));
        await page.setViewportSize(viewport);
        await page.waitForFunction(()=>{const c=document.getElementById('authSky'),r=Math.min(devicePixelRatio||1,2);return c.height===Math.round(innerHeight*r)&&c.width===Math.round(innerWidth*r);});
      }
    }
    await page.close();
  }
  assert.ok(results.every(r=>r.figures.every(f=>f.placed)),'See /tmp/lumiscia-go-audit/layout-results.json for exact UI blockers');
}finally{writeFileSync('/tmp/lumiscia-go-audit/layout-results.json',JSON.stringify(results,null,2));await browser?.close();await preview.close();}
