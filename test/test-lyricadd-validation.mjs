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

test('stageSaveSongMeta with editFileRemoved detaches song audio and saves cleanly without unsupported error', async () => {
  let performed = false;
  let detachCalled = false;
  let installedSong = null;
  const status = { textContent: '', classList: { add(cls) { this[cls] = true; } } };
  const selectors = {
    '#songUser [data-lyric-title]': { value: 'Yesterday' },
    '#songUser [data-lyric-artist]': { value: 'The Beatles' },
    '#songUser [data-lyric-video]': { value: 'https://youtube.com/watch?v=123' },
    '#songUser [data-lyric-music]': { value: '' },
    '#songUser [data-lyric-meta-status]': status
  };
  const song = { id: 'song1', stageId: 101, stageRevision: 2, stageScope: 'profile', title: 'Yesterday', fileName: 'yesterday.mp3', fileType: 'audio/mpeg' };
  const context = {
    authUser: { id: 'user', role: 'ADMIN' },
    accountReady: true,
    viewAccount: null,
    viewGen: 0,
    viewSwitching: false,
    editFileRemoved: true,
    pendingEditFile: null,
    editFileSent: false,
    loadSongs: () => [song],
    writeSongs: () => {},
    paintLyrics: () => {},
    stagePaintCounts: () => {},
    renderUserSong: () => {},
    stageDomId: id => id,
    document: {
      addEventListener() {},
      getElementById: () => ({ dataset: { songId: 'song1' } }),
      querySelector: sel => selectors[sel] || null
    },
    window: {
      LearningMain: {
        notice() {},
        unsupported(op) { throw new Error('Unsupported operation: ' + op); },
        async saveLibrary(item, kind, changes) {
          return { item: { ...item, ...changes, stageRevision: item.stageRevision + 1 } };
        },
        async detachSongAudio(item) {
          detachCalled = true;
          const copy = { ...item };
          delete copy.fileName;
          delete copy.fileType;
          return { item: copy };
        },
        async perform(fn) {
          performed = true;
          return fn();
        }
      }
    }
  };

  runInNewContext(readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8'), context);
  context.stageInstallLibrary = s => { installedSong = s; };
  context.renderUserSong = () => {};
  await context.stageSaveSongMeta();

  assert.equal(performed, true, 'perform must be called');
  assert.equal(detachCalled, true, 'detachSongAudio must be called when song had an attached file');
  assert.equal(context.editFileRemoved, false, 'editFileRemoved must be reset to false');
  assert.equal(installedSong.fileName, undefined, 'fileName must be removed');
  assert.equal(song.fileName, undefined, 'fileName must be removed from item');
  assert.equal(installedSong.title, 'Yesterday');
});

test('stageSaveSongMeta with editFileRemoved on song without file saves cleanly without calling unsupported or detach', async () => {
  let performed = false;
  let detachCalled = false;
  let unsupportedCalled = false;
  const status = { textContent: '', classList: { add() {} } };
  const selectors = {
    '#songUser [data-lyric-title]': { value: 'Song Without File' },
    '#songUser [data-lyric-artist]': { value: 'Artist' },
    '#songUser [data-lyric-video]': { value: '' },
    '#songUser [data-lyric-music]': { value: '' },
    '#songUser [data-lyric-meta-status]': status
  };
  const song = { id: 'song2', stageId: 102, stageRevision: 1, stageScope: 'profile', title: 'Old Title' };
  const context = {
    authUser: { id: 'user', role: 'ADMIN' },
    accountReady: true,
    viewAccount: null,
    viewGen: 0,
    viewSwitching: false,
    editFileRemoved: true,
    pendingEditFile: null,
    editFileSent: false,
    loadSongs: () => [song],
    writeSongs: () => {},
    paintLyrics: () => {},
    stagePaintCounts: () => {},
    renderUserSong: () => {},
    stageDomId: id => id,
    document: {
      addEventListener() {},
      getElementById: () => ({ dataset: { songId: 'song2' } }),
      querySelector: sel => selectors[sel] || null
    },
    window: {
      LearningMain: {
        notice() {},
        unsupported() { unsupportedCalled = true; },
        async saveLibrary(item, kind, changes) {
          return { item: { ...item, ...changes } };
        },
        async detachSongAudio() {
          detachCalled = true;
        },
        async perform(fn) {
          performed = true;
          return fn();
        }
      }
    }
  };

  runInNewContext(readFileSync(new URL('../client/main/main-hooks.js', import.meta.url), 'utf8'), context);
  context.stageInstallLibrary = s => { Object.assign(song, s); };
  context.renderUserSong = () => {};
  await context.stageSaveSongMeta();

  assert.equal(performed, true, 'perform must be called');
  assert.equal(unsupportedCalled, false, 'unsupported must not be called');
  assert.equal(detachCalled, false, 'detachSongAudio must not be called when there was no attached file');
  assert.equal(context.editFileRemoved, false, 'editFileRemoved must be reset to false');
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
    page.on('pageerror', err => console.log('PAGE_ERROR:', err));
    page.on('console', msg => console.log('PAGE_LOG:', msg.text()));

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

test('Playwright Visual Verification of song meta remove file save without unsupported error', async () => {
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
    page.on('pageerror', err => console.log('PAGE_ERROR:', err));
    page.on('console', msg => console.log('PAGE_LOG:', msg.text()));

    const mockSong = {
      id: 'song-test-visual-1',
      stageId: 101,
      stageRevision: 1,
      stageScope: 'profile',
      kind: 'song',
      title: 'Yesterday',
      artist: 'The Beatles',
      lyrics: 'Yesterday all my troubles seemed so far away',
      fileName: 'yesterday.mp3',
      fileType: 'audio/mpeg',
      videoUrl: '',
      musicUrl: ''
    };

    let detached = false;
    let savedSong = null;

    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      if (path === '/api/database-context') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'd1', revision: 3, scope: 'site' }) });
      if (path === '/api/auth/providers') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ google: true, microsoft: false, telegram: false }) });
      if (path === '/api/me' || path === '/api/me/account') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'teacher-fixture', role: 'ADMIN', name: 'teacher_yester' } }) });
      if (path === '/api/me/state') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bootstrap: true, stats: {}, added: [], songs: [mockSong], settings: {}, counts: { lessons: 1 }, stageActivity: {} }) });
      if (path === '/api/me/songs') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [mockSong], next: null }) });
      if (path === '/api/me/themes') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ theme: 'light', themes: [], revision: 0, customRevision: 0 }) });
      if (path === '/api/library/101/media' && method === 'DELETE') {
        detached = true;
        const updated = { ...mockSong, fileName: '', fileType: '', stageRevision: 2 };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: 2, item: updated }) });
      }
      if (path === '/api/library/101' && method === 'PATCH') {
        savedSong = JSON.parse(route.request().postData() || '{}');
        const updated = { ...mockSong, ...savedSong.changes, stageRevision: 2 };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: 2, item: updated }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.hasAttribute('data-shell-pending'));

    await page.evaluate(song => {
      authUser = { id: 'teacher-fixture', role: 'ADMIN', name: 'teacher_yester' };
      accountReady = true;
      authChecked = true;
      if (typeof writeSongs === 'function') writeSongs([song]);
      else {
        localStorage.setItem('enquiz-songs', JSON.stringify([song]));
        if (typeof songCache !== 'undefined') songCache = [song];
      }
      if (typeof renderUserSong === 'function') renderUserSong(song);
      if (typeof show === 'function') show('song');
    }, mockSong);

    await page.waitForSelector('#song.on');
    await page.waitForTimeout(200);

    await page.click('#songUser [data-lyric-meta]');
    await page.waitForTimeout(100);

    const clearBtn = await page.$('#songUser [data-lyric-file-clear]');
    assert.ok(clearBtn, 'Remove file button must be present in song meta editor');
    await clearBtn.click();
    await page.waitForTimeout(100);

    const editor = await page.$('#songUser [data-lyric-meta-editor]');
    if (editor) {
      await editor.screenshot({ path: resolve('docs/bug-8257c7eb-screenshot-verification.png') });
    }

    await page.click('#songUser [data-lyric-meta-save]');
    await page.waitForTimeout(500);

    const banner = await page.$eval('#learning-main-notice', el => el ? el.textContent.trim() : '').catch(() => '');
    assert.equal(banner.includes('is not supported'), false, 'Unsupported error must not appear');
    assert.equal(detached, true, 'Song media must be detached via DELETE /api/library/:id/media');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
