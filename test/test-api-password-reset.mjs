import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';

function createFixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE catalog_documents(
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      PRIMARY KEY(namespace, key)
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_salt TEXT,
      password_hash TEXT,
      password_iterations INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      is_personal_data_revoked INTEGER NOT NULL DEFAULT 0
    );
  `);

  const cleanArg = (a) =>
    a && typeof a === 'object' && 'type' in a
      ? a.type === 'null'
        ? null
        : ['integer', 'float'].includes(a.type)
        ? Number(a.value)
        : a.value
      : a;

  const db = {
    read: async (q, a = []) => sql.prepare(q).all(...a),
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

  const sentEmails = [];
  const env = {
    STAGE_ENABLED: 'true',
    STAGE_ALLOWED_HOST: 'accounts.example',
    STAGE_WRITES: 'true',
    ACCOUNT_MUTATIONS_ENABLED: 'true',
    ACCOUNT_QUERY_LIMIT_ENABLED: 'false',
    EMAIL_FROM: 'noreply@lumiscia.org',
    EMAIL: {
      async send(msg) {
        sentEmails.push(msg);
        return {messageId: 'msg-' + sentEmails.length};
      }
    },
    DB: accountDb
  };

  const app = integratedWorker({
    authenticate: async () => null,
    studyDatabase: () => db,
    accountWorker: {
      async fetch() {
        return new Response(null, {status: 404});
      }
    }
  });

  return {sql, db, env, app, sentEmails, close: () => sql.close()};
}

test('complete password reset flow sends email OTP and updates user credentials', async () => {
  const f = createFixture();
  try {
    f.sql
      .prepare('INSERT INTO users (email, password_salt, password_hash, password_iterations) VALUES (?, ?, ?, ?)')
      .run('learner@example.test', 'initial_salt', 'initial_hash', 100000);

    // 1. Request password reset code
    const codeReq = new Request('https://accounts.example/api/auth/password/code', {
      method: 'POST',
      headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'learner@example.test'})
    });
    const codeRes = await f.app.fetch(codeReq, f.env, {});
    assert.equal(codeRes.status, 200);

    const codeData = await codeRes.json();
    assert.equal(codeData.ok, true);
    assert.equal(codeData.email, 'learner@example.test');
    assert.equal(codeData.ttlSec, 3600);

    // Verify email contents
    assert.equal(f.sentEmails.length, 1);
    assert.equal(f.sentEmails[0].to, 'learner@example.test');
    assert.equal(f.sentEmails[0].subject, 'Reset your Lumiscia password');
    assert.ok(f.sentEmails[0].text.includes('password reset code is'));

    const codeMatch = f.sentEmails[0].text.match(/\d{6}/);
    assert.ok(codeMatch);
    const code = codeMatch[0];

    // 2. Submit password reset with received code
    const resetReq = new Request('https://accounts.example/api/auth/password/reset', {
      method: 'POST',
      headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
      body: JSON.stringify({
        email: 'learner@example.test',
        code,
        password: 'BrandNewSecurePassword2026!'
      })
    });
    const resetRes = await f.app.fetch(resetReq, f.env, {});
    assert.equal(resetRes.status, 200);

    const resetData = await resetRes.json();
    assert.equal(resetData.ok, true);

    // 3. Verify database password hash was updated
    const user = f.sql.prepare('SELECT password_salt, password_hash FROM users WHERE email=?').get('learner@example.test');
    assert.notEqual(user.password_hash, 'initial_hash');
    assert.notEqual(user.password_salt, 'initial_salt');
  } finally {
    f.close();
  }
});

test('password reset code cannot be consumed more than once', async () => {
  const f = createFixture();
  try {
    f.sql
      .prepare('INSERT INTO users (email, password_salt, password_hash, password_iterations) VALUES (?, ?, ?, ?)')
      .run('singleuse@example.test', 'salt', 'hash', 100000);

    // Request code
    await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/code', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'singleuse@example.test'})
      }),
      f.env,
      {}
    );

    const code = f.sentEmails[0].text.match(/\d{6}/)[0];

    // First reset succeeds
    const firstRes = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/reset', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'singleuse@example.test', code, password: 'ValidPassword123!'})
      }),
      f.env,
      {}
    );
    assert.equal(firstRes.status, 200);

    // Replay with identical code fails with HTTP 400
    const replayRes = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/reset', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'singleuse@example.test', code, password: 'AnotherPassword123!'})
      }),
      f.env,
      {}
    );
    assert.equal(replayRes.status, 400);
  } finally {
    f.close();
  }
});

test('password reset rejects incorrect verification code with HTTP 401', async () => {
  const f = createFixture();
  try {
    f.sql
      .prepare('INSERT INTO users (email, password_salt, password_hash, password_iterations) VALUES (?, ?, ?, ?)')
      .run('wrongcode@example.test', 'salt', 'hash', 100000);

    await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/code', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'wrongcode@example.test'})
      }),
      f.env,
      {}
    );

    const failRes = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/reset', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'wrongcode@example.test', code: '000000', password: 'ValidPassword123!'})
      }),
      f.env,
      {}
    );
    assert.equal(failRes.status, 401);
  } finally {
    f.close();
  }
});

test('password reset rejects OTP issued for regular login with HTTP 403', async () => {
  const f = createFixture();
  try {
    f.sql
      .prepare('INSERT INTO users (email, password_salt, password_hash, password_iterations) VALUES (?, ?, ?, ?)')
      .run('mismatch@example.test', 'salt', 'hash', 100000);

    // Issue code via /api/auth/otp/request (purpose: 'login')
    await f.app.fetch(
      new Request('https://accounts.example/api/auth/otp/request', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'mismatch@example.test'})
      }),
      f.env,
      {}
    );

    const loginCode = f.sentEmails[0].text.match(/\d{6}/)[0];

    // Attempting to reset password with login code must fail with 403
    const resetRes = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/reset', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'mismatch@example.test', code: loginCode, password: 'ValidPassword123!'})
      }),
      f.env,
      {}
    );
    assert.equal(resetRes.status, 403);
    const body = await resetRes.json();
    assert.equal(body.error, 'Request a password reset code.');
  } finally {
    f.close();
  }
});

test('password reset enforces length limits between 8 and 128 characters', async () => {
  const f = createFixture();
  try {
    // Too short (< 8 chars)
    const shortRes = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/reset', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'val@example.test', code: '123456', password: 'short'})
      }),
      f.env,
      {}
    );
    assert.equal(shortRes.status, 400);
    assert.equal((await shortRes.json()).error, 'Password needs 8 to 128 characters.');

    // Too long (> 128 chars)
    const longRes = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/reset', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'val@example.test', code: '123456', password: 'a'.repeat(129)})
      }),
      f.env,
      {}
    );
    assert.equal(longRes.status, 400);
    assert.equal((await longRes.json()).error, 'Password needs 8 to 128 characters.');

    // Non-string
    const nonStringRes = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/reset', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'val@example.test', code: '123456', password: 12345678})
      }),
      f.env,
      {}
    );
    assert.equal(nonStringRes.status, 400);
    assert.equal((await nonStringRes.json()).error, 'Password needs 8 to 128 characters.');
  } finally {
    f.close();
  }
});

test('endpoints fail with HTTP 503 when mutations are disabled or email is unconfigured', async () => {
  const f = createFixture();
  try {
    // 1. STAGE_WRITES !== 'true'
    const readOnlyEnv = {...f.env, STAGE_WRITES: 'false'};
    const codeReadOnly = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/code', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'test@example.test'})
      }),
      readOnlyEnv,
      {}
    );
    assert.equal(codeReadOnly.status, 503);

    const resetReadOnly = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/reset', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'test@example.test', code: '123456', password: 'ValidPassword123!'})
      }),
      readOnlyEnv,
      {}
    );
    assert.equal(resetReadOnly.status, 503);

    // 2. ACCOUNT_MUTATIONS_ENABLED !== 'true'
    const noMutationsEnv = {...f.env, ACCOUNT_MUTATIONS_ENABLED: 'false'};
    const codeNoMutations = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/code', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'test@example.test'})
      }),
      noMutationsEnv,
      {}
    );
    assert.equal(codeNoMutations.status, 503);

    // 3. EMAIL binding unconfigured
    const noEmailEnv = {...f.env, EMAIL: null};
    const codeNoEmail = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/code', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'test@example.test'})
      }),
      noEmailEnv,
      {}
    );
    assert.equal(codeNoEmail.status, 503);
  } finally {
    f.close();
  }
});

test('endpoints reject malformed JSON or oversized request bodies', async () => {
  const f = createFixture();
  try {
    // Malformed JSON on code request
    const badJsonCode = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/code', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: '{bad_json'
      }),
      f.env,
      {}
    );
    assert.equal(badJsonCode.status, 400);

    // Oversized body on code request (> 1024 bytes)
    const bigCode = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/code', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'a'.repeat(1025) + '@example.test'})
      }),
      f.env,
      {}
    );
    assert.equal(bigCode.status, 413);

    // Malformed JSON on reset request
    const badJsonReset = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/reset', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: 'invalid_json}'
      }),
      f.env,
      {}
    );
    assert.equal(badJsonReset.status, 400);

    // Oversized body on reset request (> 2048 bytes)
    const bigReset = await f.app.fetch(
      new Request('https://accounts.example/api/auth/password/reset', {
        method: 'POST',
        headers: {Origin: 'https://accounts.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({email: 'user@example.test', code: '123456', password: 'x'.repeat(2100)})
      }),
      f.env,
      {}
    );
    assert.equal(bigReset.status, 413);
  } finally {
    f.close();
  }
});
