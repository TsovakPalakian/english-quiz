import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const rootDir = process.cwd();

test('Visual & Isolation: Round palette button in mini & main chat, compact 6px spacing, and multi-color words', async () => {
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

      // Open mini window
      await page.evaluate(() => {
        const mini = document.getElementById('chatMiniWindow');
        mini.hidden = false;
        mini.style.left = '60px';
        mini.style.top = '60px';
        mini.style.width = '360px';
        mini.style.height = '480px';
      });

      await page.waitForTimeout(100);

      // 1. Verify mini chat toolbar compactness and round palette button
      const attachBox = await page.locator('#miniAttach').boundingBox();
      const emojiBox = await page.locator('#miniEmoji').boundingBox();
      const stickerBox = await page.locator('#miniStickers').boundingBox();
      const colorBox = await page.locator('#miniColorIndicator').boundingBox();

      assert.ok(attachBox && emojiBox && stickerBox && colorBox, 'All 4 tool buttons must be rendered and visible');

      // Check circular dimensions (24px)
      assert.equal(Math.round(colorBox.width), 24, 'miniColorIndicator width must be 24px');
      assert.equal(Math.round(colorBox.height), 24, 'miniColorIndicator height must be 24px');

      // Check tight grouping: distance between adjacent button edges should be ~6px (gap: 6px)
      const gap1 = emojiBox.x - (attachBox.x + attachBox.width);
      const gap2 = stickerBox.x - (emojiBox.x + emojiBox.width);
      const gap3 = colorBox.x - (stickerBox.x + stickerBox.width);

      assert.ok(Math.abs(gap1 - 6) <= 2, `Gap between attach and emoji must be ~6px, got ${gap1}`);
      assert.ok(Math.abs(gap2 - 6) <= 2, `Gap between emoji and stickers must be ~6px, got ${gap2}`);
      assert.ok(Math.abs(gap3 - 6) <= 4, `Gap between stickers and color must be ~6px, got ${gap3}`);

      // 2. Verify no sagging below the bottom toolbar
      const toolsRowBox = await page.locator('.chat-mini-tools-row').boundingBox();
      assert.ok(colorBox.y + colorBox.height <= toolsRowBox.y + toolsRowBox.height + 6, 'Color indicator must not sag below the tools row');

      // 3. Verify color selection on mini chat circle
      await page.evaluate(() => {
        const input = document.getElementById('miniColorInput');
        input.value = '#e11d48'; // red
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await page.waitForTimeout(50);
      const updatedBg = await page.locator('#miniColorIndicator').evaluate((el) => el.style.background);
      assert.ok(updatedBg.includes('225') || updatedBg.includes('e11d48'), 'miniColorIndicator background must turn red');

      // Verify main chat composer is completely untouched (scope isolation)
      const mainComposerStyle = await page.locator('#msgText').evaluate((el) => el.style.color);
      assert.equal(mainComposerStyle, '', 'Main chat composer must remain completely unmutated by mini chat color changes');

      // 4. Verify main chat color tools: round 24px circle with data-full-color-picker
      const mainColorInput = page.locator('#messages .text-color-tools input[type=color]');
      const mainBox = await mainColorInput.boundingBox();
      if (mainBox) {
        assert.equal(Math.round(mainBox.width), 24, 'Main chat color input width must be 24px');
        assert.equal(Math.round(mainBox.height), 24, 'Main chat color input height must be 24px');
      }

      // 5. Test multi-color formatted text runs rendering in timeline
      await page.evaluate(() => {
        const tl = document.getElementById('msgTimeline');
        const multiColorMsg = document.createElement('article');
        multiColorMsg.className = 'msg-message is-own';
        multiColorMsg.dataset.content = JSON.stringify([
          301,
          'афываф афывафыв вафывафыв',
          {
            runs: [
              { text: 'афываф ', marks: {} },
              { text: 'афывафыв ', marks: { color: '#00ffff' } },
              { text: 'вафывафыв', marks: { color: '#e11d48' } }
            ]
          },
          [],
          null, null, null, null, 'Tsovak Palakian', '999', 1700000030000
        ]);
        multiColorMsg.innerHTML = `
          <header><strong>Tsovak Palakian</strong></header>
          <p class="chat-message-text">
            <span>афываф </span><span style="color:#00ffff">афывафыв </span><span style="color:#e11d48">вафывафыв</span>
          </p>
          <div class="chat-message-foot"><time>07:00</time></div>
        `;
        tl.append(multiColorMsg);
      });

      await page.waitForTimeout(100);

      // Verify both colored spans are rendered in mini timeline
      const miniSpans = await page.locator('#miniTimeline .chat-mini-msg-text span[style*="color"]').count();
      assert.equal(miniSpans, 2, 'Mini timeline must preserve distinct multi-color spans in message text');

      // Take visual snapshot for artifact
      await page.screenshot({ path: `docs/task-palette-restored-mini-${theme}.png` });

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
