import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';
const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));

test('speech practice UI visual test verifies refined templates and themes', async () => {
  const {server,url}=await createQuizReviewPreview();
  let browser;
  try{
    browser=await launchChromium(chromium, {args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    const context=await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:960}});
    const page=await context.newPage();

    await page.goto(url);
    await page.locator('#account:not([disabled])').waitFor();
    await page.selectOption('#account','student');
    await page.locator('[data-view="speech"]').click();
    await page.locator('#speech-task').waitFor();

    // Verify Template 2 & Studio elements
    const banner=page.locator('.speech-provider-banner');
    await banner.waitFor();
    assert.ok(await banner.isVisible(),'Speech provider banner must be visible');

    const taskCard=page.locator('.speech-task-card');
    await taskCard.waitFor();
    assert.ok(await taskCard.isVisible(),'Speech task card must be visible');

    const recordBtn=page.locator('[data-speech-action="record"]');
    await recordBtn.waitFor();
    assert.ok(await recordBtn.isVisible(),'Record button must be visible');
    assert.ok(await recordBtn.isEnabled(),'Record button must be enabled initially');

    const consentCard=page.locator('.speech-consent-card');
    await consentCard.waitFor();
    assert.ok(await consentCard.isVisible(),'Consent card must be visible');

    // Visual theme verification across Sky, Dark, Sand
    const panel=page.locator('.speech-panel');

    // 1. Sky theme
    await page.evaluate(()=>document.documentElement.setAttribute('data-theme','sky'));
    await panel.screenshot({path:resolve('docs/task-speech-ui-verification-sky.png')});
    assert.ok(existsSync('docs/task-speech-ui-verification-sky.png'),'Sky theme verification screenshot must exist');

    // 2. Dark theme
    await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
    await panel.screenshot({path:resolve('docs/task-speech-ui-verification-dark.png')});
    assert.ok(existsSync('docs/task-speech-ui-verification-dark.png'),'Dark theme verification screenshot must exist');

    // 3. Sand theme
    await page.evaluate(()=>document.documentElement.setAttribute('data-theme','sand'));
    await panel.screenshot({path:resolve('docs/task-speech-ui-verification-sand.png')});
    assert.ok(existsSync('docs/task-speech-ui-verification-sand.png'),'Sand theme verification screenshot must exist');

  }finally{
    await browser?.close();
    await server?.close();
  }
});
