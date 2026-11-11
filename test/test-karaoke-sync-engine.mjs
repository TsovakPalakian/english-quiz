import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { extractFunction } from './helpers/extract-function.mjs';

const songsSource = readFileSync(new URL('../client/03d-songs.js', import.meta.url), 'utf-8');
const playerSource = readFileSync(new URL('../client/03f-songs.js', import.meta.url), 'utf-8');

const parseLrcTimestampCode = extractFunction(songsSource, 'parseLrcTimestamp');
const formatLrcTimestampCode = extractFunction(songsSource, 'formatLrcTimestamp');
const interpolateWordTimingsCode = extractFunction(songsSource, 'interpolateWordTimings');
const parseLrcCode = extractFunction(songsSource, 'parseLrc');
const findActiveTimingCode = extractFunction(songsSource, 'findActiveTiming');

const karaokeSyncEngineCode = extractFunction(playerSource, 'KaraokeSyncEngine');
const buildCoachPanelHtmlCode = extractFunction(playerSource, 'buildCoachPanelHtml');
const buildKaraokeStudioHtmlCode = extractFunction(playerSource, 'buildKaraokeStudioHtml');

const sandbox = {
  esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  requestAnimationFrame: (cb) => {
    const id = setTimeout(cb, 16);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  },
  cancelAnimationFrame: (id) => clearTimeout(id)
};

runInNewContext([
  parseLrcTimestampCode,
  formatLrcTimestampCode,
  interpolateWordTimingsCode,
  parseLrcCode,
  findActiveTimingCode,
  karaokeSyncEngineCode,
  buildCoachPanelHtmlCode,
  buildKaraokeStudioHtmlCode
].join('\n;\n'), sandbox);

const { KaraokeSyncEngine, buildKaraokeStudioHtml, parseLrc } = sandbox;

test('KaraokeSyncEngine tracks mediaEl currentTime and dispatches line and word progress', () => {
  const timings = {
    lines: [
      {
        start: 0.0,
        end: 4.0,
        text: 'Hello world',
        words: [
          { word: 'Hello', start: 0.0, end: 2.0 },
          { word: 'world', start: 2.0, end: 4.0 }
        ]
      },
      {
        start: 4.0,
        end: 8.0,
        text: 'Second phrase',
        words: [
          { word: 'Second', start: 4.0, end: 6.0 },
          { word: 'phrase', start: 6.0, end: 8.0 }
        ]
      }
    ]
  };

  const fakeAudio = { currentTime: 0, paused: false };
  let tickCount = 0;
  let lastState = null;
  let lastLineIndex = -1;

  const engine = new KaraokeSyncEngine({
    onTick: (t, state) => {
      tickCount++;
      lastState = state;
    },
    onLineChange: (idx) => {
      lastLineIndex = idx;
    }
  });

  engine.attach(fakeAudio, timings, null);

  // t = 1.0 (50% through word 'Hello' on line 0)
  fakeAudio.currentTime = 1.0;
  engine.tick();
  assert.equal(lastLineIndex, 0);
  assert.equal(lastState.lineIndex, 0);
  assert.equal(lastState.wordIndex, 0);
  assert.equal(lastState.word.word, 'Hello');
  assert.equal(lastState.wordProgress, 0.5);

  // t = 3.0 (50% through word 'world' on line 0)
  fakeAudio.currentTime = 3.0;
  engine.tick();
  assert.equal(lastState.lineIndex, 0);
  assert.equal(lastState.wordIndex, 1);
  assert.equal(lastState.word.word, 'world');
  assert.equal(lastState.wordProgress, 0.5);

  // t = 5.0 (line 1, word 'Second')
  fakeAudio.currentTime = 5.0;
  engine.tick();
  assert.equal(lastLineIndex, 1);
  assert.equal(lastState.lineIndex, 1);
  assert.equal(lastState.wordIndex, 0);
  assert.equal(lastState.word.word, 'Second');
  assert.equal(lastState.wordProgress, 0.5);
  engine.detach();
});

test('KaraokeSyncEngine supports external time updates (YouTube / Spotify)', () => {
  const timings = {
    lines: [
      {
        start: 10.0,
        end: 20.0,
        text: 'Streaming track',
        words: [
          { word: 'Streaming', start: 10.0, end: 15.0 },
          { word: 'track', start: 15.0, end: 20.0 }
        ]
      }
    ]
  };

  let receivedState = null;
  const engine = new KaraokeSyncEngine({
    onTick: (t, state) => { receivedState = state; }
  });

  engine.attach(null, timings, null);

  // YouTube / Spotify embed time update
  engine.updateExternalTime(12.5);
  assert.equal(receivedState.lineIndex, 0);
  assert.equal(receivedState.wordIndex, 0);
  assert.equal(receivedState.word.word, 'Streaming');
  assert.equal(receivedState.wordProgress, 0.5);

  // Seek
  engine.seek(17.5);
  assert.equal(receivedState.wordIndex, 1);
  assert.equal(receivedState.word.word, 'track');
  assert.equal(receivedState.wordProgress, 0.5);
  engine.detach();
});

test('buildKaraokeStudioHtml renders 6 study modes, minus toggle and synchronized lines', () => {
  const lrc = [
    '[00:02.00]First line of the song',
    '[00:06.00]Second line here'
  ].join('\n');
  const timings = parseLrc(lrc);

  const songWithMinus = {
    title: 'Test Song',
    artist: 'Test Artist',
    minusUrl: 'https://example.com/minus.mp3'
  };

  const html = buildKaraokeStudioHtml(songWithMinus, timings, 'word-flow');

  // Verify mode selector contains all 6 study modes
  assert.ok(html.includes('data-karaoke-mode="word-flow"'));
  assert.ok(html.includes('data-karaoke-mode="line-scroller"'));
  assert.ok(html.includes('data-karaoke-mode="lyric-quiz"'));
  assert.ok(html.includes('data-karaoke-mode="shadowing"'));
  assert.ok(html.includes('data-karaoke-mode="bilingual"'));
  assert.ok(html.includes('data-karaoke-mode="coach"'));

  // Verify track switcher
  assert.ok(html.includes('data-karaoke-track="vocals"'));
  assert.ok(html.includes('data-karaoke-track="minus"'));

  // Verify lines and words
  assert.ok(html.includes('data-karaoke-line="0"'));
  assert.ok(html.includes('data-karaoke-line="1"'));
  assert.ok(html.includes('data-karaoke-word="0"'));
  assert.ok(html.includes('First'));
  assert.ok(html.includes('Second'));
});

test('buildKaraokeStudioHtml handles empty or null timings gracefully', () => {
  assert.equal(buildKaraokeStudioHtml({}, null), '');
  assert.equal(buildKaraokeStudioHtml({}, { lines: [] }), '');
});
