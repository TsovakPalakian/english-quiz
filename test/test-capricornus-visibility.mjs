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
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const page=await browser.newPage({viewport,reducedMotion:'reduce'});
    await page.route('**/preview.js*',async route=>{
      const response=await route.fetch(),body=await response.text();
      const anchor='let current=frozen?.constellation||next(),previous=null';
      assert.equal(body.split(anchor).length,2,'Cap injection anchor occurs exactly once');
      assert.ok(body.includes('return result.layout;'));
      await route.fulfill({response,body:body
        .replace(anchor,"let current=frozen?.constellation||catalogue.find(c=>c.abbr==='Cap'),previous=null")
        .replace('return result.layout;','window.capLayout=result.layout;return result.layout;')
        .replace('Object.freeze({background:20,constellation:100})','Object.freeze({background:0,constellation:100})')});
    });
    await page.goto(preview.url);
    await page.waitForFunction(()=>window.capLayout&&document.getElementById('authSky').dataset.skyPhase==='hold');

    const sample=await page.evaluate(()=>{
      const canvas=document.getElementById('authSky');
      const star=window.capLayout.stars.find(s=>s.id==='algedi');
      const ratio=canvas.width/innerWidth,x=Math.round(star.x*ratio),y=Math.round(star.y*ratio),r=Math.ceil(3*ratio);
      const data=canvas.getContext('2d').getImageData(x-r,y-r,2*r+1,2*r+1).data;
      let alpha=0;for(let i=3;i<data.length;i+=4)alpha+=data[i];

      const links=[...document.querySelectorAll('.auth-sky-landmark')].filter(n=>!n.hidden).map(n=>({text:n.textContent.trim(),href:n.href}));
      const title=document.querySelector('.auth-sky-title')?.textContent.trim();

      return {alpha,spacing:star.spacing,hip:star.hip,links,title};
    });

    assert.equal(sample.hip,100064, 'HIP 100064 is Algedi (alpha-2 Cap)');
    assert.ok(sample.alpha>=800,'Algedi has a visible bright marker on canvas');
    assert.ok(sample.spacing>=(viewport.width===1440?40:20),'Algedi spacing is restored to full separation');
    assert.ok(sample.links.some(l=>l.text==='δ Deneb Algedi'),'Deneb Algedi has Greek letter δ');
    assert.ok(sample.links.some(l=>l.text==='α Algedi'),'Algedi has Greek letter α');

    console.log(JSON.stringify({viewport,alpha:sample.alpha,spacing:sample.spacing,links:sample.links}));
    await page.close();
  }
}finally{
  await browser?.close();
  await preview.close();
}
