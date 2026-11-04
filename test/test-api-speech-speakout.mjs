import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import stageWorker, {ACCOUNT_AUTH} from '../src/learning-stage-worker.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';
import {STUDY_DATABASE} from '../src/study-database.mjs';

function createFixture() {
  const sql = new DatabaseSync(':memory:');
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

  sql.exec(`
    CREATE TABLE IF NOT EXISTS catalog_documents(
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      PRIMARY KEY(namespace, key)
    );
    CREATE TABLE IF NOT EXISTS class_groups (
      id INTEGER PRIMARY KEY,
      deleted_at INTEGER,
      hidden_from_students INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY,
      published INTEGER NOT NULL DEFAULT 1,
      hidden_from_students INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS class_group_lessons (
      group_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      PRIMARY KEY(group_id, lesson_id)
    );
    CREATE TABLE IF NOT EXISTS class_group_students (
      group_id INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      PRIMARY KEY(account_id)
    );
    CREATE TABLE IF NOT EXISTS lesson_access (
      account_id TEXT,
      lesson_id INTEGER,
      allow_hidden INTEGER NOT NULL DEFAULT 0,
      personal_hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS account_settings (
      account_id TEXT,
      key TEXT,
      value_json TEXT
    );
    CREATE TABLE IF NOT EXISTS lesson_blocks (
      id INTEGER PRIMARY KEY,
      lesson_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 1,
      type TEXT NOT NULL,
      tab TEXT,
      card_id INTEGER,
      content_json TEXT NOT NULL DEFAULT '{}',
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS qr_speech_tasks (
      id TEXT PRIMARY KEY,
      group_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      card_id INTEGER,
      sense_id INTEGER,
      author_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      value_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS speakout_documents (
      level TEXT NOT NULL,
      unit_index INTEGER NOT NULL,
      lesson_index INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      published INTEGER NOT NULL DEFAULT 1,
      content_json TEXT NOT NULL,
      PRIMARY KEY(level, unit_index, lesson_index)
    );
    CREATE TABLE IF NOT EXISTS speakout_answers (
      account_id TEXT NOT NULL,
      level TEXT NOT NULL,
      unit_index INTEGER NOT NULL,
      lesson_index INTEGER NOT NULL,
      definition_revision INTEGER NOT NULL,
      answers_json TEXT NOT NULL,
      PRIMARY KEY(account_id, level, unit_index, lesson_index)
    );
  `);

  let currentActor = null;
  const r2Storage = new Map();

  const r2Mock = {
    async get(key) {
      if (!r2Storage.has(key)) return null;
      const item = r2Storage.get(key);
      return {
        size: item.bytes.length,
        body: item.bytes,
        httpMetadata: {contentType: item.mime},
        customMetadata: {
          sha256: item.sha256,
          bytes: String(item.bytes.length),
          mime: item.mime,
          name: item.name
        }
      };
    },
    async head(key) {
      return this.get(key);
    },
    async put() {}
  };

  const env = {
    STAGE_ENABLED: 'true',
    STAGE_ALLOWED_HOST: 'stage.example',
    STAGE_WRITES: 'true',
    STORAGE_MODE: 'test',
    STAGE_MEDIA_BUCKET: 'learn-english-learning-test-media',
    STAGE_MEDIA: r2Mock,
    ACCOUNT_MUTATIONS_ENABLED: 'true',
    ACCOUNT_QUERY_LIMIT_ENABLED: 'false',
    DB: {prepare: () => ({all: async () => ({results: []})})},
    [STUDY_DATABASE]: db,
    [ACCOUNT_AUTH]: {
      current: async () => currentActor
    }
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
    r2Storage,
    setActor: (actor) => {
      currentActor = actor;
    },
    close: () => sql.close()
  };
}

