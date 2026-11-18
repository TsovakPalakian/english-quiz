import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rootDir = process.cwd();

test('Stage 1: lmAutoExpandTextarea definition and safety guards in client/52b-lesson-pdf-import.js', () => {
  const code = fs.readFileSync(path.join(rootDir, 'client/52b-lesson-pdf-import.js'), 'utf8');

  assert.ok(code.includes('function lmAutoExpandTextarea(el, minHeight = 60)'), 'lmAutoExpandTextarea must be declared');
  assert.ok(code.includes('el.style.overflowY = \'hidden\''), 'lmAutoExpandTextarea must hide vertical scrollbar');
  assert.ok(code.includes('el.style.height = target + \'px\''), 'lmAutoExpandTextarea must assign target pixel height');

  // Verify attachment to description textarea
  assert.ok(code.includes('const descTextarea = box.querySelector(\'textarea[data-pdf-field="description"]\');'), 'Description textarea must be queried for auto-expansion');
  assert.ok(code.includes('const resizeDesc = () => lmAutoExpandTextarea(descTextarea, 60);'), 'resizeDesc helper must target description with minHeight 60');

  // Verify attachment to overview textarea
  assert.ok(code.includes('const overviewTextarea = box.querySelector(\'textarea[data-pdf-field="overview"]\');'), 'Overview textarea must be queried for auto-expansion');
  assert.ok(code.includes('const resizeOverview = () => lmAutoExpandTextarea(overviewTextarea, 96);'), 'resizeOverview helper must target overview with minHeight 96');
});

test('Stage 2: lmAutoExpandTextarea calculation logic in mock environment', () => {
  function lmAutoExpandTextarea(el, minHeight = 60) {
    if (!el || !el.style) return;
    el.style.height = 'auto';
    const border = (typeof el.offsetHeight === 'number' && typeof el.clientHeight === 'number')
      ? (el.offsetHeight - el.clientHeight)
      : 2;
    const target = Math.max(minHeight, (el.scrollHeight || 0) + (border > 0 ? border : 2) + 2);
    el.style.height = target + 'px';
    el.style.overflowY = 'hidden';
  }

  // Safe against null/empty
  assert.doesNotThrow(() => lmAutoExpandTextarea(null));
  assert.doesNotThrow(() => lmAutoExpandTextarea({}));

  const mockEl = {
    scrollHeight: 140,
    offsetHeight: 44,
    clientHeight: 40,
    style: { height: '60px', overflowY: 'visible' }
  };

  lmAutoExpandTextarea(mockEl, 60);
  assert.equal(mockEl.style.overflowY, 'hidden');
  // target = Math.max(60, 140 + 4 + 2) = 146
  assert.equal(mockEl.style.height, '146px');

  // Fallback to minHeight when scrollHeight is small
  mockEl.scrollHeight = 30;
  lmAutoExpandTextarea(mockEl, 60);
  assert.equal(mockEl.style.height, '60px');

  // Overview minHeight 96
  mockEl.scrollHeight = 40;
  lmAutoExpandTextarea(mockEl, 96);
  assert.equal(mockEl.style.height, '96px');
});

test('Stage 3: Theme variables in site/preview.css for .lm-pdf-draft details[open]', () => {
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  assert.ok(css.includes('.lm-pdf-draft details[open] { background: var(--saas-card,'), 'details[open] must use var(--saas-card)');
  assert.ok(css.includes('color: var(--saas-text-primary,'), 'details[open] must use var(--saas-text-primary)');
});

