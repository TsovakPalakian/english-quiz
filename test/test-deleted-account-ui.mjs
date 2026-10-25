import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(resolveTestDependency('playwright'));
const source=readFileSync('client/40-account.js','utf8');
const handler=source.slice(source.indexOf('    document.body.addEventListener("click", (e) => {'));
assert.ok(handler.startsWith('    document.body.addEventListener'));
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<section id="adminuser" class="on"><button data-account="archive-user" data-id="student">Archive account</button></section><section id="admin"></section>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
  for(const outcome of ['success','cancel','failure']){
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.addStyleTag({content:readFileSync('site/preview.css','utf8')});
    await page.addScriptTag({content:`
      let viewAccount=null,adminAccountId='student',adminSelectedUser='student',adminTab='history',adminPaintToken=1,adminUserPaintToken=1;
      let adminAccounts=[{id:'student',name:'Student <Example>',login:'student_login'},{id:'other'}];
      let adminMembers=[{accountId:'student',groupId:1},{accountId:'other',groupId:1}];
      let groupDirectory={},classGroupsReady=true,examReady=true;function examResetWork(){}function isTeacher(){return true;}
      const navStack=[{id:'adminuser',adminAccountId:'student'},{id:'admingroup',adminAccountId:'student'},{id:'adminuser',adminAccountId:'other'}];
      const viewCache=new Map([['admin',{}],['adminuser:student',{}]]);
      window.calls=[];window.alerts=[];
      window.confirm=()=>${outcome!=='cancel'};window.alert=message=>alerts.push(message);
      function sessionIsDeveloper(){return true;}
      async function accountFetch(path,options){calls.push({path,method:options?.method||'GET'});if(${outcome==='failure'})throw Error('Delete failed.');return {};}
      function show(id){document.querySelectorAll('section').forEach(node=>node.classList.toggle('on',node.id===id));sessionStorage.setItem('enquiz-place',JSON.stringify({id,adminAccountId,adminTab}));}
      function paintAdmin(){if(document.querySelector('section.on').id!=='admin'||adminAccountId!==null)throw Error('Reloaded deleted account');accountFetch('/api/admin/users');}
      ${handler}
    `});
    await page.locator('[data-account="archive-user"]').click();
    if(outcome==='success'){
      await page.locator('.account-deleted-dialog').waitFor({state:'visible'});
      assert.match(await page.locator('.account-deleted-dialog p').textContent(),/Student <Example>.*has been moved to Archive/);
      assert.equal(await page.locator('.account-deleted-dialog img').count(),0,'Student names are plain text');
      assert.equal(await page.locator('section.on').getAttribute('id'),'adminuser','Navigation waits for acknowledgement');
      assert.equal(await page.evaluate(()=>calls.length),1,'No reload of the deleted account after DELETE');
      assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('enquiz-place')).id),'admin','Reload does not restore the deleted card');
      await page.keyboard.press('Escape');assert.equal(await page.locator('.account-deleted-dialog').isVisible(),true);
      await page.locator('.account-deleted-dialog button').click();
      await page.waitForFunction(()=>document.querySelector('section.on')?.id==='admin');
      assert.deepEqual(await page.evaluate(()=>calls),[{path:'/api/archive',method:'POST'},{path:'/api/admin/users',method:'GET'}]);
      assert.deepEqual(await page.evaluate(()=>({id:adminAccountId,selected:adminSelectedUser,tab:adminTab,accounts:adminAccounts.map(user=>user.id),members:adminMembers.map(row=>row.accountId),cache:viewCache.size,history:navStack})),{id:null,selected:null,tab:'accounts',accounts:['other'],members:['other'],cache:0,history:[{id:'admingroup',adminAccountId:null},{id:'adminuser',adminAccountId:'other'}]});
      assert.deepEqual(await page.evaluate(()=>alerts),[]);
    }else{
      if(outcome==='failure')await page.waitForFunction(()=>alerts.length===1);
      assert.equal(await page.evaluate(()=>calls.length),outcome==='cancel'?0:1);
      assert.equal(await page.locator('.account-deleted-dialog').count(),0);
      assert.equal(await page.locator('[data-account="archive-user"]').isEnabled(),true);
      assert.equal(await page.evaluate(()=>adminAccountId),'student');
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Deleted account UI: named acknowledgement, navigation after OK, stale state cleanup, no deleted-account GET, cancellation and server failure passed (no screenshots).');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
