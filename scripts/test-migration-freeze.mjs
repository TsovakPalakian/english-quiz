import test from 'node:test';
import assert from 'node:assert/strict';
import {migrationFreeze,frozenEnvironment} from '../src/migration-freeze.mjs';
test('Migration fence rejects educational mutations before invoking legacy backend',async()=>{
  let calls=0;const worker=migrationFreeze({fetch:async()=>{calls++;return Response.json({ok:true});}});
  for(const method of ['POST','PUT','PATCH','DELETE'])for(const path of ['/api/me/state','/api/lessons','/api/song-file','/api/stats/event','/api/admin/users/fixture/state']){
    const response=await worker.fetch(new Request('https://source.example'+path,{method}),{},{});
    assert.equal(response.status,503);assert.equal(response.headers.get('X-Education-Writes'),'frozen');
  }
  assert.equal(calls,0);
});
test('Migration fence retains account/admin mutations with original environment and permissions',async()=>{
  const env={marker:'unchanged'},calls=[];const worker=migrationFreeze({fetch:async(request,actual)=>{
    assert.equal(actual,env);calls.push(new URL(request.url).pathname);return Response.json({ok:true});
  }});
  for(const [method,path] of [['POST','/api/register'],['POST','/api/me/account'],['POST','/api/me/password'],['POST','/api/me/revoke'],
    ['POST','/api/admin/users/'+'a'.repeat(32)+'/role'],['POST','/api/admin/registrations/'+'b'.repeat(32)+'/approve'],['DELETE','/api/admin/users/'+'a'.repeat(32)]])
    assert.equal((await worker.fetch(new Request('https://source.example'+path,{method}),env,{})).status,200);
  assert.equal(calls.length,7);
});
test('Migration fence preserves GET/HEAD and login/logout; protected writes remain blocked even from reads',async()=>{
  const calls=[],env={MEDIA:{get:key=>key,put:key=>{calls.push(key);},delete:key=>{calls.push(key);}},DB:{prepare:sql=>({sql})}};
  const worker=migrationFreeze({fetch:async(request,guarded)=>{
    assert.equal(guarded.MEDIA.get('shared/lessons.json'),'shared/lessons.json');
    if(new URL(request.url).pathname==='/api/logout'){assert.equal(guarded,env);return Response.json({ok:true});}
    assert.throws(()=>guarded.MEDIA.put('shared/lessons.json','{}'));
    assert.throws(()=>guarded.MEDIA.delete('pair/tsovak-texts.json'));
    assert.throws(()=>guarded.DB.prepare('UPDATE user_state SET stats=?'));
    return Response.json({ok:true});
  }});
  for(const [method,path] of [['GET','/api/me'],['HEAD','/api/song-file'],['POST','/api/login'],['POST','/api/logout']]){
    assert.equal((await worker.fetch(new Request('https://source.example'+path,{method}),env,{})).status,200);
  }
  const guarded=frozenEnvironment(env);await guarded.MEDIA.put('revoked-sid/fixture','{}');await guarded.MEDIA.delete('login-fail/fixture');
  assert.equal(calls.length,2);assert.ok(guarded.DB.prepare('SELECT id FROM users'));assert.throws(()=>guarded.DB.batch([]));
});
