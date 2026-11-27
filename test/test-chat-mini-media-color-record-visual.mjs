import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const rootDir = process.cwd();

test('Unit & Contract: Mini chat media lightbox, color picker, and recording elements', () => {
  const chatHtml = fs.readFileSync(path.join(rootDir, 'production/chat.html'), 'utf8');
  const chatCss = fs.readFileSync(path.join(rootDir, 'production/chat.css'), 'utf8');
  const chatJs = fs.readFileSync(path.join(rootDir, 'production/chat.js'), 'utf8');

  // Verify elements in HTML
  assert.ok(chatHtml.includes('id="miniRecordFrame"'), 'HTML must declare #miniRecordFrame');
  assert.ok(chatHtml.includes('id="miniRecordPreview"'), 'HTML must declare #miniRecordPreview');
  assert.ok(chatHtml.includes('id="miniRecordStatus"'), 'HTML must declare #miniRecordStatus');
  assert.ok(chatHtml.includes('id="miniCancelRecord"'), 'HTML must declare #miniCancelRecord');
  assert.ok(chatHtml.includes('id="miniSendRecord"'), 'HTML must declare #miniSendRecord');

  // Verify CSS rules
  assert.ok(chatCss.includes('.chat-photo-preview'), 'CSS must define .chat-photo-preview');
  assert.ok(chatCss.includes('.chat-mini-record-frame'), 'CSS must define .chat-mini-record-frame');
  assert.ok(chatCss.includes('.chat-mini-round-video'), 'CSS must define .chat-mini-round-video');
  assert.ok(chatCss.includes('.chat-mini-record-status'), 'CSS must define .chat-mini-record-status');
  assert.ok(chatCss.includes('.chat-mini-record-pulse'), 'CSS must define .chat-mini-record-pulse');

  // Verify JS logic in bundle
  assert.ok(chatJs.includes('openPhotoPreview'), 'Chat bundle must contain openPhotoPreview');
  assert.ok(chatJs.includes('miniActiveColor'), 'Chat bundle must track miniActiveColor');
  assert.ok(chatJs.includes('miniRecordStatus'), 'Chat bundle must update miniRecordStatus');
  assert.ok(chatJs.includes('miniActive'), 'Chat bundle must define miniActive check');
});

