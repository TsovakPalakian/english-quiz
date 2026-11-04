import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSpeechTaskCriteria, validateSpeechDialogue} from '../src/speech-task-criteria.mjs';
import {speechProgressPeriods} from '../src/speech-progress-periods.mjs';
import {lessonSpeechContext, checkSpeechContext, speechContextGuard} from '../src/speech-lesson-context.mjs';
import {StudyError} from '../src/learning-study.mjs';

// --- speech-task-criteria ---

test('validateSpeechTaskCriteria handles null/undefined values by mode', () => {
  // Retelling requires criteria
  assert.throws(
    () => validateSpeechTaskCriteria(null, 'retelling'),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Retelling requires a source and key ideas.'
  );
  assert.throws(
    () => validateSpeechTaskCriteria(undefined, 'retelling'),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Retelling requires a source and key ideas.'
  );

  // Free and dialogue modes allow null criteria
  assert.equal(validateSpeechTaskCriteria(null, 'free'), null);
  assert.equal(validateSpeechTaskCriteria(null, 'dialogue'), null);
});

test('validateSpeechTaskCriteria rejects invalid fields, modes or oversized content', () => {
  // Disallowed mode
  assert.throws(
    () =>
      validateSpeechTaskCriteria(
        {sourceText: null, keyIdeas: ['Idea 1'], targetVocabulary: ['word']},
        'unsupported-mode'
      ),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Only open speech tasks use meaning criteria.'
  );

  // Extra unexpected field
  assert.throws(
    () =>
      validateSpeechTaskCriteria(
        {sourceText: null, keyIdeas: [], targetVocabulary: [], rogueField: 123},
        'free'
      ),
    (err) => err instanceof StudyError && err.status === 400
  );

  // Retelling mode without sourceText or with empty keyIdeas
  assert.throws(
    () => validateSpeechTaskCriteria({sourceText: null, keyIdeas: ['Idea'], targetVocabulary: []}, 'retelling'),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Retelling requires a source and key ideas.'
  );
  assert.throws(
    () => validateSpeechTaskCriteria({sourceText: 'Some story', keyIdeas: [], targetVocabulary: []}, 'retelling'),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Retelling requires a source and key ideas.'
  );

  // Oversized lists (> 10 key ideas, > 20 vocabulary)
  const elevenIdeas = Array.from({length: 11}, (_, i) => `Idea ${i}`);
  assert.throws(
    () => validateSpeechTaskCriteria({sourceText: null, keyIdeas: elevenIdeas, targetVocabulary: []}, 'free'),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid speech criteria.'
  );

  const twentyOneWords = Array.from({length: 21}, (_, i) => `Word ${i}`);
  assert.throws(
    () => validateSpeechTaskCriteria({sourceText: null, keyIdeas: [], targetVocabulary: twentyOneWords}, 'free'),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid speech criteria.'
  );
});

test('validateSpeechTaskCriteria rejects duplicate criteria via NFKC case-insensitive normalization', () => {
  assert.throws(
    () =>
      validateSpeechTaskCriteria(
        {sourceText: null, keyIdeas: ['Main Idea', '  main idea  '], targetVocabulary: []},
        'free'
      ),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Speech criteria must be distinct.'
  );

  assert.throws(
    () =>
      validateSpeechTaskCriteria(
        {sourceText: null, keyIdeas: [], targetVocabulary: ['Vocabulary', 'vocabulary']},
        'free'
      ),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Speech criteria must be distinct.'
  );
});

test('validateSpeechTaskCriteria validates and formats valid criteria', () => {
  const result = validateSpeechTaskCriteria(
    {
      sourceText: '  This is an article about climate change.  ',
      keyIdeas: ['  Temperature rise  ', 'Carbon emissions'],
      targetVocabulary: ['mitigation', 'sustainable']
    },
    'retelling'
  );

  assert.deepEqual(result, {
    version: 'speech-task-criteria-v1',
    sourceText: 'This is an article about climate change.',
    keyIdeas: ['Temperature rise', 'Carbon emissions'],
    targetVocabulary: ['mitigation', 'sustainable']
  });
});

