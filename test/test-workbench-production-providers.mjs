import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
import {workbenchMigrationPlan} from '../ops/learning-workbench-migration-plan.mjs';
import {createWorkbenchRuntime,WORKBENCH_PRIVATE_BUCKET} from '../src/learning-workbench-runtime.mjs';
import {learningWorkbenchAPI,WORKBENCH_PREFIX} from '../src/learning-workbench-api.mjs';
import {LOCAL_LANGUAGE_RUBRIC} from '../ops/local-speech-provider.mjs';
import {AZURE_PRACTICE_RUBRIC} from '../ops/local-azure-preview-provider.mjs';
import {providerUIFactory,reviewEditorFactory} from '../ops/build-preview.mjs';
function pcm(){const bytes=Buffer.alloc(44+64000);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);return new Uint8Array(bytes);}
const pick=adapterId=>({adapterId,locale:'en-US',mode:'text'});
async function setup({network=true,writable=true}={}){
  const f=await fixture({d1:true,extendedLifecycle:true});
  for(const step of workbenchMigrationPlan().steps.slice(1))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8'));
  const objects=new Map(),calls=[],revoked=new Set();
  const bucket={put:async(key,bytes,options)=>{const row={bytes:bytes.slice(),size:bytes.length,...options};objects.set(key,row);return row;},get:async key=>{const row=objects.get(key);return row?{...row,body:new Blob([row.bytes]).stream()}:null;},head:async key=>objects.get(key),delete:async key=>objects.delete(key)};
  const env={LEARNING_WORKBENCH_ENABLED:'true',LEARNING_WORKBENCH_WRITES:'true',STAGE_WRITES:'true',WORKBENCH_STORAGE_APPROVED:'true',WORKBENCH_MEDIA_BUCKET:WORKBENCH_PRIVATE_BUCKET,WORKBENCH_MEDIA:bucket,
    LEARNING_PREPARATION_ENABLED:'true',LEARNING_SPEECH_ENABLED:'true',LEARNING_LANGUAGE_NETWORK:String(network),LEARNING_WORKBENCH_WORKER_ID:actors.dev.id,
    WORKBENCH_GEMINI_PROJECT:'fixture-project',WORKBENCH_GEMINI_KEY:'private-google-fixture',WORKBENCH_GEMINI_GENERATION_MODEL:'gemini-3.5-flash-lite',WORKBENCH_GEMINI_REVIEW_MODEL:'gemini-3.5-flash-lite',WORKBENCH_AZURE_RESOURCE:'fixture-speech',WORKBENCH_AZURE_REGION:'northeurope',WORKBENCH_AZURE_KEY:'private-azure-fixture',
    LEARNING_WORKBENCH_POLICY:JSON.stringify({version:1,revision:'test-only-v1',approved:true,language:{geminiGeneration:true,geminiReview:true,azure:true,freeTierVerified:true,allowDataProcessing:true,credentialRevision:'fixture-v1',termsRevision:'fixture-terms-v1'},speech:{rubrics:[AZURE_PRACTICE_RUBRIC],languageRubric:LOCAL_LANGUAGE_RUBRIC,budgets:{audio:{day:10,month:100},language:{day:5,month:20}}}})};
  const runtime=createWorkbenchRuntime({resolveActor:async(_,id)=>revoked.has(id)?null:Object.values(actors).find(row=>row.id===id),inspect:async()=>({kind:'audio',duration:2,width:0,height:0}),fetchImpl:async(url,init)=>{
    calls.push({url,init});
    if(url==='https://northeurope.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed')return Response.json({RecognitionStatus:'Success',NBest:[{Display:'drizzle',PronunciationAssessment:{AccuracyScore:90,FluencyScore:80}}]});
    assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    const payload=JSON.parse(init.body),input=JSON.parse(payload.contents[0].parts[0].text);
    const result=input.checked?{fingerprint:input.checked.fingerprint,revision:input.checked.revision,status:'reviewed',dimensions:Object.fromEntries(input.dimensions.map(key=>[key,key==='level'&&!input.checked.level?'not_assessed':'pass'])),findings:[]}:
      {type:input.type,meaning:input.meaning,content:{explanation:'The selected meaning is light rain.',items:[{front:input.meaning.en,back:input.meaning.translation}]}};
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(result)}]}}],usageMetadata:{promptTokenCount:20,candidatesTokenCount:30,totalTokenCount:50}});
  }});
  const services=await runtime.open({db:f.db,actor:actors.dev,env,writable});
  const api=async(path,data,actor=actors.dev)=>{
    const response=await learningWorkbenchAPI(new Request('https://example.test'+WORKBENCH_PREFIX+path,{method:data===undefined?'GET':'POST',headers:{origin:'https://example.test','content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(body(data))})}),{services,actor,writable});return response.json();
  };
  const allow=async(account,tasks)=>api('/settings/provider-access',{scope:account.scope,expectedRevision:account.access.revision,reason:'Synthetic contract test.',policy:{enabled:true,bindings:account.bindings,tasks,termsRevision:'fixture-terms-v1',dataProcessingApproved:true,noPaidOverageConfirmed:true,expiresAt:Date.now()+86400000,dailyRequests:10,dailyInputBytes:10000000,maxInputBytes:1000000}});
  return {...f,env,runtime,services,api,allow,calls,revoked};
}
test('production runtime exposes only safe registered accounts, requires explicit initialization and rejects staff settings writes',async()=>{
  const f=await setup();try{
    const data=await f.api('/settings/provider-access');assert.equal(data.initialized,false);assert.equal(data.accounts.length,2);assert.deepEqual(data.accounts.find(row=>row.provider==='google').tasks,['review','generation']);
    assert.ok(!JSON.stringify(data).includes('private-'));assert.equal(f.calls.length,0);
    for(const actor of [actors.student,actors.teacher])for(const [path,input] of [['/settings/provider-access',undefined],['/settings/providers/initialize',{}],['/settings/provider-budget',{provider:'google',requestLimit:5}]])await assert.rejects(f.api(path,input,actor),error=>error.status===403||error.code==='developer_required');
    await f.api('/settings/providers/initialize',{});const state=await f.api('/settings/providers');assert.ok(Object.values(state.selections).every(value=>value===null));
    const account=data.accounts[0];await assert.rejects(f.allow({...account,scope:'a'.repeat(64)},['generation']),error=>error.status===400);
    await assert.rejects(f.allow(account,['conversation']),error=>error.status===400);
    await assert.rejects(f.api('/settings/provider-budget',{provider:'unregistered',requestLimit:5}),error=>error.status===400);
    assert.equal(f.calls.length,0);
  }finally{await f.services.speech.close();await f.services.transcripts.close();f.close();}
});
test('production generation, independent review and global teacher approval share durable budgets without rewriting legacy quizzes',async()=>{
  const f=await setup();try{
    const before=JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all());await f.api('/settings/providers/initialize',{});
    await f.api('/settings/providers',{expectedRevision:1,selections:{generation:pick('gemini-quiz'),review:pick('gemini-quiz-review')},reason:'Synthetic integration.'});
    await f.api('/settings/provider-budget',{provider:'google',requestLimit:5});
    const google=(await f.api('/settings/provider-access')).accounts.find(row=>row.provider==='google');await f.allow(google,['generation','review']);
    await f.api('/kit/fill',{groupId:1,lessonId:1,cardId:1,senseId:f.senseId,types:['Flip']},actors.teacher);
    assert.equal(f.calls.length,0);await f.services.preparation.generation.runOne();
    const [job]=await f.services.preparation.generation.list(actors.teacher);assert.equal(job.state,'submitted');assert.equal(f.calls.length,1);
    assert.equal((await f.api('/proposals/'+job.versionId+'/checks')).attempts.length,0);
    const version=await f.services.review.get(actors.teacher,job.versionId);
    const checked=await f.api('/proposals/'+job.versionId+'/checks',{expectedRevision:version.revision,level:null},actors.outsider);
    assert.equal(checked.state,'completed');assert.equal(checked.result.requiresTeacherReview,true);assert.equal(checked.result.status,'incomplete');assert.equal(f.calls.length,2);
    const readOnly=await f.runtime.open({db:f.db,actor:actors.dev,env:f.env,writable:false});
    const changes=f.sql.prepare('SELECT total_changes() AS n').get().n;
    await learningWorkbenchAPI(new Request('https://example.test'+WORKBENCH_PREFIX+'/proposals/'+job.versionId+'/checks'),{actor:actors.outsider,services:readOnly});assert.equal(f.sql.prepare('SELECT total_changes() AS n').get().n,changes);
    assert.equal((await f.api('/settings/provider-access')).accounts.find(row=>row.provider==='google').quota.used,2);
    assert.equal((await f.api('/queue',undefined,actors.outsider)).quizzes[0].id,job.versionId);
    assert.deepEqual(await f.services.review.sharedForCard(actors.student,1),[]);
    await f.api('/proposals/'+job.versionId+'/approve',{expectedRevision:version.revision,checks:{meaning:true,answers:true,level:true}},actors.outsider);
    assert.equal((await f.services.review.sharedForCard(actors.student,1)).length,1);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM quizzes').all()),before);
    await f.api('/settings/provider-limit',{provider:'google',expectedRevision:1,requestLimit:2,reason:'Test exhausted budget.'});
    await assert.rejects(f.services.providers.execute('review',{}),error=>error.code==='quota_or_access_denied');assert.equal(f.calls.length,2);
    const reopened=await f.runtime.open({db:f.db,actor:actors.dev,env:f.env,writable:true});assert.equal((await reopened.providerSettings.inspect(actors.dev)).accounts.find(row=>row.provider==='google').quota.used,2);
  }finally{await f.services.speech.close();await f.services.transcripts.close();f.close();}
});
test('regional Azure results stay private, provisional and separate from quiz approvals and student grades',async()=>{
  const f=await setup();try{
    await f.api('/settings/providers/initialize',{});await f.api('/settings/providers',{expectedRevision:1,selections:{pronunciation:{adapterId:'azure-pronunciation',locale:'en-US',mode:'scripted'}},reason:'Synthetic pronunciation.'});
    const azure=(await f.api('/settings/provider-access')).accounts.find(row=>row.provider==='microsoft-azure');await f.allow(azure,['pronunciation']);
    const speech=f.services.speech,context={groupId:1,lessonId:1,cardId:1,senseId:f.senseId};
    const task=await speech.createTask(actors.teacher,body({...context,mode:'pronunciation',locale:'en-US',prompt:'Read drizzle.',reference:'drizzle',referenceMediaId:null,rubricId:AZURE_PRACTICE_RUBRIC.id,evaluation:'pronunciation',languageReview:false,level:null}));
    const bytes=pcm(),upload=await speech.upload(actors.student,task.id,body({mime:'audio/wav',name:'private.wav'}),bytes);
    await assert.rejects(speech.analyze(actors.student,task.id,body({mediaId:upload.id,consent:false})));assert.equal(f.calls.length,0);
    const attempt=await speech.analyze(actors.student,task.id,body({mediaId:upload.id,consent:true})),result=await speech.get(actors.student,attempt.id);
    assert.equal(result.state,'complete');assert.equal(result.result.overall,86);assert.equal(result.result.scores.prosody,null);assert.equal(result.result.provisional,true);
    await assert.rejects(speech.get(actors.other,attempt.id),error=>[403,404].includes(error.status));
    assert.equal(f.calls.length,1);assert.ok(!JSON.stringify(result).includes('private-azure-fixture'));
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM qr_versions WHERE state='approved'").get().n,0);
  }finally{await f.services.speech.close();await f.services.transcripts.close();f.close();}
});
test('network-off, read-only and revoked caller gates never dispatch transports',async()=>{
  for(const mode of ['network','writes','revoked']){const f=await setup({network:mode!=='network',writable:mode!=='writes'});try{
    if(mode==='writes'){await assert.rejects(f.api('/settings/provider-budget',{provider:'google',requestLimit:5}),error=>error.status===503);continue;}
    await f.api('/settings/providers/initialize',{});await f.api('/settings/providers',{expectedRevision:1,selections:{review:pick('gemini-quiz-review')},reason:'Test closed gate.'});
    await f.api('/settings/provider-budget',{provider:'google',requestLimit:5});const google=(await f.api('/settings/provider-access')).accounts.find(row=>row.provider==='google');await f.allow(google,['review']);
    if(mode==='revoked')f.revoked.add(actors.dev.id);
    await assert.rejects(f.services.providers.execute('review',{}));assert.equal(f.calls.length,0);
  }finally{await f.services.speech.close();await f.services.transcripts.close();f.close();}}
});
test('main developer UI manages real-provider selections, budgets and approvals without dispatching AI',async()=>{
  const {createServer}=await import('node:http'),{once}=await import('node:events'),{createRequire}=await import('node:module');
  const {chromium}=createRequire(import.meta.url)('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const f=await setup();let server,browser,actor=actors.dev;
  try{
    const script=`window.authUser=${JSON.stringify(actors.dev)};window.accountReady=true;window.viewAccount=null;window.viewSwitching=false;window.viewGen=1;window.lmState={};window.classGroups=[];window.esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.LearningMain={capabilities:()=>({learningWorkbench:true}),fetch:async(path,options={})=>{const response=await fetch(path,{headers:{'Content-Type':'application/json'},...options});const data=await response.json();if(!response.ok)throw Error(data.error);return data;}};${readFileSync(new URL('../client/52a-workbench.js',import.meta.url),'utf8')}\nLearningWorkbench.reset();`;
    server=createServer(async(req,res)=>{
      try{
        const origin='http://127.0.0.1:'+server.address().port;
        if(req.url==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><aside class="side"><nav></nav></aside><section class="on" id="material"></section><nav class="tabbar"></nav><script src="/test.js"></script>');return;}
        if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(readFileSync(new URL('../site/preview.css',import.meta.url),'utf8')+readFileSync(new URL('../site/main-stage.css',import.meta.url),'utf8'));return;}
        if(req.url==='/test.js'){res.setHeader('content-type','text/javascript');res.end(providerUIFactory()+reviewEditorFactory()+script);return;}
        if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const response=await learningWorkbenchAPI(new Request(origin+req.url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),{actor,services:f.services,writable:true});
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
      }catch(error){res.writeHead(error.status||400,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
    });server.listen(0,'127.0.0.1');await once(server,'listening');
    browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-workbench-providers]:visible').click();
    await page.getByRole('button',{name:'Initialize providers',exact:true}).click();await page.locator('#provider-generation').waitFor();
    await page.selectOption('#provider-generation','0');await page.locator('#provider-reason').fill('Contract test.');await page.getByRole('button',{name:'Save settings',exact:true}).click();
    await page.getByText('Provider settings saved.',{exact:true}).waitFor();assert.equal((await f.api('/settings/providers')).selections.generation.adapterId,'gemini-quiz');
    const google=page.locator('.provider-access').filter({hasText:'gemini-3.5-flash-lite'});await google.locator('summary').click();
    await google.locator('[name=enabled]').check();await google.locator('[name=termsRevision]').fill('fixture-terms-v1');await google.locator('[name=tasks][value=generation]').check();
    await google.locator('[name=dataProcessingApproved]').check();await google.locator('[name=noPaidOverageConfirmed]').check();await google.locator('[data-workbench-provider-access] [name=reason]').fill('Approved fixture data.');
    await google.getByRole('button',{name:'Save access policy',exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.provider-access summary')].some(node=>node.textContent==='google · Enabled'));
    await google.locator('summary').click();await google.locator('[data-workbench-provider-budget] [name=requestLimit]').fill('5');await google.getByRole('button',{name:'Initialize budget',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-workbench-provider-budget=google] button')?.textContent==='Update budget');
    await page.getByRole('button',{name:'Initialize independent review',exact:true}).click();await page.locator('[data-workbench-provider-pipeline]').waitFor();
    await page.locator('[data-workbench-provider-pipeline] [name=enabled]').check();await page.locator('[data-workbench-provider-pipeline] [name=reason]').fill('Fixture only.');await page.getByRole('button',{name:'Save review settings',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-workbench-provider-pipeline] [name=reason]')?.value==='');assert.equal((await f.services.pipeline.settings(actors.dev)).enabled,true);
    assert.equal(await page.locator('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
    assert.equal(f.calls.length,0);assert.equal((await f.api('/settings/provider-access')).accounts.find(row=>row.provider==='google').quota.requestLimit,5);
    await page.locator('[data-workbench-close]').click();actor=actors.teacher;await page.evaluate(()=>{authUser={id:'teacher',role:'ADMIN'};viewGen++;LearningWorkbench.reset();});assert.equal(await page.locator('[data-workbench-providers]:visible').count(),0);
    await f.api('/settings/providers',{expectedRevision:2,selections:{review:pick('gemini-quiz-review')},reason:'Fixture review only.'});
    await f.allow((await f.api('/settings/provider-access')).accounts.find(row=>row.provider==='google'),['generation','review']);
    const draft=await f.draft();await f.service.submit(actors.student,draft.id,body({expectedRevision:1}));
    actor=actors.outsider;await page.evaluate(()=>{authUser={id:'outsider',role:'ADMIN'};viewGen++;LearningWorkbench.reset();});await page.locator('[data-workbench-queue]:visible').click();
    const row=page.locator('[data-review-key="version-'+draft.id+'"]');await row.waitFor({state:'attached'});await row.evaluate(node=>{for(let parent=node;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;node.querySelector('details').open=true;});
    await row.getByRole('button',{name:'Review history',exact:true}).click();await row.getByText('No AI reviews.',{exact:true}).waitFor();
    await row.getByRole('button',{name:'Request AI review',exact:true}).click();await row.getByText(/completed · incomplete/).waitFor();
    assert.equal(f.calls.length,1);assert.equal((await f.services.review.get(actors.teacher,draft.id)).state,'submitted');
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await f.services.speech.close();await f.services.transcripts.close();f.close();}
});
