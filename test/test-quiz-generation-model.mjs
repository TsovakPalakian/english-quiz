import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createModelQuizGenerator,checkGeneratedQuality} from '../src/quiz-generation-model.mjs';
import {QuizGenerationService} from '../src/quiz-generation.mjs';
import {fixture,actors,body} from './quiz-review-fixture.mjs';

const meaning={en:'drizzle',translation:'light rain',definition:'Very fine rain.',part_of_speech:'noun'};
const content={explanation:'Drizzle means light rain.',items:[{prompt:'drizzle',options:['light rain','heavy snow'],answer:0}]};
const input={type:'Choice',meaning};
const encode=(request,data=content)=>JSON.stringify({type:request.type,meaning:request.meaning,content:data});
test('model transport is off by default and unavailable configuration never spends a request',async()=>{
  let calls=0;
  for(const options of [{complete:()=>calls++},{enabled:true}]){
    await assert.rejects(createModelQuizGenerator(options)(input),error=>error.code==='provider_not_configured'&&!error.retryable);
  }
  assert.equal(calls,0);
});
test('enabled adapter passes only the word meaning and bounded contract to the injected model',async()=>{
  let seen;const controller=new AbortController();
  const generate=createModelQuizGenerator({enabled:true,complete:async(request,{signal})=>{seen=request;assert.equal(signal,controller.signal);return encode(request);}});
  assert.deepEqual(await generate({...input,signal:controller.signal,actor:{email:'private@example.com'}}),content);
  assert.deepEqual(seen.meaning,meaning);assert.equal(seen.maxItems,5);assert.equal(JSON.stringify(seen).includes('private@example.com'),false);
  assert.deepEqual(seen.itemFields,['prompt','options','answer']);
});
test('malformed, oversized, fenced or extra-field responses are rejected',async()=>{
  for(const raw of ['not JSON','```json\n{}\n```',JSON.stringify({...input,content,approved:true}),JSON.stringify({type:'Choice',meaning,content:{...content,items:[]}})]){
    await assert.rejects(createModelQuizGenerator({enabled:true,complete:async()=>raw})(input),error=>error.code==='invalid_model_response');
  }
  await assert.rejects(createModelQuizGenerator({enabled:true,maxOutputChars:10,complete:async()=>encode(input)})(input),error=>error.code==='invalid_model_response');
});
test('meaning substitution, wrong answers and disguised duplicate options fail quality checks',async()=>{
  const responses=[JSON.stringify({type:'Choice',meaning:{...meaning,definition:'Pour liquid over food.'},content}),
    encode(input,{...content,items:[{...content.items[0],answer:1}]}),
    encode(input,{...content,items:[{...content.items[0],options:['light rain','Light rain!']}]}),
    JSON.stringify({type:'Type',meaning,content})];
  for(const raw of responses)await assert.rejects(createModelQuizGenerator({enabled:true,complete:async()=>raw})(input),error=>error.code==='quality_check_failed');
});
test('word constraints support phrases, reject substring Tap matches and multiple Gap blanks',()=>{
  assert.throws(()=>checkGeneratedQuality('Tap',{explanation:'Target word',items:[{text:'It drizzles.',answer:'drizzle'}]},meaning),error=>error.code==='quality_check_failed');
  assert.throws(()=>checkGeneratedQuality('Gap',{explanation:'Target word',items:[{shown:'____ and ____',answer:'drizzle'}]},meaning),error=>error.code==='quality_check_failed');
  const phrase={...meaning,en:'look after'};
  const tap={explanation:'Care for someone.',items:[{text:'Please look after her.',answer:'look after'}]};
  assert.deepEqual(checkGeneratedQuality('Tap',tap,phrase),tap);
  assert.throws(()=>checkGeneratedQuality('Spell',{explanation:'Target',items:[{word:'rain',hint:'Weather'}]},meaning),error=>error.code==='quality_check_failed');
});
test('cancelled, contextual and audio tasks never invoke the model',async()=>{
  let calls=0;const generate=createModelQuizGenerator({enabled:true,complete:async()=>calls++});
  for(const type of ['Match','Memory','Select all','Odd one out','Listen'])await assert.rejects(generate({type,meaning}),error=>!error.retryable);
  const controller=new AbortController();controller.abort();await assert.rejects(generate({...input,signal:controller.signal}),error=>error.code==='timeout');
  assert.equal(calls,0);
});
test('too many items and late cancelled responses are discarded; transport failures hide details',async()=>{
  await assert.rejects(createModelQuizGenerator({enabled:true,complete:async request=>encode(request,{...content,items:Array(6).fill(content.items[0])})})(input),error=>error.code==='quality_check_failed');
  const controller=new AbortController();
  await assert.rejects(createModelQuizGenerator({enabled:true,complete:async request=>{controller.abort();return encode(request);}})({...input,signal:controller.signal}),error=>error.code==='timeout');
  await assert.rejects(createModelQuizGenerator({enabled:true,complete:async()=>{throw new Error('secret token');}})(input),error=>error.code==='temporary_failure'&&!error.message.includes('secret'));
});
test('permanent configuration errors stop immediately and invalid model output exhausts only three attempts',async()=>{
  for(const configured of [false,true]){
    const f=await fixture();try{
      f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/002_generation_jobs.sql',import.meta.url),'utf8'));
      let time=10000,calls=0;
      const generate=createModelQuizGenerator({enabled:configured,complete:async()=>{calls++;return '{}';}});
      const queue=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate,now:()=>time,timeoutMs:1000,leaseMs:5000,backoffMs:1});
      await queue.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Choice']}));
      for(let n=0;n<5;n++){await queue.runOne();time+=100;}
      const [job]=await queue.list(actors.teacher);assert.equal(job.state,'review');
      assert.equal(job.issue,configured?'invalid_model_response':'provider_not_configured');
      assert.equal(calls,configured?3:0);assert.equal(job.versionId,null);
      assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_versions').get().n,0);
    }finally{f.close();}
  }
});
test('queue bounds model quality retries and sends accepted candidates to teacher review only',async()=>{
  const f=await fixture();try{
    f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/002_generation_jobs.sql',import.meta.url),'utf8'));
    let time=10000,calls=0;
    const generate=createModelQuizGenerator({enabled:true,complete:async request=>{calls++;return encode(request,{explanation:'Target translation.',items:[{prompt:request.meaning.en,options:[request.meaning.translation,'unrelated'],answer:calls<3?1:0}]});}});
    const queue=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async()=>actors.teacher,generate,now:()=>time,timeoutMs:1000,leaseMs:5000,backoffMs:1});
    await queue.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Choice']}));
    await queue.runOne();assert.equal((await queue.list(actors.teacher))[0].issue,'quality_check_failed');
    for(let n=0;n<2;n++){time+=100;await queue.runOne();}
    const [job]=await queue.list(actors.teacher);assert.equal(calls,3);assert.equal(job.state,'submitted');
    assert.deepEqual(await f.service.sharedForCard(actors.teacher,1),[]);
    assert.equal((await f.service.get(actors.teacher,job.versionId)).author.kind,'automatic');
  }finally{f.close();}
});
