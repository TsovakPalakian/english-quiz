import test from 'node:test';
import assert from 'node:assert/strict';
import {currentUser,signSession} from '../src/worker.js';

const prefix='0123456789abcdef01234567';
const hash=prefix+'aaaa';
const other=prefix+'bbbb';
const user={id:7,login:'ada',email:'ada@example.test',name:'Ada',role:'USER',password_hash:hash,created_at:1};

function database(row){
  return {prepare(){return {bind(){return {first:async()=>row}}}}};
}
function env(row){
  return {SESSION_SECRET:'session-password-version',MEDIA:{head:async()=>null},DB:database(row)};
}
function request(token){return new Request('https://example.test/',{headers:{Cookie:'enquiz_sid='+token}});}
function payload(token){
  const body=token.slice(0,token.indexOf('.'));
  const clean=body.replace(/-/g,'+').replace(/_/g,'/');
  const pad=clean.length%4===0?'':'='.repeat(4-clean.length%4);
  return JSON.parse(Buffer.from(clean+pad,'base64').toString());
}

test('a session cookie matches the full password hash',async()=>{
  const token=await signSession(env(user),user);
  const body=payload(token);
  assert.deepEqual(Object.keys(body).sort(),['createdAt','database','databaseRevision','email','exp','id','idleSession','legacySession','login','name','pwdv','role','sessionCreatedAt','sid']);
  assert.equal(body.pwdv,hash);
  assert.equal((await currentUser(env({...user,password_hash:hash}),request(token))).login,'ada');
  assert.equal(await currentUser(env({...user,password_hash:other}),request(token)),null);
  assert.equal((await currentUser(env({...user,password_hash:hash,active:1}),request(token))).login,'ada');
  assert.equal(await currentUser(env({...user,password_hash:hash,active:0}),request(token)),null);
  assert.equal(await currentUser(env({...user,password_hash:hash,is_personal_data_revoked:1}),request(token)),null);
});
test('a session ends when the active column is missing',async()=>{
  const token=await signSession(env(user),user);
  let queries=0;
  const missing={SESSION_SECRET:'session-password-version',MEDIA:{head:async()=>null},DB:{prepare(){queries++;return {bind(){return {first:async()=>{throw new Error('D1_ERROR: no such column: active');}}}}}}};
  assert.equal(await currentUser(missing,request(token)),null);
  assert.equal(queries,1);
  const broken={SESSION_SECRET:'session-password-version',MEDIA:{head:async()=>null},DB:{prepare(){return {bind(){return {first:async()=>{throw new Error('disk');}}}}}}};
  await assert.rejects(currentUser(broken,request(token)),/disk/);
});
