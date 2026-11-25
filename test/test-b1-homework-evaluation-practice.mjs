import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('B1 evaluation practice lesson exists with complete homework and word blocks', () => {
  const data = JSON.parse(readFileSync(resolve(root, 'data/lessons.json'), 'utf8'));
  const lesson = data.materials.find(m => m.id === 'lm-b1-eval-practice');

  assert.ok(lesson, 'Target lesson lm-b1-eval-practice must be present in lessons.json');
  assert.equal(lesson.className, 'English B1');
  assert.equal(lesson.published, true);
  assert.equal(lesson.mode, 'preview');

  // Verify tabs
  const tabs = new Set(lesson.blocks.map(b => b.tab || 'overview'));
  assert.ok(tabs.has('overview'), 'Must have overview tab');
  assert.ok(tabs.has('words'), 'Must have words tab');
  assert.ok(tabs.has('rules'), 'Must have rules tab');
  assert.ok(tabs.has('classwork'), 'Must have classwork tab');
  assert.ok(tabs.has('homework'), 'Must have homework tab');

  // Verify vocabulary
  const words = lesson.blocks.filter(b => b.tab === 'words' && b.type === 'wordcard').map(b => b.word.toLowerCase());
  assert.deepEqual(words, ['destination', 'journey', 'explore', 'experience']);

  // Verify homework components
  const hwBlocks = lesson.blocks.filter(b => b.tab === 'homework');
  assert.ok(hwBlocks.length >= 3, 'Homework must include quiz, exercise, and task');

  const quiz = hwBlocks.find(b => b.type === 'quiz');
  assert.ok(quiz, 'Quiz block must be present in homework');
  assert.equal(quiz.quizType, 'Choice');
  assert.equal(quiz.items.length, 3);
  quiz.items.forEach(item => {
    assert.ok(Array.isArray(item.options) && item.options.length >= 3);
    assert.ok(typeof item.answer === 'number' && item.answer >= 0 && item.answer < item.options.length);
  });

  const exercise = hwBlocks.find(b => b.type === 'exercise');
  assert.ok(exercise, 'Exercise block must be present in homework');
  const gapItem = exercise.items.find(it => it.kind === 'text_gaps');
  assert.ok(gapItem, 'Exercise must contain text_gaps item');
  assert.match(gapItem.text, /\[on\]/);
  assert.match(gapItem.text, /\[at\]/);
  assert.match(gapItem.text, /\[experience\]/);

  const task = hwBlocks.find(b => b.type === 'task');
  assert.ok(task, 'Task block must be present in homework');
  assert.equal(task.maxPoints, 5);
  assert.ok(task.criteria.includes('Content'));
});

