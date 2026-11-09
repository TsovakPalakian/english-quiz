import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

const clientCalendarJs = readFileSync('client/53a-group-calendar.js', 'utf8');
const previewJs = readFileSync('preview.js', 'utf8');
const previewCss = readFileSync('site/preview.css', 'utf8');

test('TASK-35: Client and preview build contain Set group schedule controls and custom duration', () => {
  assert.ok(clientCalendarJs.includes('gcw-set-schedule-btn'), 'client includes gcw-set-schedule-btn');
  assert.ok(previewJs.includes('gcw-set-schedule-btn'), 'preview includes gcw-set-schedule-btn');
  assert.ok(clientCalendarJs.includes('data-gcw-action="set-group-schedule"'), 'client includes set-group-schedule action');
  assert.ok(previewJs.includes('data-gcw-action="set-group-schedule"'), 'preview includes set-group-schedule action');
  assert.ok(clientCalendarJs.includes('showSetGroupScheduleModal'), 'client includes showSetGroupScheduleModal');
  assert.ok(previewJs.includes('showSetGroupScheduleModal'), 'preview includes showSetGroupScheduleModal');
  assert.ok(clientCalendarJs.includes('gcw-custom-duration-input'), 'client includes gcw-custom-duration-input');
  assert.ok(previewJs.includes('gcw-custom-duration-input'), 'preview includes gcw-custom-duration-input');
  assert.ok(previewCss.includes('.gcw-set-schedule-btn'), 'css includes .gcw-set-schedule-btn');
  assert.ok(previewCss.includes('.gcw-custom-duration-wrap'), 'css includes .gcw-custom-duration-wrap');
});

