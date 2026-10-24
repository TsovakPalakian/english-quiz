import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
const preview=await previewAuthStudio();let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
  for(const kind of ['student','teacher']){
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    if(kind==='teacher')await page.route('**/api/me',async route=>{
      await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill({json:{user:null}});
    });
    await page.route('**/api/accounts/invites?*',async route=>{
      assert.equal(new URL(route.request().url()).searchParams.get('token'),'fixture-'+kind);
      await new Promise(resolve=>setTimeout(resolve,150));
      await route.fulfill({json:{kind,groupTitle:'Fixture group'}});
    });
    await page.goto(preview.url+'/?invite=fixture-'+kind);
    await page.locator('#registerForm').waitFor({state:'visible'});
    assert.equal(new URL(page.url()).searchParams.has('invite'),false,'Invite token is removed from the address');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('enquiz-invite')),'fixture-'+kind);
    assert.equal(await page.locator('[data-invite-email-send]').count(),kind==='teacher'?1:0);
    await page.reload();await page.locator('#registerForm').waitFor({state:'visible'});
    assert.equal(await page.locator('#registerForm [name="role"]').count(),0);
    assert.equal(await page.locator('[data-passkey-login]').count(),0);
    for(const provider of ['google','microsoft','telegram']){
      await page.locator('[data-'+provider+'-auth]').waitFor({state:'visible'});
      await page.route('**/api/auth/'+provider+'?*',route=>route.fulfill({contentType:'text/html',body:'Provider fixture'}));
      await page.locator('[data-'+provider+'-auth]').click();
      await page.waitForURL(url=>url.pathname==='/api/auth/'+provider);
      assert.equal(new URL(page.url()).searchParams.get('invite'),'fixture-'+kind);
      await page.goto(preview.url);await page.locator('#registerForm').waitFor({state:'visible'});
    }
    if(kind==='student'){
      await page.route('**/api/register',route=>{
        const body=route.request().postDataJSON();
        assert.equal(body.invite,'fixture-student');assert.equal(body.name,'Student');
        assert.equal('role' in body,false);
        return route.fulfill({json:{status:'pending'}});
      });
      await page.locator('#registerForm [name="login"]').fill('fixture_student');
      await page.locator('#registerForm [name="email"]').fill('student@example.invalid');
      await page.locator('#registerForm [name="name"]').fill('Student');
      await page.locator('#registerForm [name="password"]').fill('fixture-password');
      await page.locator('#registerForm [type="submit"]').click();
      await page.locator('#loginForm').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('enquiz-invite')),null);
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  for(const configuration of [{google:false,microsoft:false,telegram:false},{google:true,microsoft:false,telegram:true},null]){
    const page=await browser.newPage();
    await page.route('**/api/auth/providers',route=>route.fulfill(configuration===null?{status:503,json:{error:'Unavailable'}}:{json:configuration}));
    await page.goto(preview.url);await page.waitForSelector('body.guest-home');
    await page.locator('#homeAuth [data-account="show-login"]').click();
    await page.locator('.auth-create button').click();await page.locator('#registerForm').waitFor({state:'visible'});
    await page.evaluate(()=>MicrosoftSignIn.decorate(document.getElementById('accountBody')));
    for(const provider of ['google','microsoft','telegram'])assert.equal(await page.locator('[data-'+provider+'-auth]').isVisible(),configuration?.[provider]===true);
    assert.equal(await page.locator('[data-registration-providers]').isVisible(),Object.values(configuration||{}).some(Boolean));
    await page.close();
  }
  const invalid=await browser.newPage();
  await invalid.route('**/api/accounts/invites?*',route=>route.fulfill({status:410,json:{error:'Invitation expired.'}}));
  await invalid.goto(preview.url+'/?invite=expired');
  await invalid.waitForFunction(()=>document.querySelector('[data-invite-loading]')?.textContent==='Invitation expired.');
  assert.equal(await invalid.locator('#registerForm').count(),0);
  await invalid.close();
  const callback=await browser.newPage();
  await callback.addInitScript(()=>{
    sessionStorage.setItem('enquiz-invite','accepted-invite');
    sessionStorage.setItem('enquiz-auth-form','register');
  });
  await callback.goto(preview.url+'/?auth=pending');
  await callback.locator('#loginForm').waitFor({state:'visible'});
  assert.equal(await callback.evaluate(()=>sessionStorage.getItem('enquiz-invite')),null);
  assert.match(await callback.locator('#accountBody').textContent(),/Waiting for teacher approval/);
  await callback.close();
  console.log('Invite registration UI: direct entry, reload, provider redirects, token submission, configuration gating and expired invitations passed (no screenshots).');
}finally{await browser?.close();await preview.close();}
