import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {snapshot} from './turso-backup.mjs';
import {importEmpty,remoteSession} from './import-turso-production.mjs';
import {statement} from '../src/turso-study.mjs';
const args=c=>c.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value);
async function fixture(){
  const db=new DatabaseSync(':memory:');
  for(const name of ['001_content_schema.sql','002_import_audit.sql'])db.exec(readFileSync(new URL('../migrations/turso/'+name,import.meta.url),'utf8'));
  db.exec("INSERT INTO account_refs(id) VALUES('retained'); INSERT INTO study_profiles(id,kind) VALUES('same-profile','personal'); INSERT INTO profile_members VALUES('retained','same-profile');");
  const data=await snapshot({read:async(sql,p=[])=>db.prepare(sql).all(...p),readMany:async commands=>commands.map(c=>db.prepare(c.sql).all(...args(c)))});
  db.close();return data;
}
function session(db,{failSql='',corrupt=false}={}){
  const calls=[];return {calls,async execute(commands){return commands.map(c=>{
    calls.push(c.sql);if(failSql&&c.sql.includes(failSql))throw Error('Injected import error');
    const q=db.prepare(c.sql),values=args(c),rows=q.columns().length?q.all(...values):(q.run(...values),[]);
    return corrupt&&c.sql==='SELECT * FROM account_refs'?[{id:'wrong',created_at:0}]:rows;
  });},async close(){if(db.isTransaction)db.exec('ROLLBACK');}};
}
test('Production importer commits all 25 tables with stable IDs, foreign keys and row verification',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const result=await importEmpty(session(db),await fixture());assert.equal(result.status,'committed-and-verified');
    assert.equal(db.prepare('SELECT count(*) n FROM sqlite_master WHERE type=\'table\'').get().n,25);
    assert.equal(db.prepare('SELECT profile_id FROM profile_members').get().profile_id,'same-profile');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});
test('Production importer refuses any existing schema before importing and never modifies existing rows',async()=>{
  const db=new DatabaseSync(':memory:');try{
    db.exec("CREATE TABLE original(id); INSERT INTO original VALUES('keep');");const target=session(db);
    await assert.rejects(importEmpty(target,await fixture()));assert.equal(db.prepare('SELECT id FROM original').get().id,'keep');
    assert.equal(target.calls.some(sql=>sql.startsWith('CREATE TABLE account_refs')),false);assert.equal(db.isTransaction,false);
  }finally{db.close();}
});
test('Production importer rolls back DDL and data on statement failure or mismatched readback',async()=>{
  for(const options of [{failSql:'INSERT INTO profile_members'},{corrupt:true}]){
    const db=new DatabaseSync(':memory:');try{
      await assert.rejects(importEmpty(session(db,options),await fixture()));
      assert.equal(db.prepare('SELECT count(*) n FROM sqlite_master').get().n,0);assert.equal(db.isTransaction,false);
    }finally{db.close();}
  }
});
test('Production importer refuses test endpoints and closes an uncertain commit without automatic retry',async()=>{
  assert.throws(()=>remoteSession({endpoint:'https://english-quiz-test-example.turso.io/v2/pipeline',token:'fixture'}));
  const db=new DatabaseSync(':memory:');try{
    const target=session(db),execute=target.execute;let commits=0;
    target.execute=async commands=>{if(commands[0].sql==='COMMIT'){commits++;throw Error('Lost response');}return execute(commands);};
    await assert.rejects(importEmpty(target,await fixture()),/Commit outcome uncertain/);assert.equal(commits,1);assert.equal(db.isTransaction,false);
  }finally{db.close();}
});
test('Production import protocol carries one baton across chunks and closes the connection without exposing credentials',async()=>{
  const db=new DatabaseSync(':memory:');let calls=0,close=0;
  const fetchImpl=async(endpoint,options)=>{
    assert.equal(endpoint,'https://english-quiz-production-example.turso.io/v2/pipeline');
    const body=JSON.parse(options.body);if(calls++)assert.equal(body.baton,'fixture-baton');
    const results=body.requests.map(request=>{
      if(request.type==='close'){close++;if(db.isTransaction)db.exec('ROLLBACK');return {type:'ok',response:{type:'close'}};}
      const q=db.prepare(request.stmt.sql),values=args(request.stmt),rows=q.columns().length?q.all(...values):(q.run(...values),[]);
      const names=q.columns().map(c=>c.name);
      return {type:'ok',response:{type:'execute',result:{cols:names.map(name=>({name})),rows:rows.map(row=>names.map(name=>row[name]===null?{type:'null'}:typeof row[name]==='number'?{type:'integer',value:String(row[name])}:{type:'text',value:row[name]}))}}};
    });
    return Response.json({baton:'fixture-baton',results});
  };
  try{
    const session=remoteSession({endpoint:'https://english-quiz-production-example.turso.io/v2/pipeline',token:'synthetic-only',fetchImpl});
    assert.equal((await importEmpty(session,await fixture())).status,'committed-and-verified');assert.equal(close,1);assert.ok(calls>25);
  }finally{db.close();}
});
test('Production protocol accepts a confirmed commit that closes its stream without reusing the stale baton',async()=>{
  let calls=0;
  const fetchImpl=async(_endpoint,options)=>{
    const body=JSON.parse(options.body);calls++;
    assert.equal(body.requests[0].type,'execute');
    return Response.json({baton:calls===1?'transaction-baton':null,results:[{type:'ok',response:{type:'execute',
      result:{cols:[],rows:[]}}}]});
  };
  const session=remoteSession({endpoint:'https://english-quiz-production-example.turso.io/v2/pipeline',token:'synthetic-only',fetchImpl});
  await session.execute([statement('BEGIN IMMEDIATE')]);
  await session.execute([statement('COMMIT')]);await session.close();assert.equal(calls,2);
});
