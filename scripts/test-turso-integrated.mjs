import test from 'node:test';
import assert from 'node:assert/strict';
import {accountRoute,accountDatabase,integratedWorker} from '../src/turso-integrated-worker.mjs';
import {ACCOUNT_AUTH} from '../src/turso-stage-worker.mjs';
import {managedAccount} from '../src/worker.js';
const id='a'.repeat(32);
test('R5 managed media requires source authorization, target ownership and developer song rights before storage',async()=>{
  const target='b'.repeat(32);let role='ADMIN',allowed=true,reads=0,objects=0,songs=false;
  const worker=integratedWorker({authenticate:async()=>({id,role,login:'SyntheticReviewer'}),
    authorizeManaged:async()=>allowed?{row:{id:target,role:'USER',login:'SyntheticStudent'},songs}:{error:Response.json({error:'denied'},{status:403})},
    studyDatabase:()=>({read:async(sql,args)=>{reads++;if(sql.includes('library_items')){assert.equal(args[0],target);return [{media_key:'songs/target'}];}
      assert.deepEqual(args,['lesson-file','lesson-file',0,target,target]);return [{lesson_id:'lesson',block_id:'block',content_json:JSON.stringify({fileId:'lesson-file'})}];}})});
  const env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid',MEDIA:{head:async()=>{objects++;return {size:4,writeHttpMetadata:h=>h.set('Content-Type','audio/mpeg')};}}};
  const call=(path,query='id=lesson-file&for='+target)=>worker.fetch(new Request('https://test.invalid'+path+'?'+query,{method:'HEAD'}),env);
  assert.equal((await call('/api/lesson-file')).status,200);assert.equal(objects,1);
  assert.equal((await call('/api/song-file')).status,403);assert.equal(reads,1);
  role='DEVELOPER';songs=true;assert.equal((await call('/api/song-file','id=song&for='+target)).status,200);assert.equal(objects,2);
  allowed=false;assert.equal((await call('/api/lesson-file')).status,403);assert.equal(objects,2);
  assert.equal((await call('/api/lesson-file','id=x&for='+target+'&for='+target)).status,400);
});
test('R3 managed statistics use only authorized target, hide teacher song fields and reject spoofed filters',async()=>{
  const target='b'.repeat(32),queries=[];let allowed=true,songs=false;
  const worker=integratedWorker({authenticate:async()=>({id,role:'ADMIN',login:'SyntheticTeacher'}),
    authorizeManaged:async()=>allowed?{row:{id:target,role:'USER',login:'SyntheticStudent'},songs}:{error:Response.json({error:'denied'},{status:403})},
    studyDatabase:()=>({read:async(sql,args)=>{queries.push({sql,args});return [{key:'activity:2026-10-05',value_json:JSON.stringify({answers:3,correct:2,songs:4,archives:1,cardAreas:{music:2,'my words':1}})}];}})});
  const env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  const call=query=>worker.fetch(new Request('https://test.invalid/api/admin/users/'+target+'/stats?'+query),env);
  const result=await(await call('from=2026-10-01&to=2026-10-05')).json();
  assert.equal(result.activity.answers,3);assert.equal(result.statisticsSource,'turso-activity');assert.equal(result.legacyHistoryIncluded,false);
  assert.equal(result.hideSongs,true);assert.equal(result.activity.songs,undefined);assert.equal(result.activity.series[0].songs,undefined);assert.equal(result.activity.cardAreas.music,undefined);
  assert.equal(result.activity.series[0].cardAreas.music,undefined);
  assert.deepEqual(queries[0].args,[target]);assert.match(queries[0].sql,/profile_settings/);
  for(const query of ['user='+id,'role=DEVELOPER','scope=all','from=2026-10-01&from=2026-10-02'])assert.equal((await call(query)).status,400);
  const before=queries.length;allowed=false;assert.equal((await call('')).status,403);assert.equal(queries.length,before);
  allowed=true;songs=true;assert.equal((await(await call('from=2026-10-01&to=2026-10-05')).json()).activity.songs,4);
});
test('R4 managed dictionary requires source pair authorization before study access',async()=>{
  let reads=0;
  const worker=integratedWorker({authenticate:async()=>({id,role:'ADMIN'}),authorizeManaged:async()=>({error:Response.json({error:'denied'},{status:403})}),studyDatabase:()=>{reads++;throw Error('Denied');}});
  assert.equal((await worker.fetch(new Request('https://test.invalid/api/admin/users/'+'b'.repeat(32)+'/cards/card/dictionary'),{DB:fixture().raw,STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid'})).status,403);assert.equal(reads,0);
});
test('R2 managed library routes fail closed on pair, origin, write flag and teacher song access',async()=>{
  let allowed=false,reads=0;
  const worker=integratedWorker({authenticate:async()=>({id,role:'ADMIN',login:'SyntheticTeacher'}),
    authorizeManaged:async()=>allowed?{row:{id:'b'.repeat(32),role:'USER',login:'SyntheticStudent'},songs:true}:{error:Response.json({error:'denied'},{status:403})},
    studyDatabase:()=>{reads++;throw Error('Forbidden study access');}});
  const env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_WRITES:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  for(const [method,path] of [['POST','texts'],['DELETE','texts/item'],['POST','songs'],['PATCH','songs/item']]){
    const call=(settings=env,origin='https://test.invalid')=>worker.fetch(new Request('https://test.invalid/api/admin/users/'+'b'.repeat(32)+'/'+path,{method,headers:{Origin:origin},body:'{}'}),settings);
    assert.equal((await call()).status,403);
    assert.equal((await call({...env,STAGE_WRITES:'false'})).status,503);
    assert.equal((await call(env,'https://other.invalid')).status,403);
    if(path.startsWith('songs')){allowed=true;assert.equal((await call()).status,403);allowed=false;}
  }
  assert.equal(reads,0);
});
test('Managed DELETE authorizes target, denies teacher music and writes only target links',async()=>{
  const targetId='b'.repeat(32),commands=[];let allowed=true;
  const worker=integratedWorker({authenticate:async()=>({id,role:'ADMIN',login:'SyntheticTeacher'}),
    authorizeManaged:async()=>allowed?{row:{id:targetId,login:'SyntheticStudent',role:'USER'},songs:false}:{error:Response.json({error:'denied'},{status:403})},
    studyDatabase:()=>({read:async(sql,args)=>{if(sql.includes('operation_receipts'))return [];assert.deepEqual(args,[targetId]);return [{profile_id:'target-profile'}];},atomic:async values=>commands.push(...values)})});
  const env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_WRITES:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  const call=(body,settings=env,origin='https://test.invalid')=>worker.fetch(new Request('https://test.invalid/api/admin/users/'+targetId+'/cards/shared',{
    method:'DELETE',headers:{Origin:origin},body:JSON.stringify(body)}),settings);
  const body={mutationId:'synthetic-unlink',place:'mine',expectedRevision:1};
  assert.equal((await call(body)).status,200);
  const removal=commands.find(c=>c.sql.startsWith('DELETE FROM profile_cards'));assert.deepEqual(removal.args.map(a=>a.value),['target-profile','shared','mine']);
  assert.ok(!commands.some(c=>/UPDATE cards|DELETE FROM cards|card_progress/.test(c.sql)));
  const count=commands.length;
  assert.equal((await call({...body,place:'music'})).status,403);
  assert.equal((await call(body,{...env,STAGE_WRITES:'false'})).status,503);
  assert.equal((await call(body,env,'https://other.invalid')).status,403);
  assert.equal((await call({...body,profileId:'spoof'})).status,400);
  allowed=false;assert.equal((await call(body)).status,403);assert.equal(commands.length,count);
});
test('Managed card PATCH keeps target ownership and denies unauthorized, disabled and spoofed writes',async()=>{
  const targetId='b'.repeat(32),queries=[],commands=[];let allowed=true;
  const worker=integratedWorker({authenticate:async()=>({id,role:'ADMIN',login:'SyntheticTeacher'}),
    authorizeManaged:async()=>allowed?{row:{id:targetId,role:'USER',login:'SyntheticStudent'}}:{error:Response.json({error:'denied'},{status:403})},
    studyDatabase:()=>({read:async(sql,args)=>{queries.push({sql,args});return sql.includes('operation_receipts')?[]:[{owner_profile_id:'target-profile'}];},atomic:async values=>commands.push(...values)})});
  const env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_WRITES:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  const call=(body,settings=env,origin='https://test.invalid')=>worker.fetch(new Request('https://test.invalid/api/admin/users/'+targetId+'/cards/card',{
    method:'PATCH',headers:{Origin:origin},body:JSON.stringify(body)}),settings);
  const body={mutationId:'synthetic-card-patch',expectedRevision:1,changes:{ru:'New translation'}};
  assert.equal((await call(body)).status,200);assert.ok(queries.some(q=>q.sql.includes('profile_cards')&&q.args[0]===targetId));
  assert.equal(commands.find(c=>c.sql.startsWith('INSERT INTO operation_receipts')).args[0].value,id);
  const count=commands.length;
  assert.equal((await call(body,{...env,STAGE_WRITES:'false'})).status,503);
  assert.equal((await call(body,env,'https://other.invalid')).status,403);
  assert.equal((await call({...body,profileId:'spoof'})).status,400);
  allowed=false;const reads=queries.length;assert.equal((await call(body)).status,403);
  assert.equal(queries.length,reads);assert.equal(commands.length,count);
});
test('Managed text PATCH authorizes target before Turso, rejects spoofing and preserves actor identity',async()=>{
  const targetId='b'.repeat(32),queries=[],commands=[];let allowed=true;
  const worker=integratedWorker({authenticate:async()=>({id,role:'ADMIN',login:'SyntheticTeacher'}),
    authorizeManaged:async()=>allowed?{row:{id:targetId,role:'USER',login:'SyntheticStudent'}}:{error:Response.json({error:'denied'},{status:403})},
    studyDatabase:()=>({read:async(sql,args)=>{queries.push({sql,args});
      if(sql.includes('operation_receipts'))return [];
      if(sql.includes('profile_members'))return [{profile_id:'student-profile'}];
      return [{id:'text',kind:'text',scope:'profile',owner_profile_id:'student-profile',content_json:'{"id":"text","title":"Before","text":"Keep"}'}];
    },atomic:async values=>commands.push(...values)})});
  const env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_WRITES:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  const call=(body,settings=env,origin='https://test.invalid')=>worker.fetch(new Request('https://test.invalid/api/admin/users/'+targetId+'/texts/text',{
    method:'PATCH',headers:{Origin:origin},body:JSON.stringify(body)}),settings);
  const body={mutationId:'synthetic-text-patch',expectedRevision:1,changes:{title:'After'}};
  const response=await call(body);assert.equal(response.status,200);assert.equal((await response.json()).item.text,'Keep');
  assert.ok(queries.some(q=>q.sql.includes('profile_members')&&q.args[0]===targetId));
  assert.equal(commands.find(c=>c.sql.startsWith('INSERT INTO operation_receipts')).args[0].value,id);
  const count=commands.length;
  assert.equal((await call(body,{...env,STAGE_WRITES:'false'})).status,503);
  assert.equal((await call(body,env,'https://other.invalid')).status,403);
  assert.equal((await call({...body,owner_profile_id:'spoof'})).status,400);
  allowed=false;const reads=queries.length;assert.equal((await call(body)).status,403);
  assert.equal(queries.length,reads);assert.equal(commands.length,count);
});
test('Managed access writes require source authorization, Origin and stage writes; no account SQL study writes',async()=>{
  const targetId='b'.repeat(32),commands=[];let allowed=true;
  const db={read:async sql=>sql.includes('operation_receipts')?[]:[{allow_hidden:0,personal_hidden:0}],atomic:async values=>commands.push(...values)};
  const worker=integratedWorker({authenticate:async()=>({id,role:'ADMIN',login:'SyntheticTeacher'}),
    authorizeManaged:async()=>allowed?{row:{id:targetId,role:'USER',login:'SyntheticStudent'}}:{error:Response.json({error:'denied'},{status:403})},studyDatabase:()=>db});
  const env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_WRITES:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  const call=(body,settings=env,origin='https://test.invalid')=>worker.fetch(new Request('https://test.invalid/api/admin/users/'+targetId+'/lessons/lesson/access',{
    method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),settings);
  const body={mutationId:'synthetic-operation',expected:{allowHidden:false,personalHidden:false},changes:{allowHidden:true,personalHidden:false}};
  assert.equal((await call(body)).status,200);assert.ok(commands.some(c=>c.sql.includes('INSERT INTO lesson_access')));
  const count=commands.length;
  assert.equal((await call(body,{...env,STAGE_WRITES:'false'})).status,503);
  assert.equal((await call(body,env,'https://other.invalid')).status,403);
  assert.equal((await call({...body,profileId:'injected'})).status,400);
  allowed=false;assert.equal((await call(body)).status,403);assert.equal(commands.length,count);
});
test('Teachers may restrict Tsovak lessons, not pair study writes or TsovakDev',async()=>{
  const target='b'.repeat(32),commands=[],env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_WRITES:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  const body={mutationId:'synthetic-operation',expected:{allowHidden:false,personalHidden:false},changes:{allowHidden:true,personalHidden:false}};
  const access=integratedWorker({authenticate:async()=>({id,role:'ADMIN',login:'Teacher'}),
    authorizeManaged:async()=>({row:{id:target,role:'USER',login:'Tsovak'}}),
    studyDatabase:()=>({read:async sql=>sql.includes('operation_receipts')?[]:[{allow_hidden:0,personal_hidden:0}],atomic:async values=>commands.push(...values)})});
  assert.equal((await access.fetch(new Request('https://test.invalid/api/admin/users/'+target+'/lessons/lesson/access',{method:'PATCH',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},body:JSON.stringify(body)}),env)).status,200);
  const blocked=integratedWorker({authenticate:async()=>({id,role:'ADMIN',login:'Teacher'}),
    authorizeManaged:async()=>({row:{id:target,role:'USER',login:'Tsovak'},songs:true}),studyDatabase:()=>{throw new Error('pair study');}});
  assert.equal((await blocked.fetch(new Request('https://test.invalid/api/admin/users/'+target+'/texts',{method:'POST',headers:{Origin:'https://test.invalid'},body:'{}'}),env)).status,403);
  const dev=integratedWorker({authenticate:async()=>({id,role:'ADMIN',login:'Teacher'}),
    authorizeManaged:async()=>({row:{id:target,role:'DEVELOPER',login:'TsovakDev'}}),studyDatabase:()=>{throw new Error('dev pair');}});
  assert.equal((await dev.fetch(new Request('https://test.invalid/api/admin/users/'+target+'/lessons/lesson/access',{method:'PATCH',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},body:JSON.stringify(body)}),env)).status,403);
});
test('Managed study reads reuse source authorization and read only the target Turso profile',async()=>{
  const targetId='b'.repeat(32),reads=[];let actor={id,role:'ADMIN'},allowed=true;
  const worker=integratedWorker({authenticate:async()=>actor,authorizeManaged:async(env,user,target)=>{
    assert.equal(target,targetId);assert.equal(user,actor);
    if(!allowed)return {error:Response.json({error:'denied'},{status:403})};
    return {row:{id:targetId,role:'USER',login:'SyntheticStudent'},songs:false};
  },studyDatabase:()=>({read:async(sql,args)=>{reads.push({sql,args});return [];}})});
  const env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  const request=method=>new Request('https://test.invalid/api/admin/users/'+targetId+'/texts',{method,headers:{Origin:'https://test.invalid'}});
  assert.deepEqual(await(await worker.fetch(request('GET'),env)).json(),{texts:[],next:null});
  assert.equal(reads.length,1);assert.equal(reads[0].args[0],targetId);assert.ok(!reads[0].args.includes(id));
  allowed=false;assert.equal((await worker.fetch(request('GET'),env)).status,403);assert.equal(reads.length,1);
  actor=null;assert.equal((await worker.fetch(request('GET'),env)).status,401);assert.equal(reads.length,1);
});
test('Original managed authorization rejects learner, teacher targets, revoked/hidden and developer targets',async()=>{
  let row={id,role:'USER',login:'Synthetic',active:1};let queries=0;
  const env={DB:{prepare:()=>({bind:()=>({first:async()=>{queries++;return row;}})})}};
  assert.equal((await managedAccount(env,{role:'USER'},id)).error.status,403);assert.equal(queries,0);
  assert.ok((await managedAccount(env,{role:'ADMIN'},id)).row);
  row={...row,role:'ADMIN'};assert.equal((await managedAccount(env,{role:'ADMIN'},id)).error.status,403);
  row={...row,role:'DEVELOPER'};assert.equal((await managedAccount(env,{role:'DEVELOPER'},id)).error.status,403);
  for(const changes of [{active:0},{is_personal_data_revoked:1},{hidden:1}]){
    row={id,role:'USER',active:1,...changes};assert.equal((await managedAccount(env,{role:'ADMIN'},id)).error.status,404);
  }
});
test('Managed lessons overlay only the target responses, never teacher responses',async()=>{
  const targetId='b'.repeat(32);let queries;
  const worker=integratedWorker({authenticate:async()=>({id,role:'ADMIN',login:'SyntheticTeacher'}),
    authorizeManaged:async()=>({row:{id:targetId,role:'USER',login:'SyntheticStudent'},songs:false}),
    studyDatabase:()=>({readMany:async commands=>{queries=commands;return [[],[]];}})});
  const env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  const response=await worker.fetch(new Request('https://test.invalid/api/admin/users/'+targetId+'/lessons'),env);
  assert.deepEqual(await response.json(),{materials:[]});
  assert.equal(queries[1].args[0].value,targetId);assert.ok(queries.every(q=>!q.args.some(a=>a.value===id)));
});
test('Managed state preserves teacher song restriction, pair boundary and rejects whole-state writes',async()=>{
  let songs=false,login='SyntheticStudent',reads=0;
  const card=place=>({id:place,en:place,ru:'test',part_of_speech:'',extra_json:'{}',revision:1,scope:'profile',deleted_at:null,place});
  const worker=integratedWorker({authenticate:async()=>({id,role:'DEVELOPER',login:'SyntheticDeveloper'}),
    authorizeManaged:async()=>({row:{id,role:'USER',login},songs}),
    studyDatabase:()=>({read:async()=>{reads++;return [{profile_id:'p'}];},readMany:async()=>[[card('music'),card('mine')],[],[],[],[],[],[],[],[]]}),
    studyWorker:{fetch:async()=>Response.json({error:'Not migrated'},{status:501})}});
  const env={DB:fixture().raw,STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  const call=method=>worker.fetch(new Request('https://test.invalid/api/admin/users/'+id+'/state',{method,headers:{Origin:'https://test.invalid'}}),env);
  let value=await(await call('GET')).json();assert.equal(value.bootstrap,true);assert.equal(value.added,undefined);assert.equal(value.songs,undefined);assert.equal(value.counts.songs,0);
  songs=true;value=await(await call('GET')).json();assert.equal(value.bootstrap,true);assert.equal(value.added,undefined);
  login='TsovakDev';assert.equal((await call('GET')).status,403);assert.equal(reads,2);
  assert.equal((await call('PUT')).status,501);assert.equal(reads,2);
});
function fixture({limit=50}={}){
  let queries=0;const calls=[];
  const raw={prepare(sql){const statement={bind(...args){return {...statement,args};},async first(){calls.push(sql);return {id};},async run(){calls.push(sql);return {success:true};},async all(){calls.push(sql);return {results:[]};}};return statement;},async batch(commands){return Promise.all(commands.map(c=>c.run()));}};
  const reserve=async()=>{if(queries>=limit)throw new Error('query limit');queries++;};
  return {raw,calls,reserve,get queries(){return queries;}};
}
test('Account routing keeps registration/password/management, excludes all legacy educational routes',()=>{
  for(const [path,method] of [['/api/register','POST'],['/api/me/password','POST'],['/api/me/account','GET'],['/api/admin/registrations/'+id+'/approve','POST'],['/api/admin/users/'+id+'/role','POST']])assert.equal(accountRoute(path,method),true);
  for(const [path,method] of [['/api/me/state','PUT'],['/api/lessons','PUT'],['/api/texts','PUT'],['/api/admin/users/'+id+'/state','PUT'],['/api/admin/users/'+id+'/texts','GET'],['/api/admin/users/invalid/role','POST']])assert.equal(accountRoute(path,method),false);
});
test('Every account query/batch is budgeted; read-only mode and educational SQL/DDL/exec are rejected',async()=>{
  const f=fixture(),db=accountDatabase(f.raw,f.reserve);
  await db.prepare('SELECT id FROM users WHERE id=?').bind(id).first();assert.equal(f.queries,1);
  for(const sql of ['SELECT * FROM states','SELECT * FROM users JOIN cards ON cards.id=users.id','DROP TABLE users','SELECT * FROM users; DELETE FROM users','UPDATE users SET role=?'])assert.throws(()=>db.prepare(sql));
  await assert.rejects(db.exec('SELECT * FROM users'));
  const writable=accountDatabase(f.raw,f.reserve,{allowWrites:true});
  await writable.batch([writable.prepare('INSERT INTO users(id) VALUES(?)').bind(id),writable.prepare('UPDATE registrations SET status=? WHERE id=?').bind('approved',id)]);
  assert.equal(f.queries,3);assert.equal(f.calls.length,3);
  assert.throws(()=>writable.prepare('CREATE TABLE learning_states(id TEXT)'));
  assert.doesNotThrow(()=>writable.prepare('CREATE TABLE IF NOT EXISTS account_changes(id TEXT)'));
  assert.doesNotThrow(()=>writable.prepare('DELETE FROM user_state WHERE user_id = ?'));
  assert.throws(()=>writable.prepare('DELETE FROM user_state'));
  assert.throws(()=>writable.prepare('SELECT * FROM user_state WHERE user_id = ?'));
  await assert.rejects(writable.batch([f.raw.prepare('DELETE FROM users')]));
  const stopped=fixture({limit:1}),limited=accountDatabase(stopped.raw,stopped.reserve,{allowWrites:true});
  await assert.rejects(limited.batch([limited.prepare('INSERT INTO users(id) VALUES(?)').bind(id),limited.prepare('UPDATE registrations SET status=?').bind('approved')]));assert.equal(stopped.calls.length,0);
});
test('Integrated candidate preserves original account handler/session and delegates only study routes with trusted auth',async()=>{
  const f=fixture(),calls=[],actor={id,role:'DEVELOPER'};
  const worker=integratedWorker({accountWorker:{fetch:async(request)=>{calls.push('accounts');return Response.json({user:actor},{headers:{'Set-Cookie':'original_session=fixture'}});}},authenticate:async()=>actor,
    studyWorker:{fetch:async(request,env)=>{calls.push('study');assert.deepEqual(await env[ACCOUNT_AUTH].current(request),actor);return Response.json({ok:true});}}});
  const env={DB:f.raw,STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid',ACCOUNT_MUTATIONS_ENABLED:'true',AUTH_BUDGET:{idFromName:()=>'',get:()=>({fetch:async()=>new Response(null)})}};
  const request=(path,method='GET',origin=true)=>new Request('https://test.invalid'+path,{method,headers:origin?{Origin:'https://test.invalid'}:{}});
  const account=await worker.fetch(request('/api/login','POST'),env);assert.equal(account.status,200);assert.equal(account.headers.get('set-cookie'),'original_session=fixture');
  assert.equal((await worker.fetch(request('/api/cards/card','PATCH'),env)).status,200);assert.deepEqual(calls,['accounts','study']);
  assert.equal((await worker.fetch(request('/api/register','POST'),{...env,ACCOUNT_MUTATIONS_ENABLED:'false'})).status,503);
  assert.equal((await worker.fetch(request('/api/login','POST',false),env)).status,403);
  assert.equal((await worker.fetch(request('/'),{...env,STAGE_ENABLED:'false'})).status,503);
  assert.equal((await worker.fetch(new Request('https://other.invalid/'),env)).status,403);
});
test('Legacy history is read-only, owner-bound by default, developer-only for all, and never summed/imported',async()=>{
  const f=fixture(),requests=[];let role='USER';
  const worker=integratedWorker({authenticate:async()=>({id,role}),accountWorker:{fetch:async request=>{requests.push(request);return Response.json({activity:{answers:3}});}}});
  const env={DB:f.raw,STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'test.invalid'};
  const call=query=>worker.fetch(new Request('https://test.invalid/api/stats/history?'+query,{headers:{Cookie:'fixture'}}),env);
  const value=await(await call('user='+'b'.repeat(32)+'&role=DEVELOPER&from=2026-10-01')).json();
  assert.equal(value.historySource,'legacy-r2-readonly');assert.equal(value.importedIntoTurso,false);assert.equal(value.combinedWithNewActivity,false);
  const url=new URL(requests[0].url);assert.equal(url.pathname,'/api/stats');assert.equal(url.searchParams.get('user'),id);assert.equal(url.searchParams.get('as'),'user');assert.equal(url.searchParams.has('role'),false);
  assert.equal((await call('scope=all')).status,403);role='DEVELOPER';assert.equal((await call('scope=all')).status,200);
  assert.equal(new URL(requests[1].url).searchParams.has('user'),false);assert.ok(requests.every(r=>r.method==='GET'));assert.equal(f.calls.length,0);
});
