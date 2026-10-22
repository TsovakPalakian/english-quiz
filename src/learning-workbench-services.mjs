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
import {QuizFeedback,FEEDBACK_ADDRESS} from './quiz-feedback.mjs';
import {QuizFeedbackDelivery,createFeedbackEmailTransport} from './quiz-feedback-delivery.mjs';
import {QuizFeedbackPrivacy} from './quiz-feedback-privacy.mjs';
import {QuizAuthorVisibility} from './quiz-author-visibility.mjs';
import {KitLegacyMapping} from './kit-legacy-mapping.mjs';
import {KitExams} from './kit-exams.mjs';
import {KitStatistics} from './kit-statistics.mjs';
export function createLearningWorkbenchFactory({storage,inspect,speech:configuration=null,openPreparation=null,feedback:reports=null,publicAttribution=false,studyIntegration=false,resolveAccount=async()=>null}={}){
  if(typeof inspect!=='function')throw new StudyError(503,'A trusted media inspector is required.');
  if(openPreparation!==null&&typeof openPreparation!=='function')throw new StudyError(503,'A trusted preparation factory is required.');
  const store=quizR2MediaStore(storage);
  return async({db,actor})=>{
    kitSigned(actor);
    if(!db||typeof db.read!=='function'||typeof db.atomic!=='function')throw new StudyError(503,'Workbench database unavailable.');
    const review=new QuizReviewService(db,{extendedLifecycle:true,allowGlobalApproval:true,mediaQuizzes:true,pronunciationQuizzes:configuration?.enabled===true&&configuration?.pronunciationQuizzes===true,safePublicAttribution:publicAttribution===true}),kits=new LearningKits(review),media=new QuizMedia(kits,{store,inspect});
    review.contentPolicy=media;
    let runner=null,preparationProviders=null,preparationPipeline=null;
    if(openPreparation){
      const preparation=await openPreparation({db,review,actor});
      if(!preparation?.generation||preparation.generation.review!==review||preparation.generation.db!==db||typeof preparation.generation.enqueue!=='function'||typeof preparation.availability!=='function')throw new StudyError(503,'Preparation must use the current review service and an explicit availability gate.');
      kits.generation=preparation.generation;kits.availability=preparation.availability;
      preparationProviders=preparation.providers||null;preparationPipeline=preparation.pipeline||null;
      if(preparation.runner!==undefined){
        if(!(preparation.runner instanceof QuizPreparationRunner)||preparation.runner.review!==review||preparation.runner.generation!==preparation.generation)throw new StudyError(503,'Preparation runner must use the current services.');runner=preparation.runner;
      }
    }
    const services={review,kits,media,sessions:new KitSessions(kits)};
    if(studyIntegration===true){
      services.mapping=new KitLegacyMapping(kits);services.statistics=new KitStatistics(services.sessions);
      services.examQuizzes=new KitExams(services.sessions,{resolveActor:resolveAccount});
      services.sessions.examPolicy=services.examQuizzes;services.sessions.authorizeExamRelease=(actor,row)=>services.examQuizzes.canRelease(actor,row);
    }
    if(preparationProviders)services.providers=preparationProviders;
    if(preparationPipeline)services.pipeline=preparationPipeline;
    if(publicAttribution===true)services.authors=new QuizAuthorVisibility(review);
    if(reports?.enabled===true){
      services.feedback=new QuizFeedback(kits,media,{privacyEnabled:true,retentionDays:reports.retentionDays});
      media.feedbackRetentionDays=reports.retentionDays;
      services.feedbackPrivacy=new QuizFeedbackPrivacy(services.feedback);
      services.feedbackDelivery=new QuizFeedbackDelivery(services.feedback,{transport:createFeedbackEmailTransport({enabled:reports.deliveryEnabled===true,binding:reports.binding,recipientVerified:reports.recipientVerified===true,policyRevision:reports.policyRevision||null}),dailyLimit:reports.dailyLimit??20});
      services.feedbackPolicy={recipient:FEEDBACK_ADDRESS,retentionDays:reports.retentionDays,deliveryEnabled:reports.deliveryEnabled===true&&reports.recipientVerified===true&&!!reports.policyRevision&&typeof reports.binding?.send==='function',maxAttachmentBytes:3*1024*1024,mailboxCopyMayRemain:true};
    }
    if(runner)services.preparation=runner;
    if(configuration?.enabled===true){
      if(!Array.isArray(configuration.rubrics)||!configuration.rubrics.length||!configuration.languageRubric)throw new StudyError(503,'Explicit speech and transcript rubrics are required.');
      if(typeof configuration.resolveActor!=='function'||!configuration.workerId||typeof configuration.authorize!=='function')throw new StudyError(503,'A trusted speech worker resolver and provider authorization gate are required.');
      const worker=await configuration.resolveActor(configuration.workerId);
      if(!worker?.id||worker.role!=='DEVELOPER'||worker.active===false||worker.active===0||worker.revoked)throw new StudyError(503,'Speech settings require a current developer worker.');
      if(configuration.openProviders!==undefined&&typeof configuration.openProviders!=='function')throw new StudyError(503,'A trusted provider factory is required.');
      const providers=configuration.openProviders?await configuration.openProviders({db,actor}):new StoredLanguageProviders(db,{adapters:configuration.adapters||[],authorize:configuration.authorize});
      if(!(providers instanceof StoredLanguageProviders))throw new StudyError(503,'Stored language providers are required.');
      services.providers=providers;
      services.speech=new SpeechPractice(kits,media,{enabled:true,providers,worker,rubrics:configuration.rubrics,budgets:configuration.budgets,resolveActor:configuration.resolveActor});
      services.sessions.speech=services.speech;
      services.transcripts=new SpeechTranscriptReview(services.speech,{enabled:true,rubric:configuration.languageRubric});
      if(configuration.coaching?.enabled===true)services.coaching=new SpeechCoaching(services.speech,configuration.coaching);
    }
    return services;
  };
}
