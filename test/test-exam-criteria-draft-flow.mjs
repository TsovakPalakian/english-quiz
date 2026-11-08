import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {ExamService} from '../src/learning-exams.mjs';
import {examElementMax,examGrading} from '../src/exam-scoring.mjs';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {extractFunction} from './helpers/extract-function.mjs';
import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));

const teacher={id:'teacher',login:'TsovakTeacher',name:'Teacher',role:'ADMIN'};

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  sqlite.exec("INSERT INTO class_groups(id,title) VALUES(9001,'Default A1'); INSERT INTO catalog_documents(namespace,key,value_json) VALUES('accounts-group-teachers','9001','{\"revision\":1,\"teacherIds\":[\"teacher\"]}');");
  const args=command=>command.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={
    async read(sql,args=[]){return sqlite.prepare(sql).all(...args);},
    async readMany(commands){return commands.map(command=>sqlite.prepare(command.sql).all(...args(command)));},
    async atomic(commands){
      sqlite.exec('BEGIN IMMEDIATE');
      try{
        const result=commands.map(command=>{
          const query=sqlite.prepare(command.sql),rows=query.all(...args(command));
          return {cols:query.columns().map(c=>({name:c.name})),rows:rows.map(row=>Object.values(row).map(value=>({type:value==null?'null':typeof value==='number'?'integer':'text',value:String(value)})))};
        });
        sqlite.exec('COMMIT');
        return result;
      }catch(error){
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return {sqlite,db};
}

test('examElementMax reliably calculates rubric scores and ignores malformed draft lines without NaN', ()=>{
  assert.equal(examElementMax({criteria:'Content | 3\nGrammar | 2',maxPoints:'6',type:'task'}),5);
  assert.equal(examElementMax({criteria:'Content | 0,1\nLanguage | 10',maxPoints:'6',type:'task'}),10.1);
  assert.equal(examElementMax({criteria:'тополя|3л',maxPoints:'6',type:'task'}),6);
  assert.equal(examElementMax({criteria:'тополя|',maxPoints:'6',type:'task'}),6);
  assert.equal(examElementMax({criteria:'',maxPoints:'6',type:'task'}),6);
  assert.equal(examElementMax({criteria:null,maxPoints:'6',type:'task'}),6);
  assert.equal(examElementMax({type:'task'}),0);
  assert.equal(examElementMax({type:'text'}),1);
});

test('Bug ID 983e19664eac604ce194479debe295a7: unpublished draft with task criteria тополя|3л saves without 400 Maximum points error', async()=>{
  const f=fixture();
  try{
    const exams=new ExamService(f.db);
    const materials=[{
      type:'task',
      collapsed:false,
      tab:'overview',
      gradeMode:'assignment',
      maxPoints:'6',
      assignmentId:'a-21ed3551-c8ff-4eeb-92e2-b0cf166f425c',
      scoringVersion:3,
      title:'Task1',
      text:'ляляляля',
      blockColor:'#9265ad',
      criteria:'тополя|3л'
    }];
    const draft=await exams.save(teacher,{
      exam:{
        groupId:9001,
        title:'C2 Exam',
        date:'2026-11-08',
        published:false,
        hidden:false,
        blocks:[{
          title:'Examination block',
          published:false,
          hidden:false,
          materials
        }]
      }
    });

    assert.ok(draft.id);
    const savedMaterials=draft.blocks[0].materials;
    assert.equal(savedMaterials.length,1);
    assert.equal(savedMaterials[0].title,'Task1');
    assert.equal(savedMaterials[0].maxPoints,'6');
    assert.equal(savedMaterials[0].criteria,'тополя|3л');

    // Publication with invalid criteria must reject with exact criteria message, not maximum points error
    await assert.rejects(
      exams.save(teacher,{
        exam:{
          id:draft.id,
          groupId:9001,
          title:'C2 Exam',
          published:true,
          blocks:[{
            ...draft.blocks[0],
            published:true
          }]
        }
      }),
      error=>error.status===400&&error.message==='Use one criterion per line: Content | 3.'
    );

    // After correcting criteria format, publication succeeds
    const correctedDraft=await exams.save(teacher,{
      exam:{
        id:draft.id,
        groupId:9001,
        title:'C2 Exam',
        published:true,
        blocks:[{
          ...draft.blocks[0],
          published:true,
          materials:[{
            ...savedMaterials[0],
            criteria:'Content | 3\nGrammar | 2'
          }]
        }]
      }
    });
    assert.equal(correctedDraft.published,true);
    assert.equal(correctedDraft.blocks[0].published,true);
  }finally{
    f.sqlite.close();
  }
});

test('examPublishPointsGap detects invalid criteria before network request and points to criteria field with bad class', async()=>{
  const hooks=readFileSync(new URL('../client/main/main-hooks.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../client/main/exam-workflow.js',import.meta.url),'utf8');
  const task={
    id:'task-block-1',
    type:'task',
    title:'Task1',
    scoringVersion:3,
    maxPoints:'6',
    criteria:'тополя|3л',
    assignmentId:'task-1',
    tab:'overview'
  };

  const criteriaInput={
    dataset:{field:'criteria'},
    classList:{added:'',add(name){this.added=name;}},
    focused:false,
    focus(){this.focused=true;}
  };
  const maxPointsInput={
    dataset:{field:'maxPoints'},
    classList:{added:'',add(name){this.added=name;}},
    focused:false,
    focus(){this.focused=true;}
  };

  const article={
    dataset:{blockId:'task-block-1'},
    classList:{removed:'',remove(name){this.removed=name;}},
    querySelector(sel){
      if(sel==='[data-field="criteria"]')return criteriaInput;
      if(sel==='[data-field="maxPoints"]')return maxPointsInput;
      return null;
    },
    querySelectorAll(){return [];}
  };
  const root={querySelectorAll(sel){return sel==='[data-block-id]'?[article]:[];}};
  const notes=[],saved=[];
  const scope={
    lmState:{id:188134573829691,examOwned:true,published:false,mode:'edit',tab:'overview',blocks:[task]},
    viewGen:1,
    viewAccount:null,
    viewSwitching:false,
    lmSaveTimer:0,
    canEditLessons:()=>true,
    clearTimeout(){},
    document:{getElementById(id){return id==='material'?{dataset:{lmKind:'exam'}}:id==='lmBlocks'?root:null;}},
    window:{MaterialScoring:{examGrading},LearningMain:{perform:fn=>fn(),notice(message){notes.push(message);}}},
    examSync:async()=>saved.push(scope.lmState.published),
    lmShow(){},
    lmNote(message){notes.push(message);},
    examDress(){},
    lmRenderEditor(){saved.push('render');}
  };

  vm.runInNewContext(
    extractFunction(workflow,'examPublishPointsGap')+'\n'+
    extractFunction(workflow,'examPublishPointsField')+'\n'+
    extractFunction(hooks,'stageSaveLesson'),
    scope
  );

  // Saving as draft should pass through without publish gap block
  await scope.stageSaveLesson(false);
  assert.deepEqual(saved,[false]);
  saved.length=0;
  notes.length=0;

  // Publishing with malformed criteria stops before network request, notifies, and highlights criteria input
  await scope.stageSaveLesson(true);
  assert.deepEqual(saved,[]);
  assert.equal(scope.lmState.published,false);
  assert.equal(notes[0],'Use one criterion per line: Content | 3.');
  assert.equal(criteriaInput.focused,true);
  assert.equal(criteriaInput.classList.added,'bad');
  assert.notEqual(maxPointsInput.classList.added,'bad');

  // Correct criteria allows publishing
  task.criteria='Content | 3\nGrammar | 3';
  saved.length=0;
  notes.length=0;
  criteriaInput.focused=false;
  criteriaInput.classList.added='';

  await scope.stageSaveLesson(true);
  assert.deepEqual(saved,[true]);
  assert.equal(notes[0],'');
});

test('visual UI: exam criteria draft editing prevents intrusive modal and publish validates criteria with focus and .bad', async()=>{
  const root=resolve('rollback/production-assets');
  const server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);
    if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'});res.end(readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await launchChromium(chromium);
  try{
    const page=await browser.newPage({viewport:{width:1280,height:850}});
    const user={id:'teacher_yester',login:'teacher_yester',name:'Teacher Yester',role:'ADMIN'};
    const group={id:24,title:'C2 Advanced',studentCount:5,lessonIds:[],examIds:[188134573829691]};
    const taskMaterial={
      id:'part-task-1',
      type:'task',
      collapsed:false,
      tab:'overview',
      gradeMode:'assignment',
      maxPoints:'6',
      assignmentId:'a-21ed3551-c8ff-4eeb-92e2-b0cf166f425c',
      scoringVersion:3,
      title:'Task1',
      text:'ляляляля',
      blockColor:'#9265ad',
      criteria:'тополя|3\nляляляля|'
    };
    const block={
      id:281433753888661,
      title:'Examination block',
      published:false,
      hidden:false,
      materials:[taskMaterial]
    };
    const exam={
      id:188134573829691,
      groupId:24,
      groupTitle:'C2 Advanced',
      title:'C2 Exam',
      date:'2026-11-08',
      published:false,
      hidden:false,
      blocks:[block]
    };

    let publishPayload=null;
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      let data={};
      if(path==='/api/database-context')data={provider:'d1',revision:0,scope:'site'};
      if(path==='/api/me'||path==='/api/me/account')data={user};
      if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:1},stageActivity:{}};
      if(path==='/api/me/themes')data={theme:'almond',themes:[],revision:0,customRevision:0};
      if(path==='/api/groups')data={groups:[{...group,date:'2026-11-08',revision:1}]};
      if(path==='/api/groups/members')data={members:[]};
      if(path==='/api/admin/users')data={users:[]};
      if(path==='/api/lessons')data={materials:[]};
      if(path==='/api/exams'){
        if(route.request().method()==='POST'){
          const body=JSON.parse(route.request().postData()||'{}');
          publishPayload=body;
          data={id:188134573829691,title:exam.title,blocks:[{id:block.id,title:block.title}]};
        } else data={exams:[exam]};
      }
      if(path==='/api/archive')data={archived:true,revision:1};
      if(path==='/api/exams/work')data={work:[]};
      if(path==='/api/exams/workflow')data={examId:188134573829691,state:'draft',canStart:false,canComplete:false,history:[],blocks:1,submitted:0,published:0};
      if(path==='/api/messages')data={rooms:[],groups:[],contacts:[],unread:{},total:0};
      if(path.includes('catalogs'))data={documents:{},cards:[],next:null};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });

    page.on('console',msg=>console.log('PAGE:',msg.text()));
    page.on('pageerror',err=>console.log('PAGE ERROR:',err.message));

    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady&&typeof placeBoot!=='undefined'&&placeBoot);

    await page.evaluate(()=>window.enquizVisit('exams'));
    await page.locator('#exams.on').waitFor();
    await page.locator('[data-exam-level="C2"]').click();
    await page.locator('[data-exam-group-view="24"]').click();
    await page.locator('[data-exam-open="188134573829691"]').click();
    await page.locator('[data-exam-block="281433753888661"]').click();
    await page.locator('#material.on').waitFor();

    const textarea=page.locator('textarea[data-field="criteria"]');
    await textarea.waitFor();
    assert.equal(await textarea.inputValue(),'тополя|3\nляляляля|');

    // Verify no intrusive error modal dialog appears in draft mode
    const noticeModal=page.locator('#learning-main-banner[open]');
    assert.equal(await noticeModal.count(),0);

    // Attempting to publish triggers client-side validation
    const result=await page.evaluate(async()=>{
      await stageSaveLesson(true);
      const area=document.querySelector('textarea[data-field="criteria"]');
      return {
        hasBad:area?.classList.contains('bad'),
        statusText:document.getElementById('learning-main-status')?.textContent,
        noteText:document.getElementById('lmNote')?.textContent
      };
    });

    // Verify criteria field received .bad styling and error banner is displayed
    assert.equal(result.hasBad,true);
    assert.equal(result.statusText,'Use one criterion per line: Content | 3.');
    assert.equal(result.noteText,'Use one criterion per line: Content | 3.');
  }finally{
    await browser.close();
    server.close();
  }
});
