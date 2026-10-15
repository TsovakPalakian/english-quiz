import {test} from 'node:test';
import assert from 'node:assert/strict';
import {developerValues,importDeveloper} from './neon-import-developer.mjs';
const row={id:'developer-id',login:'TsovakDev',email:'dev@example.test',name:'Developer',password_salt:'fixture-salt',password_hash:'fixture-hash',password_iterations:100000,role:'DEVELOPER',is_personal_data_revoked:0,revoked_at:null,hidden:0,active:1,created_at:1700000000};
const columns=Object.keys(row);
const saved=()=>Object.fromEntries(columns.map((key,i)=>[key,developerValues(row)[i]]));
test('preserved password parameters, identity, booleans and timestamp',()=>{
  const values=developerValues(row);assert.equal(values[0],row.id);assert.equal(values[5],row.password_hash);
  assert.equal(values[11],true);assert.equal(values[12],'2023-11-14T22:13:20.000Z');
  assert.throws(()=>developerValues({...row,role:'USER'}));
  assert.throws(()=>developerValues({...row,active:0}));
});
test('imported one account and reference; repeated imports are idempotent',async()=>{
  let present=false,transactions=0;
  const sql={query:async()=>present?[saved()]:[],transaction:async queries=>{await Promise.all(queries);present=true;transactions++;}};
  assert.equal((await importDeveloper(sql,row)).passwordPreserved,true);
  assert.equal((await importDeveloper(sql,row)).stored,true);assert.equal(transactions,2);
});
test('refused conflicting account without writing',async()=>{
  const sql={query:async()=>[{...saved(),password_hash:'different'}],transaction:()=>assert.fail('Must not write')};
  await assert.rejects(importDeveloper(sql,row),/Conflicting Neon account/);
});
