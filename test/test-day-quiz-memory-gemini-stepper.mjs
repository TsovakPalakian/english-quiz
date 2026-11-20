import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Memory stepper click isolation, Keep 1 pair styling, dynamic shortage alert, and Gemini progress bar', async () => {
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

    // Test across themes
    for (const theme of ['sky', 'dark', 'sand']) {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      await page.evaluate((th) => {
        document.documentElement.setAttribute('data-theme', th);
      }, theme);

      // Verify CSS styles for .dq-btn-sub and progress bar
      const cssStyles = await page.evaluate(() => {
        const btnSub = document.querySelector('.dq-btn-sub');
        const progress = document.querySelector('.dq-mem-progress');
        const track = document.querySelector('.dq-progress-track');
        const fill = document.querySelector('.dq-progress-fill');
        const btnComputed = btnSub ? window.getComputedStyle(btnSub) : null;
        const trackComputed = track ? window.getComputedStyle(track) : null;
        return {
          btnSubExists: !!btnSub,
          btnRadius: btnComputed?.borderRadius,
          btnCursor: btnComputed?.cursor,
          trackExists: !!track,
          trackHeight: trackComputed?.height
        };
      });

      assert.equal(cssStyles.btnSubExists, true, `[${theme}] .dq-btn-sub must exist in DOM`);
      assert.equal(cssStyles.btnRadius, '8px', `[${theme}] .dq-btn-sub must have 8px border-radius`);
      assert.equal(cssStyles.btnCursor, 'pointer', `[${theme}] .dq-btn-sub must have cursor: pointer`);
      assert.equal(cssStyles.trackExists, true, `[${theme}] .dq-progress-track must exist`);
      assert.equal(cssStyles.trackHeight, '8px', `[${theme}] .dq-progress-track height must be 8px`);
    }

    // Step 1: Test stepper click isolation
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    const isolationResult = await page.evaluate(() => {
      const customBtn = document.querySelector('#dayQuizBoard [data-dq-mode="custom"]');
      if (customBtn && !customBtn.classList.contains('on')) customBtn.click();

      const memCard = document.querySelector('[data-dq-type="Memory"]');
      const addBtn = memCard.querySelector('[data-dq-mem-add]');
      const subBtn = memCard.querySelector('[data-dq-mem-sub]');
      const valEl = memCard.querySelector('[data-dq-mem-val]');
      const stepper = memCard.querySelector('[data-dq-mem-stepper]');

      const wasOnInitial = memCard.classList.contains('on');
      const valInitial = Number(valEl.textContent.trim());

      // Click '+'
      addBtn.click();
      const valAfterAdd = Number(valEl.textContent.trim());
      const wasOnAfterAdd = memCard.classList.contains('on');

      // Click '-'
      subBtn.click();
      const valAfterSub = Number(valEl.textContent.trim());
      const wasOnAfterSub = memCard.classList.contains('on');

      // Click on stepper container text
      stepper.click();
      const wasOnAfterStepperClick = memCard.classList.contains('on');

      // Click card itself outside stepper
      memCard.click();
      const wasOnAfterCardClick = memCard.classList.contains('on');

      return {
        wasOnInitial,
        valInitial,
        valAfterAdd,
        wasOnAfterAdd,
        valAfterSub,
        wasOnAfterSub,
        wasOnAfterStepperClick,
        wasOnAfterCardClick
      };
    });

    assert.equal(isolationResult.valAfterAdd, isolationResult.valInitial + 1, 'Clicking [+] must increment value');
    assert.equal(isolationResult.wasOnAfterAdd, isolationResult.wasOnInitial, 'Clicking [+] must NOT toggle selection class on card');
    assert.equal(isolationResult.valAfterSub, isolationResult.valInitial, 'Clicking [-] must decrement value');
    assert.equal(isolationResult.wasOnAfterSub, isolationResult.wasOnInitial, 'Clicking [-] must NOT toggle selection class on card');
    assert.equal(isolationResult.wasOnAfterStepperClick, isolationResult.wasOnInitial, 'Clicking stepper label must NOT toggle selection');
    assert.equal(isolationResult.wasOnAfterCardClick, !isolationResult.wasOnInitial, 'Clicking card itself outside stepper must toggle selection');

    // Step 2: Test Keep button and dynamic text in shortage alert
    const shortageResult = await page.evaluate(() => {
      const customBtn = document.querySelector('#dayQuizBoard [data-dq-mode="custom"]');
      if (customBtn && !customBtn.classList.contains('on')) customBtn.click();

      const memCard = document.querySelector('[data-dq-type="Memory"]');
      if (!memCard.classList.contains('on')) memCard.click();

      // Set pool to 1 matchable card to verify 'Keep 1 pair' singular and shortage behavior
      window.quizPool = () => [{ id: 1, en: 'apple', ru: 'яблоко' }];
      const memInp = document.querySelector('[data-dq-type="Memory"] input[data-memory-size]');
      if (memInp) memInp.value = '4';
      const valEl = memCard.querySelector('[data-dq-mem-val]');
      if (valEl) valEl.textContent = '4';

      // Re-paint board
      const addBtn = memCard.querySelector('[data-dq-mem-add]');
      addBtn.click(); // will increment to 5 and trigger paintDayQuizBoard with shortage alert

      const alert = document.getElementById('dqMemShortageAlert');
      const title = document.getElementById('dqMemShortageTitle');
      const desc = document.getElementById('dqMemShortageDesc');
      const keepBtn = alert.querySelector('[data-dq-mem-keep]');

      const alertVisibleBefore = !alert.hidden;
      const titleText = title?.textContent;
      const descText = desc?.textContent;
      const keepBtnText = keepBtn?.textContent;

      // Click Keep button
      keepBtn.click();

      const alertVisibleAfter = !alert.hidden;
      const valAfterKeep = Number(valEl.textContent.trim());

      return {
        mode: document.querySelector('#dayQuizBoard [data-dq-mode].on')?.dataset?.dqMode,
        types: typeof dayQuizTypes === 'function' ? dayQuizTypes() : null,
        matchableLen: typeof quizPool === 'function' ? limitStudyCards(quizPool(), "daysetup", true).filter(c => c.en && c.ru).length : null,
        requestedPairs: memInp?.value,
        alertVisibleBefore,
        titleText,
        descText,
        keepBtnText,
        alertVisibleAfter,
        valAfterKeep
      };
    });

    assert.ok(shortageResult.alertVisibleBefore, 'Alert must be visible when requested pairs > available');
    assert.equal(shortageResult.keepBtnText, 'Keep 1 pair', 'Keep button must show "Keep 1 pair" (singular) for 1 matchable word');
    assert.ok(shortageResult.titleText.includes('in this lesson'), 'Title must be dynamically formatted with lesson count');
    assert.ok(shortageResult.descText.includes('Gemini can generate'), 'Description must be dynamically formatted');
    assert.equal(shortageResult.alertVisibleAfter, false, 'Clicking Keep must hide the shortage alert');

    // Step 3: Test Gemini Generation with progress bar and quiz view transition
    const genResult = await page.evaluate(async () => {
      const customBtn = document.querySelector('#dayQuizBoard [data-dq-mode="custom"]');
      if (customBtn && !customBtn.classList.contains('on')) customBtn.click();

      const memCard = document.querySelector('[data-dq-type="Memory"]');
      if (!memCard.classList.contains('on')) memCard.click();

      const addBtn = memCard.querySelector('[data-dq-mem-add]');
      addBtn.click();

      const alert = document.getElementById('dqMemShortageAlert');
      const actions = document.getElementById('dqMemShortageActions');
      const progress = document.getElementById('dqMemProgress');
      const genBtn = alert.querySelector('[data-dq-mem-gen]');

      // Click generate button
      genBtn.click();

      const actionsHiddenWhileGenerating = actions.hidden;
      const progressVisibleWhileGenerating = !progress.hidden;

      // Fast-forward or invoke immediate generation to complete progress
      window.dayQuizGenerateExtraMemoryPairs(true);

      const generatedPairs = window.dayQuizExtraMemoryPairs || [];

      return {
        actionsHiddenWhileGenerating,
        progressVisibleWhileGenerating,
        generatedCount: generatedPairs.length,
        firstGeneratedHasEn: !!generatedPairs[0]?.en,
        firstGeneratedHasRu: !!generatedPairs[0]?.ru,
        firstGeneratedIsNew: generatedPairs[0]?.isNew === true
      };
    });

    assert.equal(genResult.actionsHiddenWhileGenerating, true, 'Actions must be hidden while generating');
    assert.equal(genResult.progressVisibleWhileGenerating, true, 'Progress bar must be visible while generating');
    assert.ok(genResult.generatedCount > 0, 'Gemini generation must produce extra memory pairs');
    assert.equal(genResult.firstGeneratedHasEn, true, 'Generated pair must have English word');
    assert.equal(genResult.firstGeneratedHasRu, true, 'Generated pair must have Russian translation');
    assert.equal(genResult.firstGeneratedIsNew, true, 'Generated pair must have isNew: true flag');

  } finally {
    await browser.close();
    server.close();
  }
});
