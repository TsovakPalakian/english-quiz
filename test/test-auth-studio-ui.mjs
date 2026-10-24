import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
const preview=await previewAuthStudio();let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const page=await browser.newPage({viewport}),errors=[],requests=[];
    await page.clock.install();
    await page.addInitScript(()=>{
      const prototype=CanvasRenderingContext2D.prototype;
      for(const method of ['clearRect','beginPath','moveTo','lineTo','stroke','clip']){
        const original=prototype[method];
        prototype[method]=function(...args){
          if(this.canvas.id==='authSky'){
            if(method==='clearRect'&&args[0]===0&&args[1]===0&&args[2]>=innerWidth&&args[3]>=innerHeight)window.skyDrawing={edges:[],clips:0};
            if(method==='beginPath')this.skyPath=[];
            if(method==='moveTo'||method==='lineTo')(this.skyPath||=[]).push({x:args[0],y:args[1]});
            if(method==='stroke'&&Math.abs(this.lineWidth-.8)<1e-6)window.skyDrawing?.edges.push([...(this.skyPath||[])]);
            if(method==='clip'&&window.skyDrawing)window.skyDrawing.clips++;
          }
          return original.apply(this,args);
        };
      }
    });
    await page.route('**/preview.js*',async route=>{
      const response=await route.fetch(),body=await response.text();
      assert.ok(body.includes('let current=frozen?.constellation||next(),previous=null'));
      await route.fulfill({response,body:body.replace('let current=frozen?.constellation||next(),previous=null',"let current=frozen?.constellation||(()=>{const c=catalogue.find(c=>c.abbr==='Cru');recent=[...recent.filter(abbr=>abbr!==c.abbr),c.abbr];return c;})(),previous=null")});
    });
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/auth/password/**',route=>{requests.push({path:new URL(route.request().url()).pathname,body:route.request().postDataJSON()});return route.fulfill({json:{ok:true}});});
    let releaseAccount;const accountGate=new Promise(resolve=>{releaseAccount=resolve;});
    const initialAccount=async route=>{await accountGate;await route.fulfill({json:{user:null}});};
    await page.route('**/api/me',initialAccount);
    await page.goto(preview.url,{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(14, 26, 38)','The previous theme never flashes while authentication is pending');
    assert.equal(await page.locator('body').evaluate(node=>getComputedStyle(node).backgroundImage),'none');
    releaseAccount();await page.waitForSelector('body.guest-home');await page.unroute('**/api/me',initialAccount);
    await page.clock.runFor(16500);
    const delay=Number(await page.locator('#authSky').getAttribute('data-sky-flyby-delay'));assert.ok(delay>=14000&&delay<=60000,'Homepage flybys are 2–5 times less frequent');
    assert.equal(await page.locator('#authSkyTuning').count(),0,'Temporary controls were removed');
    assert.equal(await page.locator('.auth-sky-caption:visible').evaluate(n=>getComputedStyle(n).fontSize),'18px');
    const referenceNames=await page.locator('.auth-sky-landmark:not(.auth-sky-primary):visible').allTextContents();
    assert.ok(referenceNames.every(name=>['Rigil Kentaurus','Hadar'].includes(name)),'Only external Crux pointers are labelled when in the viewport');
    assert.equal(await page.locator('.auth-sky-caption:visible .auth-sky-name').textContent(),'Crux','Constellation captions are restored');
    assert.equal(await page.locator('.auth-sky-scale').count(),0,'Scale text was removed');
    assert.equal(await page.locator('.auth-sky-caption:visible').getAttribute('title'),'Crux','Tooltip contains only the constellation name');
    if(viewport.width===1440){
      assert.equal(await page.locator('#authSky').getAttribute('data-sky-phase'),'hold');
      const firstConstellation=await page.locator('#authSky').getAttribute('data-sky-constellation');assert.ok(firstConstellation);
      assert.equal(await page.locator('.auth-sky-caption:visible').count(),1);
      assert.equal(await page.locator('#authSky').getAttribute('data-sky-projection'),'gnomonic-j2000');
      for(const label of await page.locator('.auth-sky-landmark:not(.auth-sky-primary):visible').all())assert.match(await label.textContent(),/^(Polaris|Acrux|Gacrux|Mimosa|Delta Crucis|Rigil Kentaurus|Hadar)$/);
      assert.equal(await page.locator('.auth-sky-primary:visible').textContent(),'Acrux');
      const link=page.locator('.auth-sky-caption:visible'),url=await link.getAttribute('href');
      await page.context().route('https://simbad.cds.unistra.fr/**',route=>route.fulfill({contentType:'text/html',body:'<title>Star reference fixture</title>'}));
      await page.context().route('https://www.go-astronomy.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Constellation reference fixture</title>'}));
      const [popup]=await Promise.all([page.waitForEvent('popup'),link.click()]);await popup.waitForLoadState();assert.equal(popup.url(),url);await popup.close();
      await page.clock.runFor(8100);assert.equal(await page.locator('#authSky').getAttribute('data-sky-phase'),'morph');
      assert.notEqual(await page.locator('#authSky').getAttribute('data-sky-constellation'),firstConstellation);
      await page.clock.runFor(18100);assert.equal(await page.locator('#authSky').getAttribute('data-sky-phase'),'hold');
    }
    assert.equal(await page.locator('#loginForm').isVisible(),false);
    await page.emulateMedia({reducedMotion:'reduce'});
    const alphaSum=()=>page.locator('#authSky').evaluate(canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let sum=0;for(let i=3;i<pixels.length;i+=4)sum+=pixels[i];return sum;});
    assert.equal(await page.locator('#authSky').getAttribute('data-sky-background-brightness'),'20');
    assert.equal(await page.locator('#authSky').getAttribute('data-sky-constellation-brightness'),'100');
    assert.equal(await page.locator('#authSky').getAttribute('data-sky-scale'),'2');
    {
      const shown=await page.locator('.auth-sky-caption:visible').count();
      assert.equal(shown,1,'Title stays in safe free space');
      const drawing=await page.evaluate(()=>({trace:window.skyDrawing,expected:STUDIO_SKY_CATALOGUE.find(c=>c.abbr===document.getElementById('authSky').dataset.skyConstellation).connections.length}));
      assert.equal(drawing.trace.edges.length,drawing.expected,'Every catalogue edge of a visible figure is drawn');
      assert.ok(drawing.trace.edges.every(edge=>edge.length===2&&edge.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))),'Every edge retains both finite endpoint coordinates');
      const collisions=await page.evaluate(()=>{
        const regions=[...document.querySelectorAll('#home .studio-brand,#homeAuth,#authSkyTuning,.site-copyright')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect());
        return window.skyDrawing.edges.some(([a,b])=>regions.some(r=>{
          let lo=0,hi=1;
          for(const [p,d,min,max] of [[a.x,b.x-a.x,r.left,r.right],[a.y,b.y-a.y,r.top,r.bottom]]){
            if(Math.abs(d)<1e-12){if(p<min||p>max)return false;continue;}
            lo=Math.max(lo,Math.min((min-p)/d,(max-p)/d));hi=Math.min(hi,Math.max((min-p)/d,(max-p)/d));if(lo>hi)return false;
          }return true;
        }));
      });assert.equal(collisions,false,'Complete line geometry is outside the UI, not merely hidden by clipping');
    }
    assert.equal(await page.locator('#homeAuth .btn').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)');
    assert.ok(await page.locator('.phone,.wrap,#home,#home .studio-brand,#home .brand-copy').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(n).backgroundImage==='none')),'Every branding container is transparent');
    const brandWhitespaceHasStars=()=>page.evaluate(()=>{
      const canvas=document.getElementById('authSky'),ctx=canvas.getContext('2d'),ratio=canvas.width/innerWidth;
      const r=document.querySelector('#home .brand-copy').getBoundingClientRect();
      const data=ctx.getImageData(Math.ceil(r.left*ratio),Math.ceil(r.top*ratio),Math.floor(r.width*ratio),Math.floor(r.height*ratio)).data;
      return data.some((v,i)=>i%4===3&&v>0);
    });
    let starsByText=await brandWhitespaceHasStars();
    for(let i=0;i<4&&!starsByText;i++){
      await page.evaluate(()=>document.body.dispatchEvent(new WheelEvent('wheel',{deltaY:73,bubbles:true,cancelable:true})));
      starsByText=await brandWhitespaceHasStars();
    }
    assert.ok(starsByText,'Only the circular emblem is cleared; empty space around branding text still has background stars');
    const skyHash=()=>page.locator('#authSky').evaluate(canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let hash=0;for(let i=3;i<data.length;i+=4)hash+=data[i]*(i%65521);return hash;});
    const fixedBefore=await page.locator('#home .studio-brand').boundingBox(),skyBeforePan=await skyHash();
    await page.evaluate(()=>document.body.dispatchEvent(new WheelEvent('wheel',{deltaY:137,bubbles:true,cancelable:true})));
    assert.deepEqual(await page.locator('#home .studio-brand').boundingBox(),fixedBefore,'Infinite sky scrolling never moves the logo');
    assert.notEqual(await skyHash(),skyBeforePan,'Infinite scrolling moves background stars');
    await page.getByRole('button',{name:'Enter the Learning Studio',exact:true}).click();
    await page.waitForSelector('body.guest-auth');await page.locator('[data-microsoft-auth]').waitFor({state:'visible'});
    const loginWidth=await page.locator('#loginForm').evaluate(n=>n.getBoundingClientRect().width);
    assert.equal(await page.locator('.auth-brand').evaluate(n=>n.tagName),'DIV');
    assert.ok(await page.locator('#account').evaluate(n=>{const r=n.getBoundingClientRect();return Math.abs((r.left+r.right)/2-innerWidth/2)<1;}),'Login is horizontally centred');
    assert.match(await page.locator('[data-studio-back]').textContent(),/Back to home/);
    await page.clock.runFor(16500);
    assert.equal(await page.locator('#authSky').getAttribute('data-sky-projection'),'gnomonic-j2000');
    assert.equal(await page.locator('.auth-providers .auth-google:visible').count(),5);
    assert.ok(await page.locator('#authLogin').evaluate(node=>parseFloat(getComputedStyle(node).paddingLeft)>=40),'Input text clears its icon');
    await page.locator('#authPassword').fill('example-password');await page.locator('[data-auth-password]').click();
    assert.equal(await page.locator('#authPassword').getAttribute('type'),'text');
    await page.locator('[data-auth-password]').click();assert.equal(await page.locator('#authPassword').getAttribute('type'),'password');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.ok(await alphaSum()>0,'Sky is not blank');
    const widgetsClear=await page.evaluate(()=>{
      const canvas=document.getElementById('authSky'),ctx=canvas.getContext('2d'),ratio=canvas.width/innerWidth;
      return [...document.querySelectorAll('#account .auth-brand .brand-mark')].filter(n=>n.getClientRects().length).every(n=>{
        const r=n.getBoundingClientRect(),x=Math.max(0,Math.ceil(r.left*ratio)),y=Math.max(0,Math.ceil(r.top*ratio));
        const right=Math.min(canvas.width,Math.floor(r.right*ratio)),bottom=Math.min(canvas.height,Math.floor(r.bottom*ratio));
        if(right<=x||bottom<=y)return true;
        const data=ctx.getImageData(x,y,right-x,bottom-y).data;
        return !data.some((value,i)=>i%4===3&&value>0);
      });
    });assert.ok(widgetsClear,'The circular emblem contains no star or line pixels');
    const labelsClear=await page.locator('.auth-sky-landmark:visible,.auth-sky-caption:visible').evaluateAll(nodes=>{
      const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
      const ui=[...document.querySelectorAll('.auth-brand,#accountBody,.site-copyright,#authSkyTuning')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect());
      const labels=nodes.map(n=>n.getBoundingClientRect());
      return labels.every((a,i)=>!ui.some(b=>overlap(a,b))&&!labels.slice(i+1).some(b=>overlap(a,b)));
    });assert.ok(labelsClear,'Labels avoid each other and all actual interface elements');
    await page.locator('[data-login-mode="otp"]').last().click();assert.equal(await page.locator('#otpLoginForm').isVisible(),true);
    await page.locator('.auth-mode-switch [data-login-mode="password"]').click();assert.equal(await page.locator('#loginForm').isVisible(),true);
    await page.locator('[data-password-recovery]').click();
    assert.equal(await page.locator('#passwordRecoveryForm').evaluate(n=>n.getBoundingClientRect().width),loginWidth,'Recovery and login have identical widths');
    assert.ok(await page.locator('#passwordRecoveryForm').evaluate(n=>{const r=n.getBoundingClientRect();return Math.abs((r.left+r.right)/2-innerWidth/2)<1;}),'Recovery is horizontally centred');
    assert.match(await page.locator('[data-studio-back]').textContent(),/Back to log in/);
    assert.match(await page.locator('[data-recovery-send]').getAttribute('class'),/auth-code-send/);
    await page.locator('#recoveryEmail').fill('user@example.com');
    await page.locator('[data-recovery-send]').click();await page.locator('#recoveryCode').waitFor({state:'visible'});
    await page.locator('#recoveryCode').fill('123456');await page.locator('#recoveryPassword').fill('new-password');
    await page.getByRole('button',{name:'Save new password'}).click();await page.locator('#loginForm').waitFor({state:'visible'});
    assert.match(await page.locator('#loginForm [data-form-status]').textContent(),/Password updated/);
    assert.equal(requests.length,2);assert.equal(requests[1].body.password,'new-password');
    await page.locator('.auth-create button').click();await page.locator('#registerForm').waitFor({state:'visible'});
    assert.equal(await page.locator('#registerForm').evaluate(n=>n.getBoundingClientRect().width),loginWidth,'Registration and login have identical widths');
    await page.locator('[data-google-auth]').waitFor({state:'visible'});
    assert.equal(await page.locator('#registerForm [name="role"]').count(),0);
    assert.equal(await page.locator('#accountBody .auth-tabs').count(),0);
    assert.equal(await page.locator('#registerForm [name="name"]').getAttribute('required'),'');
    await page.locator('#registerForm [name="name"]').fill('   ');
    assert.equal(await page.locator('#registerForm [name="name"]').evaluate(n=>n.checkValidity()),false);
    assert.match(await page.locator('[data-studio-back]').textContent(),/Back to log in/);
    await page.locator('[data-studio-back]').click();await page.locator('#loginForm').waitFor({state:'visible'});
    for(const [provider,global] of [['microsoft','MicrosoftSignIn'],['telegram','TelegramSignIn']]){
      await page.evaluate(({provider,global})=>{sessionStorage.setItem('enquiz-'+provider+'-verify','1');window[global].paint(document.getElementById('accountBody'));},{provider,global});
      await page.locator('[data-'+provider+'-cancel].studio-back').waitFor({state:'visible'});
      assert.equal(await page.locator('#accountBody .studio-back').count(),1,'Federated verification has one functional back control');
      await page.locator('[data-'+provider+'-cancel]').click();await page.locator('#loginForm').waitFor({state:'visible'});
      assert.equal(await page.evaluate(provider=>sessionStorage.getItem('enquiz-'+provider+'-verify'),provider),null);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(()=>{localStorage.setItem('lumiscia-sky-scale-Cru','0');localStorage.setItem('lumiscia-sky-brightness-background-v4','0');});
    await page.reload();await page.waitForSelector('body.guest-home');
    assert.equal(await page.locator('#authSky').getAttribute('data-sky-background-brightness'),'20','Old slider values cannot override fixed settings');
    assert.equal(await page.locator('#authSky').getAttribute('data-sky-scale'),'2');
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Auth studio: desktop/mobile, centred controls, complete connections, safe labels and authentication passed.');
}finally{await browser?.close();await preview.close();}
