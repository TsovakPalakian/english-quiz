import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
import {workbenchMigrationPlan} from '../ops/learning-workbench-migration-plan.mjs';
import {createLearningWorkbenchFactory} from '../src/learning-workbench-services.mjs';
import {learningWorkbenchAPI} from '../src/learning-workbench-api.mjs';
import {bundleSource} from '../ops/build-preview.mjs';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
test('main-app workbench stays opt-in, selects meanings and runs approved practice without replacing Study',async()=>{
  const f=await fixture({d1:true,extendedLifecycle:true});let server,browser,writable=true;
  try{
    for(const step of workbenchMigrationPlan().steps.slice(1))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8'));
    const second=await f.service.createSense(actors.dev,body({cardId:1,meaning:{partOfSpeech:'verb',translation:'pour',definition:'Pour a little liquid.'}}));
    const q=await f.draft();await f.service.submit(actors.student,q.id,body({expectedRevision:1}));await f.service.approve(actors.teacher,q.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true}}));
    const services=await createLearningWorkbenchFactory({inspect:async()=>{throw Error('No media expected.');}})({db:f.db,actor:actors.student});
    const component=readFileSync(new URL('../client/52a-workbench.js',import.meta.url),'utf8'),lessonSource=readFileSync(new URL('../client/52-lessons.js',import.meta.url),'utf8');
    const lesson=lessonSource.slice(lessonSource.indexOf('    function lmWordCardHtml('),lessonSource.indexOf('    function lmRuleCardHtml('));
    assert.ok(bundleSource('preview.js').includes(component));
    const script=`window.authUser={id:'u1',role:'USER'};window.accountReady=true;window.viewAccount=null;window.viewSwitching=false;window.viewGen=1;window.lmState={id:1,blocks:[{id:1,stageId:1,word:'drizzle'}]};window.classGroups=[{id:1,title:'A1 Monday',lessonIds:[1]},{id:2,title:'A2 Friday',lessonIds:[1]}];let flag=false;window.esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.wordPic=()=>'';window.ipaHtml=()=>'';window.examStudentRestricted=()=>false;window.LearningMain={capabilities:()=>flag?{learningWorkbench:true}:{},fetch:async(path,options={})=>{const response=await fetch(path,{headers:{'Content-Type':'application/json'},...options});const data=await response.json();if(!response.ok)throw Error(data.error);return data;}};${component}\n${lesson}\nwindow.paint=()=>{document.querySelector('#lesson').innerHTML=lmWordCardHtml(lmState.blocks[0]);document.querySelector('#personal').innerHTML=LearningWorkbench.cardButton({stageId:1,word:'drizzle'});};window.toggle=value=>{flag=value;paint();};paint();`;
    server=createServer(async(req,res)=>{
      try{
        const origin='http://127.0.0.1:'+server.address().port;
        if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><section class="on" id="material"><div id="lesson"></div><div id="personal"></div><button id="old-study">Study</button></section><script src="/test.js"></script>');return;}
        if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(readFileSync(new URL('../site/preview.css',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../site/main-stage.css',import.meta.url),'utf8'));return;}
        if(req.url==='/test.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(script);return;}
        if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const response=await learningWorkbenchAPI(new Request(origin+req.url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),{actor:actors.student,services,writable});
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
      }catch(error){res.writeHead(error.status||500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
    });server.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    await page.goto(url);assert.equal(await page.locator('[data-workbench-lesson]').count(),0);assert.ok(!requests.some(path=>path.includes('/api/learning-workbench')));
    await page.evaluate(()=>toggle(true));await page.locator('[data-workbench-lesson]').click();await page.locator('[data-workbench-group]').waitFor();
    assert.ok(!requests.some(path=>path.includes('/kit?')));await page.selectOption('[data-workbench-group]','1');await page.locator('[data-workbench-sense]').waitFor();
    assert.match(await page.locator('[data-workbench-body]').innerText(),/No meaning selected/);
    await page.selectOption('[data-workbench-sense]',second.senseId);await page.getByRole('heading',{name:'0 / 17 types ready'}).waitFor();
    await page.selectOption('[data-workbench-sense]',f.senseId);await page.getByRole('heading',{name:'1 / 17 types ready'}).waitFor();
    const variant=page.locator('[data-workbench-practice]');await variant.evaluate(node=>node.closest('details').open=true);await variant.click();
    await page.locator('[data-workbench-answers]').waitFor();assert.equal(await page.locator('[data-workbench-body]').getByText('Drizzle means light rain in this context.',{exact:true}).count(),0);
    await page.locator('[name=answer-0]').fill('drizzle');await page.getByRole('button',{name:'Check answers',exact:true}).click();
    await page.getByRole('heading',{name:'Gap · 1 / 1'}).waitFor({timeout:5000}).catch(async error=>{throw new Error(error.message+'\n'+await page.locator('dialog').innerText()+'\n'+JSON.stringify(errors));});
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_session_snapshots').get().n,1);
    await page.screenshot({path:'/private/tmp/lumiscia-main-kit-desktop.png'});await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);await page.screenshot({path:'/private/tmp/lumiscia-main-kit-mobile.png'});
    await page.evaluate(()=>{viewAccount={id:'u2'};document.body.classList.add('viewing');});await page.locator('dialog').waitFor({state:'detached'});
    await page.evaluate(()=>{viewAccount=null;paint();});writable=false;await page.locator('[data-workbench-card]').click();await page.locator('[data-workbench-sense]').waitFor();
    await page.selectOption('[data-workbench-sense]',f.senseId);await page.getByText('Read-only. New practice sessions are disabled.',{exact:true}).waitFor();assert.equal(await page.locator('[data-workbench-practice]').isDisabled(),true);
    await page.evaluate(()=>document.dispatchEvent(new Event('learning-workbench-session')));await page.locator('dialog').waitFor({state:'detached'});
    assert.equal(await page.locator('#old-study').innerText(),'Study');assert.equal(f.sql.prepare('SELECT count(*) AS n FROM quizzes').get().n,1);
    assert.deepEqual(errors,[]);assert.ok(requests.every(path=>path.startsWith(url)));
  }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));f.close();}
});
