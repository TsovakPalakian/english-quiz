import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fixture,actors,body,content} from './quiz-review-fixture.mjs';
import {StoredQuizIndependentReview} from '../src/stored-quiz-independent-review.mjs';
import {createIndependentQuizReviewer,REVIEW_DIMENSIONS} from '../src/quiz-independent-review.mjs';
import {QuizReviewService} from '../src/quiz-review.mjs';

const source={provider:'synthetic',model:'checker',version:'v1'};
const report=request=>({text:JSON.stringify({fingerprint:request.checked.fingerprint,revision:request.checked.revision,status:'reviewed',
  dimensions:Object.fromEntries(REVIEW_DIMENSIONS.map(key=>[key,key==='level'&&!request.checked.level?'not_assessed':'pass'])),findings:[]})});
const reviewer=complete=>createIndependentQuizReviewer({enabled:true,source,complete:complete??(async request=>report(request))});
async function setup(options={}){
  const f=await fixture(options);
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/006_independent_reviews.sql',import.meta.url),'utf8'));
  const draft=await f.draft();
  return {...f,id:draft.id,stored:new StoredQuizIndependentReview(f.service,{reviewer:reviewer()})};
}
const request=(revision=1,level='A1')=>body({expectedRevision:revision,level});
const denied=(promise,status)=>assert.rejects(promise,error=>error.status===status);

for(const d1 of [false,true])test(`stored checks survive service recreation, keep provenance and never approve (${d1?'D1 compiler':'SQLite'})`,async()=>{
  const f=await setup({d1});try{
    const before=await f.service.get(actors.student,f.id),operation=request();
    const saved=await f.stored.run(actors.outsider,f.id,operation);
    assert.equal(saved.state,'completed');assert.equal(saved.current,true);assert.equal(saved.result.status,'checked');
    assert.equal(saved.result.requiresTeacherReview,true);assert.deepEqual(saved.result.source,source);
    assert.equal(saved.checked.meaning.en,'drizzle');assert.equal(saved.requestedBy,actors.outsider.id);
    const recreated=new StoredQuizIndependentReview(f.service);
    assert.deepEqual((await recreated.latest(actors.dev,f.id,{level:'A1'})).result,saved.result);
    assert.deepEqual(await f.service.get(actors.student,f.id),before);
    assert.equal((await recreated.history(actors.second,f.id)).attempts.length,1);
    for(const actor of [actors.student,actors.other,{...actors.teacher,active:false},{...actors.dev,revoked:true}]){
      await assert.rejects(recreated.history(actor,f.id),error=>[401,403].includes(error.status));
      await assert.rejects(recreated.run(actor,f.id,request()),error=>[401,403].includes(error.status));
    }
  }finally{f.close();}
});

test('edits and level changes hide old results without deleting history; new check becomes current',async()=>{
  const f=await setup();try{
    const first=await f.stored.run(actors.teacher,f.id,request());
    assert.equal((await f.stored.latest(actors.teacher,f.id,{level:'A2'})).result,null);
    await f.service.editDraft(actors.student,f.id,body({expectedRevision:1,content:{...content,explanation:'Updated explanation.'}}));
    const stale=await f.stored.latest(actors.teacher,f.id,{level:'A1'});
    assert.equal(stale.result,null);assert.equal(stale.attempt.current,false);
    assert.equal(stale.attempt.checked.content.explanation,content.explanation);
    assert.equal(stale.attempt.result.fingerprint,first.result.fingerprint);
    await denied(f.stored.run(actors.teacher,f.id,request(1)),409);
    const second=await f.stored.run(actors.dev,f.id,request(2));assert.equal(second.current,true);
    const history=await f.stored.history(actors.outsider,f.id,{level:'A1',limit:1});
    assert.equal(history.attempts[0].id,second.id);assert.notEqual(history.next,null);
    const older=await f.stored.history(actors.teacher,f.id,{level:'A1',before:history.next});
    assert.equal(older.attempts[0].id,first.id);assert.equal(older.attempts[0].current,false);assert.equal(older.next,null);
    for(const options of [{limit:0},{before:0},{level:'C9'}])await denied(f.stored.history(actors.dev,f.id,options),400);
  }finally{f.close();}
});

test('late result is historical only; duplicate pending/completed requests do not rerun the model',async()=>{
  const f=await setup();try{
    let release,started,calls=0;
    const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
    const stored=new StoredQuizIndependentReview(f.service,{reviewer:reviewer(async input=>{calls++;started();await gate;return report(input);})});
    const operation=request(),running=stored.run(actors.teacher,f.id,operation);await entered;
    const duplicate=await stored.run(actors.teacher,f.id,operation);assert.equal(duplicate.state,'pending');assert.equal(duplicate.current,false);
    await f.service.editDraft(actors.student,f.id,body({expectedRevision:1,content:{...content,explanation:'Changed during check.'}}));
    release();const saved=await running;assert.equal(saved.current,false);assert.equal(saved.state,'completed');
    assert.deepEqual(await stored.run(actors.teacher,f.id,operation),saved);assert.equal(calls,1);
    // The durable request identity remains even after ordinary mutation receipts expire.
    f.sql.prepare('DELETE FROM operation_receipts WHERE account_id=? AND mutation_id=?').run(actors.teacher.id,operation.mutationId);
    assert.deepEqual(await stored.run(actors.teacher,f.id,operation),saved);assert.equal(calls,1);
    await denied(stored.run(actors.teacher,f.id,{...operation,expectedRevision:2}),409);
    assert.equal((await stored.latest(actors.teacher,f.id,{level:'A1'})).result,null);
  }finally{f.close();}
});

