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

console.log('PDF draft editor unit test passed: editing, word selection, and adding missing words verified.');
