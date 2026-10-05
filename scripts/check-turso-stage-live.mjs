// Writes only explicitly recorded, UUID-namespaced fixtures to TEST Turso.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {TursoStudyClient,StudyService,statement as s} from '../src/turso-study.mjs';
import {credentials} from './turso-staging.mjs';
import {snapshotPersonas} from './run-turso-stage.mjs';
import {legacyState,legacyLessons} from '../src/turso-legacy-read.mjs';
const ledgerPath=fileURLToPath(new URL('../rollback/turso-stage-fixture.json',import.meta.url));
const runtimePath=fileURLToPath(new URL('../rollback/turso-stage-local.json',import.meta.url));
const db=new TursoStudyClient(credentials());
const actors=snapshotPersonas();
const mode=process.argv[2]||'--check';
const counts=()=>db.read(`SELECT (SELECT count(*) FROM lessons) lessons,(SELECT count(*) FROM cards) cards,
  (SELECT count(*) FROM quizzes) quizzes,(SELECT count(*) FROM quiz_collections) collections,
  (SELECT count(*) FROM operation_receipts) receipts,(SELECT count(*) FROM profile_cards) profileCards,
  (SELECT count(*) FROM card_progress) cardProgress,(SELECT count(*) FROM quiz_progress) quizProgress,
  (SELECT count(*) FROM lesson_responses) lessonResponses,(SELECT count(*) FROM lesson_blocks) lessonBlocks`);
