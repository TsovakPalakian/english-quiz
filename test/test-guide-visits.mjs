import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {GuideVisits} from '../src/guide-visits.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key))');
  const args=c=>c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={
    read:async(q,a=[])=>sql.prepare(q).all(...a),
    atomic:async commands=>{sql.exec('BEGIN');try{for(const c of commands)sql.prepare(c.sql).run(...args(c));sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}},
  };
  return {sql,service:new GuideVisits(db),db,close:()=>sql.close()};
}

test('guide visits count views and unique visitors',async()=>{
  const f=fixture();
  try{
    assert.deepEqual(await f.service.stats(),{views:0,uniques:0});
    assert.deepEqual(await f.service.hit('visitor-aaaa'),{views:1,uniques:1});
    assert.deepEqual(await f.service.hit('visitor-aaaa'),{views:2,uniques:1});
    assert.deepEqual(await f.service.hit('visitor-bbbb'),{views:3,uniques:2});
  }finally{f.close();}
});

test('guide visits endpoint accepts anonymous POST',async()=>{
  const f=fixture();
  try{
    const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',DB:{prepare(){return {};}}};
    const app=integratedWorker({authenticate:async()=>null,studyDatabase:()=>f.db});
    const get=await app.fetch(new Request('https://accounts.example/api/guide/visits'),env,{});
    assert.equal(get.status,200);
    assert.deepEqual(await get.json(),{views:0,uniques:0});
    const post=await app.fetch(new Request('https://accounts.example/api/guide/visits',{method:'POST',headers:{Origin:'https://accounts.example','Content-Type':'application/json'},body:JSON.stringify({visitor:'device-abcdef12'})}),env,{});
    assert.equal(post.status,200);
    assert.deepEqual(await post.json(),{views:1,uniques:1});
  }finally{f.close();}
});
