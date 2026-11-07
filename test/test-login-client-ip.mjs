import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/worker.js';

function env(){
  const keys=[];
  return {keys,DB:{prepare(){return {bind(){return {first:async()=>null}}}}},MEDIA:{
    get:async()=>null,
    head:async()=>null,
    put:async key=>{keys.push(key);return {};},
    delete:async()=>{}
  }};
}
function login(headers){
  return new Request('https://example.test/api/login',{
    method:'POST',
    headers:{Origin:'https://example.test','Content-Type':'application/json',...headers},
    body:JSON.stringify({login:'ada',password:'wrong'})
  });
}

test('login locks ignore X-Forwarded-For',async()=>{
  const forged=env();
  const denied=await app.fetch(login({'X-Forwarded-For':'203.0.113.5, 198.51.100.1'}),forged,{});
  assert.equal(denied.status,401);
  assert.deepEqual(forged.keys,['login-fail/unknown']);
  const seen=env();
  const again=await app.fetch(login({'CF-Connecting-IP':'198.51.100.10','X-Forwarded-For':'203.0.113.5'}),seen,{});
  assert.equal(again.status,401);
  assert.deepEqual(seen.keys,['login-fail/198.51.100.10']);
});
