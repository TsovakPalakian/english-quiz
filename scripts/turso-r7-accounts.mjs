// Explicitly authorized temporary accounts. Only normal TEST account endpoints.
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {TursoStudyClient} from '../src/turso-study.mjs';
import {credentials} from './turso-staging.mjs';
const origin='https://learn-english-turso-integrated-test.east-tarsal.workers.dev';
const file='/private/tmp/english-quiz-r7-accounts-20261005.json';
const mode=process.argv[2];
function save(value){writeFileSync(file,JSON.stringify(value,null,2),{mode:0o600});}
export async function request(path,method='GET',body=null,cookie='',expected=200){
  assert.ok(path.startsWith('/api/')&&!path.includes('://'));
  const response=await fetch(origin+path,{method,redirect:'manual',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();
  if(response.status!==expected)throw new Error(`${response.status}: ${value.error||'Unexpected response'}`);
  return {value,cookie:response.headers.get('set-cookie')?.split(';')[0]||cookie};
}
try{
  if(mode==='--register'){
    assert.ok(!existsSync(file),'Existing R7 ledger: do not create duplicate accounts');
    const suffix=randomBytes(3).toString('hex');
    const ledger={origin,accounts:Object.fromEntries(['Student','Teacher'].map(role=>[role,{login:'R7'+role+'_'+suffix,email:'r7'+role.toLowerCase()+'-'+suffix+'@example.invalid',name:'Temporary R7 '+role,password:randomBytes(24).toString('base64url'),registration:'not-submitted'}]))};
    save(ledger);
    for(const account of Object.values(ledger.accounts)){
      const {value}=await request('/api/register','POST',{login:account.login,email:account.email,name:account.name,password:account.password});
      assert.equal(value.status,'pending');account.registration='pending';save(ledger);
      console.log(JSON.stringify({login:account.login,status:'pending'}));
    }
  }else if(mode==='--student'){
    const ledger=JSON.parse(readFileSync(file,'utf8'));assert.equal(ledger.origin,origin);
    ledger.checks ||= {};ledger.fixtures ||= {card:'own_'+randomUUID(),text:'text_'+randomUUID()};ledger.operations ||= {};save(ledger);
    const account=ledger.accounts.Student;
    async function step(name,action){if(ledger.checks[name])return;await action();ledger.checks[name]=true;save(ledger);console.log('PASS '+name);}
    function mutation(name){ledger.operations[name] ||= randomUUID();save(ledger);return ledger.operations[name];}
    await step('student-login',async()=>{const result=await request('/api/login','POST',{login:account.login,password:account.password});assert.equal(result.value.user.role,'USER');account.id=result.value.user.id;account.cookie=result.cookie;account.registration='approved';});
    const call=(path,method='GET',body=null,expected=200)=>request(path,method,body,account.cookie,expected);
    await step('student-create-card',async()=>{const result=await call('/api/me/cards/new','POST',{mutationId:mutation('student-card'),id:ledger.fixtures.card,expectedRevision:0,card:{en:'TEST_R7_STUDENT_632ffe',ru:'Временная карточка R7'}});assert.equal(result.value.card.stageId,ledger.fixtures.card);});
    await step('student-create-text',async()=>{const result=await call('/api/library','POST',{mutationId:mutation('student-text'),id:ledger.fixtures.text,kind:'text',changes:{title:'TEST_R7_TEXT_632ffe',text:'Temporary R7 content.'}});assert.equal(result.value.revision,1);});
    await step('student-save-text',async()=>{const result=await call('/api/library/'+ledger.fixtures.text,'PATCH',{mutationId:mutation('student-save-text'),expectedRevision:1,changes:{text:'Updated R7 content.'}});assert.equal(result.value.revision,2);});
    await step('student-admin-denied',()=>call('/api/admin/users','GET',null,403));
    await step('student-lesson-write-denied',()=>call('/api/lessons','POST',{mutationId:mutation('student-denied-lesson'),id:'lesson_r7_denied_632ffe',changes:{title:'Denied'},blocks:[]},403));
    await step('student-logout-invalidates-token',async()=>{await call('/api/logout','POST',{});await call('/api/me/state','GET',null,401);});
    await step('student-relogin',async()=>{const result=await request('/api/login','POST',{login:account.login,password:account.password});assert.equal(result.value.user.id,account.id);account.cookie=result.cookie;});
    await step('student-card-survives-relogin',async()=>{const result=await call('/api/me/state');assert.ok(result.value.added.some(card=>card.stageId===ledger.fixtures.card&&card.ru==='Временная карточка R7'));});
    await step('student-text-survives-relogin',async()=>{const result=await call('/api/library');assert.ok(result.value.items.some(item=>item.stageId===ledger.fixtures.text&&item.text==='Updated R7 content.'&&item.stageRevision===2));});
  }else if(mode==='--teacher'){
    const ledger=JSON.parse(readFileSync(file,'utf8'));assert.equal(ledger.origin,origin);assert.ok(ledger.checks['student-text-survives-relogin']);
    const account=ledger.accounts.Teacher,student=ledger.accounts.Student;
    ledger.fixtures.teacherText ||= 'text_'+randomUUID();ledger.fixtures.lesson ||= 'lesson_'+randomUUID();save(ledger);
    async function step(name,action){if(ledger.checks[name])return;await action();ledger.checks[name]=true;save(ledger);console.log('PASS '+name);}
    function mutation(name){ledger.operations[name] ||= randomUUID();save(ledger);return ledger.operations[name];}
    const call=(path,method='GET',body=null,expected=200)=>request(path,method,body,account.cookie,expected);
    const learner=(path,method='GET',body=null,expected=200)=>request(path,method,body,student.cookie,expected);
    await step('teacher-login',async()=>{const result=await request('/api/login','POST',{login:account.login,password:account.password});assert.equal(result.value.user.role,'ADMIN');account.id=result.value.user.id;account.cookie=result.cookie;account.registration='approved';});
    await step('teacher-create-own-text',async()=>{const result=await call('/api/library','POST',{mutationId:mutation('teacher-text'),id:ledger.fixtures.teacherText,kind:'text',changes:{title:'TEST_R7_TEACHER_TEXT_632ffe',text:'Private teacher fixture.'}});assert.equal(result.value.revision,1);});
    await step('student-foreign-text-denied',()=>learner('/api/library/'+ledger.fixtures.teacherText,'PATCH',{mutationId:mutation('student-foreign-text'),expectedRevision:1,changes:{text:'Denied'}},404));
    await step('teacher-save-own-text',async()=>{const result=await call('/api/library/'+ledger.fixtures.teacherText,'PATCH',{mutationId:mutation('teacher-save-text'),expectedRevision:1,changes:{text:'Updated private teacher fixture.'}});assert.equal(result.value.revision,2);});
    await step('teacher-edit-student-card',async()=>{const result=await call('/api/admin/users/'+student.id+'/cards/'+ledger.fixtures.card,'PATCH',{mutationId:mutation('teacher-student-card'),expectedRevision:1,changes:{ru:'Карточка R7 — исправлена учителем'}});assert.equal(result.value.revision,2);});
    await step('student-sees-teacher-save',async()=>{const result=await learner('/api/me/state');assert.ok(result.value.added.some(card=>card.stageId===ledger.fixtures.card&&card.ru==='Карточка R7 — исправлена учителем'));});
    await step('teacher-logout-invalidates-token',async()=>{await call('/api/logout','POST',{});await call('/api/me/state','GET',null,401);});
    await step('teacher-relogin',async()=>{const result=await request('/api/login','POST',{login:account.login,password:account.password});assert.equal(result.value.user.id,account.id);assert.equal(result.value.user.role,'ADMIN');account.cookie=result.cookie;});
    await step('teacher-text-survives-relogin',async()=>{const result=await call('/api/library');assert.ok(result.value.items.some(item=>item.stageId===ledger.fixtures.teacherText&&item.text==='Updated private teacher fixture.'&&item.stageRevision===2));assert.ok(!result.value.items.some(item=>item.stageId===ledger.fixtures.text));});
    await step('teacher-delete-own-test-text',()=>call('/api/library/'+ledger.fixtures.teacherText,'DELETE',{mutationId:mutation('teacher-archive-text'),expectedRevision:2}));
    await step('student-delete-own-test-text',()=>learner('/api/library/'+ledger.fixtures.text,'DELETE',{mutationId:mutation('student-archive-text'),expectedRevision:2}));
    await step('student-remove-own-test-card',()=>learner('/api/me/cards/'+ledger.fixtures.card,'DELETE',{mutationId:mutation('student-unlink-card'),place:'mine',expectedRevision:1}));
    const directory=JSON.parse(readFileSync('/private/tmp/english-quiz-r7-directory.json','utf8'));
    const dev=directory.users.filter(user=>user.login==='TsovakDev');assert.equal(dev.length,1);assert.match(dev[0].id,/^[a-f0-9]{16,64}$/);
    await step('teacher-developer-profile-denied',()=>call('/api/admin/users/'+dev[0].id+'/state','GET',null,404));
    await step('teacher-student-song-write-denied',()=>call('/api/admin/users/'+student.id+'/songs','POST',{mutationId:mutation('teacher-denied-song'),id:'song_r7_denied_632ffe',changes:{title:'Denied',lyrics:'Denied'}},403));
    await step('student-managed-profile-denied',()=>learner('/api/admin/users/'+account.id+'/state','GET',null,403));
  }else if(mode==='--verify'){
    const ledger=JSON.parse(readFileSync(file,'utf8'));assert.equal(ledger.origin,origin);
    assert.equal(Object.values(ledger.checks).filter(Boolean).length,25);
    const db=new TursoStudyClient(credentials());
    const [result]=await db.read(`SELECT
      (SELECT count(*) FROM cards c JOIN profile_members m ON m.profile_id=c.owner_profile_id WHERE c.id=? AND c.scope='profile' AND c.revision=2 AND c.ru=? AND m.account_id=?) saved_student_card,
      (SELECT count(*) FROM profile_cards WHERE card_id=?) remaining_test_card_links,
      (SELECT count(*) FROM library_items l JOIN profile_members m ON m.profile_id=l.owner_profile_id WHERE l.id=? AND l.deleted_at IS NOT NULL AND l.revision=3 AND m.account_id=?) archived_student_text,
      (SELECT count(*) FROM library_items l JOIN profile_members m ON m.profile_id=l.owner_profile_id WHERE l.id=? AND l.deleted_at IS NOT NULL AND l.revision=3 AND m.account_id=?) archived_teacher_text`,
      [ledger.fixtures.card,'Карточка R7 — исправлена учителем',ledger.accounts.Student.id,ledger.fixtures.card,ledger.fixtures.text,ledger.accounts.Student.id,ledger.fixtures.teacherText,ledger.accounts.Teacher.id]);
    assert.deepEqual(result,{saved_student_card:1,remaining_test_card_links:0,archived_student_text:1,archived_teacher_text:1});
    ledger.verifiedCleanup=result;save(ledger);console.log(JSON.stringify({testOnly:true,readOnly:true,d1Queries:0,liveChecks:25,...result}));
  }else throw new Error('Use --register, --student, --teacher or --verify');
}catch(error){console.error(error.message);process.exitCode=1;}
