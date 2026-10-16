import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://learn-english.east-tarsal.workers.dev',phase=process.argv[2]||'inspect';
const profile='/private/tmp/english-settings-production-browser';mkdirSync(profile,{recursive:true,mode:0o700});
const context=await chromium.launchPersistentContext(profile,{headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',viewport:{width:1440,height:1000}});
const page=context.pages()[0]||await context.newPage();
let markConnected;const connected=new Promise(resolve=>{markConnected=resolve;});
page.on('websocket',socket=>socket.on('framereceived',frame=>{try{if(JSON.parse(frame.payload).type==='snapshot')markConnected();}catch{}}));
async function waitConnection(job){let timer;try{await Promise.race([job,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Production chat connection did not become ready.')),45000);})]);}finally{clearTimeout(timer);}}
page.on('response',async response=>{if(response.url().includes('/api/me/notification-sounds')){console.log('SOUND REQUEST: '+response.request().method()+' '+response.status());if(response.status()>=400)console.log(JSON.stringify({soundError:await response.json().catch(()=>({})),revisionHeader:response.request().headers()['if-match']}));}});
try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});console.log('STEP 1: Production opened. Waiting for manual sign-in; credentials are not recorded.');
  await page.waitForFunction(()=>typeof authUser!=='undefined'&&!!authUser?.id,{},{timeout:600000});
  await waitConnection(connected);
  await page.locator('.brand-account').first().click();await page.locator('.user-settings .chat-edit-profile').waitFor({timeout:30000});
  console.log('STEP 2: Profile opened.');
  const gaps=await page.locator('.chat-edit-profile').evaluate(form=>({height:form.getBoundingClientRect().height,rows:[...form.querySelectorAll(':scope>label')].map(node=>({name:node.textContent.trim(),top:node.getBoundingClientRect().top,bottom:node.getBoundingClientRect().bottom,margin:getComputedStyle(node).margin}))}));console.log(JSON.stringify({profile:gaps}));
  if(phase==='after'){assert.ok(gaps.height<720);assert.ok(gaps.rows.every(row=>row.margin==='0px'));}
  await page.screenshot({path:'/private/tmp/settings-production-'+phase+'-profile.png'});
  await page.locator('[data-settings-tab="theme"]').click();await page.locator('.user-settings #customThemeOpen').click();
  console.log('STEP 3: Theme editor opened.');
  console.log(JSON.stringify({theme:await page.locator('.user-settings #themes').evaluate(root=>{const b=root.querySelector('#customThemeOpen').getBoundingClientRect(),h=root.querySelector('#customThemeHint').getBoundingClientRect();return {buttonBottom:b.bottom,hintTop:h.top,gap:h.top-b.bottom};})}));
  if(phase==='after')assert.ok(await page.locator('.user-settings #themes').evaluate(root=>root.querySelector('#customThemeHint').getBoundingClientRect().top-root.querySelector('#customThemeOpen').getBoundingClientRect().bottom>=16));
  await page.screenshot({path:'/private/tmp/settings-production-'+phase+'-theme.png'});
  await page.locator('[data-settings-tab="notifications"]').click();await page.locator('.user-settings [name=sound]').waitFor();
  console.log('STEP 4: Notifications opened; server settings read without changing them.');
  console.log(JSON.stringify({notifications:await page.evaluate(async()=>{const response=await fetch('/api/me/notification-sounds',{cache:'no-store'}),data=await response.json();return {status:response.status,customSounds:data.sounds?.map(row=>({name:row.name,duration:row.duration})),selectedListed:data.sounds?.some(row=>row.id===data.sound)};})}));
  await page.screenshot({path:'/private/tmp/settings-production-'+phase+'-notifications.png'});
  if(['verify','after'].includes(phase)){
    const before=await page.evaluate(async()=>await(await fetch('/api/me/notification-sounds',{cache:'no-store'})).json()),name='Settings verification '+Date.now();let created;
    try{
      const rate=24000,length=5,wav=Buffer.alloc(44+rate*length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);for(let i=0;i<rate*length;i++)wav.writeInt16LE(Math.round(Math.sin(i/rate*880*Math.PI*2)*2000),44+i*2);
      const pane=page.locator('.user-settings');await pane.locator('[name=upload]').setInputFiles({name:'Verification.wav',mimeType:'audio/wav',buffer:wav});await pane.locator('.settings-trim-preview').waitFor();
      await pane.locator('[name=soundName]').fill(name);await pane.locator('[name=start]').fill('1');await pane.locator('[name=duration]').fill('1.5');
      console.log('STEP 5: Selected a 1.5-second fragment, entered its name, clicked Save.');
      await pane.locator('[type=submit]').click();await pane.locator('[role=status]').filter({hasText:/Saved/}).waitFor({timeout:30000});
      const saved=await page.evaluate(async()=>await(await fetch('/api/me/notification-sounds',{cache:'no-store'})).json());created=saved.sounds.find(sound=>sound.name===name);assert.ok(created,'Sound persisted on the real server');assert.equal(saved.sound,created.id);assert.equal(created.duration,1.5);
      await page.locator('.user-settings .chat-settings-content').evaluate(node=>node.scrollTop=0);
      await page.screenshot({path:'/private/tmp/settings-production-verify-sound-saved.png'});
      const reconnected=new Promise(resolve=>{markConnected=resolve;});await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof authUser!=='undefined'&&!!authUser?.id);await waitConnection(reconnected);await page.locator('.brand-account').first().click();await page.locator('[data-settings-tab="notifications"]').click();
      await page.locator('.user-settings [name=sound] option').filter({hasText:name}).waitFor({state:'attached'});assert.equal(await page.locator('.user-settings [name=sound]').inputValue(),created.id);
      console.log('STEP 6: Reloaded production. The named sound is still selected and listed.');
      await page.screenshot({path:'/private/tmp/settings-production-verify-sound-restored.png'});
      await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.user-settings .chat-settings-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1));await page.screenshot({path:'/private/tmp/settings-production-after-mobile.png'});
    }finally{
      const result=await page.evaluate(async({before,name})=>{let r=await fetch('/api/me/notification-sounds',{cache:'no-store'}),state=await r.json();const entry=state.sounds.find(s=>s.name===name);if(entry){r=await fetch('/api/me/notification-sounds?id='+encodeURIComponent(entry.id),{method:'DELETE',headers:{'If-Match':state.revision}});state=await r.json();if(!r.ok)throw Error('Test sound cleanup failed');r=await fetch('/api/me/notification-sounds',{method:'POST',headers:{'If-Match':state.revision,'Content-Type':'application/json'},body:JSON.stringify({enabled:before.enabled,volume:before.volume,sound:before.sound})});if(!r.ok)throw Error('Original preferences restoration failed');}return {testSoundRemoved:!!entry,preferencesRestored:!!entry};},{before,name});console.log('STEP 7: '+JSON.stringify(result));
    }
  }
}catch(error){await page.screenshot({path:'/private/tmp/settings-production-error.png'}).catch(()=>{});console.log(JSON.stringify({error:error.message,status:await page.locator('.user-settings').innerText().catch(()=>''),screen:await page.locator('section.on').getAttribute('id').catch(()=>null)}));throw error;}finally{await context.close();}
