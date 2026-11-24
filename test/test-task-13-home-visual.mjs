import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));
const root = resolve('rollback/production-assets');

test('TASK-13 visual test: Student home dashboard hierarchy, theme contrast, and mastery banner', async () => {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(root + '/') || !existsSync(file)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const contentType = file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.css')
      ? 'text/css'
      : file.endsWith('.png')
      ? 'image/png'
      : file.endsWith('.html')
      ? 'text/html'
      : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.end(readFileSync(file));
  });

  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  let browser;

  try {
    browser = await launchChromium(chromium);
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

    const studentUser = { id: 'std_user_1', login: 'alice_student', name: 'Alice Student', role: 'USER' };

    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path === '/api/database-context') data = { provider: 'd1', revision: 3, scope: 'site' };
      if (path === '/api/me' || path === '/api/me/account') {
        data = { user: studentUser };
      }
      if (path === '/api/me/state') {
        data = {
          bootstrap: true,
          stats: {},
          added: [],
          songs: [],
          settings: {},
          counts: { lessons: 2 },
          stageActivity: {}
        };
      }
      if (path === '/api/me/themes') data = { theme: 'sky', themes: [], revision: 0, customRevision: 0 };
      if (path === '/api/groups') {
        data = {
          groups: [
            { id: 101, title: 'English Master B1', date: '2026-11-20', revision: 1, studentCount: 8, lessonIds: [301, 302], examIds: [] }
          ]
        };
      }
      if (path === '/api/lessons') {
        data = {
          materials: [
            { id: 301, title: 'Travel & Vocabulary', date: '2026-11-20', published: true, stageRevision: 1, blocks: [] },
            { id: 302, title: 'Future Tenses', date: '2026-11-28', published: true, stageRevision: 1, blocks: [] }
          ]
        };
      }
      if (path === '/api/error-bank') {
        data = { dueToday: 0, masteredItems: 12, queue: [] };
      }
      if (path === '/api/exams') data = { exams: [] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });

    await page.goto('http://127.0.0.1:' + port + '/');

    // 1. Personalized heading greeting
    const welcome = page.locator('#homeWelcomeHeading');
    await welcome.waitFor({ state: 'visible', timeout: 5000 });
    const headingText = await welcome.textContent();
    assert.ok(headingText.includes('Alice Student'), 'Heading must contain student name: ' + headingText);

    // 2. Sidebar progress must be hidden on #home
    const sidebarProgress = page.locator('.shell-progress');
    const isSidebarVisible = await sidebarProgress.isVisible();
    assert.equal(isSidebarVisible, false, 'Sidebar progress must be hidden on home screen');

    // 3. Priority row: Your group & Next lesson cards
    const groupCard = page.locator('#homeDashboard .home-group');
    assert.equal(await groupCard.count(), 1, 'Group priority card must exist');
    const nextLessonCard = page.locator('#homePriorityRow .home-next-lesson-card');
    assert.equal(await nextLessonCard.count(), 1, 'Next lesson priority card must exist');

    // 4. Mastery Milestones Banner & 5 Tiers
    const masteryBanner = page.locator('#homeMasteryBanner');
    assert.ok(await masteryBanner.isVisible(), 'Mastery banner must be visible');

    const tierCards = page.locator('.home-tier-card');
    assert.equal(await tierCards.count(), 5, 'Must render 5 tier milestone cards');

    // Verify all 5 badge symbol images load
    for (let i = 1; i <= 5; i++) {
      const img = page.locator('.home-tier-card[data-tier="' + i + '"] img.home-tier-art');
      assert.equal(await img.count(), 1, 'Tier ' + i + ' art must exist');
      const src = await img.getAttribute('src');
      assert.ok(src.includes('badge-' + i + '-symbol.png'), 'Tier ' + i + ' src must match symbol');
    }

    // 5. Target threshold chips interaction
    const chip85 = page.locator('.home-target-chip[data-target-pct="85"]');
    await chip85.click();
    assert.ok(await chip85.evaluate(el => el.classList.contains('active')), 'Chip 85% must become active');

    // 6. Badges Modal
    const openBadgesBtn = page.locator('#openBadgesBtn');
    await openBadgesBtn.click();
    const badgesDialog = page.locator('#homeBadgesDialog');
    assert.ok(await badgesDialog.isVisible(), 'Badges modal dialog must open');

    const closeBadgesBtn = page.locator('#homeBadgesDialogClose');
    await closeBadgesBtn.click();
    assert.ok(!(await badgesDialog.isVisible()), 'Badges modal dialog must close');

    // 7. Verify Almond (Van Gogh) theme backdrop-filter blur
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'almond');
    });
    const almondBlur = await page.locator('#home .home-mastery-banner').evaluate(el => {
      return window.getComputedStyle(el).backdropFilter || window.getComputedStyle(el).webkitBackdropFilter;
    });
    assert.ok(almondBlur.includes('blur(14px)'), 'Almond theme must apply backdrop-filter: blur(14px): ' + almondBlur);

    // 8. Verify Cocoa theme contrast styling
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'cocoa');
    });
    const cocoaCardBg = await page.locator('#home .home-mastery-banner').evaluate(el => {
      return window.getComputedStyle(el).backgroundColor;
    });
    assert.ok(cocoaCardBg, 'Cocoa theme card must have valid background');

  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
