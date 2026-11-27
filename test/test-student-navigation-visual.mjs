import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));
const root = resolve('site');

test('student navigation hides Speakout, My quizzes, and removes Learning progress widget', async () => {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(path === '/' || path === '/index.html' ? 'site/preview.html' : '.' + path);
    if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(readFileSync(file));
  });

  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  let browser;

  try {
    browser = await launchChromium(chromium);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const studentUser = { id: 'student_1', login: 'alice', name: 'Alice', role: 'USER' };

    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path === '/api/database-context') data = { provider: 'd1', revision: 3, scope: 'site' };
      if (path === '/api/me' || path === '/api/me/account') {
        data = { user: studentUser, migrationCapabilities: { learningWorkbench: true } };
      }
      if (path === '/api/me/state') {
        data = { bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: { lessons: 1 }, stageActivity: {} };
      }
      if (path === '/api/me/themes') data = { theme: 'sky', themes: [], revision: 0, customRevision: 0 };
      if (path === '/api/groups') data = { groups: [{ id: 41, title: 'A1 Group', date: '2026-10-19', revision: 1, studentCount: 1, lessonIds: [31], examIds: [51] }] };
      if (path === '/api/lessons') data = { materials: [{ id: 31, title: 'Lesson 1', date: '2026-10-19', published: true, stageRevision: 1, blocks: [] }] };
      if (path === '/api/exams') data = { exams: [] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });

    await page.goto('http://127.0.0.1:' + port + '/');
    await page.waitForFunction(() => typeof accountReady !== 'undefined' && accountReady);

    // 1. Verify Speakout is hidden for student
    const speakoutBtn = page.locator('.side nav [data-jump="speakout"]');
    assert.equal(await speakoutBtn.isVisible(), false, 'Speakout button must be hidden for student');

    // 2. Verify My quizzes is hidden for student
    const mineBtn = page.locator('.side nav [data-workbench-mine]');
    assert.equal(await mineBtn.isVisible(), false, 'My quizzes button must be hidden for student');

    // 3. Verify .shell-progress widget is completely removed
    const progressWidget = page.locator('.shell-progress');
    assert.equal(await progressWidget.count(), 0, 'Learning progress widget (.shell-progress) must be completely removed from DOM');

    // 4. Verify allowed student navigation buttons are visible
    const expected = ['Home', 'Lessons', 'Exam', 'Words', 'Grammar', 'Entertainment', 'Messages', 'Settings'];
    const visibleLabels = await page.locator('.side nav > button:visible').evaluateAll(nodes => nodes.map(n => n.textContent.trim().split('·')[0].trim()));
    assert.deepEqual(visibleLabels, expected, 'Visible navigation labels must match student scope');

    // 5. Open lesson and verify Speech and Voice Mode are hidden for student
    await page.locator('.side nav [data-jump="days"]').click();
    await page.locator('[data-lm-open="31"]').waitFor();
    await page.locator('[data-lm-open="31"]').click();
    await page.locator('#material.on').waitFor();

    const speechBtn = page.locator('[data-workbench-lesson-speech]');
    assert.equal(await speechBtn.count(), 0, 'Speech tab button must be absent for student in lesson tools');

    const voiceBtn = page.locator('#lmVoiceModeBtn');
    assert.equal(await voiceBtn.count(), 0, 'Voice Mode button must be absent for student in lesson practice modes');

    // 6. Visual screenshots across themes
    const side = page.locator('.side');
    for (const theme of ['sky', 'dark', 'sand']) {
      await page.evaluate(t => {
        if (typeof applyTheme === 'function') applyTheme(t, { persist: false });
        else document.documentElement.setAttribute('data-theme', t);
      }, theme);
      await page.waitForTimeout(150);
      const screenshotPath = resolve(`docs/task-student-sidebar-${theme}.png`);
      await side.screenshot({ path: screenshotPath });
      assert.ok(existsSync(screenshotPath), `${theme} theme screenshot must exist`);
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
