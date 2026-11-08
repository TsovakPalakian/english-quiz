import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

const chatHtml = fs.readFileSync('production/chat.html', 'utf8');
const chatJs = fs.readFileSync('production/chat.js', 'utf8');
const userProfilePillJs = fs.readFileSync('client/20a-user-profile-pill.js', 'utf8');
const previewCss = fs.readFileSync('site/preview.css', 'utf8');
const chatCss = fs.readFileSync('production/chat.css', 'utf8');

function createTestWindow() {
  const win = new Window({ url: 'https://preview.invalid/' });
  const doc = win.document;
  doc.body.innerHTML = `
    <header class="shell-header" id="shellHeader">
      <div class="shell-header-right" id="userProfilePillHost"></div>
    </header>
    ${chatHtml}
  `;

  if (!win.HTMLDialogElement.prototype.showModal) {
    win.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    win.HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
  }

  win.setInterval = (fn, ms) => {
    const t = setInterval(fn, ms);
    t.unref?.();
    return t;
  };
  win.setTimeout = (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  };

  win.esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  win.authUser = {
    id: 'u1',
    login: 'tsovak',
    name: 'Tsovak Palakian',
    email: 'tsovak@example.com',
    role: 'ADMIN',
    avatarUrl: '/api/messages/avatar?subject=u1'
  };
  win.lucide = { createIcons: () => {} };
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.requestAnimationFrame = (cb) => {
    const t = setTimeout(cb, 0);
    t.unref?.();
    return t;
  };

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      const t = setTimeout(() => {
        if (this.onmessage) {
          this.onmessage({
            data: JSON.stringify({
              type: 'snapshot',
              data: {
                profile: { id: 'u1', name: 'Tsovak Palakian' },
                profiles: {
                  u1: { id: 'u1', name: 'Tsovak Palakian', avatarUrl: '/api/messages/avatar?subject=u1' },
                  u_other: { id: 'u_other', name: 'Other User', avatarUrl: '/api/messages/avatar?subject=u_other' }
                },
                rooms: [{ id: 'r1', title: 'Room 1', peerId: 'u_other', kind: 'direct', unread: { personal: 0, learning: 0 }, has: { personal: true } }],
                contacts: [],
                groups: [],
                total: 0,
                seq: 1
              }
            })
          });
        }
      }, 0);
      t.unref?.();
    }
    send() {}
  }
  win.WebSocket = MockWebSocket;

  const context = vm.createContext(win);
  vm.runInContext(userProfilePillJs, context);
  vm.runInContext(chatJs, context);
  win.paintUserProfilePill();

  return { win, doc };
}

test('Avatar pill click: opens user-profile-popover and does not open photo dialog', () => {
  const { win, doc } = createTestWindow();

  const pillBtn = doc.getElementById('userProfilePill');
  const popover = doc.getElementById('userProfilePopover');
  const pillAvatarImg = pillBtn.querySelector('.pill-avatar-img');

  assert.ok(pillBtn, 'userProfilePill button exists in DOM');
  assert.ok(popover, 'userProfilePopover exists in DOM');
  assert.equal(popover.hidden, true, 'Popover must be initially hidden');
  assert.ok(pillAvatarImg.classList.contains('has-avatar-photo'), 'Avatar image element has has-avatar-photo class');

  // Verify that role="button" and tabindex="0" are NOT placed on pill-avatar-img inside the button
  assert.equal(pillAvatarImg.getAttribute('role'), null, 'pill-avatar-img must not have role=button inside button');
  assert.equal(pillAvatarImg.getAttribute('tabindex'), null, 'pill-avatar-img must not have tabindex inside button');

  // Click on the avatar image inside the pill
  const imgElement = pillAvatarImg.querySelector('img') || pillAvatarImg;
  imgElement.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

  // Popover must now be open
  assert.equal(popover.hidden, false, 'userProfilePopover opens on avatar click');
  assert.ok(pillBtn.classList.contains('is-open'), 'userProfilePill has is-open class');

  // No photo dialog should have opened
  const photoDialog = doc.querySelector('.chat-avatar-dialog');
  assert.equal(photoDialog, null, 'No chat-avatar-dialog photo modal is opened on avatar pill click');

  // Click on the pill again to close
  imgElement.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(popover.hidden, true, 'userProfilePopover closes on second click');
  assert.equal(pillBtn.classList.contains('is-open'), false, 'userProfilePill removes is-open class');
});

test('Chat avatar click: avatar outside header pill still opens photo dialog as expected', async () => {
  const { win, doc } = createTestWindow();

  // Wait for mock WebSocket snapshot to initialize profileViews
  await new Promise((r) => setTimeout(r, 10));

  // Create an avatar element in chat
  const chatAvatar = doc.createElement('span');
  chatAvatar.className = 'chat-avatar has-avatar-photo';
  chatAvatar.dataset.avatarSubject = 'u_other';
  chatAvatar.dataset.avatarName = 'Other User';
  doc.getElementById('messages').appendChild(chatAvatar);

  chatAvatar.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

  // The chat avatar outside pill should open the dialog
  const photoDialog = doc.querySelector('.chat-avatar-dialog');
  assert.ok(photoDialog, 'Chat avatar outside profile pill opens chat-avatar-dialog');
});

test('Visual test: Playwright renders user-profile-popover in Ocean theme on click', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });

    const htmlContent = `<!DOCTYPE html>
    <html lang="en" data-theme="ocean">
    <head>
      <meta charset="UTF-8">
      <style>
        ${previewCss}
        ${chatCss}
        body { background-color: var(--bg); color: var(--ink); margin: 0; padding: 20px; font-family: system-ui; }
      </style>
    </head>
    <body>
      <header class="shell-header" id="shellHeader" style="display:flex; justify-content:flex-end;">
        <div class="shell-header-right" id="userProfilePillHost"></div>
      </header>
      <script>
        window.esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        window.authUser = {
          id: 'u1',
          login: 'tsovak',
          name: 'Tsovak Palakian',
          email: 'tsovak@example.com',
          role: 'ADMIN',
          avatarUrl: '/api/messages/avatar?subject=u1'
        };
        window.lucide = { createIcons: () => {} };
      </script>
      <script>${userProfilePillJs}</script>
      <script>${chatJs}</script>
      <script>
        if (typeof window.paintUserProfilePill === 'function') window.paintUserProfilePill();
      </script>
    </body>
    </html>`;

    await page.setContent(htmlContent);

    const pill = page.locator('#userProfilePill');
    await pill.waitFor({ state: 'visible' });

    const popover = page.locator('#userProfilePopover');
    const isInitiallyHidden = await popover.getAttribute('hidden');
    assert.notEqual(isInitiallyHidden, null, 'Popover is initially hidden');

    // Click on the avatar inside the pill
    await page.locator('#userProfilePill .pill-avatar-img').click();

    // Check that popover is now visible
    const isNowHidden = await popover.getAttribute('hidden');
    assert.equal(isNowHidden, null, 'Popover is visible after clicking avatar');

    // Verify popover layout
    const box = await popover.boundingBox();
    assert.ok(box, 'Popover has bounding box');
    assert.ok(box.width >= 300, 'Popover width is at least 300px');
    assert.ok(box.height >= 150, 'Popover height is at least 150px');

    // Ensure no chat-avatar-dialog is present
    const dialogCount = await page.locator('.chat-avatar-dialog').count();
    assert.equal(dialogCount, 0, 'No chat-avatar-dialog modal was created');
  } finally {
    await browser.close();
  }
});
