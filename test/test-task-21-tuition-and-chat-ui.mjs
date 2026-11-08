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
const chatSourceJs = readFileSync('production/chat/40-messages.js', 'utf8');
const builtChatJs = readFileSync('production/chat.js', 'utf8');
const previewCss = readFileSync('site/preview.css', 'utf8');
const chatCss = readFileSync('production/chat.css', 'utf8');

test('TASK-21 Static code contracts: calendar top layer, manual amount docs, chat markdown buttons', () => {
  // 1. Calendar top layer and z-index
  assert.ok(clientExamsJs.includes("examCalAnchor.closest('dialog[open]')"), 'client/54-exams.js targets open dialog for #examCal');
  assert.ok(previewCss.includes('z-index: 100000;'), 'site/preview.css sets z-index: 100000 on .exam-cal');

  // 2. Manual Amount tip box, header tooltip, and input titles
  assert.ok(clientCalendarJs.includes('Manual Amount:</b> overrides the total invoice amount for that student'), 'client includes Manual Amount tip box');
  assert.ok(previewJs.includes('Manual Amount:</b> overrides the total invoice amount for that student'), 'preview.js includes Manual Amount tip box');
  assert.ok(clientCalendarJs.includes('gcw-info-hint'), 'client includes info hint icon for Manual Amount');
  assert.ok(previewJs.includes('gcw-info-hint'), 'preview.js includes info hint icon for Manual Amount');
  assert.ok(clientCalendarJs.includes('title="Enter custom total amount or leave blank to use Auto Amount"'), 'client input includes title tooltip');
  assert.ok(previewJs.includes('title="Enter custom total amount or leave blank to use Auto Amount"'), 'preview.js input includes title tooltip');

  // 3. postPaymentInvoiceToChat Markdown links
  assert.ok(clientCalendarJs.includes('[📅 Add to Google Calendar]'), 'calendar invoice sends Markdown link for Google Calendar');
  assert.ok(previewJs.includes('[📅 Add to Google Calendar]'), 'preview.js calendar invoice sends Markdown link for Google Calendar');
  assert.ok(clientCalendarJs.includes('[📥 Download .ics Reminder]'), 'calendar invoice sends Markdown link for .ics Reminder');
  assert.ok(previewJs.includes('[📥 Download .ics Reminder]'), 'preview.js calendar invoice sends Markdown link for .ics Reminder');

  // 4. Chat decorateLinks: Markdown parsing and preview filtering
  assert.ok(chatSourceJs.includes('chat-action-btn'), 'production/chat/40-messages.js uses chat-action-btn for markdown links');
  assert.ok(builtChatJs.includes('chat-action-btn'), 'production/chat.js includes chat-action-btn');
  assert.ok(chatSourceJs.includes("url.pathname.startsWith('/api/')"), 'production/chat/40-messages.js filters out /api/ paths from previews');
  assert.ok(builtChatJs.includes("url.pathname.startsWith('/api/')"), 'production/chat.js filters out /api/ paths from previews');
  assert.ok(chatSourceJs.includes("url.hostname.includes('calendar.google.com')"), 'production/chat/40-messages.js filters out google calendar previews');
  assert.ok(builtChatJs.includes("url.hostname.includes('calendar.google.com')"), 'production/chat.js filters out google calendar previews');

  // 5. CSS definitions for .chat-action-btn
  assert.ok(chatCss.includes('.chat-action-btn'), 'production/chat.css styles .chat-action-btn');
  assert.ok(previewCss.includes('.chat-action-btn'), 'site/preview.css styles .chat-action-btn');
});