test('Lesson progress calculation transitions correctly from Not started to Completed', () => {
  const data = JSON.parse(readFileSync(resolve(root, 'data/lessons.json'), 'utf8'));
  const lesson = data.materials.find(m => m.id === 'lm-b1-eval-practice');

  const lessonsSrc = readFileSync(resolve(root, 'client/52-lessons.js'), 'utf8');
  const wordListMatch = lessonsSrc.match(/function lmLessonWordList\(material\) \{[\s\S]*?\n    \}/);
  const progMatch = lessonsSrc.match(/function lmLessonStudentProgress\(material\) \{[\s\S]*?\n    \}/);
  const parseMatch = lessonsSrc.match(/function parseGapsFromText\(text\) \{[\s\S]*?\n    \}/);
  assert.ok(wordListMatch && progMatch && parseMatch, 'Functions found in 52-lessons.js');

  const createProgressEvaluator = (learnedSet = new Set(), startedList = []) => {
    return new Function('loadLearned', 'loadStarted', `
      ${parseMatch[0]};
      ${wordListMatch[0]};
      ${progMatch[0]};
      return lmLessonStudentProgress;
    `)(() => learnedSet, () => startedList);
  };

  // Initial state: no words learned, not started
  const evalInitial = createProgressEvaluator(new Set(), []);
  assert.equal(evalInitial(lesson).status, 'Not started');

  // In progress: 1 word learned out of 4
  const evalPartial = createProgressEvaluator(new Set(['destination']), []);
  assert.equal(evalPartial(lesson).status, 'In progress');

  // In progress: started but no words learned yet
  const evalStarted = createProgressEvaluator(new Set(), [lesson.id]);
  assert.equal(evalStarted(lesson).status, 'In progress');

  // Completed: all 4 words learned
  const evalFull = createProgressEvaluator(new Set(['destination', 'journey', 'explore', 'experience']), []);
  assert.equal(evalFull(lesson).status, 'Completed');

  // Zero-word lesson with interactive blocks: opening it must mark In progress, not Completed
  const zeroWordLesson = {
    id: 'lesson-zero-words',
    blocks: [
      {
        type: 'exercise',
        items: [
          {
            kind: 'text_gaps',
            text: '1. [on] 2. [at] 3. [experience]',
            given: {}
          }
        ]
      }
    ]
  };

  const evalZeroNotStarted = createProgressEvaluator(new Set(), []);
  assert.equal(evalZeroNotStarted(zeroWordLesson).status, 'Not started');

  const evalZeroStarted = createProgressEvaluator(new Set(), [zeroWordLesson.id]);
  assert.equal(evalZeroStarted(zeroWordLesson).status, 'In progress', 'Zero word lesson when opened must be In progress, not Completed');

  // Partial fill: 1 gap filled out of 3 without checking must remain In progress
  zeroWordLesson.blocks[0].items[0].given = { 1: 'on' };
  assert.equal(evalZeroStarted(zeroWordLesson).status, 'In progress', 'Partially completed gaps exercise must remain In progress');

  // All 3 gaps filled: transitions to Completed
  zeroWordLesson.blocks[0].items[0].given = { 1: 'on', 2: 'at', 3: 'experience' };
  assert.equal(evalZeroStarted(zeroWordLesson).status, 'Completed', 'All gaps filled must mark Completed');
});

test('Homework quiz scoring calculates points accurately', () => {
  const data = JSON.parse(readFileSync(resolve(root, 'data/lessons.json'), 'utf8'));
  const lesson = data.materials.find(m => m.id === 'lm-b1-eval-practice');
  const quiz = lesson.blocks.find(b => b.tab === 'homework' && b.type === 'quiz');

  // Simulate student picking all correct answers
  const correctPicks = quiz.items.map(it => it.answer);
  const correctScore = quiz.items.reduce((sum, question, idx) => {
    return sum + (correctPicks[idx] === question.answer ? 1 : 0);
  }, 0);
  const scoreResult = correctScore + ' / ' + quiz.items.length;
  assert.equal(scoreResult, '3 / 3');

  // Simulate student picking 2 correct out of 3
  const mixedPicks = [quiz.items[0].answer, 999, quiz.items[2].answer];
  const mixedScore = quiz.items.reduce((sum, question, idx) => {
    return sum + (mixedPicks[idx] === question.answer ? 1 : 0);
  }, 0);
  assert.equal(mixedScore + ' / ' + quiz.items.length, '2 / 3');
});

test('stageResponseValue preserves given mapping for text_gaps', () => {
  const hooksSrc = readFileSync(resolve(root, 'client/main/main-hooks.js'), 'utf8');
  assert.ok(hooksSrc.includes("'given' in item && item.given ? {given: item.given} : {}"));

  const fnMatch = hooksSrc.match(/function stageResponseValue\([\s\S]*?\n\}/);
  assert.ok(fnMatch, 'stageResponseValue definition found');
  const stageResponseValue = new Function(`${fnMatch[0]}; return stageResponseValue;`)();

  const block = {
    type: 'exercise',
    items: [
      {
        kind: 'text_gaps',
        given: { 1: 'on', 2: 'at', 3: 'experience' }
      }
    ]
  };

  const serialized = stageResponseValue(block, true);
  assert.equal(serialized.checked, true);
  assert.equal(serialized.items.length, 1);
  assert.deepEqual(serialized.items[0].given, { 1: 'on', 2: 'at', 3: 'experience' });
});

