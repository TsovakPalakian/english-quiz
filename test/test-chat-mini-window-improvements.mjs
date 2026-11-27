import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Unit & DOM test: Chat mini window structure and controls contract', () => {
  const chatHtml = fs.readFileSync(path.join(rootDir, 'production/chat.html'), 'utf8');
  const chatCss = fs.readFileSync(path.join(rootDir, 'production/chat.css'), 'utf8');

  // Verify textarea replacement
  assert.ok(
    chatHtml.includes('<textarea id="miniInput" class="chat-mini-textarea"'),
    'production/chat.html must declare #miniInput as textarea with class chat-mini-textarea'
  );
  assert.ok(
    chatHtml.includes('id="miniAttachments" class="chat-mini-attachments" hidden'),
    'production/chat.html must declare #miniAttachments container hidden by default'
  );
  assert.ok(
    chatHtml.includes('id="miniAttach"'),
    'production/chat.html must declare #miniAttach button'
  );
  assert.ok(
    chatHtml.includes('id="miniEmoji"'),
    'production/chat.html must declare #miniEmoji button'
  );
  assert.ok(
    chatHtml.includes('id="miniStickers"'),
    'production/chat.html must declare #miniStickers button'
  );
  assert.ok(
    chatHtml.includes('id="miniColorIndicator"'),
    'production/chat.html must declare #miniColorIndicator'
  );
  assert.ok(
    chatHtml.includes('id="miniMic"'),
    'production/chat.html must declare #miniMic button'
  );
  assert.ok(
    chatHtml.includes('id="miniSend" class="chat-mini-send-action-btn"'),
    'production/chat.html must declare #miniSend with class chat-mini-send-action-btn'
  );

  // Verify CSS classes
  assert.ok(chatCss.includes('.chat-mini-textarea'), 'CSS must define .chat-mini-textarea');
  assert.ok(chatCss.includes('.chat-mini-tools-row'), 'CSS must define .chat-mini-tools-row');
  assert.ok(chatCss.includes('.chat-mini-file-chip'), 'CSS must define .chat-mini-file-chip');
  assert.ok(chatCss.includes('.chat-mini-send-action-btn'), 'CSS must define .chat-mini-send-action-btn');
});

test('Visual and Functional test: Chat mini window drag, attachments, auto-expand, and send', async () => {
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
    window.authUser = { id: 999, login: 'me', name: 'Current User', role: 'USER' };
    window.lucide = { createIcons: () => {} };

    class MockWebSocket {
      static OPEN = 1;
      constructor(url) {
        this.url = url;
        this.readyState = 1;
        window.__chatWs = this;
        window.__wsRequests = [];
      }
      send(data) {
        const parsed = JSON.parse(data);
        window.__wsRequests.push(parsed);
        if (parsed.action === 'send') {
          setTimeout(() => {
            this.onmessage?.({
              data: JSON.stringify({
                type: 'response',
                requestId: parsed.requestId,
                result: {
                  message: {
                    id: Math.floor(Math.random() * 10000),
                    roomId: parsed.body.roomId,
                    senderId: '999',
                    sender: 'Current User',
                    category: parsed.body.category || 'personal',
                    text: parsed.body.text,
                    createdMs: Date.now()
                  }
                }
              })
            });
          }, 10);
        }
      }
      close() {}
    }
    window.WebSocket = MockWebSocket;
    ${chatJs}
  </script>
</body>
</html>`;

      await page.setContent(html);

      // Open mini window
      await page.evaluate(() => {
        const mini = document.getElementById('chatMiniWindow');
        mini.hidden = false;
        mini.style.left = '100px';
        mini.style.top = '100px';
      });

      // 1. Verify dragging
      const miniHeadBox = await page.locator('.chat-mini-head').boundingBox();
      assert.ok(miniHeadBox, 'Mini window head must exist');

      await page.mouse.move(miniHeadBox.x + 100, miniHeadBox.y + 10);
      await page.mouse.down();
      await page.mouse.move(miniHeadBox.x + 150, miniHeadBox.y + 60, { steps: 5 });
      await page.mouse.up();

      const newMiniBox = await page.locator('#chatMiniWindow').boundingBox();
      assert.ok(newMiniBox.x > 100, 'Mini window x must increase after dragging');
      assert.ok(newMiniBox.y > 100, 'Mini window y must increase after dragging');

      // 2. Verify auto-expand of textarea and window downward growth
      const initialHeight = newMiniBox.height;
      const textarea = page.locator('#miniInput');
      await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
      await textarea.dispatchEvent('input');

      await page.waitForTimeout(200);
      const expandedBox = await page.locator('#chatMiniWindow').boundingBox();
      assert.ok(
        expandedBox.height > initialHeight,
        `Window height must grow downwards upon multiline input (${expandedBox.height} > ${initialHeight})`
      );

      // 3. Verify send on Enter (without Shift)
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      const valAfterSend = await textarea.inputValue();
      assert.equal(valAfterSend, '', 'Textarea must be cleared after sending');

      const resetBox = await page.locator('#chatMiniWindow').boundingBox();
      assert.ok(
        resetBox.height <= initialHeight + 2,
        `Window height must reset back to standard height after send (${resetBox.height} <= ${initialHeight})`
      );

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
