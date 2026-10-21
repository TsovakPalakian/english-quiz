// Deliberately unassessed synthetic data, never a real language-quality verdict.
import {createIndependentQuizReviewer,REVIEW_DIMENSIONS} from '../src/quiz-independent-review.mjs';
export function localQuizReviewer(model){
  return createIndependentQuizReviewer({enabled:true,source:{provider:'local-fixture',model,version:'v1'},
    complete:async request=>{
      const dimensions=Object.fromEntries(REVIEW_DIMENSIONS.map(key=>[key,'not_assessed'])),findings=[];
      if(request.checked.type==='Choice'){
        dimensions.ambiguity='issue';
        findings.push({dimension:'ambiguity',severity:'warning',itemIndex:0,
          message:'Synthetic example: inspect the distractors for overlapping meanings.',
          suggestion:'Compare every option with the intended meaning before approval.'});
      }
      return {text:JSON.stringify({fingerprint:request.checked.fingerprint,revision:request.checked.revision,status:'reviewed',dimensions,findings})};
    }});
}
