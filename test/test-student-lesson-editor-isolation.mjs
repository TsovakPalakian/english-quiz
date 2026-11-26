import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

const rootDir = process.cwd();

test('Stage 1: Static markup contract - editor and action buttons must be hidden by default', () => {
  const siteHtml = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');
  const rootHtml = fs.readFileSync(path.join(rootDir, 'preview.html'), 'utf8');

  // Both HTML files must declare #lmEditor with hidden attribute
  assert.ok(
    siteHtml.includes('id="lmEditor" hidden'),
    'site/preview.html must declare #lmEditor with hidden attribute'
  );
  assert.ok(
    rootHtml.includes('id="lmEditor" hidden'),
    'preview.html must declare #lmEditor with hidden attribute'
  );

  // Both HTML files must declare #lmSave and #lmPublish with hidden attribute
  assert.ok(
    siteHtml.includes('id="lmSave" hidden'),
    'site/preview.html must declare #lmSave with hidden attribute'
  );
  assert.ok(
    siteHtml.includes('id="lmPublish" hidden'),
    'site/preview.html must declare #lmPublish with hidden attribute'
  );
  assert.ok(
    rootHtml.includes('id="lmSave" hidden'),
    'preview.html must declare #lmSave with hidden attribute'
  );
  assert.ok(
    rootHtml.includes('id="lmPublish" hidden'),
    'preview.html must declare #lmPublish with hidden attribute'
  );
});

test('Stage 2: Code contract - paintDeveloperChrome and paintMaterial enforce student view isolation', () => {
  const accountJs = fs.readFileSync(path.join(rootDir, 'client/20-account.js'), 'utf8');
  const lessonsJs = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');

  // client/20-account.js must hide #lmEditor and teacher buttons when user is student or !canEditLessons()
  assert.ok(
    accountJs.includes('if (student || (typeof canEditLessons === \'function\' && !canEditLessons()))'),
    'client/20-account.js must guard #lmEditor, #lmSave and #lmPublish for students'
  );

  // client/52-lessons.js paintMaterial must enforce preview mode for non-editors
  assert.ok(
    lessonsJs.includes('if (!canEditLessons()) lmState.mode = "preview";'),
    'client/52-lessons.js paintMaterial must force lmState.mode to preview when !canEditLessons()'
  );
});

