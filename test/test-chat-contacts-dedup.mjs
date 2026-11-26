import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Unit & Visual verification: Chat contacts and groups deduplication with mixed string and number IDs', async () => {
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
        value: () => 'test-uuid-' + Math.random().toString(36).slice(2)
      });
    }
    window.authUser = { id: 1, login: 'me', name: 'Tsovak Palakian', role: 'ADMIN' };
    window.lucide = { createIcons: () => {} };

    class MockWebSocket {
      static OPEN = 1;
      constructor(url) {
        this.url = url;
        this.readyState = 1;
        window.__chatWs = this;
      }
      send(raw) {
        const parsed = JSON.parse(raw);
        setTimeout(() => {
          this.onmessage({
            data: JSON.stringify({
              type: 'response',
              requestId: parsed.requestId,
              result: {}
            })
          });
        }, 10);
      }
      close() {}
    }
    window.WebSocket = MockWebSocket;
  </script>
  <script>${chatJs}</script>
</body>
</html>`;

      await page.setContent(html);

      // Supply test snapshot with string peerIds in rooms, integer ids in contacts, and duplicate group entries
      await page.evaluate(() => {
        document.getElementById('messages').classList.add('on');

        const student1 = { id: 11, name: 'Student 1', role: 'Student', login: 'student_11' };
        const support = { id: 2, name: 'Support', role: 'Support', login: 'tsovak_palakian' };
        const teacherTsovak = { id: 3, name: 'Tsovak Palakian', role: 'Teacher', login: 'teacher_tsovak' };
        const studentTsovak = { id: 4, name: 'Tsovak Palakian', role: 'Student', login: 'student_tsovak' };

        const testSnapshot = {
          rooms: [
            { id: 'direct:11:1', title: 'Student 1', peerId: '11', peerRole: 'Student', kind: 'direct', access: { protected: true, state: 'accepted', canSend: true }, unread: { personal: 0, learning: 0 }, has: { personal: true } },
            { id: 'direct:3:1', title: 'Tsovak Palakian', peerId: '3', peerRole: 'Teacher', kind: 'direct', access: { protected: true, state: 'accepted', canSend: true }, unread: { personal: 0, learning: 0 }, has: { personal: true } },
            { id: 'group:1', title: 'B1 Group', kind: 'group', groupId: 1, access: { protected: true, state: 'accepted', canSend: true }, unread: { personal: 0, learning: 0 }, has: { personal: true } }
          ],
          folders: [],
          contacts: [
            student1,
            support,
            teacherTsovak,
            studentTsovak
          ],
          // Duplicate group entries with numeric and string ids
          groups: [
            { id: 1, title: 'B1 Group' },
            { id: '1', title: 'B1 Group' },
            { id: 2, title: 'A2 Group' }
          ],
          profile: window.authUser,
          profiles: {
            '1': { id: '1', online: true, username: '@tsovak' },
            '11': { id: '11', online: true, username: '@student_11' },
            '2': { id: '2', online: true, username: '@tsovak_palakian' },
            '3': { id: '3', online: true, username: '@teacher_tsovak' },
            '4': { id: '4', online: true, username: '' },
            'group:1': { id: 'group:1', online: false },
            'group:2': { id: 'group:2', online: false }
          },
          seq: 1,
          total: 0
        };

        window.__chatWs.onmessage({
          data: JSON.stringify({
            type: 'snapshot',
            data: testSnapshot
          })
        });
      });

      // Switch to Contacts mode
      await page.locator('#msgContacts').click();
      await page.waitForTimeout(150);

      // Verify People section deduplication: exactly 4 unique contacts, no duplicates
      const contactCards = await page.locator('#msgRooms [data-contact-id]').all();
      assert.equal(contactCards.length, 4, `Expected exactly 4 unique contacts in theme ${theme}, found ${contactCards.length}`);

      const contactIds = await page.locator('#msgRooms [data-contact-id]').evaluateAll(
        nodes => nodes.map(n => String(n.dataset.contactId))
      );
      assert.deepEqual(contactIds.sort(), ['11', '2', '3', '4'], 'Contacts must match unique IDs [11, 2, 3, 4]');

      // Verify Student 1 occurs exactly once
      const student1Count = await page.locator('#msgRooms [data-contact-id="11"]').count();
      assert.equal(student1Count, 1, 'Student 1 must occur exactly once');

      // Verify Teacher Tsovak occurs exactly once
      const teacherCount = await page.locator('#msgRooms [data-contact-id="3"]').count();
      assert.equal(teacherCount, 1, 'Teacher Tsovak Palakian must occur exactly once');

      // Verify Groups section deduplication: exactly 2 unique groups (id 1 and id 2), no duplicates
      const groupCards = await page.locator('#msgRooms [data-chat-group]').all();
      assert.equal(groupCards.length, 2, `Expected exactly 2 unique groups in theme ${theme}, found ${groupCards.length}`);

      const groupIds = await page.locator('#msgRooms [data-chat-group]').evaluateAll(
        nodes => nodes.map(n => String(n.dataset.chatGroup))
      );
      assert.deepEqual(groupIds.sort(), ['1', '2'], 'Groups must match unique IDs [1, 2]');

      // Verify New Chat dialog deduplication
      await page.locator('#msgNew').click();
      await page.waitForTimeout(100);

      const dialogContactCount = await page.locator('.chat-new-list [data-contact-index]').count();
      // 2 unique groups + 4 unique contacts = 6 total rows
      assert.equal(dialogContactCount, 6, `Expected exactly 6 unique rows in New Chat dialog, found ${dialogContactCount}`);

      // Close dialog
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);

      // Verify Create Group dialog member deduplication
      await page.locator('[data-create-group]').click();
      await page.waitForTimeout(100);

      const createGroupMemberCount = await page.locator('.chat-create-group-list [data-member-name]').count();
      assert.equal(createGroupMemberCount, 4, `Expected exactly 4 unique candidates in Create Group dialog, found ${createGroupMemberCount}`);

      // Close create group dialog
      await page.keyboard.press('Escape');
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
