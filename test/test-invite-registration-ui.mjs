import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";
await scenarioSubtests("invite-registration-ui",async function*(){
yield "00. Browser and fixture setup";

const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
const preview=await previewAuthStudio();let browser;
try{
  browser=await launchChromium(chromium);
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
    yield "01. evaluate" + " [" + String(kind) + "]";
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('enquiz-invite')),'fixture-'+kind);
    assert.equal(await page.locator('[data-invite-email-send]').count(),1);
    await page.reload();await page.locator('#registerForm').waitFor({state:'visible'});
    yield "02. #registerForm [name=\"role\"] / checks" + " [" + String(kind) + "]";
    assert.equal(await page.locator('#registerForm [name="role"]').count(),0);
    assert.equal(await page.locator('[data-passkey-login]').count(),0);
    for(const provider of ['google','microsoft','telegram']){
      await page.locator('[data-'+provider+'-auth]').waitFor({state:'visible'});
      await page.route('**/api/auth/'+provider+'?*',route=>route.fulfill({contentType:'text/html',body:'Provider fixture'}));
      await page.locator('[data-'+provider+'-auth]').click();
      await page.waitForURL(url=>url.pathname==='/api/auth/'+provider);
      assert.equal(new URL(page.url()).searchParams.get('invite'),'fixture-'+kind);
      yield "03. goto" + " [" + String(kind) + "]" + " [" + String(provider) + "]";
      await page.goto(preview.url);await page.locator('#registerForm').waitFor({state:'visible'});
    }
    if(kind==='student'){
      let registerCalls=0;
      await page.route('**/api/auth/otp/request',route=>route.fulfill({json:{email:'student@example.invalid'}}));
      await page.route('**/api/register',async route=>{
        registerCalls++;
        const body=route.request().postDataJSON();
        assert.equal(body.invite,'fixture-student');assert.equal(body.name,'Student');
        assert.equal(body.emailCode,'123456');
        assert.equal('role' in body,false);
        await new Promise(r=>setTimeout(r,150));
        return route.fulfill({json:{status:'pending'}});
      });
      await page.locator('#registerForm [name="login"]').fill('fixture_student');
      await page.locator('#registerForm [name="email"]').fill('student@example.invalid');
      await page.locator('#registerForm [name="name"]').fill('Student');
      yield "04. #registerForm [name=\"password\"] / fill" + " [" + String(kind) + "]";
      await page.locator('#registerForm [name="password"]').fill('fixture-password');
      await page.locator('[data-invite-email-send]').click();
      await page.locator('#registerForm [name="emailCode"]').waitFor({state:'visible'});
      const otpStatus=page.locator('#registerForm [data-form-status]');
      assert.match(await otpStatus.textContent(),/Valid for 1 hour/);
      assert.match(await otpStatus.textContent(),/1 request per 12 hours/);
      await page.locator('#registerForm [name="emailCode"]').fill('123456');
      const submitBtn=page.locator('#registerForm [type="submit"]');
      await submitBtn.click();
      assert.equal(await submitBtn.evaluate(el=>el.disabled),true,'Submit button is disabled while registration request is in flight');
      await submitBtn.click({force:true});
      await page.locator('#loginForm').waitFor({state:'visible'});
      assert.equal(registerCalls,1,'Concurrent/duplicate submission is blocked while request is in flight');
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('enquiz-invite')),null);
      const studentStatus=await page.locator('#loginForm [data-form-status]').textContent();
      assert.equal(studentStatus,'Waiting for approval by the inviting teacher.\nYour group invitation has been accepted');
      assert.equal(studentStatus.includes('developer'),false);
      assert.equal(await page.locator('#loginForm [data-form-status]').evaluate(el=>getComputedStyle(el).textAlign),'center');
    }
    if(kind==='teacher'){
      assert.equal(await page.locator('#accountBody').evaluate(node=>getComputedStyle(node).scrollbarWidth),'none');
      await page.locator('[data-registration-providers] [data-login-mode="otp"]').click();
      await page.locator('#otpLoginForm').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('enquiz-invite')),'fixture-teacher');
      yield "05. route" + " [" + String(kind) + "]";
      await page.route('**/api/auth/otp/request',route=>route.fulfill({json:{email:'teacher@example.invalid'}}));
      await page.route('**/api/auth/otp/verify',route=>{
        assert.deepEqual(route.request().postDataJSON(),{email:'teacher@example.invalid',name:'Invited Teacher',code:'123456',invite:'fixture-teacher'});
        return route.fulfill({json:{status:'pending'}});
      });
      await page.locator('#otpLoginForm [name="email"]').fill('teacher@example.invalid');
      await page.locator('#otpLoginForm [name="name"]').fill('Invited Teacher');
      yield "06. [data-otp-send] / click" + " [" + String(kind) + "]";
      await page.locator('[data-otp-send]').click();
      await page.locator('#otpLoginForm [name="code"]').fill('123456');
      await page.locator('#otpLoginForm [type="submit"]').click();
      const teacherStatusLoc=page.locator('#loginForm [data-form-status]');
      await teacherStatusLoc.filter({hasText:'Waiting for approval'}).waitFor();
      const teacherStatus=await teacherStatusLoc.textContent();
      assert.equal(teacherStatus,'Your email is verified and your teacher invitation has been accepted.\nWaiting for approval by the inviting teacher');
      assert.equal(teacherStatus.includes('developer'),false);
      assert.equal(await teacherStatusLoc.evaluate(el=>getComputedStyle(el).textAlign),'center');
      yield "07. #registerForm / checks" + " [" + String(kind) + "]";
      assert.equal(await page.locator('#registerForm').count(),0);
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('enquiz-invite')),null);
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  for(const configuration of [{google:false,microsoft:false,telegram:false},{google:true,microsoft:false,telegram:true},null]){
    const page=await browser.newPage();
    await page.route('**/api/auth/providers',route=>route.fulfill(configuration===null?{status:503,json:{error:'Unavailable'}}:{json:configuration}));
    await page.goto(preview.url);await page.waitForSelector('body.guest-home');
    yield "08. #homeAuth [data-account=\"show-login\"] / click" + " [" + String(configuration) + "]";
    await page.locator('#homeAuth [data-account="show-login"]').click();
    await page.locator('.auth-create button').click();await page.locator('#registerForm').waitFor({state:'visible'});
    await page.evaluate(()=>MicrosoftSignIn.decorate(document.getElementById('accountBody')));
    for(const provider of ['google','microsoft','telegram'])assert.equal(await page.locator('[data-'+provider+'-auth]').isVisible(),configuration?.[provider]===true);
    yield "09. [data-registration-providers] / checks" + " [" + String(configuration) + "]";
    assert.equal(await page.locator('[data-registration-providers]').isVisible(),Object.values(configuration||{}).some(Boolean));
    await page.close();
  }
  const invalid=await browser.newPage();
  await invalid.route('**/api/accounts/invites?*',route=>route.fulfill({status:410,json:{error:'Invitation expired.'}}));
  await invalid.goto(preview.url+'/?invite=expired');
  yield "10. waitForFunction";
  await invalid.waitForFunction(()=>document.querySelector('[data-invite-loading]')?.textContent==='Invitation expired.');
  assert.equal(await invalid.locator('#registerForm').count(),0);
  await invalid.close();
  const callback=await browser.newPage();
  yield "11. checks";
  await callback.addInitScript(()=>{
    sessionStorage.setItem('enquiz-invite','accepted-invite');
    sessionStorage.setItem('enquiz-auth-form','register');
  });
  await callback.goto(preview.url+'/?auth=pending');
  await callback.locator('#loginForm').waitFor({state:'visible'});
  assert.equal(await callback.evaluate(()=>sessionStorage.getItem('enquiz-invite')),null);
  yield "12. #accountBody / checks";
  assert.match(await callback.locator('#accountBody').textContent(),/Waiting for teacher approval/);
  const flashText=await callback.locator('.account-gate .auth-flash').textContent();
  assert.equal(flashText,'Account saved.\nWaiting for teacher approval before you can sign in');
  assert.equal(await callback.locator('.account-gate .auth-flash').evaluate(el=>getComputedStyle(el).textAlign),'center');
  await callback.close();

  const banPage=await browser.newPage();
  await banPage.route('**/api/me',route=>route.fulfill({json:{user:null}}));
  await banPage.route('**/api/accounts/invites?*',route=>route.fulfill({json:{kind:'student',groupTitle:'Fixture Group'}}));
  await banPage.route('**/api/auth/otp/request',route=>route.fulfill({status:429,json:{error:'Suspended for 48 hours after 3 failed attempts. Try again later.'}}));
  await banPage.goto(preview.url+'/?invite=fixture-ban-test');
  await banPage.locator('#registerForm').waitFor({state:'visible'});
  yield "13. ban notice checks";
  assert.equal(await banPage.locator('.hint.notice-group').count(),1);
  assert.match(await banPage.locator('.hint.notice-group').textContent(),/Fixture Group/);
  await banPage.locator('#registerForm [name="email"]').fill('student@example.invalid');
  await banPage.locator('[data-invite-email-send]').click();
  const banNotice=banPage.locator('#registerForm [data-form-status].ban');
  await banNotice.waitFor({state:'visible'});
  assert.match(await banNotice.textContent(),/48 hours/);
  assert.equal(await banPage.locator('#learning-main-banner[open]').count(),0,'System dialog is suppressed by quietBug');
  yield "14. ban styling visual checks";
  const banBg=await banNotice.evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.ok(banBg.includes('rgba(255, 154, 171')||banBg.includes('rgb('),'Ban banner uses bad tinted background');
  await banPage.close();
  console.log('Invite registration UI: direct entry, reload, provider redirects, token submission, configuration gating and expired invitations passed (no screenshots).');
}finally{await browser?.close();await preview.close();}

});
