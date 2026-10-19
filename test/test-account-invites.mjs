import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AccountInvites} from '../src/account-invites.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';
import {EmailOtp} from '../src/email-otp.mjs';

const actor={id:'teacher',role:'ADMIN',email:'teacher@example.invalid'},dev={id:'dev',role:'DEVELOPER'},student={id:'student',role:'USER'};
const users=[actor,{id:'second',role:'ADMIN'},dev,student];

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec("CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key));CREATE TABLE class_groups(id INTEGER PRIMARY KEY,title TEXT,deleted_at INTEGER);INSERT INTO class_groups VALUES(1,'A1',NULL),(2,'Gone',1);CREATE TABLE class_group_students(account_id TEXT PRIMARY KEY,group_id INTEGER,assigned_by TEXT,updated_at INTEGER)");
  sql.prepare('INSERT INTO catalog_documents VALUES(?,?,?)').run('accounts-group-teachers','1',JSON.stringify({revision:1,teacherIds:['teacher','dev']}));
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
    assert.equal(created.maxUses,1);
    assert.ok(Math.abs(created.expiresAt-Date.now()-3*86400000)<1000);
    const peek=await f.service.peek(created.token);
    assert.equal(peek.groupTitle,'A1');
    await assert.rejects(f.service.redeem(actor,created.token,async()=>{}),e=>e.status===403);
    const assigned=[];
    const redeemed=await f.service.redeem(student,created.token,async(teacher,accountId,groupId)=>{assigned.push({teacher:teacher.id,accountId,groupId});});
    assert.equal(redeemed.groupId,1);
    assert.deepEqual(assigned,[{teacher:'teacher',accountId:'student',groupId:1}]);
    const teachers=JSON.parse(f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers' AND key='1'").get().value_json);
    assert.ok(teachers.teacherIds.includes('dev'));
    await assert.rejects(f.service.peek(created.token),error=>error.status===410);
    await assert.rejects(f.service.redeem({...student,id:'another'},created.token,async()=>{}),error=>error.status===410);
  }finally{f.close();}
});

test('student invites require assigned teachers and do not implicitly assign anyone',async()=>{
  const f=fixture();try{
    await assert.rejects(f.service.create(actor,{groupId:1,teacherId:'second'},users),error=>error.status===403);
    await assert.rejects(f.service.create(users[1],{groupId:1,teacherId:'teacher'},users),error=>error.status===403);
    const current=JSON.parse(f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers'").get().value_json);
    assert.deepEqual(current.teacherIds,['teacher','dev']);
  }finally{f.close();}
});

test('one-time token is claimed before concurrent recipients can join and can retry a failed assignment',async()=>{
  const f=fixture();try{
    const invite=await f.service.create(actor,{groupId:1},users);
    let release,started;const waiting=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>started=resolve);
    let assignments=0;
    const first=f.service.redeem(student,invite.token,async()=>{assignments++;started();await waiting;});
    await entered;
    await assert.rejects(f.service.redeem({...student,id:'another'},invite.token,async()=>assignments++),error=>error.status===410);
    release();await first;assert.equal(assignments,1);
    const retry=await f.service.create(actor,{groupId:1},users);
    await assert.rejects(f.service.redeem(student,retry.token,async()=>{throw new Error('temporary');}),/temporary/);
    await f.service.redeem(student,retry.token,async()=>{});
  }finally{f.close();}
});

