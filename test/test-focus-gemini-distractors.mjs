import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { fallbackDistractors, enrichDistractors } from '../src/distractor-enrichment.mjs';

test('fallbackDistractors generates 4 distinct direct and 4 distinct reverse distractors', () => {
  const item = { word: 'talk to yourself', translation: 'разговаривать с самим собой' };
  const pool = [
    { word: 'break the ice', translation: 'разрядить обстановку' },
    { word: 'call it a day', translation: 'закончить работу на сегодня' }
  ];

  const result = fallbackDistractors(item, pool);
  assert.equal(result.directDistractors.length, 4, 'Should have 4 Russian direct distractors');
  assert.equal(result.reverseDistractors.length, 4, 'Should have 4 English reverse distractors');

  assert.ok(!result.directDistractors.includes(item.translation), 'Direct distractors must not include correct translation');
  assert.ok(!result.reverseDistractors.includes(item.word), 'Reverse distractors must not include target word');

  // Verify uniqueness
  const uniqueDirect = new Set(result.directDistractors);
  assert.equal(uniqueDirect.size, 4, 'All direct distractors must be distinct');
  const uniqueReverse = new Set(result.reverseDistractors);
  assert.equal(uniqueReverse.size, 4, 'All reverse distractors must be distinct');
});

test('enrichDistractors falls back gracefully when API key is not configured', async () => {
  const items = [
    { word: 'detour', translation: 'объезд' },
    { word: 'commuter', translation: 'пригородный пассажир' }
  ];

  const results = await enrichDistractors({ items, env: {} });
  assert.equal(results.length, 2);
  assert.equal(results[0].directDistractors.length, 4);
  assert.equal(results[0].reverseDistractors.length, 4);
  assert.equal(results[1].directDistractors.length, 4);
  assert.equal(results[1].reverseDistractors.length, 4);
});

test('extractFocusQuestionsFromLesson generates bidirectional questions with 5 options and correct answer index', async () => {
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
          { word: 'talk to yourself', translation: 'разговаривать с самим собой' },
          { word: 'commuter', translation: 'пригородный пассажир' }
        ]
      },
      {
        type: 'phrase',
        tab: 'phrases',
        title: 'Useful Collocations',
        items: [
          { phrase: 'break the ice', translation: 'разрядить обстановку', example: 'He told a joke to break the ice.' }
        ]
      }
    ]
  };

  // Bidirectional extraction with shuffling
  const questions = dom.extractFocusQuestionsFromLesson(sampleLesson, { bidirectional: true, shuffle: true });
  // 2 words * 2 + 1 phrase * 2 = 6 questions
  assert.equal(questions.length, 6, 'Total 6 questions: 4 word questions and 2 phrase questions');

  questions.forEach(q => {
    assert.equal(q.options.length, 5, 'Every question must have exactly 5 options');
    assert.ok(typeof q.answer === 'number' && q.answer >= 0 && q.answer < 5, 'Answer index must be valid 0-4');

    // Verify correct answer matches feedback / target concept
    const chosen = q.options[q.answer];
    assert.ok(chosen, 'Chosen option must exist in options');
    if (q.id.endsWith('-direct')) {
      assert.ok(q.feedback.includes(chosen), 'Direct question feedback must contain correct Russian translation');
    } else if (q.id.endsWith('-reverse')) {
      assert.ok(q.feedback.includes(chosen), 'Reverse question feedback must contain correct English phrase');
    }
  });

  // Verify shuffleArray and shuffleQuestionOptions
  const testQ = {
    prompt: 'Test',
    options: ['Correct', 'Dist1', 'Dist2', 'Dist3', 'Dist4'],
    answer: 0
  };
  const shuffledQ = dom.shuffleQuestionOptions(testQ);
  assert.equal(shuffledQ.options.length, 5);
  assert.equal(shuffledQ.options[shuffledQ.answer], 'Correct', 'Answer index must still point to "Correct" after shuffle');
});

test('cleanTranslationString strips surrogate (перевод) and maps known phrase translations', async () => {
  const dom = new Window();
  dom.document.documentElement.innerHTML = '<head></head><body></body>';
  globalThis.window = dom;
  globalThis.document = dom.document;
  await import(new URL('../client/52c-focus-player.js', import.meta.url).href + '?t=' + (Date.now() + 10));

  assert.equal(dom.cleanTranslationString('Have a good time (перевод)', 'have a good time'), 'отлично провести время');
  assert.equal(dom.cleanTranslationString('разговаривать с самим собой (перевод)', 'talk to yourself'), 'разговаривать с самим собой');
  assert.equal(dom.cleanTranslationString('break the ice (translation)', 'break the ice'), 'разрядить обстановку');
});

test('have a good time generates clean translation and close semantic distractors', async () => {
  const dom = new Window();
  dom.document.documentElement.innerHTML = '<head></head><body></body>';
  globalThis.window = dom;
  globalThis.document = dom.document;
  await import(new URL('../client/52c-focus-player.js', import.meta.url).href + '?t=' + (Date.now() + 20));

  const lesson = {
    blocks: [
      {
        type: 'phrase',
        tab: 'phrases',
        items: [
          { phrase: 'have a good time', translation: 'Have a good time (перевод)' }
        ]
      }
    ]
  };

  const questions = dom.extractFocusQuestionsFromLesson(lesson, { bidirectional: true, shuffle: false });
  assert.equal(questions.length, 2);

  const direct = questions.find(q => q.id.endsWith('-direct'));
  assert.ok(direct);
  assert.equal(direct.options[0], 'отлично провести время', 'Direct answer must be cleaned to real Russian translation');
  assert.ok(!direct.options.some(opt => opt.includes('(перевод)')), 'No options must contain (перевод)');
  assert.ok(direct.options.includes('приятно отдохнуть'), 'Must contain close semantic distractor');
  assert.ok(direct.options.includes('повеселиться от души'), 'Must contain close semantic distractor');

  const reverse = questions.find(q => q.id.endsWith('-reverse'));
  assert.ok(reverse);
  assert.equal(reverse.options[0], 'have a good time', 'Reverse answer must be the English phrase');
  assert.ok(reverse.options.includes('enjoy oneself') || reverse.options.includes('have fun'), 'Must contain close English semantic distractor');
});

test('Progress modal opens, updates percentages, and closes', async () => {
  const dom = new Window();
  dom.document.documentElement.innerHTML = '<head></head><body></body>';
  globalThis.window = dom;
  globalThis.document = dom.document;
  await import(new URL('../client/52c-focus-player.js', import.meta.url).href + '?t=' + (Date.now() + 30));

  dom.showGeminiProgressModal();
  const overlay = dom.document.getElementById('lmGeminiProgressOverlay');
  assert.ok(overlay, 'Progress overlay created');
  assert.equal(overlay.style.display, 'flex');

  dom.updateGeminiProgress(68, 'Processing cards: 14 of 20');
  const percentEl = dom.document.getElementById('lmGeminiProgressPercent');
  const labelEl = dom.document.getElementById('lmGeminiProgressLabel');
  assert.equal(percentEl.textContent, '68%');
  assert.equal(labelEl.textContent, 'Processing cards: 14 of 20');

  dom.hideGeminiProgressModal();
  assert.equal(overlay.style.display, 'none');
});
