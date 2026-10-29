// FSRS (Free Spaced Repetition Scheduler) Engine
// Mathematical model for human memory retention and optimal review scheduling.
// Supports 4 rating grades:
// 1 = Again (complete failure to recall)
// 2 = Hard (recalled with significant difficulty or hesitation)
// 3 = Good (recalled successfully with normal effort)
// 4 = Easy (recalled immediately with high confidence)

export const FSRS_GRADES = Object.freeze({
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4
});

export const DEFAULT_DESIRED_RETENTION = 0.90; // 90% retention target

// Standard 19 FSRS parameters (default weights calibrated on large benchmark corpora)
export const DEFAULT_FSRS_WEIGHTS = Object.freeze([
  0.40255, 1.18385, 3.173, 15.69105, // w0..w3: initial stability S0 for grades 1..4
  7.1949, 0.5345,                     // w4..w5: initial difficulty D0 and scaling
  1.4604, 0.0046, 1.54575, 0.1192,    // w6..w9: difficulty adjustment parameters
  1.01925, 1.9395, 0.11, 0.29605,     // w10..w13: recall stability update
  2.2698, 0.2315, 2.9898, 0.51655,    // w14..w17: w15 = hard penalty (0.2315 < 1), w16 = easy bonus (2.9898 > 1)
  0.6621                              // w18
]);

// Factor derived so that R(S, S) = 0.90:
// (1 + FACTOR * 1)^(-0.5) = 0.90 => 1 + FACTOR = 0.9^(-2) = 1 / 0.81 = 100/81 => FACTOR = 19/81
export const RETENTION_FACTOR = 19 / 81;

/**
 * Calculates current Retrievability R(t, S)
 * @param {number} elapsedDays - Time in days since last review
 * @param {number} stability - Current memory stability S (in days)
 * @returns {number} Probability of recall in [0, 1]
 */
export function calculateRetrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  if (elapsedDays <= 0) return 1.0;
  return Math.pow(1 + RETENTION_FACTOR * (elapsedDays / stability), -0.5);
}

/**
 * Calculates next interval I(S, desiredRetention) in days
 * @param {number} stability - Memory stability S (in days)
 * @param {number} desiredRetention - Target recall probability (default 0.90)
 * @returns {number} Interval in days (at least 1)
 */
export function calculateInterval(stability, desiredRetention = DEFAULT_DESIRED_RETENTION) {
  if (stability <= 0) return 1;
  const target = Math.min(Math.max(desiredRetention, 0.70), 0.98);
  const interval = (stability / RETENTION_FACTOR) * (Math.pow(target, -2) - 1);
  return Math.max(1, Math.round(interval));
}

/**
 * Calculates initial Difficulty D0(grade)
 * @param {number} grade - Rating 1..4
 * @param {Array<number>} w - Weights
 * @returns {number} Difficulty in [1, 10]
 */
export function initialDifficulty(grade, w = DEFAULT_FSRS_WEIGHTS) {
  const g = Math.min(Math.max(Number(grade) || 3, 1), 4);
  const d = w[4] - Math.exp(w[5] * (g - 1)) + 1;
  return Math.min(Math.max(d, 1.0), 10.0);
}

/**
 * Calculates initial Stability S0(grade)
 * @param {number} grade - Rating 1..4
 * @param {Array<number>} w - Weights
 * @returns {number} Stability in days
 */
export function initialStability(grade, w = DEFAULT_FSRS_WEIGHTS) {
  const g = Math.min(Math.max(Number(grade) || 3, 1), 4);
  return Math.max(Number(w[g - 1]) || 0.1, 0.1);
}

/**
 * Updates Difficulty after review D'(D, grade)
 * @param {number} currentDifficulty - Current D
 * @param {number} grade - Rating 1..4
 * @param {Array<number>} w - Weights
 * @returns {number} New difficulty in [1, 10]
 */
export function nextDifficulty(currentDifficulty, grade, w = DEFAULT_FSRS_WEIGHTS) {
  const g = Math.min(Math.max(Number(grade) || 3, 1), 4);
  const d0_good = initialDifficulty(FSRS_GRADES.GOOD, w);
  const deltaD = -w[6] * (g - 3);
  const updatedD = currentDifficulty + deltaD * ((10 - currentDifficulty) / 9);
  // Mean reversion towards initial difficulty D0(Good)
  const dPrime = w[7] * d0_good + (1 - w[7]) * updatedD;
  return Math.min(Math.max(dPrime, 1.0), 10.0);
}

/**
 * Updates Stability on successful recall (grade > 1)
 * @param {number} d - Difficulty
 * @param {number} s - Stability
 * @param {number} r - Retrievability at time of review
 * @param {number} grade - Rating 2, 3, or 4
 * @param {Array<number>} w - Weights
 * @returns {number} New stability S'
 */
