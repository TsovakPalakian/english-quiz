import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function loadLessonsEnvironment() {
  const lessonsSrc = readFileSync(resolve(root, 'client/52-lessons.js'), 'utf8');

  // Extract functions needed for evaluation
  const parseGapsMatch = lessonsSrc.match(/function parseGapsFromText\(text\) \{[\s\S]*?\n    \}/);
  const evalMatch = lessonsSrc.match(/function calculateLessonEvaluation\(material\) \{[\s\S]*?\n    \}/);
  const htmlMatch = lessonsSrc.match(/function lmEvaluationHtml\(material\) \{[\s\S]*?\n    \}/);

  assert.ok(parseGapsMatch, 'parseGapsFromText must be present in 52-lessons.js');
  assert.ok(evalMatch, 'calculateLessonEvaluation must be present in 52-lessons.js');
  assert.ok(htmlMatch, 'lmEvaluationHtml must be present in 52-lessons.js');

  const createEnv = (learnedWords = [], startedList = [], viewAccount = null) => {
    const learnedSet = new Set(learnedWords.map(w => String(w).toLowerCase()));
    const started = [...startedList];
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const sandbox = {
      window: { viewAccount },
      loadLearned: () => learnedSet,
      loadStarted: () => started,
      esc
    };

    const fn = new Function('window', 'loadLearned', 'loadStarted', 'esc', `
      ${parseGapsMatch[0]};
      ${evalMatch[0]};
      ${htmlMatch[0]};
      return { calculateLessonEvaluation, lmEvaluationHtml };
    `);

    return fn(sandbox.window, sandbox.loadLearned, sandbox.loadStarted, sandbox.esc);
  };

  return { createEnv };
}

test('calculateLessonEvaluation evaluates standard lesson with all 4 components', () => {
  const { createEnv } = loadLessonsEnvironment();
  const env = createEnv([], []);

  const fullLesson = {
    id: 'lesson-all-4-components',
    blocks: [
      { id: 'w1', tab: 'words', type: 'wordcard', word: 'destination' },
      { id: 'w2', tab: 'words', type: 'wordcard', word: 'journey' },
      { id: 'p1', tab: 'phrases', type: 'wordcard', word: 'on track' },
      { id: 'p2', tab: 'phrases', type: 'wordcard', word: 'take off' },
      { id: 'cw1', tab: 'classwork', type: 'exercise', title: 'Dialogue Drill', items: [{ prompt: 'Q1', kind: 'choice' }] },
      { id: 'hw1', tab: 'homework', type: 'quiz', title: 'HW Quiz', items: [{ prompt: 'Q1' }] },
      { id: 'hw2', tab: 'homework', type: 'task', title: 'HW Essay', maxPoints: 5 }
    ]
  };

  // State 1: Not started
  const eval1 = env.calculateLessonEvaluation(fullLesson);
  assert.equal(eval1.activeComponents, 4);
  assert.equal(eval1.completedComponents, 0);
  assert.equal(eval1.status, 'Not started');
  assert.equal(eval1.components.words.isNa, false);
  assert.equal(eval1.components.phrases.isNa, false);
  assert.equal(eval1.components.classwork.isNa, false);
  assert.equal(eval1.components.homework.isNa, false);

  // State 2: Words and phrases mastered, classwork checked, 1 HW task completed and 1 HW task pending
  const envPartial = createEnv(['destination', 'journey', 'on track', 'take off'], [fullLesson.id]);
  fullLesson.blocks[4].checked = true; // classwork checked
  fullLesson.blocks[5].checked = true; // hw1 checked
  const eval2 = envPartial.calculateLessonEvaluation(fullLesson);
  assert.equal(eval2.activeComponents, 4);
  assert.equal(eval2.components.words.completed, true);
  assert.equal(eval2.components.phrases.completed, true);
  assert.equal(eval2.components.classwork.completed, true);
  assert.equal(eval2.components.homework.completed, false); // HW has pending task
  assert.equal(eval2.completedComponents, 3);
  assert.equal(eval2.isCompleted, false);
  assert.equal(eval2.status, 'In progress');

  // State 3: All 4 components completed
  fullLesson.blocks[6].grade = 5; // HW task graded
  const eval3 = envPartial.calculateLessonEvaluation(fullLesson);
  assert.equal(eval3.completedComponents, 4);
  assert.equal(eval3.isCompleted, true);
  assert.equal(eval3.status, 'Completed');
});