test('Stage 3: Playwright UI visual test - student reload on lesson screen renders preview, never editor', async () => {
  const lessonsRaw = fs.readFileSync(path.join(rootDir, 'data/lessons.json'), 'utf8');

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    let filePath;
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/preview.html') {
      filePath = path.resolve(rootDir, 'site/preview.html');
    } else if (parsedUrl.pathname.startsWith('/preview.js')) {
      filePath = path.resolve(rootDir, 'preview.js');
    } else if (parsedUrl.pathname.startsWith('/api/')) {
      if (parsedUrl.pathname === '/api/me') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          user: { id: 'sasha', name: 'Sasha', login: 'sasha', role: 'USER' }
        }));
        return;
      }
      if (parsedUrl.pathname === '/api/lessons') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(lessonsRaw);
        return;
      }
      if (parsedUrl.pathname === '/api/groups') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          groups: [{ id: 'group-b1', title: 'B1 Group', level: 'B1', lessonIds: ['lm-b1-eval-practice'] }]
        }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    } else {
      filePath = path.resolve(rootDir, 'site', '.' + parsedUrl.pathname);
      if (!fs.existsSync(filePath)) filePath = path.resolve(rootDir, 'build/test-worker-assets', '.' + parsedUrl.pathname);
      if (!fs.existsSync(filePath)) filePath = path.resolve(rootDir, '.' + parsedUrl.pathname);
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const mime = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png'
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 860 } });

    // Seed session to simulate page reload directly on the material screen
    await page.addInitScript((data) => {
      localStorage.setItem('enquiz-theme', 'sky');
      localStorage.setItem('enquiz-auth-on', '1');
      localStorage.setItem('enquiz-material-demo', data);
      sessionStorage.setItem('enquiz-place', JSON.stringify({
        id: 'material',
        materialId: 'lm-b1-eval-practice',
        classGroupId: 'group-b1'
      }));
    }, lessonsRaw);

    await page.goto(`http://127.0.0.1:${port}/preview.html`);
    await page.waitForTimeout(600);

    // Provide student context
    await page.evaluate(() => {
      window.authUser = { id: 'sasha', name: 'Sasha', login: 'sasha', role: 'USER' };
      window.accountReady = true;
      window.classGroups = [{
        id: 'group-b1',
        title: 'B1 Group',
        date: '2026-11-25',
        hidden: false,
        lessonIds: ['lm-b1-eval-practice']
      }];
      window.classGroupId = 'group-b1';
      if (typeof applyTheme === 'function') applyTheme('sky', { sync: false });
      if (typeof paintDeveloperChrome === 'function') paintDeveloperChrome();
      if (typeof lmOpenLesson === 'function') {
        lmOpenLesson('lm-b1-eval-practice');
      }
    });

    await page.waitForTimeout(800);

    // Verify #lmEditor is strictly hidden
    const editorEl = page.locator('#lmEditor');
    const isEditorHidden = await editorEl.evaluate(el => el.hidden || window.getComputedStyle(el).display === 'none');
    assert.ok(isEditorHidden, 'Teacher editor (#lmEditor) must be strictly hidden for students');

    // Verify Save draft and Publish buttons are strictly hidden
    const isSaveHidden = await page.locator('#lmSave').evaluate(el => el.hidden || window.getComputedStyle(el).display === 'none');
    const isPublishHidden = await page.locator('#lmPublish').evaluate(el => el.hidden || window.getComputedStyle(el).display === 'none');
    assert.ok(isSaveHidden, '#lmSave button must be hidden for students');
    assert.ok(isPublishHidden, '#lmPublish button must be hidden for students');

    // Verify #lmPreview is visible
    const isPreviewVisible = await page.locator('#lmPreview').evaluate(el => !el.hidden && window.getComputedStyle(el).display !== 'none');
    assert.ok(isPreviewVisible, 'Student lesson preview (#lmPreview) must be visible');

    // Verify lesson content is displayed
    const lessonTitle = await page.locator('.lm-read-title').textContent();
    assert.ok(lessonTitle.includes('B1 Practice: Travel & Daily Life'), 'Lesson title must be displayed in preview');

    // Capture and verify visual screenshots across themes
    // 1. Sky theme (already applied)
    const skyScreenshotPath = path.join(rootDir, 'docs/task-student-lesson-view-sky.png');
    await page.screenshot({ path: skyScreenshotPath });
    assert.ok(fs.existsSync(skyScreenshotPath), 'Sky verification screenshot must exist in docs/');

    // 2. Dark theme
    await page.evaluate(() => {
      if (typeof applyTheme === 'function') applyTheme('dark', { sync: false });
    });
    await page.waitForTimeout(200);
    const darkScreenshotPath = path.join(rootDir, 'docs/task-student-lesson-view-dark.png');
    await page.screenshot({ path: darkScreenshotPath });
    assert.ok(fs.existsSync(darkScreenshotPath), 'Dark verification screenshot must exist in docs/');

    // 3. Sand theme
    await page.evaluate(() => {
      if (typeof applyTheme === 'function') applyTheme('sand', { sync: false });
    });
    await page.waitForTimeout(200);
    const sandScreenshotPath = path.join(rootDir, 'docs/task-student-lesson-view-sand.png');
    await page.screenshot({ path: sandScreenshotPath });
    assert.ok(fs.existsSync(sandScreenshotPath), 'Sand verification screenshot must exist in docs/');

  } finally {
    await browser.close();
    server.close();
  }
});
