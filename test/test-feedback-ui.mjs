import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));
const preview = await previewAuthStudio();
let browser;

try {
  browser = await chromium.launch({headless: true, executablePath: chromiumExecutable()});
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(preview.url);
  await page.waitForTimeout(500);

  // 1. Verify floating feedback button is present
  const floatingBtn = page.locator('#feedbackFloatingTrigger');
  await floatingBtn.waitFor({state: 'visible'});
  assert.equal(await floatingBtn.isVisible(), true, 'Floating feedback button must be visible');

  // 2. Open feedback modal by clicking floating trigger
  await floatingBtn.click();
  const modal = page.locator('#feedbackModal');
  await modal.waitFor({state: 'visible'});
  assert.equal(await modal.isVisible(), true, 'Feedback modal must open');

  // 3. Switch categories
  const ideaBtn = modal.locator('[data-type="idea"]');
  await ideaBtn.click();
  assert.equal(await ideaBtn.evaluate(el => el.classList.contains('active')), true, 'Idea category active');

  const bugBtn = modal.locator('[data-type="bug"]');
  await bugBtn.click();
  assert.equal(await bugBtn.evaluate(el => el.classList.contains('active')), true, 'Bug category active');

  // 4. Test pasting image via clipboard event
  await page.evaluate(() => {
    // 1x1 transparent PNG data URL to blob
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'screenshot.png', {type: 'image/png'});
    
    const dt = new DataTransfer();
    dt.items.add(file);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(pasteEvent);
  });

  // Wait for canvas compression and preview image rendering
  const previewBox = modal.locator('#feedbackPreviewBox');
  await previewBox.waitFor({state: 'visible', timeout: 5000});
  const previewImg = modal.locator('#feedbackPreviewImg');
  const src = await previewImg.getAttribute('src');
  assert.ok(src && src.startsWith('data:image/'), 'Preview image must have data URL src');

  // 5. Test validation on empty message
  const submitBtn = modal.locator('#feedbackSubmitBtn');
  await submitBtn.click();
  const statusEl = modal.locator('#feedbackStatus');
  const errorText = await statusEl.textContent();
  assert.ok(errorText.includes('Пожалуйста, опишите проблему'), 'Validation error shown on empty message');

  // 6. Fill message and submit successfully
  const textarea = modal.locator('#feedbackMessage');
  await textarea.fill('Interactive test: layout is slightly shifted on tablet viewport');

  const contact = modal.locator('#feedbackContact');
  await contact.fill('tester@lumiscia.org');

  await submitBtn.click();
  await page.waitForFunction(() => {
    const el = document.getElementById('feedbackStatus');
    return el && el.textContent.includes('Спасибо');
  }, {timeout: 5000});

  // Wait for auto-close
  await modal.waitFor({state: 'hidden', timeout: 3000});
  assert.equal(await modal.isVisible(), false, 'Modal closes automatically after success');

  assert.equal(consoleErrors.length, 0, 'Zero console errors during feedback interaction: ' + consoleErrors.join(', '));
  console.log('Feedback modal UI and clipboard paste interaction passed successfully.');
} finally {
  await browser?.close();
  await preview.close();
}
