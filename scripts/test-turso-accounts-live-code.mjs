// Real account-handler code; ONLY synthetic in-memory D1/R2, never Cloudflare.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync} from 'node:crypto';
import {integratedWorker,accountMedia} from '../src/turso-integrated-worker.mjs';
const devId='a'.repeat(32),password='FixturePassword1';
test('Account directory CAS uses raw ETag without removing the precondition or touching other keys',async()=>{
  const calls=[],bucket={put:async(...args)=>{calls.push(args);return true;},get(){return this===bucket;}};
  const wrapped=accountMedia(bucket);
  await wrapped.put('directory/accounts.json','value',{onlyIf:{etagMatches:'"abc"'},httpMetadata:{contentType:'application/json'}});
  assert.equal(calls[0][2].onlyIf.etagMatches,'abc');assert.equal(calls[0][2].httpMetadata.contentType,'application/json');
  await wrapped.put('other.json','value',{onlyIf:{etagMatches:'"abc"'}});assert.equal(calls[1][2].onlyIf.etagMatches,'"abc"');
  await wrapped.put('directory/accounts.json','value',{onlyIf:{etagDoesNotMatch:'*'}});assert.equal(calls[2][2].onlyIf.etagDoesNotMatch,'*');assert.ok(wrapped.get());
});
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,login TEXT UNIQUE,email TEXT UNIQUE,name TEXT DEFAULT '',password_salt TEXT,password_hash TEXT,password_iterations INTEGER,role TEXT DEFAULT 'USER',is_personal_data_revoked INTEGER DEFAULT 0,revoked_at INTEGER,hidden INTEGER DEFAULT 0,active INTEGER DEFAULT 1,created_at INTEGER);
    CREATE TABLE registrations(id TEXT PRIMARY KEY,login TEXT,email TEXT,name TEXT,password_salt TEXT,password_hash TEXT,password_iterations INTEGER,status TEXT,role TEXT DEFAULT 'USER',user_id TEXT,created_at INTEGER,decided_at INTEGER);
    CREATE TABLE account_changes(id TEXT PRIMARY KEY,user_id TEXT,login TEXT,email TEXT,name TEXT DEFAULT '',from_login TEXT,from_email TEXT,from_name TEXT,role TEXT DEFAULT 'USER',status TEXT,created_at INTEGER,decided_at INTEGER);`);
  const salt='1'.repeat(32),hash=pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex');
  sqlite.prepare("INSERT INTO users(id,login,email,name,password_salt,password_hash,password_iterations,role,created_at) VALUES(?,'FixtureDev','dev@example.invalid','Fixture',?,?,100000,'DEVELOPER',0)").run(devId,salt,hash);
  const DB={prepare(sql){const statement=args=>({bind:(...values)=>statement(values),first:async()=>sqlite.prepare(sql).get(...args)||null,
    all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({success:true,meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})});return statement([]);},
    async batch(commands){sqlite.exec('BEGIN');try{const results=[];for(const command of commands)results.push(await command.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const objects=new Map();let version=0,queries=0;
  const value=key=>{const item=objects.get(key);return item&&{key,size:Buffer.byteLength(item.text),etag:item.etag,httpEtag:`"${item.etag}"`,text:async()=>item.text,json:async()=>JSON.parse(item.text),writeHttpMetadata(){}};};
  const MEDIA={head:async key=>value(key),get:async key=>value(key),put:async(key,text,options={})=>{
    const old=objects.get(key),condition=options.onlyIf;
    if(condition?.etagMatches&&old?.etag!==condition.etagMatches.replace(/^"|"$/g,'')||condition?.etagDoesNotMatch==='*'&&old)return null;
    objects.set(key,{text:String(text),etag:String(++version)});return value(key);},
    delete:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);},
    list:async({prefix})=>({objects:[...objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false})};
  const env={DB,MEDIA,SESSION_SECRET:'synthetic-fixture-secret-only',STAGE_ENABLED:'true',STAGE_WRITES:'false',ACCOUNT_MUTATIONS_ENABLED:'true',STAGE_ALLOWED_HOST:'fixture.invalid',
    AUTH_BUDGET:{idFromName:()=>'',get:()=>({fetch:async()=>{if(queries>=50)return new Response(null,{status:503});queries++;return new Response(null);}})}};
  const worker=integratedWorker();
  const client=()=>{let cookie='';return {get cookie(){return cookie;},async call(path,method='GET',body=null,override=null){
    const headers={Origin:'https://fixture.invalid',...(override!==null?{Cookie:override}:cookie?{Cookie:cookie}:{})};if(body)headers['Content-Type']='application/json';
    const response=await worker.fetch(new Request('https://fixture.invalid'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),env,{});
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,value:await response.json()};
  }};};
  return {sqlite,env,client,get queries(){return queries;},close(){sqlite.close();}};
}
test('Original registration approval, role boundary, password change and logout work through the integrated router',async()=>{
  const f=fixture();try{
    const dev=f.client(),student=f.client();assert.equal((await dev.call('/api/login','POST',{login:'FixtureDev',password})).status,200);
    const registration=await student.call('/api/register','POST',{login:'FixtureStudent',email:'student@example.invalid',name:'Student',password});
    assert.equal(registration.status,200);assert.equal(registration.value.status,'pending');
    const row=f.sqlite.prepare('SELECT id FROM registrations').get();
    const visible=await dev.call('/api/admin/registrations');assert.equal(visible.status,200);assert.equal(visible.value.registrations[0].id,row.id);
    assert.equal(visible.value.registrations[0].password_hash,undefined);
    assert.equal((await dev.call('/api/admin/registrations/'+row.id+'/approve','POST',{})).status,200);
    const account=f.sqlite.prepare("SELECT id,role FROM users WHERE login='FixtureStudent'").get();assert.equal(account.role,'USER');
    assert.equal((await student.call('/api/login','POST',{login:'FixtureStudent',password})).status,200);
    assert.equal((await student.call('/api/admin/users')).status,403);
    assert.equal((await student.call('/api/me/account')).status,200);
    const oldCookie=student.cookie;
    assert.equal((await student.call('/api/me/password','POST',{current:password,password:'NewFixturePassword2'})).status,200);
    assert.equal((await student.call('/api/me','GET',null,oldCookie)).value.user,null);
    assert.equal((await student.call('/api/me')).value.user.id,account.id);
    const beforeLogout=student.cookie;assert.equal((await student.call('/api/logout','POST',{})).status,200);
    assert.equal((await student.call('/api/me','GET',null,beforeLogout)).value.user,null);
    assert.ok(f.queries<=50);
  }finally{f.close();}
});
test('Explicit TEST quota removal permits over 50 requests but retains live authentication and role denial',async()=>{
  const f=fixture();try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';
    f.env.AUTH_BUDGET={idFromName(){throw new Error('Disabled SQL quota must not be consulted');}};
    const dev=f.client();assert.equal((await dev.call('/api/login','POST',{login:'FixtureDev',password})).status,200);
    for(let i=0;i<51;i++)assert.equal((await dev.call('/api/admin/users')).status,200);
    f.sqlite.prepare("UPDATE users SET role='USER' WHERE id=?").run(devId);
    assert.equal((await dev.call('/api/admin/users')).status,403);
    assert.equal((await f.client().call('/api/admin/users')).status,401);
    assert.equal(f.queries,0);
  }finally{f.close();}
});
test('Developer deactivation and deletion stay account-scoped; no old educational SQL reads/writes',async()=>{
  const f=fixture();try{
    const dev=f.client(),student=f.client();await dev.call('/api/login','POST',{login:'FixtureDev',password});
    await student.call('/api/register','POST',{login:'FixtureStudent',email:'student@example.invalid',password});
    const row=f.sqlite.prepare('SELECT id FROM registrations').get();await dev.call('/api/admin/registrations/'+row.id+'/approve','POST',{});
    const account=f.sqlite.prepare("SELECT id FROM users WHERE login='FixtureStudent'").get();await student.call('/api/login','POST',{login:'FixtureStudent',password});
    assert.equal((await dev.call('/api/admin/users/'+account.id+'/active','POST',{active:false})).status,200);
    assert.ok((await dev.call('/api/admin/users')).value.users.some(row=>row.id===account.id),'Deactivated is not deleted');
    assert.equal((await student.call('/api/me')).value.user,null);
    assert.equal((await dev.call('/api/admin/users/'+account.id+'/active','POST',{active:true})).status,200);
    assert.equal((await dev.call('/api/admin/users/'+account.id,'DELETE')).status,200);
    assert.ok(!(await dev.call('/api/admin/users')).value.users.some(row=>row.id===account.id));
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM users WHERE id=?').get(account.id).n,0);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM users WHERE id=?').get(devId).n,1);assert.ok(f.queries<=50);
  }finally{f.close();}
});
test('Accounts uses live account rows rather than stale R2 without N+1 queries or directory mutation',async()=>{
  const f=fixture();try{
    const dev=f.client();await dev.call('/api/login','POST',{login:'FixtureDev',password});
    const directory=await(await f.env.MEDIA.get('directory/accounts.json')).json();
    directory.users.push({id:'b'.repeat(32),login:'Deleted',role:'USER',revoked:true},
      {id:'c'.repeat(32),login:'Inactive',role:'USER',active:false},
      {id:'d'.repeat(32),login:'Hidden',role:'USER',hidden:true},
      {id:'e'.repeat(32),login:'DeletedDirectly',role:'USER'});
    f.sqlite.prepare("INSERT INTO users(id,login,role,active,hidden) VALUES(?,'Inactive','USER',0,0)").run('c'.repeat(32));
    f.sqlite.prepare("INSERT INTO users(id,login,role,active,hidden) VALUES(?,'Hidden','USER',1,1)").run('d'.repeat(32));
    await f.env.MEDIA.put('directory/accounts.json',JSON.stringify(directory));
    const before=f.queries,result=await dev.call('/api/admin/users');assert.equal(result.status,200);
    assert.ok(!result.value.users.some(row=>row.revoked));
    assert.ok(!result.value.users.some(row=>row.login==='DeletedDirectly'));
    assert.ok(result.value.users.some(row=>row.login==='Inactive'));
    assert.ok(result.value.users.some(row=>row.login==='Hidden'));
    assert.equal(f.queries-before,2,'Authentication plus one bounded account list SELECT');
    assert.equal((await(await f.env.MEDIA.get('directory/accounts.json')).json()).users.length,directory.users.length);
  }finally{f.close();}
});
test('Account changes excludes deleted and orphaned owners against live D1 without history mutation',async()=>{
  const f=fixture();try{
    const dev=f.client();await dev.call('/api/login','POST',{login:'FixtureDev',password});
    const directory=await(await f.env.MEDIA.get('directory/accounts.json')).json();
    const deletedId='b'.repeat(32),inactiveId='c'.repeat(32);
    directory.users.push({id:deletedId,role:'USER'},{id:inactiveId,role:'USER',active:false});
    f.sqlite.prepare("INSERT INTO users(id,login,role,active) VALUES(?,'Inactive','USER',0)").run(inactiveId);
    directory.changes=[
      {id:'existing',user_id:devId,status:'approved'},
      {id:'inactive',user_id:inactiveId,status:'pending'},
      {id:'deleted',user_id:deletedId,status:'pending'},
      {id:'orphan',user_id:'e'.repeat(32),status:'approved'},
      {id:'unlinked',status:'pending'}
    ];
    await f.env.MEDIA.put('directory/accounts.json',JSON.stringify(directory));
    const before=f.queries,result=await dev.call('/api/admin/changes');
    assert.equal(result.status,200);
    assert.deepEqual(result.value.changes.map(row=>row.id),['existing','inactive']);
    assert.equal(f.queries-before,2,'Authentication plus one bounded account list SELECT');
    assert.deepEqual((await(await f.env.MEDIA.get('directory/accounts.json')).json()).changes,directory.changes);
  }finally{f.close();}
});
test('Registration history hides missing or revoked owners but retains pending new applicants',async()=>{
  const f=fixture();try{
    const dev=f.client();await dev.call('/api/login','POST',{login:'FixtureDev',password});
    f.sqlite.prepare("INSERT INTO users(id,login,role,is_personal_data_revoked) VALUES(?,'Revoked','USER',1)").run('b'.repeat(32));
    const insert=f.sqlite.prepare('INSERT INTO registrations(id,login,status,user_id,created_at) VALUES(?,?,?,?,?)');
    insert.run('live','Existing','approved',devId,4);
    insert.run('deleted','Deleted','approved','c'.repeat(32),3);
    insert.run('revoked','Revoked','approved','b'.repeat(32),2);
    insert.run('pending','NewApplicant','pending',null,1);
    const before=f.queries,result=await dev.call('/api/admin/registrations');
    assert.equal(result.status,200);assert.deepEqual(result.value.registrations.map(row=>row.id),['live','pending']);
    assert.equal(f.queries-before,2,'Existing auth and registration queries only');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM registrations').get().n,4,'History not physically deleted');
  }finally{f.close();}
});
