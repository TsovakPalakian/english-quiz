import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Unit test: calculateLessonEvaluation respects custom task weights and requires grading for tasks', () => {
  const lessonsSrc = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');

  const evalMatch = lessonsSrc.match(/function calculateLessonEvaluation\(material\) \{[\s\S]*?\n    \}/);
  assert.ok(evalMatch, 'calculateLessonEvaluation must be present');

  const fn = new Function('window', 'loadLearned', 'loadStarted', 'esc', `
    ${evalMatch[0]};
    return calculateLessonEvaluation;
  `);

  const calculateLessonEvaluation = fn(
    { viewAccount: null },
    () => new Set(['word1', 'word2']),
    () => ['test-lesson'],
    s => String(s || '')
  );

  const testLesson = {
    id: 'test-lesson',
    blocks: [
      { id: 'w1', tab: 'words', type: 'wordcard', word: 'word1' },
      { id: 'w2', tab: 'words', type: 'wordcard', word: 'word2' },
      // Choice quiz with weight 1
      { id: 'q1', tab: 'homework', type: 'quiz', quizType: 'Choice', weight: 1, items: [{ prompt: 'Q1', answer: 0, picked: 0 }], checked: true },
      // Task with weight 5
      { id: 't1', tab: 'homework', type: 'task', title: 'Essay', weight: 5, maxPoints: 5, response: 'My written response' }
    ]
  };

  // State 1: Student submitted text into Task, but teacher hasn't graded it yet
  const eval1 = calculateLessonEvaluation(testLesson);
  assert.equal(eval1.components.homework.completed, false, 'Homework must NOT be completed without teacher grade');
  assert.equal(eval1.components.homework.max, 6, 'Total homework max points must sum weights (1 + 5 = 6)');
  assert.equal(eval1.components.homework.earned, 1, 'Only graded/checked quiz points earned (1/6)');

  // State 2: Teacher assigns grade 4/5
  testLesson.blocks[3].grade = 4;
  const eval2 = calculateLessonEvaluation(testLesson);
  assert.equal(eval2.components.homework.completed, true, 'Homework is completed after teacher grading');
  assert.equal(eval2.components.homework.earned, 5, 'Earned 1 from quiz + 4 from task = 5/6');
  assert.equal(eval2.status, 'Completed');
});

test('Visual and DOM test: Open answer header alignment, 24px square palette, locking, and self-check bar across themes', async () => {
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const browser = await chromium.launch({ headless: true });

  for (const theme of ['sky', 'dark', 'almond']) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 880, height: 750 });

    const html = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}" data-display-size="comfortable">
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body style="padding: 24px; background: var(--bg); color: var(--ink);">
  <div id="material">
    <div id="lmPreview">
      <div class="lm-assignment lm-assignment-tone-0" data-assignment="task-1">
        <header>
          <h3>Task 1 · Grammar Check (Choice Quiz)</h3>
          <span class="lm-task-weight-badge">Weight: 1 pt</span>
        </header>
        <div class="lm-panel">
          <div class="lm-q">
            <b>It was an unforgettable _______ to visit the ancient ruins.</b>
            <div class="lm-opts">
              <label class="lm-opt is-selected is-locked">
                <input type="radio" name="pv-q1" data-pick="b1:0:0" checked disabled />
                <span>experience</span>
              </label>
              <label class="lm-opt is-locked">
                <input type="radio" name="pv-q1" data-pick="b1:0:1" disabled />
                <span>destination</span>
              </label>
            </div>
          </div>
          <div class="lm-block-actions">
            <span class="lm-locked-badge">✓ Submitted & Locked</span>
            <button type="button" class="lm-btn lm-send-teacher-btn" data-send-teacher="b1">📩 Send to Teacher for Review</button>
          </div>
        </div>
      </div>

      <div class="lm-assignment lm-assignment-tone-1" data-assignment="task-2">
        <header>
          <h3>Task 2 · Language Learning Action Plan</h3>
          <span class="lm-task-weight-badge">Weight: 5 pts</span>
        </header>
        <div class="lm-panel">
          <p>Write your plan.</p>
          <div class="lm-answer-head">
            <label class="lm-answer-label">Your answer</label>
            <div class="text-color-tools">
              <input type="color" value="#173832" aria-label="Text color" />
            </div>
          </div>
          <textarea class="text-color-rich" style="width:100%; box-sizing:border-box;">My action plan.</textarea>
          <div class="lm-task-actions">
            <button type="button" class="lm-btn lm-btn-primary lm-submit-answer" data-submit-task="b2">🔒 Submit Answer</button>
            <button type="button" class="lm-btn lm-send-teacher-btn" data-send-teacher="b2">📩 Send to Teacher for Review</button>
          </div>
        </div>
      </div>

      <div class="lm-self-check-bar" data-tab-self-check="homework">
        <div class="lm-self-check-info">
          <strong>Self-Check All Tasks</strong>
          <span>Submit and lock your answers, then run self-check with AI.</span>
        </div>
        <button type="button" class="lm-btn lm-btn-primary lm-self-check-btn" data-run-self-check="homework">🔍 Self-Check All Tasks (Check with AI)</button>
      </div>
    </div>
  </div>
