import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTML_PATH = path.join(__dirname, '../web/index.html');
const CSS_PATH = path.join(__dirname, '../web/style.css');
const JS_PATH = path.join(__dirname, '../web/app.js');

test('Speakout Waveform Studio Player & 5x Zoom Verification', async (t) => {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const css = fs.readFileSync(CSS_PATH, 'utf-8');
  const js = fs.readFileSync(JS_PATH, 'utf-8');

  await t.test('1. HTML structure contains full waveform dock and transport controls', () => {
    // Waveform viewport, canvas, playhead, and ruler
    assert.match(html, /id="waveform-scroll-viewport"/, 'Must contain scrollable waveform viewport');
    assert.match(html, /id="waveform-canvas-track"/, 'Must contain waveform canvas track wrapper');
    assert.match(html, /id="waveform-canvas"/, 'Must contain waveform canvas');
    assert.match(html, /id="waveform-playhead"/, 'Must contain red playhead indicator');
    assert.match(html, /id="waveform-playhead-badge"/, 'Must contain playhead millisecond badge');
    assert.match(html, /id="waveform-ruler"/, 'Must contain time ruler');

    // A-B Loop elements & Trim handles
    assert.match(html, /id="waveform-loop-region"/, 'Must contain A-B loop selection region');
    assert.match(html, /id="waveform-trim-left"[^>]*class="[^"]*hidden[^"]*"/, 'Left trim handle must be hidden when Loop is not active');
    assert.match(html, /id="waveform-trim-right"[^>]*class="[^"]*hidden[^"]*"/, 'Right trim handle must be hidden when Loop is not active');

    // Stats & Zoom indicator
    assert.match(html, /id="wf-stat-start"/, 'Must display Start A stat');
    assert.match(html, /id="wf-stat-end"/, 'Must display End B stat');
    assert.match(html, /id="wf-stat-sel"/, 'Must display Selection length stat');
    assert.match(html, /id="wf-stat-total"/, 'Must display Total duration stat');
    assert.match(html, /id="btn-wf-zoom-in"[^>]*>\+\s*\(1\.0x\)/, 'Zoom in button must display current zoom ratio + (1.0x)');
    assert.doesNotMatch(html, /id="wf-zoom-badge"/, 'Old wf-zoom-badge must be removed from header row');

    // Transport buttons
    assert.match(html, /id="btn-play-pause"/, 'Must contain play/pause button');
    assert.match(html, /id="btn-stop"/, 'Must contain stop button');
    assert.match(html, /id="btn-loop-toggle"/, 'Must contain A-B loop toggle button');
    assert.match(html, /id="btn-jump-start"/, 'Must contain jump to start button');
    assert.match(html, /id="btn-rewind"/, 'Must contain rewind button');
    assert.match(html, /id="btn-forward"/, 'Must contain fast-forward button');
    assert.match(html, /id="btn-jump-end"/, 'Must contain jump to end button');

    // Digital clock & Zoom tools
    assert.match(html, /id="digital-clock"/, 'Must contain digital millisecond clock');
    assert.match(html, /id="btn-wf-zoom-in"/, 'Must contain zoom in button (up to 5x)');
    assert.match(html, /id="btn-wf-zoom-out"/, 'Must contain zoom out button');
    assert.match(html, /id="btn-wf-zoom-fit"/, 'Must contain zoom fit (1x) button');
  });

  await t.test('2. CSS styles waveform dock and transport with theme variables', () => {
    assert.match(css, /\.waveform-scroll-viewport/, 'Must define .waveform-scroll-viewport');
    assert.match(css, /\.waveform-canvas/, 'Must define .waveform-canvas');
    assert.match(css, /\.waveform-playhead/, 'Must define .waveform-playhead');
    assert.match(css, /\.waveform-trim-handle/, 'Must define .waveform-trim-handle');
    assert.match(css, /\.waveform-loop-region/, 'Must define .waveform-loop-region');
    assert.match(css, /\.transport-bar/, 'Must define .transport-bar');
    assert.match(css, /\.digital-clock/, 'Must define .digital-clock');
    assert.match(css, /\.t-btn/, 'Must define .t-btn transport buttons');
  });

  await t.test('3. Client JS implements millisecond formatting, 5x zoom bounds, and A-B loop logic', () => {
    // Millisecond formatter
    assert.match(js, /formatTimeMs/, 'Must export formatTimeMs');
    assert.match(js, /padStart\(3,\s*'0'\)/, 'formatTimeMs must format milliseconds with 3 digits');

    // Zoom bounds up to 5.0x
    assert.match(js, /Math\.min\(5\.0/, 'Must bound zoom to 5.0x');
    assert.match(js, /Math\.max\(1\.0/, 'Must bound zoom down to 1.0x');

    // Waveform rendering & A-B looping
    assert.match(js, /renderWaveform\(\)/, 'Must implement renderWaveform');
    assert.match(js, /current >= state\.loopEnd/, 'Must check loopEnd for A-B repeat');
    assert.match(js, /activeMedia\.currentTime = state\.loopStart/, 'Must rewind to loopStart on loop');

    // Transport handlers
    assert.match(js, /stopMedia\(\)/, 'Must implement stopMedia');
    assert.match(js, /toggleLoop\(\)/, 'Must implement toggleLoop');
    assert.match(js, /jumpToStartA\(\)/, 'Must implement jumpToStartA');
    assert.match(js, /jumpToEndB\(\)/, 'Must implement jumpToEndB');
    assert.match(js, /seekRelative\(/, 'Must implement seekRelative');
  });

  await t.test('4. formatTimeMs unit tests', async () => {
    const { formatTimeMs } = await import('../web/app.js');
    assert.equal(formatTimeMs(0), '0:00.000');
    assert.equal(formatTimeMs(5.123), '0:05.123');
    assert.equal(formatTimeMs(65.045), '1:05.045');
    assert.equal(formatTimeMs(-1), '0:00.000');
    assert.equal(formatTimeMs(NaN), '0:00.000');
  });

  await t.test('5. Extended playback speeds & RAF real-time animation', async () => {
    const { PLAYBACK_SPEEDS } = await import('../web/app.js');
    assert.deepEqual(PLAYBACK_SPEEDS, [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]);
    assert.match(js, /syncPlaybackAnimation/, 'Must define real-time RAF playback animation loop');
    assert.match(js, /unplayedColor/, 'Must define contrast color for unplayed bars in light and dark themes');
  });
});
