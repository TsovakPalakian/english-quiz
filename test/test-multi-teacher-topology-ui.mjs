import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";

await scenarioSubtests("multi-teacher-topology-ui", async function*(){
  yield "00. Topology setup: 2 Developers, 18 subgroups (9 CEFR levels x 2), 54 Teachers, 90 Students, 18 Lessons, 18 Exams";
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

    // 2. 18 Subgroups across all 9 CEFR levels (2 subgroups per level)
    const cefrLevels=['A1','A2','A2+','B1','B1+','B2','B2+','C1','C2'];
    const allGroups=[];
    const allTeachers=[];
    const allStudents=[];
    const assignments=[];
    const members=[];
    const allLessons=[];
    const allExams=[];
    const allExamInstances=[];
    const assessmentWork=new Map(); // key: `${materialId}:${studentId}`
    const chatMessages=[];
    let msgSeq=0;

    const makeTeacher=(idNum,groupId,groupTitle,subIndex)=>({
      id:String(idNum).padStart(32,'0'),
      login:`teacher_${groupId}_${subIndex}`,
      name:`Teacher ${groupId}-${subIndex} (${groupTitle})`,
      email:`teacher_${groupId}_${subIndex}@example.com`,
      role:'ADMIN',
      groupId,
      subIndex,
      active:1
    });

    const makeStudent=(idNum,groupId,groupTitle,subIndex)=>({
      id:String(idNum).padStart(32,'0'),
      login:`student_${groupId}_${subIndex}`,
      name:`Student ${groupId}-${subIndex} (${groupTitle})`,
      email:`student_${groupId}_${subIndex}@example.com`,
      role:'USER',
      groupId,
      subIndex,
      active:1
    });

    cefrLevels.forEach((lvl,lvlIdx)=>{
      const baseNum=(lvlIdx+1)*100;
      const subConfigs=[
        {id:baseNum+1,title:`${lvl} Alpha Morning`,subName:'M'},
        {id:baseNum+2,title:`${lvl} Beta Evening`,subName:'E'}
      ];

      for(const cfg of subConfigs){
        const gid=cfg.id;
        const gTeachers=[
          makeTeacher(gid*10+1,gid,cfg.title,1),
          makeTeacher(gid*10+2,gid,cfg.title,2),
          makeTeacher(gid*10+3,gid,cfg.title,3)
        ];
        allTeachers.push(...gTeachers);

        const gStudents=Array.from({length:5},(_,i)=>makeStudent(gid*100+i+1,gid,cfg.title,i+1));
        allStudents.push(...gStudents);

        assignments.push({
          groupId:gid,
          revision:1,
          teacherIds:gTeachers.map(t=>t.id)
        });

        members.push(...gStudents.map(s=>({accountId:s.id,groupId:gid})));

        const lessonId=gid+1000;
        const lesson={
          id:lessonId,
          stageRevision:1,
          title:`${cfg.title} Lesson`,
          date:'2026-10-20',
          published:true,
          hidden:false,
          groupId:gid,
          blocks:[
            {id:`b_${lessonId}_1`,type:'overview',title:'Overview',overview:`Welcome to ${cfg.title}`},
            {id:`b_${lessonId}_2`,type:'words',title:'Vocabulary',word:'Apple',transcription:'/ˈæp.əl/',translation:'Яблоко',example:'I eat an apple daily.'},
            {id:`b_${lessonId}_3`,type:'phrases',title:'Phrases',phrase:'Good morning',translation:'Доброе утро'},
            {id:`b_${lessonId}_4`,type:'rule',title:'Rule',rule:'Verb to be: I am, you are, he/she/it is'},
            {id:`b_${lessonId}_5`,type:'classwork',title:'Reading',text:'Tom is an engineer living in London.'},
            {id:`b_${lessonId}_6`,type:'quiz',quizType:'Choice',title:'Class Quiz',items:[{prompt:'Tom ___ in London.',options:['lives','live','lived'],answer:0,maxPoints:1}]},
            {id:`b_${lessonId}_7`,type:'homework',title:'Writing Task',text:'Write 3 sentences about your morning routine.'},
            {id:`b_${lessonId}_8`,type:'quiz',quizType:'Choice',title:'Homework Quiz',items:[{prompt:'They ___ ready.',options:['are','is'],answer:0,maxPoints:1}]}
          ]
        };
        allLessons.push(lesson);

        const examId=gid+2000;
        const b1Id=examId*10+1;
        const b2Id=examId*10+2;
        const b3Id=examId*10+3;
        const exam={
          id:examId,
          title:`${cfg.title} Exam`,
          groupId:gid,
          groupTitle:cfg.title,
          date:'2026-10-20',
          published:true,
          blocks:[
            {
              id:b1Id,
              title:'Reading & Auto-Choice',
              published:true,
              materials:[
                {
                  id:`m_${b1Id}_1`,
                  type:'quiz',
                  quizType:'Choice',
                  scoringVersion:3,
                  items:[{prompt:'Select synonym for "begin":',options:['Start','Finish','Delay'],answer:0,maxPoints:2}]
                }
              ]
            },
            {
              id:b2Id,
              title:'Grammar & Gap Fill',
              published:true,
              materials:[
                {
                  id:`m_${b2Id}_1`,
                  type:'text',
                  answerEnabled:true,
                  scoringVersion:3,
                  maxPoints:3,
                  html:'children',
                  checkMode:'exact',
                  allowedAnswers:'children\nkids',
                  ignoreCase:true,
                  ignoreWhitespace:true,
                  ignorePunctuation:true
                }
              ]
            },
            {
              id:b3Id,
              title:'Writing Assessment',
              published:true,
              materials:[
                {
                  id:`m_${b3Id}_1`,
                  type:'task',
                  scoringVersion:3,
                  maxPoints:5,
                  title:'Short Essay',
                  text:'Write 30 words about your favourite hobby.'
                }
              ]
            }
          ]
        };
        allExams.push(exam);

        allGroups.push({
          id:gid,
          title:cfg.title,
          date:'2026-10-20',
          revision:1,
          studentCount:5,
          lessonIds:[lessonId],
          examIds:[examId],
          teacherIds:gTeachers.map(t=>t.id)
        });
      }
    });

    const allUsers=[dev1,dev2,...allTeachers,...allStudents];

    const usersForActor=(actor)=>{
      if(!actor)return [];
      if(actor.role==='DEVELOPER')return allUsers;
      if(actor.role==='ADMIN'){
        const myGroupIds=new Set(assignments.filter(a=>a.teacherIds.includes(actor.id)).map(a=>a.groupId));
        const coTeacherIds=new Set(assignments.filter(a=>myGroupIds.has(a.groupId)).flatMap(a=>a.teacherIds));
        const myStudentIds=new Set(members.filter(m=>myGroupIds.has(m.groupId)).map(m=>m.accountId));
        return allUsers.filter(u=>u.id===actor.id||coTeacherIds.has(u.id)||myStudentIds.has(u.id)||u.role==='DEVELOPER');
      }
      return [actor];
    };

    const groupsForActor=(actor)=>{
      if(!actor)return [];
      if(actor.role==='DEVELOPER')return allGroups;
      if(actor.role==='ADMIN'){
        const myGroupIds=new Set(assignments.filter(a=>a.teacherIds.includes(actor.id)).map(a=>a.groupId));
        return allGroups.filter(g=>myGroupIds.has(g.id));
      }
      const myGroupIds=new Set(members.filter(m=>m.accountId===actor.id).map(m=>m.groupId));
      return allGroups.filter(g=>myGroupIds.has(g.id));
    };

    const lessonsForActor=(actor)=>{
      if(!actor)return [];
      if(actor.role==='DEVELOPER')return allLessons;
      if(actor.role==='ADMIN'){
        const myGroupIds=new Set(assignments.filter(a=>a.teacherIds.includes(actor.id)).map(a=>a.groupId));
        return allLessons.filter(l=>myGroupIds.has(l.groupId));
      }
      const myGroupIds=new Set(members.filter(m=>m.accountId===actor.id).map(m=>m.groupId));
      return allLessons.filter(l=>myGroupIds.has(l.groupId)&&!l.hidden);
    };

    const examsForActor=(actor)=>{
      if(!actor)return [];
      if(actor.role==='DEVELOPER')return [...allExams,...allExamInstances];
      if(actor.role==='ADMIN'){
        const myGroupIds=new Set(assignments.filter(a=>a.teacherIds.includes(actor.id)).map(a=>a.groupId));
        return [...allExams.filter(e=>myGroupIds.has(e.groupId)),...allExamInstances.filter(i=>myGroupIds.has(i.groupId))];
      }
      return allExamInstances.filter(i=>i.studentId===actor.id);
    };

    const setupPageForUser=async(user)=>{
      assert.ok(user, 'setupPageForUser must receive a valid user object');
      const context=await browser.newContext({viewport:{width:1280,height:800}});
      const page=await context.newPage();
      page.on('pageerror',error=>{ throw new Error(`[${user.name}] Page error: `+error.message); });
      page.on('dialog',dialog=>dialog.accept());
      const origClose=page.close.bind(page);
      page.close=async()=>{
        try{await origClose();}catch(_){}
        try{await context.close();}catch(_){}
      };

      await page.route('**/api/**',async route=>{
        const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
        let status=200,data={};

        if(path==='/api/database-context')data={provider:'d1',revision:3,scope:'site'};
        else if(path==='/api/me'||path==='/api/me/account')data={user};
        else if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:lessonsForActor(user).length},stageActivity:{}};
        else if(path==='/api/me/themes')data={theme:'light',themes:[],revision:0,customRevision:0};
        else if(path==='/api/groups')data={groups:groupsForActor(user)};
        else if(path==='/api/accounts/group-teachers'){
          const allowed=new Set(groupsForActor(user).map(g=>g.id));
          data={assignments:assignments.filter(a=>allowed.has(a.groupId))};
        }
        else if(path==='/api/groups/members'){
          const allowed=new Set(groupsForActor(user).map(g=>g.id));
          data={members:members.filter(m=>allowed.has(m.groupId))};
        }
        else if(path==='/api/admin/users')data={users:usersForActor(user)};
        else if(path==='/api/admin/registrations')data={registrations:[]};
        else if(path==='/api/admin/changes')data={changes:[]};
        else if(path==='/api/lessons'){
          if(method==='GET'){
            const idParam=url.searchParams.get('id');
            if(idParam){
              const lesson=allLessons.find(l=>String(l.id)===String(idParam));
              const myGroups=new Set(groupsForActor(user).map(g=>g.id));
              if(!lesson||(!myGroups.has(lesson.groupId)&&user.role!=='DEVELOPER')){
                status=403;data={error:'Forbidden'};
              }else{
                data={materials:[lesson]};
              }
            }else{
              data={materials:lessonsForActor(user)};
            }
          }else if(method==='PUT'||method==='POST'||method==='PATCH'){
            if(user.role==='USER'){
              status=403;data={error:'Forbidden'};
            }else{
              const body=req.postDataJSON()||{};
              if(body.materials){
                for(const m of body.materials){
                  const existing=allLessons.find(l=>l.id===m.id);
                  if(existing){
                    const myGroups=new Set(groupsForActor(user).map(g=>g.id));
                    if(!myGroups.has(existing.groupId)&&user.role!=='DEVELOPER'){
                      status=403;data={error:'Forbidden'};break;
                    }
                    Object.assign(existing,m);
                  }
                }
              }
              data={ok:true};
            }
          }
        }
        else if(path.startsWith('/api/lessons/')&&path.endsWith('/response')){
          data={ok:true};
        }
        else if(path.startsWith('/api/lessons/')){
          const id=Number(path.split('/')[3]);
          const lesson=allLessons.find(l=>l.id===id);
          const myGroups=new Set(groupsForActor(user).map(g=>g.id));
          if(!lesson||(!myGroups.has(lesson.groupId)&&user.role!=='DEVELOPER')){
            status=403;data={error:'Forbidden'};
          }else if(method==='PATCH'){
            const body=req.postDataJSON()||{};
            if(body.changes){
              if(typeof body.changes.hiddenFromStudents==='boolean')lesson.hidden=body.changes.hiddenFromStudents;
            }
            data={ok:true,lesson};
          }else{
            data={lesson};
          }
        }
        else if(path==='/api/exams'){
          if(method==='GET')data={exams:examsForActor(user)};
          else if(method==='POST'){
            const body=req.postDataJSON()||{};
            data=body.exam||{id:Date.now()};
          }
        }
        else if(path==='/api/exams/assign'){
          if(user.role==='USER'){
            status=403;data={error:'Forbidden'};
          }else{
            const body=req.postDataJSON()||{};
            const myGroups=new Set(groupsForActor(user).map(g=>g.id));
            if(!myGroups.has(Number(body.groupId))&&user.role!=='DEVELOPER'){
              status=403;data={error:'Forbidden'};
            }else{
              const sourceExam=allExams.find(e=>e.id===Number(body.examId));
              const groupStudents=members.filter(m=>m.groupId===Number(body.groupId)).map(m=>allStudents.find(s=>s.id===m.accountId)).filter(Boolean);
              for(const s of groupStudents){
                const instanceId=Number(`${sourceExam.id}${s.id.slice(-2)}`);
                if(!allExamInstances.some(i=>i.id===instanceId)){
                  allExamInstances.push({
                    id:instanceId,
                    sourceExamId:sourceExam.id,
                    groupId:sourceExam.groupId,
                    groupTitle:sourceExam.groupTitle,
                    title:sourceExam.title,
                    date:sourceExam.date,
                    published:true,
                    studentId:s.id,
                    studentName:s.name,
                    instanceStatus:'active',
                    maximumPoints:10,
                    earnedPoints:null,
                    blocks:sourceExam.blocks.map(b=>({
                      id:Number(`${b.id}${s.id.slice(-2)}`),
                      title:b.title,
                      published:true,
                      materials:b.materials
                    }))
                  });
                }
              }
              chatMessages.push({
                id:++msgSeq,
                senderId:user.id,
                sender:user.name,
                groupId:Number(body.groupId),
                roomId:`group:${body.groupId}`,
                category:'learning',
                text:`Exam assigned: ${sourceExam.title}`,
                examId:sourceExam.id,
                assignmentActive:true,
                createdMs:Date.now()
              });
              data={ok:true,assigned:groupStudents.length};
            }
          }
        }
        else if(path==='/api/exams/work')data={work:[]};
        else if(path==='/api/exams/workflow'){
          const examId=Number(url.searchParams.get('examId')||0);
          const instance=allExamInstances.find(i=>i.id===examId);
          data={examId,state:instance?.instanceStatus||'assigned',canStart:true,canComplete:false,history:[],blocks:3,submitted:0,published:0};
        }
        else if(path==='/api/assessment'){
          if(method==='GET'){
            const kind=url.searchParams.get('kind');
            const id=Number(url.searchParams.get('id'));
            const targetStudent=url.searchParams.get('student')||user.id;

            if(user.role==='USER'&&targetStudent!==user.id){
              status=403;data={error:'Forbidden'};
            }else{
              const key=`${id}:${targetStudent}`;
              const work=assessmentWork.get(key)||{
                kind,id,revision:1,state:'draft',saved:false,answers:{},points:{},suggestedPoints:{},overallComment:'',privateNote:''
              };
              const isStudent=user.role==='USER';
              data={
                kind:work.kind,
                id:work.id,
                revision:work.revision,
                state:work.state,
                saved:work.saved,
                answers:work.answers,
                points:work.points,
                suggestedPoints:isStudent?{}:work.suggestedPoints,
                overallComment:work.overallComment,
                privateNote:isStudent?'':work.privateNote,
                materials:[]
              };
            }
          }else if(method==='POST'){
            const body=req.postDataJSON()||{};
            const targetStudent=body.studentId||user.id;
            const key=`${body.id}:${targetStudent}`;
            const work=assessmentWork.get(key)||{
              kind:body.kind,id:body.id,revision:0,state:'draft',saved:false,answers:{},points:{},suggestedPoints:{},overallComment:'',privateNote:''
            };

            if(body.action==='draft'||body.action==='submit'){
              if(user.role!=='USER'&&user.id!==targetStudent){
                status=403;data={error:'Only student submits answers'};
              }else{
                work.answers=body.answers||work.answers;
                work.revision+=1;
                if(body.action==='submit'){
                  work.state='submitted';
                  work.saved=true;
                  const suggestedPoints={};
                  for(const [partId,answers] of Object.entries(work.answers)){
                    if(partId.endsWith('_1')){
                      suggestedPoints[partId]={0:answers[0]===0?2:0};
                    }else if(partId.endsWith('_2')){
                      const val=String(answers[0]||'').trim().toLowerCase();
                      suggestedPoints[partId]={0:['children','kids'].includes(val)?3:0};
                    }
                  }
                  work.suggestedPoints=suggestedPoints;
                  const inst=allExamInstances.find(i=>i.studentId===targetStudent&&i.blocks?.some(b=>b.id===body.id));
                  if(body.autoPublish && Object.keys(suggestedPoints).length>0 && !Object.keys(work.answers).some(k=>k.endsWith('_3'))){
                    work.state='published';
                    work.points=JSON.parse(JSON.stringify(suggestedPoints));
                    if(inst){
                      inst.instanceStatus='completed';
                      inst.earnedPoints=Object.values(work.points).flatMap(Object.values).reduce((a,b)=>a+Number(b||0),0);
                    }
                  }else if(inst){
                    inst.instanceStatus='ready';
                  }
                }else{
                  work.state='draft';
                }
                assessmentWork.set(key,work);
                data={...work,revision:work.revision};
              }
            }else if(body.action==='review'||body.action==='publish'){
              if(user.role==='USER'){
                status=403;data={error:'Students cannot review work'};
              }else{
                work.revision+=1;
                work.points=body.points||work.points;
                work.overallComment=body.overallComment||work.overallComment;
                work.privateNote=body.privateNote||work.privateNote;
                if(body.action==='publish'){
                  work.state='published';
                  const inst=allExamInstances.find(i=>i.studentId===targetStudent&&i.blocks?.some(b=>b.id===body.id));
                  if(inst){
                    inst.instanceStatus='completed';
                    inst.earnedPoints=Object.values(work.points).flatMap(Object.values).reduce((a,b)=>a+Number(b||0),0);
                  }
                }else{
                  work.state='reviewing';
                }
                assessmentWork.set(key,work);
                data={...work,revision:work.revision};
              }
            }
          }
        }
        else if(path==='/api/messages'){
          if(method==='GET'){
            const userGroups=groupsForActor(user);
            const rooms=userGroups.map(g=>({
              id:`group:${g.id}`,
              title:g.title,
              kind:'group',
              groupId:g.id,
              access:{protected:true,state:'accepted',canSend:true},
              unread:{personal:0,learning:chatMessages.filter(m=>m.groupId===g.id&&m.senderId!==user.id).length},
              lastMessage:chatMessages.filter(m=>m.groupId===g.id).at(-1)||null
            }));
            data={rooms,groups:userGroups.map(g=>({id:g.id,title:g.title})),contacts:[],unread:{},total:0};
          }else if(method==='POST'){
            const body=req.postDataJSON()||{};
            const roomId=body.roomId||'';
            const gid=Number(roomId.replace('group:',''));
            const userGroups=new Set(groupsForActor(user).map(g=>g.id));
            if(!userGroups.has(gid)&&user.role!=='DEVELOPER'){
              status=403;data={error:'Forbidden: outside group'};
            }else{
              const msg={
                id:++msgSeq,
                senderId:user.id,
                sender:user.name,
                groupId:gid,
                roomId,
                category:'learning',
                text:body.text||'',
                createdMs:Date.now()
              };
              chatMessages.push(msg);
              data={message:msg};
            }
          }
        }
        else if(path.includes('/catalogs/'))data={documents:{},cards:[],next:null};

        await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      });

      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady&&typeof placeBoot!=='undefined'&&placeBoot);
      return page;
    };

    yield "01. Developer Alpha sees all 18 subgroups across 9 levels, 54 teachers and 90 students";
    {
      const page=await setupPageForUser(dev1);
      await page.locator('.side nav [data-jump="groups"]').click();
      await page.locator('#groups.on').waitFor();

      // Check level deck has all 9 levels
      for(const lvl of cefrLevels){
        assert.ok(await page.locator(`[data-group-level="${lvl}"]`).isVisible(), `Deck must have level ${lvl}`);
      }

      // Check Level A1: both subgroups visible
      await page.locator('[data-group-level="A1"]').click();
      await page.locator('#groupList h2').waitFor();
      assert.ok(await page.locator('#groupList').getByText('A1 Alpha Morning').isVisible());
      assert.ok(await page.locator('#groupList').getByText('A1 Beta Evening').isVisible());

      // Check Level C2: both subgroups visible
      await page.locator('#groups [data-nav-back]').click();
      await page.locator('[data-group-level="C2"]').click();
      await page.locator('#groupList h2').waitFor();
      assert.ok(await page.locator('#groupList').getByText('C2 Alpha Morning').isVisible());
      assert.ok(await page.locator('#groupList').getByText('C2 Beta Evening').isVisible());

      // Check Admin accounts tab: Developer Alpha sees all 54 teachers
      await page.evaluate(()=>window.enquizVisit('admin'));
      await page.locator('#admin.on').waitFor();
      await page.locator('[data-admin-bucket="staff"]').click();
      await page.locator('#adminAccountList .path').first().waitFor();
      assert.ok(await page.locator('#adminAccountList').getByText('Developer Beta').count() > 0, 'Dev 1 must see Dev 2');
      assert.equal(allTeachers.length, 54, 'Topology must have exactly 54 teachers');
      assert.equal(allStudents.length, 90, 'Topology must have exactly 90 students');
      assert.equal(allGroups.length, 18, 'Topology must have exactly 18 subgroups');

      await page.close();
    }

    yield "02. Developer Beta also has full visibility across all 18 subgroups, lessons and staff";
    {
      const page=await setupPageForUser(dev2);
      await page.locator('.side nav [data-jump="groups"]').click();
      await page.locator('#groups.on').waitFor();

      await page.locator('[data-group-level="B1"]').click();
      assert.ok(await page.locator('#groupList').getByText('B1 Alpha Morning').isVisible());
      assert.ok(await page.locator('#groupList').getByText('B1 Beta Evening').isVisible());

      await page.evaluate(()=>window.enquizVisit('admin'));
      await page.locator('#admin.on').waitFor();
      await page.locator('[data-admin-bucket="staff"]').click();
      await page.locator('#adminAccountList .path').first().waitFor();
      assert.ok(await page.locator('#adminAccountList').getByText('Developer Alpha').count() > 0, 'Dev 2 must see Dev 1');

      await page.close();
    }

    yield "03. Teacher 101_1 of A1 Morning sees only A1 Morning, its 3 co-teachers and 5 students";
    {
      const teacher=allTeachers.find(t=>t.login==='teacher_101_1');
      const page=await setupPageForUser(teacher);
      await page.locator('.side nav [data-jump="groups"]').click();
      await page.locator('#groups.on').waitFor();

      // Only Level A1 is visible
      await page.locator('[data-group-level="A1"]').click();
      await page.locator('#groupList h2').waitFor();
      assert.ok(await page.locator('#groupList').getByText('A1 Alpha Morning').isVisible());
      assert.equal(await page.locator('#groupList').getByText('A1 Beta Evening').count(), 0, 'Teacher 1 must NOT see A1 Beta Evening');

      // Click group detail for 101
      await page.locator('[data-group-open="101"]').click();
      await page.locator('#groupdetail.on').waitFor();

      // Verify teachers of A1 Morning (all 3 co-teachers)
      await page.locator('[data-detail-people="teachers"]').click();
      await page.locator('#groupteachers.on').waitFor();
      await page.locator('#groupDetailTeachers .group-person').first().waitFor();
      const teachers101=allTeachers.filter(t=>t.groupId===101);
      for(const t of teachers101){
        assert.ok(await page.locator('#groupDetailTeachers').getByText(t.name).isVisible(), `Must see co-teacher ${t.name}`);
      }
      // Must NOT see teacher from group 102
      assert.equal(await page.locator('#groupDetailTeachers').getByText('Teacher 102-1').count(), 0);

      // Verify students of A1 Morning (all 5 students)
      await page.locator('#groupteachers [data-nav-back]').click();
      await page.locator('#groupdetail.on').waitFor();
      await page.locator('[data-detail-people="students"]').click();
      await page.locator('#groupstudents.on').waitFor();
      await page.locator('#groupDetailStudents .group-person').first().waitFor();
      const students101=allStudents.filter(s=>s.groupId===101);
      for(const s of students101){
        assert.ok(await page.locator('#groupDetailStudents').getByText(s.name).isVisible(), `Must see student ${s.name}`);
      }
      assert.equal(await page.locator('#groupDetailStudents').getByText('Student 102-1').count(), 0);

      await page.close();
    }

    yield "04. Teacher 402_2 of B1 Evening sees only B1 Evening, its 3 co-teachers and 5 students";
    {
      const teacher=allTeachers.find(t=>t.login==='teacher_402_2');
      const page=await setupPageForUser(teacher);
      await page.locator('.side nav [data-jump="groups"]').click();
      await page.locator('#groups.on').waitFor();

      // Only Level B1 has their groups
      await page.locator('[data-group-level="B1"]').click();
      await page.locator('#groupList h2').waitFor();
      assert.ok(await page.locator('#groupList').getByText('B1 Beta Evening').isVisible());
      assert.equal(await page.locator('#groupList').getByText('B1 Alpha Morning').count(), 0);

      await page.close();
    }

    yield "05. Student 401_3 of B1 Morning has student chrome and cannot access admin/bugs";
    {
      const student=allStudents.find(s=>s.login==='student_401_3');
      const page=await setupPageForUser(student);
      assert.equal(await page.locator('.side nav [data-jump="admin"]:visible').count(), 0);
      assert.equal(await page.locator('.side nav [data-jump="bugs"]:visible').count(), 0);

      await page.evaluate(()=>window.enquizVisit('admin'));
      assert.equal(await page.locator('#admin.on').count(), 0);

      await page.close();
    }

    yield "06. Teacher 101_1 hides lesson 101: lesson disappears for Student 101_1, remains visible for Teacher with Hidden badge; unhiding restores it";
    {
      const teacher=allTeachers.find(t=>t.login==='teacher_101_1');
      const student=allStudents.find(s=>s.login==='student_101_1');
      const lesson=allLessons.find(l=>l.groupId===101);

      // Teacher opens lessons via Groups -> Group 101 -> Lessons
      const pageT=await setupPageForUser(teacher);
      await pageT.locator('.side nav [data-jump="groups"]').click();
      await pageT.locator('#groups.on').waitFor();
      await pageT.locator('[data-group-level="A1"]').click();
      await pageT.locator('[data-group-open="101"]').click();
      await pageT.locator('#groupdetail.on').waitFor();
      await pageT.locator('[data-detail-lessons]').click();
      await pageT.locator('#days.on').waitFor();
      assert.ok(await pageT.locator(`[data-lm-open="${lesson.id}"]`).isVisible());

      // Teacher hides the lesson via toggle button
      await pageT.locator(`[data-lm-hide="${lesson.id}"]`).click();
      await pageT.waitForFunction(id=>document.querySelector(`[data-lm-open="${id}"]`)?.closest('.day-row')?.classList.contains('is-hidden'), lesson.id);
      assert.ok(lesson.hidden, 'Lesson must be set to hidden');

      // Student checks lessons: hidden lesson must NOT appear
      const pageS=await setupPageForUser(student);
      await pageS.evaluate(()=>window.enquizVisit('days'));
      await pageS.locator('#days.on').waitFor();
      assert.equal(await pageS.locator(`[data-lm-open="${lesson.id}"]`).count(), 0, 'Hidden lesson must not be visible to student');

      // Teacher unhides lesson
      await pageT.locator(`[data-lm-hide="${lesson.id}"]`).click();
      await pageT.waitForFunction(id=>!document.querySelector(`[data-lm-open="${id}"]`)?.closest('.day-row')?.classList.contains('is-hidden'), lesson.id);
      assert.equal(lesson.hidden, false, 'Lesson must be unhidden');

      // Student refreshes: lesson is visible again
      await pageS.reload();
      await pageS.evaluate(()=>window.enquizVisit('days'));
      await pageS.locator('#days.on').waitFor();
      assert.ok(await pageS.locator(`[data-lm-open="${lesson.id}"]`).isVisible(), 'Unhidden lesson must reappear for student');

      await pageT.close();
      await pageS.close();
    }

    yield "07. Cross-subgroup access control (IDOR prevention): Student 101_1 and Teacher 101_1 cannot tamper with B1 Evening (402)";
    {
      const student=allStudents.find(s=>s.login==='student_101_1');
      const teacher=allTeachers.find(t=>t.login==='teacher_101_1');
      const lesson402=allLessons.find(l=>l.groupId===402);

      const pageS=await setupPageForUser(student);
      // Student 101_1 tries to fetch B1 Evening lesson directly
      const studentTamper=await pageS.evaluate(async(id)=>{
        const res=await fetch('/api/lessons?id='+id);
        return {status:res.status};
      }, lesson402.id);
      assert.equal(studentTamper.status, 403, 'Cross-subgroup lesson fetch by student must return 403');

      // Student 101_1 tries to read assessment of another student in group 402
      const assessmentTamper=await pageS.evaluate(async()=>{
        const res=await fetch('/api/assessment?kind=exam-block&id=24021&student=s_402_1');
        return {status:res.status};
      });
      assert.equal(assessmentTamper.status, 403, 'Cross-subgroup assessment fetch must return 403');
      await pageS.close();

      const pageT=await setupPageForUser(teacher);
      // Teacher 101_1 tries to assign exam in group 402
      const teacherTamper=await pageT.evaluate(async()=>{
        const res=await fetch('/api/exams/assign',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({examId:2402,groupId:402,targetKind:'group'})
        });
        return {status:res.status};
      });
      assert.equal(teacherTamper.status, 403, 'Teacher from group 101 cannot assign exams in group 402');
      await pageT.close();
    }

    yield "08. Teacher 101_1 assigns Exam 101 to group 101: creates active instances and posts 'Exam assigned' message to group chat";
    {
      const teacher=allTeachers.find(t=>t.login==='teacher_101_1');
      const student=allStudents.find(s=>s.login==='student_101_1');
      const exam101=allExams.find(e=>e.groupId===101);

      const pageT=await setupPageForUser(teacher);
      await pageT.evaluate(()=>window.enquizVisit('exams'));
      await pageT.locator('#exams.on').waitFor();
      await pageT.locator('[data-exam-level="A1"]').click();
      await pageT.locator('[data-exam-group-view="101"]').click();

      // Assign exam to group
      await pageT.locator(`[data-exam-assign="${exam101.id}"]`).click();
      await pageT.locator('.exam-assign-dialog[open]').waitFor();
      await pageT.locator('.exam-assign-dialog select').selectOption({value:'group'});
      await pageT.locator('.exam-assign-dialog button[type="submit"]').click();
      await pageT.locator('.exam-assign-dialog').waitFor({state:'detached'});

      // Verify 5 active exam instances created in memory
      const instances101=allExamInstances.filter(i=>i.groupId===101);
      assert.equal(instances101.length, 5, 'Must create 5 exam instances for all 5 students');
      assert.ok(instances101.every(i=>i.instanceStatus==='active'), 'All instances must be active');

      // Verify chat message created
      const chatAssignMsg=chatMessages.find(m=>m.groupId===101&&m.category==='learning');
      assert.ok(chatAssignMsg, 'System assignment message must be posted to group chat');
      assert.match(chatAssignMsg.text, /Exam assigned/);

      // Student 101_1 opens exams and sees the active exam directly
      const pageS=await setupPageForUser(student);
      await pageS.evaluate(()=>window.enquizVisit('exams'));
      await pageS.locator('#exams.on').waitFor();
      const myExamInstance=allExamInstances.find(i=>i.studentId===student.id);
      assert.ok(myExamInstance, 'Student must have an assigned exam instance');
      assert.ok(await pageS.locator(`[data-exam-open="${myExamInstance.id}"]`).isVisible(), 'Student must see assigned exam in exams list');

      await pageT.close();
      await pageS.close();
    }

    yield "09. Chat room isolation: Student 101_1 asks question in group 101; all 3 teachers receive it; Group 402 cannot see it";
    {
      const student101=allStudents.find(s=>s.login==='student_101_1');
      const teacher101_1=allTeachers.find(t=>t.login==='teacher_101_1');
      const teacher101_2=allTeachers.find(t=>t.login==='teacher_101_2');
      const teacher402=allTeachers.find(t=>t.login==='teacher_402_1');

      // Student 101_1 sends a question in group chat
      const pageS=await setupPageForUser(student101);
      const postResult=await pageS.evaluate(async()=>{
        const res=await fetch('/api/messages',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({roomId:'group:101',text:'Teacher, what is the deadline for this exam?'})
        });
        return res.json();
      });
      assert.ok(postResult.message, 'Message must be created');
      await pageS.close();

      // Teacher 101_1 and Teacher 101_2 see the message in group:101
      const pageT1=await setupPageForUser(teacher101_1);
      const msgsT1=await pageT1.evaluate(async()=>{
        const res=await fetch('/api/messages');
        const data=await res.json();
        return data.rooms.find(r=>r.id==='group:101');
      });
      assert.ok(msgsT1, 'Teacher 101_1 must have room group:101');
      assert.equal(msgsT1.lastMessage.text, 'Teacher, what is the deadline for this exam?');
      await pageT1.close();

      const pageT2=await setupPageForUser(teacher101_2);
      const msgsT2=await pageT2.evaluate(async()=>{
        const res=await fetch('/api/messages');
        const data=await res.json();
        return data.rooms.find(r=>r.id==='group:101');
      });
      assert.ok(msgsT2, 'Teacher 101_2 must also have room group:101');
      assert.equal(msgsT2.lastMessage.text, 'Teacher, what is the deadline for this exam?');
      await pageT2.close();

      // Teacher 402 does NOT see room group:101
      const pageT402=await setupPageForUser(teacher402);
      const roomsT402=await pageT402.evaluate(async()=>{
        const res=await fetch('/api/messages');
        const data=await res.json();
        return data.rooms.map(r=>r.id);
      });
      assert.ok(!roomsT402.includes('group:101'), 'Teacher 402 must NOT see group:101 room');
      await pageT402.close();
    }

    yield "10. Student 101_1 takes exam: auto-saves answers as draft, then submits with Choice, Gap and Task";
    {
      const student=allStudents.find(s=>s.login==='student_101_1');
      const instance=allExamInstances.find(i=>i.studentId===student.id);
      const block1=instance.blocks[0];

      const pageS=await setupPageForUser(student);
      // Student simulates draft saving via API (like assessmentWrite draft)
      const draftRes=await pageS.evaluate(async(blockId)=>{
        const res=await fetch('/api/assessment',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            kind:'exam-block',
            id:blockId,
            action:'draft',
            answers:{[`m_${blockId}_1`]:{0:0}}
          })
        });
        return res.json();
      }, block1.id);
      assert.equal(draftRes.state, 'draft', 'Work must be in draft state');
      assert.equal(draftRes.saved, false, 'Draft is not yet submitted');

      // Student submits all answers: Choice (0), Gap ('children'), Task ('My hobby is reading.')
      const submitRes=await pageS.evaluate(async(blockId)=>{
        const res=await fetch('/api/assessment',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            kind:'exam-block',
            id:blockId,
            action:'submit',
            answers:{
              [`m_${blockId}_1`]:{0:0},
              [`m_${blockId}_2`]:{0:'children'},
              [`m_${blockId}_3`]:{0:'My favourite hobby is reading historical fiction.'}
            }
          })
        });
        return res.json();
      }, block1.id);

      assert.equal(submitRes.state, 'submitted', 'Work must transition to submitted');
      assert.equal(submitRes.saved, true, 'Student work is saved');
      assert.equal(instance.instanceStatus, 'ready', 'Exam instance must transition to ready for review');

      // Verify auto-checking generated suggestedPoints for Choice and Gap
      const work=assessmentWork.get(`${block1.id}:${student.id}`);
      assert.ok(work.suggestedPoints[`m_${block1.id}_1`], 'Choice must have auto-score');
      assert.equal(work.suggestedPoints[`m_${block1.id}_1`][0], 2, 'Choice must score 2 points');
      assert.ok(work.suggestedPoints[`m_${block1.id}_2`], 'Gap fill must have auto-score');
      assert.equal(work.suggestedPoints[`m_${block1.id}_2`][0], 3, 'Gap fill must score 3 points');

      await pageS.close();
    }

    yield "11. Co-teaching review: Teacher 101_1 & 101_2 review students; Choice & Gap show Suggested points; Teacher grades Task and publishes with privateNote";
    {
      const teacher1=allTeachers.find(t=>t.login==='teacher_101_1');
      const student1=allStudents.find(s=>s.login==='student_101_1');
      const instance1=allExamInstances.find(i=>i.studentId===student1.id);
      const block1=instance1.blocks[0];

      const pageT=await setupPageForUser(teacher1);
      // Teacher reads assessment: sees suggested points for Choice and Gap
      const reviewData=await pageT.evaluate(async({blockId,studentId})=>{
        const res=await fetch(`/api/assessment?kind=exam-block&id=${blockId}&student=${studentId}`);
        return res.json();
      }, {blockId:block1.id,studentId:student1.id});

      assert.equal(reviewData.suggestedPoints[`m_${block1.id}_1`][0], 2, 'Teacher sees 2 suggested points for Choice');
      assert.equal(reviewData.suggestedPoints[`m_${block1.id}_2`][0], 3, 'Teacher sees 3 suggested points for Gap fill');

      // Teacher grades the open task (5 points) and publishes with overallComment and privateNote
      const publishRes=await pageT.evaluate(async({blockId,studentId})=>{
        const res=await fetch('/api/assessment',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            kind:'exam-block',
            id:blockId,
            studentId,
            action:'publish',
            points:{
              [`m_${blockId}_1`]:{0:2},
              [`m_${blockId}_2`]:{0:3},
              [`m_${blockId}_3`]:{0:5}
            },
            overallComment:'Excellent essay and accurate grammar!',
            privateNote:'High performing student, consider for advanced track.'
          })
        });
        return res.json();
      }, {blockId:block1.id,studentId:student1.id});

      assert.equal(publishRes.state, 'published', 'Assessment must transition to published');
      assert.equal(instance1.instanceStatus, 'completed', 'Exam instance must transition to completed');
      assert.equal(instance1.earnedPoints, 10, 'Total points earned must be 10 (2 + 3 + 5)');

      await pageT.close();
    }

    yield "12. Student 101_1 views published results: sees scores, error breakdown and public feedback; privateNote is strictly hidden";
    {
      const student1=allStudents.find(s=>s.login==='student_101_1');
      const instance1=allExamInstances.find(i=>i.studentId===student1.id);
      const block1=instance1.blocks[0];

      const pageS=await setupPageForUser(student1);
      const studentView=await pageS.evaluate(async({blockId})=>{
        const res=await fetch(`/api/assessment?kind=exam-block&id=${blockId}`);
        return res.json();
      }, {blockId:block1.id});

      assert.equal(studentView.state, 'published', 'Student sees published state');
      assert.equal(studentView.overallComment, 'Excellent essay and accurate grammar!', 'Student sees public teacher feedback');
      assert.equal(studentView.privateNote, '', 'privateNote must be completely empty/hidden for student');
      assert.ok(!JSON.stringify(studentView).includes('advanced track'), 'Private teacher notes must never leak into student payload');

      await pageS.close();
    }

    yield "13. Instant Auto-Publish: 100% objective exam submission publishes immediately and reflects in UI without teacher intervention";
    {
      const student2=allStudents.find(s=>s.login==='student_101_2');
      const instance2=allExamInstances.find(i=>i.studentId===student2.id);
      assert.ok(instance2, 'Student 101_2 must have an assigned exam instance');
      const block2=instance2.blocks[0];

      const pageS=await setupPageForUser(student2);

      // Student submits purely objective questions with autoPublish=true
      const submitRes=await pageS.evaluate(async({blockId})=>{
        const answers={
          [`m_${blockId}_1`]: {0: 0},
          [`m_${blockId}_2`]: {0: 'children'}
        };
        const res=await fetch('/api/assessment',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({
            kind:'exam-block',
            id:blockId,
            action:'submit',
            autoPublish:true,
            answers
          })
        });
        return res.json();
      }, {blockId:block2.id});

      assert.equal(submitRes.state, 'published', 'Submission must auto-publish immediately');
      assert.equal(submitRes.saved, true, 'Submission is marked as saved');
      assert.equal(submitRes.points[`m_${block2.id}_1`][0], 2, 'Choice quiz auto-scored 2 points');
      assert.equal(submitRes.points[`m_${block2.id}_2`][0], 3, 'Gap fill auto-scored 3 points');

      // Verify exam instance is immediately completed
      assert.equal(instance2.instanceStatus, 'completed', 'Exam instance is marked completed without teacher review');
      assert.equal(instance2.earnedPoints, 5, 'Full points recorded on instance');

      // Student views the work directly
      const workView=await pageS.evaluate(async({blockId})=>{
        const res=await fetch(`/api/assessment?kind=exam-block&id=${blockId}`);
        return res.json();
      }, {blockId:block2.id});

      assert.equal(workView.state, 'published', 'Student reads published state');
      assert.equal(workView.points[`m_${block2.id}_1`][0], 2);
      assert.equal(workView.points[`m_${block2.id}_2`][0], 3);

      await pageS.close();
    }

  }finally{
    if(browser)await browser.close();
    server.close();
  }
});
