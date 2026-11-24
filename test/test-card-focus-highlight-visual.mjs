import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('CSS verification: cardHighlightPulse and .wcard.wcard-highlight styles exist', () => {
  const css = readFileSync(path.resolve('site/preview.css'), 'utf-8');
  assert.ok(css.includes('@keyframes cardHighlightPulse'), 'Keyframe cardHighlightPulse must be defined in preview.css');
  assert.ok(css.includes('.wcard.wcard-highlight'), '.wcard.wcard-highlight selector must be defined in preview.css');
  assert.ok(css.includes('.wcard.wcard-highlight::after'), '.wcard.wcard-highlight::after badge must be defined in preview.css');
  assert.ok(css.includes('var(--acc)'), 'Styles must use var(--acc)');
});

test('Visual and DOM test: focusAndHighlightCard smooth scroll, focus, and highlight', async () => {
  try {
    const browser = await launchChromium(chromium);
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

    await page.goto(pathToFileURL(path.resolve('preview.html')).href);

  // 1. Check window.focusAndHighlightCard exists
  const hasFn = await page.evaluate(() => typeof window.focusAndHighlightCard === 'function');
  assert.ok(hasFn, 'window.focusAndHighlightCard must be defined on window');

  // 2. Setup sample cards and render #add
  await page.evaluate(() => {
    const cards = [
      { word: "Alacrity", ru: "готовность", pos: "noun", place: "mine" },
      { word: "Benevolent", ru: "великодушный", pos: "adjective", place: "mine" },
      { word: "Serendipity", ru: "счастливая случайность", pos: "noun", place: "mine" },
      { word: "Whimsical", ru: "причудливый", pos: "adjective", place: "mine" }
    ];
    localStorage.setItem('quizAdded', JSON.stringify(cards));
    if (typeof rememberAdded === 'function') rememberAdded(cards);
    if (typeof show === 'function') show('add');
    if (typeof renderAddedList === 'function') renderAddedList();
  });

  const cardsCount = await page.locator('#addedList .wcard').count();
  assert.equal(cardsCount, 4, 'Must render 4 cards in addedList');

  // 3. Test focusAndHighlightCard in Sky theme
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'sky');
    window.focusAndHighlightCard('Whimsical', 'mine');
  });

  // Verify Whimsical has wcard-highlight class
  const highlightedCard = page.locator('#addedList .wcard.wcard-highlight');
  assert.equal(await highlightedCard.count(), 1, 'Exactly one card must have wcard-highlight class');

  const enText = await highlightedCard.locator('.en').textContent();
  assert.equal(enText.trim().toLowerCase(), 'whimsical', 'The highlighted card must be whimsical');

  // Verify it received focus
  const isFocused = await page.evaluate(() => {
    const active = document.activeElement;
    return active && active.classList.contains('wcard-highlight');
  });
  assert.ok(isFocused, 'The highlighted card must have activeElement focus');

  // 4. Test switching highlight to another card (e.g. Alacrity)
  await page.evaluate(() => {
    window.focusAndHighlightCard('Alacrity', 'mine');
  });

  const newHighlighted = page.locator('#addedList .wcard.wcard-highlight');
  assert.equal(await newHighlighted.count(), 1, 'Only the new card must be highlighted');
  assert.equal((await newHighlighted.locator('.en').textContent()).trim().toLowerCase(), 'alacrity');

  // 5. Test interaction clear (pointerdown clears the highlight)
  await page.mouse.click(10, 10);
  const remaining = await page.locator('#addedList .wcard.wcard-highlight').count();
  assert.equal(remaining, 0, 'Highlight must be cleared on user click/interaction');

  // 6. Test with search input filtering: focusAndHighlightCard clears search
  await page.evaluate(() => {
    const searchInput = document.querySelector('#add [data-card-search]');
    if (searchInput) {
      searchInput.value = 'zzzzz';
      if (typeof applyCardSearch === 'function') applyCardSearch(searchInput.closest('section'));
    }
  });

  // Should have 0 cards visible before
  const hiddenCount = await page.locator('#addedList .wcard').count();
  assert.equal(hiddenCount, 0, 'No cards should be visible while filtered by zzzzz');

  // Now call focusAndHighlightCard - it should clear search and show the card!
  await page.evaluate(() => {
    window.focusAndHighlightCard('Serendipity', 'mine');
  });

  const restoredHighlighted = page.locator('#addedList .wcard.wcard-highlight');
  assert.equal(await restoredHighlighted.count(), 1, 'Card must be highlighted even if search was previously typed');
  assert.equal((await restoredHighlighted.locator('.en').textContent()).trim().toLowerCase(), 'serendipity');

  // 7. Verify across themes (Dark and Sand)
  for (const theme of ['dark', 'sand']) {
    await page.evaluate((th) => {
      document.documentElement.setAttribute('data-theme', th);
      window.focusAndHighlightCard('Benevolent', 'mine');
    }, theme);

    const card = page.locator('#addedList .wcard.wcard-highlight');
    assert.equal(await card.count(), 1, `Card must be highlighted in theme ${theme}`);
    assert.equal((await card.locator('.en').textContent()).trim().toLowerCase(), 'benevolent');
  }

    await browser.close();
  } catch (err) {
    console.error('TEST ERROR:', err);
    throw err;
  }
});
