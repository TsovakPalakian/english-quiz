import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchChromium, resolveTestDependency} from '../ops/check-environment.mjs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));

test('TASK-18: Code contracts for group dashboard and calendar remediation', async () => {
  const adminSrc = await fs.readFile(path.resolve('client/10-admin.js'), 'utf8');
  const calSrc = await fs.readFile(path.resolve('client/53a-group-calendar.js'), 'utf8');
  const dirSrc = await fs.readFile(path.resolve('client/53-group-directory.js'), 'utf8');
  const htmlSrc = await fs.readFile(path.resolve('site/preview.html'), 'utf8');
  const cssSrc = await fs.readFile(path.resolve('site/preview.css'), 'utf8');

  // 1. Group detail cards render zero explicitly for students and teachers
  assert.ok(
    dirSrc.includes("document.getElementById('groupDetailStudentCount').textContent='Students · '+groupDirectoryPeople([group],false).length"),
    'Group directory must explicitly render Students with count including zero'
  );
  assert.ok(
    dirSrc.includes("document.getElementById('groupDetailTeacherCount').textContent='Teachers · '+groupDirectoryPeople([group],true).length"),
    'Group directory must explicitly render Teachers with count'
  );

  // 2. calculateAttendancePct returns 0 (not 33) when no marked attendances
  assert.ok(!calSrc.includes('return 33;'), 'Calendar must not return hardcoded 33% attendance');
  assert.ok(calSrc.includes('return 0;'), 'Calendar must return 0% for empty/unmarked attendance');

  // 3. Dynamic initialization with current date
  assert.ok(!calSrc.includes("selectedDate = '2026-11-05';"), 'Calendar must not hardcode 2026-11-05 as initial selected date');
  assert.ok(calSrc.includes('gcw-today-badge'), 'Calendar must render today badge');

  // 4. Terminology: Scheduled lessons and Scheduled exams in calendar footer
  assert.ok(calSrc.includes('Scheduled lessons · <b>'), 'Calendar footer must use Scheduled lessons');
  assert.ok(calSrc.includes('Scheduled exams · <b>'), 'Calendar footer must use Scheduled exams');

  // 5. Unmarked attendance cell interactive placeholder
  assert.ok(calSrc.includes("sym = st === 'present' ? '✓' : st === 'absent' ? '✕' : (canEdit ? '+' : '')"), 'Unmarked cells must have + placeholder when editable');
  assert.ok(cssSrc.includes('.gcw-cell-btn.is-unmarked'), 'CSS must define .gcw-cell-btn.is-unmarked');
  assert.ok(cssSrc.includes('border: 1.5px dashed'), 'Unmarked cell must have dashed border');

  // 6. Diagnostic component title, badge and copywriting
  assert.ok(htmlSrc.includes('<h2>Group Diagnostic Overview</h2>'), 'Diagnostic title must be Group Diagnostic Overview');
  assert.ok(!htmlSrc.includes('<h2>Subgroup Diagnostic Heatmap</h2>'), 'Old Subgroup Diagnostic Heatmap title must be removed');
  assert.ok(dirSrc.includes('No recent errors recorded for this group.'), 'Copywriting must specify group, not subgroup');
  assert.ok(!dirSrc.includes('recorded for this subgroup'), 'Old recorded for this subgroup must be removed');
  assert.ok(cssSrc.includes('.group-diag-pill.is-clean'), 'CSS must style clean diagnostic pill');
});

