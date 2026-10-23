import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const preview=await previewAuthStudio();let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const page=await browser.newPage({viewport}),errors=[],requests=[];
    if(viewport.width===1440)await page.clock.install();
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/auth/password/**',route=>{requests.push({path:new URL(route.request().url()).pathname,body:route.request().postDataJSON()});return route.fulfill({json:{ok:true}});});
    await page.goto(preview.url);await page.waitForSelector('body.guest-home');
    if(viewport.width===1440){
      const pole=await page.locator('#authSky').getAttribute('data-polaris-x');
      await page.clock.runFor(15500);
      assert.equal(await page.locator('#authSky').getAttribute('data-sky-phase'),'hold');
      assert.equal(await page.locator('#authSky').getAttribute('data-sky-constellation'),'Orion');
      await page.clock.runFor(8100);assert.equal(await page.locator('#authSky').getAttribute('data-sky-phase'),'morph');
      assert.equal(await page.locator('#authSky').getAttribute('data-sky-constellation'),'Cassiopeia');
      await page.clock.runFor(18100);assert.equal(await page.locator('#authSky').getAttribute('data-sky-phase'),'hold');
      assert.equal(await page.locator('#authSky').getAttribute('data-polaris-x'),pole,'Polaris stays fixed while constellations change');
    }
    assert.equal(await page.locator('#loginForm').isVisible(),false);
    await page.screenshot({path:'/private/tmp/lumiscia-studio-home-'+viewport.width+'.png',fullPage:true});
    const homePole=await page.locator('#authSky').getAttribute('data-polaris-x');
    assert.equal(await page.locator('#homeAuth .btn').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)');
    await page.getByRole('button',{name:'Enter the Learning Studio',exact:true}).click();
    await page.waitForSelector('body.guest-auth');await page.locator('[data-microsoft-auth]').waitFor({state:'visible'});
    await page.waitForFunction(()=>!!document.getElementById('authSky').dataset.polarisX);
    assert.notEqual(await page.locator('#authSky').getAttribute('data-polaris-x'),homePole,'Opening another screen gives Polaris a new fixed location');
    assert.equal(await page.locator('.auth-providers .auth-google:visible').count(),5);
    assert.ok(await page.locator('#authLogin').evaluate(node=>parseFloat(getComputedStyle(node).paddingLeft)>=40),'Input text clears its icon');
    await page.locator('#authPassword').fill('example-password');await page.locator('[data-auth-password]').click();
    assert.equal(await page.locator('#authPassword').getAttribute('type'),'text');
    await page.locator('[data-auth-password]').click();assert.equal(await page.locator('#authPassword').getAttribute('type'),'password');
    await page.screenshot({path:'/private/tmp/lumiscia-studio-login-'+viewport.width+'.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const pixels=await page.evaluate(()=>{
      const canvas=document.getElementById('authSky'),ctx=canvas.getContext('2d'),r=document.getElementById('accountBody').getBoundingClientRect(),box={left:r.left+32,top:r.top+32,width:r.width-64,height:r.height-64},ratio=canvas.width/innerWidth;
      const data=ctx.getImageData(Math.max(0,Math.ceil(box.left*ratio)),Math.max(0,Math.ceil(box.top*ratio)),Math.floor(box.width*ratio),Math.min(Math.floor(box.height*ratio),canvas.height-Math.ceil(box.top*ratio))).data;
      return {covered:[...data].some((v,i)=>i%4===3&&v>0),sky:ctx.getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>0)};
    });assert.equal(pixels.covered,false,'No stars behind the form');assert.equal(pixels.sky,true,'Sky is not blank');
    await page.locator('[data-login-mode="otp"]').last().click();assert.equal(await page.locator('#otpLoginForm').isVisible(),true);
    await page.locator('.auth-mode-switch [data-login-mode="password"]').click();assert.equal(await page.locator('#loginForm').isVisible(),true);
    await page.locator('[data-password-recovery]').click();await page.locator('#recoveryEmail').fill('user@example.com');
    await page.locator('[data-recovery-send]').click();await page.locator('#recoveryCode').waitFor({state:'visible'});
    await page.locator('#recoveryCode').fill('123456');await page.locator('#recoveryPassword').fill('new-password');
    await page.getByRole('button',{name:'Save new password'}).click();await page.locator('#loginForm').waitFor({state:'visible'});
    assert.match(await page.locator('#loginForm [data-form-status]').textContent(),/Password updated/);
    assert.equal(requests.length,2);assert.equal(requests[1].body.password,'new-password');
    await page.locator('.auth-create button').click();await page.locator('#registerForm').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-google-auth]').isVisible(),true);
    await page.screenshot({path:'/private/tmp/lumiscia-studio-register-'+viewport.width+'.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Auth studio: desktop/mobile, providers, password toggle, OTP, recovery, registration and sky exclusion passed.');
}finally{await browser?.close();await preview.close();}
