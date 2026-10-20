import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><body></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const accountSource=readFileSync('client/05-account.js','utf8');
const paint=accountSource.slice(accountSource.indexOf('    function paintAccountForm('),accountSource.indexOf('    function paintProfile('));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const enabled of [false,true]){
    const page=await browser.newPage();let providerCalls=0,pending=true;
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;let value={};
      if(path==='/api/auth/providers'){providerCalls++;value={microsoft:enabled};}
      if(path==='/api/auth/microsoft/profile')value={email:'student@example.invalid',name:'Student'};
      if(path==='/api/auth/microsoft/verify'){
        assert.deepEqual(route.request().postDataJSON(),{email:'student@example.invalid',code:'123456'});
        value=pending?{status:'pending'}:{user:{id:'fixture-student'}};
      }
      await route.fulfill({json:value});
    });
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.setContent('<section id="account" class="on"><div id="accountBody"></div></section>');
    await page.addStyleTag({content:readFileSync('site/preview.css','utf8')});
    await page.addScriptTag({content:readFileSync('production/chat-icons.js','utf8')});
    await page.addScriptTag({content:`let authUser=null,inviteDetails=null;const esc=value=>{const n=document.createElement('span');n.textContent=value;return n.innerHTML;};window.LumisciaPasskeys={supported:()=>true};function enterAccount(user){window.entered=user;}${paint}`});
    await page.addScriptTag({content:readFileSync('client/07-microsoft.js','utf8')});
    for(const register of [false,true]){
      await page.evaluate(register=>paintAccountForm(register),register);
      await page.evaluate(()=>MicrosoftSignIn.decorate(document.getElementById('accountBody')));
      assert.equal(await page.locator('[data-microsoft-auth]').isVisible(),enabled&&!register);
      if(register){
        assert.equal(await page.locator('[data-google-auth],[data-microsoft-auth],[data-telegram-auth],[data-passkey-login],.auth-divider').count(),0,'Registration has no sign-in providers or divider');
      }
      if(enabled&&!register)for(const width of [390,1000]){
        await page.setViewportSize({width,height:1000});
        const ms=await page.locator('[data-microsoft-auth]').boundingBox(),google=await page.locator('[data-google-auth]').boundingBox();
        assert.ok(Math.abs(ms.y-google.y-google.height-8)<=1,'Microsoft follows Google with an 8px gap');
        assert.ok(ms.x>=0&&ms.x+ms.width<=width,'Microsoft fits the viewport');
      }
    }
    assert.equal(providerCalls,1,'Provider configuration is fetched only once');
    if(enabled){
      await page.setViewportSize({width:390,height:1000});await page.evaluate(()=>paintAccountForm(false));
      await page.screenshot({path:'/private/tmp/lumiscia-microsoft-login-390.png'});
      for(const wait of [true,false]){
        pending=wait;
        await page.evaluate(()=>{sessionStorage.setItem('enquiz-microsoft-verify','1');paintAccountForm(false);});
        await page.waitForFunction(()=>document.getElementById('microsoftEmail').value==='student@example.invalid');
        assert.equal(await page.locator('#microsoftCode').isVisible(),false);
        const emailBox=await page.locator('#microsoftEmail').boundingBox(),sendBox=await page.locator('[data-microsoft-send]').boundingBox();
        assert.ok(Math.abs(sendBox.y-emailBox.y-emailBox.height-8)<=1,'Send code has an 8px gap after email');
        await page.locator('[data-microsoft-send]').click();
        await page.locator('#microsoftCode').waitFor({state:'visible'});
        const codeBox=await page.locator('#microsoftCode').boundingBox(),buttonBox=await page.locator('[data-microsoft-send]').boundingBox();
        assert.ok(codeBox.y-buttonBox.y-buttonBox.height>=8,'Code field does not touch Send code');
        assert.ok(codeBox.x>=0&&codeBox.x+codeBox.width<=390,'Code field fits the mobile viewport');
        await page.locator('#microsoftCode').fill('123456');
        await page.locator('[data-microsoft-confirm] [type=submit]').click();
        if(wait)await page.locator('#loginForm').waitFor();else await page.waitForFunction(()=>window.entered?.id==='fixture-student');
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('enquiz-microsoft-verify')),null);
      }
    }
    await page.close();
  }
  console.log('Microsoft UI: configuration gating, login branding, registration without provider buttons, code spacing, mobile/desktop spacing, email confirmation and pending/active outcomes passed');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
