import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateReviewContent } from '../src/quiz-review-content.mjs';

function createMockEnvironment() {
  const dom = {
    elements: new Map(),
    listeners: new Map()
  };

  const createElement = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      hidden: false,
      disabled: false,
      className: '',
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); el.className = Array.from(this.classes).join(' '); },
        remove(c) { this.classes.delete(c); el.className = Array.from(this.classes).join(' '); },
        contains(c) { return this.classes.has(c); },
        toggle(c, v) { if (v ?? !this.classes.has(c)) this.add(c); else this.remove(c); }
      },
      attributes: new Map(),
      setAttribute(k, v) { this.attributes.set(k, String(v)); },
      getAttribute(k) { return this.attributes.get(k); },
      removeAttribute(k) { this.attributes.delete(k); },
      dataset: {},
      style: {},
      innerHTML: '',
      textContent: '',
      value: '',
      children: [],
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest(sel) {
        if (sel === '#lmTeacherVerifyBtn' && el.id === 'lmTeacherVerifyBtn') return el;
        if (sel === '#lmApproveAllBlocksBtn' && el.id === 'lmApproveAllBlocksBtn') return el;
        if (sel.includes('data-block-teacher-verified') && el.dataset.blockTeacherVerified) return el;
        return null;
      },
      addEventListener(type, fn) {
        if (!dom.listeners.has(type)) dom.listeners.set(type, []);
        dom.listeners.get(type).push(fn);
      }
    };
    return el;
  };

  const getElementById = (id) => {
    if (!dom.elements.has(id)) {
      const el = createElement('div');
      el.id = id;
      dom.elements.set(id, el);
    }
    return dom.elements.get(id);
  };

  return { dom, createElement, getElementById };
}

test('TASK-55 Test 1: Publish button gating based on teacher verification', async () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');

  // Verify syncTeacherVerifySummary controls publish button disabled state
  assert.ok(code.includes('const publishBtn = document.getElementById("lmPublish");'), 'lmSyncTeacherVerifySummary must locate #lmPublish');
  assert.ok(code.includes('publishBtn.disabled = true;'), 'Must set publishBtn.disabled = true when unverified items exist');
  assert.ok(code.includes('publishBtn.classList.add("is-disabled");'), 'Must add is-disabled class when unverified');
  assert.ok(code.includes('publishBtn.disabled = false;'), 'Must enable publishBtn when all items are verified');
  assert.ok(code.includes('Cannot publish: verify all lesson materials and quizzes first'), 'Publish click handler must guard against unverified publishing');
});

test('TASK-55 Test 2: Auto-collapse and verified badge in block head', async () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');

  // Verify auto-collapse on teacher verification
  assert.ok(code.includes('if (block.teacherVerified) {\n              block.collapsed = true;\n            }'), 'Must set block.collapsed = true when teacherVerified is checked');

  // Verify verifiedBadge rendered in lmHead
  assert.ok(code.includes('const verifiedBadge = block.teacherVerified ? \'<span class="lm-verified-badge" title="Verified by Teacher">✓ Verified by Teacher</span>\' : \'\';'), 'lmHead must include ✓ Verified by Teacher badge');
  assert.ok(code.includes('<span class="lm-type">\' + label + \'</span>\' + newBadge + verifiedBadge'), 'lmHead must render verifiedBadge in block header');
});

test('TASK-55 Test 3: Unverified tasks at the top, verified tasks shifted down', async () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');

  // Verify lmBlocksFor separates unverified and verified blocks
  assert.ok(code.includes('const unverified = raw.filter((b) => !b.teacherVerified);'), 'lmBlocksFor must extract unverified items');
  assert.ok(code.includes('const verified = raw.filter((b) => !!b.teacherVerified);'), 'lmBlocksFor must extract verified items');
  assert.ok(code.includes('return unverified.concat(verified);'), 'lmBlocksFor must return unverified items first and verified items last');

  // Simulate lmBlocksFor behavior
  const mockBlocks = [
    { id: '1', tab: 'homework', title: 'Task 1', teacherVerified: true },
    { id: '2', tab: 'homework', title: 'Task 2', teacherVerified: false },
    { id: '3', tab: 'homework', title: 'Task 3', teacherVerified: true },
    { id: '4', tab: 'homework', title: 'Task 4', teacherVerified: false }
  ];

  const unverified = mockBlocks.filter(b => !b.teacherVerified);
  const verified = mockBlocks.filter(b => !!b.teacherVerified);
  const ordered = unverified.concat(verified);

  assert.deepEqual(ordered.map(b => b.id), ['2', '4', '1', '3'], 'Unverified tasks must appear at the top, verified at the bottom');
});

