import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const rootDir = process.cwd();

test('Unit & Contract: Chat mini window styles, sides separation, receipts, and forward logic', () => {
  const chatCss = fs.readFileSync(path.join(rootDir, 'production/chat.css'), 'utf8');
  const chatJs = fs.readFileSync(path.join(rootDir, 'production/chat.js'), 'utf8');

  // 1. Verify CSS rules for mini sides, no avatar, and receipts
  assert.ok(chatCss.includes('.chat-mini-msg-avatar{display:inline-block!important;width:0!important;height:0!important'), 'Avatar on left of mini messages must be suppressed visually and dimensionally');
  assert.ok(chatCss.includes('.chat-mini-window.is-resizing'), 'CSS must define .chat-mini-window.is-resizing to disable transition during resize');
  assert.ok(chatCss.includes('.chat-mini-receipt'), 'CSS must define .chat-mini-receipt');
  assert.ok(chatCss.includes('.chat-mini-receipt.is-read'), 'CSS must define .chat-mini-receipt.is-read');
  assert.ok(chatCss.includes('.chat-mini-forwarded-badge'), 'CSS must define .chat-mini-forwarded-badge');

  // 2. Verify JS logic in bundle
  assert.ok(chatJs.includes('chat-mini-receipt'), 'Bundle must render .chat-mini-receipt in syncMiniTimeline');
  assert.ok(chatJs.includes('chat-mini-forwarded-badge'), 'Bundle must render .chat-mini-forwarded-badge');
  assert.ok(chatJs.includes('is-resizing'), 'Bundle must toggle is-resizing on mini window');
  assert.ok(chatJs.includes('history({ refresh: true })'), 'Bundle must refresh history after forwardMessage');
});

test('Functional & Visual: Mini chat sides separation, no avatar, receipts, and forward display', async () => {
  const previewCss = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const chatCss = fs.readFileSync(path.join(rootDir, 'production/chat.css'), 'utf8');
  const chatHtml = fs.readFileSync(path.join(rootDir, 'production/chat.html'), 'utf8');
  const chatJs = fs.readFileSync(path.join(rootDir, 'production/chat.js'), 'utf8');

  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ['sky', 'dark', 'sand']) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1024, height: 768 });

      const checkSvg = '<svg viewBox="0 0 16 16" width="13" height="13" stroke="currentColor"><path d="M3 8.5L6.5 12L13 4.5"/></svg>';
      const checkCheckSvg = '<svg viewBox="0 0 20 16" width="15" height="13" stroke="currentColor"><path d="M2 8.5L5.5 12L12 4.5M7 8.5L10.5 12L17 4.5"/></svg>';

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
    window.authUser = { id: 'teacher-1', login: 'teacher', name: 'Teacher', role: 'ADMIN' };
    window.lucide = { createIcons: () => {} };

    class MockWebSocket {
      static OPEN = 1;
      constructor(url) {
        this.url = url;
        this.readyState = 1;
      }
      send(data) {}
      close() {}
    }
    window.WebSocket = MockWebSocket;
    ${chatJs}
  </script>
