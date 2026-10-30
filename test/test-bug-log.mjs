import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {saveBug,listBugs,listBugHeads,recordHttpBug,resolveBug,headerMap,resetBugStoreForTests} from '../src/bug-log.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';
const plain=value=>value&&typeof value==='object'&&'type' in value?value.value:value;
function memory(){
  const sql=new DatabaseSync(':memory:');
  return {
    sql,
    get rows(){try{return sql.prepare('SELECT * FROM bug_reports').all();}catch{return [];}},
    async read(query,args=[]){return sql.prepare(query).all(...args);},
    async atomic(commands){
      sql.exec('BEGIN');
      try{for(const c of commands)sql.prepare(c.sql).run(...(c.args||[]).map(plain));sql.exec('COMMIT');}
      catch(error){sql.exec('ROLLBACK');throw error;}
    }
  };
}
test('repeated HTTP failures collapse to one row and keep the latest exchange',async()=>{
  resetBugStoreForTests();
  const db=memory();
  const call=(path,login)=>recordHttpBug(db,{id:login,login,role:'USER'},new Request('https://learn-english.example'+path,{method:'POST',headers:{cookie:'session=secret','content-type':'application/json'},body:'{"order":[1]}'}),new Response(JSON.stringify({error:'Order must contain exactly the remaining blocks.'}),{status:400,headers:{'content-type':'application/json','set-cookie':'a=b'}}),{service:'learn-english',deploymentId:'deployment-test'});
  await call('/api/lessons/lesson_2026_09_14','Tsovak');
  await call('/api/lessons/lesson_2026_09_23','Teacher');
  const bugs=await listBugs(db);
  assert.equal(bugs.length,1);
  assert.equal(bugs[0].hits,2);
  assert.equal(bugs[0].path,'/api/lessons/:id');
  assert.deepEqual(bugs[0].accounts,['Tsovak','Teacher']);
  assert.equal(bugs[0].request.headers.cookie,'[hidden]');
  assert.equal(bugs[0].response.headers['set-cookie'],'[hidden]');
  assert.match(bugs[0].request.body,/"order"/);
  assert.equal(bugs[0].error,'Order must contain exactly the remaining blocks.');
  assert.equal(bugs[0].request.context.role,'USER');
  assert.equal(bugs[0].request.context.application.deploymentId,'deployment-test');
  assert.equal(bugs[0].request.history.length,1);
  assert.match(bugs[0].request.history[0].url,/lesson_2026_09_14/);
  assert.equal(bugs[0].timeZone,'UTC');
  assert.ok(bugs[0].lastAt>0);
  assert.match(bugs[0].when,/UTC|GMT/);
});
test('a different failure stays on its own row',async()=>{
  resetBugStoreForTests();
  const db=memory();
  await saveBug(db,{method:'POST',path:'/api/lessons/lesson_2026_09_14',status:400,error:'Order must contain exactly the remaining blocks.',account:{login:'Tsovak'},request:{},response:{}});
  await saveBug(db,{method:'POST',path:'/api/lessons/lesson_2026_09_14',status:500,error:'The transaction could not be saved.',account:{login:'Tsovak'},request:{},response:{}});
  assert.equal((await listBugs(db)).length,2);
});
test('bug list is hidden from teachers and readable by the developer',async()=>{
  resetBugStoreForTests();
  let role='ADMIN',studied=0;
  const db=memory();
  const worker=integratedWorker({authenticate:async()=>({id:'a'.repeat(32),role,login:'Tsovak'}),studyDatabase:()=>{studied++;return db;}});
  const env={DB:{prepare(){throw new Error('Account SQL is not used for this route.');}},STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid',ACCOUNT_QUERY_LIMIT_ENABLED:'false'};
  const denied=await worker.fetch(new Request('https://test.invalid/api/bugs'),env);
  assert.equal(denied.status,403);assert.equal(studied,0);
  role='USER';
  assert.equal((await worker.fetch(new Request('https://test.invalid/api/bugs'),env)).status,403);
  role='DEVELOPER';
  const body=await(await worker.fetch(new Request('https://test.invalid/api/bugs'),env)).json();
  assert.deepEqual(body,{bugs:[]});assert.equal(studied,1);
  assert.equal(headerMap(new Headers({cookie:'x'})) .cookie,'[hidden]');
});
test('expected sign-in failures are ignored while permission failures are stored',async()=>{
  resetBugStoreForTests();
  const db=memory();
  const call=(status,error)=>recordHttpBug(db,{login:'Tsovak'},new Request('https://learn-english.example/api/me'),new Response(JSON.stringify({error}),{status}));
  await call(401,'Sign in first.');
  await call(403,'Developer only.');
  await call(200,'');
  const bugs=await listBugs(db);
  assert.equal(bugs.length,1);
  assert.deepEqual(bugs.map(row=>row.status),[403]);
});
test('login and registration validation is ignored without hiding server failures',async()=>{
  resetBugStoreForTests();
  const db=memory();
  const call=(path,status)=>recordHttpBug(db,null,new Request('https://learn-english.example'+path),new Response(JSON.stringify({error:'Auth failure.'}),{status}));
  await call('/api/login',401);
  await call('/api/login',403);
  await call('/api/register',400);
  await call('/api/register',409);
  await call('/api/login',429);
  await saveBug(db,{path:'/api/me/themes',status:401,error:'Sign in first.'});
  assert.equal(db.rows.length,0);
  await call('/api/login',500);
  assert.equal((await listBugs(db)).length,1);
});
test('a served non-2xx is stored, and a browser-reported failure is not stored twice',async()=>{
  resetBugStoreForTests();
  const db=memory();
  const worker=integratedWorker({authenticate:async()=>null,studyDatabase:()=>db});
  const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid',ACCOUNT_QUERY_LIMIT_ENABLED:'false',BUG_LOG:'true',DB:{prepare(){throw new Error('no');}}};
  assert.equal((await worker.fetch(new Request('https://other.invalid/api/me'),env)).status,403);
  assert.equal((await listBugs(db)).length,1);
  assert.equal((await worker.fetch(new Request('https://other.invalid/api/me',{headers:{'X-Client-Bug':'1'}}),env)).status,403);
  assert.equal((await listBugs(db))[0].hits,1);
});
test('the browser can file an unconfirmed operation without opening the journal',async()=>{
  resetBugStoreForTests();
  const db=memory();
  let role='USER';
  const worker=integratedWorker({authenticate:async()=>({id:'a'.repeat(32),role,login:'Tsovak'}),studyDatabase:()=>db});
  const env={DB:{prepare(){throw new Error('no');}},STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid',ACCOUNT_QUERY_LIMIT_ENABLED:'false',CF_VERSION_METADATA:{id:'version-123',tag:'release',timestamp:'2026-10-10T07:00:00Z'}};
  const posted=await worker.fetch(new Request('https://test.invalid/api/bugs',{method:'POST',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},body:JSON.stringify({method:'POST',path:'/api/lessons/lesson_1',status:0,error:'Unconfirmed operation. The browser reloaded before the server confirmed the save.',timeZone:'Asia/Yerevan',request:{body:'{"title":"x"}'},response:{body:'No confirmed response'}})}),env);
  assert.equal(posted.status,204);
  role='ADMIN';
  assert.equal((await worker.fetch(new Request('https://test.invalid/api/bugs'),env)).status,403);
  role='DEVELOPER';
  const body=await(await worker.fetch(new Request('https://test.invalid/api/bugs'),env)).json();
  assert.equal(body.bugs.length,1);
  assert.equal(body.bugs[0].status,0);
  assert.equal(body.bugs[0].accounts[0],'Tsovak');
  assert.match(body.bugs[0].error,/Unconfirmed operation/);
  assert.equal(body.bugs[0].timeZone,'Asia/Yerevan');
  assert.equal(body.bugs[0].request.context.application.deploymentId,'version-123');
  assert.equal(body.bugs[0].request.context.application.service,'learn-english');
  assert.ok(body.bugs[0].lastAt>0);
  const heads=await(await worker.fetch(new Request('https://test.invalid/api/bugs?heads=1'),env)).json();
  assert.equal(heads.heads.length,1);assert.equal(heads.heads[0].id,body.bugs[0].id);assert.equal(heads.heads[0].request,undefined);
  const one=await(await worker.fetch(new Request('https://test.invalid/api/bugs?ids='+body.bugs[0].id),env)).json();
  assert.equal(one.bugs.length,1);assert.equal(one.bugs[0].error,body.bugs[0].error);
  assert.equal((await worker.fetch(new Request('https://test.invalid/api/bugs?ids=zz'),env)).status,400);
  const resolved=await worker.fetch(new Request('https://test.invalid/api/bugs/resolve',{method:'POST',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},body:JSON.stringify({id:body.bugs[0].id})}),env);
  assert.equal(resolved.status,200);assert.ok((await resolved.json()).bug.resolvedAt);
  assert.equal((await listBugs(db))[0].resolved,true);
  await saveBug(db,{method:'POST',path:'/api/lessons/lesson_1',status:0,error:'Unconfirmed operation. The browser reloaded before the server confirmed the save.',account:{login:'Tsovak'},request:{},response:{}});
  assert.equal((await listBugs(db))[0].resolved,false);
  assert.equal((await listBugs(db))[0].hits,2);
});
test('occurrences keep every timestamp and resolving/reopening preserves prior closures',async()=>{
  resetBugStoreForTests();const db=memory(),original=Date.now;let now=Date.parse('2026-10-18T10:00:00Z');
  Date.now=()=>now;
  try{
    const event={method:'POST',path:'/api/example',status:500,error:'Fixture failure',request:{},response:{}};
    await saveBug(db,event);now+=1000;await saveBug(db,event);
    let [bug]=await listBugs(db);assert.equal(bug.hits,2);assert.equal(bug.occurrences.length,2);assert.equal(bug.undatedOccurrences,0);
    now=Date.parse('2026-10-19T10:00:00Z');await resolveBug(db,bug.id);
    [bug]=await listBugs(db);assert.equal(bug.resolvedAt,now);assert.equal(bug.resolutions.length,1);
    const resolvedAt=now;now+=1000;await resolveBug(db,bug.id);
    [bug]=await listBugs(db);assert.equal(bug.resolvedAt,resolvedAt);assert.equal(bug.resolutions.length,1,'Repeated resolve is idempotent');
    now=Date.parse('2026-10-20T10:00:00Z');await saveBug(db,event);
    [bug]=await listBugs(db);assert.equal(bug.resolved,false);assert.equal(bug.resolvedAt,null);assert.equal(bug.hits,3);
    assert.equal(bug.occurrences.length,3);assert.equal(bug.resolutions[0].at,resolvedAt);
    await resolveBug(db,bug.id);[bug]=await listBugs(db);assert.equal(bug.resolutions.length,2);assert.equal(bug.resolvedAt,now);
    assert.equal((await listBugHeads(db))[0].resolvedAt,now);
  }finally{Date.now=original;db.sql.close();}
});
test('legacy history recovers only known occurrence dates and does not invent resolution dates',async()=>{
  resetBugStoreForTests();const db=memory();
  db.sql.exec(`CREATE TABLE bug_reports(signature TEXT PRIMARY KEY,method TEXT,path TEXT,status INTEGER,error TEXT,hits INTEGER,accounts_json TEXT,request_json TEXT,response_json TEXT,first_at INTEGER,last_at INTEGER,time_zone TEXT,resolved INTEGER)`);
  const first=Date.parse('2026-10-15T12:00:00Z'),last=Date.parse('2026-10-18T12:00:00Z');
  db.sql.prepare('INSERT INTO bug_reports VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('a'.repeat(32),'GET','/api/legacy',500,'Old',10,'[]',JSON.stringify({history:[{at:first},{at:last-1000},{at:last-1000}]}),'{}',first,last,'UTC',1);
  const [bug]=await listBugs(db);assert.equal(bug.occurrences.length,3);assert.equal(bug.undatedOccurrences,7);assert.equal(bug.resolvedAt,null);assert.deepEqual(bug.resolutions,[]);
  assert.ok(bug.occurrences.every(event=>event.inferred));
  resetBugStoreForTests();const [again]=await listBugs(db);assert.equal(again.occurrences.length,3,'Backfill does not duplicate history');db.sql.close();
});
test('simultaneous first reports preserve hit counts and distinct occurrence records',async()=>{
  resetBugStoreForTests();const db=memory();await listBugs(db);
  const event={method:'GET',path:'/api/race',status:500,error:'Concurrent failure',request:{},response:{}};
  await Promise.all(Array.from({length:8},()=>saveBug(db,event)));
  const [bug]=await listBugs(db);assert.equal(bug.hits,8);assert.equal(bug.occurrences.length,8);assert.equal(bug.undatedOccurrences,0);db.sql.close();
});
test('security scanners and administrative probe paths are completely ignored',async()=>{
  resetBugStoreForTests();
  const db=memory();
  const probes=[
    ['/api/config.php','Mozilla/5.0 (X11; Linux x86_64)'],
    ['/api/setup-complete','Mozilla/5.0 (compatible; SecurityResearch/1.0)'],
    ['/api/v4/config','Mozilla/5.0 (compatible; SecurityResearch/1.0)'],
    ['/api/v1/info','Mozilla/5.0 (compatible; SecurityResearch/1.0)'],
    ['/api/system/status','Mozilla/5.0 (compatible; SecurityResearch/1.0)'],
    ['/api/backup','Mozilla/5.0 (compatible; SecurityResearch/1.0)'],
    ['/api/app.env','Mozilla/5.0'],
    ['/api/v2/anything','curl/7.68.0']
  ];
  for(const [path,ua] of probes){
    await recordHttpBug(db,null,new Request('https://learn-english.example'+path,{headers:{'user-agent':ua}}),new Response('Not found',{status:501}));
  }
  assert.equal(db.rows.length,0);
});
test('expected client validation barriers and rate quotas are completely ignored by saveBug',async()=>{
  resetBugStoreForTests();
  const db=memory();
  const events=[
    {method:'CLIENT',path:'/',status:0,error:'Personal changes are not saved yet. Retry their save or check the unconfirmed operation.'},
    {method:'CLIENT',path:'/',status:0,error:'Select an exact shared card for this quiz'},
    {method:'CLIENT',path:'/',status:0,error:'This draft is not saved'},
    {method:'CLIENT',path:'/',status:0,error:'Нельзя однозначно выбрать общую карточку для квиза. Запись не отправлена.'},
    {method:'CLIENT',path:'/',status:0,error:'Это несохранённый черновик. «Проверить сервер» уберёт его без записи в БД.'},
    {method:'POST',path:'/api/lessons',status:400,error:'Enter a lesson title before saving.'},
    {method:'POST',path:'/api/lessons',status:400,error:'Lesson title is required.'},
    {method:'POST',path:'/api/lessons/parse-pdf',status:504,error:'Request timed out.'},
    {method:'POST',path:'/api/lessons/parse-pdf',status:429,error:'Daily quota exceeded.'}
  ];
  for(const ev of events){
    const result=await saveBug(db,ev);
    assert.deepEqual(result,{ignored:true});
  }
  assert.equal(db.rows.length,0);
});