test('concurrent duplicate reservations invoke only one transport',async()=>{
  const f=await setup({d1:true});try{
    let calls=0;
    const stored=new StoredQuizIndependentReview(f.service,{reviewer:reviewer(async input=>{calls++;return report(input);})});
    const operation=request();const [a,b]=await Promise.all([stored.run(actors.teacher,f.id,operation),stored.run(actors.teacher,f.id,operation)]);
    assert.equal(a.id,b.id);assert.equal(calls,1);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_independent_requests').get().n,1);
    assert.equal((await stored.latest(actors.teacher,f.id,{level:'A1'})).result.status,'checked');
  }finally{f.close();}
});

test('disabled, refused, malformed, cancelled and unavailable checks are stored as failures, not a previous success',async()=>{
  const f=await setup();try{
    await f.stored.run(actors.teacher,f.id,request());
    const controller=new AbortController();
    const cases=[
      [undefined,'review_not_configured'],
      [reviewer(async input=>{const value=JSON.parse(report(input).text);value.status='refused';return {text:JSON.stringify(value)};}),'review_refused'],
      [async()=>({approved:true}),'invalid_review_response'],
      [async()=>{throw new Error('private credential');},'review_unavailable'],
      [reviewer(async input=>{controller.abort();return report(input);}),'cancelled'],
    ];
    for(const [check,code] of cases){
      const stored=new StoredQuizIndependentReview(f.service,{reviewer:check});
      const saved=await stored.run(actors.teacher,f.id,request(),{signal:code==='cancelled'?controller.signal:undefined});
      assert.equal(saved.state,'failed');assert.equal(saved.error,code);assert.equal(saved.result,null);assert.equal(saved.current,false);
      assert.equal((await stored.latest(actors.teacher,f.id,{level:'A1'})).result,null);
    }
    const records=f.sql.prepare('SELECT * FROM qr_independent_outcomes').all();
    assert.equal(JSON.stringify(records).includes('private credential'),false);
    assert.equal((await f.service.get(actors.student,f.id)).state,'draft');
    const before=records.length;
    await denied(f.stored.run(actors.teacher,f.id,request(),{signal:controller.signal}),400);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_independent_outcomes').get().n,before);
  }finally{f.close();}
});

test('storage history is immutable and a new quiz version inherits no result',async()=>{
  const f=await setup();try{
    await f.stored.run(actors.teacher,f.id,request());
    for(const table of ['qr_independent_requests','qr_independent_outcomes']){
      assert.throws(()=>f.sql.exec(`DELETE FROM ${table}`),/append only/);
      const column=table==='qr_independent_requests'?'requested_at':'finished_at';
      assert.throws(()=>f.sql.exec(`UPDATE ${table} SET ${column}=0`),/append only/);
    }
    await f.service.submit(actors.student,f.id,body({expectedRevision:1}));
    await f.service.approve(actors.teacher,f.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true}}));
    const approved=await f.service.get(actors.teacher,f.id);
    const replacement=await f.service.proposeRevision(actors.second,f.id,body({expectedRevision:3}));
    assert.equal((await f.stored.latest(actors.dev,replacement.id)).attempt,null);
    await f.stored.run(actors.dev,f.id,request(3));
    assert.deepEqual(await f.service.get(actors.teacher,f.id),approved);
  }finally{f.close();}
});

test('revision race at reservation rolls back the request before calling any transport',async()=>{
  const f=await setup({d1:true});try{
    let calls=0,changed=false;
    const atomic=f.db.atomic.bind(f.db);
    f.db.atomic=async commands=>{
      if(!changed&&commands.some(command=>command.sql.includes('INSERT INTO qr_independent_requests'))){
        changed=true;await f.service.editDraft(actors.student,f.id,body({expectedRevision:1,content:{...content,explanation:'Concurrent edit.'}}));
      }
      return atomic(commands);
    };
    const stored=new StoredQuizIndependentReview(f.service,{reviewer:async()=>calls++});
    await denied(stored.run(actors.dev,f.id,request()),409);
    assert.equal(calls,0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_independent_requests').get().n,0);
  }finally{f.close();}
});

test('completed and pending records survive closing and reopening the SQLite file',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'quiz-checks-')),filename=join(directory,'study.sqlite');
  let f,sql;
  try{
    f=await setup({filename});
    const saved=await f.stored.run(actors.teacher,f.id,request());
    let started;
    const entered=new Promise(resolve=>started=resolve);
    const interrupted=new StoredQuizIndependentReview(f.service,{reviewer:async()=>{started();return new Promise(()=>{});}});
    // Simulate a worker disappearing after its durable reservation, before an outcome.
    void interrupted.run(actors.teacher,f.id,request());await entered;
    f.close();
    sql=new DatabaseSync(filename);
    const db={async read(query,args=[]){return sql.prepare(query).all(...args);}};
    const reopened=new StoredQuizIndependentReview(new QuizReviewService(db));
    const history=await reopened.history(actors.dev,f.id,{level:'A1'});
    assert.equal(history.attempts[0].state,'pending');assert.equal(history.attempts[0].current,false);
    assert.deepEqual(history.attempts[1].result,saved.result);assert.equal(history.attempts[1].current,true);
    assert.equal((await reopened.latest(actors.dev,f.id,{level:'A1'})).result,null);
  }finally{sql?.close();if(f?.sql.isOpen)f.close();rmSync(directory,{recursive:true,force:true});}
});
