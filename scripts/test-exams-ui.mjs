import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=resolve('rollback/turso-production-assets');
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'});res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],writes=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  const user={id:'a'.repeat(32),login:'fixture',name:'Fixture',role:'DEVELOPER'};
  const groups=[{id:41,title:'A1 Group',studentCount:4,lessonIds:[31],examIds:[11]},{id:42,title:'A1 Empty',studentCount:0,lessonIds:[],examIds:[]},{id:43,title:'B1 Group',studentCount:1,lessonIds:[],examIds:[]}];
  const block={id:12,title:'Examination block',published:true,materials:[{id:13,type:'text',tab:'overview',html:'<p>Fixture</p>'}]};
  const exams=[{id:11,title:'A1 Exam',groupId:41,groupTitle:'A1 Group',date:'2026-10-15',published:true,blocks:[block]},
    {id:21,title:'A1 Assigned',groupId:41,groupTitle:'A1 Group',studentId:'b'.repeat(32),studentName:'Student',instanceStatus:'ready',published:true,blocks:[{...block,id:22}]},
    {id:31,title:'A1 Completed',groupId:41,groupTitle:'A1 Group',studentId:'b'.repeat(32),instanceStatus:'completed',published:true,blocks:[{...block,id:32}]}];
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;if(route.request().method()!=='GET')writes.push(path);
    let data={};
    if(path==='/api/me'||path==='/api/me/account')data={user};
    if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:1},stageActivity:{}};
    if(path==='/api/me/themes')data={theme:'almond',themes:[],revision:0,customRevision:0};
    if(path==='/api/groups')data={groups:groups.map(group=>({...group,date:'2026-10-15',revision:1}))};
    if(path==='/api/lessons')data={materials:[{id:31,stageRevision:1,title:'Fixture lesson',published:true,date:'2026-10-15',blocks:[]}]};
    if(path==='/api/exams')data={exams};
    if(path==='/api/exams/work')data={work:[]};
    if(path==='/api/messages')data={rooms:[],groups:[],contacts:[],unread:{},total:0};
    if(path.includes('catalogs'))data={documents:{},cards:[],next:null};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady);
  await page.evaluate(()=>window.enquizVisit('exams'));
  await page.locator('[data-exam-level="A1"]').waitFor();
  await page.waitForFunction(()=>document.getElementById('examOverview')?.textContent.includes('5 students'));
  assert.equal(await page.locator('#examSections').isVisible(),false);
  assert.equal(await page.locator('#examListSearch').isVisible(),false);
  assert.match(await page.locator('#examOverview').innerText(),/3 groups.*5 students.*1 exam.*2 assigned works.*1 ready for review.*1 completed/);
  assert.match(await page.locator('.side [data-jump="exams"],aside [data-jump="exams"]').first().innerText(),/Exams.*1/);
  await page.locator('[data-exam-level="A1"]').click();
  assert.equal(await page.locator('[data-exam-group-view]').count(),2,'Empty lesson subgroups remain visible');
  assert.equal(await page.locator('#examList button').filter({hasText:/^Back$/}).count(),0);
  await page.locator('[data-exam-group-view="41"]').click();
  assert.equal(await page.locator('#examSections').isVisible(),true);
  assert.equal(await page.locator('#examListSearch').isVisible(),true);
  assert.equal(await page.locator('#examNew').isVisible(),true);
  assert.equal(await page.locator('#exams .page-path').innerText(),'Exams\nA1\nA1 Group');
  assert.match(await page.locator('[data-exam-open="11"]').innerText(),/1 examination block/);
  await page.locator('[data-exam-section="ready"]').click();
  assert.equal(await page.locator('[data-exam-open="21"]').count(),1);
  assert.equal(await page.locator('[data-exam-open="11"]').count(),0);
  await page.locator('[data-exam-section="completed"]').click();
  assert.equal(await page.locator('[data-exam-open="31"]').count(),1);
  await page.locator('[data-exam-section="active"]').click();
  await page.locator('#examListSearch').fill('missing');await page.waitForFunction(()=>document.querySelector('#examList .day-row')?.hidden);
  await page.locator('#examListSearch').fill('');await page.locator('[data-exam-open="11"]').click();
  assert.equal(await page.locator('#examblocks .page-path').innerText(),'Exams\nA1\nA1 Group\nA1 Exam');
  assert.equal(writes.filter(path=>['/api/groups','/api/lessons','/api/exams'].includes(path)).length,0,'Browsing does not rewrite content: '+writes.join(','));
  await page.locator('[data-exam-block="12"]').click();
  await page.evaluate(()=>lmShow('edit'));
  assert.match(await page.locator('#material .page-path').innerText(),/Exams\nA1\nA1 Group\nA1 Exam\nExamination block\nEdit/);
  await page.locator('#lmAdd').click();
  assert.equal(await page.locator('[data-material-quiz-menu]').count(),0);
  assert.equal(await page.locator('[data-material-quiz-types]').isVisible(),true);
  assert.equal(await page.locator('[data-quiz="Choice"]').innerText(),'Quiz \u2022 Choice');
  for(const width of [1280,390,320]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.locator('#material').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Exam editor fits '+width);
  }
  await page.locator('#material [data-path-exam-group="41"]').click();
  await page.locator('#examListSearch').focus();
  assert.equal(await page.locator('#examListSearch').evaluate(node=>getComputedStyle(node).outlineOffset),'-2px');
  assert.ok(await page.locator('#exams').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Exam list fits smallest viewport');
  await page.screenshot({path:'/private/tmp/exams-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/private/tmp/exams-desktop.png',fullPage:true});
  await page.evaluate(()=>{lmState={id:99,title:'Lesson',mode:'edit',tab:'overview',blocks:[]};window.enquizVisit('material');lmShow('edit');});
  await page.locator('#lmAdd').click();
  assert.equal(await page.locator('[data-material-quiz-menu]').count(),1,'Lesson quiz menu is unchanged');
  assert.equal(await page.locator('#material').evaluate(node=>node.classList.contains('is-exam')),false);
  assert.deepEqual(await page.evaluate(()=>examPagePath({id:99,title:'Unassigned exam'}).map(item=>item.label)),['Exams','Unassigned','Unassigned','Unassigned exam'],'Direct exam links do not inherit an unrelated group');
  assert.equal(writes.filter(path=>['/api/groups','/api/lessons'].includes(path)).length,0,'Exam UI does not write Groups or Lessons: '+writes.join(','));
  assert.deepEqual(errors,[]);console.log('Exam-only navigation, counts, filters, breadcrumbs, responsive controls and lesson isolation passed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
