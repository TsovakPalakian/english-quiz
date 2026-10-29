import test from 'node:test';
import assert from 'node:assert/strict';
import { QuizTelemetryTracker } from '../client/main/quiz-telemetry-tracker.js';
import { deriveFsrsGrade, buildFsrsReviewPayload, FSRS_QUIZ_GRADES } from '../client/main/quiz-fsrs-bridge.js';

test('QuizTelemetryTracker tracks latency, distractors, and hesitation', () => {
  const tracker = new QuizTelemetryTracker();
  const item = { type: 'Choice', word: 'resilient' };

  tracker.start(item);
  assert.ok(item.shownAt > 0);

  // Student clicks distractor first
  tracker.noteDistractor('fragile');
  tracker.noteDistractor('weak');

  const telemetry = tracker.stop(true);
  assert.ok(telemetry.rawLatencyMs >= 0);
  assert.ok(telemetry.effectiveLatencyMs >= 100);
  assert.deepEqual(telemetry.distractorsClicked, ['fragile', 'weak']);
  assert.equal(item.telemetry, telemetry);
});

test('deriveFsrsGrade integrates with telemetry metrics', () => {
  // Explicit grade preserved
  assert.equal(deriveFsrsGrade(true, { grade: 4 }), 4);
  assert.equal(deriveFsrsGrade(false, { grade: 1 }), 1);

  // Rapid accurate answer -> EASY
  const easyItem = {
    latencyMs: 1400,
    telemetry: { effectiveLatencyMs: 1400, speedCategory: 'rapid', isRapidGuess: false }
  };
  assert.equal(deriveFsrsGrade(true, easyItem), FSRS_QUIZ_GRADES.EASY);

  // Hesitant/struggling answer -> HARD
  const hardItem = {
    latencyMs: 12000,
    telemetry: { effectiveLatencyMs: 12000, speedCategory: 'struggling' }
  };
  assert.equal(deriveFsrsGrade(true, hardItem), FSRS_QUIZ_GRADES.HARD);

  // Failure -> AGAIN
  assert.equal(deriveFsrsGrade(false, hardItem), FSRS_QUIZ_GRADES.AGAIN);
});

test('buildFsrsReviewPayload includes formatted telemetry', () => {
  const item = {
    id: 42,
    word: 'persevere',
    type: 'Choice',
    latencyMs: 4500,
    telemetry: { effectiveLatencyMs: 4500, speedCategory: 'optimal' }
  };
  const payload = buildFsrsReviewPayload(item, true);
  assert.equal(payload.itemId, 42);
  assert.equal(payload.word, 'persevere');
  assert.equal(payload.grade, FSRS_QUIZ_GRADES.GOOD);
  assert.equal(payload.latencyMs, 4500);
  assert.equal(payload.kind, 'quiz-choice');
});
