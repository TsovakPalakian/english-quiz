import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const rootDir = process.cwd();

test('Mini Chat: Isolated multi-color text formatting, single field integrity, and theme fidelity', async () => {
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
        mini.style.left = '80px';
        mini.style.top = '80px';
        mini.style.width = '380px';
        mini.style.height = '520px';
      });

      await page.waitForTimeout(100);

      // 1. Verify single input field integrity: miniRich is created, miniInput is initially present
      const initialInputBox = await page.locator('#miniInput').boundingBox();
      assert.ok(initialInputBox, 'miniInput must initially be rendered');

      // 2. Type text in mini chat input
      await page.evaluate(() => {
        const input = document.getElementById('miniInput');
        input.value = 'hello beautiful world';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // 3. Select word 'beautiful' (offset 6 to 15) and apply cyan color
      await page.evaluate(() => {
        const input = document.getElementById('miniInput');
        input.selectionStart = 6;
        input.selectionEnd = 15;

        const colorInput = document.getElementById('miniColorInput');
        const colorInd = document.getElementById('miniColorIndicator');
        colorInd.click();

        colorInput.value = '#0284c7';
        colorInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await page.waitForTimeout(50);

      // Verify that miniRich is now visible and miniInput is hidden (STRICTLY ONE FIELD VISIBLE)
      const isInputHidden = await page.locator('#miniInput').evaluate((el) => {
        const style = window.getComputedStyle(el);
        return el.hidden || style.display === 'none';
      });
      assert.ok(isInputHidden, 'Original miniInput textarea must be strictly hidden when rich editor is active');

      const isRichVisible = await page.locator('.chat-mini-composer .text-color-rich').evaluate((el) => {
        const style = window.getComputedStyle(el);
        return !el.hidden && style.display !== 'none';
      });
      assert.ok(isRichVisible, 'Rich editor div must be visible in mini composer');

      // 4. Select word 'world' (offset 16 to 21) and apply red color
      await page.evaluate(() => {
        const rich = document.querySelector('.chat-mini-composer .text-color-rich');
        // Select 'world' in rich
        const walker = document.createTreeWalker(rich, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) nodes.push(node);
        const sel = window.getSelection();
        const range = document.createRange();
        // find node containing 'world'
        for (const n of nodes) {
          const idx = n.textContent.indexOf('world');
          if (idx !== -1) {
            range.setStart(n, idx);
            range.setEnd(n, idx + 5);
            break;
          }
        }
        sel.removeAllRanges();
        sel.addRange(range);

        // Click indicator and apply red color
        const colorInput = document.getElementById('miniColorInput');
        const colorInd = document.getElementById('miniColorIndicator');
        colorInd.click();

        colorInput.value = '#e11d48';
        colorInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await page.waitForTimeout(50);

      // Verify indicator background is red
      const indicatorBg = await page.locator('#miniColorIndicator').evaluate((el) => el.style.background);
      assert.ok(indicatorBg.includes('225') || indicatorBg.includes('e11d48'), 'miniColorIndicator must display active selected color');

      // 5. Verify multi-color formatting in rich editor
      const richHtml = await page.locator('.chat-mini-composer .text-color-rich').innerHTML();
      assert.ok(richHtml.includes('0284c7') || richHtml.includes('2, 132, 199'), 'Rich editor must contain cyan color formatting');
      assert.ok(richHtml.includes('e11d48') || richHtml.includes('225, 29, 72'), 'Rich editor must contain red color formatting');

      // 6. Verify main chat composer is completely untouched (Scope isolation)
      const mainComposerStyle = await page.locator('#msgText').evaluate((el) => el.style.color);
      assert.equal(mainComposerStyle, '', 'Main chat composer must remain completely unmutated');

      // 7. Verify submission of multi-color message
      let capturedFormat = null;
      await page.evaluate(() => {
        window.__capturedFormat = null;
        const origSend = window.send;
        // Submit mini composer form
        const form = document.getElementById('miniComposer');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      await page.waitForTimeout(50);

      // After send: rich editor is reset and hidden, strictly ONE field with placeholder is visible
      const afterSendInputVisible = await page.locator('#miniInput').evaluate((el) => {
        const style = window.getComputedStyle(el);
        return !el.hidden && style.display !== 'none';
      });
      assert.ok(afterSendInputVisible, 'miniInput must be visible and ready for new message after send');

      const afterSendRichHidden = await page.locator('.chat-mini-composer .text-color-rich').evaluate((el) => {
        const style = window.getComputedStyle(el);
        return el.hidden || style.display === 'none';
      });
      assert.ok(afterSendRichHidden, 'Rich editor must be hidden after send');

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
