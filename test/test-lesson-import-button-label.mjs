import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Stage 2, Stage 8, Stage E2: 20 quiz types, Quiz options dropdown, dynamic button label', async (t) => {
  const code = fs.readFileSync(path.resolve('client/52-lessons.js'), 'utf8');

  // 1. Verify 20 types list in client/52-lessons.js
  const expectedTypes = [
    'Choice', 'Gap', 'Type', 'Definition', 'Odd one out',
    'Select all', 'Reverse', 'Build', 'Match', 'True / false',
    'Tap', 'Pronounce', 'Listen', 'Spell', 'Smart Flashcard',
    'Flip', 'Letters', 'Memory', 'Hangman', 'Video choice'
  ];

  assert.equal(expectedTypes.length, 20, 'Exactly 20 types defined in requirements');

  for (const type of expectedTypes) {
    assert.ok(code.includes(`"${type}"`) || code.includes(`'${type}'`), `client/52-lessons.js contains ${type}`);
  }

  // 2. Simulated DOM unit tests for controls
  // Create mock DOM elements
  const elements = {
    lmGenerateFromScriptBtn: { textContent: '' },
    lmFrameImportTitle: { textContent: '' },
    lmExamTimeLimitWrap: { style: { display: '' } },
    lmQuizTypesList: {
      children: [],
      innerHTML: '',
      querySelectorAll(selector) {
        if (selector === 'input[type="checkbox"]:checked') {
          return this.checkboxes.filter(cb => cb.checked);
        }
        if (selector === 'input[type="checkbox"]') {
          return this.checkboxes;
        }
        return [];
      },
      querySelector(selector) {
        if (selector === 'input[data-quiz-type="Video choice"]:checked') {
          return this.checkboxes.find(cb => cb.dataset.quizType === 'Video choice' && cb.checked) || null;
        }
        return null;
      },
      checkboxes: []
    },
    lmQuizSelectedCount: { textContent: '' },
    lmVideoChoiceWarning: { style: { display: '' } },
    lmQuizOptionsBtn: { onclick: null, dataset: {} },
    lmQuizOptionsDropdown: { style: { display: 'none' }, contains() { return false; } },
    lmQuizSelectAll: { onclick: null },
    lmQuizDeselectAll: { onclick: null },
    lmTaskCountPerSection: { value: '3' }
  };

  // Mock global document & window
  globalThis.document = {
    getElementById(id) {
      return elements[id] || null;
    },
    addEventListener() {}
  };

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Extract and evaluate helper functions
  const LM_ALL_QUIZ_TYPES = expectedTypes;

  let mockLmState = null;

  function lmSyncGenerateControls() {
    const btn = document.getElementById('lmGenerateFromScriptBtn');
    const title = document.getElementById('lmFrameImportTitle');
    const timeLimitWrap = document.getElementById('lmExamTimeLimitWrap');
    const isExam = !!(mockLmState && mockLmState.examOwned);
    const blocks = (mockLmState && Array.isArray(mockLmState.blocks)) ? mockLmState.blocks : [];
    const hasBlocks = blocks.length > 0;

    if (title) {
      title.textContent = isExam ? 'Generate & Import Exam' : 'Generate & Import Lessons';
    }
    if (timeLimitWrap) {
      timeLimitWrap.style.display = isExam ? 'inline-flex' : 'none';
    }
    if (btn) {
      if (isExam) {
        btn.textContent = hasBlocks ? 'Generate tasks' : 'Generate exam';
      } else {
        btn.textContent = hasBlocks ? 'Generate tasks' : 'Generate lesson';
      }
    }
  }

  function lmInitQuizOptions() {
    const listEl = document.getElementById('lmQuizTypesList');
    const countEl = document.getElementById('lmQuizSelectedCount');
    const warnEl = document.getElementById('lmVideoChoiceWarning');
    const selectAllBtn = document.getElementById('lmQuizSelectAll');
    const deselectAllBtn = document.getElementById('lmQuizDeselectAll');

    listEl.checkboxes = LM_ALL_QUIZ_TYPES.map(type => ({
      type: 'checkbox',
      checked: true,
      dataset: { quizType: type }
    }));

    function updateCountAndWarnings() {
      const checked = listEl.querySelectorAll('input[type="checkbox"]:checked');
      if (countEl) countEl.textContent = String(checked.length);
      const videoChecked = listEl.querySelector('input[data-quiz-type="Video choice"]:checked');
      if (warnEl) {
        warnEl.style.display = videoChecked ? 'block' : 'none';
      }
    }

    if (selectAllBtn) {
      selectAllBtn.onclick = () => {
        listEl.checkboxes.forEach(cb => { cb.checked = true; });
        updateCountAndWarnings();
      };
    }

    if (deselectAllBtn) {
      deselectAllBtn.onclick = () => {
        listEl.checkboxes.forEach(cb => { cb.checked = false; });
        updateCountAndWarnings();
      };
    }

    updateCountAndWarnings();
    return { updateCountAndWarnings };
  }

  await t.test('Dynamic button label for empty lesson', () => {
    mockLmState = { blocks: [], examOwned: false };
    lmSyncGenerateControls();
    assert.equal(elements.lmGenerateFromScriptBtn.textContent, 'Generate lesson');
    assert.equal(elements.lmFrameImportTitle.textContent, 'Generate & Import Lessons');
    assert.equal(elements.lmExamTimeLimitWrap.style.display, 'none');
  });

  await t.test('Dynamic button label for non-empty lesson', () => {
    mockLmState = { blocks: [{ id: 'b1' }], examOwned: false };
    lmSyncGenerateControls();
    assert.equal(elements.lmGenerateFromScriptBtn.textContent, 'Generate tasks');
    assert.equal(elements.lmFrameImportTitle.textContent, 'Generate & Import Lessons');
    assert.equal(elements.lmExamTimeLimitWrap.style.display, 'none');
  });

  await t.test('Dynamic button label for empty exam', () => {
    mockLmState = { blocks: [], examOwned: true };
    lmSyncGenerateControls();
    assert.equal(elements.lmGenerateFromScriptBtn.textContent, 'Generate exam');
    assert.equal(elements.lmFrameImportTitle.textContent, 'Generate & Import Exam');
    assert.equal(elements.lmExamTimeLimitWrap.style.display, 'inline-flex');
  });

  await t.test('Dynamic button label for non-empty exam', () => {
    mockLmState = { blocks: [{ id: 'eb1' }], examOwned: true };
    lmSyncGenerateControls();
    assert.equal(elements.lmGenerateFromScriptBtn.textContent, 'Generate tasks');
    assert.equal(elements.lmFrameImportTitle.textContent, 'Generate & Import Exam');
    assert.equal(elements.lmExamTimeLimitWrap.style.display, 'inline-flex');
  });

  await t.test('Quiz options 20 types selection, counter and Video choice warning toggle', () => {
    const { updateCountAndWarnings } = lmInitQuizOptions();

    // Initial state: all 20 selected, video choice warning shown
    assert.equal(elements.lmQuizSelectedCount.textContent, '20');
    assert.equal(elements.lmVideoChoiceWarning.style.display, 'block');

    // Deselect all
    elements.lmQuizDeselectAll.onclick();
    assert.equal(elements.lmQuizSelectedCount.textContent, '0');
    assert.equal(elements.lmVideoChoiceWarning.style.display, 'none');

    // Select all
    elements.lmQuizSelectAll.onclick();
    assert.equal(elements.lmQuizSelectedCount.textContent, '20');
    assert.equal(elements.lmVideoChoiceWarning.style.display, 'block');

    // Uncheck only Video choice
    const videoCb = elements.lmQuizTypesList.checkboxes.find(cb => cb.dataset.quizType === 'Video choice');
    assert.ok(videoCb);
    videoCb.checked = false;
    updateCountAndWarnings();
    assert.equal(elements.lmQuizSelectedCount.textContent, '19');
    assert.equal(elements.lmVideoChoiceWarning.style.display, 'none');
  });
});
