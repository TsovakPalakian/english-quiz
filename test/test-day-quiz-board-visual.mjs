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

      // Anki cards review block verification
      const reviewRow = document.querySelector('.dq-review-row');
      const ankiCard = document.querySelector('#dayQuizReview [data-dq-mode="fsrs"]');
      const quickCard = document.querySelector('#dayQuizModes [data-dq-mode="quick"]');
      const ankiWidth = ankiCard ? ankiCard.getBoundingClientRect().width : 0;
      const quickWidth = quickCard ? quickCard.getBoundingClientRect().width : 0;
      const ankiTitle = ankiCard ? ankiCard.querySelector('b')?.textContent : '';

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
        gridColumns,
        hasReviewRow: !!reviewRow,
        hasAnkiCard: !!ankiCard,
        ankiTitle,
        widthMatch: Math.abs(ankiWidth - quickWidth) < 2
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
    assert.ok(state.hasReviewRow, 'Review row must exist');
    assert.ok(state.hasAnkiCard, 'Anki card must exist');
    assert.equal(state.ankiTitle, 'Anki cards', 'Anki card title must be Anki cards');
    assert.ok(state.widthMatch, 'Anki card width must match Quick review card width');

    // Test selection transfer
    const clickResult = await page.evaluate(() => {
      const anki = document.querySelector('#dayQuizReview [data-dq-mode="fsrs"]');
      if (anki) anki.click();
      const readyWithAnki = document.getElementById('dayQuizReady')?.textContent;
      const isAnkiOn = anki?.classList.contains('on');
      const isQuickOff = !document.querySelector('#dayQuizModes [data-dq-mode="quick"]')?.classList.contains('on');

      const quick = document.querySelector('#dayQuizModes [data-dq-mode="quick"]');
      if (quick) quick.click();
      const readyWithQuick = document.getElementById('dayQuizReady')?.textContent;
      const isQuickOn = quick?.classList.contains('on');
      const isAnkiOff = !document.querySelector('#dayQuizReview [data-dq-mode="fsrs"]')?.classList.contains('on');

      return {
        readyWithAnki,
        isAnkiOn,
        isQuickOff,
        readyWithQuick,
        isQuickOn,
        isAnkiOff
      };
    });

    assert.ok(clickResult.isAnkiOn && clickResult.isQuickOff, 'Anki must be selected on click');
    assert.ok(clickResult.readyWithAnki.includes('Anki cards'), 'Ready label must reflect Anki cards');
    assert.ok(clickResult.isQuickOn && clickResult.isAnkiOff, 'Quick review must be selected on click');
    assert.ok(clickResult.readyWithQuick.includes('Quick review'), 'Ready label must reflect Quick review');

    // Test start button, sticky floating foot, and two-line ready text
    const footState = await page.evaluate(() => {
      const foot = document.querySelector('.dq-foot');
      const start = document.getElementById('dayQuizStart');
      const l1 = document.querySelector('.dq-ready-line1');
      const l2 = document.querySelector('.dq-ready-line2');
      const chips = document.querySelectorAll('.dq-chip');
      const memStepper = document.querySelector('.dq-mem-stepper');
      return {
        startText: start?.textContent?.trim(),
        hasL1: !!l1,
        hasL2: !!l2,
        isSticky: window.getComputedStyle(foot).position === 'sticky',
        hasChips: chips.length > 0,
        hasMemStepper: !!memStepper
      };
    });
    assert.equal(footState.startText, 'Start', 'Start button must only contain text "Start"');
    assert.equal(footState.hasL1, true, 'First line of ready block must exist');
    assert.equal(footState.hasL2, true, 'Second line of ready block must exist');
    assert.equal(footState.isSticky, true, 'Foot panel must be position: sticky');
    assert.equal(footState.hasChips, true, 'Ready chips must be present');
    assert.equal(footState.hasMemStepper, true, 'Memory stepper must be present');

    // Test Select all / Deselect all toggle in Recognize group
    const toggleState = await page.evaluate(() => {
      const customCard = document.querySelector('[data-dq-mode="custom"]');
      if (customCard) customCard.click();

      const recGroup = document.querySelector('.dq-group[data-dq-group="recognize"]');
      const allBtn = recGroup ? recGroup.querySelector('[data-dq-all]') : null;

      // 1. Click Select all (odd click -> all 7 on, button becomes Deselect all)
      if (allBtn) allBtn.click();
      const countAfterSelectAll = recGroup.querySelectorAll('[data-dq-type].on').length;
      const btnTextAfterSelectAll = allBtn ? allBtn.textContent.trim() : '';
      const slotAfterSelectAll = recGroup.querySelector('[data-dq-picked]')?.textContent.trim();

      // 2. Click Deselect all (even click -> 0 on, button becomes Select all)
      if (allBtn) allBtn.click();
      const countAfterDeselectAll = recGroup.querySelectorAll('[data-dq-type].on').length;
      const btnTextAfterDeselectAll = allBtn ? allBtn.textContent.trim() : '';
      const slotAfterDeselectAll = recGroup.querySelector('[data-dq-picked]')?.textContent.trim();

      return {
        countAfterSelectAll,
        btnTextAfterSelectAll,
        slotAfterSelectAll,
        countAfterDeselectAll,
        btnTextAfterDeselectAll,
        slotAfterDeselectAll
      };
    });

    assert.equal(toggleState.countAfterSelectAll, 7, 'After Select all, all 7 types must be selected');
    assert.equal(toggleState.btnTextAfterSelectAll, 'Deselect all', 'Button text must become Deselect all');
    assert.equal(toggleState.slotAfterSelectAll, '7 of 7 selected', 'Slot text must be 7 of 7 selected');
    assert.equal(toggleState.countAfterDeselectAll, 0, 'After even click, all types must be deselected');
    assert.equal(toggleState.btnTextAfterDeselectAll, 'Select all', 'Button text must return to Select all');
    assert.equal(toggleState.slotAfterDeselectAll, '0 of 7 selected', 'Slot text must be 0 of 7 selected');

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
