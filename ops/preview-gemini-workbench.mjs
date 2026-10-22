import {fileURLToPath} from 'node:url';
import {openLocalGeminiProvider} from './local-gemini-preview-provider.mjs';
import {createLearningWorkbenchPreview} from './preview-learning-workbench.mjs';
import {geminiProbeFlags} from './probe-gemini-quiz.mjs';
try{
  geminiProbeFlags(process.argv.slice(2));
  const gemini=await openLocalGeminiProvider({filename:fileURLToPath(new URL('../.local-secrets/gemini-preview.sqlite',import.meta.url)),apiKey:process.env.GEMINI_API_KEY,quotaProject:process.env.GEMINI_PROJECT_ID,confirmFreeTier:true,allowDataProcessing:true,fetchImpl:fetch});
  let preview;
  try{preview=await createLearningWorkbenchPreview({gemini,port:Number(process.env.PORT||0)});}catch(error){gemini.close();throw error;}
  console.log('Local Gemini workbench: '+preview.url+' (generation Off; manual steps only; 5 requests/24h; no deployment)');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>preview.close().then(()=>{gemini.close();process.exit(0);}));
}catch{console.error('Local Gemini preview requires valid local credentials and --run --confirm-free-tier --allow-data-processing.');process.exitCode=1;}
