import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {EmailOtp} from '../src/email-otp.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key))');
  const args=c=>c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={
    read:async(q,a=[])=>sql.prepare(q).all(...a),
    atomic:async commands=>{sql.exec('BEGIN');try{for(const c of commands)sql.prepare(c.sql).run(...args(c));sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}},
  };
  return {sql,service:new EmailOtp(db),db,close:()=>sql.close()};
}

test('email otp issues and consumes a code once',async()=>{
  const f=fixture();
  try{
    const issued=await f.service.issue('Student@Example.com');
    assert.equal(issued.email,'student@example.com');
    assert.match(issued.code,/^\d{6}$/);
    await assert.rejects(f.service.consume(issued.email,'000000'),e=>e.status===401);
    const ok=await f.service.consume(issued.email,issued.code);
    assert.equal(ok.email,'student@example.com');
    await assert.rejects(f.service.consume(issued.email,issued.code),e=>e.status===400);
  }finally{f.close();}
});

test('otp request endpoint sends mail through EMAIL binding',async()=>{
  const f=fixture();
  try{
    const sent=[];
    const env={
      STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false',
      EMAIL_FROM:'noreply@lumiscia.org',
      EMAIL:{async send(message){sent.push(message);return {messageId:'msg-1'};}},
      DB:{prepare(){return {bind(){return {async first(){return null;}};}};}},
    };
    const app=integratedWorker({
      authenticate:async()=>null,
      studyDatabase:()=>f.db,
      accountWorker:{async fetch(){return Response.json({error:'no'},404);}},
    });
    const response=await app.fetch(new Request('https://accounts.example/api/auth/otp/request',{method:'POST',headers:{Origin:'https://accounts.example','Content-Type':'application/json'},body:JSON.stringify({email:'user@example.com'})}),env,{});
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.email,'user@example.com');
    assert.equal(sent.length,1);
    assert.equal(sent[0].to,'user@example.com');
    assert.match(String(sent[0].text),/\d{6}/);
  }finally{f.close();}
});

test('concurrent requests cannot consume the same code twice',async()=>{
  const f=fixture();try{
    const issued=await f.service.issue('once@example.com',{purpose:'password-reset'});
    const results=await Promise.allSettled([f.service.consume(issued.email,issued.code),f.service.consume(issued.email,issued.code)]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  }finally{f.close();}
});

test('password recovery requires a dedicated code, validates input and changes only an active account',async()=>{
  const f=fixture();try{
    f.sql.exec('CREATE TABLE users(id TEXT,email TEXT,active INTEGER,is_personal_data_revoked INTEGER,password_salt TEXT,password_hash TEXT,password_iterations INTEGER)');
    f.sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run('u1','user@example.com',1,0,'old-salt','old-hash',1);
    f.sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run('u2','inactive@example.com',0,0,'old-salt','old-hash',1);
    const mail=[],env={
      STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',ACCOUNT_MUTATIONS_ENABLED:'true',ACCOUNT_QUERY_LIMIT_ENABLED:'false',
      EMAIL:{async send(message){mail.push(message);}},
      DB:{prepare(sql){return {bind(...args){return {async run(){return f.sql.prepare(sql).run(...args);}};}};}},
    };
    const app=integratedWorker({authenticate:async()=>null,studyDatabase:()=>f.db});
    const call=(path,body,origin='https://accounts.example')=>app.fetch(new Request('https://accounts.example/api/auth/password/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env,{});
    assert.equal((await call('code',{email:'user@example.com'},'https://other.example')).status,403);
    assert.equal((await call('code',{email:'user@example.com'})).status,200);
    const code=mail[0].text.match(/\b\d{6}\b/)[0];assert.match(mail[0].subject,/Reset/);
    assert.equal((await call('reset',{email:'user@example.com',code,password:'short'})).status,400);
    assert.equal((await call('reset',{email:'user@example.com',code:'000000',password:'new-password'})).status,401);
    assert.equal((await call('reset',{email:'user@example.com',code,password:'new-password'})).status,200);
    const user=f.sql.prepare('SELECT * FROM users WHERE id=?').get('u1');
    assert.notEqual(user.password_hash,'old-hash');assert.equal(user.password_iterations,100000);
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('new-password'),'PBKDF2',false,['deriveBits']);
    const actual=Buffer.from(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Buffer.from(user.password_salt,'hex'),iterations:100000},key,256)).toString('hex');
    assert.equal(user.password_hash,actual);
    assert.equal((await call('reset',{email:'user@example.com',code,password:'another-password'})).status,400);
    const login=await f.service.issue('login@example.com');
    assert.equal((await call('reset',{email:login.email,code:login.code,password:'new-password'})).status,403);
    const inactive=await f.service.issue('inactive@example.com',{purpose:'password-reset'});
    assert.equal((await call('reset',{email:inactive.email,code:inactive.code,password:'new-password'})).status,200);
    assert.equal(f.sql.prepare('SELECT password_hash FROM users WHERE id=?').get('u2').password_hash,'old-hash');
    const unknown=await f.service.issue('unknown@example.com',{purpose:'password-reset'});
    assert.equal((await call('reset',{email:unknown.email,code:unknown.code,password:'new-password'})).status,200);
  }finally{f.close();}
});
