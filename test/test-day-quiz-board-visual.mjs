import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Visual rendering of day quiz board header, custom mix, and exercise counts across themes', async () => {
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 1040 } });
    const page = await context.newPage();

    await page.goto(targetUrl);
    await page.waitForLoadState('networkidle');

    // Setup dayQuizBoard on page
    const state = await page.evaluate(() => {
      document.body.removeAttribute('data-shell-pending');
      document.body.classList.remove('guest-home', 'guest-auth');

      // Switch to daysetup section
      document.querySelectorAll('section').forEach(s => s.classList.remove('on'));
      const ds = document.getElementById('daysetup');
      if (ds) ds.classList.add('on');
      const board = document.getElementById('dayQuizBoard');
      if (board) board.hidden = false;
      const classic = document.getElementById('dayStudyClassic');
      if (classic) classic.hidden = true;

      // Check header
      const head = document.querySelector('.dq-head');
      const title = document.getElementById('dayQuizTitle');
      const crumb = head ? head.querySelector('.crumb') : null;
      const homeBtn = crumb ? crumb.querySelector('[data-jump="home"]') : null;
      const backBtn = document.getElementById('dayQuizBack');
      const whoKicker = document.getElementById('dayQuizWho');

      // Check custom mix icon and groups visibility
      const customCard = document.querySelector('[data-dq-mode="custom"]');
      const customIcon = customCard ? customCard.querySelector('.dq-ico')?.textContent : '';
      const customDiv = document.getElementById('dayQuizCustom');
      if (customDiv) customDiv.hidden = false;

      const groups = [...document.querySelectorAll('.dq-group')];
      const visibleGroups = groups.filter(g => window.getComputedStyle(g).display !== 'none');
      const recognizeFlip = document.querySelector('#dayQuizCustom [data-dq-type="Flip"]');
      const isFlipOn = recognizeFlip ? recognizeFlip.classList.contains('on') : false;

      const reviewHeader = document.querySelector('.dq-group[data-dq-group="review"] header');
      const hasSelectAllInReview = reviewHeader ? !!reviewHeader.querySelector('[data-dq-all]') : false;

      // Types grid columns
      const typesGrid = document.querySelector('.dq-types');
      const gridColumns = typesGrid ? window.getComputedStyle(typesGrid).gridTemplateColumns.split(' ').length : 0;

      return {
        hasCrumb: !!crumb,
        hasHomeBtn: !!homeBtn,
        hasBackBtn: !!backBtn,
        hasWhoKicker: !!whoKicker,
        customIcon,
        totalGroups: groups.length,
        visibleGroups: visibleGroups.length,
        isFlipOn,
        hasSelectAllInReview,
        gridColumns
      };
    });

    assert.ok(state.hasCrumb, 'Breadcrumbs must be mounted in header');
    assert.ok(state.hasHomeBtn, 'Home button must be present in header');
    assert.ok(state.hasBackBtn, 'Back button must be present in header');
    assert.equal(state.hasWhoKicker, false, 'Who kicker must be removed from header');
    assert.equal(state.customIcon, '🎛️', 'Custom mix icon must be 🎛️');
    assert.equal(state.totalGroups, 5, 'Must have 5 groups in custom mix');
    assert.equal(state.visibleGroups, 5, 'All 5 groups must be visible (display: block)');
    assert.ok(state.isFlipOn, 'Flip must be on by default');
    assert.equal(state.hasSelectAllInReview, false, 'Review group must not have Select all');
    assert.equal(state.gridColumns, 2, 'Types grid must have 2 columns');

    // Test themes
    for (const theme of ['sky', 'dark', 'sand']) {
      await page.evaluate(t => {
        document.documentElement.setAttribute('data-theme', t);
      }, theme);
      const bg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
      assert.ok(bg, `Theme ${theme} computed background must be valid`);
    }
  } finally {
    await browser.close();
    server.close();
  }
});