</body>
</html>`;

      await page.setContent(html);

      // Populate mock messages in main timeline and sync to mini window
      await page.evaluate(({ checkSvg, checkCheckSvg }) => {
        const mini = document.getElementById('chatMiniWindow');
        mini.hidden = false;
        mini.style.left = '60px';
        mini.style.top = '60px';

        const tl = document.getElementById('msgTimeline');
        tl.innerHTML = `
          <article class="msg-message" data-sender-id="student-1" data-sender-name="Student 1" data-content='[101,"Hello teacher!",null,[],null,null,null,null,"Student 1","student-1",1700000000000]'>
            <header><strong>Student 1</strong></header>
            <p class="chat-message-text">Hello teacher!</p>
            <div class="chat-message-foot"><time>06:50</time></div>
          </article>
          <article class="msg-message is-own" data-sender-id="teacher-1" data-sender-name="Teacher" data-content='[102,"Got your message",null,[],null,null,null,null,"Teacher","teacher-1",1700000010000]'>
            <header><strong>Teacher</strong></header>
            <p class="chat-message-text">Got your message</p>
            <div class="chat-message-foot">
              <time>06:51</time>
              <span class="msg-receipt is-read" aria-label="Read" title="Read by everyone">${checkCheckSvg}</span>
            </div>
          </article>
          <article class="msg-message is-own" data-sender-id="teacher-1" data-sender-name="Teacher" data-content='[103,"Reviewing right now",null,[],null,null,null,null,"Teacher","teacher-1",1700000020000]'>
            <header><strong>Teacher</strong></header>
            <p class="chat-message-text">Reviewing right now</p>
            <div class="chat-message-foot">
              <time>06:52</time>
              <span class="msg-receipt is-delivered" aria-label="Delivered" title="Delivered">${checkCheckSvg}</span>
            </div>
          </article>
          <article class="msg-message is-own" data-sender-id="teacher-1" data-sender-name="Teacher" data-content='[104,"Here are notes",null,[],null,null,null,null,"Teacher","teacher-1",1700000030000]'>
            <header><strong>Teacher</strong></header>
            <p class="chat-message-text">Here are notes</p>
            <div class="chat-message-foot">
              <time>06:53</time>
              <span class="msg-receipt is-sent" aria-label="Sent" title="Sent">${checkSvg}</span>
            </div>
          </article>
        `;

        // Trigger mutation observer or manual sync
        const miniTl = document.getElementById('miniTimeline');
        if (typeof window.syncMiniTimeline === 'function') window.syncMiniTimeline();
      }, { checkSvg, checkCheckSvg });

      await page.waitForTimeout(150);

      // 1. Verify incoming message row has NO visible avatar
      const otherRows = page.locator('.chat-mini-msg-row.other');
      assert.equal(await otherRows.count(), 1, 'Incoming message from Student 1 must be rendered in .chat-mini-msg-row.other');
      const avatarVisible = await page.locator('.chat-mini-msg-row.other .chat-mini-msg-avatar').isVisible();
      assert.equal(avatarVisible, false, 'Avatar circle on left of incoming message must not be visible');

      // 2. Verify incoming message text and alignment
      const incomingText = await otherRows.first().locator('.chat-mini-msg-bubble').innerText();
      assert.equal(incomingText.trim(), 'Hello teacher!', 'Incoming message text must match');

      // 3. Verify outgoing messages on the right with receipts
      const ownRows = page.locator('.chat-mini-msg-row.own');
      assert.equal(await ownRows.count(), 3, 'Outgoing messages from Teacher must be rendered in .chat-mini-msg-row.own');

      // Check receipts in own rows
      const readReceipt = ownRows.nth(0).locator('.chat-mini-receipt.is-read');
      assert.ok(await readReceipt.count() > 0, 'First outgoing message must have .is-read receipt');

      const deliveredReceipt = ownRows.nth(1).locator('.chat-mini-receipt.is-delivered');
      assert.ok(await deliveredReceipt.count() > 0, 'Second outgoing message must have .is-delivered receipt');

      const sentReceipt = ownRows.nth(2).locator('.chat-mini-receipt.is-sent');
      assert.ok(await sentReceipt.count() > 0, 'Third outgoing message must have .is-sent receipt');

      // 4. Verify resize class behavior
      await page.evaluate(() => {
        const mini = document.getElementById('chatMiniWindow');
        mini.classList.add('is-resizing');
      });
      const hasResizingClass = await page.locator('#chatMiniWindow').evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.transition === 'all 0s ease 0s' || style.transition.includes('none') || style.transitionProperty === 'none';
      });
      assert.ok(hasResizingClass, 'is-resizing class must disable transition property for 60fps smooth resizing');

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
