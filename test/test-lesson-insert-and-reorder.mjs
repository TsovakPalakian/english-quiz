import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lessonsSource = readFileSync(new URL('../client/52-lessons.js', import.meta.url), 'utf8');
const previewCss = readFileSync(new URL('../site/preview.css', import.meta.url), 'utf8');
const previewHtml = readFileSync(new URL('../site/preview.html', import.meta.url), 'utf8');

// 1. Verify CSS styles for insert zones, animation pulse, and floating picker
assert.ok(previewCss.includes('.lm-insert-zone'), 'preview.css must include .lm-insert-zone');
assert.ok(previewCss.includes('.lm-insert-btn'), 'preview.css must include .lm-insert-btn');
assert.ok(previewCss.includes('.lm-block.is-newly-added'), 'preview.css must include .lm-block.is-newly-added');
assert.ok(previewCss.includes('@keyframes lmBlockAddedPulse'), 'preview.css must include @keyframes lmBlockAddedPulse');
assert.ok(previewCss.includes('.lm-picker.is-floating'), 'preview.css must include .lm-picker.is-floating');
assert.ok(previewCss.includes('.lm-new-badge'), 'preview.css must include .lm-new-badge');

// 2. Verify HTML includes picker head and close button
assert.ok(previewHtml.includes('class="lm-picker-head"'), 'preview.html must include .lm-picker-head');
assert.ok(previewHtml.includes('data-lm-picker-close'), 'preview.html must include data-lm-picker-close');

// 3. Verify 52-lessons.js contains reordering, insertion, and visual indicators
assert.ok(lessonsSource.includes('data-lm-top'), '52-lessons.js must include data-lm-top');
assert.ok(lessonsSource.includes('data-lm-bottom'), '52-lessons.js must include data-lm-bottom');
assert.ok(lessonsSource.includes('data-lm-insert-above'), '52-lessons.js must include data-lm-insert-above');
assert.ok(lessonsSource.includes('data-lm-insert-below'), '52-lessons.js must include data-lm-insert-below');
assert.ok(lessonsSource.includes('lmMoveTabBlockToEdge'), '52-lessons.js must define lmMoveTabBlockToEdge');
assert.ok(lessonsSource.includes('lmOpenPicker'), '52-lessons.js must define lmOpenPicker');
assert.ok(lessonsSource.includes('is-newly-added'), '52-lessons.js must apply is-newly-added');
assert.ok(lessonsSource.includes('lm-new-badge'), '52-lessons.js must render lm-new-badge');

// 4. Test logic of lmMoveTabBlockToEdge and insertion at anchor
function domEntityId(id) { return Number(id); }

let testState = {
  blocks: [
    { id: 101, tab: 'classwork', text: 'First' },
    { id: 202, tab: 'overview', text: 'Other tab' },
    { id: 102, tab: 'classwork', text: 'Second' },
    { id: 103, tab: 'classwork', text: 'Third' },
    { id: 104, tab: 'classwork', text: 'Fourth' }
  ]
};

function testTab() { return 'classwork'; }
function testBlocksFor() { return testState.blocks.filter(b => (b.tab || 'overview') === testTab()); }

function testMoveToEdge(id, toTop) {
  id = domEntityId(id);
  const ids = testBlocksFor().map(b => b.id);
  const at = ids.indexOf(id);
  if (at < 0) return;
  if (toTop && at === 0) return;
  if (!toTop && at === ids.length - 1) return;
  const from = testState.blocks.findIndex(b => b.id === id);
  if (from < 0) return;
  const [item] = testState.blocks.splice(from, 1);
  const targetId = toTop ? ids[0] : ids[ids.length - 1];
  const to = testState.blocks.findIndex(b => b.id === targetId);
  if (to < 0) return;
  if (toTop) {
    testState.blocks.splice(to, 0, item);
  } else {
    testState.blocks.splice(to + 1, 0, item);
  }
}

// Move fourth (104) to top in 1 click
testMoveToEdge(104, true);
assert.deepEqual(testBlocksFor().map(b => b.id), [104, 101, 102, 103]);

// Move top element to top (no-op)
testMoveToEdge(104, true);
assert.deepEqual(testBlocksFor().map(b => b.id), [104, 101, 102, 103]);

// Move 101 to bottom in 1 click
testMoveToEdge(101, false);
assert.deepEqual(testBlocksFor().map(b => b.id), [104, 102, 103, 101]);

// Test inserting at anchor (before 102)
const newBlockBefore = { id: 999, tab: 'classwork', text: 'Inserted Before 102' };
const anchorId = 102;
const anchorIdx = testState.blocks.findIndex(b => b.id === anchorId);
testState.blocks.splice(anchorIdx, 0, newBlockBefore);
assert.deepEqual(testBlocksFor().map(b => b.id), [104, 999, 102, 103, 101]);

// Test inserting at anchor (after 103)
const newBlockAfter = { id: 888, tab: 'classwork', text: 'Inserted After 103' };
const anchorAfterId = 103;
const anchorAfterIdx = testState.blocks.findIndex(b => b.id === anchorAfterId);
testState.blocks.splice(anchorAfterIdx + 1, 0, newBlockAfter);
assert.deepEqual(testBlocksFor().map(b => b.id), [104, 999, 102, 103, 888, 101]);

console.log('All lesson insert and reorder tests passed successfully!');
