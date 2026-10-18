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

test('register rejects invalid invite before creating a pending account',async()=>{
  const f=fixture();
  try{
    let registered=false;
    const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',DB:{prepare(){return {bind(){return {async first(){return null;}};}};}}};
    const app=integratedWorker({
      authenticate:async()=>null,
      accountWorker:{async fetch(){registered=true;return Response.json({status:'pending'});}},
      studyDatabase:()=>f.db,
    });
    const bad=await app.fetch(new Request('https://accounts.example/api/register',{method:'POST',headers:{Origin:'https://accounts.example','Content-Type':'application/json'},body:JSON.stringify({login:'Invitee',email:'i@example.invalid',password:'password1',invite:'bad.token'})}),env,{});
    assert.equal(bad.status,400);
    assert.equal(registered,false);
  }finally{f.close();}
});

test('register with valid invite auto-approves, logs in, and redeems',async()=>{
  const f=fixture();
  try{
    const created=await f.service.create(actor,{groupId:1,teacherId:actor.id},users);
    const assigned=[];
    const calls=[];
    const env={
      STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false',
      DB:{prepare(sql){return {bind(...args){return {async first(){
        if(/registrations WHERE status='pending'/.test(sql))return {id:'reg-1'};
        if(/FROM users WHERE id=/.test(sql))return {id:actor.id,role:'ADMIN',is_personal_data_revoked:0};
        return null;
      }};}};}},
    };
    const app=integratedWorker({
      authenticate:async()=>null,
      approveRegistration:async()=>Response.json({ok:true,userId:'abcdef0123456789abcdef01',role:'USER'}),
      accountWorker:{async fetch(request){
        const url=new URL(request.url);calls.push(url.pathname);
        if(url.pathname==='/api/register'){
          const body=await request.json();
          assert.equal(body.role,'USER');
          assert.equal(body.invite,undefined);
          return Response.json({status:'pending'});
        }
        if(url.pathname==='/api/login')return Response.json({user:{id:'abcdef0123456789abcdef01',login:'Invitee',role:'USER',createdAt:Date.now()/1000}});
        return Response.json({error:'no'},404);
      }},
      studyDatabase:()=>{
        let profileReady=false;
        return {
          read:async(q,a=[])=>{
            if(/account_settings/.test(q))return [];
            if(/profile_members/.test(q))return profileReady?[{profile_id:1}]:[];
            return f.db.read(q,a);
          },
          atomic:async(commands)=>{
            if(/account_settings|account_refs|study_profiles|profile_members/.test(commands?.[0]?.sql||'')){profileReady=true;return;}
            return f.db.atomic(commands);
          },
        };
      },
    });
    const originalRedeem=AccountInvites.prototype.redeem;
    AccountInvites.prototype.redeem=async function(user,token){
      return originalRedeem.call(this,user,token,async(teacher,accountId,groupId)=>{assigned.push({teacher:teacher.id,accountId,groupId});});
    };
    try{
      const response=await app.fetch(new Request('https://accounts.example/api/register',{method:'POST',headers:{Origin:'https://accounts.example','Content-Type':'application/json'},body:JSON.stringify({login:'Invitee',email:'i@example.invalid',password:'password1',invite:created.token})}),env,{});
      const body=await response.json();
      assert.equal(response.status,200,JSON.stringify(body));
      assert.equal(body.user.id,'abcdef0123456789abcdef01');
      assert.deepEqual(calls,['/api/register','/api/login']);
      assert.deepEqual(assigned,[{teacher:'teacher',accountId:'abcdef0123456789abcdef01',groupId:1}]);
    }finally{
      AccountInvites.prototype.redeem=originalRedeem;
    }
  }finally{f.close();}
});