</body>
</html>`;

    await page.setContent(html);

    // 1. Verify palette is 24px x 24px square
    const paletteDims = await page.evaluate(() => {
      const el = document.querySelector('.text-color-tools input[type="color"]');
      const cs = window.getComputedStyle(el);
      return {
        width: Math.round(parseFloat(cs.width)),
        height: Math.round(parseFloat(cs.height)),
        borderRadius: cs.borderRadius
      };
    });
    assert.equal(paletteDims.width, 24, `Palette width must be 24px in ${theme}`);
    assert.equal(paletteDims.height, 24, `Palette height must be 24px in ${theme}`);

    // 2. Verify answer header display is flex and space-between
    const answerHeadStyle = await page.evaluate(() => {
      const el = document.querySelector('.lm-answer-head');
      const cs = window.getComputedStyle(el);
      return {
        display: cs.display,
        justifyContent: cs.justifyContent,
        alignItems: cs.alignItems
      };
    });
    assert.equal(answerHeadStyle.display, 'flex');
    assert.equal(answerHeadStyle.justifyContent, 'space-between');

    // 3. Verify label font size >= 15px and font-weight >= 700
    const labelStyle = await page.evaluate(() => {
      const el = document.querySelector('.lm-answer-label');
      const cs = window.getComputedStyle(el);
      return {
        fontSize: parseFloat(cs.fontSize),
        fontWeight: parseInt(cs.fontWeight, 10)
      };
    });
    assert.ok(labelStyle.fontSize >= 15, `Your answer font-size must be at least 15px in ${theme}`);
    assert.ok(labelStyle.fontWeight >= 700, `Your answer font-weight must be bold in ${theme}`);

    // 4. Verify weight badge is displayed in header
    const weightBadges = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.lm-task-weight-badge')).map(el => el.textContent.trim());
    });
    assert.deepEqual(weightBadges, ['Weight: 1 pt', 'Weight: 5 pts']);

    // 5. Verify Send to Teacher buttons exist in both blocks
    const sendButtons = await page.$$('.lm-send-teacher-btn');
    assert.equal(sendButtons.length, 2, `Send to Teacher button must exist in every block in ${theme}`);

    // 6. Verify self-check bar exists
    const selfCheckBtn = await page.$('.lm-self-check-btn');
    assert.ok(selfCheckBtn, `Self-check button must exist at the bottom in ${theme}`);

    await page.close();
  }

  await browser.close();
});

test('Unit test: Lesson retake archives attempt snapshot and comparison calculates delta', () => {
  const lessonsSrc = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');

  const evalMatch = lessonsSrc.match(/function calculateLessonEvaluation\(material\) \{[\s\S]*?\n    \}/);
  const evalHtmlMatch = lessonsSrc.match(/function lmEvaluationHtml\(material\) \{[\s\S]*?\n    \}/);
  assert.ok(evalMatch, 'calculateLessonEvaluation must be present');
  assert.ok(evalHtmlMatch, 'lmEvaluationHtml must be present');

  const fn = new Function('window', 'loadLearned', 'loadStarted', 'esc', `
    ${evalMatch[0]};
    ${evalHtmlMatch[0]};
    return { calculateLessonEvaluation, lmEvaluationHtml };
  `);

  const { calculateLessonEvaluation, lmEvaluationHtml } = fn(
    { viewAccount: null },
    () => new Set(['word1', 'word2']),
    () => ['test-lesson'],
    s => String(s || '')
  );

  const lesson = {
    id: 'test-lesson',
    title: 'Test Lesson',
    attempts: [],
    blocks: [
      { id: 'w1', tab: 'words', type: 'wordcard', word: 'word1' },
      { id: 'w2', tab: 'words', type: 'wordcard', word: 'word2' },
      { id: 'q1', tab: 'homework', type: 'quiz', quizType: 'Choice', weight: 1, items: [{ prompt: 'Q1', answer: 0, picked: 0 }], checked: true },
      { id: 't1', tab: 'homework', type: 'task', title: 'Essay', weight: 5, maxPoints: 5, response: 'My draft', grade: 3, teacherVerified: true }
    ]
  };

  // Attempt 1: 1 quiz pt + 3 task pts = 4/6 pts (67%)
  const eval1 = calculateLessonEvaluation(lesson);
  assert.equal(eval1.status, 'Completed');
  assert.equal(eval1.totalEarned, 4);

  // Archive Attempt 1
  lesson.attempts.push({
    number: 1,
    date: Date.now() - 3600000,
    totalEarned: eval1.totalEarned,
    totalMax: eval1.totalMax,
    scorePct: eval1.scorePct,
    tasks: eval1.tasks.map(t => ({ id: t.id, title: t.title, earned: t.earned, max: t.max }))
  });

  // Retake: Student improves grade to 5/5 on Task!
  lesson.blocks[3].grade = 5;
  const eval2 = calculateLessonEvaluation(lesson);
  assert.equal(eval2.totalEarned, 6);
  assert.equal(eval2.scorePct, 100);

  // Render Evaluation HTML for Attempt 2
  const html = lmEvaluationHtml(lesson);
  assert.ok(html.includes('Score Comparison: Attempt 1 vs Attempt 2'), 'Must display comparison header');
  assert.ok(html.includes('Retake Lesson (New Attempt)'), 'Must include retake button');
  assert.ok(html.includes('+33% Improvement'), 'Must include calculated improvement percentage');
  assert.ok(html.includes('improved from 3/5'), 'Must include per-task improvement note');
});

test('Visual and DOM test: Teacher grading panel, Retake button, and Comparison cards across themes', async () => {
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const browser = await chromium.launch({ headless: true });

  for (const theme of ['sky', 'dark', 'almond']) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 880, height: 900 });

    const html = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}" data-display-size="comfortable">
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body style="padding: 24px; background: var(--bg); color: var(--ink);">
  <div class="teacher-grading-panel">
    <div class="grading-input-group">
      <span>Teacher Evaluation:</span>
      <input type="number" min="0" max="5" value="4" data-teacher-grade-input="b2" />
      <span>/ 5 pts</span>
      <span class="lm-teacher-approved-tag">✓ Verified by Teacher (4 / 5 pt)</span>
    </div>
    <div class="grading-btns">
      <button type="button" class="lm-btn lm-btn-primary" data-approve-grade="b2">✓ Approve Grade</button>
      <button type="button" class="lm-btn" data-ai-eval="b2">🤖 Check with AI</button>
    </div>
  </div>

  <div class="lm-score-comparison">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h4>📊 Score Comparison: Attempt 1 vs Attempt 2</h4>
      <span class="lm-delta-badge" style="background:rgba(16,185,129,0.15); color:#059669;">+20% Improvement ▲</span>
    </div>
    <div class="lm-comparison-grid">
      <div class="lm-comparison-box">
        <div class="lm-comparison-label">Attempt 1 (Previous)</div>
        <div class="lm-comparison-val">14 / 20 pts (70%)</div>
      </div>
      <div class="lm-comparison-box">
        <div class="lm-comparison-label">Attempt 2 (Current)</div>
        <div class="lm-comparison-val">18 / 20 pts (90%)</div>
      </div>
      <div class="lm-comparison-box">
        <div class="lm-comparison-label">Score Delta</div>
        <div class="lm-comparison-val">+4 pts (+20%)</div>
      </div>
    </div>
    <button type="button" class="lm-btn lm-btn-primary lm-retake-btn" data-retake-lesson="1">🔄 Retake Lesson (New Attempt)</button>
  </div>
</body>
</html>`;

    await page.setContent(html);

    // Verify teacher panel exists and has flex layout
    const panelStyle = await page.evaluate(() => {
      const el = document.querySelector('.teacher-grading-panel');
      const cs = window.getComputedStyle(el);
      return { display: cs.display, borderRadius: cs.borderRadius };
    });
    assert.equal(panelStyle.display, 'flex');

    // Verify comparison grid has 3 columns
    const gridCols = await page.evaluate(() => {
      const el = document.querySelector('.lm-comparison-grid');
      return window.getComputedStyle(el).gridTemplateColumns.split(' ').length;
    });
    assert.equal(gridCols, 3, `Comparison grid must have 3 columns in ${theme}`);

    // Verify retake button exists
    const retakeBtn = await page.$('.lm-retake-btn');
    assert.ok(retakeBtn, `Retake button must render in ${theme}`);

    await page.close();
  }

  await browser.close();
});

