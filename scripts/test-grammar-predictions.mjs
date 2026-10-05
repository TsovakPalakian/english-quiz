import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {addPredictions,predictions,predictionCommands} from './add-grammar-predictions.mjs';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key))');
  const grammar={areas:[{id:'future',title:'Keep this'}],topics:Object.fromEntries(predictions.topic.related.map(id=>[id,{id,name:'Existing '+id}])),other:{cardId:'unchanged'}};
  sqlite.prepare('INSERT INTO catalog_documents VALUES(?,?,?)').run('static','GRAMMAR',JSON.stringify(grammar));
  sqlite.prepare('INSERT INTO catalog_documents VALUES(?,?,?)').run('static','OTHER','{"keep":true}');
  const db={read:async(sql,args=[])=>sqlite.prepare(sql).all(...args),atomic:async commands=>{
    sqlite.exec('BEGIN');try{for(const command of commands)sqlite.prepare(command.sql).all(...command.args.map(arg=>arg.type==='null'?null:arg.value));sqlite.exec('COMMIT');}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }};
  return {sqlite,db,grammar};
}
test('Predictions is additive, backed up before writing and idempotent',async()=>{
  const f=fixture();try{
    let backup='';assert.equal((await addPredictions(f.db,value=>{backup=value;})).writes,1);
    assert.deepEqual(JSON.parse(backup),f.grammar);
    const saved=JSON.parse((await f.db.read("SELECT value_json FROM catalog_documents WHERE key='GRAMMAR'"))[0].value_json);
    assert.deepEqual(saved.topics.will,f.grammar.topics.will);assert.deepEqual(saved.other,f.grammar.other);assert.equal(saved.areas.length,2);
    assert.equal((await addPredictions(f.db)).writes,0);assert.equal((await f.db.read("SELECT value_json FROM catalog_documents WHERE key='OTHER'"))[0].value_json,'{"keep":true}');
    assert.ok(predictionCommands()[0].args.reduce((n,arg)=>n+arg.value.length,0)<8000);
  }finally{f.sqlite.close();}
});
test('An existing different topic or partial menu is never overwritten',async()=>{
  for(const partial of [false,true]){
    const f=fixture();try{
      if(partial)f.grammar.areas.push({id:'predictions',title:'User menu'});else f.grammar.topics.predictions={name:'User topic'};
      const before=JSON.stringify(f.grammar);f.sqlite.prepare("UPDATE catalog_documents SET value_json=? WHERE key='GRAMMAR'").run(before);
      await assert.rejects(addPredictions(f.db));assert.equal((await f.db.read("SELECT value_json FROM catalog_documents WHERE key='GRAMMAR'"))[0].value_json,before);
    }finally{f.sqlite.close();}
  }
});
test('Concurrent insertion aborts the patch instead of changing an existing topic',async()=>{
  const f=fixture();try{
    const racing={...f.grammar,topics:{...f.grammar.topics,predictions:{name:'Concurrent topic'}}};
    f.sqlite.prepare("UPDATE catalog_documents SET value_json=? WHERE key='GRAMMAR'").run(JSON.stringify(racing));
    await assert.rejects(f.db.atomic(predictionCommands()));
    assert.deepEqual(JSON.parse((await f.db.read("SELECT value_json FROM catalog_documents WHERE key='GRAMMAR'"))[0].value_json),racing);
  }finally{f.sqlite.close();}
});
