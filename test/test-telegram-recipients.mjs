import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {
  getTelegramRecipients,
  setTelegramRecipients,
  testTelegramRecipient,
  notifyFeedbackTelegram
} from '../src/feedback.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';

const plain = value => value && typeof value === 'object' && 'type' in value ? value.value : value;

function memoryDb() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE IF NOT EXISTS catalog_documents (
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );`);
  sql.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    login TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    active INTEGER NOT NULL DEFAULT 1,
    is_personal_data_revoked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );`);

  return {
    async read(query, params = []) {
      const stmt = sql.prepare(query);
      return stmt.all(...params.map(plain));
    },
    async atomic(statements = []) {
      for (const s of statements) {
        const stmt = sql.prepare(s.sql);
        const args = (s.args || s.params || []).map(plain);
        stmt.run(...args);
      }
    }
  };
}

test('getTelegramRecipients and setTelegramRecipients lifecycle in database', async () => {
  const db = memoryDb();

  const initial = await getTelegramRecipients(db);
  assert.deepEqual(initial, []);

  const saved = await setTelegramRecipients(db, [
    { chatId: '1308341417', label: 'Primary Dev', status: 'active' },
    { chatId: '-100987654321', label: 'Support Group', status: 'disabled' }
  ]);

  assert.equal(saved.length, 2);
  assert.equal(saved[0].chatId, '1308341417');
  assert.equal(saved[0].label, 'Primary Dev');
  assert.equal(saved[0].status, 'active');
  assert.ok(saved[0].id);

  assert.equal(saved[1].chatId, '-100987654321');
  assert.equal(saved[1].status, 'disabled');

  const loaded = await getTelegramRecipients(db);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].chatId, '1308341417');
  assert.equal(loaded[1].chatId, '-100987654321');

  // Rejects invalid non-numeric chatId
  await assert.rejects(
    setTelegramRecipients(db, [{ chatId: 'invalid_chat_id', label: 'Bad' }]),
    /Invalid numeric Chat ID/
  );
});

test('notifyFeedbackTelegram delivers to all active recipients from db', async () => {
  const db = memoryDb();
  await setTelegramRecipients(db, [
    { chatId: '111111', label: 'Dev 1', status: 'active' },
    { chatId: '222222', label: 'Dev 2', status: 'active' },
    { chatId: '333333', label: 'Disabled Dev', status: 'disabled' }
  ]);

  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };

  const env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    TELEGRAM_CHAT_ID: '999999' // fallback, should NOT be used because active recipients exist
  };

  const entry = {
    id: 'fb_multi_1',
    category: 'bug',
    message: 'Bug reported for multi recipient',
    userLogin: 'student1'
  };

  const sent = await notifyFeedbackTelegram(env, entry, { fetchImpl: mockFetch, db });
  assert.equal(sent, true);
  assert.equal(calls.length, 2);
  const deliveredChats = calls.map(c => c.body.chat_id).sort();
  assert.deepEqual(deliveredChats, ['111111', '222222']);
});

test('testTelegramRecipient sends verification message', async () => {
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };

  const env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
  };

  const res = await testTelegramRecipient(env, '1308341417', { fetchImpl: mockFetch });
  assert.equal(res, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.chat_id, '1308341417');
  assert.ok(calls[0].body.text.includes('Lumiscia Telegram Alert Test'));

  // Fails on invalid chatId
  await assert.rejects(
    testTelegramRecipient(env, 'abc', { fetchImpl: mockFetch }),
    /Invalid numeric Telegram Chat ID/
  );
});

test('integrated worker /api/feedback/telegram-recipients and test endpoints', async () => {
  const db = memoryDb();
  let currentUser = { id: 'u_student', login: 'student_alice', email: 'student@test.invalid', role: 'USER' };

  const env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    TELEGRAM_CHAT_ID: '987654321',
    STAGE_ENABLED: 'true',
    STAGE_ALLOWED_HOST: 'test.invalid',
    ACCOUNT_QUERY_LIMIT_ENABLED: 'false',
    DB: {
      prepare() { throw new Error('Account SQL not used'); }
    }
  };

  const worker = integratedWorker({
    authenticate: async () => currentUser,
    studyDatabase: () => db
  });

  // Non-developer role is rejected (403)
  const forbiddenReq = await worker.fetch(new Request('https://test.invalid/api/feedback/telegram-recipients'), env);
  assert.equal(forbiddenReq.status, 403);

  // Switch to DEVELOPER role
  currentUser = { id: 'u_dev', login: 'lead_dev', email: 'dev@test.invalid', role: 'DEVELOPER' };

  // Developer can read empty list with fallback
  const getReq = await worker.fetch(new Request('https://test.invalid/api/feedback/telegram-recipients'), env);
  assert.equal(getReq.status, 200);
  const getJson = await getReq.json();
  assert.deepEqual(getJson.recipients, []);
  assert.equal(getJson.fallbackChatId, '987654321');

  // Developer can save new recipients
  const postReq = await worker.fetch(new Request('https://test.invalid/api/feedback/telegram-recipients', {
    method: 'POST',
    headers: { Origin: 'https://test.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipients: [
        { chatId: '1308341417', label: 'Dev Lead', status: 'active' },
        { chatId: '-100123456789', label: 'Team Supergroup', status: 'active' }
      ]
    })
  }), env);
  assert.equal(postReq.status, 200);
  const postJson = await postReq.json();
  assert.equal(postJson.ok, true);
  assert.equal(postJson.recipients.length, 2);

  // Verify GET returns updated list
  const getUpdated = await worker.fetch(new Request('https://test.invalid/api/feedback/telegram-recipients'), env);
  const updatedJson = await getUpdated.json();
  assert.equal(updatedJson.recipients.length, 2);
  assert.equal(updatedJson.recipients[0].chatId, '1308341417');
  assert.equal(updatedJson.recipients[1].chatId, '-100123456789');
});

test('preview.html and preview.js include Telegram alerts tab and view', () => {
  const html = readFileSync(new URL('../site/preview.html', import.meta.url), 'utf8');
  assert.ok(html.includes('data-bug-tab="telegram"'), 'site/preview.html must include data-bug-tab="telegram" button');
  assert.ok(html.includes('Telegram alerts'), 'site/preview.html must have Telegram alerts label');

  const js = readFileSync(new URL('../preview.js', import.meta.url), 'utf8');
  assert.ok(js.includes('paintTelegramRecipientsView'), 'preview.js must include paintTelegramRecipientsView');
  assert.ok(js.includes('/api/feedback/telegram-recipients'), 'preview.js must fetch /api/feedback/telegram-recipients');
  assert.ok(js.includes('/api/feedback/telegram-test'), 'preview.js must post to /api/feedback/telegram-test');
});
