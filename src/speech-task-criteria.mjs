import {StudyError} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
export function validateSpeechTaskCriteria(value,mode){
  if(value==null){if(mode==='retelling')throw new StudyError(400,'Retelling requires a source and key ideas.');return null;}
  exactFields(value,['sourceText','keyIdeas','targetVocabulary']);
  const sourceText=value.sourceText==null?null:reviewText(value.sourceText,6000);
  const list=(rows,max)=>{if(!Array.isArray(rows)||rows.length>max)throw new StudyError(400,'Invalid speech criteria.');const result=rows.map(row=>reviewText(row,300));if(new Set(result.map(row=>row.normalize('NFKC').toLowerCase())).size!==result.length)throw new StudyError(400,'Speech criteria must be distinct.');return result;};
  const keyIdeas=list(value.keyIdeas,10),targetVocabulary=list(value.targetVocabulary,20);
  if(mode==='retelling'&&(!sourceText||!keyIdeas.length))throw new StudyError(400,'Retelling requires a source and key ideas.');
  if(!['free','retelling','dialogue'].includes(mode))throw new StudyError(400,'Only open speech tasks use meaning criteria.');
  return {version:'speech-task-criteria-v1',sourceText,keyIdeas,targetVocabulary};
}