test('validateSpeechDialogue validates dialogue role, scenario, turns and limits', () => {
  // Undefined returns null
  assert.equal(validateSpeechDialogue(undefined), null);

  // Turn boundaries (2 to 12 safe integer)
  for (const badTurns of [1, 0, -1, 13, 100, 2.5, '4', null, undefined]) {
    assert.throws(
      () =>
        validateSpeechDialogue({
          role: 'Barista',
          scenario: 'Order a coffee in London',
          goals: ['Order a latte'],
          constraints: ['Be polite'],
          maxTurns: badTurns
        }),
      (err) => err instanceof StudyError && err.status === 400 && err.message === 'Use 2 to 12 dialogue turns.'
    );
  }

  // Oversized goals (> 10 items)
  const elevenGoals = Array.from({length: 11}, (_, i) => `Goal ${i}`);
  assert.throws(
    () =>
      validateSpeechDialogue({
        role: 'Barista',
        scenario: 'Scenario',
        goals: elevenGoals,
        constraints: [],
        maxTurns: 5
      }),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid dialogue goals.'
  );

  // Valid dialogue payload
  const valid = validateSpeechDialogue({
    role: '  Hotel Receptionist  ',
    scenario: '  Check into a hotel room in Edinburgh.  ',
    goals: ['Ask for room key', 'Request breakfast info'],
    constraints: ['Mention confirmation number'],
    maxTurns: 6
  });

  assert.deepEqual(valid, {
    role: 'Hotel Receptionist',
    scenario: 'Check into a hotel room in Edinburgh.',
    goals: ['Ask for room key', 'Request breakfast info'],
    constraints: ['Mention confirmation number'],
    maxTurns: 6
  });
});

// --- speech-progress-periods ---

test('speechProgressPeriods rejects unsupported aggregation period', () => {
  assert.throws(
    () => speechProgressPeriods([], {period: 'year'}),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Use day, week or month.'
  );
});

test('speechProgressPeriods aggregates series into daily, weekly and monthly UTC buckets with metrics', () => {
  const series = [
    {
      key: 'pronunciation-task-1',
      synthetic: false,
      provisional: false,
      editedTranscript: true,
      points: [
        // 2026-11-02 (Monday)
        {date: '2026-11-02T10:00:00Z', overall: 80, accuracy: 75, fluency: 85, prosody: 80},
        {date: '2026-11-02T14:00:00Z', overall: 90, accuracy: 85, fluency: 95, prosody: 90},
        // 2026-11-04 (Wednesday, same ISO week as Monday Nov 2)
        {date: '2026-11-04T12:00:00Z', overall: 85, accuracy: 80, fluency: 90, prosody: 85},
        // 2026-11-10 (Next week)
        {date: '2026-11-10T09:00:00Z', overall: 95, accuracy: 90, fluency: 100, prosody: 95}
      ]
    }
  ];

  // 1. Weekly aggregation
  const weekly = speechProgressPeriods(series, {period: 'week'});
  assert.equal(weekly.length, 1);
  assert.equal(weekly[0].period, 'week');
  assert.equal(weekly[0].editedTranscript, true);
  assert.equal(weekly[0].buckets.length, 2);

  // Week 1 bucket (starting Monday 2026-11-02)
  const week1 = weekly[0].buckets[0];
  assert.equal(week1.date, '2026-11-02');
  assert.equal(week1.attempts, 3);
  assert.deepEqual(week1.metrics.overall, {
    count: 3,
    average: 85, // (80 + 90 + 85) / 3 = 85.0
    best: 90,
    first: 80,
    last: 85
  });
  assert.equal(week1.metrics.grammar, null); // no grammar points recorded

  // Week 2 bucket (starting Monday 2026-11-09)
  const week2 = weekly[0].buckets[1];
  assert.equal(week2.date, '2026-11-09');
  assert.equal(week2.attempts, 1);
  assert.deepEqual(week2.metrics.overall, {
    count: 1,
    average: 95,
    best: 95,
    first: 95,
    last: 95
  });

  // 2. Daily aggregation
  const daily = speechProgressPeriods(series, {period: 'day'});
  assert.equal(daily[0].buckets.length, 3);
  assert.equal(daily[0].buckets[0].date, '2026-11-02');
  assert.equal(daily[0].buckets[0].attempts, 2);
  assert.equal(daily[0].buckets[1].date, '2026-11-04');
  assert.equal(daily[0].buckets[1].attempts, 1);

  // 3. Monthly aggregation
  const monthly = speechProgressPeriods(series, {period: 'month'});
  assert.equal(monthly[0].buckets.length, 1);
  assert.equal(monthly[0].buckets[0].date, '2026-11-01');
  assert.equal(monthly[0].buckets[0].attempts, 4);
});

