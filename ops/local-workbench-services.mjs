// Development-only composition: disposable SQLite and synthetic providers, never production bindings.
import {readFileSync} from 'node:fs';
import {fixture,actors,body} from '../test/quiz-review-fixture.mjs';
import {workbenchMigrationPlan} from './learning-workbench-migration-plan.mjs';
import {createLearningWorkbenchFactory} from '../src/learning-workbench-services.mjs';
import {WORKBENCH_TEST_BUCKET} from '../src/quiz-r2-media-store.mjs';
import {inspectQuizMedia} from './quiz-media-native.mjs';
import {localSpeechAdapter,LOCAL_SPEECH_RUBRIC,LOCAL_LANGUAGE_RUBRIC} from './local-speech-provider.mjs';
import {localQuizGenerator} from './quiz-generation-local-provider.mjs';
import {QuizGenerationService,GenerationIssue} from '../src/quiz-generation.mjs';
import {QuizGenerationContext} from '../src/quiz-generation-context.mjs';
import {QuizPreparationPipeline} from '../src/quiz-preparation-pipeline.mjs';
import {QuizPreparationRunner} from '../src/quiz-preparation-runner.mjs';
import {StoredQuizIndependentReview} from '../src/stored-quiz-independent-review.mjs';
import {StoredLanguageProviders} from '../src/stored-language-providers.mjs';
import {GenerationQuota} from '../src/generation-quota.mjs';
import {createRoutedQuizGenerator} from '../src/workers-ai-quiz-provider.mjs';

