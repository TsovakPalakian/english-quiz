import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {examWorkflowDemo} from '../ops/exam-workflow-demo.mjs';
import {studentExamContent} from '../src/learning-exams.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
const root=resolve('rollback/production-assets');
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'});res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
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
    if(path==='/api/database-context')data={provider:'d1',revision:0,scope:'site'};
    if(path==='/api/me'||path==='/api/me/account')data={user};
    if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:1},stageActivity:{}};
    if(path==='/api/me/themes')data={theme:'almond',themes:[],revision:0,customRevision:0};
    if(path==='/api/groups')data={groups:groups.map(group=>({...group,date:'2026-10-15',revision:1}))};
    if(path==='/api/groups/members')data={members:[{accountId:'b'.repeat(32),groupId:41},{accountId:'c'.repeat(32),groupId:43}]};
    if(path==='/api/admin/users')data={users:[{id:'b'.repeat(32),name:'Student',role:'USER',active:1},{id:'c'.repeat(32),name:'Outside student',role:'USER',active:1}]};
    if(path==='/api/lessons')data={materials:[{id:31,stageRevision:1,title:'Fixture lesson',published:true,date:'2026-10-15',blocks:[]}]};
    if(path==='/api/exams'){
      if(route.request().method()==='POST'){
        const payload=JSON.parse(route.request().postData()||'{}');
        const wire=payload.exam||{};
        const savedBlocks=(wire.blocks||[]).map((b,i)=>({id:Number.isSafeInteger(b.id)?b.id:800+i,title:b.title}));
        data={id:Number.isSafeInteger(wire.id)?wire.id:701,title:wire.title,blocks:savedBlocks};
      } else data={exams};
    }
    if(path==='/api/archive')data={archived:true,revision:1};
    if(path==='/api/exams/work')data={work:[]};
    if(path==='/api/exams/workflow')data={examId:21,state:'submitted',canStart:false,canComplete:false,history:[],blocks:1,submitted:1,published:0};
    if(path==='/api/messages')data={rooms:[],groups:[],contacts:[],unread:{},total:0};
    if(path.includes('catalogs'))data={documents:{},cards:[],next:null};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady&&typeof placeBoot!=='undefined'&&placeBoot);
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
  await page.locator('#exams.on').waitFor();
  await page.locator('[data-exam-level="A1"]').waitFor();
  await page.waitForFunction(()=>document.getElementById('examOverview')?.textContent.includes('students · 2'));
  assert.equal(await page.locator('#examSections').isVisible(),false);
  assert.equal(await page.locator('#examListSearch').isVisible(),false);
  assert.deepEqual(await page.locator('#examOverview .metric-pairs>span').allTextContents(),['group · 3','students · 2','exam · 1','assigned works · 1','ready for review · 1','completed · 1']);
  assert.match(await page.locator('.side [data-jump="exams"],aside [data-jump="exams"]').first().innerText(),/Exam.*1/);
  await page.locator('[data-exam-level="A1"]').click();
  assert.deepEqual(await page.locator('[data-exam-group-view="41"] .metric-pairs>span').allTextContents(),['group · 1','students · 1','exam · 1','assigned · 1','ready · 1','completed · 1']);
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('[data-exam-group-view="41"] .metric-pairs>span').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).whiteSpace==='nowrap'&&node.scrollWidth<=node.clientWidth+1)),'Compact labels fit '+width);}await Promise.resolve();await page.setViewportSize({width:1280,height:900});
  assert.equal(await page.locator('[data-exam-group-view]').count(),2,'Empty lesson subgroups remain visible');
  assert.equal(await page.locator('#examList button').filter({hasText:/^Back$/}).count(),0);
  await page.locator('[data-exam-group-view="41"]').click();
  assert.equal(await page.locator('#examSections').isVisible(),true);
  assert.equal(await page.locator('#examListSearch').isVisible(),true);
  assert.equal(await page.locator('#examNew').isVisible(),true);
  assert.equal(await page.locator('#exams .page-path').innerText(),'Groups\nA1\nA1 Group\nExams');
  await page.locator('[data-exam-open="11"]').scrollIntoViewIfNeeded();
  assert.match(await page.locator('[data-exam-open="11"]').innerText(),/1 examination block|Examination block · 1/);
  assert.equal(await page.locator('[data-exam-open="51"]').count(),0,'Assigned copies are not templates');
  assert.equal(await page.locator('[data-exam-hide="exam:11"] + [data-exam-assign="11"]').count(),1,'Assign follows visibility');
  await page.locator('[data-exam-assign="11"]').click();await page.locator('.exam-assign-dialog[open]').waitFor();
  assert.deepEqual(await page.locator('.exam-assign-dialog select option').allTextContents(),['Choose recipient','Whole group · A1 Group','Student']);
  assert.ok(await page.locator('[data-exam-assign="11"]').evaluate(node=>getComputedStyle(node).borderRadius==='0px'&&getComputedStyle(node).backgroundColor==='rgba(0, 0, 0, 0)'));
  await Promise.resolve();
  await page.locator('.exam-assign-dialog [data-cancel]').click();await page.locator('.exam-assign-dialog').waitFor({state:'detached'});
  await page.locator('[data-exam-assign="11"]').click();await page.locator('.exam-assign-dialog[open]').waitFor();await page.mouse.click(1,1);await page.locator('.exam-assign-dialog').waitFor({state:'detached'});
  await page.locator('[data-exam-assign="11"]').click();await page.locator('.exam-assign-dialog[open]').waitFor();
  await page.locator('.exam-assign-dialog [data-close]').click();
  await page.locator('[data-exam-section="assigned"]').click();
  assert.equal(await page.locator('[data-exam-open="51"]').isVisible(),true);
  assert.equal(await page.locator('#examNew').isVisible(),false);
  exams.find(exam=>exam.id===51).instanceStatus='ready';
  await page.evaluate(async()=>{await examPull(true);examPaintList();});
  assert.equal(await page.locator('#examOverview .metric-pairs>span').filter({hasText:'assigned works'}).innerText(),'assigned works','Zero counts keep their labels');
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
  await page.locator('[data-exam-open="21"]').click();
  assert.equal(await page.locator('#examblocks .page-path').innerText(),'Groups\nA1\nA1 Group\nExams\nA1 Assigned');
  await page.reload();
  await page.locator('#examblocks.on [data-exam-block="22"]').waitFor();
  assert.equal(await page.locator('#examblocks .page-path').innerText(),'Groups\nA1\nA1 Group\nExams\nA1 Assigned','Refresh restores the group path');
  await page.locator('[data-exam-block="22"]').click();
  await page.reload();
  await page.locator('#material.on').waitFor();
  await page.waitForFunction(()=>lmState?.examId===21&&lmState?.blockId===22);
  assert.deepEqual(await page.evaluate(()=>({exam:lmState.examId,block:lmState.blockId,student:lmState.reviewStudentId,section:examSection})),{exam:21,block:22,student:'b'.repeat(32),section:'ready'},'Block refresh retains teacher review and its section');
  await page.locator('#material [data-page-path="examblocks"]').click();
  await page.waitForFunction(()=>!examWorkPulling);
  assert.match(await page.locator('[data-exam-block="22"]').textContent(),/Not submitted/,'Review list does not confuse content publication with submission');
  await page.evaluate(()=>{examWorkBag()['21/22']={saved:true,state:'published',points:{},answers:{}};examPaintBlocks();});
  assert.match(await page.locator('[data-exam-block="22"]').textContent(),/Results published/,'Published results retain their distinct label');
  await page.evaluate(()=>{examWorkBag()['21/22']={saved:true,state:'submitted',points:{},answers:{}};examPaintBlocks();});
  assert.match(await page.locator('[data-exam-block="22"]').textContent(),/Submitted/,'Submitted work has its own status');
  await page.evaluate(()=>window.enquizVisit('exams'));
  await page.locator('[data-exam-section="completed"]').click();
  assert.equal(await page.locator('#examNew').isVisible(),false);
  assert.equal(await page.locator('[data-exam-open="31"]').count(),1);
  assert.equal(await page.locator('[data-exam-student="'+ 'b'.repeat(32)+'"] [data-exam-open="31"]').isVisible(),true,'Completed work is also grouped by student');
  await page.locator('[data-exam-section="active"]').click();
  await page.locator('#examListSearch').fill('missing');await page.waitForFunction(()=>document.querySelector('#examList .day-row')?.hidden);
  await page.locator('#examListSearch').fill('');await page.locator('[data-exam-open="11"]').click();
  assert.equal(await page.locator('#examblocks .page-path').innerText(),'Groups\nA1\nA1 Group\nExams\nA1 Exam');
  assert.equal(writes.filter(path=>['/api/groups','/api/lessons','/api/exams'].includes(path)).length,0,'Browsing does not rewrite content: '+writes.join(','));
  assert.equal(await page.locator('[data-content-copy="exam-block:12"]').count(),1,'Initial block has copy button');
  const examWritesBefore=writes.filter(p=>p==='/api/exams').length;
  await page.locator('#examBlockNew').click();
  await page.locator('[data-content-copy="exam-block:801"]').waitFor();
  assert.equal(writes.filter(p=>p==='/api/exams').length - examWritesBefore, 1, 'Adding a block sends only 1 exam request');
  assert.equal(await page.locator('[data-content-copy="exam-block:801"]').count(), 1, 'Newly added block immediately has copy button');
  const archiveWritesBefore=writes.filter(p=>p==='/api/archive').length;
  await page.evaluate(()=>{const prev=window.confirm;window.confirm=()=>true;examDelete('block',801);window.confirm=prev;});
  await page.waitForFunction(()=>!document.querySelector('[data-exam-block="801"]'));
  assert.equal(writes.filter(p=>p==='/api/archive').length - archiveWritesBefore, 1, 'Deleting saved block archives it');
  await page.locator('[data-exam-block="12"]').click();
  await page.evaluate(()=>lmShow('edit'));
  assert.match(await page.locator('#material .page-path').innerText(),/Groups\nA1\nA1 Group\nExams\nA1 Exam\nExamination block\nEdit/);
  await page.locator('#lmAdd').click();
  assert.equal(await page.locator('[data-material-quiz-menu]').count(),0);
  assert.equal(await page.locator('[data-material-quiz-types]').isVisible(),true);
  assert.equal(await page.locator('[data-quiz="Choice"]').innerText(),'Quiz \u2022 Choice');
  for(const width of [1280,390,320]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.locator('#material').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Exam editor fits '+width);
  }
  await page.locator('#material [data-path-exam-group="41"]').click();
  const layout=await page.waitForFunction(()=>{
    const node=document.querySelector('#examOverview .metric-pairs');
    if(!node?.isConnected||!node.getClientRects().length)return false;
    // Locate and scroll the current node in the same browser task: the overview
    // may be replaced between Playwright's separate stability/action steps.
    node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    const style=getComputedStyle(node),columns=style.gridTemplateColumns;
    if(style.display!=='grid'||style.visibility!=='visible'||columns==='none')return false;
    const count=columns.trim().split(/\s+/).length;
    return count===2?{columns:count}:false;
  },null,{timeout:10000});
  try{assert.equal((await layout.jsonValue()).columns,2);}finally{await layout.dispose();}
  await page.locator('#examListSearch').focus();
  assert.equal(await page.locator('#examListSearch').evaluate(node=>getComputedStyle(node).outlineOffset),'-2px');
  assert.ok(await page.locator('#exams').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Exam list fits smallest viewport');
  await Promise.resolve();
  await page.setViewportSize({width:1280,height:900});await Promise.resolve();
  await page.evaluate(()=>{lmState={id:99,title:'Lesson',mode:'edit',tab:'overview',blocks:[]};window.enquizVisit('material');lmShow('edit');});
  await page.locator('#lmAdd').click();
  assert.equal(await page.locator('[data-material-quiz-menu]').count(),1,'Lesson quiz menu is unchanged');
  assert.equal(await page.locator('#material').evaluate(node=>node.classList.contains('is-exam')),false);
  assert.deepEqual(await page.evaluate(()=>examPagePath({id:99,title:'Unassigned exam'}).map(item=>item.label)),['Groups','Exams','Unassigned exam'],'Direct exam links do not inherit an unrelated group');
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
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('#material').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Content group fits '+width);}await Promise.resolve();
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
  await page.evaluate(()=>{authUser={...authUser,id:'b'.repeat(32),role:'USER'};viewAccount=null;examViewLevel='';examViewGroup=null;examSection='active';window.enquizVisit('exams');});assert.equal(await page.locator('#exams .metric-pairs').count(),0,'Students do not see staff statistics');
  assert.equal(await page.locator('[data-exam-section="active"]').isVisible(),false);
  assert.equal(await page.locator('[data-exam-section="assigned"]').innerText(),'Assigned works · 1');
  assert.equal(await page.locator('[data-exam-section="ready"]').innerText(),'Ready for review · 1');
  assert.equal(await page.locator('#exams .meta h1').innerText(),'Exams');
  assert.equal(await page.locator('#examGroupName').isVisible(),true);
  assert.equal(await page.locator('#examGroupName').innerText(),'A1 Group');
  assert.equal(await page.locator('#exams .page-path').innerText(),'Exams\nA1 Group\nAssigned works');
  assert.equal(await page.locator('[data-exam-open="11"]').count(),0);
  assert.equal(await page.locator('[data-exam-open="51"]').isVisible(),true);
  assert.match(await page.locator('.side [data-jump="exams"],aside [data-jump="exams"]').first().innerText(),/Exam.*2/s);
  await Promise.resolve();
  let started=false;
  await page.route('**/api/exams/workflow*',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().action==='started')started=true;await route.fulfill({contentType:'application/json',body:JSON.stringify({examId:51,state:started?'in_progress':'assigned',canStart:!started,history:[{action:'viewed'},...(started?[{action:'started'}]:[])],blocks:1,submitted:0})});});
  await page.locator('[data-exam-open="51"]').click();await page.locator('[data-exam-block="52"]').click();
  await page.locator('[data-exam-workflow="started"]').waitFor();
  assert.equal(await page.locator('#examSave').isDisabled(),true);
  assert.match(await page.locator('#examWorkflowStatus').innerText(),/Start at least one examination block before submitting/);
  await page.locator('[data-exam-workflow="started"]').click();
  await page.waitForFunction(()=>!document.getElementById('examSave').disabled);
  assert.equal(await page.locator('#examSave').isEnabled(),true);
  await page.evaluate(()=>window.enquizVisit('exams'));
  await page.evaluate(()=>{authUser.id='a'.repeat(32);authUser.role='DEVELOPER';window.enquizVisit('admin');paintDeveloperChrome();});
  assert.equal(await page.locator('[data-database-admin]').count(),0);
  await page.evaluate(()=>{authUser.role='ADMIN';paintDeveloperChrome();});
  assert.equal(writes.filter(path=>['/api/groups','/api/lessons'].includes(path)).length,0,'Exam UI does not write Groups or Lessons: '+writes.join(','));
  let demoId=1000;
  for(const block of examWorkflowDemo(41).blocks){
    const parts=block.materials.map(part=>({...part,id:demoId++}));
    await page.evaluate(({title,parts})=>{authUser.role='ADMIN';viewAccount=null;lmState={...lmBlankMaterial(),id:900,examId:11,blockId:900,title,examOwned:true,published:true,assessmentReady:true,mode:'preview',tab:'overview',blocks:parts};window.enquizVisit('material');lmShow('preview');},{title:block.title,parts});
    assert.equal(await page.locator('#lmPreview [data-lm-panel]').count(),parts.filter(part=>!part.contentGroup&&part.type!=='wordcard').length,block.title+' retains every content panel');
    for(const part of parts.filter(part=>part.type==='wordcard'))assert.equal(await page.locator('[data-lm-word="'+part.id+'"]').count(),1);
    for(const width of [1280,375]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('#material').evaluate(node=>node.scrollWidth<=node.clientWidth+1),block.title+' fits '+width);}
    if(block.title.startsWith('05'))await Promise.resolve();
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
      await Promise.resolve();
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
      await Promise.resolve();
      assert.equal(await page.locator('#assessmentPublish').innerText(),'Publish review');
      await page.evaluate(()=>{lmState.assessmentState='published';examDress();});
      assert.equal(await page.locator('#examSave').isVisible(),false);
      assert.equal(await page.locator('#assessmentPublish').isVisible(),false);
      assert.equal(await page.locator('#assessmentAmend').innerText(),'Reopen review');
      assert.equal(await page.locator('#assessmentAmend').isVisible(),true);
      assert.equal(await page.locator('#assessmentHistory').isVisible(),true);
      await page.evaluate(()=>{lmState.assessmentState='reviewing';examDress();});
      assert.equal(await page.locator('#examSave').isVisible(),true);
      assert.equal(await page.locator('#assessmentPublish').isVisible(),true);
      assert.equal(await page.locator('#assessmentAmend').isVisible(),false);
      const projected=parts.map(part=>studentExamContent(part,part.type));
      await page.evaluate(parts=>{authUser.role='USER';viewAccount=null;lmState.blocks=parts;lmState.studentSaved=false;lmState.assessmentState='draft';lmRenderPreview();examDress();},projected);
      assert.equal(await page.locator('#lmPreview .exam-model-answer').count(),0);
      assert.equal(await page.locator('#lmPreview textarea[data-exam-response]').count(),3);
      assert.equal(await page.locator('#lmPreview .text-color-tools').count(),0,'Students have no formatting or color tools');
    }
  }
  await page.setViewportSize({width:1280,height:900});
  if(await page.locator('#learning-main-banner').isVisible())await page.locator('#learning-main-dismiss').click();
  await page.evaluate(()=>{authUser.role='DEVELOPER';viewAccount=null;paintSongGate();examViewLevel='A1';examViewGroup=41;examSection='completed';window.enquizVisit('exams');});
  await page.locator('.side nav [data-jump="groups"]').click();
  assert.equal(await page.evaluate(()=>groupViewLevel),'','Combined Classes navigation opens the Groups root');
  await page.evaluate(()=>goBack('home'));
  assert.deepEqual(await page.evaluate(()=>[examViewLevel,examViewGroup,examSection]),['A1',41,'completed'],'Back retains the previous nested exam location');
  await page.evaluate(()=>{authUser.role='ADMIN';groupViewLevel='A1';window.enquizVisit('home');});
  assert.equal(await page.evaluate(()=>groupViewLevel),'','Teacher Home opens the Groups root');
  assert.equal(await page.locator('#groups.on').count(),1);
  for(const width of [1280,320]){
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>alert('Grade every question before publishing.'));
    const notice=page.locator('#learning-main-banner');
    assert.equal(await notice.isVisible(),true);
    assert.equal(await notice.locator('button:visible').count(),1,'Informational notice has only a close button');
    const bounds=await notice.boundingBox();assert.ok(Math.abs(bounds.x+bounds.width/2-width/2)<2,'Notice is horizontally centered: '+JSON.stringify({width,bounds}));assert.ok(Math.abs(bounds.y+bounds.height/2-450)<2,'Notice is vertically centered');
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,'Notice fits the screen');
    await page.keyboard.press('Escape');assert.equal(await notice.isVisible(),false);
    await page.evaluate(()=>window.LearningMain.notice('Network error. Please try again.',true));
    assert.equal(await page.locator('#learning-main-status').innerText(),'Network error.');
    await page.mouse.click(2,2);assert.equal(await notice.isVisible(),false);
    await page.evaluate(()=>alert('Information'));
    await page.locator('#learning-main-dismiss').click();assert.equal(await notice.isVisible(),false);
  }
  assert.deepEqual(errors,[]);console.log('Exam-only navigation, counts, filters, breadcrumbs, responsive controls and lesson isolation passed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
