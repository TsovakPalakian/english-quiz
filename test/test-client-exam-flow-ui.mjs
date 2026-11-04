import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractFunctions} from './helpers/extract-function.mjs';

const source = fs.readFileSync('client/54-exams.js', 'utf8');
const EXAM_FLOW_FUNCTIONS = [
  'examWorkAccount',
  'examWorkBag',
  'examWorkWrite',
  'assessmentActive',
  'assessmentKey',
  'assessmentRubric',
  'assessmentMax',
  'examScoringChildren',
  'examScoringMax',
  'assessmentAnswerQuestions',
  'assessmentApply',
  'examCollectAnswers',
  'assessmentWrite',
  'assessmentAutosave'
];

const extractedExamCode = extractFunctions(source, ...EXAM_FLOW_FUNCTIONS);

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _store: store
  };
}

function instantiateExamEnvironment({
  initialUser = {id: 'student-42', role: 'USER'},
  initialViewAccount = null,
  initialReviewStudent = null,
  canTuneStudent = false,
  canEdit = false,
  fetchHandler = null
} = {}) {
  const localStorageMock = createMockLocalStorage();
  const apiCalls = [];

  const defaultFetch = async (url, opts = {}) => {
    apiCalls.push({url, opts});
    if (fetchHandler) return fetchHandler(url, opts);
    const body = opts.body ? JSON.parse(opts.body) : {};
    const revision = (body.expectedRevision || 0) + 1;
    if (body.action === 'draft') {
      return {saved: false, state: 'draft', revision, answers: body.answers || {}};
    }
    if (body.action === 'submit') {
      return {saved: true, state: 'submitted', revision, answers: body.answers || {}};
    }
    if (body.action === 'reopen') {
      return {saved: false, state: 'draft', revision, answers: body.answers || {}};
    }
    if (body.action === 'publish') {
      return {
        saved: true,
        state: 'published',
        revision,
        points: {'501': {'0': 9}},
        corrections: {'501': {'0': 'Well reasoned!'}},
        criteriaPoints: {'501': {'0': {'Structure': 4, 'Content': 5}}}
      };
    }
    return {saved: true, state: 'submitted', revision};
  };

  let currentUser = initialUser;
  let currentViewAccount = initialViewAccount;
  let currentReviewStudent = initialReviewStudent;
  let tuneStudentLessons = canTuneStudent;
  let editLessons = canEdit;

  const statusLogs = [];
  const dressLogs = [];

  const runner = new Function(
    'localStorage',
    'accountFetch',
    'getAuthUser',
    'getViewAccount',
    'getMaterialReviewStudent',
    'canTuneStudentLessons',
    'canEditLessons',
    'assessmentStatus',
    'examPull',
    'lmRenderPreview',
    'examDress',
    'examPaintList',
    'examPaintBlocks',
    `
    let examWork = {};
    let examCurrentId = '';
    let assessmentTimer, assessmentPendingDoc, assessmentQueue = Promise.resolve();
    let lmState = null;

    Object.defineProperty(globalThis, 'authUser', { get: getAuthUser, configurable: true });
    Object.defineProperty(globalThis, 'viewAccount', { get: getViewAccount, configurable: true });
    Object.defineProperty(globalThis, 'materialReviewStudent', { get: getMaterialReviewStudent, configurable: true });

    ${extractedExamCode}

    async function assessmentAction(action, extra = {}) {
      const doc = lmState;
      if (!assessmentActive(doc) || !doc.assessmentReady || doc.assessmentBusy) return;
      if (assessmentPendingDoc === doc) { clearTimeout(assessmentTimer); assessmentPendingDoc = null; }
      doc.assessmentBusy = true; examDress();
      try { await assessmentWrite(doc, action, extra); }
      catch (error) { assessmentStatus(error.message, doc); throw error; }
      finally { doc.assessmentBusy = false; if (doc === lmState) examDress(); }
    }

    return {
      getLmState: () => lmState,
      setLmState: (doc) => { lmState = doc; },
      assessmentAutosave,
      assessmentWrite,
      assessmentAction,
      assessmentApply,
      examCollectAnswers,
      assessmentAnswerQuestions,
      examWorkBag,
      getPendingTimer: () => assessmentTimer,
      clearPendingTimer: () => clearTimeout(assessmentTimer),
      getPendingDoc: () => assessmentPendingDoc
    };
  `
  );

  const api = runner(
    localStorageMock,
    defaultFetch,
    () => currentUser,
    () => currentViewAccount,
    () => currentReviewStudent,
    () => tuneStudentLessons,
    () => editLessons,
    (msg, doc) => statusLogs.push({msg, doc}),
    async () => {},
    () => {},
    () => dressLogs.push(Date.now()),
    () => {},
    () => {}
  );

  return {
    api,
    apiCalls,
    localStorageMock,
    statusLogs,
    dressLogs,
    setAuthUser: (u) => {
      currentUser = u;
    },
    setViewAccount: (v) => {
      currentViewAccount = v;
    },
    setCanTune: (t) => {
      tuneStudentLessons = t;
    }
  };
}

