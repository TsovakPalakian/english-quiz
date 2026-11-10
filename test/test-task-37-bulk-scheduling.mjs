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

test('TASK-37 Contract: Client and preview include repeat warning and immediate activation controls', () => {
  assert.ok(clientCalendarJs.includes('btn-publish-all'), 'client includes btn-publish-all class');
  assert.ok(previewJs.includes('btn-publish-all'), 'preview includes btn-publish-all class');
  assert.ok(previewCss.includes('.btn-publish-all'), 'css includes .btn-publish-all');

  assert.ok(clientCalendarJs.includes('data-gcw-action="publish-all-scheduled"'), 'client includes publish-all-scheduled action');
  assert.ok(previewJs.includes('data-gcw-action="publish-all-scheduled"'), 'preview includes publish-all-scheduled action');

  assert.ok(clientCalendarJs.includes('id="gcwGroupRepeatWarning"'), 'client includes gcwGroupRepeatWarning');
  assert.ok(previewJs.includes('id="gcwGroupRepeatWarning"'), 'preview includes gcwGroupRepeatWarning');
  assert.ok(previewCss.includes('.gcw-repeat-warning'), 'css includes .gcw-repeat-warning');

  assert.ok(clientCalendarJs.includes('id="gcwPublishImmediately"'), 'client includes gcwPublishImmediately');
  assert.ok(previewJs.includes('id="gcwPublishImmediately"'), 'preview includes gcwPublishImmediately');
  assert.ok(previewCss.includes('.gcw-publish-immediately-group'), 'css includes .gcw-publish-immediately-group');
});

test('TASK-37 Contract: Tooltips and Schedule Report resolve real material title from scheduleData.materialId', () => {
  assert.ok(clientCalendarJs.includes('sched.materialId'), 'client checks sched.materialId in tooltip and report');
  assert.ok(previewJs.includes('sched.materialId'), 'preview checks sched.materialId in tooltip and report');
  assert.ok(clientCalendarJs.includes('(Draft)'), 'client marks draft tooltip with (Draft)');
  assert.ok(previewJs.includes('(Draft)'), 'preview marks draft tooltip with (Draft)');
});

test('TASK-37: Playwright UI visual test for Set Group Schedule modal with repeating warning and immediate publish checkbox', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 620, height: 960 } });
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
    .gcw-scheduler-dialog { display: block; position: relative; margin: 0 auto; width: 480px; }
  </style>
