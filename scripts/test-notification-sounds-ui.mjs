import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  let settings={enabled:true,volume:.65,sound:'soft-double',sounds:[],revision:''},counter=0,audio;
  await page.route('https://fixture.test/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname!=='/api/me/notification-sounds')return route.fulfill({contentType:'text/html',body:'<!doctype html><button data-notification-sounds>Notification sounds</button>'});
    const method=request.method();
    if(method==='GET'&&url.searchParams.has('id'))return route.fulfill({contentType:'audio/wav',body:audio});
    if(method==='POST')settings={...settings,...request.postDataJSON(),revision:String(++counter)};
    if(method==='PUT'){audio=request.postDataBuffer();assert.ok(audio.length<=144044);settings={...settings,sound:'custom-one',sounds:[{id:'custom-one',name:url.searchParams.get('name'),duration:(audio.length-44)/48000}],revision:String(++counter)};}
    if(method==='DELETE')settings={...settings,sound:'soft-double',sounds:[],revision:String(++counter)};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(settings)});
  });
  await page.goto('https://fixture.test/');
  await page.addStyleTag({content:':root{--card:#fff;--ink:#172f2d;--line:#ccd;--acc:#167a72}button,input,select{font:inherit}'+readFileSync('production/chat.css','utf8')});
  await page.evaluate(()=>{window.authUser={id:'alice'};window.viewAccount=null;});
  await page.addScriptTag({content:readFileSync('production/notification-sounds.js','utf8')});
  await page.locator('[data-notification-sounds]').click();const dialog=page.locator('dialog[open]');await dialog.waitFor();
  assert.equal(await dialog.locator('select option').count(),12);
  await dialog.locator('[name=sound]').selectOption('bell');
  await dialog.locator('[name=enabled]').uncheck();
  await dialog.locator('[name=volume]').fill('0.25');
  await dialog.locator('[type=submit]').click();await dialog.locator('[role=status]').filter({hasText:'Saved'}).waitFor();
  await dialog.locator('[data-close]').click();await page.locator('[data-notification-sounds]').click();await dialog.waitFor();
  assert.equal(await dialog.locator('[name=sound]').inputValue(),'bell');assert.equal(await dialog.locator('[name=enabled]').isChecked(),false);assert.equal(await dialog.locator('[name=volume]').inputValue(),'0.25');
  const wav=Buffer.alloc(44+48000*5);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  await dialog.locator('[name=upload]').setInputFiles({name:'My sound.wav',mimeType:'audio/wav',buffer:wav});
  await dialog.locator('[data-upload]').waitFor();await dialog.locator('[name=start]').fill('1');await dialog.locator('[name=duration]').fill('2');await dialog.locator('[data-upload]').click();
  await dialog.locator('option[value=custom-one]').waitFor({state:'attached'});assert.equal(settings.sounds[0].duration,2);
  await dialog.locator('[data-preview]').click();
  for(const width of [1000,320]){await page.setViewportSize({width,height:800});assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));}
  await page.screenshot({path:'/private/tmp/notification-sounds-mobile.png'});
  await dialog.locator('[data-remove]').click();await dialog.locator('option[value=custom-one]').waitFor({state:'detached'});assert.equal(settings.sounds.length,0);
  assert.deepEqual(errors,[]);console.log('Notification sound selection, server restore, clipping, playback, deletion and mobile layout passed');
}finally{await browser.close();}
