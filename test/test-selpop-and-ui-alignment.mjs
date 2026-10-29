import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('site-copyright CSS has user-select: none and pointer-events: none', () => {
  const css = readFileSync('site/preview.css', 'utf-8');
  assert.match(css, /\.site-copyright\s*\{[^}]*user-select:\s*none;/);
  assert.match(css, /\.site-copyright\s*\{[^}]*pointer-events:\s*none;/);
});

test('day-row in exam sections and day-tools use stretch alignment and matched border radius', () => {
  const css = readFileSync('site/preview.css', 'utf-8');
  assert.match(css, /#examList\s+\.day-row,\s*#examBlocks\s+\.day-row\s*\{[^}]*align-items:\s*stretch;/);
  assert.match(css, /\.day-tools\s*\{[^}]*border-radius:\s*var\(--saas-radius-lg,\s*16px\);/);
});

test('preview.html contains selpopVariant and selpopDictBadge', () => {
  const html = readFileSync('site/preview.html', 'utf-8');
  assert.match(html, /id="selpopVariant"/);
  assert.match(html, /id="selpopDictBadge"/);
});

test('client/06-auth-scene.js restricts brand-mark replacement to guest and auth brand', () => {
  const js = readFileSync('client/06-auth-scene.js', 'utf-8');
  assert.match(js, /querySelectorAll\('\.guest-brand \.brand-mark,\s*\.auth-brand \.brand-mark'\)/);
  assert.doesNotMatch(js, /points="44,64 32\.244,27\.820/);
});

test('site/favicon.svg has star polygon removed', () => {
  const svg = readFileSync('site/favicon.svg', 'utf-8');
  assert.doesNotMatch(svg, /polygon points="44,73/);
});

test('preview.js contains detectSingular and findWordDictionary logic', () => {
  const js = readFileSync('preview.js', 'utf-8');
  assert.match(js, /function detectSingular\(/);
  assert.match(js, /function findWordDictionary\(/);
  assert.match(js, /IRREGULAR_PLURALS/);
  assert.match(js, /selpopDictBadge/);
  assert.match(js, /selpopVariant/);
});

test('preview.js wraps made card usages and phrases in details', () => {
  const js = readFileSync('preview.js', 'utf-8');
  assert.match(js, /<details class="saas-details made-details"[^>]*><summary class="saas-summary">Usages ·/);
  assert.match(js, /<details class="saas-details made-details"[^>]*><summary class="saas-summary">Phrases ·/);
});
