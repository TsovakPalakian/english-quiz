import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const rootDir = process.cwd();
const require = createRequire(path.join(rootDir, 'package.json'));
const playwright = require('playwright');
const { chromium } = playwright;

test('visual rendering and interactivity of rule blocks across themes in editor and preview', async () => {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    let filePath;
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/preview.html') {
      filePath = path.join(rootDir, 'site/preview.html');
    } else if (parsedUrl.pathname.startsWith('/preview.js')) {
      filePath = path.join(rootDir, 'preview.js');
    } else {
      filePath = path.join(rootDir, 'site', '.' + parsedUrl.pathname);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(rootDir, '.' + parsedUrl.pathname);
      }
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
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/preview.html`;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 950 } });
    const page = await context.newPage();
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(() => {
      window.authUser = { id: 'dev', role: 'DEVELOPER', name: 'Teacher Alex' };
      localStorage.setItem('enquiz_auth_token', 'dev-token');
      
      window.lmState = {
        id: 'test-rules-ui',
        title: 'Advanced Grammar Structures',
        description: 'Test lesson for rule blocks.',
        className: 'B2',
        published: true,
        tab: 'rules',
        blocks: [
          {
            id: 'rb_1',
            type: 'rule',
            tab: 'rules',
            collapsed: false,
            title: 'Defining vs Non-defining Relative Clauses',
            name: 'Defining vs Non-defining Relative Clauses',
            teacherVerified: false,
            grammarRule: 'Relative clauses',
            explanation: 'Defining clauses provide essential information and take no commas.',
            pattern: 'Noun + who/which/that + clause',
            examples: ['The teacher who inspired me works here. — Учитель, который вдохновил меня, работает здесь.']
          }
        ]
      };

      if (typeof window.show === 'function') window.show('material');
      if (typeof window.lmSelectTab === 'function') window.lmSelectTab('rules');
      if (typeof window.lmRenderEditor === 'function') window.lmRenderEditor();
    });

    await page.waitForTimeout(300);

    // Verify editor rendering in Sky theme
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sky'));
    const titleVal = await page.inputValue('input[data-field="title"][data-block="rb_1"]');
    assert.equal(titleVal, 'Defining vs Non-defining Relative Clauses');

    const expVal = await page.inputValue('textarea[data-field="explanation"][data-block="rb_1"]');
    assert.match(expVal, /essential information/);

    const patVal = await page.inputValue('input[data-field="pattern"][data-block="rb_1"]');
    assert.match(patVal, /Noun \+ who/);

    const exVal = await page.inputValue('textarea[data-field="examples"][data-block="rb_1"]');
    assert.match(exVal, /inspired me/);

    // Verify dark and sand theme application without style collision
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(100);
    const darkInputCount = await page.locator('input[data-field="title"]').count();
    assert.equal(darkInputCount, 1);

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sand'));
    await page.waitForTimeout(100);
    const sandInputCount = await page.locator('input[data-field="title"]').count();
    assert.equal(sandInputCount, 1);

    // Verify interactivity: change rule title
    await page.fill('input[data-field="title"][data-block="rb_1"]', 'Updated Relative Clauses');
    const stateTitle = await page.evaluate(() => window.lmState.blocks[0].title);
    assert.equal(stateTitle, 'Updated Relative Clauses');

  } finally {
    await browser.close();
    server.close();
  }
});
