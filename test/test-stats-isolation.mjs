import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStatTarget} from '../src/worker.js';
import {STUDY_DATABASE} from '../src/study-database.mjs';

const teacherA='a'.repeat(32);
const teacherB='b'.repeat(32);
const studentA='c'.repeat(32);
const studentB='d'.repeat(32);

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
      return [];
    }
  };
}

function envFor(row){
  return {
    DB:{prepare:()=>({bind:()=>({first:async()=>row})})},
    [STUDY_DATABASE]:studyFixture()
  };
}

test('resolveStatTarget scopes ADMIN stats impersonation to managed students',async()=>{
  const teacher={id:teacherA,role:'ADMIN'};
  assert.deepEqual(await resolveStatTarget(envFor({id:studentA,role:'USER',active:1}),teacher,studentA),{uid:studentA,role:'USER'});
  assert.deepEqual(await resolveStatTarget(envFor({id:studentB,role:'USER',active:1}),teacher,studentB),{uid:teacherA,role:'ADMIN'});
  assert.deepEqual(await resolveStatTarget(envFor({id:studentB,role:'USER',active:1}),{id:teacherA,role:'DEVELOPER'},studentB),{uid:studentB,role:'USER'});
});
