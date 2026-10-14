import {statement as s,cardAccess,accessArgs,StudyError} from './turso-study.mjs';
export async function removeEssentialReference(db,actor,body){
  if(!['ADMIN','DEVELOPER'].includes(actor?.role))throw new StudyError(403,'Teachers only.');
  if(!body||Object.keys(body).some(key=>!['topicId','cardId','expectedVersion'].includes(key))||typeof body.topicId!=='string'||!Number.isSafeInteger(body.cardId)||body.cardId<1||!Number.isSafeInteger(body.expectedVersion))throw new StudyError(400,'Invalid reference.');
  const [row]=await db.read("SELECT value_json FROM catalog_documents WHERE namespace='everyday' AND key='v1'");
  if(!row)throw new StudyError(404,'Catalog not found.');
  const catalog=JSON.parse(row.value_json);if(catalog.version!==body.expectedVersion)throw new StudyError(409,'Catalog changed. Reload it before editing.');
  const topic=catalog.groups.flatMap(group=>group.topics).find(topic=>topic.id===body.topicId);
  if(!topic?.entries.some(entry=>entry.cardId===body.cardId))throw new StudyError(404,'Reference not found.');
  topic.entries=topic.entries.filter(entry=>entry.cardId!==body.cardId);catalog.version++;
  catalog.removedReferences=[...new Set([...(catalog.removedReferences||[]),body.topicId+':'+body.cardId])];
  await db.atomic([s('CREATE TEMP TABLE essential_guard(ok INTEGER NOT NULL CHECK(ok=1))'),s("UPDATE catalog_documents SET value_json=? WHERE namespace='everyday' AND key='v1' AND json_extract(value_json,'$.version')=?",[JSON.stringify(catalog),body.expectedVersion]),s('INSERT INTO essential_guard SELECT changes()=1'),s('DROP TABLE essential_guard')]);
  return {ok:true,version:catalog.version};
}
export async function everydayCatalog(db,actor){
  const [[document],rows,personal]=await db.readMany([
    s("SELECT value_json FROM catalog_documents WHERE namespace='everyday' AND key='v1'"),
    s(`SELECT c.id,c.en,c.ru,c.part_of_speech,c.revision,json_extract(c.extra_json,'$.uk') uk,json_extract(c.extra_json,'$.us') us
      FROM cards c WHERE c.scope='shared' AND ${cardAccess} AND EXISTS(SELECT 1 FROM legacy_ids x WHERE x.entity_kind='card' AND x.source_namespace='EVERYDAY' AND CAST(x.target_id AS INTEGER)=c.id)`,accessArgs(actor)),
    s(`SELECT c.id,c.en,c.ru,c.part_of_speech,c.revision FROM cards c WHERE c.scope='profile' AND ${cardAccess}
      AND EXISTS(SELECT 1 FROM cards shared JOIN legacy_ids x ON CAST(x.target_id AS INTEGER)=shared.id AND x.entity_kind='card' AND x.source_namespace='EVERYDAY' WHERE lower(shared.en)=lower(c.en)) ORDER BY c.id`,accessArgs(actor))
  ]);
  if(!document)return {version:1,groups:[]};
  const catalog=JSON.parse(document.value_json),cards=new Map(rows.map(row=>[row.id,{en:row.en,word:row.en,ru:row.ru,pos:row.part_of_speech,stageId:row.id,stageRevision:row.revision,stageScope:'shared',uk:row.uk||'',us:row.us||''}]));
  const senses=text=>text.toLowerCase().split(/[;,\n]/).map(value=>value.trim()).filter(Boolean);
  for(const [id,card] of cards){
    const own=personal.find(row=>row.en.toLowerCase()===card.en.toLowerCase()&&(!row.part_of_speech||!card.pos||row.part_of_speech===card.pos)&&senses(card.ru).some(sense=>senses(row.ru).includes(sense)));
    if(own)cards.set(id,{...card,en:own.en,word:own.en,ru:own.ru,pos:own.part_of_speech,stageId:own.id,stageRevision:own.revision,stageScope:'profile'});
  }
  return {...catalog,groups:catalog.groups.map(group=>({...group,topics:group.topics.map(topic=>({...topic,entries:topic.entries.filter(entry=>cards.has(entry.cardId)).map(entry=>({...entry,card:cards.get(entry.cardId)}))}))}))};
}
