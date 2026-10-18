import {statement as s} from '../src/learning-study.mjs';
// Read-only TEST Learning backup, offline restore and compatibility export.
import {readFileSync,writeFileSync,mkdtempSync,chmodSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {legacyState,legacyLessons,legacyTexts} from '../src/learning-legacy-read.mjs';
import {localMediaStore} from './learning-local-media.mjs';
import {localMediaReferences,writeLocalMediaBackup,verifyLocalMediaBackup,restoreLocalMediaBackup,localMediaArchiveStore} from './learning-media-backup.mjs';
import {writeSourceMediaBackup,verifySourceMediaBackup,restoreSourceMediaBackup,cloudflareMediaReader} from './learning-source-media.mjs';
import {defaultSnapshot} from './run-learning-stage.mjs';
import {stageMediaArchiveStore} from './learning-stage-media-backup.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const tableHash=rows=>hash(canonical(rows.map(canonical).sort()));
const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!k.startsWith('stage')).map(([k,x])=>[k,clean(x)])):v;
export async function snapshot(db){
  const sql="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name";
  const schema=await db.read(sql),tables=schema.filter(row=>row.type==='table').map(row=>row.name);
  if(!tables.length||tables.some(name=>! /^[a-z_][a-z0-9_]*$/.test(name)))throw new Error('Unsafe schema.');
  const [before,...results]=await db.readMany([s(sql),...tables.map(name=>s('SELECT * FROM '+name)),s(sql)]);
  const after=results.pop();assert.deepEqual(before,schema);assert.deepEqual(after,schema);
  return {version:1,testOnly:true,createdAt:new Date().toISOString(),schema,tables:Object.fromEntries(tables.map((name,i)=>[name,results[i]]))};
}
export function restore(data,path=':memory:'){
  assert.equal(data.version,1);assert.equal(data.testOnly,true);
  const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA foreign_keys=ON; BEGIN; PRAGMA defer_foreign_keys=ON;');
  try{
    for(const type of ['table','index','view','trigger'])for(const row of data.schema.filter(row=>row.type===type)){
      if(! /^[a-z_][a-z0-9_]*$/.test(row.name))throw new Error('Unsafe schema ID.');sqlite.exec(row.sql);
    }
    for(const [name,rows] of Object.entries(data.tables)){
      assert.ok(data.schema.some(row=>row.type==='table'&&row.name===name));
      for(const row of rows){const columns=Object.keys(row);if(columns.some(k=>! /^[a-z_][a-z0-9_]*$/.test(k)))throw new Error('Unsafe column ID.');
        sqlite.prepare(`INSERT INTO ${name}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...Object.values(row));}
    }
    sqlite.exec('COMMIT');assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
    for(const [name,rows] of Object.entries(data.tables))assert.equal(tableHash(sqlite.prepare('SELECT * FROM '+name).all()),tableHash(rows));
    return sqlite;
  }catch(error){if(sqlite.isTransaction)sqlite.exec('ROLLBACK');sqlite.close();throw error;}
}
export async function reverse(sqlite){
  const args=cmd=>cmd.args.map(a=>a.type==='null'?null:a.type==='integer'?Number(a.value):a.value);
  const db={read:async(sql,params=[])=>sqlite.prepare(sql).all(...params),readMany:async cmds=>cmds.map(cmd=>sqlite.prepare(cmd.sql).all(...args(cmd)))};
  const accounts=sqlite.prepare('SELECT id FROM account_refs ORDER BY id').all(),states={};
  for(const {id} of accounts){const actor={id,role:'ADMIN'};states[id]={state:clean(await legacyState(db,actor)),texts:clean((await legacyTexts(db,actor)).texts)};}
  const lessons=clean((await legacyLessons(db,{id:'backup_no_owner',role:'ADMIN'})).materials);
  const collections=sqlite.prepare('SELECT * FROM quiz_collections ORDER BY id').all();
  // NULL legacy keys are valid for ID-based collections, but cannot become a
  // shared "null" object key: that would silently overwrite other collections.
  const quizCollections=collections.map(c=>({...c,
    cardIds:sqlite.prepare('SELECT card_id FROM card_quiz_collections WHERE collection_id=? ORDER BY card_id').all(c.id).map(row=>row.card_id),
    quizzes:sqlite.prepare('SELECT * FROM quizzes WHERE collection_id=? ORDER BY position,id').all(c.id)}));
  const cardQuizzes=Object.fromEntries(quizCollections.filter(c=>c.legacy_word_key!==null).map(c=>[c.legacy_word_key,c.quizzes.filter(q=>q.deleted_at===null).map(q=>({id:q.id,type:q.type,items:JSON.parse(q.items_json)}))]));
  // All definitions and owner-bound responses remain losslessly available in
  // the verified SQLite backup. Legacy word-key collisions MUST NOT be guessed.
  const definitions=sqlite.prepare('SELECT * FROM cards ORDER BY id').all();
  const collisions=sqlite.prepare("SELECT word_key,count(*) n FROM cards WHERE scope='shared' GROUP BY word_key HAVING count(*)>1").all().map(row=>({...row,cardIds:definitions.filter(c=>c.scope==='shared'&&c.word_key===row.word_key).map(c=>c.id)}));
  const issues=sqlite.prepare('SELECT reason,count(*) n FROM migration_issues WHERE resolved=0 GROUP BY reason').all();
  // Lossless ID export includes every relation, revision, tombstone and audit
  // row. The old word-key projection above is diagnostic, NEVER an importer.
  const idExport=await snapshot(db);
  return {version:1,status:'review-required-not-for-live-import',cutoverAllowed:false,shared:{lessons,cardQuizzes},accounts:states,definitions,quizCollections,
    idExport,compatibilityImportAllowed:false,
    profileMembers:sqlite.prepare('SELECT * FROM profile_members ORDER BY account_id').all(),
    lessonResponses:sqlite.prepare('SELECT * FROM lesson_responses ORDER BY profile_id,lesson_id,block_id').all(),
    blockers:{wordKeyCollisions:collisions,unmappedQuizCollections:collections.filter(c=>c.legacy_word_key===null).map(c=>c.id),unresolvedMigrationIssues:issues,liveRolesAndPairRoutingNeedReview:true,inlineMediaNeedResolution:true}};
}
export function auditReverse(sqlite,value){
  assert.equal(value.status,'review-required-not-for-live-import');assert.equal(value.cutoverAllowed,false);
  const compare=(table,rows)=>assert.equal(tableHash(rows),tableHash(sqlite.prepare('SELECT * FROM '+table).all()),'Reverse export lost or changed '+table);
  compare('cards',value.definitions);compare('profile_members',value.profileMembers);compare('lesson_responses',value.lessonResponses);
  compare('quiz_collections',value.quizCollections.map(({cardIds,quizzes,...row})=>row));
  compare('quizzes',value.quizCollections.flatMap(c=>c.quizzes));
  compare('card_quiz_collections',value.quizCollections.flatMap(c=>c.cardIds.map(card_id=>({card_id,collection_id:c.id}))));
  assert.equal(value.compatibilityImportAllowed,false);
  assert.equal(value.idExport.version,1);assert.equal(value.idExport.testOnly,true);
  const schema=sqlite.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name").all();
  assert.equal(canonical(value.idExport.schema),canonical(schema),'Reverse export changed schema');
  assert.deepEqual(Object.keys(value.idExport.tables).sort(),schema.filter(r=>r.type==='table').map(r=>r.name).sort());
  for(const [table,rows] of Object.entries(value.idExport.tables))compare(table,rows);
  assert.deepEqual(Object.keys(value.accounts).sort(),sqlite.prepare('SELECT id FROM account_refs ORDER BY id').all().map(row=>row.id));
  return {status:'verified-id-export-review-still-required',cutoverAllowed:false,
    definitions:value.definitions.length,quizCollections:value.quizCollections.length,
    quizzes:value.quizCollections.reduce((n,c)=>n+c.quizzes.length,0),
    deletedQuizzes:value.quizCollections.reduce((n,c)=>n+c.quizzes.filter(q=>q.deleted_at!==null).length,0),
    wordKeyCollisionGroups:value.blockers.wordKeyCollisions.length,unmappedQuizCollections:value.blockers.unmappedQuizCollections.length,
    unresolvedIssues:value.blockers.unresolvedMigrationIssues.reduce((n,row)=>n+row.n,0),idExportTables:Object.keys(value.idExport.tables).length,losslessIdExport:true,compatibilityImportAllowed:false};
}
