// Disposable, recorded fixtures in TEST Turso only. No real accounts/auth reads.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {StudyService,TursoStudyClient,statement as s} from '../src/turso-study.mjs';
import {legacyState} from '../src/turso-legacy-read.mjs';
import {PersonalService} from '../src/turso-personal.mjs';
import {ActivityService} from '../src/turso-activity.mjs';
import {credentials} from './turso-staging.mjs';
const path=fileURLToPath(new URL('../rollback/turso-card-links-fixture.json',import.meta.url));
const db=new TursoStudyClient(credentials()),service=new StudyService(db);
const tables=['account_refs','study_profiles','profile_members','lessons','lesson_blocks','cards','profile_cards','profile_settings','card_progress','operation_receipts','library_items','profile_library_items'];
const counts=()=>db.read('SELECT '+tables.map(table=>`(SELECT count(*) FROM ${table}) AS ${table}`).join(','));
const save=l=>writeFileSync(path,JSON.stringify(l,null,2),{mode:0o600});
function load(){
  const l=JSON.parse(readFileSync(path,'utf8'));assert.match(l.prefix,/^stage_links_[a-f0-9-]{36}$/);
  for(const [key,suffix] of Object.entries({card:'_card',privateCard:'_private',lesson:'_lesson',block:'_block',createdCard:'_new_card',text:'_text',song:'_song'}))assert.equal(l[key],l.prefix+suffix);
  assert.deepEqual(l.accounts,[1,2,3].map(i=>l.prefix+'_a'+i));assert.deepEqual(l.profiles,[1,2].map(i=>l.prefix+'_p'+i));
  return l;
}
async function cleanup(l){
  await db.atomic([
    s('DELETE FROM operation_receipts WHERE account_id IN (?,?,?)',l.accounts),
    s('DELETE FROM card_progress WHERE profile_id IN (?,?)',l.profiles),
    s('DELETE FROM profile_cards WHERE profile_id IN (?,?)',l.profiles),
    s('DELETE FROM profile_settings WHERE profile_id IN (?,?)',l.profiles),
    s('DELETE FROM profile_library_items WHERE profile_id IN (?,?)',l.profiles),
    s('DELETE FROM library_items WHERE id IN (?,?)',[l.text,l.song]),
    s('DELETE FROM lesson_blocks WHERE lesson_id=?',[l.lesson]),s('DELETE FROM lessons WHERE id=?',[l.lesson]),
    s('DELETE FROM cards WHERE id IN (?,?,?)',[l.card,l.privateCard,l.createdCard]),
    s('DELETE FROM profile_members WHERE account_id IN (?,?,?)',l.accounts),
    s('DELETE FROM study_profiles WHERE id IN (?,?)',l.profiles),s('DELETE FROM account_refs WHERE id IN (?,?,?)',l.accounts)
  ]);
  assert.deepEqual(await counts(),l.baseline);assert.deepEqual(await db.read('PRAGMA foreign_key_check'),[]);
  unlinkSync(path);console.log('PASS only recorded fixtures removed; baseline counts and foreign keys restored');
}
async function check(){
  assert.ok(!existsSync(path),'A recovery ledger exists. Use --cleanup first.');
  const prefix='stage_links_'+crypto.randomUUID();
  const l={prefix,card:prefix+'_card',privateCard:prefix+'_private',lesson:prefix+'_lesson',block:prefix+'_block',createdCard:prefix+'_new_card',text:prefix+'_text',song:prefix+'_song',
    accounts:[1,2,3].map(i=>prefix+'_a'+i),profiles:[1,2].map(i=>prefix+'_p'+i),mutations:[],baseline:await counts()};
  save(l); // Record exact IDs before the first fixture write.
  try{
    await db.atomic([
      ...l.accounts.map(id=>s('INSERT INTO account_refs(id) VALUES(?)',[id])),
      ...l.profiles.map(id=>s("INSERT INTO study_profiles(id,kind) VALUES(?,'personal')",[id])),
      ...l.accounts.map((id,i)=>s('INSERT INTO profile_members(account_id,profile_id) VALUES(?,?)',[id,l.profiles[i===1?1:0]])),
      s("INSERT INTO cards(id,scope,en,word_key,ru) VALUES(?,'shared',?,?,'Временная карточка')",[l.card,prefix,prefix]),
      s("INSERT INTO cards(id,scope,owner_profile_id,en,word_key,ru) VALUES(?,'profile',?,'private fixture',?,'Чужое')",[l.privateCard,l.profiles[1],prefix+'_private']),
      s("INSERT INTO lessons(id,title,published) VALUES(?,'Disposable card links test',1)",[l.lesson]),
      s("INSERT INTO lesson_blocks(lesson_id,id,position,type,card_id) VALUES(?,?,0,'word',?)",[l.lesson,l.block,l.card])
    ]);
    const actors=l.accounts.map(id=>({id,role:'USER'}));
    const mutation=()=>{const mutationId=crypto.randomUUID();l.mutations.push(mutationId);save(l);return mutationId;};
    const body={mutationId:mutation(),cardId:l.card,place:'mine',expectedRevision:0,expectedCardRevision:1};
    const first=await service.linkCard(actors[0],body);assert.deepEqual(await service.linkCard(actors[0],body),first);
    assert.equal((await legacyState(db,actors[2])).added[0].stageId,l.card,'Pair keeps its shared profile');
    assert.equal((await legacyState(db,actors[1])).added.length,0);
    await service.linkCard(actors[1],{...body,mutationId:mutation()});
    await assert.rejects(service.linkCard(actors[0],{...body,mutationId:mutation(),cardId:l.privateCard,expectedRevision:1}),e=>e.status===404);
    await service.saveCardProgress(actors[0],l.card,{mutationId:mutation(),expectedRevision:0,changes:{learned:true}});
    const remove={mutationId:mutation(),place:'mine',expectedRevision:1};
    const deleted=await service.unlinkCard(actors[0],l.card,remove);assert.deepEqual(await service.unlinkCard(actors[0],l.card,remove),deleted);
    assert.equal((await legacyState(db,actors[0])).added.length,0);assert.equal((await legacyState(db,actors[1])).added[0].stageId,l.card);
    assert.deepEqual((await legacyState(db,actors[0])).learned,[prefix]);
    await service.linkCard(actors[0],{...body,mutationId:mutation(),expectedRevision:2});
    await assert.rejects(service.unlinkCard(actors[0],l.card,{...remove,mutationId:mutation()}),e=>e.status===409);
    assert.equal((await legacyState(db,actors[0])).stageAddedRevision,3);
    const [card]=await db.read('SELECT revision,deleted_at FROM cards WHERE id=?',[l.card]);assert.equal(card.revision,1);assert.equal(card.deleted_at,null);
    console.log('PASS live Turso link/unlink, same physical ID, own/pair/foreign isolation, CAS/replay, progress preserved');
    const personal=new PersonalService(db),activity=new ActivityService(db);
    const create={mutationId:mutation(),id:l.createdCard,expectedRevision:3,card:{en:prefix+' personal',ru:'Личная тестовая карточка'}};
    const ownCard=await personal.createOwnCard(actors[0],create);assert.deepEqual(await personal.createOwnCard(actors[0],create),ownCard);
    await assert.rejects(personal.card(actors[1],l.createdCard),e=>e.status===404);
    const text={mutationId:mutation(),id:l.text,kind:'text',changes:{title:prefix,text:'Временный текст'}};
    await personal.createLibrary(actors[0],text);await personal.editLibrary(actors[0],l.text,{mutationId:mutation(),expectedRevision:1,changes:{text:'Обновлённый текст'}});
    await personal.createLibrary(actors[0],{mutationId:mutation(),id:l.song,kind:'song',changes:{title:prefix,lyrics:'Temporary lyrics',artist:'Fixture'}});
    await personal.editLibrary(actors[0],l.song,{mutationId:mutation(),expectedRevision:1,changes:{lyrics:'Updated temporary lyrics'}});
    assert.equal((await personal.library(actors[0])).find(row=>row.stageId===l.text).text,'Обновлённый текст');assert.equal((await personal.library(actors[1])).length,0);
    const events={mutationId:mutation(),events:[{kind:'answer',area:'Type',result:'ok'},{kind:'exam',area:'score',result:'pass'}]};
    await activity.events(actors[0],events);await activity.events(actors[0],events);
    assert.equal((await activity.stats(actors[0],{})).activity.answers,1);assert.equal((await activity.stats(actors[1],{})).activity.tracked,false);
    console.log('PASS live Turso own new card, text/song point edits and activity batch replay/foreign isolation');
  }finally{await cleanup(load());}
}
try{
  if(process.argv[2]==='--cleanup')await cleanup(load());
  else if(process.argv[2]==='--check')await check();
  else throw new Error('Use --check or --cleanup');
}catch(error){console.error('Card link check failed:',error.message);console.error('Retain the recovery ledger if present. No production fallback.');process.exitCode=1;}
