import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {examLifecycleCommands} from '../src/learning-exam-lifecycle.mjs';
import {MessageService} from '../src/learning-messages.mjs';

function createFixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON;');

  const cleanArg = (a) => {
    if (a && typeof a === 'object' && 'type' in a) {
      if (a.type === 'null') return null;
      if (a.type === 'integer') return BigInt(a.value);
      if (a.type === 'float') return Number(a.value);
      return a.value;
    }
    if (typeof a === 'number' && Number.isInteger(a)) return BigInt(a);
    return a;
  };

  const db = {
    async read(query, args = []) {
      return sql.prepare(query).all(...args.map(cleanArg));
    },
    async atomic(commands) {
      sql.exec('BEGIN');
      try {
        for (const c of commands) {
          const cleanArgs = c.args ? c.args.map(cleanArg) : [];
          sql.prepare(c.sql).run(...cleanArgs);
        }
        sql.exec('COMMIT');
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    }
  };

  return {sql, db};
}

async function setupTables(sql, db) {
  await new MessageService(db, async () => []).ensure();
  sql.exec(`
    CREATE TABLE IF NOT EXISTS assessment_work (
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      material_id INTEGER NOT NULL,
      exam_id INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1,
      state TEXT NOT NULL DEFAULT 'draft',
      answers_json TEXT NOT NULL DEFAULT '{}',
      grading_json TEXT NOT NULL DEFAULT '{}',
      snapshot_json TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (account_id, kind, material_id)
    );
    CREATE TABLE IF NOT EXISTS assessment_history (
      id INTEGER PRIMARY KEY,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      material_id INTEGER NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS catalog_documents (
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      PRIMARY KEY (namespace, key)
    );
    CREATE TEMP TABLE IF NOT EXISTS assessment_guard (
      ok INTEGER NOT NULL CHECK (ok = 1)
    );
  `);
}

test('examLifecycleCommands returns empty array for non-existent instance, missing reviewer or invalid state', async () => {
  const {sql, db} = createFixture();
  try {
    await setupTables(sql, db);

    // 1. Non-existent instance
    const res1 = await examLifecycleCommands(db, 999, 'student-1', {id: 'teacher-1', role: 'ADMIN'}, 10, 'submitted', {});
    assert.deepEqual(res1, []);

    // Seed exam with instance lacking reviewer_id
    sql.exec(`
      INSERT INTO exams(id, title, lesson_date, revision) VALUES(1, 'Test Exam', '2026-11-04', 1);
      INSERT INTO exam_instances(exam_id, account_id, student_name, group_title, reviewer_id, status, assignment_id, source_exam_id)
      VALUES(1, 'student-1', 'Alex', 'B2 Group', '', 'draft', 'ass-1', 1);
    `);

    // 2. Missing reviewer_id
    const res2 = await examLifecycleCommands(db, 1, 'student-1', {id: 'teacher-1', role: 'ADMIN'}, 10, 'submitted', {});
    assert.deepEqual(res2, []);

    // Update with reviewer_id
    sql.exec("UPDATE exam_instances SET reviewer_id='teacher-1' WHERE exam_id=1");

    // 3. Disallowed target state outside ['submitted', 'reviewing', 'published']
    for (const badState of ['draft', 'archived', 'pending', '', null, undefined]) {
      const res = await examLifecycleCommands(db, 1, 'student-1', {id: 'teacher-1', role: 'ADMIN'}, 10, badState, {});
      assert.deepEqual(res, []);
    }
  } finally {
    sql.close();
  }
});

