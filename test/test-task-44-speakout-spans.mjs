import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('TASK-44 Unit Test: paintSpeak for levels view renders clean buttons without 32 and 8 units spans', () => {
  const elements = {
    speakoutTitle: { textContent: '' },
    speakoutSub: { textContent: '' },
    speakoutList: { className: '', innerHTML: '' }
  };
  const scope = {
    fetch: () => new Promise(() => {}),
    esc: value => String(value ?? ''),
    applyCardSearches() {},
    hideStudentSongs: () => false,
    paintAccount() {},
    hideSelpop() {},
    restorePageMedia() {},
    applyCardSearch() {},
    paintPagePath() {},
    paintSongGate() {},
    dayQuizPlace: '',
    dayReturn: '',
    studyScreen: '',
    sessionStorage: { getItem: () => null, setItem: () => {} },
    document: {
      getElementById: id => elements[id] || {
        innerHTML: '',
        textContent: '',
        className: '',
        style: {},
        addEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        classList: { contains() { return false; }, add() {}, remove() {} }
      },
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => []
    },
    window: {
      addEventListener() {},
      scrollTo() {},
      SPEAKOUT: [
        { level: 'A1', units: [] },
        { level: 'A2', units: [] }
      ]
    }
  };

  runInNewContext(readFileSync(new URL('../client/00-core.js', import.meta.url), 'utf8'), scope);
  scope.openSpeak('levels', -1, -1, -1, true);

  const html = elements.speakoutList.innerHTML;
  assert.equal(html.includes('32'), false, 'Must not contain 32 badge');
  assert.equal(html.includes('8 units'), false, 'Must not contain 8 units label');
  assert.equal(html.includes('saas-badge-muted'), false, 'Must not contain saas-badge-muted');
  assert.equal(html.includes('<span class="num'), false, 'Must not contain num span');
  assert.equal(html.includes('<span class="label'), false, 'Must not contain label span');
  assert.match(html, /<button class="file-card saas-card" type="button" data-speak-level="0"><b>A1<\/b><\/button>/);
  assert.match(html, /<button class="file-card saas-card" type="button" data-speak-level="1"><b>A2<\/b><\/button>/);
});

test('TASK-44 Unit Test: paintSpeak for level units view removes A-D badge and capitalizes unit titles', () => {
  const elements = {
    speakoutTitle: { textContent: '' },
    speakoutSub: { textContent: '' },
    speakoutList: { className: '', innerHTML: '' }
  };
  const scope = {
    fetch: () => new Promise(() => {}),
    esc: value => String(value ?? ''),
    applyCardSearches() {},
    hideStudentSongs: () => false,
    paintAccount() {},
    hideSelpop() {},
    restorePageMedia() {},
    applyCardSearch() {},
    paintPagePath() {},
    paintSongGate() {},
    dayQuizPlace: '',
    dayReturn: '',
    studyScreen: '',
    sessionStorage: { getItem: () => null, setItem: () => {} },
    document: {
      getElementById: id => elements[id] || {
        innerHTML: '',
        textContent: '',
        className: '',
        style: {},
        addEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        classList: { contains() { return false; }, add() {}, remove() {} }
      },
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => []
    },
    window: {
      addEventListener() {},
      scrollTo() {},
      SPEAKOUT: [
        {
          level: 'A1',
          units: [
            { title: 'welcome!', lessons: [] },
            { title: 'people', lessons: [] },
            { title: 'every day', lessons: [] }
          ]
        }
      ]
    }
  };

  runInNewContext(readFileSync(new URL('../client/00-core.js', import.meta.url), 'utf8'), scope);
  scope.openSpeak('level', 0, -1, -1, true);

  const html = elements.speakoutList.innerHTML;
  assert.equal(html.includes('A–D'), false, 'Must not contain A–D badge');
  assert.equal(html.includes('saas-badge-info'), false, 'Must not contain saas-badge-info in units view');
  assert.equal(html.includes('<span class="form'), false, 'Must not contain form span in units view');
  assert.match(html, /<button class="tense saas-card" type="button" data-speak-unit="0"><b>1 Welcome!<\/b><\/button>/);
  assert.match(html, /<button class="tense saas-card" type="button" data-speak-unit="1"><b>2 People<\/b><\/button>/);
  assert.match(html, /<button class="tense saas-card" type="button" data-speak-unit="2"><b>3 Every day<\/b><\/button>/);
});

