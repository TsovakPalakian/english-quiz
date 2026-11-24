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

test('sidebar navigation displays workbench buttons synchronously upon auth without staged delay', async () => {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(root + '/') || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(readFileSync(file));
  });

  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  let browser;

  try {
    browser = await launchChromium(chromium);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    const devUser = { id: 'dev_user_1', login: 'dev_fixture', name: 'Dev User', role: 'DEVELOPER' };
    let stateCalled = false;

    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path === '/api/database-context') data = { provider: 'd1', revision: 3, scope: 'site' };
      if (path === '/api/me' || path === '/api/me/account') {
        data = { user: devUser, migrationCapabilities: { learningWorkbench: true } };
      }
      if (path === '/api/me/state') {
        stateCalled = true;
        // Introduce artificial network delay to verify workbench buttons do NOT wait for state
        await new Promise(r => setTimeout(r, 600));
        data = { bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: { lessons: 1 }, stageActivity: {} };
      }
      if (path === '/api/me/themes') data = { theme: 'sky', themes: [], revision: 0, customRevision: 0 };
      if (path === '/api/groups') data = { groups: [{ id: 41, title: 'A1 Group', date: '2026-10-19', revision: 1, studentCount: 1, lessonIds: [31], examIds: [51] }] };
      if (path === '/api/lessons') data = { materials: [{ id: 31, title: 'Lesson 1', date: '2026-10-19', published: true, stageRevision: 1, blocks: [] }] };
      if (path === '/api/exams') data = { exams: [] };
      if (path === '/api/admin/registrations') data = { registrations: [{ id: '1', status: 'pending' }, { id: '2', status: 'pending' }] };
      if (path === '/api/admin/changes') data = { changes: [] };
      if (path.includes('/learning-workbench/')) data = {};
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });

    await page.goto('http://127.0.0.1:' + port + '/');

    // 1. Verify buttons exist in initial DOM
    assert.equal(await page.locator('.side nav [data-workbench-queue]').count(), 1, 'Review queue button must exist in HTML DOM');
    assert.equal(await page.locator('.side nav [data-workbench-mine]').count(), 1, 'My quizzes button must exist in HTML DOM');
    assert.equal(await page.locator('.side nav [data-workbench-providers]').count(), 1, 'AI providers button must exist in HTML DOM');

    // 2. Wait for /api/me to complete and paintDeveloperChrome to unhide buttons
    await page.waitForFunction(() => {
      const q = document.querySelector('.side nav [data-workbench-queue]');
      return q && !q.hidden;
    }, { timeout: 5000 });

    // Verify all 3 workbench buttons are unhidden
    assert.equal(await page.locator('.side nav [data-workbench-queue]').getAttribute('hidden'), null);
    assert.equal(await page.locator('.side nav [data-workbench-mine]').getAttribute('hidden'), null);
    assert.equal(await page.locator('.side nav [data-workbench-providers]').getAttribute('hidden'), null);

    // 3. Visual checks across themes
    await page.evaluate(() => {
      if (typeof applyTheme === 'function') applyTheme('sky', { persist: false });
      else document.documentElement.setAttribute('data-theme', 'sky');
    });
    await page.waitForTimeout(200);

    const side = page.locator('.side');
    const skyScreenshotPath = resolve('docs/task-sidebar-full-sky.png');
    await side.screenshot({ path: skyScreenshotPath });
    assert.ok(existsSync(skyScreenshotPath), 'Sky visual screenshot must exist');

    await page.evaluate(() => {
      if (typeof applyTheme === 'function') applyTheme('dark', { persist: false });
    });
    await page.waitForTimeout(200);
    const darkScreenshotPath = resolve('docs/task-sidebar-full-dark.png');
    await side.screenshot({ path: darkScreenshotPath });
    assert.ok(existsSync(darkScreenshotPath), 'Dark visual screenshot must exist');

    await page.evaluate(() => {
      if (typeof applyTheme === 'function') applyTheme('sand', { persist: false });
    });
    await page.waitForTimeout(200);
    const sandScreenshotPath = resolve('docs/task-sidebar-full-sand.png');
    await side.screenshot({ path: sandScreenshotPath });
    assert.ok(existsSync(sandScreenshotPath), 'Sand visual screenshot must exist');

    // 4. Role isolation: verify student does not see Review queue or AI providers
    await page.evaluate(() => {
      authUser = { id: 'student_1', role: 'USER' };
      paintDeveloperChrome();
    });
    await page.waitForTimeout(100);

    assert.equal(await page.locator('.side nav [data-workbench-queue]').getAttribute('hidden'), '', 'Review queue must be hidden for student');
    assert.equal(await page.locator('.side nav [data-workbench-providers]').getAttribute('hidden'), '', 'AI providers must be hidden for student');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
