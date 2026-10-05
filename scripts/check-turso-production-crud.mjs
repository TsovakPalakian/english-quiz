// Explicit 6.1 disposable fixtures only. Never overwrite real definitions.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {productionCredentials} from './import-turso-production.mjs';
import {TursoStudyClient,statement} from '../src/turso-study.mjs';
const origin='https://learn-english.east-tarsal.workers.dev';
const base='/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/';
const db=new TursoStudyClient({...productionCredentials(base+'production-credentials-q9dX0T/worker.vars'),mode:'production'});
const [mode,directory]=process.argv.slice(2);assert.ok(['--check','--ui','--cleanup'].includes(mode));
const input=JSON.parse(readFileSync(0,'utf8'));assert.equal(input.login,'TsovakDev');
const dir=mode==='--check'?mkdtempSync(base+'production-crud-'):directory;
assert.match(dir,/\/production-crud-[A-Za-z0-9]+$/);
const ledger=mode==='--check'?{prefix:'r6_'+randomUUID().replaceAll('-',''),checks:[],createdAt:new Date().toISOString()}:JSON.parse(readFileSync(dir+'/result.json'));
const save=()=>writeFileSync(dir+'/result.json',JSON.stringify(ledger,null,2),{mode:0o600});save();
const tables=['cards','quizzes','quiz_collections','card_quiz_collections','lessons','lesson_blocks','library_items'];
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
let cookie='',step='login';
async function call(path,method='GET',body,status=200){
  step=method+' '+path;
  const response=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Origin:origin,
    ...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,status,step);const value=await response.json();
  if(path==='/api/login')cookie=response.headers.get('set-cookie')?.split(';')[0];
  ledger.checks.push({path,method,status});save();return value;
}
const write=(path,method,body,status=200)=>call(path,method,{...body,mutationId:randomUUID()},status);
async function baseline(){
  const rows=await db.readMany(tables.map(t=>statement('SELECT * FROM '+t+' ORDER BY '+(t==='card_quiz_collections'?'card_id,collection_id':t==='lesson_blocks'?'lesson_id,id':'id'))));
  return Object.fromEntries(tables.map((t,i)=>[t,rows[i]]));
}
try{
  const login=await call('/api/login','POST',input);assert.equal(login.user.role,'DEVELOPER');
  if(mode==='--check'){
    const before=await baseline();writeFileSync(dir+'/before.json',JSON.stringify(before),{mode:0o600,flag:'wx'});
    ledger.card=ledger.prefix+'_card';ledger.lesson=ledger.prefix+'_lesson';save();
    await db.atomic([statement("INSERT INTO cards(id,scope,en,word_key,ru) VALUES(?,'shared',?,?,?)",[ledger.card,ledger.prefix,ledger.prefix,'R6 initial'])]);
    const cardPath='/api/cards/'+ledger.card;
    await write(cardPath,'PATCH',{expectedRevision:1,changes:{ru:'R6 API Save'}});
    assert.equal((await call(cardPath)).ru,'R6 API Save');
    await write(cardPath,'PATCH',{expectedRevision:1,changes:{ru:'stale'}},409);
    const quiz=await write(cardPath+'/quizzes','POST',{expectedRevision:2,expectedCollectionRevision:0,quiz:{type:'Flip',items:[{front:ledger.prefix,back:'R6 initial quiz'}]}});
    ledger.quiz=quiz.id;save();
    await write('/api/quizzes/'+quiz.id,'PATCH',{expectedRevision:1,quiz:{type:'Flip',items:[{front:ledger.prefix,back:'R6 edited quiz'}]}});
    assert.equal((await call(cardPath)).quizzes.find(q=>q.id===quiz.id).items[0].back,'R6 edited quiz');
    await write('/api/quizzes/'+quiz.id,'DELETE',{expectedRevision:2});
    assert.ok(!(await call(cardPath)).quizzes.some(q=>q.id===quiz.id));
    const current=await call(cardPath);
    const ui=await write(cardPath+'/quizzes','POST',{expectedRevision:2,expectedCollectionRevision:current.collections[0].revision,quiz:{type:'Flip',items:[{front:'R6 UI quiz',back:'Disposable UI content'}]}});
    ledger.uiQuiz=ui.id;save();
    const block=ledger.prefix+'_task';
    await write('/api/lessons','POST',{id:ledger.lesson,changes:{title:ledger.prefix,date:'2026-10-05'},blocks:[{id:block,type:'task',tab:'overview',cardId:null,expectedRevision:0,content:{text:'R6 initial lesson'}}]});
    await write('/api/lessons/'+ledger.lesson,'PATCH',{expectedRevision:1,changes:{title:ledger.prefix+' edited'},upserts:[{id:block,type:'task',tab:'overview',cardId:null,expectedRevision:1,content:{text:'R6 edited lesson'}}],deletes:[]});
    const lesson=(await call('/api/lessons')).materials.find(r=>r.id===ledger.lesson);assert.ok(lesson);assert.equal(lesson.title,ledger.prefix+' edited');
    await write('/api/lessons/'+ledger.lesson,'DELETE',{expectedRevision:2});
    assert.ok(!(await call('/api/lessons')).materials.some(r=>r.id===ledger.lesson));
    ledger.library=[];
    for(const kind of ['text','song']){
      const id=ledger.prefix+'_'+kind;ledger.library.push(id);save();
      const changes=kind==='text'?{title:ledger.prefix,text:'R6 initial text'}:{title:ledger.prefix,artist:'R6 artist',lyrics:'R6 initial lyrics'};
      await write('/api/library','POST',{id,kind,changes});
      const changed=kind==='text'?{text:'R6 edited text'}:{lyrics:'R6 edited lyrics'};
      await write('/api/library/'+id,'PATCH',{expectedRevision:1,changes:changed});
      const item=(await call('/api/library')).items.find(r=>r.stageId===id);assert.ok(item);assert.equal(item[kind==='text'?'text':'lyrics'],Object.values(changed)[0]);
      await write('/api/library/'+id,'DELETE',{expectedRevision:2});
      assert.ok(!(await call('/api/library')).items.some(r=>r.stageId===id));
    }
    ledger.apiPassed=true;ledger.awaitingUi=true;save();
  }else if(mode==='--ui'){
    ledger.uiLesson=ledger.prefix+'_ui_lesson';save();
    await write('/api/lessons','POST',{id:ledger.uiLesson,changes:{title:'R6 UI verification',date:'2026-10-05',published:true,hiddenFromStudents:true},blocks:[
      {id:ledger.prefix+'_ui_word',type:'wordcard',tab:'words',cardId:ledger.card,expectedRevision:0,content:{collapsed:false}}]});
  }else{
    const card=await call('/api/cards/'+ledger.card);assert.equal(card.ru,'R6 UI Save');
    assert.ok(!card.quizzes.some(q=>q.id===ledger.uiQuiz));
    const state=await call('/api/me/state');
    if(state.added.some(r=>r.stageId===ledger.card))await write('/api/me/cards/'+ledger.card,'DELETE',{place:'mine',expectedRevision:state.stageAddedRevision});
    if(ledger.uiLesson)await write('/api/lessons/'+ledger.uiLesson,'DELETE',{expectedRevision:1});
    await write('/api/cards/'+ledger.card,'DELETE',{expectedRevision:card.revision});
    await call('/api/cards/'+ledger.card,'GET',undefined,404);
    const before=JSON.parse(readFileSync(dir+'/before.json')),after=await baseline();
    for(const table of tables){
      const ids=new Set(before[table].map(r=>table==='card_quiz_collections'?r.card_id+':'+r.collection_id:table==='lesson_blocks'?r.lesson_id+':'+r.id:r.id));
      const existing=after[table].filter(r=>ids.has(table==='card_quiz_collections'?r.card_id+':'+r.collection_id:table==='lesson_blocks'?r.lesson_id+':'+r.id:r.id));
      assert.equal(hash(existing),hash(before[table]),'Unrelated definitions changed: '+table);
    }
    assert.ok(after.cards.find(r=>r.id===ledger.card).deleted_at);
    for(const id of [ledger.quiz,ledger.uiQuiz])assert.ok(after.quizzes.find(r=>r.id===id).deleted_at);
    assert.ok(after.lessons.find(r=>r.id===ledger.lesson).deleted_at);
    for(const id of ledger.library)assert.ok(after.library_items.find(r=>r.id===id).deleted_at);
    ledger.awaitingUi=false;ledger.status='passed';ledger.unrelatedDefinitionsUnchanged=true;ledger.completedAt=new Date().toISOString();save();
  }
  await call('/api/logout','POST',{});
  console.log(JSON.stringify({report:dir,prefix:ledger.prefix,card:ledger.card,status:ledger.status||'API passed; UI pending'}));
}catch(error){ledger.failedStep=step;ledger.failure=error.code||error.name;save();console.error(JSON.stringify({status:'failed',step,report:dir}));process.exitCode=1;}
