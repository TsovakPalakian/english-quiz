import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalAzureProvider} from '../ops/local-azure-preview-provider.mjs';
import {createLearningWorkbenchPreview} from '../ops/preview-learning-workbench.mjs';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
test('Azure selection stays Off until saved and speech consent names the real provider; Speakout uses Speech',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'azure-ui-'));let azure,preview,browser,calls=0;
  try{
    azure=await openLocalAzureProvider({filename:join(dir,'budget.sqlite'),apiKey:'fixture-only-key',resourceName:'lumiscia-speech',region:'northeurope',endpoint:'https://northeurope.api.cognitive.microsoft.com/',tier:'F0',confirmFreeTier:true,allowDataProcessing:true,fetchImpl:async()=>calls++});
    preview=await createLearningWorkbenchPreview({azure});browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const context=await browser.newContext();await context.addCookies([{name:'local-workbench-role',value:'dev',url:preview.url}]);
    const page=await context.newPage();page.setDefaultTimeout(10000);
    await page.goto(preview.url+'/__local/providers');await page.locator('#provider-pronunciation').waitFor();assert.equal(await page.locator('#provider-pronunciation').inputValue(),'off');
    const value=await page.locator('#provider-pronunciation option').evaluateAll(rows=>rows.find(row=>row.textContent.includes('microsoft-azure')&&row.textContent.includes('en-US')).value);
    await page.selectOption('#provider-pronunciation',value);await page.locator('#provider-reason').fill('Select Azure for explicit recording analysis.');
    await page.getByRole('button',{name:'Save settings',exact:true}).click();await page.getByText('Provider settings saved.',{exact:true}).waitFor();assert.equal(calls,0);
    await page.goto(preview.url);await page.waitForFunction(()=>typeof accountReady!=='undefined'&&accountReady);
    const icon=page.locator('.side [data-jump="speakout"] svg');await icon.waitFor();assert.ok((await icon.getAttribute('class')).includes('lucide-speech'));assert.equal(await icon.getAttribute('stroke'),'currentColor');
    await page.locator('.side nav button[data-jump="groups"]').click();await page.locator('[data-group-level="A1"]').click();await page.locator('[data-group-open="1"]').click();await page.locator('[data-detail-lessons]').click();await page.locator('[data-lm-open="1"]').click();
    await page.locator('[data-workbench-lesson-speech]:visible').first().click();
    await page.getByText('A fine drizzle is falling outside.',{exact:true}).waitFor();
    const consent=page.locator('[data-speech-form="analyze"] label');assert.match(await consent.innerText(),/microsoft-azure/);assert.ok(!await page.locator('[data-speech-form="analyze"] input').isChecked());assert.equal(calls,0);
    await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.learning-kit-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
    await page.screenshot({path:'/private/tmp/lumiscia-azure-speech-mobile.png'});
  }finally{await browser?.close();await preview?.close();azure?.close();rmSync(dir,{recursive:true,force:true});}
});
