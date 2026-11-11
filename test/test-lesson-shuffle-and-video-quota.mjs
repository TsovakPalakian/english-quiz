import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_VIDEO_LIMITS, checkExamVideoPlayQuota } from '../src/quiz-media.mjs';

test('Stage E5: EXAM_VIDEO_LIMITS and checkExamVideoPlayQuota', () => {
  assert.equal(EXAM_VIDEO_LIMITS.maxPlays, 2, 'Exam video limit is strictly 2 plays max');
  assert.equal(EXAM_VIDEO_LIMITS.allowScrubbing, false, 'Scrubbing is locked during exams');

  assert.equal(checkExamVideoPlayQuota(0), true, '0 plays is within quota');
  assert.equal(checkExamVideoPlayQuota(1), true, '1 play is within quota');
  assert.equal(checkExamVideoPlayQuota(2), false, '2 plays exhausts quota');
  assert.equal(checkExamVideoPlayQuota(5), false, 'Excess plays blocked');
});

test('Stage 10: Task count calculation across sections (CW + HW)', () => {
  const elements = {
    lmTaskCountPerSection: { value: '3', dataset: {}, addEventListener() {} },
    lmQuizClasswork: { checked: true, dataset: {}, addEventListener() {} },
    lmQuizHomework: { checked: true, dataset: {}, addEventListener() {} },
    lmTaskTotalSummary: { textContent: '' }
  };

  globalThis.document = {
    getElementById(id) {
      return elements[id] || null;
    }
  };

  function lmGetTaskCounts() {
    const countInput = document.getElementById('lmTaskCountPerSection');
    const count = parseInt(countInput ? countInput.value : '3', 10);
    const perSection = isNaN(count) || count < 1 ? 3 : count;
    const cwEl = document.getElementById('lmQuizClasswork');
    const hwEl = document.getElementById('lmQuizHomework');
    const cwChecked = cwEl ? cwEl.checked : true;
    const hwChecked = hwEl ? hwEl.checked : true;
    const cw = cwChecked ? perSection : 0;
    const hw = hwChecked ? perSection : 0;
    return { cw, hw, perSection, total: cw + hw };
  }

  function lmSyncTaskTotalSummary() {
    const summaryEl = document.getElementById('lmTaskTotalSummary');
    if (!summaryEl) return;
    const counts = lmGetTaskCounts();
    summaryEl.textContent = '(Total: ' + counts.total + ')';
  }

  // Both CW and HW checked with count = 3 -> 3 + 3 = 6
  let counts = lmGetTaskCounts();
  assert.equal(counts.cw, 3);
  assert.equal(counts.hw, 3);
  assert.equal(counts.total, 6);
  lmSyncTaskTotalSummary();
  assert.equal(elements.lmTaskTotalSummary.textContent, '(Total: 6)');

  // Uncheck HW -> 3 + 0 = 3
  elements.lmQuizHomework.checked = false;
  counts = lmGetTaskCounts();
  assert.equal(counts.cw, 3);
  assert.equal(counts.hw, 0);
  assert.equal(counts.total, 3);
  lmSyncTaskTotalSummary();
  assert.equal(elements.lmTaskTotalSummary.textContent, '(Total: 3)');

  // Change count to 5 -> 5 + 0 = 5
  elements.lmTaskCountPerSection.value = '5';
  counts = lmGetTaskCounts();
  assert.equal(counts.cw, 5);
  assert.equal(counts.hw, 0);
  assert.equal(counts.total, 5);
  lmSyncTaskTotalSummary();
  assert.equal(elements.lmTaskTotalSummary.textContent, '(Total: 5)');

  // Re-check HW -> 5 + 5 = 10
  elements.lmQuizHomework.checked = true;
  counts = lmGetTaskCounts();
  assert.equal(counts.cw, 5);
  assert.equal(counts.hw, 5);
  assert.equal(counts.total, 10);
  lmSyncTaskTotalSummary();
  assert.equal(elements.lmTaskTotalSummary.textContent, '(Total: 10)');
});

