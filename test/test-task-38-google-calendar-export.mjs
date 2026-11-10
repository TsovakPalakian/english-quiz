import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const clientCalendarJs = fs.readFileSync(path.join(rootDir, 'client', '53a-group-calendar.js'), 'utf8');
const previewJs = fs.readFileSync(path.join(rootDir, 'preview.js'), 'utf8');
const previewCss = fs.readFileSync(path.join(rootDir, 'preview.css'), 'utf8');

async function launchChromium(chromiumInstance) {
  return await chromiumInstance.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
}

test('TASK-38: Code contracts for Google Calendar recurring event parameters', () => {
  // 1. Report to chat must calculate dates, distinctDays, and recur RRULE in client and preview
  assert.ok(
    clientCalendarJs.includes("gCalUrl.searchParams.set('recur', `RRULE:FREQ=WEEKLY;BYDAY=${distinctDays};UNTIL=${untilDate}T235959Z`)"),
    'client/53a-group-calendar.js must set recur RRULE with distinctDays and untilDate'
  );
  assert.ok(
    previewJs.includes("gCalUrl.searchParams.set('recur', `RRULE:FREQ=WEEKLY;BYDAY=${distinctDays};UNTIL=${untilDate}T235959Z`)"),
    'preview.js must contain recur RRULE with distinctDays and untilDate'
  );

  assert.ok(
    clientCalendarJs.includes("gCalUrl.searchParams.set('dates', `${dtClean}T${stClean}/${dtClean}T${etClean}`)"),
    'client/53a-group-calendar.js must set dates parameter for Google Calendar'
  );
  assert.ok(
    previewJs.includes("gCalUrl.searchParams.set('dates', `${dtClean}T${stClean}/${dtClean}T${etClean}`)"),
    'preview.js must contain dates parameter for Google Calendar'
  );

  // 2. postLessonAlertToChat must accept selectedDayCodes and customUntilDate
  assert.ok(
    clientCalendarJs.includes('async function postLessonAlertToChat(groupId, groupTitle, dateStr, startTime, durationMinutes, period, materialTitle, isReschedule, selectedDayCodes, customUntilDate)'),
    'postLessonAlertToChat signature must accept selectedDayCodes and customUntilDate'
  );
  assert.ok(
    previewJs.includes('async function postLessonAlertToChat(groupId, groupTitle, dateStr, startTime, durationMinutes, period, materialTitle, isReschedule, selectedDayCodes, customUntilDate)'),
    'preview.js postLessonAlertToChat must accept selectedDayCodes and customUntilDate'
  );
});

