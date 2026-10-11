import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=resolve(process.env.UI_ASSETS_DIR||'rollback/turso-messaging-assets');
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream';
  res.writeHead(200,{'Content-Type':type});res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('UI error:',error.message);});
  const student={id:'b'.repeat(32),login:'fixture_student',name:'Alice',role:'USER'},teacher='a'.repeat(32),room='direct:'+teacher+':'+student.id;
  const rows=[{id:1,senderId:teacher,sender:'Teacher',category:'personal',text:'Hello Alice',created:1780000000},{id:2,senderId:teacher,sender:'Teacher',category:'learning',text:'Exam assigned: Fixture exam',created:1780000010,examId:11,assignmentActive:true}];
  const unread={personal:1,learning:1};let failSend=true,peerReadThrough=0;const requests=[];
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;let data={cards:[],groups:[],songs:[],texts:[],progress:[],quizzes:[],documents:{},next:null};
    requests.push(path);
    if(path==='/api/me')data={user:student};
    if(path==='/api/me/state')data={learned:[],added:[],stats:{},stageThemeRevision:0,stageCustomRevision:0};
    if(path==='/api/me/themes')data={theme:'almond',themes:[],revision:0,customRevision:0};
    if(path==='/api/me/account')data={user:student};
    if(path==='/api/account/bootstrap')data={versions:{},catalogs:[],user:student};
    if(path==='/api/archive')data={items:[],revision:1};
    if(path==='/api/exams')data={exams:[{id:11,revision:1,title:'Fixture exam',published:true,blocks:[{id:12,title:'Fixture block',published:true,materials:[]}]}]};
    if(path==='/api/exams/work')data={work:[]};
    if(path==='/api/messages')data={rooms:[{id:room,title:'Teacher',kind:'direct',unread:{...unread},has:{personal:true,learning:true},lastId:rows.at(-1).id,muted:false}],groups:[{id:1,title:'A1'}],contacts:[{id:teacher,name:'Teacher',role:'Teacher'}],examRevision:'1:1',unread:{...unread},total:unread.personal+unread.learning};
    if(path==='/api/messages/history'){const category=url.searchParams.get('category');data={messages:rows.filter(row=>row.category===category&&row.id>Number(url.searchParams.get('after')||0)&&(!url.searchParams.get('q')||row.text.includes(url.searchParams.get('q')))).map(row=>({...row,read:row.id<=peerReadThrough})),more:false,peerReadThrough};}
    if(path==='/api/messages/read'){const body=JSON.parse(request.postData());unread[body.category]=0;data={read:true};}
    if(path==='/api/messages/exam')data={examId:11};
    if(path==='/api/messages/send'){
      const body=JSON.parse(request.postData());
      if(failSend){failSend=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic send failure'})});}
      rows.push({id:rows.at(-1).id+1,senderId:student.id,sender:'Alice',category:body.category,text:body.text,created:1780000020,createdMs:1780000020123,replyTo:body.replyTo,replyText:rows.find(row=>row.id===body.replyTo)?.text});data={id:rows.at(-1).id,sent:true};
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>document.querySelector('.side-foot [data-msg-open]')?.textContent==='Messages · 2');
  assert.equal(await page.locator('.side-foot [data-jump="account"]').innerText(),'My account · 2');
  await page.locator('.side-foot [data-msg-open]').click();await page.locator('[data-msg-room]').click();
  await page.waitForFunction(()=>document.querySelector('.side-foot [data-jump="account"]')?.textContent==='My account · 1');
  assert.equal(await page.locator('#msgAssign').isVisible(),false);assert.equal(await page.locator('#msgAnnouncementLabel').isVisible(),false);
  await page.locator('[data-msg-category="learning"]').click();await page.getByRole('button',{name:'Open exam',exact:true}).click();
  await page.locator('#examblocks.on').waitFor();assert.equal(await page.locator('#examBlocksName').innerText(),'Fixture exam');
  await page.locator('#examblocks [data-nav-back]').click();await page.locator('#messages.on').waitFor();
  await page.locator('[data-msg-category="personal"]').click();
  await page.locator('[data-msg-reply="1"]').click();await page.locator('#msgText').fill('My saved reply');await page.locator('#msgSend').click();
  await page.getByText('Synthetic send failure',{exact:true}).waitFor();assert.equal(await page.locator('#msgText').inputValue(),'My saved reply');
  await page.locator('#msgSend').click();await page.waitForFunction(()=>document.querySelector('#msgText').value==='');
  assert.equal(rows.filter(row=>row.text==='My saved reply').length,1);
  assert.match(await page.locator('.is-own time').innerText(),/\.123$/);
  assert.equal(await page.locator('#profile .msg-account-summary').count(),0);
  await page.locator('.msg-receipt[aria-label="Delivered"]').waitFor();
  assert.equal(await page.locator('.msg-receipt svg').count(),1);
  peerReadThrough=rows.at(-1).id;
  await page.locator('.msg-receipt.is-read[aria-label="Read"]').waitFor({timeout:15000});
  await page.locator('#msgText').fill('Hello there');
  await page.locator('#msgText').evaluate(node=>node.setSelectionRange(5,5));
  await page.locator('#msgEmoji').click();await page.getByRole('button',{name:'Thumbs up',exact:true}).click();
  assert.equal(await page.locator('#msgText').inputValue(),'Hello\u{1F44D} there');
  await page.locator('#msgText').press('Shift+Enter');assert.match(await page.locator('#msgText').inputValue(),/\n/);
  await page.locator('#msgText').press('Enter');await page.waitForFunction(()=>document.querySelector('#msgText').value==='');
  assert.equal(rows.filter(row=>row.text.includes('\u{1F44D}')).length,1);
  await page.locator('#msgText').fill('IME');
  await page.locator('#msgText').evaluate(node=>node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true})));
  assert.equal(await page.locator('#msgText').inputValue(),'IME');
  await page.locator('#msgTextSearch').fill('My saved reply');await page.waitForFunction(()=>document.querySelectorAll('.msg-message').length===1);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('.mobile-tools [data-msg-open]').isVisible(),true);
  assert.ok(await page.locator('.mobile-tools').evaluate(node=>node.scrollWidth<=node.clientWidth));
  assert.ok(await page.locator('#messages').evaluate(node=>node.scrollWidth<=node.clientWidth),'Messages fit mobile');
  await page.screenshot({path:'/private/tmp/english-quiz-messages-mobile.png'});
  await page.locator('#msgListBack').click();assert.equal(await page.locator('.msg-sidebar').isVisible(),true);
  await page.locator('[data-msg-room]').click();await page.locator('#msgText').fill('Unsent draft');
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).text,'english-chat-draft-v1:'+student.id+':'+room),'Unsent draft');
  await page.reload();await page.locator('#messages.on #msgCompose:not([hidden])').waitFor();
  await page.waitForFunction(()=>document.querySelector('#msgText')?.value==='Unsent draft');
  assert.equal(await page.locator('#msgText').inputValue(),'Unsent draft');
  await page.evaluate(()=>{authUser.role='ADMIN';});
  await page.locator('.mobile-tools [data-msg-open]').click();await page.locator('#msgAssign:visible').waitFor();
  const beforeExams=requests.filter(path=>path==='/api/exams').length;
  for(const id of ['msgNew','msgAssign'])for(let i=0;i<2;i++){
    await page.locator('#'+id).click();await page.locator('dialog[open]').waitFor();
    await page.locator('[data-msg-close]').click();
  }
  assert.equal(requests.filter(path=>path==='/api/exams').length,beforeExams);
  assert.equal(requests.filter(path=>path==='/api/messages/assignments').length,0);
  assert.deepEqual(errors,[]);console.log('Messaging UI: unread counts, student permissions, exam link/back, reply/retry, search, mobile and draft/reload passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
