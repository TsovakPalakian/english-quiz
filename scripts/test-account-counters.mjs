import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../preview.js',import.meta.url),'utf8'),code=source.slice(source.indexOf("    let accountsCountActor ="),source.indexOf('    function paintAccount()'));
function fixture(fetch){const labels=[{nodeType:3,textContent:'Accounts'},{nodeType:3,textContent:'Accounts'}],tab={textContent:''},context=vm.createContext({authUser:{id:'teacher'},viewAccount:null,isTeacher:()=>true,accountVisible:row=>!row.hidden&&!row.revoked,accountFetch:fetch,document:{querySelectorAll:()=>labels.map(node=>({childNodes:[node]})),querySelector:()=>tab}});vm.runInContext(code,context);return {context,labels,tab,refresh:async()=>{vm.runInContext('refreshAccountsCount()',context);await vm.runInContext('accountsCountFlight',context);}};}
test('Accounts and Approval requests count both pending types and retain labels at zero',async()=>{
 const paths=[],f=fixture(async path=>{paths.push(path);return path.endsWith('registrations')?{registrations:[{status:'pending'},{status:'pending'},{status:'approved'}]}:{changes:[{status:'pending'},{status:'pending'},{status:'pending',hidden:true},{status:'rejected'}]};});
 await f.refresh();assert.equal(paths.length,2);assert.deepEqual(f.labels.map(n=>n.textContent),['Accounts · 4','Accounts · 4']);assert.equal(f.tab.textContent,'Approval requests · 4');
 vm.runInContext('paintAccountsCount(0)',f.context);assert.equal(f.tab.textContent,'Approval requests');assert.equal(f.labels[0].textContent,'Accounts');
});
test('a response from the previous account cannot repaint current account counters',async()=>{
 const pending=[],f=fixture(path=>new Promise(resolve=>pending.push({path,resolve})));
 vm.runInContext('refreshAccountsCount()',f.context);vm.runInContext("authUser={id:'other'};refreshAccountsCount()",f.context);
 for(const p of pending.slice(2))p.resolve({registrations:[],changes:[]});await vm.runInContext('accountsCountFlight',f.context);
 for(const p of pending.slice(0,2))p.resolve({registrations:[{status:'pending'}],changes:[{status:'pending'}]});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.tab.textContent,'Approval requests');
});
test('opening an unclassified Accounts subgroup does not inherit the previous level',()=>{
 const start=source.indexOf("    document.addEventListener('click',event => {\n      const tab = event.target.closest('[data-admin-tab]')"),end=source.indexOf('    function paintAdmin(detailPage',start);let click;
 const group={dataset:{adminGroup:'99'}},scope=vm.createContext({document:{addEventListener:(name,handler)=>{click=handler;}},isTeacher:()=>true,viewAccount:null,domEntityId:Number,adminGroups:[{id:99,title:'Legacy group'}],accountGroupLevel:()=> 'unassigned',adminGroupLevel:'B1',visit(){}});
 vm.runInContext(source.slice(start,end),scope);click({target:{closest:selector=>selector==='[data-admin-group]'?group:null}});assert.equal(scope.adminGroupLevel,'unassigned');
});
