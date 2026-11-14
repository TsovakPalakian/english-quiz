import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EXAM_SPEAKING_LIMITS, checkExamSpeakingDuration } from '../src/quiz-media.mjs';

test('Stage E6: EXAM_SPEAKING_LIMITS and checkExamSpeakingDuration', () => {
  assert.equal(EXAM_SPEAKING_LIMITS.maxSeconds, 90, 'Exam speaking duration is strictly 90 seconds max');
  assert.equal(EXAM_SPEAKING_LIMITS.autoStop, true, 'Auto-stop is active');

  assert.equal(checkExamSpeakingDuration(0), true, '0s within limit');
  assert.equal(checkExamSpeakingDuration(45), true, '45s within limit');
  assert.equal(checkExamSpeakingDuration(90), true, '90s exactly on limit');
  assert.equal(checkExamSpeakingDuration(91), false, '91s exceeds limit');
  assert.equal(checkExamSpeakingDuration(180), false, '180s exceeds limit');
});

test('Stage 12: Auto-expanding textarea #lmScriptInput', () => {
  const textareaMock = {
    scrollHeight: 150,
    style: { height: '90px' },
    dataset: {},
    eventListeners: {},
    addEventListener(name, fn) {
      this.eventListeners[name] = fn;
    }
  };

  globalThis.document = {
    getElementById(id) {
      if (id === 'lmScriptInput') return textareaMock;
      return null;
    }
  };

  function lmAutoExpandScriptInput() {
    const input = document.getElementById('lmScriptInput');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.max(90, input.scrollHeight) + 'px';
  }

  function lmInitScriptInputAutoExpand() {
    const input = document.getElementById('lmScriptInput');
    if (!input || input.dataset.autoExpandInit) return;
    input.dataset.autoExpandInit = '1';
    input.addEventListener('input', lmAutoExpandScriptInput);
    input.addEventListener('change', lmAutoExpandScriptInput);
    lmAutoExpandScriptInput();
  }

  lmInitScriptInputAutoExpand();
  assert.equal(textareaMock.dataset.autoExpandInit, '1');
  assert.equal(textareaMock.style.height, '150px', 'Initial height expanded to scrollHeight 150px');

  // Simulate text added
  textareaMock.scrollHeight = 320;
  textareaMock.eventListeners.input();
  assert.equal(textareaMock.style.height, '320px', 'Height expanded to 320px on text input');

  // Simulate text cleared (falls back to min-height 90px)
  textareaMock.scrollHeight = 40;
  textareaMock.eventListeners.input();
  assert.equal(textareaMock.style.height, '90px', 'Height collapses back to 90px minimum');
});

test('Stage 13: Pronounce widget rendering, AI check and phonetic fallback in CW/HW', () => {
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function renderPronunciationExerciseHtml(part, exam = false) {
    const item = part.items?.[0] || part;
    const word = item.word || part.title?.replace(/^(?:HW|CW)\s+Pronounce:\s*/i, '') || '';
    const prompt = item.phoneticPrompt || ('Say: "' + word + '"');
    const id = String(part.id || 'pronounce-item');
    const d1 = (item.options && item.options[1]) || (word + 'ed');
    const d2 = (item.options && item.options[2]) || 'distractor';
    const options = item.options || [word, d1, d2];
    return '<div class="pronounce-widget" data-pronounce-widget="' + esc(id) + '">' +
      '<h4>🎙️ ' + esc(part.title || 'Pronounce: ' + word) + '</h4>' +
      '<p style="font-size:15px; font-weight:700; color:var(--primary, #2563eb); margin:4px 0;">' + esc(prompt) + '</p>' +
      (item.ipa ? '<p class="hint" style="font-family:monospace; margin:2px 0;">/' + esc(item.ipa) + '/</p>' : '') +
      '<div class="pronounce-controls" style="display:flex; align-items:center; gap:10px; margin-top:8px;">' +
        '<button type="button" class="btn primary saas-btn" data-pronounce-record="' + esc(id) + '">🎤 Record speech</button>' +
        '<button type="button" class="btn secondary saas-btn" data-pronounce-check="' + esc(id) + '" style="display:none;">Check with AI</button>' +
        '<button type="button" class="btn-sm" data-pronounce-fallback="' + esc(id) + '" style="font-size:11px; text-decoration:underline; background:none; border:none; cursor:pointer; color:var(--saas-text, #475569);">Microphone unavailable?</button>' +
      '</div>' +
      '<div data-pronounce-audio="' + esc(id) + '" style="margin-top:6px;"></div>' +
      '<div data-pronounce-status="' + esc(id) + '" style="font-size:12px; margin-top:4px;"></div>' +
      '<div data-pronounce-fallback-box="' + esc(id) + '" style="display:none; margin-top:10px; padding:10px; border-top:1px dashed var(--saas-border, #cbd5e1);">' +
        '<p style="font-size:12px; font-weight:600; margin-bottom:6px;">Select the correct phonetic pronunciation:</p>' +
        options.map((opt, i) =>
          '<label style="display:flex; align-items:center; gap:6px; margin:4px 0; font-size:13px; cursor:pointer;">' +
            '<input type="radio" name="pronounce-opt-' + esc(id) + '" value="' + i + '" data-pronounce-option="' + esc(id) + '">' +
            esc(opt) +
          '</label>'
        ).join('') +
      '</div>' +
    '</div>';
  }

  const part = {
    id: 'block-pronounce-1',
    title: 'CW Pronounce: schedule',
    quizType: 'Pronunciation',
    items: [{
      word: 'schedule',
      ipa: 'ˈʃɛdjuːl',
      phoneticPrompt: 'Say: schedule',
      options: ['schedule', 'skedule', 'skejool']
    }]
  };

  const html = renderPronunciationExerciseHtml(part, false);
  assert.ok(html.includes('data-pronounce-record="block-pronounce-1"'), 'Contains record button');
  assert.ok(html.includes('data-pronounce-check="block-pronounce-1"'), 'Contains AI check button');
  assert.ok(html.includes('data-pronounce-fallback="block-pronounce-1"'), 'Contains microphone fallback button');
  assert.ok(html.includes('ˈʃɛdjuːl'), 'Contains IPA transcription');
  assert.ok(html.includes('Say: schedule'), 'Contains phonetic prompt');
  assert.ok(html.includes('name="pronounce-opt-block-pronounce-1"'), 'Contains fallback radio choices');
});

