// Trusted deployment composition. Flags never install a schema or select a model.
import {StudyError} from './learning-study.mjs';
import {createLearningWorkbenchFactory} from './learning-workbench-services.mjs';
import {createConfiguredLanguageProviders} from './configured-language-providers.mjs';
import {learningWorkbenchReadiness} from './learning-workbench-schema.mjs';
import {boundedProviderBytes} from './bounded-provider-body.mjs';
import {GenerationQuota} from './generation-quota.mjs';
import {openWorkbenchPreparation} from './learning-workbench-preparation.mjs';
const fail=message=>{throw new StudyError(503,message);};
export const WORKBENCH_PRIVATE_BUCKET='learn-english-workbench-private-media';
const writes=env=>env.LEARNING_WORKBENCH_ENABLED==='true'&&env.LEARNING_WORKBENCH_WRITES==='true'&&env.STAGE_WRITES==='true'&&env.ACCOUNT_TRANSFER_FROZEN!=='true';
function policy(env){
  let value;try{value=JSON.parse(env.LEARNING_WORKBENCH_POLICY||'null');}catch{fail('Invalid workbench policy.');}
  if(!value||value.version!==1||typeof value.revision!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(value.revision)||value.approved!==true)fail('An explicitly approved workbench policy is required.');
  if(Object.keys(value).some(key=>!['version','revision','approved','retentionDays','dailyReports','speech','language'].includes(key)))fail('Unknown workbench policy field.');
  return value;
}
export async function workbenchActor(env,id){
  if(typeof id!=='string'||!id||id.length>200||!env.DB?.prepare)return null;
  const row=await env.DB.prepare('SELECT id,login,name,role,active,is_personal_data_revoked FROM users WHERE id=?').bind(id).first();
  return row&&row.active!==0&&!row.is_personal_data_revoked&&['USER','ADMIN','DEVELOPER'].includes(row.role)?{id:row.id,login:row.login,name:row.name,role:row.role,active:true}:null;
}
function inspector(env){
  return async(bytes,mime)=>{
    if(typeof env.WORKBENCH_MEDIA_INSPECTOR?.fetch!=='function')fail('A trusted workbench media inspector binding is required.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await env.WORKBENCH_MEDIA_INSPECTOR.fetch(new Request('https://media-inspector.internal/inspect',{method:'POST',headers:{'Content-Type':mime},body:bytes,signal:controller.signal}));
      if(!response.ok)fail('Media inspection failed.');
      const data=await boundedProviderBytes(response.body,8192);let result;try{result=JSON.parse(new TextDecoder().decode(data));}catch{fail('Invalid media inspection result.');}
      if(!result||Object.keys(result).some(key=>!['kind','duration','width','height'].includes(key))||!['image','audio','video'].includes(result.kind)||!Number.isFinite(result.duration)||result.duration<0||![result.width,result.height].every(value=>Number.isSafeInteger(value)&&value>=0))fail('Invalid media inspection result.');
      return result;
    }finally{clearTimeout(timer);}
  };
}
export function createWorkbenchRuntime({inspect=null,openPreparation=openWorkbenchPreparation,openProviders=null,resolveActor=workbenchActor,fetchImpl=globalThis.fetch}={}){
  if(inspect!==null&&typeof inspect!=='function'||openPreparation!==null&&typeof openPreparation!=='function'||openProviders!==null&&typeof openProviders!=='function'||typeof resolveActor!=='function')fail('Invalid trusted workbench dependencies.');
  async function open({db,actor,env,writable=false}){
    if(env.LEARNING_WORKBENCH_ENABLED!=='true'||env.ACCOUNT_TRANSFER_FROZEN==='true')fail('Workbench is off or frozen.');
    const p=policy(env),current=await resolveActor(env,actor.id);
    if(!current||current.role!==actor.role)fail('Workbench account authorization changed.');
    if(env.WORKBENCH_MEDIA_BUCKET!==WORKBENCH_PRIVATE_BUCKET||env.WORKBENCH_STORAGE_APPROVED!=='true'||!env.WORKBENCH_MEDIA||[env.MEDIA,env.CONTENT_MEDIA,env.STAGE_MEDIA].includes(env.WORKBENCH_MEDIA))fail('A separately approved private workbench bucket is required.');
    const allow=async()=>{const current=await resolveActor(env,actor.id);return writable&&writes(env)&&!!current&&current.role===actor.role;};
    const resolve=id=>resolveActor(env,id),speechEnabled=env.LEARNING_SPEECH_ENABLED==='true';let providerInstance=null;
    const providers=async({db})=>{
      if(providerInstance)return providerInstance;
      if(openProviders){providerInstance=await openProviders({db,env,policy:p,authorize:allow});return providerInstance;}
      const language=p.language||{},common={enabled:env.LEARNING_LANGUAGE_NETWORK==='true',freeTierVerified:language.freeTierVerified===true,credentialRevision:language.credentialRevision,fetchImpl};
      const configured=await createConfiguredLanguageProviders({db,authorize:allow,quota:new GenerationQuota(db),
        whisper:language.whisper===true?{...common,accountId:env.WORKBENCH_CF_ACCOUNT_ID,apiToken:env.WORKBENCH_CF_API_TOKEN}:null,
        generation:language.generation===true?{...common,accountId:env.WORKBENCH_CF_ACCOUNT_ID,apiToken:env.WORKBENCH_CF_API_TOKEN}:null,
        azure:language.azure===true?{...common,resourceName:env.WORKBENCH_AZURE_RESOURCE,region:env.WORKBENCH_AZURE_REGION||'',apiKey:env.WORKBENCH_AZURE_KEY,termsRevision:language.termsRevision}:null});
      providerInstance=configured.providers;return providerInstance;
    };
    const speech=speechEnabled?{...p.speech,enabled:true,workerId:env.LEARNING_WORKBENCH_WORKER_ID,resolveActor:resolve,authorize:allow,openProviders:providers,
      pronunciationQuizzes:env.LEARNING_PRONUNCIATION_QUIZZES==='true',coaching:{...p.speech?.coaching,enabled:env.LEARNING_SPEECH_COACHING==='true'}}:null;
    const factory=createLearningWorkbenchFactory({storage:{enabled:true,environment:'production',productionApproved:true,bucket:env.WORKBENCH_MEDIA,bucketName:env.WORKBENCH_MEDIA_BUCKET,forbiddenBucket:env.CONTENT_MEDIA},inspect:inspect||inspector(env),speech,publicAttribution:true,studyIntegration:env.LEARNING_STUDY_BRIDGE==='true',resolveAccount:resolve,
      feedback:env.LEARNING_FEEDBACK_ENABLED==='true'?{enabled:true,retentionDays:p.retentionDays,dailyLimit:p.dailyReports,deliveryEnabled:writable&&writes(env)&&env.LEARNING_FEEDBACK_EMAIL==='true',binding:env.WORKBENCH_EMAIL,recipientVerified:env.WORKBENCH_EMAIL_RECIPIENT_VERIFIED==='true',policyRevision:p.revision}:null,
      openPreparation:env.LEARNING_PREPARATION_ENABLED==='true'?async context=>{
        if(!openPreparation)fail('Trusted preparation composition is not configured.');
        return openPreparation({...context,env,policy:p,resolveActor:resolve,openProviders:providers,authorize:allow});
      }:null});
    return factory({db,actor:current});
  }
  async function scheduled(_event,env,ctx,{db,maxSteps=6,maxMs=20000}={}){
    if(!writes(env))return {reason:'off'};
    if(!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>20||!Number.isSafeInteger(maxMs)||maxMs<1000||maxMs>25000||typeof ctx?.waitUntil!=='function')fail('Invalid workbench maintenance budget.');
    const work=(async()=>{
      if(!(await learningWorkbenchReadiness(db,{studyBridge:env.LEARNING_STUDY_BRIDGE==='true'})).ready)return {reason:'schema_unavailable'};
      const actor=await resolveActor(env,env.LEARNING_WORKBENCH_WORKER_ID);if(actor?.role!=='DEVELOPER')return {reason:'worker_unavailable'};
      const services=await open({db,actor,env,writable:true}),start=Date.now(),steps=[];
      const gate=async()=>writes(env)&&Date.now()-start<maxMs&&(await resolveActor(env,actor.id))?.role==='DEVELOPER';
      for(const [name,operation] of [
        ['feedback-recovery',()=>services.feedbackDelivery?.recover()],
        ['speech-recovery',()=>services.speech?.recover()],
        ['transcript-recovery',()=>services.transcripts?.recover()],
        ['coaching-recovery',()=>services.coaching?.recover()],
        ['feedback-privacy',()=>services.feedbackPrivacy?.sweep(actor,{limit:20})],
        ['preparation',()=>services.preparation?.tick({maxSteps,maxMs:Math.max(1,maxMs-(Date.now()-start))})]
      ]){if(!await gate())break;await operation();steps.push(name);}
      return {reason:'complete',steps};
    })();
    ctx.waitUntil(work.catch(()=>{}));return work;
  }
  return {open,scheduled};
}
