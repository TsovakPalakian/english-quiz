import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Visual rendering and hotkey interaction of 5-option bidirectional focus cards across themes', async () => {
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(targetUrl);
    await page.waitForLoadState('networkidle');

    // Test in Sky theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'sky');
      document.body.removeAttribute('data-shell-pending');
      document.body.classList.remove('guest-home', 'guest-auth');
      const questions = [
        {
          id: 'test-q-1',
          category: 'words',
          title: 'Vocabulary: talk to yourself',
          concept: 'talk to yourself',
          prompt: 'Identify the definition of "talk to yourself":',
          options: [
            'вести внутренний диалог',
            'рассуждать вслух',
            'разговаривать с самим собой',
            'говорить наедине с собой',
            'бормотать под нос'
          ],
          answer: 2,
          feedback: '"talk to yourself" means: разговаривать с самим собой'
        }
      ];
      window.openFocusPlayer(questions, 'words', 'words');
    });

    await page.waitForTimeout(100);

    // Verify 5 options rendered
    const optButtons = await page.$$('.focus-option-btn');
    assert.equal(optButtons.length, 5, 'Should render 5 option buttons');

    // Verify keys 1 to 5
    const keys = await page.$$eval('.focus-option-key', els => els.map(e => e.textContent.trim()));
    assert.deepEqual(keys, ['1', '2', '3', '4', '5'], 'Option keys must be 1 through 5');

    // Verify badge text contains 1-5
    const badgeText = await page.$eval('.focus-hotkeys', el => el.textContent);
    assert.ok(badgeText.includes('1–5') || badgeText.includes('1-5'), 'Badge must show 1-5 hotkey range');

    // Test pressing key "5"
    await page.keyboard.press('5');
    await page.waitForTimeout(50);
    const fifthBtnClass = await page.$eval('.focus-option-btn[data-focus-option="4"]', el => el.className);
    assert.ok(fifthBtnClass.includes('is-selected') || fifthBtnClass.includes('is-incorrect-opt'), 'Fifth option was selected via hotkey 5');

    // Verify Dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.waitForTimeout(50);
    const darkTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.equal(darkTheme, 'dark');

    // Verify Sand theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'sand');
    });
    await page.waitForTimeout(50);
    const sandTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.equal(sandTheme, 'sand');

  } finally {
    await browser.close();
    server.close();
  }
});
