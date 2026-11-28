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

test('teacher navigation hides Speakout, Review queue, My quizzes, Voice Mode and Speech, while preserving them for developer', async () => {
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

    // --- Part 1: Teacher (role: ADMIN) ---
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const teacherUser = { id: 'teacher_1', login: 'anna_teacher', name: 'Anna Teacher', role: 'ADMIN' };

      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data = {};
        if (path === '/api/database-context') data = { provider: 'd1', revision: 3, scope: 'site' };
        if (path === '/api/me' || path === '/api/me/account') {
          data = { user: teacherUser, migrationCapabilities: { learningWorkbench: true } };
        }
        if (path === '/api/me/state') {
          data = { bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: { lessons: 1 }, stageActivity: {} };
        }
        if (path === '/api/me/themes') data = { theme: 'sky', themes: [], revision: 0, customRevision: 0 };
        if (path === '/api/groups') data = { groups: [{ id: 41, title: 'A1 Group', date: '2026-10-19', revision: 1, studentCount: 1, lessonIds: [31], examIds: [51] }] };
        if (path === '/api/lessons') data = { materials: [{ id: 31, title: 'Lesson 1', date: '2026-10-19', published: true, stageRevision: 1, blocks: [{ id: 1, type: 'vocab', word: 'precipitation', tab: 'words' }, { id: 2, type: 'rule', title: 'Conditionals', tab: 'rules' }] }] };
        if (path === '/api/exams') data = { exams: [] };
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });

      await page.goto('http://127.0.0.1:' + port + '/');
      await page.waitForFunction(() => typeof accountReady !== 'undefined' && accountReady);

      // 1. Verify Speakout is hidden for teacher
      const speakoutBtn = page.locator('.side nav [data-jump="speakout"]');
      assert.equal(await speakoutBtn.isVisible(), false, 'Speakout button must be hidden for teacher');

      // 2. Verify Review queue is hidden for teacher
      const queueBtn = page.locator('.side nav [data-workbench-queue]');
      assert.equal(await queueBtn.isVisible(), false, 'Review queue button must be hidden for teacher');

      // 3. Verify My quizzes is hidden for teacher
      const mineBtn = page.locator('.side nav [data-workbench-mine]');
      assert.equal(await mineBtn.isVisible(), false, 'My quizzes button must be hidden for teacher');

      // 4. Verify allowed teacher navigation buttons match exactly
      const expectedTeacher = ['Groups', 'Words', 'Grammar', 'Entertainment', 'Messages', 'Accounts', 'Archive', 'Settings'];
      const visibleTeacherLabels = await page.locator('.side nav > button:visible').evaluateAll(nodes => nodes.map(n => n.textContent.trim().split('·')[0].trim()));
      assert.deepEqual(visibleTeacherLabels, expectedTeacher, 'Visible navigation labels must match teacher scope');

      // 5. Open lesson and verify Speech and Voice Mode are hidden for teacher
      await page.evaluate(() => {
        if (typeof lmOpenLesson === 'function') lmOpenLesson(31);
      });
      await page.locator('#material.on').waitFor();

      const speechBtn = page.locator('[data-workbench-lesson-speech]');
      assert.equal(await speechBtn.count(), 0, 'Speech tab button must be absent for teacher in lesson tools');

      const voiceBtn = page.locator('#lmVoiceModeBtn');
      assert.equal(await voiceBtn.count(), 0, 'Voice Mode button must be absent for teacher in lesson practice modes');

      // 6. Visual screenshots across themes for teacher
      const side = page.locator('.side');
      for (const theme of ['sky', 'dark', 'sand']) {
        await page.evaluate(t => {
          if (typeof applyTheme === 'function') applyTheme(t, { persist: false });
          else document.documentElement.setAttribute('data-theme', t);
        }, theme);
        await page.waitForTimeout(150);
        const sidebarPath = resolve(`docs/task-teacher-sidebar-${theme}.png`);
        await side.screenshot({ path: sidebarPath });
        assert.ok(existsSync(sidebarPath), `${theme} teacher sidebar screenshot must exist`);
      }

      const lessonChrome = page.locator('#material .lm-chrome:visible');
      for (const theme of ['sky', 'dark', 'sand']) {
        await page.evaluate(t => {
          if (typeof applyTheme === 'function') applyTheme(t, { persist: false });
          else document.documentElement.setAttribute('data-theme', t);
        }, theme);
        await page.waitForTimeout(150);
        const toolbarPath = resolve(`docs/task-teacher-lesson-toolbar-${theme}.png`);
        await lessonChrome.screenshot({ path: toolbarPath });
        assert.ok(existsSync(toolbarPath), `${theme} teacher lesson toolbar screenshot must exist`);
      }

      await page.close();
    }

    // --- Part 2: Developer (role: DEVELOPER) ---
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const devUser = { id: 'dev_1', login: 'developer_user', name: 'Dev User', role: 'DEVELOPER' };

      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data = {};
        if (path === '/api/database-context') data = { provider: 'd1', revision: 3, scope: 'site' };
        if (path === '/api/me' || path === '/api/me/account') {
          data = { user: devUser, migrationCapabilities: { learningWorkbench: true } };
        }
        if (path === '/api/me/state') {
          data = { bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: { lessons: 1 }, stageActivity: {} };
        }
        if (path === '/api/me/themes') data = { theme: 'sky', themes: [], revision: 0, customRevision: 0 };
        if (path === '/api/groups') data = { groups: [{ id: 41, title: 'A1 Group', date: '2026-10-19', revision: 1, studentCount: 1, lessonIds: [31], examIds: [51] }] };
        if (path === '/api/lessons') data = { materials: [{ id: 31, title: 'Lesson 1', date: '2026-10-19', published: true, stageRevision: 1, blocks: [{ id: 1, type: 'vocab', word: 'precipitation', tab: 'words' }, { id: 2, type: 'rule', title: 'Conditionals', tab: 'rules' }] }] };
        if (path === '/api/exams') data = { exams: [] };
        if (path.includes('/learning-workbench/')) data = {};
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });

      await page.goto('http://127.0.0.1:' + port + '/');
      await page.waitForFunction(() => typeof accountReady !== 'undefined' && accountReady);
      await page.waitForFunction(() => {
        const q = document.querySelector('.side nav [data-workbench-queue]');
        return q && !q.hidden;
      });

      // Verify fields are VISIBLE for developer:
      const speakoutBtn = page.locator('.side nav [data-jump="speakout"]');
      assert.equal(await speakoutBtn.isVisible(), true, 'Speakout button must be visible for developer');

      const queueBtn = page.locator('.side nav [data-workbench-queue]');
      assert.equal(await queueBtn.isVisible(), true, 'Review queue button must be visible for developer');

      const mineBtn = page.locator('.side nav [data-workbench-mine]');
      assert.equal(await mineBtn.isVisible(), true, 'My quizzes button must be visible for developer');

      // Open lesson and verify Speech and Voice Mode are VISIBLE for developer
      await page.evaluate(() => {
        if (typeof lmOpenLesson === 'function') lmOpenLesson(31);
      });
      await page.locator('#material.on').waitFor();

      const speechBtn = page.locator('#material [data-workbench-lesson-speech]:visible');
      assert.equal(await speechBtn.count(), 1, 'Speech tab button must be present for developer');

      const voiceBtn = page.locator('#material #lmVoiceModeBtn:visible');
      assert.equal(await voiceBtn.count(), 1, 'Voice Mode button must be present for developer');

      await page.close();
    }

  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
