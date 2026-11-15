import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../server/server.js';

function makeRequest(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const isHeaders = options && typeof options === 'object' && !options.headers && !options.method;
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || (isHeaders ? options : {})
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test('Speakout Standalone Server & Streaming API', async (t) => {
  let server;
  let port;

  t.before(async () => {
    process.env.SPEAKOUT_STUDENT_PASSWORD = 'test-student-secret-2022';
    server = createServer();
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  await t.test('GET / serves index.html with 200 OK', async () => {
    const res = await makeRequest(port, '/');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /Lesson 1A: Hello/);
  });

  await t.test('GET /api/speakout/manifest returns valid JSON manifest', async () => {
    const res = await makeRequest(port, '/api/speakout/manifest');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    const data = JSON.parse(res.body);
    assert.equal(data.lessonId, '1A');
    assert.equal(data.level, 'A1');
  });

  await t.test('GET /api/speakout/audio?track=1.01 streams full audio with 200 OK', async () => {
    const res = await makeRequest(port, '/api/speakout/audio?track=1.01');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'audio/mpeg');
    assert.equal(res.headers['accept-ranges'], 'bytes');
    assert.ok(parseInt(res.headers['content-length'], 10) > 10000);
  });

  await t.test('GET /api/speakout/audio?track=1.01 with Range header returns 206 Partial Content', async () => {
    const res = await makeRequest(port, '/api/speakout/audio?track=1.01', {
      range: 'bytes=0-1023'
    });
    assert.equal(res.statusCode, 206);
    assert.equal(res.headers['content-type'], 'audio/mpeg');
    assert.match(res.headers['content-range'], /^bytes 0-1023\/\d+/);
    assert.equal(res.headers['content-length'], '1024');
  });

  await t.test('GET /api/speakout/audio with non-existent track returns 404', async () => {
    const res = await makeRequest(port, '/api/speakout/audio?track=invalid_non_existent');
    assert.equal(res.statusCode, 404);
    const data = JSON.parse(res.body);
    assert.ok(data.error);
  });

  await t.test('GET /api/speakout/audio with malformed Range returns 416 Range Not Satisfiable', async () => {
    const res = await makeRequest(port, '/api/speakout/audio?track=1.01', {
      range: 'bytes=abc-def'
    });
    assert.equal(res.statusCode, 416);
    assert.match(res.headers['content-range'], /^bytes \*\/\d+/);
  });

  await t.test('GET /api/speakout/audio with out-of-bounds Range returns 416 Range Not Satisfiable', async () => {
    const res = await makeRequest(port, '/api/speakout/audio?track=1.01', {
      range: 'bytes=999999999-'
    });
    assert.equal(res.statusCode, 416);
    assert.match(res.headers['content-range'], /^bytes \*\/\d+/);
  });

  await t.test('GET /api/speakout/progress blocks unauthenticated requests and reads saved progress with session', async () => {
    // 1. Unauthenticated request returns 401
    const unauthRes = await makeRequest(port, '/api/speakout/progress');
    assert.equal(unauthRes.statusCode, 401);
    const unauthData = JSON.parse(unauthRes.body);
    assert.match(unauthData.error, /Active session required/);

    // 2. Authenticated session request returns 200
    const sessionRes = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', password: 'test-student-secret-2022' })
    });
    assert.equal(sessionRes.statusCode, 200);
    const cookieHeader = sessionRes.headers['set-cookie']?.[0] || sessionRes.headers['set-cookie'];

    const res = await makeRequest(port, '/api/speakout/progress', {
      headers: { cookie: cookieHeader }
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.ok(Array.isArray(data.progress));
  });

  await t.test('POST /api/speakout/progress updates lesson page in SQLite for authenticated session', async () => {
    const sessionRes = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', password: 'test-student-secret-2022' })
    });
    const cookieHeader = sessionRes.headers['set-cookie']?.[0] || sessionRes.headers['set-cookie'];

    const payload = JSON.stringify({ lessonId: '1A', page: 8, completedSteps: ['step1'] });
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/speakout/progress',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          cookie: cookieHeader
        }
      }, (r) => {
        let b = '';
        r.on('data', c => { b += c; });
        r.on('end', () => resolve({ statusCode: r.statusCode, body: b }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.success, true);
    assert.equal(data.lessonId, '1A');
    assert.equal(data.page, 8);
  });

  await t.test('POST /api/speakout/speech/record saves student recording in SQLite for authenticated session', async () => {
    const sessionRes = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', password: 'test-student-secret-2022' })
    });
    const cookieHeader = sessionRes.headers['set-cookie']?.[0] || sessionRes.headers['set-cookie'];

    const payload = JSON.stringify({ lessonId: '1A', trackId: '1.01', audioBase64: 'data:audio/webm;base64,GkXfo59ChoEB' });
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/speakout/speech/record',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          cookie: cookieHeader
        }
      }, (r) => {
        let b = '';
        r.on('data', c => { b += c; });
        r.on('end', () => resolve({ statusCode: r.statusCode, body: b }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.success, true);
    assert.equal(data.lessonId, '1A');
    assert.ok(data.id.startsWith('rec_'));
  });
});
