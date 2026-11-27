import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const rootDir = process.cwd();

test('Unit & Contract: Mini chat bubble parsing, file attachments, and toolbar elements', () => {
  const chatHtml = fs.readFileSync(path.join(rootDir, 'production/chat.html'), 'utf8');
  const chatCss = fs.readFileSync(path.join(rootDir, 'production/chat.css'), 'utf8');
  const chatJs = fs.readFileSync(path.join(rootDir, 'production/chat.js'), 'utf8');

  // Verify elements in HTML
  assert.ok(chatHtml.includes('id="miniEmojiPicker"'), 'HTML must declare #miniEmojiPicker');
  assert.ok(chatHtml.includes('id="miniColorInput"'), 'HTML must declare #miniColorInput');
  assert.ok(chatHtml.includes('id="miniEmojiGrid"'), 'HTML must declare #miniEmojiGrid');

  // Verify CSS rules
  assert.ok(chatCss.includes('.chat-mini-file-card'), 'CSS must define .chat-mini-file-card');
  assert.ok(chatCss.includes('.chat-mini-image-preview'), 'CSS must define .chat-mini-image-preview');
  assert.ok(chatCss.includes('.chat-mini-emoji-picker'), 'CSS must define .chat-mini-emoji-picker');

  // Verify JS logic in bundle
  assert.ok(chatJs.includes('chat-mini-file-card'), 'Chat bundle must render .chat-mini-file-card');
  assert.ok(chatJs.includes('toggleMiniEmoji'), 'Chat bundle must define toggleMiniEmoji');
});

test('Functional & Visual: Mini chat bubble separation, file rendering, and audio/video switch', async () => {
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

      // Open mini window and populate mock messages in main timeline
      await page.evaluate(() => {
        const mini = document.getElementById('chatMiniWindow');
        mini.hidden = false;
        mini.style.left = '80px';
        mini.style.top = '80px';

        const tl = document.getElementById('msgTimeline');
        tl.innerHTML = `
          <article class="msg-message is-own" data-content='[101,"xxcxc",null,[],null,null,null,null,"Tsovak Palakian","999",1700000000000]'>
            <header><strong>Tsovak Palakian</strong></header>
            <p class="chat-message-text">xxcxc</p>
            <div class="chat-message-foot"><time>04:29</time></div>
          </article>
          <article class="msg-message" data-content='[102,"",null,[{"id":"f1","name":"document.pdf","size":204800,"mime":"application/pdf","url":"/api/messages/file?id=f1"}],null,null,null,null,"Student 1","888",1700000010000]'>
            <header><strong>Student 1</strong></header>
            <p class="chat-message-text"></p>
            <div class="chat-file" data-file-id="f1"><a href="#">document.pdf (200 KB)</a></div>
            <div class="chat-message-foot"><time>04:30</time></div>
          </article>
        `;
      });

      // 1. Verify clean bubble text separation in mini timeline
      await page.waitForTimeout(100);
      const ownBubbleText = await page.locator('.chat-mini-msg-row.own .chat-mini-msg-bubble').innerText();
      assert.equal(ownBubbleText.trim(), 'xxcxc', 'Own message bubble must contain ONLY message text, without sender name or time');
      
      const ownTimeText = await page.locator('.chat-mini-msg-row.own .chat-mini-msg-time').innerText();
      assert.equal(ownTimeText.trim(), '04:29', 'Time must be separate below the bubble');

      // 2. Verify file attachment rendering for message without text
      const fileCardExists = await page.locator('.chat-mini-file-card').count();
      assert.ok(fileCardExists > 0, 'Attachment card must be rendered in mini timeline for file message');
      const fileName = await page.locator('.chat-mini-file-name').innerText();
      assert.ok(fileName.includes('document.pdf'), 'Attachment card must display file name');

      // 3. Verify audio to video toggle on #miniMic click
      const micBtn = page.locator('#miniMic');
      const initialTitle = await micBtn.getAttribute('title');
      assert.ok(initialTitle.includes('video'), 'Mic button initial title must prompt to switch to video');

      // Click mic button to toggle to video
      await micBtn.dispatchEvent('pointerdown', { pointerId: 1, button: 0 });
      await micBtn.dispatchEvent('pointerup', { pointerId: 1, button: 0 });
      await page.waitForTimeout(50);

      const toggledTitle = await micBtn.getAttribute('title');
      assert.ok(toggledTitle.includes('voice'), 'After click, title must switch to prompt switching back to voice');
      const modeAttr = await micBtn.getAttribute('data-record-mode');
      assert.equal(modeAttr, 'video', 'data-record-mode must switch to video');

      // Click again to toggle back to audio
      await micBtn.dispatchEvent('pointerdown', { pointerId: 2, button: 0 });
      await micBtn.dispatchEvent('pointerup', { pointerId: 2, button: 0 });
      await page.waitForTimeout(50);
      assert.equal(await micBtn.getAttribute('data-record-mode'), 'audio', 'data-record-mode must switch back to audio');

      // 4. Verify Emoji Picker toggle and insertion
      const emojiBtn = page.locator('#miniEmoji');
      await emojiBtn.click();
      await page.waitForTimeout(50);
      const isPickerVisible = await page.locator('#miniEmojiPicker').isVisible();
      assert.ok(isPickerVisible, '#miniEmojiPicker must be visible after clicking #miniEmoji');

      // Click first emoji button
      const firstEmBtn = page.locator('#miniEmojiGrid button').first();
      const emChar = await firstEmBtn.innerText();
      await firstEmBtn.click();
      await page.waitForTimeout(50);

      const inputValue = await page.locator('#miniInput').inputValue();
      assert.equal(inputValue, emChar, 'Clicked emoji must be inserted into #miniInput');
      assert.equal(await page.locator('#miniEmojiPicker').isVisible(), false, 'Picker must close after emoji insertion');

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
