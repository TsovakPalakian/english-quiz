import {createGeminiQuizAdapter} from '../src/gemini-quiz-provider.mjs';
import {LanguageProviderError} from '../src/language-providers.mjs';
import {openLocalLanguageBudget} from './local-language-budget.mjs';
export async function openLocalGeminiProvider({filename,apiKey,quotaProject,confirmFreeTier=false,allowDataProcessing=false,fetchImpl,now=Date.now}={}){
  if(confirmFreeTier!==true||allowDataProcessing!==true||typeof fetchImpl!=='function'||typeof apiKey!=='string'||!apiKey||apiKey.length>512||/[\s\x00-\x1f\x7f]/.test(apiKey)||typeof quotaProject!=='string'||!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(quotaProject))throw new LanguageProviderError('local_gemini_configuration_required');
  const adapter=createGeminiQuizAdapter({enabled:true,freeTierVerified:true,allowDataProcessing:true,apiKey,termsRevision:'local-preview-consent-v1',maxTokens:4096,fetchImpl});
  return openLocalLanguageBudget({filename,adapter,accountId:quotaProject,limits:{minuteRequests:2,dayRequests:5},maxInputBytes:12000,now});
}
