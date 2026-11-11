import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Visual Test: CSS and DOM UI/UX specifications for Karaoke Studio and AI Speech Coach', async (t) => {
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const songsCode = fs.readFileSync(path.join(rootDir, 'client/03f-songs.js'), 'utf8');

  await t.test('Visual Test 1: Studio container, mode bar and word highlighting CSS', () => {
    assert.ok(css.includes('.karaoke-studio {'), '.karaoke-studio CSS rule exists');
    assert.ok(css.includes('.karaoke-mode-bar {'), '.karaoke-mode-bar CSS rule exists');
    assert.ok(css.includes('.karaoke-mode-btn {'), '.karaoke-mode-btn CSS rule exists');
    assert.ok(css.includes('.karaoke-mode-btn.active {'), '.karaoke-mode-btn.active CSS rule exists');
    assert.ok(css.includes('.karaoke-word {'), '.karaoke-word CSS rule exists');
    assert.ok(css.includes('.karaoke-word.active {'), '.karaoke-word.active glow CSS rule exists');
    assert.ok(css.includes('.karaoke-line {'), '.karaoke-line CSS rule exists');
    assert.ok(css.includes('.karaoke-translation {'), '.karaoke-translation CSS rule exists');
  });

  await t.test('Visual Test 2: AI Pronunciation Coach panel, scorecard metrics and phoneme badges', () => {
    assert.ok(css.includes('.karaoke-coach-panel {'), '.karaoke-coach-panel CSS exists');
    assert.ok(css.includes('.karaoke-coach-header {'), '.karaoke-coach-header CSS exists');
    assert.ok(css.includes('.karaoke-record-btn {'), '.karaoke-record-btn CSS exists');
    assert.ok(css.includes('.karaoke-record-btn.recording {'), '.karaoke-record-btn.recording CSS exists');
    assert.ok(css.includes('.coach-score-card {'), '.coach-score-card CSS exists');
    assert.ok(css.includes('.coach-overall-badge {'), '.coach-overall-badge CSS exists');
    assert.ok(css.includes('.coach-metric-bar {'), '.coach-metric-bar CSS exists');
    assert.ok(css.includes('.coach-phoneme-badge {'), '.coach-phoneme-badge CSS exists');
  });

  await t.test('Visual Test 3: A-B Looper toolbar, active loop state and line border styling', () => {
    assert.ok(css.includes('.karaoke-looper-bar {'), '.karaoke-looper-bar CSS exists');
    assert.ok(css.includes('.karaoke-looper-btn {'), '.karaoke-looper-btn CSS exists');
    assert.ok(css.includes('.karaoke-looper-btn.active {'), '.karaoke-looper-btn.active CSS exists');
    assert.ok(css.includes('.karaoke-looper-info {'), '.karaoke-looper-info CSS exists');
    assert.ok(css.includes('.karaoke-line.in-loop {'), '.karaoke-line.in-loop boundary CSS exists');
  });

  await t.test('Visual Test 4: Precision navigation bar, steppers, section buttons and extra tools', () => {
    assert.ok(css.includes('.karaoke-nav-bar {'), '.karaoke-nav-bar CSS exists');
    assert.ok(css.includes('.karaoke-steppers, .karaoke-sections, .karaoke-extra-tools {'), 'Navigation flex containers CSS exists');
    assert.ok(css.includes('.karaoke-nav-btn {'), '.karaoke-nav-btn CSS exists');
    assert.ok(css.includes('.karaoke-section-btn {'), '.karaoke-section-btn CSS exists');
    assert.ok(songsCode.includes('data-nav-step="-1.0"'), 'HTML generator contains -1.0s stepper button');
    assert.ok(songsCode.includes('data-section-time="45.0">Chorus</button>'), 'HTML generator contains Chorus section button');
  });

  await t.test('Visual Test 5: Word Inspector Popover styling, layout and action buttons', () => {
    assert.ok(css.includes('.karaoke-popover {'), '.karaoke-popover floating container CSS exists');
    assert.ok(css.includes('.karaoke-popover-head {'), '.karaoke-popover-head CSS exists');
    assert.ok(css.includes('.karaoke-popover-word {'), '.karaoke-popover-word CSS exists');
    assert.ok(css.includes('.karaoke-popover-ipa {'), '.karaoke-popover-ipa CSS exists');
    assert.ok(css.includes('.karaoke-popover-trans {'), '.karaoke-popover-trans CSS exists');
    assert.ok(css.includes('.karaoke-popover-actions {'), '.karaoke-popover-actions CSS exists');
    assert.ok(songsCode.includes('data-popover-speak='), 'Popover template provides voice listen button');
    assert.ok(songsCode.includes('data-popover-add='), 'Popover template provides deck add button');
  });
});
