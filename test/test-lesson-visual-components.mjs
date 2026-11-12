import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Visual Test: CSS and DOM UI/UX specifications for Lesson and Exam Generator', async (t) => {
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const html = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');
  const lessonsJs = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');

  await t.test('Visual Test 1: Dual-frame cards, title styling and blinking video alert', () => {
    assert.ok(css.includes('.lm-frame-card {'), '.lm-frame-card CSS rule exists');
    assert.ok(css.includes('.lm-frame-title {'), '.lm-frame-title CSS rule exists');
    assert.ok(css.includes('@keyframes lmBlinkAlert'), '@keyframes lmBlinkAlert exists');
    assert.ok(css.includes('.lm-blink-alert {'), '.lm-blink-alert animation class exists');
    assert.ok(html.includes('class="lm-sheet lm-frame-card lm-import-frame"'), 'HTML contains .lm-import-frame');
    assert.ok(html.includes('class="lm-sheet lm-frame-card" id="lmFrameBasic"'), 'HTML contains .lm-frame-card id="lmFrameBasic"');
  });

  await t.test('Visual Test 2: Full Focus Player overlay, segmented bar, cards and hotkey labels', () => {
    assert.ok(css.includes('.focus-player-overlay {'), '.focus-player-overlay exists');
    assert.ok(css.includes('.focus-segment {'), '.focus-segment exists');
    assert.ok(css.includes('.focus-card {'), '.focus-card exists');
    assert.ok(css.includes('.focus-option-btn {'), '.focus-option-btn exists');
    assert.ok(css.includes('.focus-option-key {'), '.focus-option-key exists');
    assert.ok(css.includes('.focus-strip-chip {'), '.focus-strip-chip exists');
    assert.ok(html.includes('id="lmFocusPlayerBtn"') || lessonsJs.includes('id="lmFocusPlayerBtn"'), '#lmFocusPlayerBtn exists in HTML toolbar or practice bar');
  });

  await t.test('Visual Test 3: Voice Mode modal dialog, disclaimer styling, and controls', () => {
    assert.ok(css.includes('.voice-modal-overlay {'), '.voice-modal-overlay CSS exists');
    assert.ok(css.includes('.voice-modal-card {'), '.voice-modal-card CSS exists');
    assert.ok(html.includes('id="lmVoiceModeModal"'), '#lmVoiceModeModal exists in HTML');
    assert.ok(html.includes('id="lmVoiceModeBtn"') || lessonsJs.includes('id="lmVoiceModeBtn"'), '#lmVoiceModeBtn exists in HTML toolbar or practice bar');
    assert.ok(html.includes('class="lm-voice-disclaimer"'), '.lm-voice-disclaimer exists in HTML');
    assert.ok(html.includes('id="lmVoiceDialogueHistory"'), '#lmVoiceDialogueHistory exists in HTML');
    assert.ok(html.includes('id="lmVoiceMicBtn"'), '#lmVoiceMicBtn exists in HTML');
  });

  await t.test('Visual Test 4: Teacher Verification badges, approve all button, and two-factor cards', () => {
    assert.ok(css.includes('.lm-verified-badge {'), '.lm-verified-badge CSS exists');
    assert.ok(css.includes('.two-factor-review-card {'), '.two-factor-review-card CSS exists');
    assert.ok(html.includes('id="lmApproveAllBlocksBtn"'), '#lmApproveAllBlocksBtn exists in HTML toolbar');
    assert.ok(html.includes('id="lmTeacherVerifyCheckbox"'), '#lmTeacherVerifyCheckbox exists in HTML');
    assert.ok(html.includes('id="lmTeacherVerifyBadge"'), '#lmTeacherVerifyBadge exists in HTML');
  });

  await t.test('Visual Test 5: Exam strict proctoring badges, video quota lock, and speaking pulse badge', () => {
    assert.ok(css.includes('.exam-video-quota-badge {'), '.exam-video-quota-badge CSS exists');
    assert.ok(css.includes('.exam-video-quota-badge.is-locked {'), '.exam-video-quota-badge.is-locked CSS exists');
    assert.ok(css.includes('.exam-speaking-recording-badge {'), '.exam-speaking-recording-badge CSS exists');
    assert.ok(css.includes('@keyframes examRecPulse'), '@keyframes examRecPulse animation exists');
    assert.ok(css.includes('.exam-proctor-audit-card {'), '.exam-proctor-audit-card CSS exists');
  });

  await t.test('Visual Test 6: Responsive flex-wrap on editor action bar and PDF draft selection invariant', () => {
    assert.ok(html.includes('style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:center; margin-top:12px;"') || html.includes('flex-wrap:wrap'), 'HTML editor toolbar contains flex-wrap:wrap');
    const pdfImportCode = fs.readFileSync(path.join(rootDir, 'client/52b-lesson-pdf-import.js'), 'utf8');
    assert.ok(pdfImportCode.includes('Boolean(isDocument && current &&'), 'PDF draft dialog preserves full section selection for binary PDF files');
  });
});
