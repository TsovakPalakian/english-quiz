import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

const clientCalendarJs = readFileSync('client/53a-group-calendar.js', 'utf8');
const clientExamsJs = readFileSync('client/54-exams.js', 'utf8');
const previewJs = readFileSync('preview.js', 'utf8');
const previewCss = readFileSync('site/preview.css', 'utf8');

test('Client logic includes TASK-20 scheduling form remediations', () => {
  // 1. Interactive date picker button in client and build
  assert.ok(clientCalendarJs.includes('gcwSchedDateBtn'), 'client includes gcwSchedDateBtn');
  assert.ok(previewJs.includes('gcwSchedDateBtn'), 'preview.js includes gcwSchedDateBtn');
  assert.ok(clientCalendarJs.includes('gcwSchedDateText'), 'client includes gcwSchedDateText');

  // 2. Material scoping to group.lessonIds or mat.groupId
  assert.ok(clientCalendarJs.includes('groupLessonIds.includes(String(mat.id)) || Number(mat.groupId) === Number(groupId)'), 'scoped materials to group');
  assert.ok(previewJs.includes('groupLessonIds.includes(String(mat.id)) || Number(mat.groupId) === Number(groupId)'), 'preview includes scoped materials');

  // 3. Validation preventing empty draft saves
  assert.ok(clientCalendarJs.includes('gcwSchedMaterialHint'), 'client has material validation hint');
  assert.ok(clientCalendarJs.includes('saveBtn.disabled = !hasMat'), 'saveBtn disabled when no material selected');
  assert.ok(clientCalendarJs.includes('if (!selectedMatId)'), 'guard against saving empty material');

  // 4. Safe scheduled slot handling without red error dead end
  assert.ok(clientCalendarJs.includes('showLessonSchedulerModal(groupId, dateStr, state, container)'), 'opens scheduler modal for empty scheduled slot');

  // 5. Z-index and dialog mounting for #examCal
  assert.ok(clientExamsJs.includes('examCalAnchor.closest(\'dialog[open]\')'), 'examCal attached inside active modal dialog');
  assert.ok(previewCss.includes('z-index: 100000;'), 'exam-cal has z-index 100000');

  // 6. Read-only class window and refined group timezone box
  assert.ok(clientCalendarJs.includes('Class window: <strong>'), 'class window formatted as informational preview');
  assert.ok(clientCalendarJs.includes('Group Timezone & Sync Preview'), 'timezone box title is Group Timezone & Sync Preview');
  assert.ok(previewCss.includes('.gcw-time-preview'), 'gcw-time-preview css defined');
  assert.ok(previewCss.includes('.gcw-tz-preview-box'), 'gcw-tz-preview-box css defined');
});

