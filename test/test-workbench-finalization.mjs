import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
import {wav} from './quiz-media-fixture.mjs';
import {workbenchMigrationPlan,workbenchUpgradePlan} from '../ops/learning-workbench-migration-plan.mjs';
import {LearningKits} from '../src/learning-kits.mjs';
import {QuizMedia,memoryQuizMediaStore} from '../src/quiz-media.mjs';
import {KitSessions} from '../src/kit-sessions.mjs';
import {KitExams} from '../src/kit-exams.mjs';
import {KitLegacyMapping} from '../src/kit-legacy-mapping.mjs';
import {KitStatistics} from '../src/kit-statistics.mjs';
import {QuizFeedback} from '../src/quiz-feedback.mjs';
import {QuizFeedbackPrivacy} from '../src/quiz-feedback-privacy.mjs';
import {QuizFeedbackDelivery,createFeedbackEmailTransport} from '../src/quiz-feedback-delivery.mjs';
import {QuizAuthorVisibility} from '../src/quiz-author-visibility.mjs';
import {SpeechPractice} from '../src/speech-practice.mjs';
import {SpeechCoaching} from '../src/speech-coaching.mjs';
import {StoredLanguageProviders} from '../src/stored-language-providers.mjs';
import {localSpeechAdapter,LOCAL_SPEECH_RUBRIC} from '../ops/local-speech-provider.mjs';
import {ExamService} from '../src/learning-exams.mjs';
import {AssessmentService} from '../src/learning-assessment.mjs';
import {backupWorkbenchMedia,verifyWorkbenchMediaBackup,restoreWorkbenchMediaLocally} from '../ops/workbench-media-backup.mjs';
import {createWorkbenchRuntime} from '../src/learning-workbench-runtime.mjs';
import {rehearseWorkbench} from '../ops/rehearse-learning-workbench.mjs';
import {createLearningWorkbenchFactory} from '../src/learning-workbench-services.mjs';
import {learningWorkbenchAPI} from '../src/learning-workbench-api.mjs';
const denied=(value,status)=>assert.rejects(value,error=>error.status===status);
async function setup(){
  const f=await fixture({d1:true,extendedLifecycle:true});
  for(const step of workbenchMigrationPlan().steps.slice(1))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8'));
  const review=f.service,kits=new LearningKits(review),store=memoryQuizMediaStore(),media=new QuizMedia(kits,{store,inspect:async()=>({kind:'audio',duration:1,width:0,height:0})});
  review.mediaQuizzes=true;review.pronunciationQuizzes=true;review.contentPolicy=media;
  const adapter=localSpeechAdapter(),invoke=adapter.invoke;adapter.invoke=(input,options)=>input.kind==='speech-dialogue'?{reply:'Tell me more about the weather.',finished:false}:invoke(input,options);
  const providers=new StoredLanguageProviders(f.db,{adapters:[adapter],authorize:async()=>true});await providers.initialize(actors.dev);
  await providers.configure(actors.dev,body({expectedRevision:1,selections:{pronunciation:{adapterId:adapter.id,locale:'en-US',mode:'scripted'},stt:{adapterId:adapter.id,locale:'en-US',mode:'unscripted'},conversation:{adapterId:adapter.id,locale:'en-US',mode:'text'}},reason:'Local test only.'}));
  const resolveActor=async id=>Object.values(actors).find(row=>row.id===id),speech=new SpeechPractice(kits,media,{enabled:true,providers,worker:actors.dev,resolveActor,rubrics:[LOCAL_SPEECH_RUBRIC],budgets:{audio:{day:100,month:200},language:{day:50,month:100}}});
  const sessions=new KitSessions(kits,{speech}),context={groupId:1,lessonId:1,cardId:1,senseId:f.senseId};
  const upload=task=>speech.upload(actors.student,task,body({mime:'audio/wav',name:'sample.wav'}),wav());
  const analyze=async task=>speech.analyze(actors.student,task,body({mediaId:(await upload(task)).id,consent:true}));
  const approved=async(type='Gap',content)=>{const q=await f.draft(actors.student,{type,...(content?{content}:{})});await review.submit(actors.student,q.id,body({expectedRevision:1}));await review.approve(actors.teacher,q.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true,...(type==='Pronunciation'?{reference:true,rubric:true}:{})}}));return q.id;};
  return {...f,review,kits,media,store,providers,speech,sessions,context,analyze,approved,resolveActor};
}
test('lesson-wide retelling validates criteria and preserves private lesson access',async()=>{
  const f=await setup();try{
    const value=body({...f.context,cardId:null,senseId:null,mode:'retelling',locale:'en-US',prompt:'Retell the story.',reference:null,referenceMediaId:null,rubricId:LOCAL_SPEECH_RUBRIC.id,evaluation:'stt',languageReview:false,level:'A1',criteria:{sourceText:'Rain started. We went home.',keyIdeas:['It began raining.'],targetVocabulary:['rain']}});
    await denied(f.speech.createTask(actors.teacher,{...value,criteria:null}),400);
    const task=await f.speech.createTask(actors.teacher,value);assert.ok((await f.speech.lessonCatalog(actors.student,{groupId:1,lessonId:1})).tasks.some(row=>row.id===task.id));
    await denied(f.speech.task(actors.other,task.id),403);const attempt=await f.analyze(task.id);assert.equal((await f.speech.get(actors.student,attempt.id)).result.overall,null);
    assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.close();}
});
test('dialogues require exact consented revisions, isolate owners and erase their private text',async()=>{
  const f=await setup();try{
    const coaching=new SpeechCoaching(f.speech,{enabled:true,budgets:{day:5,month:10,sessionsPerDay:3}});
    const task=await f.speech.createTask(actors.teacher,body({...f.context,cardId:null,senseId:null,mode:'dialogue',locale:'en-US',prompt:'Talk about weather.',reference:null,referenceMediaId:null,rubricId:LOCAL_SPEECH_RUBRIC.id,evaluation:'stt',languageReview:false,level:'A1'}));
    const attempt=await f.analyze(task.id),session=await coaching.start(actors.student,task.id,body({}));
    await denied(coaching.get(actors.other,session.id),404);
    await denied(coaching.turn(actors.student,session.id,body({expectedRevision:1,attemptId:attempt.id,transcriptRevision:0,consent:false})),400);
    const operation=body({expectedRevision:1,attemptId:attempt.id,transcriptRevision:0,consent:true}),result=await coaching.turn(actors.student,session.id,operation);
    assert.equal(result.turns[0].state,'complete');assert.match(result.turns[0].reply,/weather/);
    await coaching.turn(actors.student,session.id,operation);assert.equal((await coaching.get(actors.student,session.id)).turns.length,1);
    const dispute=await coaching.dispute(actors.student,attempt.id,body({teacherId:actors.teacher.id,reason:'Please review.',consent:true}));
    await denied(coaching.decide(actors.outsider,dispute.id,body({expectedRevision:1,decision:'upheld',comment:'Reviewed.',teacherScore:80})),404);
    await coaching.decide(actors.teacher,dispute.id,body({expectedRevision:1,decision:'upheld',comment:'Reviewed.',teacherScore:80}));
    await f.speech.remove(actors.student,attempt.id,body({}));await denied(coaching.get(actors.student,session.id),404);
    assert.equal(f.sql.prepare('SELECT user_text FROM qr_speech_dialogue_turns').get().user_text,'');
  }finally{f.close();}
});
test('approved pronunciation supports personal linked cards, stable private tasks and cross-session progress',async()=>{
  const f=await setup();try{
    const content={explanation:'Read naturally.',items:[{prompt:'Read the word.',reference:'drizzle',locale:'en-US',rubric:LOCAL_SPEECH_RUBRIC}]},versionId=await f.approved('Pronunciation',content);
    await f.review.linkCard(actors.dev,body({cardId:3,senseId:f.senseId}));
    const first=await f.sessions.start(actors.student,body({cardId:3,senseId:f.senseId,versionId,mode:'practice'}));
    const task=await f.sessions.pronunciation(actors.student,first.id,body({itemIndex:0}));assert.equal((await f.sessions.pronunciation(actors.student,first.id,body({itemIndex:0}))).id,task.id);
    await denied(f.speech.task(actors.other,task.id),403);assert.deepEqual(await f.speech.recipients(actors.student,task.id),[]);
    await f.analyze(task.id);const second=await f.sessions.start(actors.student,body({cardId:3,senseId:f.senseId,versionId,mode:'practice'}));
    const secondTask=await f.sessions.pronunciation(actors.student,second.id,body({itemIndex:0}));await f.analyze(secondTask.id);
    const progress=await new KitStatistics(f.sessions).pronunciation(actors.student,{cardId:3,versionId});assert.equal(progress.series.length,1);assert.equal(progress.series[0].points.length,2);
    assert.ok(!(await f.speech.lessonCatalog(actors.teacher,{groupId:1,lessonId:1})).tasks.some(row=>row.id===task.id));
    await denied(f.sessions.submit(actors.student,first.id,body({expectedRevision:1,responses:['drizzle']})),400);
  }finally{f.close();}
});
test('feedback deletion scrubs content, retries object deletion and preserves fixed-recipient consent',async()=>{
  const f=await setup();try{
    const feedback=new QuizFeedback(f.kits,f.media,{privacyEnabled:true,retentionDays:7}),privacy=new QuizFeedbackPrivacy(feedback),messages=[];
    const delivery=new QuizFeedbackDelivery(feedback,{transport:createFeedbackEmailTransport({enabled:true,recipientVerified:true,policyRevision:'local-test',binding:{send:async message=>{messages.push(message);return {messageId:'test-id'};}}})});
    const report=attachments=>body({cardId:1,senseId:f.senseId,versionId:null,category:'bug',description:'A reproducible issue.',attachments,privacyConsent:true});
    await denied(feedback.create(actors.student,{...report([]),description:'api_key=secret-value'}),400);
    const asset=await f.media.upload(actors.student,body({...f.context,purpose:'feedback',mime:'audio/wav',name:'sample.wav'}),wav());
    const saved=await feedback.create(actors.student,report([asset.id]));assert.equal(messages.length,0);
    assert.equal((await delivery.send(actors.student,saved.id,body({consent:true}))).state,'accepted');assert.equal(messages[0].to,'info@lumiscia.org');
    await denied(privacy.erase(actors.other,saved.id,body({})),404);await privacy.erase(actors.student,saved.id,body({}));await denied(f.media.row(asset.id),404);
    const remove=f.store.delete;let fail=true;f.store.delete=async key=>{if(fail)throw Error('Synthetic storage outage.');return remove(key);};
    assert.equal((await privacy.sweep(actors.dev)).pending,1);fail=false;assert.equal((await privacy.sweep(actors.dev)).objectsRemoved,1);
    assert.equal(f.sql.prepare('SELECT description FROM qr_feedback WHERE id=?').get(saved.id).description,'');assert.equal(f.sql.prepare('SELECT name FROM qr_media WHERE id=?').get(asset.id).name,'Deleted attachment');
    assert.equal((await feedback.mine(actors.student)).length,0);
  }finally{f.close();}
});
test('public attribution is separately consented, revocable and cannot be changed by reviewers',async()=>{
  const f=await setup();try{
    f.review.safePublicAttribution=true;const id=await f.approved(),visibility=new QuizAuthorVisibility(f.review);
    assert.equal((await f.review.sharedForCard(actors.student,1))[0].author.name,'Quiz author');
    await denied(visibility.set(actors.teacher,id,body({expectedRevision:0,publicName:true,publicGroup:true})),403);
    await visibility.set(actors.student,id,body({expectedRevision:0,publicName:true,publicGroup:true}));assert.equal((await f.review.sharedForCard(actors.student,1))[0].author.name,'Anna');
    await visibility.set(actors.student,id,body({expectedRevision:1,publicName:false,publicGroup:false}));assert.equal((await f.review.sharedForCard(actors.student,1))[0].author.group,null);
  }finally{f.close();}
});
test('explicit mapping has CAS and never rewrites legacy quizzes',async()=>{
  const f=await setup();try{
    const mapping=new KitLegacyMapping(f.kits),before=f.sql.prepare('SELECT * FROM quizzes').all();
    await denied(mapping.link(actors.student,body({cardId:1,senseId:f.senseId,expectedSenseIds:[],reason:'Explicit choice.'})),403);
    const meaning=await f.review.createSense(actors.dev,body({cardId:1,meaning:{partOfSpeech:'verb',translation:'pour lightly',definition:'To pour a small amount of liquid.'}}));
    await f.db.atomic([{sql:'DELETE FROM qr_card_senses WHERE card_id=1 AND sense_id=?',args:[{type:'text',value:meaning.senseId}]}]);
    await denied(mapping.link(actors.teacher,body({cardId:1,senseId:meaning.senseId,expectedSenseIds:[],reason:'Verified culinary sense.'})),409);
    await mapping.link(actors.teacher,body({cardId:1,senseId:meaning.senseId,expectedSenseIds:[f.senseId],reason:'Verified culinary sense.'}));
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_card_sense_events').get().n,1);assert.deepEqual(f.sql.prepare('SELECT * FROM quizzes').all(),before);
  }finally{f.close();}
});
test('real exam instance gates supplementary submissions, publication and separate statistics',async()=>{
  const f=await setup();try{
    await new ExamService(f.db).ensure();await new AssessmentService(f.db).ensure();
    const columns=f.sql.prepare('PRAGMA table_info(exam_instances)').all().map(row=>row.name);
    for(const [name,type] of [['reviewer_id','TEXT'],['status',"TEXT DEFAULT 'assigned'"]])if(!columns.includes(name))f.sql.exec('ALTER TABLE exam_instances ADD COLUMN '+name+' '+type);
    f.sql.exec("INSERT INTO exams(id,title,published) VALUES(1,'Fixture exam',1); INSERT INTO exam_blocks(id,exam_id,position,title,published) VALUES(1,1,0,'Vocabulary',1); INSERT INTO exam_instances(exam_id,source_exam_id,account_id,assignment_id,reviewer_id,status) VALUES(1,1,'u1','test-assignment','teacher','assigned')");
    const exams=new KitExams(f.sessions,{resolveActor:f.resolveActor});f.sessions.examPolicy=exams;f.sessions.authorizeExamRelease=(actor,row)=>exams.canRelease(actor,row);
    const versionId=await f.approved(),input=body({examId:1,blockId:1,cardId:1,senseId:f.senseId,versionId});
    await denied(exams.assign(actors.outsider,input),403);const assigned=await exams.assign(actors.teacher,input);
    await denied(f.sessions.start(actors.student,body({cardId:1,senseId:f.senseId,versionId,mode:'exam'})),403);
    await denied(f.sessions.submit(actors.student,assigned.id,body({expectedRevision:1,responses:['drizzle']})),409);
    f.sql.exec("INSERT INTO assessment_history(account_id,kind,material_id,actor_id,action,reason,snapshot_json) VALUES('u1','exam-workflow',1,'u1','started','','{}')");
    await f.sessions.submit(actors.student,assigned.id,body({expectedRevision:1,responses:['drizzle']}));assert.equal((await f.sessions.get(actors.student,assigned.id)).content,undefined);
    await denied(f.sessions.release(actors.teacher,assigned.id,body({expectedRevision:2})),403);
    f.sql.exec("INSERT INTO assessment_work(account_id,kind,material_id,exam_id,revision,state,answers_json,grading_json,snapshot_json) VALUES('u1','exam-block',1,1,1,'published','{}','{}','[]')");
    await f.sessions.release(actors.teacher,assigned.id,body({expectedRevision:2}));assert.equal((await f.sessions.get(actors.student,assigned.id)).correctCount,1);
    const stats=await new KitStatistics(f.sessions).sessionsFor(actors.student,{cardId:1});assert.equal(stats.sessions[0].percent,100);assert.equal(stats.affectsLegacyStatistics,false);
    f.sql.exec("UPDATE assessment_work SET state='reviewing'");assert.equal((await f.sessions.get(actors.student,assigned.id)).content,undefined);
  }finally{f.close();}
});
test('private media archive requires trusted bounds and restores only into a new local directory',async()=>{
  const f=await setup(),directory=mkdtempSync(join(tmpdir(),'workbench-private-test-'));try{
    await f.media.upload(actors.teacher,body({...f.context,purpose:'quiz',mime:'audio/wav',name:'reference.wav',rights:'Synthetic.'}),wav());
    const store={...f.store,kind:'dedicated-workbench-r2-test'},source=join(directory,'archive'),target=join(directory,'restore');
    await assert.rejects(backupWorkbenchMedia({db:f.db,store,directory:source}));
    const archive=await backupWorkbenchMedia({db:f.db,store,directory:source,freezeConfirmed:true});assert.equal(archive.objects,1);
    assert.equal(verifyWorkbenchMediaBackup(source,{expectedManifestSha256:archive.manifestSha256}).verified,true);
    assert.equal(restoreWorkbenchMediaLocally(source,target,{expectedManifestSha256:archive.manifestSha256}).cloudModified,false);
    assert.equal(verifyWorkbenchMediaBackup(target,{expectedManifestSha256:archive.manifestSha256}).verified,true);
  }finally{f.close();rmSync(directory,{recursive:true,force:true});}
});
test('runtime defaults off and upgrade baselines reject missing or changed checksums',async()=>{
  const runtime=createWorkbenchRuntime();assert.equal((await runtime.scheduled(null,{},null)).reason,'off');
  const steps=workbenchMigrationPlan().steps;assert.equal(workbenchUpgradePlan(steps.slice(0,16)).steps.length,4);
  assert.throws(()=>workbenchUpgradePlan([{...steps[0],sha256:'0'.repeat(64)}]),/checksum/);
  await denied(runtime.open({db:{},actor:actors.student,env:{}}),503);
});
test('incremental rehearsal retains populated speech foreign keys and never writes its source',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'workbench-upgrade-test-')),path=join(directory,'source.sqlite'),f=await fixture({filename:path,d1:true});let rehearsal;
  try{
    const steps=workbenchMigrationPlan().steps;
    for(const step of steps.slice(1,16))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8'));
    const task=crypto.randomUUID(),media=crypto.randomUUID(),attempt=crypto.randomUUID();
    f.sql.prepare('INSERT INTO qr_speech_tasks VALUES(?,?,?,?,?,?,?,?)').run(task,1,1,1,f.senseId,'teacher',Date.now(),'{}');
    f.sql.prepare("INSERT INTO qr_media(id,owner_id,purpose,digest,mime,bytes,name,descriptor_json,source_json,created_at) VALUES(?,'u1','speech',?,'audio/wav',44,'fixture','{}','{}',?)").run(media,'0'.repeat(64),Date.now());
    f.sql.prepare("INSERT INTO qr_speech_attempts(id,task_id,owner_id,media_id,consent_at,created_at,deadline_at,snapshot_json,comparison_key,state) VALUES(?,?,'u1',?,?,?,?,?,'fixture','queued')").run(attempt,task,media,Date.now(),Date.now(),Date.now()+1000,'{}');
    rehearsal=await rehearseWorkbench(path,{applied:steps.slice(0,16)});assert.equal(rehearsal.backupRestoreVerified,true);assert.equal(rehearsal.migrations.length,4);
    assert.equal(f.sql.prepare('PRAGMA table_info(qr_speech_tasks)').all().find(row=>row.name==='card_id').notnull,1);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_speech_attempts').get().n,1);
  }finally{f.close();if(rehearsal)rmSync(rehearsal.directory,{recursive:true,force:true});rmSync(directory,{recursive:true,force:true});}
});
test('read-only feedback GET does not recover or write, even after access to the card is revoked',async()=>{
  const f=await setup();try{
    const feedback=new QuizFeedback(f.kits,f.media,{privacyEnabled:true,retentionDays:7}),saved=await feedback.create(actors.student,body({cardId:1,senseId:f.senseId,versionId:null,category:'remark',description:'Test.',attachments:[],privacyConsent:true}));
    f.sql.exec("DELETE FROM class_group_students WHERE account_id='u1'");
    let writes=0;const db={read:f.db.read.bind(f.db),atomic:async()=>{writes++;throw Error('Read-only.');}};
    const services=await createLearningWorkbenchFactory({inspect:async()=>{throw Error('No media inspection.');},feedback:{enabled:true,retentionDays:7}})({db,actor:actors.student});
    const response=await learningWorkbenchAPI(new Request('https://test.invalid/api/learning-workbench/feedback/'+saved.id),{actor:actors.student,services,writable:false});
    assert.equal((await response.json()).state,'saved_locally');assert.equal(writes,0);
  }finally{f.close();}
});
test('runtime composition uses explicit private bindings, approved policy and refreshed account roles',async()=>{
  const f=await setup();try{
    let role='USER';const runtime=createWorkbenchRuntime({resolveActor:async(_env,id)=>({...actors.student,id,role})}),bucket={get:async()=>null,head:async()=>null,put:async()=>null,delete:async()=>{}};
    const env={LEARNING_WORKBENCH_ENABLED:'true',LEARNING_WORKBENCH_WRITES:'false',STAGE_WRITES:'false',WORKBENCH_MEDIA:bucket,WORKBENCH_MEDIA_BUCKET:'learn-english-workbench-private-media',WORKBENCH_STORAGE_APPROVED:'true',LEARNING_FEEDBACK_ENABLED:'true',LEARNING_WORKBENCH_POLICY:JSON.stringify({version:1,revision:'fixture-only',approved:true,retentionDays:7})};
    const services=await runtime.open({db:f.db,actor:actors.student,env,writable:false});assert.equal(services.review.safePublicAttribution,true);assert.equal(services.feedbackPolicy.deliveryEnabled,false);assert.equal(services.speech,undefined);
    await denied(runtime.open({db:f.db,actor:actors.student,env:{...env,CONTENT_MEDIA:bucket}}),503);
    await denied(runtime.open({db:f.db,actor:actors.student,env:{...env,WORKBENCH_STORAGE_APPROVED:'false'}}),503);
    role='ADMIN';await denied(runtime.open({db:f.db,actor:actors.student,env}),503);
    assert.equal((await runtime.scheduled(null,{...env,ACCOUNT_TRANSFER_FROZEN:'true'},null)).reason,'off');
  }finally{f.close();}
});
