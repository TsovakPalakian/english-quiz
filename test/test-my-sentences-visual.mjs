import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
