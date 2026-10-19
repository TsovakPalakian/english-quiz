// Local production assets and synthetic APIs only; never visits the live site.
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=resolve('rollback/production-assets');
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[];
  let user=null;
  let otpRequestFails=true;
  let releaseInitialAccount;
  const initialAccountGate = new Promise(resolve => { releaseInitialAccount = resolve; });
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/me') await initialAccountGate;
    let data={};
    if(path==='/api/auth/otp/request'){
      if(otpRequestFails){otpRequestFails=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic code delivery failure.'})});}
      data={email:'preview@example.invalid'};
    }
    if(path==='/api/database-context')data={provider:'d1',revision:3,scope:'site'};
    if(path==='/api/me'||path==='/api/me/account')data={user};
    if(path==='/api/accounts/invites')data={kind:'teacher',groupTitle:'A1 Fixture group',expiresAt:Date.now()+3*86400000};
    if(path==='/api/register'){
      const body=route.request().postDataJSON();
      assert.equal(body.role,'ADMIN');assert.equal(body.emailCode,'123456');assert.equal(body.invite,'teacher-fixture');
      data={status:'pending'};
    }
    if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:1},stageActivity:{}};
    if(path==='/api/me/themes')data={theme:'light',themes:[],revision:0,customRevision:0};
    if(path==='/api/groups')data={groups:[{id:41,title:'A1 Fixture group',studentCount:2,lessonIds:[31],examIds:[],date:'2026-10-19',revision:1}]};
    if(path==='/api/lessons')data={materials:[{id:31,title:'Fixture lesson',published:true,date:'2026-10-19',stageRevision:1,blocks:[]}]};
    if(path==='/api/exams')data={exams:[]};
    if(path==='/api/exams/work')data={work:[]};
    if(path==='/api/messages')data={rooms:[],groups:[],contacts:[],unread:{},total:0};
    if(path.includes('catalogs'))data={documents:{},cards:[],next:null};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port, {waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('.shell').isVisible(), false, 'Shell stays hidden until initial account check finishes');
  assert.equal(await page.locator('#homeDemo').isVisible(), false, 'No transient dashboard while account is loading');
  releaseInitialAccount();
  await page.waitForFunction(()=>!document.body.hasAttribute('data-shell-pending'));
  await page.waitForFunction(()=>document.querySelector('.hello')?.style.visibility!=='hidden');
  assert.deepEqual(errors,[],'Guest app must boot without uncaught exceptions');
  assert.equal(await page.locator('.side').isVisible(),false,'Guest home has no sidebar');
  assert.equal(await page.locator('#homeDemo').isVisible(),false,'Guest home has no statistics');
  assert.equal(await page.locator('#homeAuth button:visible').count(),1);
  assert.equal(await page.locator('.guest-brand').isVisible(),true);
  const logo = page.locator('.guest-brand');
  const homeBeforeMotto = await page.locator('#homeAuth').boundingBox();
  await logo.click({clickCount: 3});
  await page.waitForTimeout(750);
  assert.equal(await logo.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#brandMotto').isVisible(), true);
  assert.match(await page.locator('#brandMotto').innerText(), /Lumen ex Scientia/);
  assert.deepEqual(await page.locator('#homeAuth').boundingBox(), homeBeforeMotto, 'Easter egg must not shift the login buttons');
  await page.waitForTimeout(2450);
  assert.equal(await page.locator('#brandMotto').evaluate(node=>node.classList.contains('is-dissolving')), true);
  assert.ok(await page.locator('.brand-motto-particles').evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    if (box.x !== 0 || box.y !== 0 || box.width !== innerWidth || box.height !== innerHeight) return false;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  }), 'Letter particles render visible pixels');
  await page.screenshot({path: '/private/tmp/lumiscia-motto-particles.png'});
  await page.waitForTimeout(1500);
  assert.equal(await logo.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#brandMotto').isVisible(), false, 'Motto disperses as colored light after three seconds');
  assert.equal(await page.locator('.brand-motto-particles').count(), 0, 'Particle canvas is removed after animation');
  assert.equal(await page.locator('#home').evaluate(node=>getComputedStyle(node).userSelect),'none');
  await Promise.all([page.waitForEvent('domcontentloaded'),logo.click()]);
  await page.waitForFunction(()=>!document.body.hasAttribute('data-shell-pending'));
  assert.equal(await page.locator('#home .hello').innerText(),'Hello!');
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:960});
    const box=await page.locator('#home').boundingBox();assert.ok(Math.abs(box.x+box.width/2-width/2)<2,'Guest home centered');
    const footer=await page.locator('.site-copyright').boundingBox();assert.ok(footer.y+footer.height<=960,'Guest copyright fits viewport: '+JSON.stringify({footer,home:box}));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:'/private/tmp/lumiscia-guest-'+width+'.png'});
  }
  await page.setViewportSize({width:1440,height:960});
  await page.evaluate(()=>window.enquizVisit('account'));
  assert.equal(await page.locator('#account').evaluate(node=>getComputedStyle(node).userSelect),'none');
  assert.equal(await page.locator('#loginForm input').first().evaluate(node=>getComputedStyle(node).userSelect),'text');
  assert.equal(await page.locator('.side .brand-mark svg path').count(),2);
  assert.equal(await page.locator('.side .brand b').innerText(),'Lumiscia');
  assert.equal(await page.locator('.side .brand small').innerText(),'Learning studio');
  assert.match(await page.locator('.site-copyright').innerText(),new RegExp('© '+new Date().getFullYear()+' Lumiscia'));
  await page.locator('.side .shell-settings-open svg').waitFor({state:'attached'});
  assert.equal(await page.locator('[data-shell-settings-open]:visible').count(),0,'Guest has no Settings entry');
  assert.equal(await page.locator('[data-msg-open]:visible,[data-jump="messages"]:visible').count(),0,'Guest has no Messages entry, including account links');
  assert.equal(await page.locator('.side-search').isVisible(),false,'Guest has no sidebar search');
  assert.deepEqual(await page.locator('.side .shell-settings-open svg').evaluate(node=>{const style=getComputedStyle(node);return [parseFloat(style.width),parseFloat(style.height)];}),[18,18]);
  await page.locator('.auth-tabs [data-account="show-register"]').click();
  assert.equal(await page.locator('[data-google-auth] > svg.auth-google-icon').count(),1);
  assert.equal(await page.locator('[data-google-auth]').innerText(),'Continue with Google');
  assert.equal(await page.locator('.side').isVisible(),false,'Guest registration has no sidebar');
  assert.equal(await page.locator('#registerForm input[name="role"]').count(),2);
  await page.locator('#registerForm input[value="ADMIN"]').check();
  assert.equal(await page.evaluate(()=>new FormData(document.getElementById('registerForm')).get('role')),'ADMIN');
  await page.locator('#authPassword').fill('preview-only');
  await page.locator('[data-auth-password]').click();assert.equal(await page.locator('#authPassword').getAttribute('type'),'text');
  await page.locator('[data-auth-password]').click();assert.equal(await page.locator('#authPassword').getAttribute('type'),'password');
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>window.scrollTo(0,0));
    const registerTabs=await page.locator('.auth-tabs').boundingBox();
    await page.locator('.auth-tabs [data-account="show-login"]').click();
    const loginTabs=await page.locator('.auth-tabs').boundingBox();
    for(const key of ['x','y','width','height'])assert.ok(Math.abs(registerTabs[key]-loginTabs[key])<=1,'Auth tabs stay fixed: '+key+' at '+width);
    await page.locator('.auth-tabs [data-account="show-register"]').click();
    const buttons=await page.locator('.auth-tabs button').evaluateAll(nodes=>nodes.map(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,border:getComputedStyle(node).borderTopStyle})));
    assert.ok(buttons[1].left-buttons[0].right>=10&&buttons.every(button=>button.border==='solid'),'Auth tabs have separate borders and gap');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Auth fits '+width);
    assert.ok(await page.locator('.account-gate .card').evaluate(node=>node.getBoundingClientRect().width<=440),'Compact auth form');
    await page.screenshot({path:'/private/tmp/lumiscia-register-'+width+'.png',fullPage:true});
  }
  await page.locator('.auth-tabs [data-account="show-login"]').click();
  await page.locator('[data-login-mode="otp"].chip').click();assert.equal(await page.locator('#otpLoginForm').isVisible(),true);
  assert.equal(await page.locator('#otpCode').isVisible(),false);
  assert.equal(await page.locator('#otpLoginForm button[type="submit"]').isVisible(),false);
  await page.locator('#otpEmail').fill('preview@example.invalid');
  await page.locator('[data-otp-send]').click();await page.locator('#otpLoginForm [data-form-status]').filter({hasText:'Synthetic code delivery failure.'}).waitFor();
  assert.equal(await page.locator('#otpCode').isVisible(),false,'Failed delivery does not reveal code field');
  if(await page.locator('#learning-main-dismiss').isVisible())await page.locator('#learning-main-dismiss').click();
  await page.locator('[data-otp-send]').click();await page.locator('#otpCode').waitFor();
  assert.equal(await page.locator('#otpLoginForm button[type="submit"]').isVisible(),true);
  await page.locator('#otpEmail').fill('other@example.invalid');
  assert.equal(await page.locator('#otpCode').isVisible(),false,'Changing email resets code entry');
  await page.locator('[data-login-mode="password"].chip').click();assert.equal(await page.locator('#loginForm').isVisible(),true);
  assert.equal(await page.locator('[data-google-auth] > svg.auth-google-icon').count(),1);
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'/private/tmp/lumiscia-login-1440.png',fullPage:true});
  const screenshots='/private/tmp/english-quiz-saas';mkdirSync(screenshots,{recursive:true});
  const originalStyle=await page.locator('html').getAttribute('style');
  await page.evaluate(()=>{
    document.documentElement.dataset.theme='user';
    for(const [name,value] of Object.entries({'--bg':'#eee9ef','--card':'#f9f4fa','--acc':'#9b2360','--mute':'#6d5467'}))document.documentElement.style.setProperty(name,value);
  });
  assert.equal(await page.locator('.side .brand-mark svg path').first().evaluate(node=>getComputedStyle(node).fill),'rgb(155, 35, 96)','Brand follows custom theme accent');
  assert.equal(await page.locator('.site-copyright').evaluate(node=>getComputedStyle(node).color),'rgb(109, 84, 103)','Copyright follows custom theme text');
  assert.equal(await page.locator('.account-gate .card').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(249, 244, 250)','Auth surface follows custom theme background');
  await page.evaluate(style=>{document.documentElement.setAttribute('style',style||'');},originalStyle);
  for(const width of [1440,390])for(const theme of ['light','graphite']){
    await page.setViewportSize({width,height:960});
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
    for(const screen of ['home','library','days']){
      await page.evaluate(screen=>{
        document.querySelectorAll('section.on').forEach(node=>node.classList.remove('on'));
        document.getElementById(screen).classList.add('on');
        if(screen==='days')document.getElementById('lmDayList').innerHTML='<div class="day-row"><button class="day lm-entry"><span class="date"><b>19</b><small>Oct</small></span><b>Fixture lesson</b><span class="about">Vocabulary and practice</span></button></div>';
      },screen);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),screen+' must fit '+width);
      const style=await page.locator('#'+screen+' h1').first().evaluate(node=>getComputedStyle(node).fontSize);
      assert.ok(parseFloat(style)<=30,'Compact heading: '+screen);
      await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      await page.screenshot({path:screenshots+'/'+screen+'-'+theme+'-'+width+'.png'});
    }
  }
  await page.evaluate(()=>{document.getElementById('days').classList.remove('on');document.getElementById('library').classList.add('on');});
  await page.locator('#librarySearch').fill('lyrics');
  assert.equal(await page.locator('#library .file-card:visible').count(),1);
  await page.locator('#librarySearch').fill('no matching material');
  assert.equal(await page.locator('#library .file-card:visible').count(),0);
  await page.locator('#librarySearch').fill('');
  assert.equal(await page.locator('#library .file-card:visible').count(),2);
  await page.evaluate(()=>{document.documentElement.dataset.highVisibility='1';document.documentElement.dataset.displaySize='extra-large';});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Accessible size must fit mobile');
  assert.ok(await page.locator('#library :is(.btn,.file-card)').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1)),'Accessible controls must contain their labels');
  for(const role of ['USER','ADMIN','DEVELOPER']){
    user={id:'a'.repeat(32),login:'fixture',name:'Fixture',role};
    await page.reload();
    await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady);
    await page.setViewportSize({width:1440,height:960});
    await page.evaluate(()=>{window.enquizVisit('home');window.scrollTo(0,0);});
    if(role==='USER')assert.equal(await page.locator('#homeGroupTitle').innerText(),'A1 Fixture group');
    assert.equal(await page.locator('#homeDashboard').isVisible(),role==='USER');
    if(role==='USER')assert.ok(await page.locator('#homeDashboard > div').evaluateAll(nodes=>nodes.length===2&&nodes.every(node=>['Top','Right','Bottom','Left'].every(side=>getComputedStyle(node)['border'+side+'Style']==='solid'&&getComputedStyle(node)['border'+side+'Width']==='1px'))),'Both Home panels have closed borders');
    assert.equal(await page.locator('section.on').getAttribute('id'),role==='USER'?'home':role==='ADMIN'?'groups':'bugs');
    assert.equal(await page.locator('.side nav [data-nav-role="student"]').first().isVisible(),role==='USER','Home preserves student-only navigation');
    assert.equal(await page.locator('.side nav [data-nav-role="staff"]').first().isVisible(),role!=='USER','Home preserves staff-only navigation');
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    await page.screenshot({path:screenshots+'/home-'+role+'.png'});
    await page.evaluate(()=>window.enquizVisit('library'));
    await page.locator('#library.on').waitFor();
    await page.locator('#shellSearch').fill('entertainment');
    assert.equal(await page.locator('.side nav [data-jump="library"]').isVisible(),true);
    assert.equal(await page.locator('.side nav [data-jump="home"]').isVisible(),false);
    await page.locator('#shellSearch').fill('');
    await page.locator('#librarySearch').fill('Text');
    assert.equal(await page.locator('#library .file-card:visible').count(),1);
    await page.locator('#librarySearch').fill('');
    await page.evaluate(()=>window.enquizVisit('days'));
    await page.locator('[data-lm-open="31"]').waitFor();
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:960});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),role+' lessons fit '+width);
      await page.screenshot({path:screenshots+'/lessons-'+role+'-'+width+'.png'});
    }
    assert.equal(await page.locator('#lmNew').isVisible(),role!=='USER','Lesson editing remains role-bound');
    await page.evaluate(()=>window.enquizVisit('home'));
    assert.match(await page.locator('#homeRecentList').innerText(),/Lessons/);
  }
  user=null;
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  await page.goto('http://127.0.0.1:'+server.address().port+'/?invite=teacher-fixture');
  await page.waitForFunction(()=>accountChecked);
  await page.evaluate(()=>window.enquizVisit('account'));
  await page.locator('#account [data-account="show-register"]').click();
  await page.locator('[data-invite-email-send]').waitFor();
  await page.locator('#registerForm [name="login"]').fill('InvitedTeacher');
  await page.locator('#registerForm [name="email"]').fill('preview@example.invalid');
  await page.locator('#registerForm [name="password"]').fill('password1');
  await page.locator('[data-invite-email-send]').click();
  await page.locator('[name="emailCode"]:visible').waitFor();
  await page.locator('[name="emailCode"]').fill('123456');
  await page.locator('#registerForm [type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#loginForm [data-form-status]')?.textContent.includes('inviting teacher or a developer'));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('enquiz-invite')),null);
  assert.deepEqual(errors,[]);
  console.log('SaaS: boot, desktop/mobile, light/dark, filters and accessibility passed. Screenshots: '+screenshots);
}finally{await browser?.close();await new Promise(done=>server.close(done));}