test('TASK-35: Playwright UI visual test for Set Group Schedule modal dialog', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 700, height: 750 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body { padding: 20px; background: #f1f5f9; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div class="gcw-header">
    <div class="gcw-tabs">
      <button class="gcw-tab is-active" type="button">Calendar</button>
    </div>
    <div class="gcw-month-nav">
      <span class="gcw-month-label">November 2026</span>
    </div>
    <div class="gcw-header-spacer">
      <button class="gcw-set-schedule-btn" type="button" data-gcw-action="set-group-schedule">📅 Set group schedule</button>
      <button class="gcw-today-btn" type="button">Today</button>
    </div>
  </div>

  <dialog id="gcwSetGroupScheduleDialog" class="gcw-scheduler-dialog" open style="display:block; position:relative; margin-top:20px;">
    <div class="gcw-scheduler-head">
      <h3><span>📅</span> Set Group Schedule</h3>
      <button type="button" class="gcw-choice-close-btn" data-action="close">✕</button>
    </div>
    <div class="gcw-scheduler-body">
      <div class="gcw-field-group">
        <label>Days of the Week</label>
        <div class="gcw-weekday-chips-row">
          <button type="button" class="gcw-day-chip is-active" data-day="1">Mo</button>
          <button type="button" class="gcw-day-chip" data-day="2">Tu</button>
          <button type="button" class="gcw-day-chip is-active" data-day="3">We</button>
          <button type="button" class="gcw-day-chip" data-day="4">Th</button>
          <button type="button" class="gcw-day-chip" data-day="5">Fr</button>
        </div>
      </div>
      <div class="gcw-field-group">
        <label>Duration</label>
        <div class="gcw-duration-group">
          <button type="button" class="gcw-duration-btn" data-dur="45">45 min</button>
          <button type="button" class="gcw-duration-btn is-active" data-dur="60">60 min</button>
          <button type="button" class="gcw-duration-btn" data-dur="90">90 min</button>
          <button type="button" class="gcw-duration-btn" data-dur="120">120 min</button>
        </div>
        <div class="gcw-custom-duration-wrap">
          <label for="gcwGroupCustomDurInput">Custom:</label>
          <input type="number" id="gcwGroupCustomDurInput" class="gcw-custom-duration-input" placeholder="60">
          <span>min</span>
        </div>
      </div>
    </div>
  </dialog>
</body>
</html>`;

    await page.setContent(fixtureHtml, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);

    const setSchedBtn = await page.$('.gcw-set-schedule-btn');
    assert.ok(setSchedBtn, 'Set group schedule button is rendered in DOM');
    const btnText = await setSchedBtn.textContent();
    assert.ok(btnText.includes('Set group schedule'), 'Button text includes Set group schedule');

    const customDurInput = await page.$('#gcwGroupCustomDurInput');
    assert.ok(customDurInput, 'Custom duration input is rendered in DOM');

    const durationBtns = await page.$$('.gcw-duration-btn');
    assert.equal(durationBtns.length, 4, 'Four standard duration buttons rendered');
  } finally {
    await browser.close();
  }
});

test('TASK-35: Context menu item renamed to Schedule lesson and single lesson modal is scoped', () => {
  assert.ok(clientCalendarJs.includes('📅 Schedule lesson'), 'client includes 📅 Schedule lesson in context menu');
  assert.ok(previewJs.includes('📅 Schedule lesson'), 'preview includes 📅 Schedule lesson in context menu');
  assert.ok(clientCalendarJs.includes('Schedule Single Lesson'), 'client includes Schedule Single Lesson title');
  assert.ok(previewJs.includes('Schedule Single Lesson'), 'preview includes Schedule Single Lesson title');
  assert.ok(clientCalendarJs.includes('showSingleLessonModal'), 'client includes showSingleLessonModal alias');
  assert.ok(previewJs.includes('showSingleLessonModal'), 'preview includes showSingleLessonModal alias');
  assert.ok(clientCalendarJs.includes('gcw-single-session-note'), 'client includes gcw-single-session-note');
});

test('TASK-35: Playwright UI visual test for Schedule Single Lesson modal dialog', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body { padding: 20px; background: #f1f5f9; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <dialog id="gcwSchedulerDialog" class="gcw-scheduler-dialog" open style="display:block; position:relative;">
    <div class="gcw-scheduler-head">
      <h3><span>📅</span> Schedule Single Lesson</h3>
      <button type="button" class="gcw-choice-close-btn" data-action="close">✕</button>
    </div>
    <div class="gcw-scheduler-body">
      <div class="gcw-field-group">
        <label for="gcwSchedDateBtn">Lesson Date</label>
        <button type="button" class="gcw-date-picker-btn" id="gcwSchedDateBtn">
          <span id="gcwSchedDateText">Sunday, 2026-11-08</span>
          <span aria-hidden="true">📅</span>
        </button>
      </div>
      <div class="gcw-field-group">
        <label for="gcwSchedMaterial">Learning Material</label>
        <select id="gcwSchedMaterial">
          <option value="mat-1">Unit 4: Technology & Society</option>
        </select>
        <div id="gcwSchedMaterialHint" style="display:none;">⚠️ Please select a learning material.</div>
      </div>
      <div class="gcw-field-group">
        <label for="gcwSchedStartTime">Start Time</label>
        <input type="time" id="gcwSchedStartTime" value="18:30">
      </div>
      <div class="gcw-field-group">
        <label>Duration</label>
        <div class="gcw-duration-group">
          <button type="button" class="gcw-duration-btn" data-dur="45">45 min</button>
          <button type="button" class="gcw-duration-btn is-active" data-dur="60">60 min</button>
          <button type="button" class="gcw-duration-btn" data-dur="90">90 min</button>
          <button type="button" class="gcw-duration-btn" data-dur="120">120 min</button>
        </div>
        <div class="gcw-custom-duration-wrap">
          <label for="gcwSchedCustomDurInput">Custom:</label>
          <input type="number" id="gcwSchedCustomDurInput" class="gcw-custom-duration-input" placeholder="60">
          <span>min</span>
        </div>
      </div>
      <div class="gcw-time-preview" id="gcwTimePreview">
        <span>🕒</span> <span>Class window: <strong>18:30 – 19:30</strong> (60 min)</span>
      </div>
      <div class="gcw-single-session-note">
        💡 <b>Single Session:</b> This assigns the selected lesson to this specific date only.
      </div>
    </div>
    <div class="gcw-scheduler-foot">
      <button type="button" class="btn ghost" data-action="close">Cancel</button>
      <button type="button" class="btn primary" data-action="save">Save Single Lesson</button>
    </div>
  </dialog>
</body>
</html>`;

    await page.setContent(fixtureHtml, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);

    const titleEl = await page.$('.gcw-scheduler-head h3');
    assert.ok(titleEl, 'Scheduler title element rendered');
    const titleText = await titleEl.textContent();
    assert.ok(titleText.includes('Schedule Single Lesson'), 'Title text includes Schedule Single Lesson');

    const noteEl = await page.$('.gcw-single-session-note');
    assert.ok(noteEl, 'Single session note rendered');

    const saveBtn = await page.$('[data-action="save"]');
    assert.ok(saveBtn, 'Save button rendered');
    const saveText = await saveBtn.textContent();
    assert.ok(saveText.includes('Save Single Lesson'), 'Save button text is Save Single Lesson');
  } finally {
    await browser.close();
  }
});

