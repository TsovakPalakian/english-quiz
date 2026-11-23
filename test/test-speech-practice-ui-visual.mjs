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

    const consentRow=page.locator('.studio-consent-row');
    await consentRow.waitFor();
    assert.ok(await consentRow.isVisible(),'Studio consent row must be visible');

    const consentInfo=page.locator('.consent-info');
    await consentInfo.waitFor();
    assert.ok(await consentInfo.isVisible(),'Consent info must be visible');

    const consentInput=consentRow.locator('input[type="checkbox"][name="consent"]');
    assert.strictEqual(await consentInput.isChecked(),false,'Consent checkbox must not be checked initially');
    const consentLabel=consentRow.locator('.speech-consent-label');
    assert.match(await consentLabel.innerText(),/Send this recording to/,'Consent label must contain provider prompt text');
    const labelFlex=await consentLabel.evaluate(el=>getComputedStyle(el).flexDirection);
    assert.equal(labelFlex,'row','Consent label must align horizontally with row direction');

    // Verify empty criteria accordion is omitted
    assert.equal(await page.locator('.speech-criteria-accordion').count(),0,'Empty criteria accordion must not be rendered');

    // Verify SaaS dropzone and hidden file input
    const dropzone=page.locator('.speech-drop-zone');
    await dropzone.waitFor();
    assert.ok(await dropzone.isVisible(),'SaaS dropzone must be visible');
    const browseBtn=dropzone.locator('.dropzone-browse-btn');
    assert.ok(await browseBtn.isVisible(),'Browse file button must be visible');
    assert.equal(await browseBtn.textContent(),'Browse file','Button text must be Browse file');
    const fileInputOpacity=await page.locator('#speech-file').evaluate(el=>getComputedStyle(el).opacity);
    assert.equal(fileInputOpacity,'0','Native file input must be visually hidden');

    // Verify Comparable progress accordion content wrapper and summary outline
    const compProgress=page.locator('details.speech-accordion:has-text("Comparable progress")');
    await compProgress.waitFor();
    assert.ok(await compProgress.locator('.speech-accordion-content').isVisible(),'Comparable progress content must be wrapped in speech-accordion-content');
    const summaryOutline=await compProgress.locator('summary').evaluate(el=>getComputedStyle(el).outlineStyle);
    assert.equal(summaryOutline,'none','Summary must have outline: none to avoid thick blue rings');

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

    // Teacher view verification: structured SaaS form fields and Cancel button
    await page.selectOption('#account','teacher');
    await page.locator('[data-view="speech"]').click();
    const createSummary=page.locator('.speech-create-summary');
    await createSummary.waitFor();
    assert.ok(await createSummary.isVisible(), 'Styled speech create summary must be visible');
    assert.ok((await createSummary.textContent()).includes('Create a Lesson Speech Task'), 'Summary text must match mockup');
    await createSummary.click();

    const cancelBtn=page.locator('.speech-btn-secondary');
    await cancelBtn.waitFor();
    assert.ok(await cancelBtn.isVisible(), 'Cancel button must be visible in teacher form');
    assert.ok(await page.locator('.saas-field').count() >= 3, 'Structured SaaS fields must be rendered');

    // SaaS custom dropdown component verification
    const modeWrap = page.locator('.saas-select-wrap:has(select[name="mode"])');
    await modeWrap.waitFor();
    const modeBtn = modeWrap.locator('.saas-select-btn');
    const modePopover = modeWrap.locator('.saas-dropdown-popover');
    const modeSelect = modeWrap.locator('select[name="mode"]');

    assert.ok(await modeBtn.isVisible(), 'Custom SaaS dropdown trigger button must be visible');
    assert.equal(await modePopover.isVisible(), false, 'Dropdown popover must be hidden initially');
    assert.equal(await modeBtn.getAttribute('aria-expanded'), 'false', 'Button aria-expanded must be false');

    // Click to open dropdown popover
    await modeBtn.click();
    assert.equal(await modePopover.isVisible(), true, 'Dropdown popover must be visible after click');
    assert.equal(await modeBtn.getAttribute('aria-expanded'), 'true', 'Button aria-expanded must be true');
    assert.ok(await modeBtn.evaluate(el => el.classList.contains('open')), 'Button must have open class');

    const items = modePopover.locator('.saas-dropdown-item');
    assert.equal(await items.count(), 5, 'Mode dropdown must offer exactly 5 practice mode options');

    const selectedItem = modePopover.locator('.saas-dropdown-item.selected');
    assert.ok((await selectedItem.textContent()).includes('Pronunciation'), 'Initial selected item must be Pronunciation');
    assert.ok(await selectedItem.locator('.item-check').isVisible(), 'Selected item checkmark must be visible');

    // Capture visual snapshots of the open SaaS dropdown popover across themes
    const formSection = page.locator('.saas-section.speech-section').first();

    // 1. Sky theme
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sky'));
    await formSection.screenshot({ path: resolve('docs/task-speech-saas-dropdown-open-sky.png') });
    assert.ok(existsSync('docs/task-speech-saas-dropdown-open-sky.png'), 'Sky theme open dropdown screenshot must exist');

    // 2. Dark theme
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await formSection.screenshot({ path: resolve('docs/task-speech-saas-dropdown-open-dark.png') });
    assert.ok(existsSync('docs/task-speech-saas-dropdown-open-dark.png'), 'Dark theme open dropdown screenshot must exist');

    // 3. Sand theme
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sand'));
    await formSection.screenshot({ path: resolve('docs/task-speech-saas-dropdown-open-sand.png') });
    assert.ok(existsSync('docs/task-speech-saas-dropdown-open-sand.png'), 'Sand theme open dropdown screenshot must exist');

    // Reset back to Sky
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sky'));

    // Select "Free Speech (Open Prompt)" from popover
    const freeItem = modePopover.locator('.saas-dropdown-item[data-value="free"]');
    await freeItem.click();

    // Verify popover closed and values synchronized
    assert.equal(await modePopover.isVisible(), false, 'Dropdown popover must close upon option selection');
    assert.equal(await modeBtn.getAttribute('aria-expanded'), 'false', 'Button aria-expanded must reset to false');
    assert.ok((await modeBtn.textContent()).includes('Free Speech'), 'Trigger button must display selected option title');
    assert.equal(await modeSelect.inputValue(), 'free', 'Hidden native select value must be synchronized to free');

    // Verify dynamic reactive behavior triggered by mode change
    const criteriaSection = page.locator('[data-speech-criteria]');
    assert.equal(await criteriaSection.isVisible(), true, 'Criteria section must be revealed for free speech mode');

    const evalSelect = page.locator('select[name="evaluation"]');
    assert.equal(await evalSelect.inputValue(), 'stt', 'Evaluation select must automatically switch to stt for free speech');

    const evalBtn = page.locator('.saas-select-wrap:has(select[name="evaluation"]) .saas-select-btn');
    assert.ok((await evalBtn.textContent()).includes('Transcription Only'), 'Evaluator custom button must reflect programmatic sync to stt');

    // Test Escape key dismissal
    const localeWrap = page.locator('.saas-select-wrap:has(select[name="locale"])');
    const localeBtn = localeWrap.locator('.saas-select-btn');
    const localePopover = localeWrap.locator('.saas-dropdown-popover');
    await localeBtn.click();
    assert.equal(await localePopover.isVisible(), true, 'Locale popover must be visible');
    await page.keyboard.press('Escape');
    assert.equal(await localePopover.isVisible(), false, 'Locale popover must close on Escape key');

    // Test click-outside dismissal
    await localeBtn.click();
    assert.equal(await localePopover.isVisible(), true, 'Locale popover must be visible again');
    await cancelBtn.click(); // Click outside the select wrap
    assert.equal(await localePopover.isVisible(), false, 'Locale popover must close on click outside');

  }finally{
    await browser?.close();
    await server?.close();
  }
});
