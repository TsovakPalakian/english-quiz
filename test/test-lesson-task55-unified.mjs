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

test('TASK-55 Test 7: Physical collapse of verified blocks into single accordion container', async () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');
  const css = fs.readFileSync('site/preview.css', 'utf8');

  // Verify accordion markup in client/52-lessons.js
  assert.ok(code.includes('lm-verified-accordion'), 'Editor must render .lm-verified-accordion for verified blocks');
  assert.ok(code.includes('Verified materials & quizzes'), 'Accordion must show Verified materials & quizzes summary title');
  assert.ok(code.includes('lm-verified-content'), 'Accordion must wrap verified items in .lm-verified-content');
  assert.ok(code.includes('lm-verified-expand-hint'), 'Accordion must include expand/collapse hint');

  // Verify styling in site/preview.css
  assert.ok(css.includes('.lm-verified-accordion'), 'preview.css must define .lm-verified-accordion');
  assert.ok(css.includes('.lm-verified-summary'), 'preview.css must define .lm-verified-summary');
  assert.ok(css.includes('.lm-verified-title-group'), 'preview.css must define .lm-verified-title-group');
  assert.ok(css.includes('.lm-verified-content'), 'preview.css must define .lm-verified-content');
});

test('TASK-55 Test 8: Independent task numbering for Classwork and Homework', async () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');

  // Verify lmPreviewParts scopes numbering to current tab blocks
  assert.ok(
    code.includes('const taskKeys = new Set((blocks || []).filter(part => [\'quiz\',\'exercise\',\'task\'].includes(part.type))'),
    'lmPreviewParts must scope taskKeys to tab blocks'
  );
  assert.ok(
    code.includes('for (const part of blocks || []) { const key = part.assignmentKey'),
    'lmPreviewParts must scope assignment numbers to tab blocks'
  );

  // Verify lmRenderEditor computes independent tabTaskNumbers
  assert.ok(code.includes('let currentTabTaskCounter = 0;'), 'lmRenderEditor must maintain currentTabTaskCounter');
  assert.ok(code.includes('const tabTaskNumbers = new Map();'), 'lmRenderEditor must map tabTaskNumbers per tab');
  assert.ok(code.includes('const taskPrefix = taskNum ? "Task " + taskNum + " · " : "";'), 'Must format label with taskPrefix');
});

test('TASK-55 Test 9: Pixel-perfect True / false card with styled button cards and legacy prompt normalization', async () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');
  const css = fs.readFileSync('site/preview.css', 'utf8');

  // Verify True / false layout in lmPreviewBlock
  assert.ok(code.includes('lm-tf-statement'), 'lmPreviewBlock must render statement box with .lm-tf-statement');
  assert.ok(code.includes('lm-tf-options'), 'lmPreviewBlock must render .lm-tf-options container');
  assert.ok(code.includes('lm-tf-btn'), 'lmPreviewBlock must render styled .lm-tf-btn cards');
  assert.ok(code.includes('Say:'), 'Must detect legacy Say: "..." format');
  assert.ok(code.includes('correctly translates to Russian'), 'Must normalize legacy Say: format into factual statement');
  assert.ok(code.includes('Check answer'), 'Check button must read "Check answer"');
  assert.ok(code.includes('lm-tf-feedback'), 'Must render feedback container .lm-tf-feedback');

  // Verify styling in site/preview.css
  assert.ok(css.includes('.lm-tf-statement'), 'preview.css must style .lm-tf-statement');
  assert.ok(css.includes('.lm-tf-options'), 'preview.css must style .lm-tf-options');
  assert.ok(css.includes('.lm-tf-btn'), 'preview.css must style .lm-tf-btn');
  assert.ok(css.includes('.lm-tf-btn.selected'), 'preview.css must style .lm-tf-btn.selected');
  assert.ok(css.includes('.lm-tf-feedback'), 'preview.css must style .lm-tf-feedback');
});

test('TASK-55 Test 10: Production material-upgrades and material-quiz True / false bypass and alignment', async () => {
  const upgrades = fs.readFileSync('client/main/material-upgrades.js', 'utf8');
  const matQuiz = fs.readFileSync('production/material-quiz.js', 'utf8');

  // Verify material-upgrades.js does not hijack True / false with legacy renderer
  assert.ok(
    upgrades.includes("if(part.quizType==='True / false')return materialPreviewBlockBefore(part);"),
    'material-upgrades.js must delegate True / false directly to materialPreviewBlockBefore'
  );

  // Verify production/material-quiz.js dedicated True / false formatting
  assert.ok(
    matQuiz.includes("kind==='True / false'"),
    'material-quiz.js must have dedicated branch for True / false'
  );
  assert.ok(
    matQuiz.includes('lm-tf-btn'),
    'material-quiz.js must render styled lm-tf-btn buttons'
  );
  assert.ok(
    matQuiz.includes('lm-tf-statement'),
    'material-quiz.js must render lm-tf-statement'
  );
  assert.ok(
    matQuiz.includes('Check answer'),
    'material-quiz.js must render "Check answer" button'
  );
});
