import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../..');

test('Speakout Navigation Integration Verification', async (t) => {
  const appJs = fs.readFileSync(path.join(ROOT, 'speakout/web/app.js'), 'utf-8');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'speakout/web/index.html'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(ROOT, 'speakout/web/style.css'), 'utf-8');
  const editorJs = fs.readFileSync(path.join(ROOT, 'production/speakout-editor.js'), 'utf-8');

  await t.test('1. production/speakout-editor.js provides direct Open Speakout Studio card on empty overview', () => {
    assert.match(editorJs, /Open Speakout Studio/, 'Must provide Open Speakout Studio link in empty overview');
    assert.match(editorJs, /\/speakout\/\?lesson=/, 'Must link to /speakout/?lesson=');
    assert.match(editorJs, /location\?\.level==='A1'&&location\?\.unit===0/, 'Must check for A1 Unit 1 location');
  });

  await t.test('2. speakout/web/app.js parses lesson query parameter on bootstrap', () => {
    assert.match(appJs, /const urlParams = new URLSearchParams\(window\.location\.search\)/, 'Must parse window.location.search');
    assert.match(appJs, /requestedLesson === '1B'/, 'Must support requestedLesson === 1B');
    assert.match(appJs, /requestedLesson === '1C'/, 'Must support requestedLesson === 1C');
    assert.match(appJs, /requestedLesson === '1D'/, 'Must support requestedLesson === 1D');
    assert.match(appJs, /switchLesson\('1B'\)/, 'Must call switchLesson for 1B');
    assert.match(appJs, /switchLesson\('1C'\)/, 'Must call switchLesson for 1C');
    assert.match(appJs, /switchLesson\('1D'\)/, 'Must call switchLesson for 1D');
  });

  await t.test('3. speakout/web/index.html header is clean without Platform button', () => {
    assert.doesNotMatch(indexHtml, /class="btn-platform-nav"/, 'Platform button must be removed from header');
    assert.doesNotMatch(indexHtml, />SO</, 'SO logo must be removed from header');
    assert.doesNotMatch(indexHtml, />Pearson Speakout 3rd Edition</, 'Title text must be removed from header');
    assert.match(indexHtml, /class="level-pill"/, 'Level pill must remain in brand badge');
  });

  await t.test('4. Speech Studio provides full exercise navigation, Back button, and voice record controls', () => {
    assert.match(indexHtml, /id="btn-back-speech-studio"/, 'Studio must provide Back button in header');
    assert.match(indexHtml, /class="[^"]*studio-nav-bar[^"]*"/, 'Studio must contain navigation bar for exercises');
    assert.match(indexHtml, /id="speech-studio-pills"/, 'Studio must have container for exercise track pills');
    assert.match(indexHtml, /id="btn-prev-studio-track"/, 'Studio must have Prev exercise step button');
    assert.match(indexHtml, /id="btn-next-studio-track"/, 'Studio must have Next exercise step button');
    assert.match(indexHtml, /id="speech-nav-step-counter"/, 'Studio must display step counter');
    assert.match(indexHtml, /id="btn-studio-record-voice"/, 'Studio must contain dedicated voice record button');
    assert.match(indexHtml, /id="studio-audio-player"/, 'Studio must have isolated model audio player');

    assert.match(appJs, /function renderStudioNavigation/, 'app.js must implement renderStudioNavigation');
    assert.match(appJs, /function switchStudioTrack/, 'app.js must implement switchStudioTrack');
    assert.match(appJs, /function toggleStudioModelPlay/, 'app.js must implement isolated model playback');
    assert.match(appJs, /LESSON_STUDIO_TRACKS/, 'app.js must provide track definitions per lesson');
    assert.match(styleCss, /\.studio-nav-bar/, 'style.css must style studio navigation bar');
    assert.match(styleCss, /\.btn-record-voice/, 'style.css must style voice record button');
  });
});
