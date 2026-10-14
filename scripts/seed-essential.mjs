import {everydayGroups} from '../src/essential-data.mjs';
import {TursoStudyClient,statement as s} from '../src/turso-study.mjs';
import {productionCredentials} from './import-turso-production.mjs';
import {createHash} from 'node:crypto';
const [mode,file]=process.argv.slice(2);
if(!['--plan','--apply'].includes(mode)||!file)throw new Error('Use --plan or --apply with the production credential file.');
const db=new TursoStudyClient({...productionCredentials(file),mode:'production'});
const [previousRow]=await db.read("SELECT value_json FROM catalog_documents WHERE namespace='everyday' AND key='v1'");
const previous=previousRow?JSON.parse(previousRow.value_json):null;
const entries=everydayGroups.flatMap(group=>group.topics.flatMap(topic=>topic.entries.map(entry=>({...entry,key:topic.id+':'+entry.en.toLowerCase()}))));
const words=[...new Set(entries.map(entry=>entry.en.toLowerCase()))];
const existing=await db.read(`SELECT id,en,ru,part_of_speech FROM cards WHERE scope='shared' AND deleted_at IS NULL AND lower(en) IN (${words.map(()=>'?').join(',')}) ORDER BY id`,words);
const senses=text=>text.toLowerCase().split(/[;,\n]/).map(value=>value.trim()).filter(Boolean);
const aliases={meet:['встречаться','знакомиться']};
const match=entry=>existing.find(card=>card.en.toLowerCase()===entry.en.toLowerCase()&&[...senses(entry.ru),...(aliases[entry.en]||[])].some(sense=>senses(card.ru).includes(sense))&&(!card.part_of_speech||card.part_of_speech===entry.pos));
const reused=entries.filter(match).length;
if(mode==='--plan'){console.log(JSON.stringify({groups:everydayGroups.length,subgroups:80,populated:9,entries:entries.length,reused,newDefinitions:entries.length-reused}));process.exit(0);}
const commands=[s("INSERT OR IGNORE INTO migration_runs(id,source_manifest_sha256,status) VALUES('everyday-v1',?,'verified')",[createHash('sha256').update(JSON.stringify(everydayGroups)).digest('hex')])];
for(const entry of entries){
  const found=match(entry);
  if(!found)commands.push(s(`INSERT INTO cards(scope,en,word_key,ru,part_of_speech,extra_json)
    SELECT 'shared',?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM legacy_ids WHERE entity_kind='card' AND source_namespace='EVERYDAY' AND source_key=?)
    AND NOT EXISTS(SELECT 1 FROM cards WHERE scope='shared' AND deleted_at IS NULL AND lower(en)=lower(?) AND ru=? AND part_of_speech=?)`,
  [entry.en,entry.en.toLowerCase(),entry.ru,entry.pos,JSON.stringify({level:'A1',data:{wooordhunt:{examples:[{en:entry.example,ru:entry.exampleRu}]},usages:[{en:entry.example,ru:entry.exampleRu,kind:'simple',source:'Essential English'}]}}),entry.key,entry.en,entry.ru,entry.pos]));
  commands.push(s(`INSERT OR IGNORE INTO legacy_ids(entity_kind,source_namespace,source_key,target_id,migration_id)
    SELECT 'card','EVERYDAY',?,CAST(id AS TEXT),'everyday-v1' FROM cards WHERE scope='shared' AND deleted_at IS NULL AND ${found?'id=?':'lower(en)=lower(?) AND ru=? AND part_of_speech=?'}
    AND NOT EXISTS(SELECT 1 FROM legacy_ids WHERE entity_kind='card' AND source_namespace='EVERYDAY' AND source_key=?) ORDER BY id LIMIT 1`,
  [entry.key,...(found?[found.id]:[entry.en,entry.ru,entry.pos]),entry.key]));
}
await db.atomic(commands);
const links=await db.read("SELECT source_key,target_id FROM legacy_ids WHERE entity_kind='card' AND source_namespace='EVERYDAY'");
const ids=new Map(links.map(row=>[row.source_key,Number(row.target_id)]));
const groups=everydayGroups.map(group=>({...group,topics:group.topics.map(topic=>({...topic,entries:topic.entries.map(entry=>{
  const cardId=ids.get(topic.id+':'+entry.en.toLowerCase());if(!cardId)throw new Error('Missing seeded card reference.');
  return {cardId,example:entry.example,exampleRu:entry.exampleRu};
})}))}));
const removed=new Set(previous?.removedReferences||[]);
for(const group of groups)for(const topic of group.topics)topic.entries=topic.entries.filter(entry=>!removed.has(topic.id+':'+entry.cardId));
const document=JSON.stringify({version:(previous?.version||0)+1,groups,removedReferences:[...removed]});
await db.atomic([s('CREATE TEMP TABLE essential_seed_guard(ok INTEGER NOT NULL CHECK(ok=1))'),
  previous?s("UPDATE catalog_documents SET value_json=? WHERE namespace='everyday' AND key='v1' AND json_extract(value_json,'$.version')=?",[document,previous.version]):s("INSERT INTO catalog_documents(namespace,key,value_json) VALUES('everyday','v1',?)",[document]),
  s('INSERT INTO essential_seed_guard SELECT changes()=1'),s('DROP TABLE essential_seed_guard')]);
console.log(JSON.stringify({status:'seeded',entries:entries.length,reused,groups:everydayGroups.length,populated:9}));
