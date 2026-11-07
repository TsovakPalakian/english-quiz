import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AccountInvites, encryptInviteToken, parseInviteToken} from '../src/account-invites.mjs';
import {EmailOtp} from '../src/email-otp.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key))');
  sql.exec('CREATE TABLE class_groups(id INTEGER PRIMARY KEY,title TEXT,deleted_at INTEGER,revision INTEGER DEFAULT 1,lesson_date TEXT DEFAULT "2026-11-08")');
  sql.exec('CREATE TABLE class_group_students(account_id TEXT PRIMARY KEY,group_id INTEGER,assigned_by TEXT,updated_at INTEGER)');
  sql.exec('CREATE TABLE class_group_setup(key TEXT PRIMARY KEY)');
  sql.exec("INSERT INTO class_group_setup VALUES('levels-v1'),('level-names-v2')");
  sql.exec("INSERT INTO class_groups(id,title) VALUES(1,'English B1')");
  sql.prepare('INSERT INTO catalog_documents VALUES(?,?,?)').run('accounts-group-teachers','1',JSON.stringify({revision:1,teacherIds:['teacher1']}));
  const args=c=>c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={
    read:async(q,a=[])=>sql.prepare(q).all(...a),
    atomic:async commands=>{sql.exec('BEGIN');try{for(const c of commands)sql.prepare(c.sql).run(...args(c));sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}},
  };
  return {sql,db,service:new AccountInvites(db),close:()=>sql.close()};
}

const teacherActor={id:'teacher1',role:'ADMIN'};
const users=[{id:'teacher1',role:'ADMIN',active:1,name:'Teacher One'}];

test('encrypted invite token is generated, stored as hash and decrypted successfully',async()=>{
  const f=fixture();
  try{
    const created=await f.service.create(teacherActor,{groupId:1,teacherId:'teacher1'},users);
    assert.match(created.token,/^[a-f0-9]{16}\.[a-f0-9]{100,}$/);
    const parsed=await parseInviteToken(created.token);
    assert.equal(parsed.id,created.id);
    assert.ok(parsed.secret);
    // In database only secretHash is stored, not the raw secret or raw token
    const row=f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='account-invites' AND key=?").get(created.id);
    const stored=JSON.parse(row.value_json);
    assert.equal(stored.secretHash.length,64);
    assert.equal(stored.secret,undefined);
    // peek successfully validates encrypted token against secretHash in DB
    const peeked=await f.service.peek(created.token);
    assert.equal(peeked.groupId,1);
    assert.equal(peeked.groupTitle,'English B1');
  }finally{f.close();}
});

test('parseInviteToken rejects tampered encrypted payloads',async()=>{
  const f=fixture();
  try{
    const created=await f.service.create(teacherActor,{groupId:1,teacherId:'teacher1'},users);
    const parts=created.token.split('.');
    // Corrupt one character in the encrypted payload
    const corruptedHex=parts[1].slice(0,-2)+(parts[1].slice(-2)==='00'?'ff':'00');
    await assert.rejects(
      parseInviteToken(parts[0]+'.'+corruptedHex),
      error=>error.status===400&&error.message==='Invalid invite link.'
    );
  }finally{f.close();}
});

test('email OTP enforces 1h expiry, 12h resend limit and 48h ban after 3 failed attempts',async()=>{
  const f=fixture();
  try{
    const otpService=new EmailOtp(f.db);
    const clientIp='192.0.2.15';
    const email='student@test.example';
    const issued=await otpService.issue(email,{clientIp});
    assert.equal(issued.ttlSec,3600);
    // Immediate resend within 12 hours is rejected
    await assert.rejects(
      otpService.issue(email,{clientIp}),
      error=>error.status===429&&error.message==='Wait a moment before requesting another code.'
    );
    // Attempt 1: wrong code -> 401
    await assert.rejects(
      otpService.consume(email,'999001',{clientIp}),
      error=>error.status===401&&error.message==='Wrong code.'
    );
    // Attempt 2: wrong code -> 401
    await assert.rejects(
      otpService.consume(email,'999002',{clientIp}),
      error=>error.status===401&&error.message==='Wrong code.'
    );
    // Attempt 3: wrong code -> 429 with 48 hours ban
    await assert.rejects(
      otpService.consume(email,'999003',{clientIp}),
      error=>error.status===429&&error.message.includes('Suspended for 48 hours')
    );
    // Subsequent issue from same IP is locked out for 48 hours
    await assert.rejects(
      otpService.issue('different@test.example',{clientIp}),
      error=>error.status===429&&error.message.includes('Suspended for 48 hours')
    );
  }finally{f.close();}
});

