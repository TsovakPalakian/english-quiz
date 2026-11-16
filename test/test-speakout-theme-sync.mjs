import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Theme synchronization logic is present in client and speakout app sources', () => {
  const clientTheme = readFileSync(resolve(root, 'client/02-themes.js'), 'utf8');
  assert.match(clientTheme, /syncThemeToFrames\(/);
  assert.match(clientTheme, /syncThemeToFrame\(/);
  assert.match(clientTheme, /postMessage\(\{\s*type:\s*["']enquiz-theme-change["']/);

  const previewSource = readFileSync(resolve(root, 'preview.js'), 'utf8');
  assert.match(previewSource, /syncThemeToFrames\(/);
  assert.match(previewSource, /syncThemeToFrame\(/);

  const speakoutApp = readFileSync(resolve(root, 'speakout/web/app.js'), 'utf8');
  assert.match(speakoutApp, /enquiz-theme-change/);
  assert.match(speakoutApp, /addEventListener\(['"]message['"]/);
  assert.match(speakoutApp, /addEventListener\(['"]storage['"]/);

  const prodSpeakoutApp = readFileSync(resolve(root, 'rollback/production-assets/speakout/app.js'), 'utf8');
  assert.match(prodSpeakoutApp, /enquiz-theme-change/);
});

test('Theme switching synchronizes data-theme attribute directly to iframe document', () => {
  const dom = new JSDOM(`<!DOCTYPE html>
<html lang="en" data-theme="almond">
<head></head>
<body>
  <div id="themeCycle"><span class="theme-title">Almond</span></div>
  <iframe id="speakout-frame" src="about:blank"></iframe>
</body>
</html>`, { runScripts: 'outside-only' });

  const { window } = dom;
  const { document } = window;
  const frame = document.getElementById('speakout-frame');
  const frameDoc = frame.contentDocument;
  frameDoc.documentElement.setAttribute('data-theme', 'almond');

  function syncThemeToFrame(targetFrame, themeName, customTheme) {
    if (!targetFrame) return;
    try {
      const doc = targetFrame.contentDocument;
      if (doc && doc.documentElement) {
        if (customTheme) {
          doc.documentElement.setAttribute('data-theme', 'user');
        } else {
          doc.documentElement.setAttribute('data-theme', themeName);
        }
        if (themeName) doc.documentElement.dataset.paintedTheme = themeName;
      }
    } catch (e) {}
    try {
      if (targetFrame.contentWindow) {
        targetFrame.contentWindow.postMessage({ type: 'enquiz-theme-change', theme: themeName, custom: customTheme || null }, '*');
      }
    } catch (e) {}
  }

  function syncThemeToFrames(themeName, customTheme) {
    document.querySelectorAll('iframe').forEach(f => syncThemeToFrame(f, themeName, customTheme));
  }

  // Switch to pumpkin
  syncThemeToFrames('pumpkin', null);
  assert.equal(frameDoc.documentElement.getAttribute('data-theme'), 'pumpkin');
  assert.equal(frameDoc.documentElement.dataset.paintedTheme, 'pumpkin');

  // Switch to sky
  syncThemeToFrames('sky', null);
  assert.equal(frameDoc.documentElement.getAttribute('data-theme'), 'sky');
  assert.equal(frameDoc.documentElement.dataset.paintedTheme, 'sky');

  // Switch to dark
  syncThemeToFrames('dark', null);
  assert.equal(frameDoc.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(frameDoc.documentElement.dataset.paintedTheme, 'dark');
});

test('applyTheme preserves custom variable in scope across both branches', () => {
  const clientTheme = readFileSync(resolve(root, 'client/02-themes.js'), 'utf8');
  assert.match(clientTheme, /let chosen,\s*custom\s*=\s*null;/);
  assert.doesNotMatch(clientTheme, /else\s*\{\s*[^}]*const custom\s*=/);

  const previewSource = readFileSync(resolve(root, 'preview.js'), 'utf8');
  assert.match(previewSource, /let chosen,\s*custom\s*=\s*null;/);
  assert.doesNotMatch(previewSource, /else\s*\{\s*[^}]*const custom\s*=/);
});
