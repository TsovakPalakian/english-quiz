import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

const chatCss = readFileSync(new URL('../production/chat.css', import.meta.url), 'utf8');
const chatJs = readFileSync(new URL('../production/chat.js', import.meta.url), 'utf8');

test('Chat reaction picker: unified theme format, no search bar, vertical scroll without horizontal overflow', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });

    const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <style>
        :root {
          --card: #ffffff;
          --ink: #172f2d;
          --line: #e2e8f0;
          --acc: #167a72;
          --acc-s: #e6f4f2;
          --mute: #64748b;
          --bg: #f8fafc;
        }
        ${chatCss}
      </style>
    </head>
    <body>
      <div id="messages" class="on">
        <div id="msgTimeline" class="chat-timeline">
          <article class="msg-message is-own" data-msg-id="101" style="margin: 40px; padding: 12px; background: #ffffff;">
            <div class="chat-message-text">Hello reactions test!</div>
          </article>
        </div>
        <div id="msgContext" class="chat-context" role="menu" hidden></div>
        <div id="msgStatus" class="chat-status" hidden></div>
      </div>
      <script>
        window.__reactions = [];
        const request = async (action, payload) => {
          if (action === 'react') {
            window.__reactions.push(payload);
            return { ok: true };
          }
          return {};
        };
        const el = (id) => document.getElementById(id);
        const escape = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const myAccountId = () => 'test-user-1';
        let contextMessage = null;
        let contextRoom = 'test-room';
        const room = 'test-room';
        const data = { rooms: [{ id: 'test-room', pins: [] }] };
        const timeline = document.getElementById('msgTimeline');
        const icons = () => {};
        const icon = (name) => '<svg data-icon="' + name + '"></svg>';
        const isOwnMessage = () => true;
        const canEdit = () => true;
        const closeEmoji = () => {};
        const closeContext = () => {
          el('msgContext').hidden = true;
          el('msgContext').classList.remove('is-expanded-reactions');
        };
        const status = () => {};

        ${chatJs.includes('function renderExpandedReactionPicker')
          ? chatJs.slice(
              chatJs.indexOf('const defaultReactions ='),
              chatJs.indexOf('function messageMenu(')
            )
          : ''
        }

        const defaultReactionsList = ['😄', '👍', '❤️', '😆', '🤯', '🤝', '🤨'];
        function getUserFrequentReactions() {
          return defaultReactionsList;
        }

        function renderExpandedReactions(message, id) {
          contextMessage = message;
          contextRoom = id;
          const node = el('msgContext');
          node.hidden = false;
          node.style.left = '100px';
          node.style.top = '100px';
          renderExpandedReactionPicker(node, message, id);
        }

        window.renderExpandedReactions = renderExpandedReactions;

        el('msgContext').onclick = async (event) => {
          const target = event.target.closest('[data-context-reaction]');
          if (!target || !contextMessage) return;
          const emoji = target.dataset.contextReaction;
          await request('react', { roomId: contextRoom, id: contextMessage.id, emoji });
          closeContext();
        };
      </script>
    </body>
    </html>`;

    await page.setContent(html);

    // 1. Open the expanded reaction picker
    await page.evaluate(() => {
      window.renderExpandedReactions({ id: 101, text: 'Hello reactions test!' }, 'test-room');
    });

    const contextMenu = page.locator('#msgContext');
    await assert.doesNotReject(async () => await contextMenu.waitFor({ state: 'visible' }));

    // 2. Verify .is-expanded-reactions is applied to #msgContext
    const hasExpandedClass = await contextMenu.evaluate((el) => el.classList.contains('is-expanded-reactions'));
    assert.ok(hasExpandedClass, '#msgContext must have .is-expanded-reactions class');

    // 3. Verify .chat-reaction-search-bar is REMOVED
    const searchBarCount = await page.locator('.chat-reaction-search-bar').count();
    assert.equal(searchBarCount, 0, 'Search bar must not be rendered in the reaction picker');

    // 4. Verify vertical and horizontal overflow properties
    const overflowProps = await contextMenu.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        maxHeight: style.maxHeight,
        background: style.backgroundColor
      };
    });

    assert.equal(overflowProps.overflowX, 'hidden', 'Horizontal overflow must be hidden');
    assert.equal(overflowProps.overflowY, 'auto', 'Vertical overflow must be auto');
    assert.ok(
      overflowProps.scrollWidth <= overflowProps.clientWidth,
      `No horizontal scrolling: scrollWidth (${overflowProps.scrollWidth}) must be <= clientWidth (${overflowProps.clientWidth})`
    );

    // Verify vertical scrolling when constrained
    const canScrollDown = await contextMenu.evaluate((el) => {
      const prevMax = el.style.maxHeight;
      el.style.maxHeight = '200px';
      const scrolls = el.scrollHeight > el.clientHeight;
      el.style.maxHeight = prevMax;
      return scrolls;
    });
    assert.ok(canScrollDown, 'Reactions menu scrolls vertically downwards when constrained by height');

    // 5. Verify unified theme styles: transparent/card background, no hardcoded #17212b
    const pickerBg = await page.locator('.chat-reaction-picker').evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    assert.notEqual(pickerBg, 'rgb(23, 33, 43)', '.chat-reaction-picker must not have dark #17212b background');

    // 6. Verify clicking a reaction in the popular section triggers react action and closes menu
    const firstPopularReaction = page.locator('.chat-reaction-popular button').first();
    const emojiText = await firstPopularReaction.getAttribute('data-context-reaction');
    assert.ok(emojiText, 'Popular button has emoji data attribute');
    await firstPopularReaction.click();

    const isHiddenAfterClick = await contextMenu.evaluate((el) => el.hidden);
    assert.ok(isHiddenAfterClick, 'Context menu must be closed after reaction is selected');

    const reactionPayload = await page.evaluate(() => window.__reactions);
    assert.equal(reactionPayload.length, 1);
    assert.equal(reactionPayload[0].emoji, emojiText);
    assert.equal(reactionPayload[0].id, 101);

  } finally {
    await browser.close();
  }
});
