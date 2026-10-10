import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {StudyService,recordId} from '../src/turso-study.mjs';
import {applyLocal,remapJson} from './migrate-turso-integer-ids.mjs';

function legacyDb(){
  const db=new DatabaseSync(':memory:');
  for(const name of ['001_content_schema.sql','002_import_audit.sql','003_exams.sql','004_groups.sql','005_exam_titles.sql'])
    db.exec(readFileSync(new URL('../migrations/turso/'+name,import.meta.url),'utf8'));
  db.exec(`INSERT INTO account_refs(id) VALUES('teacher'),('student');
    INSERT INTO study_profiles(id,kind) VALUES('p-b','personal'),('p-a','personal');
    INSERT INTO profile_members VALUES('teacher','p-a'),('student','p-b');
    INSERT INTO lessons(id,title,published) VALUES('lesson-b','B',1),('lesson-a','A',0);
    INSERT INTO cards(id,scope,en,word_key,ru,deleted_at) VALUES('card-b','shared','b','b','bee',NULL),('card-a','shared','a','a','ay',123);
    INSERT INTO lesson_blocks(lesson_id,id,position,type,card_id,content_json) VALUES('lesson-a','block-a',0,'wordcard','card-a','{"cardId":"card-a","lessonId":"lesson-a"}');
    INSERT INTO quiz_collections(id,legacy_word_key) VALUES('collection-b','b'),('collection-a','a');
    INSERT INTO quizzes(id,collection_id,position,type) VALUES('quiz-a','collection-a',0,'Flip');
    INSERT INTO library_items(id,kind,scope,content_json) VALUES('text-a','text','shared','{"id":"text-a","title":"A"}');
    INSERT INTO exams(id,title) VALUES('exam-b','B'),('exam-a','A');
    INSERT INTO class_groups(id,title) VALUES('group-a','A');
    INSERT INTO catalog_documents(namespace,key,value_json) VALUES('static','LESSON_DATA','{"words":[{"cardId":"card-b","id":"user-theme"}]}');
    INSERT INTO migration_runs(id,source_manifest_sha256,status) VALUES('run','unused','verified');
    INSERT INTO legacy_ids VALUES('card','LESSON_DATA','/words/0','card-b','run');`);
  return db;
}
test('Migration keeps every old row, soft-deletes and known JSON ids as integers',()=>{
  const db=legacyDb();
  const before=db.prepare('SELECT count(*) n FROM cards').get().n;
  assert.deepEqual(applyLocal(db),{verified:true,legacy:db.prepare('SELECT count(*) n FROM entity_id_legacy').get().n});
  assert.equal(db.prepare('SELECT count(*) n FROM cards').get().n,before);
  assert.equal(db.prepare("SELECT deleted_at FROM cards WHERE en='a'").get().deleted_at,123);
  assert.equal(db.prepare("SELECT typeof(id) t FROM cards").get().t,'integer');
  assert.deepEqual(db.prepare("SELECT old_id,new_id FROM entity_id_legacy WHERE entity_kind='card' ORDER BY new_id").all().map(row=>[row.old_id,row.new_id]),[['card-a',1],['card-b',2]]);
  assert.equal(db.prepare("SELECT new_id FROM entity_id_legacy WHERE entity_kind='profile' AND old_id='p-a'").get().new_id,1);
  const content=JSON.parse(db.prepare('SELECT content_json FROM lesson_blocks').get().content_json);
  assert.equal(content.cardId,1);assert.equal(content.lessonId,1);
  const catalog=JSON.parse(db.prepare("SELECT value_json FROM catalog_documents WHERE key='LESSON_DATA'").get().value_json);
  assert.equal(catalog.words[0].cardId,2);assert.equal(catalog.words[0].id,'user-theme');
  assert.equal(db.prepare("SELECT target_id FROM legacy_ids").get().target_id,'2');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('SELECT version FROM schema_migrations WHERE version=6').get().version,6);
  db.close();
});
test('JSON remap ignores accounts, mutation ids and places',()=>{
  const maps={card:new Map([['card-a',1]]),lesson:new Map([['lesson-a',4]])};
  assert.deepEqual(remapJson({cardId:'card-a',accountId:'abc',mutationId:'m-1',place:'lesson-07',id:'user-theme',lessonIds:['lesson-a','kept']},maps),
    {cardId:1,accountId:'abc',mutationId:'m-1',place:'lesson-07',id:'user-theme',lessonIds:[4,'kept']});
});
test('Create assigns one database id, replay returns it, and a string id is rejected',async()=>{
  const sqlite=legacyDb();applyLocal(sqlite);
  const args=c=>c.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value);
  const db={read:async(sql,params=[])=>sqlite.prepare(sql).all(...params),atomic:async commands=>{
    sqlite.exec('BEGIN IMMEDIATE');try{for(const c of commands)sqlite.prepare(c.sql).run(...args(c));sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const service=new StudyService(db),teacher={id:'teacher',role:'ADMIN'};
  const body={mutationId:'create-card-001',word:'gamma'};
  const lookup=async()=>({found:true,word:'gamma',ru:'гамма'});
  const created=await service.lookupSharedCard(teacher,body,lookup);
  assert.equal(typeof created.id,'number');assert.ok(created.id>0);
  assert.deepEqual(await service.lookupSharedCard(teacher,body,lookup),created);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM cards WHERE en='gamma'").get().n,1);
  await assert.rejects(service.editCard(teacher,'gamma',{mutationId:'edit-card-0001',expectedRevision:1,changes:{ru:'no'}}),e=>e.status===400);
  assert.throws(()=>recordId('1'),e=>e.status===400);
  const page=sqlite.prepare('SELECT id FROM cards WHERE id>? ORDER BY id LIMIT 1').all(created.id-1);
  assert.equal(page[0].id,created.id);
  sqlite.close();
});
