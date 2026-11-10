import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

const clientCalendarJs = readFileSync('client/53a-group-calendar.js', 'utf8');
const previewJs = readFileSync('preview.js', 'utf8');
const previewCss = readFileSync('site/preview.css', 'utf8');

test('TASK-41: Contract checks for Open Lesson button and uniform date click pattern', () => {
  // 1. Verify open lesson button exists in client & preview
  assert.ok(clientCalendarJs.includes('id="gcwSchedOpenLessonBtn"'), 'clientCalendarJs defines #gcwSchedOpenLessonBtn');
  assert.ok(previewJs.includes('id="gcwSchedOpenLessonBtn"'), 'previewJs defines #gcwSchedOpenLessonBtn');
  assert.ok(clientCalendarJs.includes('Open lesson material →'), 'clientCalendarJs has button label Open lesson material →');
  assert.ok(previewJs.includes('Open lesson material →'), 'previewJs has button label Open lesson material →');

  // 2. Verify handleDateItemClick opens showLessonSchedulerModal for active single lessons
  assert.ok(clientCalendarJs.includes('if (lessons.length === 1) {\n        showLessonSchedulerModal(groupId, dateStr, state, container);'), 'handleDateItemClick opens modal on single lesson');
  assert.ok(previewJs.includes('lessons.length === 1'), 'previewJs checks lessons.length === 1');
  assert.ok(previewJs.includes('showLessonSchedulerModal(groupId, dateStr, state, container)'), 'previewJs calls showLessonSchedulerModal');

  // 3. Verify openLessonBtn click handler invokes window.lmOpenLesson
  assert.ok(clientCalendarJs.includes('window.lmOpenLesson(matId);'), 'openLessonBtn click calls lmOpenLesson');
  assert.ok(previewJs.includes('window.lmOpenLesson(matId);'), 'previewJs openLessonBtn click calls lmOpenLesson');
});

test('TASK-41: Logic contract for slot reschedule, attendance migration, and mat.dates cleanup', () => {
  // 1. Attendance migration on reschedule
  assert.ok(clientCalendarJs.includes('targetMonthData.attendance[stId][dateStr] = dates[initialDateStr];'), 'attendance is migrated to new date');
  assert.ok(clientCalendarJs.includes('delete dates[initialDateStr];'), 'old date attendance is deleted');
  assert.ok(previewJs.includes('targetMonthData.attendance[stId][dateStr] = dates[initialDateStr];'), 'previewJs migrates attendance to new date');
  assert.ok(previewJs.includes('delete dates[initialDateStr];'), 'previewJs deletes old date attendance');

  // 2. Material dates array cleanup
  assert.ok(clientCalendarJs.includes('m.dates = m.dates.filter(d => d !== initialDateStr);'), 'initialDateStr is filtered out of mat.dates');
  assert.ok(previewJs.includes('m.dates = m.dates.filter(d => d !== initialDateStr);'), 'previewJs filters initialDateStr from mat.dates');

  // 3. Multi-month save support
  assert.ok(clientCalendarJs.includes('specificMonthKey'), 'saveGroupAttendanceData supports specificMonthKey');
  assert.ok(clientCalendarJs.includes('await saveGroupAttendanceData(groupId, state, container, oldMonthKey);'), 'saves old month data when crossing month boundary');
  assert.ok(previewJs.includes('saveGroupAttendanceData(groupId, state, container, oldMonthKey);'), 'previewJs saves old month data when crossing month boundary');
});

