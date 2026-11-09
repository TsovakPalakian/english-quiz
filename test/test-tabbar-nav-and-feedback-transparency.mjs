import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('CSS rules define tabbar nav title hiding and feedback transparency', () => {
  const css = readFileSync(resolve('site/preview.css'), 'utf8');
  const prodCss = readFileSync(resolve('rollback/production-assets/preview.css'), 'utf8');

  for (const content of [css, prodCss]) {
    // Tabbar nav group title is hidden
    assert.match(
      content,
      /\.tabbar\s+\.nav-group-title\s*\{[^}]*display:\s*none\s*!important/s,
      'Tabbar nav group titles must be hidden with display: none !important'
    );

    // Feedback floating button is semi-transparent in resting state
    assert.match(
      content,
      /\.feedback-floating-btn\s*\{[^}]*opacity:\s*0\.55/s,
      'Feedback button must have opacity: 0.55 in resting state'
    );

    // Feedback floating button transitions to opacity 1 on hover / focus
    assert.match(
      content,
      /\.feedback-floating-btn:hover[^}]*opacity:\s*1/s,
      'Feedback button must transition to opacity 1 on hover'
    );

    // Guest mode feedback floating button is semi-transparent in resting state
    assert.match(
      content,
      /body:is\(\.guest-home,\s*\.guest-auth\)\s+\.feedback-floating-btn\s*\{[^}]*opacity:\s*0\.55/s,
      'Guest feedback button must have opacity: 0.55 in resting state'
    );

    // Guest mode feedback floating button transitions to opacity 1 on hover
    assert.match(
      content,
      /body:is\(\.guest-home,\s*\.guest-auth\)\s+\.feedback-floating-btn:hover[^}]*opacity:\s*1/s,
      'Guest feedback button must transition to opacity 1 on hover'
    );
  }
});

test('Browser visual test: tabbar nav group titles hidden on mobile, feedback button transparent', async () => {
  const root = resolve('rollback/production-assets');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(root + '/') || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = file.split('.').pop();
    const mimeMap = { js: 'text/javascript', css: 'text/css', html: 'text/html', svg: 'image/svg+xml', png: 'image/png' };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.end(readFileSync(file));
  });

  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  let browser;

  try {
    browser = await launchChromium(chromium);

    // 1. Mobile viewport test: tabbar titles are hidden, feedback is transparent
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`http://127.0.0.1:${port}/`);

      // Verify .tabbar exists
      const tabbar = page.locator('.tabbar');
      await tabbar.waitFor({ state: 'attached' });

      // Verify that any .nav-group-title inside .tabbar is not visible (display: none)
      const tabbarTitles = page.locator('.tabbar .nav-group-title');
      const count = await tabbarTitles.count();
      for (let i = 0; i < count; i++) {
        const isHidden = await tabbarTitles.nth(i).evaluate(el => window.getComputedStyle(el).display === 'none');
        assert.ok(isHidden, `Tabbar title at index ${i} must have display: none`);
      }

      // Dismiss or hide test banner if present so it doesn't intercept pointer events
      await page.evaluate(() => {
        const b = document.getElementById('learning-main-banner');
        if (b) b.remove();
      });

      // Verify floating feedback button resting opacity
      const feedbackBtn = page.locator('#feedbackFloatingTrigger');
      await feedbackBtn.waitFor({ state: 'attached' });
      const restingOpacity = await feedbackBtn.evaluate(el => window.getComputedStyle(el).opacity);
      assert.equal(restingOpacity, '0.55', 'Feedback button must have resting opacity of 0.55 on mobile');

      // Verify floating feedback button hover opacity (waiting for transition to complete)
      await feedbackBtn.hover({ force: true });
      await page.waitForFunction(() => window.getComputedStyle(document.getElementById('feedbackFloatingTrigger')).opacity === '1');
      const hoverOpacity = await feedbackBtn.evaluate(el => window.getComputedStyle(el).opacity);
      assert.equal(hoverOpacity, '1', 'Feedback button must have hover opacity of 1');

      await page.close();
    }

    // 2. Desktop viewport test: side nav titles are visible
    {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      await page.goto(`http://127.0.0.1:${port}/`);

      const sideTitles = page.locator('.side nav .nav-group-title:not([hidden])');
      const count = await sideTitles.count();
      assert.ok(count > 0, 'Side navigation must have visible nav group titles on desktop');
      for (let i = 0; i < count; i++) {
        const display = await sideTitles.nth(i).evaluate(el => window.getComputedStyle(el).display);
        assert.notEqual(display, 'none', `Side nav title at index ${i} must be visible on desktop`);
      }

      await page.close();
    }

    // 3. Guest page test: feedback button is transparent on guest page
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`http://127.0.0.1:${port}/`);

      // Set guest class on body and remove test banner
      await page.evaluate(() => {
        document.body.classList.add('guest-home');
        const b = document.getElementById('learning-main-banner');
        if (b) b.remove();
      });

      const feedbackBtn = page.locator('#feedbackFloatingTrigger');
      const guestRestingOpacity = await feedbackBtn.evaluate(el => window.getComputedStyle(el).opacity);
      assert.equal(guestRestingOpacity, '0.55', 'Feedback button must have resting opacity of 0.55 in guest mode');

      await feedbackBtn.hover({ force: true });
      await page.waitForFunction(() => window.getComputedStyle(document.getElementById('feedbackFloatingTrigger')).opacity === '1');
      const guestHoverOpacity = await feedbackBtn.evaluate(el => window.getComputedStyle(el).opacity);
      assert.equal(guestHoverOpacity, '1', 'Feedback button must have hover opacity of 1 in guest mode');

      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