test('GET /api/speech-scenarios retrieves scenarios list and audio metadata for authorized lesson', async () => {
  const f = createFixture();
  try {
    f.sql.prepare('INSERT INTO class_groups(id) VALUES(1)').run();
    f.sql.prepare('INSERT INTO lessons(id) VALUES(10)').run();
    f.sql.prepare('INSERT INTO class_group_lessons(group_id, lesson_id) VALUES(1, 10)').run();

    const phraseBlock = {
      phrase: 'Good morning, how are you today?',
      fileId: 'audio-morning-1',
      mediaId: 'm1',
      name: 'morning.mp3',
      fileType: 'audio/mpeg'
    };
    f.sql
      .prepare("INSERT INTO lesson_blocks(id, lesson_id, type, content_json) VALUES(101, 10, 'phrase', ?)")
      .run(JSON.stringify(phraseBlock));

    // 1. Unauthenticated request -> 401
    f.setActor(null);
    const unauthRes = await f.app.fetch(
      new Request('https://stage.example/api/speech-scenarios?groupId=1&lessonId=10'),
      f.env,
      {}
    );
    assert.equal(unauthRes.status, 401);

    // 2. Authenticated developer retrieves scenario list
    f.setActor({id: 'teacher-1', role: 'DEVELOPER'});
    const listRes = await f.app.fetch(
      new Request('https://stage.example/api/speech-scenarios?groupId=1&lessonId=10'),
      f.env,
      {}
    );
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.groupId, 1);
    assert.equal(listData.lessonId, 10);
    assert.equal(listData.scenarios.length, 1);
    assert.equal(listData.scenarios[0].blockId, 101);
    assert.equal(listData.scenarios[0].reference, 'Good morning, how are you today?');
    assert.equal(listData.scenarios[0].hasAudio, true);
    assert.deepEqual(listData.scenarios[0].modes, ['shadowing', 'pronunciation']);

    // 3. Authenticated developer retrieves audio metadata
    const audioRes = await f.app.fetch(
      new Request('https://stage.example/api/speech-scenarios?action=audio&groupId=1&lessonId=10&blockId=101'),
      f.env,
      {}
    );
    assert.equal(audioRes.status, 200);
    const audioData = await audioRes.json();
    assert.equal(audioData.blockId, 101);
    assert.equal(audioData.fileId, 'audio-morning-1');
    assert.equal(audioData.mediaId, 'm1');
    assert.equal(audioData.name, 'morning.mp3');
    assert.equal(audioData.mime, 'audio/mpeg');

    // 4. Unauthorized student not in group -> 403
    f.setActor({id: 'student-99', role: 'USER'});
    const forbiddenRes = await f.app.fetch(
      new Request('https://stage.example/api/speech-scenarios?groupId=1&lessonId=10'),
      f.env,
      {}
    );
    assert.equal(forbiddenRes.status, 403);
    assert.equal((await forbiddenRes.json()).error, 'This lesson is not available for this account.');
  } finally {
    f.close();
  }
});

