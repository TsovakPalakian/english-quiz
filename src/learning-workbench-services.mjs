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
export function createLearningWorkbenchFactory({storage,inspect,speech:configuration=null}={}){
  if(typeof inspect!=='function')throw new StudyError(503,'A trusted media inspector is required.');
  const store=quizR2MediaStore(storage);
  return async({db,actor})=>{
    kitSigned(actor);
    if(!db||typeof db.read!=='function'||typeof db.atomic!=='function')throw new StudyError(503,'Workbench database unavailable.');
    const review=new QuizReviewService(db,{extendedLifecycle:true,allowGlobalApproval:true,mediaQuizzes:true}),kits=new LearningKits(review),media=new QuizMedia(kits,{store,inspect});
    review.contentPolicy=media;
    const services={review,kits,media,sessions:new KitSessions(kits)};
    if(configuration?.enabled===true){
      if(!Array.isArray(configuration.rubrics)||!configuration.rubrics.length||!configuration.languageRubric)throw new StudyError(503,'Explicit speech and transcript rubrics are required.');
      if(typeof configuration.resolveActor!=='function'||!configuration.workerId||typeof configuration.authorize!=='function')throw new StudyError(503,'A trusted speech worker resolver and provider authorization gate are required.');
      const worker=await configuration.resolveActor(configuration.workerId);
      if(!worker?.id||worker.role!=='DEVELOPER'||worker.active===false||worker.active===0||worker.revoked)throw new StudyError(503,'Speech settings require a current developer worker.');
      const providers=new StoredLanguageProviders(db,{adapters:configuration.adapters||[],authorize:configuration.authorize});
      services.speech=new SpeechPractice(kits,media,{enabled:true,providers,worker,rubrics:configuration.rubrics,budgets:configuration.budgets,resolveActor:configuration.resolveActor});
      services.transcripts=new SpeechTranscriptReview(services.speech,{enabled:true,rubric:configuration.languageRubric});
    }
    return services;
  };
}
