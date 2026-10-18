import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync,randomBytes,createHmac} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {neonFoundation} from '../src/neon-foundation.mjs';
import {accountQuery,neonAccountDatabase,neonAccountMedia} from '../src/neon-account-database.mjs';
import accounts,{currentUser,sessionIdentity} from '../src/worker.js';

let pg,db;
function pgDriver(engine){
  const run=async(engine,text,args)=>{const value=await engine.query(text,args);return {rows:value.rows,fields:value.fields,command:text.trim().split(/\s/)[0].toUpperCase(),rowCount:value.affectedRows||0};};
  return {query(text,args){return {text,args,then(resolve,reject){return run(engine,text,args).then(resolve,reject);}};},
    async transaction(queries,options){assert.equal(options.fullResults,true);return engine.transaction(async tx=>{const values=[];for(const {text,args} of queries)values.push(await run(tx,text,args));return values;});}};
}
function bucket(){
  const objects=new Map();let revision=0;
  return {objects,async get(key){const object=objects.get(key);return object?{...object,text:async()=>object.body,json:async()=>JSON.parse(object.body)}:null;},
    async head(key){return this.get(key);},async delete(key){for(const name of Array.isArray(key)?key:[key])objects.delete(name);},
    async put(key,body,options){const previous=objects.get(key),condition=options?.onlyIf;
      if(condition?.etagMatches&&previous?.etag!==condition.etagMatches||condition?.etagDoesNotMatch==='*'&&previous)return null;
      const value={key,body,etag:String(++revision),httpEtag:'"'+revision+'"'};objects.set(key,value);return value;},
    async list({prefix=''}){return {objects:[...objects.values()].filter(object=>object.key.startsWith(prefix))};}};
}
const password='Fixture-password-123';
async function insert(login,role='USER'){
  const salt=randomBytes(16).toString('hex'),hash=pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex'),id=randomBytes(16).toString('hex');
  await db.prepare('INSERT INTO users(id,login,email,name,password_salt,password_hash,password_iterations,role,is_personal_data_revoked,created_at) VALUES(?,?,?,?,?,?,?,?,0,?)').bind(id,login,login+'@example.test',login,salt,hash,100000,role,1700000000).run();
  return {id,login,hash};
}
function environment(){return {DB:db,MEDIA:neonAccountMedia(bucket()),AUTH_DATABASE_PROVIDER:'neon',SESSION_SECRET:'fixture-session-secret'};}
function call(env,path,body,cookie){return accounts.fetch(new Request('https://app.example'+path,{method:body?'POST':'GET',headers:{Origin:'https://app.example',...(cookie?{Cookie:cookie}:{}),'CF-Connecting-IP':'127.0.0.1'},...(body?{body:JSON.stringify(body)}:{})}),env,{});}
const cookie=response=>response.headers.get('Set-Cookie')?.split(';')[0];
test('renewed cookies keep one session identity and remote revocation invalidates its whole lineage',async()=>{
  const user=await insert('session_identity'),env=environment();
  const first=cookie(await call(env,'/api/login',{login:user.login,password}));
  const second=cookie(await call(env,'/api/login',{login:user.login,password}));
  const identity=value=>sessionIdentity(env,new Request('https://app.example',{headers:{Cookie:value}}));
  const a=await identity(first),b=await identity(second);assert.notEqual(a.sid,b.sid);
  const renewed=cookie(await call(env,'/api/me/activity',{},first)),c=await identity(renewed);assert.equal(c.sid,a.sid);assert.equal(c.sortAt,a.sortAt);
  await env.MEDIA.put('revoked-sid/'+a.sid,'{}');
  for(const value of [first,renewed])assert.equal(await currentUser(env,new Request('https://app.example',{headers:{Cookie:value}})),null);
  assert.ok(await currentUser(env,new Request('https://app.example',{headers:{Cookie:second}})));
});
before(async()=>{pg=new PGlite();for(const query of neonFoundation)await pg.exec(query);db=neonAccountDatabase({}, {sql:pgDriver(pg)});});
after(async()=>{await pg?.close();});

