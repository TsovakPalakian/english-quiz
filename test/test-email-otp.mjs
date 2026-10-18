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
