import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(resolve('package.json'));
const { chromium } = require('playwright');

test('lmPaintChrome safely degrades when MaterialQuiz is not yet loaded', () => {
  const source = readFileSync(new URL('../client/main/material-upgrades.js', import.meta.url), 'utf8');
  const paintChromeMatch = source.match(/const materialChromeBefore=lmPaintChrome;[\s\S]*?lmPaintChrome=function\(\)\{[\s\S]*?\n\};/);
  assert.ok(paintChromeMatch, 'lmPaintChrome definition must exist in material-upgrades.js');
  const snippet = paintChromeMatch[0];

  let ensureCalled = 0;
  const picker = {
    innerHTML: '',
    querySelector: (selector) => {
      if (selector === '[data-material-quiz-menu]') return { remove: () => {} };
      if (selector === '[data-material-quiz-types]') return { hidden: true, querySelectorAll: () => [] };
      return null;
    }
  };

  const context = {
    window: {
      ensureMaterialQuiz: () => { ensureCalled++; return Promise.resolve(); }
    },
    document: {
      getElementById: (id) => (id === 'lmPicker' ? picker : null)
    },
    lmPaintChrome: () => {},
    lmState: { examOwned: false }
  };

  runInNewContext(snippet, context);

  // MaterialQuiz is undefined: lmPaintChrome must not throw
  assert.doesNotThrow(() => {
    context.lmPaintChrome();
  });

  assert.equal(ensureCalled, 1, 'ensureMaterialQuiz must be called when MaterialQuiz is missing');
  assert.match(picker.innerHTML, /data-quiz="Choice"/, 'Choice quiz type must be rendered');
  assert.match(picker.innerHTML, /data-quiz="Hangman"/, 'Hangman quiz type must be rendered');
  assert.match(picker.innerHTML, /data-quiz="Flip"/, 'Flip quiz type must be rendered in non-exam mode');

  // When examOwned is true, Flip should not be included
  context.lmState.examOwned = true;
  context.lmPaintChrome();
  assert.doesNotMatch(picker.innerHTML, /data-quiz="Flip"/, 'Flip must be excluded in exam mode');
});

test('Playwright visual verification: navigation from daysetup to material does not crash when MaterialQuiz is not loaded', async () => {
  const root = resolve('rollback/production-assets');
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    let filePath = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (!existsSync(filePath)) {
      filePath = resolve('site', path === '/' ? 'preview.html' : '.' + path);
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(readFileSync(filePath));
  });

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Simulate navigation to daysetup as DEVELOPER
    await page.evaluate(() => {
      window.authUser = { role: 'DEVELOPER', id: 'dev-1', name: 'TsovakDev' };
      window.accountReady = true;
      if (typeof show === 'function') show('daysetup');
    });
    await page.waitForTimeout(300);

    // Call lmPaintChrome explicitly while MaterialQuiz is null or undefined to test resilience
    await page.evaluate(() => {
      delete window.MaterialQuiz;
      if (typeof lmPaintChrome === 'function') {
        lmPaintChrome();
      }
    });

    // Check no uncaught exceptions occurred
    const typesErrors = errors.filter(msg => msg.includes("reading 'types'") || msg.includes('MaterialQuiz'));
    assert.deepEqual(typesErrors, [], 'No TypeError reading types must be thrown');

    // Visual screenshot of verification
    const screenshotPath = resolve('docs/bug-a5b4078d-screenshot-verification.png');
    await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 0, width: 1280, height: 600 } });
    assert.ok(existsSync(screenshotPath), 'Verification screenshot must exist');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
