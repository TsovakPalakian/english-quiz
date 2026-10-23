import {learningWorkbenchReadiness} from './learning-workbench-schema.mjs';
import {WORKBENCH_PRIVATE_BUCKET,workbenchActor} from './learning-workbench-runtime.mjs';
export const WORKBENCH_OFF_FLAGS=Object.freeze({LEARNING_WORKBENCH_ENABLED:'false',LEARNING_WORKBENCH_WRITES:'false',LEARNING_PREPARATION_ENABLED:'false',LEARNING_LANGUAGE_NETWORK:'false',LEARNING_SPEECH_ENABLED:'false',LEARNING_PRONUNCIATION_QUIZZES:'false',LEARNING_SPEECH_COACHING:'false',LEARNING_STUDY_BRIDGE:'false',LEARNING_FEEDBACK_ENABLED:'false',LEARNING_FEEDBACK_EMAIL:'false'});
// Structural and configuration facts only; does not probe AI, R2, mail or decoder.
export async function workbenchInfrastructure({db,env,resolveActor=workbenchActor}={}){
  const checks=[];const check=(id,ok)=>checks.push({id,ok:ok===true});
  let schema=null;try{schema=await learningWorkbenchReadiness(db,{studyBridge:env.LEARNING_STUDY_BRIDGE==='true'});}catch{}
  check('schema',schema?.ready===true);
  check('dedicated-private-binding',env.WORKBENCH_MEDIA_BUCKET===WORKBENCH_PRIVATE_BUCKET&&env.WORKBENCH_STORAGE_APPROVED==='true'&&!!env.WORKBENCH_MEDIA&&![env.MEDIA,env.CONTENT_MEDIA,env.STAGE_MEDIA].includes(env.WORKBENCH_MEDIA));
  check('media-inspector-binding',typeof env.WORKBENCH_MEDIA_INSPECTOR?.fetch==='function');
  let policy;try{policy=JSON.parse(env.LEARNING_WORKBENCH_POLICY);}catch{}
  check('approved-policy',policy?.version===1&&policy.approved===true&&typeof policy.revision==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(policy.revision)&&Object.keys(policy).every(key=>['version','revision','approved','retentionDays','dailyReports','speech','language'].includes(key)));
  let worker=null;try{worker=await resolveActor(env,env.LEARNING_WORKBENCH_WORKER_ID);}catch{}check('active-developer-worker',worker?.role==='DEVELOPER');
  const language=policy?.language||{};
  if(['geminiGeneration','geminiReview','azure','generation','whisper'].some(key=>language[key]===true))check('language-policy-revisions',/^[a-zA-Z0-9_.-]{1,64}$/.test(language.credentialRevision||'')&&/^[a-zA-Z0-9_.-]{1,64}$/.test(language.termsRevision||'')&&language.freeTierVerified===true);
  if(env.LEARNING_SPEECH_ENABLED==='true')check('speech-rubrics-configured',Array.isArray(policy?.speech?.rubrics)&&policy.speech.rubrics.length>0&&!!policy.speech.languageRubric);
  if(language.geminiGeneration===true||language.geminiReview===true){
    check('gemini-credentials',typeof env.WORKBENCH_GEMINI_KEY==='string'&&env.WORKBENCH_GEMINI_KEY.trim().length>0&&/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(env.WORKBENCH_GEMINI_PROJECT||''));
    const model=value=>typeof value==='string'&&/^gemini-[a-z0-9][a-z0-9.-]{0,100}$/.test(value);
    check('gemini-models',(!language.geminiGeneration||model(env.WORKBENCH_GEMINI_GENERATION_MODEL))&&(!language.geminiReview||model(env.WORKBENCH_GEMINI_REVIEW_MODEL)));
    check('gemini-processing-consent',language.allowDataProcessing===true&&language.freeTierVerified===true);
  }
  if(language.azure===true)check('azure-credentials',typeof env.WORKBENCH_AZURE_KEY==='string'&&env.WORKBENCH_AZURE_KEY.trim().length>0&&/^[a-z][a-z0-9-]{1,62}$/.test(env.WORKBENCH_AZURE_RESOURCE||'')&&/^[a-z][a-z0-9]{1,31}$/.test(env.WORKBENCH_AZURE_REGION||''));
  if(env.LEARNING_FEEDBACK_EMAIL==='true')check('feedback-mail-binding',typeof env.WORKBENCH_EMAIL?.send==='function'&&env.WORKBENCH_EMAIL_RECIPIENT_VERIFIED==='true');
  return {configurationReady:checks.every(row=>row.ok),checks,missing:checks.filter(row=>!row.ok).map(row=>row.id),schema,productionApproved:false,externalVerificationRequired:['R2 public access disabled and retention reviewed','decoder deployed, authenticated and real-file smoke tests passed','D1 copy migration and verified backup/restore','mail recipient routing verified before enabling delivery'],networkRequests:0,appliedChanges:false};
}
