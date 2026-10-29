import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {
  FSRS_GRADES,
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_DESIRED_RETENTION,
  RETENTION_FACTOR,
  calculateRetrievability,
  calculateInterval,
  initialDifficulty,
  initialStability,
  nextDifficulty,
  nextRecallStability,
  nextForgetStability,
  scheduleReview,
  previewIntervals
} from '../src/fsrs-engine.mjs';
import {ErrorBankService} from '../src/learning-error-bank.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  const args = command => command.args.map(a => a.type === 'null' ? null : ['integer', 'float'].includes(a.type) ? Number(a.value) : a.value);
  const db = {
    async read(sql, queryArgs = []) { return sqlite.prepare(sql).all(...queryArgs); },
    async atomic(commands) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = commands.map(command => {
          const query = sqlite.prepare(command.sql), rows = query.all(...args(command));
          return {
            cols: query.columns().map(c => ({name: c.name})),
            rows: rows.map(row => Object.values(row).map(value => ({
              type: value == null ? 'null' : typeof value === 'number' ? 'integer' : 'text',
              value: String(value)
            })))
          };
        });
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return {sqlite, db};
}

const student = {id: 's_fsrs_1', name: 'FSRS Student', role: 'USER'};

test('FSRS mathematical engine: Grade constants and weights format', () => {
  assert.equal(FSRS_GRADES.AGAIN, 1);
  assert.equal(FSRS_GRADES.HARD, 2);
  assert.equal(FSRS_GRADES.GOOD, 3);
  assert.equal(FSRS_GRADES.EASY, 4);

  assert.equal(DEFAULT_FSRS_WEIGHTS.length, 19, 'FSRS-4.5/5 standard specifies 19 model parameters');
  assert.equal(DEFAULT_DESIRED_RETENTION, 0.90, 'Default retention target must be 90%');
});

test('FSRS initial stability S0(G) and difficulty D0(G)', () => {
  const sAgain = initialStability(FSRS_GRADES.AGAIN);
  const sHard = initialStability(FSRS_GRADES.HARD);
  const sGood = initialStability(FSRS_GRADES.GOOD);
  const sEasy = initialStability(FSRS_GRADES.EASY);

  // Initial stability must strictly increase from Again to Easy
  assert.ok(sAgain < sHard, `S0(Again) ${sAgain} must be < S0(Hard) ${sHard}`);
  assert.ok(sHard < sGood, `S0(Hard) ${sHard} must be < S0(Good) ${sGood}`);
  assert.ok(sGood < sEasy, `S0(Good) ${sGood} must be < S0(Easy) ${sEasy}`);

  const dAgain = initialDifficulty(FSRS_GRADES.AGAIN);
  const dHard = initialDifficulty(FSRS_GRADES.HARD);
  const dGood = initialDifficulty(FSRS_GRADES.GOOD);
  const dEasy = initialDifficulty(FSRS_GRADES.EASY);

  // Initial difficulty must be highest for Again and lowest for Easy
  assert.ok(dAgain > dHard, `D0(Again) ${dAgain} must be > D0(Hard) ${dHard}`);
  assert.ok(dHard > dGood, `D0(Hard) ${dHard} must be > D0(Good) ${dGood}`);
  assert.ok(dGood > dEasy, `D0(Good) ${dGood} must be > D0(Easy) ${dEasy}`);

  // All initial difficulties must stay within [1, 10]
  [dAgain, dHard, dGood, dEasy].forEach(d => {
    assert.ok(d >= 1.0 && d <= 10.0, `Difficulty ${d} must be within [1, 10]`);
  });
});

