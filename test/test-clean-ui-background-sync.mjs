import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
const root=resolve('rollback/production-assets');

let loggedOut=false;
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const path=url.pathname;
  if(path==='/api/me'){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({user:{id:'test-user',role:'USER'}}));
    return;
  }
  if(path==='/api/me/state'){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({bootstrap:true,stageThemeRevision:1,stats:{theme:'mint'}}));
    return;
  }
  if(path==='/api/logout'){
    loggedOut=true;
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:true}));
    return;
  }
  if(path.startsWith('/api/')){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:true,items:[],groups:[],exams:[],themes:[]}));
    return;
  }
  const file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  const contentType=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream';
  res.writeHead(200,{'Content-Type':contentType});
  res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const url=`http://127.0.0.1:${port}`;
let browser;

try{
  browser=await launchChromium(chromium);
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const pageErrors=[];
  page.on('pageerror',err=>pageErrors.push(err.message));

  // Seed unconfirmed operations in storage
  await page.addInitScript(()=>{
    localStorage.setItem('learning-main-pending-v3',JSON.stringify({
      actorId:'test-user',path:'/api/cards/1',method:'PATCH',intent:'test',body:{mutationId:'unconfirmed-pending'}
    }));
    localStorage.setItem('learning-main-personal-pending-v3',JSON.stringify([{
      kind:'theme',key:'theme',theme:'mint',path:'/api/me/theme',method:'PUT',actorId:'test-user',mutationId:'unconfirmed-personal',paused:true,
      body:{mutationId:'unconfirmed-personal',expectedRevision:1,theme:'mint'}
    }]));
  });

  await page.goto(url);
  await page.waitForLoadState('networkidle');

  // Verify completely clean UI matching Screenshot 8: zero popups, zero modals, zero toasts
  const banner=page.locator('#learning-main-banner');
  assert.equal(await banner.isVisible(),false,'Notification banner must be completely hidden');
  assert.equal(await banner.getAttribute('open'),null,'Banner must not be open as an alertdialog');

  const openDialogs=await page.locator('dialog[open]').count();
  assert.equal(openDialogs,0,'No blocking dialogs or modals may be visible on screen');

  const pageText=await page.locator('body').innerText();
  assert.equal(pageText.includes('An operation is unconfirmed'),false,'Unconfirmed operation message must not appear in UI');
  assert.equal(pageText.includes('Есть неподтверждённая операция'),false,'Russian unconfirmed operation text must not appear');
  assert.equal(pageText.includes('then retry or'),false,'Truncated button text must not appear');
  assert.equal(pageText.includes('Reload server'),false,'Reload server button must not be visible to user');

  // Verify unconditional logout completes and purges pending storage
  await page.evaluate(async()=>{
    await window.LearningMain.fetch('/api/logout',{method:'POST',body:'{}'});
  });

  assert.equal(loggedOut,true,'Logout endpoint must be invoked successfully');
  const pendingStored=await page.evaluate(()=>localStorage.getItem('learning-main-pending-v3'));
  assert.equal(pendingStored,null,'Pending queue must be cleared after logout');
  const personalStored=await page.evaluate(()=>localStorage.getItem('learning-main-personal-pending-v3'));
  assert.equal(personalStored,null,'Personal queue must be cleared after logout');

  // Verify perform() executes user actions cleanly
  await page.evaluate(async()=>{
    await window.LearningMain.perform(async()=>{
      window.__testPerformed=true;
    });
  });
  const performed=await page.evaluate(()=>window.__testPerformed);
  assert.equal(performed,true,'LearningMain.perform must execute action when queue is clear');

  assert.equal(pageErrors.length,0,'No unhandled errors during background sync lifecycle: '+JSON.stringify(pageErrors));
  console.log('Clean UI and background sync visual test passed: zero popups, zero toasts, unblocked perform and logout.');
}finally{
  if(browser)await browser.close();
  server.close();
}
