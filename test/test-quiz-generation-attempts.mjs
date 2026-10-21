import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors,body,content} from './quiz-review-fixture.mjs';
import {QuizGenerationService} from '../src/quiz-generation.mjs';
import {LanguageProviders} from '../src/language-providers.mjs';
import {createWorkersAIQuizAdapter,createRoutedQuizGenerator} from '../src/workers-ai-quiz-provider.mjs';
const source={task:'generation',adapterId:'local',provider:'test',model:'fixture',version:'v1',locale:'en-US',mode:'text',configurationRevision:1};
async function setup(generate=async()=>content,{d1=false}={}){
  const f=await fixture({d1});f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/002_generation_jobs.sql',import.meta.url),'utf8'));
  let time=10000;
  const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate,now:()=>time,timeoutMs:50,leaseMs:200,backoffMs:1});
  return {...f,generation,advance:(amount=300)=>{time+=amount;},history:id=>generation.attemptHistory(actors.teacher,id),
    enqueue:(types=['Gap'])=>generation.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types}))};
}
test('attempt is durable before generation; accepted legacy output keeps unknown counters in D1 path',async()=>{
  let f;f=await setup(async()=>{assert.equal(f.sql.prepare('SELECT state FROM qr_generation_attempts').get().state,'running');return content;},{d1:true});
  try{const {ids}=await f.enqueue();await f.generation.runOne();await f.generation.runOne();const entries=await f.history(ids[0]);
    assert.equal(entries.length,1);assert.equal(entries[0].state,'accepted');assert.equal(entries[0].source,null);assert.equal(entries[0].usage,null);assert.ok(entries[0].finishedAt>=entries[0].startedAt);
  }finally{f.close();}
});
test('three rejections retain partial usage and manual cycles never overwrite old attempts',async()=>{
  const f=await setup(async({onObservation})=>{onObservation({source,usage:{prompt_tokens:5}});return {explanation:'Invalid',items:[]};});
  try{const {ids}=await f.enqueue();for(let i=0;i<3;i++){await f.generation.runOne();f.advance();}const entries=await f.history(ids[0]);
    assert.deepEqual(entries.map(e=>e.attempt),[1,2,3]);assert.ok(entries.every(e=>e.state==='rejected'&&e.issue==='invalid_content'));assert.deepEqual(entries[0].usage,{prompt_tokens:5});
    const [job]=await f.generation.list(actors.teacher);await f.generation.retry(actors.teacher,job.id,body({expectedRevision:job.revision}));await f.generation.runOne();
    const next=await f.history(ids[0]);assert.deepEqual(next.slice(0,3),entries);assert.equal(next[3].cycle,1);assert.equal(next[3].attempt,1);
  }finally{f.close();}
});
test('late observations cannot rewrite a completed timeout',async()=>{
  let observe;const f=await setup(({onObservation})=>{observe=onObservation;return new Promise(()=>{});});
  try{const {ids}=await f.enqueue();await f.generation.runOne();const entries=await f.history(ids[0]);assert.equal(entries[0].state,'error');assert.equal(entries[0].issue,'timeout');
    observe({source,usage:{total_tokens:999}});assert.deepEqual(await f.history(ids[0]),entries);
  }finally{f.close();}
});
test('an expired attempt is interrupted once and recovery uses the next attempt number',async()=>{
  const f=await setup();try{const {ids}=await f.enqueue();
    f.sql.prepare("UPDATE qr_generation_jobs SET state='running',attempts=1,lease_token='lost',lease_until=9999 WHERE id=?").run(ids[0]);
    f.sql.prepare("INSERT INTO qr_generation_attempts(job_id,cycle,attempt,lease_token,state,started_at) VALUES(?,0,1,'lost','running',9000)").run(ids[0]);
    await f.generation.runOne();await f.generation.runOne();const entries=await f.history(ids[0]);
    assert.equal(entries.length,2);assert.equal(entries[0].state,'interrupted');assert.equal(entries[0].issue,'worker_interrupted');assert.equal(entries[0].usage,null);assert.equal(entries[1].state,'accepted');assert.equal(entries[1].attempt,2);
  }finally{f.close();}
});
test('concurrent workers and cached receipt recovery do not duplicate attempts',async()=>{
  let calls=0;const f=await setup(async()=>{calls++;return content;});try{const {ids}=await f.enqueue();const create=f.service.createGeneratedDraft.bind(f.service);let broken=true;
    f.service.createGeneratedDraft=async(...args)=>{const q=await create(...args);if(broken){broken=false;throw new Error('crash');}return q;};
    await Promise.all([f.generation.runOne(),f.generation.runOne()]);f.advance();await f.generation.runOne();
    assert.equal(calls,1);assert.equal((await f.history(ids[0])).length,1);assert.equal((await f.history(ids[0]))[0].state,'accepted');assert.equal((await f.generation.list(actors.teacher))[0].state,'submitted');
  }finally{f.close();}
});
test('an old worker finishing after lease takeover cannot rewrite the interrupted attempt',async()=>{
  let release,entered,calls=0;const started=new Promise(resolve=>entered=resolve);
  const f=await setup(async()=>{calls++;if(calls===1){entered();return new Promise(resolve=>release=resolve);}return content;});
  f.generation.timeoutMs=2000;f.generation.leaseMs=5000;
  try{const {ids}=await f.enqueue();const old=f.generation.runOne();await started;f.advance(6000);await f.generation.runOne();release(content);await old;
    const entries=await f.history(ids[0]);assert.deepEqual(entries.map(e=>e.state),['interrupted','accepted']);assert.equal(entries[0].usage,null);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,1);assert.equal((await f.generation.list(actors.teacher))[0].state,'submitted');
  }finally{f.close();}
});
test('final attempts cannot be changed or deleted; unfinished identity and timestamps are constrained',async()=>{
  const f=await setup();try{const {ids}=await f.enqueue();await f.generation.runOne();
    assert.throws(()=>f.sql.prepare('DELETE FROM qr_generation_attempts WHERE job_id=?').run(ids[0]),/append only/);
    assert.throws(()=>f.sql.prepare('UPDATE qr_generation_attempts SET usage_json=? WHERE job_id=?').run('{"total_tokens":0}',ids[0]),/immutable/);
    const {ids:other}=await f.enqueue(['Type']);f.sql.prepare("INSERT INTO qr_generation_attempts(job_id,cycle,attempt,lease_token,state,started_at) VALUES(?,0,1,'open','running',10000)").run(other[0]);
    assert.throws(()=>f.sql.prepare("UPDATE qr_generation_attempts SET attempt=2,state='error',finished_at=10000 WHERE job_id=?").run(other[0]),/immutable/);
    assert.throws(()=>f.sql.prepare("UPDATE qr_generation_attempts SET state='error',finished_at=NULL WHERE job_id=?").run(other[0]),/constraint/i);
  }finally{f.close();}
});
test('history is shared by all teachers but rejects students, revoked accounts and deleted contexts',async()=>{
  const f=await setup();try{const {ids}=await f.enqueue();await f.generation.runOne();
    await assert.rejects(f.generation.attemptHistory(actors.student,ids[0]),e=>e.status===403);
    assert.deepEqual(await f.generation.attemptHistory(actors.outsider,ids[0]),await f.history(ids[0]));
    await assert.rejects(f.generation.attemptHistory({...actors.outsider,revoked:true},ids[0]),e=>e.status===403);
    assert.equal((await f.generation.attemptHistory(actors.dev,ids[0])).length,1);await assert.rejects(f.history(crypto.randomUUID()),e=>e.status===404);
    f.sql.exec('UPDATE lessons SET deleted_at=1 WHERE id=1');await assert.rejects(f.history(ids[0]),e=>e.status===403);
  }finally{f.close();}
});
test('rejected Workers AI answers preserve valid usage; network and quota errors keep it unknown',async()=>{
  for(const kind of ['quality','malformed','quota','network']){
    const adapter=createWorkersAIQuizAdapter({enabled:true,freeTierVerified:true,accountId:'a'.repeat(32),apiToken:'test-token',fetchImpl:async(_,options)=>{
      if(kind==='quota')return new Response('',{status:429});if(kind==='network')throw new Error('private secret');
      const request=JSON.parse(JSON.parse(options.body).messages[1].content);
      const response=kind==='malformed'?'not JSON':JSON.stringify({type:request.type,meaning:{...request.meaning,en:'wrong word'},content});
      return Response.json({success:true,result:{response,usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}},errors:[]});
    }});
    const providers=new LanguageProviders({adapters:[adapter],authorize:async()=>true});providers.configure(actors.dev,{expectedRevision:1,selections:{generation:{adapterId:adapter.id,locale:'en-US',mode:'text'}}});
    const f=await setup(createRoutedQuizGenerator({providers,includeMetadata:true}));try{const {ids}=await f.enqueue();await f.generation.runOne();const [entry]=await f.history(ids[0]);
      assert.equal(entry.source.provider,'cloudflare');assert.equal(entry.source.configurationRevision,2);assert.equal(entry.state,['quality','malformed'].includes(kind)?'rejected':'error');
      assert.deepEqual(entry.usage,['quality','malformed'].includes(kind)?{prompt_tokens:10,completion_tokens:5,total_tokens:15}:null);
      assert.equal(JSON.stringify(entry).includes('test-token'),false);assert.equal(JSON.stringify(entry).includes('private'),false);
    }finally{f.close();}
  }
});
test('start-log failure rolls back attempt count before calling the generator',async()=>{
  let calls=0;const f=await setup(async()=>{calls++;return content;});try{await f.enqueue();
    f.sql.exec("CREATE TRIGGER reject_attempt BEFORE INSERT ON qr_generation_attempts BEGIN SELECT RAISE(ABORT,'constraint simulated failure'); END;");
    await f.generation.runOne();assert.equal(calls,0);assert.equal(f.sql.prepare('SELECT attempts FROM qr_generation_jobs').get().attempts,0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_generation_attempts').get().n,0);
  }finally{f.close();}
});
test('context-only and preapproved jobs produce no artificial attempts',async()=>{
  const f=await setup();try{const {ids}=await f.enqueue(['Match']);await f.generation.runOne();assert.deepEqual(await f.history(ids[0]),[]);
    await f.enqueue(['Gap']);const draft=await f.draft();await f.service.submit(actors.student,draft.id,body({expectedRevision:1}));await f.service.approve(actors.teacher,draft.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true}}));await f.generation.runOne();
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_generation_attempts').get().n,0);
  }finally{f.close();}
});
