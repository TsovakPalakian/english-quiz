import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const root = fileURLToPath(new URL('../', import.meta.url));
const css = readFileSync(new URL('../site/preview.css', import.meta.url), 'utf8');

test('extractFocusQuestionsFromLesson extracts words, phrases, classwork, homework', async () => {
  const dom = new Window();
  dom.document.documentElement.innerHTML = '<head></head><body></body>';
  globalThis.window = dom;
  globalThis.document = dom.document;
  globalThis.HTMLElement = dom.HTMLElement;
  globalThis.Node = dom.Node;
  globalThis.Element = dom.Element;
  await import(new URL('../client/52c-focus-player.js', import.meta.url).href + '?t=' + Date.now());

  const sampleLesson = {
    blocks: [
      {
        tab: 'words',
        items: [
          { word: 'detour', translation: 'объезд', meaning: 'alternative route' },
          { word: 'commuter', translation: 'пригородный пассажир', meaning: 'regular traveler' }
        ]
      },
      {
        type: 'phrase',
        tab: 'phrases',
        title: 'Useful Collocations',
        items: [
          { phrase: 'break the ice', translation: 'разрядить обстановку', example: 'He told a joke to break the ice.' },
          { phrase: 'call it a day', translation: 'закончить работу на сегодня', example: 'Let us call it a day and go home.' },
          { phrase: 'bite the bullet', translation: 'стиснуть зубы и смириться', example: 'You have to bite the bullet and finish.' }
        ]
      },
      {
        type: 'exercise',
        title: 'CW Practice: Present Perfect',
        items: [
          { prompt: 'Choose correct option 1', options: ['A', 'B', 'C'], answer: 0 },
          { prompt: 'Choose correct option 2', options: ['A', 'B', 'C'], answer: 1 },
          { prompt: 'Choose correct option 3', options: ['A', 'B', 'C'], answer: 2 },
          { prompt: 'Choose correct option 4', options: ['A', 'B', 'C'], answer: 0 }
        ]
      },
      {
        type: 'quiz',
        tab: 'homework',
        title: 'HW Quiz: Conditionals',
        items: [
          { word: 'Conditionals', prompt: 'Select the conditional structure', options: ['Option 1', 'Option 2'], answer: 0 }
        ]
      }
    ]
  };

  const questions = dom.extractFocusQuestionsFromLesson(sampleLesson);
  assert.equal(questions.length, 10, 'Total 10 cards extracted from 4 material sources');

  // Verify categories
  const words = questions.filter(q => q.category === 'words');
  const phrases = questions.filter(q => q.category === 'phrases');
  const classwork = questions.filter(q => q.category === 'classwork');
  const homework = questions.filter(q => q.category === 'homework');

  assert.equal(words.length, 2, '2 word questions');
  assert.equal(phrases.length, 3, '3 phrase questions');
  assert.equal(classwork.length, 4, '4 classwork questions');
  assert.equal(homework.length, 1, '1 homework question');

  // Verify phrase card properties
  assert.equal(phrases[0].concept, 'break the ice');
  assert.equal(phrases[0].title, 'Phrase: break the ice');
  assert.ok(phrases[0].prompt.includes('break the ice'));
  assert.equal(phrases[0].options[0], 'разрядить обстановку');
  assert.equal(phrases[0].answer, 0);
  assert.ok(phrases[0].feedback.includes('He told a joke to break the ice.'));

  // Verify getFocusScopeCounts
  const counts = dom.getFocusScopeCounts(questions);
  assert.deepEqual(counts, {
    words: 2,
    phrases: 3,
    classwork: 4,
    homework: 1,
    words_phrases: 5,
    classwork_homework: 5,
    all: 10
  });
});

test('filterFocusQuestionsByScope filters for the 4 practice modes', async () => {
  const dom = new Window();
  dom.document.documentElement.innerHTML = '<head></head><body></body>';
  globalThis.window = dom;
  globalThis.document = dom.document;
  globalThis.HTMLElement = dom.HTMLElement;
  globalThis.Node = dom.Node;
  globalThis.Element = dom.Element;
  await import(new URL('../client/52c-focus-player.js', import.meta.url).href + '?t=' + (Date.now() + 1));

  const questions = [
    { id: 'w1', category: 'words' },
    { id: 'w2', category: 'words' },
    { id: 'p1', category: 'phrases' },
    { id: 'p2', category: 'phrases' },
    { id: 'p3', category: 'phrases' },
    { id: 'cw1', category: 'classwork' },
    { id: 'cw2', category: 'classwork' },
    { id: 'cw3', category: 'classwork' },
    { id: 'cw4', category: 'classwork' },
    { id: 'hw1', category: 'homework' }
  ];

  // Mode 1: Words & Phrases
  const mode1 = dom.filterFocusQuestionsByScope(questions, 'words_phrases');
  assert.equal(mode1.length, 5);
  assert.ok(mode1.every(q => q.category === 'words' || q.category === 'phrases'));

  // Mode 2: Classwork & Homework
  const mode2 = dom.filterFocusQuestionsByScope(questions, 'classwork_homework');
  assert.equal(mode2.length, 5);
  assert.ok(mode2.every(q => q.category === 'classwork' || q.category === 'homework'));

  // Mode 3: Single Category (words, phrases, classwork, homework)
  const mode3Words = dom.filterFocusQuestionsByScope(questions, 'single', 'words');
  assert.equal(mode3Words.length, 2);
  assert.ok(mode3Words.every(q => q.category === 'words'));

  const mode3Phrases = dom.filterFocusQuestionsByScope(questions, 'single', 'phrases');
  assert.equal(mode3Phrases.length, 3);
  assert.ok(mode3Phrases.every(q => q.category === 'phrases'));

  const mode3Cw = dom.filterFocusQuestionsByScope(questions, 'single', 'classwork');
  assert.equal(mode3Cw.length, 4);
  assert.ok(mode3Cw.every(q => q.category === 'classwork'));

  const mode3Hw = dom.filterFocusQuestionsByScope(questions, 'single', 'homework');
  assert.equal(mode3Hw.length, 1);
  assert.ok(mode3Hw.every(q => q.category === 'homework'));

  // Mode 4: All Together
  const mode4 = dom.filterFocusQuestionsByScope(questions, 'all');
  assert.equal(mode4.length, 10);
});

