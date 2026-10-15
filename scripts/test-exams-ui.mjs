import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {examWorkflowDemo} from './exam-workflow-demo.mjs';
import {studentExamContent} from '../src/turso-exams.mjs';
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
    {id:31,title:'A1 Completed',groupId:41,groupTitle:'A1 Group',studentId:'b'.repeat(32),instanceStatus:'completed',published:true,blocks:[{...block,id:32}]},
    {id:51,title:'A1 In progress',groupId:41,groupTitle:'A1 Group',studentId:'b'.repeat(32),studentName:'Student',instanceStatus:'active',published:true,blocks:[{...block,id:52}]}];
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;if(route.request().method()!=='GET')writes.push(path);
    let data={};
    if(path==='/api/database-context')data={provider:'turso',revision:0,scope:'site'};
    if(path==='/api/me'||path==='/api/me/account')data={user};
    if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:1},stageActivity:{}};
    if(path==='/api/me/themes')data={theme:'almond',themes:[],revision:0,customRevision:0};
    if(path==='/api/groups')data={groups:groups.map(group=>({...group,date:'2026-10-15',revision:1}))};
    if(path==='/api/groups/members')data={members:[{accountId:'b'.repeat(32),groupId:41},{accountId:'c'.repeat(32),groupId:43}]};
    if(path==='/api/admin/users')data={users:[{id:'b'.repeat(32),name:'Student',role:'USER',active:1},{id:'c'.repeat(32),name:'Outside student',role:'USER',active:1}]};
    if(path==='/api/lessons')data={materials:[{id:31,stageRevision:1,title:'Fixture lesson',published:true,date:'2026-10-15',blocks:[]}]};
    if(path==='/api/exams')data={exams};
    if(path==='/api/exams/work')data={work:[]};
    if(path==='/api/messages')data={rooms:[],groups:[],contacts:[],unread:{},total:0};
    if(path.includes('catalogs'))data={documents:{},cards:[],next:null};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady);
  await page.evaluate(()=>{
    const previous=stageEverydayData,before=JSON.stringify(studyCards());
    stageEverydayData={groups:[{title:'Optional vocabulary',topics:[{title:'Test',entries:[{card:{stageId:99999991,en:'optionalessentialfixture',ru:'optional'}}]}]}]};
    try{
      if(JSON.stringify(studyCards())!==before)throw Error('Essential English changed the required study set');
      if(!collectCards().some(row=>row.kind==='essential'&&row.en==='optionalessentialfixture'))throw Error('Optional words disappeared from All words');
      if(allStudyCards().some(card=>card?.en==='optionalessentialfixture'))throw Error('Optional-only word entered the general study queue');
    }finally{stageEverydayData=previous;}
  });
  await page.evaluate(()=>window.enquizVisit('exams'));
  await page.locator('[data-exam-level="A1"]').waitFor();
  await page.waitForFunction(()=>document.getElementById('examOverview')?.textContent.includes('students · 5'));
  assert.equal(await page.locator('#examSections').isVisible(),false);
  assert.equal(await page.locator('#examListSearch').isVisible(),false);
  assert.deepEqual(await page.locator('#examOverview .metric-pairs>span').allTextContents(),['group · 3','students · 5','exam · 1','assigned works · 1','ready for review · 1','completed · 1']);
  assert.match(await page.locator('.side [data-jump="exams"],aside [data-jump="exams"]').first().innerText(),/Exams.*1/);
  await page.locator('[data-exam-level="A1"]').click();
  assert.deepEqual(await page.locator('[data-exam-group-view="41"] .metric-pairs>span').allTextContents(),['group · 1','students · 4','exam · 1','assigned · 1','ready · 1','completed · 1']);
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('[data-exam-group-view="41"] .metric-pairs>span').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).whiteSpace==='nowrap'&&node.scrollWidth<=node.clientWidth+1)),'Compact labels fit '+width);}await page.screenshot({path:'/private/tmp/compact-exam-metrics.png'});await page.setViewportSize({width:1280,height:900});
  assert.equal(await page.locator('[data-exam-group-view]').count(),2,'Empty lesson subgroups remain visible');
  assert.equal(await page.locator('#examList button').filter({hasText:/^Back$/}).count(),0);
  await page.locator('[data-exam-group-view="41"]').click();
  assert.equal(await page.locator('#examSections').isVisible(),true);
  assert.equal(await page.locator('#examListSearch').isVisible(),true);
  assert.equal(await page.locator('#examNew').isVisible(),true);
  assert.equal(await page.locator('#exams .page-path').innerText(),'Exams\nA1\nA1 Group');
  assert.match(await page.locator('[data-exam-open="11"]').innerText(),/1 examination block/);
  assert.equal(await page.locator('[data-exam-open="51"]').count(),0,'Assigned copies are not templates');
  assert.equal(await page.locator('[data-exam-hide="exam:11"] + [data-exam-assign="11"]').count(),1,'Assign follows visibility');
  await page.locator('[data-exam-assign="11"]').click();await page.locator('.exam-assign-dialog[open]').waitFor();
  assert.deepEqual(await page.locator('.exam-assign-dialog select option').allTextContents(),['Student']);
  await page.locator('.exam-assign-dialog [data-close]').click();
  await page.locator('[data-exam-section="assigned"]').click();
  assert.equal(await page.locator('[data-exam-open="51"]').isVisible(),true);
  assert.equal(await page.locator('#examNew').isVisible(),false);
  exams.find(exam=>exam.id===51).instanceStatus='ready';
  await page.evaluate(async()=>{await examPull(true);examPaintList();});
  assert.equal(await page.locator('#examOverview .metric-pairs>span').nth(3).innerText(),'assigned works · 0');
  assert.equal(await page.locator('[data-exam-open="51"]').count(),0,'Submitted work leaves Assigned works');
  exams.find(exam=>exam.id===51).instanceStatus='active';
  await page.evaluate(async()=>{await examPull(true);examPaintList();});
  await page.locator('[data-exam-section="ready"]').click();
  assert.equal(await page.locator('[data-exam-open="51"]').count(),0);
  assert.equal(await page.locator('#examNew').isVisible(),false);
  assert.equal(await page.locator('[data-exam-open="21"]').count(),1);
  assert.equal(await page.locator('[data-exam-open="11"]').count(),0);
  const studentGroup=page.locator('[data-exam-student="'+ 'b'.repeat(32)+'"]');
  assert.match(await studentGroup.locator('summary').innerText(),/Student.*1 exam/s);
  assert.equal(await studentGroup.locator('[data-exam-open="21"]').isVisible(),true,'Teacher sees submitted work inside student row');
  await studentGroup.locator('summary').click();
  assert.equal(await studentGroup.locator('[data-exam-open="21"]').isVisible(),false,'Student row collapses');
  await studentGroup.locator('summary').click();
  await page.locator('[data-exam-section="completed"]').click();
  assert.equal(await page.locator('#examNew').isVisible(),false);
  assert.equal(await page.locator('[data-exam-open="31"]').count(),1);
  assert.equal(await page.locator('[data-exam-student="'+ 'b'.repeat(32)+'"] [data-exam-open="31"]').isVisible(),true,'Completed work is also grouped by student');
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
  assert.equal(await page.locator('#examOverview .metric-pairs').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length),2);
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
  for(const examOwned of [false,true])for(const published of [false,true]){
    await page.evaluate(({examOwned,published})=>{
      authUser.role='DEVELOPER';viewAccount=null;
      lmState={...lmBlankMaterial(),id:99,title:'Container fixture',examOwned,published,mode:'preview',tab:'overview',blocks:[
        {id:'group',type:'task',contentGroup:true,assignmentId:'group',title:'Group 1',tab:'overview'},
        {id:'question',type:'text',html:'<p>How are you?</p>',assignmentKey:'group',tab:'overview'},
        {id:'answer',type:'text',html:'<p>I am fine.</p>',answerEnabled:true,maxPoints:2.5,scoringVersion:3,assignmentKey:'group',tab:'overview'},
        {id:'nested',type:'task',contentGroup:true,assignmentId:'nested',assignmentKey:'group',title:'Nested group',tab:'overview'},
        {id:'heading',type:'heading',text:'Nested content',level:'h3',assignmentKey:'nested',tab:'overview'},
        {id:'task',type:'task',assignmentId:'task',assignmentKey:'group',title:'Actual task',text:'Task question',maxPoints:1,scoringVersion:3,tab:'overview'},
        {id:'task-detail',type:'text',html:'<p>Task details</p>',assignmentKey:'task',tab:'overview'}
      ]};window.enquizVisit('material');lmShow('preview');
    },{examOwned,published});
    const group=page.locator('#lmPreview .content-group[data-assignment="group"]');
    assert.equal(await group.isVisible(),true,'Container visible in '+(examOwned?'exam':'lesson')+' published='+published);
    for(const text of ['How are you?','I am fine.','Nested content','Task details'])assert.equal(await group.getByText(text,{exact:true}).isVisible(),true,text);
    assert.equal(await group.locator(':scope>header').innerText(),examOwned?'Content group\nGroup 1':'Group 1');
    assert.equal(await group.locator(':scope>header .material-maximum,:scope>header .exam-task-score').count(),0,'Container has no task score');
    assert.equal(await group.evaluate((node,examOwned)=>getComputedStyle(node).backgroundColor!=='rgba(0, 0, 0, 0)'&&getComputedStyle(node).borderLeftWidth===(examOwned?'4px':'5px'),examOwned),true);
    assert.equal(await group.locator('.content-group').isVisible(),true);assert.equal(await group.locator('.lm-assignment').isVisible(),true);
    await page.evaluate(()=>{authUser.role='USER';lmRenderPreview();examDress();});assert.equal(await group.isVisible(),true,'Learner sees container');assert.equal(await group.getByText('How are you?',{exact:true}).isVisible(),true);
  }
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('#material').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Content group fits '+width);}await page.screenshot({path:'/private/tmp/content-group-mobile.png',fullPage:true});
  for(const examOwned of [false,true])for(const published of [false,true]){
    await page.evaluate(({examOwned,published})=>{
      authUser.role='DEVELOPER';lmState={...lmBlankMaterial(),id:99,title:'Task fixture',examOwned,published,mode:'preview',tab:'overview',blocks:[
        {id:'task',type:'task',assignmentId:'task',title:'Actual task',text:'Answer the question.',maxPoints:1,scoringVersion:3,tab:'overview'},
        {id:'question',type:'text',html:'<p>Task without Content group</p>',assignmentKey:'task',tab:'overview'},
        {id:'answer',type:'text',html:'<p>Task answer material</p>',answerEnabled:true,maxPoints:2.5,scoringVersion:3,assignmentKey:'task',tab:'overview'}
      ]};window.enquizVisit('material');lmShow('preview');
    },{examOwned,published});
    assert.equal(await page.locator('#lmPreview .lm-assignment').isVisible(),true,'Task visible without Content group');
    for(const text of ['Task without Content group','Task answer material'])assert.equal(await page.locator('#lmPreview').getByText(text,{exact:true}).isVisible(),true,text);
    await page.evaluate(()=>{authUser.role='USER';lmRenderPreview();examDress();});assert.equal(await page.locator('#lmPreview .lm-assignment').isVisible(),true,'Learner sees Task');
  }
  await page.evaluate(()=>{authUser.role='USER';viewAccount=null;examViewLevel='';examViewGroup=null;window.enquizVisit('exams');});assert.equal(await page.locator('#exams .metric-pairs').count(),0,'Students do not see staff statistics');
  const databaseActions=[];
  await page.route('**/api/developer/databases',async route=>{
    const body=route.request().postDataJSON();if(body)databaseActions.push(body);
    const data=body?(body.provider==='neon'?{provider:'neon',connected:true,database:'english',schemaVersion:body.action==='prepare'?1:0,dataTransferred:false}:{provider:'turso',connected:true}):{active:'turso',authentication:'cloudflare-d1',chat:'cloudflare-durable-objects',providers:[{id:'turso',configured:true,adapterReady:true,active:true},{id:'neon',configured:true,adapterReady:false,active:false,blocker:'PostgreSQL application adapter pending.'}]};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.evaluate(()=>{authUser.role='DEVELOPER';window.enquizVisit('admin');paintDeveloperChrome();});await page.locator('[data-database-admin]').click();await page.locator('#databaseAdmin[open]').waitFor();await page.waitForFunction(()=>document.getElementById('databaseRegistry').textContent.includes('Configured'));
  assert.equal(await page.locator('#databaseActivate').isDisabled(),true);assert.equal(await page.locator('#databaseAdmin input').count(),0,'No connection secret field in browser');
  await page.locator('[data-database-action="check"]').click();await page.locator('#databaseResult').filter({hasText:'Connected'}).waitFor();
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-database-action="prepare"]').click();await page.locator('#databaseResult').filter({hasText:'Schema 1'}).waitFor();assert.equal(await page.locator('#databaseActivate').isDisabled(),true,'Schema does not enable runtime switching');
  await page.setViewportSize({width:320,height:900});assert.ok(await page.locator('#databaseAdmin').evaluate(node=>node.scrollWidth<=node.clientWidth+1));await page.screenshot({path:'/private/tmp/database-admin-mobile.png'});await page.locator('#databaseProvider').selectOption('turso');assert.equal(await page.locator('[data-database-action="prepare"]').isVisible(),false);assert.equal(await page.locator('#databaseActivate').isDisabled(),true);await page.locator('[data-database-close]').click();assert.deepEqual(databaseActions,[{provider:'neon',action:'check'},{provider:'neon',action:'prepare'}]);
  await page.evaluate(()=>{authUser.role='ADMIN';paintDeveloperChrome();});assert.equal(await page.locator('[data-database-admin]').isVisible(),false);
  assert.equal(writes.filter(path=>['/api/groups','/api/lessons'].includes(path)).length,0,'Exam UI does not write Groups or Lessons: '+writes.join(','));
  let demoId=1000;
  for(const block of examWorkflowDemo(41).blocks){
    const parts=block.materials.map(part=>({...part,id:demoId++}));
    await page.evaluate(({title,parts})=>{authUser.role='ADMIN';viewAccount=null;lmState={...lmBlankMaterial(),id:900,examId:11,blockId:900,title,examOwned:true,published:true,assessmentReady:true,mode:'preview',tab:'overview',blocks:parts};window.enquizVisit('material');lmShow('preview');},{title:block.title,parts});
    assert.equal(await page.locator('#lmPreview [data-lm-panel]').count(),parts.filter(part=>!part.contentGroup&&part.type!=='wordcard').length,block.title+' retains every content panel');
    for(const part of parts.filter(part=>part.type==='wordcard'))assert.equal(await page.locator('[data-lm-word="'+part.id+'"]').count(),1);
    for(const width of [1280,375]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('#material').evaluate(node=>node.scrollWidth<=node.clientWidth+1),block.title+' fits '+width);}
    if(block.title.startsWith('05'))await page.screenshot({path:'/private/tmp/exam-demo-groups-mobile.png',fullPage:true});
    if(block.title.startsWith('03')){
      await page.evaluate(()=>{viewAccount={id:'b'.repeat(32),role:'USER'};lmState.studentSaved=true;lmState.assessmentState='reviewing';examDress();});
      for(const width of [1076,375,320]){
        await page.setViewportSize({width,height:900});
        const option=page.locator('#lmPreview label:has(>input[data-mq-choice])').first();
        assert.ok(await option.evaluate(node=>{const input=node.querySelector('input'),a=input.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node.lastChild);const b=range.getBoundingClientRect();return Math.abs(a.y+a.height/2-b.y-b.height/2)<5&&a.width===20&&getComputedStyle(input).opacity==='1';}),'Choice and label align at '+width);
        const grading=page.locator('#lmPreview .assessment-grading').first();
        assert.ok(await grading.evaluate(node=>{const fields=[...node.querySelectorAll('input,select')];return fields.every(field=>field.offsetHeight===42)&& (innerWidth<=380||Math.abs(fields[0].getBoundingClientRect().y-fields[1].getBoundingClientRect().y)<1); }),'Grading controls align at '+width);
      }
      await page.setViewportSize({width:1076,height:900});
      await page.locator('#lmPreview [data-mq-question]').first().screenshot({path:'/private/tmp/exam-choice-alignment.png'});
      await page.evaluate(()=>{viewAccount=null;});
    }
    if(block.title.startsWith('04')){
      await page.route('**/api/assessment',route=>route.request().method()==='POST'?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'This work changed.'})}):route.fallback());
      await page.evaluate(()=>{viewAccount={id:'b'.repeat(32),role:'USER'};lmState.studentSaved=true;lmState.assessmentState='reviewing';examDress();});
      const feedback=page.locator('[data-exam-review-note="examOverallComment"]');
      const longNote=Array.from({length:18},(_,i)=>'Feedback line '+i).join('\n');
      await feedback.fill(longNote);
      const expanded=await feedback.evaluate(node=>node.offsetHeight);
      assert.ok(expanded>150,'Feedback grows with its content');
      await feedback.fill('Short feedback');
      assert.ok(await feedback.evaluate(node=>node.offsetHeight)<expanded,'Feedback shrinks after deletion');
      await page.locator('[data-exam-review-note="examPrivateNote"]').fill('Private draft');
      await page.evaluate(async()=>{try{await assessmentWrite(lmState,'publish');}catch{}examDress();examDress();});
      assert.equal(await page.locator('#lmPreview .exam-review-notes').count(),1,'Failed publication and repeated dress do not duplicate notes');
      assert.equal(await feedback.inputValue(),'Short feedback');
      assert.equal(await page.locator('[data-exam-review-note="examPrivateNote"]').inputValue(),'Private draft');
      assert.equal(await page.locator('[data-exam-recommendation]').count(),1,'Repeated fill does not duplicate AI review control');
      await feedback.fill(longNote);
      await page.screenshot({path:'/private/tmp/exam-review-notes-mobile.png',fullPage:true});
      const projected=parts.map(part=>studentExamContent(part,part.type));
      await page.evaluate(parts=>{authUser.role='USER';viewAccount=null;lmState.blocks=parts;lmState.studentSaved=false;lmState.assessmentState='draft';lmRenderPreview();examDress();},projected);
      assert.equal(await page.locator('#lmPreview .exam-model-answer').count(),0);
      assert.equal(await page.locator('#lmPreview textarea[data-exam-response]').count(),3);
    }
  }
  assert.deepEqual(errors,[]);console.log('Exam-only navigation, counts, filters, breadcrumbs, responsive controls and lesson isolation passed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
