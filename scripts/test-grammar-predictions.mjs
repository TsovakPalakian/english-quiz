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
    sqlite.exec('BEGIN');try{for(const command of commands)sqlite.prepare(command.sql).run(...command.args.map(arg=>arg.type==='null'?null:arg.value));sqlite.exec('COMMIT');}
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
    assert.equal(saved.topics.predictions.examples.length,predictions.topic.examples.length);
    assert.ok(saved.topics.predictions.sections.length>=6);
    assert.ok(saved.topics.predictions.usage.ru.includes('уверенности'));
    assert.equal((await addPredictions(f.db)).writes,0);assert.equal((await f.db.read("SELECT value_json FROM catalog_documents WHERE key='OTHER'"))[0].value_json,'{"keep":true}');
  }finally{f.sqlite.close();}
});
test('An older Predictions topic is replaced and the menu is added if missing',async()=>{
  const f=fixture();try{
    f.grammar.topics.predictions={name:'Old short topic'};
    f.sqlite.prepare("UPDATE catalog_documents SET value_json=? WHERE key='GRAMMAR'").run(JSON.stringify(f.grammar));
    const result=await addPredictions(f.db);
    assert.equal(result.status,'updated-and-verified');
    const saved=JSON.parse((await f.db.read("SELECT value_json FROM catalog_documents WHERE key='GRAMMAR'"))[0].value_json);
    assert.deepEqual(saved.topics.predictions,predictions.topic);
    assert.deepEqual(saved.areas.filter(area=>area.id==='predictions'),[predictions.area]);
    assert.deepEqual(saved.topics.will,f.grammar.topics.will);
  }finally{f.sqlite.close();}
});
test('predictionCommands write the topic and insert a missing area',async()=>{
  assert.equal(predictionCommands().length,2);
});