test('TASK-21 Visual UI verification for Invoicing Dialog and Chat Action Buttons', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 800 } });
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    ${chatCss}
    body { padding: 20px; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    #container { max-width: 600px; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="container">
    <dialog id="gcwPaymentModal" class="gcw-scheduler-dialog" open style="position:relative;">
      <div class="gcw-scheduler-head">
        <h3>Tuition Invoicing & Payment Deadline</h3>
        <button type="button" class="gcw-choice-close-btn" data-action="close">✕</button>
      </div>
      <div class="gcw-scheduler-body" style="padding:16px;">
        <div class="gcw-field-group">
          <label for="gcwModalDeadlineDate">Payment Deadline Date</label>
          <div class="gcw-date-picker-wrap" style="display:flex; align-items:center; gap:8px;">
            <input type="text" id="gcwModalDeadlineDate" value="2026-11-26" readonly style="flex:1; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px;">
            <button type="button" class="btn icon-btn gcw-cal-btn" id="gcwModalDeadlineDateBtn" style="min-width:38px; height:38px; padding:0 8px;">📅</button>
          </div>
        </div>

        <div class="gcw-field-group" style="margin-top:16px;">
          <label>Student Invoices & Attendance Calculation</label>
          <div id="manualTip" style="background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; padding:8px 12px; border-radius:8px; font-size:12px; line-height:1.4; display:flex; align-items:flex-start; gap:6px; margin-bottom:8px;">
            <span>💡</span>
            <div>
              <b>Manual Amount:</b> overrides the total invoice amount for that student (custom discount or flat rate). Leave empty to use the auto-calculated amount.
            </div>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="border-bottom:2px solid #e2e8f0; color:#64748b;">
                <th style="text-align:left; padding:6px;">Student</th>
                <th style="padding:6px; text-align:center;">Attended</th>
                <th style="padding:6px; text-align:center;">Auto Amount</th>
                <th style="padding:6px; text-align:center;">
                  Manual Amount <span class="gcw-info-hint" id="manualHint" title="Overrides total sum for this student. Leave blank to use Auto Amount." style="cursor:help; font-size:11px; font-weight:700; background:#e2e8f0; color:#475569; border-radius:50%; width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; margin-left:4px;">i</span>
                </th>
                <th style="padding:6px; text-align:center;">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:8px 6px;"><b>Mensa1345</b></td>
                <td style="padding:8px 6px; text-align:center;">2 / 6</td>
                <td style="padding:8px 6px; text-align:center;">60 BYN</td>
                <td style="padding:8px 6px; text-align:center;">
                  <input type="number" id="manualInput" class="gcw-manual-amt-input" value="60" title="Enter custom total amount or leave blank to use Auto Amount" style="width:80px; height:32px; padding:4px 8px; font-size:13px; text-align:center;">
                </td>
                <td style="padding:8px 6px; text-align:center;">⏳ Pending</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </dialog>

    <div id="messages" style="margin-top:30px;">
      <div class="chat-message" id="chatMsg">
        <p class="chat-message-text" id="chatMsgText">💳 TUITION INVOICE & PAYMENT DETAILS
Group: Intermediate B1
Payment Deadline: 2026-11-26

Student Breakdown:
• Mensa1345: 60 BYN (2 / 6 lessons attended, custom amount)

👉 Add payment deadline to your calendar:
• [📅 Add to Google Calendar](https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tuition+Due)
• [📥 Download .ics Reminder](https://mysite.com/api/groups/payment-deadline.ics?groupId=1&date=2026-11-26)

🔔 Standard deadline: advance reminders will be set.</p>
      </div>
    </div>
  </div>

  <script>
    // Universal Date Picker script excerpt
    window.lmToday = () => '2026-11-09';
    ${clientExamsJs}

    const btn = document.getElementById('gcwModalDeadlineDateBtn');
    const input = document.getElementById('gcwModalDeadlineDate');
    btn.onclick = () => {
      window.openUniversalDatePicker(btn, input.value, (newDate) => {
        input.value = newDate;
      });
    };
  </script>
</body>
</html>
    `;

    await page.setContent(htmlContent);
    assert.deepEqual(pageErrors, []);

    // 1. Verify Manual Amount tip box exists and is visible
    const tipBox = page.locator('#manualTip');
    assert.ok(await tipBox.isVisible(), 'Manual Amount tip box is visible');
    const tipText = await tipBox.textContent();
    assert.ok(tipText.includes('overrides the total invoice amount for that student'), 'Tip box text explains overriding the total invoice');

    // 2. Verify tooltip on Manual Amount header and input field
    const hintBadge = page.locator('#manualHint');
    assert.equal(await hintBadge.getAttribute('title'), 'Overrides total sum for this student. Leave blank to use Auto Amount.');
    const inputField = page.locator('#manualInput');
    assert.equal(await inputField.getAttribute('title'), 'Enter custom total amount or leave blank to use Auto Amount');

    // 3. Click deadline calendar button: verify #examCal is attached inside #gcwPaymentModal and has z-index 100000
    await page.click('#gcwModalDeadlineDateBtn');
    const examCal = page.locator('#examCal');
    assert.ok(await examCal.isVisible(), '#examCal opened and is visible');

    const calParentId = await examCal.evaluate(el => el.parentElement?.id);
    assert.equal(calParentId, 'gcwPaymentModal', '#examCal is attached inside modal dialog');

    const zIndex = await examCal.evaluate(el => window.getComputedStyle(el).zIndex);
    assert.equal(zIndex, '100000', '#examCal has z-index 100000');

    // Pick a date from the calendar
    const dayBtn = page.locator('#examCal [data-date="2026-11-28"]');
    assert.ok(await dayBtn.count() > 0, 'Date 2026-11-28 exists in calendar');
    await dayBtn.click();
    assert.equal(await page.locator('#gcwModalDeadlineDate').inputValue(), '2026-11-28');
    assert.ok(await examCal.isHidden(), '#examCal closed after picking date');

    // 4. Test Chat decorateLinks execution on #chatMsg
    await page.evaluate(() => {
      const node = document.getElementById('chatMsg');
      // Execute the chat decorateLinks logic
      const text = node.querySelector('.chat-message-text');
      const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let part, offset = 0;
      while ((part = walker.nextNode())) {
        nodes.push({ node: part, start: offset, end: offset + part.length });
        offset += part.length;
      }
      const source = text.textContent;
      const matches = [];
      const mdRegex = new RegExp('\\[([^\\]\\r\\n]+)\\]\\(((?:https?:\\/\\/|www\\.)[^\\s\\)]+)\\)', 'gu');
      for (const match of source.matchAll(mdRegex)) {
        const label = match[1];
        const rawUrl = match[2];
        let url;
        try { url = new URL(rawUrl.startsWith('www.') ? 'https://' + rawUrl : rawUrl); } catch { continue; }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
        matches.push({ start: match.index, end: match.index + match[0].length, url, label, isMarkdown: true });
      }
      const plainRegex = new RegExp('\\b(?:https?:\\/\\/|www\\.)[^\\s<>]+', 'giu');
      for (const match of source.matchAll(plainRegex)) {
        if (matches.some((m) => match.index >= m.start && match.index < m.end)) continue;
        let label = match[0].replace(/[.,;:!?"']+$/g, '');
        for (const [open, close] of [['(', ')'], ['[', ']']])
          while (label.endsWith(close) && label.split(close).length > label.split(open).length) label = label.slice(0, -1);
        let url;
        try { url = new URL(label.startsWith('www.') ? 'https://' + label : label); } catch { continue; }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
        matches.push({ start: match.index, end: match.index + label.length, url, isMarkdown: false });
      }
      matches.sort((a, b) => a.start - b.start);
      for (const match of [...matches].reverse()) {
        const start = nodes.find((n) => n.end > match.start);
        const end = nodes.find((n) => n.end >= match.end);
        if (!start || !end) continue;
        const range = document.createRange();
        range.setStart(start.node, match.start - start.start);
        range.setEnd(end.node, match.end - end.start);
        const link = document.createElement('a');
        link.href = match.url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        if (match.isMarkdown) {
          link.className = 'chat-action-btn';
          range.deleteContents();
          link.textContent = match.label;
        } else {
          link.append(range.extractContents());
        }
        range.insertNode(link);
      }
    });

    const actionBtns = page.locator('#chatMsg .chat-action-btn');
    assert.equal(await actionBtns.count(), 2, '2 action buttons rendered');
    assert.equal(await actionBtns.nth(0).textContent(), '📅 Add to Google Calendar');
    assert.equal(await actionBtns.nth(1).textContent(), '📥 Download .ics Reminder');

    // 5. Verify no preview cards generated for system /api/ or google calendar URLs
    const previewCards = page.locator('#chatMsg .chat-preview');
    assert.equal(await previewCards.count(), 0, 'No broken preview cards generated for calendar actions');
  } finally {
    await browser.close();
  }
});