// --- speech-lesson-context ---

test('lessonSpeechContext identifies standalone lesson vs word/sense binding', () => {
  assert.equal(lessonSpeechContext({}), true);
  assert.equal(lessonSpeechContext({groupId: 1, lessonId: 2}), true);
  assert.equal(lessonSpeechContext({cardId: null, senseId: null}), true);
  assert.equal(lessonSpeechContext({cardId: 10, senseId: null}), false);
  assert.equal(lessonSpeechContext({cardId: null, senseId: 20}), false);
  assert.equal(lessonSpeechContext({cardId: 10, senseId: 20}), false);
});

test('checkSpeechContext guards pronunciation practice and lesson permissions', async () => {
  const actor = {id: 'user-1', role: 'USER'};

  // 1. quizSessionId lookup failure throws 403
  const reviewMockFail = {
    db: {
      async read() {
        return [];
      }
    }
  };
  await assert.rejects(
    checkSpeechContext(reviewMockFail, actor, {
      quizSessionId: 'sess-1',
      speechTaskId: 'task-1',
      senseId: 2
    }),
    (err) => err instanceof StudyError && err.status === 403 && err.message === 'Private pronunciation practice is unavailable.'
  );

  // 2. quizSessionId lookup success returns row
  const reviewMockPass = {
    db: {
      async read() {
        return [{id: 42}];
      }
    }
  };
  const row = await checkSpeechContext(reviewMockPass, actor, {
    quizSessionId: 'sess-1',
    speechTaskId: 'task-1',
    senseId: 2
  });
  assert.deepEqual(row, {id: 42});

  // 3. Delegation when card binding is present
  let delegated = false;
  const reviewDelegating = {
    checkContext(act, val) {
      delegated = true;
      return {delegated: true, act, val};
    }
  };
  const result = await checkSpeechContext(reviewDelegating, actor, {
    groupId: 1,
    lessonId: 2,
    cardId: 10,
    senseId: 20
  });
  assert.equal(delegated, true);
  assert.equal(result.delegated, true);

  // 4. Standalone lesson context access failure throws 403
  await assert.rejects(
    checkSpeechContext(reviewMockFail, actor, {groupId: 1, lessonId: 2}),
    (err) => err instanceof StudyError && err.status === 403 && err.message === 'This lesson is not available for this account.'
  );
});

test('speechContextGuard builds atomic mutation guard statements', () => {
  const actor = {id: 'user-1', role: 'USER'};

  // Quiz session template guard
  const guard1 = speechContextGuard(null, actor, {
    quizSessionId: 'sess-1',
    speechTaskId: 'task-1',
    senseId: 2
  });
  assert.ok(guard1.sql.includes('INSERT INTO mutation_guard SELECT EXISTS('));

  // Standalone lesson guard
  const guard2 = speechContextGuard(null, actor, {groupId: 10, lessonId: 20});
  assert.ok(guard2.sql.includes('INSERT INTO mutation_guard SELECT EXISTS('));

  // Delegated word binding guard
  const reviewMock = {
    accessGuard(act, val) {
      return {sql: 'DELEGATED_GUARD', args: [val.cardId]};
    }
  };
  const guard3 = speechContextGuard(reviewMock, actor, {groupId: 10, lessonId: 20, cardId: 99});
  assert.equal(guard3.sql, 'DELEGATED_GUARD');
});
