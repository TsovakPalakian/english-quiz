import {statement as s,cardAccess,accessArgs} from './turso-study.mjs';
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
