// Real account-handler code; ONLY synthetic in-memory D1/R2, never Cloudflare.
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync,createHash} from 'node:crypto';
import accounts from '../src/worker.js';
import {sessionForPasskey} from '../src/worker.js';
import {integratedWorker,accountMedia} from '../src/learning-integrated-worker.mjs';
import {signupUsername} from '../src/chat-profiles.mjs';
import {MicrosoftOAuth,verifyMicrosoftIdToken} from '../src/microsoft-oauth.mjs';
import {TelegramOAuth,verifyTelegramIdToken} from '../src/telegram-oauth.mjs';
import {D1StudyClient} from '../src/d1-study.mjs';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {AccountInvites} from '../src/account-invites.mjs';
const devId='a'.repeat(32),password='FixturePassword1';
test('Account directory CAS uses raw ETag without removing the precondition or touching other keys',async()=>{
  const calls=[],bucket={put:async(...args)=>{calls.push(args);return true;},get(){return this===bucket;}};
  const wrapped=accountMedia(bucket);
  await wrapped.put('directory/accounts.json','value',{onlyIf:{etagMatches:'"abc"'},httpMetadata:{contentType:'application/json'}});
  assert.equal(calls[0][2].onlyIf.etagMatches,'abc');assert.equal(calls[0][2].httpMetadata.contentType,'application/json');
  await wrapped.put('other.json','value',{onlyIf:{etagMatches:'"abc"'}});assert.equal(calls[1][2].onlyIf.etagMatches,'"abc"');
  await wrapped.put('directory/accounts.json','value',{onlyIf:{etagDoesNotMatch:'*'}});assert.equal(calls[2][2].onlyIf.etagDoesNotMatch,'*');assert.ok(wrapped.get());
});
function fixture(options={}){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,login TEXT UNIQUE,email TEXT UNIQUE,name TEXT DEFAULT '',password_salt TEXT,password_hash TEXT,password_iterations INTEGER,role TEXT DEFAULT 'USER',is_personal_data_revoked INTEGER DEFAULT 0,revoked_at INTEGER,hidden INTEGER DEFAULT 0,active INTEGER DEFAULT 1,created_at INTEGER);
    CREATE TABLE registrations(id TEXT PRIMARY KEY,login TEXT,email TEXT,name TEXT,password_salt TEXT,password_hash TEXT,password_iterations INTEGER,status TEXT,role TEXT DEFAULT 'USER',user_id TEXT,created_at INTEGER,decided_at INTEGER);
    CREATE TABLE account_changes(id TEXT PRIMARY KEY,user_id TEXT,login TEXT,email TEXT,name TEXT DEFAULT '',from_login TEXT,from_email TEXT,from_name TEXT,role TEXT DEFAULT 'USER',status TEXT,created_at INTEGER,decided_at INTEGER);
    CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key));`);
  const salt='1'.repeat(32),hash=pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex');
  sqlite.prepare("INSERT INTO users(id,login,email,name,password_salt,password_hash,password_iterations,role,created_at) VALUES(?,'FixtureDev','dev@example.invalid','Fixture',?,?,100000,'DEVELOPER',0)").run(devId,salt,hash);
  const DB={prepare(sql){const statement=args=>({bind:(...values)=>statement(values),first:async()=>sqlite.prepare(sql).get(...args)||null,
    all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>{
      const prepared=sqlite.prepare(sql);
      if(prepared.columns().length)return {success:true,results:prepared.all(...args),meta:{changes:0}};
      return {success:true,results:[],meta:{changes:Number(prepared.run(...args).changes)}};
    }});return statement([]);},
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
  env.STUDY_DB=DB;
  const worker=integratedWorker(options);
  const client=()=>{let cookie='';return {get cookie(){return cookie;},async call(path,method='GET',body=null,override=null){
    if(path==='/api/register'&&body&&!Object.hasOwn(body,'name'))body={...body,name:'Fixture Name'};
    const headers={Origin:'https://fixture.invalid',...(override!==null?{Cookie:override}:cookie?{Cookie:cookie}:{})};if(body)headers['Content-Type']='application/json';
    const response=await worker.fetch(new Request('https://fixture.invalid'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),env,{});
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,value:await response.json()};
  }};};
  return {sqlite,env,client,get queries(){return queries;},close(){sqlite.close();}};
}
test('Signup rejects spaces and non-Latin symbols and assigns @login after teacher approval',async()=>{
  const f=fixture();try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';f.env.CHAT_V2_ENABLED='true';
    const names=new Map(),store={get:key=>names.get(key),set:(key,value)=>names.set(key,value),ctx:{storage:{transactionSync:fn=>fn()}}};
    f.env.CHAT_BRIDGE={idFromName:id=>id,get:()=>({fetch:async request=>{try{return Response.json(signupUsername(store,await request.json()));}catch(error){return Response.json({error:error.message},{status:error.status||503});}}})};
    const guest=f.client();
    for(const login of ['has space','alex-smith','alex.smith','@alex',' alex'])assert.equal((await guest.call('/api/register','POST',{login,email:'invalid@example.invalid',password})).status,400);
    names.set('username-owner:@taken_name','another-user');
    assert.equal((await guest.call('/api/register','POST',{login:'taken_name',email:'taken@example.invalid',password})).status,409);
    const registered=await guest.call('/api/register','POST',{login:'123_Student',email:'new@example.invalid',password});assert.equal(registered.status,200);
    const reg=f.sqlite.prepare("SELECT id FROM registrations WHERE login='123_Student'").get();
    assert.equal(names.get('username-owner:@123_student'),'signup:'+reg.id);
    const dev=f.client();assert.equal((await dev.call('/api/login','POST',{login:'FixtureDev',password})).status,200);
    const approved=await dev.call('/api/admin/registrations/'+reg.id+'/approve','POST',{});assert.equal(approved.status,200);
    assert.equal(names.get('username:'+approved.value.userId),'@123_student');
    assert.equal(names.get('username-owner:@123_student'),approved.value.userId);
  }finally{f.close();}
});
test('student invite approves a real registration and assigns its group without a reviewer request',async()=>{
  const f=fixture({accountWorker:{async fetch(request,...args){
    if(new URL(request.url).pathname==='/api/login')return Response.json({signedIn:true});
    return accounts.fetch(request,...args);
  }}});
  try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';f.env.STAGE_WRITES='true';
    f.sqlite.exec("CREATE TABLE class_groups(id INTEGER PRIMARY KEY,title TEXT,deleted_at INTEGER,revision INTEGER DEFAULT 1,lesson_date TEXT DEFAULT '2026-10-20');INSERT INTO class_groups(id,title) VALUES(1,'A1');CREATE TABLE lessons(id INTEGER PRIMARY KEY,deleted_at INTEGER);CREATE TABLE class_group_setup(key TEXT PRIMARY KEY);INSERT INTO class_group_setup VALUES('levels-v1'),('level-names-v2')");
    const id='1'.repeat(16),secret='2'.repeat(48),now=Date.now();
    const invite={kind:'student',createdBy:devId,teacherId:devId,groupId:1,secretHash:createHash('sha256').update(secret).digest('hex'),createdAt:now,expiresAt:now+3*86400000,uses:0,revoked:false};
    f.sqlite.prepare('INSERT INTO catalog_documents VALUES(?,?,?)').run('account-invites',id,JSON.stringify(invite));
    f.sqlite.prepare('INSERT INTO catalog_documents VALUES(?,?,?)').run('accounts-group-teachers','1',JSON.stringify({revision:1,teacherIds:[devId]}));
    const response=await f.client().call('/api/register','POST',{login:'InvitedStudent',email:'invitedstudent@example.invalid',password,role:'ADMIN',invite:id+'.'+secret});
    assert.equal(response.status,200,JSON.stringify(response.value));assert.equal(response.value.signedIn,true);
    const registration=f.sqlite.prepare("SELECT * FROM registrations WHERE login='InvitedStudent'").get();
    assert.equal(registration.status,'approved');assert.equal(registration.role,'USER');
    assert.equal(f.sqlite.prepare('SELECT role FROM users WHERE id=?').get(registration.user_id).role,'USER');
    assert.equal(f.sqlite.prepare('SELECT group_id FROM class_group_students WHERE account_id=?').get(registration.user_id).group_id,1);
    const consumed=JSON.parse(f.sqlite.prepare("SELECT value_json FROM catalog_documents WHERE namespace='account-invites' AND key=?").get(id).value_json);
    assert.equal(consumed.uses,1);assert.ok(consumed.assignedAt);
    const ordinary=await f.client().call('/api/register','POST',{login:'OrdinaryStudent',email:'ordinary@example.invalid',password});
    assert.equal(ordinary.value.status,'pending');
  }finally{f.close();}
});
test('passkeys management requires a live session and its own email proof; login never creates accounts',async()=>{
  const f=fixture();try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';f.env.STAGE_WRITES='true';
    const guest=f.client(),dev=f.client();let sent;
    f.env.EMAIL={send:async mail=>{sent=mail;}};
    assert.equal((await guest.call('/api/me/passkeys')).status,401);
    f.env.STAGE_WRITES='false';
    assert.equal((await dev.call('/api/login','POST',{login:'FixtureDev',password})).status,200);
    f.env.STAGE_WRITES='true';
    const cookie=dev.cookie;
    assert.deepEqual((await dev.call('/api/me/passkeys')).value.passkeys,[]);
    assert.equal((await dev.call('/api/me/passkeys/options','POST',{emailCode:'123456'})).status,400);
    assert.equal((await dev.call('/api/me/passkeys/code','POST',{email:'attacker@example.invalid'})).status,200);
    assert.equal(sent.to,'dev@example.invalid');
    const emailCode=sent.text.match(/\b\d{6}\b/)[0];
    const wrongPurpose=await dev.call('/api/auth/otp/verify','POST',{email:'dev@example.invalid',code:emailCode});
    assert.equal(wrongPurpose.status,403);
    // Reissue the fixture code without the resend interval; no external email is sent.
    f.sqlite.prepare("DELETE FROM catalog_documents WHERE namespace='email-otp'").run();
    await dev.call('/api/me/passkeys/code','POST',{});
    const options=await dev.call('/api/me/passkeys/options','POST',{emailCode:sent.text.match(/\b\d{6}\b/)[0]});
    assert.equal(options.status,200,JSON.stringify(options.value));
    assert.equal(options.value.options.authenticatorSelection.userVerification,'required');
    assert.equal(options.value.options.authenticatorSelection.residentKey,'required');
    const request=new Request('https://fixture.invalid/api/auth/passkeys/verify',{headers:{Cookie:cookie}});
    const approved=await sessionForPasskey(f.env,request,devId,true);
    assert.equal(approved.status,200);assert.equal((await approved.json()).authMethod,'passkey');
    f.sqlite.prepare('UPDATE users SET active=0 WHERE id=?').run(devId);
    assert.equal((await sessionForPasskey(f.env,request,devId,true)).status,403);
    assert.equal((await sessionForPasskey(f.env,request,'unapproved-account',true)).status,403);
  }finally{f.close();}
});
test('Microsoft confirms email before linking, preserves pending approval and signs in by stable identity afterwards',async()=>{
  const f=fixture();let mockedFetch;
  try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';f.env.STAGE_WRITES='true';
    f.env.MICROSOFT_CLIENT_ID='11111111-1111-4111-8111-111111111111';f.env.MICROSOFT_CLIENT_SECRET='fixture-secret';
    f.sqlite.exec('DROP TABLE catalog_documents');applyLearningSchema(f.sqlite);
    const db=new D1StudyClient(f.env.STUDY_DB),service=new MicrosoftOAuth(db,'https://fixture.invalid');
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const tenant='9188040d-6c67-4c5b-b112-36a304b66dad',issuer='https://login.microsoftonline.com/'+tenant+'/v2.0';
    const key={...await exportJWK(publicKey),kid:'microsoft-fixture',issuer:'https://login.microsoftonline.com/{tenantid}/v2.0'};
    const sign=(nonce,email)=>new SignJWT({tid:tenant,ver:'2.0',nonce,email,name:'Microsoft Fixture'}).setProtectedHeader({alg:'RS256',kid:key.kid}).setSubject('fixture-ms-user').setIssuer(issuer).setAudience(f.env.MICROSOFT_CLIENT_ID).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const profile=await verifyMicrosoftIdToken(f.env,await sign('initial','dev@example.invalid'),'initial',{jwks:{keys:[key]}});
    const flow=await service.newFlow({kind:'email',profile,invite:''}),cookie='__Host-lumiscia-microsoft='+flow,guest=f.client();
    let sent;f.env.EMAIL={send:async mail=>{sent=mail;}};
    assert.equal((await guest.call('/api/auth/providers')).value.microsoft,true);
    assert.equal((await guest.call('/api/auth/microsoft/verify','POST',{email:'dev@example.invalid',code:'123456'},cookie)).status,400);
    assert.equal((await guest.call('/api/auth/microsoft/code','POST',{email:'msnew@example.invalid'},cookie)).status,200);
    assert.equal(sent.to,'msnew@example.invalid');
    const verified=await guest.call('/api/auth/microsoft/verify','POST',{email:'msnew@example.invalid',code:sent.text.match(/\b\d{6}\b/)[0]},cookie);
    assert.equal(verified.status,200,JSON.stringify(verified.value));assert.equal(verified.value.status,'pending');
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM users WHERE email='msnew@example.invalid'").get().n,0);
    const reg=f.sqlite.prepare("SELECT id FROM registrations WHERE email='msnew@example.invalid'").get();
    assert.equal((await service.identity(profile.subject)).registrationId,reg.id);
    f.env.STAGE_WRITES='false';const dev=f.client();await dev.call('/api/login','POST',{login:'FixtureDev',password});f.env.STAGE_WRITES='true';
    const approval=await dev.call('/api/admin/registrations/'+reg.id+'/approve','POST',{});assert.equal(approval.status,200);
    assert.equal((await service.identity(profile.subject)).accountId,approval.value.userId);
    const next=await service.start('','second-signin'),idToken=await sign(next.state.nonce,'dev@example.invalid');
    mockedFetch=mock.method(globalThis,'fetch',async input=>{
      const url=String(input);
      if(url.endsWith('/token'))return Response.json({id_token:idToken});
      if(url.endsWith('/keys'))return Response.json({keys:[key]});
      throw Error('Unexpected outbound request '+url);
    });
    const app=integratedWorker(),request=()=>new Request('https://fixture.invalid/api/auth/microsoft/callback?code=fixture&state='+next.token,{headers:{Cookie:'__Host-lumiscia-microsoft='+next.token}});
    const callback=await app.fetch(request(),f.env,{});
    assert.equal(callback.status,302);assert.equal(new URL(callback.headers.get('Location')).searchParams.get('auth'),'microsoft');
    const sessionCookie=callback.headers.get('Set-Cookie').split(';')[0];
    const me=await f.client().call('/api/me','GET',null,sessionCookie);
    assert.equal(me.value.user.id,approval.value.userId,'Changed Microsoft email must not sign into the developer account');
    const replay=await app.fetch(request(),f.env,{});
    assert.equal(new URL(replay.headers.get('Location')).searchParams.get('auth'),'microsoft_error');
    assert.ok(!replay.headers.get('Set-Cookie').includes('enquiz_sid='));
    for(const kind of ['student','teacher']){
      if(kind==='student')f.sqlite.prepare("INSERT INTO class_groups(id,title,lesson_date) VALUES(1,'A1','2026-10-20')").run();
      f.sqlite.prepare('INSERT OR REPLACE INTO catalog_documents VALUES(?,?,?)').run('accounts-group-teachers','1',JSON.stringify({revision:1,teacherIds:[devId]}));
      const email=kind+'-ms@example.invalid',inviter={id:devId,role:'DEVELOPER'};
      const invite=await new AccountInvites(db).create(inviter,{groupId:1,kind,teacherId:devId,email},[inviter]);
      const token=await service.newFlow({kind:'email',profile:{...profile,subject:profile.subject+'-'+kind},invite:invite.token});
      const headers='__Host-lumiscia-microsoft='+token;
      await guest.call('/api/auth/microsoft/code','POST',{email},headers);
      const result=await guest.call('/api/auth/microsoft/verify','POST',{email,code:sent.text.match(/\b\d{6}\b/)[0]},headers);
      assert.equal(result.status,200,JSON.stringify(result.value));
      const registration=f.sqlite.prepare('SELECT status,user_id,role FROM registrations WHERE email=?').get(email);
      assert.equal(registration.status,kind==='student'?'approved':'pending');
      assert.equal(registration.role,kind==='student'?'USER':'ADMIN');
      if(kind==='student')assert.equal(f.sqlite.prepare('SELECT group_id FROM class_group_students WHERE account_id=?').get(registration.user_id).group_id,1);
    }
  }finally{mockedFetch?.mock.restore();f.close();}
});
test('Telegram confirms email before linking, preserves pending approval and signs in by stable identity afterwards',async()=>{
  const f=fixture();let mockedFetch;
  try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';f.env.STAGE_WRITES='true';
    f.env.TELEGRAM_CLIENT_ID='123456789';f.env.TELEGRAM_CLIENT_SECRET='fixture-secret';
    f.sqlite.exec('DROP TABLE catalog_documents');applyLearningSchema(f.sqlite);
    const db=new D1StudyClient(f.env.STUDY_DB),service=new TelegramOAuth(db,'https://fixture.invalid');
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const issuer='https://oauth.telegram.org';
    const key={...await exportJWK(publicKey),kid:'telegram-fixture'};
    const sign=(nonce,email)=>new SignJWT({nonce,email,name:'Telegram Fixture'}).setProtectedHeader({alg:'RS256',kid:key.kid}).setSubject('fixture-telegram-user').setIssuer(issuer).setAudience(f.env.TELEGRAM_CLIENT_ID).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const profile=await verifyTelegramIdToken(f.env,await sign('initial','dev@example.invalid'),'initial',{keySet:createLocalJWKSet({keys:[key]})});
    const flow=await service.newFlow({kind:'email',profile,invite:''}),cookie='__Host-lumiscia-telegram='+flow,guest=f.client();
    let sent;f.env.EMAIL={send:async mail=>{sent=mail;}};
    assert.equal((await guest.call('/api/auth/providers')).value.telegram,true);
    assert.equal((await guest.call('/api/auth/telegram/verify','POST',{email:'dev@example.invalid',code:'123456'},cookie)).status,400);
    assert.equal((await guest.call('/api/auth/telegram/code','POST',{email:'tgnew@example.invalid'},cookie)).status,200);
    assert.equal(sent.to,'tgnew@example.invalid');
    const verified=await guest.call('/api/auth/telegram/verify','POST',{email:'tgnew@example.invalid',code:sent.text.match(/\b\d{6}\b/)[0]},cookie);
    assert.equal(verified.status,200,JSON.stringify(verified.value));assert.equal(verified.value.status,'pending');
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM users WHERE email='tgnew@example.invalid'").get().n,0);
    const reg=f.sqlite.prepare("SELECT id FROM registrations WHERE email='tgnew@example.invalid'").get();
    assert.equal((await service.identity(profile.subject)).registrationId,reg.id);
    f.env.STAGE_WRITES='false';const dev=f.client();await dev.call('/api/login','POST',{login:'FixtureDev',password});f.env.STAGE_WRITES='true';
    const approval=await dev.call('/api/admin/registrations/'+reg.id+'/approve','POST',{});assert.equal(approval.status,200);
    assert.equal((await service.identity(profile.subject)).accountId,approval.value.userId);
    const next=await service.start('','second-signin'),idToken=await sign(next.state.nonce,'dev@example.invalid');
    mockedFetch=mock.method(globalThis,'fetch',async input=>{
      const url=String(input);
      if(url.endsWith('/token'))return Response.json({id_token:idToken});
      if(url.endsWith('/.well-known/jwks.json'))return Response.json({keys:[key]});
      throw Error('Unexpected outbound request '+url);
    });
    const app=integratedWorker(),request=()=>new Request('https://fixture.invalid/api/auth/telegram/callback?code=fixture&state='+next.token,{headers:{Cookie:'__Host-lumiscia-telegram='+next.token}});
    const callback=await app.fetch(request(),f.env,{});
    assert.equal(callback.status,302);assert.equal(new URL(callback.headers.get('Location')).searchParams.get('auth'),'telegram');
    const sessionCookie=callback.headers.get('Set-Cookie').split(';')[0];
    const me=await f.client().call('/api/me','GET',null,sessionCookie);
    assert.equal(me.value.user.id,approval.value.userId,'Changed Telegram email must not sign into the developer account');
    const replay=await app.fetch(request(),f.env,{});
    assert.equal(new URL(replay.headers.get('Location')).searchParams.get('auth'),'telegram_error');
    assert.ok(!replay.headers.get('Set-Cookie').includes('enquiz_sid='));
    for(const kind of ['student','teacher']){
      if(kind==='student')f.sqlite.prepare("INSERT INTO class_groups(id,title,lesson_date) VALUES(1,'A1','2026-10-20')").run();
      f.sqlite.prepare('INSERT OR REPLACE INTO catalog_documents VALUES(?,?,?)').run('accounts-group-teachers','1',JSON.stringify({revision:1,teacherIds:[devId]}));
      const email=kind+'-ms@example.invalid',inviter={id:devId,role:'DEVELOPER'};
      const invite=await new AccountInvites(db).create(inviter,{groupId:1,kind,teacherId:devId,email},[inviter]);
      const token=await service.newFlow({kind:'email',profile:{...profile,subject:profile.subject+'-'+kind},invite:invite.token});
      const headers='__Host-lumiscia-telegram='+token;
      await guest.call('/api/auth/telegram/code','POST',{email},headers);
      const result=await guest.call('/api/auth/telegram/verify','POST',{email,code:sent.text.match(/\b\d{6}\b/)[0]},headers);
      assert.equal(result.status,200,JSON.stringify(result.value));
      const registration=f.sqlite.prepare('SELECT status,user_id,role FROM registrations WHERE email=?').get(email);
      assert.equal(registration.status,kind==='student'?'approved':'pending');
      assert.equal(registration.role,kind==='student'?'USER':'ADMIN');
      if(kind==='student')assert.equal(f.sqlite.prepare('SELECT group_id FROM class_group_students WHERE account_id=?').get(registration.user_id).group_id,1);
    }
  }finally{mockedFetch?.mock.restore();f.close();}
});
test('Signup ignores a requested teacher role and only a developer can assign it at approval',async()=>{
  const f=fixture();try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';const applicant=f.client(),dev=f.client();
    const registration=await applicant.call('/api/register','POST',{login:'New_Teacher',email:'teacher@example.invalid',password,role:'ADMIN'});assert.equal(registration.status,200);
    const reg=f.sqlite.prepare("SELECT id,role FROM registrations WHERE login='New_Teacher'").get();assert.equal(reg.role,'USER');
    const pending=await applicant.call('/api/login','POST',{login:'New_Teacher',password});assert.equal(pending.status,403);assert.equal(pending.value.error,'Your account is awaiting approval.');
    const wrong=await applicant.call('/api/login','POST',{login:'teacher@example.invalid',password:'wrong'});assert.equal(wrong.status,401);assert.equal(wrong.value.error,'Wrong login or password.');
    assert.equal((await dev.call('/api/login','POST',{login:'FixtureDev',password})).status,200);
    const approved=await dev.call('/api/admin/registrations/'+reg.id+'/approve','POST',{role:'ADMIN'});assert.equal(approved.status,200);assert.equal(approved.value.role,'ADMIN');
    assert.equal(f.sqlite.prepare('SELECT role FROM users WHERE id=?').get(approved.value.userId).role,'ADMIN');
    const teacher=f.client();assert.equal((await teacher.call('/api/login','POST',{login:'New_Teacher',password})).status,200);
    const next=await applicant.call('/api/register','POST',{login:'Another_Teacher',email:'another_teacher@example.invalid',password,role:'ADMIN'});assert.equal(next.status,200);
    const nextId=f.sqlite.prepare("SELECT id FROM registrations WHERE login='Another_Teacher'").get().id;
    assert.equal((await teacher.call('/api/admin/registrations/'+nextId+'/approve','POST',{role:'ADMIN'})).status,403);
    assert.equal(f.sqlite.prepare('SELECT status FROM registrations WHERE id=?').get(nextId).status,'pending');
  }finally{f.close();}
});
test('Registration requires a nonblank name on the real server',async()=>{
  const f=fixture();try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';const guest=f.client();
    for(const name of [undefined,'','   ',{},123]){
      const response=await guest.call('/api/register','POST',{login:'RequiredName',email:'name@example.invalid',password,name});
      assert.equal(response.status,400);assert.match(response.value.error,/name/i);
    }
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM registrations').get().n,0);
  }finally{f.close();}
});
test('only the verified-invite sender or a developer can approve an invited teacher',async()=>{
  const f=fixture();try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';
    const inviterId='b'.repeat(32),otherId='c'.repeat(32);
    for(const [id,login,email] of [[inviterId,'Inviter','inviter@example.invalid'],[otherId,'OtherTeacher','other@example.invalid']]){
      f.sqlite.prepare("INSERT INTO users(id,login,email,name,password_salt,password_hash,password_iterations,role,created_at) SELECT ?,?,?,?,password_salt,password_hash,password_iterations,'ADMIN',0 FROM users WHERE id=?").run(id,login,email,login,devId);
    }
    f.sqlite.exec("CREATE TABLE class_groups(id INTEGER PRIMARY KEY,title TEXT,deleted_at INTEGER,revision INTEGER);INSERT INTO class_groups VALUES(1,'A1',NULL,1)");
    const inviter=f.client(),other=f.client(),applicant=f.client();
    assert.equal((await inviter.call('/api/login','POST',{login:'Inviter',password})).status,200);
    assert.equal((await other.call('/api/login','POST',{login:'OtherTeacher',password})).status,200);
    assert.equal((await applicant.call('/api/register','POST',{login:'InvitedTeacher',email:'invited@example.invalid',password,role:'ADMIN'})).status,200);
    const reg=f.sqlite.prepare("SELECT id FROM registrations WHERE login='InvitedTeacher'").get();
    // Model the role written by the verified teacher-invitation registration path.
    f.sqlite.prepare("UPDATE registrations SET role='ADMIN' WHERE id=?").run(reg.id);
    const invite={kind:'teacher',createdBy:inviterId,groupId:1,email:'invited@example.invalid',registrationEmail:'invited@example.invalid',pendingRegistrationId:reg.id,uses:1,acceptedAt:Date.now(),revoked:false};
    f.sqlite.prepare('INSERT INTO catalog_documents VALUES(?,?,?)').run('account-invites','accepted-fixture',JSON.stringify(invite));
    f.sqlite.prepare('INSERT INTO catalog_documents VALUES(?,?,?)').run('accounts-group-teachers','1',JSON.stringify({revision:1,teacherIds:[inviterId]}));
    const own=await inviter.call('/api/admin/registrations');
    assert.equal(own.value.registrations.find(row=>row.id===reg.id).inviteCanApprove,true);
    assert.equal((await other.call('/api/admin/registrations')).value.registrations.find(row=>row.id===reg.id).inviteCanApprove,false);
    f.env.STAGE_WRITES='true';
    assert.equal((await other.call('/api/admin/registrations/'+reg.id+'/approve','POST',{invitation:invite})).status,403);
    assert.equal(f.sqlite.prepare('SELECT status FROM registrations WHERE id=?').get(reg.id).status,'pending');
    const approved=await inviter.call('/api/admin/registrations/'+reg.id+'/approve','POST',{});
    assert.equal(approved.status,200,JSON.stringify(approved.value));assert.equal(approved.value.groupWarning,undefined);
    assert.equal(f.sqlite.prepare('SELECT role FROM users WHERE id=?').get(approved.value.userId).role,'ADMIN');
    const group=JSON.parse(f.sqlite.prepare("SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers' AND key='1'").get().value_json);
    assert.ok(group.teacherIds.includes(inviterId)&&group.teacherIds.includes(approved.value.userId));
  }finally{f.close();}
});

test('Registration is not blocked by failed logins and retains its separate flood limit',async()=>{
  const f=fixture();try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';
    const user=f.client();
    for(let i=0;i<8;i++)await user.call('/api/login','POST',{login:'Missing',password:'wrong'});
    assert.equal((await user.call('/api/login','POST',{login:'FixtureDev',password})).status,429);
    assert.equal((await user.call('/api/register','POST',{login:'FreshStudent',email:'fresh@example.invalid',password})).status,200);
    for(let i=0;i<8;i++)await user.call('/api/register','POST',{login:'FreshStudent',email:'fresh@example.invalid',password});
    assert.equal((await user.call('/api/register','POST',{login:'AnotherStudent',email:'another@example.invalid',password})).status,429);
  }finally{f.close();}
});
test('Login failures expire, keep a fixed window and use raw R2 ETags',async()=>{
  const f=fixture();try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';
    const user=f.client(),key='login-fail/unknown',start=Math.floor(Date.now()/1000)-901;
    await f.env.MEDIA.put(key,JSON.stringify({count:7,until:0,start}));
    const put=f.env.MEDIA.put;
    f.env.MEDIA.put=async(path,text,options)=>{
      if(path===key&&options?.onlyIf?.etagMatches)assert.ok(!options.onlyIf.etagMatches.includes('"'));
      return put(path,text,options);
    };
    assert.equal((await user.call('/api/login','POST',{login:'Missing',password:'wrong'})).status,401);
    const first=await (await f.env.MEDIA.get(key)).json();
    assert.equal(first.count,1);assert.equal(first.until,0);assert.ok(first.start>start);
    assert.equal((await user.call('/api/login','POST',{login:'Missing',password:'wrong'})).status,401);
    const second=await (await f.env.MEDIA.get(key)).json();assert.equal(second.start,first.start);
    assert.equal((await user.call('/api/login','POST',{login:'FixtureDev',password})).status,200);
    assert.equal(await f.env.MEDIA.get(key),undefined);
  }finally{f.close();}
});
test('Auth storage failures are unavailable, not false attempt lockouts',async()=>{
  const f=fixture();try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';
    const user=f.client(),get=f.env.MEDIA.get;
    f.env.MEDIA.get=async key=>{if(key.endsWith('-fail/unknown'))throw new Error('Fixture unavailable');return get(key);};
    for(const path of ['/api/login','/api/register']){
      const result=await user.call(path,'POST',{login:'FixtureDev',password});
      assert.equal(result.status,503);assert.match(result.value.error,/temporarily unavailable/);
    }
    f.env.MEDIA.get=get;f.env.MEDIA.put=async()=>null;
    const failedWrite=await user.call('/api/login','POST',{login:'Missing',password:'wrong'});
    assert.equal(failedWrite.status,503);assert.match(failedWrite.value.error,/temporarily unavailable/);
  }finally{f.close();}
});
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
test('Developer deletion requires Archive and removes its record after complete cleanup',async()=>{
  const f=fixture();try{
    f.env.ACCOUNT_QUERY_LIMIT_ENABLED='false';
    const dev=f.client(),student=f.client();await dev.call('/api/login','POST',{login:'FixtureDev',password});
    await student.call('/api/register','POST',{login:'FixtureStudent',email:'student@example.invalid',password});
    const row=f.sqlite.prepare('SELECT id FROM registrations').get();await dev.call('/api/admin/registrations/'+row.id+'/approve','POST',{});
    const account=f.sqlite.prepare("SELECT id FROM users WHERE login='FixtureStudent'").get();await student.call('/api/login','POST',{login:'FixtureStudent',password});
    assert.equal((await dev.call('/api/admin/users/'+account.id+'/active','POST',{active:false})).status,200);
    assert.ok((await dev.call('/api/admin/users')).value.users.some(row=>row.id===account.id),'Deactivated is not deleted');
    assert.equal((await student.call('/api/me')).value.user,null);
    assert.equal((await dev.call('/api/admin/users/'+account.id+'/active','POST',{active:true})).status,200);
    assert.equal((await dev.call('/api/admin/users/'+account.id,'DELETE')).status,503,'Study writes must be enabled for full cleanup');
    f.env.STAGE_WRITES='true';
    assert.equal((await dev.call('/api/admin/users/'+account.id,'DELETE')).status,404,'Unarchived accounts cannot be deleted');
    assert.equal((await dev.call('/api/archive','POST',{action:'archive',type:'account',id:account.id})).status,200);
    assert.equal((await dev.call('/api/admin/users/'+account.id+'/active','POST',{active:true})).status,409,'Archive cannot be bypassed through Activate');
    assert.equal((await dev.call('/api/admin/users/'+account.id,'DELETE')).status,200);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM account_archives').get().n,0);
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
test('Unused pair login Tsovak can be restored as a student; rename onto the pair stays reserved',async()=>{
  const f=fixture();try{
    const dev=f.client(),student=f.client();
    assert.equal((await dev.call('/api/login','POST',{login:'FixtureDev',password})).status,200);
    const registration=await student.call('/api/register','POST',{login:'Tsovak',email:'tsovak@example.invalid',name:'Student',password});
    assert.equal(registration.status,200);assert.equal(registration.value.status,'pending');
    const row=f.sqlite.prepare("SELECT id FROM registrations WHERE login='Tsovak'").get();
    assert.equal((await dev.call('/api/admin/registrations/'+row.id+'/approve','POST',{})).status,200);
    const account=f.sqlite.prepare("SELECT id,role FROM users WHERE login='Tsovak'").get();
    assert.equal(account.role,'USER');
    assert.equal((await student.call('/api/login','POST',{login:'Tsovak',password})).status,200);
    assert.equal((await student.call('/api/admin/users')).status,403);
    const taken=await f.client().call('/api/register','POST',{login:'Tsovak',email:'other@example.invalid',name:'Other',password});
    assert.equal(taken.status,409);
    const other=await f.client().call('/api/register','POST',{login:'OtherStudent',email:'other@example.invalid',name:'Other',password});
    assert.equal(other.status,200);
    const otherId=f.sqlite.prepare("SELECT id FROM registrations WHERE login='OtherStudent'").get().id;
    assert.equal((await dev.call('/api/admin/registrations/'+otherId+'/approve','POST',{})).status,200);
    const userId=f.sqlite.prepare("SELECT id FROM users WHERE login='OtherStudent'").get().id;
    const renamed=await dev.call('/api/admin/users/'+userId+'/profile','POST',{login:'TsovakDev',email:'other@example.invalid',name:'Other'});
    assert.equal(renamed.status,403);assert.equal(renamed.value.error,'That login is reserved.');
  }finally{f.close();}
});
