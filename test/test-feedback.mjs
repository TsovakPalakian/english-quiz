import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {
  saveFeedback,
  listFeedback,
  countFeedback,
  resolveFeedback,
  notifyFeedbackTelegram,
  checkFeedbackRateLimit,
  resetFeedbackRateLimitsForTests,
  resetFeedbackStoreForTests,
  defaultFeedbackLimitForRole,
  getUserFeedbackLimit,
  setUserFeedbackLimit,
  listUserFeedbackLimits,
  getFeedbackBreadcrumbsLimit,
  setFeedbackBreadcrumbsLimit,
  sortAttachmentsByType,
  DEFAULT_ROLE_FEEDBACK_LIMITS,
  DEFAULT_BREADCRUMBS_LIMIT
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
  )`);
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

  // Test reopening ticket
  const reopened = await resolveFeedback(db, saved.id, false);
  assert.equal(reopened, true);
  const activeAgain = await listFeedback(db, {resolved: 0});
  assert.equal(activeAgain.length, 1);
  assert.equal(activeAgain[0].resolved, false);

  const counts = await countFeedback(db);
  assert.equal(counts.open, 1);
  assert.equal(counts.resolved, 0);
  assert.equal(counts.total, 1);
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
  assert.equal(devJson.total, 1);
  assert.equal(devJson.counts.open, 1);
  assert.equal(devJson.counts.resolved, 0);

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
  assert.equal(emptyJson.total, 0);
  assert.equal(emptyJson.counts.open, 0);
  assert.equal(emptyJson.counts.resolved, 1);

  // 5b. GET /api/feedback?resolved=1 retrieves resolved ticket
  const resolvedGet = await worker.fetch(new Request('https://test.invalid/api/feedback?resolved=1'), env);
  const resolvedJson = await resolvedGet.json();
  assert.equal(resolvedJson.feedback.length, 1);
  assert.equal(resolvedJson.feedback[0].resolved, true);
  assert.equal(resolvedJson.total, 1);
  assert.equal(resolvedJson.counts.resolved, 1);

  // 5c. POST /api/feedback/resolve with resolved: false reopens ticket
  const reopenRes = await worker.fetch(new Request('https://test.invalid/api/feedback/resolve', {
    method: 'POST',
    headers: {Origin: 'https://test.invalid', 'Content-Type': 'application/json'},
    body: JSON.stringify({id: postJson.id, resolved: false})
  }), env);
  assert.equal(reopenRes.status, 200);

  const activeAfterReopen = await worker.fetch(new Request('https://test.invalid/api/feedback?resolved=0'), env);
  const activeJson = await activeAfterReopen.json();
  assert.equal(activeJson.feedback.length, 1);
  assert.equal(activeJson.feedback[0].resolved, false);

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

test('saveFeedback sanitizes malicious URL scheme and malformed screenshot', async () => {
  resetFeedbackStoreForTests();
  const db = memoryDb();

  const entry = await saveFeedback(db, {
    category: 'bug',
    message: 'Testing security sanitization',
    screenshot: "data:image/png;base64,invalid';alert(1)//",
    context: {
      url: 'javascript:alert(document.domain)'
    }
  });

  assert.equal(entry.url, '', 'Unsafe javascript: scheme should be normalized to empty string');
  assert.equal(entry.hasScreenshot, false, 'Unsafe malformed screenshot should be rejected');

  const rows = await db.read('SELECT url, screenshot_data FROM user_feedback WHERE id = ?', [entry.id]);
  assert.equal(rows[0].url, '');
  assert.equal(rows[0].screenshot_data, '');
});

test('role-based default feedback limits and dynamic rate limiter', () => {
  assert.equal(defaultFeedbackLimitForRole('DEVELOPER'), 20);
  assert.equal(defaultFeedbackLimitForRole('ADMIN'), 10);
  assert.equal(defaultFeedbackLimitForRole('USER'), 5);
  assert.equal(defaultFeedbackLimitForRole(null), 1);
  assert.equal(defaultFeedbackLimitForRole('ANONYMOUS'), 1);

  resetFeedbackRateLimitsForTests();
  const devKey = 'dev_user_1';
  const now = 1700000000000;

  // Developer allowed 20 requests
  for (let i = 0; i < 20; i++) {
    const res = checkFeedbackRateLimit(devKey, now + i * 10, 20);
    assert.equal(res.ok, true, `Request ${i + 1} should succeed for developer`);
    assert.equal(res.limit, 20);
  }
  const devBlocked = checkFeedbackRateLimit(devKey, now + 500, 20);
  assert.equal(devBlocked.ok, false, '21st request should be blocked for developer');

  // Student allowed 5 requests
  const studentKey = 'student_user_1';
  for (let i = 0; i < 5; i++) {
    const res = checkFeedbackRateLimit(studentKey, now + i * 10, 5);
    assert.equal(res.ok, true, `Request ${i + 1} should succeed for student`);
  }
  const studentBlocked = checkFeedbackRateLimit(studentKey, now + 500, 5);
  assert.equal(studentBlocked.ok, false, '6th request should be blocked for student');
});

test('custom user feedback limits and breadcrumbs limit persistence', async () => {
  const db = memoryDb();

  // Breadcrumbs limit default & set
  assert.equal(await getFeedbackBreadcrumbsLimit(db), 10);
  await setFeedbackBreadcrumbsLimit(db, 3);
  assert.equal(await getFeedbackBreadcrumbsLimit(db), 3);

  // User limits default & set
  assert.equal(await getUserFeedbackLimit(db, 'user_special'), null);
  await setUserFeedbackLimit(db, 'user_special', 50);
  assert.equal(await getUserFeedbackLimit(db, 'user_special'), 50);

  const limits = await listUserFeedbackLimits(db);
  assert.equal(limits.user_special, 50);

  // Remove limit
  await setUserFeedbackLimit(db, 'user_special', null);
  assert.equal(await getUserFeedbackLimit(db, 'user_special'), null);

  // Save feedback respects configured breadcrumbs limit of 3
  resetFeedbackStoreForTests();
  const entry = await saveFeedback(db, {
    category: 'idea',
    message: 'Test custom breadcrumbs limit',
    context: {
      breadcrumbs: [
        {ago: '50s ago', action: 'click', details: '1'},
        {ago: '40s ago', action: 'click', details: '2'},
        {ago: '30s ago', action: 'click', details: '3'},
        {ago: '20s ago', action: 'click', details: '4'},
        {ago: '10s ago', action: 'click', details: '5'}
      ]
    },
    breadcrumbsLimit: 3
  });

  assert.equal(entry.breadcrumbs.length, 3);
  assert.equal(entry.breadcrumbs[0].details, '3');
  assert.equal(entry.breadcrumbs[2].details, '5');
});

test('multi-file attachments, type sorting and 25MB validation', async () => {
  resetFeedbackStoreForTests();
  const db = memoryDb();

  const unsorted = [
    {name: 'archive.zip', mime: 'application/zip', size: 500},
    {name: 'photo.jpg', mime: 'image/jpeg', size: 1200},
    {name: 'notes.txt', mime: 'text/plain', size: 300},
    {name: 'recording.mp3', mime: 'audio/mpeg', size: 4000},
    {name: 'document.pdf', mime: 'application/pdf', size: 2500}
  ];

  const sorted = sortAttachmentsByType(unsorted);
  assert.equal(sorted[0].name, 'photo.jpg');     // image
  assert.equal(sorted[1].name, 'recording.mp3'); // audio
  assert.equal(sorted[2].name, 'document.pdf');  // pdf
  assert.equal(sorted[3].name, 'notes.txt');     // text
  assert.equal(sorted[4].name, 'archive.zip');   // archive

  const entry = await saveFeedback(db, {
    category: 'bug',
    message: 'Report with multiple files',
    attachments: unsorted
  });

  assert.equal(entry.attachments.length, 5);
  assert.equal(entry.attachments[0].name, 'photo.jpg');

  const list = await listFeedback(db, {resolved: 0});
  assert.equal(list[0].attachments.length, 5);
  assert.equal(list[0].attachments[0].mime, 'image/jpeg');

  // Exceeding 25 MiB throws 413
  await assert.rejects(
    async () => {
      await saveFeedback(db, {
        category: 'bug',
        message: 'Oversized file',
        attachments: [{name: 'big.iso', mime: 'application/octet-stream', size: 26 * 1024 * 1024}]
      });
    },
    err => err.status === 413
  );
});

test('integrated worker feedback settings, custom limit override and multi-file endpoints', async () => {
  resetFeedbackStoreForTests();
  const db = memoryDb();
  let currentUser = {id: 'dev_user', login: 'developer_1', role: 'DEVELOPER'};

  const env = {
    DB: {prepare: () => ({bind: () => ({all: async () => ({results: []}), first: async () => null})})},
    STAGE_ENABLED: 'true',
    STAGE_ALLOWED_HOST: 'test.invalid',
    ACCOUNT_QUERY_LIMIT_ENABLED: 'false',
    STUDY_DATABASE: db,
    MEDIA: {
      get: async (key) => null,
      put: async (key, bytes) => ({})
    }
  };

  const worker = integratedWorker({
    authenticate: async () => currentUser,
    studyDatabase: () => db
  });

  // 1. GET /api/feedback/settings allowed for DEVELOPER
  const getSettings = await worker.fetch(new Request('https://test.invalid/api/feedback/settings'), env);
  assert.equal(getSettings.status, 200);
  const settingsJson = await getSettings.json();
  assert.equal(settingsJson.breadcrumbsLimit, 10);
  assert.equal(settingsJson.defaultLimits.DEVELOPER, 20);

  // 2. POST /api/feedback/settings denied for USER
  currentUser = {id: 'student_1', login: 'student_user', role: 'USER'};
  const deniedSettings = await worker.fetch(new Request('https://test.invalid/api/feedback/settings', {
    method: 'POST',
    headers: {Origin: 'https://test.invalid', 'Content-Type': 'application/json'},
    body: JSON.stringify({breadcrumbsLimit: 5})
  }), env);
  assert.equal(deniedSettings.status, 403);

  // 3. POST /api/feedback/settings allowed for DEVELOPER
  currentUser = {id: 'dev_user', login: 'developer_1', role: 'DEVELOPER'};
  const saveSettings = await worker.fetch(new Request('https://test.invalid/api/feedback/settings', {
    method: 'POST',
    headers: {Origin: 'https://test.invalid', 'Content-Type': 'application/json'},
    body: JSON.stringify({breadcrumbsLimit: 7})
  }), env);
  assert.equal(saveSettings.status, 200);
  const saveJson = await saveSettings.json();
  assert.equal(saveJson.breadcrumbsLimit, 7);

  // 4. POST /api/feedback/limit sets custom limit for student_1
  const setLimitRes = await worker.fetch(new Request('https://test.invalid/api/feedback/limit', {
    method: 'POST',
    headers: {Origin: 'https://test.invalid', 'Content-Type': 'application/json'},
    body: JSON.stringify({userId: 'student_1', limit: 2})
  }), env);
  assert.equal(setLimitRes.status, 200);

  // 5. student_1 sends feedback: custom limit = 2
  currentUser = {id: 'student_1', login: 'student_user', role: 'USER'};
  resetFeedbackRateLimitsForTests();

  const makePost = (msg = 'Test message') => worker.fetch(new Request('https://test.invalid/api/feedback', {
    method: 'POST',
    headers: {Origin: 'https://test.invalid', 'Content-Type': 'application/json'},
    body: JSON.stringify({category: 'bug', message: msg})
  }), env);

  const post1 = await makePost('First message');
  assert.equal(post1.status, 200);

  const post2 = await makePost('Second message');
  assert.equal(post2.status, 200);

  const post3 = await makePost('Third message');
  assert.equal(post3.status, 429, '3rd request should hit custom limit of 2');
  const err3 = await post3.json();
  assert.ok(err3.error.includes('Лимит отправки отзывов исчерпан (2 в час'), 'Error should cite custom limit of 2');

  // 6. Multi-file feedback submission
  currentUser = {id: 'dev_user', login: 'developer_1', role: 'DEVELOPER'};
  resetFeedbackRateLimitsForTests();

  const multiFilePost = await worker.fetch(new Request('https://test.invalid/api/feedback', {
    method: 'POST',
    headers: {Origin: 'https://test.invalid', 'Content-Type': 'application/json'},
    body: JSON.stringify({
      category: 'bug',
      message: 'Bug with two files',
      attachments: [
        {name: 'test.log', mime: 'text/plain', size: 100, dataUrl: 'data:text/plain;base64,dGVzdA=='},
        {name: 'shot.png', mime: 'image/png', size: 200, dataUrl: 'data:image/png;base64,iVBORw0KGgo='}
      ]
    })
  }), env);

  assert.equal(multiFilePost.status, 200);
  const multiJson = await multiFilePost.json();
  assert.ok(multiJson.id);

  // Check GET /api/feedback reflects attachments and userLimits
  const getFeedback = await worker.fetch(new Request('https://test.invalid/api/feedback'), env);
  assert.equal(getFeedback.status, 200);
  const feedJson = await getFeedback.json();
  assert.equal(feedJson.userLimits.student_1, 2);
  assert.equal(feedJson.breadcrumbsLimit, 7);
  const found = feedJson.feedback.find(f => f.id === multiJson.id);
  assert.ok(found);
  assert.equal(found.attachments.length, 2);
  assert.equal(found.attachments[0].name, 'shot.png'); // image sorted first
  assert.equal(found.attachments[1].name, 'test.log'); // text sorted second
});
