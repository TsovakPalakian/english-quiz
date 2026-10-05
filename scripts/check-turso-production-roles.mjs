// 6.2: existing approved R7 identities, real auth, unique disposable definitions.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {productionCredentials} from './import-turso-production.mjs';
import {TursoStudyClient,statement as s} from '../src/turso-study.mjs';
const base='/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/';
const origin='https://learn-english.east-tarsal.workers.dev';
const accounts=JSON.parse(readFileSync('/private/tmp/english-quiz-r7-accounts-20261005.json')).accounts;
const [mode,directory]=process.argv.slice(2);assert.ok(['--run','--cleanup'].includes(mode));
const dir=mode==='--run'?mkdtempSync(base+'production-roles-'):directory;
assert.match(dir,/\/production-roles-[A-Za-z0-9]+$/);
const ledger=mode==='--run'?{prefix:'r62_'+randomUUID().replaceAll('-',''),checks:[],startedAt:new Date().toISOString()}:JSON.parse(readFileSync(dir+'/result.json'));
const save=()=>writeFileSync(dir+'/result.json',JSON.stringify(ledger,null,2),{mode:0o600});save();
const db=new TursoStudyClient({...productionCredentials(base+'production-credentials-q9dX0T/worker.vars'),mode:'production'});
const tables=['cards','quizzes','quiz_collections','card_quiz_collections','lessons','lesson_blocks','library_items'];
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
async function definitions(){const rows=await db.readMany(tables.map(t=>s('SELECT * FROM '+t+' ORDER BY '+(t==='card_quiz_collections'?'card_id,collection_id':t==='lesson_blocks'?'lesson_id,id':'id'))));return Object.fromEntries(tables.map((t,i)=>[t,rows[i]]));}
let step='start';
function client(name){let cookie='';const account=accounts[name];assert.ok(account&&account.password);
  const call=async(path,method='GET',body,status=200)=>{
    step=name+' '+method+' '+path;
    const response=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Origin:origin,
      ...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal(response.status,status,step);const value=await response.json();
    if(path==='/api/login'&&response.ok){cookie=response.headers.get('set-cookie')?.split(';')[0];assert.equal(value.user.id,account.id);assert.equal(value.user.role,name==='Student'?'USER':'ADMIN');}
    ledger.checks.push({actor:name,path,method,status});save();return value;
  };
  return {call,login:()=>call('/api/login','POST',{login:account.login,password:account.password}),
    write:(path,method,body,status=200)=>call(path,method,{...body,mutationId:randomUUID()},status)};
}
try{
  const student=client('Student'),teacher=client('Teacher');
  await student.login();await teacher.login();
  if(mode==='--run'){
    writeFileSync(dir+'/before.json',JSON.stringify(await definitions()),{mode:0o600,flag:'wx'});
    ledger.card=ledger.prefix+'_shared';ledger.privateCard=ledger.prefix+'_private';
    ledger.lesson=ledger.prefix+'_lesson';ledger.task=ledger.prefix+'_task';
    ledger.studentText=ledger.prefix+'_student_text';ledger.teacherText=ledger.prefix+'_teacher_text';save();
    await db.atomic([s("INSERT INTO cards(id,scope,en,word_key,ru) VALUES(?,'shared',?,?,?)",[ledger.card,ledger.prefix,ledger.prefix,'R62 initial'])]);
    await teacher.write('/api/lessons','POST',{id:ledger.lesson,changes:{title:'R6.2 temporary permissions check',date:'2026-10-05',published:true},blocks:[
      {id:ledger.task,type:'task',tab:'overview',cardId:null,expectedRevision:0,content:{title:'R6.2 persistence',text:'Disposable student response.'}},
      {id:ledger.prefix+'_word',type:'wordcard',tab:'words',cardId:ledger.card,expectedRevision:0,content:{collapsed:false}}]});
    const path='/api/cards/'+ledger.card;
    await teacher.write(path,'PATCH',{expectedRevision:1,changes:{ru:'R62 teacher saved'}});
    assert.equal((await student.call(path)).ru,'R62 teacher saved');
    const quiz=await teacher.write(path+'/quizzes','POST',{expectedRevision:2,expectedCollectionRevision:0,quiz:{type:'Flip',items:[{front:'R62 shared',back:'Teacher quiz'}]}});
    ledger.quiz=quiz.id;save();assert.ok((await student.call(path)).quizzes.some(q=>q.id===quiz.id));
    await teacher.write('/api/quizzes/'+quiz.id,'PATCH',{expectedRevision:1,quiz:{type:'Flip',items:[{front:'R62 shared',back:'Teacher edited quiz'}]}});
    assert.equal((await student.call(path)).quizzes.find(q=>q.id===quiz.id).items[0].back,'Teacher edited quiz');
    await student.write(path,'PATCH',{expectedRevision:2,changes:{ru:'Forbidden'},role:'DEVELOPER'},403);
    await student.write(path+'/quizzes','POST',{expectedRevision:2,expectedCollectionRevision:2,quiz:{type:'Flip',items:[{front:'Blocked',back:'Blocked'}]}},403);
    await student.write('/api/quizzes/'+quiz.id,'DELETE',{expectedRevision:2},403);
    await student.write('/api/lessons','POST',{id:ledger.prefix+'_forbidden',changes:{title:'Forbidden'},blocks:[]},403);
    await student.call('/api/admin/users','GET',undefined,403);
    const state=await student.call('/api/me/state');
    await student.write('/api/me/cards/new','POST',{id:ledger.privateCard,expectedRevision:state.stageAddedRevision,card:{en:ledger.prefix+' private',ru:'Student initial'}});
    await teacher.call('/api/cards/'+ledger.privateCard,'GET',undefined,404);
    await teacher.write('/api/admin/users/'+accounts.Student.id+'/cards/'+ledger.privateCard,'PATCH',{expectedRevision:1,changes:{ru:'Teacher managed save'}});
    assert.equal((await student.call('/api/me/state')).added.find(c=>c.stageId===ledger.privateCard).ru,'Teacher managed save');
    await student.write('/api/library','POST',{id:ledger.studentText,kind:'text',changes:{title:'R62 student text',text:'Persisted private student text'}});
    await teacher.write('/api/library','POST',{id:ledger.teacherText,kind:'text',changes:{title:'R62 teacher text',text:'Private teacher text'}});
    await student.write('/api/library/'+ledger.teacherText,'PATCH',{expectedRevision:1,changes:{text:'Forbidden'}},404);
    await student.write('/api/lessons/'+ledger.lesson+'/blocks/'+ledger.task+'/response','PUT',{expectedRevision:0,expectedBlockRevision:1,response:'R62 saved student answer'});
    assert.ok((await student.call('/api/lessons')).materials.find(l=>l.id===ledger.lesson));
    await student.call('/api/logout','POST',{});await student.call('/api/me/state','GET',undefined,401);await student.login();
    assert.equal((await student.call('/api/me/state')).added.find(c=>c.stageId===ledger.privateCard).ru,'Teacher managed save');
    assert.equal((await student.call('/api/library')).items.find(i=>i.stageId===ledger.studentText).text,'Persisted private student text');
    const lesson=(await student.call('/api/lessons')).materials.find(l=>l.id===ledger.lesson);
    const response=lesson.blocks.find(b=>b.id===ledger.task).response;
    assert.ok(JSON.stringify(response).includes('R62 saved student answer'));
    const teacherLesson=(await teacher.call('/api/lessons')).materials.find(l=>l.id===ledger.lesson);
    assert.equal(teacherLesson.blocks.find(b=>b.id===ledger.task).response,undefined);
    await teacher.call('/api/logout','POST',{});await teacher.call('/api/me/state','GET',undefined,401);await teacher.login();
    assert.equal((await teacher.call('/api/library')).items.find(i=>i.stageId===ledger.teacherText).text,'Private teacher text');
    await teacher.write('/api/quizzes/'+quiz.id,'DELETE',{expectedRevision:2});
    assert.ok(!(await student.call(path)).quizzes.some(q=>q.id===quiz.id));
    ledger.apiPassed=true;ledger.awaitingBrowserReload=true;save();
  }else{
    await teacher.write('/api/lessons/'+ledger.lesson,'DELETE',{expectedRevision:1});
    await teacher.write('/api/cards/'+ledger.card,'DELETE',{expectedRevision:2});
    await student.write('/api/library/'+ledger.studentText,'DELETE',{expectedRevision:1});
    await teacher.write('/api/library/'+ledger.teacherText,'DELETE',{expectedRevision:1});
    const state=await student.call('/api/me/state');
    await student.write('/api/me/cards/'+ledger.privateCard,'DELETE',{place:'mine',expectedRevision:state.stageAddedRevision});
    await db.atomic([s('UPDATE cards SET deleted_at=unixepoch(),revision=revision+1 WHERE id=? AND scope=\'profile\' AND revision=2 AND deleted_at IS NULL',[ledger.privateCard])]);
    const before=JSON.parse(readFileSync(dir+'/before.json')),after=await definitions();
    for(const table of tables){const key=r=>table==='card_quiz_collections'?r.card_id+':'+r.collection_id:table==='lesson_blocks'?r.lesson_id+':'+r.id:r.id;
      const ids=new Set(before[table].map(key));assert.equal(hash(after[table].filter(r=>ids.has(key(r)))),hash(before[table]),'Unrelated changes: '+table);}
    for(const id of [ledger.card,ledger.privateCard])assert.ok(after.cards.find(r=>r.id===id).deleted_at);
    assert.ok(after.quizzes.find(r=>r.id===ledger.quiz).deleted_at);assert.ok(after.lessons.find(r=>r.id===ledger.lesson).deleted_at);
    for(const id of [ledger.studentText,ledger.teacherText])assert.ok(after.library_items.find(r=>r.id===id).deleted_at);
    const expected=JSON.parse(readFileSync(base+'candidate-verified-ygAmec/snapshot.json')).tables.profile_members;
    const retained=await db.read('SELECT * FROM profile_members WHERE account_id=?',[expected[0].account_id]);
    assert.deepEqual(retained,expected);ledger.retainedProfileUnchanged=true;
    ledger.status='passed';ledger.unrelatedDefinitionsUnchanged=true;ledger.awaitingBrowserReload=false;ledger.completedAt=new Date().toISOString();save();
  }
  await student.call('/api/logout','POST',{});await teacher.call('/api/logout','POST',{});
  console.log(JSON.stringify({report:dir,status:ledger.status||'API passed; browser reload pending',lesson:ledger.lesson,studentLogin:accounts.Student.login}));
}catch(error){ledger.failedStep=step;ledger.failure=error.code||error.name;save();console.error(JSON.stringify({status:'failed',step,report:dir}));process.exitCode=1;}
