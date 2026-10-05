// Bounded real-account smoke. Credentials only via stdin; ledger stays private.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const [mode,origin]=process.argv.slice(2);
assert.ok(['--read','--write'].includes(mode));
assert.ok(['https://learn-english-turso-production.east-tarsal.workers.dev','https://learn-english.east-tarsal.workers.dev'].includes(origin));
const candidate='/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/candidate-verified-ygAmec';
const data=JSON.parse(readFileSync(candidate+'/snapshot.json'));
const account=data.tables.account_refs[0].id;
const input=JSON.parse(readFileSync(0,'utf8'));
assert.equal(input.login,'TsovakDev');
let cookie='',requests=0,step='start';
const dir=mkdtempSync('/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/cutover-smoke-');
const ledger={origin,mode,startedAt:new Date().toISOString(),checks:[],siteWrites:mode==='--write'};
const save=()=>writeFileSync(dir+'/result.json',JSON.stringify(ledger,null,2),{mode:0o600});save();
async function call(path,{method='GET',body,status=200,headers={}}={}){
  step=method+' '+path;assert.ok(++requests<=35);
  const response=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},
    ...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,status,step+' status');
  ledger.checks.push({path,method,status:response.status});save();return response;
}
try{
  const page=await call('/');assert.match(await page.text(),/Учебные данные сохраняются на сервере/);
  const login=await call('/api/login',{method:'POST',body:input});const user=(await login.json()).user;
  assert.equal(user.id,account);assert.equal(user.login,'TsovakDev');assert.equal(user.role,'DEVELOPER');
  cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
  const me=await(await call('/api/me')).json();assert.equal(me.user.id,account);
  const state=await(await call('/api/me/state')).json();assert.ok(Array.isArray(state.songs));
  assert.equal(state.songs.length,data.tables.library_items.filter(r=>r.kind==='song'&&r.deleted_at===null).length);
  const library=await(await call('/api/library')).json();assert.equal(library.items.length,data.tables.library_items.filter(r=>r.deleted_at===null).length);
  const lessons=await(await call('/api/lessons')).json();assert.ok(lessons.materials.length>0);
  const card=data.tables.cards.find(r=>r.en==='competitive'&&r.scope==='shared'&&r.deleted_at===null);
  assert.ok(card);const dictionary=await(await call('/api/cards/'+card.id+'/dictionary')).json();
  assert.equal(dictionary.en,card.en);assert.equal(dictionary.ru,card.ru);
  await(await call('/api/cards/'+card.id)).body?.cancel();
  for(const item of data.tables.library_items.filter(r=>r.kind==='song'&&r.media_key&&r.deleted_at===null)){
    const media=await call('/api/song-file?id='+encodeURIComponent(item.id),{method:'HEAD'});
    assert.ok(Number(media.headers.get('content-length'))>0);assert.equal(media.headers.get('cache-control'),'private, no-store');
  }
  for(const block of data.tables.lesson_blocks){const content=JSON.parse(block.content_json);if(content.fileId){
    const media=await call('/api/lesson-file?id='+encodeURIComponent(content.fileId),{method:'HEAD'});
    assert.ok(Number(media.headers.get('content-length'))>0);
  }}
  for(const row of data.tables.catalog_documents.filter(r=>r.namespace==='private-migration-media')){
    const media=await call('/api/migration-media/'+row.key);assert.equal((await media.arrayBuffer()).byteLength,JSON.parse(row.value_json).bytes);
  }
  await(await call('/api/library',{method:'POST',body:{},status:mode==='--read'?503:400})).body?.cancel();
  if(mode==='--write'){
    const id='cutover_'+randomUUID();ledger.fixture={id};save();
    const creation=await call('/api/library',{method:'POST',body:{id,kind:'text',mutationId:randomUUID(),changes:{title:'CUTOVER_CHECK_20261005',text:'Disposable production migration check.'}}});
    const result=await creation.json();assert.equal(result.revision,1);
    ledger.firstConfirmedWriteAt=new Date().toISOString();ledger.fixture.revision=result.revision;save();
    const check=await(await call('/api/library')).json();assert.ok(check.items.some(r=>r.id===id||r.stageId===id));
    await(await call('/api/library/'+id,{method:'DELETE',body:{mutationId:randomUUID(),expectedRevision:1}})).body?.cancel();
    ledger.fixture.archived=true;save();
  }
  await(await call('/api/logout',{method:'POST',body:{}})).body?.cancel();
  await(await call('/api/me/state',{status:401})).body?.cancel();
  ledger.status='passed';ledger.completedAt=new Date().toISOString();ledger.requests=requests;save();
  console.log(JSON.stringify({status:ledger.status,origin,mode,requests,report:dir,firstConfirmedWriteAt:ledger.firstConfirmedWriteAt}));
}catch(error){ledger.status='failed';ledger.failedStep=step;ledger.failure=error.code||error.name;ledger.requests=requests;save();
  console.error(JSON.stringify({status:'failed',step,report:dir,credentialsSuppressed:true}));process.exitCode=1;}