test('Stage 4: Playwright visual verification of auto-expansion for description and overview', async () => {
  const { chromium } = require('playwright');
  const previewCss = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();

  const testHtml = `<!DOCTYPE html>
<html lang="en" data-theme="sky">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    .test-container { padding: 20px; max-width: 700px; }
  </style>
</head>
<body>
  <div class="test-container">
    <div class="lm-pdf-draft saas-card">
      <details open id="detailsMeta">
        <summary><label><input type="checkbox" checked><span class="lm-pdf-section-num" data-num="1"></span><span class="lm-pdf-section-title">Basic information</span></label></summary>
        <div class="lm-pdf-section-content" id="metaContent">
          <div class="lm-pdf-form-box">
            <div class="saas-form-group">
              <label class="saas-label">Description</label>
              <textarea class="saas-textarea" data-pdf-field="description" maxlength="2400" placeholder="Description" style="min-height:60px;overflow-y:hidden;resize:vertical;">An interactive introductory English lesson focused on getting to know each other, discussing shared human habits and experiences through reading comprehension, and addressing common language learning problems and solutions.</textarea>
            </div>
          </div>
        </div>
      </details>
      <details open id="detailsOverview">
        <summary><label><input type="checkbox" checked><span class="lm-pdf-section-num" data-num="2"></span><span class="lm-pdf-section-title">Overview</span></label></summary>
        <div class="lm-pdf-section-content" id="overviewContent">
          <div class="lm-pdf-form-box">
            <div class="saas-form-group">
              <label class="saas-label">Lesson overview</label>
              <textarea class="saas-textarea" data-pdf-field="overview" placeholder="Overview text" style="min-height:96px;overflow-y:hidden;resize:vertical;">This lesson starts with icebreaker questions to help students get to know each other. It then explores a text about common human behaviors, followed by vocabulary and grammar work discussing what people do, love, or hate. Finally, it identifies common problems language learners face and provides actionable solutions.</textarea>
            </div>
          </div>
        </div>
      </details>
    </div>
  </div>
  <script>
    function lmAutoExpandTextarea(el, minHeight = 60) {
      if (!el || !el.style) return;
      el.style.height = 'auto';
      const border = (typeof el.offsetHeight === 'number' && typeof el.clientHeight === 'number')
        ? (el.offsetHeight - el.clientHeight)
        : 2;
      const target = Math.max(minHeight, (el.scrollHeight || 0) + (border > 0 ? border : 2) + 2);
      el.style.height = target + 'px';
      el.style.overflowY = 'hidden';
    }

    const desc = document.querySelector('textarea[data-pdf-field="description"]');
    const overview = document.querySelector('textarea[data-pdf-field="overview"]');

    if (desc) {
      const resizeDesc = () => lmAutoExpandTextarea(desc, 60);
      desc.addEventListener('input', resizeDesc);
      resizeDesc();
    }
    if (overview) {
      const resizeOverview = () => lmAutoExpandTextarea(overview, 96);
      overview.addEventListener('input', resizeOverview);
      resizeOverview();
    }
  </script>
</body>
</html>`;

  await page.setContent(testHtml, { waitUntil: 'load' });
  await page.waitForTimeout(100);

  const descMetrics = await page.evaluate(() => {
    const el = document.querySelector('textarea[data-pdf-field="description"]');
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      offsetHeight: el.offsetHeight,
      overflowY: getComputedStyle(el).overflowY
    };
  });

  assert.ok(descMetrics.offsetHeight > 60, `Description offsetHeight (${descMetrics.offsetHeight}px) must expand past 60px`);
  assert.ok(descMetrics.clientHeight >= descMetrics.scrollHeight - 2, 'Description text must not overflow vertically');
  assert.equal(descMetrics.overflowY, 'hidden', 'Description vertical scrollbar must be hidden');

  const overviewMetrics = await page.evaluate(() => {
    const el = document.querySelector('textarea[data-pdf-field="overview"]');
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      offsetHeight: el.offsetHeight,
      overflowY: getComputedStyle(el).overflowY
    };
  });

  assert.ok(overviewMetrics.offsetHeight >= 96, `Overview offsetHeight (${overviewMetrics.offsetHeight}px) must be >= 96px`);
  assert.ok(overviewMetrics.clientHeight >= overviewMetrics.scrollHeight - 2, 'Overview text must not overflow vertically');
  assert.equal(overviewMetrics.overflowY, 'hidden', 'Overview vertical scrollbar must be hidden');

  // Verify dynamic expansion upon typing additional lines
  await page.type('textarea[data-pdf-field="description"]', '\nAdditional test paragraph line 1\nAdditional test paragraph line 2\nAdditional test paragraph line 3');
  const expandedDescHeight = await page.evaluate(() => {
    return document.querySelector('textarea[data-pdf-field="description"]').offsetHeight;
  });
  assert.ok(expandedDescHeight > descMetrics.offsetHeight, `Height after input (${expandedDescHeight}px) must be greater than previous height (${descMetrics.offsetHeight}px)`);

  await browser.close();
});
