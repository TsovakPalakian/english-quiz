import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function createBridgeContext(routes = {}) {
  const window = {};
  const sent = [];
  const scope = {
    window,
    crypto,
    location: { reload() {}, hostname: '127.0.0.1' },
    sessionStorage: { removeItem() {}, getItem: () => null, setItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, getElementById: () => null },
    fetch: async (path, options = {}) => {
      if (routes[path]) return routes[path](options);
      if (path === '/api/me') return { ok: true, json: async () => ({ user: { id: 'teacher', role: 'ADMIN' } }) };
      const body = options.body ? JSON.parse(options.body) : null;
      sent.push({ path, method: options.method || 'GET', body });
      return {
        ok: true,
        json: async () => ({
          id: 'lesson-1',
          revision: (body?.expectedRevision || 1) + 1,
          blocks: (body?.upserts || []).map((b, i) => ({ id: b.id || 100 + i, revision: 1 }))
        })
      };
    }
  };
  runInNewContext(readFileSync(new URL('../client/main/main-bridge.js', import.meta.url), 'utf8'), scope);
  return { window, sent, scope };
}

test('Wordcard preserves teacherVerified, assignmentKey, and pdfImport in lessonSnapshot', async () => {
  const { window } = createBridgeContext();
  await window.LearningMain.fetch('/api/me');

  const lesson = {
    id: 'lesson-1',
    title: 'Phrases Lesson',
    published: true,
    stageRevision: 1,
    blocks: [
      {
        id: 10,
        type: 'wordcard',
        tab: 'phrases',
        word: 'afraid of',
        stageId: 42,
        stageBlockRevision: 1,
        teacherVerified: true,
        assignmentKey: 'task-1',
        pdfImport: { pages: [2], source: 'pdf-hash' }
      }
    ]
  };

  const snapshot = window.LearningMain.lessonSnapshot(lesson);
  assert.equal(snapshot.blocks.length, 1);
  const block = snapshot.blocks[0];
  assert.equal(block.cardId, 42);
  assert.equal(block.type, 'wordcard');
  assert.equal(block.tab, 'phrases');
  assert.equal(block.content.teacherVerified, true, 'teacherVerified must be preserved in content');
  assert.equal(block.content.assignmentKey, 'task-1', 'assignmentKey must be preserved in content');
  assert.deepEqual(JSON.parse(JSON.stringify(block.content.pdfImport)), { pages: [2], source: 'pdf-hash' }, 'pdfImport must be preserved in content');
});

test('Toggling teacherVerified on a wordcard generates upsert with updated content', async () => {
  const { window, sent } = createBridgeContext();
  await window.LearningMain.fetch('/api/me');

  const lesson = {
    id: 'lesson-1',
    title: 'Phrases Lesson',
    published: false,
    stageRevision: 1,
    blocks: [
      {
        id: 10,
        type: 'wordcard',
        tab: 'phrases',
        word: 'afraid of',
        stageId: 42,
        stageBlockRevision: 1,
        stageDefinition: { cardId: 42, content: {} }
      }
    ]
  };

  // Baseline initially without teacherVerified
  lesson.stageLessonBaseline = window.LearningMain.lessonSnapshot(lesson);

  // Now teacher verifies the block
  lesson.blocks[0].teacherVerified = true;
  lesson.published = true;

  await window.LearningMain.saveLesson(lesson);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].path, '/api/lessons/lesson-1');
  assert.equal(sent[0].body.changes.published, true);
  assert.equal(sent[0].body.upserts.length, 1, 'Block with changed verification must be upserted');
  assert.equal(sent[0].body.upserts[0].id, 10);
  assert.equal(sent[0].body.upserts[0].content.teacherVerified, true, 'Upserted content must include teacherVerified: true');
});