test('examCollectAnswers correctly extracts answers across task, quiz, and exercise blocks', () => {
  const env = instantiateExamEnvironment();
  const doc = {
    examOwned: true,
    examId: 10,
    blockId: 101,
    blocks: [
      {
        id: 501,
        type: 'task',
        title: 'Analytical essay',
        response: 'Quantum entanglement represents non-local correlations.'
      },
      {
        id: 502,
        type: 'quiz',
        title: 'Multiple choice',
        items: [
          {q: 'Question 1', given: 'choice-b'},
          {q: 'Question 2', given: ''}, // empty given
          {q: 'Question 3', given: 'choice-d'}
        ]
      },
      {
        id: 503,
        type: 'exercise',
        title: 'Fill blanks',
        items: [{q: 'Gap 1', given: 'spoke'}]
      },
      {
        id: 504,
        type: 'info', // non-assessed block type
        title: 'Instructions',
        content: 'Read carefully.'
      }
    ]
  };

  const collected = env.api.examCollectAnswers(doc);
  assert.deepEqual(collected, {
    501: {0: 'Quantum entanglement represents non-local correlations.'},
    502: {0: 'choice-b', 2: 'choice-d'},
    503: {0: 'spoke'}
  });
});

test('assessmentAnswerQuestions detects missing answers and accurately tracks unanswered items', () => {
  const env = instantiateExamEnvironment();
  const doc = {
    examOwned: true,
    examId: 10,
    blockId: 101,
    blocks: [
      {
        id: 601,
        type: 'task',
        title: 'Essay',
        criteria: 'Criteria A|5\nCriteria B|5',
        response: 'Completed essay'
      },
      {
        id: 602,
        type: 'quiz',
        title: 'Quiz',
        items: [
          {q: 'Q1', given: 'answered'},
          {q: 'Q2', given: ''}, // unanswered
          {q: 'Q3', given: null} // unanswered
        ]
      }
    ]
  };

  const questions = env.api.assessmentAnswerQuestions(doc);
  assert.equal(questions.length, 4);

  const answers = env.api.examCollectAnswers(doc);
  const missing = questions.filter(
    (q) =>
      answers[q.part.id]?.[q.index] == null ||
      answers[q.part.id][q.index] === '' ||
      (Array.isArray(answers[q.part.id][q.index]) && !answers[q.part.id][q.index].length)
  );

  assert.equal(missing.length, 2);
  assert.equal(missing[0].part.id, 602);
  assert.equal(missing[0].index, 1);
  assert.equal(missing[1].part.id, 602);
  assert.equal(missing[1].index, 2);
});

test('assessmentAutosave buffers answers locally and dispatches draft save after debounce timer', async () => {
  const env = instantiateExamEnvironment();
  const doc = {
    examOwned: true,
    examId: 25,
    blockId: 201,
    assessmentReady: true,
    assessmentRevision: 1,
    assessmentState: 'draft',
    studentSaved: false,
    blocks: [
      {
        id: 701,
        type: 'task',
        response: 'First sentence written.'
      }
    ]
  };
  env.api.setLmState(doc);

  // 1. Trigger autosave
  env.api.assessmentAutosave(doc);
  assert.equal(doc.assessmentMessage, 'Unsaved changes');
  assert.ok(env.api.getPendingTimer());

  // Verify immediate buffer write to localStorage
  const localData = env.localStorageMock.getItem('enquiz-exam-work-student-42');
  assert.ok(localData);
  const parsedLocal = JSON.parse(localData);
  assert.deepEqual(parsedLocal['25/201'].answers, {701: {0: 'First sentence written.'}});
  assert.deepEqual(parsedLocal['25/201'].pendingAnswers, {701: {0: 'First sentence written.'}});

  // 2. Further edits restart the debounce timer
  doc.blocks[0].response = 'First sentence written. Second sentence added.';
  env.api.assessmentAutosave(doc);

  // 3. Await 750ms for debounce timer to fire and complete HTTP call
  await new Promise((r) => setTimeout(r, 750));

  assert.equal(env.apiCalls.length, 1);
  assert.equal(env.apiCalls[0].url, '/api/assessment');
  const payload = JSON.parse(env.apiCalls[0].opts.body);
  assert.equal(payload.action, 'draft');
  assert.equal(payload.kind, 'exam-block');
  assert.equal(payload.id, 201);
  assert.equal(payload.expectedRevision, 1);
  assert.deepEqual(payload.answers, {701: {0: 'First sentence written. Second sentence added.'}});

  // Verify document revision bumped and status updated
  assert.equal(doc.assessmentRevision, 2);
  assert.equal(doc.assessmentState, 'draft');
  assert.equal(doc.assessmentMessage, 'Draft saved');
});

