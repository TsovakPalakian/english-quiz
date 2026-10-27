import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaFixture,wav} from './quiz-media-fixture.mjs';
import {actors,body} from './quiz-review-fixture.mjs';
import {SpeechPractice} from '../src/speech-practice.mjs';
import {StoredLanguageProviders} from '../src/stored-language-providers.mjs';
import {buildLessonSpeechScenario,LearningSpeechScenariosService,DEFAULT_SHADOWING_RUBRIC} from '../src/learning-speech-scenarios.mjs';

const denied=(promise,status)=>assert.rejects(promise,error=>error.status===status);

test('buildLessonSpeechScenario correctly extracts scenarios from pronunciation, audio and phrase blocks', ()=>{
  // Pronunciation block with audio
  const pronWithAudio=buildLessonSpeechScenario({
    id:10,
    type:'pronunciation',
    word:'thorough',
    ipa:'/ˈθʌr.ə/',
    fileId:'sf_abc123'
  });
  assert.equal(pronWithAudio.blockId,10);
  assert.equal(pronWithAudio.reference,'thorough');
  assert.equal(pronWithAudio.ipa,'/ˈθʌr.ə/');
  assert.equal(pronWithAudio.hasAudio,true);
  assert.deepEqual(pronWithAudio.modes,['shadowing','pronunciation']);

  // Pronunciation block without audio
  const pronNoAudio=buildLessonSpeechScenario({
    id:11,
    type:'pronunciation',
    word:'think',
    ipa:'/θɪŋk/'
  });
  assert.equal(pronNoAudio.hasAudio,false);
  assert.deepEqual(pronNoAudio.modes,['pronunciation']);

  // Audio block with transcript and audio file
  const audioWithText=buildLessonSpeechScenario({
    id:12,
    type:'audio',
    title:'Interview excerpt',
    transcript:'We need to think outside the box to solve this challenge.',
    localMediaKey:'stage-local/lessons/1/12/audio.mp3',
    hasFile:true
  });
  assert.equal(audioWithText.reference,'We need to think outside the box to solve this challenge.');
  assert.equal(audioWithText.hasAudio,true);
  assert.deepEqual(audioWithText.modes,['shadowing','pronunciation']);

  // Phrase block
  const phrase=buildLessonSpeechScenario({
    id:13,
    type:'phrase',
    phrase:'Once in a blue moon'
  });
  assert.equal(phrase.reference,'Once in a blue moon');
  assert.equal(phrase.hasAudio,false);
  assert.deepEqual(phrase.modes,['pronunciation']);

  // Empty block or block without text returns null
  assert.equal(buildLessonSpeechScenario({id:14,type:'image'}),null);
  assert.equal(buildLessonSpeechScenario({id:15,type:'audio'}),null);
  assert.equal(buildLessonSpeechScenario(null),null);
});

test('speech UI bundles articulatory coaching for key SLA phonemes (/θ/, /ð/, /iː/, /uː/)', ()=>{
  const source=readFileSync(new URL('../client/demos/speech-practice-ui.js',import.meta.url),'utf8');
  assert.ok(source.includes("'θ':{name:'Voiceless dental fricative'"));
  assert.ok(source.includes("'ð':{name:'Voiced dental fricative'"));
  assert.ok(source.includes("'iː':{name:'Long front vowel'"));
  assert.ok(source.includes("'uː':{name:'Long back vowel'"));
  assert.ok(source.includes('speech-articulatory-panel'));
  assert.ok(source.includes('speech-phoneme-badge'));
  assert.ok(source.includes('speech-highlighted-word'));
  assert.ok(source.includes('speech-inline-phoneme'));

  // Verify preview.css contains the required responsive styling
  const css=readFileSync(new URL('../site/preview.css',import.meta.url),'utf8');
  assert.ok(css.includes('.speech-highlighted-word'));
  assert.ok(css.includes('.speech-inline-phoneme'));
  assert.ok(css.includes('.speech-articulatory-panel'));
  assert.ok(css.includes('.speech-phoneme-badge'));
});

