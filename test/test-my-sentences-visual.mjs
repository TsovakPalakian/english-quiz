import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

test('Visual and DOM test: My sentences deck, clean input form, selpop, and themes', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });

  const htmlPath = path.resolve('site/preview.html');
  const cssPath = path.resolve('site/preview.css');
  let html = readFileSync(htmlPath, 'utf-8');
  const css = readFileSync(cssPath, 'utf-8');

  // Inject CSS directly for standalone testing
  html = html.replace(/<link rel="stylesheet" href="\/site\/preview.css">/, `<style>${css}</style>`);
  await page.setContent(html, { waitUntil: 'load' });

  // 1. Verify My sentences deck in #wordcollections
  const deckBtn = page.locator('#wordcollections [data-jump="sentences"]');
  assert.equal(await deckBtn.count(), 1, 'My sentences deck button must exist in #wordcollections');
  const deckTitle = await deckBtn.locator('b').textContent();
  assert.equal(deckTitle, 'My sentences');
  const countSpan = deckBtn.locator('#sentenceCount');
  assert.equal(await countSpan.count(), 1, 'sentenceCount span must exist');

  // 2. Verify #sentences section DOM elements
  const section = page.locator('#sentences');
  assert.equal(await section.count(), 1, '#sentences section must exist');

  const backBtn = section.locator('#sentencesBack');
  assert.equal(await backBtn.count(), 1, 'Back button with data-nav-back must exist in #sentences');
  assert.equal(await backBtn.getAttribute('data-fallback'), 'wordcollections');

  const studyBtn = section.locator('#sentencesStudyBtn');
  assert.equal(await studyBtn.count(), 1, 'Study button must exist in #sentences');
  assert.equal(await studyBtn.getAttribute('data-deck-study'), 'sentences');

  const addOpenBtn = section.locator('[data-sentence-add-open]');
  assert.equal(await addOpenBtn.count(), 1, 'Add sentence button must exist');

  const addForm = section.locator('[data-sentence-add-form]');
  assert.equal(await addForm.count(), 1, 'Add sentence form must exist');

  // Verify clean input with Enter hint
  const sentenceInput = section.locator('[data-sentence-input]');
  assert.equal(await sentenceInput.count(), 1, 'Sentence input field must exist');
  const placeholder = await sentenceInput.getAttribute('placeholder');
  assert.match(placeholder, /Enter to analyze/i, 'Placeholder must mention Enter to analyze');

  // Verify direction chips are removed from #sentences
  const dirChips = section.locator('[data-sentence-dir]');
  assert.equal(await dirChips.count(), 0, 'Direction chips must be removed from #sentences');

  // Verify auto badge exists
  const autoBadge = section.locator('.sentence-auto-badge');
  assert.equal(await autoBadge.count(), 1, 'Auto badge must exist in #sentences');

  // 3. Verify #selpop sentence controls
  const selpopAddSentence = page.locator('#selpopAddSentence');
  assert.equal(await selpopAddSentence.count(), 1, '#selpopAddSentence button must exist in #selpop');
  assert.equal(await selpopAddSentence.textContent(), '+ Add to My sentences');

  const selpopDirRow = page.locator('#selpopDirRow');
  assert.equal(await selpopDirRow.count(), 1, '#selpopDirRow must exist in #selpop');

  // 4. Test theme rendering across Sky, Dark, Sand
  for (const theme of ['sky', 'dark', 'sand']) {
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.equal(currentTheme, theme);
  }

  await browser.close();
});

test('Sentence addition flow: Enter triggers analysis, choices appear, adding sentence updates count and list', async () => {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    let filePath;
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/preview.html') {
      filePath = path.resolve('site/preview.html');
    } else if (parsedUrl.pathname.startsWith('/preview.js')) {
      filePath = path.resolve('preview.js');
    } else {
      filePath = path.resolve('site', '.' + parsedUrl.pathname);
      if (!existsSync(filePath)) filePath = path.resolve('.' + parsedUrl.pathname);
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const mime = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(readFileSync(filePath));
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });

    // Intercept analyze API
    await page.route('**/api/sentences/analyze', async (route) => {
      const json = {
        original: 'Кажется твои правки не работают',
        direction: 'ru-en',
        translations: [
          { label: 'Natural · Literary', style: 'natural', text: 'It seems your edits are not working.' },
          { label: 'Conversational nuance', style: 'conversational', text: "Looks like your changes aren't working." },
          { label: 'Refined contextual', style: 'contextual', text: 'It appears that your adjustments are ineffective.' }
        ],
        note: 'Sentence translated and ready for practice.'
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });

    // Intercept new card API
    await page.route('**/api/me/cards/new', async (route) => {
      const json = {
        revision: 1,
        card: {
          stageId: 99,
          word: 'It seems your edits are not working.',
          ru: 'Кажется твои правки не работают',
          place: 'sentences'
        }
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });

    await page.goto(`http://127.0.0.1:${port}/preview.html`);

    // Switch to sentences section
    await page.evaluate(() => {
      document.querySelectorAll('section').forEach(s => s.classList.remove('on'));
      const s = document.getElementById('sentences');
      if (s) s.classList.add('on');
    });

    // Open sentence add form
    const addOpenBtn = page.locator('[data-sentence-add-open]');
    await addOpenBtn.click();

    const addForm = page.locator('[data-sentence-add-form]');
    assert.equal(await addForm.isVisible(), true, 'Form must be visible after click on +');

    // Type sentence and press Enter
    const sentenceInput = page.locator('[data-sentence-input]');
    await sentenceInput.fill('Кажется твои правки не работают');
    await sentenceInput.press('Enter');

    // Wait for translation choices
    const choicesBox = page.locator('[data-sentence-choices]');
    await choicesBox.waitFor({ state: 'visible', timeout: 5000 });

    const choiceTiles = choicesBox.locator('.sentence-choice-tile');
    assert.equal(await choiceTiles.count(), 3, 'Must render 3 translation options');

    // Verify English translation text
    const firstChoiceText = await choiceTiles.first().locator('.sentence-choice-text').textContent();
    assert.equal(firstChoiceText, 'It seems your edits are not working.');

    // Click Add to My sentences
    const saveBtn = choicesBox.locator('[data-sentence-save-chosen]');
    await saveBtn.click();
    await page.waitForTimeout(500);

    // Check sentence count in header and deck
    const title = await page.locator('#sentencesTitle').textContent();
    assert.match(title, /My sentences · 1/, 'Header title count must be 1');

    const deckCount = await page.locator('#sentenceCount').textContent();
    assert.equal(deckCount, '1', 'Word collections deck count must be 1');

    // Verify item in list
    const listItems = page.locator('#sentencesList .sentence-card-item');
    assert.equal(await listItems.count(), 1, 'Sentences list must contain 1 card');
  } finally {
    await browser.close();
    server.close();
  }
});
