import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { extractFunction } from './helpers/extract-function.mjs';

const playerSource = readFileSync(new URL('../client/03f-songs.js', import.meta.url), 'utf-8');
const karaokeSyncEngineCode = extractFunction(playerSource, 'KaraokeSyncEngine');
const getLyricWordInfoCode = extractFunction(playerSource, 'getLyricWordInfo');

class MockMediaElement {
  constructor(initialSrc = 'https://assets.example.com/audio.mp3') {
    this.src = initialSrc;
    this.currentSrc = initialSrc;
    this.currentTime = 0;
    this.paused = true;
    this.readyState = 4;
    this.listeners = {};
  }
  addEventListener(evt, fn) {
    this.listeners[evt] = this.listeners[evt] || [];
    this.listeners[evt].push(fn);
  }
  removeEventListener(evt, fn) {
    if (!this.listeners[evt]) return;
    this.listeners[evt] = this.listeners[evt].filter(f => f !== fn);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const sandbox = {
  words: [
    { en: 'dream', ru: 'мечта', ipa: '/driːm/' },
    { en: 'sky', ru: 'небо', ipa: '/skaɪ/' }
  ],
  verbs: [
    { infinitive: 'sing', ru: 'петь', ipa: '/sɪŋ/' }
  ],
  requestAnimationFrame: (cb) => {
    const id = setTimeout(cb, 16);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  },
  cancelAnimationFrame: (id) => clearTimeout(id)
};

runInNewContext(karaokeSyncEngineCode, sandbox);
runInNewContext(getLyricWordInfoCode, sandbox);
const { KaraokeSyncEngine, getLyricWordInfo } = sandbox;

test('stepTime offsets media playback with boundary clamping', () => {
  const media = new MockMediaElement();
  media.currentTime = 10.0;
  const engine = new KaraokeSyncEngine();
  engine.attach(media, { lines: [] }, null);

  engine.stepTime(0.5);
  assert.equal(media.currentTime, 10.5);

  engine.stepTime(-1.0);
  assert.equal(media.currentTime, 9.5);

  engine.stepTime(-15.0);
  assert.equal(media.currentTime, 0.0);

  engine.detach();
});

test('jumpToSection navigates to target section timestamp', () => {
  const media = new MockMediaElement();
  const engine = new KaraokeSyncEngine();
  engine.attach(media, { lines: [] }, null);

  engine.jumpToSection(45.0);
  assert.equal(media.currentTime, 45.0);

  engine.jumpToSection('105.5');
  assert.equal(media.currentTime, 105.5);

  engine.jumpToSection(null);
  assert.equal(media.currentTime, 0.0);

  engine.detach();
});

test('saveBookmark and loadBookmark manage interval bookmarks', () => {
  const media = new MockMediaElement();
  const engine = new KaraokeSyncEngine();
  engine.attach(media, { lines: [] }, null);

  // When no loop interval set, returns null
  assert.equal(engine.saveBookmark('Empty'), null);

  // Set interval
  engine.setLoopA(14.0);
  engine.setLoopB(28.5);

  const bm = engine.saveBookmark('Chorus Repeat');
  assert.ok(bm);
  assert.equal(bm.name, 'Chorus Repeat');
  assert.equal(bm.start, 14.0);
  assert.equal(bm.end, 28.5);
  assert.equal(engine.bookmarks.length, 1);

  // Reset current loop and change position
  engine.clearLoop();
  media.currentTime = 50.0;

  // Load bookmark
  const loaded = engine.loadBookmark(0);
  assert.equal(loaded, true);
  assert.equal(engine.loopA, 14.0);
  assert.equal(engine.loopB, 28.5);
  assert.equal(engine.loopEnabled, true);
  assert.equal(media.currentTime, 14.0);

  // Invalid index returns false
  assert.equal(engine.loadBookmark(99), false);

  engine.detach();
});

test('toggleWaveformZoom toggles zoom scale factor and styles', () => {
  const dummyLines = { style: {} };
  const dummyContainer = {
    querySelector: (sel) => sel === '[data-karaoke-lines]' ? dummyLines : null
  };

  const engine = new KaraokeSyncEngine();
  engine.container = dummyContainer;
  assert.equal(engine.waveformZoom, 1);

  const zoom1 = engine.toggleWaveformZoom();
  assert.equal(zoom1, 2);
  assert.equal(engine.waveformZoom, 2);
  assert.equal(dummyLines.style.transform, 'scale(1.05)');

  const zoom2 = engine.toggleWaveformZoom();
  assert.equal(zoom2, 1);
  assert.equal(engine.waveformZoom, 1);
  assert.equal(dummyLines.style.transform, 'none');
});

test('getLyricWordInfo extracts word, clean form, ipa, and translation', () => {
  const res1 = getLyricWordInfo('Dream!');
  assert.ok(res1);
  assert.equal(res1.word, 'Dream!');
  assert.equal(res1.clean, 'dream');
  assert.equal(res1.ipa, '/driːm/');
  assert.equal(res1.ru, 'мечта');

  const res2 = getLyricWordInfo('singing');
  assert.ok(res2);
  assert.equal(res2.clean, 'singing');

  const resEmpty = getLyricWordInfo('   ');
  assert.equal(resEmpty, null);
});
