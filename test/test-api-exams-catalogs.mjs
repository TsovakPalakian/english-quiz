import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import stageWorker from '../src/learning-stage-worker.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';
import {STUDY_DATABASE} from '../src/study-database.mjs';
import {AssessmentService} from '../src/learning-assessment.mjs';
import {ExamService} from '../src/learning-exams.mjs';

function createFixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE IF NOT EXISTS catalog_documents(
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      PRIMARY KEY(namespace, key)
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      login TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'USER',
      active INTEGER NOT NULL DEFAULT 1,
      hidden INTEGER NOT NULL DEFAULT 0,
      is_personal_data_revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'shared',
      deleted_at INTEGER,
      en TEXT NOT NULL DEFAULT '',
      ru TEXT NOT NULL DEFAULT '',
      part_of_speech TEXT NOT NULL DEFAULT '',
      extra_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS legacy_ids (
      entity_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      source_namespace TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS class_group_students (
      group_id INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      PRIMARY KEY(account_id)
    );
    CREATE TABLE IF NOT EXISTS account_settings(
      account_id TEXT,
      key TEXT,
      value_json TEXT,
      revision INTEGER,
      PRIMARY KEY(account_id, key)
    );
    CREATE TABLE IF NOT EXISTS bug_reports (
      signature TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INTEGER NOT NULL,
      error TEXT NOT NULL,
      hits INTEGER NOT NULL,
      accounts_json TEXT NOT NULL,
      request_json TEXT NOT NULL,
      response_json TEXT NOT NULL,
      first_at INTEGER NOT NULL,
      last_at INTEGER NOT NULL,
      time_zone TEXT NOT NULL DEFAULT ''
    );
  `);

  const cleanArg = (a) =>
    a && typeof a === 'object' && 'type' in a
      ? a.type === 'null'
        ? null
        : ['integer', 'float'].includes(a.type)
        ? Number(a.value)
        : a.value
      : typeof a === 'number' && Number.isInteger(a)
      ? BigInt(a)
      : a;

  const db = {
    read: async (q, a = []) => sql.prepare(q).all(...a.map(cleanArg)),
    atomic: async (commands) => {
      sql.exec('BEGIN');
      try {
        for (const c of commands) sql.prepare(c.sql).run(...(c.args || []).map(cleanArg));
        sql.exec('COMMIT');
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    }
  };

  const accountDb = {
    prepare(sqlQuery) {
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async first() {
          return sql.prepare(sqlQuery).get(...bound) || null;
        },
        async run() {
          return sql.prepare(sqlQuery).run(...bound);
        },
        async all() {
          return sql.prepare(sqlQuery).all(...bound);
        }
      };
    }
  };

  let currentActor = null;

  const env = {
    STAGE_ENABLED: 'true',
    STAGE_ALLOWED_HOST: 'stage.example',
    STAGE_WRITES: 'true',
    ACCOUNT_MUTATIONS_ENABLED: 'true',
    ACCOUNT_QUERY_LIMIT_ENABLED: 'false',
    [STUDY_DATABASE]: db,
    DB: accountDb
  };

  const app = integratedWorker({
    authenticate: async () => currentActor,
    studyDatabase: () => db
  });

  return {
    sql,
    db,
    env,
    app,
    setActor: (actor) => {
      currentActor = actor;
    },
    close: () => sql.close()
  };
}

test('GET /api/catalogs/cards returns catalog cards and filters deleted or non-existent cards', async () => {
  const f = createFixture();
  try {
    f.sql
      .prepare(`
      INSERT INTO cards(id, scope, en, ru, part_of_speech, extra_json, revision)
      VALUES(10, 'shared', 'run', 'бежать', 'verb', '{"past":"ran"}', 1),
            (20, 'shared', 'speak', 'говорить', 'verb', '{"past":"spoke"}', 2),
            (30, 'shared', 'obsolete', 'устаревший', 'adj', '{}', 1);
    `)
      .run();

    // Mark card 30 as deleted
    f.sql.prepare('UPDATE cards SET deleted_at = unixepoch() WHERE id = 30').run();

    // Link card 10 and 20 to legacy namespaces
    f.sql
      .prepare(`
      INSERT INTO legacy_ids(entity_kind, target_id, source_namespace)
      VALUES('card', '10', 'IRREGULAR'),
            ('card', '20', 'SPEAKOUT'),
            ('card', '30', 'IRREGULAR');
    `)
      .run();

    // 1. Valid request for existing cards 10 and 20
    const res = await stageWorker.fetch(
      new Request('https://stage.example/api/catalogs/cards?ids=10,20'),
      f.env
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(Array.isArray(data.cards), true);
    assert.equal(data.cards.length, 2);

    const card10 = data.cards.find((c) => c.stageId === 10);
    assert.ok(card10);
    assert.equal(card10.en, 'run');
    assert.equal(card10.ru, 'бежать');
    assert.equal(card10.pos, 'verb');
    assert.equal(card10.base, 'run');
    assert.equal(card10.past, 'ran');
    assert.equal(card10.stagePublicCatalog, true);
    assert.equal(card10.stageDataDeferred, false);

    const card20 = data.cards.find((c) => c.stageId === 20);
    assert.ok(card20);
    assert.equal(card20.en, 'speak');
    assert.equal(card20.stageRevision, 2);

    // 2. Deleted card 30 is not returned
    const deletedRes = await stageWorker.fetch(
      new Request('https://stage.example/api/catalogs/cards?ids=30'),
      f.env
    );
    assert.equal(deletedRes.status, 200);
    const deletedData = await deletedRes.json();
    assert.deepEqual(deletedData.cards, []);

    // 3. Non-existent card 999 is not returned
    const nonExistentRes = await stageWorker.fetch(
      new Request('https://stage.example/api/catalogs/cards?ids=999'),
      f.env
    );
    assert.equal(nonExistentRes.status, 200);
    const nonExistentData = await nonExistentRes.json();
    assert.deepEqual(nonExistentData.cards, []);
  } finally {
    f.close();
  }
});

test('GET /api/catalogs/cards validates query parameters and rejects invalid card IDs', async () => {
  const f = createFixture();
  try {
    // Missing / empty ids parameter
    const emptyRes = await stageWorker.fetch(
      new Request('https://stage.example/api/catalogs/cards?ids='),
      f.env
    );
    assert.equal(emptyRes.status, 400);
    assert.equal((await emptyRes.json()).error, 'Invalid card ids.');

    // Malformed non-numeric ID
    const badIdRes = await stageWorker.fetch(
      new Request('https://stage.example/api/catalogs/cards?ids=abc,12'),
      f.env
    );
    assert.equal(badIdRes.status, 400);
    assert.equal((await badIdRes.json()).error, 'Invalid card ids.');

    // More than 8 IDs requested
    const tooManyRes = await stageWorker.fetch(
      new Request('https://stage.example/api/catalogs/cards?ids=1,2,3,4,5,6,7,8,9'),
      f.env
    );
    assert.equal(tooManyRes.status, 400);
    assert.equal((await tooManyRes.json()).error, 'Invalid card ids.');

    // Unauthorized host
    const badHostRes = await stageWorker.fetch(
      new Request('https://unauthorized.domain/api/catalogs/cards?ids=10'),
      f.env
    );
    assert.equal(badHostRes.status, 403);
  } finally {
    f.close();
  }
});

test('DELETE /api/everyday/reference removes reference and bumps catalog version with CAS guard', async () => {
  const f = createFixture();
  try {
    const catalog = {
      version: 5,
      groups: [
        {
          id: 'group-essentials',
          title: 'Essentials',
          topics: [
            {
              id: 'topic-coffee',
              title: 'Coffee Ordering',
              entries: [
                {cardId: 101, phrase: 'Can I have a flat white?'},
                {cardId: 102, phrase: 'To go, please.'}
              ]
            }
          ]
        }
      ]
    };

    f.sql
      .prepare("INSERT INTO catalog_documents(namespace, key, value_json) VALUES('everyday', 'v1', ?)")
      .run(JSON.stringify(catalog));

    f.setActor({id: 'teacher-admin', role: 'ADMIN'});

    // 1. Successful deletion of reference 101
    const delRes = await f.app.fetch(
      new Request('https://stage.example/api/everyday/reference', {
        method: 'DELETE',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({topicId: 'topic-coffee', cardId: 101, expectedVersion: 5})
      }),
      f.env,
      {}
    );
    assert.equal(delRes.status, 200);
    const delData = await delRes.json();
    assert.equal(delData.ok, true);
    assert.equal(delData.version, 6);

    // Verify database document was updated
    const docRow = f.sql
      .prepare("SELECT value_json FROM catalog_documents WHERE namespace='everyday' AND key='v1'")
      .get();
    const updatedCatalog = JSON.parse(docRow.value_json);
    assert.equal(updatedCatalog.version, 6);
    const updatedTopic = updatedCatalog.groups[0].topics[0];
    assert.equal(updatedTopic.entries.length, 1);
    assert.equal(updatedTopic.entries[0].cardId, 102);
    assert.deepEqual(updatedCatalog.removedReferences, ['topic-coffee:101']);

    // 2. Conflict (409) when submitting obsolete expectedVersion (CAS check)
    const conflictRes = await f.app.fetch(
      new Request('https://stage.example/api/everyday/reference', {
        method: 'DELETE',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({topicId: 'topic-coffee', cardId: 102, expectedVersion: 5})
      }),
      f.env,
      {}
    );
    assert.equal(conflictRes.status, 409);
    assert.equal((await conflictRes.json()).error, 'Catalog changed. Reload it before editing.');

    // 3. Not found (404) when cardId does not exist in topic
    const missingCardRes = await f.app.fetch(
      new Request('https://stage.example/api/everyday/reference', {
        method: 'DELETE',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({topicId: 'topic-coffee', cardId: 999, expectedVersion: 6})
      }),
      f.env,
      {}
    );
    assert.equal(missingCardRes.status, 404);
    assert.equal((await missingCardRes.json()).error, 'Reference not found.');
  } finally {
    f.close();
  }
});

test('DELETE /api/everyday/reference enforces authentication, permissions, body limits and validation', async () => {
  const f = createFixture();
  try {
    f.sql
      .prepare("INSERT INTO catalog_documents(namespace, key, value_json) VALUES('everyday', 'v1', ?)")
      .run(JSON.stringify({version: 1, groups: []}));

    // 1. Unauthenticated -> 401
    f.setActor(null);
    const unauthRes = await f.app.fetch(
      new Request('https://stage.example/api/everyday/reference', {
        method: 'DELETE',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({topicId: 't1', cardId: 10, expectedVersion: 1})
      }),
      f.env,
      {}
    );
    assert.equal(unauthRes.status, 401);

    // 2. Authenticated as student (USER) -> 403
    f.setActor({id: 'student-1', role: 'USER'});
    const studentRes = await f.app.fetch(
      new Request('https://stage.example/api/everyday/reference', {
        method: 'DELETE',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({topicId: 't1', cardId: 10, expectedVersion: 1})
      }),
      f.env,
      {}
    );
    assert.equal(studentRes.status, 403);
    assert.equal((await studentRes.json()).error, 'Teachers only.');

    // 3. STAGE_WRITES !== 'true' -> 503
    f.setActor({id: 'teacher-1', role: 'ADMIN'});
    const readOnlyRes = await f.app.fetch(
      new Request('https://stage.example/api/everyday/reference', {
        method: 'DELETE',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({topicId: 't1', cardId: 10, expectedVersion: 1})
      }),
      {...f.env, STAGE_WRITES: 'false'},
      {}
    );
    assert.equal(readOnlyRes.status, 503);
    assert.equal((await readOnlyRes.json()).error, 'Writes disabled.');

    // 4. Request body exceeds 1024 bytes -> 413
    const oversizedRes = await f.app.fetch(
      new Request('https://stage.example/api/everyday/reference', {
        method: 'DELETE',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({topicId: 't'.repeat(1025), cardId: 10, expectedVersion: 1})
      }),
      f.env,
      {}
    );
    assert.equal(oversizedRes.status, 413);

    // 5. Malformed JSON -> 400
    const malformedRes = await f.app.fetch(
      new Request('https://stage.example/api/everyday/reference', {
        method: 'DELETE',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: 'invalid_json{{'
      }),
      f.env,
      {}
    );
    assert.equal(malformedRes.status, 400);

    // 6. Invalid body schema (unexpected extra keys) -> 400
    const extraKeysRes = await f.app.fetch(
      new Request('https://stage.example/api/everyday/reference', {
        method: 'DELETE',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({topicId: 't1', cardId: 10, expectedVersion: 1, extra: 'not allowed'})
      }),
      f.env,
      {}
    );
    assert.equal(extraKeysRes.status, 400);
    assert.equal((await extraKeysRes.json()).error, 'Invalid reference.');
  } finally {
    f.close();
  }
});

test('POST /api/exams/recommendation validates permissions and inputs', async () => {
  const f = createFixture();
  try {
    await new AssessmentService(f.db).ensure();
    await new ExamService(f.db).ensure();

    // 1. Unauthenticated -> 401
    f.setActor(null);
    const unauthRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 1, studentId: 'stud1', partId: 10, index: 0, expectedRevision: 1})
      }),
      f.env,
      {}
    );
    assert.equal(unauthRes.status, 401);

    // 2. Writes disabled -> 503
    f.setActor({id: 'teacher-1', role: 'ADMIN'});
    const readOnlyRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 1, studentId: 'stud1', partId: 10, index: 0, expectedRevision: 1})
      }),
      {...f.env, STAGE_WRITES: 'false'},
      {}
    );
    assert.equal(readOnlyRes.status, 503);

    // 3. Body schema invalid (unexpected field) -> 400
    const invalidBodyRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 1, studentId: 'stud1', partId: 10, index: 0, expectedRevision: 1, hacker: true})
      }),
      f.env,
      {}
    );
    assert.equal(invalidBodyRes.status, 400);
    assert.equal((await invalidBodyRes.json()).error, 'Invalid review request.');

    // 4. Student requesting recommendation on own account -> 403
    f.setActor({id: 'stud1', role: 'USER'});
    const selfReviewRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 1, studentId: 'stud1', partId: 10, index: 0, expectedRevision: 1})
      }),
      f.env,
      {}
    );
    assert.equal(selfReviewRes.status, 403);
    assert.equal((await selfReviewRes.json()).error, 'You cannot do that.');

    // 5. Target student does not exist in accounts database -> 404
    f.setActor({id: 'teacher-1', role: 'ADMIN'});
    const notFoundRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 1, studentId: 'stud1', partId: 10, index: 0, expectedRevision: 1})
      }),
      f.env,
      {}
    );
    assert.equal(notFoundRes.status, 404);
    assert.equal((await notFoundRes.json()).error, 'No such account.');

    // 6. Teacher (ADMIN) attempting to review student outside assigned group -> 403
    f.sql
      .prepare("INSERT INTO users(id, login, email, role) VALUES(99, 'unassigned', 'u99@test.com', 'USER')")
      .run();
    const unassignedRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 1, studentId: '99', partId: 10, index: 0, expectedRevision: 1})
      }),
      f.env,
      {}
    );
    assert.equal(unassignedRes.status, 403);
    assert.equal((await unassignedRes.json()).error, 'You cannot do that.');
  } finally {
    f.close();
  }
});

test('POST /api/exams/recommendation verifies question checkMode and answer length constraints', async () => {
  const f = createFixture();
  try {
    await new AssessmentService(f.db).ensure();
    await new ExamService(f.db).ensure();

    f.sql
      .prepare("INSERT INTO users(id, login, email, role) VALUES(60, 'student60', 's60@test.com', 'USER')")
      .run();

    // 1. Task with checkMode !== 'meaning' (e.g. 'exact')
    const exactTask = {
      id: 801,
      type: 'task',
      title: 'Fill in the blank',
      checkMode: 'exact',
      teacherAnswer: 'exact text',
      maxPoints: 5
    };

    f.sql.prepare("INSERT INTO exams(id, title) VALUES(2, 'Grammar Exam')").run();
    f.sql.prepare('INSERT INTO exam_blocks(id, exam_id, position, published) VALUES(30, 2, 1, 1)').run();
    f.sql
      .prepare("INSERT INTO exam_materials(id, exam_id, block_id, position, type, content_json) VALUES(801, 2, 30, 1, 'task', ?)")
      .run(JSON.stringify(exactTask));

    f.sql
      .prepare(`
      INSERT INTO assessment_work(account_id, kind, material_id, revision, state, answers_json, snapshot_json)
      VALUES('60', 'exam-block', 30, 1, 'submitted', '{"801":{"0":"my answer"}}', ?)
    `)
      .run(JSON.stringify([exactTask]));

    f.setActor({id: 'dev-supervisor', role: 'DEVELOPER'});

    const notMeaningRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 30, studentId: '60', partId: 801, index: 0, expectedRevision: 1})
      }),
      f.env,
      {}
    );
    assert.equal(notMeaningRes.status, 400);
    assert.equal((await notMeaningRes.json()).error, 'Choose a By meaning answer.');

    // 2. Task with answer exceeding 6000 characters
    const meaningTask = {
      id: 802,
      type: 'task',
      title: 'Long essay',
      checkMode: 'meaning',
      teacherAnswer: 'expected essay',
      maxPoints: 20
    };

    f.sql.prepare('INSERT INTO exam_blocks(id, exam_id, position, published) VALUES(31, 2, 2, 1)').run();
    f.sql
      .prepare("INSERT INTO exam_materials(id, exam_id, block_id, position, type, content_json) VALUES(802, 2, 31, 1, 'task', ?)")
      .run(JSON.stringify(meaningTask));

    const hugeAnswer = 'a'.repeat(6001);
    f.sql
      .prepare(`
      INSERT INTO assessment_work(account_id, kind, material_id, revision, state, answers_json, snapshot_json)
      VALUES('60', 'exam-block', 31, 1, 'submitted', ?, ?)
    `)
      .run(JSON.stringify({'802': {'0': hugeAnswer}}), JSON.stringify([meaningTask]));

    const tooLongRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 31, studentId: '60', partId: 802, index: 0, expectedRevision: 1})
      }),
      f.env,
      {}
    );
    assert.equal(tooLongRes.status, 400);
    assert.equal((await tooLongRes.json()).error, 'The answer is too long for automatic review.');
  } finally {
    f.close();
  }
});

test('POST /api/exams/recommendation returns recommendation status and records unavailable review', async () => {
  const f = createFixture();
  try {
    await new AssessmentService(f.db).ensure();
    await new ExamService(f.db).ensure();

    // Seed student in accounts DB
    f.sql
      .prepare("INSERT INTO users(id, login, email, role) VALUES(55, 'learner55', 'l55@test.com', 'USER')")
      .run();

    // Seed exam, block, material
    const taskContent = {
      id: 701,
      type: 'task',
      title: 'Analyze poem metaphor',
      checkMode: 'meaning',
      teacherAnswer: 'The almond blossom signifies ephemeral beauty.',
      maxPoints: 10
    };

    f.sql.prepare("INSERT INTO exams(id, title) VALUES(1, 'Literature Exam')").run();
    f.sql.prepare('INSERT INTO exam_blocks(id, exam_id, position, published) VALUES(20, 1, 1, 1)').run();
    f.sql
      .prepare("INSERT INTO exam_materials(id, exam_id, block_id, position, type, content_json) VALUES(701, 1, 20, 1, 'task', ?)")
      .run(JSON.stringify(taskContent));

    // Seed assessment work in submitted state
    f.sql
      .prepare(`
      INSERT INTO assessment_work(account_id, kind, material_id, revision, state, answers_json, snapshot_json)
      VALUES('55', 'exam-block', 20, 3, 'submitted', '{"701":{"0":"The blossom represents transient beauty."}}', ?)
    `)
      .run(JSON.stringify([taskContent]));

    f.setActor({id: 'dev-supervisor', role: 'DEVELOPER'});

    // 1. Revision mismatch (expectedRevision = 2, actual = 3) -> 409
    const revMismatchRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 20, studentId: '55', partId: 701, index: 0, expectedRevision: 2})
      }),
      f.env,
      {}
    );
    assert.equal(revMismatchRes.status, 409);
    assert.equal(
      (await revMismatchRes.json()).error,
      'Open the current submitted work before requesting a recommendation.'
    );

    // 2. Successful call with expectedRevision = 3 (EXAM_REVIEW_PROVIDER is disabled)
    const recRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 20, studentId: '55', partId: 701, index: 0, expectedRevision: 3})
      }),
      f.env,
      {}
    );
    assert.equal(recRes.status, 200);
    const recData = await recRes.json();
    assert.equal(recData.status, 'unavailable');
    assert.equal(recData.provider, 'disabled');
    assert.equal(recData.requiresTeacher, true);
    assert.equal(recData.revision, 3);
    assert.equal(recData.cached, false);
    assert.equal(recData.message, 'AI review is unavailable. Review this answer manually.');

    // Verify bug report was logged for unavailable AI review
    const bugs = f.sql
      .prepare("SELECT path, status, error, hits FROM bug_reports WHERE path = '/api/exams/recommendation'")
      .all();
    assert.equal(bugs.length, 1);
    assert.equal(bugs[0].status, 503);
    assert.equal(bugs[0].error, 'Exam AI review is disabled or unavailable.');

    // 3. Verify cached recommendation is returned if assessment_history contains a 'result' with 'recommended'
    const signatureRow = f.sql
      .prepare("SELECT reason FROM assessment_history WHERE account_id='55' AND kind='exam-recommendation' AND action='result' ORDER BY id DESC LIMIT 1")
      .get();
    assert.ok(signatureRow);

    const cachedRecommendation = {
      status: 'recommended',
      provider: 'mock-ai',
      model: 'model-v1',
      points: 9,
      explanation: 'Excellent explanation of metaphorical context.',
      confidence: 0.95,
      requiresTeacher: true
    };

    f.sql
      .prepare("INSERT INTO assessment_history(account_id, kind, material_id, actor_id, action, reason, snapshot_json) VALUES(?, 'exam-recommendation', ?, ?, 'result', ?, ?)")
      .run('55', 20, 'dev-supervisor', signatureRow.reason, JSON.stringify(cachedRecommendation));

    const cachedRes = await f.app.fetch(
      new Request('https://stage.example/api/exams/recommendation', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({id: 20, studentId: '55', partId: 701, index: 0, expectedRevision: 3})
      }),
      f.env,
      {}
    );
    assert.equal(cachedRes.status, 200);
    const cachedData = await cachedRes.json();
    assert.equal(cachedData.status, 'recommended');
    assert.equal(cachedData.points, 9);
    assert.equal(cachedData.explanation, 'Excellent explanation of metaphorical context.');
    assert.equal(cachedData.confidence, 0.95);
    assert.equal(cachedData.cached, true);
    assert.equal(cachedData.revision, 3);
  } finally {
    f.close();
  }
});
