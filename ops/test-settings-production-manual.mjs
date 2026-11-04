import {chromiumExecutable,resolveTestDependency,testTempRoot} from '../ops/check-environment.mjs';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
const origin='https://learn-english.east-tarsal.workers.dev',phase=process.argv[2]||'inspect';
const profile=testTempRoot()+"/english-settings-production-browser";mkdirSync(profile,{recursive:true,mode:0o700});
const context=await chromium.launchPersistentContext(profile,{headless:false,executablePath:chromiumExecutable(),viewport:{width:1440,height:1000}});
const page=context.pages()[0]||await context.newPage();
await page.addInitScript(()=>{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){const Wrapped=class extends Audio{createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{window.notificationPlaybackStarts=(window.notificationPlaybackStarts||0)+1;window.notificationPlaybackDuration=source.buffer?.duration;return start(...args);};return source;}};window.AudioContext=Wrapped;if(window.webkitAudioContext)window.webkitAudioContext=Wrapped;}});
let markConnected;const connected=new Promise(resolve=>{markConnected=resolve;});
page.on('websocket',socket=>socket.on('framereceived',frame=>{try{if(JSON.parse(frame.payload).type==='snapshot')markConnected();}catch{}}));
async function waitConnection(job){let timer;try{await Promise.race([job,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Production chat connection did not become ready.')),45000);})]);}finally{clearTimeout(timer);}}
page.on('response',async response=>{if(response.url().includes('/api/me/notification-sounds')){console.log('SOUND REQUEST: '+response.request().method()+' '+response.status());if(response.status()>=400)console.log(JSON.stringify({soundError:await response.json().catch(()=>({})),revisionHeader:response.request().headers()['if-match']}));}});
try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});console.log('STEP 1: Production opened. Waiting for manual sign-in; credentials are not recorded.');
  await page.waitForFunction(()=>typeof authUser!=='undefined'&&!!authUser?.id,{},{timeout:600000});
  await waitConnection(connected);
  if(phase==='after'){
    const original=await page.evaluate(()=>document.documentElement.dataset.theme);
    for(const theme of ['light','dark','almond']){await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;window.LearningMain.notice('Notification preview: please check your settings.',true);},theme);assert.ok(await page.locator('#learning-main-banner').evaluate(node=>node.open&&parseFloat(getComputedStyle(node).borderLeftWidth)>=6));await Promise.resolve();await page.locator('#learning-main-dismiss').click();}
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},original);
  }
  if(phase==='cards'){
    await page.evaluate(()=>window.enquizVisit('add'));await page.locator('#add.on').waitFor();await page.waitForFunction(()=>accountReady&&loadAdded().some(row=>(row.place||'mine')==='mine'&&!row.fromText));
    assert.match(await page.locator('#add h1').innerText(),/^My cards/);assert.equal(await page.locator('#add .sub').innerText(),'Cards you added yourself.');
    await page.locator('#groupAdd [data-add-open]').click();const word=await page.evaluate(()=>loadAdded().find(row=>(row.place||'mine')==='mine'&&!row.fromText).word);
    for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});for(const field of ['#add [data-add-input]','#add [data-card-search]']){await page.locator(field).focus();assert.ok(await page.locator(field).evaluate(node=>{const box=node.getBoundingClientRect(),parent=node.closest('.card.grow').getBoundingClientRect();return box.left>=parent.left+7&&box.right<=parent.right-7;}));}}
    await page.setViewportSize({width:1440,height:1000});await page.locator('#add [data-add-input]').fill(word);await page.locator('#add [data-add-go]').click();await page.locator('#learning-main-status').filter({hasText:'This card is already on the page.'}).waitFor({timeout:30000});
    assert.equal(await page.locator('#add [data-add-status]').innerText(),'');await Promise.resolve();await page.locator('#learning-main-dismiss').click();assert.equal(await page.locator('#learning-main-banner').isVisible(),false);
    await page.locator('#add [data-add-go]').click();await page.locator('#learning-main-banner:not([hidden])').waitFor();await page.mouse.click(2,2);assert.equal(await page.locator('#learning-main-banner').isVisible(),false);
    console.log('PRODUCTION: My cards labels, intact input outlines at 1440/390/320px and duplicate warning close/outside passed. No cards created or edited.');
  }else{
  await page.locator('.brand-account').first().click();await page.locator('.user-settings .chat-edit-profile').waitFor({timeout:30000});
  console.log('STEP 2: Profile opened.');
  const gaps=await page.locator('.chat-edit-profile').evaluate(form=>({height:form.getBoundingClientRect().height,rows:[...form.querySelectorAll(':scope>label')].map(node=>({name:node.textContent.trim(),top:node.getBoundingClientRect().top,bottom:node.getBoundingClientRect().bottom,margin:getComputedStyle(node).margin}))}));console.log(JSON.stringify({profile:gaps}));
  if(phase==='after'){assert.ok(gaps.height<720);assert.ok(gaps.rows.every(row=>row.margin==='0px'));}
  await Promise.resolve();
  await page.locator('[data-settings-tab="theme"]').click();await page.locator('.user-settings #customThemeOpen').click();
  console.log('STEP 3: Theme editor opened.');
  console.log(JSON.stringify({theme:await page.locator('.user-settings #themes').evaluate(root=>{const b=root.querySelector('#customThemeOpen').getBoundingClientRect(),h=root.querySelector('#customThemeHint').getBoundingClientRect();return {buttonBottom:b.bottom,hintTop:h.top,gap:h.top-b.bottom};})}));
  if(phase==='after')assert.ok(await page.locator('.user-settings #themes').evaluate(root=>root.querySelector('#customThemeHint').getBoundingClientRect().top-root.querySelector('#customThemeOpen').getBoundingClientRect().bottom>=16));
  await Promise.resolve();
  await page.locator('[data-settings-tab="notifications"]').click();await page.locator('.user-settings [name=sound]').waitFor();
  console.log('STEP 4: Notifications opened; server settings read without changing them.');
  console.log(JSON.stringify({notifications:await page.evaluate(async()=>{const response=await fetch('/api/me/notification-sounds',{cache:'no-store'}),data=await response.json();return {status:response.status,customSounds:data.sounds?.map(row=>({name:row.name,duration:row.duration})),selectedListed:data.sounds?.some(row=>row.id===data.sound)};})}));
  await Promise.resolve();
  if(['verify','after'].includes(phase)){
    const before=await page.evaluate(async()=>await(await fetch('/api/me/notification-sounds',{cache:'no-store'})).json()),name='Settings verification '+Date.now();let created;
    try{
      const count=await page.locator('.user-settings [name=sound] option').count();assert.ok(count>=100);console.log('CATALOG: '+count+' sounds, including common toad.');
      await page.locator('.user-settings [name=sound]').selectOption('common-toad');const playbackBefore=await page.evaluate(()=>window.notificationPlaybackStarts||0);await page.locator('.user-settings [data-preview]').click();await page.waitForFunction(value=>(window.notificationPlaybackStarts||0)>value,playbackBefore,{timeout:15000});assert.ok(await page.evaluate(()=>window.notificationPlaybackDuration>0));console.log('PLAYBACK: the real toad audio buffer started.');await page.locator('.user-settings [type=submit]').click();await page.locator('.user-settings [role=status]').filter({hasText:'Saved'}).waitFor();
      assert.equal(await page.evaluate(async()=> (await(await fetch('/api/me/notification-sounds',{cache:'no-store'})).json()).sound),'common-toad');
      const rate=24000,length=12,wav=Buffer.alloc(44+rate*length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);for(let i=0;i<rate*length;i++)wav.writeInt16LE(Math.round(Math.sin(i/rate*880*Math.PI*2)*2000),44+i*2);
      const pane=page.locator('.user-settings');await pane.locator('[name=upload]').setInputFiles({name:'Verification.wav',mimeType:'audio/wav',buffer:wav});await pane.locator('.settings-trim-preview').waitFor();
      await pane.locator('[name=soundName]').fill(name);await pane.locator('[name=start]').fill('1');await pane.locator('[name=duration]').fill('10');
      console.log('STEP 5: Selected a 10-second fragment, entered its name, clicked Save.');
      await pane.locator('[type=submit]').click();await pane.locator('[role=status]').filter({hasText:/Saved/}).waitFor({timeout:30000});
      const saved=await page.evaluate(async()=>await(await fetch('/api/me/notification-sounds',{cache:'no-store'})).json());created=saved.sounds.find(sound=>sound.name===name);assert.ok(created,'Sound persisted on the real server');assert.equal(saved.sound,created.id);assert.equal(created.duration,10);
      await page.locator('.user-settings .chat-settings-content').evaluate(node=>node.scrollTop=0);
      await Promise.resolve();
      const reconnected=new Promise(resolve=>{markConnected=resolve;});await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof authUser!=='undefined'&&!!authUser?.id);await waitConnection(reconnected);await page.locator('.brand-account').first().click();await page.locator('[data-settings-tab="notifications"]').click();
      await page.locator('.user-settings [name=sound] option').filter({hasText:name}).waitFor({state:'attached'});assert.equal(await page.locator('.user-settings [name=sound]').inputValue(),created.id);
      console.log('STEP 6: Reloaded production. The named sound is still selected and listed.');
      await Promise.resolve();
      await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.user-settings .chat-settings-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1));await Promise.resolve();
    }finally{
      const result=await page.evaluate(async({before,name})=>{let r=await fetch('/api/me/notification-sounds',{cache:'no-store'}),state=await r.json();const entry=state.sounds.find(s=>s.name===name);if(entry){r=await fetch('/api/me/notification-sounds?id='+encodeURIComponent(entry.id),{method:'DELETE',headers:{'If-Match':state.revision}});state=await r.json();if(!r.ok)throw Error('Test sound cleanup failed');}r=await fetch('/api/me/notification-sounds',{method:'POST',headers:{'If-Match':state.revision,'Content-Type':'application/json'},body:JSON.stringify({enabled:before.enabled,volume:before.volume,sound:before.sound})});if(!r.ok)throw Error('Original preferences restoration failed');return {testSoundRemoved:!!entry,preferencesRestored:true};},{before,name});console.log('STEP 7: '+JSON.stringify(result));
    }
  }
  }
}catch(error){await Promise.resolve().catch(()=>{});console.log(JSON.stringify({error:error.message,status:await page.locator('.user-settings').innerText().catch(()=>''),screen:await page.locator('section.on').getAttribute('id').catch(()=>null)}));throw error;}finally{await context.close();}
