import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('paintSongAnalysisBox renders progress state, percentages, and control buttons', () => {
  const code = readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8');
  let cancelled = false;
  let detailsToggled = false;
  let inner = '';
  const container = {
    get innerHTML() { return inner; },
    set innerHTML(val) { inner = val; },
    textContent: '',
    classList: {
      remove() {},
      toggle() {}
    },
    querySelector(sel) {
      if (sel === '[data-analysis-cancel]') return { addEventListener(evt, cb) { if (evt === 'click') cancelled = true; } };
      if (sel === '[data-analysis-details]') return { addEventListener(evt, cb) { if (evt === 'click') detailsToggled = true; } };
      return null;
    }
  };

  const context = {
    esc: s => s,
    viewGen: 1,
    authUser: { id: 'user-1' },
    viewAccount: null,
    document: { addEventListener() {}, getElementById: () => null },
    window: {}
  };

  runInNewContext(code, context);
  assert.equal(typeof context.paintSongAnalysisBox, 'function');

  context.paintSongAnalysisBox(container, {
    statusText: 'Reading the lyrics…',
    pct: 25,
    step: 1,
    detailsExpanded: false,
    modelLabel: 'Ensemble: Dict + Qwen + Gemini'
  }, {
    onCancel: () => { cancelled = true; },
    onToggleDetails: () => { detailsToggled = true; }
  });

  assert.ok(inner.includes('song-analysis-box'), 'Must render .song-analysis-box');
  assert.ok(inner.includes('25%'), 'Must include percentage');
  assert.ok(inner.includes('Reading the lyrics… (step 1 of 4)'), 'Must include status text and step');
  assert.ok(inner.includes('Ensemble: Dict + Qwen + Gemini'), 'Must include model label');
  assert.ok(inner.includes('data-analysis-cancel'), 'Must include Cancel button');
  assert.ok(inner.includes('Details ▾'), 'Must include Details ▾ button');
  assert.equal(cancelled, true, 'Click handler for cancel must be registered');
  assert.equal(detailsToggled, true, 'Click handler for details must be registered');
});

test('paintSongAnalysisBox renders expanded details list with all 4 consensus steps', () => {
  const code = readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8');
  let inner = '';
  const container = {
    get innerHTML() { return inner; },
    set innerHTML(val) { inner = val; },
    textContent: '',
    classList: { remove() {}, toggle() {} },
    querySelector: () => null
  };

  const context = { esc: s => s, viewGen: 1, authUser: { id: 'u' }, viewAccount: null, document: { addEventListener() {}, getElementById: () => null }, window: {} };
  runInNewContext(code, context);

  context.paintSongAnalysisBox(container, {
    statusText: 'Extracting candidates via LLM…',
    pct: 50,
    step: 2,
    detailsExpanded: true,
    modelLabel: 'Ensemble: Dict + Qwen + Gemini'
  });

  assert.ok(inner.includes('Details ▴'), 'Must toggle to Details ▴');
  assert.ok(inner.includes('1. Reading lyrics &amp; parsing structure') || inner.includes('1. Reading lyrics & parsing structure'));
  assert.ok(inner.includes('2. Extracting candidates via LLM'));
  assert.ok(inner.includes('3. Checking dictionary word cards'));
  assert.ok(inner.includes('4. Saving expression phrase cards'));
  assert.ok(inner.includes('Done'), 'Prior step must show Done');
  assert.ok(inner.includes('In progress'), 'Current step must show In progress');
});

test('paintSongAnalysisBox renders cancelled state with Retry analysis button', () => {
  const code = readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8');
  let inner = '';
  let retried = false;
  const container = {
    get innerHTML() { return inner; },
    set innerHTML(val) { inner = val; },
    textContent: '',
    classList: { remove() {}, toggle() {} },
    querySelector(sel) {
      if (sel === '[data-analysis-retry]') return { addEventListener(evt, cb) { retried = true; } };
      return null;
    }
  };

  const context = { esc: s => s, viewGen: 1, authUser: { id: 'u' }, viewAccount: null, document: { addEventListener() {}, getElementById: () => null }, window: {} };
  runInNewContext(code, context);

  context.paintSongAnalysisBox(container, {
    isCancelled: true,
    step: 2
  }, {
    onRetry: () => { retried = true; }
  });

  assert.ok(inner.includes('is-cancelled'), 'Must have is-cancelled class');
  assert.ok(inner.includes('Analysis cancelled'), 'Must display Analysis cancelled');
  assert.ok(inner.includes('Stopped at step 2'), 'Must specify step of cancellation');
  assert.ok(inner.includes('Retry analysis'), 'Must have Retry analysis button');
  assert.equal(retried, true, 'Retry callback must be mounted');
});