test('Functional & Visual: Lightbox preview, text color formatting, and recording controls in mini chat', async () => {
  const previewCss = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const chatCss = fs.readFileSync(path.join(rootDir, 'production/chat.css'), 'utf8');
  const chatHtml = fs.readFileSync(path.join(rootDir, 'production/chat.html'), 'utf8');
  const chatJs = fs.readFileSync(path.join(rootDir, 'production/chat.js'), 'utf8');
  const textColorsJs = fs.readFileSync(path.join(rootDir, 'client/shared/text-colors.js'), 'utf8');

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
    ${textColorsJs}
    ${chatJs}
  </script>
</body>
</html>`;

      await page.setContent(html);

      // 1. Open mini chat window and inject an image message into timeline
      await page.evaluate(() => {
        const mini = document.getElementById('chatMiniWindow');
        mini.hidden = false;
        mini.style.left = '60px';
        mini.style.top = '60px';

        const tl = document.getElementById('msgTimeline');
        tl.innerHTML = `
          <article class="msg-message is-own" data-content='[201,"Look at this photo",null,[{"id":"img1","name":"photo.png","size":102400,"mime":"image/png","url":"docs/task-media-preview-sky.png"}],null,null,null,null,"Tsovak Palakian","999",1700000000000]'>
            <header><strong>Tsovak Palakian</strong></header>
            <p class="chat-message-text">Look at this photo</p>
            <div class="chat-file" data-file-id="img1">
              <button type="button" class="chat-file" data-photo-preview="docs/task-media-preview-sky.png" aria-label="photo.png">
                <img src="docs/task-media-preview-sky.png" alt="photo.png">
              </button>
            </div>
            <div class="chat-message-foot"><time>05:50</time></div>
          </article>
        `;
      });

      await page.waitForTimeout(100);

      // Verify that miniTimeline contains the button with data-photo-preview
      const imgButton = page.locator('#miniTimeline [data-photo-preview]');
      assert.ok(await imgButton.count() > 0, 'Image preview button with data-photo-preview must be present in mini timeline');

      // Click image preview button in mini timeline to open lightbox
      await imgButton.first().click();
      await page.waitForTimeout(100);

      const lightbox = page.locator('#chatPhotoPreview');
      assert.ok(await lightbox.isVisible(), 'Clicking image preview button must open #chatPhotoPreview lightbox modal');
      assert.ok(await page.locator('#chatPhotoPreview img').isVisible(), 'Lightbox must display image');

      // Click close button to dismiss lightbox
      const closeBtn = page.locator('#chatPhotoPreview .chat-photo-preview-close');
      await closeBtn.click();
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#chatPhotoPreview').count(), 0, 'Clicking close button must remove #chatPhotoPreview modal');

      // 2. Test Color Selection & Formatted Text Rendering
      await page.evaluate(() => {
        const colorInput = document.getElementById('miniColorInput');
        colorInput.value = '#e05252';
        colorInput.dispatchEvent(new Event('input', { bubbles: true }));

        const miniInput = document.getElementById('miniInput');
        miniInput.value = 'Important colored message';

        // Add mock message with color formatting directly to timeline to verify rendering in miniTimeline
        const tl = document.getElementById('msgTimeline');
        const formattedMsg = document.createElement('article');
        formattedMsg.className = 'msg-message is-own';
        formattedMsg.dataset.content = JSON.stringify([
          202,
          'Important colored message',
          { runs: [{ text: 'Important colored message', marks: { color: '#e05252' } }] },
          [],
          null, null, null, null, 'Tsovak Palakian', '999', 1700000020000
        ]);
        formattedMsg.innerHTML = `
          <header><strong>Tsovak Palakian</strong></header>
          <p class="chat-message-text"><span style="color:#e05252">Important colored message</span></p>
          <div class="chat-message-foot"><time>05:52</time></div>
        `;
        tl.append(formattedMsg);
      });

      await page.waitForTimeout(100);

      // Verify color indicator style updated
      const indicatorBg = await page.locator('#miniColorIndicator').evaluate((el) => el.style.background);
      assert.ok(indicatorBg.includes('224') || indicatorBg.includes('e05252'), 'Color indicator background must match selected color');

      // Verify miniInput style updated
      const inputColor = await page.locator('#miniInput').evaluate((el) => el.style.color);
      assert.ok(inputColor.includes('224') || inputColor.includes('e05252'), 'Mini input text color must match selected color');

      // Verify colored span is rendered in mini timeline bubble
      const coloredSpanCount = await page.locator('#miniTimeline .chat-mini-msg-text span[style*="color"]').count();
      assert.ok(coloredSpanCount > 0, 'Mini timeline must render colored <span> tags within message bubble');

      // 3. Test Recording UI in mini window
      await page.evaluate(() => {
        const frame = document.getElementById('miniRecordFrame');
        const status = document.getElementById('miniRecordStatus');
        const text = document.getElementById('miniRecordText');
        frame.hidden = false;
        status.hidden = false;
        text.textContent = 'Recording video · 00:03,5';
      });

      await page.waitForTimeout(50);
      assert.ok(await page.locator('#miniRecordFrame').isVisible(), '#miniRecordFrame must be visible during video recording');
      assert.ok(await page.locator('#miniRecordStatus').isVisible(), '#miniRecordStatus must be visible during recording');
      assert.ok((await page.locator('#miniRecordText').innerText()).includes('00:03'), 'Status text must show recording duration');

      // Click Cancel on mini recording
      await page.locator('#miniCancelRecord').click();
      await page.waitForTimeout(50);
      assert.equal(await page.locator('#miniRecordFrame').isVisible(), false, '#miniRecordFrame must hide when recording is cancelled');
      assert.equal(await page.locator('#miniRecordStatus').isVisible(), false, '#miniRecordStatus must hide when recording is cancelled');

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
