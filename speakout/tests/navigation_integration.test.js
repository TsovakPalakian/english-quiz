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
});