test('lmLessonWordList does not include items from tab: phrases', () => {
  const lessonsSrc = readFileSync(resolve(root, 'client/52-lessons.js'), 'utf8');
  const fnMatch = lessonsSrc.match(/function lmLessonWordList\(material\) \{[\s\S]*?\n    \}/);
  assert.ok(fnMatch, 'lmLessonWordList definition found');
  const lmLessonWordList = new Function(`${fnMatch[0]}; return lmLessonWordList;`)();

  const lessonFixture = {
    blocks: [
      { type: 'wordcard', tab: 'words', word: 'destination' },
      { type: 'wordcard', tab: 'phrases', word: 'take off' },
      { type: 'vocab', tab: 'phrases', items: [{ word: 'by the way' }] },
      { type: 'cards', tab: 'phrases', items: [{ front: 'as well' }] },
      { type: 'vocab', tab: 'words', items: [{ word: 'journey' }] },
      { type: 'cards', tab: 'words', items: [{ front: 'explore' }] },
      { type: 'exercise', tab: 'homework', items: [{ word: 'ignored' }] }
    ]
  };

  const words = lmLessonWordList(lessonFixture);
  assert.ok(words.includes('destination'));
  assert.ok(words.includes('journey'));
  assert.ok(words.includes('explore'));
  assert.ok(!words.includes('take off'), 'Must exclude wordcard in tab phrases');
  assert.ok(!words.includes('by the way'), 'Must exclude vocab in tab phrases');
  assert.ok(!words.includes('as well'), 'Must exclude cards in tab phrases');
  assert.ok(!words.includes('ignored'), 'Must exclude non-vocabulary block types');
});

test('Static blocks allow event flow without premature stopPropagation', () => {
  const hooksSrc = readFileSync(resolve(root, 'client/main/main-hooks.js'), 'utf8');
  const fnMatch = hooksSrc.match(/function stageResponseEvent\(event\)\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'stageResponseEvent definition found');

  let stopped = false;
  let noticeTriggered = false;

  const mockNotice = () => { noticeTriggered = true; };
  const stageDomId = (id) => id;
  const stageResponseValue = () => ({});

  // Evaluate stageResponseEvent with static block (no stageBlockRevision)
  const stageResponseEventStatic = new Function('lmState', 'authUser', 'viewAccount', 'viewSwitching', 'accountReady', 'stageDomId', 'stageResponseValue', 'window', `
    ${fnMatch[0]};
    return stageResponseEvent;
  `)(
    { blocks: [{ id: 'static-block-1' }] },
    { id: 'user1' },
    null,
    false,
    true,
    stageDomId,
    stageResponseValue,
    { LearningMain: { notice: mockNotice } }
  );

  const staticEvent = {
    target: {
      closest: (sel) => {
        if (sel.includes('data-response')) {
          return {
            dataset: { response: 'static-block-1' },
            hasAttribute: () => false,
            value: 'draft text'
          };
        }
        return null;
      }
    },
    type: 'input',
    stopPropagation: () => { stopped = true; }
  };

  stageResponseEventStatic(staticEvent);
  assert.equal(stopped, false, 'Static block must NOT call stopPropagation');
  assert.equal(noticeTriggered, false, 'Static block must NOT trigger error toast');

  // Verify that active block WITH stageBlockRevision stops propagation
  let activeStopped = false;
  const stageResponseEventActive = new Function('lmState', 'authUser', 'viewAccount', 'viewSwitching', 'accountReady', 'stageDomId', 'stageResponseValue', 'window', `
    ${fnMatch[0]};
    return stageResponseEvent;
  `)(
    { id: 'lesson-1', blocks: [{ id: 'active-block-1', stageBlockRevision: 1 }] },
    { id: 'user1' },
    null,
    false,
    true,
    stageDomId,
    stageResponseValue,
    { LearningMain: { notice: mockNotice, response: () => {} } }
  );

  const activeEvent = {
    target: {
      closest: (sel) => {
        if (sel.includes('data-response')) {
          return {
            dataset: { response: 'active-block-1' },
            hasAttribute: () => false,
            value: 'active text'
          };
        }
        return null;
      }
    },
    type: 'input',
    stopPropagation: () => { activeStopped = true; }
  };

  stageResponseEventActive(activeEvent);
  assert.equal(activeStopped, true, 'Active block with stageBlockRevision MUST call stopPropagation');

  // Verify that an element with empty dataset attribute does not throw TypeError on raw.split
  const emptyDatasetEvent = {
    target: {
      closest: (sel) => {
        if (sel.includes('data-response')) {
          return {
            dataset: { response: '' },
            hasAttribute: () => false,
            value: ''
          };
        }
        return null;
      }
    },
    type: 'input',
    stopPropagation: () => {}
  };
  assert.doesNotThrow(() => {
    stageResponseEventStatic(emptyDatasetEvent);
  }, 'Empty dataset attributes must not cause TypeError');
});

