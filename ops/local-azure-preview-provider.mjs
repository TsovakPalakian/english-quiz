import {createAzurePronunciationAdapter} from '../src/azure-speech-provider.mjs';
import {openLocalLanguageBudget} from './local-language-budget.mjs';
export const AZURE_PRACTICE_RUBRIC={id:'azure-scripted-practice',version:'accuracy-fluency-v1',weights:{accuracy:0.6,fluency:0.4},scales:{accuracy:{min:0,max:100,direction:'higher'},fluency:{min:0,max:100,direction:'higher'}},minimumSeconds:2,findingConfidence:0.8,approvedBy:null};
export async function openLocalAzureProvider({filename,apiKey,resourceName,region,endpoint,tier,confirmFreeTier=false,allowDataProcessing=false,fetchImpl,now=Date.now}={}){
  if(confirmFreeTier!==true||allowDataProcessing!==true||tier!=='F0'||typeof fetchImpl!=='function'||typeof apiKey!=='string'||!apiKey||apiKey.length>512||/[\s\x00-\x1f\x7f]/.test(apiKey)||typeof resourceName!=='string'||!/^[a-z][a-z0-9-]{1,62}$/.test(resourceName)||typeof region!=='string'||!/^[a-z][a-z0-9]{1,31}$/.test(region)||endpoint!=='https://'+region+'.api.cognitive.microsoft.com/')throw Error('Local Azure F0 configuration required.');
  const adapter=createAzurePronunciationAdapter({enabled:true,freeTierVerified:true,resourceName,region,apiKey,fetchImpl,termsRevision:'local-preview-consent-v1'});
  return openLocalLanguageBudget({filename,adapter,accountId:resourceName+'.'+region,limits:{minuteRequests:2,dayRequests:10},maxInputBytes:1000000,now});
}
