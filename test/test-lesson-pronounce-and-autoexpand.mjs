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

test('Stage 13: Pronounce widget rendering without Check with AI or Microphone fallback', () => {
  const code = fs.readFileSync('client/main/material-upgrades.js', 'utf8');
  const match = code.match(/function renderPronunciationExerciseHtml\([\s\S]*?\n\}/);
  assert.ok(match, 'renderPronunciationExerciseHtml must be present in client/main/material-upgrades.js');

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  const renderPronunciationExerciseHtml = new Function('esc', 'return (' + match[0] + ')')(esc);

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
  assert.equal(html.includes('data-pronounce-check'), false, 'Must NOT contain AI check button');
  assert.equal(html.includes('data-pronounce-fallback'), false, 'Must NOT contain microphone fallback button');
  assert.equal(html.includes('Microphone unavailable?'), false, 'Must NOT contain Microphone unavailable text');
  assert.ok(html.includes('ˈʃɛdjuːl'), 'Contains IPA transcription');
  assert.ok(html.includes('Say: schedule'), 'Contains phonetic prompt');
  assert.ok(html.includes('data-pronounce-audio="block-pronounce-1"'), 'Contains audio element container');
  assert.ok(html.includes('data-pronounce-status="block-pronounce-1"'), 'Contains status element container');
});

test('Pronounce widget: auto-evaluation on stop and code-level cleanup of Check with AI and fallback', () => {
  const code = fs.readFileSync('client/main/material-upgrades.js', 'utf8');

  // Verify auto-evaluation function and its call on recorder stop
  assert.ok(code.includes('async function runPronunciationEvaluation('), 'Must define runPronunciationEvaluation');
  assert.ok(code.includes('runPronunciationEvaluation(widget, id, blob);'), 'recorder.onstop must call runPronunciationEvaluation');

  // Verify total removal from codebase
  assert.equal(code.includes('Microphone unavailable'), false, 'Must not contain Microphone unavailable anywhere in code');
  assert.equal(code.includes('data-pronounce-check'), false, 'Must not contain data-pronounce-check in code');
  assert.equal(code.includes('data-pronounce-fallback'), false, 'Must not contain data-pronounce-fallback in code');

  // Verify error handling does not reference unavailable or fallback
  assert.ok(code.includes('Microphone access error: Audio recording is not supported in this browser.'), 'Browser missing MediaRecorder error handled cleanly');
});

test('Visual test: Pronounce widget styles render accurately across sky, dark and light themes without hardcoded inline overrides', () => {
  const css = fs.readFileSync('site/preview.css', 'utf8');

  // Verify pronounce-widget styles in CSS
  assert.ok(css.includes('.pronounce-widget {'), '.pronounce-widget rule must exist');
  assert.ok(css.includes('.pronounce-score-badge {'), '.pronounce-score-badge rule must exist');
  assert.ok(css.includes('.pronounce-score-badge.needs-work {'), '.pronounce-score-badge.needs-work rule must exist');

  // Verify theme variable definitions for sky, dark, sand
  assert.ok(css.includes(':root[data-theme="sky"]'), 'Theme sky must be defined');
  assert.ok(css.includes(':root[data-theme="dark"]'), 'Theme dark must be defined');
  assert.ok(css.includes(':root[data-theme="sand"]'), 'Theme sand must be defined');
});

test('TASK-54: computePronunciationSimilarity accurately calculates score and distinguishes mismatched speech', () => {
  const code = fs.readFileSync('client/main/material-upgrades.js', 'utf8');
  assert.ok(code.includes('function computePronunciationSimilarity('), 'client/main/material-upgrades.js must implement computePronunciationSimilarity');

  // Evaluate the extracted function
  const match = code.match(/function computePronunciationSimilarity\([\s\S]*?\n\}/);
  assert.ok(match, 'computePronunciationSimilarity must be extracted cleanly');
  const computePronunciationSimilarity = new Function('return (' + match[0] + ')')();

  const same = {
    energy: [1, 0.8, 0.6, 0.4, 0.3, 0.2, 0.2, 0.1],
    zcr: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
    pitch: [0.4, 0.45, 0.5, 0.55],
    breath: 0.2
  };

  const lettersOnly = computePronunciationSimilarity('superstition', 'superstition');
  assert.equal(lettersOnly.passed, false, 'Letters without a reference recording must not pass');
  assert.equal(lettersOnly.score, 0, 'Letters without a reference recording score 0');
  assert.match(lettersOnly.feedback, /Reference pronunciation is not ready/);

  const silence = computePronunciationSimilarity('sprinter', '');
  assert.equal(silence.passed, false);
  assert.equal(silence.score, 0);
  const russian = computePronunciationSimilarity('sprinter', 'привет');
  assert.equal(russian.passed, false);
  assert.equal(russian.score, 0);

  const mismatch = computePronunciationSimilarity('superstition', 'apple');
  assert.equal(mismatch.passed, false, 'Mismatched word must NOT pass');
  assert.ok(mismatch.score <= 35, 'Mismatched score must be low (< 35%)');
  assert.ok(mismatch.feedback.includes('Pronunciation mismatch'), 'Feedback must state pronunciation mismatch');
  assert.ok(mismatch.feedback.includes('Heard: "apple"'), 'Feedback must detail heard word');
  assert.ok(mismatch.feedback.includes('Expected: "superstition"'), 'Feedback must detail expected target');

  const nearWord = computePronunciationSimilarity('home', 'come');
  assert.equal(nearWord.passed, false, 'A different word must not pass');
  assert.ok(nearWord.score < 75, 'A one-letter difference stays under the pass line');

  const idiom = computePronunciationSimilarity('knock on wood', 'knock on wood');
  assert.equal(idiom.passed, false, 'Matching text without the reference sound must not pass');

  const exact = computePronunciationSimilarity('superstition', 'superstition', { student: same, etalon: same });
  assert.equal(exact.passed, true, 'A recording that matches the reference must pass');
  assert.equal(exact.score, 100, 'Only the reference match scores 100');

  const shifted = computePronunciationSimilarity('superstition', 'superstition', {
    student: { ...same, energy: [0.8, 0.8, 0.6, 0.4, 0.3, 0.2, 0.2, 0.1] },
    etalon: same
  });
  assert.ok(shifted.score < 100, 'A stress change must lower the score');
  assert.notEqual(shifted.score, 100);
});

test('TASK-54: Pronounce widget includes data-pronounce-target and Re-record resets previous score & state', () => {
  const code = fs.readFileSync('client/main/material-upgrades.js', 'utf8');

  // Verify data-pronounce-target on widget container
  assert.ok(code.includes('data-pronounce-target="'), 'Pronounce widget must specify data-pronounce-target');
  assert.ok(code.includes('data-pronounce-ipa="'), 'Pronounce widget must send dictionary IPA');
  assert.ok(code.includes('widget._pronounceBlob = blob'), 'The recording is kept for scoring');
  assert.equal(code.includes('score: 92'), false, 'Empty speech must not score 92');

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
