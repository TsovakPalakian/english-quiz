import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { extractFunctions } from './helpers/extract-function.mjs';

const source = fs.readFileSync('client/52b-lesson-pdf-import.js', 'utf8');

function setupAppendEnvironment() {
  const code = extractFunctions(source, 'lmPdfIdentity', 'lmPdfContentKey', 'lmPdfAppendSections');
  const sandbox = {
    crypto: globalThis.crypto || crypto.webcrypto,
    TextEncoder,
    Uint8Array,
    JSON,
    Set,
    Object,
    Array,
    String,
    lmBlank(type) {
      return { id: 'blank-' + type, type, tab: 'overview' };
    }
  };
  vm.runInNewContext(
    code + '\nthis.lmPdfAppendSections = lmPdfAppendSections;\nthis.lmPdfContentKey = lmPdfContentKey;\nthis.lmPdfIdentity = lmPdfIdentity;',
    sandbox
  );
  return sandbox;
}

test('lmPdfAppendSections safely handles existing overview block without html property (Bug c71dbd83)', async () => {
  const env = setupAppendEnvironment();
  const draft = {
    blocks: [
      { id: 'b-heading', type: 'heading', tab: 'overview', level: 'h2', text: 'Lesson Title' }
    ]
  };
  const overviewBlock = {
    type: 'text',
    tab: 'overview',
    html: '<p>Imported lesson overview description</p>',
    pdfImport: { source: 'hash1', section: 'overview', key: 'overview:v2:123' }
  };
  const groups = { overview: [overviewBlock] };
  const selected = new Set(['overview']);

  const added = await env.lmPdfAppendSections(draft, groups, selected, 'hash1', 'lesson.pdf', 'Lesson');
  assert.equal(added, 1);
  assert.equal(draft.blocks.length, 2);
  const textBlock = draft.blocks.find(b => b.type === 'text');
  assert.ok(textBlock);
  assert.equal(textBlock.html, '<p>Imported lesson overview description</p>');
});

test('lmPdfAppendSections safely merges into existing text block when existing.html is undefined or empty', async () => {
  const env = setupAppendEnvironment();
  const draft = {
    blocks: [
      { id: 'b-text', type: 'text', tab: 'overview' }
    ]
  };
  const overviewBlock = {
    type: 'text',
    tab: 'overview',
    html: '<p>New overview content</p>',
    pdfImport: { source: 'hash1', section: 'overview', key: 'overview:v2:456' }
  };
  const groups = { overview: [overviewBlock] };
  const selected = new Set(['overview']);

  const added = await env.lmPdfAppendSections(draft, groups, selected, 'hash1', 'lesson.pdf', 'Lesson');
  assert.equal(added, 1);
  assert.equal(draft.blocks.length, 1);
  assert.equal(draft.blocks[0].html, '<p>New overview content</p>');
});

test('lmPdfAppendSections appends with separator when existing text block has existing html', async () => {
  const env = setupAppendEnvironment();
  const draft = {
    blocks: [
      { id: 'b-text', type: 'text', tab: 'overview', html: '<p>First part of overview</p>' }
    ]
  };
  const overviewBlock = {
    type: 'text',
    tab: 'overview',
    html: '<p>Second part of overview</p>',
    pdfImport: { source: 'hash1', section: 'overview', key: 'overview:v2:789' }
  };
  const groups = { overview: [overviewBlock] };
  const selected = new Set(['overview']);

  const added = await env.lmPdfAppendSections(draft, groups, selected, 'hash1', 'lesson.pdf', 'Lesson');
  assert.equal(added, 1);
  assert.equal(draft.blocks.length, 1);
  assert.ok(draft.blocks[0].html.includes('First part of overview'));
  assert.ok(draft.blocks[0].html.includes('Second part of overview'));
  assert.ok(draft.blocks[0].html.includes('<hr'));
});

test('lmPdfAppendSections prevents duplicate overview if html is already included', async () => {
  const env = setupAppendEnvironment();
  const draft = {
    blocks: [
      { id: 'b-text', type: 'text', tab: 'overview', html: '<p>Existing overview content</p>' }
    ]
  };
  const overviewBlock = {
    type: 'text',
    tab: 'overview',
    html: '<p>Existing overview content</p>',
    pdfImport: { source: 'hash1', section: 'overview', key: 'overview:v2:999' }
  };
  const groups = { overview: [overviewBlock] };
  const selected = new Set(['overview']);

  const added = await env.lmPdfAppendSections(draft, groups, selected, 'hash1', 'lesson.pdf', 'Lesson');
  assert.equal(added, 0);
  assert.equal(draft.blocks.length, 1);
  assert.equal(draft.blocks[0].html, '<p>Existing overview content</p>');
});

test('lmPdfAppendSections appends overview block when draft.blocks is empty', async () => {
  const env = setupAppendEnvironment();
  const draft = {
    blocks: []
  };
  const overviewBlock = {
    type: 'text',
    tab: 'overview',
    html: '<p>Initial overview</p>',
    pdfImport: { source: 'hash1', section: 'overview', key: 'overview:v2:000' }
  };
  const groups = { overview: [overviewBlock] };
  const selected = new Set(['overview']);

  const added = await env.lmPdfAppendSections(draft, groups, selected, 'hash1', 'lesson.pdf', 'Lesson');
  assert.equal(added, 1);
  assert.equal(draft.blocks.length, 1);
  assert.equal(draft.blocks[0].html, '<p>Initial overview</p>');
});