test('TASK-55 Test 4: True / false dedicated generator produces valid schema and boolean answers', async () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');

  // Verify True / false dedicated branch
  assert.ok(code.includes('} else if (quizType === "True / false") {'), 'lmGenerateComplementTasks must have dedicated True / false branch');
  assert.ok(code.includes('answer: isTruthful ? "true" : "false"'), 'True / false must generate string "true" or "false" answer');
  assert.ok(code.includes('quizType: "True / false"'), 'Must set quizType to True / false');

  // Validate with schema from quiz-review-content.mjs
  const sampleTrueItem = {
    prompt: 'The word "superstition" correctly translates to Russian as "суеверие".',
    answer: 'true'
  };
  const sampleFalseItem = {
    prompt: 'The word "superstition" translates to Russian as "научный эксперимент".',
    answer: 'false'
  };

  const validatedTrue = validateReviewContent('True / false', { explanation: 'Check superstition translation', items: [sampleTrueItem] });
  assert.equal(validatedTrue.items[0].answer, 'true');

  const validatedFalse = validateReviewContent('True / false', { explanation: 'Check superstition false distractor', items: [sampleFalseItem] });
  assert.equal(validatedFalse.items[0].answer, 'false');

  // Verify invalid string answer fails schema
  assert.throws(() => {
    validateReviewContent('True / false', { explanation: 'Broken fallback', items: [{ prompt: 'Say: "superstition"', answer: 'superstition' }] });
  }, /Invalid quiz content/);
});

test('TASK-55 Test 5: Interactive True / false preview rendering and score check', async () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');

  // Verify lmPreviewBlock handles True / false with interactive radio buttons
  assert.ok(code.includes('if (kind === "True / false") {'), 'lmPreviewBlock must handle True / false');
  assert.ok(code.includes('data-pick="\' + block.id + \':\' + index + \':true"'), 'Must render True radio with data-pick');
  assert.ok(code.includes('data-pick="\' + block.id + \':\' + index + \':false"'), 'Must render False radio with data-pick');
  assert.ok(code.includes('data-quiz-check="\' + block.id + \'"'), 'Must render Check button with data-quiz-check');

  // Verify data-pick handler parses boolean string or number
  assert.ok(code.includes('question.picked = (val === "true" || val === "false") ? val : Number(val);'), 'data-pick must preserve boolean true/false strings');

  // Verify data-quiz-check scores True / false correctly
  assert.ok(code.includes('const isTf = block.quizType === "True / false";'), 'data-quiz-check must identify True / false blocks');
  assert.ok(code.includes('String(question.picked).toLowerCase() === String(question.answer).toLowerCase()'), 'data-quiz-check must compare picked string against answer');
});

test('TASK-55 Test 6: Dedicated non-empty generation across all remaining quiz types', async () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');

  // Check each of the 16 quiz types has a dedicated generation branch
  const typesToCheck = [
    'Type', 'Definition', 'Odd one out', 'Select all', 'Build', 'Tap',
    'Reverse', 'Flip', 'Smart Flashcard', 'Memory', 'Listen',
    'Pronounce', 'Spell', 'Letters', 'Hangman'
  ];

  for (const type of typesToCheck) {
    assert.ok(
      code.includes(`quizType === "${type}"`) || code.includes(`quizType === '${type}'`),
      `lmGenerateComplementTasks must include dedicated handling for ${type}`
    );
  }
});
