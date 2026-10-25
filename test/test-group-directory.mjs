import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../client/53-group-directory.js',import.meta.url),'utf8');
function fixture(){
  const requests=[],pending=[];
  const scope={authUser:{id:'teacher'},viewGen:1,viewAccount:null,isTeacher:()=>scope.authUser?.id!=='student',accountVisible:user=>!user.hidden,
    document:{addEventListener(){},getElementById(){return null;}},accountFetch:path=>{requests.push(path);return new Promise(resolve=>pending.push(resolve));}};
  const api=runInNewContext(source+'\n({loadGroupDirectory,groupDirectoryPeople,groupDirectoryReady,groupExamMetrics,groupLiveStudentCount})',scope);
  return {...api,scope,requests,pending};
}
test('Group directory coalesces reads, keeps multiple teachers and deduplicates people',async()=>{
  const f=fixture(),first=f.loadGroupDirectory(),second=f.loadGroupDirectory();
  assert.equal(f.requests.length,3);assert.equal(first,second);
  f.pending[0]({users:[{id:'a',name:'A',role:'ADMIN'},{id:'b',name:'B',role:'ADMIN'},{id:'s',name:'Student',role:'USER'},{id:'h',name:'Hidden',role:'ADMIN',hidden:true}]});
  f.pending[1]({members:[{groupId:41,accountId:'s'},{groupId:42,accountId:'s'}]});
  f.pending[2]({assignments:[{groupId:41,teacherIds:['a','b','h']},{groupId:42,teacherIds:['a']}]});await first;
  assert.deepEqual(Array.from(f.groupDirectoryPeople([{id:41},{id:42}]),user=>user.id),['a','b']);
  assert.deepEqual(Array.from(f.groupDirectoryPeople([{id:41},{id:42}],false),user=>user.id),['s']);
  await f.loadGroupDirectory();assert.equal(f.requests.length,3);
});
test('Live student counts exclude missing, moved, hidden, inactive and revoked accounts and refresh on demand',async()=>{
  const f=fixture();f.scope.accountVisible=()=>true;
  assert.equal(f.groupLiveStudentCount({id:41}),undefined);
  const first=f.loadGroupDirectory();
  f.pending[0]({users:[{id:'live',role:'USER',active:true},{id:'moved',role:'USER',active:true},{id:'hidden',role:'USER',hidden:true},{id:'inactive',role:'USER',active:0},{id:'revoked',role:'USER',revoked:true},{id:'teacher',role:'ADMIN'}]});
  f.pending[1]({members:[...['live','live','hidden','inactive','revoked','deleted','teacher'].map(accountId=>({accountId,groupId:41})),{accountId:'moved',groupId:42}]});
  f.pending[2]({assignments:[]});await first;
  assert.equal(f.groupLiveStudentCount({id:41}),1);
  assert.equal(f.groupLiveStudentCount({id:42}),1);
  const refreshed=f.loadGroupDirectory(true);
  assert.equal(f.groupLiveStudentCount({id:41}),undefined,'Do not show a stale count while refreshing');
  f.pending[3]({users:[]});f.pending[4]({members:[]});f.pending[5]({assignments:[]});await refreshed;
  assert.equal(f.groupLiveStudentCount({id:41}),0);
});
test('Student directory requests and cross-account late responses are rejected',async()=>{
  const f=fixture(),loading=f.loadGroupDirectory();f.scope.authUser={id:'student'};
  for(const resolve of f.pending)resolve({});await loading;
  assert.equal(f.groupDirectoryReady(),false);await f.loadGroupDirectory();assert.equal(f.requests.length,3);
  assert.equal(f.groupDirectoryPeople([{id:41}]).length,0);
});
test('Teacher viewing a student does not fetch the directory',async()=>{
  const f=fixture();f.scope.viewAccount={id:'student'};await f.loadGroupDirectory();assert.equal(f.requests.length,0);
});
test('Exam tile counts templates and work states only within its subgroup',()=>{
  const f=fixture();
  f.scope.examShown=()=>[
    {id:1,groupId:41},{id:2,groupId:'41'},
    ...Array.from({length:3},(_,index)=>({id:10+index,groupId:41,studentId:'student',instanceStatus:'active'})),
    {id:20,groupId:41,studentId:'student',instanceStatus:'ready'},
    ...Array.from({length:3},(_,index)=>({id:30+index,groupId:41,studentId:'student',instanceStatus:'completed'})),
    {id:40,groupId:42},{id:41,groupId:42,studentId:'other',instanceStatus:'active'},
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(f.groupExamMetrics({id:41,examIds:[]}))),[['exam',2],['assigned works',3],['ready for review',1],['completed',3]]);
});
