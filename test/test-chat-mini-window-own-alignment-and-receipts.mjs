import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const rootDir = process.cwd();

test('Unit & Contract: Chat mini window own message alignment and SVG receipts logic', () => {
  const chatJs = fs.readFileSync(path.join(rootDir, 'production/chat.js'), 'utf8');

  // 1. Verify expanded isOwnMessage matching in core chat
  assert.ok(chatJs.includes('String(prof?.id || \'\')'), 'isOwnMessage must check prof.id');
  assert.ok(chatJs.includes('String(user?.id || \'\')'), 'isOwnMessage must check user.id');
  assert.ok(chatJs.includes('String(user?.login || \'\')'), 'isOwnMessage must check user.login');
  assert.ok(chatJs.includes('if (sId) return ownIds.has(sId) || Boolean(m?.pending);'), 'isOwnMessage must check sId against ownIds');

  // 2. Verify ownIds and ownNames validation in syncMiniTimeline
  assert.ok(chatJs.includes('const ownIds = new Set('), 'syncMiniTimeline must construct ownIds set');
  assert.ok(chatJs.includes('const ownNames = new Set('), 'syncMiniTimeline must construct ownNames set');
  assert.ok(chatJs.includes('ownIds.has(sId)'), 'syncMiniTimeline must match senderId against ownIds set');

  // 3. Verify inline SVG checkmarks rendering in syncMiniTimeline
  assert.ok(chatJs.includes('const checkSvg = \'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2">'), 'Must define single check SVG');
  assert.ok(chatJs.includes('const doubleCheckSvg = \'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2">'), 'Must define double check SVG');
  assert.ok(chatJs.includes('const svgIcon = (isRead || isDelivered) ? doubleCheckSvg : checkSvg'), 'Must choose doubleCheckSvg for read/delivered and checkSvg for sent');
});

test('Functional & Visual: Mini chat own messages on the right with checkmarks and peer messages on the left', async () => {
  const previewCss = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const chatCss = fs.readFileSync(path.join(rootDir, 'production/chat.css'), 'utf8');
  const chatHtml = fs.readFileSync(path.join(rootDir, 'production/chat.html'), 'utf8');
  const chatJs = fs.readFileSync(path.join(rootDir, 'production/chat.js'), 'utf8');

  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ['sky', 'dark', 'light']) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1024, height: 768 });

      const html = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <style>
    ${previewCss}
    ${chatCss}
  </style>
</head>
<body style="background: var(--bg); color: var(--ink);">
  ${chatHtml}
  <script>
    if (!window.crypto.randomUUID) {
      Object.defineProperty(window.crypto, 'randomUUID', {
        value: () => 'uuid-' + Math.random().toString(36).slice(2)
      });
    }
    window.authUser = { id: 42, login: 'tsovak', name: 'Tsovak Palakian', role: 'ADMIN' };
  </script>
  <script>
    ${chatJs}
  </script>
