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

test('stageStoreSong validates empty title and prevents network request', () => {
  let performed = false;
  let noticeMessage = '';
  let focused = false;
  const status = { textContent: '', classList: { add(cls) { this[cls] = true; } } };
  const titleInput = { value: '   ', focus() { focused = true; } };
  const textInput = { value: 'Some lyrics' };
  const elements = {
    lyricTitle: titleInput,
    lyricArtist: { value: 'Singer' },
    lyricText: textInput,
    lyricVideo: { value: '' },
    lyricMusic: { value: '' },
    lyricStatus: status
  };
  const context = {
    authUser: { role: 'ADMIN' },
    accountReady: true,
    viewAccount: null,
    viewGen: 0,
    viewSwitching: false,
    pendingLyricFile: null,
    pendingEditFile: null,
    loadSongs: () => [],
    document: {
      addEventListener() {},
      getElementById: id => elements[id],
      querySelector: () => null
    },
    window: {
      LearningMain: {
        notice(msg) { noticeMessage = msg; },
        perform() { performed = true; }
      }
    }
  };

  runInNewContext(readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8'), context);
  context.stageStoreSong();

  assert.equal(performed, false, 'perform must not be called when title is missing');
  assert.equal(status.textContent, 'Write the song title.');
  assert.equal(status.classList.bad, true);
  assert.equal(noticeMessage, 'Write the song title.');
  assert.equal(focused, true);
});

test('stageStoreSong validates empty lyrics and prevents network request', () => {
  let performed = false;
  let noticeMessage = '';
  let focused = false;
  const status = { textContent: '', classList: { add(cls) { this[cls] = true; } } };
  const titleInput = { value: 'Song Title' };
  const textInput = { value: '   \n  \t ', focus() { focused = true; } };
  const elements = {
    lyricTitle: titleInput,
    lyricArtist: { value: 'Singer' },
    lyricText: textInput,
    lyricVideo: { value: '' },
    lyricMusic: { value: '' },
    lyricStatus: status
  };
  const context = {
    authUser: { role: 'ADMIN' },
    accountReady: true,
    viewAccount: null,
    viewGen: 0,
    viewSwitching: false,
    pendingLyricFile: null,
    pendingEditFile: null,
    loadSongs: () => [],
    document: {
      addEventListener() {},
      getElementById: id => elements[id],
      querySelector: () => null
    },
    window: {
      LearningMain: {
        notice(msg) { noticeMessage = msg; },
        perform() { performed = true; }
      }
    }
  };

  runInNewContext(readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8'), context);
  context.stageStoreSong();

  assert.equal(performed, false, 'perform must not be called when lyrics are empty');
  assert.equal(status.textContent, 'Paste the lyrics.');
  assert.equal(status.classList.bad, true);
  assert.equal(noticeMessage, 'Paste the lyrics.');
  assert.equal(focused, true);
});

test('stageStoreSong validates unsupported audio file format and prevents network request', () => {
  let performed = false;
  let noticeMessage = '';
  const status = { textContent: '', classList: { add(cls) { this[cls] = true; } } };
  const elements = {
    lyricTitle: { value: 'Song Title' },
    lyricArtist: { value: 'Singer' },
    lyricText: { value: 'Valid lyrics text' },
    lyricVideo: { value: '' },
    lyricMusic: { value: '' },
    lyricStatus: status
  };
  const invalidFile = { name: 'video.mp4', type: 'video/mp4' };
  const context = {
    authUser: { role: 'ADMIN' },
    accountReady: true,
    viewAccount: null,
    viewGen: 0,
    viewSwitching: false,
    pendingLyricFile: invalidFile,
    pendingEditFile: null,
    loadSongs: () => [],
    document: {
      addEventListener() {},
      getElementById: id => elements[id],
      querySelector: () => null
    },
    window: {
      LearningMain: {
        notice(msg) { noticeMessage = msg; },
        perform() { performed = true; }
      }
    }
  };

  runInNewContext(readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8'), context);
  context.stageStoreSong();

  assert.equal(performed, false, 'perform must not be called when file is unsupported');
  assert.equal(status.textContent, 'Select an MP3, WAV or OGG file.');
  assert.equal(status.classList.bad, true);
  assert.equal(noticeMessage, 'Select an MP3, WAV or OGG file.');
});

test('stageStoreSong proceeds to perform when title, lyrics and audio file are valid', async () => {
  let performed = false;
  const calls = [];
  const status = { textContent: '', classList: { add() {} } };
  const validFile = { name: 'track.mp3', type: 'audio/mpeg' };
  const elements = {
    lyricTitle: { value: 'Valid Title', value2: '' },
    lyricArtist: { value: 'Valid Artist' },
    lyricText: { value: 'Valid lyrics' },
    lyricVideo: { value: 'https://youtube.com/watch?v=123' },
    lyricMusic: { value: 'https://spotify.com/track/123' },
    lyricStatus: status
  };
  elements.lyricTitle.value = 'Valid Title';
  const context = {
    authUser: { id: 'admin', role: 'ADMIN' },
    accountReady: true,
    viewAccount: null,
    viewGen: 0,
    viewSwitching: false,
    pendingLyricFile: validFile,
    pendingEditFile: null,
    loadSongs: () => [],
    trackEvent: () => {},
    document: {
      addEventListener() {},
      getElementById: id => elements[id],
      querySelector: () => null
    },
    window: {
      LearningMain: {
        notice() {},
        saveLibrary: async (item, kind, changes) => {
          calls.push({ item, kind, changes });
          return { item: { id: 'new-song', ...changes, stageRevision: 1 } };
        },
        perform: async fn => { performed = true; return fn(); }
      }
    }
  };

  runInNewContext(readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8'), context);
  context.stageUploadSongFile = async saved => ({ item: saved });
  context.stageInstallLibrary = () => {};
  context.renderUserSong = () => {};
  context.show = () => {};
  context.stageAnalyzeSong = async () => {};

  await context.stageStoreSong();

  assert.equal(performed, true, 'perform must be called when inputs are valid');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].changes.title, 'Valid Title');
  assert.equal(calls[0].changes.lyrics, 'Valid lyrics');
});

test('stageSaveSongMeta validates title and file format', () => {
  let performed = false;
  let focused = false;
  const status = { textContent: '', classList: { add(cls) { this[cls] = true; } } };
  const titleInput = { focus() { focused = true; } };
  const selectors = {
    '#songUser [data-lyric-title]': { value: '  ', focus() { focused = true; } },
    '#songUser [data-lyric-artist]': { value: 'Artist' },
    '#songUser [data-lyric-video]': { value: '' },
    '#songUser [data-lyric-music]': { value: '' },
    '#songUser [data-lyric-meta-status]': status
  };
  const song = { id: 'song1', stageId: 'song1', title: 'Old Title' };
  const context = {
    authUser: { id: 'user', role: 'USER' },
    accountReady: true,
    viewAccount: null,
    viewGen: 0,
    viewSwitching: false,
    editFileRemoved: false,
    pendingEditFile: null,
    editFileSent: false,
    loadSongs: () => [song],
    stageDomId: id => id,
    document: {
      addEventListener() {},
      getElementById: () => ({ dataset: { songId: 'song1' } }),
      querySelector: sel => selectors[sel] || null
    },
    window: {
      LearningMain: {
        notice() {},
        perform() { performed = true; }
      }
    }
  };

  runInNewContext(readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8'), context);
  context.stageSaveSongMeta();

  assert.equal(performed, false, 'perform must not be called when editing meta with empty title');
  assert.equal(status.textContent, 'Write the song title.');
  assert.equal(status.classList.bad, true);
  assert.equal(focused, true);
});

test('Playwright Visual Verification of lyricadd validation errors', async () => {
  const root = resolve('rollback/production-assets');
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let data = {};
      if (path === '/api/database-context') data = { provider: 'd1', revision: 3, scope: 'site' };
      if (path === '/api/auth/providers') data = { google: true, microsoft: false, telegram: false };
      if (path === '/api/me' || path === '/api/me/account') data = { user: { id: 'teacher-fixture', role: 'ADMIN', name: 'teacher_yester' } };
      if (path === '/api/me/state') data = { bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: { lessons: 1 }, stageActivity: {} };
      if (path === '/api/me/themes') data = { theme: 'light', themes: [], revision: 0, customRevision: 0 };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.hasAttribute('data-shell-pending'));

    await page.evaluate(() => {
      if (typeof show === 'function') show('lyricadd');
    });
    await page.waitForSelector('#lyricadd.on');

    // 1. Click Read the words with empty form
    await page.evaluate(() => document.getElementById('lyricGo').click());
    await page.waitForTimeout(100);
    const statusText1 = await page.$eval('#lyricStatus', el => el.textContent.trim());
    const isBad1 = await page.$eval('#lyricStatus', el => el.classList.contains('bad'));
    assert.equal(statusText1, 'Write the song title.');
    assert.equal(isBad1, true);

    const lyricAdd = await page.$('#lyricadd');
    await lyricAdd.screenshot({ path: resolve('docs/bug-9128379f-screenshot-1.png') });

    // 2. Dismiss banner, fill title, keep lyrics empty, click Read the words
    await page.evaluate(() => document.getElementById('learning-main-dismiss')?.click());
    await page.evaluate(() => { document.getElementById('lyricTitle').value = 'Yesterday'; });
    await page.evaluate(() => document.getElementById('lyricGo').click());
    await page.waitForTimeout(100);
    const statusText2 = await page.$eval('#lyricStatus', el => el.textContent.trim());
    const isBad2 = await page.$eval('#lyricStatus', el => el.classList.contains('bad'));
    assert.equal(statusText2, 'Paste the lyrics.');
    assert.equal(isBad2, true);

    await lyricAdd.screenshot({ path: resolve('docs/bug-9128379f-screenshot-2.png') });

    // 3. Verify accept attribute on #lyricFile
    const accept = await page.$eval('#lyricFile', el => el.getAttribute('accept'));
    assert.equal(accept, 'audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg');

    // 4. Fill lyrics and simulate invalid file format check
    await page.fill('#lyricText', 'Yesterday all my troubles seemed so far away');
    await page.evaluate(() => {
      const status = document.getElementById('lyricStatus');
      const fileName = document.getElementById('lyricFileName');
      fileName.textContent = 'unsupported-video.mp4';
      status.textContent = 'Select an MP3, WAV or OGG file.';
      status.classList.add('bad');
    });

    await lyricAdd.screenshot({ path: resolve('docs/bug-9128379f-screenshot-3.png') });
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
