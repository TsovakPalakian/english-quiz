import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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

test('fsrsCardMetricsHtml renders structured FSRS memory and telemetry analytics', () => {
  const code = readFileSync('client/50-quiz-fsrs.js', 'utf8');
  const sandbox = {
    window: {},
    document: { readyState: 'complete', addEventListener() {} },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); }
    },
    accountFetch: async () => ({}),
    authUser: { id: 1 },
    viewAccount: null
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  // 1. Unreviewed card returns empty string
  assert.equal(sandbox.window.fsrsCardMetricsHtml({ en: 'unseen' }), '');

  // 2. Persisted review creates structured widget with metrics
  sandbox.window.saveCardFsrs('resilient', {
    stability: 5.4,
    difficulty: 3.2,
    retrievability: 0.95,
    intervalDays: 5,
    telemetry: { effectiveLatencyMs: 1650, speedCategory: 'fast' }
  });

  const widget = sandbox.window.fsrsCardMetricsHtml({ en: 'resilient' });
  assert.ok(widget.includes('fsrs-card-metrics'));
  assert.ok(widget.includes('95% retention'));
  assert.ok(widget.includes('5.4d'));
  assert.ok(widget.includes('3.2'));
  assert.ok(widget.includes('5d'));
  assert.ok(widget.includes('1.6s (fast)'));
});
