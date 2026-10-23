// Trusted server composition; never accept these options from request JSON.
import {StoredLanguageProviders} from './stored-language-providers.mjs';
import {LanguageAccessPolicy} from './language-access-policy.mjs';
import {LanguageProviderError} from './language-providers.mjs';
import {createWordNetAdapter} from './wordnet-language-provider.mjs';
import {createWorkersAIWhisperAdapter} from './workers-ai-speech-provider.mjs';
import {createAzurePronunciationAdapter,createAzureTTSAdapter} from './azure-speech-provider.mjs';
import {createGeminiReviewAdapter} from './gemini-review-provider.mjs';
import {createGeminiQuizAdapter,GEMINI_DISPATCH_LIMITS} from './gemini-quiz-provider.mjs';
import {createWorkersAIQuizAdapter} from './workers-ai-quiz-provider.mjs';
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
async function accountScope(provider,account){
  if(typeof account!=='string'||!account.trim()||account.length>200||/[\s\x00-\x1f]/.test(account))throw new LanguageProviderError('invalid_configuration');
  return digest([provider,account]);
}
export async function createConfiguredLanguageProviders({db,authorize,quota=null,wordnet=null,whisper=null,azure=null,gemini=null,geminiGeneration=null,generation=null,conversation=null,now=Date.now}={}){
  if(typeof authorize!=='function')throw new LanguageProviderError('invalid_configuration');
  const access=new LanguageAccessPolicy(db,{now}),adapters=[],accounts=[];
  const configured=async options=>{
    if(typeof options.credentialRevision!=='string'||!/^[a-zA-Z0-9_.-]{1,64}$/.test(options.credentialRevision))throw new LanguageProviderError('invalid_configuration');
    return {...options,configurationRevision:await digest([options.credentialRevision,options.enabled===true,options.allowDataProcessing===true,options.reuseConditions??null,options.maxTokens??4096])};
  };
  const register=async(provider,account,rows)=>{
    const scope=await accountScope(provider,account);
    const bindings=rows.map(({id,provider,model,version,billing})=>({id,provider,model,version,billing})),existing=accounts.find(account=>account.scope===scope);
    const tasks=[...new Set(rows.flatMap(row=>row.capabilities.map(cap=>cap.task)))];
    if(existing){existing.bindings.push(...bindings);existing.tasks=[...new Set([...existing.tasks,...tasks])];}else accounts.push({scope,provider,bindings,tasks});
    adapters.push(...rows.map(adapter=>access.wrap(adapter,{scope,...(provider==='google'?{limits:GEMINI_DISPATCH_LIMITS}:{})})));
  };
  if(wordnet)await register('princeton-wordnet',wordnet.dataset?.sha256,[createWordNetAdapter(wordnet)]);
  if(whisper)await register('cloudflare',whisper.accountId,[createWorkersAIWhisperAdapter(await configured(whisper))]);
  if(generation)await register('cloudflare',generation.accountId,[createWorkersAIQuizAdapter(await configured(generation))]);
  if(azure){const options=await configured(azure);await register('microsoft-azure',azure.resourceName,[createAzurePronunciationAdapter(options),createAzureTTSAdapter(options)]);}
  // Project-level quota identity is supplied by the server, never an API key.
  if(gemini){if(typeof gemini.quotaProject!=='string'||!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(gemini.quotaProject))throw new LanguageProviderError('invalid_configuration');await register('google',gemini.quotaProject,[createGeminiReviewAdapter(await configured(gemini))]);}
  if(geminiGeneration){if(typeof geminiGeneration.quotaProject!=='string'||!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(geminiGeneration.quotaProject))throw new LanguageProviderError('invalid_configuration');await register('google',geminiGeneration.quotaProject,[createGeminiQuizAdapter(await configured(geminiGeneration))]);}
  if(conversation){if(!conversation.adapter?.capabilities?.every(cap=>cap.task==='conversation'))throw new LanguageProviderError('invalid_configuration');await register(conversation.adapter.provider,conversation.account,[conversation.adapter]);}
  const providers=new StoredLanguageProviders(db,{adapters,authorize,quota,freeOnly:true},{now});
  return Object.freeze({providers,access,accounts:structuredClone(accounts)});
}
