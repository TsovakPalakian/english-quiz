import test from 'node:test';
import assert from 'node:assert/strict';
import {saveBug,listBugs,recordHttpBug,resolveBug,headerMap,resetBugStoreForTests} from '../src/bug-log.mjs';
import {integratedWorker} from '../src/turso-integrated-worker.mjs';
const plain=value=>value&&typeof value==='object'&&'type' in value?value.value:value;
function memory(){
  const rows=[];
  return {
    rows,
    async read(sql,args=[]){
      if(sql.includes('signature IN'))return rows.filter(row=>args.includes(row.signature));
      if(sql.includes('WHERE signature')){
        const found=rows.find(row=>row.signature===args[0]);
        return found?[found]:[];
      }
      return rows.slice().sort((a,b)=>b.last_at-a.last_at);
    },
    async atomic(statements){
      for(const command of statements){
        const args=(command.args||[]).map(plain);
        if(command.sql.startsWith('CREATE'))continue;
        if(command.sql.startsWith('INSERT'))rows.push({signature:args[0],method:args[1],path:args[2],status:Number(args[3]),error:args[4],hits:Number(args[5]),accounts_json:args[6],request_json:args[7],response_json:args[8],first_at:Number(args[9]),last_at:Number(args[10]),time_zone:args[11]||''});
        if(command.sql.includes('resolved=0')){const row=rows.find(item=>item.signature===args[0]);if(row)row.resolved=0;continue;}
        if(command.sql.includes('resolved=1')){const row=rows.find(item=>item.signature===args[0]);if(row)row.resolved=1;continue;}
        if(command.sql.startsWith('UPDATE')){
          const row=rows.find(item=>item.signature===args[7]);
          Object.assign(row,{hits:Number(args[0]),accounts_json:args[1],request_json:args[2],response_json:args[3],error:args[4],last_at:Number(args[5]),time_zone:args[6]});
        }
      }
    }
  };
}
test('repeated HTTP failures collapse to one row and keep the latest exchange',async()=>{
  resetBugStoreForTests();
  const db=memory();
  const call=(path,login)=>recordHttpBug(db,{id:login,login,role:'USER'},new Request('https://learn-english.example'+path,{method:'POST',headers:{cookie:'session=secret','content-type':'application/json'},body:'{"order":[1]}'}),new Response(JSON.stringify({error:'Order must contain exactly the remaining blocks.'}),{status:400,headers:{'content-type':'application/json','set-cookie':'a=b'}}));
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
  const env={DB:{prepare(){throw new Error('no');}},STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid',ACCOUNT_QUERY_LIMIT_ENABLED:'false'};
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
  assert.ok(body.bugs[0].lastAt>0);
  const heads=await(await worker.fetch(new Request('https://test.invalid/api/bugs?heads=1'),env)).json();
  assert.equal(heads.heads.length,1);assert.equal(heads.heads[0].id,body.bugs[0].id);assert.equal(heads.heads[0].request,undefined);
  const one=await(await worker.fetch(new Request('https://test.invalid/api/bugs?ids='+body.bugs[0].id),env)).json();
  assert.equal(one.bugs.length,1);assert.equal(one.bugs[0].error,body.bugs[0].error);
  assert.equal((await worker.fetch(new Request('https://test.invalid/api/bugs?ids=zz'),env)).status,400);
  assert.equal(await resolveBug(db,body.bugs[0].id),true);
  assert.equal((await listBugs(db))[0].resolved,true);
  await saveBug(db,{method:'POST',path:'/api/lessons/lesson_1',status:0,error:'Unconfirmed operation. The browser reloaded before the server confirmed the save.',account:{login:'Tsovak'},request:{},response:{}});
  assert.equal((await listBugs(db))[0].resolved,false);
  assert.equal((await listBugs(db))[0].hits,2);
});