test('registration with encrypted invite token and verified OTP grants direct access',async()=>{
  const f=fixture();
  try{
    f.sql.exec("CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,deleted_at INTEGER);");
    const created=await f.service.create(teacherActor,{groupId:1,teacherId:'teacher1'},users);
    const studentUser={id:'student_uid_1',login:'DirectStudent',email:'direct@test.example',role:'USER',name:'Direct Student'};
    const otpProof=await new EmailOtp(f.db).issue(studentUser.email);
    const calls=[];
    const env={
      STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false',
      DB:{prepare(sql){return {bind(){return {async first(){
        return sql.includes('FROM users')?studentUser:{id:'reg_1',role:'USER',email:studentUser.email};
      }};}};}},
    };
    const app=integratedWorker({
      authenticate:async()=>null,
      studyDatabase:()=>f.db,
      approveRegistration:async(accountEnv,sender,id)=>{
        assert.equal(sender.id,teacherActor.id);
        assert.equal(id,'reg_1');
        return Response.json({userId:studentUser.id,role:'USER'});
      },
      accountWorker:{async fetch(req){
        const path=new URL(req.url).pathname;
        calls.push(path);
        if(path==='/api/register'){
          const body=await req.json();
          assert.equal(body.role,'USER');
          assert.equal(body.invite,undefined);
          assert.equal(body.emailCode,undefined);
          return Response.json({status:'pending'});
        }
        if(path==='/api/login'){
          return Response.json({signedIn:true},{headers:{'Set-Cookie':'session=direct_session; Secure; HttpOnly'}});
        }
        return Response.json({ok:true});
      }}
    });
    const regReq=new Request('https://accounts.example/api/register',{
      method:'POST',
      headers:{Origin:'https://accounts.example','Content-Type':'application/json'},
      body:JSON.stringify({
        login:studentUser.login,
        email:studentUser.email,
        name:studentUser.name,
        password:'secretPassword123',
        invite:created.token,
        emailCode:otpProof.code,
      })
    });
    const response=await app.fetch(regReq,env,{});
    assert.equal(response.status,200,await response.clone().text());
    const data=await response.json();
    assert.equal(data.signedIn,true);
    assert.deepEqual(calls,['/api/register','/api/login']);
    // Verify student was added to the group
    assert.equal(f.sql.prepare('SELECT group_id FROM class_group_students WHERE account_id=?').get(studentUser.id).group_id,1);
    // Token is consumed
    await assert.rejects(f.service.peek(created.token),err=>err.status===410);
  }finally{f.close();}
});

test('registration with invite rejects invalid OTP and locks out after 3 wrong attempts',async()=>{
  const f=fixture();
  try{
    f.sql.exec("CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,deleted_at INTEGER);");
    const created=await f.service.create(teacherActor,{groupId:1,teacherId:'teacher1'},users);
    const clientIp='203.0.113.77';
    await new EmailOtp(f.db).issue('attacker_student@test.example',{clientIp});
    const env={
      STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false',
      DB:{prepare(sql){return {bind(){return {async first(){
        return sql.includes('FROM users')?currentUser:{id:'reg_'+currentUser.id,role:'USER',email:currentUser.email};
      }};}};}},
    };
    const app=integratedWorker({
      authenticate:async()=>null,
      studyDatabase:()=>f.db,
      accountWorker:{async fetch(){return Response.json({status:'pending'});}}
    });
    const makeReg=(code)=>new Request('https://accounts.example/api/register',{
      method:'POST',
      headers:{Origin:'https://accounts.example','Content-Type':'application/json','CF-Connecting-IP':clientIp},
      body:JSON.stringify({
        login:'AttackerStudent',
        email:'attacker_student@test.example',
        name:'Attacker',
        password:'secretPassword123',
        invite:created.token,
        emailCode:code,
      })
    });
    // Attempt 1: wrong code -> 401
    const res1=await app.fetch(makeReg('000001'),env,{});
    assert.equal(res1.status,401);
    // Attempt 2: wrong code -> 401
    const res2=await app.fetch(makeReg('000002'),env,{});
    assert.equal(res2.status,401);
    // Attempt 3: 3rd wrong code -> 429 Suspended for 48 hours
    const res3=await app.fetch(makeReg('000003'),env,{});
    assert.equal(res3.status,429);
    assert.match(await res3.text(),/Suspended for 48 hours/);
    // 4th attempt from same IP is locked out
    const res4=await app.fetch(makeReg('000004'),env,{});
    assert.equal(res4.status,429);
    assert.match(await res4.text(),/Suspended for 48 hours/);
  }finally{f.close();}
});

