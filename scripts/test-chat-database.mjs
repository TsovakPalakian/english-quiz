import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareChatDatabase} from '../src/chat-database.mjs';

function fixture(provider='d1'){
  const values=new Map(),writes=[],closed=[];
  let selection={provider,revision:1,scope:'site'},reads=0,unavailable=false;
  const baseEnv={CONTENT_ENABLED:'true',CONTENT_SESSION_SECRET:'fixture-secret',CONTENT_WRITES:'true',CONTENT_MEDIA:{get:async()=>{
    reads++;if(unavailable)throw Error('Unavailable');
    return {json:async()=>structuredClone(selection)};
  }}};
  const store={baseEnv,env:baseEnv,ctx:{getWebSockets:()=>[{close:(...args)=>closed.push(args)}]},
    get(key){return values.has(key)?structuredClone(values.get(key)):null;},
    set(key,value){writes.push({key,value:structuredClone(value)});values.set(key,structuredClone(value));}};
  return {store,values,writes,closed,get reads(){return reads;},get selection(){return selection;},set selection(value){selection=value;},set unavailable(value){unavailable=value;},request({revision=1,writable='1',path='/history',secret='fixture-secret',database=provider}={}){
    return new Request('https://chat.internal'+path,{method:'POST',headers:{'X-Chat-Internal':secret,'X-Chat-Database':database,'X-Chat-Database-Revision':String(revision),...(writable===null?{}:{'X-Chat-Writes':writable})}});
  }};
}

for(const provider of ['d1','neon']){
  test(provider+': initial preparation persists both controls once',async()=>{
    const f=fixture(provider);const result=await prepareChatDatabase(f.store,f.request());
    assert.deepEqual(result,f.selection);assert.deepEqual(f.writes.map(row=>row.key),['_databaseScope','_databaseWritable']);
    assert.equal(f.store.env.CONTENT_WRITES,'true');assert.equal(f.store.env.DB_PROVIDER,provider);assert.equal(Object.isFrozen(f.store.env.DATABASE_SELECTION),true);
  });
  test(provider+': 100 unchanged requests cause no metadata writes and still verify the live selection',async()=>{
    const f=fixture(provider);await prepareChatDatabase(f.store,f.request());f.writes.length=0;
    const before=f.reads;
    for(let i=0;i<100;i++)await prepareChatDatabase(f.store,f.request());
    assert.equal(f.writes.length,0);assert.equal(f.reads-before,100);assert.deepEqual(f.store.env.DATABASE_SELECTION,f.selection);
  });
  test(provider+': reconstructed object reuses persisted controls without rewriting them',async()=>{
    const f=fixture(provider);await prepareChatDatabase(f.store,f.request());f.writes.length=0;
    const restored={...f.store,baseEnv:{...f.store.baseEnv},env:{...f.store.baseEnv}};
    await prepareChatDatabase(restored,f.request());
    assert.deepEqual(f.writes,[]);assert.equal(restored.env.CONTENT_WRITES,'true');
  });
  test(provider+': changing the write flag updates only that control and repeated values are no-ops',async()=>{
    const f=fixture(provider);await prepareChatDatabase(f.store,f.request());f.writes.length=0;
    for(const writable of ['0','0','1','1'])await prepareChatDatabase(f.store,f.request({writable}));
    assert.deepEqual(f.writes,[{key:'_databaseWritable',value:false},{key:'_databaseWritable',value:true}]);
    assert.equal(f.store.env.CONTENT_WRITES,'true');assert.equal(f.closed.length,0);
  });
  test(provider+': websocket preparation retains the persisted read-only state',async()=>{
    const f=fixture(provider);await prepareChatDatabase(f.store,f.request({writable:'0'}));f.writes.length=0;
    await prepareChatDatabase(f.store);await prepareChatDatabase(f.store);
    assert.equal(f.store.env.CONTENT_WRITES,'false');assert.deepEqual(f.writes,[]);
  });
  test(provider+': revision changes still invalidate policy, close sockets and persist the new scope',async()=>{
    const f=fixture(provider);await prepareChatDatabase(f.store,f.request());f.values.set('policy',{allowed:true});f.writes.length=0;
    f.selection={...f.selection,revision:2};await prepareChatDatabase(f.store,f.request({revision:2}));
    assert.deepEqual(f.writes,[{key:'policy',value:null},{key:'_databaseScope',value:f.selection}]);
    assert.equal(f.closed.length,1);assert.equal(f.store.env.DATABASE_SELECTION.revision,2);
    f.writes.length=0;await prepareChatDatabase(f.store,f.request({revision:2}));
    assert.deepEqual(f.writes,[]);assert.equal(f.closed.length,1);
  });
}

