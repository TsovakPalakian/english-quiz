// Universal Quiz-to-FSRS Bridge
// Automatically translates exercise outcomes (Choice, Gap, Type, Build, Match) to FSRS memory updates.

export const FSRS_QUIZ_GRADES = Object.freeze({
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4
});

/**
 * Calculates FSRS rating (1..4) based on correctness and response telemetry
 * @param {boolean} ok - Correct or incorrect
 * @param {Object} item - Quiz item with timing/hints { latencyMs, hintUsed }
 * @returns {number} Grade in 1..4
 */
export function deriveFsrsGrade(ok, item = {}) {
  if (!ok) return FSRS_QUIZ_GRADES.AGAIN;
  const latency = Number(item.latencyMs) || 0;
  if (item.hintUsed || latency > 10000) return FSRS_QUIZ_GRADES.HARD;
  if (latency > 0 && latency < 3000) return FSRS_QUIZ_GRADES.EASY;
  return FSRS_QUIZ_GRADES.GOOD;
}

/**
 * Builds API review payload for /api/error-bank
 * @param {Object} item - Quiz item
 * @param {boolean} ok - Result
 * @returns {Object} Payload
 */
export function buildFsrsReviewPayload(item = {}, ok = false) {
  const grade = deriveFsrsGrade(ok, item);
  const latencyMs = Number(item.latencyMs) || 0;
  const word = item.card?.en || item.line || item.word || '';
  const expectedAnswer = item.expected || item.card?.en || item.card?.ru || item.right || '';
  const answer = item.given != null ? String(item.given) : (ok ? expectedAnswer : '');

  return {
    itemId: item.itemId || item.id || null,
    word,
    expectedAnswer,
    answer,
    grade,
    latencyMs,
    kind: 'quiz-' + String(item.type || 'quiz').toLowerCase(),
    prompt: item.prompt || item.line || word
  };
}