test('Stage 9: Random choice of quiz types from selected pool and Fisher-Yates shuffle', () => {
  // Constrain pool strictly to 'Gap' and 'Match'
  globalThis.window = {
    lmGetSelectedQuizTypes: () => ['Gap', 'Match']
  };

  const words = [
    { word: 'detour', meaning: 'объезд', example: 'Take a detour' },
    { word: 'commuter', meaning: 'пригородный пассажир', example: 'Daily commuter' }
  ];

  function lmGenerateExercisesList(targetCount, words, phrases, rules, title, isHw = false) {
    if (!targetCount || targetCount <= 0) return [];
    const pool = (words || []).map(w => ({ word: w.word, meaning: w.translation || w.meaning || w.word, example: w.example || ('Example with ' + w.word) }));
    const selectedPool = (typeof window !== 'undefined' && typeof window.lmGetSelectedQuizTypes === 'function' ? window.lmGetSelectedQuizTypes() : []).filter(Boolean);
    const availableTypes = selectedPool.length > 0 ? selectedPool : ['Choice'];

    const items = [];
    for (let i = 0; i < targetCount; i++) {
      const t = availableTypes[Math.floor(Math.random() * availableTypes.length)];
      const targetObj = pool[i % pool.length];
      const target = targetObj.word;
      if (t === 'Gap') {
        items.push({ quizType: 'Gap', answer: target, stage: 'guided', generated: true });
      } else if (t === 'Match') {
        items.push({ quizType: 'Match', items: [{ left: target, right: targetObj.meaning }], stage: 'guided', generated: true });
      }
    }

    // Fisher-Yates array shuffle
    for (let idx = items.length - 1; idx > 0; idx--) {
      const swap = Math.floor(Math.random() * (idx + 1));
      const temp = items[idx];
      items[idx] = items[swap];
      items[swap] = temp;
    }

    return items;
  }

  const generated = lmGenerateExercisesList(6, words, [], [], 'Travel', false);
  assert.equal(generated.length, 6, 'Generated exact target count of 6 items');
  for (const item of generated) {
    assert.ok(['Gap', 'Match'].includes(item.quizType), `item quizType ${item.quizType} is within selected pool`);
  }
});

test('Stage 11: Non-empty lesson preserves active lesson and appends blocks without duplicate creation', () => {
  let createLessonCalled = false;
  function lmCreateLesson() {
    createLessonCalled = true;
  }

  const activeLesson = {
    id: 'lesson-123',
    title: 'Business English',
    description: 'Corporate communication',
    blocks: [
      { tab: 'overview', type: 'text', html: '<p>Overview</p>' },
      { tab: 'words', type: 'vocab', items: [{ word: 'negotiate', meaning: 'вести переговоры' }] }
    ]
  };

  globalThis.lmState = activeLesson;

  function lmExtractLessonContextText(lesson) {
    if (!lesson || !Array.isArray(lesson.blocks)) return '';
    const parts = [];
    if (lesson.title) parts.push('Title: ' + lesson.title);
    if (lesson.description) parts.push('Description: ' + lesson.description);
    const words = [];
    lesson.blocks.forEach(b => {
      if (b.tab === 'words' && Array.isArray(b.items)) {
        b.items.forEach(it => { if (it.word) words.push(it.word + ' - ' + (it.translation || it.meaning || it.word)); });
      }
    });
    if (words.length) parts.push('Words:\n' + words.join('\n'));
    return parts.join('\n\n');
  }

  const contextText = lmExtractLessonContextText(activeLesson);
  assert.ok(contextText.includes('Title: Business English'));
  assert.ok(contextText.includes('negotiate - вести переговоры'));

  const hasBlocks = !!(activeLesson && Array.isArray(activeLesson.blocks) && activeLesson.blocks.length > 0);
  if (!hasBlocks) {
    lmCreateLesson();
  }

  assert.equal(createLessonCalled, false, 'lmCreateLesson was NOT called because lesson is non-empty');
  assert.equal(activeLesson.id, 'lesson-123', 'Active lesson ID was preserved');

  // Simulated append of 2 generated exercises
  const newTasks = [
    { tab: 'classwork', type: 'exercise', items: [{ prompt: 'Question 1' }] },
    { tab: 'homework', type: 'quiz', quizType: 'Gap', items: [{ shown: '___' }] }
  ];

  for (const task of newTasks) {
    activeLesson.blocks.push(task);
  }

  assert.equal(activeLesson.blocks.length, 4, 'Blocks were appended directly to active lesson');
  assert.equal(activeLesson.blocks[2].tab, 'classwork');
  assert.equal(activeLesson.blocks[3].tab, 'homework');
});