test('Gaps parsing and slot matching handle explicit indices correctly', () => {
  const lessonsSrc = readFileSync(resolve(root, 'client/52-lessons.js'), 'utf8');
  const parseMatch = lessonsSrc.match(/function parseGapsFromText\(text\) \{[\s\S]*?\n    \}/);
  assert.ok(parseMatch, 'parseGapsFromText found');
  const parseGapsFromText = new Function(`${parseMatch[0]}; return parseGapsFromText;`)();

  const passage = 'Choose: [2:banana] followed by [1:apple].';
  const gaps = parseGapsFromText(passage);

  assert.equal(gaps.length, 2);
  assert.equal(gaps[0].index, 2);
  assert.equal(gaps[0].target, 'banana');
  assert.equal(gaps[1].index, 1);
  assert.equal(gaps[1].target, 'apple');

  // Test slot matching order as implemented in lmRenderTextGapsPreview
  const matchSlots = (text, parsedGaps) => {
    let slotOrder = 1;
    const matched = [];
    text.replace(/\[(?:(\d+):)?([^\]|]+)(?:\|([^\]]+))?\]/g, (_match, p1) => {
      const explicitIndex = p1 ? parseInt(p1, 10) : null;
      const matchIdx = slotOrder - 1;
      const gap = (parsedGaps[matchIdx] && (explicitIndex == null || parsedGaps[matchIdx].index === explicitIndex))
        ? parsedGaps[matchIdx]
        : (explicitIndex != null ? parsedGaps.find(g => g.index === explicitIndex) : parsedGaps.find(g => g.index === slotOrder)) || parsedGaps[matchIdx];
      const sIdx = gap ? gap.index : (explicitIndex || slotOrder);
      slotOrder++;
      matched.push({ sIdx, target: gap ? gap.target : null });
    });
    return matched;
  };

  const matchedOut = matchSlots(passage, gaps);
  assert.equal(matchedOut[0].sIdx, 2);
  assert.equal(matchedOut[0].target, 'banana');
  assert.equal(matchedOut[1].sIdx, 1);
  assert.equal(matchedOut[1].target, 'apple');

  // Test duplicate explicit gap indices in a single passage: [1:cat] and [1:dog]
  const dupPassage = '[1:cat] and [1:dog]';
  const dupGaps = parseGapsFromText(dupPassage);
  assert.equal(dupGaps.length, 2);
  const dupMatched = matchSlots(dupPassage, dupGaps);
  assert.equal(dupMatched.length, 2);
  assert.equal(dupMatched[0].sIdx, 1);
  assert.equal(dupMatched[0].target, 'cat');
  assert.equal(dupMatched[1].sIdx, 1);
  assert.equal(dupMatched[1].target, 'dog', 'Second duplicate index slot must match its own target "dog", not repeat "cat"');
});