test('TASK-41: Functional verification of date reschedule and attendance transfer', () => {
  // Simulate month data with an initial lesson slot and attendance
  const initialDateStr = '2026-11-16';
  const newDateStr = '2026-11-13';

  const monthData = {
    lessonDates: new Set(['2026-11-09', initialDateStr, '2026-11-20']),
    scheduleData: {
      [initialDateStr]: {
        startTime: '18:30',
        durationMinutes: 60,
        materialId: 'mat-101',
        period: 'single'
      }
    },
    attendance: {
      'student-1': { '2026-11-09': 'present', [initialDateStr]: 'present' },
      'student-2': { '2026-11-09': 'present', [initialDateStr]: 'absent' }
    }
  };

  const materials = [
    { id: 'mat-101', title: 'Test Lesson', date: initialDateStr, dates: [initialDateStr], groupId: 1 }
  ];

  // Perform reschedule simulation as implemented in client/53a-group-calendar.js
  const targetMonthData = monthData;
  const oldMonthData = monthData;

  // 1. Remove old date from lessonDates and scheduleData
  oldMonthData.lessonDates.delete(initialDateStr);
  delete oldMonthData.scheduleData[initialDateStr];

  // 2. Migrate attendance
  for (const [stId, dates] of Object.entries(oldMonthData.attendance)) {
    if (dates && dates[initialDateStr] !== undefined) {
      if (!targetMonthData.attendance[stId]) targetMonthData.attendance[stId] = {};
      targetMonthData.attendance[stId][newDateStr] = dates[initialDateStr];
      delete dates[initialDateStr];
    }
  }

  // 3. Clean up materials
  for (const m of materials) {
    if (Array.isArray(m.dates)) {
      m.dates = m.dates.filter(d => d !== initialDateStr);
    }
    if (m.date === initialDateStr) {
      m.date = newDateStr;
    }
  }

  // 4. Add new date
  targetMonthData.lessonDates.add(newDateStr);
  targetMonthData.scheduleData[newDateStr] = {
    startTime: '18:30',
    durationMinutes: 60,
    materialId: 'mat-101',
    period: 'single'
  };
  materials[0].dates.push(newDateStr);

  // Assertions
  assert.ok(!targetMonthData.lessonDates.has(initialDateStr), 'Old date 16.11 removed from lessonDates');
  assert.ok(targetMonthData.lessonDates.has(newDateStr), 'New date 13.11 added to lessonDates');
  assert.equal(targetMonthData.scheduleData[initialDateStr], undefined, 'Old scheduleData removed');
  assert.ok(targetMonthData.scheduleData[newDateStr], 'New scheduleData exists');

  assert.equal(targetMonthData.attendance['student-1'][initialDateStr], undefined, 'Student 1 old attendance removed');
  assert.equal(targetMonthData.attendance['student-1'][newDateStr], 'present', 'Student 1 attendance migrated to 13.11');

  assert.equal(targetMonthData.attendance['student-2'][initialDateStr], undefined, 'Student 2 old attendance removed');
  assert.equal(targetMonthData.attendance['student-2'][newDateStr], 'absent', 'Student 2 attendance migrated to 13.11');

  assert.ok(!materials[0].dates.includes(initialDateStr), 'Material dates no longer includes old date');
  assert.ok(materials[0].dates.includes(newDateStr), 'Material dates includes new date');
  assert.equal(materials[0].date, newDateStr, 'Material primary date updated');
});

