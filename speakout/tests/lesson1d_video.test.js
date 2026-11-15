import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createServer, loadManifest } from '../server/server.js';

function makeRequest(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers
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
    req.end();
  });
}

test('Lesson 1D Video Streaming & API Verification', async (t) => {
  let server;
  let port;

  t.before(async () => {
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

  await t.test('BBC video files physically exist on local disk', () => {
    const manifest = loadManifest();
    assert.ok(manifest.lesson1d, 'lesson1d must be present in manifest');
    
    const streetIntPath = manifest.lesson1d.videos.streetInterviews.path;
    const vlogsPath = manifest.lesson1d.videos.vlogs.path;
    
    assert.ok(fs.existsSync(streetIntPath), `Street Interviews video must exist: ${streetIntPath}`);
    assert.ok(fs.existsSync(vlogsPath), `Vlogs video must exist: ${vlogsPath}`);
    
    const statStreet = fs.statSync(streetIntPath);
    const statVlogs = fs.statSync(vlogsPath);
    
    assert.ok(statStreet.size > 10000000, 'Street Interviews video must be > 10MB');
    assert.ok(statVlogs.size > 10000000, 'Vlogs video must be > 10MB');
  });

  await t.test('GET /api/speakout/lesson/A1/1D returns complete 1D lesson metadata', async () => {
    const res = await makeRequest(port, '/api/speakout/lesson/A1/1D');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    const data = JSON.parse(res.body);
    assert.equal(data.lessonId, '1D');
    assert.equal(data.lessonTitle, 'BBC Video Lesson: Street Interviews & Vlogs');
    assert.ok(data.videos.streetInterviews, 'Must include street interviews video info');
    assert.ok(data.videos.vlogs, 'Must include vlogs video info');
    assert.equal(data.vocabulary.length, 13, 'Must contain 13 common objects');
  });

  await t.test('GET /api/speakout/video streams Street Interviews full video with 200 OK', async () => {
    const res = await makeRequest(port, '/api/speakout/video?file=SO3+A1+U1+BBC+StreetInt.mp4');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'video/mp4');
    assert.equal(res.headers['accept-ranges'], 'bytes');
    assert.ok(parseInt(res.headers['content-length'], 10) > 20000000);
  });

  await t.test('GET /api/speakout/video with Range header returns HTTP 206 Partial Content', async () => {
    const res = await makeRequest(port, '/api/speakout/video?file=SO3+A1+U1+BBC+StreetInt.mp4', {
      range: 'bytes=0-1048575'
    });
    assert.equal(res.statusCode, 206);
    assert.equal(res.headers['content-type'], 'video/mp4');
    assert.match(res.headers['content-range'], /^bytes 0-1048575\/\d+/);
    assert.equal(res.headers['content-length'], '1048576');
  });

  await t.test('GET /api/speakout/video streams Vlogs video with 200 OK', async () => {
    const res = await makeRequest(port, '/api/speakout/video?file=SO3+A1+U1+BBC+Vlogs.mp4');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'video/mp4');
    assert.equal(res.headers['accept-ranges'], 'bytes');
    assert.ok(parseInt(res.headers['content-length'], 10) > 15000000);
  });

  await t.test('GET /api/speakout/video rejects path traversal attempts with 400', async () => {
    const res = await makeRequest(port, '/api/speakout/video?file=../../etc/passwd');
    assert.equal(res.statusCode, 400);
    const data = JSON.parse(res.body);
    assert.equal(data.error, 'Invalid video file parameter');
  });

  await t.test('GET /api/speakout/video rejects unapproved non-Unit-1 video files with 403 Forbidden', async () => {
    const res = await makeRequest(port, '/api/speakout/video?file=non_existent_clip.mp4');
    assert.equal(res.statusCode, 403);
    const data = JSON.parse(res.body);
    assert.match(data.error, /Only Unit 1 videos/);
  });
});