test('FSRS retrievability R(t, S) satisfies boundary conditions and decay properties', () => {
  const S = 3.173; // 3.173 days stability

  // At elapsed time 0, memory is fully retrievable (R = 1.0)
  assert.equal(calculateRetrievability(0, S), 1.0);

  // At elapsed time t = S, retrievability must match 0.90 exactly within precision
  const rAtS = calculateRetrievability(S, S);
  assert.ok(Math.abs(rAtS - 0.90) < 0.0001, `R(S, S) was ${rAtS}, expected 0.90`);

  // Monotonic decay over time
  const rDay1 = calculateRetrievability(1, S);
  const rDay3 = calculateRetrievability(3, S);
  const rDay10 = calculateRetrievability(10, S);

  assert.ok(rDay1 > rDay3, 'R(1) must be > R(3)');
  assert.ok(rDay3 > rDay10, 'R(3) must be > R(10)');

  // Degenerate cases
  assert.equal(calculateRetrievability(5, 0), 0);
  assert.equal(calculateRetrievability(5, -1), 0);
});

test('FSRS interval calculation adapts to desired retention threshold', () => {
  const S = 10.0;

  // At 90% desired retention, interval equals stability
  const i90 = calculateInterval(S, 0.90);
  assert.equal(i90, 10, 'Interval at 90% retention should equal stability (10 days)');

  // Lower retention target allows longer interval before review
  const i85 = calculateInterval(S, 0.85);
  assert.ok(i85 > i90, `Interval at 85% retention (${i85}) should exceed 90% retention (${i90})`);

  // Higher retention target requires shorter interval
  const i95 = calculateInterval(S, 0.95);
  assert.ok(i95 < i90, `Interval at 95% retention (${i95}) should be less than 90% retention (${i90})`);
});

test('FSRS scheduleReview lifecycle and difficulty transitions', () => {
  const now = 1700000000;

  // First review with Good
  const card1 = scheduleReview({}, FSRS_GRADES.GOOD, now);
  assert.equal(card1.reps, 1);
  assert.equal(card1.lapses, 0);
  assert.equal(card1.grade, 3);
  assert.ok(card1.stability > 0);
  assert.ok(card1.difficulty >= 1 && card1.difficulty <= 10);
  assert.equal(card1.intervalDays, 3);

  // Second review 3 days later with Good
  const reviewTime2 = now + card1.intervalDays * 86400;
  const card2 = scheduleReview(card1, FSRS_GRADES.GOOD, reviewTime2);
  assert.equal(card2.reps, 2);
  assert.equal(card2.lapses, 0);
  assert.ok(card2.stability > card1.stability, 'Stability must grow after successful recall');
  assert.ok(card2.intervalDays > card1.intervalDays, 'Interval must grow after successful recall');

  // Third review 11 days later with Failure (Again)
  const reviewTime3 = reviewTime2 + card2.intervalDays * 86400;
  const card3 = scheduleReview(card2, FSRS_GRADES.AGAIN, reviewTime3);
  assert.equal(card3.reps, 3);
  assert.equal(card3.lapses, 1, 'Lapse counter must increment on Again');
  assert.ok(card3.stability <= card2.stability, 'Stability must decrease on lapse');
  assert.equal(card3.intervalDays, 1, 'Interval must reset to 1 day on lapse');
});

test('FSRS previewIntervals produces monotonically non-decreasing intervals for UI buttons', () => {
  const card = {stability: 5.0, difficulty: 5.0, reps: 2, lapses: 0, lastReviewedAt: 1700000000};
  const previews = previewIntervals(card, 1700000000 + 5 * 86400);

  assert.ok(previews[FSRS_GRADES.AGAIN] <= previews[FSRS_GRADES.HARD]);
  assert.ok(previews[FSRS_GRADES.HARD] <= previews[FSRS_GRADES.GOOD]);
  assert.ok(previews[FSRS_GRADES.GOOD] <= previews[FSRS_GRADES.EASY]);
  assert.equal(previews[FSRS_GRADES.AGAIN], 1, 'Again interval is 1 day');
});

test('ErrorBankService FSRS database schema migration and column validation', async () => {
  const f = fixture();
  try {
    const bank = new ErrorBankService(f.db);
    await bank.ensure();

    const cols = await f.db.read('PRAGMA table_info(account_error_items)');
    const colNames = new Set(cols.map(c => c.name));

    const requiredFsrsColumns = [
      'stability',
      'difficulty',
      'retrievability',
      'last_reviewed_at',
      'reps',
      'lapses',
      'latency_ms'
    ];

    for (const col of requiredFsrsColumns) {
      assert.ok(colNames.has(col), `Column ${col} must exist in account_error_items`);
    }
  } finally {
    f.sqlite.close();
  }
});

