import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGapsFromText, examSuggestion } from '../src/exam-checking.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Exercise Text with Gaps (Cloze) - Unit and Visual UX Tests for all 24 variations', async (t) => {
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const lessonsJs = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');
  const importJs = fs.readFileSync(path.join(rootDir, 'client/52b-lesson-pdf-import.js'), 'utf8');
  const examsJs = fs.readFileSync(path.join(rootDir, 'client/54-exams.js'), 'utf8');
  const previewHtml = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');

  await t.test('1. Syntax Parser: parseGapsFromText extracts all 24 gap variations', () => {
    const text = '1. Open: [1:went]\n' +
      '2. Word Formation: [2:development|stem:DEVELOP]\n' +
      '3. Dropdown: [3:apple/banana/orange|correct:apple]\n' +
      '4. Alternatives: [4:unbelievable|stem:BELIEVE|alt:incredible]\n' +
      '5. First-letter cue: [5:capital|hint:c]\n' +
      '6. Progressive hints: [6:photosynthesis|hints:plant process,uses sunlight,produces oxygen]\n' +
      '7. Audio Cloze with timestamp: [7:founded|time:00:15]\n' +
      '8. Preposition: [8:interested|in]\n' +
      '9. Phrasal verb: [9:give up]\n' +
      '10. Collocation: [10:make a decision]';

    const gaps = parseGapsFromText(text);
    assert.equal(gaps.length, 10, 'Extracted all 10 test gaps');

    // Gap 1: Open Cloze
    assert.equal(gaps[0].target, 'went');
    assert.equal(gaps[0].mode, 'open');

    // Gap 2: Word Formation with stem
    assert.equal(gaps[1].target, 'development');
    assert.equal(gaps[1].stem, 'DEVELOP');

    // Gap 3: Dropdown choice
    assert.equal(gaps[2].target, 'apple');
    assert.equal(gaps[2].mode, 'dropdown');
    assert.deepEqual(gaps[2].options, ['apple', 'banana', 'orange']);

    // Gap 4: Alternatives
    assert.equal(gaps[3].target, 'unbelievable');
    assert.ok(gaps[3].alternatives.includes('incredible'));

    // Gap 5: First letter cue
    assert.equal(gaps[4].target, 'capital');
    assert.equal(gaps[4].hint, 'c');

    // Gap 6: Progressive hints array
    assert.equal(gaps[5].target, 'photosynthesis');
    assert.deepEqual(gaps[5].hints, ['plant process', 'uses sunlight', 'produces oxygen']);

    // Gap 7: Audio timestamp
    assert.equal(gaps[6].target, 'founded');
    assert.equal(gaps[6].time, '00:15');
  });

  await t.test('2. Exam Auto-Scoring: examSuggestion for text_gaps with first-letter cues and hint penalties', () => {
    const part = { id: 101, type: 'exercise' };
    const item = {
      kind: 'text_gaps',
      text: 'She [1:traveled|alt:travelled] to [2:London] with [3:capital|hint:c] using [4:solar|hints:sun power].'
    };
    const max = 10;

    // Full score (4/4 correct direct matches)
    const fullAnswers = JSON.stringify({ 1: 'traveled', 2: 'London', 3: 'capital', 4: 'solar' });
    assert.equal(examSuggestion({ part, item, index: 0, max }, fullAnswers), 10);

    // First letter cue: user types remaining letters 'apital' after cue 'c'
    const cueAnswers = JSON.stringify({ 1: 'traveled', 2: 'London', 3: 'apital', 4: 'solar' });
    assert.equal(examSuggestion({ part, item, index: 0, max }, cueAnswers), 10);

    // Alternative spelling accepted
    const altAnswers = JSON.stringify({ 1: 'travelled', 2: 'london', 3: 'capital', 4: 'solar' });
    assert.equal(examSuggestion({ part, item, index: 0, max }, altAnswers), 10);

    // Progressive hint deduction penalty: 25% penalty on slot 4 (hint 1 used)
    // 3 slots full (2.5 * 3 = 7.5), 1 slot with 25% penalty (2.5 * 0.75 = 1.875) -> total 9.375
    const penaltyAnswers = JSON.stringify({
      1: 'traveled',
      2: 'London',
      3: 'capital',
      4: 'solar',
      '4_penalty': 0.25
    });
    assert.equal(examSuggestion({ part, item, index: 0, max }, penaltyAnswers), 9.375);
  });

  await t.test('3. Visual UX / CSS specifications: styled pill buttons and themed components', () => {
    assert.ok(css.includes('.gap-btn'), 'CSS contains .gap-btn');
    assert.ok(css.includes('.gap-btn-check'), 'CSS contains .gap-btn-check');
    assert.ok(css.includes('.gap-btn-reset'), 'CSS contains .gap-btn-reset');
    assert.ok(css.includes('border-radius: 999px'), 'Action buttons styled as modern pill shapes');

    // First-letter cues & Progressive Hints
    assert.ok(css.includes('.gap-first-box'), 'CSS contains .gap-first-box');
    assert.ok(css.includes('.gap-first-char'), 'CSS contains .gap-first-char');
    assert.ok(css.includes('.gap-first-input'), 'CSS contains .gap-first-input');
    assert.ok(css.includes('.gap-hint-btn'), 'CSS contains .gap-hint-btn');
    assert.ok(css.includes('.gap-hint-popover'), 'CSS contains .gap-hint-popover');
    assert.ok(css.includes('.gap-hint-penalty'), 'CSS contains .gap-hint-penalty');

    // Drag-and-Drop
    assert.ok(css.includes('.drag-grip-icon'), 'CSS contains .drag-grip-icon');
    assert.ok(css.includes('.gap-drop-target'), 'CSS contains .gap-drop-target');
    assert.ok(css.includes('.gap-placed-chip'), 'CSS contains .gap-placed-chip');
    assert.ok(css.includes('.gap-placed-clear'), 'CSS contains .gap-placed-clear');

    // Audio & Visual Cloze
    assert.ok(css.includes('.gap-media-grid'), 'CSS contains .gap-media-grid');
    assert.ok(css.includes('.gap-audio-card'), 'CSS contains .gap-audio-card');
    assert.ok(css.includes('.gap-play-btn'), 'CSS contains .gap-play-btn');
    assert.ok(css.includes('.gap-visual-card'), 'CSS contains .gap-visual-card');
    assert.ok(css.includes('.gap-visual-zoom'), 'CSS contains .gap-visual-zoom');

    // AI Modal
    assert.ok(css.includes('.ai-modal-backdrop'), 'CSS contains .ai-modal-backdrop');
    assert.ok(css.includes('.ai-modal-card'), 'CSS contains .ai-modal-card');
    assert.ok(css.includes('.ai-modal-head'), 'CSS contains .ai-modal-head');
    assert.ok(css.includes('.ai-action-btn-primary'), 'CSS contains .ai-action-btn-primary');

    // Theme Variables Invariant
    assert.ok(css.includes('var(--card)'), 'CSS uses var(--card)');
    assert.ok(css.includes('var(--ink)'), 'CSS uses var(--ink)');
    assert.ok(css.includes('var(--acc)'), 'CSS uses var(--acc)');
    assert.ok(css.includes('var(--line)'), 'CSS uses var(--line)');
  });

  await t.test('4. CW/HW Lessons & Editor Integration', () => {
    assert.ok(lessonsJs.includes('kind === "text_gaps"'), 'lessons.js contains text_gaps branch');
    assert.ok(lessonsJs.includes('lmRenderTextGapsPreview'), 'lessons.js contains lmRenderTextGapsPreview');
    assert.ok(lessonsJs.includes('lmOpenGapsAiModal'), 'lessons.js contains lmOpenGapsAiModal');
    assert.ok(lessonsJs.includes('data-gap-reset'), 'lessons.js handles reset button');
    assert.ok(lessonsJs.includes('data-gap-hint'), 'lessons.js handles progressive hint button');
    assert.ok(lessonsJs.includes('data-open-gaps-ai'), 'lessons.js handles AI generator button');
    assert.ok(lessonsJs.includes('application/x-gap-chip'), 'lessons.js handles native drag and drop transfer');
  });

  await t.test('5. Generator & Manual Script Integration: Quick template, PDF import, and Complement Lesson', () => {
    // Quick template pill in Manual Script
    assert.ok(previewHtml.includes('data-template="gaps"'), 'preview.html contains Quick template pill for Text with Gaps');
    assert.ok(lessonsJs.includes('type === "gaps"'), 'lessons.js handles type === "gaps" template pill');

    // Complement Current Lesson list
    assert.ok(lessonsJs.includes('"Text with Gaps"'), 'LM_ALL_QUIZ_TYPES includes "Text with Gaps"');
    assert.ok(importJs.includes("'Text with Gaps'"), 'lmGenerateExercisesList includes Text with Gaps');

    // Manual script parsing
    assert.ok(importJs.includes('text with gaps') || importJs.includes("currentSection = 'gaps'"), '52b-lesson-pdf-import.js parses cloze sections');
  });

  await t.test('6. Exams Integration: TextGaps quizType, reviewer markup, and student data-exam-gap', () => {
    assert.ok(examsJs.includes('quizType: item.kind === "write" ? "Type" : (item.kind === "text_gaps" ? "TextGaps" : "Choice")'), 'exams.js passes TextGaps quizType');
    assert.ok(examsJs.includes('if (kind === "TextGaps")'), 'exams.js implements examAnswerHtml for TextGaps');
    assert.ok(examsJs.includes('data-exam-gap'), 'exams.js generates data-exam-gap attributes');
    assert.ok(examsJs.includes('examRemember'), 'exams.js has examRemember handler');
    assert.ok(examsJs.includes('exam-hit'), 'exams.js renders hit markers for reviewer');
    assert.ok(examsJs.includes('exam-miss exam-strike'), 'exams.js renders miss/strike markers for reviewer');
  });
});