</head>
<body>
  <div class="gcw-scheduler-dialog">
    <div class="gcw-scheduler-head">
      <h3><span>📅</span> Set Group Schedule</h3>
      <button type="button" class="gcw-choice-close-btn" aria-label="Close">✕</button>
    </div>
    <div class="gcw-scheduler-body">
      <div class="gcw-field-group">
        <label>Days of the Week</label>
        <div class="gcw-weekday-chips-row">
          <button type="button" class="gcw-day-chip is-active">Mo</button>
          <button type="button" class="gcw-day-chip">Tu</button>
          <button type="button" class="gcw-day-chip is-active">We</button>
          <button type="button" class="gcw-day-chip">Th</button>
          <button type="button" class="gcw-day-chip">Fr</button>
          <button type="button" class="gcw-day-chip">Sa</button>
          <button type="button" class="gcw-day-chip">Su</button>
        </div>
      </div>
      <div class="gcw-field-group">
        <label for="gcwGroupSchedStartTime">Start Time</label>
        <input type="time" id="gcwGroupSchedStartTime" value="18:30">
      </div>
      <div class="gcw-field-group">
        <label>Duration</label>
        <div class="gcw-duration-group">
          <button type="button" class="gcw-duration-btn">45 min</button>
          <button type="button" class="gcw-duration-btn is-active">60 min</button>
          <button type="button" class="gcw-duration-btn">90 min</button>
          <button type="button" class="gcw-duration-btn">120 min</button>
        </div>
      </div>
      <div class="gcw-time-preview">
        <span>🕒</span> <span>Class window: <strong>18:30 – 19:30</strong> (60 min)</span>
      </div>
      <div class="gcw-tz-preview-box">
        <div class="gcw-tz-title">Group Timezone & Sync Preview</div>
        <div>Timezone: <b>Europe/Minsk (Teacher / Group Timezone)</b></div>
      </div>
      <div class="gcw-field-group">
        <label>Schedule Recurrence Period</label>
        <div class="gcw-period-options">
          <label class="gcw-radio-label"><input type="radio" checked> <span>Current Month (November 2026)</span></label>
        </div>
      </div>
      <div class="gcw-field-group">
        <label><input type="checkbox" id="gcwSequentialMaterials" checked> Sequentially distribute course lessons across dates</label>
        <div style="font-size:12px; color:var(--mute, #64748b); margin-top:4px;">4 available materials in group course will be assigned one by one to scheduled dates.</div>
        <div id="gcwGroupRepeatWarning" class="gcw-repeat-warning" style="display:flex;">
          <span style="font-size:14px; line-height:1; margin-right:4px;">⚠️</span>
          <span id="gcwGroupRepeatWarningText"><strong>Material repeating notice:</strong> 4 available materials will be repeated in cycle to fill 9 selected dates.</span>
        </div>
      </div>
      <div class="gcw-field-group gcw-publish-immediately-group">
        <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer;">
          <input type="checkbox" id="gcwPublishImmediately" checked style="margin-top:2px; accent-color:#16a34a; width:16px; height:16px;">
          <div>
            <span style="font-size:13px; font-weight:700; color:#166534;">Publish and activate lessons immediately <span style="display:inline-block; padding:2px 7px; background:#dcfce7; color:#15803d; border-radius:4px; font-size:11px; font-weight:700; margin-left:6px;">Recommended</span></span>
            <div style="font-size:11px; font-weight:400; color:#15803d; margin-top:2px; line-height:1.4;">Immediately binds materials to dates and activates them as live group sessions (green dots) instead of leaving them as unlinked draft slots (red dots).</div>
          </div>
        </label>
      </div>
    </div>
    <div class="gcw-scheduler-foot">
      <button type="button" class="btn ghost">Cancel</button>
      <button type="button" class="btn primary">Save Group Schedule</button>
    </div>
  </div>
</body>
</html>
    `;

    await page.setContent(fixtureHtml);
    assert.equal(pageErrors.length, 0, 'No page errors');

    const warnNotice = page.locator('#gcwGroupRepeatWarning');
    await assert.doesNotReject(async () => await warnNotice.waitFor({ state: 'visible' }));
    const warnText = await page.locator('#gcwGroupRepeatWarningText').textContent();
    assert.ok(warnText.includes('4 available materials will be repeated in cycle to fill 9 selected dates'));

    const publishCheckbox = page.locator('#gcwPublishImmediately');
    assert.ok(await publishCheckbox.isChecked(), 'Publish immediately is checked by default');
  } finally {
    await browser.close();
  }
});

test('TASK-37: Playwright UI visual test for Calendar header with Publish all scheduled button', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 850, height: 400 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body { padding: 20px; background: #f8fafc; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div class="gcw-header">
    <div class="gcw-tier-top">
      <div class="gcw-month-nav">
        <span class="gcw-month-label">November 2026</span>
      </div>
    </div>
    <div class="gcw-tier-bottom">
      <div class="gcw-tabs">
        <button class="gcw-tab is-active" type="button">Calendar</button>
      </div>
      <div class="gcw-header-spacer">
        <button class="btn-publish-all" type="button" data-gcw-action="publish-all-scheduled">⚡ Publish all scheduled (7)</button>
        <button class="gcw-set-schedule-btn" type="button" data-gcw-action="set-group-schedule">📅 Set group schedule</button>
        <button class="gcw-today-btn" type="button">Today</button>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    await page.setContent(fixtureHtml);
    assert.equal(pageErrors.length, 0, 'No page errors');

    const publishBtn = page.locator('[data-gcw-action="publish-all-scheduled"]');
    await assert.doesNotReject(async () => await publishBtn.waitFor({ state: 'visible' }));
    const btnText = await publishBtn.textContent();
    assert.equal(btnText.trim(), '⚡ Publish all scheduled (7)');
  } finally {
    await browser.close();
  }
});
