import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker, {ACCOUNT_AUTH} from '../src/learning-stage-worker.mjs';
import {STUDY_DATABASE, STATIC_STUDY_DATABASE} from '../src/study-database.mjs';

const host = 'viewer.example.invalid';

function env(actor) {
  return {
    STAGE_ENABLED: 'true',
    STAGE_ALLOWED_HOST: host,
    ASSETS: {fetch: async () => new Response('pdf-viewer', {status: 200, headers: {'Content-Type': 'text/javascript'}})},
    [ACCOUNT_AUTH]: {current: async () => actor}
  };
}

test('Speakout PDF viewer is refused without a session and served after sign-in', async () => {
  const closed = await worker.fetch(new Request('https://' + host + '/speakout/vendor/pdfjs/pdf.mjs'), env(null));
  assert.equal(closed.status, 401);
  assert.match(await closed.text(), /Sign in first/);
  const open = await worker.fetch(new Request('https://' + host + '/speakout/vendor/pdfjs/pdf.worker.mjs'), env({id: '1', role: 'DEVELOPER', login: 'dev'}));
  assert.equal(open.status, 200);
  assert.equal(open.headers.get('content-type'), 'text/javascript');
  assert.equal(await open.text(), 'pdf-viewer');
  const outside = await worker.fetch(new Request('https://' + host + '/speakout/vendor/pdfjs/../app.js'), env({id: '1', role: 'DEVELOPER', login: 'dev'}));
  assert.equal(outside.status, 501);
});

test('Student Speakout page shows the studio without editor blocks', () => {
  const source = readFileSync(new URL('../production/speakout-editor.js', import.meta.url), 'utf8');
  assert.match(source, /studioEmbed\|\|readBlocks\(\)/);
  assert.equal(source.includes('studioEmbed+readBlocks()'), false);
  assert.match(source, /\{0:'1A',1:'1B',2:'1C',3:'1D'\}/);
});

test('Studio buttons are wired before the PDF viewer loads', () => {
  const source = readFileSync(new URL('../speakout/web/app.js', import.meta.url), 'utf8');
  const boot = source.slice(source.indexOf('DOMContentLoaded'));
  assert.ok(boot.indexOf('initEventListeners()') >= 0);
  assert.ok(boot.indexOf('initEventListeners()') < boot.indexOf('loadPdfViewer()'));
  assert.match(source, /import\('\.\/vendor\/pdfjs\/pdf\.mjs'\)/);
  assert.equal(/^\s*import\s+\*\s+as\s+pdfjsLib\b/m.test(source), false);
});

test('Lessons 1B and 1C open their book pages and tracks', () => {
  const app = readFileSync(new URL('../speakout/web/app.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../speakout/web/index.html', import.meta.url), 'utf8');
  assert.match(app, /'1B': \{[^}]*page: 10/);
  assert.match(app, /'1C': \{[^}]*page: 12/);
  assert.match(page, /data-track="1\.04"/);
  assert.match(page, /data-track="1\.0X"/);
  assert.match(page, /data-track="VB1\.02"/);
  assert.match(page, /data-track="VB1\.03"/);
  assert.match(page, /data-track="1\.05"/);
  assert.match(page, /data-track="1\.08"/);
  assert.match(page, /id="btn-record-speech"/);
  assert.match(page, /id="btn-keys"/);
});

test('Speakout 1B and 1C audio is refused without a session and mapped after sign-in', async () => {
  const closed = await worker.fetch(new Request('https://' + host + '/api/speakout/audio?track=1.04'), env(null));
  assert.equal(closed.status, 401);
  const files = new Map([
    ['speakout/a1/unit1/audio/1_04.mp3', 'track-104'],
    ['speakout/a1/unit1/audio/1_0x.mp3', 'track-10x'],
    ['speakout/a1/unit1/audio/vb1_02.mp3', 'vb102'],
    ['speakout/a1/unit1/audio/vb1_03.mp3', 'vb103'],
    ['speakout/a1/unit1/audio/1_05.mp3', 'track-105'],
    ['speakout/a1/unit1/audio/1_06.mp3', 'track-106'],
    ['speakout/a1/unit1/audio/1_07.mp3', 'track-107'],
    ['speakout/a1/unit1/audio/1_08.mp3', 'track-108']
  ]);
  const media = {
    get: async key => {
      const body = files.get(key);
      return body ? {size: body.length, body, writeHttpMetadata(headers) { headers.set('Content-Type', 'audio/mpeg'); }} : null;
    },
    head: async key => media.get(key),
    put: async () => {}
  };
  const signed = {
    STAGE_ENABLED: 'true',
    STAGE_ALLOWED_HOST: host,
    STORAGE_MODE: 'test',
    STAGE_MEDIA_BUCKET: 'learn-english-learning-test-media',
    STAGE_MEDIA: media,
    [ACCOUNT_AUTH]: {current: async () => ({id: '1', role: 'DEVELOPER', login: 'dev'})},
    [STUDY_DATABASE]: STATIC_STUDY_DATABASE
  };
  for (const track of ['1.04', '1.0X', 'VB1.02', 'VB1.03', '1.05', '1.06', '1.07', '1.08']) {
    const open = await worker.fetch(new Request('https://' + host + '/api/speakout/audio?track=' + encodeURIComponent(track)), signed);
    assert.equal(open.status, 200, track);
  }
  const missing = await worker.fetch(new Request('https://' + host + '/api/speakout/audio?track=9.99'), signed);
  assert.equal(missing.status, 404);
});
