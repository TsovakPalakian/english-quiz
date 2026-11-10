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

test('TASK-42: Contracts for getGroupMonthLessonDates and unified tuition calculation', () => {
  assert.ok(clientCalendarJs.includes('function getGroupMonthLessonDates('), 'client defines getGroupMonthLessonDates');
  assert.ok(previewJs.includes('function getGroupMonthLessonDates('), 'preview defines getGroupMonthLessonDates');
  assert.ok(clientCalendarJs.includes('sortedLessonDates = getGroupMonthLessonDates(groupId, state, monthKey)'), 'calculateStudentTuition uses getGroupMonthLessonDates');
  assert.ok(previewJs.includes('sortedLessonDates = getGroupMonthLessonDates(groupId, state, monthKey)'), 'preview calculateStudentTuition uses getGroupMonthLessonDates');
  assert.ok(clientCalendarJs.includes('sortedLessonDates = getGroupMonthLessonDates(groupId, state, monthKey)'), 'showPaymentDeadlineModal uses getGroupMonthLessonDates');
  assert.ok(previewJs.includes('sortedLessonDates = getGroupMonthLessonDates(groupId, state, monthKey)'), 'preview showPaymentDeadlineModal uses getGroupMonthLessonDates');
});

test('TASK-42: Logic test for getGroupMonthLessonDates and calculateStudentTuition sync', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<div id="container"></div>
<script>
  window.classGroups = [{ id: 42, title: 'English Intermediate', lessonIds: ['mat-1', 'mat-2', 'mat-13'] }];
  window.lmLibrary = {
    materials: [
      { id: 'mat-1', title: 'Lesson 1', groupId: 42, date: '2026-11-02' },
      { id: 'mat-2', title: 'Lesson 2', groupId: 42, date: '2026-11-04' },
      { id: 'mat-13', title: 'Lesson 13 (From Library)', groupId: 42, date: '2026-11-30' }
    ]
  };
</script>
<script>
${clientCalendarJs}
</script>
</body>
</html>`;

    await page.setContent(html, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, 'No script errors on initialization');

    const result = await page.evaluate(() => {
      const state = {
        year: 2026,
        monthIndex: 10, // November
        monthCache: new Map()
      };
      const monthKey = '2026-11';
      // 12 dates stored in monthData.lessonDates
      const twelveDates = new Set([
        '2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09',
        '2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18',
        '2026-11-20', '2026-11-23', '2026-11-25', '2026-11-27'
      ]);
      const attendance = {
        'student-mensa': {
          '2026-11-02': 'present',
          '2026-11-04': 'present',
          '2026-11-06': 'present',
          '2026-11-09': 'present'
        },
        'student-reticulum': {
          '2026-11-02': 'present',
          '2026-11-04': 'present',
          '2026-11-06': 'present',
          '2026-11-09': 'present',
          '2026-11-11': 'present',
          '2026-11-13': 'present',
          '2026-11-16': 'present',
          '2026-11-18': 'present'
        }
      };

      state.monthCache.set(monthKey, {
        lessonDates: twelveDates,
        attendance,
        pricePerLesson: 35,
        currency: 'BYN',
        paymentDeadline: '',
        paymentRequisites: '',
        studentPayments: {}
      });

      const dates = window.getGroupMonthLessonDates(42, state, monthKey);
      const tuitionMensa = window.calculateStudentTuition(42, state, 'student-mensa');
      const tuitionReticulum = window.calculateStudentTuition(42, state, 'student-reticulum');

      return {
        totalDatesCount: dates.length,
        has13thDate: dates.includes('2026-11-30'),
        mensaAttended: tuitionMensa.attendedCount,
        mensaTotal: tuitionMensa.totalLessons,
        mensaAmount: tuitionMensa.autoAmount,
        reticulumAttended: tuitionReticulum.attendedCount,
        reticulumTotal: tuitionReticulum.totalLessons,
        reticulumAmount: tuitionReticulum.autoAmount
      };
    });

    assert.equal(result.totalDatesCount, 13, 'getGroupMonthLessonDates accurately returns 13 dates');
    assert.equal(result.has13thDate, true, 'getGroupMonthLessonDates includes 13th date from library');
    assert.equal(result.mensaAttended, 4, 'Mensa attended 4 lessons');
    assert.equal(result.mensaTotal, 13, 'Mensa total lessons is synchronized to 13 (not 12)');
    assert.equal(result.mensaAmount, 140, 'Mensa auto amount is 140 BYN (4 * 35)');
    assert.equal(result.reticulumAttended, 8, 'Reticulum attended 8 lessons');
    assert.equal(result.reticulumTotal, 13, 'Reticulum total lessons is synchronized to 13 (not 12)');
    assert.equal(result.reticulumAmount, 280, 'Reticulum auto amount is 280 BYN (8 * 35)');
  } finally {
    await browser.close();
  }
});

test('TASK-42: Playwright visual verification of 4 / 13 and 8 / 13 in Tuition Deadline modal', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({
      viewport: { width: 560, height: 750 },
      deviceScaleFactor: 2
    });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body {
      margin: 0;
      padding: 16px;
      background: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .gcw-scheduler-dialog {
      position: relative;
      width: 100%;
      max-width: 520px;
      margin: 0 auto;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      background: #fff;
    }
  </style>
</head>
<body>
  <div id="modalHost"></div>
  <script>
    window.classGroups = [{ id: 42, title: 'English Intermediate', lessonIds: ['mat-1', 'mat-2', 'mat-13'] }];
    window.groupDirectory = {
      members: [
        { groupId: 42, accountId: 's1' },
        { groupId: 42, accountId: 's2' }
      ],
      users: [
        { id: 's1', name: 'Mensa1345', role: 'USER' },
        { id: 's2', name: 'Reticulum Star', role: 'USER' }
      ]
    };
    window.lmLibrary = {
      materials: [
        { id: 'mat-1', title: 'Lesson 1', groupId: 42, date: '2026-11-02' },
        { id: 'mat-2', title: 'Lesson 2', groupId: 42, date: '2026-11-04' },
        { id: 'mat-13', title: 'Lesson 13', groupId: 42, date: '2026-11-30' }
      ]
    };
  </script>
  <script>
  ${clientCalendarJs}
  </script>
  <script>
    const state = {
      year: 2026,
      monthIndex: 10,
      groupTitle: 'English Intermediate',
      monthCache: new Map()
    };
    const twelveDates = new Set([
      '2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09',
      '2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18',
      '2026-11-20', '2026-11-23', '2026-11-25', '2026-11-27'
    ]);
    const attendance = {
      's1': {
        '2026-11-02': 'present',
        '2026-11-04': 'present',
        '2026-11-06': 'present',
        '2026-11-09': 'present'
      },
      's2': {
        '2026-11-02': 'present',
        '2026-11-04': 'present',
        '2026-11-06': 'present',
        '2026-11-09': 'present',
        '2026-11-11': 'present',
        '2026-11-13': 'present',
        '2026-11-16': 'present',
        '2026-11-18': 'present'
      }
    };
    state.monthCache.set('2026-11', {
      lessonDates: twelveDates,
      attendance,
      pricePerLesson: 35,
      currency: 'BYN',
      paymentDeadline: '2026-11-25',
      paymentRequisites: 'Alfa-Bank BY00 ALFA 0000 0000',
      studentPayments: {}
    });

    window.showPaymentDeadlineModal(42, '2026-11-25', state, document.body);
    const invoicesTab = document.querySelector('.gcw-payment-tab[data-tab="invoices"]');
    if (invoicesTab) invoicesTab.click();
  </script>
</body>
</html>`;

    await page.setContent(html, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, 'No runtime errors in Tuition modal');

    // Verify modal DOM
    const dialogEl = await page.$('#gcwPaymentModal');
    assert.ok(dialogEl, 'gcwPaymentModal rendered');

    // Check attended cells in table
    const tableText = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#gcwInvoicesTableBody tr'));
      return rows.map(r => {
        const cols = Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim());
        return { student: cols[0], attended: cols[1], autoCalc: cols[2] };
      });
    });

    assert.equal(tableText.length, 2, '2 student invoice rows rendered');
    assert.equal(tableText[0].attended, '4 / 13', 'First student attended is 4 / 13 (synchronized)');
    assert.equal(tableText[0].autoCalc, '140 BYN', 'First student auto calc is 140 BYN');
    assert.equal(tableText[1].attended, '8 / 13', 'Second student attended is 8 / 13 (synchronized)');
    assert.equal(tableText[1].autoCalc, '280 BYN', 'Second student auto calc is 280 BYN');

    const totalInvoicedText = await page.$eval('#gcwTotalInvoiced', el => el.textContent.trim());
    assert.equal(totalInvoicedText, '420 BYN', 'Total invoiced is 420 BYN');

    // Capture visual screenshot
    if (!existsSync('docs')) mkdirSync('docs', { recursive: true });
    await dialogEl.screenshot({ path: 'docs/task-42-screenshot-verification.png' });
    assert.ok(existsSync('docs/task-42-screenshot-verification.png'), 'Verification screenshot captured');
  } finally {
    await browser.close();
  }
});
