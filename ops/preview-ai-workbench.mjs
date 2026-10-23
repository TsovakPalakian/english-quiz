import {fileURLToPath} from 'node:url';
import {openLocalGeminiProvider} from './local-gemini-preview-provider.mjs';
import {openLocalAzureProvider} from './local-azure-preview-provider.mjs';
import {createLearningWorkbenchPreview} from './preview-learning-workbench.mjs';
import {geminiProbeFlags} from './probe-gemini-quiz.mjs';
let gemini,azure;
try{
  geminiProbeFlags(process.argv.slice(2));
  gemini=await openLocalGeminiProvider({filename:fileURLToPath(new URL('../.local-secrets/gemini-preview.sqlite',import.meta.url)),apiKey:process.env.GEMINI_API_KEY,quotaProject:process.env.GEMINI_PROJECT_ID,confirmFreeTier:true,allowDataProcessing:true,fetchImpl:fetch});
  azure=await openLocalAzureProvider({filename:fileURLToPath(new URL('../.local-secrets/azure-preview.sqlite',import.meta.url)),apiKey:process.env.AZURE_SPEECH_KEY,resourceName:process.env.AZURE_SPEECH_RESOURCE,region:process.env.AZURE_SPEECH_REGION,endpoint:process.env.AZURE_SPEECH_ENDPOINT,tier:process.env.AZURE_SPEECH_TIER,confirmFreeTier:true,allowDataProcessing:true,fetchImpl:fetch});
  const preview=await createLearningWorkbenchPreview({gemini,azure,port:Number(process.env.PORT||0)});
  console.log('Local AI workbench: '+preview.url+' (Gemini and Azure start Off; consent required; no deployment)');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>preview.close().then(()=>{azure.close();gemini.close();process.exit(0);}));
}catch{azure?.close();gemini?.close();console.error('Local AI preview requires valid Gemini and Azure F0 configuration and explicit consent flags.');process.exitCode=1;}
