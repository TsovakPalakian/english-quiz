// LOCAL ONLY: synthetic accounts, in-memory SQLite, no production credentials.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {fixture,actors,body} from '../test/quiz-review-fixture.mjs';
import {QuizGenerationService,GenerationIssue} from '../src/quiz-generation.mjs';
import {GenerationQuota} from '../src/generation-quota.mjs';
import {StoredLanguageProviders} from '../src/stored-language-providers.mjs';
import {localQuizGenerator} from './quiz-generation-local-provider.mjs';
import {localQuizReviewer} from './quiz-review-local-provider.mjs';
import {StoredQuizIndependentReview} from '../src/stored-quiz-independent-review.mjs';
import {IndependentReviewIssue,validateIndependentReviewResult} from '../src/quiz-independent-review.mjs';
const files={'/':['site/quiz-review-local.html','text/html'],'/workbench.css':['site/quiz-workbench.css','text/css'],'/review-local.css':['site/quiz-review-local.css','text/css'],'/review-local.js':['client/demos/quiz-review-local.js','text/javascript'],'/review-editor.js':['client/demos/quiz-review-editor.js','text/javascript'],'/provider-settings.js':['client/demos/provider-settings-ui.js','text/javascript'],'/favicon.svg':['site/favicon.svg','image/svg+xml']};
const checks={meaning:true,answers:true,level:true};
files['/independent-review.js']=['client/demos/independent-review-ui.js','text/javascript'];
function fail(status,message){throw Object.assign(new Error(message),{status});}
async function jsonBody(req){
  const length=Number(req.headers['content-length']);if(Number.isFinite(length)&&length>60000)fail(413,'Request is too large.');
  if(!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Use application/json.');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>60000)fail(413,'Request is too large.');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'Invalid JSON.');}
}
export async function createQuizReviewPreview({port=0,requestLimit=100,generationEnabled=false}={}){
  if(typeof generationEnabled!=='boolean')throw new Error('Invalid synthetic generation setting.');
  const f=await fixture({approval:true}),service=f.service;
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/002_generation_jobs.sql',import.meta.url),'utf8'));
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/003_generation_quota.sql',import.meta.url),'utf8'));
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/004_quota_limit_changes.sql',import.meta.url),'utf8'));
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/005_provider_settings.sql',import.meta.url),'utf8'));
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/006_independent_reviews.sql',import.meta.url),'utf8'));
  f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/007_independent_review_recovery.sql',import.meta.url),'utf8'));
  const quota=new GenerationQuota(f.db);
  await quota.initialize(actors.dev,{provider:'local-fixture',windowMs:86400000,requestLimit});
  const reviewAdapters=['local-checker-a','local-checker-b'].map(id=>{
    const check=localQuizReviewer(id);
    return {id,provider:'local-fixture',model:id,version:'v1',billing:'self-hosted',
      capabilities:[{task:'review',locales:['en-US'],modes:['text']}],
      invoke:async(input,{signal})=>{try{return {result:await check({...input,signal})};}catch(error){if(error instanceof IndependentReviewIssue)return {issue:error.code};throw error;}},
      validate:value=>value};
  });
  const providers=new StoredLanguageProviders(f.db,{quota,authorize:async()=>true,adapters:[...['local-fixture-a','local-fixture-b'].map(id=>({
    id,provider:'local-fixture',model:id,version:'v1',billing:'self-hosted',
    capabilities:[{task:'generation',locales:['en-US'],modes:['text']}],
    invoke:async input=>{try{return {content:await localQuizGenerator(input)};}catch(error){if(error instanceof GenerationIssue)return {issue:error.code,retryable:error.retryable};throw error;}},
    validate:value=>value,
  })),...reviewAdapters]});
  await providers.initialize(actors.dev);
  // Explicit opt-in for old deterministic test scenarios, not a production default.
  if(generationEnabled)await providers.configure(actors.dev,body({expectedRevision:1,selections:{generation:{adapterId:'local-fixture-a',locale:'en-US',mode:'text'}},reason:'Enable the synthetic generator for this test fixture.'}));
  const generate=async input=>{
    try{
      const result=await providers.execute('generation',{type:input.type,meaning:input.meaning,attempt:input.attempt},{signal:input.signal});
      input.onObservation?.({source:result.source,usage:null});
      if(result.data.issue)throw new GenerationIssue(result.data.issue,result.data.retryable);
      return {content:result.data.content,generation:{source:result.source,usage:{},instructionVersion:'local-fixture-v1',generatedAt:new Date().toISOString(),contentRevision:1}};
    }catch(error){
      if(error.source)input.onObservation?.({source:error.source,usage:error.usage??null});
      if(error.code==='quota_or_access_denied')throw new GenerationIssue('quota_exceeded',false);
      if(['provider_disabled','provider_configuration_changed','adapter_not_registered','paid_provider_blocked','unsupported_capability'].includes(error.code))throw new GenerationIssue('provider_not_configured',false);
      if(['timeout','cancelled'].includes(error.code))throw new GenerationIssue(error.code,error.code==='timeout');
      throw error;
    }
  };
  const generation=new QuizGenerationService({review:service,worker:actors.dev,resolveActor:async id=>Object.values(actors).find(a=>a.id===id),generate,backoffMs:400});
  const independent=new StoredQuizIndependentReview(service,{reviewer:async({signal,...input})=>{
    try{
      const response=await providers.execute('review',input,{signal});
      if(response.data.issue)throw new IndependentReviewIssue(response.data.issue);
      const result=await validateIndependentReviewResult(response.data.result,input);
      if(['provider','model','version'].some(key=>result.source[key]!==response.source[key]))throw new IndependentReviewIssue('invalid_review_response');
      return result;
    }catch(error){
      if(error instanceof IndependentReviewIssue)throw error;
      if(error.code==='quota_or_access_denied')throw new IndependentReviewIssue('quota_exceeded');
      if(['quota_unavailable','quota_not_configured'].includes(error.code))throw new IndependentReviewIssue('quota_unavailable');
      if(['provider_disabled','provider_configuration_changed','adapter_not_registered','paid_provider_blocked','unsupported_capability'].includes(error.code))throw new IndependentReviewIssue('review_not_configured');
      throw new IndependentReviewIssue(['cancelled','timeout'].includes(error.code)?error.code:'review_unavailable');
    }
  }});
  await service.linkCard(actors.dev,body({cardId:3,senseId:f.senseId}));
  await service.linkCard(actors.dev,body({cardId:4,senseId:f.senseId}));
  const bank=await service.createSense(actors.dev,body({cardId:2,meaning:{partOfSpeech:'noun',translation:'банк',definition:'An institution that keeps and lends money.'}}));
  const contexts=[
    {id:'weather',groupId:1,group:'A1 Monday',lessonId:1,lesson:'Weather',cardId:1,senseId:f.senseId,word:'drizzle',translation:'изморось',meaning:'Light rain in very small drops.',personal:false},
    {id:'money',groupId:2,group:'A2 Friday',lessonId:2,lesson:'Money',cardId:2,senseId:bank.senseId,word:'bank',translation:'банк',meaning:'An institution that keeps and lends money.',personal:false},
  ];
  const flip=await f.draft(actors.student,{type:'Flip',content:{explanation:'Drizzle means light rain.',items:[{front:'drizzle',back:'изморось'}]}});
  await service.submit(actors.student,flip.id,body({expectedRevision:1}));await service.approve(actors.teacher,flip.id,body({expectedRevision:2,checks}));
  const gap=await f.draft();await service.submit(actors.student,gap.id,body({expectedRevision:1}));
  for(const [options,answer] of [[['изморось','гроза','снег'],0],[['туман','изморось','град'],1]]){
    const q=await f.draft(actors.student,{type:'Choice',content:{explanation:'Drizzle is light rain, not a storm.',items:[{prompt:'What does drizzle mean?',options,answer}]}});await service.submit(actors.student,q.id,body({expectedRevision:1}));
  }
  const q=await service.createDraft(actors.other,body({groupId:2,lessonId:2,cardId:2,senseId:bank.senseId,type:'Type',content:{explanation:'A bank keeps money.',items:[{prompt:'банк',answer:'bank'}]}}));
  await service.submit(actors.other,q.id,body({expectedRevision:1}));
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try{
      const host='127.0.0.1:'+server.address().port;
      if(req.headers.host!==host)fail(403,'Loopback host required.');
      const path=new URL(req.url,'http://'+host).pathname;
      if(['GET','HEAD'].includes(req.method)&&files[path]){const [file,type]=files[path];res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:readFileSync(new URL('../'+file,import.meta.url)));return;}
      if(!path.startsWith('/local/'))fail(404,'Not found.');
      if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed.');
      if(req.method==='POST'&&req.headers.origin!=='http://'+host)fail(403,'Same-origin request required.');
      const role=/\bqr-preview=([a-z]+)(?:;|$)/.exec(req.headers.cookie||'')?.[1]||'teacher',actor=Object.hasOwn(actors,role)?actors[role]:null;
      if(!actor)fail(401,'Choose a test account.');
      if(path==='/local/session'&&req.method==='POST'){
        const data=await jsonBody(req);if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==1||!Object.hasOwn(actors,data.role))fail(400,'Unknown test account.');
        res.setHeader('Set-Cookie','qr-preview='+data.role+'; Path=/; HttpOnly; SameSite=Strict');send(200,{ok:true});return;
      }
      if(req.method==='GET'){
        if(path==='/local/review-quota'){
          if(!['ADMIN','DEVELOPER'].includes(actor.role))fail(403,'Teacher access required.');
          try{send(200,await quota.summary(actor,'local-fixture'));}catch{fail(503,'Request quota is unavailable.');}return;
        }
        if(path==='/local/providers'){if(actor.role!=='DEVELOPER')fail(403,'Developer access required.');send(200,await providers.inspect(actor));return;}
        if(path==='/local/providers/history'){
          if(actor.role!=='DEVELOPER')fail(403,'Developer access required.');
          const params=new URL(req.url,'http://'+host).searchParams,before=params.get('before');
          if([...params.keys()].some(key=>key!=='before')||params.getAll('before').length>1||before!==null&&!/^[1-9]\d*$/.test(before))fail(400,'Invalid provider history query.');
          try{send(200,await providers.history(actor,{before:before===null?null:Number(before)}));}
          catch(error){if(error.code==='invalid_request')fail(400,'Invalid provider history cursor.');throw error;}return;
        }
        if(path==='/local/quota'){if(actor.role!=='DEVELOPER')fail(403,'Developer access required.');send(200,await quota.inspect(actor,'local-fixture'));return;}
        if(path==='/local/quota/changes'){
          if(actor.role!=='DEVELOPER')fail(403,'Developer access required.');
          const params=new URL(req.url,'http://'+host).searchParams,before=params.get('before');
          if([...params.keys()].some(key=>key!=='before')||params.getAll('before').length>1||before!==null&&!/^[1-9]\d*$/.test(before))fail(400,'Invalid change history query.');
          try{send(200,await quota.changes(actor,'local-fixture',{before:before===null?null:Number(before)}));}
          catch(error){if(error.code==='invalid_request')fail(400,'Invalid change history cursor.');throw error;}
          return;
        }
        if(path==='/local/quota/history'){
          if(actor.role!=='DEVELOPER')fail(403,'Developer access required.');
          const params=new URL(req.url,'http://'+host).searchParams;
          if([...params.keys()].some(key=>key!=='cursor')||params.getAll('cursor').length>1)fail(400,'Invalid history query.');
          try{send(200,await quota.history(actor,'local-fixture',{cursor:params.get('cursor')||''}));}
          catch(error){if(error.code==='invalid_request')fail(400,'Invalid history cursor.');throw error;}
          return;
        }
        if(path==='/local/boot'){
          const available=[];for(const c of contexts){try{await service.checkContext(actor,c);available.push(c);}catch(error){if(error.status!==403)throw error;}}
          if(actor.role==='USER')available.push({...contexts[0],id:'personal',personal:true,groupId:null,lessonId:null,group:'Personal cards',lesson:'',cardId:actor.id==='u1'?3:4});
          send(200,{role,actor,roles:Object.entries(actors).map(([id,a])=>({id,name:a.name,role:a.role})),contexts:available});return;
        }
        if(path==='/local/mine'){send(200,{quizzes:await service.mine(actor)});return;}
        if(path==='/local/queue'){send(200,{quizzes:await service.queue(actor)});return;}
        if(path==='/local/generation'){send(200,{jobs:await generation.list(actor)});return;}
        const reviewHistory=/^\/local\/quizzes\/([a-f0-9-]{36})\/independent$/.exec(path);
        if(reviewHistory){
          const params=new URL(req.url,'http://'+host).searchParams;
          if([...params.keys()].some(key=>!['level','before','limit'].includes(key))||['level','before','limit'].some(key=>params.getAll(key).length>1)||
            ['before','limit'].some(key=>params.has(key)&&!/^[1-9]\d*$/.test(params.get(key))))fail(400,'Invalid review history query.');
          send(200,await independent.history(actor,reviewHistory[1],{level:params.get('level')||null,before:params.has('before')?Number(params.get('before')):null,limit:params.has('limit')?Number(params.get('limit')):10}));return;
        }
        const attempts=/^\/local\/generation\/([a-f0-9-]{36})\/attempts$/.exec(path);
        if(attempts){send(200,{attempts:await generation.attemptHistory(actor,attempts[1])});return;}
        const shared=/^\/local\/shared\/(\d+)$/.exec(path);if(shared){send(200,{quizzes:await service.sharedForCard(actor,Number(shared[1]))});return;}
        const get=/^\/local\/quizzes\/([a-f0-9-]{36})$/.exec(path);if(get){send(200,{quiz:await service.get(actor,get[1])});return;}
      }else{
        const data=await jsonBody(req);
        if(path==='/local/providers'){
          if(actor.role!=='DEVELOPER')fail(403,'Developer access required.');
          try{send(200,await providers.configure(actor,data));}
          catch(error){
            if(['configuration_conflict','provider_configuration_changed'].includes(error.code))fail(409,'Provider settings changed. Refresh and confirm the selection.');
            if(['invalid_configuration','invalid_selection','adapter_not_registered','paid_provider_blocked','unsupported_capability'].includes(error.code))fail(400,'Choose a registered compatible model and provide a reason.');
            if(error.code==='provider_configuration_unavailable')fail(503,'Provider settings are unavailable.');throw error;
          }return;
        }
        if(path==='/local/quota'){
          if(actor.role!=='DEVELOPER')fail(403,'Developer access required.');
          try{send(200,await quota.updateLimit(actor,'local-fixture',data));}
          catch(error){
            if(error.code==='invalid_request')fail(400,'Enter a whole request limit from 1 to 1000000 and a reason.');
            if(['quota_configuration_conflict','quota_mutation_conflict'].includes(error.code))fail(409,'Quota settings changed. Refresh before saving again.');
            throw error;
          }return;
        }
        if(path==='/local/quizzes'){send(201,await service.createDraft(actor,data));return;}
        if(path==='/local/generation'){send(202,await generation.enqueue(actor,data));return;}
        const runReview=/^\/local\/quizzes\/([a-f0-9-]{36})\/independent$/.exec(path);
        if(runReview){send(200,await independent.run(actor,runReview[1],data));return;}
        const retryReview=/^\/local\/quizzes\/([a-f0-9-]{36})\/independent\/([a-f0-9-]{36})\/retry$/.exec(path);
        if(retryReview){send(200,await independent.retry(actor,retryReview[1],retryReview[2],data));return;}
        const retry=/^\/local\/generation\/([a-f0-9-]{36})\/retry$/.exec(path);
        if(retry){send(200,await generation.retry(actor,retry[1],data));return;}
        const repair=/^\/local\/generation\/([a-f0-9-]{36})\/repair$/.exec(path);
        if(repair){send(201,await generation.repair(actor,repair[1],data));return;}
        const operation=/^\/local\/quizzes\/([a-f0-9-]{36})\/(edit|submit|return|approve|revise)$/.exec(path);
        if(operation){const methods={edit:'editDraft',submit:'submit',return:'requestChanges',approve:'approve',revise:'proposeRevision'};send(200,await service[methods[operation[2]]](actor,operation[1],data));return;}
      }
      fail(404,'Not found.');
    }catch(error){if(!res.headersSent)send(error.status||500,{error:error.status?error.message:'Local preview operation failed.'});else res.end();}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(error){f.close();throw error;}
  let processing=null,closing=false;
  const timer=setInterval(()=>{if(processing||closing)return;processing=generation.runOne().catch(()=>console.error('Local generation worker failed.')).finally(()=>{processing=null;});},200);timer.unref();
  server.once('close',()=>{closing=true;clearInterval(timer);if(processing)processing.finally(()=>f.close());else f.close();});
  return {server,url:'http://127.0.0.1:'+server.address().port};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const {server,url}=await createQuizReviewPreview({port:Number(process.env.PORT||0)});console.log('Quiz backend preview: '+url);
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(()=>process.exit(0)));
}
