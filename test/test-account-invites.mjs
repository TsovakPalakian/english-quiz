import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AccountInvites} from '../src/account-invites.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';

const actor={id:'teacher',role:'ADMIN'},dev={id:'dev',role:'DEVELOPER'},student={id:'student',role:'USER'};
const users=[actor,{id:'second',role:'ADMIN'},dev,student];

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec("CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key));CREATE TABLE class_groups(id INTEGER PRIMARY KEY,title TEXT,deleted_at INTEGER);INSERT INTO class_groups VALUES(1,'A1',NULL),(2,'Gone',1);CREATE TABLE class_group_students(account_id TEXT PRIMARY KEY,group_id INTEGER,assigned_by TEXT,updated_at INTEGER)");
  const args=c=>c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={
    read:async(q,a=[])=>sql.prepare(q).all(...a),
    atomic:async commands=>{sql.exec('BEGIN');try{for(const c of commands)sql.prepare(c.sql).run(...args(c));sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}},
  };
  return {sql,service:new AccountInvites(db),db,close:()=>sql.close()};
}

test('teacher creates invite for chosen teacher and student redeems into group',async()=>{
  const f=fixture();
  try{
    await assert.rejects(f.service.create(student,{groupId:1,teacherId:actor.id},users),e=>e.status===403);
    const created=await f.service.create(actor,{groupId:1,teacherId:dev.id,maxUses:2,days:7},users);
    assert.match(created.token,/^[a-f0-9]+\.[a-f0-9]+$/);
    assert.equal(created.teacherId,'dev');
    const peek=await f.service.peek(created.token);
    assert.equal(peek.groupTitle,'A1');
    await assert.rejects(f.service.redeem(actor,created.token,async()=>{}),e=>e.status===403);
    const assigned=[];
    const redeemed=await f.service.redeem(student,created.token,async(teacher,accountId,groupId)=>{assigned.push({teacher:teacher.id,accountId,groupId});});
    assert.equal(redeemed.groupId,1);
    assert.deepEqual(assigned,[{teacher:'teacher',accountId:'student',groupId:1}]);
    const teachers=JSON.parse(f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers' AND key='1'").get().value_json);
    assert.ok(teachers.teacherIds.includes('dev'));
  }finally{f.close();}
});

test('invite endpoint enforces roles and CSRF for create',async()=>{
  const f=fixture();
  try{
    let identity=actor;
    const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',DB:{prepare(){return {};}}};
    const app=integratedWorker({
      authenticate:async()=>identity,
      accountWorker:{fetch:async()=>Response.json({users})},
      studyDatabase:()=>f.db,
    });
    const peek=()=>app.fetch(new Request('https://accounts.example/api/accounts/invites?token=bad.token'),env,{});
    assert.equal((await peek()).status,400);
    identity=null;
    assert.equal((await app.fetch(new Request('https://accounts.example/api/accounts/invites'),env,{})).status,401);
    identity=student;
    assert.equal((await app.fetch(new Request('https://accounts.example/api/accounts/invites',{method:'POST',headers:{Origin:'https://accounts.example'},body:JSON.stringify({groupId:1})}),env,{})).status,403);
    identity=actor;
    assert.equal((await app.fetch(new Request('https://accounts.example/api/accounts/invites',{method:'POST',headers:{Origin:'https://other.example'},body:JSON.stringify({groupId:1})}),env,{})).status,403);
    const created=await app.fetch(new Request('https://accounts.example/api/accounts/invites',{method:'POST',headers:{Origin:'https://accounts.example'},body:JSON.stringify({groupId:1,teacherId:'teacher'})}),env,{});
    assert.equal(created.status,200);
    const body=await created.json();
    assert.match(body.token,/\./);
    identity=actor;
    assert.equal((await app.fetch(new Request('https://accounts.example/api/accounts/invites'),env,{})).status,200);
  }finally{f.close();}
});
