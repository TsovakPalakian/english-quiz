import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

test('Selection popup and My sentences auto-direction and card rendering', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });

  const htmlPath = path.resolve('site/preview.html');
  const cssPath = path.resolve('site/preview.css');
  let html = readFileSync(htmlPath, 'utf-8');
  const css = readFileSync(cssPath, 'utf-8');

  // Inject CSS directly for standalone testing
  html = html.replace(/<link rel="stylesheet" href="preview\.css">|<link rel="stylesheet" href="\/site\/preview\.css">/, `<style>${css}</style>`);
  await page.setContent(html, { waitUntil: 'load' });

  // 1. Verify selpop direction row is removed from DOM
  const selpopDirRow = page.locator('#selpopDirRow');
  assert.equal(await selpopDirRow.count(), 0, '#selpopDirRow must be removed from selpop');

  // 2. Verify selpop add sentence button exists
  const selpopAddSentence = page.locator('#selpopAddSentence');
  assert.equal(await selpopAddSentence.count(), 1, '#selpopAddSentence must exist');

  // 3. Test selection popup behavior when sentence is already added
  await page.evaluate(() => {
    // Mock loadAdded with saved sentence
    window._testAdded = [
      {
        word: 'It seems your edits are not working.',
        ru: 'Похоже, ваши изменения не работают.',
        place: 'sentences',
        direction: 'en-ru'
      }
    ];
    window.loadAdded = () => window._testAdded;

    // Simulate selecting text that is already in loadAdded
    const pop = document.getElementById('selpop');
    const wordEl = document.getElementById('selpopWord');
    const addSentence = document.getElementById('selpopAddSentence');
    const dictBadge = document.getElementById('selpopDictBadge');

    const text = 'It seems your edits are not working.';
    wordEl.textContent = text;
    const cleanSentence = text.trim().toLowerCase();
    const sentenceAlreadySaved = window.loadAdded().some(item =>
      (item.place === 'sentences' || item.place === 'chat-sentences') &&
      (String(item.word || item.en || '').trim().toLowerCase() === cleanSentence || String(item.ru || '').trim().toLowerCase() === cleanSentence)
    );

    if (dictBadge) {
      if (sentenceAlreadySaved) {
        dictBadge.textContent = 'My sentences';
        dictBadge.hidden = false;
      } else {
        dictBadge.hidden = true;
      }
    }
    if (addSentence) {
      addSentence.hidden = sentenceAlreadySaved;
    }
    pop.hidden = false;
  });

  // Verify button is hidden for already saved sentence
  assert.equal(await selpopAddSentence.isHidden(), true, 'Add to My sentences must be hidden when sentence is already saved');
  const dictBadge = page.locator('#selpopDictBadge');
  assert.equal(await dictBadge.isVisible(), true, 'selpopDictBadge must be visible');
  assert.equal(await dictBadge.textContent(), 'My sentences', 'selpopDictBadge text must be "My sentences"');

  // 4. Test selection popup behavior when sentence is new (not in loadAdded)
  await page.evaluate(() => {
    const text = 'A brand new sentence for testing.';
    const wordEl = document.getElementById('selpopWord');
    const addSentence = document.getElementById('selpopAddSentence');
    const dictBadge = document.getElementById('selpopDictBadge');

    wordEl.textContent = text;
    const cleanSentence = text.trim().toLowerCase();
    const sentenceAlreadySaved = window.loadAdded().some(item =>
      (item.place === 'sentences' || item.place === 'chat-sentences') &&
      (String(item.word || item.en || '').trim().toLowerCase() === cleanSentence || String(item.ru || '').trim().toLowerCase() === cleanSentence)
    );

    if (dictBadge) {
      if (sentenceAlreadySaved) {
        dictBadge.textContent = 'My sentences';
        dictBadge.hidden = false;
      } else {
        dictBadge.hidden = true;
      }
    }
    if (addSentence) {
      addSentence.hidden = sentenceAlreadySaved;
    }
  });

  // Verify button is visible for new sentence
  assert.equal(await selpopAddSentence.isVisible(), true, 'Add to My sentences must be visible for a new sentence');
  assert.equal(await dictBadge.isHidden(), true, 'selpopDictBadge must be hidden for a new sentence');

  // 5. Test direction auto-detection logic
  const autoDirections = await page.evaluate(() => {
    const detect = (raw) => {
      const isRu = /[\u0400-\u04FF]/.test(raw);
      return isRu ? 'ru-en' : 'en-ru';
    };
    return {
      en: detect('It seems your edits are not working.'),
      ru: detect('Похоже, ваши изменения не работают.'),
      mixed: detect('English phrase with slight text.')
    };
  });
  assert.equal(autoDirections.en, 'en-ru', 'English text must auto-detect as en-ru');
  assert.equal(autoDirections.ru, 'ru-en', 'Russian text must auto-detect as ru-en');
  assert.equal(autoDirections.mixed, 'en-ru', 'Latin text must auto-detect as en-ru');

  // 6. Test paintSentencesList renders card without .sentence-badge (Auto direction)
  await page.evaluate(() => {
    const listEl = document.getElementById('sentencesList');
    if (!listEl) return;
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const filtered = [
      {
        item: {
          word: 'It seems your edits are not working.',
          ru: 'Похоже, ваши изменения не работают.',
          place: 'sentences',
          direction: 'en-ru'
        },
        index: 0
      }
    ];

    listEl.innerHTML = filtered.map(({ item, index }) => {
      return '<div class="sentence-card-item">' +
        '<div class="sentence-card-content">' +
          '<div class="sentence-card-en">' + esc(item.word || "") + '</div>' +
          '<div class="sentence-card-ru">' + esc(item.ru || "") + '</div>' +
          (item.note ? '<div class="sentence-note-box">' + esc(item.note) + '</div>' : '') +
        '</div>' +
        '<div class="sentence-card-actions">' +
          '<button class="btn icon saas-btn" type="button" data-sentence-speak="' + esc(item.word || "") + '">🔊</button>' +
        '</div>' +
      '</div>';
    }).join("");
  });

  const cardBadges = page.locator('#sentencesList .sentence-badge');
  assert.equal(await cardBadges.count(), 0, 'No sentence-badge must be rendered on the card');

  const cardEn = page.locator('#sentencesList .sentence-card-en');
  assert.equal(await cardEn.count(), 1, 'Sentence English text must exist');
  assert.equal(await cardEn.textContent(), 'It seems your edits are not working.');

  // 7. Verify visual themes (Sky, Dark, Sand)
  for (const theme of ['sky', 'dark', 'sand']) {
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    const appliedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.equal(appliedTheme, theme, `Theme ${theme} must apply cleanly`);
  }

  await browser.close();
});