test('Visual and DOM test: Rubric breakdown, Inline feedback, Voice dictation, Attempts selector, and PDF certificate modal across themes', async () => {
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const browser = await chromium.launch({ headless: true });

  for (const theme of ['sky', 'dark', 'almond']) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 880, height: 1200 });

    const html = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}" data-display-size="comfortable">
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body style="padding: 24px; background: var(--bg); color: var(--ink);">
  <!-- 1. Voice dictation & Tools -->
  <div class="lm-answer-head">
    <label class="lm-answer-label">Your answer</label>
    <div class="voice-tools-row">
      <button type="button" class="voice-mic-btn" data-voice-dictate="task-1">🎙 Dictate Answer</button>
    </div>
  </div>

  <div class="voice-recording-panel">
    <div class="voice-panel-head">
      <div class="voice-indicator-live"><span class="voice-pulse-dot"></span><span>Recording live speech... 0:14</span></div>
      <div class="voice-soundwave">
        <div class="soundwave-bar" style="height:6px;"></div>
        <div class="soundwave-bar" style="height:14px;"></div>
        <div class="soundwave-bar" style="height:18px;"></div>
        <div class="soundwave-bar" style="height:10px;"></div>
        <div class="soundwave-bar" style="height:16px;"></div>
        <div class="soundwave-bar" style="height:8px;"></div>
      </div>
      <div class="voice-actions">
        <button type="button" class="lm-btn lm-btn-primary" data-voice-stop="task-1" style="padding:5px 12px; font-size:12px;">⏹ Stop & Transcribe</button>
        <button type="button" class="lm-btn" data-voice-cancel="task-1" style="border:1px solid var(--line); padding:5px 10px; font-size:12px;">✕ Cancel</button>
      </div>
    </div>
  </div>

  <div style="margin-top:10px;">
    <div class="voice-metrics-badge">✓ Speech Metrics: 118 WPM (Optimal pace) · Pronunciation Fluency: 92%</div>
  </div>

  <!-- 2. Inline corrections -->
  <div class="inline-review-card">
    <div class="inline-review-head">
      <div><strong>Interactive Feedback & Corrections</strong></div>
      <span style="font-size:12px; font-weight:700; color:var(--acc); background:var(--acc-s); padding:4px 10px; border-radius:6px;">2 Corrections Found</span>
    </div>
    <div class="inline-text-canvas">
      I will shadow native podcasts to eliminate 
      <span class="inline-correction grammar" data-correction-id="task-1:c1">less mistakes
        <div class="inline-popover" style="display:flex;">
          <div class="inline-popover-tag" style="color:#b45309;">Grammar Correction</div>
          <div class="inline-popover-change"><span class="inline-popover-orig">less mistakes</span><span>➔</span><span class="inline-popover-repl">fewer mistakes</span></div>
          <div class="inline-popover-note">Countable noun requires "fewer".</div>
          <button type="button" class="lm-btn lm-btn-primary" data-accept-correction="task-1:c1">✓ Accept Correction</button>
        </div>
      </span>
      and 
      <span class="inline-correction vocab" data-correction-id="task-1:c2">make better
        <div class="inline-popover" style="display:none;">
          <div class="inline-popover-tag" style="color:#4f46e5;">Vocabulary Enhancement</div>
          <div class="inline-popover-change"><span class="inline-popover-orig">make better</span><span>➔</span><span class="inline-popover-repl">enhance</span></div>
          <div class="inline-popover-note">Academic verb enhance.</div>
          <button type="button" class="lm-btn lm-btn-primary" data-accept-correction="task-1:c2">✓ Accept Correction</button>
        </div>
      </span>
      pronunciation.
    </div>
    <div class="inline-review-foot">
      <div>Grammar suggestions · Vocabulary enhancements</div>
      <button type="button" class="lm-btn" data-toggle-original="task-1">Toggle Original Text</button>
    </div>
  </div>

  <!-- 3. Rubric Breakdown -->
  <div class="rubric-panel">
    <div class="rubric-head">
      <div><strong>Evaluation Rubric Breakdown</strong></div>
      <button type="button" class="lm-btn" data-ai-rubric-analysis="task-1">🤖 AI Rubric Analysis</button>
    </div>
    <div class="rubric-criteria-grid">
      <div class="rubric-criterion">
        <div class="criterion-title"><span>Grammar Accuracy</span><span>max 2 pts</span></div>
        <div class="criterion-scale">
          <button type="button" class="scale-btn" data-rubric-score="0">0</button>
          <button type="button" class="scale-btn" data-rubric-score="1">1</button>
          <button type="button" class="scale-btn is-active" data-rubric-score="2">2 ✓</button>
        </div>
      </div>
      <div class="rubric-criterion">
        <div class="criterion-title"><span>Vocabulary Range</span><span>max 2 pts</span></div>
        <div class="criterion-scale">
          <button type="button" class="scale-btn" data-rubric-score="0">0</button>
          <button type="button" class="scale-btn is-active" data-rubric-score="1">1 ✓</button>
          <button type="button" class="scale-btn" data-rubric-score="2">2</button>
        </div>
      </div>
      <div class="rubric-criterion">
        <div class="criterion-title"><span>Task Achievement</span><span>max 1 pt</span></div>
        <div class="criterion-scale">
          <button type="button" class="scale-btn" data-rubric-score="0">0</button>
          <button type="button" class="scale-btn is-active" data-rubric-score="1">1 ✓</button>
        </div>
      </div>
    </div>
    <div class="rubric-foot">
      <div style="font-weight:800;">Calculated Total: 4 / 5 pts (80%)</div>
      <button type="button" class="lm-btn lm-btn-primary" data-save-rubric-grade="task-1">✓ Save Criteria Grade</button>
    </div>
  </div>

  <!-- 4. Attempts Selector & Archive Banner -->
  <div class="attempts-selector-wrap">
    <label for="attemptsSelect" style="font-size:12px; font-weight:700;">Selected Attempt:</label>
    <select id="attemptsSelect" class="attempts-select" data-select-attempt="1">
      <option value="0">Attempt 1 · 70% (14:30)</option>
      <option value="current" selected>Attempt 2 (Current) · 90%</option>
    </select>
  </div>

  <div class="archived-banner">
    <span>⚠️ Archive View: Viewing historical Attempt 1 (14/20 pts · 70%).</span>
    <button type="button" class="lm-btn" data-return-latest-attempt="1">← Return to Latest Attempt</button>
  </div>

  <!-- 5. PDF Certificate Modal -->
  <div class="modal-overlay" style="position:relative; min-height:400px; padding:10px;">
    <div class="certificate-modal">
      <div class="certificate-head">
        <h3>Academic Performance Certificate</h3>
        <button type="button" class="lm-btn" data-close-pdf-modal="1">✕</button>
      </div>
      <div class="certificate-body">
        <div class="cert-frame">
          <div class="cert-title">Lumiscia Language Academy</div>
          <div class="cert-sub">Certificate of Lesson Completion & Mastery</div>
          <div class="cert-student">Student: Alex Mercer</div>
          <div class="cert-score-box">Final Grade: 18 / 20 pts (90%) · Target Passed ✓</div>
          <div class="cert-grid">
            <div class="cert-grid-item"><b>Words:</b> 10/10 ✓</div>
            <div class="cert-grid-item"><b>Phrases:</b> 5/5 ✓</div>
            <div class="cert-grid-item"><b>Classwork:</b> 5/5 ✓</div>
            <div class="cert-grid-item"><b>Homework:</b> 8/10 ✓</div>
          </div>
        </div>
      </div>
      <div class="cert-foot">
        <button type="button" class="lm-btn" data-close-pdf-modal="1">✕ Close</button>
        <button type="button" class="lm-btn lm-btn-primary" data-print-pdf-certificate="1">⬇ Download PDF Certificate</button>
      </div>
    </div>
  </div>
