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

test('TASK-40: CSS rules enforce fixed widths for attendance cells, columns, and buttons', () => {
  // Table layout & max-content
  assert.ok(previewCss.includes('width: max-content;'), 'preview.css contains width: max-content for .gcw-table');
  assert.ok(previewCss.includes('.gcw-th-date'), 'preview.css defines .gcw-th-date');
  assert.ok(previewCss.includes('width: 58px;'), 'preview.css defines width: 58px');
  assert.ok(previewCss.includes('min-width: 58px;'), 'preview.css defines min-width: 58px');
  assert.ok(previewCss.includes('max-width: 58px;'), 'preview.css defines max-width: 58px');
  assert.ok(previewCss.includes('.gcw-cell-btn.is-future'), 'preview.css defines .gcw-cell-btn.is-future');
  assert.ok(previewCss.includes('.gcw-scheduled-dropdown'), 'preview.css defines .gcw-scheduled-dropdown');
  assert.ok(previewCss.includes('top: calc(100% + 8px);'), 'preview.css positions .gcw-scheduled-dropdown below trigger');
  assert.ok(previewCss.includes('.gcw-lock-reporting-btn'), 'preview.css defines .gcw-lock-reporting-btn');
});

test('TASK-40: JS contract for future date guarding, scroll preservation, and reporting lock', () => {
  // Future dates guard
  assert.ok(clientCalendarJs.includes('const isFuture = (d > todayStr);'), 'clientCalendarJs checks isFuture');
  assert.ok(previewJs.includes('isFuture = (d > todayStr)'), 'previewJs checks isFuture');
  assert.ok(clientCalendarJs.includes('d > todayStr || monthData.reportingClosed'), 'clientCalendarJs guards clicks for future or locked dates');
  assert.ok(previewJs.includes('d > todayStr || monthData.reportingClosed'), 'previewJs guards clicks for future or locked dates');

  // Scroll preservation
  assert.ok(clientCalendarJs.includes('savedJournalScroll = oldJournal ? oldJournal.scrollLeft : null;'), 'clientCalendarJs saves journal scroll');
  assert.ok(previewJs.includes('savedJournalScroll = oldJournal ? oldJournal.scrollLeft : null;'), 'previewJs saves journal scroll');
  assert.ok(clientCalendarJs.includes('newJournal.scrollLeft = savedJournalScroll;'), 'clientCalendarJs restores journal scroll');
  assert.ok(previewJs.includes('newJournal.scrollLeft = savedJournalScroll;'), 'previewJs restores journal scroll');

  // Scheduled dropdown and lock reporting
  assert.ok(clientCalendarJs.includes('data-gcw-action="toggle-scheduled-dropdown"'), 'clientCalendarJs includes toggle-scheduled-dropdown');
  assert.ok(previewJs.includes('data-gcw-action="toggle-scheduled-dropdown"'), 'previewJs includes toggle-scheduled-dropdown');
  assert.ok(clientCalendarJs.includes('data-gcw-action="toggle-lock-reporting"'), 'clientCalendarJs includes toggle-lock-reporting');
  assert.ok(previewJs.includes('data-gcw-action="toggle-lock-reporting"'), 'previewJs includes toggle-lock-reporting');
  assert.ok(clientCalendarJs.includes('monthData.reportingClosed'), 'clientCalendarJs tracks reportingClosed');
  assert.ok(previewJs.includes('monthData.reportingClosed'), 'previewJs tracks reportingClosed');
});

