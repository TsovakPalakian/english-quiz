import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { previewAuthStudio } from '../ops/preview-auth-studio.mjs';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('TASK: Constellation inspector positioning directly near title without constellation or title overlap', async (t) => {
  const preview = await previewAuthStudio();
  const browser = await launchChromium(chromium);

  try {
    for (const vp of [
      { width: 1200, height: 900, name: 'Desktop' },
      { width: 390, height: 844, name: 'Mobile' }
    ]) {
      for (const abbr of ['Pup', 'Sge', 'Eri']) {
        await t.test(`${vp.name} (${vp.width}x${vp.height}) - Constellation ${abbr}: Inspector is positioned next to title and avoids collisions`, async () => {
          const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' });
          await page.addInitScript(() => {
            localStorage.setItem('cookie_consent', 'all');
            document.cookie = 'cookie_consent=all; Path=/';
          });

          // Intercept preview.js to lock onto tested constellation and immediate hold phase
          await page.route('**/preview.js*', async route => {
            const response = await route.fetch();
            let body = await response.text();
            body = body
              .replace(
                'let current=frozen?.constellation||next(),previous=null',
                `let current=frozen?.constellation||(()=>{const c=catalogue.find(c=>c.abbr==='${abbr}')||catalogue[0];recent=[...recent.filter(a=>a!==c.abbr),c.abbr];return c;})(),previous=null`
              )
              .replace("phase=frozen?'hold':'gather'", "phase='hold'");
            await route.fulfill({ response, body });
          });

          await page.route('**/api/me', route => route.fulfill({ json: { user: null } }));
          await page.route('**/api/auth/**', route => route.fulfill({ json: { ok: true } }));

          await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('#authSky', { state: 'attached' });

          const titleEl = await page.waitForSelector('.auth-sky-title', { state: 'visible' });
          assert.ok(titleEl, 'Constellation title link is rendered');

          // Hover on constellation title to trigger inspection
          await titleEl.hover({ force: true });
          await page.waitForTimeout(400);

          const result = await page.evaluate(() => {
            const title = document.querySelector('.auth-sky-title');
            const inspector = document.querySelector('.auth-sky-con-inspector');
            if (!title || !inspector) return { error: 'Elements not found' };

            const r = title.getBoundingClientRect();
            const b = inspector.getBoundingClientRect();
            const isActive = !inspector.hidden && inspector.classList.contains('active');

            // Check overlap between card and title
            const overlapsTitle = !(b.right < r.left || b.left > r.right || b.bottom < r.top || b.top > r.bottom);

            // Compute distance between card center and title center
            const titleCenterX = (r.left + r.right) / 2;
            const titleCenterY = (r.top + r.bottom) / 2;
            const cardCenterX = (b.left + b.right) / 2;
            const cardCenterY = (b.top + b.bottom) / 2;
            const distance = Math.hypot(cardCenterX - titleCenterX, cardCenterY - titleCenterY);

            // Check card is within screen bounds
            const withinViewport = b.left >= 8 && b.top >= 8 && b.right <= window.innerWidth + 2 && b.bottom <= window.innerHeight + 2;

            return {
              isActive,
              overlapsTitle,
              distance,
              withinViewport,
              titleRect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
              cardRect: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
            };
          });

          assert.equal(result.isActive, true, 'Constellation inspector card is visible and active on title hover');
          assert.equal(result.overlapsTitle, false, 'Inspector card must never overlap the constellation title element');
          assert.equal(result.withinViewport, true, 'Inspector card stays within visible viewport margins');
          assert.ok(result.distance <= 220, `Inspector card distance (${Math.round(result.distance)}px) must be near title (<= 220px)`);

          await page.close();
        });
      }
    }
  } finally {
    await browser.close();
    await preview.close();
  }
});
