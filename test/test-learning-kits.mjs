import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors,body,content} from './quiz-review-fixture.mjs';
import {LearningKits} from '../src/learning-kits.mjs';
import {KitSessions} from '../src/kit-sessions.mjs';
import {QuizGenerationService} from '../src/quiz-generation.mjs';
import {reviewSamples} from './quiz-review-samples.mjs';
const checks={meaning:true,answers:true,level:true};
const denied=(promise,status)=>assert.rejects(promise,error=>error.status===status);
async function setup({d1=false}={}){
  const f=await fixture({d1,extendedLifecycle:true});
  for(const migration of ['002_generation_jobs','009_learning_kits'])f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+migration+'.sql',import.meta.url),'utf8'));
  let remaining=100;
  const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate:async()=>content});
  const kits=new LearningKits(f.service,{generation,availability:async()=>({enabled:true,remaining})}),sessions=new KitSessions(kits);
  const context={cardId:1,senseId:f.senseId,groupId:1,lessonId:1};
  const approved=async(type='Flip',data={explanation:'Light rain.',items:[{front:'drizzle',back:'изморось'}]})=>{
    const draft=await f.draft(actors.student,{type,content:data});await f.service.submit(actors.student,draft.id,body({expectedRevision:1}));await f.service.approve(actors.teacher,draft.id,body({expectedRevision:2,checks}));return draft.id;
  };
  return {...f,kits,sessions,generation,context,approved,setRemaining:value=>remaining=value};
}
test('coverage counts types, not variants, and separates exact meanings and old personal mappings',async()=>{
  const f=await setup();try{
    await f.approved();await f.approved();await f.draft();
    const data=await f.kits.coverage(actors.teacher,f.context);assert.equal(data.counts.total,17);assert.equal(data.counts.ready,1);assert.equal(data.types.find(t=>t.type==='Flip').approvedCount,2);
    assert.equal(data.types.find(t=>t.type==='Gap').status,'needs_changes');assert.equal(data.types.find(t=>t.type==='Match').reason,'word_set_required');assert.equal(data.types.find(t=>t.type==='Listen').reason,'audio_required');
    await f.service.linkCard(actors.dev,body({cardId:3,senseId:f.senseId}));assert.equal((await f.kits.coverage(actors.student,{cardId:3})).counts.ready,1);
    await denied(f.kits.coverage(actors.other,{cardId:3}),404);
    const second=await f.service.createSense(actors.dev,body({cardId:1,meaning:{partOfSpeech:'verb',translation:'поливать',definition:'Pour a little liquid over food.'}}));
    assert.equal((await f.kits.coverage(actors.teacher,{cardId:1})).selectionRequired,true);
    const otherMeaning=await f.kits.coverage(actors.teacher,{...f.context,senseId:second.senseId});assert.equal(otherMeaning.counts.ready,0);
    const own=await f.kits.coverage(actors.student,f.context);assert.equal(own.library.length,0);assert.ok(own.types.every(row=>!Object.hasOwn(row,'proposalIds')&&!Object.hasOwn(row,'jobId')));
    await denied(f.kits.queue(actors.student),403);assert.equal((await f.kits.queue(actors.outsider)).rows.length,4);
  }finally{f.close();}
});
test('sense metadata has provenance, nullable level, strict validation, CAS and immutable history in D1',async()=>{
  const f=await setup({d1:true});try{
    const metadata={level:'A1',forms:['drizzles'],examples:[{en:'It drizzles.',translation:'Моросит.'}],source:{title:'Teacher notes',url:'https://example.org/word',license:'Teacher supplied; not independently verified'}};
    const operation=body({...f.context,expectedRevision:0,metadata});const saved=await f.kits.setMetadata(actors.teacher,operation);assert.equal(saved.revision,1);assert.deepEqual(await f.kits.setMetadata(actors.teacher,operation),saved);
    await denied(f.kits.setMetadata(actors.student,operation),403);await denied(f.kits.setMetadata(actors.dev,body({...f.context,expectedRevision:0,metadata})),409);
    for(const extra of [{level:'C9'},{forms:['a','A']},{source:{...metadata.source,url:'javascript:alert(1)'}},{examples:[{en:'x',translation:'y',approved:true}]}])await denied(f.kits.setMetadata(actors.teacher,body({...f.context,expectedRevision:1,metadata:{...metadata,...extra}})),400);
    assert.equal((await f.kits.coverage(actors.teacher,f.context)).meaning.metadata.level,'A1');assert.throws(()=>f.sql.exec('DELETE FROM qr_sense_metadata_events'),/append only/);
  }finally{f.close();}
});
test('targeted fill preserves manual and approved content, excludes prerequisites and safely replays at zero quota',async()=>{
  const f=await setup({d1:true});try{
    await f.approved();await f.draft();
    const operation=body({...f.context,types:['Flip','Gap','Type','Match','Listen']});const result=await f.kits.fill(actors.teacher,operation);assert.equal(result.ids.length,1);
    f.setRemaining(0);assert.deepEqual(await f.kits.fill(actors.teacher,operation),result);
    await denied(f.kits.fill(actors.teacher,body({...f.context,types:['Reverse']})),409);
    assert.deepEqual((await f.generation.list(actors.teacher)).map(job=>job.type),['Type']);await denied(f.kits.fill(actors.student,operation),403);
  }finally{f.close();}
});
test('second opinion blocks approval, requires an independent teacher, and survives as history after correction',async()=>{
  const f=await setup();try{
    const q=await f.draft();await f.service.submit(actors.student,q.id,body({expectedRevision:1}));
    const concern=await f.kits.requestOpinion(actors.teacher,q.id,body({expectedRevision:2,comment:'Please check ambiguity.'}));
    await denied(f.service.approve(actors.dev,q.id,body({expectedRevision:2,checks})),409);
    await denied(f.kits.decideOpinion(actors.teacher,q.id,body({expectedRevision:2,opinionId:concern.id,decision:'confirm',comment:'My own request.'})),409);
    await f.kits.decideOpinion(actors.outsider,q.id,body({expectedRevision:2,opinionId:concern.id,decision:'needs_changes',comment:'Two meanings overlap.'}));
    await denied(f.service.approve(actors.dev,q.id,body({expectedRevision:2,checks})),409);
    await f.service.requestChanges(actors.teacher,q.id,body({expectedRevision:2,comment:'Please clarify.'}));
    await f.service.editDraft(actors.student,q.id,body({expectedRevision:3,content:{...content,explanation:'Clarified rain meaning.'}}));
    await f.service.submit(actors.student,q.id,body({expectedRevision:4}));await f.service.approve(actors.second,q.id,body({expectedRevision:5,checks}));
    assert.equal((await f.kits.opinions(actors.dev,q.id))[0].decision,'needs_changes');
    await denied(f.kits.opinions(actors.student,q.id),403);
  }finally{f.close();}
});
test('confirmed second opinion enables normal independent approval without auto-approving',async()=>{
  const f=await setup({d1:true});try{
    const q=await f.draft();await f.service.submit(actors.student,q.id,body({expectedRevision:1}));
    const concern=await f.kits.requestOpinion(actors.teacher,q.id,body({expectedRevision:2,comment:'Please check.'}));
    await f.kits.decideOpinion(actors.dev,q.id,body({expectedRevision:2,opinionId:concern.id,decision:'confirm',comment:'Meaning and answer are clear.'}));
    assert.equal((await f.service.get(actors.teacher,q.id)).state,'submitted');await f.service.approve(actors.teacher,q.id,body({expectedRevision:2,checks}));
    assert.equal((await f.service.get(actors.teacher,q.id)).state,'approved');
  }finally{f.close();}
});
test('withdrawal and replacement affect new sessions but never rewrite approved content or started snapshots',async()=>{
  const f=await setup({d1:true});try{
    const id=await f.approved(),before=await f.service.get(actors.teacher,id);
    const start=await f.sessions.start(actors.student,body({cardId:1,senseId:f.senseId,versionId:id,mode:'practice'}));
    const open=await f.sessions.get(actors.student,start.id);assert.equal(JSON.stringify(open).includes('изморось'),false);assert.equal(Object.hasOwn(open,'content'),false);
    const operation=body({expectedRevision:0,available:false,reason:'Check the translation.'});await f.kits.publication(actors.outsider,id,operation);await f.kits.publication(actors.outsider,id,operation);
    assert.deepEqual(await f.service.sharedForCard(actors.student,1),[]);assert.deepEqual(await f.service.get(actors.teacher,id),before);
    await denied(f.sessions.start(actors.student,body({cardId:1,senseId:f.senseId,versionId:id,mode:'practice'})),409);
    await f.sessions.submit(actors.student,start.id,body({expectedRevision:1,responses:['изморось']}));const done=await f.sessions.get(actors.student,start.id);assert.equal(done.correctCount,1);assert.equal(done.content.items[0].back,'изморось');
    const next=await f.service.proposeRevision(actors.teacher,id,body({expectedRevision:3}));await f.service.editDraft(actors.teacher,next.id,body({expectedRevision:1,content:{explanation:'New version.',items:[{front:'drizzle',back:'мелкий дождь'}]}}));
    await f.service.submit(actors.teacher,next.id,body({expectedRevision:2}));await f.service.approve(actors.second,next.id,body({expectedRevision:3,checks}));
    await f.kits.publication(actors.dev,id,body({expectedRevision:1,available:true,reason:'Old record restored for history.'}));
    assert.deepEqual((await f.service.sharedForCard(actors.student,1)).map(q=>q.id),[next.id]);assert.equal((await f.sessions.get(actors.student,start.id)).content.items[0].back,'изморось');
    await denied(f.sessions.get(actors.other,start.id),404);assert.throws(()=>f.sql.exec("UPDATE qr_session_snapshots SET content_json='{}',revision=revision+1"),/immutable/);
  }finally{f.close();}
});
test('exam snapshot hides grading until injected release authorization and scores frozen allowed forms',async()=>{
  const f=await setup();try{
    await f.kits.setMetadata(actors.teacher,body({...f.context,expectedRevision:0,metadata:{level:null,forms:['drizzles'],examples:[],source:null}}));
    const id=await f.approved('Type',{explanation:'The word is drizzle.',items:[{prompt:'изморось',answer:'drizzle'}]});
    const {id:sessionId}=await f.sessions.start(actors.student,body({cardId:1,senseId:f.senseId,versionId:id,mode:'exam'}));
    const operation=body({expectedRevision:1,responses:['drizzles']});await f.sessions.submit(actors.student,sessionId,operation);await f.sessions.submit(actors.student,sessionId,operation);
    const hidden=await f.sessions.get(actors.student,sessionId);assert.equal(Object.hasOwn(hidden,'correctCount'),false);assert.equal(Object.hasOwn(hidden,'content'),false);
    await denied(f.sessions.release(actors.dev,sessionId,body({expectedRevision:2})),403);
    const allowed=new KitSessions(f.kits,{authorizeExamRelease:async actor=>actor.id===actors.teacher.id});await allowed.release(actors.teacher,sessionId,body({expectedRevision:2}));
    assert.equal((await allowed.get(actors.student,sessionId)).correctCount,1);await denied(allowed.release(actors.student,sessionId,body({expectedRevision:2})),403);
    await denied(f.sessions.submit(actors.student,sessionId,body({expectedRevision:1,responses:['x']})),409);
  }finally{f.close();}
});
test('all 17 type contracts hide answer keys before submission and grade their original snapshots',async()=>{
  const f=await setup({d1:true});try{
    for(const [type,items] of Object.entries(reviewSamples)){
      const id=await f.approved(type,{explanation:'A teacher-checked explanation.',items});
      const {id:sessionId}=await f.sessions.start(actors.student,body({cardId:1,senseId:f.senseId,versionId:id,mode:'practice'}));
      const open=await f.sessions.get(actors.student,sessionId);
      assert.equal(Object.hasOwn(open,'content'),false,type);assert.equal(Object.hasOwn(open,'responses'),false,type);assert.doesNotMatch(JSON.stringify(open.questions),/"(?:answer|answers|back|word)":/,type);
      const pairs=['Match','Memory'].includes(type);
      const responses=items.map((item,index)=>pairs?(index+items.length-1)%items.length:item.answers??item.answer??(type==='Flip'?item.back:item.word));
      await denied(f.sessions.submit(actors.student,sessionId,body({expectedRevision:1,responses:[]})),400);
      await f.sessions.submit(actors.student,sessionId,body({expectedRevision:1,responses}));
      const done=await f.sessions.get(actors.student,sessionId);assert.equal(done.correctCount,items.length,type);assert.deepEqual(done.content.items,items,type);
    }
    const listen=(await f.kits.coverage(actors.teacher,f.context)).types.find(row=>row.type==='Listen');
    assert.equal(listen.approvedCount,1);assert.equal(listen.status,'missing');assert.equal(listen.reason,'audio_required');
  }finally{f.close();}
});
test('atomic checks reject a concurrent opinion, withdrawal and access removal without partial writes',async()=>{
  const f=await setup({d1:true});try{
    const approved=await f.approved(),draft=await f.draft();await f.service.submit(actors.student,draft.id,body({expectedRevision:1}));
    const original=f.db.atomic.bind(f.db);let interfere;
    f.db.atomic=async commands=>{const next=interfere;interfere=null;if(next)await next();return original(commands);};
    interfere=()=>f.kits.requestOpinion(actors.teacher,draft.id,body({expectedRevision:2,comment:'Concurrent concern.'}));
    await denied(f.service.approve(actors.dev,draft.id,body({expectedRevision:2,checks})),409);assert.equal((await f.service.get(actors.teacher,draft.id)).state,'submitted');
    interfere=()=>f.kits.publication(actors.teacher,approved,body({expectedRevision:0,available:false,reason:'Concurrent withdrawal.'}));
    await denied(f.sessions.start(actors.student,body({cardId:1,senseId:f.senseId,versionId:approved,mode:'practice'})),409);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_session_snapshots').get().n,0);
    await f.kits.publication(actors.teacher,approved,body({expectedRevision:1,available:true,reason:'Restore before access race test.'}));
    interfere=()=>f.sql.exec("DELETE FROM class_group_students WHERE account_id='u1'");
    await denied(f.sessions.start(actors.student,body({cardId:1,senseId:f.senseId,versionId:approved,mode:'practice'})),409);
  }finally{f.close();}
});
test('targeted fill guards a concurrently created proposal and bounded retries do not duplicate jobs',async()=>{
  const f=await setup({d1:true});try{
    const original=f.db.atomic.bind(f.db);let interfere=()=>f.draft(actors.student,{type:'Type',content:{explanation:'Typed answer.',items:[{prompt:'изморось',answer:'drizzle'}]}});
    f.db.atomic=async commands=>{const next=interfere;interfere=null;if(next)await next();return original(commands);};
    await denied(f.kits.fill(actors.teacher,body({...f.context,types:['Type']})),409);
    assert.equal((await f.generation.list(actors.teacher)).length,0);
    const first=await f.kits.fill(actors.teacher,body({...f.context,types:['Flip']}));
    const repeated=await f.kits.fill(actors.teacher,body({...f.context,types:['Flip']}));assert.deepEqual(repeated.ids,[]);
    assert.equal((await f.generation.list(actors.teacher)).length,1);
    const id=first.ids[0];
    // Simulate a terminal generation failure without running an external provider.
    f.sql.prepare("UPDATE qr_generation_jobs SET state='review',issue='temporary_failure',cycle=2,revision=revision+1 WHERE id=?").run(id);
    assert.equal((await f.kits.coverage(actors.teacher,f.context)).types.find(row=>row.type==='Flip').canPrepare,false);
    await f.kits.fill(actors.teacher,body({...f.context,types:['Flip']}));assert.equal((await f.generation.list(actors.teacher)).length,1);
  }finally{f.close();}
});
