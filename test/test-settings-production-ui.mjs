import {chromiumLaunchOptions,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
const root=resolve('rollback/production-assets');

let soundSettings={enabled:true,volume:0.65,sound:'common-toad',sounds:[]};
let soundRevision='rev-init-1';

const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const path=url.pathname;
  if(path==='/api/me/notification-sounds'){
    res.setHeader('Content-Type','application/json');
    if(req.method==='GET'){
      res.writeHead(200);
      res.end(JSON.stringify({...soundSettings,revision:soundRevision}));
      return;
    }
    if(req.method==='POST'||req.method==='PUT'){
      let body='';
      req.on('data',chunk=>{body+=chunk;});
      req.on('end',()=>{
        try{
          const parsed=body?JSON.parse(body):{};
          if(typeof parsed.enabled==='boolean')soundSettings.enabled=parsed.enabled;
          if(typeof parsed.volume==='number')soundSettings.volume=parsed.volume;
          if(parsed.sound)soundSettings.sound=parsed.sound;
          soundRevision='rev-'+Date.now();
          res.writeHead(200);
          res.end(JSON.stringify({ok:true,revision:soundRevision}));
        }catch(e){
          res.writeHead(400);res.end(JSON.stringify({error:e.message}));
        }
      });
      return;
    }
  }
  const file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  const contentType=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.wav')?'audio/wav':'application/octet-stream';
  res.writeHead(200,{'Content-Type':contentType});
  res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;

const browser=await chromium.launch(chromiumLaunchOptions());
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});

  await page.addInitScript(()=>{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(Audio){
      const Wrapped=class extends Audio{
        createBufferSource(){
          const source=super.createBufferSource(),start=source.start.bind(source);
          source.start=(...args)=>{
            window.notificationPlaybackStarts=(window.notificationPlaybackStarts||0)+1;
            window.notificationPlaybackDuration=source.buffer?.duration||1.5;
            return start(...args);
          };
          return source;
        }
      };
      window.AudioContext=Wrapped;
      if(window.webkitAudioContext)window.webkitAudioContext=Wrapped;
    }
  });

  const authUser={id:'dev-settings-fixture',login:'developer',name:'Developer',role:'DEVELOPER'};
  await page.routeWebSocket('**/api/messages/socket*',ws=>ws.send(JSON.stringify({type:'snapshot',data:{rooms:[],contacts:[],groups:[],total:0,seq:0}})));
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data={cards:[],groups:[],songs:[],texts:[],progress:[],quizzes:[],documents:{}};
    if(path==='/api/database-context')data={provider:'d1',revision:0,scope:'site'};
    if(path==='/api/me'||path==='/api/me/account')data={user:authUser};
    if(path==='/api/me/state')data={bootstrap:true,stats:{},stageActivity:{tracked:true,seconds:36480,examPass:7}};
    if(path==='/api/me/themes')data={theme:'almond',themes:[],revision:0,customRevision:0};
    if(path.startsWith('/api/me/notification-sounds'))return route.continue();
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });

  await page.goto(origin);
  await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady);

  // 1. Open User Settings dialog
  await page.locator('[data-user-settings],.brand-account').first().click();
  await page.locator('.user-settings').waitFor({timeout:5000});

  // 2. Profile tab layout and zeroed label margins
  await page.locator('.user-settings [data-settings-tab="profile"]').click();
  await page.locator('.user-settings .chat-edit-profile').waitFor({timeout:5000});
  const gaps=await page.locator('.chat-edit-profile').evaluate(form=>({
    height:form.getBoundingClientRect().height,
    rows:[...form.querySelectorAll(':scope>label')].map(node=>({
      name:node.textContent.trim(),
      margin:getComputedStyle(node).margin
    }))
  }));
  assert.ok(gaps.height<720,'Profile form height must fit viewport');
  assert.ok(gaps.rows.every(row=>row.margin==='0px'),'Profile label margins must be zeroed');

  // 3. Theme editor gap between button and hint
  await page.locator('[data-settings-tab="theme"]').click();
  await page.locator('.user-settings #customThemeOpen').click();
  const themeGap=await page.locator('.user-settings #themes').evaluate(root=>{
    const b=root.querySelector('#customThemeOpen').getBoundingClientRect();
    const h=root.querySelector('#customThemeHint').getBoundingClientRect();
    return h.top-b.bottom;
  });
  assert.ok(themeGap>=16,'Theme open button and hint gap must be >= 16px');

  // 4. Notifications tab sound catalog
  await page.locator('[data-settings-tab="notifications"]').click();
  await page.locator('.user-settings [name=sound]').waitFor();
  const count=await page.locator('.user-settings [name=sound] option').count();
  assert.ok(count>=100,'Notification sound catalog must provide at least 100 options');

  // 5. Sound preview audio playback
  await page.locator('.user-settings [name=sound]').selectOption('common-toad');
  const playbackBefore=await page.evaluate(()=>window.notificationPlaybackStarts||0);
  await page.locator('.user-settings [data-preview]').click();
  await page.waitForFunction(val=>(window.notificationPlaybackStarts||0)>val,playbackBefore,{timeout:10000});
  assert.ok(await page.evaluate(()=>window.notificationPlaybackDuration>0),'Audio buffer duration must be positive');

  // 6. Sound preference submission and server save
  await page.locator('.user-settings [type=submit]').click();
  await page.locator('.user-settings [role=status]').filter({hasText:'Saved'}).waitFor();
  assert.equal(soundSettings.sound,'common-toad');

  // 7. Responsive mobile width: horizontal overflow check
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('.user-settings .chat-settings-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Settings content must not overflow horizontally on mobile');

  // 8. Main notification banner across themes
  for(const theme of ['light','dark','almond']){
    await page.evaluate(themeName=>{
      document.documentElement.dataset.theme=themeName;
      window.LearningMain.notice('Notification preview: please check your settings.',true);
    },theme);
    assert.ok(await page.locator('#learning-main-banner').evaluate(node=>node.open&&parseFloat(getComputedStyle(node).borderLeftWidth)>=6),'Banner left border must be >= 6px');
    await page.locator('#learning-main-dismiss').click();
  }

  console.log('Automated local settings UI and responsive checks passed');
}finally{
  await browser.close();
  await new Promise(res=>server.close(res));
}
