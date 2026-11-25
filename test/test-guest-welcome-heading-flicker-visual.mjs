import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { previewAuthStudio } from '../ops/preview-auth-studio.mjs';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('TASK-FLICKER: Static markup initial visibility contract', () => {
  const html = readFileSync(resolve('site/preview.html'), 'utf8');
  assert.ok(
    html.includes('id="homeWelcomeHeading" style="visibility:hidden"'),
    'site/preview.html must declare #homeWelcomeHeading with style="visibility:hidden" to prevent FOUC breakout'
  );
  assert.ok(
    !html.includes('id="homeWelcomeHeading" style="visibility:visible"'),
    'site/preview.html must not declare #homeWelcomeHeading with style="visibility:visible"'
  );
});

test('TASK-FLICKER: Visual verification: Zero welcome heading flicker on guest load and page refresh', async (t) => {
  const preview = await previewAuthStudio();
  const browser = await launchChromium(chromium);

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    await t.test('Initial guest entry: heading is never rendered above the brand emblem', async () => {
      const visibilityLog = [];

      await page.addInitScript(() => {
        window.__visLog = [];
        const inspect = () => {
          const heading = document.getElementById('homeWelcomeHeading');
          const parent = document.querySelector('.home-heading');
          if (heading && parent && document.body) {
            const headingVis = window.getComputedStyle(heading).visibility;
            const headingDisp = window.getComputedStyle(heading).display;
            const parentDisp = window.getComputedStyle(parent).display;
            const parentVis = window.getComputedStyle(parent).visibility;
            const isPending = document.body.hasAttribute('data-shell-pending');
            const isGuest = document.body.classList.contains('guest-home');
            const rect = heading.getBoundingClientRect();

            // A visible leak occurs if the heading is visible, not display:none, and has measurable dimensions
            const isLeaking = headingVis === 'visible' && parentVis === 'visible' && headingDisp !== 'none' && parentDisp !== 'none' && rect.height > 0;
            if (isLeaking) {
              window.__visLog.push({
                time: Math.round(performance.now()),
                text: heading.textContent.trim(),
                isPending,
                isGuest,
                rect: { top: rect.top, height: rect.height }
              });
            }
          }
        };
        const timer = setInterval(inspect, 4);
        window.addEventListener('load', () => { clearInterval(timer); inspect(); });
      });

      await page.goto(preview.url, { waitUntil: 'networkidle' });

      const leaks = await page.evaluate(() => window.__visLog);
      assert.deepEqual(leaks, [], 'Welcome heading must never leak or be visible during initial guest page load');

      // Final verification: guest home is active and home-heading is display: none
      const finalHeadingDisplay = await page.locator('.home-heading').evaluate(el => window.getComputedStyle(el).display);
      assert.equal(finalHeadingDisplay, 'none', '.home-heading must be display:none in guest-home mode');
    });

    await t.test('Page refresh (reload): heading remains completely invisible throughout refresh cycle', async () => {
      const refreshLeaks = [];

      await page.evaluate(() => {
        window.__refreshVisLog = [];
        const inspect = () => {
          const heading = document.getElementById('homeWelcomeHeading');
          const parent = document.querySelector('.home-heading');
          if (heading && parent && document.body) {
            const headingVis = window.getComputedStyle(heading).visibility;
            const headingDisp = window.getComputedStyle(heading).display;
            const parentDisp = window.getComputedStyle(parent).display;
            const parentVis = window.getComputedStyle(parent).visibility;
            const rect = heading.getBoundingClientRect();

            const isLeaking = headingVis === 'visible' && parentVis === 'visible' && headingDisp !== 'none' && parentDisp !== 'none' && rect.height > 0;
            if (isLeaking) {
              window.__refreshVisLog.push({
                time: Math.round(performance.now()),
                text: heading.textContent.trim(),
                rect: { top: rect.top, height: rect.height }
              });
            }
          }
        };
        const timer = setInterval(inspect, 4);
        window.addEventListener('load', () => { clearInterval(timer); inspect(); });
      });

      await page.reload({ waitUntil: 'networkidle' });

      const leaksAfterReload = await page.evaluate(() => window.__refreshVisLog || []);
      assert.deepEqual(leaksAfterReload, [], 'Welcome heading must never leak or flash during page reload/refresh');
    });

    await t.test('Authenticated transition: greeting cleanly reveals personalized student name', async () => {
      const studentUser = { id: 'std_test_1', login: 'alex', name: 'Alex Student', role: 'USER' };

      await page.evaluate((user) => {
        enterAccount(user);
      }, studentUser);

      const welcome = page.locator('#homeWelcomeHeading');
      await welcome.waitFor({ state: 'visible', timeout: 5000 });

      const headingText = await welcome.textContent();
      assert.ok(headingText.includes('Alex'), 'Authenticated heading must include student first name: ' + headingText);
      assert.equal(headingText.trim(), 'Welcome back, Alex! 👋');

      const headingVis = await welcome.evaluate(el => window.getComputedStyle(el).visibility);
      assert.equal(headingVis, 'visible', 'Welcome heading must be visible for authenticated student');
    });

    await page.close();
  } finally {
    await browser.close();
    await preview.close();
  }
});