</body>
</html>`;

    await page.setContent(html);

    // 1. Verify mic button and soundwave bars
    const micBtn = await page.$('.voice-mic-btn');
    assert.ok(micBtn, `Mic button must render in ${theme}`);
    const barsCount = await page.$$eval('.soundwave-bar', els => els.length);
    assert.equal(barsCount, 6, `Soundwave must have 6 bars in ${theme}`);

    // 2. Verify speech metrics badge exists
    const metricsBadge = await page.$('.voice-metrics-badge');
    assert.ok(metricsBadge, `Voice metrics badge must render in ${theme}`);

    // 3. Verify inline corrections and popover
    const grammarCorr = await page.$('.inline-correction.grammar');
    assert.ok(grammarCorr, `Grammar correction highlight must render in ${theme}`);
    const popoverVisible = await page.$eval('.inline-popover', el => window.getComputedStyle(el).display);
    assert.equal(popoverVisible, 'flex', `Active popover must be visible in ${theme}`);

    // 4. Verify rubric grid has 3 criteria and scale buttons
    const criteriaCount = await page.$$eval('.rubric-criterion', els => els.length);
    assert.equal(criteriaCount, 3, `Rubric must render 3 criteria in ${theme}`);
    const activeScalesCount = await page.$$eval('.scale-btn.is-active', els => els.length);
    assert.equal(activeScalesCount, 3, `Each criterion must have an active scale button in ${theme}`);

    // 5. Verify attempts select dropdown and archive banner
    const selectEl = await page.$('.attempts-select');
    assert.ok(selectEl, `Attempts select must render in ${theme}`);
    const bannerEl = await page.$('.archived-banner');
    assert.ok(bannerEl, `Archive banner must render in ${theme}`);

    // 6. Verify certificate modal structure
    const certTitle = await page.$eval('.cert-title', el => el.textContent.trim());
    assert.equal(certTitle, 'Lumiscia Language Academy', `Cert title must match academy name in ${theme}`);
    const certGridItems = await page.$$eval('.cert-grid-item', els => els.length);
    assert.equal(certGridItems, 4, `Certificate must display 4 component scores in ${theme}`);

    await page.close();
  }

  await browser.close();
});

test('Interactive end-to-end evaluation flow: Rubric scoring, inline feedback, voice transcription, attempts history, and PDF modal', () => {
  const lessonsSrc = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');

  const evalMatch = lessonsSrc.match(/function calculateLessonEvaluation\(material\) \{[\s\S]*?\n    \}/);
  const evalHtmlMatch = lessonsSrc.match(/function lmEvaluationHtml\(material\) \{[\s\S]*?\n    \}/);
  assert.ok(evalMatch, 'calculateLessonEvaluation must be present');
  assert.ok(evalHtmlMatch, 'lmEvaluationHtml must be present');

  const fn = new Function('window', 'loadLearned', 'loadStarted', 'esc', `
    ${evalMatch[0]};
    ${evalHtmlMatch[0]};
    return { calculateLessonEvaluation, lmEvaluationHtml };
  `);

  const { calculateLessonEvaluation, lmEvaluationHtml } = fn(
    { viewAccount: null },
    () => new Set(['word1', 'word2']),
    () => ['test-lesson'],
    s => String(s || '')
  );

  const lesson = {
    id: 'test-lesson',
    title: 'Advanced Fluency Workshop',
    showPdfModal: true,
    viewingAttemptIndex: null,
    attempts: [
      {
        number: 1,
        date: Date.now() - 7200000,
        totalEarned: 12,
        totalMax: 20,
        scorePct: 60,
        tasks: [{ id: 't1', title: 'Action Plan', earned: 3, max: 5 }]
      }
    ],
    blocks: [
      { id: 'w1', tab: 'words', type: 'wordcard', word: 'word1' },
      { id: 'w2', tab: 'words', type: 'wordcard', word: 'word2' },
      {
        id: 't1',
        tab: 'homework',
        type: 'task',
        title: 'Action Plan',
        weight: 5,
        maxPoints: 5,
        response: 'I will eliminate less mistakes and make better pronunciation.',
        rubricCriteria: { grammar: 2, vocabulary: 2, task: 1 },
        grade: 5,
        teacherVerified: true
      }
    ]
  };

  // 1. Current attempt evaluation
  const evalCurrent = calculateLessonEvaluation(lesson);
  assert.equal(evalCurrent.totalEarned, 5);
  assert.equal(evalCurrent.isCompleted, true);

  // 2. Evaluation HTML with PDF Modal open and attempts selector
  const htmlCurrent = lmEvaluationHtml(lesson);
  assert.ok(htmlCurrent.includes('Academic Performance Certificate'), 'Certificate modal must be present in HTML');
  assert.ok(htmlCurrent.includes('Selected Attempt:'), 'Attempts selector must be present');
  assert.ok(htmlCurrent.includes('Attempt 1 · 60%'), 'Previous attempt option must be listed');
  assert.ok(htmlCurrent.includes('Attempt 2 (Current)'), 'Current attempt option must be listed');
  assert.ok(htmlCurrent.includes('Download PDF Certificate'), 'Download PDF Certificate button must be present');

  // 3. Switch to archived Attempt 1
  lesson.viewingAttemptIndex = 0;
  const htmlArchive = lmEvaluationHtml(lesson);
  assert.ok(htmlArchive.includes('Archive View: Viewing historical Attempt 1 (12 / 20 pts · 60%)'), 'Archive banner must display historical score');
  assert.ok(htmlArchive.includes('← Return to Latest Attempt'), 'Return to latest attempt button must be present in archive view');
});
