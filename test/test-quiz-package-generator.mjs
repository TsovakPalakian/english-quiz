import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaFixture,wav} from './quiz-media-fixture.mjs';
import {actors,body} from './quiz-review-fixture.mjs';
import {QuizGenerationService,GenerationIssue} from '../src/quiz-generation.mjs';
import {QuizGenerationContext} from '../src/quiz-generation-context.mjs';
import {createQuizPackageGenerator} from '../src/quiz-package-generator.mjs';
import {createModelQuizGenerator} from '../src/quiz-generation-model.mjs';
import {QUIZ_TYPES} from '../src/learning-study.mjs';
const samples=m=>({Flip:{front:m.en,back:m.translation},Choice:{prompt:m.en,options:[m.translation,'heavy snow'],answer:0},Type:{prompt:m.translation,answer:m.en},Gap:{shown:'Fine ____ fell.',answer:m.en,hint:'Rain'},Build:{parts:`fell ${m.en} Fine`,answer:`Fine ${m.en} fell`},'True / false':{prompt:`${m.en} is light rain.`,answer:'true'},Tap:{text:`Fine ${m.en} fell.`,answer:m.en},Reverse:{front:m.translation,back:m.en,options:[m.en,'storm'],answer:0},Spell:{word:m.en,hint:'Rain'},Letters:{word:m.en,hint:'Rain'},Definition:{prompt:m.definition,word:m.en,options:[m.en,'storm'],answer:0},Hangman:{word:m.en,hint:'Rain'}});
async function setup({d1=true,wordCount=3,audio=true,dictionary=false,generate=null}={}){
  const f=await mediaFixture({d1});f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/015_generation_context.sql',import.meta.url),'utf8'));
  for(const [index,en,translation,definition] of [[5,'storm','буря','Violent weather with strong winds.'],[6,'sunshine','солнце','Light from the sun.']].slice(0,wordCount-1)){
    f.sql.prepare("INSERT INTO cards(id,scope,en,word_key,ru) VALUES(?,'shared',?,?,?)").run(index,en,en,translation);
    f.sql.prepare("INSERT INTO lesson_blocks(id,lesson_id,position,type,card_id) VALUES(?,1,?,'word',?)").run(index,index,index);
    await f.service.createSense(actors.dev,body({cardId:index,meaning:{partOfSpeech:'noun',translation,definition}}));
  }
  const [target]=await f.db.read('SELECT en,translation,definition,part_of_speech FROM qr_senses WHERE id=?',[f.senseId]);
  const asset=audio?await f.media.upload(actors.dev,body({...f.context,purpose:'quiz',mime:'audio/wav',name:'reference.wav',rights:'Synthetic source only.'}),wav(),{kind:'tts',text:target.en,voice:'synthetic'}):null;
  const dataset=dictionary?{version:'3.0',sha256:'a'.repeat(64),lookup:async()=>[{word:'drizzle',senseKey:'drizzle%1:19:00::',pos:'n',definition:target.definition,examples:['A fine drizzle fell.']}]}:null;
  const preparation=new QuizGenerationContext({review:f.service,dataset,resolveReference:dictionary?async()=> 'drizzle%1:19:00::':null,media:f.media,resolveAudio:async()=>asset?.id||null});
  let calls=0,at=10000;const requests=[];
  const text=createModelQuizGenerator({enabled:true,complete:async request=>{calls++;requests.push(request);return JSON.stringify({type:request.type,meaning:request.meaning,content:{explanation:'This answer matches the supplied meaning.',items:[samples(request.meaning)[request.type]]}});}});
  const queue=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,preparation,generate:generate||createQuizPackageGenerator({generate:text}),now:()=>at,timeoutMs:1000,leaseMs:5000,backoffMs:1});
  return {...f,queue,preparation,asset,target,requests,calls:()=>calls,tick:()=>{at+=100;},enqueue:(types)=>queue.enqueue(actors.teacher,body({...f.context,types}))};
}
test('all 17 types prepare independently with immutable source snapshots, explanations and teacher-only publication',async()=>{
  for(const d1 of [false,true]){const f=await setup({d1,dictionary:true});try{
    const request=body(f.context),result=await f.queue.enqueuePackage(actors.teacher,request);assert.equal(result.ids.length,17);assert.deepEqual(await f.queue.enqueuePackage(actors.teacher,request),result);
    for(let n=0;n<17;n++)assert.equal(await f.queue.runOne(),true);assert.equal(await f.queue.runOne(),false);
    const jobs=await f.queue.list(actors.teacher);assert.equal(jobs.length,17);assert.ok(jobs.every(job=>job.state==='submitted'),JSON.stringify(jobs));assert.equal(f.calls(),12);
    assert.deepEqual(new Set(jobs.map(job=>job.type)),new Set(QUIZ_TYPES));assert.deepEqual(await f.service.sharedForCard(actors.student,1),[]);
    for(const job of jobs){const q=await f.service.get(actors.teacher,job.versionId);assert.equal(q.author.kind,'automatic');assert.ok(q.content.explanation);assert.equal(q.state,'submitted');assert.equal((await f.queue.attemptHistory(actors.teacher,job.id))[0].state,'accepted');}
    assert.ok(f.requests.every(request=>request.evidence.examples[0]==='A fine drizzle fell.'));assert.ok(!JSON.stringify(f.requests).includes('senseId'));
    const snapshot=JSON.parse(f.sql.prepare('SELECT snapshot_json FROM qr_generation_contexts LIMIT 1').get().snapshot_json);assert.equal(snapshot.dictionary.referenceId,'drizzle%1:19:00::');assert.equal(snapshot.words.length,3);
    assert.throws(()=>f.sql.exec("UPDATE qr_generation_contexts SET snapshot_json='{}'"),/immutable/);
    const listen=jobs.find(job=>job.type==='Listen'),q=await f.service.get(actors.teacher,listen.versionId);assert.equal(q.content.items[0].mediaId,f.asset.id);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM quizzes').get().n,1);
  }finally{f.close();}}
});
test('missing words and audio create explicit review reasons without fake quizzes or repeated model calls',async()=>{
  const f=await setup({wordCount:1,audio:false});try{
    await f.enqueue(['Match','Memory','Select all','Odd one out','Listen']);for(let n=0;n<5;n++)await f.queue.runOne();
    const jobs=await f.queue.list(actors.teacher);assert.ok(jobs.every(job=>job.state==='review'&&job.attempts===1));assert.equal(jobs.find(job=>job.type==='Listen').issue,'audio_unavailable');assert.ok(jobs.filter(job=>job.type!=='Listen').every(job=>job.issue==='context_required'));assert.equal(f.calls(),0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_versions').get().n,0);
  }finally{f.close();}
});
test('ambiguous, duplicate and other-lesson senses are not silently mixed into the word set',async()=>{
  const f=await setup();try{
    await f.service.createSense(actors.dev,body({cardId:5,meaning:{partOfSpeech:'verb',translation:'штурмовать',definition:'Attack a place.'}}));
    f.sql.exec("UPDATE lesson_blocks SET deleted_at=1 WHERE card_id=6; INSERT INTO cards(id,scope,en,word_key,ru) VALUES(7,'shared','mist','mist','изморось'); INSERT INTO lesson_blocks(id,lesson_id,position,type,card_id) VALUES(7,1,7,'word',7)");
    await f.service.createSense(actors.dev,body({cardId:7,meaning:{partOfSpeech:'noun',translation:f.target.translation,definition:'Tiny droplets suspended in the air.'}}));
    await f.enqueue(['Match']);await f.queue.runOne();const [job]=await f.queue.list(actors.teacher);assert.equal(job.issue,'context_required');const snapshot=JSON.parse((await f.preparation.history(actors.teacher,job.id))[0].snapshot_json);assert.equal(snapshot.words.length,1);assert.equal(snapshot.words[0].cardId,1);
  }finally{f.close();}
});
test('changed meanings or source references stop retries before another model call and cannot publish saved candidates',async()=>{
  const f=await setup({generate:async()=>{throw new GenerationIssue('temporary_failure');}});try{
    await f.enqueue(['Gap']);await f.queue.runOne();const [job]=await f.queue.list(actors.teacher);assert.equal(job.state,'retry');
    assert.throws(()=>f.sql.prepare('UPDATE qr_senses SET definition=? WHERE id=?').run('A changed sense.',f.senseId),/new sense/);
    f.sql.exec('DELETE FROM qr_card_senses WHERE card_id=5');f.tick();await f.queue.runOne();const [current]=await f.queue.list(actors.teacher);assert.equal(current.issue,'access_changed');assert.equal(current.state,'review');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_versions').get().n,0);
  }finally{f.close();}
  const mismatch=await setup({dictionary:true});try{
    mismatch.preparation.resolveReference=async()=> 'drizzle%2:38:00::';await mismatch.enqueue(['Choice']);await mismatch.queue.runOne();assert.equal((await mismatch.queue.list(actors.teacher))[0].issue,'dictionary_mismatch');assert.equal(mismatch.calls(),0);
  }finally{mismatch.close();}
});
test('full preparation preserves human proposals and approved types; previous context-only jobs resume explicitly',async()=>{
  const f=await setup();try{
    const human=await f.draft(actors.student,{type:'Gap'});const legacy=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate:async()=>{throw Error('Unused');}});
    await legacy.enqueue(actors.teacher,body({...f.context,types:['Match']}));assert.equal((await legacy.list(actors.teacher))[0].state,'context');
    const choice=await f.draft(actors.student,{type:'Choice',content:{explanation:'Translation.',items:[{prompt:'drizzle',options:['изморось','snow'],answer:0}]}});await f.service.submit(actors.student,choice.id,body({expectedRevision:1}));await f.service.approve(actors.teacher,choice.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true}}));
    const queued=await f.queue.enqueuePackage(actors.teacher,body(f.context));assert.equal(queued.ids.length,15);assert.equal((await f.queue.list(actors.teacher)).find(job=>job.type==='Match').state,'queued');
    assert.equal((await f.service.get(actors.student,human.id)).revision,1);assert.equal((await f.service.get(actors.teacher,choice.id)).state,'approved');
    await assert.rejects(f.queue.enqueuePackage(actors.student,body(f.context)),error=>error.status===403);
  }finally{f.close();}
});
test('package quality rejects unrelated sentence targets and reuses the existing three-attempt review fallback',async()=>{
  const f=await setup({generate:createQuizPackageGenerator({generate:async()=>({explanation:'Wrong target.',items:[{parts:'snow falls',answer:'snow falls'}]})})});try{
    await f.enqueue(['Build']);for(let n=0;n<3;n++){await f.queue.runOne();f.tick();}const [job]=await f.queue.list(actors.teacher);assert.equal(job.attempts,3);assert.equal(job.state,'review');assert.equal(job.issue,'quality_check_failed');assert.equal(job.versionId,null);
  }finally{f.close();}
});
test('cached candidates recover with their original snapshot without a second inference',async()=>{
  const f=await setup({dictionary:true});try{
    const create=f.service.createGeneratedDraft.bind(f.service);let once=true;
    f.service.createGeneratedDraft=async(...args)=>{if(once){once=false;throw Error('Transient storage failure.');}return create(...args);};
    await f.enqueue(['Choice']);await f.queue.runOne();assert.equal((await f.queue.list(actors.teacher))[0].state,'retry');assert.equal(f.calls(),1);
    f.tick();await f.queue.runOne();assert.equal((await f.queue.list(actors.teacher))[0].state,'submitted');assert.equal(f.calls(),1);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_generation_contexts').get().n,1);
  }finally{f.close();}
});
test('word access changing during generation prevents publication, and deleted audio cannot become a Listen quiz',async()=>{
  const f=await setup();try{
    f.queue.generate=async()=>{f.sql.exec('DELETE FROM qr_card_senses WHERE card_id=5');return {explanation:'Original context.',items:[{left:'drizzle',right:f.target.translation},{left:'storm',right:'буря'}]};};
    await f.enqueue(['Match']);await f.queue.runOne();assert.equal((await f.queue.list(actors.teacher))[0].issue,'access_changed');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM qr_versions').get().n,0);
  }finally{f.close();}
  const audio=await setup();try{
    audio.sql.prepare('UPDATE qr_media SET deleted_at=1 WHERE id=?').run(audio.asset.id);await audio.enqueue(['Listen']);await audio.queue.runOne();assert.equal((await audio.queue.list(actors.teacher))[0].issue,'audio_unavailable');assert.equal(audio.calls(),0);
  }finally{audio.close();}
});
test('source mapping changes are not silently accepted when retrying a frozen dictionary context',async()=>{
  const f=await setup({dictionary:true,generate:async()=>{throw new GenerationIssue('temporary_failure');}});try{
    await f.enqueue(['Gap']);await f.queue.runOne();f.preparation.resolveReference=async()=> 'other%1:00:00::';f.tick();await f.queue.runOne();assert.equal((await f.queue.list(actors.teacher))[0].issue,'source_changed');
  }finally{f.close();}
});
