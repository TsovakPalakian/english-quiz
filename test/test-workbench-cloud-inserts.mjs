import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mergedD1Insert} from '../ops/provision-workbench-resources.mjs';
test('cloud import merges parameterized inserts without changing values or column order',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE source(id INTEGER PRIMARY KEY, value TEXT)');
    const sql='INSERT INTO "source"("id","value") VALUES(?,?)';
    const merged=mergedD1Insert([{sql,params:[1,"quoted '\u0000 text"]},{sql,params:[2,null]}]);
    db.prepare(merged.sql).run(...merged.params);
    assert.deepEqual(db.prepare('SELECT id, hex(value) AS value FROM source ORDER BY id').all().map(row=>({...row})),[{id:1,value:Buffer.from("quoted '\u0000 text").toString('hex').toUpperCase()},{id:2,value:''}]);
    assert.throws(()=>mergedD1Insert(Array.from({length:51},()=>({sql,params:[1,2]}))));
    assert.throws(()=>mergedD1Insert([{sql,params:[1,2]},{sql:'DELETE FROM source',params:[]}]));
  }finally{db.close();}
});
