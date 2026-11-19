import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
const root=resolve('rollback/production-assets');
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'});
  res.end(readFileSync(file));
});

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await launchChromium(chromium);

try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const user={id:'u'.repeat(32),login:'fixture',name:'Fixture',role:'USER'};
  let signedIn=false;
  let releaseThemes;
  const themesGate=new Promise(resolve=>{releaseThemes=resolve;});

  await page.routeWebSocket('**/api/messages/socket*',ws=>{
    ws.send(JSON.stringify({type:'snapshot',data:{rooms:[],contacts:[],groups:[],total:0,seq:0}}));
  });

  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data={cards:[],groups:[],songs:[],texts:[],progress:[],quizzes:[],documents:{},next:null};
    if(path==='/api/database-context')data={provider:'d1',revision:0,scope:'site'};
    if(path==='/api/me'||path==='/api/me/account')data={user:signedIn?user:null};
    if(path==='/api/me/state')data={bootstrap:true,stats:{theme:'ocean'},stageActivity:{tracked:true,seconds:0,examPass:0}};
    if(path==='/api/me/themes'){
      await themesGate;
      data={theme:'ocean',themes:[],revision:1,customRevision:0};
    }
    if(path==='/api/exams')data={exams:[]};
    if(path==='/api/exams/work')data={work:[]};
    if(path==='/api/messages')data={rooms:[],contacts:[],groups:[],total:0,seq:0};
    if(path==='/api/login'){
      signedIn=true;
      data={user};
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });

  // Pre-seed saved theme 'ocean' and previously authorized browser flag before opening the guest screen
  await page.addInitScript(()=>{
    localStorage.setItem('enquiz-theme', 'ocean');
    localStorage.setItem('enquiz-auth-on', '1');
  });

  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>!document.body.hasAttribute('data-shell-pending')&&!authUser);

  // On the guest page, leaveAccount previously reset data-theme to almond in the DOM
  const guestTheme=await page.evaluate(()=>document.documentElement.getAttribute('data-theme'));
  assert.equal(guestTheme,'almond','Guest page initial DOM theme is almond after unauthenticated cleanup');
  assert.equal(await page.evaluate(()=>localStorage.getItem('enquiz-theme')),'ocean','Saved theme remains ocean in localStorage');

  // Trigger login via enterAccount while network response for /api/me/themes is held by themesGate
  const themeAtTransition=await page.evaluate(async u=>{
    const themeHistory=[];
    const origSetAttr=document.documentElement.setAttribute.bind(document.documentElement);
    document.documentElement.setAttribute=function(name,val){
      if(name==='data-theme')themeHistory.push(val);
      return origSetAttr(name,val);
    };

    enterAccount(u);
    document.documentElement.setAttribute=origSetAttr;
    return {
      themeHistory,
      immediatelyAfterEnter:document.documentElement.getAttribute('data-theme'),
      homeIsOn:document.getElementById('home')?.classList.contains('on')
    };
  },user);

  // Verify that the theme was applied synchronously without flashing 'almond'
  assert.equal(themeAtTransition.immediatelyAfterEnter,'ocean','Saved theme ocean is synchronously applied in enterAccount before network response');
  assert.equal(themeAtTransition.homeIsOn,true,'Home screen is displayed');
  assert.ok(!themeAtTransition.themeHistory.includes('almond'),'Almond theme was never set during enterAccount transition');
  assert.ok(themeAtTransition.themeHistory.includes('ocean'),'Ocean theme was applied during enterAccount transition');

  // Release the network request for /api/me/themes
  releaseThemes();
  await page.waitForFunction(()=>accountReady);

  // Final check: theme remains 'ocean'
  const finalTheme=await page.evaluate(()=>document.documentElement.getAttribute('data-theme'));
  assert.equal(finalTheme,'ocean','Theme remains ocean after server themes response resolves');
  assert.deepEqual(errors,[]);

  console.log('Synchronous theme restoration in enterAccount completely eliminates almond theme flicker on login');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
