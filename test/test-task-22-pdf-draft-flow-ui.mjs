import {lessonPdfFixture} from './lesson-pdf-fixture.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,basename,extname} from 'node:path';
import {createRequire} from 'node:module';
import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import {normalizeLessonPdfDraft} from '../src/lesson-pdf-meta.mjs';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";

await scenarioSubtests("task-22-pdf-draft-flow-ui", async function*(){
  yield "00. Browser and test server setup";

  const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||resolveTestDependency('playwright'));
  const fixture=lessonPdfFixture({practice:true});
  fixture.words.push({...fixture.words[0],meaning:'an expression of surprise',example:'Hello! What is happening here?'});
  fixture.rules.push({...fixture.rules[0],title:'Noun',explanation:'Names identify people.'});
  const root=resolve('rollback/production-assets');
  const server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream');
    res.end(readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser, page;

  try {
    browser=await launchChromium(chromium);
    page=await browser.newPage();
    const errors=[];
    let analysed=normalizeLessonPdfDraft(fixture);
    let nextId=100;
    const user={id:'a'.repeat(32),login:'pdf_ui_test',name:'PDF UI test',email:'pdf@example.invalid',role:'DEVELOPER'};
    const dictionaryCards=new Map();
    const lesson={id:31,stageRevision:1,title:'Original Draft Title',description:'Existing description',className:'B2',unit:'3',lesson:'1',date:'2026-11-09',published:false,mode:'edit',blocks:[{id:32,stageBlockRevision:1,type:'text',tab:'homework',html:'<p>Teacher homework</p>'}]};

    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('app-database-context-v1','d1:1'));

    await page.route('**/*',async route=>{
      const path=new URL(route.request().url()).pathname,file=resolve(root,'.'+(path==='/'?'/index.html':path));
      if(!file.startsWith(root+'/')||!existsSync(file))return route.fulfill({status:404,body:''});
      return route.fulfill({contentType:({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream',body:readFileSync(file)});
    });

    await page.route('**/api/**',async route=>{
      const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
      const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      try {
        if(path==='/api/lessons/parse-pdf'){
          return respond(structuredClone(analysed));
        }
        if(path==='/api/database-context')return respond({provider:'d1',revision:1,scope:'site'});
        if(path==='/api/me'||path==='/api/me/account')return respond({user,locked:false});
        if(path==='/api/me/themes')return respond({accountId:user.id,theme:'light',themes:[],stageThemeRevision:0,stageCustomRevision:0});
        if(path==='/api/me/state')return respond({bootstrap:true,stats:{theme:'light'},added:[],songs:[],settings:{},counts:{lessons:1},stageActivity:{}});
        if(path==='/api/catalogs/GRAMMAR')return respond({document:{topics:[],comparisons:[]}});
        if(path==='/api/stats/event')return respond({saved:true});
        if(path==='/api/cards/lookup'){
          const body=request.postDataJSON();
          const key=JSON.stringify([body.word,body.context?.meaning||'']);
          if(!dictionaryCards.has(key))dictionaryCards.set(key,{id:++nextId,en:body.word,ru:body.context?.translation||'перевод',stageScope:'shared',data:{cambridge:{definition:body.context?.meaning||''}},pdfSense:body.context});
          return respond(dictionaryCards.get(key));
        }
        const dictionaryPath=path.match(/^\/api\/cards\/(\d+)\/dictionary$/);
        if(dictionaryPath)return respond([...dictionaryCards.values()].find(card=>card.id===Number(dictionaryPath[1])));
        const upload=path.match(/^\/api\/lessons\/31\/blocks\/(\d+)\/media$/);
        if(upload){
          const block=lesson.blocks.find(b=>b.id===Number(upload[1]));assert.ok(block);
          const content=Object.fromEntries(Object.entries(block).filter(([k])=>!['id','type','tab','stageBlockRevision','stageDefinition'].includes(k)));
          Object.assign(content,{hasFile:true,name:'fixture.pdf',fileType:'application/pdf',fileId:'sf_pdf_ui',size:String(100)});
          Object.assign(block,content);block.stageBlockRevision++;lesson.stageRevision++;
          return respond({revision:lesson.stageRevision,block:{id:block.id,revision:block.stageBlockRevision,content}});
        }
        if(path==='/api/messages/pdf-grammar'){
          return respond({sent:1});
        }
        if(path==='/api/lessons/31'&&method==='GET')return respond(lesson);
        if(path==='/api/lessons/31'&&method==='PATCH'){
          const body=request.postDataJSON();assert.equal(body.expectedRevision,lesson.stageRevision);
          Object.assign(lesson,body.changes);
          for(const item of body.upserts||[]){
            let block=lesson.blocks.find(b=>b.id===item.id);
            if(block){assert.equal(item.expectedRevision,block.stageBlockRevision);Object.assign(block,item.content);block.stageBlockRevision++;}
            else{block={...item.content,id:++nextId,type:item.type,tab:item.tab,stageBlockRevision:1,stageDefinition:{type:item.type,tab:item.tab,cardId:item.cardId,content:item.content}};if(item.cardId)Object.assign(block,[...dictionaryCards.values()].find(card=>card.id===item.cardId),{id:block.id,word:[...dictionaryCards.values()].find(card=>card.id===item.cardId).en,stageId:item.cardId});lesson.blocks.push(block);}
          }
          assert.equal((body.deletes||[]).length,0);lesson.stageRevision++;
          return respond({id:31,revision:lesson.stageRevision,blocks:lesson.blocks.map(b=>({id:b.id,revision:b.stageBlockRevision}))});
        }
        if(path==='/api/lessons'){
          return respond({materials:[lesson]});
        }
        if(path==='/api/groups')return respond({groups:[{id:41,title:'PDF UI group',revision:1,lessonIds:[31],examIds:[]}]});
        if(path==='/api/admin/users')return respond({users:[user]});
        return respond({cards:[],groups:[],members:[],assignments:[],exams:[],work:[],documents:{},rooms:[],contacts:[],registrations:[],items:[],songs:[],texts:[],next:null,total:0});
      } catch(err){
        return route.fulfill({status:500,body:err.message});
      }
    });

    yield "01. Open material editor and trigger PDF analysis";
    await page.goto('https://lumiscia.org/');
    await page.waitForFunction(()=>typeof lmOpenLesson==='function'&&accountReady&&authUser?.role==='DEVELOPER');
    await page.evaluate(async()=>{await stagePullLessons();await groupPull(true);lmOpenLesson(31);});
    await page.locator('#material.on').waitFor();

    const importPdf=async()=>{
      await page.locator('[data-lesson-pdf-import-file]').evaluate(el=>el.value='');
      await page.locator('[data-lesson-pdf-import-file]').setInputFiles({
        name:'fixture.pdf',
        mimeType:'application/pdf',
        buffer:Buffer.from('%PDF-1.4\n% fixture\n')
      });
      await page.locator('#lmPdfDraftDialog[open]').waitFor({state:'visible'});
    };

    await importPdf();

    yield "02. Verify floating action bar, header quick actions, guide banner, and collapsed manual script";
    const floatingBar=page.locator('#lmPdfDraftFloatingBar');
    assert.equal(await floatingBar.isVisible(), true, 'Floating action bar must be mounted and visible');

    const badge=page.locator('#lmPdfFloatingBadge');
    assert.match(await badge.textContent(), /sections selected/, 'Badge must display selected sections count');

    const floatingText=page.locator('#lmPdfFloatingText');
    assert.match(await floatingText.textContent(), /items ready to be applied/, 'Floating text must state ready items');

    const quickApply=page.locator('#lmPdfDraftDialog .lm-pdf-quick-apply');
    assert.equal(await quickApply.isVisible(), true, 'Header quick apply button must be visible');
    assert.match(await quickApply.textContent(), /Apply to draft/, 'Quick apply button text must match');

    const quickCancel=page.locator('#lmPdfDraftDialog .lm-pdf-quick-cancel');
    assert.equal(await quickCancel.isVisible(), true, 'Header quick cancel button must be visible');

    const guideBanner=page.locator('#lmPdfDraftDialog .lm-pdf-guide-banner');
    assert.equal(await guideBanner.isVisible(), true, 'Guide banner must be visible in dialog');

    const manualToggle=page.locator('#lmPdfManualToggle');
    assert.equal(await manualToggle.isVisible(), true, 'Manual script toggle box must be visible during review');

    const importContainer=page.locator('.lm-import-methods');
    assert.equal(await importContainer.evaluate(el=>el.classList.contains('is-reviewing-draft')), true, 'Import methods must have is-reviewing-draft class');

    // Test toggle of manual script input
    await manualToggle.click();
    assert.equal(await importContainer.evaluate(el=>el.classList.contains('show-manual-inputs')), true, 'Clicking toggle expands manual inputs');
    await manualToggle.click();
    assert.equal(await importContainer.evaluate(el=>el.classList.contains('show-manual-inputs')), false, 'Clicking toggle again collapses manual inputs');

    yield "03. Dynamic count updates when toggling section checkboxes";
    const initialBadge=await badge.textContent();
    const detailsList=await page.locator('#lmPdfDraftDialog details').all();
    assert.ok(detailsList.length >= 2, 'Dialog should contain multiple sections');

    // Uncheck first section (Basic info)
    const firstCheckbox=detailsList[0].locator('summary input[type="checkbox"]');
    await firstCheckbox.uncheck();
    const updatedBadge=await badge.textContent();
    assert.notEqual(initialBadge, updatedBadge, 'Floating badge must update when section checkbox changes');

    // Recheck first section
    await firstCheckbox.check();
    assert.equal(await badge.textContent(), initialBadge, 'Floating badge must revert when section is rechecked');

    yield "04. Cancelling from floating bar restores editor state and cleans up";
    await page.locator('#lmPdfFloatingCancel').click();
    await page.waitForFunction(()=>!document.querySelector('#lmPdfDraftDialog'));
    assert.equal(await page.locator('#lmPdfDraftFloatingBar').count(), 0, 'Floating bar must be removed on cancel');
    assert.equal(await page.locator('#lmPdfManualToggle').count(), 0, 'Manual toggle must be removed on cancel');
    assert.equal(await importContainer.evaluate(el=>el.classList.contains('is-reviewing-draft')), false, 'is-reviewing-draft class must be removed');

    yield "05. Re-import and apply using the floating bar apply button";
    await importPdf();
    assert.equal(await page.locator('#lmPdfDraftFloatingBar').isVisible(), true);
    await page.locator('#lmPdfFloatingApply').click();

    await page.waitForFunction(()=>!document.querySelector('#lmPdfDraftDialog')||document.querySelector('#lmPdfDraftDialog [role=status]')?.classList.contains('bad'));
    const statusText=await page.locator('#lmPdfDraftDialog [role=status]').textContent().catch(()=>'');
    assert.equal(await page.locator('#lmPdfDraftDialog').count(), 0, statusText);
    assert.equal(await page.locator('#lmPdfDraftFloatingBar').count(), 0, 'Floating bar must be removed after successful apply');
    assert.equal(await page.locator('#lmPdfManualToggle').count(), 0, 'Manual toggle must be removed after successful apply');
    assert.equal(await importContainer.evaluate(el=>el.classList.contains('is-reviewing-draft')), false, 'is-reviewing-draft class must be removed');
    assert.ok(lesson.blocks.length > 0, 'Lesson must have blocks populated after applying via floating bar');

    assert.deepEqual(errors, []);
  } finally {
    await page?.goto('about:blank').catch(()=>{});
    await browser?.close();
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(resolve));
  }
});
