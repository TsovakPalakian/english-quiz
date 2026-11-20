import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const rootDir = process.cwd();

function createLessonContext() {
  let id = 0;
  const mockDoc = {
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    documentElement: { setAttribute: () => {}, getAttribute: () => 'sky' }
  };
  const scope = vm.createContext({
    crypto: webcrypto,
    TextEncoder,
    document: mockDoc,
    window: {
      LearningMain: {},
      GrammarDetails: { 'Relative clauses': { ru: 'Придаточные определительные' } },
      GRAMMAR: { topics: [] }
    },
    lmId: () => 'blk_' + (++id),
    lmTab: () => 'rules',
    lmBlocksFor: () => scope.lmState?.blocks || [],
    lmBlock: (bid) => (scope.lmState?.blocks || []).find(b => b.id === bid),
    lmSchedule: () => {},
    esc: s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  });

  const lessonsSrc = readFileSync(new URL('../client/52-lessons.js', import.meta.url), 'utf8');
  const pdfImportSrc = readFileSync(new URL('../client/52b-lesson-pdf-import.js', import.meta.url), 'utf8');
  vm.runInContext(lessonsSrc + '\n' + pdfImportSrc, scope);
  return scope;
}

test('lmPdfDraftBlocks retains rule title, name, explanation, pattern, and examples on matched rules', async () => {
  const ctx = createLessonContext();
  const data = {
    title: 'Test Lesson',
    overview: 'Lesson overview',
    words: [],
    phrases: [],
    rules: [
      {
        title: 'Relative clauses',
        explanation: 'Essential explanation of relative clauses.',
        pattern: 'Noun + who/which/that',
        examples: ['The teacher who inspired me. — Учитель, который вдохновил меня.'],
        pages: [7, 8, 10],
        generated: true
      }
    ],
    classwork: []
  };

  const groups = await ctx.lmPdfDraftBlocks(data, 'test-hash');
  assert.equal(groups.rules.length, 1);
  const ruleBlock = groups.rules[0];
  assert.equal(ruleBlock.type, 'rule');
  assert.equal(ruleBlock.title, 'Relative clauses');
  assert.equal(ruleBlock.name, 'Relative clauses');
  assert.equal(ruleBlock.explanation, 'Essential explanation of relative clauses.');
  assert.equal(ruleBlock.pattern, 'Noun + who/which/that');
  assert.deepEqual(ruleBlock.examples, ['The teacher who inspired me. — Учитель, который вдохновил меня.']);
  assert.deepEqual(ruleBlock.pdfImport.pages, [7, 8, 10]);
});

test('lmBody renders editable fields and topic pill for rule blocks without falling back to empty Rule', () => {
  const ctx = createLessonContext();
  const ruleBlock = {
    id: 'r1',
    type: 'rule',
    tab: 'rules',
    title: 'Defining vs Non-defining Relative Clauses',
    name: 'Defining vs Non-defining Relative Clauses',
    grammarRule: 'Relative clauses',
    explanation: 'Detailed explanation text.',
    pattern: 'Noun + who + verb',
    examples: ['Example one — Пример один']
  };

  ctx.lmState = { id: 'l1', blocks: [ruleBlock] };
  const bodyHtml = ctx.lmBody(ruleBlock);

  assert.match(bodyHtml, /data-field="title"/);
  assert.match(bodyHtml, /value="Defining vs Non-defining Relative Clauses"/);
  assert.match(bodyHtml, /data-field="explanation"/);
  assert.match(bodyHtml, /Detailed explanation text\./);
  assert.match(bodyHtml, /data-field="pattern"/);
  assert.match(bodyHtml, /Noun \+ who \+ verb/);
  assert.match(bodyHtml, /data-field="examples"/);
  assert.match(bodyHtml, /Example one — Пример один/);
  assert.match(bodyHtml, /data-grammar-rule="Relative clauses"/);
});

test('lmPreviewBlock renders rich reading card with explanation, pattern, and examples for students', () => {
  const ctx = createLessonContext();
  const ruleBlock = {
    id: 'r2',
    type: 'rule',
    tab: 'rules',
    title: 'Sentence Connectors',
    name: 'Sentence Connectors',
    grammarRule: 'Relative clauses',
    explanation: 'Rules for connectors in compound sentences.',
    pattern: 'Clause 1; however, Clause 2.',
    examples: ['Although late, they worked. — Хотя было поздно, они работали.']
  };

  const previewHtml = ctx.lmPreviewBlock(ruleBlock);
  assert.match(previewHtml, /<h3[^>]*>Sentence Connectors<\/h3>/);
  assert.match(previewHtml, /Rules for connectors in compound sentences\./);
  assert.match(previewHtml, /Clause 1; however, Clause 2\./);
  assert.match(previewHtml, /Although late, they worked\. — Хотя было поздно, они работали\./);
  assert.match(previewHtml, /data-grammar-rule="Relative clauses"/);
});

test('lmSummary returns actual rule title and lmBlank creates populated rule defaults', () => {
  const ctx = createLessonContext();
  const blankRule = ctx.lmBlank('rule');
  assert.equal(blankRule.type, 'rule');
  assert.equal(blankRule.title, 'New rule');
  assert.equal(blankRule.examples.length, 0);

  const summary = ctx.lmSummary({ type: 'rule', title: 'Passive Voice in Context', name: 'Passive Voice' });
  assert.equal(summary, 'Passive Voice in Context');
});
