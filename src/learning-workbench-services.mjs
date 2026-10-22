// Trusted composition only. No schema setup, fixture identities, model calls or global bindings.
import {StudyError} from './learning-study.mjs';
import {QuizReviewService} from './quiz-review.mjs';
import {LearningKits,kitSigned} from './learning-kits.mjs';
import {QuizMedia} from './quiz-media.mjs';
import {quizR2MediaStore} from './quiz-r2-media-store.mjs';
import {KitSessions} from './kit-sessions.mjs';
import {SpeechPractice} from './speech-practice.mjs';
import {SpeechTranscriptReview} from './speech-transcript-review.mjs';
import {StoredLanguageProviders} from './stored-language-providers.mjs';
import {QuizPreparationRunner} from './quiz-preparation-runner.mjs';
import {SpeechCoaching} from './speech-coaching.mjs';
export function createLearningWorkbenchFactory({storage,inspect,speech:configuration=null,openPreparation=null}={}){
  if(typeof inspect!=='function')throw new StudyError(503,'A trusted media inspector is required.');
  if(openPreparation!==null&&typeof openPreparation!=='function')throw new StudyError(503,'A trusted preparation factory is required.');
  const store=quizR2MediaStore(storage);
  return async({db,actor})=>{
    kitSigned(actor);
    if(!db||typeof db.read!=='function'||typeof db.atomic!=='function')throw new StudyError(503,'Workbench database unavailable.');
    const review=new QuizReviewService(db,{extendedLifecycle:true,allowGlobalApproval:true,mediaQuizzes:true,pronunciationQuizzes:configuration?.enabled===true&&configuration?.pronunciationQuizzes===true}),kits=new LearningKits(review),media=new QuizMedia(kits,{store,inspect});
    review.contentPolicy=media;
    let runner=null;
    if(openPreparation){
      const preparation=await openPreparation({db,review,actor});
      if(!preparation?.generation||preparation.generation.review!==review||preparation.generation.db!==db||typeof preparation.generation.enqueue!=='function'||typeof preparation.availability!=='function')throw new StudyError(503,'Preparation must use the current review service and an explicit availability gate.');
      kits.generation=preparation.generation;kits.availability=preparation.availability;
      if(preparation.runner!==undefined){
        if(!(preparation.runner instanceof QuizPreparationRunner)||preparation.runner.review!==review||preparation.runner.generation!==preparation.generation)throw new StudyError(503,'Preparation runner must use the current services.');runner=preparation.runner;
      }
    }
    const services={review,kits,media,sessions:new KitSessions(kits)};
    if(runner)services.preparation=runner;
    if(configuration?.enabled===true){
      if(!Array.isArray(configuration.rubrics)||!configuration.rubrics.length||!configuration.languageRubric)throw new StudyError(503,'Explicit speech and transcript rubrics are required.');
      if(typeof configuration.resolveActor!=='function'||!configuration.workerId||typeof configuration.authorize!=='function')throw new StudyError(503,'A trusted speech worker resolver and provider authorization gate are required.');
      const worker=await configuration.resolveActor(configuration.workerId);
      if(!worker?.id||worker.role!=='DEVELOPER'||worker.active===false||worker.active===0||worker.revoked)throw new StudyError(503,'Speech settings require a current developer worker.');
      if(configuration.openProviders!==undefined&&typeof configuration.openProviders!=='function')throw new StudyError(503,'A trusted provider factory is required.');
      const providers=configuration.openProviders?await configuration.openProviders({db,actor}):new StoredLanguageProviders(db,{adapters:configuration.adapters||[],authorize:configuration.authorize});
      if(!(providers instanceof StoredLanguageProviders))throw new StudyError(503,'Stored language providers are required.');
      services.speech=new SpeechPractice(kits,media,{enabled:true,providers,worker,rubrics:configuration.rubrics,budgets:configuration.budgets,resolveActor:configuration.resolveActor});
      services.sessions.speech=services.speech;
      services.transcripts=new SpeechTranscriptReview(services.speech,{enabled:true,rubric:configuration.languageRubric});
      if(configuration.coaching?.enabled===true)services.coaching=new SpeechCoaching(services.speech,configuration.coaching);
    }
    return services;
  };
}
