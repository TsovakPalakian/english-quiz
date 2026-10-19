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
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(readFileSync(file));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],sent=[],uploads=new Map();
  let failUpload=false;
  page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  const user={id:'a'.repeat(32),login:'fixture',name:'Student',role:'USER'},peer='b'.repeat(32),roomId='direct:'+user.id+':'+peer;
  const room={id:roomId,title:'Teacher',peerId:peer,kind:'direct',members:2,access:{protected:true,state:'accepted',canSend:true},unread:{personal:0,learning:0},has:{personal:true,learning:false}};
  await page.routeWebSocket('**/api/messages/socket*',ws=>{
    ws.send(JSON.stringify({type:'snapshot',data:{rooms:[room],contacts:[{id:peer,name:'Teacher',role:'Teacher'}],groups:[],profile:user,seq:0,total:0}}));
    ws.onMessage(raw=>{
      const {requestId,action,body}=JSON.parse(raw);let result={};
      if(action==='history')result={room,messages:[],more:false,readThrough:0};
      if(action==='read')result={room};
      if(action==='profiles')result={profiles:body.ids.map(id=>({id,online:true}))};
      if(action==='send'){const message={...body,id:sent.length+1,senderId:user.id,sender:'Student',createdMs:Date.now(),files:body.files.map(id=>uploads.get(id))};sent.push(message);result={message};}
      ws.send(JSON.stringify({type:'response',requestId,result}));
    });
  });
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;let data={cards:[],groups:[],exams:[],work:[],documents:{},next:null};
    if(path==='/api/database-context')data={provider:'d1',revision:3,scope:'site'};
    if(path==='/api/me'||path==='/api/me/account')data={user};
    if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{},stageActivity:{}};
    if(path==='/api/me/themes')data={theme:'light',themes:[],revision:0,customRevision:0};
    if(path==='/api/messages/upload'){
      if(failUpload){failUpload=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic recording upload failure.'})});}
      const id='file-'+uploads.size,bytes=route.request().postDataBuffer(),file={id,name:url.searchParams.get('name'),mime:route.request().headers()['content-type'],size:bytes.length,url:'/api/messages/file?id='+id};
      assert.ok(bytes.length>0,'Real MediaRecorder produced a nonempty file');uploads.set(id,file);data={file};
    }
    if(path==='/api/messages/file')return route.fulfill({status:204,body:''});
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>accountReady);
  await page.locator('.side nav [data-msg-open]').click();await page.locator('[data-msg-room]').first().click();await page.locator('#msgCompose').waitFor();
  assert.equal(await page.locator('#msgVideo').isVisible(),false);
  const button=page.locator('#msgMic');
  const down=()=>button.dispatchEvent('pointerdown',{button:0,pointerId:1,clientX:900,clientY:800});
  const up=()=>button.dispatchEvent('pointerup',{button:0,pointerId:1,clientX:900,clientY:800});
  const move=()=>button.dispatchEvent('pointermove',{pointerId:1,clientX:800,clientY:800});
  const start=async()=>{await down();await page.waitForFunction(()=>/Recording/.test(document.getElementById('msgSendState').textContent));await page.waitForTimeout(400);};
  const waitSent=async count=>{await page.waitForFunction(count=>document.querySelectorAll('.msg-message[data-msg-id]').length>=count,count);assert.equal(sent.length,count);};
  await start();await up();await waitSent(1);assert.match(sent[0].files[0].name,/^voice-/);
  await down();await up();assert.equal(await button.getAttribute('data-record-mode'),'video');assert.equal(sent.length,1);
  await start();await up();await waitSent(2);assert.match(sent[1].files[0].name,/^video-/);
  await down();await up();assert.equal(await button.getAttribute('data-record-mode'),'audio');
  await start();await move();await up();await page.waitForTimeout(300);assert.equal(sent.length,2);assert.equal(await button.getAttribute('aria-label'),'Send recording');
  await page.locator('#msgSend').click();await waitSent(3);
  await page.evaluate(()=>{
    window.originalMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=constraints=>new Promise(resolve=>{window.finishMedia=()=>window.originalMedia(constraints).then(resolve);});
  });
  await down();await page.waitForFunction(()=>!!window.finishMedia);await up();await page.evaluate(()=>{window.finishMedia();navigator.mediaDevices.getUserMedia=window.originalMedia;});
  await page.getByText('Permission granted. Hold again to record.',{exact:true}).waitFor();assert.equal(sent.length,3);
  await start();await up();await waitSent(4);
  await start();await page.keyboard.press('Escape');await up();await page.waitForTimeout(200);assert.equal(sent.length,4);
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
  await down();await page.getByText('Allow microphone access in your browser settings.',{exact:true}).waitFor();await up();assert.equal(sent.length,4);
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=window.originalMedia;});
  failUpload=true;await start();await up();await page.getByText('Synthetic recording upload failure.',{exact:true}).first().waitFor();assert.equal(sent.length,4);
  await page.locator('[data-cancel-upload]').click();
  await page.clock.install();
  await down();await up();await start();await move();await up();assert.equal(sent.length,4);
  await page.clock.fastForward(60000);await waitSent(5);assert.match(sent[4].files[0].name,/^video-/);
  assert.deepEqual(errors,[]);await page.screenshot({path:'/private/tmp/lumiscia-recording.png'});
  console.log('Real browser MediaRecorder: voice/video release-send, single toggle, locked send, permission race/denial, cancel and 60-second video auto-send passed');
}finally{await browser?.close();await new Promise(done=>server.close(done));}
