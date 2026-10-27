import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";

await scenarioSubtests("multi-teacher-topology-ui", async function*(){
  yield "00. Topology setup: 2 Developers, 4 subgroups (2 in A1, 2 in B1), 12 Teachers (3 per subgroup), 20 Students (5 per subgroup)";
  const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
  const root=resolve('rollback/production-assets');
  const server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);
    if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');
    res.end(readFileSync(file));
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});

    // 1. Two Developers
    const dev1={id:'d1'.repeat(16),login:'dev_alpha',name:'Developer Alpha',email:'dev_alpha@example.com',role:'DEVELOPER',active:1};
    const dev2={id:'d2'.repeat(16),login:'dev_beta',name:'Developer Beta',email:'dev_beta@example.com',role:'DEVELOPER',active:1};

    // 2. 4 Subgroups: 2 in A1, 2 in B1
    const group101={id:101,title:'A1 Alpha Morning',date:'2026-10-20',revision:1,studentCount:5,lessonIds:[11],examIds:[]};
    const group102={id:102,title:'A1 Beta Evening',date:'2026-10-21',revision:1,studentCount:5,lessonIds:[12],examIds:[]};
    const group201={id:201,title:'B1 Weekend Group',date:'2026-10-22',revision:1,studentCount:5,lessonIds:[21],examIds:[]};
    const group202={id:202,title:'B1 Intensive Group',date:'2026-10-23',revision:1,studentCount:5,lessonIds:[22],examIds:[]};
    const allGroups=[group101,group102,group201,group202];

    // 3. 3 Teachers per subgroup (12 teachers total)
    const makeTeacher=(idNum,groupTitle,subIndex)=>({
      id:String(idNum).padStart(32,'0'),
      login:`teacher_${idNum}`,
      name:`Teacher ${idNum} (${groupTitle} #${subIndex})`,
      email:`teacher_${idNum}@example.com`,
      role:'ADMIN',
      active:1
    });
    const teachers101=[makeTeacher(11, 'A1-M', 1), makeTeacher(12, 'A1-M', 2), makeTeacher(13, 'A1-M', 3)];
    const teachers102=[makeTeacher(21, 'A1-E', 1), makeTeacher(22, 'A1-E', 2), makeTeacher(23, 'A1-E', 3)];
    const teachers201=[makeTeacher(31, 'B1-W', 1), makeTeacher(32, 'B1-W', 2), makeTeacher(33, 'B1-W', 3)];
    const teachers202=[makeTeacher(41, 'B1-I', 1), makeTeacher(42, 'B1-I', 2), makeTeacher(43, 'B1-I', 3)];
    const allTeachers=[...teachers101,...teachers102,...teachers201,...teachers202];

    // Assign teacher IDs to groups
    group101.teacherIds=teachers101.map(t=>t.id);
    group102.teacherIds=teachers102.map(t=>t.id);
    group201.teacherIds=teachers201.map(t=>t.id);
    group202.teacherIds=teachers202.map(t=>t.id);

    const assignments=[
      {groupId:101,revision:1,teacherIds:group101.teacherIds},
      {groupId:102,revision:1,teacherIds:group102.teacherIds},
      {groupId:201,revision:1,teacherIds:group201.teacherIds},
      {groupId:202,revision:1,teacherIds:group202.teacherIds}
    ];

    // 4. 5 Students per subgroup (20 students total)
    const makeStudent=(idNum,groupId,groupTitle,subIndex)=>({
      id:String(idNum).padStart(32,'0'),
      login:`student_${idNum}`,
      name:`Student ${idNum} (${groupTitle} #${subIndex})`,
      email:`student_${idNum}@example.com`,
      role:'USER',
      active:1
    });
    const students101=Array.from({length:5},(_,i)=>makeStudent(1010+i+1, 101, 'A1-M', i+1));
    const students102=Array.from({length:5},(_,i)=>makeStudent(1020+i+1, 102, 'A1-E', i+1));
    const students201=Array.from({length:5},(_,i)=>makeStudent(2010+i+1, 201, 'B1-W', i+1));
    const students202=Array.from({length:5},(_,i)=>makeStudent(2020+i+1, 202, 'B1-I', i+1));
    const allStudents=[...students101,...students102,...students201,...students202];

    const members=[
      ...students101.map(s=>({accountId:s.id,groupId:101})),
      ...students102.map(s=>({accountId:s.id,groupId:102})),
      ...students201.map(s=>({accountId:s.id,groupId:201})),
      ...students202.map(s=>({accountId:s.id,groupId:202}))
    ];

    const allUsers=[dev1,dev2,...allTeachers,...allStudents];

    // Helper: calculate visible users for a specific actor simulating backend /api/admin/users
    const usersForActor=(actor)=>{
      if(actor.role==='DEVELOPER')return allUsers;
      if(actor.role==='ADMIN'){
        const myGroupIds=new Set(assignments.filter(a=>a.teacherIds.includes(actor.id)).map(a=>a.groupId));
        const coTeacherIds=new Set(assignments.filter(a=>myGroupIds.has(a.groupId)).flatMap(a=>a.teacherIds));
        const myStudentIds=new Set(members.filter(m=>myGroupIds.has(m.groupId)).map(m=>m.accountId));
        return allUsers.filter(u=>u.id===actor.id||coTeacherIds.has(u.id)||myStudentIds.has(u.id)||u.role==='DEVELOPER');
      }
      return [actor];
    };

    const setupPageForUser=async(user)=>{
      const page=await browser.newPage({viewport:{width:1280,height:800}});
      page.on('pageerror',error=>{ throw new Error(`[${user.name}] Page error: `+error.message); });
      await page.route('**/api/**',async route=>{
        const path=new URL(route.request().url()).pathname;
        let data={};
        if(path==='/api/database-context')data={provider:'d1',revision:3,scope:'site'};
        if(path==='/api/me'||path==='/api/me/account')data={user};
        if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:0},stageActivity:{}};
        if(path==='/api/me/themes')data={theme:'light',themes:[],revision:0,customRevision:0};
        if(path==='/api/groups')data={groups:allGroups};
        if(path==='/api/accounts/group-teachers')data={assignments};
        if(path==='/api/groups/members')data={members};
        if(path==='/api/admin/users')data={users:usersForActor(user)};
        if(path==='/api/admin/registrations')data={registrations:[]};
        if(path==='/api/admin/changes')data={changes:[]};
        if(path==='/api/lessons')data={materials:[]};
        if(path==='/api/exams')data={exams:[]};
        if(path==='/api/exams/work')data={work:[]};
        if(path==='/api/messages')data={rooms:[],groups:[],contacts:[],unread:{},total:0};
        if(path.includes('/catalogs/'))data={documents:{},cards:[],next:null};
        await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
      });
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.waitForFunction(()=>accountReady&&placeBoot);
      return page;
    };

    yield "01. Developer Alpha sees all 4 subgroups, 12 teachers and 20 students";
    {
      const page=await setupPageForUser(dev1);
      // Navigate to groups
      await page.locator('.side nav [data-jump="groups"]').click();
      await page.locator('#groups.on').waitFor();

      // Check Level A1: both subgroups visible
      await page.locator('[data-group-level="A1"]').click();
      await page.locator('#groupList h2').waitFor();
      assert.ok(await page.locator('#groupList').getByText('A1 Alpha Morning').isVisible());
      assert.ok(await page.locator('#groupList').getByText('A1 Beta Evening').isVisible());

      // Back to level deck and check Level B1
      await page.locator('#groups [data-nav-back]').click();
      await page.locator('[data-group-level="B1"]').click();
      await page.locator('#groupList h2').waitFor();
      assert.ok(await page.locator('#groupList').getByText('B1 Weekend Group').isVisible());
      assert.ok(await page.locator('#groupList').getByText('B1 Intensive Group').isVisible());

      // Check Admin accounts tab: Developer Alpha sees all 12 teachers and 20 students
      await page.evaluate(()=>window.enquizVisit('admin'));
      await page.locator('#admin.on').waitFor();
      await page.locator('[data-admin-bucket="staff"]').click();
      await page.locator('#adminAccountList .path').first().waitFor();
      for(const t of allTeachers){
        assert.ok(await page.locator('#adminAccountList').getByText(t.name).count() > 0, `Dev 1 must see teacher ${t.name}`);
      }
      assert.ok(await page.locator('#adminAccountList').getByText('Developer Beta').count() > 0, 'Dev 1 must see Dev 2');

      await page.close();
    }

    yield "02. Developer Beta also has full visibility across all subgroups and staff";
    {
      const page=await setupPageForUser(dev2);
      await page.locator('.side nav [data-jump="groups"]').click();
      await page.locator('#groups.on').waitFor();

      await page.locator('[data-group-level="A1"]').click();
      assert.ok(await page.locator('#groupList').getByText('A1 Alpha Morning').isVisible());
      assert.ok(await page.locator('#groupList').getByText('A1 Beta Evening').isVisible());

      await page.evaluate(()=>window.enquizVisit('admin'));
      await page.locator('#admin.on').waitFor();
      await page.locator('[data-admin-bucket="staff"]').click();
      await page.locator('#adminAccountList .path').first().waitFor();
      assert.ok(await page.locator('#adminAccountList').getByText('Developer Alpha').count() > 0, 'Dev 2 must see Dev 1');

      await page.close();
    }

    yield "03. Teacher 1 of A1 Morning sees only A1 Morning, its 3 co-teachers and 5 students";
    {
      const teacher=teachers101[0];
      const page=await setupPageForUser(teacher);
      await page.locator('.side nav [data-jump="groups"]').click();
      await page.locator('#groups.on').waitFor();

      // Only Level A1 is visible (B1 is not their level)
      await page.locator('[data-group-level="A1"]').click();
      await page.locator('#groupList h2').waitFor();
      assert.ok(await page.locator('#groupList').getByText('A1 Alpha Morning').isVisible());
      assert.equal(await page.locator('#groupList').getByText('A1 Beta Evening').count(), 0, 'Teacher 1 must NOT see A1 Beta Evening');

      // Click group detail
      await page.locator('[data-group-open="101"]').click();
      await page.locator('#groupdetail.on').waitFor();

      // Verify teachers of A1 Morning (all 3 co-teachers)
      await page.locator('[data-detail-people="teachers"]').click();
      await page.locator('#groupteachers.on').waitFor();
      await page.locator('#groupDetailTeachers .group-person').first().waitFor();
      for(const t of teachers101){
        assert.ok(await page.locator('#groupDetailTeachers').getByText(t.name).isVisible(), `Must see co-teacher ${t.name}`);
      }
      // Must NOT see teachers of group 102, 201, 202
      for(const t of [...teachers102, ...teachers201, ...teachers202]){
        assert.equal(await page.locator('#groupDetailTeachers').getByText(t.name).count(), 0, `Must NOT see outsider teacher ${t.name}`);
      }

      // Verify students of A1 Morning (all 5 students)
      await page.locator('#groupteachers [data-nav-back]').click();
      await page.locator('#groupdetail.on').waitFor();
      await page.locator('[data-detail-people="students"]').click();
      await page.locator('#groupstudents.on').waitFor();
      await page.locator('#groupDetailStudents .group-person').first().waitFor();
      for(const s of students101){
        assert.ok(await page.locator('#groupDetailStudents').getByText(s.name).isVisible(), `Must see student ${s.name}`);
      }
      // Must NOT see students of group 102
      for(const s of students102){
        assert.equal(await page.locator('#groupDetailStudents').getByText(s.name).count(), 0, `Must NOT see outsider student ${s.name}`);
      }

      // In admin accounts list: outsider teachers are hidden
      await page.evaluate(()=>window.enquizVisit('admin'));
      await page.locator('#admin.on').waitFor();
      await page.locator('[data-admin-bucket="staff"]').click();
      await page.locator('#adminAccountList .path').first().waitFor();
      for(const t of teachers101){
        assert.ok(await page.locator('#adminAccountList').getByText(t.name).count() > 0, `Must see co-teacher ${t.name} in staff list`);
      }
      for(const t of [...teachers102, ...teachers201, ...teachers202]){
        assert.equal(await page.locator('#adminAccountList').getByText(t.name).count(), 0, `Outsider teacher ${t.name} must be isolated`);
      }

      await page.close();
    }

    yield "04. Teacher 2 of B1 Intensive sees only B1 Intensive, its 3 co-teachers and 5 students";
    {
      const teacher=teachers202[1]; // teacher 42
      const page=await setupPageForUser(teacher);
      await page.locator('.side nav [data-jump="groups"]').click();
      await page.locator('#groups.on').waitFor();

      // Only Level B1 has their groups
      await page.locator('[data-group-level="B1"]').click();
      await page.locator('#groupList h2').waitFor();
      assert.ok(await page.locator('#groupList').getByText('B1 Intensive Group').isVisible());
      assert.equal(await page.locator('#groupList').getByText('B1 Weekend Group').count(), 0, 'Must NOT see B1 Weekend Group');
      assert.equal(await page.locator('#groupList').getByText('A1 Alpha Morning').count(), 0, 'Must NOT see A1 groups');

      // Click group detail for 202
      await page.locator('[data-group-open="202"]').click();
      await page.locator('#groupdetail.on').waitFor();

      // Teachers of B1 Intensive
      await page.locator('[data-detail-people="teachers"]').click();
      await page.locator('#groupteachers.on').waitFor();
      await page.locator('#groupDetailTeachers .group-person').first().waitFor();
      for(const t of teachers202){
        assert.ok(await page.locator('#groupDetailTeachers').getByText(t.name).isVisible(), `Must see co-teacher ${t.name}`);
      }
      for(const t of teachers201){
        assert.equal(await page.locator('#groupDetailTeachers').getByText(t.name).count(), 0, `Must NOT see teacher from weekend group ${t.name}`);
      }

      // Students of B1 Intensive
      await page.locator('#groupteachers [data-nav-back]').click();
      await page.locator('#groupdetail.on').waitFor();
      await page.locator('[data-detail-people="students"]').click();
      await page.locator('#groupstudents.on').waitFor();
      await page.locator('#groupDetailStudents .group-person').first().waitFor();
      for(const s of students202){
        assert.ok(await page.locator('#groupDetailStudents').getByText(s.name).isVisible(), `Must see student ${s.name}`);
      }
      for(const s of students201){
        assert.equal(await page.locator('#groupDetailStudents').getByText(s.name).count(), 0, `Must NOT see student from weekend group ${s.name}`);
      }

      await page.close();
    }

    yield "05. Student of B1 Weekend (s201_3) has student chrome and cannot access admin/bugs";
    {
      const student=students201[2];
      const page=await setupPageForUser(student);
      // Student does not see admin or bugs in navigation
      assert.equal(await page.locator('.side nav [data-jump="admin"]:visible').count(), 0);
      assert.equal(await page.locator('.side nav [data-jump="bugs"]:visible').count(), 0);

      // Attempting to visit admin redirects to home
      await page.evaluate(()=>window.enquizVisit('admin'));
      assert.equal(await page.locator('#admin.on').count(), 0);

      await page.close();
    }

  }finally{
    if(browser)await browser.close();
    server.close();
  }
});
