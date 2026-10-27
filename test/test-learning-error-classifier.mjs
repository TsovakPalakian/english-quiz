import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {
  classifyError,
  synthesizeSubgroupDiagnostic,
  ERROR_TAGS,
  ERROR_CATEGORIES
} from '../src/learning-error-classifier.mjs';
import {ErrorBankService} from '../src/learning-error-bank.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  const args = command => command.args.map(a => a.type === 'null' ? null : ['integer', 'float'].includes(a.type) ? Number(a.value) : a.value);
  const db = {
    async read(sql, args = []) { return sqlite.prepare(sql).all(...args); },
    async atomic(commands) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = commands.map(command => {
          const query = sqlite.prepare(command.sql), rows = query.all(...args(command));
          return {
            cols: query.columns().map(c => ({ name: c.name })),
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
  return { sqlite, db };
}

test('Error Classifier detects L1 Russian Transfer: Prepositions, Calques, and Word Order', () => {
  // 1. Preposition transfer: depend from -> depend on
  const prepRes = classifyError({
    prompt: 'Success does not only ___ your luck.',
    expected: 'depend on',
    given: 'depend from'
  });
  assert.equal(prepRes.tag, ERROR_TAGS.L1_TRANSFER);
  assert.equal(prepRes.category, ERROR_CATEGORIES.L1_PREPOSITION);
  assert.match(prepRes.note, /зависеть от/);

  // 2. Preposition transfer: congratulate with -> congratulate on
  const congRes = classifyError({
    prompt: 'I want to ___ your promotion.',
    expected: 'congratulate on',
    given: 'congratulate with'
  });
  assert.equal(congRes.tag, ERROR_TAGS.L1_TRANSFER);
  assert.equal(congRes.category, ERROR_CATEGORIES.L1_PREPOSITION);

  // 3. Calque: make a photo -> take a photo
  const photoRes = classifyError({
    prompt: 'Could you ___ of us?',
    expected: 'take a photo',
    given: 'make a photo'
  });
  assert.equal(photoRes.tag, ERROR_TAGS.L1_TRANSFER);
  assert.equal(photoRes.category, ERROR_CATEGORIES.L1_CALQUE);
  assert.match(photoRes.note, /сделать фото/);

  // 4. Calque: feel myself good -> feel good
  const feelRes = classifyError({
    prompt: 'I ___ today.',
    expected: 'feel great',
    given: 'feel myself'
  });
  assert.equal(feelRes.tag, ERROR_TAGS.L1_TRANSFER);
  assert.equal(feelRes.category, ERROR_CATEGORIES.L1_CALQUE);

  // 5. Question Word Order: Where you went? -> Where did you go?
  const orderRes = classifyError({
    prompt: 'Ask where they traveled.',
    expected: 'Where did you go?',
    given: 'Where you went?'
  });
  assert.equal(orderRes.tag, ERROR_TAGS.L1_TRANSFER);
  assert.equal(orderRes.category, ERROR_CATEGORIES.L1_WORD_ORDER);
});

test('Error Classifier detects Morphological Overgeneralization: Irregular Verbs, Plurals, Subject-Verb Agreement', () => {
  // 1. Regularization of irregular verb past tense: goed -> went
  const verbRes1 = classifyError({
    prompt: 'She ___ to school yesterday.',
    expected: 'went',
    given: 'goed'
  });
  assert.equal(verbRes1.tag, ERROR_TAGS.OVERGENERALIZATION);
  assert.equal(verbRes1.category, ERROR_CATEGORIES.MORPH_IRREGULAR_VERB);
  assert.equal(verbRes1.expected, 'went');

  // 2. Regularization of bringed -> brought
  const verbRes2 = classifyError({
    prompt: 'He ___ an umbrella.',
    expected: 'brought',
    given: 'bringed'
  });
  assert.equal(verbRes2.tag, ERROR_TAGS.OVERGENERALIZATION);
  assert.equal(verbRes2.category, ERROR_CATEGORIES.MORPH_IRREGULAR_VERB);

  // 3. Irregular plural: childs -> children
  const pluralRes = classifyError({
    prompt: 'All the ___ were playing in the garden.',
    expected: 'children',
    given: 'childs'
  });
  assert.equal(pluralRes.tag, ERROR_TAGS.OVERGENERALIZATION);
  assert.equal(pluralRes.category, ERROR_CATEGORIES.MORPH_IRREGULAR_PLURAL);
  assert.equal(pluralRes.expected, 'children');

  // 4. Subject-verb agreement: she have -> she has
  const agreeRes = classifyError({
    prompt: 'She ___ two brothers.',
    expected: 'has',
    given: 'she have'
  });
  assert.equal(agreeRes.tag, ERROR_TAGS.OVERGENERALIZATION);
  assert.equal(agreeRes.category, ERROR_CATEGORIES.MORPH_SUBJECT_VERB);
});

test('Error Classifier detects Collocation Clashes (do vs make, confused pairs) and Typos', () => {
  // 1. do vs make: do a mistake -> make a mistake
  const doMakeRes1 = classifyError({
    prompt: 'Be careful not to ___.',
    expected: 'make a mistake',
    given: 'do a mistake'
  });
  assert.equal(doMakeRes1.tag, ERROR_TAGS.COLLOCATION_CLASH);
  assert.equal(doMakeRes1.category, ERROR_CATEGORIES.COLLOCATION_DO_MAKE);

  // 2. do vs make: make homework -> do homework
  const doMakeRes2 = classifyError({
    prompt: 'Did you finish your work?',
    expected: 'do homework',
    given: 'make homework'
  });
  assert.equal(doMakeRes2.tag, ERROR_TAGS.COLLOCATION_CLASH);
  assert.equal(doMakeRes2.category, ERROR_CATEGORIES.COLLOCATION_DO_MAKE);

  // 3. Confused pair: borrow vs lend
  const pairRes = classifyError({
    prompt: 'Could you ___ me some money?',
    expected: 'lend',
    given: 'borrow'
  });
  assert.equal(pairRes.tag, ERROR_TAGS.COLLOCATION_CLASH);
  assert.equal(pairRes.category, ERROR_CATEGORIES.COLLOCATION_CONFUSED_PAIR);

  // 4. Spelling Typo: childern -> children (distance 2, transposition)
  const typoRes = classifyError({
    prompt: 'The young people.',
    expected: 'children',
    given: 'childern'
  });
  assert.equal(typoRes.tag, ERROR_TAGS.TYPO);
  assert.equal(typoRes.category, ERROR_CATEGORIES.SPELLING_TYPO);

  // 5. Exact match returns null
  assert.equal(classifyError({ expected: 'accurate', given: 'accurate' }), null);

  // 6. Blank answer
  const blankRes = classifyError({ expected: 'required', given: '' });
  assert.equal(blankRes.tag, ERROR_TAGS.OMISSION);
  assert.equal(blankRes.category, ERROR_CATEGORIES.BLANK_ANSWER);
});

test('synthesizeSubgroupDiagnostic computes accurate distribution and actionable pedagogical advice', () => {
  const mockErrors = [
    { errorTag: 'l1_transfer', errorCategory: 'l1_preposition', prompt: 'depend on', expectedAnswer: 'depend on' },
    { errorTag: 'l1_transfer', errorCategory: 'l1_preposition', prompt: 'congratulate on', expectedAnswer: 'congratulate on' },
    { errorTag: 'l1_transfer', errorCategory: 'l1_calque', prompt: 'take a photo', expectedAnswer: 'take a photo' },
    { errorTag: 'overgeneralization', errorCategory: 'morph_irregular_verb', prompt: 'went', expectedAnswer: 'went' },
    { errorTag: 'collocation_clash', errorCategory: 'collocation_do_make', prompt: 'make a decision', expectedAnswer: 'make a decision' }
  ];

  const diag = synthesizeSubgroupDiagnostic(mockErrors, { groupId: 101 });
  assert.equal(diag.totalErrors, 5);
  assert.equal(diag.breakdown.l1_transfer, 3);
  assert.equal(diag.breakdown.overgeneralization, 1);
  assert.equal(diag.breakdown.collocation_clash, 1);
  assert.equal(diag.percentages.l1_transfer, 60);
  assert.equal(diag.dominantCategory, 'l1_transfer');
  assert.match(diag.recommendation, /60% of recent errors in Group 101 stem from L1 Transfer/);
  assert.match(diag.recommendation, /10-minute focused contrastive analysis/);
});

test('ErrorBankService.subgroupDiagnostic enforces authorization and IDOR isolation', async () => {
  const f = fixture();
  try {
    const bank = new ErrorBankService(f.db);
    await bank.ensure();

    // Setup class group 101 and 102
    f.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS class_groups (id INTEGER PRIMARY KEY, title TEXT, lesson_date TEXT DEFAULT '', hidden_from_students INTEGER DEFAULT 0, position INTEGER DEFAULT 0, revision INTEGER DEFAULT 1, deleted_at INTEGER, created_at INTEGER DEFAULT(unixepoch()), updated_at INTEGER DEFAULT(unixepoch()));
      CREATE TABLE IF NOT EXISTS class_group_students (account_id TEXT PRIMARY KEY, group_id INTEGER NOT NULL, assigned_by TEXT NOT NULL, updated_at INTEGER DEFAULT(unixepoch()));
      CREATE TABLE IF NOT EXISTS catalog_documents (namespace TEXT, key TEXT, value_json TEXT, PRIMARY KEY(namespace, key));

      INSERT INTO class_groups(id, title) VALUES(101, 'A1 Alpha Morning'), (102, 'B1 Evening');
      INSERT INTO class_group_students(account_id, group_id, assigned_by) VALUES('stu_1', 101, 'teacher_101'), ('stu_2', 101, 'teacher_101'), ('stu_3', 102, 'teacher_102');

      -- Teacher assignments
      INSERT INTO catalog_documents(namespace, key, value_json) VALUES
        ('accounts-group-teachers', '101', '{"teacherIds":["teacher_101"]}'),
        ('accounts-group-teachers', '102', '{"teacherIds":["teacher_102"]}');
    `);

    // Record errors for student 1 (in group 101)
    const questions = [
      { part: { id: 'q1', type: 'gap' }, index: 0, max: 2, item: { prompt: 'It will ___ the weather.' } },
      { part: { id: 'q2', type: 'gap' }, index: 0, max: 2, item: { prompt: 'Yesterday he ___ home.' } }
    ];
    await bank.recordErrors('stu_1', 'exam-block', 201, questions, {
      'q1': { 0: 'depend from' },
      'q2': { 0: 'goed' }
    }, {
      'q1': { 0: 0 },
      'q2': { 0: 0 }
    });

    const teacher101 = { id: 'teacher_101', role: 'ADMIN' };
    const teacher102 = { id: 'teacher_102', role: 'ADMIN' };
    const student = { id: 'stu_1', role: 'USER' };
    const developer = { id: 'dev_1', role: 'DEVELOPER' };

    // 1. Student accessing diagnostic -> 403 Forbidden
    await assert.rejects(
      () => bank.subgroupDiagnostic(student, { groupId: 101 }),
      /Teacher review only/
    );

    // 2. Teacher 102 accessing Group 101 (IDOR) -> 403 Forbidden
    await assert.rejects(
      () => bank.subgroupDiagnostic(teacher102, { groupId: 101 }),
      /Forbidden: Not assigned to this group/
    );

    // 3. Teacher 101 accessing Group 101 -> Success
    const report = await bank.subgroupDiagnostic(teacher101, { groupId: 101 });
    assert.equal(report.groupId, 101);
    assert.equal(report.totalErrors, 2);
    assert.equal(report.breakdown.l1_transfer, 1);
    assert.equal(report.breakdown.overgeneralization, 1);

    // 4. Developer Alpha accessing Group 101 -> Full access
    const devReport = await bank.subgroupDiagnostic(developer, { groupId: 101 });
    assert.equal(devReport.groupId, 101);
    assert.equal(devReport.totalErrors, 2);
  } finally {
    f.sqlite.close();
  }
});
