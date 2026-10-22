import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalGeminiProvider} from '../ops/local-gemini-preview-provider.mjs';
import {createLearningWorkbenchPreview} from '../ops/preview-learning-workbench.mjs';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
test('developer selects Gemini and explicitly dispatches one lesson quiz from the local UI',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gemini-ui-'));let gemini,preview,browser,calls=0;
  try{
    gemini=await openLocalGeminiProvider({filename:join(dir,'budget.sqlite'),apiKey:'fixture-only-key',quotaProject:'fixture-project',confirmFreeTier:true,allowDataProcessing:true,fetchImpl:async(_,init)=>{
      calls++;const {type,meaning}=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({type,meaning,content:{explanation:'Drizzle is light rain.',items:[{front:meaning.en,back:meaning.translation}]}})}]}}]});
    }});
    preview=await createLearningWorkbenchPreview({gemini});
    browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const context=await browser.newContext();await context.addCookies([{name:'local-workbench-role',value:'dev',url:preview.url}]);
    const page=await context.newPage();page.setDefaultTimeout(10000);
    await page.goto(preview.url+'/__local/providers');await page.locator('#provider-generation').waitFor();
    assert.equal(await page.locator('#provider-generation').inputValue(),'off');assert.equal(calls,0);
    const value=await page.locator('#provider-generation option').evaluateAll(rows=>rows.find(row=>row.textContent.includes('gemini-3.5-flash-lite')&&row.textContent.includes('en-US')).value);
    await page.selectOption('#provider-generation',value);await page.locator('#provider-reason').fill('Explicit fixture test.');
    await page.getByRole('button',{name:'Save settings',exact:true}).click();await page.getByText('Provider settings saved.',{exact:true}).waitFor();
    assert.match(await page.locator('.attempt-meta').innerText(),/manual dispatch/);assert.equal(calls,0);
    const status=await page.evaluate(async()=>await(await fetch('/__local/status')).json());
    const settings=await page.evaluate(async()=>await(await fetch('/api/learning-workbench/settings/providers')).json());assert.equal(settings.selections.generation.adapterId,'gemini-quiz');
    // Use the fixture's explicit sense ID from the coverage API, not a production account.
    const senseId=await page.evaluate(async()=>{
      const response=await fetch('/api/learning-workbench/kit?cardId=1&lessonId=1&groupId=1');const data=await response.json();return data.meaning?.id||data.senses?.[0]?.id;
    });
    assert.ok(senseId);assert.equal(status.gemini.remaining,5);
    const response=await page.evaluate(async senseId=>{const result=await fetch('/api/learning-workbench/kit/fill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),groupId:1,lessonId:1,cardId:1,senseId,types:['Flip']})});return result.status;},senseId);
    assert.equal(response,200);assert.equal(calls,0);
    await page.locator('#local-gemini-step input').check();await page.getByRole('button',{name:'Run one queued job'}).click();
    await page.getByText('Step finished. Remaining requests: 4',{exact:true}).waitFor();assert.equal(calls,1);
    await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('main').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
  }finally{await browser?.close();await preview?.close();gemini?.close();rmSync(dir,{recursive:true,force:true});}
});
