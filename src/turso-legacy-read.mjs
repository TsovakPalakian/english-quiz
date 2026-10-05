// Read-only compatibility projection for the isolated original interface.
// No legacy write-through, D1 study queries, or production R2 fallbacks.
import {statement as s,lessonAccess,cardAccess,accessArgs,StudyError} from './turso-study.mjs';
import {libraryDto} from './turso-personal.mjs';
const banks=['LESSON_DATA','IRREGULAR','GRAMMAR','TENSE_BANK','SPEAKOUT'];
// Detail fields are deferred, never deleted from SQL. Quiz data remains synchronous.
export const dictionaryDetailPaths=['links','longman','merriam','oxford','wikdict','wiktionary','collins','englishAtHome','englishClub','openRussian',
  'cambridge.examples','cambridge.corpus','wooordhunt.examples','wooordhunt.phrases','wooordhunt.gloss','wooordhunt.verbGloss'].map(key=>'$.data.'+key);
const compactExtra=alias=>`json_remove(${alias}.extra_json,${dictionaryDetailPaths.map(p=>"'"+p+"'").join(',')})`;
export function legacyCard(row){
  const extra=JSON.parse(row.extra_json);
  return {...extra,en:row.en,ru:row.ru,pos:row.part_of_speech,...(extra.past!==undefined?{base:row.en}:{}),
    stageId:row.id,stageRevision:row.revision,stageScope:row.scope,deleted:row.deleted_at!==null};
}
export async function publicCatalogs(db,keys=null){
  if(keys&&(!Array.isArray(keys)||!keys.length||keys.some(key=>![...banks,'VERB_IPA','VERB_IPA_CASE'].includes(key))))throw new StudyError(400,'Invalid catalog keys.');
  const selectedBanks=keys?[...new Set(keys.map(key=>key.startsWith('VERB_IPA')?'IRREGULAR':key))]:banks;
  const [documents,cards]=await db.readMany([
    s("SELECT key,value_json FROM catalog_documents WHERE namespace='static'"+(keys?` AND key IN (${keys.map(()=>'?').join(',')})`:''),keys||[]),
    s(`SELECT c.* FROM cards c WHERE c.scope='shared' AND EXISTS(SELECT 1 FROM legacy_ids x
      WHERE x.entity_kind='card' AND x.target_id=c.id AND x.source_namespace IN (${selectedBanks.map(()=>'?').join(',')}))`,selectedBanks)
  ]);
  const byId=new Map(cards.map(c=>[c.id,legacyCard(c)]));
  function hydrate(value){
    if(Array.isArray(value))return value.map(hydrate).filter(v=>v!==null);
    if(value && typeof value==='object'){
      if(Object.keys(value).length===1 && value.cardId){const card=byId.get(value.cardId);return card && !card.deleted?card:null;}
      return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,hydrate(item)]));
    }
    return value;
  }
  return Object.fromEntries(documents.map(row=>[row.key,hydrate(JSON.parse(row.value_json))]));
}
const review=actor=>+['ADMIN','DEVELOPER'].includes(actor.role);
export async function legacyState(db,actor,{compact=false}={}){
  const member=await db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[actor.id]);
  if(member.length!==1)throw new StudyError(409,'This account has not been imported into test Turso. No profile is created automatically.');
  const profile=member[0].profile_id;
  const visibleCollection=`EXISTS(SELECT 1 FROM card_quiz_collections link JOIN cards c ON c.id=link.card_id WHERE link.collection_id=q.id AND ${cardAccess})`;
  const [added,library,progress,mistakes,accountSettings,profileSettings,access,collections,quizzes]=await db.readMany([
    s(`SELECT ${compact?`c.id,c.en,c.ru,c.part_of_speech,c.scope,c.revision,c.deleted_at,${compactExtra('c')} extra_json,json_type(c.extra_json,'$.data')='object' stage_dictionary_deferred`:'c.*'},p.place FROM profile_cards p JOIN cards c ON c.id=p.card_id WHERE p.profile_id=? AND ${cardAccess} ORDER BY p.position,c.id`,[profile,...accessArgs(actor)]),
    s(`SELECT l.* FROM profile_library_items p JOIN library_items l ON l.id=p.item_id
      WHERE p.profile_id=? AND l.deleted_at IS NULL AND (l.scope='shared' OR l.owner_profile_id=?) ORDER BY p.position,l.id`,[profile,profile]),
    s(`SELECT c.id,c.en,p.learned,p.variants_json,p.revision FROM card_progress p JOIN cards c ON c.id=p.card_id WHERE p.profile_id=? AND ${cardAccess}`,[profile,...accessArgs(actor)]),
    s(`SELECT p.card_id,p.quiz_type,p.progress_json,p.revision FROM quiz_progress p JOIN cards c ON c.id=p.card_id WHERE p.profile_id=? AND ${cardAccess}`,[profile,...accessArgs(actor)]),
    s('SELECT key,value_json,revision FROM account_settings WHERE account_id=?',[actor.id]),
    s('SELECT key,value_json,revision FROM profile_settings WHERE profile_id=?',[profile]),
    s('SELECT lesson_id,allow_hidden,personal_hidden FROM lesson_access WHERE account_id=?',[actor.id]),
    s(`SELECT q.id,q.legacy_word_key,q.revision FROM quiz_collections q WHERE ${visibleCollection}`,accessArgs(actor)),
    s(`SELECT z.*,q.legacy_word_key FROM quizzes z JOIN quiz_collections q ON q.id=z.collection_id WHERE z.deleted_at IS NULL AND ${visibleCollection} ORDER BY z.position,z.id`,accessArgs(actor))
  ]);
  const cardQuizzes=Object.fromEntries(collections.map(c=>[c.legacy_word_key,[]]));
  for(const q of quizzes)cardQuizzes[q.legacy_word_key].push({id:q.id,type:q.type,items:JSON.parse(q.items_json),stageRevision:q.revision});
  const linksRevision=profileSettings.find(r=>r.key==='tursoCardLinks')?.revision||0;
  const activities=profileSettings.filter(r=>r.key.startsWith('activity:')).map(r=>JSON.parse(r.value_json));
  const stageActivity={tracked:!!activities.length,seconds:activities.reduce((n,r)=>n+(r.seconds||0),0),examPass:activities.reduce((n,r)=>n+(r.examPass||0),0)};
  const stats={...Object.fromEntries(accountSettings.map(r=>[r.key,JSON.parse(r.value_json)])),...Object.fromEntries(profileSettings.filter(r=>r.key!=='tursoCardLinks'&&!r.key.startsWith('activity:')).map(r=>[r.key,JSON.parse(r.value_json)])),
    cardEdits:{},cardQuizzes,mistakes:mistakes.map(r=>JSON.parse(r.progress_json)).filter(row=>!row.cleared),
    hiddenLessons:access.filter(a=>a.personal_hidden).map(a=>a.lesson_id),allowedLessons:access.filter(a=>a.allow_hidden).map(a=>a.lesson_id)};
  const theme=accountSettings.find(row=>row.key==='theme');
  if(theme)stats.theme=JSON.parse(theme.value_json); // Own theme overrides a legacy shared-profile setting.
  return {stageThemeRevision:theme?.revision||0,added:added.map(row=>({...legacyCard(row),...(row.stage_dictionary_deferred?{stageDataDeferred:true}:{}),word:row.en,place:row.place,stageLinksRevision:linksRevision})),stageAddedRevision:linksRevision,stageActivity,songs:library.filter(l=>l.kind==='song').map(libraryDto),
    learned:progress.filter(p=>p.learned).map(p=>p.en.toLowerCase()),variants:Object.fromEntries(progress.map(p=>[p.en.toLowerCase(),JSON.parse(p.variants_json)])),stats,
    stageCollections:collections,stageProfile:profile,
    stageCardProgress:progress.map(row=>({id:row.id,revision:row.revision})),
    stageQuizProgress:mistakes.map(row=>({id:row.card_id,type:row.quiz_type,revision:row.revision}))};
}
export async function legacyTexts(db,actor){
  const rows=await db.read(`SELECT l.* FROM profile_members m JOIN profile_library_items p ON p.profile_id=m.profile_id
    JOIN library_items l ON l.id=p.item_id WHERE m.account_id=? AND l.kind='text' AND l.deleted_at IS NULL
    AND (l.scope='shared' OR l.owner_profile_id=m.profile_id) ORDER BY p.position,l.id`,[actor.id]);
  return {texts:rows.map(libraryDto)};
}
export async function legacyLessons(db,actor){
  const [lessons,blocks]=await db.readMany([
    s(`SELECT l.* FROM lessons l WHERE ${lessonAccess} ORDER BY l.lesson_date,l.id`,[review(actor),actor.id,actor.id]),
    s(`SELECT b.*,c.en,c.ru,c.part_of_speech,c.extra_json card_extra,c.revision card_revision,c.deleted_at card_deleted,
      r.response_json,r.revision response_revision FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id LEFT JOIN cards c ON c.id=b.card_id
      LEFT JOIN profile_members m ON m.account_id=? LEFT JOIN lesson_responses r ON r.profile_id=m.profile_id AND r.lesson_id=b.lesson_id AND r.block_id=b.id
      WHERE b.deleted_at IS NULL AND ${lessonAccess} ORDER BY b.position,b.id`,[actor.id,review(actor),actor.id,actor.id])
  ]);
  const materials=lessons.map(l=>({...JSON.parse(l.extra_json),id:l.id,title:l.title,description:l.description,className:l.class_name,unit:l.unit,lesson:l.lesson,date:l.lesson_date,mode:l.mode,published:!!l.published,hiddenFromStudents:!!l.hidden_from_students,stageRevision:l.revision,blocks:[]}));
  const byId=new Map(materials.map(l=>[l.id,l]));
  for(const material of materials)material.stageBlockOrder=blocks.filter(b=>b.lesson_id===material.id).map(b=>b.id);
  for(const b of blocks){
    if(b.card_id && b.card_deleted!==null)continue;
    const definition={type:b.type,tab:b.tab,cardId:b.card_id,content:JSON.parse(b.content_json)};
    delete definition.content.response;delete definition.content.score;
    if(['quiz','exercise'].includes(b.type))for(const item of definition.content.items||[]){delete item.picked;delete item.typed;delete item.marked;delete item.correct;}
    const block={...JSON.parse(JSON.stringify(definition.content)),id:b.id,type:b.type,tab:b.tab,stageDefinition:definition,stageBlockRevision:b.revision,stageResponseRevision:b.response_revision||0};
    // Shared definitions are never a source of a learner's previous answers.
    delete block.response;delete block.score;
    if(['quiz','exercise'].includes(b.type))for(const item of block.items||[]){delete item.picked;delete item.typed;delete item.marked;delete item.correct;}
    if(b.card_id)Object.assign(block,JSON.parse(b.card_extra),{word:b.en,ru:b.ru,pos:b.part_of_speech,stageId:b.card_id,stageRevision:b.card_revision,stageScope:'shared'});
    if(b.response_json!==null){
      const saved=JSON.parse(b.response_json),wrapped=saved && typeof saved==='object' && Number.isSafeInteger(saved.definitionRevision) && Object.hasOwn(saved,'value');
      const response=(wrapped?saved.definitionRevision===b.revision:b.revision===1)?(wrapped?saved.value:saved):null;
      if(['quiz','exercise'].includes(b.type) && response && typeof response==='object'){
        for(const [i,answer] of (response.items||[]).entries())if(block.items?.[i]){
          if(answer.picked!==undefined)block.items[i].picked=answer.picked;
          if(answer.typed!==undefined)block.items[i].typed=answer.typed;
          if(answer.marked===true){block.items[i].marked=true;block.items[i].correct=answer.correct===true;}
        }
        if(typeof response.score==='string')block.score=response.score;
      }else if(typeof response==='string')block.response=response;
    }
    byId.get(b.lesson_id)?.blocks.push(block);
  }
  return {materials};
}
