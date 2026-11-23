import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createQuizReviewPreview} from '../ops/preview-quiz-review-backend.mjs';

const require=createRequire(import.meta.url),{chromium}=require(resolveTestDependency('playwright'));

test('speech task creation visual UI test verifies end-to-end task creation with pauses', async () => {
  const {server,url}=await createQuizReviewPreview();
  let browser;
  const isHeadless = process.env.HEADLESS === 'true';
  const pause = ms => new Promise(res => setTimeout(res, ms));

  try {
    browser = await launchChromium(chromium, {
      headless: isHeadless,
      slowMo: isHeadless ? 0 : 500,
      args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']
    });

    const context = await browser.newContext({
      permissions: ['microphone'],
      viewport: {width: 1280, height: 1000}
    });
    const page = await context.newPage();

    async function highlight(locator) {
      await locator.evaluate(el => {
        el.style.outline = '3px solid #38bdf8';
        el.style.outlineOffset = '2px';
      });
      await pause(400);
      await locator.evaluate(el => {
        el.style.outline = '';
        el.style.outlineOffset = '';
      });
    }

    // 1. Open preview and select teacher role
    await page.goto(url);
    await page.locator('#account:not([disabled])').waitFor();
    await highlight(page.locator('#account'));
    await page.selectOption('#account', 'teacher');
    await pause(600);

    // 2. Navigate to Speech Practice view
    const speechNav = page.locator('[data-view="speech"]');
    await highlight(speechNav);
    await speechNav.click();
    await page.locator('.speech-panel').waitFor();
    await pause(800);

    // 3. Verify provider banner is visible
    const banner = page.locator('.speech-provider-banner');
    await banner.waitFor();
    assert.ok(await banner.isVisible(), 'Speech provider banner must be visible');
    await highlight(banner);

    // 4. Open the "Create a lesson speech task" accordion
    const createAccordion = page.locator('details:has([data-speech-form="task"]) > summary');
    await highlight(createAccordion);
    await createAccordion.click();
    await pause(600);

    const form = page.locator('[data-speech-form="task"]');
    await form.waitFor();
    assert.ok(await form.isVisible(), 'Task creation form must be expanded and visible');

    // 5. Select Scope if available (or verify Scope field)
    const scopeSelect = form.locator('[name="lessonContext"]');
    if (await scopeSelect.count() > 0) {
      await highlight(scopeSelect);
      await scopeSelect.selectOption({index: 0});
      await pause(500);
    }

    // 6. Select Mode: Pronunciation
    const modeSelect = form.locator('[name="mode"]');
    await highlight(modeSelect);
    await modeSelect.selectOption('pronunciation');
    await pause(500);

    // 7. Type Prompt text with visual typing
    const promptInput = form.locator('[name="prompt"]');
    await highlight(promptInput);
    await promptInput.fill('Read the word drizzle aloud with clear vowel articulation.');
    await pause(500);

    // 8. Type Reading reference text
    const refInput = form.locator('[name="reference"]');
    await highlight(refInput);
    await refInput.fill('drizzle');
    await pause(500);

    // 9. Select Locale: en-US
    const localeSelect = form.locator('[name="locale"]');
    await highlight(localeSelect);
    await localeSelect.selectOption('en-US');
    await pause(500);

    // 9b. Verify interactive SaaS toggle button state transitions
    const toggleBtn = form.locator('[data-speech-toggle="languageReview"]');
    assert.ok(await toggleBtn.isVisible(), 'SaaS toggle button must be visible');
    assert.equal(await toggleBtn.getAttribute('aria-pressed'), 'true', 'Toggle must be selected initially');
    await highlight(toggleBtn);
    await toggleBtn.click();
    await pause(300);
    assert.equal(await toggleBtn.getAttribute('aria-pressed'), 'false', 'Toggle must be unselected after click');
    assert.ok(await toggleBtn.evaluate(el => el.classList.contains('is-unselected')), 'Toggle must have is-unselected class');
    await highlight(toggleBtn);
    await toggleBtn.click();
    await pause(300);
    assert.equal(await toggleBtn.getAttribute('aria-pressed'), 'true', 'Toggle must return to selected on second click');
    assert.ok(await toggleBtn.evaluate(el => !el.classList.contains('is-unselected')), 'Toggle must remove is-unselected class');
    await highlight(toggleBtn);

    // 10. Click submit button to create the task
    const submitBtn = form.locator('button[type="submit"]');
    await highlight(submitBtn);
    await submitBtn.click();
    await pause(1000);

    // 11. Verify created task is automatically selected and create accordion is collapsed
    const speechTaskSelect = page.locator('#speech-task');
    await speechTaskSelect.waitFor({timeout: 10000});
    const selectedText = await speechTaskSelect.locator('option:checked').textContent();
    assert.ok(selectedText.includes('Read the word drizzle aloud with clear vowel articulation.'), 'Newly created task must be automatically selected in #speech-task');
    const detailsAccordion = page.locator('details.speech-create-accordion');
    assert.equal(await detailsAccordion.getAttribute('open'), null, 'Create task accordion must be collapsed after task creation');

    const taskCard = page.locator('.speech-task-card');
    await taskCard.waitFor({timeout: 10000});
    assert.ok(await taskCard.isVisible(), 'Active speech task card must be visible after creation');
    await highlight(taskCard);

    const promptText = await page.locator('.speech-task-prompt').textContent();
    assert.ok(promptText.includes('Read the word drizzle'), 'Created task prompt must be displayed in the card');

    const recordBtn = page.locator('[data-speech-action="record"]');
    assert.ok(await recordBtn.isVisible(), 'Record button must be present in recording studio');
    assert.ok(await recordBtn.isEnabled(), 'Record button must be enabled for recording');
    await highlight(recordBtn);

    // 12. Save verification screenshots across themes
    const panel = page.locator('.speech-panel');

    // Theme Sky
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sky'));
    await pause(400);
    await panel.screenshot({path: resolve('docs/task-speech-ui-verification-sky.png')});
    assert.ok(existsSync('docs/task-speech-ui-verification-sky.png'), 'Sky verification screenshot must exist');

    // Theme Dark
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await pause(400);
    await panel.screenshot({path: resolve('docs/task-speech-ui-verification-dark.png')});
    assert.ok(existsSync('docs/task-speech-ui-verification-dark.png'), 'Dark verification screenshot must exist');

    // Theme Sand
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sand'));
    await pause(400);
    await panel.screenshot({path: resolve('docs/task-speech-ui-verification-sand.png')});
    assert.ok(existsSync('docs/task-speech-ui-verification-sand.png'), 'Sand verification screenshot must exist');

    // Final pause for human observation
    if (!isHeadless) {
      await pause(2500);
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
