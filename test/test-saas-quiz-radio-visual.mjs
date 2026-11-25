import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Visual and DOM test: SaaS Choice Quiz radio buttons are 18px and options render as styled cards', async () => {
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');

  const browser = await chromium.launch({ headless: true });

  for (const theme of ['sky', 'dark', 'almond']) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 720, height: 500 });

    const html = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}" data-display-size="comfortable">
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body style="padding: 24px; background: var(--bg); color: var(--ink);">
  <div id="material">
    <div id="lmPreview">
      <div class="lm-assignment lm-assignment-tone-0">
        <header><h3>Task 1 · Grammar Check (Choice Quiz)</h3></header>
        <div class="lm-panel">
          <div class="lm-q">
            <b>It was an unforgettable _______ to visit the ancient ruins.</b>
            <div class="lm-opts">
              <label class="lm-opt is-selected">
                <input type="radio" name="pv-q1" data-pick="b1:0:0" checked />
                <span>experience</span>
              </label>
              <label class="lm-opt">
                <input type="radio" name="pv-q1" data-pick="b1:0:1" />
                <span>destination</span>
              </label>
              <label class="lm-opt">
                <input type="radio" name="pv-q1" data-pick="b1:0:2" />
                <span>ticket</span>
              </label>
            </div>
          </div>
          <button class="lm-btn lm-btn-primary lm-check" type="button" data-quiz-check="b1">Check</button>
          <p class="lm-result" data-quiz-score="b1">Score: 3 / 3</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

    await page.setContent(html);

    // 1. Verify radio button dimensions
    const radioDims = await page.evaluate(() => {
      const radio = document.querySelector('input[type="radio"]');
      const comp = window.getComputedStyle(radio);
      return {
        width: parseFloat(comp.width),
        height: parseFloat(comp.height),
        minHeight: comp.minHeight
      };
    });

    assert.equal(radioDims.width, 18, `Radio button width must be 18px in theme ${theme}`);
    assert.equal(radioDims.height, 18, `Radio button height must be 18px in theme ${theme}`);
    assert.equal(radioDims.minHeight, '18px', `Radio button minHeight must be 18px in theme ${theme}`);

    // 2. Verify label.lm-opt card styling and typography
    const labelStyles = await page.evaluate(() => {
      const label = document.querySelector('label.lm-opt');
      const comp = window.getComputedStyle(label);
      return {
        display: comp.display,
        borderRadius: comp.borderRadius,
        fontSize: comp.fontSize,
        cursor: comp.cursor
      };
    });

    assert.equal(labelStyles.display, 'flex', 'Option card must use flexbox');
    assert.equal(labelStyles.borderRadius, '10px', 'Option card must have 10px rounded corners');
    assert.equal(labelStyles.fontSize, '15px', 'Option text font size must be 15px');
    assert.equal(labelStyles.cursor, 'pointer', 'Option card cursor must be pointer');

    // 3. Verify interactive selection state
    await page.locator('label.lm-opt:nth-child(2)').click();

    const secondOptionChecked = await page.evaluate(() => {
      const secondInput = document.querySelector('label.lm-opt:nth-child(2) input[type="radio"]');
      return secondInput.checked;
    });
    assert.equal(secondOptionChecked, true, 'Second radio option must become checked on click');

    // 4. Verify score pill styling
    const scorePillStyles = await page.evaluate(() => {
      const score = document.querySelector('.lm-result');
      const comp = window.getComputedStyle(score);
      return {
        display: comp.display,
        fontSize: comp.fontSize,
        borderRadius: comp.borderRadius,
        fontWeight: comp.fontWeight
      };
    });

    assert.equal(scorePillStyles.display, 'inline-flex', 'Score badge must be inline-flex');
    assert.equal(scorePillStyles.borderRadius, '8px', 'Score badge must have 8px border-radius');
    assert.equal(scorePillStyles.fontSize, '14px', 'Score badge font size must be 14px');

    await page.close();
  }

  await browser.close();
});
