import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import recordings from '../production/notification-catalog.json' with {type:'json'};
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
const browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
try{
  const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  let settings={enabled:true,volume:.65,sound:'soft-double',sounds:[],revision:''},counter=0,audio,failPreview=false;
  await page.route('https://fixture.test/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname.startsWith('/notification-audio/')){const row=recordings.find(sound=>sound.file===url.pathname);return route.fulfill({contentType:'audio/wav',body:readFileSync('production'+row.file)});}
    if(url.pathname!=='/api/me/notification-sounds')return route.fulfill({contentType:'text/html',body:'<!doctype html><button data-notification-sounds>Notification sounds</button>'});
    const method=request.method();
    if(method==='GET'&&url.searchParams.has('id'))return failPreview?route.fulfill({status:503,body:'Preview unavailable'}):route.fulfill({contentType:'audio/wav',body:audio});
    if(method==='POST')settings={...settings,...request.postDataJSON(),revision:String(++counter)};
    if(method==='PUT'){audio=request.postDataBuffer();assert.ok(audio.length<=480044);settings={...settings,sound:'custom-one',sounds:[{id:'custom-one',name:url.searchParams.get('name'),duration:(audio.length-44)/48000}],revision:String(++counter)};}
    if(method==='DELETE')settings={...settings,sound:'soft-double',sounds:[],revision:String(++counter)};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(settings)});
  });
  await page.goto('https://fixture.test/');
  await page.addStyleTag({content:':root{--card:#fff;--ink:#172f2d;--line:#ccd;--acc:#167a72}button,input,select{font:inherit}'+readFileSync('production/chat.css','utf8')});
  await page.evaluate(()=>{window.authUser={id:'alice'};window.viewAccount=null;});
  await page.evaluate(value=>{window.NotificationSoundCatalog=value;},recordings);
  await page.addScriptTag({content:readFileSync('production/notification-sounds.js','utf8')});
  await page.locator('[data-notification-sounds]').click();const dialog=page.locator('dialog[open]');await dialog.waitFor();
  assert.equal(await dialog.locator('select option').count(),12+recordings.length);
  await dialog.locator('[name=sound]').selectOption('common-toad');await dialog.locator('[data-preview]').click();
  assert.equal(await dialog.locator('[role=status]').innerText(),'');
  await dialog.locator('[name=sound]').selectOption('bell');
  await dialog.locator('[name=enabled]').uncheck();
  await dialog.locator('[name=volume]').fill('0.25');
  await dialog.locator('[type=submit]').click();await dialog.locator('[role=status]').filter({hasText:'Saved'}).waitFor();
  await dialog.locator('[data-close]').click();await page.locator('[data-notification-sounds]').click();await dialog.waitFor();
  assert.equal(await dialog.locator('[name=sound]').inputValue(),'bell');assert.equal(await dialog.locator('[name=enabled]').isChecked(),false);assert.equal(await dialog.locator('[name=volume]').inputValue(),'0.25');
  const wav=Buffer.alloc(44+48000*12);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  await dialog.locator('[name=upload]').setInputFiles({name:'My sound.wav',mimeType:'audio/wav',buffer:wav});
  await dialog.locator('[data-upload]').waitFor();await dialog.locator('[name=start]').fill('1');await dialog.locator('[name=duration]').fill('10');await dialog.locator('[data-upload]').click();
  await dialog.locator('option[value=custom-one]').waitFor({state:'attached'});assert.equal(settings.sounds[0].duration,10);
  await dialog.locator('[data-preview]').click();
  for(const width of [1000,320]){await page.setViewportSize({width,height:800});assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));}
  await Promise.resolve();
  await dialog.locator('[data-remove]').click();await dialog.locator('option[value=custom-one]').waitFor({state:'detached'});assert.equal(settings.sounds.length,0);
  await dialog.locator('[data-close]').click();
  const chat=readFileSync('production/chat.js','utf8'),editor=chat.slice(chat.indexOf('  function settingsSoundEditor(root) {'),chat.indexOf('  function dressUserSettings(pane) {'));
  await page.addScriptTag({content:'window.icon=()=>"";window.icons=()=>{};'+editor+'document.addEventListener("notification-sounds-rendered",event=>{if(event.target.closest(".user-settings"))settingsSoundEditor(event.target);});'});
  await page.evaluate(async()=>{const node=document.createElement('dialog');node.className='chat-dialog user-settings';node.innerHTML='<div data-settings-sounds></div>';document.body.append(node);node.showModal();await window.NotificationSounds.mount(node.firstElementChild);});
  const embedded=page.locator('dialog.user-settings[open]');
  const short=Buffer.from(wav.subarray(0,44+Math.floor(24000*2.637)*2));short.writeUInt32LE(short.length-8,4);short.writeUInt32LE(short.length-44,40);
  await embedded.locator('[name=upload]').setInputFiles({name:'Short source.wav',mimeType:'audio/wav',buffer:short});
  await embedded.locator('.settings-trim-preview').waitFor();await embedded.locator('[name=soundName]').fill('Tiny bell');
  assert.equal(await embedded.locator('[name=duration]').inputValue(),'2.63','A short source is never rounded beyond its end');
  failPreview=true;await embedded.locator('[type=submit]').click();
  await embedded.locator('[role=status]').filter({hasText:'Saved. Preview is unavailable.'}).waitFor();
  assert.equal(settings.sounds[0].name,'Tiny bell');assert.equal(settings.sounds[0].duration,2.63);
  assert.equal(await embedded.locator('select').inputValue(),'custom-one','A preview failure does not hide the saved sound');
  failPreview=false;await page.evaluate(async()=>{const host=document.querySelector('.user-settings [data-settings-sounds]');await window.NotificationSounds.mount(host);});
  assert.match(await embedded.locator('option[value="custom-one"]').innerText(),/Tiny bell/);
  assert.equal(await embedded.locator('select').inputValue(),'custom-one');
  const decoded=await page.evaluate(async entries=>{const audio=new OfflineAudioContext(1,1,24000),results=[];for(const entry of entries){const bytes=await(await fetch(entry.file)).arrayBuffer(),buffer=await audio.decodeAudioData(bytes);results.push({id:entry.id,duration:buffer.duration});}return results;},recordings);
  assert.equal(decoded.length,recordings.length);for(let i=0;i<decoded.length;i++)assert.ok(Math.abs(decoded[i].duration-recordings[i].duration)<.001,'Browser decodes '+decoded[i].id);
  assert.deepEqual(errors,[]);console.log('Standalone sound settings and embedded naming, short clipping, preview failure and server restore passed');
}finally{await browser.close();}
