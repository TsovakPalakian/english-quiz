import {lessonPdfFixture} from './lesson-pdf-fixture.mjs';
import {lessonPdfExerciseFeedback} from '../src/lesson-pdf-feedback.mjs';
// Browser UI against isolated in-memory lesson/media APIs. No production writes or screenshots.
// PDF_UI_FILE + PDF_UI_LIVE=1 opt into one real Gemini analysis; credentials stay server-side.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,basename,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import {parseLessonPdfMeta,normalizeLessonPdfDraft} from '../src/lesson-pdf-meta.mjs';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";
await scenarioSubtests("lesson-pdf-ui",async function*(){
yield "00. Browser and fixture setup";

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||resolveTestDependency('playwright'));
const live=process.env.PDF_UI_LIVE==='1';
if(live&&!process.env.PDF_UI_FILE)throw Error('PDF_UI_FILE is required for live analysis.');
const fileName=process.env.PDF_UI_FILE?basename(process.env.PDF_UI_FILE):'fixture.pdf';
const pdf=process.env.PDF_UI_FILE?readFileSync(process.env.PDF_UI_FILE):Buffer.from('%PDF-1.4\n% isolated UI fixture\n');
const source={pages:[1],generated:false};
const fixture=lessonPdfFixture();fixture.words.push({...fixture.words[0],meaning:'an expression of surprise',example:'Hello! What is happening here?'});
const root=resolve('rollback/production-assets');
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromiumExecutable()});
  const page=await browser.newPage(),errors=[],findings=[];
  const user={id:'a'.repeat(32),login:'pdf_ui_test',name:'PDF UI test',email:'pdf@example.invalid',role:'DEVELOPER'};
  let nextId=100,analysed=null,analysisCalls=0,uploads=0,role='DEVELOPER',imports=0;const responses=new Map();
  const lesson={id:31,stageRevision:1,title:'PDF UI draft',description:'',className:'A1',unit:'',lesson:'',date:'2026-10-25',published:false,mode:'edit',blocks:[{id:32,stageBlockRevision:1,type:'text',tab:'homework',html:'<p>Teacher homework — keep unchanged</p>'}]};
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('app-database-context-v1','d1:1'));
  // Production assets require their configured hostname for media. This virtual origin
  // is entirely fulfilled locally: no browser requests reach the production domain.
  await page.route('**/*',async route=>{
    const path=new URL(route.request().url()).pathname,file=resolve(root,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(root+'/')||!existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream',body:readFileSync(file)});
  });
  yield "01. route";
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
    const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    try{
      if(path==='/api/lessons/parse-pdf'){
        assert.equal(method,'POST');assert.deepEqual(request.postDataBuffer(),pdf);
        if(!analysed){
          const cache=live&&process.env.PDF_UI_CACHE;
          const sha=createHash('sha256').update(pdf).digest('hex');
          if(cache&&existsSync(cache)){const saved=JSON.parse(readFileSync(cache,'utf8'));assert.equal(saved.sha,sha);if(saved.version===2)analysed=normalizeLessonPdfDraft(saved.draft);}
          if(!analysed){analysisCalls++;analysed=live?await parseLessonPdfMeta({bytes:pdf,full:true,apiKey:process.env.GEMINI_API_KEY,model:process.env.PDF_UI_MODEL||'gemini-3.5-flash-lite',timeoutMs:60000}):normalizeLessonPdfDraft(fixture);if(cache)writeFileSync(cache,JSON.stringify({version:2,sha,draft:analysed}),{mode:0o600});}
        }
        const reply=structuredClone(analysed);
        if(imports++)for(const tab of ['words','phrases','rules'])reply[tab].reverse();
        return respond(reply);
      }
      const answerPath=path.match(/^\/api\/lessons\/31\/blocks\/(\d+)\/response$/);
      if(answerPath&&method==='PUT'){
        const block=lesson.blocks.find(b=>b.id===Number(answerPath[1])),body=request.postDataJSON(),old=responses.get(block.id);
        assert.equal(body.expectedBlockRevision,block.stageBlockRevision);assert.equal(body.expectedRevision,old?.revision||0);
        const response=structuredClone(body.response);
        if(response.checked)for(const [i,item] of response.items.entries()){item.marked=true;item.correct=item.picked===block.items[i].answer;}
        const saved={response,revision:body.expectedRevision+1,blockRevision:block.stageBlockRevision};responses.set(block.id,saved);
        return respond({lessonId:31,blockId:block.id,response,revision:saved.revision,...(response.checked?{feedback:lessonPdfExerciseFeedback(block.type,block)}:{})});
      }
      const upload=path.match(/^\/api\/lessons\/31\/blocks\/(\d+)\/media$/);
      if(upload){
        assert.deepEqual(request.postDataBuffer(),pdf);uploads++;
        const block=lesson.blocks.find(b=>b.id===Number(upload[1]));assert.ok(block);
        const content=Object.fromEntries(Object.entries(block).filter(([k])=>!['id','type','tab','stageBlockRevision','stageDefinition'].includes(k)));
        Object.assign(content,{hasFile:true,name:fileName,fileType:'application/pdf',fileId:'sf_pdf_ui',size:String(pdf.length)});
        Object.assign(block,content);block.stageBlockRevision++;lesson.stageRevision++;
        return respond({revision:lesson.stageRevision,block:{id:block.id,revision:block.stageBlockRevision,content}});
      }
      if(path==='/api/lessons/31'&&method==='PATCH'){
        const body=request.postDataJSON();assert.equal(body.expectedRevision,lesson.stageRevision);
        Object.assign(lesson,body.changes);
        for(const item of body.upserts||[]){
          let block=lesson.blocks.find(b=>b.id===item.id);
          if(block){assert.equal(item.expectedRevision,block.stageBlockRevision);Object.assign(block,item.content);block.stageBlockRevision++;}
          else{block={...item.content,id:++nextId,type:item.type,tab:item.tab,stageBlockRevision:1};lesson.blocks.push(block);}
        }
        assert.equal((body.deletes||[]).length,0);lesson.stageRevision++;
        return respond({id:31,revision:lesson.stageRevision,blocks:lesson.blocks.map(b=>({id:b.id,revision:b.stageBlockRevision}))});
      }
      if(path==='/api/database-context')return respond({provider:'d1',revision:1,scope:'site'});
      if(path==='/api/me'||path==='/api/me/account')return respond({user:{...user,role},locked:false});
      if(path==='/api/me/themes')return respond({accountId:user.id,theme:'light',themes:[],stageThemeRevision:0,stageCustomRevision:0});
      if(path==='/api/me/state')return respond({bootstrap:true,stats:{theme:'light'},added:[],songs:[],settings:{},counts:{lessons:1},stageActivity:{}});
      if(path==='/api/lessons'){
        const view=structuredClone(lesson);
        if(role==='USER')for(const block of view.blocks){
          const feedback=lessonPdfExerciseFeedback(block.type,block),saved=responses.get(block.id);
          delete block.pdfTeacherNotes;delete block.pdfFeedback;block.stageResponseRevision=saved?.revision||0;
          if(saved?.blockRevision===block.stageBlockRevision){
            for(const [i,item] of (saved.response.items||[]).entries())Object.assign(block.items[i],item);
            if(saved.response.checked)block.pdfFeedback=feedback;
          }
        }
        return respond({materials:[view]});
      }
      if(path==='/api/groups')return respond({groups:[{id:41,title:'PDF UI group',revision:1,lessonIds:[31],examIds:[]}]});
      if(path==='/api/admin/users')return respond({users:[user]});
      return respond({cards:[],groups:[],members:[],assignments:[],exams:[],work:[],documents:{},rooms:[],contacts:[],registrations:[],items:[],songs:[],texts:[],next:null,total:0});
    }catch(error){return respond({error:error.message},error.status||500);}
  });
  await page.goto('https://lumiscia.org/');
  await page.waitForFunction(()=>typeof lmOpenLesson==='function'&&accountReady&&authUser?.role==='DEVELOPER');
  await page.evaluate(()=>lmOpenLesson(31));
  yield "02. #material.on / checks";
  await page.locator('#material.on').waitFor();
  const homework=JSON.stringify(lesson.blocks[0]);
  const importPdf=async()=>{
    await page.locator('[data-lesson-pdf-import-file]').setInputFiles({name:fileName,mimeType:'application/pdf',buffer:pdf});
    await page.waitForFunction(()=>document.querySelector('#lmPdfDraftDialog[open]')||document.querySelector('#lmPdfImportStatus.bad'),{},{timeout:75000});
    assert.equal(await page.locator('#lmPdfDraftDialog[open]').count(),1,await page.locator('#lmPdfImportStatus').textContent());
  };
  await importPdf();
  const dialog=page.locator('#lmPdfDraftDialog');assert.equal(await dialog.locator('details').count(),7);
  assert.equal(lesson.blocks.length,1,'Preview must not write lesson content');
  await dialog.locator('details').first().locator('input').check();
  yield "03. click";
  await dialog.getByRole('button',{name:'Apply selected sections to draft'}).click();
  await page.waitForFunction(()=>!document.querySelector('#lmPdfDraftDialog')||document.querySelector('#lmPdfDraftDialog [role=status]')?.classList.contains('bad'));
  const remainingDialogs=await dialog.count();
  const applyError=remainingDialogs?await dialog.locator('[role=status]').textContent():'';
  assert.equal(remainingDialogs,0,applyError);
  assert.equal(lesson.title,analysed.title);assert.equal(lesson.published,false);
  assert.equal(JSON.stringify(lesson.blocks[0]),homework);
  assert.equal(uploads,1);assert.ok(lesson.blocks.some(b=>b.tab==='pdf'&&b.hasFile));
  for(const section of ['overview','words','phrases','rules','classwork'])if(section==='overview'||analysed[section]?.length)assert.ok(lesson.blocks.some(b=>b.tab===section),'Missing section '+section);
  assert.deepEqual([...new Set(lesson.blocks.filter(b=>b.tab==='classwork').map(b=>b.pdfImport.stage))],['explanation','comprehension','guided','independent','final']);
  if(!live)assert.equal(lesson.blocks.filter(b=>b.tab==='words').length,2,'Both contextual meanings must be visible in the imported lesson');
  const rule=lesson.blocks.find(b=>b.tab==='rules');
  if(rule){
    await page.locator('[data-lm-tab="rules"]:visible').first().click();
    await page.locator('[data-rich="'+rule.id+'"]:visible').fill('Teacher correction — preserve this explanation');
    await page.locator('[data-lm-tab="overview"]:visible').first().click();
  }
  const count=lesson.blocks.length;
  yield "04. checks";
  await importPdf();await dialog.getByRole('button',{name:'Apply selected sections to draft'}).click();
  await page.waitForFunction(()=>!document.querySelector('#lmPdfDraftDialog'));
  assert.equal(lesson.blocks.length,count);assert.equal(uploads,1);assert.ok(analysisCalls<=1);
  if(rule)assert.match(rule.html,/Teacher correction/);
  await page.reload();
    yield "05. waitForFunction";
    await page.waitForFunction(()=>accountReady&&typeof lmOpenLesson==='function');await page.evaluate(()=>lmOpenLesson(31));
  const restored=await page.evaluate(()=>({title:lmState.title,blocks:lmState.blocks.length,homework:lmState.blocks.find(b=>b.tab==='homework')?.html}));
  assert.equal(restored.title,analysed.title);assert.equal(restored.blocks,count);assert.match(restored.homework,/keep unchanged/);
  yield '06. Learner feedback is private before checking';
  role='USER';lesson.published=true;
  await page.reload();await page.waitForFunction(()=>accountReady&&authUser?.role==='USER');await page.evaluate(()=>lmOpenLesson(31));
  await page.locator('[data-lm-tab="classwork"]:visible').first().click();
  const exercise=lesson.blocks.find(b=>b.type==='exercise'&&b.pdfTeacherNotes);assert.ok(exercise);
  const hidden=await page.evaluate(id=>JSON.stringify(lmState.blocks.find(b=>b.id===id)),exercise.id);assert.ok(!hidden.includes(exercise.pdfTeacherNotes));
  assert.equal(await page.locator('[data-pdf-feedback]').count(),0);
  const radios=page.locator('#material [data-pick^="'+exercise.id+':"]'),check=page.locator('[data-ex-check="'+exercise.id+'"]');
  await radios.nth((exercise.items[0].answer+1)%exercise.items[0].options.length).check();
  await check.click();
  await page.waitForFunction(({id,text})=>document.querySelector('[data-pdf-feedback="'+id+'"]')?.textContent===text,{id:exercise.id,text:exercise.pdfTeacherNotes});
  assert.equal(responses.get(exercise.id).response.items[0].correct,false);
  yield '07. Feedback clears on edit and returns after correct answer';
  await radios.nth(exercise.items[0].answer).check();assert.equal(await page.locator('[data-pdf-feedback]').count(),0);
  await check.click();await page.waitForFunction(id=>lmState.blocks.find(b=>b.id===id)?.items[0].correct===true,exercise.id);
  assert.equal(await page.locator('[data-pdf-feedback="'+exercise.id+'"]').textContent(),exercise.pdfTeacherNotes);
  yield '08. Checked feedback survives reload without revealing open-task samples';
  await page.reload();await page.waitForFunction(()=>accountReady&&authUser?.role==='USER');await page.evaluate(()=>lmOpenLesson(31));await page.locator('[data-lm-tab="classwork"]:visible').first().click();
  assert.equal(await page.locator('[data-pdf-feedback="'+exercise.id+'"]').textContent(),exercise.pdfTeacherNotes);
  const studentBlocks=await page.evaluate(()=>lmState.blocks);
  for(const task of studentBlocks.filter(b=>b.type==='task')){assert.equal(task.pdfTeacherNotes,undefined);assert.equal(task.pdfFeedback,undefined);}
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ui:'passed',file:fileName,sha256:createHash('sha256').update(pdf).digest('hex'),analysis:live?'real Gemini':'synthetic fixture',storage:'isolated in-memory API, not real D1/R2',blocks:count,uploads,findings}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

});