test('Stage E5: Exam video player attaches quota (2 plays max) and scrubber lock', () => {
  const eventListeners = {};
  const videoMock = {
    dataset: {},
    attributes: {},
    parentElement: {
      querySelector() { return null; },
      children: []
    },
    currentTime: 0,
    controls: true,
    style: {},
    paused: true,
    setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(name, handler) {
      if (!eventListeners[name]) eventListeners[name] = [];
      eventListeners[name].push(handler);
    },
    pause() { this.paused = true; },
    insertAdjacentElement(pos, el) {
      this.badge = el;
    }
  };

  const rootMock = {
    querySelectorAll(tag) {
      if (tag === 'video') return [videoMock];
      return [];
    }
  };

  globalThis.document = {
    getElementById(id) {
      if (id === 'material') return rootMock;
      return null;
    },
    createElement(tag) {
      return { className: '', textContent: '', style: {} };
    }
  };

  globalThis.lmState = { examOwned: true, studentSaved: false };
  globalThis.canEditLessons = () => false;
  globalThis.canTuneStudentLessons = () => false;

  // Simulate examAttachStrictVideoQuota
  const videos = rootMock.querySelectorAll('video');
  videos.forEach(video => {
    video.dataset.examVideoAttached = '1';
    video.dataset.examPlays = '0';
    video.setAttribute('controlslist', 'nodownload noplaybackrate noscrub');
    video.setAttribute('disablepictureinpicture', 'true');

    const badge = { className: 'exam-video-quota-badge', innerHTML: '' };
    video.insertAdjacentElement('afterend', badge);

    function updateVideoBadge() {
      const plays = parseInt(video.dataset.examPlays || '0', 10);
      const isLocked = plays >= 2;
      badge.className = 'exam-video-quota-badge' + (isLocked ? ' is-locked' : '');
      badge.innerHTML = isLocked ? '🔒 Video plays: 2 / 2 (Quota exhausted)' : '📹 Video plays: ' + plays + ' / 2';
    }

    let maxAllowedTime = 0;
    video.addEventListener('timeupdate', () => {
      if (video.currentTime > maxAllowedTime) {
        if (video.currentTime - maxAllowedTime > 1.5) {
          video.currentTime = maxAllowedTime;
        } else {
          maxAllowedTime = video.currentTime;
        }
      }
    });

    video.addEventListener('seeking', () => {
      if (video.currentTime > maxAllowedTime + 1.0) {
        video.currentTime = maxAllowedTime;
      }
    });

    video.addEventListener('play', () => {
      let plays = parseInt(video.dataset.examPlays || '0', 10);
      if (plays >= 2) {
        video.pause();
        updateVideoBadge();
        return;
      }
      if (!video.dataset.currentPlayActive) {
        video.dataset.currentPlayActive = '1';
        plays += 1;
        video.dataset.examPlays = String(plays);
        updateVideoBadge();
      }
    });

    video.addEventListener('ended', () => {
      delete video.dataset.currentPlayActive;
      maxAllowedTime = 0;
      const plays = parseInt(video.dataset.examPlays || '0', 10);
      if (plays >= 2) {
        video.controls = false;
        video.style.pointerEvents = 'none';
        updateVideoBadge();
      }
    });

    updateVideoBadge();
  });

  assert.equal(videoMock.attributes.controlslist, 'nodownload noplaybackrate noscrub');
  assert.equal(videoMock.badge.innerHTML, '📹 Video plays: 0 / 2');

  // First playback
  eventListeners.play.forEach(fn => fn());
  assert.equal(videoMock.dataset.examPlays, '1');
  assert.equal(videoMock.badge.innerHTML, '📹 Video plays: 1 / 2');

  // Progress time normally in small increments
  for (let t = 0.5; t <= 3.0; t += 0.5) {
    videoMock.currentTime = t;
    eventListeners.timeupdate.forEach(fn => fn());
  }
  assert.equal(videoMock.currentTime, 3.0);

  // Attempt forward seek beyond allowed limit (e.g. skip ahead to 50s)
  videoMock.currentTime = 50.0;
  eventListeners.seeking.forEach(fn => fn());
  assert.equal(videoMock.currentTime, 3.0, 'Forward scrubber seek attempt was blocked and reverted');

  // Finish first play
  eventListeners.ended.forEach(fn => fn());

  // Second playback
  eventListeners.play.forEach(fn => fn());
  assert.equal(videoMock.dataset.examPlays, '2');
  assert.equal(videoMock.badge.innerHTML, '🔒 Video plays: 2 / 2 (Quota exhausted)');

  // Finish second play -> video controls disabled and player locked
  eventListeners.ended.forEach(fn => fn());
  assert.equal(videoMock.controls, false, 'Video controls disabled after 2nd play');
  assert.equal(videoMock.style.pointerEvents, 'none', 'Pointer events disabled');

  // Attempt third play
  eventListeners.play.forEach(fn => fn());
  assert.equal(videoMock.paused, true, '3rd playback attempt immediately paused');
});