test('POST /api/speech-scenarios initiates speech task and validates parameters and write permissions', async () => {
  const f = createFixture();
  try {
    f.sql.prepare('INSERT INTO class_groups(id) VALUES(2)').run();
    f.sql.prepare('INSERT INTO lessons(id) VALUES(20)').run();
    f.sql.prepare('INSERT INTO class_group_lessons(group_id, lesson_id) VALUES(2, 20)').run();

    const pronunciationBlock = {
      word: 'thoroughly',
      fileId: 'audio-thoroughly',
      mediaId: 'm2',
      name: 'thoroughly.mp3',
      fileType: 'audio/mpeg'
    };
    f.sql
      .prepare("INSERT INTO lesson_blocks(id, lesson_id, type, content_json) VALUES(202, 20, 'pronunciation', ?)")
      .run(JSON.stringify(pronunciationBlock));

    // 1. STAGE_WRITES !== 'true' -> 503
    f.setActor({id: 'teacher-1', role: 'DEVELOPER'});
    const readOnlyRes = await f.app.fetch(
      new Request('https://stage.example/api/speech-scenarios', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({
          groupId: 2,
          lessonId: 20,
          blockId: 202,
          mode: 'pronunciation',
          locale: 'en-GB'
        })
      }),
      {...f.env, STAGE_WRITES: 'false'},
      {}
    );
    assert.equal(readOnlyRes.status, 503);
    assert.equal((await readOnlyRes.json()).error, 'Writes disabled.');

    // 2. Successful task creation with pronunciation mode and en-GB locale -> 200
    const successRes = await f.app.fetch(
      new Request('https://stage.example/api/speech-scenarios', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({
          groupId: 2,
          lessonId: 20,
          blockId: 202,
          mode: 'pronunciation',
          locale: 'en-GB'
        })
      }),
      f.env,
      {}
    );
    assert.equal(successRes.status, 200);
    const taskData = await successRes.json();
    assert.ok(taskData.taskId);
    assert.equal(taskData.mode, 'pronunciation');
    assert.equal(taskData.locale, 'en-GB');
    assert.equal(taskData.reference, 'thoroughly');
    assert.equal(taskData.evaluation, 'pronunciation');
    assert.equal(taskData.rubric.id, 'standard-shadowing-v1');

    // Verify task stored in qr_speech_tasks table
    const storedTask = f.sql.prepare('SELECT value_json FROM qr_speech_tasks WHERE id = ?').get(taskData.taskId);
    assert.ok(storedTask);
    const parsedValue = JSON.parse(storedTask.value_json);
    assert.equal(parsedValue.mode, 'pronunciation');
    assert.equal(parsedValue.locale, 'en-GB');
    assert.equal(parsedValue.reference, 'thoroughly');

    // 3. Invalid mode -> 400
    const badModeRes = await f.app.fetch(
      new Request('https://stage.example/api/speech-scenarios', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({
          groupId: 2,
          lessonId: 20,
          blockId: 202,
          mode: 'unsupported-mode',
          locale: 'en-GB'
        })
      }),
      f.env,
      {}
    );
    assert.equal(badModeRes.status, 400);
    assert.equal((await badModeRes.json()).error, 'Invalid speech practice mode.');

    // 4. Invalid locale -> 400
    const badLocaleRes = await f.app.fetch(
      new Request('https://stage.example/api/speech-scenarios', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({
          groupId: 2,
          lessonId: 20,
          blockId: 202,
          mode: 'pronunciation',
          locale: 'fr-FR'
        })
      }),
      f.env,
      {}
    );
    assert.equal(badLocaleRes.status, 400);
    assert.equal((await badLocaleRes.json()).error, 'Invalid speech locale.');
  } finally {
    f.close();
  }
});

test('POST /api/speakout/answers records student answers with CAS revision check', async () => {
  const f = createFixture();
  try {
    const catalog = [
      {
        level: 'B1',
        units: [
          {
            lessons: [{letter: 'A', title: 'Feeling good'}]
          }
        ]
      }
    ];

    f.sql
      .prepare("INSERT INTO catalog_documents(namespace, key, value_json) VALUES('static', 'SPEAKOUT', ?)")
      .run(JSON.stringify(catalog));

    const lessonDoc = {
      blocks: [
        {id: 'task-1', type: 'task', title: 'What is your hobby?'},
        {id: 'exercise-1', type: 'exercise', title: 'Grammar practice'}
      ]
    };

    f.sql
      .prepare("INSERT INTO speakout_documents(level, unit_index, lesson_index, revision, published, content_json) VALUES('B1', 0, 0, 1, 1, ?)")
      .run(JSON.stringify(lessonDoc));

    f.setActor({id: 'student-42', role: 'USER'});

    // 1. Successful answer submission -> 200
    const answerRes = await stageWorker.fetch(
      new Request('https://stage.example/api/speakout/answers', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({
          level: 'B1',
          unit: 0,
          lesson: 0,
          expectedRevision: 1,
          answers: {'task-1': 'Reading books'}
        })
      }),
      f.env
    );
    assert.equal(answerRes.status, 200);
    const answerData = await answerRes.json();
    assert.equal(answerData.saved, true);
    assert.ok(answerData.cacheRevision);

    // Verify row in speakout_answers
    const row = f.sql
      .prepare("SELECT answers_json, definition_revision FROM speakout_answers WHERE account_id = 'student-42'")
      .get();
    assert.ok(row);
    assert.equal(row.definition_revision, 1);
    assert.deepEqual(JSON.parse(row.answers_json), {'task-1': 'Reading books'});

    // 2. Conflict when expectedRevision does not match lesson definition revision -> 409
    const conflictRes = await stageWorker.fetch(
      new Request('https://stage.example/api/speakout/answers', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({
          level: 'B1',
          unit: 0,
          lesson: 0,
          expectedRevision: 99,
          answers: {'task-1': 'Reading books'}
        })
      }),
      f.env
    );
    assert.equal(conflictRes.status, 409);
    assert.equal((await conflictRes.json()).error, 'Speakout changed. Reopen the lesson.');

    // 3. Submitting answer for invalid block ID -> 400
    const badTaskRes = await stageWorker.fetch(
      new Request('https://stage.example/api/speakout/answers', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({
          level: 'B1',
          unit: 0,
          lesson: 0,
          expectedRevision: 1,
          answers: {'non-existent-task': 'Random text'}
        })
      }),
      f.env
    );
    assert.equal(badTaskRes.status, 400);
    assert.equal((await badTaskRes.json()).error, 'Invalid task.');
  } finally {
    f.close();
  }
});

