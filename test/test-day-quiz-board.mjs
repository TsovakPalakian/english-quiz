import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('site/preview.html', 'utf8');
const css = fs.readFileSync('site/preview.css', 'utf8');
const quiz = fs.readFileSync('client/03g-core.js', 'utf8');
const lessons = fs.readFileSync('client/52-lessons.js', 'utf8');
const boardCss = css.slice(css.indexOf('.dq-board'));

test('Day quiz board markup keeps the classic study card', () => {
  assert.ok(html.includes('id="dayQuizBoard"'));
  assert.ok(html.includes('id="dayStudyClassic"'));
  assert.ok(html.includes('id="dayStart"'));
  assert.ok(html.includes('id="dayMistakes"'));
  assert.ok(html.includes('data-dq-source="all"'));
  assert.ok(html.includes('data-dq-source="range"'));
  assert.ok(html.includes('data-dq-source="random"'));
  assert.ok(html.includes('data-dq-source="mistakes"'));
  assert.ok(html.includes('data-dq-mode="quick"'));
  assert.ok(html.includes('data-dq-mode="custom"'));
  assert.ok(html.includes('data-dq-type="FSRS Flashcard"'));
  assert.ok(html.includes('id="dayQuizStart"'));
  const daysetup = html.slice(html.indexOf('id="daysetup"'), html.indexOf('id="dayq"'));
  assert.equal(/Exam/.test(daysetup), false);
});

test('Day quiz board colors come from theme variables', () => {
  assert.ok(boardCss.includes('var(--acc-s)'));
  assert.ok(boardCss.includes('var(--acc)'));
  assert.ok(boardCss.includes('var(--card)'));
  assert.ok(boardCss.includes('var(--bad)'));
  assert.equal(/#[0-9a-fA-F]{3,8}/.test(boardCss), false);
});

test('Day quiz start uses the board set, mode, and 30 seconds per card', () => {
  assert.ok(quiz.includes('showDayQuizBoard(false)'));
  assert.ok(quiz.includes('showDayQuizBoard(true)'));
  assert.ok(quiz.includes('quick: ["Flip", "Choice"]'));
  assert.ok(quiz.includes('write: ["Type", "Gap", "Spell", "Build"]'));
  assert.ok(quiz.includes('cards.length * 30 * 1000'));
  assert.ok(quiz.includes('No mistakes for these cards yet.'));
  assert.ok(lessons.includes('showDayQuizBoard(true)'));
});
