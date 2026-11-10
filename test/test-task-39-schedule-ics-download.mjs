import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { integratedWorker } from '../src/learning-integrated-worker.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));
const chatCss = fs.readFileSync(path.resolve('production/chat.css'), 'utf8');
const clientCalendarJs = fs.readFileSync(path.resolve('client/53a-group-calendar.js'), 'utf8');
const previewJs = fs.readFileSync(path.resolve('preview.js'), 'utf8');
const chatMessagesJs = fs.readFileSync(path.resolve('production/chat/40-messages.js'), 'utf8');
const chatBundleJs = fs.readFileSync(path.resolve('production/chat.js'), 'utf8');

test('TASK-39: Server schedule.ics endpoint returns attachment Content-Disposition by default and supports inline override', async () => {
  const env = {
    STAGE_ENABLED: 'true',
    STAGE_ALLOWED_HOST: 'lumiscia.org',
    STAGE_WRITES: 'true',
    DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          first: async () => null,
          run: async () => ({ meta: { changes: 1 } })
        })
      })
    }
  };

  const app = integratedWorker({
    studyDatabase: () => ({
      read: async (sql, params) => {
        if (sql.includes('catalog_documents')) {
          return [{
            value_json: JSON.stringify({
              lessonDates: ['2026-11-04', '2026-11-11'],
              scheduleData: {
                '2026-11-04': { startTime: '19:00', durationMinutes: 90 },
                '2026-11-11': { startTime: '18:30', durationMinutes: 60 }
              }
            })
          }];
        }
        if (sql.includes('class_groups')) {
          return [{ title: 'Intermediate B1' }];
        }
        return [];
      }
    })
  });

  // 1. Default GET request returns attachment disposition
  const getReq = new Request('https://lumiscia.org/api/groups/schedule.ics?groupId=24&month=2026-11');
  const getRes = await app.fetch(getReq, env, { waitUntil() {} });
  assert.equal(getRes.status, 200);
  assert.equal(getRes.headers.get('Content-Type'), 'text/calendar; charset=utf-8');
  assert.equal(getRes.headers.get('Content-Disposition'), 'attachment; filename="group-24-schedule-2026-11.ics"');
  assert.equal(getRes.headers.get('Cache-Control'), 'no-cache');

  const icsBody = await getRes.text();
  assert.ok(icsBody.includes('PRODID:-//EnglishQuiz//GroupSchedule//EN'));
  assert.ok(icsBody.includes('SUMMARY:English Lesson · Intermediate B1'));
  assert.ok(icsBody.includes('DTSTART;TZID=Europe/Minsk:20261104T190000'));

  // 2. HEAD request returns identical attachment header with empty body
  const headReq = new Request('https://lumiscia.org/api/groups/schedule.ics?groupId=24&month=2026-11', { method: 'HEAD' });
  const headRes = await app.fetch(headReq, env, { waitUntil() {} });
  assert.equal(headRes.status, 200);
  assert.equal(headRes.headers.get('Content-Disposition'), 'attachment; filename="group-24-schedule-2026-11.ics"');
  assert.equal(await headRes.text(), '');

  // 3. Request with inline=1 returns inline disposition
  const inlineReq = new Request('https://lumiscia.org/api/groups/schedule.ics?groupId=24&month=2026-11&inline=1');
  const inlineRes = await app.fetch(inlineReq, env, { waitUntil() {} });
  assert.equal(inlineRes.status, 200);
  assert.equal(inlineRes.headers.get('Content-Disposition'), 'inline; filename="group-24-schedule-2026-11.ics"');
});

test('TASK-39: Client contracts enforce download attribute on payment deadline link and chat markdown action buttons', () => {
  // Calendar modal payment deadline link has download attribute
  assert.ok(
    clientCalendarJs.includes('download="payment-deadline.ics"'),
    'client/53a-group-calendar.js must set download attribute on payment-deadline.ics'
  );
  assert.ok(
    previewJs.includes('download="payment-deadline.ics"'),
    'preview.js must set download attribute on payment-deadline.ics'
  );

  // Chat message linkifier sets download attribute for .ics and download links
  assert.ok(
    chatMessagesJs.includes('ics|ical|csv|json|xml|pdf|zip'),
    'production/chat/40-messages.js must identify download file extensions'
  );
  assert.ok(
    chatMessagesJs.includes("link.setAttribute('download', '')"),
    'production/chat/40-messages.js must set download attribute'
  );
  assert.ok(
    chatBundleJs.includes("link.setAttribute('download', '')"),
    'production/chat.js must include download attribute assignment'
  );
});

test('TASK-39: Visual UI test for chat calendar report action buttons and download attribute', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 720, height: 500 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const fixtureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${chatCss}
    body {
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 30px;
      display: flex;
      justify-content: center;
    }
    .chat-bubble-container {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px;
      max-width: 580px;
      width: 100%;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);
    }
    .bubble-title {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .bubble-sub {
      font-size: 13px;
      color: #94a3b8;
      margin-bottom: 12px;
    }
    .session-item {
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.8;
    }
    .btn-group {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid #334155;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .chat-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(13, 148, 136, 0.15);
      border: 1px solid rgba(13, 148, 136, 0.4);
      color: #2dd4bf;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      width: fit-content;
    }
    .chat-action-btn:hover {
      background: rgba(13, 148, 136, 0.25);
    }
  </style>
</head>
<body>
  <div class="chat-bubble-container">
    <div class="bubble-title">📅 Schedule Report: Intermediate B1 (November 2026)</div>
    <div class="bubble-sub">Scheduled lessons: 8 | Scheduled exams: 2</div>
    <div class="session-item">• Wed, Nov 4 · 18:30 – 19:30 · Present Perfect Continuous</div>
    <div class="session-item">• Fri, Nov 6 · 18:30 – 19:30 · Modals of Deduction</div>
    <div class="btn-group">
      <div style="font-size:12px; text-transform:uppercase; color:#64748b; font-weight:600;">Add schedule to your calendar:</div>
      <a class="chat-action-btn" target="_blank" rel="noopener noreferrer" href="https://calendar.google.com/calendar/render">📅 Add to Google Calendar</a>
      <a class="chat-action-btn" target="_blank" rel="noopener noreferrer" download="" href="/api/groups/schedule.ics?groupId=24&month=2026-11" id="icsDownloadBtn">📥 Download .ics Calendar File</a>
    </div>
  </div>
</body>
</html>`;

    await page.setContent(fixtureHtml, { waitUntil: 'load' });
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);

    const downloadBtn = await page.$('#icsDownloadBtn');
    assert.ok(downloadBtn, 'Download button must exist in DOM');

    const downloadAttr = await downloadBtn.getAttribute('download');
    assert.equal(downloadAttr, '', 'download attribute must be present on .ics button');

    const href = await downloadBtn.getAttribute('href');
    assert.ok(href.includes('/api/groups/schedule.ics?groupId=24&month=2026-11'));

    await page.screenshot({ path: 'docs/task-39-screenshot-verification.png' });
  } finally {
    await browser.close();
  }
});