test('GET /api/speakout/media serves audio stream with byte-range support and handles missing files', async () => {
  const f = createFixture();
  try {
    const catalog = [
      {
        level: 'B1',
        units: [
          {
            lessons: [{letter: 'B', title: 'Travel stories'}]
          }
        ]
      }
    ];

    f.sql
      .prepare("INSERT INTO catalog_documents(namespace, key, value_json) VALUES('static', 'SPEAKOUT', ?)")
      .run(JSON.stringify(catalog));

    const audioBytes = new Uint8Array([73, 68, 51, 3, 0, 0, 0, 0, 0, 10]); // MP3 header
    const hashBuffer = await crypto.subtle.digest('SHA-256', audioBytes);
    const sha256 = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const localKey = 'stage-local/speakout/unit0/audioBlock/' + sha256;

    f.r2Storage.set(localKey, {
      bytes: audioBytes,
      sha256,
      mime: 'audio/mpeg',
      name: 'travel.mp3'
    });

    const lessonDoc = {
      blocks: [
        {id: 'audioBlock', type: 'audio', localMediaKey: localKey},
        {id: 'noFileBlock', type: 'audio'}
      ]
    };

    f.sql
      .prepare("INSERT INTO speakout_documents(level, unit_index, lesson_index, revision, published, content_json) VALUES('B1', 0, 0, 1, 1, ?)")
      .run(JSON.stringify(lessonDoc));

    f.setActor({id: 'student-1', role: 'USER'});

    // 1. Full audio request -> 200
    const fullRes = await stageWorker.fetch(
      new Request('https://stage.example/api/speakout/media?level=B1&unit=0&lesson=0&block=audioBlock'),
      f.env
    );
    assert.equal(fullRes.status, 200);
    assert.equal(fullRes.headers.get('Content-Type'), 'audio/mpeg');
    assert.equal(fullRes.headers.get('Accept-Ranges'), 'bytes');
    assert.equal(fullRes.headers.get('Content-Length'), String(audioBytes.length));
    const receivedFull = new Uint8Array(await fullRes.arrayBuffer());
    assert.deepEqual(receivedFull, audioBytes);

    // 2. Partial audio request with Range header -> 206
    const rangeRes = await stageWorker.fetch(
      new Request('https://stage.example/api/speakout/media?level=B1&unit=0&lesson=0&block=audioBlock', {
        headers: {Range: 'bytes=0-3'}
      }),
      f.env
    );
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('Content-Range'), 'bytes 0-3/' + audioBytes.length);
    assert.equal(rangeRes.headers.get('Content-Length'), '4');
    const receivedSlice = new Uint8Array(await rangeRes.arrayBuffer());
    assert.deepEqual(receivedSlice, audioBytes.subarray(0, 4));

    // 3. Block without audio file attached -> 404
    const noFileRes = await stageWorker.fetch(
      new Request('https://stage.example/api/speakout/media?level=B1&unit=0&lesson=0&block=noFileBlock'),
      f.env
    );
    assert.equal(noFileRes.status, 404);
    assert.equal((await noFileRes.json()).error, 'File unavailable.');

    // 4. Non-existent block -> 404
    const missingRes = await stageWorker.fetch(
      new Request('https://stage.example/api/speakout/media?level=B1&unit=0&lesson=0&block=missingBlock'),
      f.env
    );
    assert.equal(missingRes.status, 404);
    assert.equal((await missingRes.json()).error, 'File unavailable.');
  } finally {
    f.close();
  }
});
