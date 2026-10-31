import test from 'node:test';
import assert from 'node:assert/strict';
import {teacherMayManageStudent,teacherGroupIds,teachersVisibleTo} from '../src/teacher-group-access.mjs';
import {managedAccount} from '../src/worker.js';
import {STUDY_DATABASE} from '../src/study-database.mjs';

const teacherA='a'.repeat(32);
const teacherB='b'.repeat(32);
const studentA='c'.repeat(32);
const studentB='d'.repeat(32);
const ungrouped='e'.repeat(32);

function studyFixture(){
  const membership=new Map([[studentA,101],[studentB,102]]);
  const teachers=new Map([
    [101,{revision:1,teacherIds:[teacherA]}],
    [102,{revision:1,teacherIds:[teacherB]}],
  ]);
  return {
    async read(sql,args){
      if(sql.includes('FROM class_group_students')&&sql.includes('account_id')){
        const groupId=membership.get(args[0]);
        return groupId==null?[]:[{group_id:groupId}];
      }
      if(sql.includes("namespace='accounts-group-teachers'")&&sql.includes('AND key=?')){
        const value=teachers.get(Number(args[0]));
        return value?[{value_json:JSON.stringify(value)}]:[];
      }
      if(sql.includes("namespace='accounts-group-teachers'")&&!sql.includes('AND key=?')){
        return [...teachers.entries()].map(([key,value])=>({key:String(key),value_json:JSON.stringify(value)}));
      }
      if(sql.includes('FROM class_groups'))return [{id:101},{id:102}];
      return [];
    }
  };
}

test('teacherMayManageStudent allows assigned teacher and developer only',async()=>{
  const db=studyFixture();
  assert.equal(await teacherMayManageStudent(db,{id:teacherA,role:'ADMIN'},studentA),true);
  assert.equal(await teacherMayManageStudent(db,{id:teacherA,role:'ADMIN'},studentB),false);
  assert.equal(await teacherMayManageStudent(db,{id:teacherB,role:'ADMIN'},studentB),true);
  assert.equal(await teacherMayManageStudent(db,{id:teacherA,role:'ADMIN'},ungrouped),false);
  assert.equal(await teacherMayManageStudent(db,{id:teacherA,role:'USER'},studentA),false);
  assert.equal(await teacherMayManageStudent(db,{id:teacherA,role:'DEVELOPER'},studentB),true);
  assert.equal(await teacherMayManageStudent(null,{id:teacherA,role:'ADMIN'},studentA),false);
  assert.equal(await teacherMayManageStudent(db,{role:'ADMIN'},studentA),false);
});

test('teacherMayManageStudent fails closed when teacher assignment document is missing',async()=>{
  const db={
    async read(sql,args){
      if(sql.includes('class_group_students'))return [{group_id:9}];
      return [];
    }
  };
  assert.equal(await teacherMayManageStudent(db,{id:teacherA,role:'ADMIN'},studentA),false);
});

test('teacherGroupIds and teachersVisibleTo scope ADMIN to co-teachers',async()=>{
  const db=studyFixture();
  assert.deepEqual(await teacherGroupIds(db,{id:teacherA,role:'ADMIN'}),[101]);
  assert.deepEqual(await teacherGroupIds(db,{id:teacherB,role:'ADMIN'}),[102]);
  assert.deepEqual((await teacherGroupIds(db,{id:teacherA,role:'DEVELOPER'})).sort(),[101,102]);
  const visible=await teachersVisibleTo(db,{id:teacherA,role:'ADMIN'});
  assert.equal(visible.has(teacherA),true);
  assert.equal(visible.has(teacherB),false);
  const shared={
    async read(sql){
      if(sql.includes('accounts-group-teachers'))return [
        {key:'101',value_json:JSON.stringify({revision:1,teacherIds:[teacherA,teacherB]})}
      ];
      return [];
    }
  };
  const co=await teachersVisibleTo(shared,{id:teacherA,role:'ADMIN'});
  assert.equal(co.has(teacherB),true);
});

test('managedAccount enforces group assignment for ADMIN',async()=>{
  let row={id:studentA,role:'USER',login:'StudentA',active:1};
  const env={
    DB:{prepare:()=>({bind:()=>({first:async()=>row})})},
    [STUDY_DATABASE]:studyFixture()
  };
  assert.ok((await managedAccount(env,{id:teacherA,role:'ADMIN'},studentA)).row);
  assert.equal((await managedAccount(env,{id:teacherA,role:'ADMIN'},studentB)).error.status,403);
  assert.ok((await managedAccount(env,{id:teacherA,role:'DEVELOPER'},studentB)).row);
  row={id:studentA,role:'USER',login:'StudentA',active:1,hidden:1};
  assert.equal((await managedAccount(env,{id:teacherA,role:'ADMIN'},studentA)).error.status,404);
});