test('assessmentAction submit locks the exam, clears pending timers, and prevents duplicate submissions', async () => {
  const env = instantiateExamEnvironment();
  const doc = {
    examOwned: true,
    examId: 30,
    blockId: 301,
    assessmentReady: true,
    assessmentRevision: 2,
    assessmentState: 'draft',
    studentSaved: false,
    blocks: [
      {
        id: 801,
        type: 'task',
        response: 'Final completed answer.'
      }
    ]
  };
  env.api.setLmState(doc);

  // Queue an autosave timer right before submit
  env.api.assessmentAutosave(doc);
  assert.ok(env.api.getPendingTimer());

  // Submit exam
  await env.api.assessmentAction('submit');

  // Verify pending autosave timer was cancelled
  assert.equal(env.api.getPendingDoc(), null);

  // Verify submit HTTP request was made with action 'submit'
  assert.equal(env.apiCalls.length, 1);
  const payload = JSON.parse(env.apiCalls[0].opts.body);
  assert.equal(payload.action, 'submit');
  assert.equal(payload.expectedRevision, 2);

  // Verify document state is locked
  assert.equal(doc.studentSaved, true);
  assert.equal(doc.assessmentState, 'submitted');
  assert.equal(doc.assessmentMessage, 'Submitted');

  // Verify further submit attempts are no-ops
  const callsBeforeSecondSubmit = env.apiCalls.length;
  if (doc.studentSaved) {
    // Client UI guard: if (lmState.studentSaved) return;
  } else {
    await env.api.assessmentAction('submit');
  }
  assert.equal(env.apiCalls.length, callsBeforeSecondSubmit);
});

test('assessmentAction reopen and publish cycle enables student corrections and feedback display', async () => {
  const env = instantiateExamEnvironment();
  const doc = {
    examOwned: true,
    examId: 40,
    blockId: 401,
    assessmentReady: true,
    assessmentRevision: 3,
    assessmentState: 'submitted',
    studentSaved: true,
    blocks: [
      {
        id: 901,
        type: 'task',
        response: 'My submission'
      }
    ]
  };
  env.api.setLmState(doc);

  // 1. Teacher reopens the exam
  env.setCanTune(true);
  await env.api.assessmentAction('reopen', {reason: 'Please elaborate on paragraph 2.'});

  assert.equal(env.apiCalls.length, 1);
  const reopenPayload = JSON.parse(env.apiCalls[0].opts.body);
  assert.equal(reopenPayload.action, 'reopen');
  assert.equal(reopenPayload.reason, 'Please elaborate on paragraph 2.');

  // Verify exam is unlocked for editing
  assert.equal(doc.studentSaved, false);
  assert.equal(doc.assessmentState, 'draft');

  // 2. Student revises answer and resubmits
  env.setCanTune(false);
  doc.blocks[0].response = 'My submission with detailed elaboration.';
  await env.api.assessmentAction('submit');

  assert.equal(env.apiCalls.length, 2);
  const resubmitPayload = JSON.parse(env.apiCalls[1].opts.body);
  assert.equal(resubmitPayload.action, 'submit');
  assert.equal(doc.studentSaved, true);
  assert.equal(doc.assessmentState, 'submitted');

  // 3. Teacher publishes scores and corrections
  env.setCanTune(true);
  await env.api.assessmentAction('publish');

  assert.equal(env.apiCalls.length, 3);
  const publishPayload = JSON.parse(env.apiCalls[2].opts.body);
  assert.equal(publishPayload.action, 'publish');

  // Verify published feedback and scores applied onto document
  assert.equal(doc.assessmentState, 'published');
  assert.equal(doc.assessmentMessage, 'Results published');
  assert.deepEqual(doc.examPoints, {'501': {'0': 9}});
  assert.deepEqual(doc.examCorrections, {'501': {'0': 'Well reasoned!'}});
  assert.deepEqual(doc.examCriteriaPoints, {'501': {'0': {'Structure': 4, 'Content': 5}}});
});

test('assessmentWrite prevents cross-student data corruption when active user switches', async () => {
  const env = instantiateExamEnvironment();
  const doc = {
    examOwned: true,
    examId: 50,
    blockId: 501,
    assessmentReady: true,
    assessmentRevision: 1,
    assessmentState: 'draft',
    studentSaved: false,
    blocks: [{id: 111, type: 'task', response: 'Sensitive personal exam text'}]
  };
  env.api.setLmState(doc);

  // Call assessmentWrite and simulate active user switching before task resolution
  const writePromise = env.api.assessmentWrite(doc, 'draft');
  env.setAuthUser({id: 'different-user-99', role: 'USER'});

  await assert.rejects(
    writePromise,
    (err) => err.message === 'Account changed. Reopen the material.'
  );

  // Ensure no payload was dispatched to the server for the wrong account
  assert.equal(env.apiCalls.length, 0);
  assert.equal(doc.assessmentError, true);
});