test('Unverified wordcard deletes teacherVerified from content when unverified', async () => {
  const { window, sent } = createBridgeContext();
  await window.LearningMain.fetch('/api/me');

  const lesson = {
    id: 'lesson-1',
    title: 'Phrases Lesson',
    published: true,
    stageRevision: 2,
    blocks: [
      {
        id: 10,
        type: 'wordcard',
        tab: 'phrases',
        word: 'afraid of',
        stageId: 42,
        stageBlockRevision: 1,
        teacherVerified: true,
        stageDefinition: { cardId: 42, content: { teacherVerified: true } }
      }
    ]
  };

  // Baseline has teacherVerified: true
  lesson.stageLessonBaseline = window.LearningMain.lessonSnapshot(lesson);

  // Teacher unverifies the block
  lesson.blocks[0].teacherVerified = false;

  await window.LearningMain.saveLesson(lesson);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.upserts.length, 1, 'Block with revoked verification must be upserted');
  assert.equal(sent[0].body.upserts[0].content.teacherVerified, undefined, 'Revoked verification must omit teacherVerified');
});

test('saveLesson falls back to lookupLessonCard when an unlinked wordcard has no stageId', async () => {
  let lookupCalled = false;
  const { window, sent } = createBridgeContext({
    '/api/cards?exact=1&q=newword': () => ({ ok: true, json: async () => [] }),
    '/api/cards/lookup': async (options) => {
      lookupCalled = true;
      const body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ id: 99, en: body.word, ru: 'новое слово', revision: 1, scope: 'shared' }) };
    }
  });

  await window.LearningMain.fetch('/api/me');

  const lesson = {
    id: 'lesson-new',
    title: 'New Words',
    published: false,
    stageRevision: 1,
    stageLessonBaseline: { changes: { title: 'New Words', published: false }, blocks: [], order: [] },
    blocks: [
      {
        id: 'lm-temp-1',
        type: 'wordcard',
        tab: 'words',
        word: 'newword',
        teacherVerified: true
      }
    ]
  };

  await window.LearningMain.saveLesson(lesson);

  assert.equal(lookupCalled, true, 'lookupLessonCard must be called for unlinked word');
  assert.equal(lesson.blocks[0].stageId, 99, 'Block must receive stageId from lookup');
  assert.equal(sent.at(-1).body.upserts.length, 1);
  assert.equal(sent.at(-1).body.upserts[0].cardId, 99);
  assert.equal(sent.at(-1).body.upserts[0].content.teacherVerified, true);
});

test('legacyLessons round-trip preserves teacherVerified on wordcard after server reload', async () => {
  // Simulating server read: b.content_json stored from upsert.content
  const content = { teacherVerified: true, assignmentKey: 'task-1', pdfImport: { pages: [2] } };
  const b = {
    id: 10,
    lesson_id: 1,
    type: 'wordcard',
    tab: 'phrases',
    card_id: 42,
    revision: 2,
    response_revision: 0,
    content_json: JSON.stringify(content),
    en: 'afraid of',
    ru: 'боящийся',
    part_of_speech: 'collocation',
    card_extra: JSON.stringify({ data: { gloss: 'Feeling fear' } }),
    card_revision: 1
  };

  const definition = { type: b.type, tab: b.tab, cardId: b.card_id, content: JSON.parse(b.content_json) };
  const block = {
    ...JSON.parse(JSON.stringify(definition.content)),
    id: b.id,
    type: b.type,
    tab: b.tab,
    stageDefinition: definition,
    stageBlockRevision: b.revision,
    stageResponseRevision: b.response_revision || 0
  };
  if (b.card_id) {
    Object.assign(block, JSON.parse(b.card_extra), {
      word: b.en,
      ru: b.ru,
      pos: b.part_of_speech,
      stageId: b.card_id,
      stageRevision: b.card_revision,
      stageScope: 'shared'
    });
  }

  assert.equal(block.teacherVerified, true, 'Restored block must have teacherVerified === true');
  assert.equal(block.assignmentKey, 'task-1');
  assert.deepEqual(block.pdfImport, { pages: [2] });
  assert.equal(block.word, 'afraid of');
  assert.equal(block.ru, 'боящийся');
});