test('TASK-18: Visual validation of dashboard header, calendar, attendance cells and diagnostic overview', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    const cssPreview = await fs.readFile(path.resolve('site/preview.css'), 'utf8');

    await page.setContent(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${cssPreview}</style>
</head>
<body style="padding: 24px; background: var(--bg, #f4f6fb);">
  <div class="group-detail-destinations">
    <button class="file-card" type="button" data-detail-people="teachers"><b id="groupDetailTeacherCount">Teachers · 1</b></button>
    <button class="file-card" type="button" data-detail-people="students"><b id="groupDetailStudentCount">Students · 0</b></button>
  </div>
  <div class="group-detail-destinations">
    <button class="file-card" type="button" data-detail-lessons><b id="groupDetailLessonCount">Lessons · 0</b></button>
    <button class="file-card" type="button" data-detail-exams><b id="groupDetailExamCount">Exams · 0</b></button>
  </div>

  <div id="groupCalendarWidget" class="group-calendar-widget">
    <div class="gcw-grid">
      <button type="button" class="gcw-day is-selected is-today" data-gcw-date="2026-11-09">
        <span class="gcw-day-num">9</span>
        <span class="gcw-today-badge">Today</span>
      </button>
    </div>
    <div class="gcw-journal-wrap">
      <table class="gcw-table">
        <tbody>
          <tr>
            <td class="gcw-td-student">Mensa1345</td>
            <td><button type="button" class="gcw-cell-btn is-present">✓</button></td>
            <td><button type="button" class="gcw-cell-btn is-absent">✕</button></td>
            <td><button type="button" class="gcw-cell-btn is-unmarked">+</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="gcw-footer">
      <div class="gcw-stats">
        <span class="gcw-badge">Scheduled lessons · <b>0</b></span>
        <span class="gcw-badge">Scheduled exams · <b>0</b></span>
        <span class="gcw-badge">Students · <b>0</b></span>
        <span class="gcw-badge">Attendance · <b>0%</b></span>
      </div>
      <button class="gcw-report-btn" type="button">Report to chat</button>
    </div>
  </div>

  <div id="groupDetailDiagnostic" class="group-diagnostic-panel">
    <div class="group-diagnostic-head">
      <h2>Group Diagnostic Overview</h2>
      <span id="groupDiagTotalErrors" class="group-diag-badge">0 errors</span>
    </div>
    <div class="group-diag-bars">
      <div class="group-diag-bar is-clean" style="width:100%"></div>
    </div>
    <div class="group-diag-legend">
      <span class="group-diag-pill is-clean">● All clear</span>
    </div>
    <div class="group-diag-advice">
      <p class="group-diag-clean-note"><strong>Great performance! 🎉</strong> No recent errors recorded for this group.</p>
    </div>
  </div>
</body>
</html>`);

    // Verify Students · 0 rendered
    const studentCountText = await page.locator('#groupDetailStudentCount').innerText();
    assert.equal(studentCountText, 'Students · 0');

    // Verify today badge in calendar
    const todayBadge = page.locator('.gcw-today-badge');
    assert.equal(await todayBadge.isVisible(), true);
    assert.equal(await todayBadge.innerText(), 'Today');

    // Verify unmarked attendance cell
    const unmarkedBtn = page.locator('.gcw-cell-btn.is-unmarked');
    assert.equal(await unmarkedBtn.isVisible(), true);
    assert.equal(await unmarkedBtn.innerText(), '+');

    const unmarkedBorderStyle = await unmarkedBtn.evaluate(el => getComputedStyle(el).borderStyle);
    assert.equal(unmarkedBorderStyle, 'dashed', 'Unmarked cell must have dashed border');

    // Verify footer badges
    const rawFooterBadges = await page.locator('.gcw-stats .gcw-badge').allInnerTexts();
    const footerBadges = rawFooterBadges.map(t => t.replace(/\s+/g, ' '));
    assert.ok(footerBadges[0].includes('Scheduled lessons · 0'));
    assert.ok(footerBadges[1].includes('Scheduled exams · 0'));
    assert.ok(footerBadges[2].includes('Students · 0'));
    assert.ok(footerBadges[3].includes('Attendance · 0%'));

    // Verify diagnostic header & clean pill
    const diagTitle = await page.locator('.group-diagnostic-head h2').innerText();
    assert.equal(diagTitle, 'Group Diagnostic Overview');

    const cleanPill = page.locator('.group-diag-pill.is-clean');
    assert.equal(await cleanPill.isVisible(), true);
    const pillBorderWidths = await cleanPill.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        left: cs.borderLeftWidth,
        right: cs.borderRightWidth,
        top: cs.borderTopWidth,
        bottom: cs.borderBottomWidth
      };
    });
    assert.equal(pillBorderWidths.left, pillBorderWidths.right, 'Clean pill must have symmetric border widths');
    assert.equal(pillBorderWidths.left, '1px');

    const adviceNote = await page.locator('.group-diag-clean-note').innerText();
    assert.ok(adviceNote.includes('No recent errors recorded for this group.'));
  } finally {
    await browser.close();
  }
});
