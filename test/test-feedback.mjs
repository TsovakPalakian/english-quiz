import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {
  saveFeedback,
  listFeedback,
  resolveFeedback,
  notifyFeedbackTelegram,
  checkFeedbackRateLimit,
  resetFeedbackRateLimitsForTests,
  resetFeedbackStoreForTests
} from '../src/feedback.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';

const plain = value => value && typeof value === 'object' && 'type' in value ? value.value : value;

function memoryDb() {
  const sql = new DatabaseSync(':memory:');
  return {
    sql,
    async read(query, args = []) {
      return sql.prepare(query).all(...args);
    },
    async atomic(commands) {
      sql.exec('BEGIN');
      try {
        for (const c of commands) {
          sql.prepare(c.sql).run(...(c.args || []).map(plain));
        }
        sql.exec('COMMIT');
      } catch (err) {
        sql.exec('ROLLBACK');
        throw err;
      }
    }
  };
}

test('saveFeedback writes report with screenshot, user info, and context', async () => {
  resetFeedbackStoreForTests();
  const db = memoryDb();

  const entry = await saveFeedback(db, {
    category: 'bug',
    message: 'Constellation figure is misaligned on mobile screen',
    screenshot: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vuUAAA=',
    user: {id: 'usr_123', login: 'alex', email: 'alex@example.org'},
    context: {
      url: 'https://lumiscia.org/days',
      viewport: {width: 390, height: 844, dpr: 3},
      userAgent: 'Mozilla/5.0 Mobile',
      recentErrors: [{message: 'Uncaught TypeError'}],
      breadcrumbs: [
        {ago: '15s ago', action: 'click', details: 'button#btnStart: Start'},
        {ago: '2s ago', action: 'click', details: 'button#feedbackOpen: 💬'}
      ]
    }
  });

  assert.ok(entry.id.startsWith('fb_'));
  assert.equal(entry.category, 'bug');
  assert.equal(entry.hasScreenshot, true);
  assert.equal(entry.userLogin, 'alex');
  assert.equal(entry.userEmail, 'alex@example.org');
  assert.equal(entry.breadcrumbs.length, 2);

  const list = await listFeedback(db, {resolved: 0});
  assert.equal(list.length, 1);
  assert.equal(list[0].id, entry.id);
  assert.equal(list[0].message, 'Constellation figure is misaligned on mobile screen');
  assert.ok(list[0].screenshot.startsWith('data:image/webp;base64,'));
  assert.equal(list[0].deviceInfo.viewport.width, 390);
  assert.equal(list[0].deviceInfo.breadcrumbs.length, 2);
  assert.equal(list[0].deviceInfo.breadcrumbs[0].action, 'click');
  assert.equal(list[0].resolved, false);
});

test('resolveFeedback updates resolved status and timestamp', async () => {
  resetFeedbackStoreForTests();
  const db = memoryDb();

  const saved = await saveFeedback(db, {
    category: 'idea',
    message: 'Add dark mode toggle to the login sky view',
    contact: 'guest@test.org'
  });

  const activeBefore = await listFeedback(db, {resolved: 0});
  assert.equal(activeBefore.length, 1);

  const ok = await resolveFeedback(db, saved.id);
  assert.equal(ok, true);

  const activeAfter = await listFeedback(db, {resolved: 0});
  assert.equal(activeAfter.length, 0);

  const resolvedList = await listFeedback(db, {resolved: 1});
  assert.equal(resolvedList.length, 1);
  assert.equal(resolvedList[0].id, saved.id);
  assert.equal(resolvedList[0].resolved, true);
  assert.ok(resolvedList[0].resolvedAt > 0);
});

test('notifyFeedbackTelegram sends photo when screenshot is attached', async () => {
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({url, method: opts.method, body: opts.body});
    return {ok: true, json: async () => ({ok: true})};
  };

  const env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    TELEGRAM_CHAT_ID: '-100987654321'
  };

  const entry = {
    id: 'fb_test_1',
    category: 'bug',
    message: 'Audio player is broken',
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    userLogin: 'tester',
    url: 'https://lumiscia.org/',
    breadcrumbs: [
      {ago: '4s ago', action: 'click', details: 'button: Play'}
    ]
  };

  const sent = await notifyFeedbackTelegram(env, entry, {fetchImpl: mockFetch});
  assert.equal(sent, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/sendPhoto'));
  assert.ok(calls[0].body instanceof FormData);
  assert.equal(calls[0].body.get('chat_id'), '-100987654321');
  assert.ok(calls[0].body.get('caption').includes('🐞 ОШИБКА от @tester'));
  assert.ok(calls[0].body.get('caption').includes('Действия пользователя'));
  assert.ok(calls[0].body.get('caption').includes('button: Play'));
});

test('notifyFeedbackTelegram falls back to sendMessage when no screenshot', async () => {
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({url, method: opts.method, headers: opts.headers, body: JSON.parse(opts.body)});
    return {ok: true, json: async () => ({ok: true})};
  };

  const env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    TELEGRAM_CHAT_ID: '987654'
  };

  const entry = {
    id: 'fb_test_2',
    category: 'idea',
    message: 'Add German language support',
    screenshot: '',
    userEmail: 'student@example.org'
  };

  const sent = await notifyFeedbackTelegram(env, entry, {fetchImpl: mockFetch});
  assert.equal(sent, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/sendMessage'));
  assert.equal(calls[0].body.chat_id, '987654');
  assert.ok(calls[0].body.text.includes('💡 ИДЕЯ / ПРЕДЛОЖЕНИЕ от student@example.org'));
});