export {actors};
export async function createLocalWorkbench({inspect=inspectQuizMedia,gemini=null}={}){
  if(gemini!==null&&(gemini.adapter?.id!=='gemini-quiz'||typeof gemini.remaining!=='function'))throw Error('Invalid local Gemini provider.');
  const f=await fixture({d1:true,extendedLifecycle:true});
  try{
    for(const step of workbenchMigrationPlan().steps.slice(1))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8'));
    const resolveActor=async id=>Object.values(actors).find(row=>row.id===id)||null;
    const objects=new Map(),bucket={
      async put(key,bytes,options){if(objects.has(key))return null;const value={bytes:bytes.slice(),size:bytes.length,httpMetadata:options.httpMetadata,customMetadata:options.customMetadata};objects.set(key,value);return value;},
      async get(key){const value=objects.get(key);return value?{...value,body:new Blob([value.bytes]).stream()}:null;},
      async head(key){return objects.get(key)||null;},async delete(key){objects.delete(key);}
    };
    const quota=new GenerationQuota(f.db);await quota.initialize(actors.dev,{provider:'local-fixture',windowMs:86400000,requestLimit:200});
    if(gemini)await quota.initialize(actors.dev,{provider:'google',windowMs:86400000,requestLimit:5});
    const speechAdapter=localSpeechAdapter(),baseSpeech=speechAdapter.invoke;
    speechAdapter.invoke=(input,options)=>input.kind==='speech-dialogue'?{reply:'Synthetic partner: tell me one more detail about the weather.',finished:false}:baseSpeech(input,options);
    const providers=new StoredLanguageProviders(f.db,{quota,authorize:async source=>source.provider==='local-fixture'||gemini!==null&&source.provider==='google'&&source.task==='generation',adapters:[speechAdapter,{
      id:'local-generation',provider:'local-fixture',model:'synthetic-quiz-not-an-ai',version:'v1',billing:'self-hosted',capabilities:[{task:'generation',locales:['en-US'],modes:['text']}],
      invoke:async input=>{try{return {content:await localQuizGenerator(input)};}catch(error){if(error instanceof GenerationIssue)return {issue:error.code,retryable:error.retryable};throw error;}},validate:value=>value
    },...(gemini?[gemini.adapter]:[])]});
    await providers.initialize(actors.dev);
    await providers.configure(actors.dev,body({expectedRevision:1,selections:{generation:gemini?null:{adapterId:'local-generation',locale:'en-US',mode:'text'},pronunciation:{adapterId:speechAdapter.id,locale:'en-US',mode:'scripted'},stt:{adapterId:speechAdapter.id,locale:'en-US',mode:'unscripted'},conversation:{adapterId:speechAdapter.id,locale:'en-US',mode:'text'}},reason:gemini?'Local Gemini available; generation starts Off.':'Explicit synthetic local preview. No real inference or charges.'}));
    const factory=createLearningWorkbenchFactory({storage:{enabled:true,bucket,bucketName:WORKBENCH_TEST_BUCKET},inspect,publicAttribution:true,studyIntegration:true,resolveAccount:resolveActor,
      feedback:{enabled:true,retentionDays:7,deliveryEnabled:false},
      speech:{enabled:true,pronunciationQuizzes:true,workerId:actors.dev.id,resolveActor,authorize:async source=>source.provider==='local-fixture',openProviders:async()=>providers,rubrics:[LOCAL_SPEECH_RUBRIC],languageRubric:LOCAL_LANGUAGE_RUBRIC,budgets:{audio:{day:600,month:1800},language:{day:20,month:100}},coaching:{enabled:true,budgets:{day:20,month:100,sessionsPerDay:10}}},
      openPreparation:async({review})=>{
        const routed=createRoutedQuizGenerator({providers,includeMetadata:true,timeoutMs:35000});
        const generation=new QuizGenerationService({review,worker:actors.dev,resolveActor,preparation:new QuizGenerationContext({review}),backoffMs:100,...(gemini?{timeoutMs:40000,leaseMs:60000}:{}),
          generate:async input=>{
            if(gemini&&(await providers.inspect(actors.dev)).selections.generation?.adapterId==='gemini-quiz')return routed(input);
            try{const output=await providers.execute('generation',{type:input.type,meaning:input.meaning,attempt:input.attempt},{signal:input.signal});input.onObservation?.({source:output.source,usage:{}});if(output.data.issue)throw new GenerationIssue(output.data.issue,output.data.retryable);return {content:output.data.content,generation:{source:output.source,usage:{},instructionVersion:'local-synthetic-v1',generatedAt:new Date().toISOString(),contentRevision:1}};}
            catch(error){if(error instanceof GenerationIssue)throw error;throw new GenerationIssue(error.code==='quota_or_access_denied'?'quota_exceeded':'provider_not_configured',false);}
          }});
        // No synthetic checker is presented as independent language validation.
        const independent=new StoredQuizIndependentReview(review),pipeline=new QuizPreparationPipeline({review,independent,worker:actors.dev,resolveActor});
        const runner=new QuizPreparationRunner({review,generation,pipeline,workerId:actors.dev.id,resolveActor,authorize:async()=>true});
        return {generation,pipeline,providers,runner,availability:async()=>{const settings=await providers.inspect(actors.dev),remaining=gemini&&settings.selections.generation?.adapterId==='gemini-quiz'?await gemini.remaining():(await quota.summary(actors.dev,'local-fixture')).remaining;return {enabled:!!settings.selections.generation&&!settings.unavailable.some(row=>row.task==='generation'),remaining};}};
      }});
    const services=await factory({db:f.db,actor:actors.dev});
    await services.pipeline.initialize(actors.dev);await services.pipeline.configure(actors.dev,body({expectedRevision:1,enabled:true,reason:'Local preview only.'}));
    if(!gemini)await services.preparation.configure(actors.dev,body({expectedRevision:1,enabled:true,reason:'Local preview only.'}));
    const seed=await services.review.createDraft(actors.student,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,type:'Gap',content:{explanation:'Drizzle is light rain.',items:[{shown:'A fine ____ started falling.',answer:'drizzle',hint:'Light rain'}]}}));
    await services.review.submit(actors.student,seed.id,body({expectedRevision:1}));await services.review.approve(actors.teacher,seed.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true}}));
    const pending=await f.draft();await f.service.submit(actors.student,pending.id,body({expectedRevision:1}));
    await services.speech.createTask(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,locale:'en-US',prompt:'Read drizzle. Synthetic assessment only.',referenceMediaId:null,languageReview:true,level:null,mode:'pronunciation',evaluation:'pronunciation',reference:'drizzle',rubricId:LOCAL_SPEECH_RUBRIC.id}));
    let running=null;
    const tick=()=>{if(gemini)return Promise.resolve();if(!running)running=services.preparation.tick({maxSteps:12,maxMs:10000}).finally(()=>{running=null;});return running;};
    const runOne=async actor=>{
      if(!gemini||actor?.role!=='DEVELOPER')throw Object.assign(Error('Developer access required.'),{status:403});
      if(running)throw Object.assign(Error('A generation step is already running.'),{status:409});
      running=(async()=>{
        const settings=await providers.inspect(actors.dev),selection=settings.selections.generation;
        if(!selection||settings.unavailable.some(row=>row.task==='generation'))throw Object.assign(Error('Select an available generation provider first.'),{status:409});
        if(selection.adapterId==='gemini-quiz'&&await gemini.remaining()<1)throw Object.assign(Error('The local Gemini budget is exhausted.'),{status:409});
        const performed=await services.kits.generation.runOne();
        return {performed,remaining:await gemini.remaining()};
      })().finally(()=>{running=null;});
      return running;
    };
    return {services,actors,db:f.db,sql:f.sql,senseId:f.senseId,tick,runOne,async close(){if(running)await running;objects.clear();f.close();}};
  }catch(error){f.close();throw error;}
}
