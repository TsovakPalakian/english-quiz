import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const {chromium}=createRequire(import.meta.url)(resolveTestDependency('playwright'));
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html data-theme="sky"><body><span class="popover-notify-dot"></span></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await launchChromium(chromium);
try{
  const page=await browser.newPage({viewport:{width:900,height:800}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.addStyleTag({content:readFileSync('site/preview.css','utf8')});
  const today=new Date().toISOString().slice(0,10);
  await page.addScriptTag({content:`
    function esc(value){const node=document.createElement('span');node.textContent=value==null?'':String(value);return node.innerHTML;}
    var viewAccount=null,authUser={role:'ADMIN'},examCurrentId='';
    var classGroups=[{id:'g1',title:'Evening group',date:'${today}',hidden:false},{id:'g2',title:'',date:'${today}',hidden:false}];
    var lmLibrary={materials:[{id:'m1',title:'Grammar Unit',date:'${today}',hidden:false}]};
    function lmToday(){return '${today}';}
    function isTeacher(){return authUser.role==='ADMIN'||authUser.role==='DEVELOPER';}
    function examLoad(){return [
      {id:'e1',title:'C2 Exam',instanceStatus:'ready'},
      {id:'e2',title:'',instanceStatus:'completed'},
      {id:'e3',title:'Published work',instanceStatus:'completed'}
    ];}
    window.visits=[];
    function visit(place){visits.push(place);}
    function lmOpenLesson(id){visits.push('lesson:'+id);}
  `});
  await page.addScriptTag({content:readFileSync('client/20b-lesson-notifications.js','utf8')});
  await page.evaluate(()=>openLessonNotifications());
  const dialog=page.locator('#lessonNotifyDialog');
  await dialog.waitFor();
  assert.deepEqual(await page.locator('.lesson-notify-card-stage').allTextContents(),['Today','Today','Today','Waiting']);
  assert.deepEqual(await page.locator('.lesson-notify-card-desc').allTextContents(),['Class today','Class today','Material today','Waiting for review']);
  assert.equal(await page.locator('.lesson-notify-card-title').nth(1).innerText(),'Lesson group');
  assert.equal(await page.locator('.lesson-notify-pref').count(),3);
  assert.equal(await page.locator('.lesson-notify-card svg').count(),0);
  const bar=await page.locator('.lesson-notify-settings').boundingBox();
  assert.ok(bar.height<72,'Preference bar stays one short row');
  assert.equal(await page.locator('#lessonNotifyCountBadge').innerText(),'4 active');
  assert.equal(await page.evaluate(()=>document.documentElement.getAttribute('data-notify-unread')),'1');

  for(const theme of ['sky','dark','sand']){
    await page.evaluate(name=>document.documentElement.setAttribute('data-theme',name),theme);
    const colors=await page.evaluate(()=>{
      const root=getComputedStyle(document.documentElement);
      const stage=getComputedStyle(document.querySelector('.lesson-notify-card-stage'));
      const sheet=getComputedStyle(document.querySelector('.lesson-notifications-dialog'));
      return {acc:root.getPropertyValue('--acc').trim(),stage:stage.color,card:root.getPropertyValue('--card').trim(),sheet:sheet.backgroundColor};
    });
    assert.equal(colors.stage,await page.evaluate(value=>{const probe=document.createElement('span');probe.style.color=value;document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;},colors.acc),theme+' stage uses --acc');
    assert.equal(colors.sheet,await page.evaluate(value=>{const probe=document.createElement('span');probe.style.background=value;document.body.append(probe);const color=getComputedStyle(probe).backgroundColor;probe.remove();return color;},colors.card),theme+' dialog uses --card');
  }

  const dotBeforeToggle=await page.evaluate(()=>document.documentElement.getAttribute('data-notify-unread'));
  await page.locator('.lesson-notify-pref').filter({hasText:'Today'}).locator('input').evaluate(node=>{node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.deepEqual(await page.locator('.lesson-notify-card-stage').allTextContents(),['Waiting']);
  assert.equal(await page.locator('#lessonNotifyCountBadge').innerText(),'1 active');
  assert.equal(await page.evaluate(()=>document.documentElement.getAttribute('data-notify-unread')),dotBeforeToggle);
  await page.locator('.lesson-notify-pref').filter({hasText:'Reviews'}).locator('input').evaluate(node=>{node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.locator('.lesson-notify-empty').innerText(),'No active reminders.');
  assert.equal(await page.locator('#lessonNotifyCountBadge').innerText(),'All read');
  await page.locator('.lesson-notify-pref').filter({hasText:'Today'}).locator('input').evaluate(node=>{node.checked=true;node.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('.lesson-notify-pref').filter({hasText:'Reviews'}).locator('input').evaluate(node=>{node.checked=true;node.dispatchEvent(new Event('change',{bubbles:true}));});
  const soundCards=await page.locator('.lesson-notify-card').count();
  await page.locator('.lesson-notify-pref').filter({hasText:'Sound'}).locator('input').evaluate(node=>{node.checked=true;node.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.locator('.lesson-notify-card').count(),soundCards);
  assert.equal(await page.locator('.lesson-notify-sound-note').innerText(),'Sound stays on this device.');
  assert.equal(await page.evaluate(()=>localStorage.getItem('lumiscia-notify-sound')),'true');

  await page.locator('#lessonNotifyReadAllBtn').click();
  assert.equal(await page.locator('#lessonNotifyCountBadge').innerText(),'All read');
  assert.equal(await page.locator('.lesson-notify-card').count(),4);
  assert.equal(await page.evaluate(()=>document.documentElement.getAttribute('data-notify-unread')),'0');
  await page.evaluate(()=>{classGroups.push({id:'g3',title:'Morning group',date:lmToday(),hidden:false});});
  await page.evaluate(()=>openLessonNotifications());
  assert.equal(await page.locator('#lessonNotifyCountBadge').innerText(),'1 active');
  assert.equal(await page.evaluate(()=>document.documentElement.getAttribute('data-notify-unread')),'1');

  await page.locator('.lesson-notify-card').filter({hasText:'Morning group'}).click();
  assert.deepEqual(await page.evaluate(()=>visits),['groups']);
  assert.equal(await page.locator('#lessonNotificationsModal').getAttribute('hidden'),'');
  await page.evaluate(()=>openLessonNotifications());
  await page.locator('.lesson-notify-card').filter({hasText:'Grammar Unit'}).click();
  assert.deepEqual(await page.evaluate(()=>visits),['groups','lesson:m1']);
  await page.evaluate(()=>openLessonNotifications());
  await page.locator('.lesson-notify-card').filter({hasText:'C2 Exam'}).click();
  assert.equal(await page.evaluate(()=>examCurrentId),'e1');
  assert.deepEqual(await page.evaluate(()=>visits),['groups','lesson:m1','examblocks']);

  await page.evaluate(()=>{authUser={role:'USER'};openLessonNotifications();});
  assert.deepEqual(await page.locator('.lesson-notify-card-stage').allTextContents(),['Today','Today','Today','Today','Published','Published']);
  assert.equal(await page.locator('.lesson-notify-card').filter({hasText:'Exam'}).locator('.lesson-notify-card-desc').innerText(),'Review published');
  await page.locator('.lesson-notify-card').filter({hasText:'Published work'}).click();
  assert.equal(await page.evaluate(()=>examCurrentId),'e3');

  await page.evaluate(()=>{viewAccount={id:'other',role:'ADMIN'};document.documentElement.setAttribute('data-notify-unread','1');openLessonNotifications();});
  assert.equal(await page.locator('.lesson-notify-empty').innerText(),'No active reminders.');
  const marked=await page.evaluate(()=>localStorage.getItem('lumiscia-notify-read-ids'));
  await page.evaluate(()=>document.documentElement.setAttribute('data-notify-unread','1'));
  await page.locator('#lessonNotifyReadAllBtn').click();
  assert.equal(await page.evaluate(()=>document.documentElement.getAttribute('data-notify-unread')),'1');
  assert.equal(await page.evaluate(()=>localStorage.getItem('lumiscia-notify-read-ids')),marked);
  await page.locator('#lessonNotifyDoneBtn').click();
  assert.equal(await page.locator('#lessonNotificationsModal').getAttribute('hidden'),'');
  assert.deepEqual(errors,[]);
}finally{
  await browser.close();
  server.close();
}