function save(ledger){writeFileSync(ledgerPath,JSON.stringify(ledger,null,2),{mode:0o600});}
function load(){const l=JSON.parse(readFileSync(ledgerPath,'utf8'));if(!/^stage_[a-f0-9-]{36}$/.test(l.prefix))throw new Error('Unsafe fixture ledger.');return l;}
async function prepare(main=false,personal=false,developer=false){
  if(existsSync(ledgerPath))throw new Error('Existing fixture ledger: check or clean it first.');
  const prefix='stage_'+crypto.randomUUID();
  const profiles=await db.read('SELECT account_id,profile_id FROM profile_members WHERE account_id IN (?,?,?,?)',actors.map(a=>a.id));
  const p=profiles.find(p=>p.account_id===actors[2].id)?.profile_id;
  assert.ok(p,'Student fixture profile missing');
  assert.notEqual(p,profiles.find(p=>p.account_id===actors[3].id)?.profile_id,'Two student personas must use different profiles');
  const ledger={prefix,lesson:prefix+'_lesson',hiddenLesson:prefix+'_hidden_lesson',card:prefix+'_card',privateCard:prefix+'_private',hiddenCard:prefix+'_hidden',collection:prefix+'_collection',quiz:prefix+'_quiz',otherQuiz:prefix+'_other_quiz',mutations:[],baseline:await counts()};
  ledger.createdLesson=prefix+'_created_lesson';
  const en=main?'Turso stage check '+prefix.slice(-8):'Turso stage check';
  const wordKey=main?en.toLowerCase():prefix;
  const extra=main?{data:{usages:[{en:'This is '+en+'.',ru:'Временный тест.'}]}}:{};
  if(main){
    const teacherProfile=profiles.find(row=>row.account_id===actors[developer?1:0].id)?.profile_id;
    assert.ok(teacherProfile,'Teacher fixture profile missing');
    ledger.mainWord=en;ledger.linkedProfiles=[teacherProfile];if(developer)ledger.browserActor=actors[1].id;
    const [links]=await db.read("SELECT revision FROM profile_settings WHERE profile_id=? AND key='tursoCardLinks'",[teacherProfile]);
    ledger.mainLinksRevision=links?.revision||0;
  }
  if(personal){ledger.taskBlock=prefix+'_task';ledger.quizBlock=prefix+'_choice';ledger.exerciseBlock=prefix+'_exercise';}
  save(ledger); // Recovery IDs recorded BEFORE any mutation.
  await db.atomic([
    s('INSERT INTO lessons(id,title,published) VALUES(?,?,1)',[ledger.lesson,'Временный тест Save/delete']),
    s('INSERT INTO lessons(id,title,published,hidden_from_students) VALUES(?,?,1,1)',[ledger.hiddenLesson,'Временный скрытый урок']),
    s('INSERT INTO cards(id,scope,en,word_key,ru,extra_json) VALUES(?,?,?,?,?,?)',[ledger.card,'shared',en,wordKey,'before',JSON.stringify(extra)]),
    s('INSERT INTO cards(id,scope,en,word_key,ru) VALUES(?,?,?,?,?)',[ledger.hiddenCard,'shared','Hidden stage check',prefix+'_hidden_word','hidden']),
    s('INSERT INTO cards(id,scope,owner_profile_id,en,word_key,ru) VALUES(?,?,?,?,?,?)',[ledger.privateCard,'profile',p,'Private stage check',prefix+'_private_word','private']),
    s('INSERT INTO lesson_blocks(lesson_id,id,position,type,card_id) VALUES(?,?,0,?,?)',[ledger.lesson,prefix+'_block','word',ledger.card]),
    s('INSERT INTO lesson_blocks(lesson_id,id,position,type,card_id) VALUES(?,?,0,?,?)',[ledger.hiddenLesson,prefix+'_hidden_block','word',ledger.hiddenCard]),
    s('INSERT INTO quiz_collections(id,legacy_word_key) VALUES(?,?)',[ledger.collection,wordKey]),
    s('INSERT INTO card_quiz_collections(card_id,collection_id) VALUES(?,?)',[ledger.card,ledger.collection]),
    s('INSERT INTO quizzes(id,collection_id,position,type,items_json) VALUES(?,?,0,?,?)',[ledger.quiz,ledger.collection,'Flip',JSON.stringify([{front:'stage',back:'тест'}])]),
    s('INSERT INTO quizzes(id,collection_id,position,type,items_json) VALUES(?,?,1,?,?)',[ledger.otherQuiz,ledger.collection,'Type',JSON.stringify([{prompt:'stage',answer:'тест'}])]),
    ...(ledger.linkedProfiles||[]).map(profile=>s('INSERT INTO profile_cards(profile_id,card_id,place) VALUES(?,?,?)',[profile,ledger.card,'mine'])),
    ...(personal?[
      s('INSERT INTO lesson_blocks(lesson_id,id,position,type,content_json) VALUES(?,?,1,?,?)',[ledger.lesson,ledger.taskBlock,'task',JSON.stringify({title:'Temporary task',text:'Write a test answer.'})]),
      s('INSERT INTO lesson_blocks(lesson_id,id,position,type,content_json) VALUES(?,?,2,?,?)',[ledger.lesson,ledger.quizBlock,'quiz',JSON.stringify({title:'Temporary choice',quizType:'Choice',items:[{prompt:'Select yes',options:['yes','no'],answer:0}]})]),
      s('INSERT INTO lesson_blocks(lesson_id,id,position,type,content_json) VALUES(?,?,3,?,?)',[ledger.lesson,ledger.exerciseBlock,'exercise',JSON.stringify({items:[{kind:'write',prompt:'Type hello',write:'hello'}]})])
    ]:[])
  ]);
  console.log(JSON.stringify({prepared:true,card:ledger.card,lesson:ledger.lesson,...(main?{word:en}:{})}));
}
async function client(persona){
  const runtime=JSON.parse(readFileSync(runtimePath,'utf8'));
  assert.equal(runtime.origin,'http://127.0.0.1:8788');
  let cookie='';
  const call=async(path,method='GET',body)=>{
    const response=await fetch(runtime.origin+path,{method,signal:AbortSignal.timeout(60_000),headers:{Origin:runtime.origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,value:await response.json()};
  };
  assert.equal((await call('/api/test/session','POST',{persona,launchCode:runtime.launchCode})).status,200);
  return call;
}
async function check(){
  const ledger=load();
  const teacher=await client('teacher'),dev=await client('developer'),student=await client('student'),other=await client('student2');
  const cardPath='/api/cards/'+ledger.card;
  const write=async(call,path,method,body,expected=200)=>{
    const mutationId=crypto.randomUUID();ledger.mutations.push(mutationId);save(ledger);
    const request={...body,mutationId},result=await call(path,method,request);
    assert.equal(result.status,expected,JSON.stringify(result.value));return {request,result:result.value};
  };
  const before=await teacher(cardPath);assert.equal(before.status,200);
  const saved=await write(teacher,cardPath,'PATCH',{expectedRevision:before.value.revision,changes:{ru:'Сохранено учителем'}});
  const fresh=await client('student');
  assert.equal((await fresh(cardPath)).value.ru,'Сохранено учителем');
  assert.deepEqual((await teacher(cardPath,'PATCH',saved.request)).value,saved.result);
  await write(dev,cardPath,'PATCH',{expectedRevision:before.value.revision,changes:{ru:'stale'}},409);
  await write(dev,cardPath,'PATCH',{expectedRevision:saved.result.revision,changes:{ru:'Сохранено разработчиком'}});
  assert.equal((await other(cardPath)).value.ru,'Сохранено разработчиком');
  console.log('PASS Save teacher/dev, fresh student read, retry and version conflict');
  let current=(await teacher(cardPath)).value;
  const newQuiz=await write(teacher,cardPath+'/quizzes','POST',{expectedRevision:current.revision,expectedCollectionRevision:current.collections[0].revision,quiz:{type:'Choice',items:[{prompt:'stage',options:['yes','no'],answer:0}]}});
  assert.ok((await fresh(cardPath)).value.quizzes.some(q=>q.id===newQuiz.result.id));
  await write(dev,'/api/quizzes/'+newQuiz.result.id,'PATCH',{expectedRevision:1,quiz:{type:'Flip',items:[{front:'stage',back:'Изменено на сервере'}]}});
  assert.equal((await fresh(cardPath)).value.quizzes.find(q=>q.id===newQuiz.result.id).items[0].back,'Изменено на сервере');
  const deleted=await write(teacher,'/api/quizzes/'+ledger.quiz,'DELETE',{expectedRevision:1});
  assert.equal((await teacher('/api/quizzes/'+ledger.quiz,'DELETE',deleted.request)).status,200);
  const relogin=await client('student');current=(await relogin(cardPath)).value;
  assert.ok(!current.quizzes.some(q=>q.id===ledger.quiz));assert.ok(current.quizzes.some(q=>q.id===ledger.otherQuiz));
  console.log('PASS new/edit/delete quiz, reload/relogin and unrelated quiz preserved');
  for(const [path,method,body] of [[cardPath,'PATCH',{expectedRevision:current.revision,changes:{ru:'no'},role:'ADMIN'}],[cardPath,'DELETE',{expectedRevision:current.revision}],[cardPath+'/quizzes','POST',{expectedRevision:current.revision,expectedCollectionRevision:current.collections[0].revision,quiz:{type:'Flip',items:[{}]}}],['/api/quizzes/'+ledger.otherQuiz,'DELETE',{expectedRevision:1}],['/api/quizzes/'+ledger.otherQuiz,'PATCH',{expectedRevision:1,quiz:{type:'Flip',items:[{}]}}]])await write(student,path,method,body,403);
  assert.equal((await student('/api/cards/'+ledger.privateCard)).status,200);
  assert.equal((await other('/api/cards/'+ledger.privateCard)).status,404);
  assert.equal((await teacher('/api/cards/'+ledger.hiddenCard)).status,200);
  assert.equal((await student('/api/cards/'+ledger.hiddenCard)).status,404);
  assert.equal((await other('/api/cards/'+ledger.hiddenCard)).status,404);
  console.log('PASS server-side student write denial, private and hidden lesson isolation');
  await write(teacher,cardPath,'DELETE',{expectedRevision:current.revision});
  assert.equal((await (await client('student'))(cardPath)).status,404);
  assert.equal((await dev(cardPath)).status,404);
  assert.deepEqual(await db.read('PRAGMA foreign_key_check'),[]);
  console.log('PASS card delete shared between sessions; foreign keys intact');
}
async function cleanup(){
  const l=load();
  for(const key of ['lesson','hiddenLesson','createdLesson','card','privateCard','hiddenCard','collection','quiz','otherQuiz'])if(l[key]!==undefined)assert.ok(l[key].startsWith(l.prefix+'_'));
  assert.ok(l.mutations.every(m=>/^[a-f0-9-]{36}$/.test(m)));
  // Include browser operations, but only receipts targeting these exact fixture
  // entities. Record them before deleting anything, so interrupted cleanup is safe.
  const browserReceipts=await db.read(`SELECT account_id,mutation_id FROM operation_receipts WHERE
    json_extract(result_json,'$.id') IN (?,?,?) OR json_extract(result_json,'$.id') IN
    (SELECT id FROM quizzes WHERE collection_id=?) OR json_extract(result_json,'$.lessonId') IN (?,?)
    OR json_extract(result_json,'$.id')=?`,[l.card,l.privateCard,l.hiddenCard,l.collection,l.lesson,l.createdLesson||l.lesson,l.createdLesson||l.lesson]);
  l.browserReceipts=browserReceipts.length?browserReceipts:(l.browserReceipts||[]);save(l);
  const commands=[s('DELETE FROM card_quiz_collections WHERE collection_id=?',[l.collection]),s('DELETE FROM quizzes WHERE collection_id=?',[l.collection]),s('DELETE FROM quiz_collections WHERE id=?',[l.collection]),s('DELETE FROM lesson_blocks WHERE lesson_id IN (?,?)',[l.lesson,l.hiddenLesson]),s('DELETE FROM lesson_access WHERE lesson_id IN (?,?)',[l.lesson,l.hiddenLesson]),s('DELETE FROM lessons WHERE id IN (?,?)',[l.lesson,l.hiddenLesson]),s('DELETE FROM cards WHERE id IN (?,?,?)',[l.card,l.privateCard,l.hiddenCard])];
  // Only links explicitly created by this run; never remove a user's other cards.
  for(const profile of l.linkedProfiles||[]){
    assert.equal(typeof profile,'string');
    commands.unshift(s('DELETE FROM profile_cards WHERE profile_id=? AND card_id=?',[profile,l.card]));
  }
  commands.unshift(s('DELETE FROM card_progress WHERE card_id IN (?,?,?)',[l.card,l.privateCard,l.hiddenCard]),
    s('DELETE FROM quiz_progress WHERE card_id IN (?,?,?)',[l.card,l.privateCard,l.hiddenCard]),
    s('DELETE FROM lesson_responses WHERE lesson_id IN (?,?)',[l.lesson,l.hiddenLesson]));
  if(l.createdLesson)commands.unshift(s('DELETE FROM lesson_responses WHERE lesson_id=?',[l.createdLesson]),s('DELETE FROM lesson_blocks WHERE lesson_id=?',[l.createdLesson]),s('DELETE FROM lesson_access WHERE lesson_id=?',[l.createdLesson]),s('DELETE FROM lessons WHERE id=?',[l.createdLesson]));
  for(const mutation of l.mutations)for(const actor of actors)commands.push(s('DELETE FROM operation_receipts WHERE account_id=? AND mutation_id=?',[actor.id,mutation]));
  for(const receipt of l.browserReceipts){assert.ok(actors.some(a=>a.id===receipt.account_id));assert.ok(/^[a-f0-9-]{36}$/.test(receipt.mutation_id));commands.push(s('DELETE FROM operation_receipts WHERE account_id=? AND mutation_id=?',[receipt.account_id,receipt.mutation_id]));}
  await db.atomic(commands);
  const currentCounts=await counts();
  const contentCounts=rows=>rows.map(({receipts,...content})=>content);
  assert.deepEqual(contentCounts(currentCounts),contentCounts(l.baseline),'Unexpected content count changes during staging tests');
  // Browser duration/activity batches may create their own receipts. Preserve
  // them and monotonic profile versions instead of rolling back real events.
  assert.ok(currentCounts[0].receipts>=l.baseline[0].receipts,'Existing receipts were lost');
  assert.deepEqual(await db.read('PRAGMA foreign_key_check'),[]);
  unlinkSync(ledgerPath);console.log('PASS only temporary fixtures removed; original content counts restored; activity receipts retained');
}
async function checkMainLinks(added=false){
  const l=load();assert.ok(l.mainWord && Number.isSafeInteger(l.mainLinksRevision));
  const own=await legacyState(db,actors[0]),other=await legacyState(db,actors[3]);
  assert.equal(own.added.filter(row=>row.stageId===l.card && row.place==='mine').length,added?1:0);
  assert.equal(own.stageAddedRevision,l.mainLinksRevision+(added?2:1));
  assert.ok(!other.added.some(row=>row.stageId===l.card));
  const [card]=await db.read('SELECT revision,deleted_at,ru FROM cards WHERE id=?',[l.card]);
  assert.equal(card.revision,1);assert.equal(card.deleted_at,null);assert.equal(card.ru,'before');
  const receipts=await db.read("SELECT account_id,result_json FROM operation_receipts WHERE json_extract(result_json,'$.id')=?",[l.card]);
  assert.equal(receipts.length,added?2:1);assert.ok(receipts.every(row=>row.account_id===actors[0].id));
  assert.ok(receipts.some(row=>JSON.parse(row.result_json).unlinked===true));
  if(added)assert.ok(receipts.some(row=>JSON.parse(row.result_json).card?.stageId===l.card));
  console.log(added?'PASS actual teacher UI re-add persisted the same card ID; foreign profile and definition unchanged':'PASS actual teacher UI unlink persisted; common card remains available and unchanged');
}
async function checkMain(deleted=false){
  const l=load();assert.ok(l.mainWord,'Use the main-interface fixture.');
  const service=new StudyService(db);
  if(deleted){
    for(const actor of [actors[0],actors[2]])await assert.rejects(service.card(actor,l.card),error=>error.status===404);
    const [row]=await db.read('SELECT revision,deleted_at FROM cards WHERE id=?',[l.card]);
    assert.equal(row.revision,3);assert.ok(row.deleted_at);
    console.log('PASS main UI card soft-delete persisted; fresh teacher/student reads both return 404');
    return;
  }
  // A fresh read using the imported student's access rules, not browser storage.
  const card=await service.card(actors[2],l.card);
  assert.equal(card.ru,'Сохранено через основной интерфейс');
  assert.equal(card.revision,2);
  assert.ok(!card.quizzes.some(q=>q.id===l.quiz),'Deleted Flip reappeared');
  assert.ok(card.quizzes.some(q=>q.id===l.otherQuiz),'Unrelated Type was lost');
  const added=card.quizzes.find(q=>q.id!==l.otherQuiz);
  assert.equal(card.quizzes.length,2);
  assert.equal(added.type,'Flip');assert.equal(added.revision,2);
  assert.equal(added.items[0].back,'Квиз изменён на сервере');
  assert.deepEqual(await db.read('PRAGMA foreign_key_check'),[]);
  if(l.browserActor){
    assert.equal(l.browserActor,actors[1].id);
    const receipts=await db.read(`SELECT account_id FROM operation_receipts WHERE json_extract(result_json,'$.id')=? OR json_extract(result_json,'$.id') IN (SELECT id FROM quizzes WHERE collection_id=?)`,[l.card,l.collection]);
    assert.equal(receipts.length,4);assert.ok(receipts.every(row=>row.account_id===l.browserActor),'Every UI mutation must belong to the actual developer');
  }
  console.log('PASS main UI Save/create/edit/delete persisted in test Turso; fresh student-scoped read and unrelated quiz intact');
}
async function checkPersonal(){
  const l=load();assert.ok(l.taskBlock?.startsWith(l.prefix+'_'));assert.ok(l.quizBlock?.startsWith(l.prefix+'_'));
  const service=new StudyService(db),student=actors[2],other=actors[3];
  const definitions=await db.read('SELECT id,content_json,revision FROM lesson_blocks WHERE lesson_id=? ORDER BY id',[l.lesson]);
  const newBody=body=>{const mutationId=crypto.randomUUID();l.mutations.push(mutationId);save(l);return {...body,mutationId};};
  const learned=newBody({expectedRevision:0,changes:{learned:true,variants:['temporary variant']}});
  await service.saveCardProgress(student,l.card,learned);
  await service.saveCardProgress(student,l.card,learned); // Receipt, not a second write.
  let revision=0;
  for(const correct of [false,true,true,true,true]){
    const body=newBody({expectedRevision:revision,quizType:'Type',correct});
    const result=await service.answerCard(student,l.card,body);revision=result.revision;
    assert.deepEqual(await service.answerCard(student,l.card,body),result);
  }
  const own=await legacyState(db,student),foreign=await legacyState(db,other);
  assert.ok(own.learned.includes(l.mainWord.toLowerCase()));assert.ok(!foreign.learned.includes(l.mainWord.toLowerCase()));
  assert.ok(!own.stats.mistakes.some(row=>row.en.toLowerCase()===l.mainWord.toLowerCase()));
  assert.equal(own.stageQuizProgress.find(row=>row.id===l.card && row.type==='Type').revision,5);
  await service.saveLessonResponse(student,l.lesson,l.taskBlock,newBody({expectedRevision:0,expectedBlockRevision:1,response:'temporary private answer'}));
  const scored=await service.saveLessonResponse(student,l.lesson,l.quizBlock,newBody({expectedRevision:0,expectedBlockRevision:1,response:{items:[{picked:0}],checked:true}}));
  assert.equal(scored.response.score,'1 / 1');
  const mine=(await legacyLessons(db,student)).materials.find(row=>row.id===l.lesson);
  const theirs=(await legacyLessons(db,other)).materials.find(row=>row.id===l.lesson);
  assert.equal(mine.blocks.find(row=>row.id===l.taskBlock).response,'temporary private answer');
  assert.equal(mine.blocks.find(row=>row.id===l.quizBlock).items[0].picked,0);
  assert.equal(theirs.blocks.find(row=>row.id===l.taskBlock).response,undefined);
  assert.equal(theirs.blocks.find(row=>row.id===l.quizBlock).items[0].picked,undefined);
  await assert.rejects(service.saveLessonResponse(student,l.lesson,l.taskBlock,newBody({expectedRevision:0,expectedBlockRevision:1,response:'stale'})),error=>error.status===409);
  await assert.rejects(service.answerCard(student,l.hiddenCard,newBody({expectedRevision:0,quizType:'Type',correct:true})),error=>error.status===404);
  assert.deepEqual(await db.read('SELECT id,content_json,revision FROM lesson_blocks WHERE lesson_id=? ORDER BY id',[l.lesson]),definitions);
  assert.deepEqual(await db.read('PRAGMA foreign_key_check'),[]);
  console.log('PASS live test Turso personal progress, response/choice readback, retries, conflicts, hidden access and profile isolation; definitions unchanged');
}
async function checkPersonalUi(){
  const l=load();assert.ok(l.exerciseBlock?.startsWith(l.prefix+'_'));
  const [responses,progress,definitions,cards,quizzes]=await db.readMany([
    s(`SELECT r.block_id,r.response_json,r.revision FROM lesson_responses r JOIN profile_members m ON m.profile_id=r.profile_id
      WHERE m.account_id=? AND r.lesson_id=?`,[actors[0].id,l.lesson]),
    s(`SELECT p.quiz_type,p.progress_json,p.revision FROM quiz_progress p JOIN profile_members m ON m.profile_id=p.profile_id
      WHERE m.account_id=? AND p.card_id=?`,[actors[0].id,l.card]),
    s('SELECT id,content_json,revision FROM lesson_blocks WHERE lesson_id=? ORDER BY position',[l.lesson]),
    s('SELECT ru,revision FROM cards WHERE id=?',[l.card]),
    s('SELECT revision,deleted_at FROM quizzes WHERE collection_id=?',[l.collection])
  ]);
  const answer=id=>{const saved=JSON.parse(responses.find(row=>row.block_id===id)?.response_json||'null');return saved?.definitionRevision?saved.value:saved;};
  assert.equal(answer(l.taskBlock),'Ответ сохранён через интерфейс');
  assert.equal(answer(l.quizBlock).items[0].picked,0);assert.equal(answer(l.quizBlock).score,'1 / 1');
  assert.equal(answer(l.exerciseBlock).items[0].typed,'hello');assert.equal(answer(l.exerciseBlock).items[0].correct,true);
  const typed=progress.find(row=>row.quiz_type==='Type');assert.ok(typed,'Practice answer was not persisted');
  const counter=JSON.parse(typed.progress_json);assert.equal(counter.misses,1);assert.equal(counter.streak,0);assert.equal(typed.revision,1);
  assert.ok(definitions.every(row=>row.revision===1));
  assert.deepEqual(JSON.parse(definitions.find(row=>row.id===l.taskBlock).content_json),{title:'Temporary task',text:'Write a test answer.'});
  assert.deepEqual(JSON.parse(definitions.find(row=>row.id===l.quizBlock).content_json),{title:'Temporary choice',quizType:'Choice',items:[{prompt:'Select yes',options:['yes','no'],answer:0}]});
  assert.deepEqual(JSON.parse(definitions.find(row=>row.id===l.exerciseBlock).content_json),{items:[{kind:'write',prompt:'Type hello',write:'hello'}]});
  assert.equal(cards[0].ru,'before');assert.equal(cards[0].revision,1);assert.ok(quizzes.every(row=>row.revision===1 && row.deleted_at===null));
  const other=(await legacyLessons(db,actors[3])).materials.find(row=>row.id===l.lesson);
  assert.equal(other.blocks.find(row=>row.id===l.taskBlock).response,undefined);
  assert.equal(other.blocks.find(row=>row.id===l.quizBlock).items[0].picked,undefined);
  assert.equal(other.blocks.find(row=>row.id===l.exerciseBlock).items[0].typed,undefined);
  console.log('PASS browser task/Choice/exercise/practice writes persisted in test Turso; foreign profile cannot see them; definitions/card/quizzes unchanged');
}
async function checkLessons(){
  const l=load();assert.ok(l.createdLesson?.startsWith(l.prefix+'_'));
  const service=new StudyService(db),teacher=actors[0],dev=actors[1],student=actors[2],other=actors[3];
  const body=value=>{const mutationId=crypto.randomUUID();l.mutations.push(mutationId);save(l);return {...value,mutationId};};
  const taskId=l.prefix+'_new_task',linkId=l.prefix+'_new_link';
  const creation=body({id:l.createdLesson,changes:{title:'Временный CRUD-урок',date:'2026-10-03'},blocks:[
    {id:taskId,type:'task',tab:'overview',cardId:null,expectedRevision:0,content:{text:'Original instruction'}},
    {id:linkId,type:'wordcard',tab:'words',cardId:l.card,expectedRevision:0,content:{collapsed:false}}
  ]});
  const definitions=await db.read('SELECT * FROM cards WHERE id=?',[l.card]);
  const created=await service.createLesson(teacher,creation);assert.deepEqual(await service.createLesson(teacher,creation),created);
  assert.equal((await legacyLessons(db,student)).materials.some(row=>row.id===l.createdLesson),false);
  await service.editLesson(dev,l.createdLesson,body({expectedRevision:1,changes:{published:true},upserts:[],deletes:[]}));
  assert.equal((await legacyLessons(db,student)).materials.find(row=>row.id===l.createdLesson).blocks.length,2);
  await service.saveLessonResponse(student,l.createdLesson,taskId,body({expectedRevision:0,expectedBlockRevision:1,response:'Private answer remains stored'}));
  const responses=await db.read('SELECT * FROM lesson_responses WHERE lesson_id=?',[l.createdLesson]);
  const originalBlocks=await db.read('SELECT * FROM lesson_blocks WHERE lesson_id=? ORDER BY id',[l.createdLesson]);
  const failed=body({expectedRevision:2,changes:{title:'Must roll back'},upserts:[{...creation.blocks[0],expectedRevision:9,content:{text:'Stale'}}],deletes:[]});
  await assert.rejects(service.editLesson(teacher,l.createdLesson,failed),error=>error.status===409);
  assert.deepEqual(await db.read('SELECT * FROM lesson_blocks WHERE lesson_id=? ORDER BY id',[l.createdLesson]),originalBlocks);
  assert.equal((await db.read('SELECT title,revision FROM lessons WHERE id=?',[l.createdLesson]))[0].revision,2);
  await service.editLesson(teacher,l.createdLesson,body({expectedRevision:2,changes:{title:'Изменённый CRUD-урок'},upserts:[{...creation.blocks[0],expectedRevision:1,content:{text:'Updated instruction'}}],deletes:[],order:[linkId,taskId]}));
  assert.deepEqual(await db.read('SELECT * FROM lesson_responses WHERE lesson_id=?',[l.createdLesson]),responses);
  let mine=(await legacyLessons(db,student)).materials.find(row=>row.id===l.createdLesson);
  assert.deepEqual(mine.blocks.map(row=>row.id),[linkId,taskId]);assert.equal(mine.blocks[1].response,undefined);
  await service.saveLessonResponse(student,l.createdLesson,taskId,body({expectedRevision:1,expectedBlockRevision:2,response:'New answer'}));
  mine=(await legacyLessons(db,student)).materials.find(row=>row.id===l.createdLesson);assert.equal(mine.blocks[1].response,'New answer');
  const theirs=(await legacyLessons(db,other)).materials.find(row=>row.id===l.createdLesson);assert.equal(theirs.blocks[1].response,undefined);
  await service.editLesson(teacher,l.createdLesson,body({expectedRevision:3,changes:{hiddenFromStudents:true},upserts:[],deletes:[]}));
  assert.equal((await legacyLessons(db,student)).materials.some(row=>row.id===l.createdLesson),false);
  await assert.rejects(service.deleteLesson(student,l.createdLesson,body({expectedRevision:4})),error=>error.status===403);
  const deletion=body({expectedRevision:4});await service.deleteLesson(teacher,l.createdLesson,deletion);await service.deleteLesson(teacher,l.createdLesson,deletion);
  assert.equal((await legacyLessons(db,teacher)).materials.some(row=>row.id===l.createdLesson),false);
  assert.deepEqual(await db.read('SELECT * FROM cards WHERE id=?',[l.card]),definitions);
  assert.deepEqual(await db.read('PRAGMA foreign_key_check'),[]);
  console.log('PASS live test Turso lesson create/publish/point edit/reorder/hide/soft delete, replay, atomic CAS rollback, preserved private answers and unchanged linked card');
}
async function checkWeakUi(cleared=false){
  const l=load();assert.ok(l.mainWord);
  const [rows,cards,quizzes]=await db.readMany([
    s(`SELECT p.progress_json,p.revision FROM quiz_progress p JOIN profile_members m ON m.profile_id=p.profile_id
      WHERE m.account_id=? AND p.card_id=? AND p.quiz_type='Type'`,[actors[0].id,l.card]),
    s('SELECT ru,revision FROM cards WHERE id=?',[l.card]),
    s('SELECT revision,deleted_at FROM quizzes WHERE collection_id=?',[l.collection])
  ]);
  assert.equal(rows.length,1);const counter=JSON.parse(rows[0].progress_json);
  assert.equal(counter.misses,1);assert.equal(counter.streak,cleared?4:0);assert.equal(!!counter.cleared,cleared);
  assert.equal(rows[0].revision,cleared?5:1);
  const own=await legacyState(db,actors[0]);
  assert.equal(own.stats.mistakes.some(row=>row.en.toLowerCase()===l.mainWord.toLowerCase()),!cleared);
  const other=await legacyState(db,actors[3]);
  assert.ok(!other.stats.mistakes.some(row=>row.en.toLowerCase()===l.mainWord.toLowerCase()));
  assert.equal(cards[0].ru,'before');assert.equal(cards[0].revision,1);assert.ok(quizzes.every(row=>row.revision===1 && row.deleted_at===null));
  console.log(cleared?'PASS four UI successes cleared the weak check; revision 5 persisted; definitions unchanged':'PASS weak UI mistake persisted once; own projection includes it, foreign profile does not; definitions unchanged');
}
try{
  if(mode==='--prepare')await prepare();
  else if(mode==='--prepare-main')await prepare(true);
  else if(mode==='--prepare-dev')await prepare(true,false,true);
  else if(mode==='--prepare-personal')await prepare(true,true);
  else if(mode==='--check')await check();
  else if(mode==='--check-main')await checkMain();
  else if(mode==='--check-main-deleted')await checkMain(true);
  else if(mode==='--check-main-links-deleted')await checkMainLinks();
  else if(mode==='--check-main-links-added')await checkMainLinks(true);
  else if(mode==='--check-personal')await checkPersonal();
  else if(mode==='--check-personal-ui')await checkPersonalUi();
  else if(mode==='--check-weak-ui')await checkWeakUi();
  else if(mode==='--check-weak-cleared')await checkWeakUi(true);
  else if(mode==='--check-lessons')await checkLessons();
  else if(mode==='--cleanup')await cleanup();
  else throw new Error('Use a documented --prepare/--check mode or --cleanup.');
}catch(error){console.error('Test failed:',error.message);console.error('If a fixture ledger exists, retain it and run --cleanup after the connection recovers.');process.exitCode=1;}