test('registration rejects expired encrypted invite token and prevents account creation',async()=>{
  const f=fixture();
  try{
    f.sql.exec("CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,deleted_at INTEGER);");
    const created=await f.service.create(teacherActor,{groupId:1,teacherId:'teacher1'},users);
    
    // Manually expire the invite in catalog_documents (4 days old, exceeding 72h limit)
    const row=f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='account-invites' AND key=?").get(created.id);
    const stored=JSON.parse(row.value_json);
    stored.expiresAt=Date.now()-10000;
    stored.createdAt=Date.now()-(4*86400000);
    f.sql.prepare("UPDATE catalog_documents SET value_json=? WHERE namespace='account-invites' AND key=?").run(JSON.stringify(stored),created.id);

    const clientIp='198.51.100.42';
    const otpService=new EmailOtp(f.db);
    const otpProof=await otpService.issue('late_student@test.example',{clientIp});

    let calls=[];
    const env={
      STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false',
      DB:{prepare(sql){return {bind(){return {async first(){
        return sql.includes('FROM users')?currentUser:{id:'reg_'+currentUser.id,role:'USER',email:currentUser.email};
      }};}};}},
    };
    const app=integratedWorker({
      authenticate:async()=>null,
      studyDatabase:()=>f.db,
      accountWorker:{
        async fetch(req){
          calls.push(new URL(req.url).pathname);
          return Response.json({status:'pending'});
        }
      }
    });

    const regReq=new Request('https://accounts.example/api/register',{
      method:'POST',
      headers:{Origin:'https://accounts.example','Content-Type':'application/json','CF-Connecting-IP':clientIp},
      body:JSON.stringify({
        login:'late_student',
        email:'late_student@test.example',
        name:'Late Student',
        password:'secretPassword123',
        invite:created.token,
        emailCode:otpProof.code,
      })
    });

    const response=await app.fetch(regReq,env,{});
    assert.equal(response.status,410);
    assert.match(await response.text(),/Invite expired/);
    assert.deepEqual(calls,[]);
    assert.equal(f.sql.prepare('SELECT COUNT(*) as count FROM class_group_students').get().count,0);
  }finally{f.close();}
});

test('registration rejects already redeemed invite token and blocks second user from joining',async()=>{
  const f=fixture();
  try{
    f.sql.exec("CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,deleted_at INTEGER);");
    const created=await f.service.create(teacherActor,{groupId:1,teacherId:'teacher1'},users);
    
    // First user completes registration and redeems token
    const student1={id:'student_alpha',role:'USER',login:'student_alpha',email:'alpha@test.example',name:'Alpha Student'};
    const otp1=await new EmailOtp(f.db).issue(student1.email,{clientIp:'192.0.2.1'});

    let calls=[];
    const env={
      STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false',
      DB:{prepare(sql){return {bind(){return {async first(){
        return sql.includes('FROM users')?currentUser:{id:'reg_'+currentUser.id,role:'USER',email:currentUser.email};
      }};}};}},
    };
    let currentUser=student1;
    const app=integratedWorker({
      authenticate:async()=>null,
      studyDatabase:()=>f.db,
      approveRegistration:async()=>Response.json({userId:currentUser.id,role:'USER'}),
      accountWorker:{
        async fetch(req){
          const pathname=new URL(req.url).pathname;
          calls.push(pathname);
          if(pathname==='/api/register')return Response.json({status:'pending'});
          if(pathname==='/api/login')return Response.json({signedIn:true},{headers:{'Set-Cookie':'session=sess_'+currentUser.id}});
          return Response.json({status:'pending'});
        }
      }
    });

    const regReq1=new Request('https://accounts.example/api/register',{
      method:'POST',
      headers:{Origin:'https://accounts.example','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},
      body:JSON.stringify({
        login:student1.login,
        email:student1.email,
        name:student1.name,
        password:'secretPassword123',
        invite:created.token,
        emailCode:otp1.code,
      })
    });

    const res1=await app.fetch(regReq1,env,{});
    assert.equal(res1.status,200,await res1.clone().text());
    assert.equal((await res1.json()).signedIn,true);
    assert.equal(f.sql.prepare('SELECT group_id FROM class_group_students WHERE account_id=?').get(student1.id).group_id,1);

    // Second user attempts to register using the exact same invite token
    const student2={id:'student_beta',role:'USER',login:'student_beta',email:'beta@test.example',name:'Beta Student'};
    const otp2=await new EmailOtp(f.db).issue(student2.email,{clientIp:'192.0.2.2'});
    currentUser=student2;
    calls=[];

    const regReq2=new Request('https://accounts.example/api/register',{
      method:'POST',
      headers:{Origin:'https://accounts.example','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.2'},
      body:JSON.stringify({
        login:student2.login,
        email:student2.email,
        name:student2.name,
        password:'secretPassword456',
        invite:created.token,
        emailCode:otp2.code,
      })
    });

    const res2=await app.fetch(regReq2,env,{});
    assert.equal(res2.status,410);
    assert.match(await res2.text(),/Invite already used up/);
    assert.deepEqual(calls,[]);
    assert.equal(f.sql.prepare('SELECT account_id FROM class_group_students WHERE account_id=?').get(student2.id),undefined);
    assert.equal(f.sql.prepare('SELECT COUNT(*) as count FROM class_group_students').get().count,1);
  }finally{f.close();}
});
