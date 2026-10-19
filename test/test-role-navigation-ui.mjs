import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=resolve('rollback/production-assets');
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(readFileSync(file));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const role of ['DEVELOPER','ADMIN','USER']){
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));
    const user={id:'a'.repeat(32),login:'fixture',name:'Fixture',role};
    const teachers=[{id:'b'.repeat(32),name:'First teacher',login:'teacher1',role:'ADMIN',active:1},{id:'c'.repeat(32),name:'Second teacher',login:'teacher2',role:'ADMIN',active:1}];
    const student={id:'d'.repeat(32),name:'Group student',login:'student',role:'USER',active:1};
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;requests.push(path);let data={};
      if(path==='/api/database-context')data={provider:'d1',revision:3,scope:'site'};
      if(path==='/api/me'||path==='/api/me/account')data={user};
      if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:1},stageActivity:{}};
      if(path==='/api/me/themes')data={theme:'light',themes:[],revision:0,customRevision:0};
      if(path==='/api/groups')data={groups:[{id:41,title:'A1 Fixture group',date:'2026-10-19',revision:1,studentCount:1,lessonIds:[31],examIds:[51]}]};
      if(path==='/api/lessons')data={materials:[{id:31,title:'Fixture lesson',date:'2026-10-19',published:true,stageRevision:1,blocks:[]}]};
      if(path==='/api/exams')data={exams:[{id:51,title:'Fixture exam',groupId:41,groupTitle:'A1 Fixture group',published:true,date:'2026-10-19',blocks:[{id:52,title:'Fixture block',published:true,materials:[{id:53,type:'text',tab:'overview',html:'<p>Fixture exam content</p>'}]}]}]};if(path==='/api/exams/work')data={work:[]};
      if(path==='/api/admin/users')data={users:[...teachers,student]};
      if(path==='/api/admin/users/'+student.id)data={user:student};
      if(path==='/api/accounts/invites'){
        const body=route.request().postDataJSON();
        assert.equal(body.groupId,41);
        assert.ok(teachers.some(teacher=>teacher.id===body.teacherId));
        data={token:'fixture-invite-token',groupTitle:'A1 Fixture group',expiresAt:Date.now()+86400000};
      }
      if(path==='/api/groups/members')data={members:[{accountId:student.id,groupId:41}]};
      if(path==='/api/accounts/group-teachers')data={assignments:[{groupId:41,teacherIds:teachers.map(t=>t.id)}]};
      if(path.includes('/catalogs/'))data={documents:{},cards:[],next:null};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>accountReady);
    const home=role==='DEVELOPER'?'bugs':role==='ADMIN'?'groups':'home';
    await page.locator('#'+home+'.on').waitFor();
    const expected=[...(role==='USER'?['Home','Lessons','Exam']:['Groups']),'Words','Grammar','Entertainment','Speakout','Messages',...(role==='USER'?[]:['Accounts','Archive']),...(role==='DEVELOPER'?['Bugs']:[]),'Settings'];
    const labels=await page.locator('.side nav > button:visible').evaluateAll(nodes=>nodes.map(n=>n.textContent.trim().split('·')[0].trim()));
    assert.deepEqual(labels,expected,role+' navigation order');
    assert.equal(await page.locator('.side .brand-account').count(),0,'No account circle below Settings');
    if(role!=='USER')assert.equal(await page.locator('#'+home+' .meta .crumb').isVisible(),false,'Role home has no navigation buttons');
    assert.equal(await page.locator('.shell-progress').isVisible(),role==='USER');
    if(role==='USER')assert.ok(await page.locator('.shell-progress').evaluate(n=>n.getBoundingClientRect().top>=document.querySelector('.side nav').getBoundingClientRect().bottom));
    await page.locator('.side nav [data-jump="wordcollections"]').click();
    await page.locator('#wordcollections.on').waitFor();
    assert.equal(await page.locator('#wordcollections .file-card').count(),5);
    assert.equal(await page.locator('#wordcollections [data-all-group]').count(),0,'Sources live inside All words');
    await page.locator('#wordcollections [data-add-open]').click();
    assert.equal(await page.locator('#wordcollections [data-add-input]').isVisible(),true);
    await page.locator('#wordcollections [data-jump="allwords"]').click();
    await page.locator('#allwords.on').waitFor();
    assert.equal(await page.locator('#allwords .resource-fold, #allwords .decks').count(),0,'All words has no collection buttons');
    await page.locator('#allwords [data-nav-back]').click();await page.locator('#wordcollections.on').waitFor();
    await page.locator('.side nav [data-jump="library"]').click();
    assert.equal(await page.locator('#library [data-nav-back]').isVisible(),true,'Other pages retain Back');
    assert.equal(await page.locator('#library .crumb [aria-label="Home"]').isVisible(),true,'Other pages retain Home');
    await page.locator('.side .brand[data-jump="home"]').click();
    await page.locator('#'+home+'.on').waitFor();
    if(role==='USER')assert.equal(await page.locator('#home [data-nav-back], #home .crumb').count(),0,'Student Home has no Home or Back buttons');
    else assert.equal(await page.locator('#'+home+' .meta .crumb').isVisible(),false,'Returning home keeps controls hidden');
    await page.locator('.side nav [data-jump="library"]').click();
    assert.deepEqual(await page.locator('#library .file-card b').allTextContents(),['Song lyrics','Text']);
    assert.equal(await page.locator('#library [data-jump="speakout"]').count(),0);
    await page.locator('.side nav [data-jump="speakout"]').click();await page.locator('#speakout.on').waitFor();
    if(role==='USER'){
      await page.locator('.side nav [data-jump="days"]').click();await page.locator('[data-lm-open="31"]').waitFor();
      assert.equal(await page.locator('[data-group-level]:visible').count(),0);
      await page.locator('.side nav [data-jump="exams"]').click();await page.locator('#exams.on').waitFor();
      assert.equal(await page.locator('.side nav [data-jump="exams"]').getAttribute('aria-current'),'page');
      assert.equal(await page.locator('#examList [data-exam-level]').count(),0);
      assert.equal(requests.includes('/api/accounts/group-teachers'),false,'Student does not fetch staff directory');
    }else{
      await page.locator('.side nav [data-jump="groups"]').click();
      await page.locator('[data-group-level="A1"]').waitFor();
      await page.locator('#groups').evaluate(node=>{node.style.minHeight='150vh';});
      const shellPosition = () => page.locator('.phone').evaluate(node=>{
        const box=node.getBoundingClientRect();return {x:box.x,width:box.width};
      });
      const groupsPosition = await shellPosition();
      for(const destination of ['tenses','admin','groups']){
        await page.locator('.side nav [data-jump="'+destination+'"]').click();
        await page.locator('#'+destination+'.on').waitFor();
        assert.deepEqual(await shellPosition(),groupsPosition,'Main panel must not shift between Groups, Grammar and Accounts');
      }
      await page.locator('#groups').evaluate(node=>{node.style.minHeight='';});
      assert.equal(await page.locator('#groupList > .decks').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),3);
      await page.locator('[data-group-level="A1"]').click();
      assert.equal(await page.locator('#groups [data-jump="exams"], #groupOverview, #groupLevelTeachers').count(),0,'Groups has no separate Exams, overview or teacher list');
      assert.equal(await page.locator('#groups .meta .crumb').isVisible(),true,'Group level retains navigation');
      await page.locator('[data-group-open="41"]').click();await page.locator('#groupdetail.on').waitFor();
      assert.equal(await page.locator('[data-detail-lessons]').textContent(),'Lessons · 1');
      assert.equal(await page.locator('#groupDetailExamCount').textContent(),'Exams · 1');
      assert.deepEqual(await page.locator('#groupDetailExamSummary > span').allTextContents(),['exam · 1','assigned works','ready for review','completed']);
      const destinations=await page.locator('.group-detail-destinations > button').evaluateAll(nodes=>nodes.map(node=>({top:node.getBoundingClientRect().top,width:node.getBoundingClientRect().width})));
      assert.equal(destinations[0].top,destinations[1].top,'Lessons and Exams share a row');
      assert.ok(destinations.every(node=>node.width>0));
      assert.equal(await page.locator('#groupDetailTeachers').isVisible(),false);
      await page.locator('#groupdetail summary').filter({hasText:'Teachers'}).click();
      await page.locator('#groupDetailTeachers').getByText('First teacher',{exact:true}).waitFor();
      assert.equal(await page.locator('#groupDetailTeachers button').count(),0,'Teacher descriptions are not account links');
      const groupInvite=page.locator('#groupDetailInvite');
      await groupInvite.locator('[data-invite-create]').click();
      await groupInvite.locator('[data-invite-url]:visible').waitFor();
      assert.match(await groupInvite.locator('[data-invite-url]').inputValue(), /invite=fixture-invite-token/);
      assert.equal(await groupInvite.locator('[data-invite-copy]').isVisible(),true);
      assert.equal(await groupInvite.locator('[data-invite-qr] img').isVisible(),true,'Groups invite uses local QR generation');
      await page.locator('#groupdetail summary').filter({hasText:'Students'}).click();
      await page.locator('#groupDetailStudents').getByText('Group student',{exact:true}).waitFor();
      await page.locator('#groupDetailStudents button[data-account="user"]').click();
      await page.locator('#adminuser.on').waitFor();
      await page.locator('#adminUser').getByText('student',{exact:true}).waitFor();
      await page.locator('#adminuser [data-nav-back]').click();
      await page.locator('#groupdetail.on').waitFor();
      await page.locator('[data-detail-exams]').click();await page.locator('#exams.on').waitFor();
      await page.locator('#examList [data-exam-assign="51"] svg').waitFor();
      await page.locator('#examList [data-exam-open="51"]').click();await page.locator('#examblocks.on').waitFor();
      await page.locator('#examblocks [data-nav-back]').click();await page.locator('#exams.on').waitFor();
      await page.locator('#exams [data-nav-back]').click();await page.locator('#groupdetail.on').waitFor();
      await page.locator('[data-detail-lessons]').click();await page.locator('#days.on').waitFor();
      assert.equal(await page.locator('#lmDayList').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),1,'Lessons use full-width rows');
      await page.locator('#days [data-lm-open="31"]').click();await page.locator('#material.on').waitFor();
      await page.locator('#material [data-nav-back]').click();await page.locator('#days.on').waitFor();
      await page.locator('#days [data-nav-back]').click();await page.locator('#groupdetail.on').waitFor();
      await page.reload();await page.locator('#groupdetail.on').waitFor();
      await page.locator('#groupdetail summary').filter({hasText:'Teachers'}).click();
      await page.locator('#groupDetailTeachers').getByText('Second teacher',{exact:true}).waitFor();
      await page.locator('.side nav [data-jump="admin"]').click();
      await page.locator('[data-admin-level="A1"]').click();
      await page.locator('[data-admin-group="41"]').click();
      await page.locator('#admingroup.on').waitFor();
      assert.equal(await page.locator('#adminGroupDetail [data-group-invites]').isVisible(),true,'Invite link section is visible to staff');
      assert.equal(await page.locator('#adminGroupDetail [data-invite-create]').isVisible(),true,'Create invite is available to teachers and developers');
      assert.ok(await page.locator('#adminGroupDetail [data-invite-teacher] option').count()>0);
    }
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),role+' fits '+width);
      await page.screenshot({path:'/private/tmp/role-navigation-'+role+'-'+width+'.png'});
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('.side nav [data-user-settings]').click();
    await page.locator('dialog.user-settings[open]').waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('.user-settings [data-settings-tab]:not([data-settings-tab="display"])')].every(button=>button.querySelector('svg')));
    assert.equal(await page.locator('.user-settings i[data-chat-icon]').count(),0,'Settings icons are included in production bundle');
    await page.screenshot({path:'/private/tmp/role-settings-'+role+'.png'});
    await page.evaluate(()=>document.querySelector('dialog.user-settings').close());
    await page.locator('.side nav [data-msg-open]').click();await page.locator('#messages.on').waitFor();
    assert.equal(await page.locator('#msgAssign').count(),0,'Chat has no Assign exam button for any role');
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Role navigation, Entertainment scope, direct student routes and staff group hierarchy passed');
}finally{await browser?.close();await new Promise(done=>server.close(done));}
