import {chromiumLaunchOptions,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||resolveTestDependency('playwright'));
const root=resolve('rollback/production-assets');

const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  let file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!existsSync(file)) file=resolve('.', '.'+path);
  if(!existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(readFileSync(file));
});

await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port;
let browser;

try{
  browser=await chromium.launch(chromiumLaunchOptions());
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));

  const user={id:1,login:'tsovak',name:'Tsovak',role:'DEVELOPER',active:1};
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data={};
    if(path==='/api/database-context')data={provider:'d1',revision:3,scope:'site'};
    if(path==='/api/auth/providers')data={google:true,microsoft:false,telegram:false};
    if(path==='/api/me'||path==='/api/me/account')data={user};
    if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:1},stageActivity:{}};
    if(path==='/api/me/themes')data={theme:'light',themes:[],revision:0,customRevision:0};
    if(path==='/api/groups')data={groups:[]};
    if(path==='/api/lessons')data={materials:[]};
    if(path==='/api/exams')data={exams:[]};
    if(path==='/api/exams/work')data={work:[]};
    if(path==='/api/messages')data={rooms:[],groups:[],contacts:[],unread:{},total:0};
    if(path.includes('IRREGULAR'))data={documents:{},cards:[{"base":"be","past":"was / were","pp":"been","level":"1","note":"was with I, he, she and it.","ru":"быть"}],next:null};
    else if(path.includes('catalogs'))data={documents:{},cards:[],next:null};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });

  await page.goto('http://127.0.0.1:'+port, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.body.hasAttribute('data-shell-pending'));
  await page.waitForFunction(()=>typeof window.enquizVisit==='function');

  // 1. Visit verbs levels view
  await page.evaluate(()=>window.enquizVisit('verbs'));
  await page.waitForSelector('[data-verb-level="1"]');
  const levelsHidden=await page.$eval('#verbStudyRow',el=>el.hidden);
  assert.equal(levelsHidden,false,'#verbStudyRow is visible on levels view');

  // 2. Open level 1 verbs
  await page.click('[data-verb-level="1"]');
  await page.waitForSelector('[data-verb="be"]');
  const listHidden=await page.$eval('#verbStudyRow',el=>el.hidden);
  assert.equal(listHidden,false,'#verbStudyRow is visible on level verb list view');

  // 3. Open triplet cards for 'be'
  await page.click('[data-verb="be"]');
  await page.waitForSelector('.verb-form-cards');
  const tripletHidden=await page.$eval('#verbStudyRow',el=>el.hidden);
  assert.equal(tripletHidden,true,'#verbStudyRow is hidden on triplet cards view');

  const subText=await page.$eval('#verbSub',el=>el.textContent);
  assert.equal(subText,'Three cards, one for each form.','Sub text does not mention Study');

  const formCardsCount=await page.$$eval('.verb-form-cards .card',cards=>cards.length);
  assert.equal(formCardsCount,3,'Three form cards are rendered');

  // 4. Navigate back to level list
  await page.click('#verbs [data-nav-back]');
  await page.waitForSelector('[data-verb="be"]');
  const backHidden=await page.$eval('#verbStudyRow',el=>el.hidden);
  assert.equal(backHidden,false,'#verbStudyRow is visible again after navigating back');

  assert.equal(errors.length,0,'No uncaught page errors: '+errors.join('; '));
  console.log('Irregular verbs triplet study button removal and subtitle verification passed');
}finally{
  if(browser)await browser.close();
  server.close();
}
