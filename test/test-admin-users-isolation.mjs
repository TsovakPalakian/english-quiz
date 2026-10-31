import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';
import {applyLearningSchema} from './learning-test-schema.mjs';

const teacherA={id:'a'.repeat(32),login:'teacher_a',name:'Teacher A',role:'ADMIN',email:'a@example.invalid'};
const teacherB={id:'b'.repeat(32),login:'teacher_b',name:'Teacher B',role:'ADMIN',email:'b@example.invalid'};
const teacherShared={id:'c'.repeat(32),login:'teacher_shared',name:'Shared',role:'ADMIN',email:'c@example.invalid'};
const studentA={id:'d'.repeat(32),login:'student_a',name:'Student A',role:'USER',email:'d@example.invalid'};
const studentB={id:'e'.repeat(32),login:'student_b',name:'Student B',role:'USER',email:'e@example.invalid'};
const directory=[teacherA,teacherB,teacherShared,studentA,studentB];

function studyDb(sqlite){
  const args=c=>c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  return {
    read:async(q,a=[])=>sqlite.prepare(q).all(...a),
    atomic:async commands=>{
      sqlite.exec('BEGIN');
      try{for(const c of commands)sqlite.prepare(c.sql).run(...args(c));sqlite.exec('COMMIT');}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    }
  };
}

test('GET /api/admin/users scopes ADMIN directory to co-teachers and managed students',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  sqlite.exec(`
    INSERT INTO class_groups(id,title) VALUES(1,'A1 One'),(2,'A1 Two');
    INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES('${studentA.id}',1,'${teacherA.id}'),('${studentB.id}',2,'${teacherB.id}');
    INSERT INTO catalog_documents(namespace,key,value_json) VALUES
      ('accounts-group-teachers','1','{"revision":1,"teacherIds":["${teacherA.id}","${teacherShared.id}"]}'),
      ('accounts-group-teachers','2','{"revision":1,"teacherIds":["${teacherB.id}"]}');
  `);
  const db=studyDb(sqlite);
  let identity=teacherA;
  const app=integratedWorker({
    authenticate:async()=>identity,
    accountWorker:{fetch:async()=>Response.json({users:directory})},
    studyDatabase:()=>db
  });
  const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',DB:{prepare(){return {};}}};
  const call=()=>app.fetch(new Request('https://accounts.example/api/admin/users'),env,{});
  let value=await(await call()).json();
  assert.deepEqual(value.users.map(u=>u.id).sort(),[teacherA.id,teacherShared.id,studentA.id].sort());
  identity=teacherB;
  value=await(await call()).json();
  assert.deepEqual(value.users.map(u=>u.id).sort(),[teacherB.id,studentB.id].sort());
  identity={id:'f'.repeat(32),role:'DEVELOPER'};
  value=await(await call()).json();
  assert.equal(value.users.length,directory.length);
});
