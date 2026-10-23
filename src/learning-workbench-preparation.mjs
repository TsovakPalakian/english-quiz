import {StudyError} from './learning-study.mjs';
import {QuizGenerationService} from './quiz-generation.mjs';
import {QuizGenerationContext} from './quiz-generation-context.mjs';
import {createQuizPackageGenerator} from './quiz-package-generator.mjs';
import {createRoutedQuizGenerator} from './workers-ai-quiz-provider.mjs';
import {GenerationQuota} from './generation-quota.mjs';
import {StoredQuizIndependentReview} from './stored-quiz-independent-review.mjs';
import {QuizPreparationPipeline} from './quiz-preparation-pipeline.mjs';
import {QuizPreparationRunner} from './quiz-preparation-runner.mjs';
import {IndependentReviewIssue} from './quiz-independent-review.mjs';
// Shared SQL-backed composition; no initialization, automatic enabling or fixture source mapping.
export async function openWorkbenchPreparation({db,review,env,resolveActor,openProviders,authorize}){
  const worker=await resolveActor(env.LEARNING_WORKBENCH_WORKER_ID);
  if(worker?.role!=='DEVELOPER')throw new StudyError(503,'An active preparation worker is required.');
  const providers=await openProviders({db}),quota=new GenerationQuota(db);
  const generation=new QuizGenerationService({review,worker,resolveActor,
    preparation:new QuizGenerationContext({review}),
    generate:createQuizPackageGenerator({generate:createRoutedQuizGenerator({providers,includeMetadata:true,timeoutMs:35000})}),timeoutMs:40000,leaseMs:60000});
  const independent=new StoredQuizIndependentReview(review,{timeoutMs:40000,reviewer:async({signal,...input})=>{
    try{return (await providers.execute('review',input,{signal,timeoutMs:35000})).data.result;}
    catch(error){throw new IndependentReviewIssue(({provider_disabled:'review_not_configured',quota_or_access_denied:'quota_exceeded',access_budget_or_policy_changed:'quota_exceeded'})[error.code]||(['cancelled','timeout','review_refused','invalid_review_response'].includes(error.code)?error.code:'review_unavailable'));}
  }}),pipeline=new QuizPreparationPipeline({review,independent,worker,resolveActor,leaseMs:60000});
  const runner=new QuizPreparationRunner({review,generation,pipeline,workerId:worker.id,resolveActor,authorize});
  const availability=async()=>{
    const current=await resolveActor(worker.id);if(current?.role!=='DEVELOPER')throw new StudyError(503,'Preparation worker authorization changed.');
    const settings=await providers.inspect(current),choice=settings.selections.generation;
    if(!choice||settings.unavailable.some(row=>row.task==='generation'))return {enabled:false,remaining:0};
    const adapter=settings.adapters.find(row=>row.id===choice.adapterId);if(!adapter)return {enabled:false,remaining:0};
    const status=await quota.summary(current,adapter.provider);return {enabled:await authorize(),remaining:status.remaining};
  };
  return {generation,runner,availability,providers,pipeline,independent};
}