test('calculateLessonEvaluation handles introductory lesson missing phrases and classwork (N/A exclusion)', () => {
  const { createEnv } = loadLessonsEnvironment();
  const env = createEnv([], []);

  const introLesson = {
    id: 'intro-lesson-1',
    blocks: [
      { id: 'w1', tab: 'words', type: 'wordcard', word: 'hello' },
      { id: 'w2', tab: 'words', type: 'wordcard', word: 'world' },
      { id: 'hw1', tab: 'homework', type: 'quiz', title: 'Quiz 1', items: [{ prompt: 'Q', picked: 0, answer: 0 }], checked: true }
    ]
  };

  const evalIntro = env.calculateLessonEvaluation(introLesson);
  assert.equal(evalIntro.components.words.isNa, false);
  assert.equal(evalIntro.components.phrases.isNa, true);
  assert.equal(evalIntro.components.phrases.text, 'N/A');
  assert.equal(evalIntro.components.classwork.isNa, true);
  assert.equal(evalIntro.components.classwork.text, 'N/A');
  assert.equal(evalIntro.components.homework.isNa, false);

  // Only 2 active components (Words & Homework)
  assert.equal(evalIntro.activeComponents, 2);
  assert.equal(evalIntro.completedComponents, 1); // HW is checked, words not learned
  assert.equal(evalIntro.isCompleted, false);

  // When words are learned:
  const envIntroDone = createEnv(['hello', 'world'], []);
  const evalIntroDone = envIntroDone.calculateLessonEvaluation(introLesson);
  assert.equal(evalIntroDone.completedComponents, 2);
  assert.equal(evalIntroDone.isCompleted, true);
  assert.equal(evalIntroDone.status, 'Completed');
});

test('Score percentage strictly corresponds to earned/max points (8/10 yields 80%, not 100%)', () => {
  const { createEnv } = loadLessonsEnvironment();
  const env = createEnv([], []);

  const lessonWithScores = {
    id: 'lesson-math-test',
    blocks: [
      { id: 'w1', tab: 'words', type: 'wordcard', word: 'apple' },
      { id: 'hw1', tab: 'homework', type: 'quiz', score: '8 / 10' }
    ]
  };

  const envDone = createEnv(['apple'], []);
  const evalRes = envDone.calculateLessonEvaluation(lessonWithScores);

  assert.equal(evalRes.totalEarned, 8);
  assert.equal(evalRes.totalMax, 10);
  assert.equal(evalRes.scorePct, 80);

  const html = envDone.lmEvaluationHtml(lessonWithScores);
  assert.match(html, /Overall Score: 8 \/ 10 pts/);
  assert.match(html, /Status: Completed \(80%\)/);
  assert.doesNotMatch(html, /Status: Completed \(100%\)/);
});

test('lmEvaluationHtml generates complete Evaluation Mode card with all 4 component cards', () => {
  const { createEnv } = loadLessonsEnvironment();
  const env = createEnv(['destination', 'journey', 'explore', 'experience'], ['lm-b1-eval-practice'], 'sasha');

  const lessonsData = JSON.parse(readFileSync(resolve(root, 'data/lessons.json'), 'utf8'));
  const b1Lesson = lessonsData.materials.find(m => m.id === 'lm-b1-eval-practice');
  assert.ok(b1Lesson, 'lm-b1-eval-practice found in data/lessons.json');

  const html = env.lmEvaluationHtml(b1Lesson);

  assert.match(html, /id="lmEvaluationPanel"/);
  assert.match(html, /Performance Summary/);
  assert.match(html, /Overall Score: 8 \/ 10 pts/);
  assert.match(html, /Status: Completed \(80%\)/);
  assert.match(html, /1\. Words/);
  assert.match(html, /2\. Phrases/);
  assert.match(html, /N\/A/);
  assert.match(html, /3\. Classwork/);
  assert.match(html, /4\. Homework/);
  assert.match(html, /Detailed Tasks & Student Submissions/);
  assert.match(html, /Task 1 · Grammar Check \(Choice Quiz\)/);
  assert.match(html, /Task 2 · Gap Fill Exercise/);
  assert.match(html, /Task 3 · Written Assignment/);
});
