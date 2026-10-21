import {StudyError} from './learning-study.mjs';
import {exactFields} from './quiz-review-content.mjs';
const bad=()=>{throw new StudyError(400,'Invalid generation metadata.');};
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9@][a-zA-Z0-9_./:@-]{0,199}$/.test(value);

export function validateGenerationMetadata(value){
  exactFields(value,['source','usage','instructionVersion','generatedAt','contentRevision']);
  const {source,usage}=value;
  exactFields(source,['task','adapterId','locale','mode','provider','model','version','configurationRevision']);
  exactFields(usage,['prompt_tokens','completion_tokens','total_tokens']);
  if(source.task!=='generation'||source.mode!=='text'||!['adapterId','locale','provider','model','version'].every(key=>identifier(source[key]))||
    !Number.isSafeInteger(source.configurationRevision)||source.configurationRevision<1||
    !identifier(value.instructionVersion)||value.contentRevision!==1||typeof value.generatedAt!=='string'||
    !Number.isFinite(Date.parse(value.generatedAt))||new Date(value.generatedAt).toISOString()!==value.generatedAt)bad();
  for(const count of Object.values(usage))if(!Number.isSafeInteger(count)||count<0)bad();
  if(['prompt_tokens','completion_tokens','total_tokens'].every(key=>Object.hasOwn(usage,key))&&
    usage.prompt_tokens+usage.completion_tokens!==usage.total_tokens)bad();
  return structuredClone(value);
}
