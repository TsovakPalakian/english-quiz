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
export async function publicCatalogPage(db,key,{after='',limit=60}={}){
  if(!banks.includes(key)||!Number.isInteger(limit)||limit<1||limit>60||after&&!/^[A-Za-z0-9_-]{1,100}$/.test(after))throw new StudyError(400,'Invalid catalog page.');
  const keys=key==='IRREGULAR'?[key,'VERB_IPA','VERB_IPA_CASE']:key==='TENSE_BANK'?[key]:[key];
  const [documents,cards]=await db.readMany([
    s("SELECT key,value_json FROM catalog_documents WHERE namespace='static' AND key IN ("+keys.map(()=>'?').join(',')+") AND ?=''",[...keys,after]),
    s(`SELECT c.id,c.en,c.ru,c.part_of_speech,c.scope,c.revision,c.deleted_at,${compactExtra('c')} extra_json,json_type(c.extra_json,'$.data')='object' stage_dictionary_deferred FROM cards c
      WHERE c.scope='shared' AND c.id>? AND EXISTS(SELECT 1 FROM legacy_ids x WHERE x.entity_kind='card' AND x.target_id=c.id AND x.source_namespace=?) ORDER BY c.id LIMIT ?`,[after,key,limit+1])
  ]);
  const more=cards.length>limit,rows=cards.slice(0,limit);
  return {documents:Object.fromEntries(documents.map(row=>[row.key,JSON.parse(row.value_json)])),
    cards:rows.map(row=>({...legacyCard(row),stagePublicCatalog:true,...(row.stage_dictionary_deferred?{stageDataDeferred:true}:{})})),
    next:more?rows.at(-1).id:null};
}
export async function publicCatalogCards(db,raw){
  const ids=[...new Set(String(raw||'').split(',').map(item=>item.trim()).filter(Boolean))];
  if(!ids.length||ids.length>8||ids.some(item=>!/^[A-Za-z0-9_-]{1,100}$/.test(item)))throw new StudyError(400,'Invalid card ids.');
  const rows=await db.read(`SELECT c.* FROM cards c WHERE c.scope='shared' AND c.deleted_at IS NULL AND c.id IN (${ids.map(()=>'?').join(',')})
    AND EXISTS(SELECT 1 FROM legacy_ids x WHERE x.entity_kind='card' AND x.target_id=c.id AND x.source_namespace IN (${banks.map(()=>'?').join(',')}))`,[...ids,...banks]);
  return rows.map(row=>({...legacyCard(row),stagePublicCatalog:true,stageDataDeferred:false}));
}
export async function publicCatalogCard(db,id){
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw new StudyError(400,'Invalid card ID.');
  const rows=await db.read(`SELECT c.* FROM cards c WHERE c.id=? AND c.scope='shared' AND c.deleted_at IS NULL AND EXISTS(SELECT 1 FROM legacy_ids x WHERE x.entity_kind='card' AND x.target_id=c.id AND x.source_namespace IN (${banks.map(()=>'?').join(',')}))`,[id,...banks]);
  if(rows.length!==1)throw new StudyError(404,'Catalog card not found.');
  return {...legacyCard(rows[0]),stagePublicCatalog:true};
}
export async function legacyState(db,actor,{compact=false,summary=false}={}){
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
  const songItem=row=>{const item=libraryDto(row);if(!summary)return item;const {lyrics,...rest}=item;return {...rest,stageLyricsDeferred:true};};
  return {stageThemeRevision:theme?.revision||0,added:added.map(row=>({...legacyCard(row),...(row.stage_dictionary_deferred?{stageDataDeferred:true}:{}),word:row.en,place:row.place,stageLinksRevision:linksRevision})),stageAddedRevision:linksRevision,stageActivity,songs:library.filter(l=>l.kind==='song').map(songItem),
    learned:progress.filter(p=>p.learned).map(p=>p.en.toLowerCase()),variants:Object.fromEntries(progress.map(p=>[p.en.toLowerCase(),JSON.parse(p.variants_json)])),stats,
    stageCollections:collections,stageProfile:profile,
    stageCardProgress:progress.map(row=>({id:row.id,revision:row.revision})),
    stageQuizProgress:mistakes.map(row=>({id:row.card_id,type:row.quiz_type,revision:row.revision}))};
}
export async function legacyTexts(db,actor,{summary=false,after='',limit=50}={}){
  if(!summary){
    const rows=await db.read(`SELECT l.* FROM profile_members m JOIN profile_library_items p ON p.profile_id=m.profile_id
      JOIN library_items l ON l.id=p.item_id WHERE m.account_id=? AND l.kind='text' AND l.deleted_at IS NULL
      AND (l.scope='shared' OR l.owner_profile_id=m.profile_id) ORDER BY p.position,l.id`,[actor.id]);
    return {texts:rows.map(row=>libraryDto(row))};
  }
  const size=pageLimit(limit),cursor=pageCursor(after);
  const rows=await db.read(`SELECT l.id,l.scope,l.revision,json_extract(l.content_json,'$.title') title,json_extract(l.content_json,'$.level') level,
    substr(COALESCE(json_extract(l.content_json,'$.text'),''),1,140) preview,json_extract(l.content_json,'$.id') client_id
    FROM profile_members m JOIN profile_library_items p ON p.profile_id=m.profile_id JOIN library_items l ON l.id=p.item_id
    WHERE m.account_id=? AND l.kind='text' AND l.deleted_at IS NULL AND (l.scope='shared' OR l.owner_profile_id=m.profile_id) AND l.id>?
    ORDER BY l.id LIMIT ?`,[actor.id,cursor,size+1]);
  const more=rows.length>size,page=rows.slice(0,size);
  return {texts:page.map(row=>({id:row.client_id||row.id,stageId:row.id,title:row.title||'',level:row.level||'',preview:row.preview||'',stageRevision:row.revision,stageScope:row.scope,stageTextDeferred:true})),next:more?page.at(-1).id:null};
}
export async function legacyLessons(db,actor,{summary=false,lessonId=''}={}){
  if(lessonId&&!/^[A-Za-z0-9_-]{1,100}$/.test(lessonId))throw new StudyError(400,'Invalid lesson ID.');
  const filter=lessonId?' AND l.id=?':'',args=[review(actor),actor.id,actor.id,...(lessonId?[lessonId]:[])];
  if(summary){
    const [rows,counts]=await db.readMany([
      s(`SELECT l.* FROM lessons l WHERE ${lessonAccess}${filter} ORDER BY l.lesson_date,l.id`,args),
      s(`SELECT b.lesson_id,
        SUM(CASE WHEN b.type IN ('wordcard','word') AND b.tab='words' AND (b.card_id IS NULL OR c.deleted_at IS NULL) THEN 1 ELSE 0 END) word_count,
        SUM(CASE WHEN (b.type='phrase' OR (b.type IN ('wordcard','word') AND b.tab='phrases')) AND (b.card_id IS NULL OR c.deleted_at IS NULL) THEN 1 ELSE 0 END) phrase_count,
        SUM(CASE WHEN b.type='rule' THEN 1 ELSE 0 END) rule_count
        FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id LEFT JOIN cards c ON c.id=b.card_id
        WHERE b.deleted_at IS NULL AND ${lessonAccess}${filter} GROUP BY b.lesson_id`,args)
    ]);
    const byId=new Map(counts.map(row=>[row.lesson_id,row]));
    return {materials:rows.map(l=>{
      const n=byId.get(l.id);
      return {...JSON.parse(l.extra_json),id:l.id,title:l.title,description:l.description,className:l.class_name,unit:l.unit,lesson:l.lesson,date:l.lesson_date,mode:l.mode,published:!!l.published,hiddenFromStudents:!!l.hidden_from_students,stageRevision:l.revision,stageLessonDeferred:true,blocks:[],wordCount:Number(n?.word_count||0),phraseCount:Number(n?.phrase_count||0),ruleCount:Number(n?.rule_count||0)};
    })};
  }
  const [lessons,blocks]=await db.readMany([
    s(`SELECT l.* FROM lessons l WHERE ${lessonAccess}${filter} ORDER BY l.lesson_date,l.id`,args),
    s(`SELECT b.*,c.en,c.ru,c.part_of_speech,c.extra_json card_extra,c.revision card_revision,c.deleted_at card_deleted,
      r.response_json,r.revision response_revision FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id LEFT JOIN cards c ON c.id=b.card_id
      LEFT JOIN profile_members m ON m.account_id=? LEFT JOIN lesson_responses r ON r.profile_id=m.profile_id AND r.lesson_id=b.lesson_id AND r.block_id=b.id
      WHERE b.deleted_at IS NULL AND ${lessonAccess}${filter} ORDER BY b.position,b.id`,[actor.id,...args])
  ]);
  if(lessonId&&!lessons.length)throw new StudyError(404,'Lesson not found.');
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
  for(const material of materials){
    material.wordCount=(material.blocks||[]).filter(b=>['wordcard','word'].includes(b.type)&&(b.tab||'')==='words').length;
    material.phraseCount=(material.blocks||[]).filter(b=>b.type==='phrase'||(['wordcard','word'].includes(b.type)&&(b.tab||'')==='phrases')).length;
    material.ruleCount=(material.blocks||[]).filter(b=>b.type==='rule').length;
  }
  return {materials};
}
const WORD_KEYS=['words','extraWords','lines21','ask07','phrases09','adverbs14','talk16','likes23'];
const SPEAK_LEVELS=['A1','A2','A2+','B1','B1+','B2','B2+','C1-C2'];
const SMALL_SETTINGS=new Set(['theme','lyricSize','demonstratives','dayLinks','customThemes']);
export function pageLimit(raw){
  const limit=raw==null||raw===''?50:Number(raw);
  if(!Number.isInteger(limit)||limit<1||limit>50)throw new StudyError(400,'Invalid page.');
  return limit;
}
export function pageCursor(after){
  const value=after||'';
  if(value&&!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw new StudyError(400,'Invalid cursor.');
  return value;
}
function collectIds(node,out){
  if(Array.isArray(node)){for(const item of node){if(item&&typeof item==='object'&&item.cardId)out.push(item.cardId);else collectIds(item,out);}}
  else if(node&&typeof node==='object')for(const value of Object.values(node))collectIds(value,out);
}
async function profileOf(db,actor){
  const member=await db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[actor.id]);
  if(member.length!==1)throw new StudyError(409,'This account has not been imported into test Turso. No profile is created automatically.');
  return member[0].profile_id;
}
const parsedCatalogs=new Map();
async function readCatalog(db,key){
  const [doc]=await db.read("SELECT value_json,length(value_json) bytes FROM catalog_documents WHERE namespace='static' AND key=?",[key]);
  if(!doc)return null;
  const version=Number(doc.bytes)||0,cacheKey=key+':'+version,hit=parsedCatalogs.get(cacheKey);
  if(hit)return hit;
  const entry={version,parsed:JSON.parse(doc.value_json)};
  parsedCatalogs.set(cacheKey,entry);
  if(parsedCatalogs.size>8)parsedCatalogs.delete(parsedCatalogs.keys().next().value);
  return entry;
}
function slicePage(ids,cursor,size){
  const start=cursor?ids.indexOf(cursor)+1:0;
  if(cursor&&start<=0)throw new StudyError(400,'Unknown cursor.');
  const page=ids.slice(start,start+size);
  return {page,next:start+size<ids.length?page.at(-1)||null:null};
}
export async function accountBootstrap(db,actor){
  const profile=await profileOf(db,actor);
  const visibleCollection=`EXISTS(SELECT 1 FROM card_quiz_collections link JOIN cards c ON c.id=link.card_id WHERE link.collection_id=q.id AND ${cardAccess})`;
  const [counts,settings,access,links,activity,catalogs,lessonCount]=await db.readMany([
    s(`SELECT
      (SELECT COUNT(*) FROM profile_cards WHERE profile_id=?) cards,
      (SELECT COUNT(*) FROM profile_library_items p JOIN library_items l ON l.id=p.item_id WHERE p.profile_id=? AND l.kind='song' AND l.deleted_at IS NULL) songs,
      (SELECT COUNT(*) FROM profile_library_items p JOIN library_items l ON l.id=p.item_id WHERE p.profile_id=? AND l.kind='text' AND l.deleted_at IS NULL) texts,
      (SELECT COUNT(*) FROM card_progress WHERE profile_id=?) progress,
      (SELECT COUNT(*) FROM quizzes z JOIN quiz_collections q ON q.id=z.collection_id WHERE z.deleted_at IS NULL AND ${visibleCollection}) quizzes,
      (SELECT COALESCE(SUM(l.revision),0) FROM profile_library_items p JOIN library_items l ON l.id=p.item_id WHERE p.profile_id=? AND l.kind='song' AND l.deleted_at IS NULL) songRevision,
      (SELECT COALESCE(SUM(l.revision),0) FROM profile_library_items p JOIN library_items l ON l.id=p.item_id WHERE p.profile_id=? AND l.kind='text' AND l.deleted_at IS NULL) textRevision,
      (SELECT COALESCE(SUM(revision),0) FROM card_progress WHERE profile_id=?) progressRevision,
      (SELECT COALESCE(SUM(z.revision),0) FROM quizzes z JOIN quiz_collections q ON q.id=z.collection_id WHERE z.deleted_at IS NULL AND ${visibleCollection}) quizRevision`,
      [profile,profile,profile,profile,...accessArgs(actor),profile,profile,profile,...accessArgs(actor)]),
    s('SELECT key,value_json,revision,length(value_json) bytes,\'account\' origin FROM account_settings WHERE account_id=? UNION ALL SELECT key,value_json,revision,length(value_json) bytes,\'profile\' origin FROM profile_settings WHERE profile_id=? AND key NOT LIKE \'activity:%\' AND key!=\'tursoCardLinks\'',[actor.id,profile]),
    s('SELECT lesson_id,allow_hidden,personal_hidden FROM lesson_access WHERE account_id=?',[actor.id]),
    s("SELECT revision FROM profile_settings WHERE profile_id=? AND key='tursoCardLinks'",[profile]),
    s("SELECT value_json FROM profile_settings WHERE profile_id=? AND key LIKE 'activity:%'",[profile]),
    s("SELECT key,length(value_json) bytes FROM catalog_documents WHERE namespace='static' AND key IN ('LESSON_DATA','GRAMMAR','IRREGULAR','SPEAKOUT')"),
    s(`SELECT COUNT(*) n, COALESCE(SUM(l.revision),0) rev FROM lessons l WHERE ${lessonAccess}`,[+review(actor),actor.id,actor.id])
  ]);
  const stats={};
  for(const row of settings){
    if(!SMALL_SETTINGS.has(row.key)||Number(row.bytes)>4000)continue;
    if(row.origin==='profile'&&Object.hasOwn(stats,row.key))continue;
    stats[row.key]=JSON.parse(row.value_json);
  }
  stats.hiddenLessons=access.filter(row=>row.personal_hidden).map(row=>row.lesson_id);
  stats.allowedLessons=access.filter(row=>row.allow_hidden).map(row=>row.lesson_id);
  const theme=settings.find(row=>row.key==='theme'&&row.origin==='account');
  const versions={};
  for(const row of catalogs)versions[row.key]=Number(row.bytes)||0;
  const actions=activity.map(row=>JSON.parse(row.value_json));
  return {bootstrap:true,
    stageThemeRevision:theme?.revision||0,stageAddedRevision:links[0]?.revision||0,stageProfile:profile,
    stageActivity:{tracked:!!actions.length,seconds:actions.reduce((n,row)=>n+(row.seconds||0),0),examPass:actions.reduce((n,row)=>n+(row.examPass||0),0)},
    counts:{cards:Number(counts[0]?.cards)||0,songs:Number(counts[0]?.songs)||0,texts:Number(counts[0]?.texts)||0,quizzes:Number(counts[0]?.quizzes)||0,progress:Number(counts[0]?.progress)||0,lessons:Number(lessonCount[0]?.n)||0,
      songRevision:Number(counts[0]?.songRevision)||0,textRevision:Number(counts[0]?.textRevision)||0,progressRevision:Number(counts[0]?.progressRevision)||0,quizRevision:Number(counts[0]?.quizRevision)||0,lessonRevision:Number(lessonCount[0]?.rev)||0},
    versions:{grammar:versions.GRAMMAR||0,irregular:versions.IRREGULAR||0,speakout:versions.SPEAKOUT||0,lessonData:versions.LESSON_DATA||0},
    stats};
}
function cardRow(row){
  return {...legacyCard(row),...(row.stage_dictionary_deferred?{stageDataDeferred:true}:{}),word:row.en,place:row.place,stagePublicCatalog:row.stage_public||false};
}
export async function accountCards(db,actor,{after='',limit=50}={}){
  const profile=await profileOf(db,actor),size=pageLimit(limit),cursor=pageCursor(after);
  const rows=await db.read(`SELECT c.id,c.en,c.ru,c.part_of_speech,c.scope,c.revision,c.deleted_at,${compactExtra('c')} extra_json,json_type(c.extra_json,'$.data')='object' stage_dictionary_deferred,p.place
    FROM profile_cards p JOIN cards c ON c.id=p.card_id WHERE p.profile_id=? AND ${cardAccess} AND c.id>? ORDER BY c.id LIMIT ?`,[profile,...accessArgs(actor),cursor,size+1]);
  const more=rows.length>size,page=rows.slice(0,size);
  const links=await db.read("SELECT revision FROM profile_settings WHERE profile_id=? AND key='tursoCardLinks'",[profile]);
  const revision=links[0]?.revision||0;
  return {cards:page.map(row=>({...cardRow(row),stageLinksRevision:revision})),next:more?page.at(-1).id:null,stageAddedRevision:revision};
}
export async function accountQuizzes(db,actor,{after='',limit=50}={}){
  await profileOf(db,actor);
  const size=pageLimit(limit),cursor=pageCursor(after);
  const visibleCollection=`EXISTS(SELECT 1 FROM card_quiz_collections link JOIN cards c ON c.id=link.card_id WHERE link.collection_id=q.id AND ${cardAccess})`;
  const rows=await db.read(`SELECT z.id,z.type,z.revision,z.items_json,q.legacy_word_key word FROM quizzes z JOIN quiz_collections q ON q.id=z.collection_id
    WHERE z.deleted_at IS NULL AND z.id>? AND ${visibleCollection} ORDER BY z.id LIMIT ?`,[cursor,...accessArgs(actor),size+1]);
  const more=rows.length>size,page=rows.slice(0,size);
  return {quizzes:page.map(row=>({id:row.id,type:row.type,word:row.word,items:JSON.parse(row.items_json),stageRevision:row.revision})),next:more?page.at(-1).id:null};
}
export async function accountProgress(db,actor,{after='',limit=50}={}){
  const profile=await profileOf(db,actor),size=pageLimit(limit),cursor=pageCursor(after);
  const rows=await db.read(`SELECT c.id,c.en,p.learned,p.variants_json,p.revision FROM card_progress p JOIN cards c ON c.id=p.card_id
    WHERE p.profile_id=? AND ${cardAccess} AND c.id>? ORDER BY c.id LIMIT ?`,[profile,...accessArgs(actor),cursor,size+1]);
  const more=rows.length>size,page=rows.slice(0,size);
  const mistakes=await db.read(`SELECT p.card_id,p.quiz_type,p.progress_json,p.revision FROM quiz_progress p JOIN cards c ON c.id=p.card_id
    WHERE p.profile_id=? AND ${cardAccess} AND p.card_id>? ORDER BY p.card_id,p.quiz_type LIMIT ?`,[profile,...accessArgs(actor),cursor,size+1]);
  const mistakePage=mistakes.slice(0,size);
  const parsed=mistakePage.map(row=>{const saved=JSON.parse(row.progress_json)||{};return {...saved,en:saved.en||row.card_id,type:saved.type||row.quiz_type};}).filter(row=>row&&!row.cleared);
  return {learned:page.filter(row=>row.learned).map(row=>row.en.toLowerCase()),
    variants:Object.fromEntries(page.map(row=>[row.en.toLowerCase(),JSON.parse(row.variants_json)])),
    stageCardProgress:page.map(row=>({id:row.id,revision:row.revision})),
    mistakes:parsed,stageQuizProgress:mistakePage.map(row=>({id:row.card_id,type:row.quiz_type,revision:row.revision})),
    next:more?page.at(-1).id:mistakes.length>size?mistakePage.at(-1).card_id:null};
}
export async function accountSongs(db,actor,{after='',limit=50}={}){
  const profile=await profileOf(db,actor),size=pageLimit(limit),cursor=pageCursor(after);
  const rows=await db.read(`SELECT l.id,l.scope,l.revision,l.media_key,json_extract(l.content_json,'$.title') title,json_extract(l.content_json,'$.artist') artist,
    json_extract(l.content_json,'$.level') level,json_extract(l.content_json,'$.archived') archived,json_extract(l.content_json,'$.id') client_id,
    json_extract(l.content_json,'$.fileName') file_name,json_extract(l.content_json,'$.fileType') file_type
    FROM profile_library_items p JOIN library_items l ON l.id=p.item_id
    WHERE p.profile_id=? AND l.kind='song' AND l.deleted_at IS NULL AND (l.scope='shared' OR l.owner_profile_id=?) AND l.id>?
    ORDER BY l.id LIMIT ?`,[profile,profile,cursor,size+1]);
  const more=rows.length>size,page=rows.slice(0,size);
  return {songs:page.map(row=>({id:row.client_id||row.id,stageId:row.id,title:row.title||'',artist:row.artist||'',level:row.level||'',archived:row.archived===1||row.archived==='true'||row.archived===true,stageRevision:row.revision,stageScope:row.scope,stageLyricsDeferred:true,fileName:row.file_name||'',fileType:row.file_type||'',stageLocalMedia:String(row.media_key||'').startsWith('stage-local/')})),next:more?page.at(-1).id:null};
}
export async function catalogSection(db,section,{after='',limit=50}={}){
  const keys=section==='phrases'?['phrasalWords']:section==='idioms'?['idiomWords']:section==='words'?WORD_KEYS:null;
  if(!keys)throw new StudyError(400,'Invalid library section.');
  const size=pageLimit(limit),cursor=pageCursor(after);
  const doc=await readCatalog(db,'LESSON_DATA');
  const parsed=doc?.parsed||{};
  const ids=[];for(const key of keys)collectIds(parsed[key],ids);
  const {page,next}=slicePage([...new Set(ids)],cursor,size);
  if(!page.length)return {section,version:doc?.version||0,cards:[],next:null};
  const rows=await db.read(`SELECT c.id,c.en,c.ru,c.part_of_speech,c.scope,c.revision,c.deleted_at,${compactExtra('c')} extra_json,json_type(c.extra_json,'$.data')='object' stage_dictionary_deferred
    FROM cards c WHERE c.scope='shared' AND c.deleted_at IS NULL AND c.id IN (${page.map(()=>'?').join(',')})`,page);
  const byId=new Map(rows.map(row=>[row.id,row]));
  return {section,version:doc?.version||0,cards:page.filter(id=>byId.has(id)).map(id=>{const row=byId.get(id);return {...legacyCard(row),stagePublicCatalog:true,...(row.stage_dictionary_deferred?{stageDataDeferred:true}:{})};}),next};
}
export async function speakoutLevel(db,level){
  if(!SPEAK_LEVELS.includes(level))throw new StudyError(400,'Invalid level.');
  const doc=await readCatalog(db,'SPEAKOUT');
  if(!doc)throw new StudyError(404,'Speak Out is not loaded.');
  const book=doc.parsed;
  const content=Array.isArray(book)?book.find(row=>row&&row.level===level):null;
  if(!content)throw new StudyError(404,'Level not found.');
  return {level,version:doc.version,content};
}
export async function staticSlice(db,key,{after='',limit=50}={}){
  if(key!=='IRREGULAR')throw new StudyError(400,'Invalid catalog.');
  const size=pageLimit(limit),cursor=pageCursor(after);
  const doc=await readCatalog(db,'IRREGULAR');
  const parsed=doc?.parsed||[];
  const ids=[];collectIds(parsed,ids);
  if(!ids.length&&Array.isArray(parsed)){
    const indexes=parsed.map((_,index)=>String(index));
    const {page,next}=slicePage(indexes,cursor,size);
    return {version:doc?.version||0,cards:page.map(index=>parsed[Number(index)]),next};
  }
  const {page,next}=slicePage([...new Set(ids)],cursor,size);
  if(!page.length)return {version:doc?.version||0,cards:[],next:null};
  const rows=await db.read(`SELECT c.id,c.en,c.ru,c.part_of_speech,c.scope,c.revision,c.deleted_at,${compactExtra('c')} extra_json FROM cards c WHERE c.scope='shared' AND c.deleted_at IS NULL AND c.id IN (${page.map(()=>'?').join(',')})`,page);
  const byId=new Map(rows.map(row=>[row.id,row]));
  return {version:doc?.version||0,cards:page.filter(id=>byId.has(id)).map(id=>legacyCard(byId.get(id))),next};
}
export async function staticDocument(db,key){
  if(!['GRAMMAR','IRREGULAR'].includes(key))throw new StudyError(400,'Invalid catalog.');
  const doc=await readCatalog(db,key);
  if(!doc)throw new StudyError(404,'Catalog is not loaded.');
  return {version:doc.version,document:doc.parsed};
}