test('deployment read-only mode cannot be overridden by an internal write flag',async()=>{
  const f=fixture();f.store.baseEnv.CONTENT_WRITES='false';await prepareChatDatabase(f.store,f.request());f.writes.length=0;
  for(const writable of ['0','1',null]){await prepareChatDatabase(f.store,f.request({writable}));assert.equal(f.store.env.CONTENT_WRITES,'false');}
  assert.deepEqual(f.writes,[]);
});
for(const writable of ['false','true','2',''])test('invalid write flag '+JSON.stringify(writable)+' cannot partially change scope or policy',async()=>{
  const f=fixture();await prepareChatDatabase(f.store,f.request());f.values.set('policy',{allowed:true});f.writes.length=0;f.selection={...f.selection,revision:2};
  await assert.rejects(prepareChatDatabase(f.store,f.request({revision:2,writable})),error=>error.status===403);
  assert.deepEqual(f.writes,[]);assert.equal(f.closed.length,0);assert.equal(f.values.get('_databaseScope').revision,1);assert.deepEqual(f.values.get('policy'),{allowed:true});
});
test('a stale websocket observes a live revision change before any write',async()=>{
  const f=fixture();await prepareChatDatabase(f.store,f.request());f.writes.length=0;f.selection={...f.selection,revision:2};
  await assert.rejects(prepareChatDatabase(f.store),error=>error.status===503&&error.inactiveDatabase);
  assert.deepEqual(f.writes,[]);
});
test('revocation control routes remain available for the inactive scope without redundant writes',async()=>{
  const f=fixture();await prepareChatDatabase(f.store,f.request());f.writes.length=0;f.selection={...f.selection,revision:2};
  for(const path of ['/suspend','/revoke','/revoke-session','/invalidate'])await prepareChatDatabase(f.store,f.request({path}));
  assert.deepEqual(f.writes,[]);assert.equal(f.reads,5);
});
test('foreign provider and invalid internal credentials fail without changing persisted state',async()=>{
  const f=fixture();await prepareChatDatabase(f.store,f.request());f.writes.length=0;
  for(const request of [f.request({database:'neon'}),f.request({secret:'wrong'}),f.request({database:'unknown'})])await assert.rejects(prepareChatDatabase(f.store,request),error=>[403,503].includes(error.status));
  assert.deepEqual(f.writes,[]);assert.equal(f.values.get('_databaseScope').provider,'d1');
});
test('unavailable control storage and a persistent migration fence remain fail-closed',async()=>{
  const f=fixture();await prepareChatDatabase(f.store,f.request());f.writes.length=0;f.unavailable=true;
  await assert.rejects(prepareChatDatabase(f.store,f.request()),error=>error.status===503);f.unavailable=false;
  f.selection={...f.selection,accountTransferFrozen:true};
  await assert.rejects(prepareChatDatabase(f.store,f.request()),error=>error.status===503&&error.migrationFrozen);
  assert.deepEqual(f.writes,[]);
});
test('legacy scope without the site marker is normalized once, not on every request',async()=>{
  const f=fixture();f.values.set('_databaseScope',{provider:'d1',revision:1});f.values.set('_databaseWritable',true);
  await prepareChatDatabase(f.store,f.request());await prepareChatDatabase(f.store,f.request());
  assert.deepEqual(f.writes,[{key:'_databaseScope',value:f.selection}]);
});
