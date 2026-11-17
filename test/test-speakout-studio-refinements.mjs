import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const HTML_PATH = path.join(ROOT, 'speakout/web/index.html');
const CSS_PATH = path.join(ROOT, 'speakout/web/style.css');
const JS_PATH = path.join(ROOT, 'speakout/web/app.js');
const PREVIEW_CSS = path.join(ROOT, 'site/preview.css');

test('Speakout Studio Refinements & Multi-Theme Visual Verification', async (t) => {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const css = fs.readFileSync(CSS_PATH, 'utf-8');
  const js = fs.readFileSync(JS_PATH, 'utf-8');
  const previewCss = fs.readFileSync(PREVIEW_CSS, 'utf-8');

  await t.test('1. Header is clean: removed Platform button, SO logo, and book title', () => {
    assert.doesNotMatch(html, /class="btn-platform-nav"/, 'Must not contain Platform navigation button');
    assert.doesNotMatch(html, /<span class="brand-logo">SO<\/span>/, 'Must not contain SO brand logo');
    assert.doesNotMatch(html, /<span class="brand-title">Pearson Speakout 3rd Edition<\/span>/, 'Must not contain brand title');
    assert.match(html, /<span class="level-pill">Level A1 • Unit 1<\/span>/, 'Must keep Level A1 Unit 1 pill');
    assert.match(html, /id="active-lesson-breadcrumb"/, 'Must keep active lesson breadcrumb');
    assert.match(html, /id="btn-keys"/, 'Must keep Keys button in header-right');
  });

  await t.test('2. Waveform A-B Loop has narrow 3px boundaries, top A/B badges, and visible wave under loop', () => {
    assert.match(html, /<div class="handle-top-badge">A<\/div>/, 'Handle Left must display top badge A');
    assert.match(html, /<div class="handle-top-badge">B<\/div>/, 'Handle Right must display top badge B');
    assert.doesNotMatch(html, /id="waveform-loop-label"/, 'A-B Loop floating badge must be removed');

    // CSS asserts for narrow boundaries and translucency
    assert.match(css, /\.waveform-trim-handle\s*\{[^}]*width:\s*3px;/, 'Handles must be narrow 3px lines');
    assert.match(css, /\.handle-top-badge\s*\{[^}]*position:\s*absolute;/, 'Top badges must be positioned above waveform');
    assert.match(css, /\.waveform-loop-region\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--acc\) 14%, transparent\)/, 'Loop background must be translucent 14% to keep waveform 100% visible');
  });

  await t.test('3. Play button is strictly circular (.btn-play-circle, border-radius: 50%, 36px)', () => {
    assert.match(html, /id="btn-play-pause"[^>]*class="[^"]*btn-play-circle[^"]*"/, 'Play button must have class btn-play-circle');
    assert.match(css, /\.btn-play-circle[^}]*border-radius:\s*50%/s, 'Must enforce border-radius: 50%');
    assert.match(css, /\.btn-play-circle[^}]*width:\s*36px/s, 'Must enforce width: 36px');
    assert.match(css, /\.btn-play-circle[^}]*height:\s*36px/s, 'Must enforce height: 36px');
  });

  await t.test('4. Keys modal implements single-page tabbed view with 140% readable zoom', () => {
    assert.match(html, /id="keys-tab-left"/, 'Must contain left page tab');
    assert.match(html, /id="keys-tab-right"/, 'Must contain right page tab');
    assert.match(html, /class="[^"]*single-page-mode[^"]*"/, 'Must support single-page mode container');
    assert.match(css, /\.keys-modal-title\s*\{[^}]*color:\s*var\(--text-main\);/, 'Keys title must use theme color var(--text-main)');
    assert.match(js, /scale:\s*1\.4/, 'Keys page must render at readable 1.4 scale');
  });

  await t.test('5. Speech Studio implements ultra-detail waveforms (550 samples) and theme-driven contrasting colors', () => {
    assert.match(html, /id="cvs-teacher"/, 'Must contain teacher waveform canvas');
    assert.match(html, /id="cvs-student"/, 'Must contain student waveform canvas');
    assert.match(js, /const numSamples = 550;/, 'Must use 550 precision waveform samples');
    assert.match(js, /getPropertyValue\('--ink'\)/, 'Teacher waveform must use theme --ink for contrast');
    assert.match(js, /getPropertyValue\('--acc'\)/, 'Student waveform must use theme --acc for distinction');
    assert.match(previewCss, /:root\[data-theme="aegean"\]\s*\{[^}]*--ink:\s*#E6F2FF;/, 'Aegean theme must provide luminous #E6F2FF --ink');
  });

  await t.test('6. First audio track 1.01 is pre-initialized on bootstrap and play starts immediately', () => {
    assert.match(js, /DOM\.audioPlayer\.src\s*=\s*`\/api\/speakout\/audio\?track=\$\{encodeURIComponent\(state\.activeTrack/, 'Audio source must be set on load');
    assert.match(js, /function togglePlayPause\(\)[^}]*DOM\.audioPlayer\.src\s*=/s, 'togglePlayPause must safeguard uninitialized audio source');
  });

  await t.test('7. Workspace centers PDF canvas and confines navigation to lesson page scope', () => {
    assert.match(css, /\.pdf-canvas-wrapper\s*\{[^}]*margin:\s*0 auto;/, 'PDF canvas must be centered with margin: 0 auto');
    assert.match(js, /const basePage = isStudentBook \? \(LESSON_VIEW\[state\.activeLesson\]\?\.page \|\| 8\) : 1;/, 'Must calculate basePage from active lesson');
    assert.match(js, /DOM\.totalPagesLabel\.textContent = isStudentBook \? `\/ 2 \(Book p\. \$\{num\}\)`/, 'Total pages label must show lesson bounds');
  });
});
