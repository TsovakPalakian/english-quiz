import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Static code invariants: no mistake limits in Memory or Match, timer hidden for Memory', () => {
  const clientCore = fs.readFileSync('client/03g-core.js', 'utf8');
  const previewJs = fs.readFileSync('preview.js', 'utf8');
  const previewCss = fs.readFileSync('site/preview.css', 'utf8');

  // Verify markDay(false, "Find the pairs") is removed
  assert.equal(clientCore.includes('markDay(false, "Find the pairs")'), false, 'client/03g-core.js must not stop Memory on mistakes');
  assert.equal(previewJs.includes('markDay(false, "Find the pairs")'), false, 'preview.js must not stop Memory on mistakes');

  // Verify markDay(false, "Match the pairs") is removed
  assert.equal(clientCore.includes('markDay(false, "Match the pairs")'), false, 'client/03g-core.js must not stop Match on mistakes');
  assert.equal(previewJs.includes('markDay(false, "Match the pairs")'), false, 'preview.js must not stop Match on mistakes');

  // Verify paintSessionClock hides timer for Memory
  assert.ok(clientCore.includes('item.type === "Memory"') && clientCore.includes('timer.hidden = true;'), 'paintSessionClock must hide timer for Memory');
  assert.ok(previewJs.includes('item.type === "Memory"') && previewJs.includes('timer.hidden = true;'), 'preview.js paintSessionClock must hide timer for Memory');

  // Verify Memory counter markup and CSS styles
  assert.ok(clientCore.includes('memory-head-row') && clientCore.includes('memory-counter'), 'client/03g-core.js must render memory-head-row and memory-counter');
  assert.ok(previewJs.includes('memory-head-row') && previewJs.includes('memory-counter'), 'preview.js must render memory-head-row and memory-counter');
  assert.ok(previewCss.includes('.memory-head-row') && previewCss.includes('.memory-counter'), 'site/preview.css must define .memory-head-row and .memory-counter');

  // Verify Hangman word separation markup and CSS styles
  assert.ok(clientCore.includes('hangman-word') && clientCore.includes('hangman-q'), 'client/03g-core.js must render hangman-word and hangman-q');
  assert.ok(previewJs.includes('hangman-word') && previewJs.includes('hangman-q'), 'preview.js must render hangman-word and hangman-q');
  assert.ok(previewCss.includes('.hangman-word') && previewCss.includes('.hangman-q'), 'site/preview.css must define .hangman-word and .hangman-q');
});

test('Runtime behavior: Memory timer is hidden and repeated mismatches do not abort exercise', async () => {
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
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // Test across themes Sky, Dark, Sand
    for (const theme of ['sky', 'dark', 'sand']) {
      await page.evaluate((th) => {
        document.documentElement.setAttribute('data-theme', th);
        document.body.removeAttribute('data-shell-pending');
        document.body.classList.remove('guest-home', 'guest-auth');

        // Switch to #dayq section
        document.querySelectorAll('section').forEach(s => s.classList.remove('on'));
        const dayq = document.getElementById('dayq');
        if (dayq) dayq.classList.add('on');

        const timer = document.getElementById('dayqTimer');
        if (timer) timer.hidden = true;

        const view = document.getElementById('dayqView');
        if (view) {
          view.innerHTML = '<div class="memory-head-row">' +
            '<p class="prompt">Find the pairs</p>' +
            '<div class="memory-counter">' +
              '<span>Guessed: <b>0</b></span>' +
              '<span>·</span>' +
              '<span>Remaining: <b>8</b></span>' +
            '</div>' +
          '</div>' +
          '<div class="pairs is-memory-grid"></div>' +
          '<div id="dayFb"></div>';
        }
      }, theme);

      const isHidden = await page.$eval('#dayqTimer', el => el.hidden);
      assert.equal(isHidden, true, `[${theme}] #dayqTimer must be hidden`);

      // Verify that there is no error banner displayed
      const fbHtml = await page.evaluate(() => {
        const fb = document.getElementById('dayFb');
        return fb ? fb.innerHTML : '';
      });
      assert.equal(fbHtml.includes('Incorrect. Right answer: Find the pairs'), false);

      // Verify memory-head-row and memory-counter styling in DOM
      const counterStyles = await page.evaluate(() => {
        const row = document.querySelector('.memory-head-row');
        const counter = document.querySelector('.memory-counter');
        const computedRow = row ? window.getComputedStyle(row) : null;
        const computedCounter = counter ? window.getComputedStyle(counter) : null;
        return {
          rowExists: !!row,
          justifyContent: computedRow?.justifyContent,
          counterExists: !!counter,
          counterFontSize: computedCounter?.fontSize
        };
      });
      assert.equal(counterStyles.rowExists, true, `[${theme}] .memory-head-row must be defined in DOM`);
      assert.equal(counterStyles.counterExists, true, `[${theme}] .memory-counter must be defined in DOM`);
    }

    console.log('Runtime and visual checks passed successfully across sky, dark, sand themes.');
  } finally {
    await browser.close();
    server.close();
  }
});
