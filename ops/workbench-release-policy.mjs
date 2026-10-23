// Deployment policy only. Model selections and provider access remain Off in SQL.
import {validateSpeechRubric} from '../src/speech-assessment.mjs';
export function workbenchReleasePolicy(){
  const scale={min:0,max:100,direction:'higher'};
  const pronunciation=validateSpeechRubric({id:'azure-scripted-practice',version:'accuracy-fluency-v1',weights:{accuracy:0.6,fluency:0.4},scales:{accuracy:scale,fluency:scale},minimumSeconds:2,findingConfidence:0.8,approvedBy:null});
  const language=validateSpeechRubric({id:'language-practice',version:'grammar-vocabulary-task-v1',weights:{grammar:0.35,vocabulary:0.3,task:0.35},scales:{grammar:scale,vocabulary:scale,task:scale},minimumSeconds:2,findingConfidence:0.8,approvedBy:null});
  return {version:1,revision:'release-20261023-v1',approved:true,retentionDays:30,dailyReports:20,
    language:{geminiGeneration:true,geminiReview:true,azure:true,freeTierVerified:true,allowDataProcessing:true,credentialRevision:'release-20261023-v1',termsRevision:'release-20261023-v1'},
    speech:{rubrics:[pronunciation],languageRubric:language,budgets:{audio:{day:600,month:1800},language:{day:10,month:100}},coaching:{enabled:true,budgets:{day:10,month:100,sessionsPerDay:5}}}};
}
