import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Test PDF draft review interactive editing, selection, and word addition logic
const hooksSource = readFileSync(new URL('../client/52b-lesson-pdf-import.js', import.meta.url), 'utf8');

const fixtureData = {
  title: 'Original Title',
  description: 'Original Description',
  unit: 'Unit 1',
  lesson: 'Lesson 2',
  overview: 'Original Overview',
  words: [
    {word: 'earn', meaning: 'to get money', translation: 'зарабатывать', example: 'I earn money.', pages: [5]},
    {word: 'inherit', meaning: 'to receive property', translation: 'наследовать', example: 'Inherit a house.', pages: [6]}
  ],
  phrases: [],
  rules: [],
  classwork: [],
  warnings: []
};

// Verify lmPdfDraftBlocks builds blocks correctly from edited data
let blocks = [];
const scope = {
  crypto: globalThis.crypto,
  TextEncoder: globalThis.TextEncoder,
  lmBlank: (type) => ({type, id: undefined}),
  esc: (s) => String(s || ''),
  document: {addEventListener: () => {}},
  window: {}
};

runInNewContext(hooksSource, scope);

const groups = await scope.lmPdfDraftBlocks(fixtureData, 'test-hash');
assert.equal(groups.words.length, 2);
assert.equal(groups.words[0].title, 'earn');
assert.equal(groups.words[1].title, 'inherit');

// Now simulate editing words and adding a missing word
const editedData = {
  ...fixtureData,
  title: 'Edited Title',
  description: 'Edited Description',
  overview: 'Edited Overview',
  words: [
    {word: 'earn', meaning: 'to get money by work', translation: 'зарабатывать трудом', example: 'I earn a living.', pages: [5]},
    // inherit was excluded by unchecking
    // new missing word added:
    {word: 'afford', meaning: 'to have enough money', translation: 'позволить себе', example: 'I can afford it.', pages: [7]}
  ]
};

const editedGroups = await scope.lmPdfDraftBlocks(editedData, 'test-hash');
assert.equal(editedGroups.words.length, 2);
assert.equal(editedGroups.words[0].title, 'earn');
assert.equal(editedGroups.words[0].items[0].translation, 'зарабатывать трудом');
assert.equal(editedGroups.words[1].title, 'afford');
assert.equal(editedGroups.words[1].items[0].translation, 'позволить себе');

// Verify lmPreviewParts groups consecutive wordcard blocks into a single .words panel
const lessonsSrc = readFileSync(new URL('../client/52-lessons.js', import.meta.url), 'utf8');
const previewPartsFn = lessonsSrc.slice(
  lessonsSrc.indexOf('function lmPreviewParts('),
  lessonsSrc.indexOf('function lmRenderPreview(')
);
const previewCtx = {
  lmState: {
    blocks: [
      { id: 't1', type: 'task', assignmentId: 'task-1', title: 'Task Title' }
    ]
  },
  esc: s => s,
  contentCopyButton: () => '',
  lmPreviewBlock: b => '<div>' + b.id + '</div>',
  lmWordCardHtml: b => '<button class="wcard">' + b.word + '</button>'
};
runInNewContext(previewPartsFn, previewCtx);

const testBlocks = [
  { id: 'theory1', type: 'overview' },
  { id: 'w1', type: 'wordcard', word: 'earn' },
  { id: 'w2', type: 'wordcard', word: 'inherit' },
  { id: 't1', type: 'task', assignmentId: 'task-1', title: 'Task Title' }
];

const previewHtml = previewCtx.lmPreviewParts(testBlocks);
assert.ok(previewHtml.includes('data-lm-panel="theory1"'), 'Theory panel present');
assert.ok(previewHtml.includes('<div class="words"><button class="wcard">earn</button><button class="wcard">inherit</button></div>'), 'Words grouped into unified words grid panel');
assert.ok(previewHtml.includes('data-assignment="task-1"'), 'Task assignment present');

console.log('PDF draft editor unit test passed: editing, word selection, and compact wordcard grouping verified.');
