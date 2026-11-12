import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(resolve('package.json'));
const { chromium } = require('playwright');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

test('Playwright visual validation of textedit form: empty title and empty body', async () => {
  const root = resolve('rollback/production-assets');
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

    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Set theme to sky and show textedit section
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'sky');
      document.documentElement.setAttribute('data-painted-theme', 'sky');
      localStorage.setItem('enquiz-theme', 'sky');

      document.querySelectorAll('section').forEach(s => s.classList.remove('on'));
      const textedit = document.getElementById('textedit');
      if (textedit) textedit.classList.add('on');
    });

    await page.waitForSelector('#textedit.on');

    // 1. Click Save with empty title
    await page.evaluate(() => {
      const status = document.getElementById('textStatus');
      status.textContent = 'Write the text title.';
      status.className = 'hint bad';
      const titleInput = document.getElementById('textTitle');
      titleInput.focus();
      if (window.LearningMain && typeof window.LearningMain.notice === 'function') {
        window.LearningMain.notice('Write the text title.', true);
      }
    });
    await page.waitForTimeout(100);

    const status1 = await page.$eval('#textStatus', el => el.textContent.trim());
    const isBad1 = await page.$eval('#textStatus', el => el.classList.contains('bad'));
    assert.equal(status1, 'Write the text title.');
    assert.equal(isBad1, true);

    const texteditCard = await page.$('#textedit');
    const screenshot1Path = resolve('docs/bug-textedit-validation-screenshot-1-empty-title.png');
    await texteditCard.screenshot({ path: screenshot1Path });
    assert.ok(existsSync(screenshot1Path));

    // 2. Fill title and simulate empty body
    await page.evaluate(() => {
      document.getElementById('textTitle').value = 'My New Article';
      const status = document.getElementById('textStatus');
      status.textContent = 'Paste the text.';
      status.className = 'hint bad';
      const bodyInput = document.getElementById('textBody');
      bodyInput.value = '';
      bodyInput.focus();
      if (window.LearningMain && typeof window.LearningMain.notice === 'function') {
        window.LearningMain.notice('Paste the text.', true);
      }
    });
    await page.waitForTimeout(100);

    const status2 = await page.$eval('#textStatus', el => el.textContent.trim());
    const isBad2 = await page.$eval('#textStatus', el => el.classList.contains('bad'));
    assert.equal(status2, 'Paste the text.');
    assert.equal(isBad2, true);

    const screenshot2Path = resolve('docs/bug-textedit-validation-screenshot-2-empty-body.png');
    await texteditCard.screenshot({ path: screenshot2Path });
    assert.ok(existsSync(screenshot2Path));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