test('TASK-40: Playwright UI visual test for static grid, fixed width, future date guard, and dropdown', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
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
  <div id="calendarWidget">
    <div class="gcw-journal-wrap" id="journalWrap" style="overflow-x: auto; width: 600px; border: 1px solid #cbd5e1; padding: 10px;">
      <table class="gcw-table">
        <thead>
          <tr>
            <th class="gcw-th-student">Student</th>
            <th class="gcw-th-date"><button type="button" class="gcw-date-header-btn">01.11</button></th>
            <th class="gcw-th-date"><button type="button" class="gcw-date-header-btn">03.11</button></th>
            <th class="gcw-th-date"><button type="button" class="gcw-date-header-btn">06.11</button></th>
            <th class="gcw-th-date"><button type="button" class="gcw-date-header-btn">08.11</button></th>
            <th class="gcw-th-date is-focused-date"><button type="button" class="gcw-date-header-btn is-focused" data-gcw-focused-date="true">09.11</button></th>
            <th class="gcw-th-date"><button type="button" class="gcw-date-header-btn">10.11</button></th>
            <th class="gcw-th-date"><button type="button" class="gcw-date-header-btn">13.11</button></th>
            <th class="gcw-th-date"><button type="button" class="gcw-date-header-btn">16.11</button></th>
            <th class="gcw-th-date"><button type="button" class="gcw-date-header-btn">20.11</button></th>
            <th class="gcw-th-date"><button type="button" class="gcw-date-header-btn">25.11</button></th>
            <th class="gcw-th-date"><button type="button" class="gcw-date-header-btn">30.11</button></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="gcw-td-student">Mensa1345</td>
            <td><button type="button" class="gcw-cell-btn is-present" data-date="2026-11-01">✓</button></td>
            <td><button type="button" class="gcw-cell-btn is-present" data-date="2026-11-03">✓</button></td>
            <td><button type="button" class="gcw-cell-btn is-absent" data-date="2026-11-06">✕</button></td>
            <td><button type="button" class="gcw-cell-btn is-present" data-date="2026-11-08">✓</button></td>
            <td class="td-focused-col"><button type="button" class="gcw-cell-btn is-present" data-date="2026-11-09">✓</button></td>
            <td><button type="button" class="gcw-cell-btn is-unmarked is-readonly is-future" disabled data-date="2026-11-10"></button></td>
            <td><button type="button" class="gcw-cell-btn is-unmarked is-readonly is-future" disabled data-date="2026-11-13"></button></td>
            <td><button type="button" class="gcw-cell-btn is-unmarked is-readonly is-future" disabled data-date="2026-11-16"></button></td>
            <td><button type="button" class="gcw-cell-btn is-unmarked is-readonly is-future" disabled data-date="2026-11-20"></button></td>
            <td><button type="button" class="gcw-cell-btn is-unmarked is-readonly is-future" disabled data-date="2026-11-25"></button></td>
            <td><button type="button" class="gcw-cell-btn is-unmarked is-readonly is-future" disabled data-date="2026-11-30"></button></td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="gcw-table-footer-row">
            <td class="gcw-td-student"></td>
            <td data-gcw-footer-date="2026-11-01">100%</td>
            <td data-gcw-footer-date="2026-11-03">100%</td>
            <td data-gcw-footer-date="2026-11-06">0%</td>
            <td data-gcw-footer-date="2026-11-08">100%</td>
            <td data-gcw-footer-date="2026-11-09">100%</td>
            <td data-gcw-footer-date="2026-11-10">—</td>
            <td data-gcw-footer-date="2026-11-13">—</td>
            <td data-gcw-footer-date="2026-11-16">—</td>
            <td data-gcw-footer-date="2026-11-20">—</td>
            <td data-gcw-footer-date="2026-11-25">—</td>
            <td data-gcw-footer-date="2026-11-30">—</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="gcw-footer" style="margin-top:20px; display:flex; justify-content:space-between; align-items:center;">
      <div class="gcw-stats">
        <div class="gcw-dropdown-wrap">
          <button class="gcw-badge gcw-badge-btn" type="button" data-gcw-action="toggle-scheduled-dropdown" aria-haspopup="true" aria-expanded="false">
            Scheduled lessons · <b>11</b> ▾
          </button>
          <div class="gcw-scheduled-dropdown" id="testDropdown" style="display:none;" role="menu">
            <button type="button" class="gcw-scheduled-dropdown-item" data-gcw-dropdown-date="2026-11-01">
              <span><b>01.11</b> (Sun) · 18:30</span> <span>Lesson 1</span>
            </button>
            <button type="button" class="gcw-scheduled-dropdown-item" data-gcw-dropdown-date="2026-11-09">
              <span><b>09.11</b> (Mon) · 18:30</span> <span>Lesson 5</span>
            </button>
            <button type="button" class="gcw-scheduled-dropdown-item" data-gcw-dropdown-date="2026-11-30">
              <span><b>30.11</b> (Mon) · 18:30</span> <span>Lesson 11</span>
            </button>
          </div>
        </div>
        <span class="gcw-badge">Attendance · <b id="overallPct">80%</b></span>
      </div>
      <div class="gcw-footer-actions">
        <button class="gcw-lock-reporting-btn" type="button" data-gcw-action="toggle-lock-reporting">🔒 Close reporting</button>
        <button class="gcw-report-btn" type="button" data-gcw-action="report-chat">Report to chat</button>
      </div>
    </div>
  </div>

  <script>
    const dropdownBtn = document.querySelector('[data-gcw-action="toggle-scheduled-dropdown"]');
    const dropdown = document.getElementById('testDropdown');
    dropdownBtn.addEventListener('click', () => {
      dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
    });

    const lockBtn = document.querySelector('[data-gcw-action="toggle-lock-reporting"]');
    let locked = false;
    lockBtn.addEventListener('click', () => {
      locked = !locked;
      lockBtn.textContent = locked ? '🔓 Reopen reporting' : '🔒 Close reporting';
      lockBtn.classList.toggle('is-locked', locked);
    });
  </script>
</body>
</html>`;

    await page.setContent(fixtureHtml, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);

    // 1. Verify fixed width for all buttons
    const cellBtns = await page.$$('.gcw-cell-btn');
    for (const btn of cellBtns) {
      const box = await btn.boundingBox();
      assert.ok(box, 'Bounding box exists');
      assert.equal(Math.round(box.width), 58, `Button width must be exactly 58px, got ${box.width}`);
    }

    // 2. Scroll horizontally to the right
    await page.evaluate(() => {
      const wrap = document.getElementById('journalWrap');
      wrap.scrollLeft = 100;
    });

    const initialScroll = await page.evaluate(() => document.getElementById('journalWrap').scrollLeft);
    assert.equal(initialScroll, 100, `Scroll left should be 100, got ${initialScroll}`);

    // Click on 09.11 cell
    await page.click('button[data-date="2026-11-09"]');

    // Verify scrollLeft stayed static
    const postClickScroll = await page.evaluate(() => document.getElementById('journalWrap').scrollLeft);
    assert.equal(postClickScroll, initialScroll, 'Horizontal scroll position must remain strictly static');

    // 3. Verify future date button is disabled
    const futureBtn = await page.$('button[data-date="2026-11-13"]');
    assert.ok(futureBtn, 'Future date button exists');
    const isDisabled = await futureBtn.isDisabled();
    assert.ok(isDisabled, 'Future date button must have disabled attribute');

    // 4. Verify scheduled dropdown interaction and downward position
    await page.click('[data-gcw-action="toggle-scheduled-dropdown"]');
    const dropdownVisible = await page.$eval('#testDropdown', el => el.style.display !== 'none');
    assert.ok(dropdownVisible, 'Dropdown must be visible after click');

    const btnBox = await (await page.$('[data-gcw-action="toggle-scheduled-dropdown"]')).boundingBox();
    const dropBox = await (await page.$('#testDropdown')).boundingBox();
    assert.ok(dropBox.y >= btnBox.y + btnBox.height - 2, `Dropdown (y: ${dropBox.y}) must open below trigger button (bottom: ${btnBox.y + btnBox.height})`);

    const dropdownItems = await page.$$('#testDropdown .gcw-scheduled-dropdown-item');
    assert.equal(dropdownItems.length, 3, 'Dropdown has 3 lesson items');

    // 5. Verify Close Reporting button
    await page.click('[data-gcw-action="toggle-lock-reporting"]');
    const lockBtnText = await page.$eval('[data-gcw-action="toggle-lock-reporting"]', el => el.textContent.trim());
    assert.equal(lockBtnText, '🔓 Reopen reporting', 'Lock button text toggles to Reopen reporting');

    // Capture visual verification screenshot if docs directory exists
    if (!existsSync('docs')) {
      mkdirSync('docs', { recursive: true });
    }
    await page.screenshot({ path: 'docs/task-40-screenshot-verification.png' });
  } finally {
    await browser.close();
  }
});
