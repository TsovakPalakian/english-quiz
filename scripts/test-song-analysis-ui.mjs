import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=resolve('rollback/turso-production-assets');
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'});res.end(readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],cards=[],offsets=[],requests=[],bugs=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  const user={id:'a'.repeat(32),login:'fixture',name:'Fixture',role:'USER'};
  let song,revision=0,active=0,peak=0,failLookup=true;
  const expressions=[{exactText:'Cool down',canonicalForm:'cool down',type:'PHRASAL_VERB',meaning:'become calm'},{exactText:'Take it easy',canonicalForm:'take it easy',type:'IDIOM',meaning:'relax'}];
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();let data={};
    requests.push(method+' '+path);if(path==='/api/bugs'&&method==='POST')bugs.push(route.request().postData());
    if(path==='/api/me'||path==='/api/me/account')data={user};
    if(path==='/api/me/state')data={bootstrap:true,stats:{},added:cards,songs:[],settings:{},counts:{songs:song?1:0},stageAddedRevision:revision,stageActivity:{}};
    if(path==='/api/me/themes')data={theme:'almond',themes:[],revision:0,customRevision:0};
    if(path==='/api/me/cards')data={cards,next:null,stageAddedRevision:revision};
    if(path==='/api/cards')data=(url.searchParams.get('q')==='man'?[{id:10,en:'man',revision:1,scope:'shared'}]:[]);
    if(path==='/api/me/cards/new'||path==='/api/me/cards'&&method==='POST'){
      peak=Math.max(peak,++active);const body=JSON.parse(route.request().postData());assert.equal(body.expectedRevision,revision);await new Promise(resolve=>setTimeout(resolve,10));
      const input=body.card||{en:'man',ru:'adult male'},card={word:input.en,en:input.en,ru:input.ru,place:body.place||input.place,stageId:body.cardId||100+cards.length,stageRevision:1,stageScope:body.cardId?'shared':'profile'};
      cards.push(card);data={card,revision:++revision};active--;
    }
    if(path==='/api/groups')data={groups:[]};if(path==='/api/lessons')data={materials:[]};if(path==='/api/exams')data={exams:[]};if(path==='/api/exams/work')data={work:[]};
    if(path==='/api/messages')data={rooms:[],groups:[],contacts:[],unread:{},total:0};
    if(path==='/api/me/songs')data={songs:song?[song]:[],next:null};
    if(path==='/api/library'||path==='/api/library/55'){
      if(method!=='GET'){const {changes}=JSON.parse(route.request().postData());song={...song,...changes,id:55,stageId:55,stageRevision:(song?.stageRevision||0)+1,stageScope:'profile',kind:'song',marks:changes.marks||song?.marks||{}};}
      data={item:song};
    }
    if(path==='/api/analyze'){
      const offset=JSON.parse(route.request().postData()).reviewOffset||0;offsets.push(offset);
      data={expressions:expressions.map((row,index)=>({...row,...(index===offset?{llmDecision:{applied:true}}:{})})),wordLemmas:{running:'run'},stats:{llmCandidates:2,llmPartial:true,reviewedExpressions:[expressions[offset]],nextReviewOffset:offset===0?1:null}};
    }
    if(path==='/api/phrase-card'){const body=JSON.parse(route.request().postData());data={card:{word:body.canonicalForm,ru:body.meaning,place:body.type==='IDIOM'?'idioms':'phrasal'}};}
    if(path.includes('catalogs'))data={documents:{},cards:[],next:null};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.route('**/lookup?*',route=>{
    const word=new URL(route.request().url()).searchParams.get('word');
    if(word==='offline'&&failLookup)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture timeout'})});
    if(word==='sagabona')return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({found:false})});
    return route.fulfill({contentType:'application/json',body:JSON.stringify({found:true,word,ru:'translation'})});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>accountReady);
  await page.evaluate(()=>window.enquizVisit('lyricadd'));
  await page.locator('#lyricTitle').fill('Fixture song');await page.locator('#lyricText').fill('man night train running. Cool down. Take it easy. sagabona offline');
  await page.locator('#lyricGo').click();
  await page.waitForFunction(()=>document.querySelector('#songUser [data-lyric-check]')?.textContent.includes('another check')).catch(async error=>{console.error(await page.evaluate(()=>({status:document.querySelector('#songUser [data-lyric-check]')?.textContent,notice:document.body.innerText.slice(-1500),songs:loadSongs()})));console.error({offsets,cards,revision,requests,bugs});throw error;});
  assert.deepEqual(offsets,[0,1]);assert.equal(peak,1);
  assert.equal(await page.locator('#songUser [data-lyric-open="man"]').evaluate(node=>node.classList.contains('lyric-miss')),false);
  assert.equal(await page.locator('#songUser [data-lyric-open="run"]').count(),1);
  assert.equal(await page.locator('#songUser [data-lyric-open="sagabona"].lyric-miss').count(),1);
  assert.equal(await page.locator('#songUser [data-lyric-open="offline"].lyric-unchecked').count(),1);
  assert.equal(await page.locator('#songUser [data-lyric-open="cool down"]').count(),1);
  const previous=cards.length;failLookup=false;
  await page.locator('[data-lyric-edit]').click();await page.locator('[data-lyric-recheck]').click();
  await page.waitForFunction(()=>document.querySelector('#songUser [data-lyric-check]')?.textContent.includes('not found')&&!document.querySelector('#songUser [data-lyric-check]').textContent.includes('another check'));
  assert.equal(cards.length,previous+1,'Retry adds only the previously failed word');
  assert.equal(await page.locator('#songUser .lyric-unchecked').count(),0);
  assert.equal(await page.locator('#songUser .lyric-miss').count(),1);
  await page.screenshot({path:'/private/tmp/song-analysis-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/song-analysis-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('Real song add/recheck, serial writes, AI continuation, lemma aliases, failure colors and duplicate prevention passed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
