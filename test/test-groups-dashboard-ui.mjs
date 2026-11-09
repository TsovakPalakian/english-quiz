import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
const root=resolve('rollback/production-assets');
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'});res.end(readFileSync(file));
});
await new Promise(res=>server.listen(0,'127.0.0.1',res));
const port=server.address().port;
const browser=await launchChromium(chromium);

try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],writes=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});

  const user={id:'a'.repeat(32),login:'teacher',name:'Teacher',role:'DEVELOPER'};
  // Group set designed to test singular & plural counts across levels and subgroups:
  // A1: 3 groups (plural), diverse students and lessons
  // B1: exactly 1 group (singular), 1 student (singular), 1 lesson (singular)
  const groups=[
    {id:101,title:'A1 Beta',date:'2026-02-15',studentCount:1,lessonIds:[201],revision:1},
    {id:102,title:'A1 Alpha',date:'2026-01-10',studentCount:2,lessonIds:[202,203],revision:1},
    {id:103,title:'A1 Gamma',date:'2026-03-20',studentCount:0,lessonIds:[],revision:1},
    {id:201,title:'B1 Solo',date:'2026-04-01',studentCount:1,lessonIds:[204],revision:1}
  ];
  const lessons=[
    {id:201,stageRevision:1,title:'Lesson One',published:true,date:'2026-01-15',blocks:[]},
    {id:202,stageRevision:1,title:'Lesson Two',published:true,date:'2026-02-20',blocks:[]},
    {id:203,stageRevision:1,title:'Lesson Three',published:true,date:'2026-02-25',blocks:[]},
    {id:204,stageRevision:1,title:'Lesson Four',published:true,date:'2026-03-01',blocks:[]}
  ];

  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(route.request().method()!=='GET')writes.push(path);
    let data={};
    if(path==='/api/database-context')data={provider:'d1',revision:0,scope:'site'};
    if(path==='/api/me'||path==='/api/me/account')data={user};
    if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:2},stageActivity:{}};
    if(path==='/api/me/themes')data={theme:'almond',themes:[],revision:0,customRevision:0};
    if(path==='/api/groups')data={groups};
    if(path==='/api/groups/members')data={members:[]};
    if(path==='/api/admin/users')data={users:[]};
    if(path==='/api/lessons')data={materials:lessons};
    if(path==='/api/exams')data={exams:[]};
    if(path==='/api/archive')data={archived:true,revision:1};
    if(path==='/api/messages')data={rooms:[],groups:[],contacts:[],unread:{},total:0};
    if(path.includes('catalogs'))data={documents:{},cards:[],next:null};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });

  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady&&typeof placeBoot!=='undefined'&&placeBoot);
  await page.evaluate(async()=>{
    authUser.role='DEVELOPER';
    await groupPull(true);
    window.enquizVisit('groups');
  });
  await page.locator('#groupList .decks').waitFor();

  // 2. Check Level Cards on Root Dashboard: Pluralization, Title Case, Chevron and Symmetrical Layout
  const b1Card = page.locator('#groupList [data-group-level="B1"]');
  await b1Card.waitFor();

  // B1 singular check: Group: 1, Student: 1, Lesson: 1 in vertical column
  const b1Labels = await b1Card.locator('.metric-pairs > span > span').allTextContents();
  const b1Values = await b1Card.locator('.metric-pairs > span > b').allTextContents();
  assert.deepEqual(b1Labels, ['Group', 'Student', 'Lesson'], 'Singular counts render singular labels in Title Case');
  assert.deepEqual(b1Values, ['1', '1', '1'], 'Singular metric counts match expected values');

  // A1 plural check: Groups: 3, Students: 3 (1+2+0), Lessons: 3 (1+2+0) in vertical column
  const a1Card = page.locator('#groupList [data-group-level="A1"]');
  const a1Labels = await a1Card.locator('.metric-pairs > span > span').allTextContents();
  const a1Values = await a1Card.locator('.metric-pairs > span > b').allTextContents();
  assert.deepEqual(a1Labels, ['Groups', 'Students', 'Lessons'], 'Plural counts render plural labels in Title Case');
  assert.deepEqual(a1Values, ['3', '3', '3'], 'Plural metric counts match expected values');

  // Check card-top-row and card-chevron
  assert.equal(await b1Card.locator('.card-top-row b').innerText(), 'B1');
  assert.equal(await b1Card.locator('.card-chevron svg').count(), 1, 'Level card includes chevron svg');

  // Vertical column with space-between rows layout check
  const layout = await a1Card.locator('.metric-pairs').evaluate(el => {
    const style = window.getComputedStyle(el);
    const row = el.querySelector('span');
    const rowStyle = row ? window.getComputedStyle(row) : null;
    return {
      display: style.display,
      flexDirection: style.flexDirection,
      rowDisplay: rowStyle?.display,
      rowJustifyContent: rowStyle?.justifyContent
    };
  });
  assert.equal(layout.display, 'flex', 'metric-pairs is flex layout');
  assert.equal(layout.flexDirection, 'column', 'metric-pairs is vertical column layout');
  assert.equal(layout.rowDisplay, 'flex', 'metric-pairs rows are flex layout');
  assert.equal(layout.rowJustifyContent, 'space-between', 'metric-pairs rows distribute label and value to edges');

  // 3. Open Level A1 and test Subgroup list controls
  await a1Card.click();
  await page.locator('#groups h1').filter({hasText:'A1'}).waitFor();

  // Check sorting select presence and options
  const groupSort = page.locator('#groupSort');
  assert.equal(await groupSort.isVisible(), true, '#groupSort control is visible inside level');
  const sortOptions = await groupSort.locator('option').evaluateAll(opts => opts.map(o => ({value: o.value, text: o.text})));
  assert.deepEqual(sortOptions, [
    {value: 'date-desc', text: 'Newest first'},
    {value: 'date-asc', text: 'Oldest first'},
    {value: 'name-asc', text: 'Name (A–Z)'},
    {value: 'name-desc', text: 'Name (Z–A)'}
  ]);

  // 4. Test Subgroups Default Sorting (date-desc: 2026-03-20 Gamma, 2026-02-15 Beta, 2026-01-10 Alpha)
  const getRenderedTitles = async () => {
    return page.locator('#groupList .day-row button.day > b').allTextContents();
  };
  assert.deepEqual(await getRenderedTitles(), ['A1 Gamma', 'A1 Beta', 'A1 Alpha'], 'Default sorting is date-desc (Newest first)');

  // Test date-asc (Oldest first: Alpha 2026-01-10, Beta 2026-02-15, Gamma 2026-03-20)
  await groupSort.selectOption('date-asc');
  assert.deepEqual(await getRenderedTitles(), ['A1 Alpha', 'A1 Beta', 'A1 Gamma'], 'date-asc sorts oldest first');

  // Test name-asc (Name A-Z: A1 Alpha, A1 Beta, A1 Gamma)
  await groupSort.selectOption('name-asc');
  assert.deepEqual(await getRenderedTitles(), ['A1 Alpha', 'A1 Beta', 'A1 Gamma'], 'name-asc sorts alphabetically A-Z');

  // Test name-desc (Name Z-A: A1 Gamma, A1 Beta, A1 Alpha)
  await groupSort.selectOption('name-desc');
  assert.deepEqual(await getRenderedTitles(), ['A1 Gamma', 'A1 Beta', 'A1 Alpha'], 'name-desc sorts alphabetically Z-A');

  // 5. Check Subgroup Row layout and pluralization
  // Check Beta: studentCount 1, lessonCount 1 -> 'Student · 1', 'Lesson · 1'
  const betaRow = page.locator('#groupList .day-row').filter({hasText: 'A1 Beta'});
  const betaMetrics = await betaRow.locator('button.day .about .metric-pairs > span').allTextContents();
  assert.deepEqual(betaMetrics, ['Student · 1', 'Lesson · 1'], 'Subgroup row with 1 item uses singular Title Case');

  // Check Alpha: studentCount 2, lessonCount 2 -> 'Students · 2', 'Lessons · 2'
  const alphaRow = page.locator('#groupList .day-row').filter({hasText: 'A1 Alpha'});
  const alphaMetrics = await alphaRow.locator('button.day .about .metric-pairs > span').allTextContents();
  assert.deepEqual(alphaMetrics, ['Students · 2', 'Lessons · 2'], 'Subgroup row with >1 items uses plural Title Case');

  // Check Gamma: studentCount 0, lessonCount 0 -> 'Students · 0', 'Lessons · 0'
  const gammaRow = page.locator('#groupList .day-row').filter({hasText: 'A1 Gamma'});
  const gammaMetrics = await gammaRow.locator('button.day .about .metric-pairs > span').allTextContents();
  assert.deepEqual(gammaMetrics, ['Students · 0', 'Lessons · 0'], 'Subgroup row with 0 items uses plural Title Case');

  // 6. Check that button.day and .day-tools are separate siblings
  const toolsCount = await betaRow.locator('.day-tools').count();
  assert.equal(toolsCount, 1, '.day-tools is rendered');
  const toolsInsideDay = await betaRow.locator('button.day .day-tools').count();
  assert.equal(toolsInsideDay, 0, '.day-tools is NOT inside button.day');

  // Check that button.day contains .date, title and .about compactly
  const dayStructure = await betaRow.locator('button.day').evaluate(btn => {
    return {
      hasDate: !!btn.querySelector('.date'),
      hasTitle: !!btn.querySelector('b'),
      hasAbout: !!btn.querySelector('.about'),
      tagName: btn.tagName
    };
  });
  assert.deepEqual(dayStructure, {
    hasDate: true,
    hasTitle: true,
    hasAbout: true,
    tagName: 'BUTTON'
  }, 'button.day retains proper child elements and clickable role');

  // 7. Visual & Responsive Tests across Desktop, Tablet and Mobile viewports
  for(const width of [1280, 768, 390]) {
    await page.setViewportSize({width, height: 900});
    assert.ok(await page.locator('#groups').evaluate(node => node.scrollWidth <= node.clientWidth + 1), `Groups page fits without horizontal overflow at ${width}px`);
    assert.ok(await page.locator('#groupControls').evaluate(node => node.scrollWidth <= node.clientWidth + 1), `groupControls fits at ${width}px`);
    assert.ok(await betaRow.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `Subgroup row fits at ${width}px`);
  }
  await page.setViewportSize({width: 1280, height: 900});

  // Navigate back to root Groups to verify responsive decks
  await page.locator('#groups [data-nav-back]').click();
  await page.locator('#groupList .decks').waitFor();
  for(const width of [1280, 768, 390]) {
    await page.setViewportSize({width, height: 900});
    assert.ok(await page.locator('#groupList .decks').evaluate(node => node.scrollWidth <= node.clientWidth + 1), `Decks grid fits at ${width}px`);
  }

  console.log('Groups dashboard & subgroups UI and visual tests passed successfully.');
} finally {
  await browser.close();
  server.close();
}
