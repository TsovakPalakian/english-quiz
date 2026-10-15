import {everydayGroups} from '../src/essential-data.mjs';
import {TursoStudyClient,statement as s} from '../src/turso-study.mjs';
import {productionCredentials} from './import-turso-production.mjs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdtempSync,writeFileSync} from 'node:fs';

export async function seedEssential(db,groups,{apply=false}={}){
const topicIds=new Set();
for(const group of groups)for(const topic of group.topics){
  if(!topic.id||topicIds.has(topic.id))throw new Error('Duplicate or missing topic ID.');
  topicIds.add(topic.id);const words=new Set();
  for(const entry of topic.entries){
    if(['en','ru','example','exampleRu','pos'].some(key=>typeof entry[key]!=='string'||!entry[key].trim()))throw new Error('Incomplete entry in '+topic.id);
    const key=entry.en.toLowerCase();if(words.has(key))throw new Error('Duplicate entry in '+topic.id);words.add(key);
  }
}
const [previousRow]=await db.read("SELECT value_json FROM catalog_documents WHERE namespace='everyday' AND key='v1'");
const previous=previousRow?JSON.parse(previousRow.value_json):null;
const entries=groups.flatMap(group=>group.topics.flatMap(topic=>topic.entries.map(entry=>({...entry,key:topic.id+':'+entry.en.toLowerCase()}))));
const words=[...new Set(entries.map(entry=>entry.en.toLowerCase()))];
const existing=[];
for(let offset=0;offset<words.length;offset+=300){const batch=words.slice(offset,offset+300);existing.push(...await db.read(`SELECT id,en,ru,part_of_speech FROM cards WHERE scope='shared' AND deleted_at IS NULL AND lower(en) IN (${batch.map(()=>'?').join(',')}) ORDER BY id`,batch));}
const senses=text=>text.toLowerCase().split(/[;,\n]/).map(value=>value.trim()).filter(Boolean);
const aliases={meet:['встречаться','знакомиться']};
const match=entry=>existing.find(card=>card.en.toLowerCase()===entry.en.toLowerCase()&&[...senses(entry.ru),...(aliases[entry.en]||[])].some(sense=>senses(card.ru).includes(sense))&&(!card.part_of_speech||card.part_of_speech===entry.pos));
const reused=entries.filter(match).length;
const summary={groups:groups.length,subgroups:topicIds.size,populated:groups.flatMap(group=>group.topics).filter(topic=>topic.entries.length).length,entries:entries.length,reused,newDefinitions:new Set(entries.filter(entry=>!match(entry)).map(entry=>JSON.stringify([entry.en.toLowerCase(),entry.ru,entry.pos]))).size};
if(!apply)return summary;
await db.atomic([s("INSERT OR IGNORE INTO migration_runs(id,source_manifest_sha256,status) VALUES('everyday-v1',?,'verified')",[createHash('sha256').update(JSON.stringify(groups)).digest('hex')])]);
let commands=[];
for(const entry of entries){
  const found=match(entry);
  if(!found)commands.push(s(`INSERT INTO cards(scope,en,word_key,ru,part_of_speech,extra_json)
    SELECT 'shared',?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM legacy_ids WHERE entity_kind='card' AND source_namespace='EVERYDAY' AND source_key=?)
    AND NOT EXISTS(SELECT 1 FROM cards WHERE scope='shared' AND deleted_at IS NULL AND lower(en)=lower(?) AND ru=? AND part_of_speech=?)`,
  [entry.en,entry.en.toLowerCase(),entry.ru,entry.pos,JSON.stringify({...(entry.level?{level:entry.level}:{}),data:{wooordhunt:{examples:[{en:entry.example,ru:entry.exampleRu}]},usages:[{en:entry.example,ru:entry.exampleRu,kind:'simple',source:entry.source||'Essential English'}]}}),entry.key,entry.en,entry.ru,entry.pos]));
  commands.push(s(`INSERT OR IGNORE INTO legacy_ids(entity_kind,source_namespace,source_key,target_id,migration_id)
    SELECT 'card','EVERYDAY',?,CAST(id AS TEXT),'everyday-v1' FROM cards WHERE scope='shared' AND deleted_at IS NULL AND ${found?'id=?':'lower(en)=lower(?) AND ru=? AND part_of_speech=?'}
    AND NOT EXISTS(SELECT 1 FROM legacy_ids WHERE entity_kind='card' AND source_namespace='EVERYDAY' AND source_key=?) ORDER BY id LIMIT 1`,
  [entry.key,...(found?[found.id]:[entry.en,entry.ru,entry.pos]),entry.key]));
  // Reference inserts are idempotent, so interrupted batches can be resumed.
  if(commands.length>=200){await db.atomic(commands);commands=[];}
}
if(commands.length)await db.atomic(commands);
const links=await db.read("SELECT source_key,target_id FROM legacy_ids WHERE entity_kind='card' AND source_namespace='EVERYDAY'");
const ids=new Map(links.map(row=>[row.source_key,Number(row.target_id)]));
const catalogGroups=groups.map(group=>({...group,topics:group.topics.map(topic=>({...topic,entries:topic.entries.map(entry=>{
  const cardId=ids.get(topic.id+':'+entry.en.toLowerCase());if(!cardId)throw new Error('Missing seeded card reference.');
  return {cardId,example:entry.example,exampleRu:entry.exampleRu,...(entry.source?{source:entry.source}:{})};
})}))}));
const removed=new Set(previous?.removedReferences||[]);
for(const group of catalogGroups)for(const topic of group.topics)topic.entries=topic.entries.filter(entry=>!removed.has(topic.id+':'+entry.cardId));
const document=JSON.stringify({version:(previous?.version||0)+1,groups:catalogGroups,removedReferences:[...removed]});
await db.atomic([s('CREATE TEMP TABLE essential_seed_guard(ok INTEGER NOT NULL CHECK(ok=1))'),
  previous?s("UPDATE catalog_documents SET value_json=? WHERE namespace='everyday' AND key='v1' AND json_extract(value_json,'$.version')=?",[document,previous.version]):s("INSERT INTO catalog_documents(namespace,key,value_json) VALUES('everyday','v1',?)",[document]),
  s('INSERT INTO essential_seed_guard SELECT changes()=1'),s('DROP TABLE essential_seed_guard')]);
return {status:'seeded',...summary};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [mode,file]=process.argv.slice(2);
  if(!['--plan','--apply'].includes(mode)||!file)throw new Error('Use --plan or --apply with the production credential file.');
  const db=new TursoStudyClient({...productionCredentials(file),mode:'production'});
  let backup;
  if(mode==='--apply'){
    const rows=await db.read("SELECT namespace,key,value_json FROM catalog_documents WHERE namespace='everyday' AND key='v1'");
    backup=resolve(mkdtempSync('/private/tmp/essential-catalog-before-'),'catalog.json');
    writeFileSync(backup,JSON.stringify(rows),{mode:0o600});
  }
  console.log(JSON.stringify({...await seedEssential(db,everydayGroups,{apply:mode==='--apply'}),...(backup?{backup}:{})}));
}