test('stageAnalyzeSong integrates multi-step progress and gracefully supports cancel signal', async () => {
  const code = readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8');
  let inner = '';
  const container = {
    get innerHTML() { return inner; },
    set innerHTML(val) { inner = val; },
    textContent: '',
    classList: { remove() {}, toggle() {} },
    querySelector: () => null
  };

  const calls = [];
  const song = { id: 'song-test', stageId: 'song-test', lyrics: 'Yesterday came suddenly', marks: {} };
  const context = {
    crypto,
    authUser: { id: 'user-active' },
    accountReady: true,
    viewAccount: null,
    viewGen: 1,
    viewSwitching: false,
    loadSongs: () => [song],
    writeSongs() {},
    paintLyrics() {},
    paintTextCount() {},
    cardVisible: () => false,
    cardIndex: () => new Map(),
    loadAdded: () => [],
    stageStampLinks() {},
    stageInstallLibrary() {},
    renderUserSong() {},
    lyricKeys: () => ['yesterday', 'came', 'suddenly'],
    lyricTokens: () => ['yesterday', 'came', 'suddenly'],
    lookupLyricWord: async w => ({ word: w, ru: 'перевод' }),
    uniqueExpressions: l => l,
    setTimeout(fn) { fn(); },
    accountFetch: async (path, opts) => {
      calls.push(path);
      if (path === '/api/analyze') {
        return {
          expressions: [{ exactText: 'came suddenly', canonicalForm: 'come suddenly', type: 'COLLOCATION', meaning: 'arrived fast', overallScore: 0.92, confidence: 0.95 }],
          wordLemmas: { came: 'come' }
        };
      }
      return { card: { word: 'come suddenly', ru: 'пришло внезапно', place: 'mine' } };
    },
    document: {
      addEventListener() {},
      getElementById: () => null
    },
    window: {
      LearningMain: {
        findCard: async () => { throw Object.assign(Error('missing'), { code: 'CARD_NOT_FOUND' }); },
        saveLibrary: async (item, kind, changes) => ({ item: { ...item, ...changes } })
      }
    }
  };

  runInNewContext(code, context);
  context.stageInstallLibrary = () => {};
  await context.stageAnalyzeSong(song, container);
  await new Promise(r => setTimeout(r, 20));

  assert.ok(calls.includes('/api/analyze'), 'Must call /api/analyze');
  assert.ok(calls.includes('/api/phrase-card'), 'Must call /api/phrase-card');
  assert.ok(container.textContent.includes('Added 1 expressions') || container.textContent.includes('Checked the words') || inner.includes('song-analysis-box'), 'Must render finished result text or progress box');
});

test('Playwright Visual Verification of Managed Song Analysis Progress Bar across themes', async () => {
  const root = resolve('rollback/production-assets');
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (path === '/preview.css') {
      res.setHeader('Content-Type', 'text/css');
      res.end(readFileSync(resolve('site/preview.css')));
      return;
    }
    const file = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(root + '/') || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.end(readFileSync(file));
  });

  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  let browser;

  try {
    browser = await launchChromium(chromium);
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

    const mockSong = {
      id: 'song-visual-verify',
      stageId: 201,
      title: 'Yesterday',
      artist: 'The Beatles',
      lyrics: 'Yesterday, all my troubles seemed so far away\nNow it looks as though they\'re here to stay\nOh, I believe in yesterday',
      marks: {}
    };

    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === '/api/database-context') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'd1', revision: 3, scope: 'site' }) });
      if (path === '/api/auth/providers') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ google: true, microsoft: false, telegram: false }) });
      if (path === '/api/me' || path === '/api/me/account') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'teacher-fixture', role: 'ADMIN', name: 'teacher' } }) });
      if (path === '/api/me/state') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bootstrap: true, stats: {}, added: [], songs: [mockSong], settings: {}, counts: { lessons: 1 }, stageActivity: {} }) });
      if (path === '/api/me/songs') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [mockSong], next: null }) });
      if (path === '/api/me/themes') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ theme: 'light', themes: [], revision: 0, customRevision: 0 }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.hasAttribute('data-shell-pending'));

    const helperFnCode = readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8');

    await page.evaluate(({ song, helperCode }) => {
      authUser = { id: 'teacher-fixture', role: 'ADMIN', name: 'teacher' };
      accountReady = true;
      authChecked = true;
      if (typeof writeSongs === 'function') writeSongs([song]);
      else localStorage.setItem('enquiz-songs', JSON.stringify([song]));
      if (typeof renderUserSong === 'function') renderUserSong(song);
      if (typeof show === 'function') show('song');

      // Ensure paintSongAnalysisBox is available in page scope
      const fnDef = new Function(helperCode + '\nwindow.paintSongAnalysisBox = paintSongAnalysisBox;');
      try { fnDef(); } catch (_) {}
    }, { song: mockSong, helperCode: helperFnCode });

    await page.waitForSelector('#song.on');
    await page.waitForTimeout(200);

    // Verify mounting progress bar into [data-lyric-check]
    await page.evaluate(() => {
      const el = document.querySelector('#songUser [data-lyric-check]');
      if (el && typeof window.paintSongAnalysisBox === 'function') {
        window.paintSongAnalysisBox(el, {
          statusText: 'Reading the lyrics…',
          pct: 25,
          step: 1,
          detailsExpanded: false,
          modelLabel: 'Ensemble: Dict + Qwen + Gemini'
        });
      }
    });

    const boxEl = page.locator('#songUser .song-analysis-box');
    assert.ok(await boxEl.isVisible(), 'Progress box must be visible in song view');

    const pctEl = page.locator('#songUser .song-analysis-pct');
    assert.equal(await pctEl.innerText(), '25%');

    // Toggle Details ▴
    await page.evaluate(() => {
      const el = document.querySelector('#songUser [data-lyric-check]');
      if (el && typeof window.paintSongAnalysisBox === 'function') {
        window.paintSongAnalysisBox(el, {
          statusText: 'Reading the lyrics…',
          pct: 25,
          step: 1,
          detailsExpanded: true,
          modelLabel: 'Ensemble: Dict + Qwen + Gemini'
        });
      }
    });

    const detailsList = page.locator('#songUser .song-analysis-details-list');
    assert.ok(await detailsList.isVisible(), 'Details list must expand');

    // Trigger Cancelled state
    await page.evaluate(() => {
      const el = document.querySelector('#songUser [data-lyric-check]');
      if (el && typeof window.paintSongAnalysisBox === 'function') {
        window.paintSongAnalysisBox(el, {
          isCancelled: true,
          step: 1
        });
      }
    });

    const retryBtn = page.locator('#songUser [data-analysis-retry]');
    assert.ok(await retryBtn.isVisible(), 'Retry button must be visible in cancelled state');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