test('LearningSpeechScenariosService enforces authorization and manages shadowing/pronunciation tasks', async ()=>{
  const f=await mediaFixture({inspect:async()=>({kind:'audio',duration:3,width:0,height:0})});
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/012_speech_practice.sql',import.meta.url),'utf8'));
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/017_lesson_speech.sql',import.meta.url),'utf8'));

  let now=Date.now();
  const adapters=['speech-a'].map(id=>({
    id,provider:'local-fixture',model:id,version:'v1',billing:'self-hosted',
    capabilities:[
      {task:'pronunciation',locales:['en-US','en-GB'],modes:['scripted','unscripted']},
      {task:'stt',locales:['en-US','en-GB'],modes:['scripted','unscripted']},
      {task:'conversation',locales:['en-US','en-GB'],modes:['text']}
    ],
    invoke:async(input,options)=>({
      quality:'ok',
      transcript:input.reference||'We need to think outside the box to solve this challenge.',
      metrics:{accuracy:88,fluency:85,prosody:78},
      findings:[
        {metric:'accuracy',wordIndex:3,phoneme:'θ',confidence:0.92,message:'Good dental placement on /θ/ in think.'}
      ]
    }),
    validate:value=>value
  }));

  const providers=new StoredLanguageProviders(f.db,{adapters,authorize:async()=>true});
  await providers.initialize(actors.dev);
  await providers.configure(actors.dev,body({
    expectedRevision:(await providers.inspect(actors.dev)).revision,
    selections:{
      pronunciation:{adapterId:'speech-a',locale:'en-US',mode:'scripted'},
      stt:{adapterId:'speech-a',locale:'en-US',mode:'scripted'},
      conversation:{adapterId:'speech-a',locale:'en-US',mode:'text'}
    },
    reason:'Shadowing test.'
  }));

  const speech=new SpeechPractice(f.kits,f.media,{
    enabled:true,
    providers,
    worker:actors.dev,
    rubrics:[DEFAULT_SHADOWING_RUBRIC],
    budgets:{audio:{day:100,month:200},language:{day:10,month:20}},
    resolveActor:async id=>Object.values(actors).find(actor=>actor.id===id),
    now:()=>now
  });

  const scenariosService=new LearningSpeechScenariosService(f.db,{
    rubrics:[DEFAULT_SHADOWING_RUBRIC],
    now:()=>now
  });

  try{
    f.sql.exec("DELETE FROM class_group_students WHERE account_id='u2'");
    // Insert lesson blocks into lesson 1 (assigned to group 1 in fixture)
    // Block 10: pronunciation with attached audio
    f.sql.exec(`INSERT INTO lesson_blocks(id,lesson_id,position,type,content_json)
      VALUES(10,1,1,'pronunciation','{"word":"thorough","ipa":"/ˈθʌr.ə/","fileId":"sf_audio_10"}')`);
    // Block 11: audio with transcript and fileId
    f.sql.exec(`INSERT INTO lesson_blocks(id,lesson_id,position,type,content_json)
      VALUES(11,1,2,'audio','{"title":"Model speech","transcript":"We need to think outside the box to solve this challenge.","fileId":"sf_audio_11"}')`);
    // Block 12: phrase without audio
    f.sql.exec(`INSERT INTO lesson_blocks(id,lesson_id,position,type,content_json)
      VALUES(12,1,3,'phrase','{"phrase":"Break a leg"}')`);

    // 1. List scenarios as enrolled student
    const result=await scenariosService.listLessonScenarios(actors.student,{groupId:1,lessonId:1});
    assert.equal(result.groupId,1);
    assert.equal(result.lessonId,1);
    assert.equal(result.scenarios.length,3);
    assert.equal(result.scenarios[0].modes.includes('shadowing'),true);
    assert.equal(result.scenarios[1].modes.includes('shadowing'),true);
    assert.equal(result.scenarios[2].modes.includes('shadowing'),false);
    assert.equal(result.scenarios[2].modes.includes('pronunciation'),true);

    // 2. Deny unauthorized actor from listing scenarios
    await denied(scenariosService.listLessonScenarios(actors.other,{groupId:1,lessonId:1}),403);
    await denied(scenariosService.listLessonScenarios(actors.student,{groupId:2,lessonId:1}),403);

    // 3. Start shadowing task for audio block 11
    const task=await scenariosService.startLessonSpeechTask(actors.student,{
      groupId:1,
      lessonId:1,
      blockId:11,
      mode:'shadowing',
      locale:'en-US'
    });
    assert.ok(task.taskId);
    assert.equal(task.mode,'shadowing');
    assert.equal(task.evaluation,'pronunciation');
    assert.equal(task.reference,'We need to think outside the box to solve this challenge.');
    assert.equal(task.referenceMediaId,'sf_audio_11');

    // 4. Starting again returns the same deterministic task ID
    const task2=await scenariosService.startLessonSpeechTask(actors.student,{
      groupId:1,
      lessonId:1,
      blockId:11,
      mode:'shadowing',
      locale:'en-US'
    });
    assert.equal(task2.taskId,task.taskId);

    // 5. Attempting shadowing on block 12 (no audio) fails with 400
    await denied(scenariosService.startLessonSpeechTask(actors.student,{
      groupId:1,
      lessonId:1,
      blockId:12,
      mode:'shadowing',
      locale:'en-US'
    }),400);

    // 6. Pronunciation mode on block 12 succeeds
    const taskPron=await scenariosService.startLessonSpeechTask(actors.student,{
      groupId:1,
      lessonId:1,
      blockId:12,
      mode:'pronunciation',
      locale:'en-US'
    });
    assert.equal(taskPron.mode,'pronunciation');
    assert.equal(taskPron.reference,'Break a leg');
    assert.equal(taskPron.referenceMediaId,null);

    // 7. Verify SpeechPractice execution for the shadowing task
    // The student can upload their recording to the created task
    const asset=await speech.upload(actors.student,task.taskId,body({mime:'audio/wav',name:'my-shadowing.wav'}),wav());
    assert.ok(asset.id);

    // Analyze the attempt
    const attempt=await speech.analyze(actors.student,task.taskId,body({mediaId:asset.id,consent:true}));
    assert.equal(attempt.state,'complete');
    assert.equal(attempt.result.sufficient,true);
    assert.equal(attempt.result.scores.accuracy,88);
    assert.equal(attempt.result.scores.fluency,85);
    assert.equal(attempt.result.scores.prosody,78);
    assert.equal(attempt.result.overall,84.8); // 88*0.4 + 85*0.4 + 78*0.2 = 35.2 + 34 + 15.6 = 84.8
    assert.equal(attempt.result.findings.length,1);
    assert.equal(attempt.result.findings[0].phoneme,'θ');

    // 8. Loaded via standard SpeechPractice catalog and task readers
    const loadedTask=await speech.task(actors.student,task.taskId);
    assert.equal(loadedTask.id,task.taskId);
    assert.equal(loadedTask.value.mode,'shadowing');
    assert.equal(loadedTask.value.reference,'We need to think outside the box to solve this challenge.');

    const catalog=await speech.lessonCatalog(actors.student,{groupId:1,lessonId:1});
    assert.ok(catalog.tasks.some(t=>t.id===task.taskId));

    // 9. Scenario audio attachment retrieval
    const audioInfo=await scenariosService.getLessonScenarioAudio(actors.student,{groupId:1,lessonId:1,blockId:11});
    assert.equal(audioInfo.fileId,'sf_audio_11');
    await denied(scenariosService.getLessonScenarioAudio(actors.student,{groupId:1,lessonId:1,blockId:12}),404);

    // 10. Invalid input checks
    await denied(scenariosService.startLessonSpeechTask(actors.student,{groupId:1,lessonId:1,blockId:999,mode:'pronunciation',locale:'en-US'}),404);
    await denied(scenariosService.startLessonSpeechTask(actors.student,{groupId:1,lessonId:1,blockId:11,mode:'invalid',locale:'en-US'}),400);
    await denied(scenariosService.startLessonSpeechTask(actors.student,{groupId:1,lessonId:1,blockId:11,mode:'shadowing',locale:'ru-RU'}),400);

  }finally{
    await speech.close();
    f.close();
  }
});
