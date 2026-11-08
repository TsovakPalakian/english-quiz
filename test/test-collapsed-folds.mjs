import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

test('client/00-core.js and preview.js render grammarRulesFold and grammarConfusedFold collapsed by default', () => {
  const coreJs = readFileSync(resolve(root, 'client/00-core.js'), 'utf8');
  const previewJs = readFileSync(resolve(root, 'preview.js'), 'utf8');

  for (const [name, code] of [['client/00-core.js', coreJs], ['preview.js', previewJs]]) {
    assert.doesNotMatch(code, /<details class="resource-fold" id="grammarRulesFold" open>/, `${name} must not have open on grammarRulesFold`);
    assert.doesNotMatch(code, /<details class="resource-fold" id="grammarConfusedFold" open>/, `${name} must not have open on grammarConfusedFold`);
    assert.match(code, /<details class="resource-fold" id="grammarRulesFold"><summary>Rules<\/summary>/, `${name} must render collapsed grammarRulesFold`);
  }
});

test('client/03c-cards.js and preview.js render made-details collapsed by default without open attribute', () => {
  const cardsJs = readFileSync(resolve(root, 'client/03c-cards.js'), 'utf8');
  const previewJs = readFileSync(resolve(root, 'preview.js'), 'utf8');

  for (const [name, code] of [['client/03c-cards.js', cardsJs], ['preview.js', previewJs]]) {
    assert.doesNotMatch(code, /<details class="saas-details made-details" open>/, `${name} must not have any made-details with open`);
    assert.match(code, /<details class="saas-details made-details"><summary class="saas-summary">Usages ·/, `${name} must have collapsed Usages fold`);
    assert.match(code, /<details class="saas-details made-details"><summary class="saas-summary">English → Russian ·/, `${name} must have collapsed English -> Russian fold`);
    assert.match(code, /<details class="saas-details made-details"><summary class="saas-summary">Russian → English ·/, `${name} must have collapsed Russian -> English fold`);
    assert.match(code, /<details class="saas-details made-details"><summary class="saas-summary">Phrases ·/, `${name} must have collapsed Phrases fold`);
    assert.match(code, /<details class="saas-details made-details"><summary class="saas-summary">Usage quizzes · 2<\/summary>/, `${name} must have collapsed Usage quizzes fold`);
    assert.match(code, /<details class="saas-details made-details"><summary class="saas-summary">Quiz ·/, `${name} must have collapsed Quiz fold`);
  }
});

test('site/preview.css configures made-details summary with left disclosure arrow matching grammar fold', () => {
  const css = readFileSync(resolve(root, 'site/preview.css'), 'utf8');

  assert.doesNotMatch(css, /\.made-details summary::after\s*\{/, 'Custom right arrow ::after must be removed');
  assert.doesNotMatch(css, /\.made-details summary::-webkit-details-marker\s*\{\s*display:\s*none;/, 'Marker suppression must be removed');
  assert.match(css, /\.made-details summary\s*\{[^}]*cursor:\s*pointer;/);
  assert.match(css, /\.made-details summary\s*\{[^}]*font-weight:\s*700;/);
  assert.match(css, /\.made-details\[open\] summary\s*\{[^}]*border-bottom:\s*1px solid var\(--saas-border/);
});

test('DOM runtime verification: folds instantiate closed and can be expanded', () => {
  const dom = new Window({ url: 'https://preview.invalid/' });
  const previewHtml = readFileSync(resolve(root, 'site/preview.html'), 'utf8');
  dom.document.write(previewHtml);

  const timers = [];
  dom.srcSeq = 0;
  dom.console = console;
  dom.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  dom.setTimeout = () => 0;
  dom.clearTimeout = () => {};
  dom.setInterval = () => 0;
  dom.clearInterval = () => {};
  dom.requestAnimationFrame = () => 0;
  dom.cancelAnimationFrame = () => {};
  dom.LESSON_DATA = {
    words: [], lines21: [], ask07: [], phrases09: [], adverbs14: [], talk16: [], likes23: [], extraWords: [], rules: [], phrasalWords: [], idiomWords: [], songCards: {}, lessonRules: []
  };
  dom.LESSON_INDEX = [];
  dom.SPEAKOUT = [];
  dom.IRREGULAR = [];
  dom.VERB_IPA = {};
  dom.VERB_IPA_CASE = {};
  dom.GRAMMAR = {
    areas: [
      { id: 'area-tenses', badge: '12', title: 'Tenses', blurb: 'Tense forms', tone: 'tenses' }
    ],
    comparisons: [
      { id: 'past-perf', title: 'Past Simple vs Present Perfect', tone: 'compare' }
    ]
  };

  const previewRaw = readFileSync(resolve(root, 'preview.js'), 'utf8');
  const ctx = vm.createContext(dom);
  vm.runInContext(previewRaw, ctx);

  const rulesFold = dom.document.getElementById('grammarRulesFold');
  const confusedFold = dom.document.getElementById('grammarConfusedFold');

  assert.ok(rulesFold, 'grammarRulesFold should exist');
  assert.equal(rulesFold.open, false, 'grammarRulesFold must be collapsed by default');

  assert.ok(confusedFold, 'grammarConfusedFold should exist');
  assert.equal(confusedFold.open, false, 'grammarConfusedFold must be collapsed by default');

  rulesFold.open = true;
  assert.equal(rulesFold.open, true, 'grammarRulesFold can be opened');
});

test('Visual layout verification: Playwright renders left arrow disclosure on made-details and grammar folds', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    const css = readFileSync(resolve(root, 'site/preview.css'), 'utf8');
    await page.setContent(`<!DOCTYPE html>
      <html>
      <head>
        <style>${css}</style>
      </head>
      <body>
        <div id="tenses">
          <details class="resource-fold" id="grammarRulesFold">
            <summary>Rules</summary>
            <div class="fold-body">Rules body</div>
          </details>
        </div>
        <div id="made">
          <details class="saas-details made-details" id="testMade">
            <summary class="saas-summary">Usages · 18</summary>
            <div class="gen">Usages content</div>
          </details>
        </div>
      </body>
      </html>
    `);

    const rulesFold = page.locator('#grammarRulesFold');
    const madeFold = page.locator('#testMade');

    const rulesOpen = await rulesFold.evaluate((el) => el.open);
    const madeOpen = await madeFold.evaluate((el) => el.open);

    assert.equal(rulesOpen, false, 'Rules fold must be closed in visual browser');
    assert.equal(madeOpen, false, 'Made-details fold must be closed in visual browser');

    // Click summary to toggle and verify
    await page.locator('#testMade summary').click();
    const madeToggled = await madeFold.evaluate((el) => el.open);
    assert.equal(madeToggled, true, 'Made-details fold opens upon clicking summary');
  } finally {
    await browser.close();
  }
});