test('Visual DOM: Scope modal and header scope menu render and respond correctly', async () => {
  const dom = new Window();
  dom.document.documentElement.innerHTML = '<head></head><body><button type="button" id="lmFocusPlayerBtn">Focus</button></body>';
  const style = dom.document.createElement('style');
  style.textContent = css;
  dom.document.head.appendChild(style);

  globalThis.window = dom;
  globalThis.document = dom.document;
  globalThis.HTMLElement = dom.HTMLElement;
  globalThis.Node = dom.Node;
  globalThis.Element = dom.Element;
  await import(new URL('../client/52c-focus-player.js', import.meta.url).href + '?t=' + (Date.now() + 2));

  // Mock global lesson state
  dom.lmState = {
    blocks: [
      { tab: 'words', items: [{ word: 'detour', translation: 'объезд' }] },
      { type: 'phrase', tab: 'phrases', items: [{ phrase: 'break the ice', translation: 'разрядить обстановку' }] },
      { type: 'exercise', items: [{ prompt: 'Practice', options: ['A', 'B'], answer: 0 }] }
    ]
  };

  // Open scope modal via button
  const triggerBtn = dom.document.getElementById('lmFocusPlayerBtn');
  triggerBtn.click();

  const modalOverlay = dom.document.getElementById('lmFocusScopeOverlay');
  assert.ok(modalOverlay, 'Scope modal overlay created');
  assert.equal(modalOverlay.style.display, 'flex');

  // Verify modal elements
  const cards = modalOverlay.querySelectorAll('.focus-scope-card');
  assert.equal(cards.length, 4, '4 scope option cards rendered in modal');

  const subPills = modalOverlay.querySelectorAll('.focus-sub-pill');
  assert.equal(subPills.length, 4, '4 sub-category pills rendered in modal');

  const startBtn = modalOverlay.querySelector('#focusScopeStartBtn');
  assert.ok(startBtn, 'Start button exists');
  assert.ok(startBtn.textContent.includes('Start Focus Mode'), 'Start button has correct text');

  // Start with Words & Phrases mode
  const wordsPhrasesCard = modalOverlay.querySelector('[data-scope="words_phrases"]');
  wordsPhrasesCard.click();
  const activeStartBtn = modalOverlay.querySelector('#focusScopeStartBtn');
  activeStartBtn.click();

  // Modal should close and player overlay should be active
  assert.equal(modalOverlay.style.display, 'none');
  const playerOverlay = dom.document.getElementById('lmFocusPlayerOverlay');
  assert.ok(playerOverlay, 'Player overlay exists');
  assert.equal(playerOverlay.style.display, 'flex');

  // Verify header scope button
  const headerScopeBtn = playerOverlay.querySelector('#focusHeaderScopeBtn');
  assert.ok(headerScopeBtn, 'Header scope button rendered');
  assert.ok(headerScopeBtn.textContent.includes('Words & Phrases'));

  // Toggle header scope menu
  headerScopeBtn.click();
  const scopeMenu = playerOverlay.querySelector('#focusScopeMenu');
  assert.ok(scopeMenu, 'Scope dropdown menu rendered');

  const menuItems = scopeMenu.querySelectorAll('.focus-menu-item');
  assert.equal(menuItems.length, 7, '7 switchable menu items rendered in dropdown');

  // Switch to All Together from header menu
  const allItem = scopeMenu.querySelector('[data-switch-scope="all"]');
  assert.ok(allItem, 'All Together item found in menu');
  allItem.click();

  const updatedHeaderScopeBtn = playerOverlay.querySelector('#focusHeaderScopeBtn');
  assert.ok(updatedHeaderScopeBtn.textContent.includes('Scope: All'));
  assert.equal(playerOverlay.querySelector('#focusScopeMenu'), null, 'Dropdown closed after switch');
});
