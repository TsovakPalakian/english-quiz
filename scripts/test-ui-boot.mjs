// Isolated browser regression: synthetic responses, no production account data.
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=resolve('rollback/turso-production-assets');
const server=createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  const file=resolve(root,name==='/'?'index.html':'.'+name);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream';
  res.writeHead(200,{'Content-Type':type});res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const page=await browser.newPage();const errors=[],requests=[];
  page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR',error.stack);});
  const user={id:'a'.repeat(32),login:'fixture_dev',name:'Fixture',email:'fixture@example.invalid',role:'DEVELOPER'};
  let selectedTheme='almond',themeRevision=0,customRevision=1;
  let customThemes=['first','second'].map((name,index)=>({id:'user-'+name,name:'Picture '+name,owner:user.login,
    vars:{'--bg':'#eef5f2','--card':'#ffffff','--acc':'#127569'},photo:'stage-local/themes/1/user-'+name+'/'+(index?'b':'a').repeat(64)}));
  let signedIn=true,revision=1,songActive=true,heldBlock=null;
  const archived=new Map();
  let exam={id:11,title:'Fixture exam',date:'2026-10-10',published:false,blocks:[{id:12,title:'Fixture examination block',published:false,materials:[{id:13,type:'text',tab:'overview',html:'<p>Fixture material</p>'}]}]};
  const song={id:21,stageId:21,stageRevision:1,stageScope:'profile',title:'Fixture song',artist:'Fixture',kind:'song',lyrics:'Fixture lyrics',marks:{}};
  let lesson={id:31,stageRevision:1,title:'Fixture lesson',published:true,date:'2026-10-10',blocks:[{id:32,type:'text',tab:'overview',html:'<p>Fixture lesson</p>'}],mode:'preview'};
  let holdLessonSummary=false,releaseLessons;
  page.on('dialog',dialog=>dialog.accept());
  const handleApi=async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();requests.push(path);
    let data={};
    if(path==='/api/login')signedIn=true;
    if(path==='/api/logout')signedIn=false;
    if(path==='/api/me'||path==='/api/login')data={user:signedIn?user:null};
    if(path==='/api/me/account')data={user,locked:false};
    if(path==='/api/me/themes')data={accountId:user.id,theme:selectedTheme,themes:customThemes,stageThemeRevision:themeRevision,stageCustomRevision:customRevision};
    if(path==='/api/me/theme'){const body=JSON.parse(route.request().postData());selectedTheme=body.theme;themeRevision++;data={theme:selectedTheme,revision:themeRevision};}
    if(path==='/api/me/custom-themes'){const body=JSON.parse(route.request().postData());customThemes=body.themes;customRevision++;data={themes:customThemes,revision:customRevision};}
    if(path==='/api/theme-photo'){await route.fulfill({status:200,contentType:'image/jpeg',body:readFileSync(resolve(root,'almond-blossom.jpg'))});return;}
    if(path==='/api/me/state')data={bootstrap:true,archiveRevision:revision,stageThemeRevision:themeRevision,stageCustomRevision:customRevision,stats:{theme:selectedTheme,customThemes},added:[],songs:[],settings:{},counts:{songs:songActive?1:0,lessons:1},stageActivity:{}};
    if(path==='/api/stats')data={statisticsSource:'turso-activity',legacyHistoryIncluded:false,scope:'user',from:'2026-10-04',to:'2026-10-10',activity:{answers:3,correct:2,series:[]}};
    if(path==='/api/exams'){
      if(method==='POST'){exam=JSON.parse(route.request().postData()).exam;data=exam;}
      else data={exams:[exam]};
    }
    if(path==='/api/exams/work')data={work:[]};
    if(path==='/api/groups')data={groups:[{id:41,title:'Fixture group',date:'2026-10-10',lessonIds:[31]}]};
    if(path==='/api/lessons'){
      if(method!=='GET')throw Error('Examination publication must not write lessons');
      if(holdLessonSummary&&url.searchParams.get('summary')==='1')await new Promise(resolve=>{releaseLessons=resolve;});
      data={materials:[url.searchParams.has('id')?lesson:{...lesson,blocks:[],stageLessonDeferred:true}]};
    }
    if(path==='/api/me/songs')data={songs:songActive?[song]:[],next:null};
    if(path==='/api/archive'){
      if(method==='POST'){
        const body=JSON.parse(route.request().postData()),key=body.type+':'+body.id;
        if(body.action==='archive'){
          archived.set(key,{type:body.type,id:body.id,title:body.type==='song'?song.title:'Fixture examination block',archivedByName:user.login,archivedAt:1});
          if(body.type==='song')songActive=false;
          if(body.type==='exam-block'){heldBlock=exam.blocks.find(b=>String(b.id)===String(body.id));exam.blocks=exam.blocks.filter(b=>String(b.id)!==String(body.id));}
        }else{
          archived.delete(key);
          if(body.action==='restore'&&body.type==='song')songActive=true;
          if(body.action==='restore'&&body.type==='exam-block')exam.blocks.push(heldBlock);
        }
        data={type:body.type,id:body.id,revision:++revision,[body.action==='archive'?'archived':body.action==='restore'?'restored':'removed']:true};
      }else data={revision,items:[...archived.values()]};
    }
    if(path==='/api/bugs')data={heads:[]};
    if(path.includes('catalogs'))data={documents:{},cards:[],next:null};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  };
  await page.route('**/api/**',handleApi);
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>typeof window.enquizVisit==='function');
  await page.locator('[data-jump="account"]:visible').first().click();
  await page.locator('[data-account="edit-password"]').waitFor();
  await page.locator('[data-account="edit-password"]').click();
  assert.equal(await page.locator('#ownPasswordForm').isVisible(),true);
  await page.locator('[data-account="edit-details"]').click();
  assert.equal(await page.locator('#ownAccountForm').isVisible(),true);
  await page.locator('[data-display-open]:visible').click();
  await page.locator('button[data-display-size="large"]').click();
  assert.equal(await page.locator('html').getAttribute('data-display-size'),'large');
  await page.locator('#highVisibility').check({force:true});
  assert.equal(await page.locator('html').getAttribute('data-high-visibility'),'1');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()),'#000000');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('[data-jump="stats"]:visible').first().click();
  await page.locator('[data-stats-mode="learning"]').waitFor();
  for(const mode of ['learning','materials','exams','activity','details','system','overview']){
    await page.locator('[data-stats-mode="'+mode+'"]').click();
    assert.equal(await page.locator('[data-stat-panel="'+mode+'"]').isVisible(),true,mode);
    assert.equal(await page.locator('.stat-panel:visible').count(),1);
  }
  for(const days of [7,30,90]){
    await page.locator('[data-stats-range="'+days+'"]').click();
    assert.match(await page.locator('[data-stats-range="'+days+'"]').getAttribute('class'),/primary/);
  }
  await page.screenshot({path:'/private/tmp/english-quiz-statistics-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/private/tmp/english-quiz-statistics-mobile.png'});
  await page.setViewportSize({width:1280,height:900});
  await page.locator('[data-jump="archive"]:visible').click();
  await page.locator('#archiveList').getByText('Archive is empty.').waitFor();
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('section.on')?.id==='archive'&&document.querySelector('#archiveList')?.textContent.includes('Archive is empty.'));
  await page.locator('[data-jump="library"]:visible').click();
  await page.locator('[data-jump="archive"]:visible').click();
  const archiveRequests=requests.filter(path=>path==='/api/archive').length;
  await page.locator('[data-jump="library"]:visible').click();
  await page.locator('[data-jump="archive"]:visible').click();
  assert.equal(requests.filter(path=>path==='/api/archive').length,archiveRequests);
  await page.locator('[data-jump="groups"]:visible').click();
  await page.locator('[data-group-open="41"]').click();
  assert.equal(await page.locator('section.on').getAttribute('id'),'days');
  assert.equal(await page.locator('#lmGroupTitle').innerText(),'Lessons');
  assert.equal(await page.locator('#lmGroupName').innerText(),'Fixture group');
  assert.deepEqual(await page.locator('#days .page-path li').allTextContents(),['Groups','Fixture group']);
  await page.locator('[data-lm-open="31"]').click();
  await page.locator('#material.on').waitFor();
  await page.waitForFunction(()=>document.querySelector('#material .page-path')?.textContent.includes('Fixture lesson'));
  assert.deepEqual(await page.locator('#material .page-path li').allTextContents(),['Groups','Fixture group','Fixture lesson']);
  await page.locator('#material [data-page-path="days"]').click();
  await page.locator('#days.on').waitFor();
  await page.locator('[data-lm-open="31"]').click();
  await page.locator('[data-jump="exams"]:visible').click();
  await page.locator('[data-exam-open="11"]').click();
  assert.equal(await page.locator('#examBlocksName').innerText(),'Fixture exam');
  assert.deepEqual(await page.locator('#examblocks .page-path li').allTextContents(),['Exams','Fixture exam']);
  await page.locator('[data-exam-block="12"]').click();
  assert.deepEqual(await page.locator('#material .page-path li').allTextContents(),['Exams','Fixture exam','Fixture examination block','Edit']);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/private/tmp/english-quiz-breadcrumb-mobile.png'});
  assert.ok(await page.locator('#material .page-path').evaluate(node=>node.scrollWidth<=node.clientWidth),'Breadcrumbs fit mobile');
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'/private/tmp/english-quiz-breadcrumb-desktop.png'});
  await page.locator('#lmPublish').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('enquiz-exams'))[0]?.blocks[0]?.doc.published);
  assert.equal(exam.blocks[0].published,true);
  await page.locator('#material [data-nav-back]').first().click();
  await page.locator('#examblocks.on').waitFor();
  await page.locator('[data-exam-del="block:12"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-exam-block="12"]'));
  await page.locator('[data-jump="archive"]:visible').click();
  await page.locator('[data-archive-restore="exam-block:12"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-archive-restore="exam-block:12"]'));
  await page.locator('[data-jump="exams"]:visible').click();
  await page.locator('[data-exam-open="11"]').click();
  await page.locator('[data-exam-block="12"]').waitFor();
  await page.locator('[data-jump="library"]:visible').click();
  await page.locator('[data-jump="music"]:visible').click();
  await page.locator('[data-stage-library-action="delete"][data-library-id="21"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-lyric="21"]'));
  await page.locator('[data-jump="archive"]:visible').click();
  await page.locator('[data-archive-restore="song:21"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-archive-restore="song:21"]'));
  await page.locator('[data-jump="library"]:visible').click();
  await page.locator('[data-jump="music"]:visible').click();
  await page.locator('[data-lyric="21"]').waitFor();
  await page.locator('[data-stage-library-action="delete"][data-library-id="21"]').click();
  await page.locator('[data-jump="archive"]:visible').click();
  await page.locator('[data-archive-remove="song:21"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-archive-remove="song:21"]'));
  await page.locator('[data-jump="account"]:visible').first().click();
  await page.locator('#profile [data-jump="themes"]').click();
  await page.locator('#themes [data-th="user-first"]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.paintedTheme==='user-first'&&document.documentElement.style.getPropertyValue('--theme-photo').includes('data:image/jpeg'));
  await page.waitForFunction(()=>!window.TursoMain.themeSavePending());assert.equal(selectedTheme,'user-first');
  await page.reload();
  await page.locator('[data-jump="archive"]:visible').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.paintedTheme),'user-first');
  await page.locator('#themes [data-th="user-second"]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.paintedTheme==='user-second'&&document.documentElement.style.getPropertyValue('--theme-photo').includes('data:image/jpeg'));
  await page.waitForFunction(()=>!window.TursoMain.themeSavePending());assert.equal(selectedTheme,'user-second');
  await page.locator('[data-theme-edit="user-second"]').click();
  await page.locator('#customThemeVeil').press('ArrowRight');
  assert.match(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--theme-photo')),/data:image\/jpeg/);
  await page.locator('#customThemeName').fill('Renamed picture');
  await page.locator('#customThemeSubmit').click();
  await page.getByText('Theme saved.',{exact:true}).waitFor();
  assert.equal(customThemes.find(row=>row.id==='user-second').name,'Renamed picture');
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.dataset.paintedTheme==='user-second'&&document.documentElement.style.getPropertyValue('--theme-photo').includes('data:image/jpeg'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('enquiz-theme')),'user-second');
  await page.screenshot({path:'/private/tmp/english-quiz-theme-empty-cache.png'});
  await page.locator('[data-jump="account"]:visible').first().click();
  await page.locator('[data-account="logout"]:visible').click();
  await page.getByText('See you soon',{exact:true}).waitFor();
  assert.equal(await page.locator('section.on').getAttribute('id'),'home');
  assert.equal(signedIn,false);
  await page.locator('[data-jump="account"]:visible').first().click();
  await page.locator('#loginForm [name="login"]').fill(user.login);
  await page.locator('#loginForm [name="password"]').fill('fixture-only');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.waitForFunction(()=>accountReady&&document.documentElement.dataset.paintedTheme==='user-second'&&document.documentElement.style.getPropertyValue('--theme-photo').includes('data:image/jpeg'));
  assert.equal(signedIn,true);assert.equal(selectedTheme,'user-second');
  signedIn=true;holdLessonSummary=true;
  exam.blocks[0].published=false;exam.published=false;lesson={...lesson,id:12};
  const racePage=await browser.newPage();
  racePage.on('pageerror',error=>errors.push(error.message));await racePage.route('**/api/**',handleApi);
  await racePage.goto('http://127.0.0.1:'+server.address().port);
  await racePage.locator('[data-jump="archive"]:visible').waitFor();
  await racePage.locator('[data-jump="exams"]:visible').click();
  await racePage.locator('[data-exam-open="11"]').click();
  await racePage.locator('[data-exam-block="12"]').click();
  await racePage.locator('#lmPublish:visible').waitFor();
  assert.ok(releaseLessons,'Background lesson request must overlap exam editing');
  const pulled=racePage.waitForResponse(response=>response.url().includes('/api/lessons?summary=1'));
  holdLessonSummary=false;releaseLessons();await pulled;
  await racePage.waitForFunction(()=>JSON.parse(localStorage.getItem('enquiz-material-demo')||'{}').materials?.some(row=>row.id===12));
  await racePage.locator('#lmTitle').fill('Published examination fixture');
  assert.equal(await racePage.evaluate(()=>lmState?.examOwned),true);
  const publication=racePage.waitForResponse(response=>response.url().endsWith('/api/exams')&&response.request().method()==='POST');
  await racePage.locator('#lmPublish').click();await publication;
  await racePage.locator('#lmPreview:visible').waitFor();
  assert.equal(exam.blocks[0].published,true);assert.equal(exam.blocks[0].title,'Published examination fixture');
  await racePage.reload();
  await racePage.locator('#material[data-lm-kind="exam"]').waitFor({state:'visible'});
  await racePage.getByRole('heading',{name:'Published examination fixture',exact:true}).waitFor();
  assert.equal(exam.blocks[0].published,true);
  await racePage.locator('#material [data-nav-back]').first().click();
  await racePage.locator('[data-exam-block="12"]').getByText('Published',{exact:true}).waitFor();
  await racePage.reload();await racePage.locator('[data-exam-block="12"]').getByText('Published',{exact:true}).waitFor();
  assert.equal(exam.blocks[0].published,true);
  await racePage.screenshot({path:'/private/tmp/english-quiz-exam-publish-test.png'});
  assert.deepEqual(errors,[]);
  console.log('UI boot, account, statistics, groups, publication, archive/restore/permanent removal, theme switching/reload/empty cache/relogin and logout passed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
