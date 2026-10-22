import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaFixture,wav} from './quiz-media-fixture.mjs';
import {actors,body} from './quiz-review-fixture.mjs';
import {SpeechPractice} from '../src/speech-practice.mjs';
import {scoreSpeech,validateSpeechOutput,validateSpeechRubric} from '../src/speech-assessment.mjs';
import {StoredLanguageProviders} from '../src/stored-language-providers.mjs';
import {LOCAL_SPEECH_RUBRIC} from '../ops/local-speech-provider.mjs';
import {LOCAL_LANGUAGE_RUBRIC} from '../ops/local-speech-provider.mjs';
import {SpeechTranscriptReview} from '../src/speech-transcript-review.mjs';
const denied=(promise,status)=>assert.rejects(promise,error=>error.status===status);
const output=(metrics={accuracy:65,fluency:80,prosody:null},quality='ok')=>({quality,transcript:quality==='ok'?'A fine drizzle started.':null,metrics,findings:[]});
async function setup({invoke=null,seconds=2,audioDay=30,audioMonth=60,timeoutMs=1000,provider='local-fixture'}={}){
  const f=await mediaFixture({inspect:async()=>({kind:'audio',duration:seconds,width:0,height:0})});f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/012_speech_practice.sql',import.meta.url),'utf8'));
  let now=Date.now();const calls=[];
  const adapters=['speech-a','speech-b'].map(id=>({id,provider,model:id,version:'v1',billing:'self-hosted',capabilities:[{task:'pronunciation',locales:['en-US','en-GB'],modes:['scripted','unscripted']},{task:'stt',locales:['en-US','en-GB'],modes:['scripted','unscripted']},{task:'conversation',locales:['en-US','en-GB'],modes:['text']}],invoke:async(input,options)=>{calls.push(options.source);if(invoke)return invoke(input,options);return options.source.task==='conversation'?output({grammar:75,vocabulary:80,task:90}):output(options.source.task==='stt'?{}:undefined);},validate:value=>value}));
  const providers=new StoredLanguageProviders(f.db,{adapters,authorize:async()=>true});await providers.initialize(actors.dev);
  const speech=new SpeechPractice(f.kits,f.media,{enabled:true,providers,worker:actors.dev,rubrics:[LOCAL_SPEECH_RUBRIC],budgets:{audio:{day:audioDay,month:audioMonth},language:{day:3,month:6}},resolveActor:async id=>Object.values(actors).find(actor=>actor.id===id),now:()=>now,timeoutMs});
  const configure=async(mode='scripted',adapterId='speech-a')=>providers.configure(actors.dev,body({expectedRevision:(await providers.inspect(actors.dev)).revision,selections:{pronunciation:{adapterId,locale:'en-US',mode},stt:{adapterId,locale:'en-US',mode},conversation:{adapterId,locale:'en-US',mode:'text'}},reason:'Synthetic speech test.'}));
  const create=async(extra={})=>(await speech.createTask(actors.teacher,body({...f.context,mode:'pronunciation',locale:'en-US',prompt:'Read the word.',reference:'drizzle',referenceMediaId:null,rubricId:'local-practice',evaluation:'pronunciation',languageReview:false,level:'A1',...extra}))).id;
  const upload=async taskId=>speech.upload(actors.student,taskId,body({mime:'audio/wav',name:'test.wav'}),wav());
  const analyze=async(taskId,extra={})=>{const asset=await upload(taskId);return speech.analyze(actors.student,taskId,body({mediaId:asset.id,consent:true,...extra}));};
  return {...f,uploadReference:f.upload,speech,providers,calls,configure,create,upload,analyze,advance:ms=>now+=ms};
}
async function textSetup(options){
  const f=await setup(options);
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/013_confirmed_transcript_reviews.sql',import.meta.url),'utf8'));
  f.text=new SpeechTranscriptReview(f.speech,{enabled:true,rubric:LOCAL_LANGUAGE_RUBRIC});
  await f.configure();f.task=await f.create({languageReview:true});f.attempt=await f.analyze(f.task);
  return f;
}
test('lesson speech catalog enforces group, lesson and per-word visibility without exposing private attempts',async()=>{
  const f=await setup();try{
    f.sql.exec("DELETE FROM class_group_students WHERE account_id='u2'; INSERT INTO cards(id,scope,en,word_key,ru) VALUES(5,'shared','bank','bank','банк')");
    const one=await f.create();
    f.sql.exec("INSERT INTO lesson_blocks(id,lesson_id,position,type,card_id) VALUES(4,1,1,'word',5)");
    const {senseId}=await f.service.createSense(actors.dev,body({cardId:5,meaning:{partOfSpeech:'noun',translation:'банк',definition:'A financial institution.'}}));
    const two=await f.create({cardId:5,senseId,prompt:'Read bank.',reference:'bank'}),ctx={groupId:1,lessonId:1};
    const catalog=await f.speech.lessonCatalog(actors.student,ctx);assert.deepEqual(new Set(catalog.tasks.map(row=>row.id)),new Set([one,two]));assert.deepEqual(catalog.contexts,[]);assert.ok(!JSON.stringify(catalog).includes('owner_id'));
    assert.equal((await f.speech.lessonCatalog(actors.teacher,ctx)).contexts.length,2);
    await denied(f.speech.lessonCatalog(actors.other,ctx),403);await denied(f.speech.lessonCatalog(actors.student,{groupId:2,lessonId:1}),403);
    await denied(f.speech.lessonCatalog(actors.student,{groupId:1,lessonId:3}),403);
    f.sql.exec("INSERT INTO account_settings(account_id,key,value_json) VALUES('u1','visibility:card:5','true')");
    assert.deepEqual((await f.speech.lessonCatalog(actors.student,ctx)).tasks.map(row=>row.id),[one]);
    assert.equal((await f.speech.lessonCatalog(actors.dev,ctx)).tasks.length,2);
    f.sql.exec('UPDATE class_groups SET hidden_from_students=1 WHERE id=1');await denied(f.speech.lessonCatalog(actors.student,ctx),403);
    f.sql.exec('UPDATE class_groups SET hidden_from_students=0 WHERE id=1; UPDATE lessons SET hidden_from_students=1 WHERE id=1');await denied(f.speech.lessonCatalog(actors.student,ctx),403);
  }finally{await f.speech.close();f.close();}
});
test('personal training and comparison use immutable own comparable results without invoking providers',async()=>{
  let accuracy=65;const f=await setup({invoke:async()=>({...output({accuracy,fluency:80,prosody:null}),findings:[{metric:'accuracy',wordIndex:0,phoneme:'ə',confidence:0.95,message:'Repeat the initial word in the full phrase.'}]})});
  try{
    await f.configure();const task=await f.create(),baseline=await f.analyze(task),original=structuredClone(baseline.result);
    const plan=await f.speech.training(actors.student,baseline.id);assert.equal(plan.reference,'drizzle');assert.equal(plan.focus.length,1);
    accuracy=85;f.advance(1000);const repeat=await f.analyze(task),calls=f.calls.length,comparison=await f.speech.compare(actors.student,baseline.id,repeat.id);
    assert.deepEqual(comparison.metrics.overall,{before:71,after:83,change:12});assert.deepEqual(comparison.metrics.prosody,{before:null,after:null,change:null});
    assert.deepEqual((await f.speech.get(actors.student,baseline.id)).result,original);assert.equal(f.calls.length,calls);
    await denied(f.speech.compare(actors.student,baseline.id,baseline.id),400);
    await f.speech.share(actors.student,baseline.id,body({teacherId:actors.teacher.id,consent:true,includeAudio:false}));
    await denied(f.speech.training(actors.teacher,baseline.id),404);await denied(f.speech.compare(actors.teacher,baseline.id,repeat.id),404);
    await denied(f.speech.training(actors.other,baseline.id),404);
    const other=await f.create(),otherAttempt=await f.analyze(other);await denied(f.speech.compare(actors.student,baseline.id,otherAttempt.id),409);
    await f.configure('scripted','speech-b');const switched=await f.analyze(task);await denied(f.speech.compare(actors.student,baseline.id,switched.id),409);
    await f.speech.remove(actors.student,baseline.id,body());await denied(f.speech.training(actors.student,baseline.id),404);
  }finally{await f.speech.close();f.close();}
});
test('unusable results and absent reliable findings cannot become a training plan or a comparable zero',async()=>{
  let noisy=false;const f=await setup({invoke:async()=>output(undefined,noisy?'noise':'ok')});try{
    await f.configure();const task=await f.create(),good=await f.analyze(task);await denied(f.speech.training(actors.student,good.id),409);
    noisy=true;const bad=await f.analyze(task);assert.equal(bad.state,'unusable');await denied(f.speech.training(actors.student,bad.id),409);await denied(f.speech.compare(actors.student,good.id,bad.id),409);
  }finally{await f.speech.close();f.close();}
});
test('confirmed text uses exact consented revision, separate quota and immutable acoustic progress',async()=>{
  const f=await textSetup({invoke:async(input,{source})=>source.task==='conversation'?{...output({grammar:75,vocabulary:80,task:90}),transcript:input.transcript}:output()});try{
    const id=f.attempt.id,before=await f.speech.progress(actors.student,f.task);
    await denied(f.text.confirm(actors.student,id,body({transcriptRevision:0,consent:false})),400);
    await denied(f.text.confirm(actors.teacher,id,body({transcriptRevision:0,consent:true})),404);
    assert.equal(f.calls.length,1);
    await f.speech.correct(actors.student,id,body({text:'A corrected drizzle.'}));
    await denied(f.text.confirm(actors.student,id,body({transcriptRevision:0,consent:true})),409);
    const operation=body({transcriptRevision:1,consent:true}),review=await f.text.confirm(actors.student,id,operation);
    assert.equal(review.state,'complete');assert.equal(review.transcript,'A corrected drizzle.');assert.equal(review.basedOnEditedTranscript,true);
    assert.equal(review.result.scores.grammar,75);assert.equal(review.result.scores.accuracy,null);
    assert.equal(review.result.basis,'confirmed_transcript_not_acoustic_speech');
    assert.equal((await f.text.confirm(actors.student,id,operation)).id,review.id);
    assert.equal((await f.text.confirm(actors.student,id,body({transcriptRevision:1,consent:true}))).id,review.id);
    assert.equal(f.calls.length,2);assert.deepEqual(await f.speech.progress(actors.student,f.task),before);
    assert.equal((await f.speech.get(actors.student,id)).result.overall,71);
    await denied(f.text.get(actors.teacher,review.id),404);
    await f.speech.share(actors.student,id,body({teacherId:actors.teacher.id,consent:true,includeAudio:false}));
    assert.equal((await f.text.get(actors.teacher,review.id)).id,review.id);
    await f.speech.revoke(actors.student,id,body({teacherId:actors.teacher.id}));await denied(f.text.get(actors.teacher,review.id),404);
    await f.speech.correct(actors.student,id,body({text:'A newer revision.'}));
    assert.equal((await f.text.get(actors.student,review.id)).transcript,'A corrected drizzle.');
    await f.speech.remove(actors.student,id,body());await denied(f.text.get(actors.student,review.id),404);
    const row=f.sql.prepare('SELECT transcript,result_json,deleted_at FROM qr_speech_text_reviews').get();
    assert.equal(row.transcript,'');assert.equal(row.result_json,null);assert.ok(row.deleted_at);
  }finally{await f.text.close();f.close();}
});
test('failed confirmed text needs explicit retry, caps attempts and hides provider failures',async()=>{
  const f=await textSetup({invoke:async(input,{source})=>{if(source.task==='conversation')throw Error('SECRET PROVIDER DETAILS');return output();}});try{
    const confirm=extra=>f.text.confirm(actors.student,f.attempt.id,body({transcriptRevision:0,consent:true,...extra}));
    let row=await confirm();assert.equal(row.state,'failed');assert.doesNotMatch(JSON.stringify(row),/SECRET/);
    await denied(confirm(),409);
    for(let n=0;n<2;n++)row=await confirm({retryOf:row.id});
    await denied(confirm({retryOf:row.id}),409);
    assert.equal((await f.text.history(actors.student,f.attempt.id)).reviews.length,3);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM qr_speech_usage WHERE kind='language' AND state='started'").get().n,3);
    assert.equal((await f.speech.get(actors.student,f.attempt.id)).result.overall,71);
  }finally{await f.text.close();f.close();}
});
test('pending confirmed text deduplicates and cancellation rejects late output',async()=>{
  let finish;const f=await textSetup({invoke:async(input,{source})=>source.task==='conversation'?new Promise(resolve=>finish=resolve):output()});try{
    const operation=body({transcriptRevision:0,consent:true}),pending=f.text.confirm(actors.student,f.attempt.id,operation);
    for(let n=0;n<100&&!finish;n++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(finish);
    const duplicate=await f.text.confirm(actors.student,f.attempt.id,operation);assert.equal(duplicate.state,'started');assert.equal(f.calls.length,2);
    await denied(f.text.cancel(actors.teacher,duplicate.id,body()),404);
    await f.text.cancel(actors.student,duplicate.id,body());finish(output({grammar:75,vocabulary:80,task:90}));
    assert.equal((await pending).state,'cancelled');assert.equal((await f.text.get(actors.student,duplicate.id)).result,null);
  }finally{await f.text.close();f.close();}
});
test('confirmed text rejects a substituted transcript and recovery prevents late completion',async()=>{
  const mismatch=await textSetup();try{
    await mismatch.speech.correct(actors.student,mismatch.attempt.id,body({text:'Confirmed words, not provider words.'}));
    const row=await mismatch.text.confirm(actors.student,mismatch.attempt.id,body({transcriptRevision:1,consent:true}));
    assert.equal(row.state,'failed');assert.equal(row.result,null);
  }finally{await mismatch.text.close();mismatch.close();}
  let finish;const f=await textSetup({invoke:async(input,{source})=>source.task==='conversation'?new Promise(resolve=>finish=resolve):output()});try{
    const pending=f.text.confirm(actors.student,f.attempt.id,body({transcriptRevision:0,consent:true}));
    for(let n=0;n<100&&!finish;n++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(finish);
    const row=f.sql.prepare('SELECT deadline_at FROM qr_speech_text_reviews').get();f.text.now=()=>row.deadline_at+1;
    await f.text.recover();finish(output({grammar:75,vocabulary:80,task:90}));
    const result=await pending;assert.equal(result.state,'failed');assert.equal(result.error,'interrupted');assert.equal(result.result,null);
    assert.throws(()=>f.sql.exec("UPDATE qr_speech_text_reviews SET transcript='Replaced'"),/immutable/);
    assert.throws(()=>f.sql.exec('DELETE FROM qr_speech_text_reviews'),/deletion/);
    assert.equal(f.sql.prepare("SELECT state FROM qr_speech_usage WHERE kind='language'").get().state,'started');
  }finally{await f.text.close();f.close();}
});
test('normalization preserves raw scales, missing metrics, endpoints and provisional status',()=>{
  const rubric={...LOCAL_SPEECH_RUBRIC,weights:{accuracy:0.5,fluency:0.5},scales:{accuracy:{min:0,max:5,direction:'higher'},fluency:{min:0,max:10,direction:'lower'}}};
  const score=scoreSpeech([{task:'pronunciation',source:{model:'fixture'},data:output({accuracy:5,fluency:10})}],rubric,{duration:2});
  assert.equal(score.overall,50);assert.equal(score.scores.accuracy,100);assert.equal(score.scores.fluency,0);assert.equal(score.scores.prosody,null);assert.equal(score.raw.accuracy.value,5);assert.equal(score.provisional,true);
  assert.equal(scoreSpeech([{task:'pronunciation',source:{},data:output({accuracy:5})}],rubric,{duration:2}).overall,null);
  assert.equal(scoreSpeech([{task:'pronunciation',source:{},data:output({accuracy:5,fluency:0},'noise')}],rubric,{duration:2}).overall,null);
  assert.throws(()=>scoreSpeech([{task:'pronunciation',source:{},data:output({accuracy:6})}],rubric,{duration:2}),/scale/);
  assert.throws(()=>validateSpeechRubric({...rubric,weights:{accuracy:1.2}}),/one/);
  assert.throws(()=>validateSpeechOutput({...output({}),findings:[{metric:'accuracy',wordIndex:0,phoneme:'t',message:'test',confidence:1}]},'stt'));
});
test('feature flag, roles, lesson access and immutable tasks protect the old quiz types',async()=>{
  const f=await setup();try{
    const disabled=new SpeechPractice(f.kits,f.media,{providers:f.providers,worker:actors.dev,budgets:{audio:{day:1,month:1},language:{day:1,month:1}}});
    await denied(disabled.listTasks(actors.student,f.context),503);
    await denied(f.speech.createTask(actors.student,body({...f.context})),403);
    const id=await f.create();assert.equal((await f.speech.listTasks(actors.student,f.context)).length,1);
    await denied(f.speech.listTasks(actors.student,{...f.context,cardId:3}),403);
    await denied(f.speech.upload(actors.student,id,body({mime:'image/png',name:'bad.png'}),wav()),400);
    assert.throws(()=>f.sql.exec("UPDATE qr_speech_tasks SET value_json='{}'"),/immutable/);
    const q=await f.draft();assert.equal((await f.service.get(actors.student,q.id)).type,'Gap');
  }finally{f.close();}
});
test('explicit analysis is off until configured, runs once, freezes provenance and never counts STT as pronunciation',async()=>{
  const f=await setup();try{
    const task=await f.create(),asset=await f.upload(task);await denied(f.speech.analyze(actors.student,task,body({mediaId:asset.id,consent:false})),400);
    await denied(f.speech.analyze(actors.student,task,body({mediaId:asset.id,consent:true})),409);assert.equal(f.calls.length,0);
    await f.configure();const operation=body({mediaId:asset.id,consent:true}),first=await f.speech.analyze(actors.student,task,operation);
    assert.equal(first.state,'complete');assert.equal(first.result.overall,71);assert.equal(first.result.synthetic,true);assert.equal(first.result.scores.prosody,null);
    assert.equal((await f.speech.analyze(actors.student,task,operation)).id,first.id);assert.equal(f.calls.length,1);
    await denied(f.speech.analyze(actors.student,task,body({mediaId:asset.id,consent:true})),409);
    const sttTask=await f.create({evaluation:'stt'}),stt=await f.analyze(sttTask);assert.equal(stt.result.overall,null);assert.equal(stt.result.scores.accuracy,null);assert.equal(stt.result.transcript,'A fine drizzle started.');
    assert.throws(()=>f.sql.exec("UPDATE qr_speech_attempts SET result_json='{}' WHERE state='complete'"),/immutable/);
  }finally{f.close();}
});
test('free speech requires unscripted capability and never implicitly dispatches transcript review',async()=>{
  const f=await setup();try{
    const task=await f.create({mode:'free',reference:null,languageReview:true});await f.configure();await denied(f.analyze(task),409);assert.equal(f.calls.length,0);
    await f.configure('unscripted');const result=await f.analyze(task);assert.equal(result.state,'complete');assert.equal(result.result.scores.grammar,null);assert.equal(result.result.sources.length,1);
    assert.deepEqual(f.calls.map(call=>call.task),['pronunciation']);assert.equal(f.sql.prepare("SELECT count(*) AS n FROM qr_speech_usage WHERE kind='language'").get().n,0);
  }finally{f.close();}
});
test('unconfirmed transcripts cannot reach a non-fixture language reviewer',async()=>{
  const f=await setup({provider:'test-external'});try{
    await f.configure();const task=await f.create({languageReview:true}),result=await f.analyze(task);
    assert.deepEqual(f.calls.map(source=>source.task),['pronunciation']);assert.equal(result.result.languageReviewUnavailable,true);assert.equal(result.result.scores.grammar,null);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM qr_speech_usage WHERE task='conversation'").get().n,0);
  }finally{f.close();}
});
test('private attempts share only with assigned teachers, audio requires separate permission, corrections do not regrade',async()=>{
  const f=await setup();try{
    await f.configure();const task=await f.create(),result=await f.analyze(task);await denied(f.speech.get(actors.teacher,result.id),404);await denied(f.speech.get(actors.other,result.id),404);
    await denied(f.speech.share(actors.student,result.id,body({teacherId:actors.outsider.id,consent:true,includeAudio:true})),403);
    await f.speech.share(actors.student,result.id,body({teacherId:actors.teacher.id,consent:true,includeAudio:false}));assert.equal((await f.speech.get(actors.teacher,result.id)).id,result.id);
    await denied(f.speech.recording(actors.teacher,result.id,new Request('https://local.invalid')),404);
    await f.speech.correct(actors.student,result.id,body({text:'My corrected words.'}));assert.equal((await f.speech.get(actors.student,result.id)).result.overall,71);assert.equal((await f.speech.get(actors.student,result.id)).correction.text,'My corrected words.');
    await f.speech.correct(actors.student,result.id,body({text:'Latest correction at the same timestamp.'}));assert.equal((await f.speech.get(actors.student,result.id)).correction.revision,2);assert.equal((await f.speech.get(actors.student,result.id)).correction.text,'Latest correction at the same timestamp.');
    await f.speech.share(actors.student,result.id,body({teacherId:actors.teacher.id,consent:true,includeAudio:true}));assert.equal((await f.speech.recording(actors.teacher,result.id,new Request('https://local.invalid'))).status,200);
    await f.speech.revoke(actors.student,result.id,body({teacherId:actors.teacher.id}));await denied(f.speech.get(actors.teacher,result.id),404);
    const operation=body();await f.speech.remove(actors.student,result.id,operation);await f.speech.remove(actors.student,result.id,operation);await denied(f.speech.get(actors.student,result.id),404);assert.equal(f.sql.prepare('SELECT result_json FROM qr_speech_attempts WHERE id=?').get(result.id).result_json,null);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_speech_corrections').get().n,0);
    assert.equal((await f.speech.progress(actors.student,task)).series.length,0);assert.equal((await f.media.list(actors.student,'speech')).length,0);
  }finally{f.close();}
});
test('shadowing pins reference audio; separate language failure retains acoustic metrics and short uploads stop before analysis',async()=>{
  const f=await setup({invoke:async(input,{source})=>{if(source.task==='conversation')throw new Error('Private provider error');return output();}});try{
    await f.configure();const reference=await f.uploadReference(actors.teacher,'quiz','audio/wav',wav());
    const task=await f.create({mode:'shadowing',referenceMediaId:reference.id,languageReview:true});
    assert.equal((await f.speech.reference(actors.student,task,new Request('https://local.invalid'))).status,200);
    await denied(f.media.remove(actors.teacher,reference.id,body()),409);
    const result=await f.analyze(task);assert.equal(result.state,'complete');assert.equal(result.result.scores.accuracy,65);assert.equal(result.result.scores.grammar,null);assert.equal(result.result.languageReviewUnavailable,true);
  }finally{f.close();}
  const short=await setup({seconds:0.1});try{await short.configure();const task=await short.create();await denied(short.analyze(task),400);assert.equal(short.calls.length,0);}finally{short.close();}
  const long=await setup({seconds:31});try{const task=await long.create();await denied(long.upload(task),415);assert.equal(long.sql.prepare('SELECT count(*) AS n FROM qr_media').get().n,0);}finally{long.close();}
});
test('provider changes split comparable progress and cannot reset shared daily or monthly speech usage',async()=>{
  const f=await setup({audioDay:4,audioMonth:4});try{
    await f.configure();const task=await f.create();await f.analyze(task);f.advance(1);await f.configure('scripted','speech-b');await f.analyze(task);
    const progress=await f.speech.progress(actors.student,task);assert.equal(progress.series.length,2);assert.ok(progress.series.every(series=>series.metrics.overall.count===1));
    await denied(f.analyze(task),409);f.advance(86400000);await denied(f.analyze(task),409);assert.equal(f.calls.length,2);
    assert.throws(()=>f.sql.exec('UPDATE qr_speech_usage SET quantity=0'),/immutable/);
  }finally{f.close();}
});
test('noise, missing metrics and low-confidence findings do not become zero grades or invented exercises',async()=>{
  for(const quality of ['noise','no_speech','too_short']){
    const f=await setup({invoke:async()=>output({accuracy:30,fluency:20},quality)});try{await f.configure();const task=await f.create(),result=await f.analyze(task);assert.equal(result.state,'unusable');assert.equal(result.result.overall,null);assert.deepEqual(result.result.training,[]);assert.equal((await f.speech.progress(actors.student,task)).series.length,0);}finally{f.close();}
  }
  const result=scoreSpeech([{task:'pronunciation',source:{},data:{...output({accuracy:30}),findings:[{metric:'accuracy',confidence:0.2,wordIndex:0,phoneme:'x',message:'Uncertain.'}]}}],LOCAL_SPEECH_RUBRIC,{duration:2});assert.deepEqual(result.training,[]);assert.deepEqual(result.findings,[]);
});
test('concurrent repeats, cancellation and restart deadlines cannot dispatch again or accept a late grade',async()=>{
  let finish;const f=await setup({invoke:async()=>new Promise(resolve=>finish=resolve)});try{
    await f.configure();const task=await f.create(),asset=await f.upload(task),operation=body({mediaId:asset.id,consent:true}),running=f.speech.analyze(actors.student,task,operation);
    for(let n=0;n<100&&!finish;n++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(finish);
    const [row]=await f.db.read('SELECT id FROM qr_speech_attempts');assert.equal((await f.speech.analyze(actors.student,task,operation)).state,'analyzing');assert.equal(f.calls.length,1);
    await f.speech.cancel(actors.student,row.id,body());finish(output());assert.equal((await running).state,'cancelled');assert.equal((await f.speech.get(actors.student,row.id)).result,null);assert.equal((await f.speech.progress(actors.student,task)).series.length,0);
  }finally{f.close();}
  let release;const g=await setup({invoke:async()=>new Promise(resolve=>release=resolve)});try{
    await g.configure();const task=await g.create(),running=g.analyze(task);for(let n=0;n<100&&!release;n++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(release);g.advance(1001);await g.speech.recover();release(output());assert.equal((await running).state,'failed');assert.equal(g.calls.length,1);
  }finally{g.close();}
});
