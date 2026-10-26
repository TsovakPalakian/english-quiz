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
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await page.route('**/preview.js*',async route=>{
    const response=await route.fetch(),body=await response.text();
    const anchor='let current=frozen?.constellation||next(),previous=null';
    assert.equal(body.split(anchor).length,2,'Cap injection anchor occurs exactly once');
    await route.fulfill({response,body:body
      .replace(anchor,"let current=frozen?.constellation||catalogue.find(c=>c.abbr==='Cap'),previous=null")
      .replace('return result.layout;','window.capLayout=result.layout;return result.layout;')});
  });
  await page.goto(preview.url);
  await page.waitForFunction(()=>window.capLayout&&document.getElementById('authSky').dataset.skyPhase==='hold');

  const starPos=await page.evaluate(()=>{
    const s=window.capLayout.stars.find(st=>st.id==='deneb_algedi');
    return {x:s.x,y:s.y,hip:s.hip,bayer:s.bayer,name:s.name};
  });
  assert.equal(starPos.hip,107556,'HIP 107556 is Deneb Algedi');

  const inspector=page.locator('.auth-sky-inspector');
  assert.equal(await inspector.isVisible(),false,'Inspector is initially hidden');

  // Hover over Deneb Algedi
  await page.mouse.move(starPos.x,starPos.y);
  await page.waitForFunction(()=>document.querySelector('.auth-sky-inspector.active'));
  assert.equal(await inspector.isVisible(),true,'Inspector appears on hover');

  const inspectorData=await page.evaluate(()=>{
    const el=document.querySelector('.auth-sky-inspector');
    return {
      text:el.textContent,
      bayer:el.querySelector('.auth-sky-inspector-bayer')?.textContent?.trim(),
      name:el.querySelector('.auth-sky-inspector-name')?.textContent?.trim(),
      bayerLatin:el.querySelector('.auth-sky-inspector-bayer-latin')?.textContent?.trim(),
      con:el.querySelector('.auth-sky-inspector-con')?.textContent?.trim(),
      mag:el.querySelector('.auth-sky-inspector-mag')?.textContent?.trim(),
      hemi:el.querySelector('.auth-sky-hemi-val')?.textContent?.trim(),
      cluster:el.querySelector('.auth-sky-cluster-val')?.textContent?.trim(),
      spect:el.querySelector('.auth-sky-spect-val')?.textContent?.trim(),
      dist:el.querySelector('.auth-sky-dist-val')?.textContent?.trim(),
      lum:el.querySelector('.auth-sky-lum-val')?.textContent?.trim(),
      temp:el.querySelector('.auth-sky-temp-val')?.textContent?.trim(),
      sys:el.querySelector('.auth-sky-sys-val')?.textContent?.trim(),
      hip:el.querySelector('.auth-sky-hip-val')?.textContent?.trim(),
      coords:el.querySelector('.auth-sky-coords-val')?.textContent?.trim(),
      needlePos:el.querySelector('.auth-sky-temp-needle')?.style?.left,
      desc:el.querySelector('.auth-sky-inspector-desc')?.textContent?.trim(),
      simbadLinkText:el.querySelector('.auth-sky-inspector-simbad')?.textContent?.trim(),
      simbad:el.querySelector('.auth-sky-inspector-simbad')?.getAttribute('href')
    };
  });

  assert.equal(/[\u0400-\u04FF]/.test(inspectorData.text),false,'Inspector contains zero Russian characters');
  assert.equal(inspectorData.bayer,'δ','Bayer designation is delta');
  assert.equal(inspectorData.name,'Deneb Algedi','Star name is Deneb Algedi');
  assert.equal(inspectorData.bayerLatin,'Delta Capricorni','Bayer Latin designation is Delta Capricorni');
  assert.ok(inspectorData.con.includes('Capricornus'),'Constellation line includes Capricornus');
  assert.equal(inspectorData.mag,'2.85m','Magnitude is 2.85m');
  assert.ok(inspectorData.hemi.includes('Southern Sky'),'Hemisphere indicates Southern Sky');
  assert.equal(inspectorData.cluster,'None (Field Star)','Cluster indicates None (Field Star)');
  assert.ok(inspectorData.spect.includes('A5')||inspectorData.spect.includes('F2')||inspectorData.spect.includes('A7'),'Spectral class contains A5/F2/A7');
  assert.ok(inspectorData.dist.includes('39 ly')||inspectorData.dist.includes('38.7 ly'),'Distance indicates ~38.7 or 39 ly');
  assert.ok(inspectorData.lum.includes('Sun'),'Luminosity is measured in Solar units');
  assert.ok(inspectorData.temp.includes('K'),'Temperature is in Kelvin');
  assert.equal(inspectorData.sys,'Eclipsing Binary','System type is Eclipsing Binary');
  assert.ok(inspectorData.needlePos.includes('%'),'Temperature needle has percentage position');
  assert.equal(inspectorData.hip,'HIP 107556','Hipparcos catalog ID');
  assert.ok(inspectorData.simbad.includes('107556'),'SIMBAD href points to HIP 107556');
  assert.ok(inspectorData.coords.includes('21ʰ 47ᵐ'),'Right ascension formatted properly');
  assert.ok(inspectorData.desc.includes('Brightest star in Capricornus'),'Description is in English');
  assert.equal(inspectorData.simbadLinkText,'Open in SIMBAD ↗','Link text is in English');

  // Move away -> inspector hides
  await page.mouse.move(10,10);
  await page.waitForFunction(()=>!document.querySelector('.auth-sky-inspector.active'));
  assert.equal(await inspector.isVisible(),false,'Inspector hides when moving away');

  // Click on Deneb Algedi -> pins inspector
  await page.mouse.click(starPos.x,starPos.y);
  await page.waitForFunction(()=>document.querySelector('.auth-sky-inspector.active'));
  assert.equal(await inspector.isVisible(),true,'Inspector appears and pins on click');

  // Move away while pinned -> stays open
  await page.mouse.move(10,10);
  await page.waitForTimeout(200);
  assert.equal(await inspector.isVisible(),true,'Inspector stays open when pinned even if mouse moves away');
  const skyFrozen=await page.evaluate(()=>document.getElementById('authSky').dataset.skyFrozen);
  assert.equal(skyFrozen,'true','Constellation is frozen while inspector is open');

  // Click outside -> unpins and dismisses
  await page.mouse.click(10,10);
  await page.waitForFunction(()=>!document.querySelector('.auth-sky-inspector.active'));
  assert.equal(await inspector.isVisible(),false,'Inspector dismisses on click outside');

  // Test hovering another star in Capricornus without a curated entry (e.g. hip_102485 - Psi Cap)
  const otherStar=await page.evaluate(()=>{
    const s=window.capLayout.stars.find(st=>st.id==='hip_102485');
    return {x:s.x,y:s.y,hip:s.hip,name:s.name,bayer:s.bayer,mag:s.mag};
  });
  if(otherStar){
    await page.mouse.move(otherStar.x,otherStar.y);
    await page.waitForFunction(()=>document.querySelector('.auth-sky-inspector.active'));
    assert.equal(await inspector.isVisible(),true,'Inspector appears for non-curated star');
    const desc=await page.evaluate(()=>document.querySelector('.auth-sky-inspector-desc')?.textContent);
    assert.ok(desc.includes('Capricornus'),'Fallback description contains constellation name');
    await page.mouse.move(10,10);
    await page.waitForFunction(()=>!document.querySelector('.auth-sky-inspector.active'));
  }

  // Test mobile viewport tap
  const mobilePage=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
  await mobilePage.route('**/preview.js*',async route=>{
    const response=await route.fetch(),body=await response.text();
    const anchor='let current=frozen?.constellation||next(),previous=null';
    await route.fulfill({response,body:body
      .replace(anchor,"let current=frozen?.constellation||catalogue.find(c=>c.abbr==='Cap'),previous=null")
      .replace('return result.layout;','window.capLayout=result.layout;return result.layout;')});
  });
  await mobilePage.goto(preview.url);
  await mobilePage.waitForFunction(()=>window.capLayout&&document.getElementById('authSky').dataset.skyPhase==='hold');

  const mobileStar=await mobilePage.evaluate(()=>{
    const s=window.capLayout.stars.find(st=>st.id==='deneb_algedi');
    return {x:s.x,y:s.y};
  });
  await mobilePage.touchscreen.tap(mobileStar.x,mobileStar.y);
  await mobilePage.waitForFunction(()=>document.querySelector('.auth-sky-inspector.active'));
  assert.equal(await mobilePage.locator('.auth-sky-inspector').isVisible(),true,'Mobile tap opens inspector card');

  await mobilePage.touchscreen.tap(10,10);
  await mobilePage.waitForFunction(()=>!document.querySelector('.auth-sky-inspector.active'));
  assert.equal(await mobilePage.locator('.auth-sky-inspector').isVisible(),false,'Mobile tap outside dismisses inspector card');
  await mobilePage.close();

  console.log('Star inspector interactive test passed: desktop hover/pinning, fallback passport, and mobile tap verified.');
  await page.close();
}finally{
  await browser?.close();
  await preview.close();
}
