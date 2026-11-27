import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const rootDir = process.cwd();

test('Unit & Contract: Mini chat audio card, round video sound toggle, and text color contracts', () => {
  const chatCss = fs.readFileSync(path.join(rootDir, 'production/chat.css'), 'utf8');
  const chatJs = fs.readFileSync(path.join(rootDir, 'production/chat.js'), 'utf8');
  const textColorsJs = fs.readFileSync(path.join(rootDir, 'client/shared/text-colors.js'), 'utf8');

  // Verify CSS rules
  assert.ok(chatCss.includes('.chat-mini-audio-card'), 'CSS must define .chat-mini-audio-card');
  assert.ok(chatCss.includes('.chat-mini-audio-play'), 'CSS must define .chat-mini-audio-play');
  assert.ok(chatCss.includes('.chat-mini-round-video-bubble .chat-round-sound'), 'CSS must define video sound button in bubble');
  const miniTextareaRule = chatCss.match(/\.chat-mini-textarea\{[^}]+\}/)?.[0] || '';
  assert.ok(!miniTextareaRule.includes('color:var(--ink)!important'), 'CSS must not override mini textarea color with !important');

  // Verify JS logic in production/chat.js
  assert.ok(chatJs.includes('watchMiniAudio'), 'chat.js must define watchMiniAudio');
  assert.ok(chatJs.includes('watchMiniRoundVideos'), 'chat.js must define watchMiniRoundVideos');
  assert.ok(chatJs.includes('data-mini-audio-play'), 'chat.js must render data-mini-audio-play');
  assert.ok(chatJs.includes('data-mini-round-sound'), 'chat.js must render data-mini-round-sound');

  // Verify client/shared/text-colors.js scope isolation: does not set blanket container color
  assert.ok(!textColorsJs.includes('field.style.color=color;'), 'text-colors.js must not force blanket field.style.color on palette change');
  assert.ok(textColorsJs.includes("document.execCommand('foreColor',false,color)"), 'text-colors.js must apply color via foreColor to formatted text');
});

test('Functional & Visual: Mini audio player, round video sound toggle, and color sync in themes', async () => {
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

      // Open mini window and populate mock audio and video messages
      await page.evaluate(() => {
        const mini = document.getElementById('chatMiniWindow');
        mini.hidden = false;
        mini.style.left = '60px';
        mini.style.top = '60px';

        const tl = document.getElementById('msgTimeline');
        tl.innerHTML = `
          <article class="msg-message is-own" data-content='[101,"",null,[{"id":"a1","name":"voice-1.webm","size":40960,"mime":"audio/webm","url":"/api/messages/file?id=a1"}],null,null,null,null,"Tsovak Palakian","999",1700000000000]'>
            <header><strong>Tsovak Palakian</strong></header>
            <div class="chat-file chat-audio" data-file-id="a1"><audio src="/audio-test.webm"></audio></div>
            <div class="chat-message-foot"><time>06:51</time></div>
          </article>
          <article class="msg-message is-own" data-content='[102,"",null,[{"id":"v1","name":"video-1.webm","size":204800,"mime":"video/webm","url":"/api/messages/file?id=v1"}],null,null,null,null,"Tsovak Palakian","999",1700000010000]'>
            <header><strong>Tsovak Palakian</strong></header>
            <div class="chat-file chat-round-video" data-file-id="v1"><video src="/video-test.webm"></video></div>
            <div class="chat-message-foot"><time>06:52</time></div>
          </article>
        `;
      });

      await page.waitForTimeout(100);

      // 1. Verify audio card is rendered in mini timeline (not empty bubble)
      const audioCardCount = await page.locator('#miniTimeline .chat-mini-audio-card').count();
      assert.equal(audioCardCount, 1, 'Audio message must render .chat-mini-audio-card in mini timeline');

      const playBtn = page.locator('#miniTimeline [data-mini-audio-play]');
      assert.equal(await playBtn.count(), 1, 'Audio card must contain play button');
      assert.equal(await playBtn.getAttribute('aria-label'), 'Play audio');

      // 2. Verify round video bubble has sound toggle button
      const videoBubbleCount = await page.locator('#miniTimeline .chat-mini-round-video-bubble').count();
      assert.equal(videoBubbleCount, 1, 'Round video must render .chat-mini-round-video-bubble');

      const soundBtn = page.locator('#miniTimeline [data-mini-round-sound]');
      assert.equal(await soundBtn.count(), 1, 'Round video must have [data-mini-round-sound] button');
      assert.equal(await soundBtn.getAttribute('aria-label'), 'Enable sound');

      // Click sound button and verify state toggle
      await soundBtn.click();
      assert.equal(await soundBtn.getAttribute('aria-label'), 'Mute', 'Clicking sound button must toggle label to Mute');
      assert.equal(await soundBtn.getAttribute('aria-pressed'), 'true', 'aria-pressed must be true when unmuted');

      // Click again to mute
      await soundBtn.click();
      assert.equal(await soundBtn.getAttribute('aria-label'), 'Enable sound', 'Clicking sound button again must toggle label back to Enable sound');

      // 3. Verify palette color updates input text color
      const miniColorInput = page.locator('#miniColorInput');
      await miniColorInput.evaluate((el) => {
        el.value = '#e05252';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const inputStyleColor = await page.locator('#miniInput').evaluate((el) => el.style.color);
      assert.ok(inputStyleColor.includes('224') || inputStyleColor.includes('#e05252'), 'Typed text style in miniInput must be #e05252');

      const indicatorBg = await page.locator('#miniColorIndicator').evaluate((el) => el.style.background);
      assert.ok(indicatorBg.includes('224') || indicatorBg.includes('#e05252'), 'miniColorIndicator background must reflect chosen color');

      const mainComposerColor = await page.locator('#msgText').evaluate((el) => el.style.color);
      assert.equal(mainComposerColor, '', 'Main chat composer must NOT be mutated when mini chat color changes');

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