test('examLifecycleCommands generates submission workflow statements and transitions instance to ready', async () => {
  const {sql, db} = createFixture();
  try {
    await setupTables(sql, db);

    sql.exec(`
      INSERT INTO exams(id, title, lesson_date, revision) VALUES(1, 'B2+ Midterm', '2026-11-04', 5);
      INSERT INTO chat_assignments(id, exam_id, target_kind, target_id, active) VALUES('ass-100', 1, 'student', 'student-1', 1);
      INSERT INTO exam_instances(exam_id, account_id, student_name, group_title, reviewer_id, status, assignment_id, source_exam_id)
      VALUES(1, 'student-1', 'Alex Smith', 'B2+ Kate Group', 'teacher-1', 'draft', 'ass-100', 1);
      INSERT INTO exam_blocks(id, exam_id, position, published, deleted_at) VALUES(10, 1, 1, 1, NULL);
      INSERT INTO exam_materials(id, exam_id, block_id, type, position, content_json, deleted_at)
      VALUES(101, 1, 10, 'task', 1, '{"type":"task","gradeMode":"assignment","maxPoints":20}', NULL);
      INSERT INTO assessment_work(account_id, kind, material_id, exam_id, state, snapshot_json)
      VALUES('student-1', 'exam-block', 10, 1, 'submitted', NULL);
    `);

    const commands = await examLifecycleCommands(
      db,
      1,
      'student-1',
      {id: 'teacher-1', name: 'Kate Teacher', role: 'ADMIN'},
      10,
      'submitted',
      {points: {'101': {0: 16}}}
    );

    assert.ok(commands.length > 0);

    // Execute generated SQL statements atomically
    await db.atomic(commands);

    // Verify instance state updated to 'ready' and max_points populated
    const instance = sql.prepare('SELECT status, max_points, earned_points FROM exam_instances WHERE exam_id=?').get(1);
    assert.equal(instance.status, 'ready');
    assert.equal(instance.max_points, 20);

    // Verify submission audit history recorded
    const history = sql.prepare('SELECT account_id, kind, material_id, actor_id, action FROM assessment_history').all();
    assert.equal(history.length, 1);
    assert.equal(history[0].action, 'submitted');
    assert.equal(history[0].account_id, 'student-1');

    // Verify chat message notification sent to reviewer
    const messages = sql.prepare('SELECT room_id, sender_name, body FROM chat_messages').all();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender_name, 'Alex Smith');
    assert.ok(messages[0].body.includes('Ready for review'));
    assert.ok(messages[0].body.includes('Student: Alex Smith'));
    assert.ok(messages[0].body.includes('Exam: B2+ Midterm'));
    assert.ok(messages[0].body.includes('Maximum: 20'));

    // Verify exam revision incremented
    const exam = sql.prepare('SELECT revision FROM exams WHERE id=?').get(1);
    assert.equal(exam.revision, 6);
  } finally {
    sql.close();
  }
});

test('examLifecycleCommands distributes notifications to all group teachers with distinct event keys', async () => {
  const {sql, db} = createFixture();
  try {
    await setupTables(sql, db);

    // Set up group with multiple assigned teachers in catalog_documents
    sql.exec(`
      INSERT INTO catalog_documents(namespace, key, value_json)
      VALUES('accounts-group-teachers', '50', '{"teacherIds":["teacher-alpha","teacher-beta"]}');
      INSERT INTO exams(id, title, lesson_date, revision) VALUES(2, 'Group Exam', '2026-11-04', 1);
      INSERT INTO chat_assignments(id, exam_id, target_kind, target_id, active) VALUES('ass-200', 2, 'student', 'student-2', 1);
      INSERT INTO exam_instances(exam_id, account_id, student_name, group_title, group_id, reviewer_id, status, assignment_id, source_exam_id)
      VALUES(2, 'student-2', 'Elena Rostova', 'B1 Evening', 50, 'teacher-alpha', 'draft', 'ass-200', 2);
      INSERT INTO exam_blocks(id, exam_id, position, published, deleted_at) VALUES(20, 2, 1, 1, NULL);
      INSERT INTO exam_materials(id, exam_id, block_id, type, position, content_json, deleted_at)
      VALUES(201, 2, 20, 'task', 1, '{"type":"task","gradeMode":"assignment","maxPoints":15}', NULL);
      INSERT INTO assessment_work(account_id, kind, material_id, exam_id, state, snapshot_json)
      VALUES('student-2', 'exam-block', 20, 2, 'submitted', NULL);
    `);

    const commands = await examLifecycleCommands(
      db,
      2,
      'student-2',
      {id: 'teacher-alpha', name: 'Alpha', role: 'ADMIN'},
      20,
      'submitted',
      {points: {'201': {0: 12}}}
    );

    await db.atomic(commands);

    // Two direct message notifications must be generated (one per reviewer)
    const messages = sql.prepare('SELECT room_id, client_key FROM chat_messages ORDER BY client_key').all();
    assert.equal(messages.length, 2);
    assert.equal(messages[0].client_key, 'exam:2:submitted:teacher-alpha');
    assert.equal(messages[1].client_key, 'exam:2:submitted:teacher-beta');
  } finally {
    sql.close();
  }
});