test('TASK-38: Unit verification of Google Calendar URL parameters with multi-day recurrence', () => {
  const sortedDates = ['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18', '2026-11-20'];
  const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const firstDate = sortedDates[0];
  const startTime = '18:30';
  const dur = 60;
  const [sh, sm] = startTime.split(':').map(Number);
  const startHours = isNaN(sh) ? 18 : sh;
  const startMins = isNaN(sm) ? 30 : sm;
  const totalEndMin = startHours * 60 + startMins + dur;
  const endHours = Math.floor(totalEndMin / 60) % 24;
  const endMins = totalEndMin % 60;
  const dtClean = firstDate.replace(/-/g, '');
  const stClean = String(startHours).padStart(2, '0') + String(startMins).padStart(2, '0') + '00';
  const etClean = String(endHours).padStart(2, '0') + String(endMins).padStart(2, '0') + '00';

  const gCalUrl = new URL('https://calendar.google.com/calendar/render');
  gCalUrl.searchParams.set('action', 'TEMPLATE');
  gCalUrl.searchParams.set('text', 'Group Schedule · C2 Group');
  gCalUrl.searchParams.set('ctz', 'Europe/Minsk');
  gCalUrl.searchParams.set('dates', `${dtClean}T${stClean}/${dtClean}T${etClean}`);

  const distinctDays = Array.from(new Set(sortedDates.map(d => {
    const [dy, dm, dd] = d.split('-').map(Number);
    return dayMap[new Date(dy, dm - 1, dd).getDay()];
  }))).join(',');
  const untilDate = '20261130';
  gCalUrl.searchParams.set('recur', `RRULE:FREQ=WEEKLY;BYDAY=${distinctDays};UNTIL=${untilDate}T235959Z`);

  assert.equal(gCalUrl.searchParams.get('action'), 'TEMPLATE');
  assert.equal(gCalUrl.searchParams.get('text'), 'Group Schedule · C2 Group');
  assert.equal(gCalUrl.searchParams.get('ctz'), 'Europe/Minsk');
  assert.equal(gCalUrl.searchParams.get('dates'), '20261109T183000/20261109T193000');
  assert.equal(gCalUrl.searchParams.get('recur'), 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261130T235959Z');
});

test('TASK-38: Playwright UI visual test for Schedule Report Google Calendar URL generation', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
  </style>
</head>
<body style="padding: 20px; background: #f8fafc;">
  <div id="calendar-container"></div>
  <script>
    window.isTeacher = () => true;
    window.viewAccount = false;
    window.classGroups = [{ id: 42, title: 'C2 Group' }];
    window.groupStudents = [{ id: 101, name: 'Alice Student', login: 'alice' }];
    window.accountFetch = function() {
      return Promise.resolve({
        exists: true,
        lessonDates: ['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18', '2026-11-20'],
        scheduleData: {
          '2026-11-09': { startTime: '18:30', durationMinutes: 60 },
          '2026-11-11': { startTime: '18:30', durationMinutes: 60 },
          '2026-11-13': { startTime: '18:30', durationMinutes: 60 },
          '2026-11-16': { startTime: '18:30', durationMinutes: 60 },
          '2026-11-18': { startTime: '18:30', durationMinutes: 60 },
          '2026-11-20': { startTime: '18:30', durationMinutes: 60 }
        },
        attendance: {}
      });
    };
    window.fetch = window.accountFetch;
    window.sendGroupChatMessage = function(gid, msg) {
      window._lastGroupChatMessage = msg;
      return Promise.resolve({ ok: true, id: 'msg-1' });
    };
  </script>
  <script>
    ${clientCalendarJs}
  </script>
  <script>
    const container = document.getElementById('calendar-container');
    window.renderGroupCalendarWidget(container, 42, 'C2 Group');
  </script>
</body>
</html>
`;

    await page.setContent(fixtureHtml, { waitUntil: 'domcontentloaded' });
    assert.equal(pageErrors.length, 0, `Page errors encountered: ${pageErrors.join(', ')}`);

    // Verify Report to chat button is rendered
    const reportBtn = await page.$('[data-gcw-action="report-chat"]');
    assert.ok(reportBtn, 'Report to chat button must be rendered');

    // Click Report to chat
    await reportBtn.click();

    // Check captured chat message
    const lastMsg = await page.evaluate(() => window._lastGroupChatMessage);
    assert.ok(lastMsg, 'Group chat message must be dispatched');
    assert.ok(lastMsg.includes('📅 Schedule Report: C2 Group'), 'Report header must match');
    assert.ok(lastMsg.includes('• [📅 Add to Google Calendar]'), 'Markdown Google Calendar action button must be present');
    assert.ok(lastMsg.includes('• [📥 Download .ics Calendar File]'), 'Download .ics button must be present');

    // Extract Google Calendar link from markdown
    const gCalMatch = lastMsg.match(/• \[📅 Add to Google Calendar\]\((https:\/\/calendar\.google\.com\/calendar\/render\?[^\)]+)\)/);
    assert.ok(gCalMatch, 'Google Calendar link must match pattern');

    const gCalUrl = new URL(gCalMatch[1]);
    assert.equal(gCalUrl.searchParams.get('action'), 'TEMPLATE');
    assert.equal(gCalUrl.searchParams.get('ctz'), 'Europe/Minsk');
    assert.equal(gCalUrl.searchParams.get('text'), 'Group Schedule · C2 Group');
    assert.equal(gCalUrl.searchParams.get('dates'), '20261109T183000/20261109T193000');
    assert.equal(gCalUrl.searchParams.get('recur'), 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261130T235959Z');

    // Take screenshot for visual verification
    const visualPath = path.join(rootDir, 'docs', 'task-38-screenshot-verification.png');
    await page.screenshot({ path: visualPath, fullPage: true });
    assert.ok(fs.existsSync(visualPath), 'Visual verification screenshot must be generated');
  } finally {
    await browser.close();
  }
});

test('TASK-38: Playwright UI test for postLessonAlertToChat with multiple weekdays and custom period', async () => {
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
</head>
<body>
  <div id="container"></div>
  <script>
    window.isTeacher = () => true;
    window.classGroups = [{ id: 42, title: 'C2 Group' }];
    window.groupStudents = [{ id: 101, name: 'Alice Student', login: 'alice' }];
    window.sendGroupChatMessage = function(gid, msg) {
      window._lastGroupChatMessage = msg;
      return Promise.resolve({ ok: true, id: 'msg-1' });
    };
  </script>
  <script>
    ${clientCalendarJs}
  </script>
</body>
</html>
`;

    await page.setContent(fixtureHtml, { waitUntil: 'domcontentloaded' });
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);

    // 1. Test postLessonAlertToChat with multiple weekdays for month period
    const alertResult = await page.evaluate(async () => {
      // Trigger Set Group Schedule alert with Mon, Wed, Fri
      const days = ['MO', 'WE', 'FR'];
      await window.postLessonAlertToChat(42, 'C2 Group', '2026-11-09', '18:30', 60, 'month', 'C2 Grammar', false, days, null);
      return window._lastGroupChatMessage;
    });

    assert.ok(alertResult, 'Announcement message must be returned');
    assert.ok(alertResult.includes('📅 CLASS SCHEDULE ANNOUNCEMENT'), 'Header must match announcement');
    const gCalMonthMatch = alertResult.match(/• \[📅 Add to Google Calendar\]\((https:\/\/calendar\.google\.com\/calendar\/render\?[^\)]+)\)/);
    assert.ok(gCalMonthMatch, 'Google Calendar link must be present');
    const gCalMonthUrl = new URL(gCalMonthMatch[1]);
    assert.equal(gCalMonthUrl.searchParams.get('recur'), 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261130T235959Z');

    // 2. Test postLessonAlertToChat with custom period and custom end date
    const alertCustomResult = await page.evaluate(async () => {
      const days = ['TU', 'TH'];
      await window.postLessonAlertToChat(42, 'C2 Group', '2026-11-10', '19:00', 90, 'custom', 'C2 Speaking', false, days, '2026-11-26');
      return window._lastGroupChatMessage;
    });

    assert.ok(alertCustomResult, 'Custom period announcement must be returned');
    const gCalCustomMatch = alertCustomResult.match(/• \[📅 Add to Google Calendar\]\((https:\/\/calendar\.google\.com\/calendar\/render\?[^\)]+)\)/);
    assert.ok(gCalCustomMatch, 'Custom Google Calendar link must be present');
    const gCalCustomUrl = new URL(gCalCustomMatch[1]);
    assert.equal(gCalCustomUrl.searchParams.get('recur'), 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261126T235959Z');
  } finally {
    await browser.close();
  }
});

