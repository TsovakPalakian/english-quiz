import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";

await scenarioSubtests("teacher-group-isolation-ui",async function*(){
  yield "00. Browser and server setup";
  const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));
  const root=resolve('rollback/production-assets');
  const server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,path==='/'?'index.html':'.'+path);
    if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(readFileSync(file));
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
    const teacher1={id:'1'.repeat(32),login:'teacher_one',name:'Teacher One',role:'ADMIN'};
    const teacher2={id:'2'.repeat(32),login:'teacher_two',name:'Teacher Two',role:'ADMIN'};
    const devUser={id:'3'.repeat(32),login:'dev_user',name:'Dev User',role:'DEVELOPER'};
    const studentUser={id:'4'.repeat(32),login:'student_user',name:'Student User',role:'USER'};

    const groups=[
      {id:101,title:'A1 Alpha Group',date:'2026-10-20',revision:1,studentCount:1,lessonIds:[],examIds:[],teacherIds:[teacher1.id]},
      {id:102,title:'A1 Beta Group',date:'2026-10-21',revision:1,studentCount:1,lessonIds:[],examIds:[],teacherIds:[teacher2.id]}
    ];
    const assignments=[
      {groupId:101,revision:1,teacherIds:[teacher1.id]},
      {groupId:102,revision:1,teacherIds:[teacher2.id]}
    ];
    const members=[
      {accountId:studentUser.id,groupId:101}
    ];

    // Helper to run a test scenario for a specific user
    const runForUser = async (user, expectedGroups, hiddenGroups) => {
      const page=await browser.newPage({viewport:{width:1280,height:800}});
      page.on('pageerror',error=>{ throw new Error('Page error: '+error.message); });
      await page.route('**/api/**',async route=>{
        const path=new URL(route.request().url()).pathname;let data={};
        if(path==='/api/database-context')data={provider:'d1',revision:3,scope:'site'};
        if(path==='/api/me'||path==='/api/me/account')data={user};
        if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:0},stageActivity:{}};
        if(path==='/api/me/themes')data={theme:'light',themes:[],revision:0,customRevision:0};
        if(path==='/api/groups')data={groups};
        if(path==='/api/accounts/group-teachers')data={assignments};
        if(path==='/api/groups/members')data={members};
        if(path==='/api/admin/users')data={users:[teacher1,teacher2,devUser,studentUser]};
        if(path.includes('/catalogs/'))data={documents:{},cards:[],next:null};
        await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
      });
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.waitForFunction(()=>accountReady);
      await page.locator('.side nav [data-jump="groups"]').click();
      await page.locator('#groups.on').waitFor();

      // Click level A1
      await page.locator('[data-group-level="A1"]').click();
      await page.locator('#groupList h2').waitFor();

      for(const title of expectedGroups){
        assert.ok(await page.locator('#groupList').getByText(title).isVisible(), user.name+' must see '+title);
      }
      for(const title of hiddenGroups){
        assert.equal(await page.locator('#groupList').getByText(title).count(), 0, user.name+' must NOT see '+title);
      }
      await page.close();
    };

    yield "01. Teacher One sees only their own group";
    await runForUser(teacher1, ['A1 Alpha Group'], ['A1 Beta Group']);

    yield "02. Teacher Two sees only their own group";
    await runForUser(teacher2, ['A1 Beta Group'], ['A1 Alpha Group']);

    yield "03. Developer sees all groups";
    await runForUser(devUser, ['A1 Alpha Group', 'A1 Beta Group'], []);

    yield "04. Teacher Two accepts co-ownership invite in 1 click";
    {
      const page=await browser.newPage({viewport:{width:1280,height:800}});
      page.on('pageerror',error=>{ throw new Error('Page error: '+error.message); });
      let redeemed=false;
      await page.route('**/api/**',async route=>{
        const path=new URL(route.request().url()).pathname;let data={};
        if(path==='/api/database-context')data={provider:'d1',revision:3,scope:'site'};
        if(path==='/api/me'||path==='/api/me/account')data={user:teacher2};
        if(path==='/api/me/state')data={bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:0},stageActivity:{}};
        if(path==='/api/me/themes')data={theme:'light',themes:[],revision:0,customRevision:0};
        if(path==='/api/groups'){
          data={groups:groups.map(g=>g.id===101&&redeemed?{...g,teacherIds:[teacher1.id,teacher2.id]}:g)};
        }
        if(path==='/api/accounts/group-teachers'){
          data={assignments:assignments.map(a=>a.groupId===101&&redeemed?{...a,teacherIds:[teacher1.id,teacher2.id]}:a)};
        }
        if(path==='/api/groups/members')data={members};
        if(path==='/api/admin/users')data={users:[teacher1,teacher2,devUser,studentUser]};
        if(path==='/api/accounts/invites'){
          if(route.request().method()==='GET'){
            data={groupId:101,groupTitle:'A1 Alpha Group',kind:'teacher',expiresAt:Date.now()+86400000};
          }else{
            redeemed=true;
            data={groupId:101,groupTitle:'A1 Alpha Group',uses:1};
          }
        }
        if(path.includes('/catalogs/'))data={documents:{},cards:[],next:null};
        await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
      });
      await page.goto('http://127.0.0.1:'+server.address().port+'/?invite=test-alpha-token');
      await page.waitForFunction(()=>accountReady);
      const dialog=page.locator('dialog.invite-accept-dialog');
      await dialog.waitFor({state:'visible'});
      assert.ok((await dialog.innerText()).includes('Join A1 Alpha Group'));
      assert.ok((await dialog.innerText()).includes('co-teacher'));
      await dialog.locator('[data-accept]').click();
      await dialog.waitFor({state:'hidden'});
      await page.locator('#groups.on').waitFor();
      await page.locator('[data-group-level="A1"]').click();
      await page.locator('#groupList h2').waitFor();
      assert.ok(await page.locator('#groupList').getByText('A1 Alpha Group').isVisible());
      assert.ok(await page.locator('#groupList').getByText('A1 Beta Group').isVisible());
      await page.close();
    }

  }finally{
    await browser?.close();
    server.close();
  }
});
