import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {everydayGroups} from '../src/essential-data.mjs';
import {grammarDetails,grammarGroupNames} from '../src/grammar-content.mjs';
import {seedEssential} from './seed-essential.mjs';
import {applyTursoSchema} from './turso-test-schema.mjs';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');applyTursoSchema(sqlite);
  const db={read:async(sql,args=[])=>sqlite.prepare(sql).all(...args),atomic:async commands=>{
    assert.ok(commands.length<=201,'Bounded import transactions');
    sqlite.exec('BEGIN');try{for(const command of commands)sqlite.prepare(command.sql).run(...command.args.map(arg=>arg.type==='null'?null:arg.type==='integer'?Number(arg.value):arg.value));sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}
  }};return {sqlite,db};
}

test('Every Essential topic has complete, distinct entries and bilingual examples',()=>{
  const topics=everydayGroups.flatMap(group=>group.topics),entries=topics.flatMap(topic=>topic.entries);
  assert.equal(everydayGroups.length,3);assert.ok(topics.length>=120);assert.ok(entries.length>=1300);
  assert.equal(new Set(topics.map(topic=>topic.id)).size,topics.length);
  for(const topic of topics){
    assert.ok(topic.entries.length>0,topic.title);
    assert.equal(new Set(topic.entries.map(entry=>entry.en.toLowerCase())).size,topic.entries.length,topic.title);
    for(const entry of topic.entries){
      for(const field of ['en','ru','example','exampleRu','pos'])assert.ok(entry[field]?.trim(),topic.title+': '+entry.en+' '+field);
      assert.match(entry.ru,/[а-яё]/i);assert.match(entry.exampleRu,/[а-яё]/i);assert.match(entry.example,/[a-z]/i);
    }
  }
  const find=title=>topics.find(topic=>topic.title===title);
  assert.equal(find('Fruits and berries').entries.length,40);
  assert.equal(find('Scientific disciplines').entries.length,30);
  assert.equal(find('Question words').entries.find(entry=>entry.en==='who').pos,'pronoun');
  assert.equal(find('Countries and nationalities').entries.find(entry=>entry.en==='French').pos,'adjective');
  assert.deepEqual(topics.find(topic=>topic.id==='basic-1').entries.map(entry=>entry.en),['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
  assert.deepEqual(topics.find(topic=>topic.id==='basic-16').entries.map(entry=>entry.en),['I','you','he','she','it','we','they']);
});

test('Every grammatical term has a bilingual detail and six translated examples',()=>{
  const context={window:{}};runInNewContext(readFileSync(new URL('../production/grammar-categories.js',import.meta.url),'utf8'),context);
  let count=0;
  for(const group of context.window.GrammarCategories){
    assert.ok(grammarGroupNames[group.id]);
    for(const [title] of group.cards){count++;const detail=grammarDetails[title];assert.ok(detail,title);
      for(const field of ['ru','en','definition','pattern','patternRu','contrast','contrastRu'])assert.ok(detail[field].length>1,title+' '+field);
      assert.equal(detail.examples.length,6,title);for(const [en,ru] of detail.examples){assert.ok(en);assert.match(ru,/[а-яё]/i);}
    }
  }
  assert.equal(count,Object.keys(grammarDetails).length);
  const vocabulary=everydayGroups.find(group=>group.id==='topics').topics.find(topic=>topic.id==='topic-grammar');
  assert.equal(vocabulary.entries.length,count);assert.ok(vocabulary.entries.every(entry=>entry.source==='Grammatical Categories'));
});

test('Essential import reuses meanings, preserves existing cards and deletions, and is idempotent',async()=>{
  const {sqlite,db}=fixture();try{
    sqlite.exec("INSERT INTO cards(id,scope,en,word_key,ru,part_of_speech,extra_json) VALUES(42,'shared','apple','apple','яблоко','noun','{\"uk\":\"original IPA\"}')");
    const entry={en:'apple',ru:'яблоко',pos:'noun',example:'Try an apple.',exampleRu:'Попробуй яблоко.'};
    const groups=[{id:'topics',title:'Topics',topics:[{id:'fruit',title:'Fruit',entries:[entry]},{id:'science',title:'Science',entries:[{...entry,source:'Grammatical Categories'},{...entry,en:'apple tree',ru:'яблоня'}]}]}];
    const plan=await seedEssential(db,groups);assert.equal(plan.reused,2);assert.equal(plan.newDefinitions,1);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM cards').get().n,1,'Planning is read-only');
    await seedEssential(db,groups,{apply:true});
    let doc=JSON.parse(sqlite.prepare("SELECT value_json FROM catalog_documents WHERE namespace='everyday'").get().value_json);
    assert.equal(doc.groups[0].topics[0].entries[0].cardId,42);assert.equal(doc.groups[0].topics[1].entries[0].cardId,42);
    assert.equal(doc.groups[0].topics[1].entries[0].source,'Grammatical Categories');
    assert.equal(JSON.parse(sqlite.prepare('SELECT extra_json FROM cards WHERE id=42').get().extra_json).uk,'original IPA');
    assert.equal(JSON.parse(sqlite.prepare('SELECT extra_json FROM cards WHERE id<>42').get().extra_json).level,undefined);
    doc.removedReferences=['fruit:42'];doc.groups[0].topics[0].entries=[];
    sqlite.prepare("UPDATE catalog_documents SET value_json=? WHERE namespace='everyday'").run(JSON.stringify(doc));
    await seedEssential(db,groups,{apply:true});
    doc=JSON.parse(sqlite.prepare("SELECT value_json FROM catalog_documents WHERE namespace='everyday'").get().value_json);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM cards').get().n,2);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM legacy_ids').get().n,3);
    assert.equal(doc.groups[0].topics[0].entries.length,0);assert.equal(doc.groups[0].topics[1].entries[0].cardId,42);
  }finally{sqlite.close();}
});

test('Full catalog imports in bounded batches without duplicate definitions on repeat',async()=>{
  const {sqlite,db}=fixture();try{
    const plan=await seedEssential(db,everydayGroups);await seedEssential(db,everydayGroups,{apply:true});
    const count=sqlite.prepare('SELECT count(*) n FROM cards').get().n;assert.equal(count,plan.newDefinitions);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM legacy_ids WHERE source_namespace='EVERYDAY'").get().n,plan.entries);
    await seedEssential(db,everydayGroups,{apply:true});assert.equal(sqlite.prepare('SELECT count(*) n FROM cards').get().n,count);
    await assert.rejects(seedEssential(db,[{topics:[{id:'bad',entries:[{en:'incomplete'}]}]}]),/Incomplete/);
  }finally{sqlite.close();}
});
