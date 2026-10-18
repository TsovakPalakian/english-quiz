import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=resolve('rollback/production-assets');
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'});res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const user={id:'a'.repeat(32),login:'fixture',name:'Fixture',role:'USER'};let loggedOut=false,navigations=0;
  await page.routeWebSocket('**/api/messages/socket*',ws=>{ws.send(JSON.stringify({type:'snapshot',data:{rooms:[],contacts:[],groups:[],total:0,seq:0}}));});
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;let data={cards:[],groups:[],songs:[],texts:[],progress:[],quizzes:[],documents:{},next:null};
    if(path==='/api/database-context')data={provider:'d1',revision:0,scope:'site'};
    if(path==='/api/me'||path==='/api/me/account')data={user:loggedOut?null:user};
    if(path==='/api/me/state')data={bootstrap:true,stats:{},stageActivity:{tracked:true,seconds:36480,examPass:7}};
    if(path==='/api/me/themes')data={theme:'almond',themes:[],revision:0,customRevision:0};
    if(path==='/api/exams')data={exams:[]};if(path==='/api/exams/work')data={work:[]};
    if(path==='/api/messages')data={rooms:[],contacts:[],groups:[],total:0,seq:0};
    if(path==='/api/logout'){loggedOut=true;data={ok:true};}
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady);
  await page.evaluate(()=>{
    window.enquizVisit('home');
    studyCards=()=>[{en:'cached private word',ru:'слово',where:['mine'],kind:'added'}];
    stageSetActivity({tracked:true,seconds:36480,examPass:7});paintHomeStats();
    const original=clearMediaStore;clearMediaStore=(...args)=>new Promise(resolve=>{window.finishLogoutCleanup=()=>resolve(original(...args));});
  });
  assert.equal(await page.locator('#homeLearningCount').innerText(),'1');
  assert.equal(await page.locator('#homeDemo .overview>div:nth-child(1) b').innerText(),'608 min');
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await page.evaluate(()=>{window.logoutFinished=performLogout();});
  await page.waitForFunction(()=>!authUser&&typeof window.finishLogoutCleanup==='function');
  assert.equal(await page.locator('#home .hello').innerText(),'See you soon');
  assert.equal(await page.locator('#homeLearnedCount').innerText(),'0 of 0');
  assert.equal(await page.locator('#homeLearnedPct').innerText(),'0%');
  assert.equal(await page.locator('#homeLearningCount').innerText(),'0');
  assert.equal(await page.locator('#homeDemo [data-stat="weak"] b').innerText(),'0');
  assert.deepEqual(await page.locator('#homeDemo .overview b').allTextContents(),['0 min','0','0','0']);
  await page.evaluate(async()=>{window.finishLogoutCleanup();await window.logoutFinished;stageRefreshHome();stagePaintActivity();});
  assert.equal(loggedOut,true);assert.equal(navigations,0,'Explicit logout must not reload the document');
  assert.equal(await page.locator('#home .hello').innerText(),'See you soon');
  assert.deepEqual(await page.locator('#homeDemo .overview b').allTextContents(),['0 min','0','0','0']);
  assert.equal(await page.evaluate(()=>stageActivity.seconds),0);assert.equal(await page.evaluate(()=>stageTimeSeconds),0);
  await page.screenshot({path:'/private/tmp/logout-cleared.png'});
  assert.deepEqual(errors,[]);console.log('Logout immediately clears cached statistics, resets activity and preserves See you soon without reload');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
