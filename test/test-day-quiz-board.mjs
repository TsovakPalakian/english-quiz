import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('site/preview.html', 'utf8');
const css = fs.readFileSync('site/preview.css', 'utf8');
const quiz = fs.readFileSync('client/03g-core.js', 'utf8');
const lessons = fs.readFileSync('client/52-lessons.js', 'utf8');
const boardCss = css.slice(css.indexOf('.dq-board'));

test('Day quiz board markup keeps the classic study card, uses single-line header with nav-back, and custom mix icon', () => {
  assert.ok(html.includes('id="dayQuizBoard"'));
  assert.ok(html.includes('id="dayStudyClassic"'));
  assert.ok(html.includes('id="dayStart"'));
  assert.ok(html.includes('id="dayMistakes"'));
  assert.ok(html.includes('data-dq-source="all"'));
  assert.ok(html.includes('data-dq-source="range"'));
  assert.ok(html.includes('data-dq-source="random"'));
  assert.ok(html.includes('data-dq-source="mistakes"'));
  assert.ok(html.includes('id="dayQuizReview"'));
  assert.ok(html.includes('<b>Anki cards</b>'));
  assert.ok(html.indexOf('id="dayQuizReview"') < html.indexOf('id="dayQuizModes"'), 'Review block must appear before Mode block');
  assert.ok(html.includes('data-dq-mode="quick"'));
  assert.ok(html.includes('data-dq-mode="custom"'));
  assert.ok(html.includes('🎛️'));
  assert.ok(html.includes('class="on" type="button" data-dq-type="Flip"'));
  assert.ok(html.includes('data-dq-type="FSRS Flashcard"'));
  assert.ok(html.includes('id="dayQuizStart"'));
  assert.ok(html.includes('id="dayQuizHead"'));
  assert.ok(html.includes('data-fallback="material" id="dayQuizBack"'));
  assert.ok(html.includes('<span class="crumb">'));
  assert.equal(html.includes('id="dayQuizWho"'), false);
  const reviewSection = html.slice(html.indexOf('data-dq-group="review"'), html.indexOf('id="dayQuizFoot"') !== -1 ? html.indexOf('id="dayQuizFoot"') : html.indexOf('class="dq-foot"'));
  assert.equal(reviewSection.includes('Select all'), false);
  const daysetup = html.slice(html.indexOf('id="daysetup"'), html.indexOf('id="dayq"'));
  assert.equal(/Exam/.test(daysetup), false);
});

test('Day quiz board colors come from theme variables, dq-group is visible, and dq-types is 2 columns', () => {
  assert.ok(boardCss.includes('var(--acc-s)'));
  assert.ok(boardCss.includes('var(--acc)'));
  assert.ok(boardCss.includes('var(--card)'));
  assert.ok(boardCss.includes('var(--bad)'));
  assert.equal(/#[0-9a-fA-F]{3,8}/.test(boardCss), false);
  assert.ok(css.includes('.dq-review-row'));
  assert.ok(css.includes('.dq-group { display: block;'));
  assert.ok(css.includes('.dq-types { grid-template-columns: repeat(2, minmax(0, 1fr)); }'));
  assert.ok(css.includes('.dq-head { display: flex; align-items: center;'));
});

test('Day quiz start uses the board set, mode, default Flip, and budgets by exercises', () => {
  assert.ok(quiz.includes('showDayQuizBoard(false)'));
  assert.ok(quiz.includes('showDayQuizBoard(true)'));
  assert.ok(quiz.includes('quick: ["Flip", "Choice"]'));
  assert.ok(quiz.includes('write: ["Type", "Gap", "Spell", "Build"]'));
  assert.ok(quiz.includes('const isFlip = b.dataset.dqType === "Flip";'));
  assert.ok(quiz.includes('studyExerciseCount(selectedCards, types)'));
  assert.ok(quiz.includes('queue.length * 30 * 1000'));
  assert.ok(quiz.includes('No mistakes for these cards yet.'));
  assert.ok(lessons.includes('showDayQuizBoard(true)'));
});
