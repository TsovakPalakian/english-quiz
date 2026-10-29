import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTelemetry,
  evaluateRetentionAccuracy,
  LATENCY_SPEED_CATEGORIES
} from '../src/learning-telemetry-analyzer.mjs';

test('analyzeTelemetry categorizes speed accurately based on active focus time', () => {
  // Rapid response (< 1500ms)
  const rapid = analyzeTelemetry({ latencyMs: 1200, activeFocusMs: 1200, ok: true });
  assert.equal(rapid.speedCategory, LATENCY_SPEED_CATEGORIES.RAPID);
  assert.equal(rapid.isAfk, false);
  assert.equal(rapid.isRapidGuess, false);
  assert.equal(rapid.cognitiveEfficiency, 1.0);

  // Optimal response (1500ms - 4000ms)
  const optimal = analyzeTelemetry({ latencyMs: 2500, activeFocusMs: 2500, ok: true });
  assert.equal(optimal.speedCategory, LATENCY_SPEED_CATEGORIES.OPTIMAL);
  assert.equal(optimal.cognitiveEfficiency, 0.9);

  // Hesitant response (4000ms - 8000ms)
  const hesitant = analyzeTelemetry({ latencyMs: 6500, activeFocusMs: 6500, ok: true });
  assert.equal(hesitant.speedCategory, LATENCY_SPEED_CATEGORIES.HESITANT);
  assert.equal(hesitant.cognitiveEfficiency, 0.7);

  // Struggling (> 8000ms)
  const struggling = analyzeTelemetry({ latencyMs: 15000, activeFocusMs: 15000, ok: true });
  assert.equal(struggling.speedCategory, LATENCY_SPEED_CATEGORIES.STRUGGLING);
  assert.equal(struggling.cognitiveEfficiency, 0.4);
});

test('analyzeTelemetry detects AFK pauses and clamps effective latency', () => {
  // Student left window for 10 minutes (600,000ms), but active focus was only 3,200ms
  const switchedTab = analyzeTelemetry({
    latencyMs: 600000,
    activeFocusMs: 3200,
    ok: true
  });
  assert.equal(switchedTab.isAfk, false);
  assert.equal(switchedTab.effectiveLatencyMs, 3200);
  assert.equal(switchedTab.speedCategory, LATENCY_SPEED_CATEGORIES.OPTIMAL);

  // Truly idle / AFK on screen > 60 seconds
  const afk = analyzeTelemetry({
    latencyMs: 80000,
    activeFocusMs: 75000,
    ok: true
  });
  assert.equal(afk.isAfk, true);
  assert.equal(afk.speedCategory, LATENCY_SPEED_CATEGORIES.AFK);
  assert.equal(afk.effectiveLatencyMs, 60000);
});

test('analyzeTelemetry detects rapid guessing on incorrect quick responses', () => {
  const guess = analyzeTelemetry({
    latencyMs: 400,
    activeFocusMs: 400,
    ok: false,
    exerciseType: 'choice'
  });
  assert.equal(guess.isRapidGuess, true);
  assert.equal(guess.cognitiveEfficiency, 0.1);
});

test('evaluateRetentionAccuracy computes Brier score and LogLoss metrics', () => {
  const reviews = [
    { ok: true, retrievability: 0.95 },
    { ok: true, retrievability: 0.90 },
    { ok: false, retrievability: 0.80 },
    { ok: true, retrievability: 0.85 }
  ];

  const evalResult = evaluateRetentionAccuracy(reviews);
  assert.equal(evalResult.sampleCount, 4);
  assert.equal(evalResult.empiricalRetention, 0.75); // 3 of 4 correct
  assert.ok(evalResult.brierScore > 0 && evalResult.brierScore < 0.3);
  assert.ok(evalResult.logLoss > 0 && evalResult.logLoss < 1.0);
});
