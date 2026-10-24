import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';

const {chromium}=createRequire(import.meta.url)(resolveTestDependency('playwright'));
const html=readFileSync('site/preview.html','utf8');
const tabs=html.match(/<div class="seg accounts-tabs"[^>]*>[^]*?<\/div>/)?.[0];
assert.ok(tabs);
assert.deepEqual([...tabs.matchAll(/data-admin-tab="([^"]+)"/g)].map(match=>match[1]),['accounts','requests','invite','groups','history']);
assert.ok(!html.includes('groupDetailInvite'));
assert.ok(!readFileSync('client/53-group-directory.js','utf8').includes('groupInviteHTML'));
const source=readFileSync('client/10-admin.js','utf8');
assert.ok(!source.includes('function groupInviteHTML'));
const server=createServer((request,response)=>{response.writeHead(200,{'Content-Type':'text/html'});response.end('<html data-theme="almond"><body><main><section id="admin" class="on">'+tabs+'<div id="adminBody"></div></section><div id="adminUser"></div></main></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.addStyleTag({content:readFileSync('site/preview.css','utf8')});
  await page.addStyleTag({content:'main{max-width:900px;margin:auto;padding:16px}section.on{display:block}'});
  await page.addScriptTag({content:`
    let authUser={id:'teacher-one',role:'ADMIN'},viewAccount=null,viewGen=1,classGroupsDirty=false,classGroups=[],classGroupsReady=false,accountsCountActor=null,accountsCountAt=0;
    const fixtureGroups=[{id:41,title:'A1 Demo'},{id:42,title:'B2 Evening'},{id:43,title:'C1 No teacher'},{id:44,title:'A2 <img src=x onerror=alert(1)>'}];
    const fixtureUsers=[{id:'teacher-one',role:'ADMIN',name:'First teacher',active:true},{id:'teacher-two',role:'ADMIN',name:'Second teacher',active:true},{id:'inactive',role:'ADMIN',name:'Inactive',active:false}];
    const fixtureAssignments=[{groupId:41,teacherIds:['teacher-one','teacher-two']},{groupId:42,teacherIds:['teacher-two']},{groupId:44,teacherIds:['inactive']}];
    function isTeacher(){return ['ADMIN','DEVELOPER'].includes(authUser?.role);}
    function isDeveloper(){return authUser?.role==='DEVELOPER';}
    function sessionIsDeveloper(){return isDeveloper();}
    function roleLabel(role){return role==='USER'?'Student':'Teacher';}
    function esc(value){const node=document.createElement('span');node.textContent=String(value??'');return node.innerHTML.replaceAll('"','&quot;');}
    function paintAccountsCount(){}
    function paintPagePath(){}
    function editingIn(node){return node?.contains(document.activeElement)&&document.activeElement.matches('input,select,textarea');}
    async function viewFresh(key,load,paint,pending){pending();paint(await load(),false);}
    window.inviteCalls=[];window.copiedLink='';
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedLink=text;}}});
    window.paintInviteQr=(node,url)=>{node.hidden=false;node.textContent='QR fixture';node.dataset.url=url;};
    async function accountFetch(path,options){
      if(path==='/api/accounts/invites'){
        const data=JSON.parse(options.body);window.inviteCalls.push(data);
        if(window.deferInvite)await new Promise(resolve=>{window.releaseInvite=resolve;});
        if(window.failInvite)throw Error('Fixture creation failed.');
        return {token:'fixture-'+data.groupId,groupTitle:fixtureGroups.find(group=>group.id===data.groupId).title,expiresAt:Date.now()+3*86400000};
      }
      return path==='/api/admin/users'?{users:fixtureUsers}:path==='/api/groups'?{groups:fixtureGroups}:path==='/api/accounts/group-teachers'?{assignments:fixtureAssignments}:path==='/api/groups/members'?{members:[]}:{registrations:[],changes:[]};
    }
    ${source}
  `});
  await page.locator('[data-admin-tab="invite"]').click();
  const panel=page.locator('[data-group-invites]'),picker=panel.locator('[data-invite-group-picker]'),search=picker.locator('[data-invite-group-search]'),create=panel.locator('[data-invite-create]');
  await panel.waitFor();assert.equal(await create.isDisabled(),true);
  const choose=async query=>{await picker.locator('summary').click();await search.fill(query);await search.press('Enter');};
  await picker.locator('summary').click();await search.fill('missing group');
  assert.equal(await picker.locator('[data-invite-group-option]:visible').count(),0);assert.equal(await picker.locator('[data-invite-group-empty]').isVisible(),true);
  await search.fill('DEMO');await search.press('ArrowDown');await page.keyboard.press('Enter');
  assert.equal(await panel.getAttribute('data-group-id'),'41');assert.equal(await create.isEnabled(),true);
  assert.equal(await panel.locator('[data-invite-teacher]').inputValue(),'teacher-one');
  await create.click();await panel.locator('[data-invite-url]').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>inviteCalls[0]),{groupId:41,teacherId:'teacher-one',kind:'student'});
  const link=await panel.locator('[data-invite-url]').inputValue();assert.equal(new URL(link).searchParams.get('invite'),'fixture-41');
  await panel.locator('[data-invite-url]').click();assert.equal(await page.evaluate(()=>copiedLink),link);assert.equal(await panel.locator('[data-invite-qr]').isVisible(),true);
  await choose('evening');assert.equal(await panel.locator('[data-invite-url]').inputValue(),'');assert.equal(await panel.locator('[data-invite-qr]').isVisible(),false);
  assert.equal(await panel.locator('[data-invite-teacher]').inputValue(),'teacher-two');assert.equal(await create.isDisabled(),true);
  assert.match(await panel.locator('[data-invite-unassigned]').innerText(),/must be assigned/);
  await panel.locator('[data-invite-kind]').selectOption('teacher');assert.equal(await create.isEnabled(),true);
  const email=panel.locator('[data-invite-email]');await email.fill('invalid');await create.click();assert.equal(await page.evaluate(()=>inviteCalls.length),1);
  await email.fill('invited@example.invalid');await create.click();await panel.locator('[data-invite-url]').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>inviteCalls[1]),{groupId:42,teacherId:'teacher-two',kind:'teacher',email:'invited@example.invalid'});
  await choose('no teacher');await panel.locator('[data-invite-kind]').selectOption('student');assert.equal(await create.isDisabled(),true);
  await choose('A2');assert.equal(await picker.locator('img').count(),0);assert.equal(await panel.locator('[data-invite-teacher] option').count(),0);
  await choose('demo');await page.evaluate(()=>{authUser.role='DEVELOPER';});
  await choose('evening');assert.equal(await create.isEnabled(),true);
  await page.evaluate(()=>{window.failInvite=true;});await create.click();await panel.locator('[data-invite-status]').filter({hasText:'Fixture creation failed.'}).waitFor();assert.equal(await create.isEnabled(),true);
  await page.evaluate(()=>{window.failInvite=false;window.deferInvite=true;});await create.click();
  await page.waitForFunction(()=>typeof window.releaseInvite==='function');assert.equal(await panel.getAttribute('aria-busy'),'true');assert.equal(await search.isDisabled(),true);assert.equal(await create.isDisabled(),true);
  await page.evaluate(()=>{authUser={id:'other-account',role:'ADMIN'};window.releaseInvite();});
  await page.waitForFunction(()=>!document.querySelector('[data-group-invites]').hasAttribute('aria-busy'));
  assert.equal(await panel.locator('[data-invite-url]').isVisible(),false,'A stale response cannot expose an invite after an account switch');
  for(const width of [1280,390,320]){
    await page.setViewportSize({width,height:900});await picker.locator('summary').click();
    const bounds=await picker.locator('.invite-group-menu').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1,'Group menu fits viewport '+width);
    await search.press('Escape');assert.equal(await picker.getAttribute('open'),null);
  }
  await page.evaluate(()=>{authUser.role='USER';});const before=await page.evaluate(()=>inviteCalls.length);await create.dispatchEvent('click');assert.equal(await page.evaluate(()=>inviteCalls.length),before);
  assert.deepEqual(errors,[]);
  console.log('Accounts Invite: searchable group selection, roles, request payloads, reset, failures, stale replies and responsive menu passed; no screenshots.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
