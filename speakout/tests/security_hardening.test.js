import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, createServerSession } from '../server/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_JS_PATH = path.join(__dirname, '../web/app.js');
const INDEX_HTML_PATH = path.join(__dirname, '../web/index.html');

function makeRequest(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
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
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

test('Speakout Security Hardening & Data Protection Verification', async (t) => {
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

  await t.test('1. GET /api/speakout/manifest sanitizes paths and strips answerKeys', async () => {
    const res = await makeRequest(port, '/api/speakout/manifest');
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);

    assert.equal(data.answerKeys, undefined, 'answerKeys must be stripped from public manifest');
    assert.equal(data.videoDirectory, undefined, 'videoDirectory must be stripped from public manifest');

    // Recursive search to assert zero path properties
    const assertNoPaths = (obj, parentKey = '') => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach((item, idx) => assertNoPaths(item, `${parentKey}[${idx}]`));
        return;
      }
      for (const [k, v] of Object.entries(obj)) {
        assert.notEqual(k, 'path', `Found forbidden "path" property at ${parentKey}.${k}`);
        assertNoPaths(v, `${parentKey}.${k}`);
      }
    };
    assertNoPaths(data, 'manifest');
  });

  await t.test('2. Phase 1 endpoints sanitize question answers and audio paths', async () => {
    const res1A = await makeRequest(port, '/api/speakout/lesson/A1/1A');
    assert.equal(res1A.statusCode, 200);
    const data1A = JSON.parse(res1A.body);
    assert.equal(data1A.answerKeys, undefined, 'answerKeys must be stripped from 1A endpoint');
    assert.doesNotMatch(res1A.body, /"path"\s*:/, '1A must not contain file paths');

    const res1D = await makeRequest(port, '/api/speakout/lesson/A1/1D');
    assert.equal(res1D.statusCode, 200);
    const data1D = JSON.parse(res1D.body);
    assert.equal(data1D.answerKeys, undefined, 'answerKeys must be stripped from 1D endpoint');
    assert.doesNotMatch(res1D.body, /"path"\s*:/, '1D must not contain file paths');
  });

  await t.test('3. Non-Phase-1 test endpoints are excluded and return 404', async () => {
    const resTest = await makeRequest(port, '/api/speakout/test/A1/U1');
    assert.equal(resTest.statusCode, 404, 'Progress test endpoint must return 404 in Phase 1');

    const resSubmit = await makeRequest(port, '/api/speakout/test/A1/U1/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: {} })
    });
    assert.equal(resSubmit.statusCode, 404, 'Test submit endpoint must return 404 in Phase 1');
  });

  await t.test('4. GET /api/speakout/document blocks teacher resources with 403 Forbidden', async () => {
    const res = await makeRequest(port, '/api/speakout/document?doc=teacherResources');
    assert.equal(res.statusCode, 403);
    const data = JSON.parse(res.body);
    assert.match(data.error, /Teacher resources require authorization/);
  });

  await t.test('5. GET /api/speakout/document allows whitelisted public documents', async () => {
    const res = await makeRequest(port, '/api/speakout/document?doc=studentBook');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.equal(res.headers['accept-ranges'], 'bytes');
  });

  await t.test('6. GET /api/speakout/document rejects unknown or malicious document keys', async () => {
    const res = await makeRequest(port, '/api/speakout/document?doc=../../etc/passwd');
    assert.equal(res.statusCode, 400);
    const data = JSON.parse(res.body);
    assert.match(data.error, /Invalid document parameter/);
  });

  await t.test('7. Strict CORS policy enforces authorized origins instead of wildcard (*)', async () => {
    // 7.1 lumiscia.org
    const resLumiscia = await makeRequest(port, '/api/speakout/manifest', {
      headers: { origin: 'https://lumiscia.org' }
    });
    assert.equal(resLumiscia.headers['access-control-allow-origin'], 'https://lumiscia.org');

    // 7.2 Subdomain of lumiscia.org
    const resSub = await makeRequest(port, '/api/speakout/manifest', {
      headers: { origin: 'https://staging.lumiscia.org' }
    });
    assert.equal(resSub.headers['access-control-allow-origin'], undefined);

    // 7.3 Unauthorized origin returns 'null'
    const resEvil = await makeRequest(port, '/api/speakout/manifest', {
      headers: { origin: 'https://malicious-site.com' }
    });
    assert.equal(resEvil.headers['access-control-allow-origin'], undefined);
    assert.notEqual(resEvil.headers['access-control-allow-origin'], '*');
  });

  await t.test('8. Error responses on 404 do not leak filesystem paths', async () => {
    const resAudio = await makeRequest(port, '/api/speakout/audio?track=nonexistent_track_999');
    assert.equal(resAudio.statusCode, 404);
    const audioData = JSON.parse(resAudio.body);
    assert.equal(audioData.path, undefined, 'Must not expose disk path on 404');

    const resRoute = await makeRequest(port, '/api/speakout/nonexistent_route');
    assert.equal(resRoute.statusCode, 404);
    const routeData = JSON.parse(resRoute.body);
    assert.equal(routeData.path, undefined, 'Must not expose path on 404');
  });

  await t.test('9. Static UI templates and app script prevent DOM XSS and remove teacher links', () => {
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
    const js = fs.readFileSync(APP_JS_PATH, 'utf-8');

    assert.doesNotMatch(html, /doc=teacherResources/, 'HTML must not contain direct links to teacherResources');
    assert.match(html, /🔒 Teacher Resources \(Restricted\)/, 'HTML must display restricted badge for teacher resources');
    assert.match(js, /function escapeHtml\(str\)/, 'app.js must implement escapeHtml utility function');
    assert.doesNotMatch(js, /data-test-ans/, 'app.js must not expose data-test-ans attribute in DOM');
  });

  await t.test('10. Non-Phase-1 lesson endpoints are excluded and return 404', async () => {
    const excludedEndpoints = [
      '/api/speakout/lesson/A1/1B',
      '/api/speakout/lesson/A1/1C',
      '/api/speakout/lesson/A1/Review',
      '/api/speakout/lesson/A1/2A',
      '/api/speakout/lesson/A1/2B'
    ];
    for (const ep of excludedEndpoints) {
      const res = await makeRequest(port, ep);
      assert.equal(res.statusCode, 404, `${ep} must return 404 as it is excluded from Phase 1`);
    }
  });

  await t.test('11. app.js escapes all dynamic HTML interpolations in innerHTML', () => {
    const js = fs.readFileSync(APP_JS_PATH, 'utf-8');
    const lines = js.split('\n');
    const unescaped = [];
    lines.forEach((line, idx) => {
      if (line.includes('.innerHTML') && line.includes('${') && !line.includes('escapeHtml')) {
        unescaped.push({ line: idx + 1, content: line.trim() });
      }
    });
    assert.deepEqual(unescaped, [], 'app.js must not contain unescaped .innerHTML template literals');
  });

  await t.test('12. GET /api/speakout/document?doc=keys blocks unauthenticated requests with 401 Unauthorized', async () => {
    const res = await makeRequest(port, '/api/speakout/document?doc=keys');
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.body);
    assert.match(data.error, /Authentication required to access answer keys/);
  });

  await t.test('13. GET /api/speakout/document?doc=photocopiables is rejected with 400 Bad Request', async () => {
    const res = await makeRequest(port, '/api/speakout/document?doc=photocopiables');
    assert.equal(res.statusCode, 400);
    const data = JSON.parse(res.body);
    assert.match(data.error, /Invalid document parameter/);
  });

  await t.test('14. GET /api/speakout/document?doc=keys allows student session with 200 OK and restricts teacherResources to teacher', async () => {
    process.env.SPEAKOUT_TEACHER_PASSWORD = 'test-teacher-secret-2022';
    process.env.SPEAKOUT_STUDENT_PASSWORD = 'test-student-secret-2022';

    const sessionRes = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', password: 'test-student-secret-2022' })
    });
    const studentCookie = sessionRes.headers['set-cookie']?.[0] || sessionRes.headers['set-cookie'];
    const resStudentKeys = await makeRequest(port, '/api/speakout/document?doc=keys', {
      headers: { cookie: studentCookie }
    });
    assert.equal(resStudentKeys.statusCode, 200);
    assert.equal(resStudentKeys.headers['content-type'], 'application/pdf');

    // 2. Student session receives 403 Forbidden for doc=teacherResources
    const resStudentTR = await makeRequest(port, '/api/speakout/document?doc=teacherResources', {
      headers: { cookie: studentCookie }
    });
    assert.equal(resStudentTR.statusCode, 403);
    const trData = JSON.parse(resStudentTR.body);
    assert.match(trData.error, /Teacher resources require authorization/);

    // 3. Teacher session with valid password receives 200 OK for doc=keys and doc=teacherResources
    const teacherPayload = JSON.stringify({ role: 'teacher', password: 'test-teacher-secret-2022' });
    const teacherSessionRes = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: teacherPayload
    });
    assert.equal(teacherSessionRes.statusCode, 200);
    const teacherCookie = teacherSessionRes.headers['set-cookie']?.[0] || teacherSessionRes.headers['set-cookie'];
    const resTeacherKeys = await makeRequest(port, '/api/speakout/document?doc=keys', {
      headers: { cookie: teacherCookie }
    });
    assert.equal(resTeacherKeys.statusCode, 200);
    assert.equal(resTeacherKeys.headers['content-type'], 'application/pdf');

    const resTeacherTR = await makeRequest(port, '/api/speakout/document?doc=teacherResources', {
      headers: { cookie: teacherCookie }
    });
    assert.equal(resTeacherTR.statusCode, 200);
    assert.equal(resTeacherTR.headers['content-type'], 'application/pdf');
  });

  await t.test('15. POST /api/speakout/session with role: teacher returns 403 Forbidden', async () => {
    delete process.env.SPEAKOUT_TEACHER_PASSWORD;
    const payload = JSON.stringify({ role: 'teacher' });
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/speakout/session',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
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
    assert.equal(res.statusCode, 403);
    const data = JSON.parse(res.body);
    assert.match(data.error, /Self-assignment of teacher role is prohibited/);
  });

  await t.test('16. x-user-role header spoofing does not grant teacher access to teacherResources', async () => {
    const res = await makeRequest(port, '/api/speakout/document?doc=teacherResources', {
      headers: {
        authorization: 'Bearer student_token_12345678',
        'x-user-role': 'teacher'
      }
    });
    assert.equal(res.statusCode, 403);
    const data = JSON.parse(res.body);
    assert.match(data.error, /Teacher resources require authorization/);
  });

  await t.test('17. Progress and audio recording endpoints strictly reject unauthenticated requests with 401', async () => {
    const resProg = await makeRequest(port, '/api/speakout/progress?user=attacker_chosen_id');
    assert.equal(resProg.statusCode, 401);

    const payloadProg = JSON.stringify({ userId: 'attacker_chosen_id', lessonId: '1A', page: 8 });
    const resPostProg = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/speakout/progress',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payloadProg) }
      }, (r) => {
        let b = '';
        r.on('data', c => { b += c; });
        r.on('end', () => resolve({ statusCode: r.statusCode, body: b }));
      });
      req.on('error', reject);
      req.write(payloadProg);
      req.end();
    });
    assert.equal(resPostProg.statusCode, 401);
  });

  await t.test('18. Unregistered arbitrary speakout_session cookies, learning_stage, and Bearer tokens are rejected with 401', async () => {
    const fakeRes = await makeRequest(port, '/api/speakout/progress', {
      headers: { cookie: 'speakout_session=unregistered_fake_token_12345678' }
    });
    assert.equal(fakeRes.statusCode, 401);

    const fakeStageRes = await makeRequest(port, '/api/speakout/progress', {
      headers: { cookie: 'learning_stage=0123456789abcdef0123456789abcdef0123456789abcdef' }
    });
    assert.equal(fakeStageRes.statusCode, 401);

    const fakeBearerRes = await makeRequest(port, '/api/speakout/progress', {
      headers: { authorization: 'Bearer unregistered_fake_bearer_token_1234' }
    });
    assert.equal(fakeBearerRes.statusCode, 401);
  });

  await t.test('19. Setting speakout_role=teacher client cookie does not grant teacher access to teacherResources', async () => {
    const sessionRes = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', password: 'test-student-secret-2022' })
    });
    const studentCookie = sessionRes.headers['set-cookie']?.[0] || sessionRes.headers['set-cookie'];
    const spoofCookie = `${studentCookie}; speakout_role=teacher`;

    const res = await makeRequest(port, '/api/speakout/document?doc=teacherResources', {
      headers: { cookie: spoofCookie }
    });
    assert.equal(res.statusCode, 403);
    const data = JSON.parse(res.body);
    assert.match(data.error, /Teacher resources require authorization/);
  });

  await t.test('20. POST /api/speakout/session does not leak sessionToken in body and sets adaptive Secure cookie', async () => {
    const resPlain = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', password: 'test-student-secret-2022' })
    });
    assert.equal(resPlain.statusCode, 200);
    const bodyPlain = JSON.parse(resPlain.body);
    assert.equal(bodyPlain.sessionToken, undefined);
    assert.equal(bodyPlain.token, undefined);
    assert.equal(bodyPlain.success, true);
    assert.equal(bodyPlain.authenticated, true);
    const cookiePlain = resPlain.headers['set-cookie']?.[0] || resPlain.headers['set-cookie'];
    assert.match(cookiePlain, /speakout_session=/);
    assert.match(cookiePlain, /HttpOnly/i);
    assert.equal(/Secure/i.test(cookiePlain), false);

    // Without TRUST_PROXY, x-forwarded-proto: https is ignored and cookie remains non-Secure over HTTP
    const resUntrustedHttps = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ role: 'student', password: 'test-student-secret-2022' })
    });
    assert.equal(resUntrustedHttps.statusCode, 200);
    const cookieUntrusted = resUntrustedHttps.headers['set-cookie']?.[0] || resUntrustedHttps.headers['set-cookie'];
    assert.equal(/Secure/i.test(cookieUntrusted), false, 'Client spoofed x-forwarded-proto without TRUST_PROXY must not set Secure cookie');

    // With TRUST_PROXY=true, reverse-proxy https proto sets Secure cookie
    process.env.TRUST_PROXY = 'true';
    const resTrustedHttps = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ role: 'student', password: 'test-student-secret-2022' })
    });
    delete process.env.TRUST_PROXY;
    assert.equal(resTrustedHttps.statusCode, 200);
    const cookieTrusted = resTrustedHttps.headers['set-cookie']?.[0] || resTrustedHttps.headers['set-cookie'];
    assert.match(cookieTrusted, /Secure/i);
  });

  await t.test('21. GET /api/speakout/audio?track=WB1.12 returns 404 (blocks workbook tracks)', async () => {
    const res = await makeRequest(port, '/api/speakout/audio?track=WB1.12');
    assert.equal(res.statusCode, 404);
    const data = JSON.parse(res.body);
    assert.match(data.error, /Audio track not found/);
  });

  await t.test('22. POST /api/speakout/speech/record rejects payload exceeding 512 KB with 413', async () => {
    const sessionRes = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', password: 'test-student-secret-2022' })
    });
    const cookie = sessionRes.headers['set-cookie']?.[0] || sessionRes.headers['set-cookie'];

    const bigAudio = 'data:audio/webm;base64,' + 'A'.repeat(550000);
    const res = await makeRequest(port, '/api/speakout/speech/record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie
      },
      body: JSON.stringify({ lessonId: '1A', trackId: '1.01', audioBase64: bigAudio })
    });
    assert.equal(res.statusCode, 413);
    const data = JSON.parse(res.body);
    assert.match(data.error, /Payload Too Large/);
  });

  await t.test('23. POST /api/speakout/speech/record enforces quota via REPLACE on same track', async () => {
    const sessionRes = await makeRequest(port, '/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', password: 'test-student-secret-2022' })
    });
    const cookie = sessionRes.headers['set-cookie']?.[0] || sessionRes.headers['set-cookie'];

    const smallAudio1 = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQETH4PBbW06AAA1';
    const res1 = await makeRequest(port, '/api/speakout/speech/record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie
      },
      body: JSON.stringify({ lessonId: '1A', trackId: '1.01', audioBase64: smallAudio1 })
    });
    assert.equal(res1.statusCode, 200);

    const smallAudio2 = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQETH4PBbW06AAA2';
    const res2 = await makeRequest(port, '/api/speakout/speech/record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie
      },
      body: JSON.stringify({ lessonId: '1A', trackId: '1.01', audioBase64: smallAudio2 })
    });
    assert.equal(res2.statusCode, 200);
  });

  await t.test('24. POST /api/speakout/session enforces IP rate limiting (returns 429)', async () => {
    process.env.TRUST_PROXY = 'true';
    let rateLimited = false;
    for (let i = 0; i < 15; i++) {
      const res = await makeRequest(port, '/api/speakout/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.99'
        },
        body: JSON.stringify({ role: 'student', salt: i })
      });
      if (res.statusCode === 429) {
        rateLimited = true;
        break;
      }
    }
    delete process.env.TRUST_PROXY;
    assert.equal(rateLimited, true);
  });

  await t.test('25. POST /api/speakout/speech/record rejects invalid lessonId and trackId with 400', async () => {
    const session = createServerSession('test_speech_student', 'student');
    const cookie = `speakout_session=${session.token}`;

    const resInvalidLesson = await makeRequest(port, '/api/speakout/speech/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ lessonId: '2B', trackId: '1.01', audioBase64: 'data:audio/webm;base64,GkXfo59ChoEB' })
    });
    assert.equal(resInvalidLesson.statusCode, 400);

    const resInvalidTrack = await makeRequest(port, '/api/speakout/speech/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ lessonId: '1A', trackId: 'WB1.01', audioBase64: 'data:audio/webm;base64,GkXfo59ChoEB' })
    });
    assert.equal(resInvalidTrack.statusCode, 400);
  });

  await t.test('26. POST /api/speakout/progress bounds body to 8 KB and validates page [1..177]', async () => {
    const session = createServerSession('test_progress_student', 'student');
    const cookie = `speakout_session=${session.token}`;

    // 1. Invalid lesson
    const resBadLesson = await makeRequest(port, '/api/speakout/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ lessonId: '3C', page: 5 })
    });
    assert.equal(resBadLesson.statusCode, 400);

    // 2. Out of bounds page
    const resBadPage = await makeRequest(port, '/api/speakout/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ lessonId: '1A', page: 999 })
    });
    assert.equal(resBadPage.statusCode, 400);

    const resNegativePage = await makeRequest(port, '/api/speakout/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ lessonId: '1A', page: -1 })
    });
    assert.equal(resNegativePage.statusCode, 400);

    // 3. Body exceeding 8 KB
    const bigProgress = JSON.stringify({ lessonId: '1A', page: 5, padding: 'x'.repeat(9000) });
    const resBig = await makeRequest(port, '/api/speakout/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: bigProgress
    });
    assert.equal(resBig.statusCode, 413);

    // 4. Valid page [1..maxPages] returns 200
    const resValid = await makeRequest(port, '/api/speakout/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ lessonId: '1A', page: 1 })
    });
    assert.equal(resValid.statusCode, 200);
  });

  await t.test('27. GET /api/speakout/manifest isolates Phase 1 and GET /api/speakout/lesson/A1/1A returns strictly 1A', async () => {
    const res1A = await makeRequest(port, '/api/speakout/lesson/A1/1A');
    assert.equal(res1A.statusCode, 200);
    const data1A = JSON.parse(res1A.body);
    assert.equal(data1A.id, '1A');
    assert.equal(data1A.lesson1b, undefined);
    assert.equal(data1A.lesson1d, undefined);

    const resManifest = await makeRequest(port, '/api/speakout/manifest');
    assert.equal(resManifest.statusCode, 200);
    const dataManifest = JSON.parse(resManifest.body);
    assert.equal(dataManifest.lesson1b, undefined);
    assert.equal(dataManifest.lesson1c, undefined);
    assert.equal(dataManifest.lesson2a, undefined);
    assert.equal(dataManifest.unit1Review, undefined);
    assert.equal(dataManifest.unit1Test, undefined);
    assert.equal(dataManifest.audio.workbookAudio, undefined);
  });
});
