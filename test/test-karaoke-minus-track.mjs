import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { extractFunction } from './helpers/extract-function.mjs';

const playerSource = readFileSync(new URL('../client/03f-songs.js', import.meta.url), 'utf-8');
const karaokeSyncEngineCode = extractFunction(playerSource, 'KaraokeSyncEngine');

class MockMediaElement {
  constructor(initialSrc) {
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

class MockContainer {
  constructor() {
    this.buttons = [
      { dataset: { karaokeTrack: 'vocals' }, classList: new Set(['active']) },
      { dataset: { karaokeTrack: 'minus' }, classList: new Set() }
    ];
  }
  querySelectorAll(sel) {
    if (sel === '[data-karaoke-track]') {
      return this.buttons.map(b => ({
        dataset: b.dataset,
        classList: {
          toggle: (cls, force) => {
            if (force) b.classList.add(cls);
            else b.classList.delete(cls);
          }
        }
      }));
    }
    return [];
  }
}

const sandbox = {
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id)
};

runInNewContext(karaokeSyncEngineCode, sandbox);
const { KaraokeSyncEngine } = sandbox;

test('switchTrack seamlessly switches between vocals and minus preserving currentTime and play state', () => {
  const media = new MockMediaElement('https://assets.example.com/vocal-track.mp3');
  media.currentTime = 32.75;
  media.paused = false; // currently playing

  const container = new MockContainer();
  const engine = new KaraokeSyncEngine();
  engine.attach(media, null, container);

  assert.equal(engine.currentTrack, 'vocals');

  // Switch to minus track
  const switched = engine.switchTrack('minus', 'https://assets.example.com/minus-track.mp3');
  assert.equal(switched, true);
  assert.equal(engine.currentTrack, 'minus');
  assert.equal(media.src, 'https://assets.example.com/minus-track.mp3');
  assert.equal(media.currentTime, 32.75);
  assert.equal(media.paused, false); // continued playback

  // Check UI button classes
  assert.ok(!container.buttons[0].classList.has('active'));
  assert.ok(container.buttons[1].classList.has('active'));

  // Switch back to original vocals
  const restored = engine.switchTrack('vocals');
  assert.equal(restored, true);
  assert.equal(engine.currentTrack, 'vocals');
  assert.equal(media.src, 'https://assets.example.com/vocal-track.mp3');
  assert.equal(media.currentTime, 32.75);
  assert.equal(media.paused, false);

  assert.ok(container.buttons[0].classList.has('active'));
  assert.ok(!container.buttons[1].classList.has('active'));
  engine.detach();
});

test('switchTrack maintains paused state when switching track while paused', () => {
  const media = new MockMediaElement('https://assets.example.com/song.mp3');
  media.currentTime = 14.2;
  media.paused = true; // paused

  const engine = new KaraokeSyncEngine();
  engine.attach(media, null, null);

  const switched = engine.switchTrack('minus', 'https://assets.example.com/minus.mp3');
  assert.equal(switched, true);
  assert.equal(media.currentTime, 14.2);
  assert.equal(media.paused, true); // remained paused
  engine.detach();
});

test('switchTrack gracefully ignores invalid switches and empty URLs', () => {
  const media = new MockMediaElement('https://assets.example.com/song.mp3');
  const engine = new KaraokeSyncEngine();
  engine.attach(media, null, null);

  // Already on vocals -> no-op
  assert.equal(engine.switchTrack('vocals'), false);

  // Missing minusUrl -> rejected
  assert.equal(engine.switchTrack('minus', ''), false);
  assert.equal(engine.currentTrack, 'vocals');
  assert.equal(media.src, 'https://assets.example.com/song.mp3');
  engine.detach();
});
