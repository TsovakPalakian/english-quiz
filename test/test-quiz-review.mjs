import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors as a,body,content} from './quiz-review-fixture.mjs';
import {QuizReviewService} from '../src/quiz-review.mjs';
import {validateReviewContent} from '../src/quiz-review-content.mjs';
const checks={meaning:true,answers:true,level:true};
const rejects=(fn,status)=>assert.rejects(fn,e=>e.status===status);
async function approved(f){const draft=await f.draft();await f.service.submit(a.student,draft.id,body({expectedRevision:1}));await f.service.approve(a.teacher,draft.id,body({expectedRevision:2,checks}));return draft;}
test('draft, submission, feedback, correction and approval preserve authorship and dated snapshots',async()=>{
  const f=await fixture();try{
    const draft=await f.draft(),get=()=>f.service.get(a.student,draft.id);
    assert.equal((await get()).author.name,'Anna');assert.equal((await get()).author.group,'A1 Monday');
    await f.service.submit(a.student,draft.id,body({expectedRevision:1}));
    await rejects(()=>f.service.editDraft(a.student,draft.id,body({expectedRevision:2,content})),403);
    await f.service.requestChanges(a.teacher,draft.id,body({expectedRevision:2,comment:'Clarify the context.'}));
    const updated={...content,items:[{...content.items[0],shown:'A fine ____ started falling outside.'}]};
    await f.service.editDraft(a.student,draft.id,body({expectedRevision:3,content:updated}));
    await f.service.submit(a.student,draft.id,body({expectedRevision:4}));
    await f.service.approve(a.teacher,draft.id,body({expectedRevision:5,checks}));
    const saved=await get();assert.equal(saved.state,'approved');assert.equal(saved.revision,6);assert.equal(saved.reviewer.name,'Elena');
    assert.match(saved.reviewer.date,/^\d{4}-\d{2}-\d{2}$/);assert.equal(saved.history.length,6);
    assert.equal(saved.history.find(e=>e.action==='submit').details.content.items[0].shown,content.items[0].shown);
    assert.equal(saved.content.items[0].shown,updated.items[0].shown);
  }finally{f.close();}
});
test('student creation is lesson-only, with real membership, visibility and sense binding',async()=>{
  const f=await fixture();try{
    await rejects(()=>f.draft(a.other),403);
    for(const extra of [{cardId:3},{cardId:2},{groupId:2},{lessonId:2},{lessonId:3}])await rejects(()=>f.draft(a.student,extra),403);
    await rejects(()=>f.draft(a.student,{author:'Forged'}),400);
    f.sql.exec("UPDATE class_groups SET hidden_from_students=1 WHERE id=1");await rejects(()=>f.draft(),403);
    f.sql.exec("UPDATE class_groups SET hidden_from_students=0 WHERE id=1; INSERT INTO lesson_access(account_id,lesson_id,personal_hidden) VALUES('u1',1,1)");await rejects(()=>f.draft(),403);
    f.sql.exec('DELETE FROM lesson_access; UPDATE lesson_blocks SET deleted_at=1 WHERE id=1');await rejects(()=>f.draft(),403);
  }finally{f.close();}
});
test('reviewers need group assignment; students cannot review or read other proposals',async()=>{
  const f=await fixture();try{
    const q=await f.draft();await f.service.submit(a.student,q.id,body({expectedRevision:1}));
    assert.equal((await f.service.queue(a.teacher)).length,1);assert.equal((await f.service.queue(a.outsider)).length,0);
    await rejects(()=>f.service.get(a.other,q.id),403);
    await rejects(()=>f.service.queue(a.student),403);
    await rejects(()=>f.service.approve(a.student,q.id,body({expectedRevision:2,checks})),403);
    await rejects(()=>f.service.approve(a.outsider,q.id,body({expectedRevision:2,checks})),403);
    await rejects(()=>f.service.requestChanges(a.outsider,q.id,body({expectedRevision:2,comment:'No.'})),403);
    await rejects(()=>f.service.get({...a.student,active:false},q.id),401);
  }finally{f.close();}
});
test('approval is opt-in, requires every review check and forbids self approval',async()=>{
  const f=await fixture();try{
    const q=await f.draft(a.teacher);await f.service.submit(a.teacher,q.id,body({expectedRevision:1}));
    await rejects(()=>f.service.approve(a.teacher,q.id,body({expectedRevision:2,checks})),403);
    const disabled=new QuizReviewService(f.db);
    await rejects(()=>disabled.approve(a.second,q.id,body({expectedRevision:2,checks})),503);
    await rejects(()=>f.service.approve(a.second,q.id,body({expectedRevision:2,checks:{...checks,level:false}})),400);
    await f.service.approve(a.second,q.id,body({expectedRevision:2,checks}));
  }finally{f.close();}
});
test('approved content and audit history cannot be updated or deleted, even using direct SQL',async()=>{
  const f=await fixture();try{
    const q=await approved(f);
    await rejects(()=>f.service.editDraft(a.student,q.id,body({expectedRevision:3,content})),403);
    await rejects(()=>f.service.requestChanges(a.teacher,q.id,body({expectedRevision:3,comment:'Change'})),409);
    for(const query of ['UPDATE qr_versions SET content_json=\'{}\' WHERE id=?','DELETE FROM qr_versions WHERE id=?'])assert.throws(()=>f.sql.prepare(query).run(q.id),/immutable/);
    assert.throws(()=>f.sql.prepare('DELETE FROM qr_events WHERE version_id=?').run(q.id),/append only/);
    assert.throws(()=>f.sql.exec("UPDATE qr_events SET actor_name='Forged'"),/append only/);
    assert.throws(()=>f.sql.exec("UPDATE qr_senses SET definition='different meaning'"),/identity/);
  }finally{f.close();}
});
test('shared templates reach explicitly matched old personal cards, never by spelling alone',async()=>{
  const f=await fixture();try{
    await approved(f);assert.deepEqual(await f.service.sharedForCard(a.student,3),[]);
    await f.service.linkCard(a.dev,body({cardId:3,senseId:f.senseId}));
    const [shared]=await f.service.sharedForCard(a.student,3);assert.equal(shared.author.name,'Anna');assert.equal(shared.teacherChecked,true);
    assert.equal(shared.author.id,undefined);assert.equal(shared.lessonId,undefined);assert.equal(shared.feedback,undefined);assert.equal(shared.history,undefined);
    await rejects(()=>f.service.sharedForCard(a.other,3),404);
    await rejects(()=>f.service.linkCard(a.student,body({cardId:3,senseId:f.senseId})),403);
    await rejects(()=>f.service.linkCard(a.dev,body({cardId:2,senseId:f.senseId})),409);
  }finally{f.close();}
});
test('new version is a draft with no inherited approval; old version remains usable',async()=>{
  const f=await fixture();try{
    const old=await approved(f);const newer=await f.service.proposeRevision(a.teacher,old.id,body({expectedRevision:3}));
    assert.equal(newer.version,2);const saved=await f.service.get(a.teacher,newer.id);assert.equal(saved.reviewer,null);assert.equal(saved.author.name,'Elena');
    assert.equal(saved.history[0].details.originalAuthor.name,'Anna');assert.equal((await f.service.get(a.teacher,old.id)).state,'approved');
    assert.equal((await f.service.sharedForCard(a.teacher,1))[0].id,old.id);
    await f.service.submit(a.teacher,newer.id,body({expectedRevision:1}));
    await f.service.approve(a.second,newer.id,body({expectedRevision:2,checks}));
    const [shared]=await f.service.sharedForCard(a.teacher,1);assert.equal(shared.id,newer.id);assert.equal(shared.originalAuthor.name,'Anna');assert.equal(shared.author.name,'Elena');assert.equal((await f.service.get(a.teacher,old.id)).state,'approved');
  }finally{f.close();}
});
test('same-type quizzes are distinct families and queue has stable origin grouping',async()=>{
  const f=await fixture();try{
    const first=await f.draft(),second=await f.draft();
    await f.service.submit(a.student,first.id,body({expectedRevision:1}));await f.service.submit(a.student,second.id,body({expectedRevision:1}));
    const queue=await f.service.queue(a.teacher);assert.equal(queue.length,2);assert.notEqual(queue[0].familyId,queue[1].familyId);
    assert.equal(queue[0].groupId,1);assert.equal(queue[0].lessonId,1);assert.equal(queue[0].type,'Gap');
    assert.equal((await f.service.queue(a.teacher,{limit:1,offset:1})).length,1);
  }finally{f.close();}
});
test('mutation receipts replay safely and reject reused IDs with changed payloads',async()=>{
  const f=await fixture();try{
    const input=body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,type:'Gap',content});
    const q=await f.service.createDraft(a.student,input);assert.deepEqual(await f.service.createDraft(a.student,input),q);
    await rejects(()=>f.service.createDraft(a.student,{...input,content:{...content,explanation:'Another explanation'}}),409);
    const submit=body({expectedRevision:1});await f.service.submit(a.student,q.id,submit);assert.equal((await f.service.submit(a.student,q.id,submit)).revision,2);
    assert.equal((await f.service.get(a.student,q.id)).history.length,2);
  }finally{f.close();}
});
test('racing edits yield one success and one conflict without partial history or receipts',async()=>{
  const f=await fixture();try{
    const q=await f.draft();const results=await Promise.allSettled([1,2].map(i=>f.service.editDraft(a.student,q.id,body({expectedRevision:1,content:{...content,explanation:'Explanation '+i}}))));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
    assert.equal((await f.service.get(a.student,q.id)).history.length,2);
  }finally{f.close();}
});
test('permission revocation during a mutation is rechecked inside its transaction',async()=>{
  const f=await fixture();try{
    const q=await f.draft();await f.service.submit(a.student,q.id,body({expectedRevision:1}));
    const atomic=f.db.atomic.bind(f.db);f.db.atomic=async commands=>{f.sql.exec("UPDATE catalog_documents SET value_json='{\"teacherIds\":[]}' WHERE key='1' AND namespace='accounts-group-teachers'");return atomic(commands);};
    await rejects(()=>f.service.approve(a.teacher,q.id,body({expectedRevision:2,checks})),409);
    assert.equal(f.sql.prepare('SELECT state FROM qr_versions WHERE id=?').get(q.id).state,'submitted');
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_events WHERE version_id=?').get(q.id).n,2);
  }finally{f.close();}
});
test('D1 compilation path supports review mutations and keeps legacy content untouched',async()=>{
  const f=await fixture({d1:true});try{
    const before=JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all());
    const q=await approved(f);assert.equal((await f.service.get(a.teacher,q.id)).state,'approved');
    assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all()),before);
    assert.deepEqual(f.sql.prepare("SELECT name FROM sqlite_master WHERE name LIKE '_study_batch_%'").all(),[]);
  }finally{f.close();}
});
test('isolated schema is not installed by the current production routes or test-schema bootstrap',()=>{
  for(const file of ['src/learning-integrated-worker.mjs','src/learning-production-worker.mjs','ops/build-learning-production-assets.mjs','test/learning-test-schema.mjs'])assert.doesNotMatch(readFileSync(file,'utf8'),/quiz-review|qr_versions/);
});
test('type validation rejects malformed answers, repeated options and incoherent build content',()=>{
  const payload=items=>({explanation:'Meaning in this context.',items});
  for(const [type,items] of [['Choice',[{prompt:'Choose',options:['one','one'],answer:0}]],['Choice',[{prompt:'Choose',options:['one','two'],answer:2}]],['Gap',[{shown:'No blank',answer:'word'}]],['Build',[{parts:'wrong parts',answer:'correct sentence'}]],['Match',[{left:'a',right:'b'}]],['True / false',[{prompt:'Is it?',answer:'maybe'}]]])assert.throws(()=>validateReviewContent(type,payload(items)),e=>e.status===400);
  assert.deepEqual(validateReviewContent('Gap',content),content);
});
test('all 17 supported types accept structurally complete payloads',()=>{
  const examples={
    Flip:[{front:'drizzle',back:'изморось'}],Choice:[{prompt:'drizzle',options:['изморось','гроза'],answer:0}],
    Type:[{prompt:'изморось',answer:'drizzle'}],Gap:content.items,Build:[{parts:'falling drizzle A started',answer:'A drizzle started falling'}],
    Match:[{left:'drizzle',right:'изморось'},{left:'storm',right:'буря'}],
    'True / false':[{prompt:'Drizzle is light rain.',answer:'true'}],Tap:[{text:'A drizzle started falling.',answer:'drizzle'}],
    'Select all':[{prompt:'Select weather words',options:['drizzle','rain','spoon'],answers:[0,1]}],
    Reverse:[{front:'изморось',back:'drizzle',options:['drizzle','storm'],answer:0}],
    Spell:[{word:'drizzle',hint:'Light rain'}],Letters:[{word:'drizzle',hint:'Light rain'}],
    Listen:[{prompt:'Listen and choose',word:'drizzle',options:['изморось','гроза'],answer:0}],
    Definition:[{prompt:'Light rain',word:'drizzle',options:['drizzle','storm'],answer:0}],
    'Odd one out':[{prompt:'Which word is not weather?',options:['rain','drizzle','spoon'],answer:2}],
    Memory:[{left:'drizzle',right:'изморось'},{left:'storm',right:'буря'}],Hangman:[{word:'drizzle',hint:'Light rain'}],
  };
  assert.equal(Object.keys(examples).length,17);
  for(const [type,items] of Object.entries(examples))assert.doesNotThrow(()=>validateReviewContent(type,{explanation:'The intended meaning is explicit.',items}),type);
});
test('unauthenticated access fails before revealing version existence',async()=>{
  const f=await fixture();try{await rejects(()=>f.service.get(null,crypto.randomUUID()),401);}finally{f.close();}
});
