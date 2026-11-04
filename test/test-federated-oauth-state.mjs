import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {FederatedOAuthState} from '../src/federated-oauth-state.mjs';
import {StudyError} from '../src/learning-study.mjs';

function createFixture(origin = 'https://app.lumiscia.test', provider = 'microsoft', label = 'Microsoft') {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE catalog_documents (
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      PRIMARY KEY (namespace, key)
    )
  `);

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
      const cleanArgs = args.map(cleanArg);
      return sql.prepare(query).all(...cleanArgs);
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

  const service = new FederatedOAuthState(db, origin, provider, label);
  return {sql, db, service, origin, provider, label};
}

test('start generates valid 43-character base64url token, nonce and verifier with 10-minute TTL', async () => {
  const f = createFixture();
  try {
    const before = Date.now();
    const {token, state} = await f.service.start('invite-123', 'user-ip-1');
    const after = Date.now();

    assert.equal(typeof token, 'string');
    assert.equal(/^[A-Za-z0-9_-]{43}$/.test(token), true);
    assert.equal(state.kind, 'authorize');
    assert.equal(state.invite, 'invite-123');
    assert.equal(/^[A-Za-z0-9_-]{43}$/.test(state.nonce), true);
    assert.equal(/^[A-Za-z0-9_-]{43}$/.test(state.verifier), true);

    const row = await f.service.row('microsoft-flows', token);
    assert.ok(row);
    assert.equal(row.value.origin, f.origin);
    assert.equal(row.value.kind, 'authorize');
    assert.ok(row.value.expiresAt >= before + 10 * 60 * 1000);
    assert.ok(row.value.expiresAt <= after + 10 * 60 * 1000);
  } finally {
    f.sql.close();
  }
});

test('start enforces 60 requests per minute rate limiting per rateKey', async () => {
  const f = createFixture();
  try {
    for (let i = 0; i < 60; i++) {
      const res = await f.service.start('invite', 'client-ip-bound');
      assert.ok(res.token);
    }

    // 61st request fails with HTTP 429
    await assert.rejects(
      f.service.start('invite', 'client-ip-bound'),
      (err) =>
        err instanceof StudyError &&
        err.status === 429 &&
        err.message === 'Too many Microsoft sign-in requests. Try again shortly.'
    );

    // Different rate key is unaffected
    const other = await f.service.start('invite', 'other-client-ip');
    assert.ok(other.token);
  } finally {
    f.sql.close();
  }
});

test('start purges expired flows on new flow creation', async () => {
  const f = createFixture();
  try {
    // Insert an expired flow
    f.sql
      .prepare('INSERT INTO catalog_documents (namespace, key, value_json) VALUES (?, ?, ?)')
      .run(
        'microsoft-flows',
        'expired_token_123456789012345678901234567890',
        JSON.stringify({kind: 'authorize', origin: f.origin, expiresAt: Date.now() - 5000})
      );

    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM catalog_documents WHERE namespace=?').get('microsoft-flows').n, 1);

    await f.service.start('invite', 'ip-cleanup');

    // Expired flow deleted, new flow and rate limiter record present
    const rows = f.sql.prepare('SELECT key FROM catalog_documents WHERE namespace=?').all('microsoft-flows');
    assert.equal(rows.some((r) => r.key === 'expired_token_123456789012345678901234567890'), false);
  } finally {
    f.sql.close();
  }
});

test('peek rejects malformed token strings with HTTP 400', async () => {
  const f = createFixture();
  try {
    for (const invalid of ['', 'short', 'token_with_plus+sign_and_slash/is_invalid_!', null, undefined, 12345]) {
      await assert.rejects(
        f.service.peek(invalid, 'authorize'),
        (err) => err instanceof StudyError && err.status === 400 && err.message === 'Start Microsoft sign-in again.'
      );
    }
  } finally {
    f.sql.close();
  }
});

test('peek rejects non-existent, expired, wrong-kind or mismatched-origin tokens with HTTP 410', async () => {
  const f = createFixture();
  try {
    const {token} = await f.service.start('inv', 'ip');

    // Wrong kind
    await assert.rejects(
      f.service.peek(token, 'email'),
      (err) => err instanceof StudyError && err.status === 410 && err.message === 'Microsoft sign-in expired. Start again.'
    );

    // Non-existent token (valid 43-char format)
    const ghost = 'A'.repeat(43);
    await assert.rejects(
      f.service.peek(ghost, 'authorize'),
      (err) => err instanceof StudyError && err.status === 410 && err.message === 'Microsoft sign-in expired. Start again.'
    );

    // Mismatched origin
    const foreignService = new FederatedOAuthState(f.db, 'https://other-origin.test');
    await assert.rejects(
      foreignService.peek(token, 'authorize'),
      (err) => err instanceof StudyError && err.status === 410 && err.message === 'Microsoft sign-in expired. Start again.'
    );

    // Expired token
    f.sql
      .prepare('UPDATE catalog_documents SET value_json=? WHERE namespace=? AND key=?')
      .run(
        JSON.stringify({kind: 'authorize', origin: f.origin, expiresAt: Date.now() - 1000}),
        'microsoft-flows',
        token
      );
    await assert.rejects(
      f.service.peek(token, 'authorize'),
      (err) => err instanceof StudyError && err.status === 410 && err.message === 'Microsoft sign-in expired. Start again.'
    );
  } finally {
    f.sql.close();
  }
});

test('consume successfully returns state and prevents token replay', async () => {
  const f = createFixture();
  try {
    const {token} = await f.service.start('invite-pass', 'ip-pass');
    const consumed = await f.service.consume(token, 'authorize');
    assert.equal(consumed.invite, 'invite-pass');
    assert.equal(consumed.kind, 'authorize');

    // Second consumption must fail with 410 (token deleted)
    await assert.rejects(
      f.service.consume(token, 'authorize'),
      (err) => err instanceof StudyError && err.status === 410 && err.message === 'Microsoft sign-in expired. Start again.'
    );
  } finally {
    f.sql.close();
  }
});

test('consume detects CAS race condition via guard and throws HTTP 409', async () => {
  const f = createFixture();
  try {
    const {token} = await f.service.start('invite-race', 'ip-race');

    // Peek the token to read its current raw state
    const row = await f.service.peek(token, 'authorize');

    // Simulate concurrent modification in database before consume finishes
    f.sql
      .prepare('UPDATE catalog_documents SET value_json=? WHERE namespace=? AND key=?')
      .run(
        JSON.stringify({...row.value, invite: 'tampered-concurrently'}),
        'microsoft-flows',
        token
      );

    // Attempting atomic consume with stale row.raw fails guard check
    await assert.rejects(
      f.service.atomic([
        f.service.guard('microsoft-flows', token, row.raw),
        {sql: 'DELETE FROM catalog_documents WHERE namespace=? AND key=?', args: ['microsoft-flows', token]}
      ]),
      (err) =>
        err instanceof StudyError &&
        err.status === 409 &&
        err.message === 'Microsoft sign-in changed. Start again.'
    );
  } finally {
    f.sql.close();
  }
});

test('setEmail modifies email flow payload', async () => {
  const f = createFixture();
  try {
    // Seed an email stage flow
    const token = 'E'.repeat(43);
    await f.service.save('microsoft-flows', token, {
      kind: 'email',
      origin: f.origin,
      expiresAt: Date.now() + 600000
    });

    await f.service.setEmail(token, 'student@example.test');

    const peeked = await f.service.peek(token, 'email');
    assert.equal(peeked.value.email, 'student@example.test');
  } finally {
    f.sql.close();
  }
});

test('link and identity manage account associations idempotently and prevent conflicts', async () => {
  const f = createFixture();
  try {
    const subject = 'sub-ms-12345';
    assert.equal(await f.service.identity(subject), null);

    // First link
    await f.service.link(subject, {accountId: 10, registrationId: 5});
    const id = await f.service.identity(subject);
    assert.equal(id.accountId, 10);
    assert.equal(id.registrationId, 5);
    assert.ok(id.createdAt > 0);

    // Idempotent re-link with same parameters succeeds
    await f.service.link(subject, {accountId: 10, registrationId: 5});

    // Conflict with different accountId throws 409
    await assert.rejects(
      f.service.link(subject, {accountId: 99, registrationId: 5}),
      (err) =>
        err instanceof StudyError &&
        err.status === 409 &&
        err.message === 'This Microsoft account is already connected.'
    );

    // Conflict with different registrationId throws 409
    await assert.rejects(
      f.service.link(subject, {accountId: 10, registrationId: 99}),
      (err) =>
        err instanceof StudyError &&
        err.status === 409 &&
        err.message === 'This Microsoft account is already connected.'
    );
  } finally {
    f.sql.close();
  }
});

test('approved updates accountId for matching registrationId across identities', async () => {
  const f = createFixture();
  try {
    await f.service.link('subject-a', {registrationId: 42});
    await f.service.link('subject-b', {registrationId: 42});
    await f.service.link('subject-c', {registrationId: 99});

    await f.service.approved(42, 100);

    const idA = await f.service.identity('subject-a');
    const idB = await f.service.identity('subject-b');
    const idC = await f.service.identity('subject-c');

    assert.equal(idA.accountId, 100);
    assert.equal(idB.accountId, 100);
    assert.equal(idC.accountId, undefined);
  } finally {
    f.sql.close();
  }
});

test('removeAccount deletes identities matching accountId', async () => {
  const f = createFixture();
  try {
    await f.service.link('sub-1', {accountId: 50, registrationId: 1});
    await f.service.link('sub-2', {accountId: 50, registrationId: 2});
    await f.service.link('sub-3', {accountId: 70, registrationId: 3});

    await f.service.removeAccount(50);

    assert.equal(await f.service.identity('sub-1'), null);
    assert.equal(await f.service.identity('sub-2'), null);
    assert.ok(await f.service.identity('sub-3'));
  } finally {
    f.sql.close();
  }
});

test('supports alternative OAuth providers with custom labels and namespaces', async () => {
  const f = createFixture('https://app.lumiscia.test', 'telegram', 'Telegram');
  try {
    assert.equal(f.service.flows, 'telegram-flows');
    assert.equal(f.service.identities, 'telegram-identities');

    const {token} = await f.service.start('invite-tg', 'tg-ip');
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM catalog_documents WHERE namespace=?').get('telegram-flows').n, 2);

    // Error message uses custom label 'Telegram'
    await assert.rejects(
      f.service.peek('short_invalid', 'authorize'),
      (err) => err instanceof StudyError && err.status === 400 && err.message === 'Start Telegram sign-in again.'
    );
  } finally {
    f.sql.close();
  }
});
