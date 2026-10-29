// Cognitive Telemetry & FSRS Calibration Analyzer
// Accurately assesses latency, filters out AFK pauses, detects rapid guessing, and evaluates memory calibration.

export const LATENCY_SPEED_CATEGORIES = Object.freeze({
  RAPID: 'rapid',
  OPTIMAL: 'optimal',
  HESITANT: 'hesitant',
  STRUGGLING: 'struggling',
  AFK: 'afk'
});

/**
 * Normalizes and analyzes raw response telemetry
 * @param {Object} options
 * @returns {Object} Analyzed telemetry metrics
 */
export function analyzeTelemetry({
  latencyMs = 0,
  activeFocusMs = null,
  firstInteractionMs = null,
  ok = false,
  hintUsed = false,
  distractorsClicked = [],
  exerciseType = 'choice'
} = {}) {
  const rawLatency = Math.max(0, Number(latencyMs) || 0);
  const activeFocus = activeFocusMs != null ? Math.max(0, Number(activeFocusMs)) : rawLatency;

  const hasMeasuredFocus = activeFocusMs != null;
  const isAfk = hasMeasuredFocus ? activeFocus >= 60000 : rawLatency >= 60000;
  const wasTabSwitched = hasMeasuredFocus && (rawLatency - activeFocus) >= 5000;
  const effectiveLatency = isAfk ? 60000 : Math.max(100, Math.min(activeFocus, 60000));
  const isRapidGuess = !ok && effectiveLatency < 800 && exerciseType !== 'flip';

  let speedCategory;
  if (isAfk) {
    speedCategory = LATENCY_SPEED_CATEGORIES.AFK;
  } else if (effectiveLatency < 1500) {
    speedCategory = LATENCY_SPEED_CATEGORIES.RAPID;
  } else if (effectiveLatency <= 4000) {
    speedCategory = LATENCY_SPEED_CATEGORIES.OPTIMAL;
  } else if (effectiveLatency <= 8000) {
    speedCategory = LATENCY_SPEED_CATEGORIES.HESITANT;
  } else {
    speedCategory = LATENCY_SPEED_CATEGORIES.STRUGGLING;
  }

  let cognitiveEfficiency = 0.5;
  if (ok) {
    if (speedCategory === LATENCY_SPEED_CATEGORIES.RAPID && !hintUsed) cognitiveEfficiency = 1.0;
    else if (speedCategory === LATENCY_SPEED_CATEGORIES.OPTIMAL && !hintUsed) cognitiveEfficiency = 0.9;
    else if (speedCategory === LATENCY_SPEED_CATEGORIES.HESITANT) cognitiveEfficiency = 0.7;
    else if (hintUsed) cognitiveEfficiency = 0.5;
    else cognitiveEfficiency = 0.4;
  } else {
    cognitiveEfficiency = isRapidGuess ? 0.1 : 0.2;
  }

  return {
    rawLatencyMs: rawLatency,
    effectiveLatencyMs: effectiveLatency,
    firstInteractionMs: firstInteractionMs != null ? Math.max(0, Number(firstInteractionMs)) : null,
    isAfk,
    wasTabSwitched,
    isRapidGuess,
    speedCategory,
    distractorCount: Array.isArray(distractorsClicked) ? distractorsClicked.length : 0,
    cognitiveEfficiency: Number(cognitiveEfficiency.toFixed(2))
  };
}

/**
 * Computes prediction accuracy metrics (Brier score, LogLoss) across reviews
 * @param {Array<Object>} reviews - Array of { ok, retrievability }
 * @returns {Object} Accuracy metrics
 */
export function evaluateRetentionAccuracy(reviews = []) {
  if (!reviews.length) return { sampleCount: 0, brierScore: 0, logLoss: 0, empiricalRetention: 0 };

  let totalBrier = 0;
  let totalLogLoss = 0;
  let totalCorrect = 0;
  const eps = 1e-6;

  for (const r of reviews) {
    const y = r.ok ? 1 : 0;
    const p = Math.max(eps, Math.min(1 - eps, Number(r.retrievability) || 0.9));
    totalBrier += Math.pow(p - y, 2);
    totalLogLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    if (y === 1) totalCorrect += 1;
  }

  const n = reviews.length;
  return {
    sampleCount: n,
    brierScore: Number((totalBrier / n).toFixed(4)),
    logLoss: Number((totalLogLoss / n).toFixed(4)),
    empiricalRetention: Number((totalCorrect / n).toFixed(4))
  };
}