test('TASK-35: Remove from Schedule modal logic and styles contract', () => {
  assert.ok(clientCalendarJs.includes('showRemoveScheduleModal'), 'client includes showRemoveScheduleModal');
  assert.ok(previewJs.includes('showRemoveScheduleModal'), 'preview includes showRemoveScheduleModal');
  assert.ok(clientCalendarJs.includes('gcw-remove-dialog'), 'client includes gcw-remove-dialog');
  assert.ok(clientCalendarJs.includes('data-action="remove-confirm"'), 'client includes remove-confirm action');
  assert.ok(previewCss.includes('.gcw-warning-note'), 'preview.css includes .gcw-warning-note');
  assert.ok(previewCss.includes('.gcw-scheduler-foot .btn.danger'), 'preview.css includes .gcw-scheduler-foot .btn.danger');
});

test('TASK-35: Playwright UI visual test for Remove from Schedule modal dialog', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body { padding: 20px; background: #f1f5f9; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <dialog id="gcwRemoveScheduleDialog" class="gcw-scheduler-dialog gcw-remove-dialog" open style="display:block; position:relative;">
    <div class="gcw-scheduler-head">
      <h3><span>🗑️</span> Remove from Schedule</h3>
      <button type="button" class="gcw-choice-close-btn" data-action="close">✕</button>
    </div>
    <div class="gcw-scheduler-body">
      <div class="gcw-field-group">
        <label for="gcwRemoveDateBtn">Selected Date</label>
        <button type="button" class="gcw-date-picker-btn" id="gcwRemoveDateBtn">
          <span id="gcwRemoveDateText">Tuesday, 2026-11-17</span>
          <span aria-hidden="true">📅</span>
        </button>
      </div>
      <div class="gcw-field-group">
        <label>Remove on Days of the Week</label>
        <div class="gcw-weekday-chips-row">
          <button type="button" class="gcw-day-chip is-active" data-day="2">Tu</button>
        </div>
      </div>
      <div class="gcw-field-group">
        <label>Removal Recurrence Period</label>
        <div class="gcw-period-options">
          <label class="gcw-radio-label">
            <input type="radio" name="gcwRemovePeriod" value="single" checked>
            <span>This date only (2026-11-17)</span>
          </label>
        </div>
      </div>
      <div class="gcw-warning-note">
        ⚠️ Selected dates will be removed from the calendar schedule and group attendance tracking.
      </div>
    </div>
    <div class="gcw-scheduler-foot">
      <button type="button" class="btn ghost" data-action="close">Cancel</button>
      <button type="button" class="btn danger" data-action="remove-confirm">Remove from Schedule</button>
    </div>
  </dialog>
</body>
</html>`;

    await page.setContent(fixtureHtml, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);

    const titleEl = await page.$('.gcw-scheduler-head h3');
    assert.ok(titleEl, 'Remove scheduler title element rendered');
    const titleText = await titleEl.textContent();
    assert.ok(titleText.includes('Remove from Schedule'), 'Title text includes Remove from Schedule');

    const warnEl = await page.$('.gcw-warning-note');
    assert.ok(warnEl, 'Warning note element rendered');
    const warnText = await warnEl.textContent();
    assert.ok(warnText.includes('Selected dates will be removed'), 'Warning note content verified');

    const removeBtn = await page.$('[data-action="remove-confirm"]');
    assert.ok(removeBtn, 'Remove confirm button rendered');
    const removeBtnText = await removeBtn.textContent();
    assert.ok(removeBtnText.includes('Remove from Schedule'), 'Button text verified');
  } finally {
    await browser.close();
  }
});

test('TASK-35: Tuition Deadline & Payment Management modal contract', () => {
  assert.ok(clientCalendarJs.includes('gcw-payment-dialog'), 'client includes gcw-payment-dialog');
  assert.ok(previewJs.includes('gcw-payment-dialog'), 'preview includes gcw-payment-dialog');
  assert.ok(clientCalendarJs.includes('gcw-payment-tabs'), 'client includes gcw-payment-tabs');
  assert.ok(previewJs.includes('gcw-payment-tabs'), 'preview includes gcw-payment-tabs');
  assert.ok(clientCalendarJs.includes('gcw-anchor-card'), 'client includes gcw-anchor-card');
  assert.ok(previewJs.includes('gcw-anchor-card'), 'preview includes gcw-anchor-card');
  assert.ok(clientCalendarJs.includes('gcw-reminders-section'), 'client includes gcw-reminders-section');
  assert.ok(previewJs.includes('gcw-reminders-section'), 'preview includes gcw-reminders-section');
  assert.ok(clientCalendarJs.includes('gcw-summary-banner'), 'client includes gcw-summary-banner');
  assert.ok(previewJs.includes('gcw-summary-banner'), 'preview includes gcw-summary-banner');
  assert.ok(clientCalendarJs.includes('Save & Send Invoices Privately'), 'client includes Save & Send Invoices Privately');
  assert.ok(previewJs.includes('Save & Send Invoices Privately'), 'preview includes Save & Send Invoices Privately');
  assert.ok(previewCss.includes('.gcw-payment-dialog'), 'css includes .gcw-payment-dialog');
  assert.ok(previewCss.includes('.gcw-payment-tabs'), 'css includes .gcw-payment-tabs');
  assert.ok(previewCss.includes('.gcw-anchor-card'), 'css includes .gcw-anchor-card');
  assert.ok(previewCss.includes('.gcw-summary-banner'), 'css includes .gcw-summary-banner');
  assert.ok(previewCss.includes('.gcw-invoices-table'), 'css includes .gcw-invoices-table');
  assert.ok(previewCss.includes('.gcw-auto-expand-textarea'), 'css includes .gcw-auto-expand-textarea');
});

test('TASK-35: Playwright UI visual test for Tuition Deadline & Payment Management modal with tabs', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 720, height: 750 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body { padding: 20px; background: #f1f5f9; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <dialog id="gcwPaymentModal" class="gcw-scheduler-dialog gcw-payment-dialog" open style="display:block; position:relative;">
    <div class="gcw-scheduler-head">
      <h3><span>💳</span> Tuition Deadline & Payment Management</h3>
      <button type="button" class="gcw-choice-close-btn" data-action="close">✕</button>
    </div>

    <div class="gcw-payment-tabs">
      <button type="button" class="gcw-payment-tab is-active" data-tab="deadline">
        <span>⏰</span> Deadline & Reminders
      </button>
      <button type="button" class="gcw-payment-tab" data-tab="invoices">
        <span>📋</span> Student Invoices
        <span class="gcw-tab-badge" id="gcwInvoicesTabBadge">1 due</span>
      </button>
      <button type="button" class="gcw-payment-tab" data-tab="requisites">
        <span>🏦</span> Payment Requisites
      </button>
    </div>

    <div class="gcw-scheduler-body" style="padding:16px 20px;">
      <!-- TAB 1: Deadline & Reminders -->
      <div class="gcw-payment-panel is-active" data-panel="deadline">
        <div class="gcw-grid-two">
          <div class="gcw-field-group">
            <label for="gcwModalDeadlineDate">Payment Deadline Date</label>
            <div class="gcw-date-picker-wrap">
              <input type="text" id="gcwModalDeadlineDate" value="2026-12-03" readonly>
              <button type="button" class="btn icon-btn gcw-cal-btn" id="gcwModalDeadlineDateBtn">📅</button>
            </div>
          </div>
          <div class="gcw-field-group">
            <label for="gcwModalDeadlineTime">Deadline Exact Time</label>
            <input type="time" id="gcwModalDeadlineTime" class="gcw-time-input" value="18:00">
          </div>
        </div>

        <div class="gcw-anchor-card">
          <div class="gcw-anchor-left">
            <input type="checkbox" id="gcwModalAnchorToggle" checked>
            <label for="gcwModalAnchorToggle" class="gcw-anchor-text">
              <b>Anchor to cycle end:</b> Withhold invoices & alerts until final lesson completes.
            </label>
          </div>
          <span class="gcw-anchor-badge">Last Lesson: 30 Nov · 19:30</span>
        </div>

        <div class="gcw-reminders-section">
          <div class="gcw-reminders-header">
            <span><span>🔔</span> Reminder Intervals (Any Quantity & Period)</span>
            <button type="button" class="gcw-add-reminder-btn" id="gcwAddReminderBtn"><span>+</span> Add Reminder</button>
          </div>
          <div class="gcw-rule-list" id="gcwReminderRuleList">
            <div class="gcw-rule-row">
              <div class="gcw-rule-left">
                <span>Remind before deadline:</span>
                <input type="number" class="gcw-rule-num" value="3">
                <select class="gcw-rule-unit"><option selected>Days</option></select>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="gcw-rule-target-date">30 Nov · 18:00</span>
                <button type="button" class="gcw-delete-rule-btn">✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: Student Invoices -->
      <div class="gcw-payment-panel" data-panel="invoices">
        <div class="gcw-summary-banner">
          <div class="gcw-stat-col">
            <span class="gcw-stat-label">Total Invoiced</span>
            <span class="gcw-stat-value" id="gcwTotalInvoiced">420 BYN</span>
          </div>
          <div class="gcw-stat-col">
            <span class="gcw-stat-label">Collected</span>
            <span class="gcw-stat-value green" id="gcwTotalCollected">300 BYN (1 Paid)</span>
          </div>
          <div class="gcw-stat-col">
            <span class="gcw-stat-label">Pending</span>
            <span class="gcw-stat-value amber" id="gcwTotalPending">120 BYN (1 Due)</span>
          </div>
        </div>

        <table class="gcw-invoices-table">
          <thead>
            <tr>
              <th>Student</th>
              <th style="text-align:center;">Attended</th>
              <th style="text-align:center;">Auto Calc</th>
              <th style="text-align:center;">Manual Amount</th>
              <th style="text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Anna Ivanova</b></td>
              <td style="text-align:center;">10 / 12</td>
              <td style="text-align:center;">300 BYN</td>
              <td style="text-align:center;"><input type="number" class="gcw-manual-amt-input" value="300"></td>
              <td style="text-align:center;"><span class="gcw-badge-paid">✅ Paid</span></td>
            </tr>
          </tbody>
        </table>

        <div class="gcw-private-note">
          <span>🔒</span>
          <span><b>Private Delivery:</b> Invoices and personal bills will be dispatched strictly to each student's direct Study alerts chat.</span>
        </div>
      </div>

      <!-- TAB 3: Payment Requisites -->
      <div class="gcw-payment-panel" data-panel="requisites">
        <div class="gcw-field-group">
          <label for="gcwModalRequisites">Payment Requisites & Bank Information</label>
          <textarea id="gcwModalRequisites" class="gcw-auto-expand-textarea">Bank: Alfa-Bank CJSC · IBAN: BY00 ALFA 0000 0000 0000 0000</textarea>
        </div>
        <div class="gcw-info-callout">
          💡 <b>Auto-Included:</b> These requisites are attached directly to each private invoice and reminder alert.
        </div>
      </div>
    </div>

    <div class="gcw-scheduler-foot" style="display:flex; justify-content:space-between; align-items:center;">
      <button type="button" class="btn danger-text" data-action="clear-deadline">Clear Deadline</button>
      <div style="display:flex; gap:10px;">
        <button type="button" class="btn ghost" data-action="close">Cancel</button>
        <button type="button" class="btn primary" data-action="save"><span>🔒</span> Save & Send Invoices Privately</button>
      </div>
    </div>
  </dialog>
</body>
</html>`;

    await page.setContent(fixtureHtml, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);

    const titleEl = await page.$('.gcw-scheduler-head h3');
    assert.ok(titleEl, 'Title element rendered');
    const titleText = await titleEl.textContent();
    assert.ok(titleText.includes('Tuition Deadline & Payment Management'), 'Title text matches');

    const tabs = await page.$$('.gcw-payment-tab');
    assert.equal(tabs.length, 3, 'Three tabs rendered');

    const anchorEl = await page.$('.gcw-anchor-badge');
    assert.ok(anchorEl, 'Anchor badge rendered');
    const anchorText = await anchorEl.textContent();
    assert.ok(anchorText.includes('Last Lesson'), 'Anchor badge includes Last Lesson');

    const saveBtn = await page.$('[data-action="save"]');
    assert.ok(saveBtn, 'Save button rendered');
    const saveBtnText = await saveBtn.textContent();
    assert.ok(saveBtnText.includes('Save & Send Invoices Privately'), 'Save button text matches');
  } finally {
    await browser.close();
  }
});

