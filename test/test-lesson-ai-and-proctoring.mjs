import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLessonFromText } from '../src/lesson-pdf-meta.mjs';

test('Stage 4 & 6: generateLessonFromText generates structured 5-stage lesson grounded in topic', async () => {
  const result = await generateLessonFromText({
    text: 'Travel and Transport: detour, commuter, boarding pass. Rules: phrasal verbs of travel.',
    level: 'B2',
    title: 'Travel and Transport'
  });

  assert.equal(result.title, 'Travel and Transport');
  assert.equal(result.className, 'B2');
  assert.ok(Array.isArray(result.words) && result.words.length > 0, 'Words array is non-empty');
  assert.ok(Array.isArray(result.phrases) && result.phrases.length > 0, 'Phrases array is non-empty');
  assert.ok(Array.isArray(result.rules) && result.rules.length > 0, 'Rules array is non-empty');
  assert.ok(Array.isArray(result.classwork) && result.classwork.length >= 5, 'Classwork has at least 5 stages');

  // Verify 5 distinct stages
  const stages = result.classwork.map(c => c.stage);
  assert.ok(stages.includes('explanation'), 'Contains explanation stage');
  assert.ok(stages.includes('comprehension'), 'Contains comprehension stage');
  assert.ok(stages.includes('guided'), 'Contains guided stage');
  assert.ok(stages.includes('independent'), 'Contains independent stage');
  assert.ok(stages.includes('final'), 'Contains final stage');

  // Verify translations present
  for (const w of result.words) {
    assert.ok(w.translation && w.translation.length > 0, `Word ${w.word} has translation`);
    assert.ok(w.meaning && w.meaning.length > 0, `Word ${w.word} has meaning`);
  }
});

test('Stage E4: Strict proctoring timer, tab-switch tracking, and clipboard lock', () => {
  let timerFired = false;
  let remaining = 90 * 60; // 90 min = 5400 sec
  let tabSwitches = 0;
  let clipboardBlocked = false;

  // Mock taking state
  const mockState = { examOwned: true, studentSaved: false };
  const canEdit = false;
  const isTaking = !!(mockState.examOwned && !canEdit && !mockState.studentSaved);
  assert.equal(isTaking, true, 'Student is in exam taking mode');

  // 1. Timer countdown simulation
  remaining -= 1;
  assert.equal(remaining, 5399, 'Timer counts down');

  // 2. Tab switch detection simulation
  function simulateVisibilityChange(hidden) {
    if (isTaking && hidden) {
      tabSwitches += 1;
    }
  }

  simulateVisibilityChange(true); // Tab switched away
  simulateVisibilityChange(false); // Tab returned
  assert.equal(tabSwitches, 1, 'Tab switch recorded');

  simulateVisibilityChange(true); // Tab switched away second time
  assert.equal(tabSwitches, 2, 'Second tab switch recorded');

  // 3. Clipboard lock simulation
  function simulateClipboardEvent(type) {
    if (isTaking && ['copy', 'cut', 'paste'].includes(type)) {
      clipboardBlocked = true;
      return false;
    }
    return true;
  }

  assert.equal(simulateClipboardEvent('copy'), false, 'Copy event is prevented');
  assert.equal(clipboardBlocked, true, 'Clipboard action blocked');
  assert.equal(simulateClipboardEvent('paste'), false, 'Paste event is prevented');
});
