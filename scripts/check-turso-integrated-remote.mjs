// Bounded unauthenticated smoke test. No D1 query, login attempt or study write.
import assert from 'node:assert/strict';
const origin='https://learn-english-turso-integrated-test.east-tarsal.workers.dev';
async function call(path,options={}){
  return fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(20000),...options});
}
try {
  const page=await call('/');assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'),/frame-src 'self' https:\/\/www.youtube-nocookie.com/);
  assert.match(page.headers.get('content-security-policy'),/script-src 'self';/);
  assert.match(await page.text(),/TEST Turso/);
  const script=await call('/main-bridge.js');assert.equal(script.status,200);
  assert.match(await script.text(),/capabilities/);
  const catalog=await call('/lesson-data.js');assert.equal(catalog.status,200);
  const source=await catalog.text();assert.ok(source.startsWith('window.LESSON_DATA='));
  const data=JSON.parse(source.slice('window.LESSON_DATA='.length).replace(/;\s*$/,''));
  assert.ok(Array.isArray(data.words)&&data.words.length>0);
  const me=await call('/api/me');assert.equal(me.status,200);
  assert.equal((await me.json()).user,null);
  for(const path of ['/api/cards','/api/migration-media/'+'0'.repeat(64),'/api/admin/users/'+'0'.repeat(32)+'/state','/api/admin/users/'+'0'.repeat(32)+'/lessons']){
    const response=await call(path);assert.equal(response.status,401);await response.body?.cancel();
  }
  for(const path of ['/.dev.vars','/private-migration-media/'+'0'.repeat(64)+'.bin']){
    const response=await call(path);assert.equal(response.status,501);await response.body?.cancel();
  }
  const rejected=await call('/api/login',{method:'POST',headers:{Origin:'https://other.invalid','Content-Type':'application/json'},body:'{}'});
  assert.equal(rejected.status,403);await rejected.body?.cancel();
  const access=await call('/api/admin/users/'+'0'.repeat(32)+'/lessons/synthetic/access',{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(access.status,401);await access.body?.cancel();
  const text=await call('/api/admin/users/'+'0'.repeat(32)+'/texts/synthetic',{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(text.status,401);await text.body?.cancel();
  const card=await call('/api/admin/users/'+'0'.repeat(32)+'/cards/synthetic',{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(card.status,401);await card.body?.cancel();
  for(const suffix of ['/cards','/cards/new']){
    const added=await call('/api/admin/users/'+'0'.repeat(32)+suffix,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(added.status,401);await added.body?.cancel();
  }
  const removed=await call('/api/admin/users/'+'0'.repeat(32)+'/cards/synthetic',{method:'DELETE',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(removed.status,401);await removed.body?.cancel();
  for(const [method,suffix] of [['POST','texts'],['DELETE','texts/synthetic'],['POST','songs'],['PATCH','songs/synthetic']]){
    const response=await call('/api/admin/users/'+'0'.repeat(32)+'/'+suffix,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,401);await response.body?.cancel();
  }
  for(const path of ['/api/admin/users/'+'0'.repeat(32)+'/stats','/api/admin/users/'+'0'.repeat(32)+'/cards/synthetic/dictionary','/api/cards/synthetic/dictionary']){
    const response=await call(path);assert.equal(response.status,401);await response.body?.cancel();
  }
  const detach=await call('/api/lessons/synthetic/blocks/image/media',{method:'DELETE',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(detach.status,401);await detach.body?.cancel();
  for(const path of ['/api/song-file','/api/lesson-file']){
    const response=await call(path+'?id=synthetic&for='+'0'.repeat(32));assert.equal(response.status,401);await response.body?.cancel();
  }
  console.log('Remote TEST smoke: 27 checks passed; Turso catalog loaded; anonymous data/private assets/managed writes denied; no login or data mutation.');
} catch(error){console.error('Remote TEST smoke failed: '+(error.code||error.name)+'. Response bodies suppressed.');process.exitCode=1;}