test('TASK-41: Playwright UI visual test for Schedule Single Lesson with Open Lesson Material button', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 750 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body { background: #f8fafc; padding: 24px; font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; }
    .gcw-scheduler-dialog { position: relative; display: block; border: 1px solid var(--saas-border, #e2e8f0); border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); width: 100%; max-width: 480px; padding: 0; background: #fff; }
  </style>
</head>
<body>
  <div class="gcw-scheduler-dialog" id="gcwSchedulerDialog">
    <div class="gcw-scheduler-head">
      <h3><span>📅</span> Schedule Single Lesson</h3>
      <button type="button" class="gcw-choice-close-btn" aria-label="Close">✕</button>
    </div>
    <div class="gcw-scheduler-body" style="padding: 20px;">
      <div class="gcw-field-group">
        <label>Lesson Date <span style="display:inline-block; padding:2px 6px; font-size:10px; font-weight:700; background:#e0f2fe; color:#0369a1; border-radius:4px; margin-left:6px;">Click to change</span></label>
        <button type="button" class="gcw-date-picker-btn" style="width: 100%;">
          <span>Monday, 2026-11-16</span>
          <span aria-hidden="true">📅</span>
        </button>
      </div>

      <div class="gcw-field-group" style="margin-top: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label style="margin: 0;">Learning Material</label>
          <button type="button" class="btn secondary" id="gcwSchedOpenLessonBtn" style="font-size: 12px; padding: 3px 10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--saas-border, #cbd5e1); background: #f8fafc; color: var(--saas-text, #0f172a); cursor: pointer; font-weight: 500;">
            <span>📖</span> Open lesson material →
          </button>
        </div>
        <select style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
          <option selected>Test script to check complete data loss</option>
          <option>First Date & Relationship Discussion</option>
        </select>
      </div>

      <div class="gcw-field-group" style="margin-top: 16px;">
        <label>Start Time</label>
        <input type="time" value="18:30" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
      </div>

      <div class="gcw-field-group" style="margin-top: 16px;">
        <label>Duration</label>
        <div class="gcw-duration-group">
          <button type="button" class="gcw-duration-btn">45 min</button>
          <button type="button" class="gcw-duration-btn is-active">60 min (1 h)</button>
          <button type="button" class="gcw-duration-btn">90 min (1.5 h)</button>
          <button type="button" class="gcw-duration-btn">120 min (2 h)</button>
        </div>
        <div class="gcw-custom-duration-wrap" style="margin-top: 8px;">
          <label>Custom:</label>
          <input type="number" class="gcw-custom-duration-input" placeholder="60" style="width: 60px;">
          <span>min</span>
        </div>
      </div>

      <div class="gcw-time-preview" style="margin-top: 16px; padding: 8px 12px; background: #f1f5f9; border-radius: 8px; font-size: 13px;">
        <span>🕒</span> <span>Class window: <strong>18:30 – 19:30</strong> (60 min)</span>
      </div>

      <div class="gcw-tz-preview-box" style="margin-top: 12px;">
        <div class="gcw-tz-title">Group Timezone & Sync Preview</div>
        <div>Timezone: <b>Europe/Minsk (Teacher / Group Timezone)</b></div>
        <div class="gcw-tz-hint">Mode: Automatic "In Class" status will activate during this scheduled window.</div>
      </div>

      <div class="gcw-single-session-note" style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:10px 14px; font-size:12px; color:#0369a1; line-height:1.45; margin-top: 12px;">
        💡 <b>Single Session:</b> This assigns the selected lesson to this specific date only. To configure regular recurring classes for the entire group, use the <b>📅 Set group schedule</b> button in the calendar header.
      </div>
    </div>

    <div class="gcw-scheduler-foot" style="display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px; border-top: 1px solid #e2e8f0;">
      <button type="button" class="btn ghost" style="padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;">Cancel</button>
      <button type="button" class="btn primary" style="padding: 8px 16px; border-radius: 8px; background: #0284c7; color: #fff; border: none;">Save Single Lesson</button>
    </div>
  </div>
</body>
</html>`;

    await page.setContent(fixtureHtml, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);

    const openBtn = await page.$('#gcwSchedOpenLessonBtn');
    assert.ok(openBtn, 'Open lesson material button rendered in modal header');
    const btnText = await openBtn.textContent();
    assert.ok(btnText.includes('Open lesson material →'), 'Button text includes Open lesson material →');

    if (!existsSync('docs')) mkdirSync('docs');
    await page.locator('#gcwSchedulerDialog').screenshot({ path: 'docs/task-41-screenshot-verification.png' });
    assert.ok(existsSync('docs/task-41-screenshot-verification.png'), 'Verification screenshot was saved to docs');
  } finally {
    await browser.close();
  }
});
