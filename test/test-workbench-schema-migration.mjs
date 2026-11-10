import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {learningWorkbenchReadiness} from '../src/learning-workbench-schema.mjs';
import {workbenchActor} from '../src/learning-workbench-runtime.mjs';

test('learning migrations 010 through 029 apply cleanly on baseline schema', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    applyLearningSchema(db);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec("INSERT INTO account_refs (id) VALUES ('u1'), ('dev'), ('teacher');");

    const dir = new URL('../migrations/learning', import.meta.url).pathname;
    const files = readdirSync(dir)
      .filter(name => {
        const num = Number.parseInt(name.slice(0, 3), 10);
        return num >= 10 && num <= 29 && name.endsWith('.sql');
      })
      .sort();

    assert.equal(files.length, 20);

    for (const file of files) {
      const sql = readFileSync(join(dir, file), 'utf8');
      db.exec(sql);
    }

    const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
    assert.deepEqual(fkViolations, []);

    const readiness = await learningWorkbenchReadiness(
      {read: async (query, args = []) => db.prepare(query).all(...args)},
      {studyBridge: false}
    );

    assert.equal(readiness.ready, true);
    assert.deepEqual(readiness.missing, []);
    assert.deepEqual(readiness.incompatible, []);
  } finally {
    db.close();
  }
});

test('learning workbench readiness satisfies studyBridge requirements when exam tables are present', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    applyLearningSchema(db);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec("INSERT INTO account_refs (id) VALUES ('u1'), ('dev'), ('teacher');");

    db.exec(`
      CREATE TABLE IF NOT EXISTS exam_blocks (id INTEGER PRIMARY KEY, exam_id INTEGER);
      CREATE TABLE IF NOT EXISTS exam_instances (exam_id INTEGER PRIMARY KEY, source_exam_id INTEGER, account_id TEXT, assignment_id TEXT, active INTEGER);
      CREATE TABLE IF NOT EXISTS assessment_work (id INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS assessment_history (id INTEGER PRIMARY KEY);
    `);

    const dir = new URL('../migrations/learning', import.meta.url).pathname;
    const files = readdirSync(dir)
      .filter(name => {
        const num = Number.parseInt(name.slice(0, 3), 10);
        return num >= 10 && num <= 29 && name.endsWith('.sql');
      })
      .sort();

    for (const file of files) {
      const sql = readFileSync(join(dir, file), 'utf8');
      db.exec(sql);
    }

    const readiness = await learningWorkbenchReadiness(
      {read: async (query, args = []) => db.prepare(query).all(...args)},
      {studyBridge: true}
    );

    assert.equal(readiness.ready, true);
    assert.deepEqual(readiness.missing, []);
    assert.deepEqual(readiness.incompatible, []);
  } finally {
    db.close();
  }
});

test('learning workbench readiness detects missing workbench triggers or tables', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    applyLearningSchema(db);
    const readiness = await learningWorkbenchReadiness(
      {read: async (query, args = []) => db.prepare(query).all(...args)},
      {studyBridge: false}
    );

    assert.equal(readiness.ready, false);
    assert.ok(readiness.missing.length > 0);
    assert.ok(readiness.missing.includes('qr_senses'));
  } finally {
    db.close();
  }
});

test('workbenchActor resolves developer actor by numeric id, string id, and login name', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        login TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'USER',
        active INTEGER NOT NULL DEFAULT 1,
        is_personal_data_revoked INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO users (id, login, name, role, active, is_personal_data_revoked)
      VALUES
        (1, 'TsovakDev', 'Tsovak Palakian', 'DEVELOPER', 1, 0),
        (2, 'Tsovak', 'Tsovak Student', 'USER', 1, 0),
        (3, 'InactiveDev', 'Inactive Developer', 'DEVELOPER', 0, 0),
        (4, 'RevokedDev', 'Revoked Developer', 'DEVELOPER', 1, 1);
    `);

    const env = {
      DB: {
        prepare: sql => ({
          bind: (...args) => ({
            first: async () => db.prepare(sql).get(...args) || null
          })
        })
      }
    };

    const byNumericId = await workbenchActor(env, 1);
    assert.deepEqual(byNumericId, {
      id: 1,
      login: 'TsovakDev',
      name: 'Tsovak Palakian',
      role: 'DEVELOPER',
      active: true
    });

    const byStringId = await workbenchActor(env, '1');
    assert.deepEqual(byStringId, {
      id: 1,
      login: 'TsovakDev',
      name: 'Tsovak Palakian',
      role: 'DEVELOPER',
      active: true
    });

    const byLogin = await workbenchActor(env, 'TsovakDev');
    assert.deepEqual(byLogin, {
      id: 1,
      login: 'TsovakDev',
      name: 'Tsovak Palakian',
      role: 'DEVELOPER',
      active: true
    });

    const studentUser = await workbenchActor(env, 'Tsovak');
    assert.deepEqual(studentUser, {
      id: 2,
      login: 'Tsovak',
      name: 'Tsovak Student',
      role: 'USER',
      active: true
    });

    assert.equal(await workbenchActor(env, 'InactiveDev'), null);
    assert.equal(await workbenchActor(env, 3), null);
    assert.equal(await workbenchActor(env, 'RevokedDev'), null);
    assert.equal(await workbenchActor(env, 4), null);
    assert.equal(await workbenchActor(env, 'UnknownUser'), null);
    assert.equal(await workbenchActor(env, 999), null);
    assert.equal(await workbenchActor(env, ''), null);
    assert.equal(await workbenchActor(env, null), null);
  } finally {
    db.close();
  }
});