test('ErrorBankService submitReview with explicit FSRS grades', async () => {
  const f = fixture();
  try {
    const bank = new ErrorBankService(f.db);
    await bank.ensure();

    const now = Math.floor(Date.now() / 1000);
    f.sqlite.exec(`INSERT INTO account_error_items(id,account_id,material_id,kind,part_id,question_index,prompt,expected_answer,stage,interval_days,next_review_at,status,stability,difficulty,reps,lapses,last_reviewed_at)
      VALUES(10,'${student.id}',200,'test-part','p1',0,'Question text','correct answer',1,1,${now - 10},'active',0.0,0.0,0,0,0)`);

    // 1. Submit rating "Good" (3) with latency 2450ms
    const res1 = await bank.submitReview(student, {
      itemId: 10,
      grade: FSRS_GRADES.GOOD,
      latencyMs: 2450
    });

    assert.equal(res1.correct, true);
    assert.equal(res1.grade, 3);
    assert.ok(res1.stability > 0, 'Stability must be initialized');
    assert.ok(res1.difficulty > 0, 'Difficulty must be initialized');
    assert.equal(res1.reps, 1);
    assert.equal(res1.lapses, 0);

    const [row1] = await f.db.read('SELECT stability,difficulty,reps,lapses,latency_ms FROM account_error_items WHERE id=10');
    assert.equal(row1.reps, 1);
    assert.equal(row1.lapses, 0);
    assert.equal(row1.latency_ms, 2450);

    // 2. Submit rating "Again" (1)
    const res2 = await bank.submitReview(student, {
      itemId: 10,
      grade: FSRS_GRADES.AGAIN,
      latencyMs: 1200
    });

    assert.equal(res2.correct, false);
    assert.equal(res2.grade, 1);
    assert.equal(res2.reps, 2);
    assert.equal(res2.lapses, 1);
    assert.equal(res2.intervalDays, 1);

    const [row2] = await f.db.read('SELECT lapses,latency_ms FROM account_error_items WHERE id=10');
    assert.equal(row2.lapses, 1);
    assert.equal(row2.latency_ms, 1200);
  } finally {
    f.sqlite.close();
  }
});

test('ErrorBankService queue returns retrievability and previewIntervals', async () => {
  const f = fixture();
  try {
    const bank = new ErrorBankService(f.db);
    await bank.ensure();

    const now = Math.floor(Date.now() / 1000);
    // Insert item with 3 days stability, reviewed 3 days ago (retrievability ~ 0.90)
    f.sqlite.exec(`INSERT INTO account_error_items(id,account_id,material_id,kind,part_id,question_index,prompt,expected_answer,stage,interval_days,next_review_at,status,stability,difficulty,reps,lapses,last_reviewed_at)
      VALUES(11,'${student.id}',200,'test-part','p1',0,'Q1','A1',1,1,${now - 100},'active',3.173,5.0,1,0,${now - 3 * 86400})`);

    const queue = await bank.queue(student, {limit: 5, mode: 'fsrs_retrievability'});
    assert.equal(queue.length, 1);
    const item = queue[0];

    assert.ok(item.retrievability >= 0.88 && item.retrievability <= 0.92, `Retrievability was ${item.retrievability}`);
    assert.ok(item.previewIntervals, 'Item must contain previewIntervals object');
    assert.ok(item.previewIntervals[FSRS_GRADES.AGAIN] >= 1);
    assert.ok(item.previewIntervals[FSRS_GRADES.GOOD] >= 1);

    // Stats includes avgStability and avgDifficulty
    const stats = await bank.stats(student);
    assert.ok(stats.avgStability > 0, 'avgStability should be positive');
    assert.ok(stats.avgDifficulty > 0, 'avgDifficulty should be positive');
  } finally {
    f.sqlite.close();
  }
});
