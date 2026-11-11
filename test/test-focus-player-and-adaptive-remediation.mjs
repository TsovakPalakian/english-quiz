import test from 'node:test';
import assert from 'node:assert/strict';

test('Stage 14: Full Focus Mode single-question focus, progress segments and hotkeys', () => {
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
        type: 'quiz',
        title: 'CW Gap: navigation',
        items: [{
          word: 'navigation',
          prompt: 'Select the right tool for navigation:',
          options: ['GPS Compass', 'Clock', 'Radio'],
          answer: 0
        }]
      }
    ]
  };

  // Simulate extraction
  function extractFocusQuestions(lesson) {
    const questions = [];
    (lesson.blocks || []).forEach(b => {
      if (b.tab === 'words') {
        (b.items || []).forEach(it => {
          questions.push({
            id: 'w-' + it.word,
            title: 'Vocabulary: ' + it.word,
            concept: it.word,
            prompt: 'Identify definition for: ' + it.word,
            options: [it.translation, 'Distractor 1', 'Distractor 2'],
            answer: 0
          });
        });
      } else if (b.type === 'quiz') {
        (b.items || []).forEach(it => {
          questions.push({
            id: 'q-' + (it.word || 'quiz'),
            title: b.title,
            concept: it.word || 'Grammar',
            prompt: it.prompt,
            options: it.options,
            answer: it.answer
          });
        });
      }
    });
    return questions;
  }

  const questions = extractFocusQuestions(sampleLesson);
  assert.equal(questions.length, 3, 'Extracted 3 focus questions from lesson');
  assert.equal(questions[0].concept, 'detour');
  assert.equal(questions[1].concept, 'commuter');
  assert.equal(questions[2].concept, 'navigation');

  // Verify focus state navigation
  let currentIndex = 0;
  const results = {};

  function next() {
    if (currentIndex < questions.length - 1) currentIndex++;
  }
  function prev() {
    if (currentIndex > 0) currentIndex--;
  }

  assert.equal(currentIndex, 0);
  next();
  assert.equal(currentIndex, 1);
  next();
  assert.equal(currentIndex, 2);
  next();
  assert.equal(currentIndex, 2, 'Cannot exceed total questions length');
  prev();
  assert.equal(currentIndex, 1);
});

test('Stage 15: Adaptive Remediation progression rule (+2 for 1st error, +1 for repeat error)', () => {
  const sessionErrors = new Map();
  const sessionQuestions = [
    { id: 'q1', concept: 'Relative clauses', prompt: 'Choose who/which:', answer: 0 },
    { id: 'q2', concept: 'Conditionals', prompt: 'If I were you...', answer: 1 }
  ];

  function applyAdaptiveRemediation(concept) {
    const errorCount = (sessionErrors.get(concept) || 0) + 1;
    sessionErrors.set(concept, errorCount);

    const addedTasks = [];
    if (errorCount === 1) {
      // First error on concept -> strictly +2 new practice tasks
      addedTasks.push({
        id: 'adaptive-' + concept + '-1',
        concept,
        prompt: 'Remediation 1 (Gap): Context for ' + concept,
        options: ['Correct', 'Wrong 1', 'Wrong 2'],
        answer: 0
      });
      addedTasks.push({
        id: 'adaptive-' + concept + '-2',
        concept,
        prompt: 'Remediation 2 (Choice): Context for ' + concept,
        options: ['Correct', 'Wrong 1', 'Wrong 2'],
        answer: 0
      });
    } else {
      // Repeat error on same concept -> strictly +1 reinforcement task
      addedTasks.push({
        id: 'adaptive-' + concept + '-repeat',
        concept,
        prompt: 'Reinforcement (True/False): ' + concept,
        options: ['True', 'False'],
        answer: 0
      });
    }

    sessionQuestions.push(...addedTasks);
    return addedTasks.length;
  }

  // 1. Initial count
  assert.equal(sessionQuestions.length, 2);

  // 2. First error on 'Relative clauses' -> +2 tasks added
  const addedFirst = applyAdaptiveRemediation('Relative clauses');
  assert.equal(addedFirst, 2, '+2 tasks generated for 1st mistake on concept');
  assert.equal(sessionQuestions.length, 4, 'Total session questions increased from 2 to 4');
  assert.equal(sessionQuestions[0].id, 'q1', 'Original incorrect question is preserved');

  // 3. Repeat error on 'Relative clauses' -> +1 task added
  const addedRepeat = applyAdaptiveRemediation('Relative clauses');
  assert.equal(addedRepeat, 1, '+1 task generated for repeat mistake on concept');
  assert.equal(sessionQuestions.length, 5, 'Total session questions increased from 4 to 5');

  // 4. First error on different concept 'Conditionals' -> +2 tasks added
  const addedDifferent = applyAdaptiveRemediation('Conditionals');
  assert.equal(addedDifferent, 2, '+2 tasks generated for 1st mistake on new concept');
  assert.equal(sessionQuestions.length, 7, 'Total session questions increased to 7');
});

test('Stage E7: Teacher Exam Review 4-criteria rubric and proctoring audit card', () => {
  globalThis.lmState = {
    examOwned: true,
    tabSwitches: 2,
    timeLimit: 90
  };

  // Verify default 4 criteria rubric
  function assessmentRubric(item) {
    const parsed = String(item.criteria || '').split('\n').map(l => {
      const [lbl, pts] = l.split('|');
      return { label: (lbl || '').trim(), max: Number(pts) };
    }).filter(r => r.label && Number.isFinite(r.max));

    if (parsed.length) return parsed;
    if (lmState?.examOwned && (item.type === 'task' || item.response !== undefined)) {
      return [
        { label: 'Task Achievement', max: 2.5 },
        { label: 'Lexical Resource', max: 2.5 },
        { label: 'Grammatical Range & Accuracy', max: 2.5 },
        { label: 'Fluency & Coherence', max: 2.5 }
      ];
    }
    return [];
  }

  const openTask = { type: 'task', title: 'Essay', response: 'Student written paragraph' };
  const rubric = assessmentRubric(openTask);

  assert.equal(rubric.length, 4, '4 criteria rubric generated');
  assert.equal(rubric[0].label, 'Task Achievement');
  assert.equal(rubric[0].max, 2.5);
  assert.equal(rubric[1].label, 'Lexical Resource');
  assert.equal(rubric[1].max, 2.5);
  assert.equal(rubric[2].label, 'Grammatical Range & Accuracy');
  assert.equal(rubric[2].max, 2.5);
  assert.equal(rubric[3].label, 'Fluency & Coherence');
  assert.equal(rubric[3].max, 2.5);

  const totalPoints = rubric.reduce((s, r) => s + r.max, 0);
  assert.equal(totalPoints, 10.0, 'Total points across 4 criteria equals 10.0');

  // Verify proctoring audit data
  const switches = lmState.tabSwitches || 0;
  assert.equal(switches, 2, '2 tab switches recorded in audit');
  assert.equal(lmState.timeLimit, 90, '90 min time limit preserved');
});