export function nextRecallStability(d, s, r, grade, w = DEFAULT_FSRS_WEIGHTS) {
  const g = Math.min(Math.max(Number(grade) || 3, 2), 4);
  const hardPenalty = g === FSRS_GRADES.HARD ? w[15] : 1.0;
  const easyBonus = g === FSRS_GRADES.EASY ? w[16] : 1.0;
  const modifier = hardPenalty * easyBonus;

  const factor = 1 + Math.exp(w[8]) *
    (11 - d) *
    Math.pow(s, -w[9]) *
    (Math.exp((1 - r) * w[10]) - 1) *
    modifier;

  return Math.max(s * Math.max(factor, 1.0), 0.1);
}

/**
 * Updates Stability on recall failure (grade === 1, Again)
 * @param {number} d - Difficulty
 * @param {number} s - Stability
 * @param {number} r - Retrievability at time of review
 * @param {Array<number>} w - Weights
 * @returns {number} New stability S'
 */
export function nextForgetStability(d, s, r, w = DEFAULT_FSRS_WEIGHTS) {
  const factor = w[11] *
    Math.pow(d, -w[12]) *
    (Math.pow(s + 1, w[13]) - 1) *
    Math.exp((1 - r) * w[14]);

  // Post-lapse stability must not exceed previous stability
  return Math.min(Math.max(factor, 0.1), Math.max(s, 0.1));
}

/**
 * Full FSRS review step transition
 * @param {Object} card - Memory state { stability, difficulty, reps, lapses, lastReviewedAt }
 * @param {number} grade - Rating 1..4 (Again, Hard, Good, Easy)
 * @param {number} nowUnixSeconds - Current timestamp
 * @param {Object} options - { desiredRetention, weights }
 * @returns {Object} Updated state { stability, difficulty, retrievability, intervalDays, nextReviewAt, reps, lapses }
 */
export function scheduleReview(card = {}, grade, nowUnixSeconds = Math.floor(Date.now() / 1000), options = {}) {
  const w = options.weights || DEFAULT_FSRS_WEIGHTS;
  const desiredRetention = options.desiredRetention || DEFAULT_DESIRED_RETENTION;
  const g = Math.min(Math.max(Number(grade) || 3, 1), 4);

  const reps = (Number(card.reps) || 0) + 1;
  let lapses = Number(card.lapses) || 0;
  let s = Number(card.stability) || 0;
  let d = Number(card.difficulty) || 0;
  const lastReviewedAt = Number(card.lastReviewedAt) || 0;

  if (s <= 0 || d <= 0 || reps === 1) {
    // Initial review for an uncalibrated / new item
    s = initialStability(g, w);
    d = initialDifficulty(g, w);
    if (g === FSRS_GRADES.AGAIN) lapses += 1;
  } else {
    // Subsequent review
    const elapsedDays = lastReviewedAt > 0 ? Math.max((nowUnixSeconds - lastReviewedAt) / 86400, 0.001) : 1;
    const r = calculateRetrievability(elapsedDays, s);

    d = nextDifficulty(d, g, w);
    if (g === FSRS_GRADES.AGAIN) {
      lapses += 1;
      s = nextForgetStability(d, s, r, w);
    } else {
      s = nextRecallStability(d, s, r, g, w);
    }
  }

  const intervalDays = g === FSRS_GRADES.AGAIN ? 1 : calculateInterval(s, desiredRetention);
  const nextReviewAt = nowUnixSeconds + intervalDays * 86400;
  const retrievability = calculateRetrievability(0, s); // 1.0 right after review

  return {
    grade: g,
    stability: Number(s.toFixed(4)),
    difficulty: Number(d.toFixed(4)),
    retrievability: Number(retrievability.toFixed(4)),
    intervalDays,
    nextReviewAt,
    reps,
    lapses,
    lastReviewedAt: nowUnixSeconds
  };
}

/**
 * Previews intervals for all 4 rating grades for UI buttons
 * @param {Object} card - Memory state
 * @param {number} nowUnixSeconds - Current timestamp
 * @param {Object} options - Options
 * @returns {Object} { 1: days, 2: days, 3: days, 4: days }
 */
export function previewIntervals(card = {}, nowUnixSeconds = Math.floor(Date.now() / 1000), options = {}) {
  const again = scheduleReview(card, FSRS_GRADES.AGAIN, nowUnixSeconds, options);
  const hard = scheduleReview(card, FSRS_GRADES.HARD, nowUnixSeconds, options);
  const good = scheduleReview(card, FSRS_GRADES.GOOD, nowUnixSeconds, options);
  const easy = scheduleReview(card, FSRS_GRADES.EASY, nowUnixSeconds, options);

  return {
    [FSRS_GRADES.AGAIN]: again.intervalDays,
    [FSRS_GRADES.HARD]: hard.intervalDays,
    [FSRS_GRADES.GOOD]: good.intervalDays,
    [FSRS_GRADES.EASY]: easy.intervalDays
  };
}
