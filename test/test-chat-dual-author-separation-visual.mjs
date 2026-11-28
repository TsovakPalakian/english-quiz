import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const rootDir = process.cwd();

test('Chat Dual Author Separation: Main and Mini chat correctly isolate authors with identical names across themes', async () => {
  const previewCss = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const chatCss = fs.readFileSync(path.join(rootDir, 'production/chat.css'), 'utf8');
  const chatHtml = fs.readFileSync(path.join(rootDir, 'production/chat.html'), 'utf8');
  const chatJs = fs.readFileSync(path.join(rootDir, 'production/chat.js'), 'utf8');

  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ['sky', 'dark', 'sand']) {
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
    window.authUser = { id: 999, login: 'me', name: 'Tsovak Palakian', role: 'USER' };
    window.lucide = { createIcons: () => {} };

    class MockWebSocket {
      static OPEN = 1;
      constructor(url) {
        this.readyState = MockWebSocket.OPEN;
      }
      send() {}
      close() {}
    }
    window.WebSocket = MockWebSocket;
    ${chatJs}
  </script>
</body>
</html>`;

      await page.setContent(html);

      // Open mini chat window and inject dual-author messages into timeline
      await page.evaluate(() => {
        const mini = document.getElementById('chatMiniWindow');
        mini.hidden = false;
        mini.style.left = '60px';
        mini.style.top = '60px';
        mini.style.width = '380px';
        mini.style.height = '500px';

        const tl = document.getElementById('msgTimeline');
        tl.innerHTML = `
          <article class="msg-message is-own" data-msg-id="101" data-sender-id="999" data-sender-name="Tsovak Palakian" data-content='[101,"Message from me",null,[],null,null,null,null,"Tsovak Palakian","999",1700000000000]'>
            <header><strong>Tsovak Palakian</strong></header>
            <p class="chat-message-text">Message from me</p>
            <div class="chat-message-foot"><time>07:08</time></div>
          </article>
          <article class="msg-message" data-msg-id="102" data-sender-id="1001" data-sender-name="Tsovak Palakian" data-content='[102,"Message from peer with same name",null,[],null,null,null,null,"Tsovak Palakian","1001",1700000010000]'>
            <header><strong>Tsovak Palakian</strong></header>
            <p class="chat-message-text">Message from peer with same name</p>
            <div class="chat-message-foot"><time>07:09</time></div>
          </article>
        `;
      });

      await page.waitForTimeout(100);

      // Verify main timeline message classification
      const mainOwnMsgCount = await page.locator('#msgTimeline .msg-message.is-own').count();
      const mainOtherMsgCount = await page.locator('#msgTimeline .msg-message:not(.is-own)').count();

      assert.equal(mainOwnMsgCount, 1, `Main chat must have exactly 1 own message in ${theme}`);
      assert.equal(mainOtherMsgCount, 1, `Main chat must have exactly 1 other message in ${theme}`);

      // Verify dynamic message evaluation with identical sender name
      const dynamicPeerIsOwn = await page.evaluate(() => {
        return typeof isOwnMessage === 'function'
          ? isOwnMessage({ id: 103, senderId: '1001', sender: 'Tsovak Palakian', text: '1234' })
          : false;
      });
      assert.equal(dynamicPeerIsOwn, false, `Dynamic peer message from sender 1001 must not be marked own in ${theme}`);

      // Verify mini timeline has exactly 1 own row and 1 other row
      const ownRows = await page.locator('#miniTimeline .chat-mini-msg-row.own').count();
      const otherRows = await page.locator('#miniTimeline .chat-mini-msg-row.other').count();

      assert.equal(ownRows, 1, `Mini chat must have exactly 1 own row in ${theme}`);
      assert.equal(otherRows, 1, `Mini chat must have exactly 1 other row in ${theme}`);

      // Verify that other row in mini chat does not display an avatar circle
      const otherAvatarVisible = await page.locator('#miniTimeline .chat-mini-msg-row.other .chat-mini-msg-avatar').isVisible();
      assert.equal(otherAvatarVisible, false, `Other message in mini chat must not display an avatar circle in ${theme}`);

      // Verify alignment of rows in mini timeline
      const ownAlign = await page.locator('#miniTimeline .chat-mini-msg-row.own').first().evaluate((el) => {
        return window.getComputedStyle(el).alignSelf;
      });
      const otherAlign = await page.locator('#miniTimeline .chat-mini-msg-row.other').first().evaluate((el) => {
        return window.getComputedStyle(el).alignSelf;
      });

      assert.equal(ownAlign, 'flex-end', `Own message row in mini chat must align to flex-end in ${theme}`);
      assert.equal(otherAlign, 'flex-start', `Other message row in mini chat must align to flex-start in ${theme}`);

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
