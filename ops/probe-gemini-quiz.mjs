// Explicit one-request probe on disposable data. Never imported by the Worker.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {fixture,actors,body} from '../test/quiz-review-fixture.mjs';
import {workbenchMigrationPlan} from './learning-workbench-migration-plan.mjs';
import {createConfiguredLanguageProviders} from '../src/configured-language-providers.mjs';
import {createRoutedQuizGenerator} from '../src/workers-ai-quiz-provider.mjs';
import {QuizGenerationService} from '../src/quiz-generation.mjs';
import {LanguageProviderError} from '../src/language-providers.mjs';
import {geminiProbeDiagnostic} from './gemini-probe-diagnostic.mjs';
const fail=code=>{throw new LanguageProviderError(code);};
export async function runGeminiQuizProbe({apiKey='',quotaProject='',confirmFreeTier=false,allowDataProcessing=false,run=false,fetchImpl}={}){
  if(run!==true||confirmFreeTier!==true||allowDataProcessing!==true)fail('explicit_probe_consent_required');
  if(typeof apiKey!=='string'||!apiKey.trim()||apiKey.length>512||/[\s\x00-\x1f\x7f]/.test(apiKey)||typeof quotaProject!=='string'||!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(quotaProject))fail('local_credentials_required');
  if(typeof fetchImpl!=='function')fail('provider_not_configured');
  const f=await fixture({d1:true});let requests=0,diagnostic=null;
  try{
    for(const step of workbenchMigrationPlan().steps.slice(1))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8'));
    const composed=await createConfiguredLanguageProviders({db:f.db,authorize:async source=>source.provider==='google'&&source.task==='generation',geminiGeneration:{
      enabled:true,freeTierVerified:true,allowDataProcessing:true,apiKey,quotaProject,credentialRevision:'local-probe-v1',termsRevision:'local-explicit-consent-2026-10-23',maxTokens:2048,timeoutMs:30000,
      fetchImpl:async(url,options)=>{
        if(requests!==0)fail('quota_or_access_denied');requests++;
        const response=await fetchImpl(url,options);
        if(!(response instanceof Response))return response;
        diagnostic={httpStatus:response.status};
        if(response.status===200)return response;
        diagnostic=await geminiProbeDiagnostic(response,{signal:options.signal});
        // The adapter needs the status, not the sensitive upstream body.
        return new Response(null,{status:response.status});
      },
    }});
    await composed.providers.initialize(actors.dev);
    await composed.providers.configure(actors.dev,body({expectedRevision:1,selections:{generation:{adapterId:'gemini-quiz',locale:'en-US',mode:'text'}},reason:'One explicitly authorized local probe.'}));
    const account=composed.accounts[0];
    await composed.access.confirm(actors.dev,body({scope:account.scope,expectedRevision:0,reason:'One synthetic word; user confirmed free tier and data processing.',policy:{
      enabled:true,bindings:account.bindings,tasks:['generation'],termsRevision:'local-explicit-consent-2026-10-23',dataProcessingApproved:true,noPaidOverageConfirmed:true,
      expiresAt:Date.now()+15*60000,dailyRequests:1,dailyInputBytes:12000,maxInputBytes:12000,
    }}));
    const generation=new QuizGenerationService({review:f.service,worker:actors.dev,resolveActor:async id=>Object.values(actors).find(actor=>actor.id===id)||null,
      timeoutMs:40000,leaseMs:60000,generate:createRoutedQuizGenerator({providers:composed.providers,includeMetadata:true,timeoutMs:35000})});
    await generation.enqueue(actors.teacher,body({groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Gap']}));
    // Exactly one queue step. A failed job is never automatically retried here.
    await generation.runOne();
    const [job]=await generation.list(actors.teacher);
    if(job.state!=='submitted')return {environment:'local-gemini-probe',requests,state:job.state,issue:job.issue,diagnostic,requiresTeacherReview:true,published:false};
    const version=await f.service.get(actors.teacher,job.versionId);
    return {environment:'local-gemini-probe',requests,state:job.state,requiresTeacherReview:true,published:false,type:version.type,content:version.content,generation:version.generation};
  }finally{f.close();}
}
export function geminiProbeFlags(args){
  const allowed=['--run','--confirm-free-tier','--allow-data-processing'];
  if(!Array.isArray(args)||args.length!==allowed.length||new Set(args).size!==allowed.length||args.some(value=>!allowed.includes(value)))fail('explicit_probe_consent_required');
  return {run:true,confirmFreeTier:true,allowDataProcessing:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    const options=geminiProbeFlags(process.argv.slice(2));
    const result=await runGeminiQuizProbe({...options,apiKey:process.env.GEMINI_API_KEY,quotaProject:process.env.GEMINI_PROJECT_ID,fetchImpl:fetch});
    console.log(JSON.stringify(result,null,2));if(result.state!=='submitted')process.exitCode=1;
  }catch(error){
    const code=['explicit_probe_consent_required','local_credentials_required','provider_not_configured'].includes(error.code)?error.code:'local_probe_failed';
    console.error(code);process.exitCode=1;
  }
}