test('TASK-44 UI Test: Playwright visual verification of Speakout levels and units screens', async () => {
  const root = resolve('rollback/production-assets');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(root + '/') || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(readFileSync(file));
  });

  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  let browser;

  try {
    browser = await launchChromium(chromium);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let data = {};
      if (path === '/api/database-context') data = { provider: 'd1', revision: 3, scope: 'site' };
      if (path === '/api/auth/providers') data = { google: true, microsoft: false, telegram: false };
      if (path === '/api/me' || path === '/api/me/account') data = { user: { id: 'teacher-fixture', role: 'TEACHER', name: 'John Doe' } };
      if (path === '/api/me/state') data = { bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: { lessons: 1 }, stageActivity: {} };
      if (path === '/api/me/themes') data = { theme: 'light', themes: [], revision: 0, customRevision: 0 };
      if (path.includes('catalogs')) {
        if (path.includes('SPEAKOUT')) {
          data = url.searchParams.get('revision') === '1'
            ? { revision: 'fixture-revision' }
            : {
                content: {
                  level: url.searchParams.get('level') || 'A1',
                  units: [
                    { title: 'welcome!', lessons: [{ letter: 'A', title: 'Hello' }] },
                    { title: 'people', lessons: [{ letter: 'A', title: 'Where are they?' }] },
                    { title: 'things', lessons: [{ letter: 'A', title: 'Favourites' }] },
                    { title: 'every day', lessons: [{ letter: 'A', title: 'Time for lunch!' }] },
                    { title: 'action', lessons: [{ letter: 'A', title: 'Good colleagues' }] },
                    { title: 'where?', lessons: [{ letter: 'A', title: 'Lost' }] },
                    { title: 'healthy lives', lessons: [{ letter: 'A', title: 'The little things' }] },
                    { title: 'time out', lessons: [{ letter: 'A', title: 'Weekend break' }] }
                  ]
                }
              };
        } else {
          data = { documents: {}, cards: [], next: null };
        }
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.hasAttribute('data-shell-pending'));

    // Open Speakout levels view
    await page.evaluate(() => {
      openSpeak('levels', -1, -1, -1);
    });
    await page.waitForSelector('#speakout.on');

    // 1. Verify levels view
    const levelCards = page.locator('#speakoutList .file-card');
    const levelCount = await levelCards.count();
    assert.equal(levelCount, 8, 'There should be 8 level cards');

    // Verify no .num, no .label, no .saas-badge-muted in any level card
    assert.equal(await page.locator('#speakoutList .file-card .num').count(), 0, 'No num span in level cards');
    assert.equal(await page.locator('#speakoutList .file-card .label').count(), 0, 'No label span in level cards');
    assert.equal(await page.locator('#speakoutList .file-card .saas-badge-muted').count(), 0, 'No saas-badge-muted in level cards');

    // Verify justify-content is flex-start on #speakout .file-card
    const justifyContent = await levelCards.first().evaluate(el => getComputedStyle(el).justifyContent);
    assert.equal(justifyContent, 'flex-start', 'Level cards must have justify-content: flex-start');

    // Capture levels verification screenshot
    const speakoutEl = await page.$('#speakout');
    await speakoutEl.screenshot({ path: resolve('docs/task-44-screenshot-verification.png') });

    // 2. Click on Level A1
    await page.locator('#speakoutList [data-speak-level="0"]').click();
    await page.waitForFunction(() => document.getElementById('speakoutTitle')?.textContent === 'A1');

    // Verify units view
    const unitCards = page.locator('#speakoutList [data-speak-unit]');
    const unitCount = await unitCards.count();
    assert.equal(unitCount, 8, 'There should be 8 unit cards in A1');

    // Verify no A-D badge in unit cards
    assert.equal(await page.locator('#speakoutList [data-speak-unit] .form').count(), 0, 'No form span in unit cards');
    assert.equal(await page.locator('#speakoutList [data-speak-unit] .saas-badge-info').count(), 0, 'No saas-badge-info in unit cards');

    // Verify unit titles: numbered and capitalized
    const unit1Text = (await unitCards.nth(0).innerText()).trim();
    const unit2Text = (await unitCards.nth(1).innerText()).trim();
    const unit3Text = (await unitCards.nth(2).innerText()).trim();
    const unit4Text = (await unitCards.nth(3).innerText()).trim();
    const unit5Text = (await unitCards.nth(4).innerText()).trim();
    const unit6Text = (await unitCards.nth(5).innerText()).trim();
    const unit7Text = (await unitCards.nth(6).innerText()).trim();
    const unit8Text = (await unitCards.nth(7).innerText()).trim();

    assert.equal(unit1Text, '1 Welcome!');
    assert.equal(unit2Text, '2 People');
    assert.equal(unit3Text, '3 Things');
    assert.equal(unit4Text, '4 Every day');
    assert.equal(unit5Text, '5 Action');
    assert.equal(unit6Text, '6 Where?');
    assert.equal(unit7Text, '7 Healthy lives');
    assert.equal(unit8Text, '8 Time out');

    // Capture units verification screenshot
    await speakoutEl.screenshot({ path: resolve('docs/task-44-screenshot-units-verification.png') });
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