</body>
</html>`;

      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      // Simulate messages in timeline and sync
      await page.evaluate(() => {
        const mini = document.getElementById('chatMiniWindow');
        if (mini) mini.hidden = false;

        const timeline = document.getElementById('msgTimeline');
        timeline.innerHTML = '';

        // 1. Peer message (should be on left)
        const peerMsg = document.createElement('article');
        peerMsg.className = 'msg-message';
        peerMsg.dataset.msgId = '101';
        peerMsg.dataset.senderId = '999';
        peerMsg.dataset.senderName = 'Anna Student';
        peerMsg.dataset.content = JSON.stringify([101, 'Hello teacher!', null, []]);
        peerMsg.innerHTML = '<p class="chat-message-text">Hello teacher!</p><div class="chat-message-foot"><time>08:20</time></div>';
        timeline.appendChild(peerMsg);

        // 2. Own message with ID match (should be on right with checkmark)
        const ownMsg1 = document.createElement('article');
        ownMsg1.className = 'msg-message is-own';
        ownMsg1.dataset.msgId = '102';
        ownMsg1.dataset.senderId = '42';
        ownMsg1.dataset.senderName = 'Tsovak Palakian';
        ownMsg1.dataset.content = JSON.stringify([102, '1234', null, []]);
        ownMsg1.innerHTML = '<p class="chat-message-text">1234</p><div class="chat-message-foot"><time>08:23</time><span class="msg-receipt is-read" aria-label="Read" title="Read by everyone"></span></div>';
        timeline.appendChild(ownMsg1);

        // 3. Own message where senderId is login instead of ID (should also be recognized as own)
        const ownMsg2 = document.createElement('article');
        ownMsg2.className = 'msg-message';
        ownMsg2.dataset.msgId = '103';
        ownMsg2.dataset.senderId = 'tsovak';
        ownMsg2.dataset.senderName = 'Tsovak Palakian';
        ownMsg2.dataset.content = JSON.stringify([103, 'вафывафыв', null, []]);
        ownMsg2.innerHTML = '<p class="chat-message-text">вафывафыв</p><div class="chat-message-foot"><time>08:24</time></div>';
        timeline.appendChild(ownMsg2);

        // 4. Own message with name match only
        const ownMsg3 = document.createElement('article');
        ownMsg3.className = 'msg-message';
        ownMsg3.dataset.msgId = '104';
        ownMsg3.dataset.senderId = '';
        ownMsg3.dataset.senderName = 'Tsovak Palakian';
        ownMsg3.dataset.content = JSON.stringify([104, 'фвыафы', null, []]);
        ownMsg3.innerHTML = '<p class="chat-message-text">фвыафы</p><div class="chat-message-foot"><time>08:25</time></div>';
        timeline.appendChild(ownMsg3);
      });

      // Wait for observer to update mini timeline
      await page.waitForTimeout(100);

      const rowsData = await page.evaluate(() => {
        const rows = document.querySelectorAll('#miniTimeline .chat-mini-msg-row');
        return Array.from(rows).map((row) => ({
          isOwn: row.classList.contains('own'),
          isOther: row.classList.contains('other'),
          alignSelf: window.getComputedStyle(row).alignSelf,
          text: row.querySelector('.chat-mini-msg-text')?.innerText?.trim() || '',
          hasReceipt: !!row.querySelector('.chat-mini-receipt'),
          hasSvgCheck: !!row.querySelector('.chat-mini-receipt svg'),
          time: row.querySelector('.chat-mini-msg-time')?.innerText?.trim() || '',
        }));
      });

      assert.equal(rowsData.length, 4, 'Must have 4 rows in mini timeline');

      // Row 0: Peer message
      assert.equal(rowsData[0].isOther, true, 'Peer message must have .other class');
      assert.equal(rowsData[0].isOwn, false, 'Peer message must not have .own class');
      assert.equal(rowsData[0].alignSelf, 'flex-start', 'Peer message must align to flex-start (left)');
      assert.equal(rowsData[0].hasReceipt, false, 'Peer message must not have checkmark receipt');

      // Row 1: Own message 1
      assert.equal(rowsData[1].isOwn, true, 'Own message 1 must have .own class');
      assert.equal(rowsData[1].alignSelf, 'flex-end', 'Own message 1 must align to flex-end (right)');
      assert.equal(rowsData[1].hasReceipt, true, 'Own message 1 must have receipt');
      assert.equal(rowsData[1].hasSvgCheck, true, 'Own message 1 must have SVG checkmark');

      // Row 2: Own message 2 (matched by login)
      assert.equal(rowsData[2].isOwn, true, 'Own message 2 must have .own class');
      assert.equal(rowsData[2].alignSelf, 'flex-end', 'Own message 2 must align to flex-end (right)');
      assert.equal(rowsData[2].hasReceipt, true, 'Own message 2 must have receipt');
      assert.equal(rowsData[2].hasSvgCheck, true, 'Own message 2 must have SVG checkmark');

      // Row 3: Own message 3 (matched by name)
      assert.equal(rowsData[3].isOwn, true, 'Own message 3 must have .own class');
      assert.equal(rowsData[3].alignSelf, 'flex-end', 'Own message 3 must align to flex-end (right)');
      assert.equal(rowsData[3].hasReceipt, true, 'Own message 3 must have receipt');
      assert.equal(rowsData[3].hasSvgCheck, true, 'Own message 3 must have SVG checkmark');

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