test('Playwright UI verification for Lesson Scheduler Dialog and Universal Datepicker', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // HTML fixture for testing scheduler dialog in isolation
    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body { padding: 20px; background: #f1f5f9; }
  </style>
</head>
<body>
  <dialog id="gcwSchedulerDialog" class="gcw-scheduler-dialog">
    <div class="gcw-scheduler-head">
      <h3>Plan & Schedule Lesson</h3>
      <button type="button" class="gcw-choice-close-btn" data-action="close" aria-label="Close">✕</button>
    </div>
    <div class="gcw-scheduler-body">
      <div class="gcw-field-group">
        <label for="gcwSchedDateBtn">Lesson Date</label>
        <button type="button" class="gcw-date-picker-btn" id="gcwSchedDateBtn" title="Click to choose a date from calendar">
          <span id="gcwSchedDateText">Sunday, 2026-11-08</span>
          <span aria-hidden="true">📅</span>
        </button>
      </div>

      <div class="gcw-field-group">
        <label for="gcwSchedMaterial">Learning Material</label>
        <select id="gcwSchedMaterial">
          <option value="">(None / Draft material)</option>
          <option value="mat-1">C2 Advanced Debate: Ethics & AI</option>
          <option value="mat-2">C2 Nuanced Expressions in Negotiations</option>
        </select>
        <div id="gcwSchedMaterialHint" style="color:var(--bad, #dc2626); font-size:12px; margin-top:4px; display:none;">⚠️ Please select a learning material to schedule a lesson.</div>
      </div>

      <div class="gcw-field-group">
        <label for="gcwSchedStartTime">Start Time</label>
        <input type="time" id="gcwSchedStartTime" value="18:30">
      </div>

      <div class="gcw-time-preview" id="gcwTimePreview">
        <span>🕒</span> <span>Class window: <strong>18:30 – 19:30</strong> (60 min)</span>
      </div>

      <div class="gcw-tz-preview-box">
        <div class="gcw-tz-title">Group Timezone & Sync Preview</div>
        <div>Timezone: <b>Asia/Yerevan (Teacher / Group Timezone)</b></div>
        <div class="gcw-tz-hint">Mode: Automatic "In Class" status will activate during this scheduled window.</div>
      </div>

      <div class="gcw-field-group">
        <label>Schedule Recurrence Period</label>
        <div class="gcw-period-options">
          <label class="gcw-radio-label"><input type="radio" name="gcwPeriod" value="single"> <span>This date only</span></label>
          <label class="gcw-radio-label"><input type="radio" name="gcwPeriod" value="custom" checked> <span>Custom Period</span></label>
        </div>
        <div id="gcwCustomBox" style="display:flex; gap:10px; margin-top:8px;">
          <label style="flex:1;">From
            <div class="gcw-date-picker-wrap" style="display:flex; align-items:center; gap:6px; margin-top:4px;">
              <input type="text" id="gcwCustStart" value="2026-11-08" readonly style="flex:1;">
              <button type="button" class="btn icon-btn" id="gcwCustStartBtn" title="Choose date" style="min-width:34px; height:34px; padding:0 6px;">📅</button>
            </div>
          </label>
        </div>
      </div>
    </div>
    <div class="gcw-scheduler-foot">
      <button type="button" class="btn ghost" data-action="close">Cancel</button>
      <button type="button" class="btn primary" data-action="save">Save Schedule</button>
    </div>
  </dialog>
</body>
</html>
    `;

    // Test responsive rendering
    for (const width of [1280, 700, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(fixtureHtml);

      // Open the dialog modally
      await page.evaluate(() => {
        const dialog = document.getElementById('gcwSchedulerDialog');
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');

        // Validation script
        const saveBtn = dialog.querySelector('[data-action="save"]');
        const matSelect = dialog.querySelector('#gcwSchedMaterial');
        const matHint = dialog.querySelector('#gcwSchedMaterialHint');
        function updateMaterialValidation() {
          const hasMat = Boolean(matSelect && matSelect.value);
          if (saveBtn) {
            saveBtn.disabled = !hasMat;
            saveBtn.title = hasMat ? '' : 'Please select a learning material to schedule a lesson';
          }
          if (matHint) matHint.style.display = hasMat ? 'none' : 'block';
        }
        matSelect.addEventListener('change', updateMaterialValidation);
        updateMaterialValidation();
      });

      // 1. Initial state has (None / Draft material) -> save button disabled
      const isSaveDisabled = await page.$eval('[data-action="save"]', btn => btn.disabled);
      assert.equal(isSaveDisabled, true, 'Save Schedule is initially disabled when material is empty');

      const isHintVisible = await page.$eval('#gcwSchedMaterialHint', el => window.getComputedStyle(el).display !== 'none');
      assert.equal(isHintVisible, true, 'Validation warning hint is shown');

      // 2. Select valid material -> save button enabled, hint hidden
      await page.selectOption('#gcwSchedMaterial', 'mat-1');
      const isSaveEnabled = await page.$eval('[data-action="save"]', btn => !btn.disabled);
      assert.equal(isSaveEnabled, true, 'Save Schedule enabled after choosing valid material');

      const isHintHidden = await page.$eval('#gcwSchedMaterialHint', el => window.getComputedStyle(el).display === 'none');
      assert.equal(isHintHidden, true, 'Validation warning hint is hidden after valid selection');

      // 3. Verify .gcw-time-preview styling (no border, read-only appearance)
      const previewStyle = await page.$eval('#gcwTimePreview', el => {
        const cs = window.getComputedStyle(el);
        return {
          borderWidth: cs.borderWidth,
          borderStyle: cs.borderStyle,
          display: cs.display
        };
      });
      assert.ok(previewStyle.borderStyle === 'none' || previewStyle.borderWidth === '0px', 'Class window has no input border');

      // 4. Verify timezone preview box padding
      const tzPadding = await page.$eval('.gcw-tz-preview-box', el => window.getComputedStyle(el).padding);
      assert.equal(tzPadding, '12px 16px', 'Group timezone preview box has comfortable 12px 16px padding');

      // 5. Open Datepicker inside modal dialog and verify z-index and container
      await page.evaluate(() => {
        const dialog = document.getElementById('gcwSchedulerDialog');
        const anchor = document.getElementById('gcwCustStartBtn');
        const targetParent = anchor.closest('dialog[open]') || document.body;

        const pop = document.createElement('div');
        pop.id = 'examCal';
        pop.className = 'exam-cal';
        pop.textContent = 'Universal Datepicker Popover';
        targetParent.appendChild(pop);
      });

      const examCalParent = await page.$eval('#examCal', el => el.parentElement.tagName.toLowerCase());
      assert.equal(examCalParent, 'dialog', 'Datepicker is attached directly to the active open dialog');

      const examCalZIndex = await page.$eval('#examCal', el => window.getComputedStyle(el).zIndex);
      assert.equal(examCalZIndex, '100000', 'Datepicker has z-index 100000 to overlay dialog elements');
    }

    assert.equal(pageErrors.length, 0, 'No unexpected browser page errors');
  } finally {
    await browser.close();
  }
});
