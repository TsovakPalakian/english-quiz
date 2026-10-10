// Offline-first migration of own entity TEXT ids to INTEGER ids.
// Remote apply is explicit and limited to the test Turso database.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {credentials,pipeline,execute,rows} from './turso-staging.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const migration=readFileSync(resolve(root,'migrations/turso/006_integer_entity_ids.sql'),'utf8');
const sep='\u001f';
const keyKind={cardId:'card',lessonId:'lesson',groupId:'group',examId:'exam',collectionId:'quiz_collection',quizId:'quiz',profileId:'profile',itemId:'library'};

export function remapJson(value,maps){
  function mapped(kind,item){
    if(typeof item==='number'&&Number.isSafeInteger(item)&&item>0)return item;
    if(typeof item==='string'&&maps[kind]?.has(item))return maps[kind].get(item);
    return item;
  }
  function walk(node){
    if(Array.isArray(node))return node.map(walk);
    if(!node||typeof node!=='object')return node;
    const next={};
    let block=node.blockId;
    if(typeof node.lessonId==='string'&&typeof node.blockId==='string'&&maps.lesson_block?.has(node.lessonId+sep+node.blockId))
      block=maps.lesson_block.get(node.lessonId+sep+node.blockId);
    for(const [key,item] of Object.entries(node)){
      if(key==='lessonIds'&&Array.isArray(item))next[key]=item.map(id=>mapped('lesson',id));
      else if(key==='blockId')next[key]=block===node.blockId?mapped('lesson_block',item):block;
      else if(keyKind[key])next[key]=mapped(keyKind[key],item);
      else if((key==='stageId'||key==='id')&&typeof item==='string'){
        const hits=Object.entries(maps).filter(([,map])=>map.has(item));
        next[key]=hits.length===1?hits[0][1].get(item):walk(item);
      }else next[key]=walk(item);
    }
    return next;
  }
  return walk(value);
}

function mapsFrom(db){
  const maps={};
  for(const row of db.prepare('SELECT entity_kind,old_id,new_id FROM entity_id_legacy').all())
    (maps[row.entity_kind]||=new Map()).set(row.old_id,row.new_id);
  return maps;
}

export function rewriteJson(db){
  const maps=mapsFrom(db);
  const jobs=[
    ['catalog_documents',"SELECT namespace||char(31)||key row_key,value_json json FROM catalog_documents","UPDATE catalog_documents SET value_json=? WHERE namespace||char(31)||key=?"],
    ['lesson_blocks','SELECT id row_key,content_json json FROM lesson_blocks','UPDATE lesson_blocks SET content_json=? WHERE id=?'],
    ['cards','SELECT id row_key,extra_json json FROM cards','UPDATE cards SET extra_json=? WHERE id=?'],
    ['library_items','SELECT id row_key,content_json json FROM library_items','UPDATE library_items SET content_json=? WHERE id=?'],
    ['exam_materials','SELECT id row_key,content_json json FROM exam_materials','UPDATE exam_materials SET content_json=? WHERE id=?'],
    ['lesson_responses',"SELECT profile_id||char(31)||lesson_id||char(31)||block_id row_key,response_json json FROM lesson_responses","UPDATE lesson_responses SET response_json=? WHERE profile_id||char(31)||lesson_id||char(31)||block_id=?"]
  ];
  let changed=0;
  for(const [source,select,update] of jobs){
    const write=db.prepare(update);
    for(const row of db.prepare(select).all()){
      const key=String(row.row_key);
      if(db.prepare('SELECT 1 ok FROM entity_json_progress WHERE source=? AND row_key=?').get(source,key))continue;
      const next=JSON.stringify(remapJson(JSON.parse(row.json),maps));
      if(next!==row.json){write.run(next,row.row_key);changed++;}
      db.prepare('INSERT INTO entity_json_progress(source,row_key) VALUES(?,?)').run(source,key);
    }
  }
  return changed;
}

export function verifyLocal(db){
  const bad=db.prepare(`SELECT
    (SELECT count(*) FROM cards WHERE typeof(id)<>'integer' OR id<1)
    +(SELECT count(*) FROM lessons WHERE typeof(id)<>'integer' OR id<1)
    +(SELECT count(*) FROM study_profiles WHERE typeof(id)<>'integer' OR id<1)
    +(SELECT count(*) FROM lesson_blocks WHERE typeof(id)<>'integer' OR id<1)
    +(SELECT count(*) FROM library_items WHERE typeof(id)<>'integer' OR id<1)
    +(SELECT count(*) FROM quizzes WHERE typeof(id)<>'integer' OR id<1)
    +(SELECT count(*) FROM exams WHERE typeof(id)<>'integer' OR id<1)
    +(SELECT count(*) FROM class_groups WHERE typeof(id)<>'integer' OR id<1) n`).get().n;
  const fk=db.prepare('PRAGMA foreign_key_check').all();
  const version=db.prepare('SELECT version FROM schema_migrations WHERE version=6').get();
  if(bad||fk.length||!version)throw new Error('Integer entity migration verification failed');
  return {verified:true,legacy:db.prepare('SELECT count(*) n FROM entity_id_legacy').get().n};
}

export function applyLocal(db){
  const ready=db.prepare("SELECT 1 ok FROM schema_migrations WHERE version=6").get();
  const cards=db.prepare("SELECT type FROM pragma_table_info('cards') WHERE name='id'").get();
  if(!(ready&&cards?.type==='INTEGER')){
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Foreign keys are already violated');
    if(!db.prepare("SELECT 1 ok FROM sqlite_master WHERE name='exams'").get())
      for(const name of ['003_exams.sql','004_groups.sql','005_exam_titles.sql'])db.exec(readFileSync(resolve(root,'migrations/turso/'+name),'utf8'));
    else if(!db.prepare("SELECT 1 ok FROM pragma_table_info('exams') WHERE name='title'").get())
      db.exec(readFileSync(resolve(root,'migrations/turso/005_exam_titles.sql'),'utf8'));
    db.exec(migration);
  }
  rewriteJson(db);
  return verifyLocal(db);
}

async function main(){
  const mode=process.argv[2]||'plan';
  if(!['plan','verify'].includes(mode)||process.argv.length>3)
    throw new Error('Usage: node scripts/migrate-turso-integer-ids.mjs plan|verify');
  const config=credentials();
  const [versions]=await pipeline(config,[execute('SELECT version FROM schema_migrations ORDER BY version')]);
  const applied=rows(versions).map(row=>row.version);
  if(mode==='plan'){console.log(JSON.stringify({versions:applied,remoteWrite:false}));return;}
  if(!applied.includes(6))throw new Error('Version 6 is not applied. Run the offline copy first.');
  console.log(JSON.stringify({versions:applied,remoteWrite:false}));
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))main();
