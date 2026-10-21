import {StudyError} from './learning-study.mjs';
import {exactFields} from './quiz-review-content.mjs';
const bad=()=>{throw new StudyError(400,'Invalid generation metadata.');};
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9@][a-zA-Z0-9_./:@-]{0,199}$/.test(value);

export function validateLanguageRequestSource(source){
  exactFields(source,['task','adapterId','locale','mode','provider','model','version','configurationRevision']);
  if(!['generation','review'].includes(source.task)||source.mode!=='text'||!['adapterId','locale','provider','model','version'].every(key=>identifier(source[key]))||
    !Number.isSafeInteger(source.configurationRevision)||source.configurationRevision<1)bad();
  return structuredClone(source);
}
export function validateGenerationSource(source){
  const result=validateLanguageRequestSource(source);if(result.task!=='generation')bad();return result;
}
export function validateGenerationUsage(usage){
  exactFields(usage,['prompt_tokens','completion_tokens','total_tokens']);
  for(const count of Object.values(usage))if(!Number.isSafeInteger(count)||count<0)bad();
  if(['prompt_tokens','completion_tokens','total_tokens'].every(key=>Object.hasOwn(usage,key))&&
    usage.prompt_tokens+usage.completion_tokens!==usage.total_tokens)bad();
  return structuredClone(usage);
}
export function validateGenerationMetadata(value){
  exactFields(value,['source','usage','instructionVersion','generatedAt','contentRevision']);
  validateGenerationSource(value.source);validateGenerationUsage(value.usage);
  if(!identifier(value.instructionVersion)||value.contentRevision!==1||typeof value.generatedAt!=='string'||
    !Number.isFinite(Date.parse(value.generatedAt))||new Date(value.generatedAt).toISOString()!==value.generatedAt)bad();
  return structuredClone(value);
}
