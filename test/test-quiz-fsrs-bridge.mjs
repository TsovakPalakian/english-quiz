import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {
  deriveFsrsGrade,
  buildFsrsReviewPayload,
  FSRS_QUIZ_GRADES
} from '../client/main/quiz-fsrs-bridge.js';
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

const student = {id: 's_bridge_1', name: 'Bridge Student', role: 'USER'};

test('quiz-fsrs-bridge: deriveFsrsGrade correctly maps quiz telemetry to 4 FSRS grades', () => {
  // 1. Failure always produces Grade 1 (Again)
  assert.equal(deriveFsrsGrade(false, {latencyMs: 1500}), FSRS_QUIZ_GRADES.AGAIN);
  assert.equal(deriveFsrsGrade(false, {latencyMs: 15000}), FSRS_QUIZ_GRADES.AGAIN);

  // 2. Hesitation (> 10s) or hint usage produces Grade 2 (Hard)
  assert.equal(deriveFsrsGrade(true, {latencyMs: 11000}), FSRS_QUIZ_GRADES.HARD);
  assert.equal(deriveFsrsGrade(true, {latencyMs: 2000, hintUsed: true}), FSRS_QUIZ_GRADES.HARD);

  // 3. Normal recall (3s - 10s) produces Grade 3 (Good)
  assert.equal(deriveFsrsGrade(true, {latencyMs: 4500}), FSRS_QUIZ_GRADES.GOOD);
  assert.equal(deriveFsrsGrade(true, {latencyMs: 8000}), FSRS_QUIZ_GRADES.GOOD);

  // 4. Fast recall (< 3s) produces Grade 4 (Easy)
  assert.equal(deriveFsrsGrade(true, {latencyMs: 1800}), FSRS_QUIZ_GRADES.EASY);
  assert.equal(deriveFsrsGrade(true, {latencyMs: 2900}), FSRS_QUIZ_GRADES.EASY);
});

test('quiz-fsrs-bridge: buildFsrsReviewPayload formats API body accurately', () => {
  const item = {
    card: {en: 'thunderstorm', ru: 'гроза'},
    type: 'Choice',
    latencyMs: 2400,
    prompt: 'Choose Russian translation',
    given: 'гроза'
  };

  const payload = buildFsrsReviewPayload(item, true);
  assert.equal(payload.word, 'thunderstorm');
  assert.equal(payload.grade, FSRS_QUIZ_GRADES.EASY);
  assert.equal(payload.latencyMs, 2400);
  assert.equal(payload.kind, 'quiz-choice');
  assert.equal(payload.expectedAnswer, 'thunderstorm');
});

test('ErrorBankService processes quiz review submission by word identifier', async () => {
  const f = fixture();
  try {
    const bank = new ErrorBankService(f.db);
    await bank.ensure();

    // 1. Student misses word "accommodate" in a Choice quiz -> auto-recorded with Grade 1
    const missRes = await bank.submitReview(student, {
      word: 'accommodate',
      expectedAnswer: 'accommodate',
      answer: 'acomodate',
      grade: FSRS_QUIZ_GRADES.AGAIN,
      latencyMs: 4200,
      kind: 'quiz-choice',
      prompt: 'Select correct spelling'
    });

    assert.equal(missRes.ok, true);
    assert.equal(missRes.created, true);

    const [item] = await f.db.read('SELECT id,expected_answer,reps,lapses,stability FROM account_error_items WHERE account_id=?', [student.id]);
    assert.ok(item, 'Missed quiz word must be recorded into account_error_items');
    assert.equal(item.expected_answer, 'accommodate');
    assert.equal(item.lapses, 1);

    // 2. Later, student answers "accommodate" correctly in a Gap quiz -> updates existing item
    const passRes = await bank.submitReview(student, {
      word: 'accommodate',
      expectedAnswer: 'accommodate',
      answer: 'accommodate',
      grade: FSRS_QUIZ_GRADES.GOOD,
      latencyMs: 3100
    });

    assert.equal(passRes.correct, true);
    assert.equal(passRes.grade, 3);
    assert.ok(passRes.stability > 0);

    const [updated] = await f.db.read('SELECT reps,lapses,stability FROM account_error_items WHERE id=?', [item.id]);
    assert.equal(updated.reps, 2);
    assert.equal(updated.lapses, 1);
  } finally {
    f.sqlite.close();
  }
});