test('TASK-35: Report to chat specializes output by active tab (Calendar, Attendance, Statistics)', () => {
  assert.ok(clientCalendarJs.includes("state.activeTab === 'calendar'"), 'client branches on calendar activeTab');
  assert.ok(previewJs.includes("state.activeTab === 'calendar'"), 'preview branches on calendar activeTab');
  assert.ok(clientCalendarJs.includes('📅 Schedule Report:'), 'client includes Schedule Report heading');
  assert.ok(previewJs.includes('📅 Schedule Report:'), 'preview includes Schedule Report heading');
  assert.ok(clientCalendarJs.includes("state.activeTab === 'attendance'"), 'client branches on attendance activeTab');
  assert.ok(previewJs.includes("state.activeTab === 'attendance'"), 'preview branches on attendance activeTab');
  assert.ok(clientCalendarJs.includes('📋 Attendance Journal:'), 'client includes Attendance Journal heading');
  assert.ok(previewJs.includes('📋 Attendance Journal:'), 'preview includes Attendance Journal heading');
  assert.ok(clientCalendarJs.includes('📋 Personal Attendance Journal:'), 'client includes Personal Attendance Journal heading');
  assert.ok(previewJs.includes('📋 Personal Attendance Journal:'), 'preview includes Personal Attendance Journal heading');
  assert.ok(clientCalendarJs.includes('📊 Group Statistics:'), 'client includes Group Statistics heading');
  assert.ok(previewJs.includes('📊 Group Statistics:'), 'preview includes Group Statistics heading');
  assert.ok(clientCalendarJs.includes('Attendance Rankings:'), 'client includes Attendance Rankings section');
  assert.ok(previewJs.includes('Attendance Rankings:'), 'preview includes Attendance Rankings section');
});

