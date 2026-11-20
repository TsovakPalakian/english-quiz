import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Visual and DOM test: Verified cards fold/unfold in accordion and target words have bold, 16px font', async () => {
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');

  const html = `<!DOCTYPE html>
<html lang="en" data-theme="sky">
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body style="padding: 20px;">
  <div id="material">
    <details class="lm-verified-accordion" open>
      <summary class="lm-verified-summary">
        <div class="lm-verified-title-group">
          <span class="lm-verified-icon">✓</span>
          <span class="lm-verified-title-text">Verified materials & quizzes</span>
          <span class="lm-verified-count-pill">1 item</span>
        </div>
      </summary>
      <div class="lm-verified-content">
        <article class="lm-block is-shut" data-block-id="block-v1">
          <div class="lm-block-head">
            <button class="lm-grip" type="button">≡</button>
            <span class="lm-type">Task 1 · Quiz · Pronounce</span>
            <span class="lm-verified-badge">✓ Verified by Teacher</span>
            <div class="lm-head-actions">
              <button class="lm-icon" type="button" data-lm-fold="block-v1">▸</button>
            </div>
          </div>
          <p class="lm-summary">Pronounce · superstition · Practice superstition</p>
          <div class="lm-body">
            <div class="lm-card-row">
              <div class="lm-card-fields">
                <label>Word / Phrase to pronounce
                  <input type="text" data-item-field="word" value="superstition" />
                </label>
              </div>
            </div>
          </div>
        </article>
      </div>
    </details>
  </div>
</body>
</html>`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.setContent(html);

    // 1. In collapsed state: .lm-body is display: none, .lm-summary is displayed
    const bodyDisplay = await page.$eval('.lm-block.is-shut .lm-body', el => getComputedStyle(el).display);
    assert.equal(bodyDisplay, 'none', 'lm-body must be hidden in collapsed card');

    const summaryDisplay = await page.$eval('.lm-block.is-shut .lm-summary', el => getComputedStyle(el).display);
    assert.equal(summaryDisplay, 'block', 'lm-summary must be displayed in collapsed card');

    const summaryWeight = await page.$eval('.lm-block.is-shut .lm-summary', el => getComputedStyle(el).fontWeight);
    assert.ok(Number(summaryWeight) >= 600, 'lm-summary must have font-weight >= 600');

    // 2. Toggle to expanded state by removing .is-shut (simulating data-lm-fold toggle)
    await page.evaluate(() => {
      const block = document.querySelector('.lm-block');
      block.classList.remove('is-shut');
      block.querySelector('[data-lm-fold]').textContent = '▾';
    });

    const bodyDisplayAfter = await page.$eval('.lm-block .lm-body', el => getComputedStyle(el).display);
    assert.notEqual(bodyDisplayAfter, 'none', 'lm-body must be visible when expanded');

    // 3. Target word input has font-weight: 700 and font-size: 16px
    const wordInputWeight = await page.$eval('input[data-item-field="word"]', el => getComputedStyle(el).fontWeight);
    const wordInputSize = await page.$eval('input[data-item-field="word"]', el => getComputedStyle(el).fontSize);

    assert.equal(wordInputWeight, '700', 'Target word input must have bold font-weight 700');
    assert.equal(wordInputSize, '16px', 'Target word input must have font-size 16px');
  } finally {
    await browser.close();
  }
});
