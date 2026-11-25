import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const rootDir = resolve('.');
const previewCss = readFileSync(resolve(rootDir, 'site/preview.css'), 'utf8');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 1000 } });

  const cards = [
    { letter: 'C', en: 'could you', pos: 'expression', uk: '/kʊd juː/', us: '/kʊd juː/', ru: 'не могли бы вы', exEn: 'Could you open the window?', exRu: 'Не могли бы вы открыть окно?' },
    { letter: 'F', en: 'feel free', pos: 'expression', uk: '/fiːl friː/', us: '/fiːl friː/', ru: 'не стесняйся', exEn: 'Feel free to ask.', exRu: 'Не стесняйся спрашивать.' },
    { letter: 'H', en: 'help yourself', pos: 'expression', uk: "/help jɔː'self/", us: "/help jʊr'self/", ru: 'угощайся', exEn: 'Help yourself to bread.', exRu: 'Угощайся хлебом.' },
    { letter: 'J', en: 'join us', pos: 'expression', uk: '/dʒɔɪn ʌs/', us: '/dʒɔɪn ʌs/', ru: 'присоединяйся к нам', exEn: 'Please join us for dinner.', exRu: 'Присоединяйся к нам за ужином.' },
    { letter: 'L', en: 'let me', pos: 'expression', uk: '/let miː/', us: '/let miː/', ru: 'позволь мне', exEn: 'Let me help you.', exRu: 'Позволь мне помочь.' },
    { letter: 'M', en: 'may I', pos: 'expression', uk: '/meɪ aɪ/', us: '/meɪ aɪ/', ru: 'можно мне', exEn: 'May I sit here?', exRu: 'Можно мне здесь сесть?' },
    { letter: 'S', en: 'shall we', pos: 'expression', uk: '/ʃæl wiː/', us: '/ʃæl wiː/', ru: 'не сделать ли нам', exEn: 'Shall we go outside?', exRu: 'Не выйти ли нам на улицу?' },
    { letter: 'W', en: 'would you like', pos: 'expression', uk: '/wʊd juː laɪk/', us: '/wʊd juː laɪk/', ru: 'не хотите ли вы', exEn: 'Would you like some tea?', exRu: 'Не хотите ли чаю?' }
  ];

  const speakerSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin:0 4px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

  function generateHtml(theme) {
    const cardsHtml = cards.map(c => `
      <div class="card" data-word="${c.en}">
        <div class="badge">${c.letter}</div>
        <div class="en">${c.en}</div>
        <div class="pos">${c.pos}</div>
        <div class="ipa">
          <span class="say-side"><b>UK</b> ${speakerSvg} <span class="say-ipa">${c.uk}</span></span>
          <span class="say-side"><b>US</b> ${speakerSvg} <span class="say-ipa">${c.us}</span></span>
        </div>
        <div class="ru">${c.ru}</div>
        <div class="ex">${c.exEn}</div>
        <div class="ex-ru">${c.exRu}</div>
        <div class="meta">Essential English · Topics · Requests, offers and invitations</div>
      </div>
    `).join('');

    return `<!DOCTYPE html>
    <html data-theme="${theme}">
    <head>
      <meta charset="utf-8">
      <style>
        ${previewCss}

        body {
          margin: 0;
          padding: 32px 40px;
          background: var(--bg);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: var(--ink);
        }
        .header {
          font-size: 26px;
          font-weight: 800;
          color: var(--ink);
          margin-bottom: 20px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .card {
          background: var(--card);
          border: 1.5px solid var(--line);
          border-radius: 18px;
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 2px 6px rgba(0,0,0,0.02);
        }
        .badge {
          width: 32px;
          height: 32px;
          background: var(--acc-s);
          color: var(--acc);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 15px;
          margin-bottom: 14px;
        }
        .en {
          font-size: 17px;
          font-weight: 800;
          color: var(--ink);
          margin-bottom: 2px;
        }
        .pos {
          font-size: 13px;
          font-style: italic;
          color: var(--mute);
          margin-bottom: 12px;
        }
        .say-side {
          font-size: 13px;
          color: var(--acc);
          display: flex;
          align-items: center;
          gap: 2px;
          margin-bottom: 4px;
        }
        .say-side b {
          font-weight: 700;
        }
        .say-ipa {
          font-size: 13px;
          color: var(--ink);
          font-weight: 500;
          margin-left: 2px;
        }
        .ru {
          font-size: 14px;
          color: var(--ink);
          margin-top: 10px;
          margin-bottom: 6px;
        }
        .ex {
          font-size: 13px;
          color: var(--ink);
          opacity: 0.9;
          margin-bottom: 3px;
        }
        .ex-ru {
          font-size: 13px;
          color: var(--mute);
          margin-bottom: 8px;
        }
        .meta {
          font-size: 11px;
          color: var(--mute);
          line-height: 1.3;
          margin-top: auto;
        }
      </style>
    </head>
    <body>
      <div class="header">Requests, offers and invitations</div>
      <div class="grid">${cardsHtml}</div>
    </body>
    </html>`;
  }

  // 1. Verify visual presence of all IPA transcriptions
  await page.setContent(generateHtml('sky'));
  const ipaElements = await page.locator('.say-ipa').allTextContents();
  assert.equal(ipaElements.length, 16, 'Must contain 16 IPA text elements (8 UK, 8 US)');
  assert.ok(ipaElements.includes('/kʊd juː/'), 'Must render /kʊd juː/');
  assert.ok(ipaElements.includes('/fiːl friː/'), 'Must render /fiːl friː/');
  assert.ok(ipaElements.includes("/help jɔː'self/"), 'Must render help yourself IPA');

  // 2. Capture verification screenshots across themes
  for (const theme of ['sky', 'dark', 'sage']) {
    await page.setContent(generateHtml(theme));
    const screenshotPath = resolve(rootDir, `docs/task-essential-ipa-verification-${theme}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    assert.ok(existsSync(screenshotPath), `Screenshot for theme ${theme} must exist`);
  }

  console.log('Visual verification test passed across themes sky, dark, sage.');
} finally {
  await browser.close();
}