test('examLifecycleCommands creates CAS revision guards for other published exam blocks', async () => {
  const {sql, db} = createFixture();
  try {
    await setupTables(sql, db);

    sql.exec(`
      INSERT INTO exams(id, title, lesson_date, revision) VALUES(3, 'Multi-Block Exam', '2026-11-04', 1);
      INSERT INTO chat_assignments(id, exam_id, target_kind, target_id, active) VALUES('ass-300', 3, 'student', 'student-3', 1);
      INSERT INTO exam_instances(exam_id, account_id, student_name, group_title, reviewer_id, status, assignment_id, source_exam_id)
      VALUES(3, 'student-3', 'Ivan', 'A2 Group', 'teacher-1', 'draft', 'ass-300', 3);
      INSERT INTO exam_blocks(id, exam_id, position, published, deleted_at) VALUES(30, 3, 1, 1, NULL);
      INSERT INTO exam_blocks(id, exam_id, position, published, deleted_at) VALUES(31, 3, 2, 1, NULL);
      INSERT INTO exam_materials(id, exam_id, block_id, type, position, content_json, deleted_at)
      VALUES(301, 3, 30, 'task', 1, '{"type":"task","gradeMode":"assignment","maxPoints":5}', NULL);
      INSERT INTO exam_materials(id, exam_id, block_id, type, position, content_json, deleted_at)
      VALUES(302, 3, 31, 'task', 1, '{"type":"task","gradeMode":"assignment","maxPoints":5}', NULL);
      INSERT INTO assessment_work(account_id, kind, material_id, exam_id, revision, state, snapshot_json)
      VALUES('student-3', 'exam-block', 30, 3, 2, 'submitted', NULL);
      INSERT INTO assessment_work(account_id, kind, material_id, exam_id, revision, state, snapshot_json)
      VALUES('student-3', 'exam-block', 31, 3, 4, 'submitted', NULL);
    `);

    // Submitting block 30 must place a revision guard on block 31
    const commands = await examLifecycleCommands(
      db,
      3,
      'student-3',
      {id: 'teacher-1', name: 'Kate', role: 'ADMIN'},
      30,
      'submitted',
      {points: {'301': {0: 5}}}
    );

    const guardCommands = commands.filter((c) => c.sql.includes('INSERT INTO assessment_guard'));
    assert.equal(guardCommands.length, 1);
    assert.equal(guardCommands[0].args[2].value, '4'); // revision of block 31

    await db.atomic(commands);
  } finally {
    sql.close();
  }
});

