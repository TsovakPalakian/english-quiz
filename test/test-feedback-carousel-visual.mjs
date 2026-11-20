import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));
const preview = await previewAuthStudio();
let browser;

try {
  browser = await launchChromium(chromium);
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(preview.url);
  await page.waitForTimeout(400);

  // 1. Open feedback modal
  const floatingBtn = page.locator('#feedbackFloatingTrigger');
  await floatingBtn.waitFor({state: 'visible'});
  await floatingBtn.click();
  const modal = page.locator('#feedbackModal');
  await modal.waitFor({state: 'visible'});

  // 2. Attach multiple files (3 files: 2 images, 1 text document)
  await page.evaluate(() => {
    function makeThumb(label, bg, w = 320, h = 200) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, w / 2, h / 2);
      return c.toDataURL('image/jpeg', 0.85);
    }

    const img1 = makeThumb('Screen 1', '#0284c7');
    const img2 = makeThumb('Screen 2', '#0d9488');

    // Paste file 1
    const bin1 = atob(img1.split(',')[1]);
    const arr1 = new Uint8Array(bin1.length);
    for (let i = 0; i < bin1.length; i++) arr1[i] = bin1.charCodeAt(i);
    const file1 = new File([arr1], '12-clay-3d.jpg', {type: 'image/jpeg'});

    // Paste file 2
    const bin2 = atob(img2.split(',')[1]);
    const arr2 = new Uint8Array(bin2.length);
    for (let i = 0; i < bin2.length; i++) arr2[i] = bin2.charCodeAt(i);
    const file2 = new File([arr2], '16-academic.jpg', {type: 'image/jpeg'});

    // Non-image file 3
    const file3 = new File(['log details'], 'error-log.txt', {type: 'text/plain'});

    const dt = new DataTransfer();
    dt.items.add(file1);
    const pasteEvent1 = new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true});
    window.dispatchEvent(pasteEvent1);

    const dt2 = new DataTransfer();
    dt2.items.add(file2);
    const pasteEvent2 = new ClipboardEvent('paste', {clipboardData: dt2, bubbles: true, cancelable: true});
    window.dispatchEvent(pasteEvent2);

    const dt3 = new DataTransfer();
    dt3.items.add(file3);
    const pasteEvent3 = new ClipboardEvent('paste', {clipboardData: dt3, bubbles: true, cancelable: true});
    window.dispatchEvent(pasteEvent3);
  });

  // 3. Verify carousel preview is visible and centered
  const previewBox = modal.locator('#feedbackPreviewBox');
  await previewBox.waitFor({state: 'visible', timeout: 5000});

  const prevBtn = previewBox.locator('#feedbackCarouselPrev');
  const nextBtn = previewBox.locator('#feedbackCarouselNext');
  const counterEl = previewBox.locator('.feedback-carousel-counter');
  const previewImg = previewBox.locator('#feedbackPreviewImg');

  assert.equal(await prevBtn.isVisible(), true, 'Prev navigation button must be visible for multiple attachments');
  assert.equal(await nextBtn.isVisible(), true, 'Next navigation button must be visible for multiple attachments');
  assert.equal(await counterEl.textContent(), '1 / 3', 'Initial counter shows 1 / 3');
  assert.ok(await previewImg.isVisible(), 'Preview image must be visible in center');

  // Verify full-size pill is NOT present
  const fullSizePill = previewBox.locator('text=Full size');
  assert.equal(await fullSizePill.count(), 0, 'Old full-size pill button must be removed');

  // 4. Test clicking Next ›
  await nextBtn.click();
  await page.waitForTimeout(100);
  assert.equal(await counterEl.textContent(), '2 / 3', 'Counter updates to 2 / 3 on next');

  // 5. Test clicking Prev ‹
  await prevBtn.click();
  await page.waitForTimeout(100);
  assert.equal(await counterEl.textContent(), '1 / 3', 'Counter returns to 1 / 3 on prev');

  // 6. Test clicking preview image opens full-size Lightbox outside feedback dialog
  const zoomTrigger = previewBox.locator('#feedbackPreviewZoomTrigger');
  await zoomTrigger.click();

  const lightbox = page.locator('#feedbackLightbox');
  await lightbox.waitFor({state: 'visible', timeout: 3000});
  assert.equal(await lightbox.isVisible(), true, 'Lightbox must open outside feedback modal');

  const lightboxCounter = lightbox.locator('.feedback-lightbox-counter');
  assert.equal(await lightboxCounter.textContent(), '1 / 3', 'Lightbox displays 1 / 3 counter');

  // Test lightbox next
  const lbNext = lightbox.locator('#feedbackLightboxNext');
  await lbNext.click();
  await page.waitForTimeout(100);
  assert.equal(await lightboxCounter.textContent(), '2 / 3', 'Lightbox flips to 2 / 3');

  // Close lightbox via close button
  const lbClose = lightbox.locator('#feedbackLightboxClose');
  await lbClose.click();
  await page.waitForTimeout(100);
  assert.equal(await lightbox.isVisible(), false, 'Lightbox closes after clicking close button');

  // 7. Test removing file from preview
  const removeBtn = previewBox.locator('#feedbackPreviewRemove');
  await removeBtn.click();
  await page.waitForTimeout(100);
  assert.equal(await counterEl.textContent(), '2 / 2', 'Counter reflects remaining files');

  // Capture verification screenshots across themes
  const rootDir = resolve('.');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sky'));
  await page.waitForTimeout(100);
  await modal.screenshot({path: resolve(rootDir, 'docs/task-5-screenshot-1-sky.png')});

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(100);
  await modal.screenshot({path: resolve(rootDir, 'docs/task-5-screenshot-2-dark.png')});

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sand'));
  await page.waitForTimeout(100);
  await modal.screenshot({path: resolve(rootDir, 'docs/task-5-screenshot-3-sand.png')});

  // Lightbox screenshot (switch to image attachment)
  await prevBtn.click();
  await page.waitForTimeout(100);
  await zoomTrigger.click();
  await lightbox.waitFor({state: 'visible'});
  await page.screenshot({path: resolve(rootDir, 'docs/task-5-screenshot-4-lightbox.png')});

  assert.equal(consoleErrors.length, 0, 'Zero console errors during carousel and lightbox interactions: ' + consoleErrors.join(', '));
  console.log('Feedback carousel and lightbox visual test passed successfully.');
} finally {
  await browser?.close();
  await preview.close();
}
