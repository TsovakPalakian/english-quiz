import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../client/53-group-directory.js',import.meta.url),'utf8');
function fixture(){
  const requests=[],pending=[];
  const scope={authUser:{id:'teacher'},viewGen:1,viewAccount:null,isTeacher:()=>scope.authUser?.id!=='student',accountVisible:user=>!user.hidden,
    document:{addEventListener(){}},accountFetch:path=>{requests.push(path);return new Promise(resolve=>pending.push(resolve));}};
  const api=runInNewContext(source+'\n({loadGroupDirectory,groupDirectoryPeople,groupDirectoryReady,groupExamMetrics})',scope);
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
