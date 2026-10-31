import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ChatBridge} from '../src/chat-worker.mjs';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {statement} from '../src/learning-study.mjs';

const teacherA={id:'teacher-a',login:'teacher_a',name:'Teacher A',email:'a@example.invalid',role:'ADMIN',active:1};
const teacherB={id:'teacher-b',login:'teacher_b',name:'Teacher B',email:'b@example.invalid',role:'ADMIN',active:1};
const studentA={id:'student-a',login:'student_a',name:'Student A',email:'sa@example.invalid',role:'USER',active:1};
const studentB={id:'student-b',login:'student_b',name:'Student B',email:'sb@example.invalid',role:'USER',active:1};

function bridgeWithPolicy(){
  const sqlite=new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  sqlite.exec(`
    INSERT INTO class_groups(id,title) VALUES(1,'A1 One'),(2,'A1 Two');
    INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES('student-a',1,'teacher-a'),('student-b',2,'teacher-b');
    INSERT INTO catalog_documents(namespace,key,value_json) VALUES
      ('accounts-group-teachers','1','{"revision":1,"teacherIds":["teacher-a"]}'),
      ('accounts-group-teachers','2','{"revision":1,"teacherIds":["teacher-b"]}');
  `);
  const args=c=>c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={
    read:async(q,a=[])=>sqlite.prepare(q).all(...a),
    readMany:async commands=>Promise.all(commands.map(command=>db.read(command.sql,command.args?.map(a=>a?.value??a)||[]))),
    atomic:async commands=>{sqlite.exec('BEGIN');try{for(const c of commands)sqlite.prepare(c.sql).run(...args(c));sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}
  };
  const users=[teacherA,teacherB,studentA,studentB];
  const env={
    DB:{prepare:()=>({all:async()=>({results:users.map(u=>({...u,is_personal_data_revoked:0}))})})},
    CONTENT_SESSION_SECRET:'fixture'
  };
  const meta=new Map();
  const ctx={
    storage:{
      sql:{exec(){return {toArray:()=>[]};}},
      transactionSync(fn){return fn();},
      setAlarm:async()=>{},
      deleteAlarm:async()=>{}
    },
    waitUntil(){},
    getWebSockets:()=>[]
  };
  const bridge=new ChatBridge(ctx,env,{studyDatabase:()=>db});
  bridge.get=key=>meta.has(key)?meta.get(key):null;
  bridge.set=(key,value)=>meta.set(key,value);
  bridge.set('journalVersion',1);
  bridge.set('policy',{
    at:Date.now(),
    users:users.map(u=>({...u,groupId:u.id.startsWith('student-a')?1:u.id.startsWith('student-b')?2:null})),
    groups:[{id:1,title:'A1 One'},{id:2,title:'A1 Two'}],
    members:[{account_id:'student-a',group_id:1},{account_id:'student-b',group_id:2}],
    teachersByGroup:[{groupId:1,teacherIds:['teacher-a']},{groupId:2,teacherIds:['teacher-b']}]
  });
  return bridge;
}

test('ADMIN discover cannot find students or teachers outside assigned groups',async()=>{
  const bridge=bridgeWithPolicy();
  const policy=bridge.get('policy');
  policy.users=policy.users.map(u=>({...u,active:1,is_personal_data_revoked:0}));
  policy.users.push({id:'dev',login:'dev',name:'Dev',email:'dev@example.invalid',role:'DEVELOPER',active:1,is_personal_data_revoked:0});
  bridge.set('policy',policy);
  assert.equal((await bridge.discover(teacherA,'sa@example.invalid')).person?.id,'student-a');
  assert.equal((await bridge.discover(teacherA,'sb@example.invalid')).person,null);
  assert.equal((await bridge.discover(teacherA,'teacher_b')).person,null);
  assert.equal((await bridge.discover(teacherB,'sb@example.invalid')).person?.id,'student-b');
  assert.equal((await bridge.discover({id:'dev',role:'DEVELOPER'},'sb@example.invalid')).person?.id,'student-b');
});

test('policy rebuild scopes ADMIN contacts and groups',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  sqlite.exec(`
    INSERT INTO class_groups(id,title) VALUES(1,'A1 One'),(2,'A1 Two');
    INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES('student-a',1,'teacher-a'),('student-b',2,'teacher-b');
    INSERT INTO catalog_documents(namespace,key,value_json) VALUES
      ('accounts-group-teachers','1','{"revision":1,"teacherIds":["teacher-a"]}'),
      ('accounts-group-teachers','2','{"revision":1,"teacherIds":["teacher-b"]}');
  `);
  const args=c=>c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={
    read:async(q,a=[])=>sqlite.prepare(q).all(...a),
    readMany:async commands=>{
      const out=[];
      for(const command of commands){
        const sql=command.sql||command;
        const bind=(command.args||[]).map(a=>a?.type?a.value:a);
        out.push(await db.read(sql,bind));
      }
      return out;
    },
    atomic:async commands=>{sqlite.exec('BEGIN');try{for(const c of commands)sqlite.prepare(c.sql).run(...args(c));sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}
  };
  const users=[teacherA,teacherB,studentA,studentB];
  const calls=[];
  const env={
    DB:{prepare:()=>({all:async()=>({results:users.map(u=>({...u,is_personal_data_revoked:0}))})})},
    CONTENT_SESSION_SECRET:'fixture',
    CHAT_ROOM:{idFromName:id=>id,get:id=>({fetch:async(request)=>{calls.push({room:id,body:await request.json()});return Response.json({ok:true});}})},
    CHAT_INBOX:{idFromName:id=>id,get:id=>({fetch:async(request)=>{calls.push({inbox:id,body:await request.json()});return Response.json({rooms:[]});}})}
  };
  const meta=new Map();
  const ctx={storage:{sql:{exec(){return {toArray:()=>[]};}},transactionSync:fn=>fn(),setAlarm:async()=>{},deleteAlarm:async()=>{}},waitUntil(){},getWebSockets:()=>[]};
  const bridge=new ChatBridge(ctx,env,{studyDatabase:()=>db});
  bridge.get=key=>meta.has(key)?meta.get(key):null;
  bridge.set=(key,value)=>meta.set(key,value);
  bridge.set('journalVersion',1);
  const policy=await bridge.policy(true,true);
  assert.ok(policy.teachersByGroup.some(row=>row.groupId===1&&row.teacherIds.includes('teacher-a')));
  const configure=calls.filter(c=>c.inbox&&c.body?.contacts);
  const teacherConfig=configure.find(c=>c.inbox==='teacher-a');
  assert.ok(teacherConfig);
  assert.deepEqual(teacherConfig.body.contacts.map(c=>c.id).sort(),['student-a']);
  assert.deepEqual(teacherConfig.body.groups.map(g=>g.id),[1]);
  const other=configure.find(c=>c.inbox==='teacher-b');
  assert.deepEqual(other.body.contacts.map(c=>c.id).sort(),['student-b']);
});