test('real PostgreSQL schema and auth views are idempotent without changing data',async()=>{
  for(const query of neonFoundation)await pg.exec(query);
  const user=await insert('native_types');
  const row=await db.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
  assert.equal(row.active,1);assert.equal(row.is_personal_data_revoked,0);assert.equal(row.created_at,1700000000);
  const native=(await pg.query('SELECT active,created_at FROM english_app.users WHERE id=$1',[user.id])).rows[0];assert.equal(native.active,true);assert.ok(native.created_at instanceof Date);
  assert.equal((await pg.query('SELECT id FROM english_app.account_refs WHERE id=$1',[user.id])).rows.length,1);
});
test('login, live identity, idle expiry, cross-provider rejection and logout',async()=>{
  const user=await insert('auth_developer','DEVELOPER'),env=environment();
  assert.equal((await call(env,'/api/login',{login:user.login,password:'wrong'})).status,401);
  const signed=await call(env,'/api/login',{login:user.login,password});assert.equal(signed.status,200);const session=cookie(signed);assert.ok(session);
  let live=await currentUser(env,new Request('https://app.example',{headers:{Cookie:session}}));assert.equal(live.id,user.id);assert.equal(live.role,'DEVELOPER');
  assert.equal(await currentUser({...env,AUTH_DATABASE_PROVIDER:'d1'},new Request('https://app.example',{headers:{Cookie:session}})),null);
  assert.equal(await currentUser({...env,DATABASE_SELECTION:{revision:1}},new Request('https://app.example',{headers:{Cookie:session}})),null);
  const raw=session.split('=')[1],payload=JSON.parse(Buffer.from(raw.split('.')[0],'base64url'));assert.equal(payload.database,'neon');assert.ok(payload.exp<=Date.now()/1000+10800);
  payload.exp=Math.floor(Date.now()/1000)-1;const body=Buffer.from(JSON.stringify(payload)).toString('base64url'),expired=body+'.'+createHmac('sha256',env.SESSION_SECRET).update(body).digest('base64url');
  assert.equal(await currentUser(env,new Request('https://app.example',{headers:{Cookie:'enquiz_sid='+expired}})),null);
  assert.equal((await call(env,'/api/logout',{},session)).status,200);
  assert.equal(await currentUser(env,new Request('https://app.example',{headers:{Cookie:session}})),null);
});
test('deactivation, role changes and password updates immediately affect existing sessions',async()=>{
  const user=await insert('mutable_account'),env=environment();
  const session=cookie(await call(env,'/api/login',{login:user.login,password}));
  await db.prepare('UPDATE users SET role=? WHERE id=?').bind('ADMIN',user.id).run();
  assert.equal((await currentUser(env,new Request('https://app.example',{headers:{Cookie:session}}))).role,'ADMIN');
  await db.prepare('UPDATE users SET active=? WHERE id=?').bind(0,user.id).run();
  assert.equal(await currentUser(env,new Request('https://app.example',{headers:{Cookie:session}})),null);
  await db.prepare('UPDATE users SET active=? WHERE id=?').bind(1,user.id).run();
  const changed=await call(env,'/api/me/password',{current:password,password:'New-fixture-password'},session);assert.equal(changed.status,200);
  assert.equal(await currentUser(env,new Request('https://app.example',{headers:{Cookie:session}})),null);
  assert.ok(await currentUser(env,new Request('https://app.example',{headers:{Cookie:cookie(changed)}})));
});
test('registration preserves requested teacher role and pending login needs the right password',async()=>{
  const developer=await insert('registration_developer','DEVELOPER');const env=environment();
  const adminCookie=cookie(await call(env,'/api/login',{login:developer.login,password}));
  const response=await call(env,'/api/register',{login:'pending_teacher',email:'pending_teacher@example.test',name:'Teacher',password,role:'ADMIN'});
  assert.equal(response.status,200,await response.clone().text());
  const pending=await db.prepare("SELECT * FROM registrations WHERE login=? AND status='pending'").bind('pending_teacher').first();assert.equal(pending.role,'ADMIN');assert.equal(pending.user_id,null);
  const wait=await call(env,'/api/login',{login:'pending_teacher',password});assert.equal(wait.status,403);assert.match((await wait.json()).error,/awaiting approval/);
  assert.equal((await call(env,'/api/login',{login:'pending_teacher',password:'wrong'})).status,401);
  const approved=await call(env,'/api/admin/registrations/'+pending.id+'/approve',{},adminCookie);assert.equal(approved.status,200,await approved.clone().text());
  assert.equal((await approved.json()).role,'ADMIN');
  const teacher=await call(env,'/api/login',{login:'pending_teacher',password});assert.equal(teacher.status,200);
  assert.equal((await teacher.json()).user.role,'ADMIN');
  const list=await call(env,'/api/admin/users',null,adminCookie);assert.equal(list.status,200);
});
test('batch is atomic, duplicate identities are rejected, and D1 result shapes are preserved',async()=>{
  const user=await insert('batch_user');
  await assert.rejects(db.batch([
    db.prepare('UPDATE users SET name=? WHERE id=?').bind('Should roll back',user.id),
    db.prepare('INSERT INTO users(id,login,email,password_salt,password_hash,password_iterations) VALUES(?,?,?,?,?,?)').bind('conflict','batch_user','other@example.test','salt','hash',100000)
  ]),error=>error.status===409);
  assert.equal((await db.prepare('SELECT name FROM users WHERE id=?').bind(user.id).first()).name,'batch_user');
  const result=await db.prepare('UPDATE users SET hidden=? WHERE id=?').bind(1,user.id).run();assert.equal(result.success,true);assert.equal(result.meta.changes,1);
  assert.deepEqual(await db.prepare('SELECT login FROM users WHERE id=?').bind(user.id).raw({columnNames:true}),[['login'],['batch_user']]);
  assert.throws(()=>db.prepare('SELECT * FROM users WHERE id=?').bind({id:user.id}));
});
test('account changes use native timestamps and existing runtime schema checks',async()=>{
  const user=await insert('changes_user');
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS account_changes_user_pending ON account_changes(user_id) WHERE status = 'pending'").run();
  await db.prepare("INSERT INTO account_changes(id,user_id,login,email,name,from_login,from_email,from_name,role,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,'pending',?)").bind('change-one',user.id,'changed','changed@example.test','Changed',user.login,user.login+'@example.test',user.login,'USER',1700000000).run();
  await db.prepare("UPDATE account_changes SET status='rejected',decided_at=? WHERE id=? AND status='pending'").bind(1700000100,'change-one').run();
  assert.equal((await db.prepare('SELECT decided_at FROM account_changes WHERE id=?').bind('change-one').first()).decided_at,1700000100);
});
test('account revocation and deletion do not depend on legacy educational tables',async()=>{
  const user=await insert('deleted_user');
  await db.prepare('DELETE FROM user_state WHERE user_id=?').bind(user.id).run();
  await db.prepare('DELETE FROM user_added WHERE user_id=?').bind(user.id).run();
  await db.prepare('DELETE FROM user_card_gone WHERE user_id=?').bind(user.id).run();
  await db.prepare('UPDATE users SET is_personal_data_revoked=1,revoked_at=? WHERE id=?').bind(1700000100,user.id).run();
  assert.equal((await db.prepare('SELECT revoked_at FROM users WHERE id=?').bind(user.id).first()).revoked_at,1700000100);
  await db.prepare('DELETE FROM users WHERE id=?').bind(user.id).run();
  assert.equal(await db.prepare('SELECT id FROM users WHERE id=?').bind(user.id).first(),null);
});
test('query translation binds values and rejects access to all non-account objects',()=>{
  assert.equal(accountQuery("SELECT * FROM users WHERE name='what? FROM secret' AND id=?").count,1);
  for(const query of ['SELECT * FROM cards','SELECT * FROM users; DELETE FROM users','SELECT * FROM users -- comment','SELECT pg_sleep(10) FROM users','SELECT * FROM users, sessions','SELECT * FROM english_app.users','SELECT * FROM users UNION SELECT * FROM cards','DROP TABLE users','UPDATE users SET active=1 RETURNING id'])assert.throws(()=>accountQuery(query),query);
});
test('provider-specific R2 objects cannot modify or read the original account directory',async()=>{
  const storage=bucket();await storage.put('directory/accounts.json','original');const media=neonAccountMedia(storage);
  assert.equal(await media.get('directory/accounts.json'),null);await media.put('directory/accounts.json','neon');
  assert.equal(await (await storage.get('directory/accounts.json')).text(),'original');
  const current=await media.get('directory/accounts.json');assert.ok(await media.put('directory/accounts.json','updated',{onlyIf:{etagMatches:current.httpEtag}}));
  assert.deepEqual((await media.list({prefix:'directory/'})).objects.map(object=>object.key),['directory/accounts.json']);
  await media.delete('directory/accounts.json');assert.ok(await storage.get('directory/accounts.json'));
});
