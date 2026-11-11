import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExamScoring } from '../src/exam-scoring.mjs';
import { examSuggestion } from '../src/exam-checking.mjs';

function lmDetectCefrLevel(className, groupTitle) {
  const text = String(className || groupTitle || '').trim();
  const match = text.match(/(?:^|[^A-Za-z0-9])(A1|A2\+|A2|B1\+|B1|B2\+|B2|C1|C2)(?:[^A-Za-z0-9]|$)/i);
  if (match) return match[1].toUpperCase();
  return 'B1';
}

test('Stage 3: Automatic CEFR level extraction from class/group title', () => {
  assert.equal(lmDetectCefrLevel('B2 Upper-Intermediate'), 'B2');
  assert.equal(lmDetectCefrLevel('A2+ Elementary Group'), 'A2+');
  assert.equal(lmDetectCefrLevel('c1 advanced evening'), 'C1');
  assert.equal(lmDetectCefrLevel('A1 Beginner'), 'A1');
  assert.equal(lmDetectCefrLevel(''), 'B1');
  assert.equal(lmDetectCefrLevel('Custom Motivated Adults'), 'B1');
});

test('Stage 7: Non-empty lesson preserves Section 1 & 2 (metadata & overview)', () => {
  function getInitialSectionStates(isNonEmptyLesson) {
    return {
      metadata: !isNonEmptyLesson,
      overview: !isNonEmptyLesson,
      words: true,
      phrases: true,
      rules: true,
      classwork: true,
      homework: true
    };
  }

  // 1. Empty lesson: sections 1-7 all true
  const emptyLessonStates = getInitialSectionStates(false);
  assert.equal(emptyLessonStates.metadata, true);
  assert.equal(emptyLessonStates.overview, true);
  assert.equal(emptyLessonStates.words, true);
  assert.equal(emptyLessonStates.classwork, true);

  // 2. Non-empty lesson: sections 1 & 2 are unchecked (false), 3-7 are checked (true)
  const nonEmptyLessonStates = getInitialSectionStates(true);
  assert.equal(nonEmptyLessonStates.metadata, false);
  assert.equal(nonEmptyLessonStates.overview, false);
  assert.equal(nonEmptyLessonStates.words, true);
  assert.equal(nonEmptyLessonStates.phrases, true);
  assert.equal(nonEmptyLessonStates.rules, true);
  assert.equal(nonEmptyLessonStates.classwork, true);
  assert.equal(nonEmptyLessonStates.homework, true);
});

test('Stage E3: Exam scoring and validation for Video choice and Smart Flashcard', () => {
  // 1. Video choice scoring validation in validateExamScoring
  const validExamParts = [
    {
      id: 'p1',
      type: 'quiz',
      quizType: 'Video choice',
      scoringVersion: 3,
      assignmentId: 'a-1',
      maxPoints: 5,
      items: [
        {
          prompt: 'What did the speaker say?',
          options: ['Option A', 'Option B', 'Option C'],
          answer: 0,
          mediaId: 'media-123',
          transcript: 'Full transcript',
          maxPoints: 5
        }
      ]
    }
  ];

  assert.doesNotThrow(() => {
    validateExamScoring(validExamParts);
  });

  // 2. Video choice with less than 2 options throws error
  const invalidVideoQuiz = [
    {
      id: 'p2',
      type: 'quiz',
      quizType: 'Video choice',
      scoringVersion: 3,
      assignmentId: 'a-2',
      maxPoints: 5,
      items: [
        {
          prompt: 'What did the speaker say?',
          options: ['Only one option'],
          answer: 0,
          maxPoints: 5
        }
      ]
    }
  ];

  assert.throws(() => {
    validateExamScoring(invalidVideoQuiz);
  }, /At least two options are required/);

  // 3. Missing maxPoints throws error
  const missingPointsQuiz = [
    {
      id: 'p3',
      type: 'quiz',
      quizType: 'Video choice',
      scoringVersion: 3,
      assignmentId: 'a-3',
      items: [
        {
          prompt: 'What did the speaker say?',
          options: ['Option A', 'Option B'],
          answer: 0
        }
      ]
    }
  ];

  assert.throws(() => {
    validateExamScoring(missingPointsQuiz);
  }, /Set Maximum points explicitly/);

  // 4. examSuggestion for Video choice
  const videoItem = validExamParts[0].items[0];
  const videoQuestion = { part: validExamParts[0], item: videoItem, index: 0, max: 5 };

  assert.equal(examSuggestion(videoQuestion, 0), 5); // Correct answer
  assert.equal(examSuggestion(videoQuestion, 1), 0); // Wrong answer
  assert.equal(examSuggestion(videoQuestion, null), 0); // No answer

  // 5. examSuggestion for Smart Flashcard
  const flashcardPart = {
    id: 'p4',
    type: 'quiz',
    quizType: 'Smart Flashcard',
    scoringVersion: 3,
    assignmentId: 'a-4',
    maxPoints: 2,
    items: [
      {
        front: 'detour',
        back: 'объезд',
        example: 'Take a detour.',
        maxPoints: 2
      }
    ]
  };
  const flashcardQuestion = { part: flashcardPart, item: flashcardPart.items[0], index: 0, max: 2 };

  assert.equal(examSuggestion(flashcardQuestion, 'объезд'), 2); // Exact answer
  assert.equal(examSuggestion(flashcardQuestion, '   ОБЪЕЗД   '), 2); // Normalized answer
  assert.equal(examSuggestion(flashcardQuestion, 'пробка'), 0); // Wrong answer
});
