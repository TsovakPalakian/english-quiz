import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Visual and DOM test: Chat group restrictions segmented switch and contact deduplication', async () => {
  const previewCss = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  const chatCss = fs.readFileSync(path.join(rootDir, 'production/chat.css'), 'utf8');
  const chatHtml = fs.readFileSync(path.join(rootDir, 'production/chat.html'), 'utf8');
  const chatJs = fs.readFileSync(path.join(rootDir, 'production/chat.js'), 'utf8');

  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ['sky', 'dark', 'peach']) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1024, height: 768 });

    // Host chat environment with mocked WebSocket
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
      send(raw) {
        const parsed = JSON.parse(raw);
        window.__wsRequests.push(parsed);
        setTimeout(() => {
          if (parsed.action === 'create-group') {
            this.onmessage({
              data: JSON.stringify({
                type: 'response',
                requestId: parsed.requestId,
                result: {
                  roomId: 'group:99',
                  room: {
                    id: 'group:99',
                    title: parsed.body.title,
                    kind: 'group',
                    has: { personal: true },
                    unread: { personal: 0, learning: 0 },
                    members: parsed.body.memberIds.length + 1
                  }
                }
              })
            });
          } else {
            this.onmessage({
              data: JSON.stringify({
                type: 'response',
                requestId: parsed.requestId,
                result: {}
              })
            });
          }
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

    // Initialize chat
    await page.evaluate(() => {
      document.getElementById('messages').classList.add('on');
      const openBtn = document.createElement('button');
      openBtn.setAttribute('data-msg-open', '');
      document.body.append(openBtn);
      openBtn.click();

      // Snapshot with duplicate contacts between direct rooms (string peerId) and directory (number id)
      window.__chatWs.onmessage({
        data: JSON.stringify({
          type: 'snapshot',
          data: {
            profile: { id: 999, name: 'Current User', username: 'me' },
            profiles: {
              '1': { id: 1, name: 'Tsovak Palakian', username: 'teacher' },
              '2': { id: 2, name: 'Student 1', username: 's1' },
              '999': { id: 999, name: 'Current User', username: 'me' }
            },
            rooms: [
              {
                id: 'direct:999:1',
                title: 'Tsovak Palakian',
                peerId: '1',
                kind: 'direct',
                access: { state: 'accepted', canSend: true },
                has: { personal: true },
                unread: { personal: 0, learning: 0 }
              },
              {
                id: 'direct:999:2',
                title: 'Student 1',
                peerId: '2',
                kind: 'direct',
                access: { state: 'accepted', canSend: true },
                has: { personal: true },
                unread: { personal: 0, learning: 0 }
              }
            ],
            contacts: [
              { id: 1, name: 'Tsovak Palakian', role: 'Teacher' },
              { id: 2, name: 'Student 1', role: 'Student' }
            ],
            groups: [{ id: 10, title: 'B1 Group' }],
            total: 0
          }
        })
      });
    });

    await page.waitForTimeout(50);

    // 1. Verify New Chat dialog contact deduplication
    await page.evaluate(() => {
      document.getElementById('msgNew').click();
    });
    await page.waitForSelector('.chat-dialog', { state: 'visible' });

    const newChatContacts = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.chat-dialog .chat-contact span'));
      return items.map((el) => el.textContent.trim());
    });

    const teacherCount = newChatContacts.filter((txt) => txt.includes('Tsovak Palakian')).length;
    const studentCount = newChatContacts.filter((txt) => txt.includes('Student 1')).length;

    assert.equal(teacherCount, 1, `Tsovak Palakian must appear exactly once in New chat dialog (${theme})`);
    assert.equal(studentCount, 1, `Student 1 must appear exactly once in New chat dialog (${theme})`);

    // Verify role preservation: must show 'Teacher', not generic 'Contact'
    const teacherText = newChatContacts.find((txt) => txt.includes('Tsovak Palakian'));
    assert.match(teacherText, /Teacher/, `Role must be preserved as Teacher in New chat dialog (${theme})`);

    // 2. Open Create Group dialog and verify contact deduplication and segmented toggles
    await page.evaluate(() => {
      document.querySelector('[data-new-create-group]').click();
    });
    await page.waitForSelector('.chat-create-group-dialog', { state: 'visible' });

    const groupMembers = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.chat-create-group-dialog .chat-create-member span'));
      return rows.map((el) => el.textContent.trim());
    });

    const groupTeacherCount = groupMembers.filter((txt) => txt.includes('Tsovak Palakian')).length;
    const groupStudentCount = groupMembers.filter((txt) => txt.includes('Student 1')).length;
    assert.equal(groupTeacherCount, 1, `Tsovak Palakian must appear exactly once in Create group dialog (${theme})`);
    assert.equal(groupStudentCount, 1, `Student 1 must appear exactly once in Create group dialog (${theme})`);

    // 3. Verify segmented switch toggle rows and radios
    const limitRows = await page.evaluate(() => {
      const rows = document.querySelectorAll('.chat-create-group-dialog .chat-limit-row');
      return Array.from(rows).map((row) => {
        const label = row.querySelector('.chat-limit-label')?.textContent.trim();
        const inputs = Array.from(row.querySelectorAll('input[type="radio"]')).map((inp) => ({
          name: inp.name,
          value: inp.value,
          checked: inp.checked
        }));
        return { label, inputs };
      });
    });

    assert.equal(limitRows.length, 3, 'Must render exactly 3 group limit rows');
    assert.equal(limitRows[0].label, 'Who can send messages');
    assert.equal(limitRows[1].label, 'Who can add members');
    assert.equal(limitRows[2].label, 'Who can send media');

    // Verify default values
    assert.equal(limitRows[0].inputs.find((i) => i.value === 'everyone').checked, true, 'Default send must be everyone');
    assert.equal(limitRows[1].inputs.find((i) => i.value === 'everyone').checked, true, 'Default invite must be everyone');
    assert.equal(limitRows[2].inputs.find((i) => i.value === 'everyone').checked, true, 'Default media must be everyone');

    // 4. Verify visual styling of segmented switches
    const switchStyles = await page.evaluate(() => {
      const row = document.querySelector('.chat-create-group-dialog .chat-limit-row');
      const group = document.querySelector('.chat-create-group-dialog .chat-switch-group');
      const activeBtn = document.querySelector('.chat-create-group-dialog .chat-switch-btn input:checked + span');
      const inactiveBtn = document.querySelector('.chat-create-group-dialog .chat-switch-btn input:not(:checked) + span');
      const rowComp = window.getComputedStyle(row);
      const groupComp = window.getComputedStyle(group);
      const activeComp = window.getComputedStyle(activeBtn);
      const inactiveComp = window.getComputedStyle(inactiveBtn);
      return {
        rowDisplay: rowComp.display,
        rowJustify: rowComp.justifyContent,
        groupDisplay: groupComp.display,
        activeBg: activeComp.backgroundColor,
        activeColor: activeComp.color,
        inactiveColor: inactiveComp.color
      };
    });

    assert.equal(switchStyles.rowDisplay, 'flex', 'Limit row must display flex');
    assert.equal(switchStyles.rowJustify, 'space-between', 'Limit row must justify space-between');
    assert.equal(switchStyles.groupDisplay, 'flex', 'Switch group must display flex');
    assert.notEqual(switchStyles.activeBg, 'transparent', 'Active switch button must have solid accent background');
    assert.notEqual(switchStyles.activeColor, switchStyles.inactiveColor, 'Active and inactive switch text must differ');

    // 5. Test interactive switching
    await page.click('.chat-create-group-dialog .chat-limit-row:nth-of-type(1) .chat-switch-btn:nth-child(2)');

    const sendCheckedVal = await page.evaluate(() => {
      const checked = document.querySelector('.chat-create-group-dialog input[name="send"]:checked');
      return checked ? checked.value : null;
    });
    assert.equal(sendCheckedVal, 'admins', 'Clicking Admins only must set send restriction to admins');

    // 6. Test form submission with restrictions payload
    await page.fill('.chat-create-group-dialog input[name="title"]', 'New English Group');
    await page.click('.chat-create-group-dialog .chat-create-member input[type="checkbox"]');

    await page.click('.chat-create-group-dialog button[type="submit"]');
    await page.waitForTimeout(50);

    const createReq = await page.evaluate(() => window.__wsRequests.find((r) => r.action === 'create-group'));
    assert.ok(createReq, 'create-group request must be sent');
    assert.equal(createReq.body.title, 'New English Group');
    assert.deepEqual(createReq.body.restrictions, {
      send: 'admins',
      invite: 'everyone',
      media: 'everyone'
    });

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
