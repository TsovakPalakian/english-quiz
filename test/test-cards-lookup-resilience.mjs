import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, createContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { lessonPdfFixture } from './lesson-pdf-fixture.mjs';

function createBridgeFixture() {
  const memory = new Map(), calls = [], bugReports = [];
  let sendLookup = async () => Response.json({ id: 1, scope: 'shared', revision: 1 });
  let actor = 'teacher_yester';

  const scope = {
    window: {},
    viewGen: 1,
    viewAccount: null,
    crypto: webcrypto,
    console,
    location: { pathname: '/material' },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout() {},
    sessionStorage: { removeItem() {} },
    localStorage: {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    },
    document: {
      addEventListener() {},
      dispatchEvent() {},
      querySelectorAll: () => [],
      getElementById: () => ({ textContent: '', classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {} }),
    },
    fetch: async (path, options = {}) => {
      if (path === '/api/me') return Response.json({ user: { id: actor, role: 'ADMIN' } });
      if (path === '/api/me/state') return Response.json({ stats: {}, added: [], stageQuizProgress: [] });
      if (path === '/api/bugs') {
        const body = JSON.parse(options.body || '{}');
        bugReports.push(body);
        return Response.json({});
      }
      const body = JSON.parse(options.body || '{}');
      calls.push({ path, method: options.method, body });
      if (path === '/api/cards/lookup') return sendLookup(body);
      return Response.json({ revision: 1 });
    },
  };

  runInNewContext(readFileSync(new URL('../client/main/main-bridge.js', import.meta.url), 'utf8'), scope);
  const bridge = scope.window.LearningMain;
  return {
    bridge,
    calls,
    bugReports,
    memory,
    async boot() {
      await bridge.fetch('/api/me');
      await bridge.fetch('/api/me/state');
    },
    setLookup(fn) { sendLookup = fn; },
  };
}

function createImportFixture(api = {}) {
  let id = 0;
  const scope = createContext({
    crypto: webcrypto,
    TextEncoder,
    window: { LearningMain: api, GrammarDetails: {}, GRAMMAR: { topics: [] } },
    lmBlank: (type) => ({ id: ++id, type }),
    esc: String,
    setTimeout: (fn) => { fn(); return 1; },
  });
  runInNewContext(readFileSync(new URL('../client/52b-lesson-pdf-import.js', import.meta.url), 'utf8'), scope);
  return scope;
}

test('write() automatically retries on transient connection failure (status 0) using the same mutationId', async () => {
  const f = createBridgeFixture();
  await f.boot();

  let attempts = 0;
  f.setLookup(async () => {
    attempts++;
    if (attempts === 1) {
      throw new TypeError('Failed to fetch');
    }
    return Response.json({ id: 42, scope: 'shared', revision: 1 });
  });

  const card = await f.bridge.lookupLessonCard('parcel', { meaning: 'a box', translation: 'посылка', example: 'ex' });
  assert.equal(card.id, 42);
  assert.equal(attempts, 2, 'Expected write() to retry once on status 0');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].body.mutationId, f.calls[1].body.mutationId, 'Retry must preserve the exact same mutationId');
  assert.equal(f.calls[0].body.word, 'parcel');
  assert.equal(f.calls[1].body.word, 'parcel');
  assert.equal(f.memory.has('learning-main-pending-v3'), false, 'Pending mutation must be cleared after successful retry');
  assert.equal(f.bugReports.length, 0, 'Transient first failure must not report client bug');
});

test('write() clears pending mutation if lookupLessonCard fails permanently on status 0', async () => {
  const f = createBridgeFixture();
  await f.boot();

  f.setLookup(async () => {
    throw new TypeError('Failed to fetch');
  });

  await assert.rejects(
    f.bridge.lookupLessonCard('parcel', { meaning: 'a box', translation: 'посылка', example: 'ex' }),
    (err) => err.status === 0
  );

  assert.equal(
    f.memory.has('learning-main-pending-v3'),
    false,
    'Failed lookupLessonCard must not leave a stuck pending mutation in localStorage'
  );
  assert.equal(f.bugReports.length, 0, 'Network interruption for lookup must not report false client bug');
});

test('reportClientBug ignores status 0 network drops on /api/cards/lookup', async () => {
  const f = createBridgeFixture();
  await f.boot();

  f.setLookup(async () => {
    throw new TypeError('Network error');
  });

  await assert.rejects(f.bridge.lookupLessonCard('parcel'), (err) => err.status === 0);
  assert.equal(f.bugReports.length, 0, 'No bug report should be sent for status 0 on /api/cards/lookup');
});

test('lmPdfPrepareCards retries transient network interruptions (status 0) and enriches blocks', async () => {
  let lookupAttempts = 0, dictAttempts = 0;
  const c = createImportFixture({
    lookupLessonCard: async (word) => {
      lookupAttempts++;
      if (lookupAttempts === 1) {
        const err = Object.assign(new Error('Connection interrupted. Saving is not confirmed; retry the same operation.'), { status: 0 });
        throw err;
      }
      return { id: 101 };
    },
    dictionary: async ({ stageId }) => {
      dictAttempts++;
      if (dictAttempts === 1) {
        const err = Object.assign(new Error('Connection interrupted. Unable to load data; retry the operation.'), { status: 0 });
        throw err;
      }
      return { id: stageId, en: 'parcel', ru: 'посылка', data: { cambridge: { definition: 'a package' } } };
    },
  });

  const data = lessonPdfFixture();
  data.words = [{ word: 'parcel', meaning: 'a package', translation: 'посылка', example: 'a small parcel' }];
  data.phrases = [];
  const groups = await c.lmPdfDraftBlocks(data, 'pdf');
  const lesson = { blocks: [] };
  await c.lmPdfAppendSections(lesson, groups, new Set(['words']), 'pdf', 'sample.pdf');

  await c.lmPdfPrepareCards(lesson, () => true);

  assert.equal(lookupAttempts, 2, 'lookupLessonCard should retry on status 0');
  assert.equal(dictAttempts, 2, 'dictionary should retry on status 0');
  assert.equal(lesson.blocks[0].type, 'wordcard');
  assert.equal(lesson.blocks[0].stageId, 101);
  assert.equal(lesson.blocks[0].word, 'parcel');
  assert.equal(lesson.blocks[0].ru, 'посылка');
});
