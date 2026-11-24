import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { previewAuthStudio } from '../ops/preview-auth-studio.mjs';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('DOM structural integrity: preview.html contains #home and #account inside .wrap', () => {
  const html = readFileSync(resolve('site/preview.html'), 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const home = doc.getElementById('home');
  const account = doc.getElementById('account');
  const phone = doc.querySelector('.phone');
  const wrap = doc.querySelector('.wrap');

  assert.ok(home, '#home element exists');
  assert.ok(account, '#account element exists');
  assert.ok(wrap, '.wrap element exists');
  assert.equal(home.parentElement, wrap, '#home parent must be .wrap');
  assert.equal(account.parentElement, wrap, '#account parent must be .wrap');
  assert.equal(wrap.parentElement, phone, '.wrap parent must be .phone');

  // Verify that .phone does not contain leaked sections directly due to premature wrap closing
  const phoneSections = [...phone.children].filter(c => c.tagName === 'SECTION');
  assert.equal(phoneSections.length, 0, '.phone must not directly contain any SECTION elements; all sections belong inside .wrap');
});

test('Visual and functional verification: Login page vertical alignment and zero offset on click', async (t) => {
  const preview = await previewAuthStudio();
  const browser = await launchChromium(chromium);
  try {
    for (const vp of [{ width: 1440, height: 900, name: 'Desktop' }, { width: 390, height: 844, name: 'Mobile' }]) {
      await t.test(`${vp.name} (${vp.width}x${vp.height}): Verify login form is centered and never pushed down`, async () => {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(preview.url, { waitUntil: 'domcontentloaded' });

        const enterBtn = page.getByRole('button', { name: 'Enter the Learning Studio', exact: true });
        await enterBtn.waitFor({ state: 'visible' });

        // Click "Enter the Learning Studio"
        await enterBtn.click();
        await page.waitForSelector('body.guest-auth', { state: 'attached' });
        await page.waitForSelector('#account.on', { state: 'visible' });

        const accountBox = await page.locator('#account').boundingBox();
        assert.ok(accountBox, '#account has a bounding box');

        // Verify account is vertically within view and top is near top/center, never pushed down offscreen
        assert.ok(accountBox.y >= 0, `#account top (${accountBox.y}) must be >= 0`);
        assert.ok(accountBox.y < vp.height * 0.4, `#account top (${accountBox.y}) must be within top 40% of viewport, not pushed down`);
        assert.ok(accountBox.y + accountBox.height <= vp.height + 40, `#account bottom must fit within visible screen height`);

        // Verify horizontal centering
        const centerX = accountBox.x + accountBox.width / 2;
        assert.ok(Math.abs(centerX - vp.width / 2) < 2, `#account center (${centerX}) must match viewport center (${vp.width / 2})`);

        // Verify scroll position is 0
        const scrollY = await page.evaluate(() => window.scrollY);
        assert.equal(scrollY, 0, 'Window scrollY must be 0 after opening login');

        await page.close();
      });
    }
  } finally {
    await browser.close();
    await preview.close();
  }
});