test('TASK-35: Two-tier header structure, tab isolation, and bug remediation contracts', () => {
  const chatCss = readFileSync('production/chat.css', 'utf8');
  const chatSettingsJs = readFileSync('production/chat/90-settings.js', 'utf8');
  const chatBundledJs = readFileSync('production/chat.js', 'utf8');

  // Tier 1 and Tier 2 header classes
  assert.ok(clientCalendarJs.includes('gcw-tier-top'), 'client includes gcw-tier-top');
  assert.ok(previewJs.includes('gcw-tier-top'), 'preview includes gcw-tier-top');
  assert.ok(clientCalendarJs.includes('gcw-tier-bottom'), 'client includes gcw-tier-bottom');
  assert.ok(previewJs.includes('gcw-tier-bottom'), 'preview includes gcw-tier-bottom');
  assert.ok(previewCss.includes('.gcw-tier-top'), 'css includes .gcw-tier-top');
  assert.ok(previewCss.includes('.gcw-tier-bottom'), 'css includes .gcw-tier-bottom');

  // Attendance autofocus classes
  assert.ok(clientCalendarJs.includes('is-focused-date'), 'client includes is-focused-date');
  assert.ok(previewJs.includes('is-focused-date'), 'preview includes is-focused-date');
  assert.ok(clientCalendarJs.includes('td-focused-col'), 'client includes td-focused-col');
  assert.ok(previewJs.includes('td-focused-col'), 'preview includes td-focused-col');
  assert.ok(previewCss.includes('.is-focused-date'), 'css includes .is-focused-date');
  assert.ok(previewCss.includes('.td-focused-col'), 'css includes .td-focused-col');

  // Removal confirmation dialog
  assert.ok(clientCalendarJs.includes('gcwConfirmRemovalDialog'), 'client includes gcwConfirmRemovalDialog');
  assert.ok(previewJs.includes('gcwConfirmRemovalDialog'), 'preview includes gcwConfirmRemovalDialog');
  assert.ok(clientCalendarJs.includes('Confirm Removal from Schedule'), 'client includes removal confirmation heading');
  assert.ok(previewJs.includes('Confirm Removal from Schedule'), 'preview includes removal confirmation heading');

  // Study alerts 100% width
  assert.ok(chatCss.includes('#messages .msg-message.is-learning{border-left:3px solid var(--acc);width:100%;max-width:100%'), 'chat css has 100% width for is-learning');

  // window.sendDirectChatMessage
  assert.ok(chatSettingsJs.includes('window.sendDirectChatMessage'), 'chat 90-settings defines sendDirectChatMessage');
  assert.ok(chatBundledJs.includes('window.sendDirectChatMessage'), 'chat bundled js defines sendDirectChatMessage');

  // Requisites auto-expand min-height 140px
  assert.ok(previewCss.includes('min-height: 140px;'), 'css includes min-height: 140px for auto-expand textarea');
  assert.ok(clientCalendarJs.includes('Math.max(140'), 'client auto-expand uses Math.max(140)');
});

