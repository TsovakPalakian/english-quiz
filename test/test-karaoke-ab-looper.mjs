import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { extractFunction } from './helpers/extract-function.mjs';

const playerSource = readFileSync(new URL('../client/03f-songs.js', import.meta.url), 'utf-8');
const karaokeSyncEngineCode = extractFunction(playerSource, 'KaraokeSyncEngine');

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
  requestAnimationFrame: (cb) => {
    const id = setTimeout(cb, 16);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  },
  cancelAnimationFrame: (id) => clearTimeout(id)
};

runInNewContext(karaokeSyncEngineCode, sandbox);
const { KaraokeSyncEngine } = sandbox;

test('setLoopA and setLoopB establish valid interval boundaries', () => {
  const engine = new KaraokeSyncEngine();
  assert.equal(engine.loopA, null);
  assert.equal(engine.loopB, null);
  assert.equal(engine.loopEnabled, false);

  engine.setLoopA(10.0);
  assert.equal(engine.loopA, 10.0);

  engine.setLoopB(15.5);
  assert.equal(engine.loopB, 15.5);

  // If user sets B <= A, A is adjusted
  engine.setLoopB(8.0);
  assert.equal(engine.loopB, 8.0);
  assert.equal(engine.loopA, 6.0); // 8.0 - 2.0
});

test('toggleLoop and clearLoop manage loop state properly', () => {
  const engine = new KaraokeSyncEngine();
  engine.setLoopA(5.0);
  engine.setLoopB(12.0);

  engine.toggleLoop();
  assert.equal(engine.loopEnabled, true);

  engine.toggleLoop();
  assert.equal(engine.loopEnabled, false);

  engine.clearLoop();
  assert.equal(engine.loopA, null);
  assert.equal(engine.loopB, null);
  assert.equal(engine.loopEnabled, false);
});

test('snapLoopToLine binds interval to exact line start and end timestamps', () => {
  const timings = {
    lines: [
      { start: 0.0, end: 4.5, text: 'First line' },
      { start: 4.5, end: 9.8, text: 'Second line' },
      { start: 9.8, end: 14.2, text: 'Third line' }
    ]
  };

  const media = new MockMediaElement();
  const engine = new KaraokeSyncEngine();
  engine.attach(media, timings, null);

  // Snap to second line (index 1)
  const snapped = engine.snapLoopToLine(1);
  assert.equal(snapped, true);
  assert.equal(engine.loopA, 4.5);
  assert.equal(engine.loopB, 9.8);
  assert.equal(engine.loopEnabled, true);
  assert.equal(media.currentTime, 4.5); // automatically seeks to start of line
  engine.detach();
});

test('tick rewinds to loopA when playback reaches or passes loopB', () => {
  const media = new MockMediaElement();
  const engine = new KaraokeSyncEngine();
  engine.attach(media, null, null);

  engine.setLoopA(10.0);
  engine.setLoopB(15.0);
  engine.toggleLoop(true);

  // t = 12.0 (inside loop)
  media.currentTime = 12.0;
  engine.tick();
  assert.equal(media.currentTime, 12.0);

  // t = 15.1 (past loopB) -> should rewind to loopA
  media.currentTime = 15.1;
  engine.tick();
  assert.equal(media.currentTime, 10.0); // rewound to loopA
  engine.detach();
});