test('integrated worker /api/feedback endpoints', async () => {
  resetFeedbackStoreForTests();
  const db = memoryDb();
  let currentRole = 'USER';
  let currentUser = {id: 'u_1', login: 'student_tester', role: currentRole, email: 'student@test.org'};

  const worker = integratedWorker({
    authenticate: async () => currentUser,
    studyDatabase: () => db
  });

  const env = {
    DB: {prepare() { throw new Error('Account SQL not used'); }},
    STAGE_ENABLED: 'true',
    STAGE_ALLOWED_HOST: 'test.invalid',
    ACCOUNT_QUERY_LIMIT_ENABLED: 'false'
  };

  // 1. Submit feedback as user
  const postRes = await worker.fetch(new Request('https://test.invalid/api/feedback', {
    method: 'POST',
    headers: {Origin: 'https://test.invalid', 'Content-Type': 'application/json'},
    body: JSON.stringify({
      category: 'bug',
      message: 'Test button is unresponsive',
      screenshot: 'data:image/webp;base64,dGVzdA==',
      contact: 'reporter@test.org',
      context: {url: 'https://test.invalid/home'}
    })
  }), env);

  assert.equal(postRes.status, 200);
  const postJson = await postRes.json();
  assert.equal(postJson.ok, true);
  assert.ok(postJson.id.startsWith('fb_'));

  // 2. Reject empty message (reset rate limits for test)
  resetFeedbackRateLimitsForTests();
  const emptyRes = await worker.fetch(new Request('https://test.invalid/api/feedback', {
    method: 'POST',
    headers: {Origin: 'https://test.invalid', 'Content-Type': 'application/json'},
    body: JSON.stringify({message: '   '})
  }), env);
  assert.equal(emptyRes.status, 400);

  // 3. GET /api/feedback denied for USER
  const deniedGet = await worker.fetch(new Request('https://test.invalid/api/feedback'), env);
  assert.equal(deniedGet.status, 403);

  // 4. GET /api/feedback allowed for DEVELOPER
  currentUser.role = 'DEVELOPER';
  const devGet = await worker.fetch(new Request('https://test.invalid/api/feedback'), env);
  assert.equal(devGet.status, 200);
  const devJson = await devGet.json();
  assert.equal(devJson.feedback.length, 1);
  assert.equal(devJson.feedback[0].id, postJson.id);
  assert.equal(devJson.feedback[0].userLogin, 'student_tester');

  // 5. POST /api/feedback/resolve marks ticket resolved
  const resolveRes = await worker.fetch(new Request('https://test.invalid/api/feedback/resolve', {
    method: 'POST',
    headers: {Origin: 'https://test.invalid', 'Content-Type': 'application/json'},
    body: JSON.stringify({id: postJson.id})
  }), env);
  assert.equal(resolveRes.status, 200);

  const emptyAfter = await worker.fetch(new Request('https://test.invalid/api/feedback'), env);
  const emptyJson = await emptyAfter.json();
  assert.equal(emptyJson.feedback.length, 0);

  // 6. Rate-limit enforcement (max 1 request per hour per IP/user)
  resetFeedbackRateLimitsForTests();
  const makePost = (ip) => worker.fetch(new Request('https://test.invalid/api/feedback', {
    method: 'POST',
    headers: {Origin: 'https://test.invalid', 'Content-Type': 'application/json', 'CF-Connecting-IP': ip},
    body: JSON.stringify({category: 'bug', message: 'Rate limit test'})
  }), env);

  currentUser = null; // Test as unauthenticated guest
  const res1 = await makePost('198.51.100.22');
  assert.equal(res1.status, 200, 'First request should succeed');

  const blockedRes = await makePost('198.51.100.22');
  assert.equal(blockedRes.status, 429, 'Second request from same IP within hour should be blocked with 429');
  const blockedJson = await blockedRes.json();
  assert.ok(blockedJson.error.includes('не чаще одного раза в час'), 'Error message should state 1 per hour limit');

  // Other IP still allowed
  const otherIpRes = await makePost('198.51.100.23');
  assert.equal(otherIpRes.status, 200, 'Different IP should succeed');
});

test('checkFeedbackRateLimit allows 1 per hour and blocks 2nd with retry time', () => {
  resetFeedbackRateLimitsForTests();
  const key = 'test_ip_1';
  const start = 1700000000000;

  const res1 = checkFeedbackRateLimit(key, start);
  assert.equal(res1.ok, true);
  assert.equal(res1.remaining, 0);

  const blocked = checkFeedbackRateLimit(key, start + 300000); // 5 min later
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 3600);

  // Window expires after 1 hour (3,600,001 ms)
  const afterWindow = checkFeedbackRateLimit(key, start + 3600001);
  assert.equal(afterWindow.ok, true);
});