test('TASK-35: Playwright UI visual test for Two-Tier Header (Variant C) and Tab Isolation', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 920, height: 400 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body { padding: 24px; background: #eef2f6; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div class="gcw-header">
    <div class="gcw-tier-top">
      <div class="gcw-month-nav" tabindex="0" role="region" aria-label="Calendar month navigation">
        <button class="gcw-nav-arrow" type="button" data-gcw-nav="prev">←</button>
        <span class="gcw-month-label">November 2026</span>
        <button class="gcw-nav-arrow" type="button" data-gcw-nav="next">→</button>
      </div>
    </div>
    <div class="gcw-tier-bottom">
      <div class="gcw-tabs" role="tablist">
        <button class="gcw-tab is-active" type="button" data-gcw-tab="calendar">Calendar</button>
        <button class="gcw-tab" type="button" data-gcw-tab="attendance">Attendance</button>
        <button class="gcw-tab" type="button" data-gcw-tab="statistics">Statistics</button>
      </div>
      <div class="gcw-header-spacer">
        <button class="gcw-set-schedule-btn" type="button" data-gcw-action="set-group-schedule">📅 Set group schedule</button>
        <button class="gcw-today-btn" type="button" data-gcw-nav="today">Today</button>
      </div>
    </div>
  </div>
</body>
</html>`;

    await page.setContent(fixtureHtml, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);

    const tierTop = await page.$('.gcw-tier-top');
    assert.ok(tierTop, 'Tier top element rendered');

    const monthNav = await page.$('.gcw-tier-top > .gcw-month-nav');
    assert.ok(monthNav, 'Centered month nav rendered inside tier top');

    const tierBottom = await page.$('.gcw-tier-bottom');
    assert.ok(tierBottom, 'Tier bottom element rendered');

    const tabs = await page.$$('.gcw-tier-bottom > .gcw-tabs > .gcw-tab');
    assert.equal(tabs.length, 3, 'Three tabs rendered in tier bottom');

    const setScheduleBtn = await page.$('.gcw-tier-bottom .gcw-set-schedule-btn');
    assert.ok(setScheduleBtn, 'Set group schedule button rendered in tier bottom right');

    const todayBtn = await page.$('.gcw-tier-bottom .gcw-today-btn');
    assert.ok(todayBtn, 'Today button rendered in tier bottom right');
  } finally {
    await browser.close();
  }
});

test('TASK-35: Playwright UI visual test for Attendance Tab date autofocus and Removal Confirmation Modal', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body { padding: 20px; background: #ffffff; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div class="gcw-journal-wrap">
    <table class="gcw-table">
      <thead>
        <tr>
          <th class="gcw-th-student">Student</th>
          <th class="gcw-th-date"><button class="gcw-date-header-btn">01.11</button></th>
          <th class="gcw-th-date is-focused-date"><button class="gcw-date-header-btn is-focused" data-gcw-focused-date="true">08.11</button></th>
          <th class="gcw-th-date"><button class="gcw-date-header-btn">15.11</button></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="gcw-td-student">Student 1</td>
          <td><button class="gcw-cell-btn is-present">✓</button></td>
          <td class="td-focused-col"><button class="gcw-cell-btn is-present">✓</button></td>
          <td><button class="gcw-cell-btn is-absent">✕</button></td>
        </tr>
      </tbody>
    </table>
  </div>

  <dialog id="gcwConfirmRemovalDialog" class="gcw-scheduler-dialog gcw-confirm-dialog" open style="display:block; position:relative; margin-top:20px;">
    <div class="gcw-scheduler-head" style="border-bottom: 2px solid #fee2e2;">
      <h3 style="color:#b91c1c;"><span>⚠️</span> Confirm Removal from Schedule</h3>
      <button type="button" class="gcw-choice-close-btn" data-action="close">✕</button>
    </div>
    <div class="gcw-scheduler-body" style="padding:18px 20px;">
      <p style="font-weight:600;">Are you sure you want to remove 3 lesson(s) from the schedule?</p>
      <div style="background:#fef2f2; border:1px solid #fecaca; padding:12px; color:#991b1b;">
        <b>Warning:</b> This will remove the selected dates from the calendar and permanently delete all student attendance records.
      </div>
    </div>
    <div class="gcw-scheduler-foot">
      <button type="button" class="btn danger" data-action="confirm-delete">Yes, Remove Lessons</button>
    </div>
  </dialog>
</body>
</html>`;

    await page.setContent(fixtureHtml, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);

    const focusedTh = await page.$('.gcw-th-date.is-focused-date');
    assert.ok(focusedTh, 'Focused date header cell is rendered');

    const focusedCol = await page.$('td.td-focused-col');
    assert.ok(focusedCol, 'Focused date column cell is highlighted');

    const confirmModal = await page.$('#gcwConfirmRemovalDialog');
    assert.ok(confirmModal, 'Confirm removal modal dialog is rendered');

    const confirmTitle = await page.$('#gcwConfirmRemovalDialog h3');
    const titleText = await confirmTitle.textContent();
    assert.ok(titleText.includes('Confirm Removal from Schedule'), 'Confirm modal title matches');
  } finally {
    await browser.close();
  }
});
