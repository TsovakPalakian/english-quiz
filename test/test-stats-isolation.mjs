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
  assert.deepEqual(await resolveStatTarget(envFor({id:studentA,role:'USER',active:1,hidden:0}),{id:teacherA,role:'DEVELOPER'},studentA),{uid:studentA,role:'USER'});
  assert.deepEqual(await resolveStatTarget(envFor({id:studentA,role:'USER',active:0,hidden:0}),{id:teacherA,role:'DEVELOPER'},studentA),{uid:teacherA,role:'DEVELOPER'});
});
test('resolveStatTarget keeps own stats when account columns are missing',async()=>{
  const actor={id:teacherA,role:'DEVELOPER'};
  let queries=0;
  const missing=(message)=>({
    DB:{prepare(){queries++;return {bind(){return {first:async()=>{throw new Error(message);}}}}}},
    [STUDY_DATABASE]:studyFixture()
  });
  assert.deepEqual(await resolveStatTarget(missing('D1_ERROR: no such column: hidden'),actor,studentA),{uid:teacherA,role:'DEVELOPER'});
  assert.equal(queries,1);
  queries=0;
  assert.deepEqual(await resolveStatTarget(missing('D1_ERROR: no such column: active'),actor,studentA),{uid:teacherA,role:'DEVELOPER'});
  assert.equal(queries,1);
  await assert.rejects(resolveStatTarget(missing('disk'),actor,studentA),/disk/);
  queries=0;
  const quiet=envFor({id:studentA,role:'USER',active:1,hidden:0});
  const original=quiet.DB.prepare;
  quiet.DB.prepare=()=>{queries++;return original();};
  assert.deepEqual(await resolveStatTarget(quiet,actor,''),{uid:teacherA,role:'DEVELOPER'});
  assert.deepEqual(await resolveStatTarget(quiet,actor,teacherA),{uid:teacherA,role:'DEVELOPER'});
  assert.equal(queries,0);
});
