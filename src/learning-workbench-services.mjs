// Trusted composition only. No schema setup, fixture identities, model calls or global bindings.
import {StudyError} from './learning-study.mjs';
import {QuizReviewService} from './quiz-review.mjs';
import {LearningKits,kitSigned} from './learning-kits.mjs';
import {QuizMedia} from './quiz-media.mjs';
import {quizR2MediaStore} from './quiz-r2-media-store.mjs';
import {KitSessions} from './kit-sessions.mjs';
export function createLearningWorkbenchFactory({storage,inspect}={}){
  if(typeof inspect!=='function')throw new StudyError(503,'A trusted media inspector is required.');
  const store=quizR2MediaStore(storage);
  return async({db,actor})=>{
    kitSigned(actor);
    if(!db||typeof db.read!=='function'||typeof db.atomic!=='function')throw new StudyError(503,'Workbench database unavailable.');
    const review=new QuizReviewService(db,{extendedLifecycle:true,allowGlobalApproval:true,mediaQuizzes:true}),kits=new LearningKits(review),media=new QuizMedia(kits,{store,inspect});
    review.contentPolicy=media;
    return {review,kits,media,sessions:new KitSessions(kits)};
  };
}
