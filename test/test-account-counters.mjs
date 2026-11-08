import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {extractFunctions, extractStatement} from './helpers/extract-function.mjs';

const source = readFileSync(new URL('../preview.js', import.meta.url), 'utf8');
const code = 'let accountsCountActor = "", accountsCountAt = 0, accountsCountFlight = null;\n' +
  extractFunctions(source, 'paintAccountsCount', 'refreshAccountsCount');

function fixture(fetch, initialAuth = {id:'teacher',role:'ADMIN'}){
  const labels=[{nodeType:3,textContent:'Accounts'},{nodeType:3,textContent:'Accounts'}];
  const tab={textContent:''};
  const context=vm.createContext({
    authUser:initialAuth,
    viewAccount:null,
    isTeacher:()=>true,
    accountVisible:row=>!row.hidden&&!row.revoked,
    accountFetch:fetch,
    Date,
    document:{
      querySelectorAll:()=>labels.map(node=>({childNodes:[node]})),
      querySelector:()=>tab
    }
  });
  vm.runInContext(code,context);
  return {
    context,labels,tab,
    refresh:async()=>{
      vm.runInContext('refreshAccountsCount()',context);
      await vm.runInContext('accountsCountFlight',context);
    }
  };
}

test('Accounts and Approval requests count both pending types and retain labels at zero',async()=>{
 const paths=[],f=fixture(async path=>{paths.push(path);return path.endsWith('registrations')?{registrations:[{status:'pending'},{status:'pending'},{status:'approved'}]}:{changes:[{status:'pending'},{status:'pending'},{status:'pending',hidden:true},{status:'rejected'}]};});
 await f.refresh();assert.equal(paths.length,2);assert.deepEqual(f.labels.map(n=>n.textContent),['Accounts · 4','Accounts · 4']);assert.equal(f.tab.textContent,'Approval requests · 4');
 vm.runInContext('paintAccountsCount(0)',f.context);assert.equal(f.tab.textContent,'Approval requests');assert.equal(f.labels[0].textContent,'Accounts');
});

test('a response from the previous account cannot repaint current account counters',async()=>{
 const pending=[],f=fixture(path=>new Promise(resolve=>pending.push({path,resolve})));
 vm.runInContext('refreshAccountsCount()',f.context);vm.runInContext("authUser={id:'other',role:'ADMIN'};refreshAccountsCount()",f.context);
 for(const p of pending.slice(2))p.resolve({registrations:[],changes:[]});await vm.runInContext('accountsCountFlight',f.context);
 for(const p of pending.slice(0,2))p.resolve({registrations:[{status:'pending'}],changes:[{status:'pending'}]});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.tab.textContent,'Approval requests');
});

test('opening an unclassified Accounts subgroup does not inherit the previous level',()=>{
 const clickCode = extractStatement(source, "document.addEventListener('click',event => {\n      const tab");
 let click;
 const group={dataset:{adminGroup:'99'}},scope=vm.createContext({document:{addEventListener:(name,handler)=>{click=handler;}},isTeacher:()=>true,viewAccount:null,domEntityId:Number,adminGroups:[{id:99,title:'Legacy group'}],accountGroupLevel:()=> 'unassigned',adminGroupLevel:'B1',visit(){}});
 vm.runInContext(clickCode,scope);click({target:{closest:selector=>selector==='[data-admin-group]'?group:null}});assert.equal(scope.adminGroupLevel,'unassigned');
});

test('Accounts card metrics deduplicate people, groups, lessons and exams and retain zero labels',()=>{
 const metricsCode = extractFunctions(source, 'accountGroupMetrics', 'accountMetricsHTML');
 const context=vm.createContext({adminAccounts:[{id:'s',role:'USER'},{id:'t',role:'ADMIN'}],adminMembers:[{groupId:1,accountId:'s'},{groupId:2,accountId:'s'},{groupId:1,accountId:'invisible'}],adminTeachers:()=>[{id:'t'}],accountCount:(label,n)=>label+(n?' · '+n:''),esc:String});
 vm.runInContext(metricsCode,context);
 context.groups=[{id:1,lessonIds:[1,1,2],examIds:[3]},{id:2,lessonIds:[2],examIds:[3,4]}];
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(accountGroupMetrics(groups))',context)),{groups:2,teachers:1,students:1,lessons:2,exams:2});
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(accountGroupMetrics([]))',context)),{groups:0,teachers:0,students:0,lessons:0,exams:0});
 const html=vm.runInContext('accountMetricsHTML([])',context);for(const label of ['groups','teachers','students','lessons','exams'])assert.ok(html.includes('>'+label+'<'));assert.ok(!html.includes('· 0'));
});

test('refreshAccountsCount blocks requests when authUser role is USER or viewAccount is active', async () => {
  const calls = [];
  const f = fixture(async (path, opts) => { calls.push({path, opts}); return {}; }, {id:'student', role:'USER'});
  await f.refresh();
  assert.equal(calls.length, 0);
  assert.equal(f.tab.textContent, 'Approval requests');

  f.context.authUser = {id:'teacher', role:'ADMIN'};
  f.context.viewAccount = {id:'student', role:'USER'};
  await f.refresh();
  assert.equal(calls.length, 0);
});

test('refreshAccountsCount passes quietBug: true to registrations and changes requests', async () => {
  const calls = [];
  const f = fixture(async (path, opts) => {
    calls.push({path, opts});
    return path.endsWith('registrations') ? {registrations:[]} : {changes:[]};
  });
  await f.refresh();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].path, '/api/admin/registrations');
  assert.equal(calls[0].opts?.quietBug, true);
  assert.equal(calls[1].path, '/api/admin/changes');
  assert.equal(calls[1].opts?.quietBug, true);
});

test('refreshAccountsCount throttles retry after request error', async () => {
  let attempts = 0;
  const f = fixture(async () => {
    attempts += 1;
    throw Object.assign(new Error('Teachers only.'), {status: 403});
  });
  await f.refresh();
  assert.equal(attempts, 2);

  vm.runInContext('refreshAccountsCount()', f.context);
  assert.equal(vm.runInContext('accountsCountFlight', f.context), null);
  assert.equal(attempts, 2);
});