test('teacher invites bind verified email, preserve existing teachers and require developer approval for new teachers',async()=>{
  const f=fixture();try{
    const teacher={id:'second',role:'ADMIN',email:'second@example.invalid',active:1};
    f.sql.exec("INSERT INTO class_groups VALUES(3,'B1',NULL)");
    const other=await f.service.create(actor,{groupId:3,kind:'teacher',email:teacher.email},users);
    assert.equal(other.groupId,3,'Teacher invitations can target another group');
    const invite=await f.service.create(actor,{groupId:1,kind:'teacher',email:teacher.email},users);
    await assert.rejects(f.service.redeem(teacher,invite.token,async()=>{}),error=>error.status===403);
    await assert.rejects(f.service.redeem(teacher,invite.token,async()=>{},{verifiedEmail:'wrong@example.invalid'}),error=>error.status===403);
    await f.service.redeem(teacher,invite.token,async()=>{throw new Error('must not assign student');},{verifiedEmail:teacher.email,users:[...users,teacher]});
    const teachers=JSON.parse(f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers'").get().value_json).teacherIds;
    assert.deepEqual(new Set(teachers),new Set(['teacher','dev','second']));
    const pending=await f.service.create(actor,{groupId:1,kind:'teacher',email:'new@example.invalid'},users);
    await f.service.acceptPendingTeacher(pending.token,'new@example.invalid','pending-registration');
    await assert.rejects(f.service.peek(pending.token),error=>error.status===410);
    const newcomer={id:'new',role:'ADMIN',email:'new@example.invalid',active:1};
    await assert.rejects(f.service.completeTeacherApproval(users[1],'pending-registration',newcomer,[newcomer]),error=>error.status===403);
    await f.service.completeTeacherApproval(actor,'pending-registration',newcomer,[newcomer]);
    const assigned=JSON.parse(f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers'").get().value_json).teacherIds;
    assert.ok(assigned.includes('new')&&assigned.includes('teacher'));
  }finally{f.close();}
});

test('old multi-use links are also capped to one use and 72 hours',async()=>{
  const f=fixture();try{
    const created=await f.service.create(actor,{groupId:1},users);
    await f.service.peek(created.token);await f.service.peek(created.token);
    const row=f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='account-invites' AND key=?").get(created.id);
    const old={...JSON.parse(row.value_json),createdAt:Date.now()-4*86400000,expiresAt:Date.now()+25*86400000,maxUses:50};
    f.sql.prepare("UPDATE catalog_documents SET value_json=? WHERE namespace='account-invites' AND key=?").run(JSON.stringify(old),created.id);
    await assert.rejects(f.service.peek(created.token),error=>error.status===410);
  }finally{f.close();}
});

test('teacher registration requires email code and joins only after developer approval',async()=>{
  const f=fixture();try{
    const teacher={id:'abcdef0123456789abcdef01',role:'ADMIN',email:'new@example.invalid',active:1};
    const token=(await f.service.create(actor,{groupId:1,kind:'teacher',email:teacher.email},users)).token;
    let registered=0;
    const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false',
      DB:{prepare(sql){return {bind(){return {async first(){
        if(sql.includes("status='pending' AND login="))return {id:'abcdef0123456789abcdef02'};
        if(sql.includes('SELECT id,email,role,active FROM users'))return teacher;
        return null;
      }};}};}}
    };
    const app=integratedWorker({authenticate:async()=>dev,studyDatabase:()=>f.db,accountWorker:{async fetch(request){
      if(new URL(request.url).pathname==='/api/register'){
        const body=await request.json();assert.equal(body.role,'ADMIN');assert.equal(body.emailCode,undefined);registered++;
        return Response.json({status:'pending'});
      }
      return Response.json({ok:true,userId:teacher.id,role:'ADMIN'});
    }}});
    const register=code=>app.fetch(new Request('https://accounts.example/api/register',{method:'POST',headers:{Origin:'https://accounts.example'},body:JSON.stringify({login:'NewTeacher',email:teacher.email,password:'password1',invite:token,emailCode:code})}),env,{});
    assert.equal((await register('')).status,400);assert.equal(registered,0);
    const proof=await new EmailOtp(f.db).issue(teacher.email);
    const response=await register(proof.code);assert.equal(response.status,200,await response.clone().text());
    assert.equal((await response.json()).status,'pending');assert.equal(registered,1);
    await assert.rejects(f.service.peek(token),error=>error.status===410);
    const before=JSON.parse(f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers'").get().value_json);
    assert.ok(!before.teacherIds.includes(teacher.id));
    const approved=await app.fetch(new Request('https://accounts.example/api/admin/registrations/abcdef0123456789abcdef02/approve',{method:'POST',headers:{Origin:'https://accounts.example'},body:'{}'}),env,{});
    assert.equal(approved.status,200,await approved.clone().text());
    assert.equal((await approved.json()).groupWarning,undefined);
    const after=JSON.parse(f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers'").get().value_json);
    assert.ok(after.teacherIds.includes(teacher.id));
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

test('register with valid invite stays pending and joins only after approval by its inviter',async()=>{
  const f=fixture();try{
    const created=await f.service.create(actor,{groupId:1,teacherId:actor.id},users);
    const calls=[],assigned=[];
    const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false',
      DB:{prepare(){return {bind(){return {async first(){return {id:'reg-1'};}};}};}}};
    const app=integratedWorker({authenticate:async()=>null,studyDatabase:()=>f.db,accountWorker:{async fetch(request){
      calls.push(new URL(request.url).pathname);
      const body=await request.json();assert.equal(body.role,'USER');assert.equal(body.invite,undefined);
      return Response.json({status:'pending'});
    }}});
    const response=await app.fetch(new Request('https://accounts.example/api/register',{method:'POST',headers:{Origin:'https://accounts.example'},body:JSON.stringify({login:'Invitee',email:'i@example.invalid',password:'password1',invite:created.token})}),env,{});
    assert.equal(response.status,200,await response.clone().text());
    assert.equal((await response.json()).status,'pending');
    assert.deepEqual(calls,['/api/register'],'No automatic approval or login');
    await assert.rejects(f.service.peek(created.token),error=>error.status===410);
    const person={...student,email:'i@example.invalid'};
    await assert.rejects(f.service.completeApproval(users[1],'reg-1',person,[person],async()=>{}),error=>error.status===403);
    await f.service.completeApproval(actor,'reg-1',person,[person],async(teacher,accountId,groupId)=>assigned.push({teacher:teacher.id,accountId,groupId}));
    assert.deepEqual(assigned,[{teacher:actor.id,accountId:student.id,groupId:1}]);
    const permissions=await f.service.registrationPermissions(users[1],[{id:'reg-1'}]);
    assert.equal(permissions[0].inviteCanApprove,false);
    assert.equal((await f.service.registrationPermissions(actor,[{id:'reg-1'}]))[0].inviteCanApprove,true);
  }finally{f.close();}
});