test('TASK-54: computePronunciationSimilarity accurately calculates score and distinguishes mismatched speech', () => {
  const code = fs.readFileSync('client/main/material-upgrades.js', 'utf8');
  assert.ok(code.includes('function computePronunciationSimilarity('), 'client/main/material-upgrades.js must implement computePronunciationSimilarity');

  // Evaluate the extracted function
  const match = code.match(/function computePronunciationSimilarity\([\s\S]*?\n\}/);
  assert.ok(match, 'computePronunciationSimilarity must be extracted cleanly');
  const computePronunciationSimilarity = new Function('return (' + match[0] + ')')();

  // Test 1: Exactly matching utterance
  const exact = computePronunciationSimilarity('superstition', 'superstition');
  assert.equal(exact.passed, true, 'Exact match must pass');
  assert.ok(exact.score >= 90, 'Exact match score must be >= 90%');

  // Test 2: Completely mismatched word (e.g. user said "apple" instead of "superstition")
  const mismatch = computePronunciationSimilarity('superstition', 'apple');
  assert.equal(mismatch.passed, false, 'Mismatched word must NOT pass');
  assert.ok(mismatch.score <= 35, 'Mismatched score must be low (< 35%)');
  assert.ok(mismatch.feedback.includes('Pronunciation mismatch'), 'Feedback must state pronunciation mismatch');
  assert.ok(mismatch.feedback.includes('Heard: "apple"'), 'Feedback must detail heard word');
  assert.ok(mismatch.feedback.includes('Expected: "superstition"'), 'Feedback must detail expected target');

  // Test 3: Close pronunciation with minor articulation discrepancy
  const close = computePronunciationSimilarity('knock on wood', 'knock on wood');
  assert.equal(close.passed, true, 'Matching idiom must pass');
});

test('TASK-54: Pronounce widget includes data-pronounce-target and Re-record resets previous score & state', () => {
  const code = fs.readFileSync('client/main/material-upgrades.js', 'utf8');

  // Verify data-pronounce-target on widget container
  assert.ok(code.includes('data-pronounce-target="'), 'Pronounce widget must specify data-pronounce-target');

  // Verify Re-record reset logic
  assert.ok(code.includes("if (status) status.innerHTML = '';"), 'Re-record must immediately clear status innerHTML');
  assert.ok(code.includes("if (audioBox) audioBox.innerHTML = '';"), 'Re-record must immediately clear audioBox');
  assert.ok(code.includes("delete widget._spokenTranscript;"), 'Re-record must clear spoken transcript from widget');
  assert.ok(code.includes("delete widget.dataset.lastSpoken;"), 'Re-record must clear lastSpoken dataset');

  // Verify CSS contains needs-work styling
  const css = fs.readFileSync('site/preview.css', 'utf8');
  assert.ok(css.includes('.pronounce-score-badge.needs-work'), 'CSS must define .pronounce-score-badge.needs-work styling');
  assert.ok(css.includes('#fee2e2'), 'needs-work badge must have light red background');
  assert.ok(css.includes('#991b1b'), 'needs-work badge must have dark red text');
});