test('examLifecycleCommands publishes results, notifies student and deactivates completed assignment', async () => {
  const {sql, db} = createFixture();
  try {
    await setupTables(sql, db);

    sql.exec(`
      INSERT INTO class_groups(id, title, revision) VALUES(10, 'B2+ Group', 1);
      INSERT INTO exams(id, title, lesson_date, revision) VALUES(4, 'Published Exam', '2026-11-04', 1);
      INSERT INTO class_group_exams(group_id, exam_id) VALUES(10, 4);
      INSERT INTO chat_assignments(id, exam_id, target_kind, target_id, active) VALUES('ass-400', 4, 'student', 'student-4', 1);
      INSERT INTO exam_instances(exam_id, account_id, student_name, group_title, reviewer_id, status, assignment_id, source_exam_id)
      VALUES(4, 'student-4', 'Maria Curie', 'B2+ Group', 'teacher-1', 'ready', 'ass-400', 4);
      INSERT INTO exam_blocks(id, exam_id, position, published, deleted_at) VALUES(40, 4, 1, 1, NULL);
      INSERT INTO exam_materials(id, exam_id, block_id, type, position, content_json, deleted_at)
      VALUES(401, 4, 40, 'task', 1, '{"type":"task","gradeMode":"assignment","maxPoints":10}', NULL);
      INSERT INTO assessment_work(account_id, kind, material_id, exam_id, state, snapshot_json)
      VALUES('student-4', 'exam-block', 40, 4, 'published', NULL);
    `);

    // Publisher actor is DEVELOPER role (sender name formats as 'Support')
    const commands = await examLifecycleCommands(
      db,
      4,
      'student-4',
      {id: 'dev-1', role: 'DEVELOPER'},
      40,
      'published',
      {points: {'401': {0: 9.5}}}
    );

    await db.atomic(commands);

    // Verify exam instance is completed with earned points and completed_at
    const instance = sql.prepare('SELECT status, max_points, earned_points, completed_at FROM exam_instances WHERE exam_id=?').get(4);
    assert.equal(instance.status, 'completed');
    assert.equal(instance.max_points, 10);
    assert.equal(instance.earned_points, 9.5);
    assert.ok(instance.completed_at > 0);

    // Verify results_published history entry
    const history = sql.prepare('SELECT action FROM assessment_history ORDER BY id').all().map((r) => r.action);
    assert.deepEqual(history, ['submitted', 'results_published']);

    // Verify notification sent to student with Support sender name
    const studentMessage = sql.prepare("SELECT sender_name, body FROM chat_messages WHERE client_key='exam:4:completed'").get();
    assert.ok(studentMessage);
    assert.equal(studentMessage.sender_name, 'Support');
    assert.ok(studentMessage.body.includes('Exam reviewed. Results published.'));
    assert.ok(studentMessage.body.includes('Score: 9.5 / 10'));

    // Verify assignment is deactivated
    const assignment = sql.prepare('SELECT active FROM chat_assignments WHERE id=?').get('ass-400');
    assert.equal(assignment.active, 0);

    // Verify group revision incremented
    const group = sql.prepare('SELECT revision FROM class_groups WHERE id=10').get();
    assert.equal(group.revision, 2);
  } finally {
    sql.close();
  }
});

test('examLifecycleCommands preserves frozen question definition when snapshot_json is present', async () => {
  const {sql, db} = createFixture();
  try {
    await setupTables(sql, db);

    const frozenSnapshot = JSON.stringify([
      {id: 501, type: 'task', gradeMode: 'assignment', maxPoints: 50}
    ]);

    sql.exec(`
      INSERT INTO exams(id, title, lesson_date, revision) VALUES(5, 'Frozen Snapshot Exam', '2026-11-04', 1);
      INSERT INTO chat_assignments(id, exam_id, target_kind, target_id, active) VALUES('ass-500', 5, 'student', 'student-5', 1);
      INSERT INTO exam_instances(exam_id, account_id, student_name, group_title, reviewer_id, status, assignment_id, source_exam_id)
      VALUES(5, 'student-5', 'Dmitry', 'C1 Group', 'teacher-1', 'draft', 'ass-500', 5);
      INSERT INTO exam_blocks(id, exam_id, position, published, deleted_at) VALUES(50, 5, 1, 1, NULL);
      -- exam_materials has maxPoints 10, but snapshot has frozen 50
      INSERT INTO exam_materials(id, exam_id, block_id, type, position, content_json, deleted_at)
      VALUES(501, 5, 50, 'task', 1, '{"type":"task","gradeMode":"assignment","maxPoints":10}', NULL);
      INSERT INTO assessment_work(account_id, kind, material_id, exam_id, state, snapshot_json)
      VALUES('student-5', 'exam-block', 50, 5, 'published', '${frozenSnapshot}');
    `);

    const commands = await examLifecycleCommands(
      db,
      5,
      'student-5',
      {id: 'teacher-1', name: 'Kate', role: 'ADMIN'},
      50,
      'published',
      {points: {'501': {0: 45}}}
    );

    await db.atomic(commands);

    const instance = sql.prepare('SELECT max_points, earned_points FROM exam_instances WHERE exam_id=?').get(5);
    assert.equal(instance.max_points, 50); // read from snapshot, not content_json (10)
    assert.equal(instance.earned_points, 45);
  } finally {
    sql.close();
  }
});
