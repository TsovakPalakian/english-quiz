import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

const userProfilePillJs = fs.readFileSync('client/20a-user-profile-pill.js', 'utf8');
const previewCss = fs.readFileSync('site/preview.css', 'utf8');

function createTestWindow(initialLocalStorage = {}) {
  const win = new Window({ url: 'https://preview.invalid/' });
  const doc = win.document;
  doc.body.innerHTML = `
    <header class="shell-header" id="shellHeader">
      <div class="shell-header-right" id="userProfilePillHost"></div>
    </header>
    <div class="tabbar">
      <button type="button" data-jump="settings" data-shell-settings-open></button>
    </div>
  `;

  for (const [k, v] of Object.entries(initialLocalStorage)) {
    win.localStorage.setItem(k, v);
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
  win.lucide = { createIcons: () => {} };

  return win;
}

test('Unit test: Initial load without local cache asynchronously fetches and paints avatar photo', async () => {
  const win = createTestWindow();
  const doc = win.document;

  let fetchCalls = 0;
  win.fetch = async (url) => {
    if (url === '/api/messages/profile') {
      fetchCalls++;
      return {
        ok: true,
        json: async () => ({
          details: {},
          profile: {
            id: 'u1',
            name: 'Tsovak Palakian',
            avatarUrl: '/api/messages/avatar?subject=u1&v=abc123'
          }
        })
      };
    }
    return { ok: false };
  };

  win.authUser = {
    id: 'u1',
    login: 'tsovak',
    name: 'Tsovak Palakian',
    role: 'ADMIN'
  };

  const context = vm.createContext(win);
  vm.runInContext(userProfilePillJs, context);

  // Synchronous first paint
  win.paintUserProfilePill();

  const pillAvatar = doc.querySelector('.pill-avatar-img');
  assert.ok(pillAvatar, 'Pill avatar element exists');
  // Before fetch resolves, initial text initials should be present
  assert.ok(pillAvatar.textContent.includes('TP'), 'Initial paint displays TP initials before fetch resolves');

  // Wait for ensureUserAvatar promise to complete
  await new Promise((r) => setTimeout(r, 20));

  // After fetch resolves:
  const img = pillAvatar.querySelector('img');
  assert.ok(img, 'Avatar image is rendered inside .pill-avatar-img after profile fetch');
  assert.equal(img.getAttribute('src'), '/api/messages/avatar?subject=u1&v=abc123');
  assert.ok(pillAvatar.classList.contains('has-avatar-photo'), 'Class has-avatar-photo is added');

  // Also check tabbar avatar circle
  const tabbarImg = doc.querySelector('#tabbarAvatarCircle img');
  assert.ok(tabbarImg, 'Tabbar avatar circle is also updated with avatar image');
  assert.equal(tabbarImg.getAttribute('src'), '/api/messages/avatar?subject=u1&v=abc123');

  // Verify persistence in localStorage
  assert.equal(win.localStorage.getItem('enquiz-user-avatar:u1'), '/api/messages/avatar?subject=u1&v=abc123');
  assert.equal(fetchCalls, 1, 'Profile fetch is called once');
});

test('Unit test: Cached avatar in localStorage renders image synchronously on initial paint', () => {
  const cachedUrl = '/api/messages/avatar?subject=u2&v=cached999';
  const win = createTestWindow({
    'enquiz-user-avatar:u2': cachedUrl
  });
  const doc = win.document;

  win.fetch = async () => ({ ok: true, json: async () => ({ profile: { id: 'u2', avatarUrl: cachedUrl } }) });
  win.authUser = {
    id: 'u2',
    login: 'student',
    name: 'Student One',
    role: 'USER'
  };

  const context = vm.createContext(win);
  vm.runInContext(userProfilePillJs, context);

  win.paintUserProfilePill();

  const pillAvatar = doc.querySelector('.pill-avatar-img');
  assert.ok(pillAvatar, 'Pill avatar element exists');
  const img = pillAvatar.querySelector('img');
  assert.ok(img, 'Image rendered synchronously without delay from cache');
  assert.equal(img.getAttribute('src'), cachedUrl);
  assert.ok(pillAvatar.classList.contains('has-avatar-photo'), 'Class has-avatar-photo is set synchronously');
});

test('Unit test: User without avatar retains initials and clears stale localStorage', async () => {
  const win = createTestWindow({
    'enquiz-user-avatar:u3': '/stale/avatar.jpg'
  });
  const doc = win.document;

  win.fetch = async (url) => {
    if (url === '/api/messages/profile') {
      return {
        ok: true,
        json: async () => ({
          details: {},
          profile: {
            id: 'u3',
            name: 'No Photo User',
            avatarUrl: ''
          }
        })
      };
    }
    return { ok: false };
  };

  win.authUser = {
    id: 'u3',
    login: 'nophoto',
    name: 'No Photo User',
    role: 'USER'
  };

  const context = vm.createContext(win);
  vm.runInContext(userProfilePillJs, context);

  win.paintUserProfilePill();
  await new Promise((r) => setTimeout(r, 20));

  const pillAvatar = doc.querySelector('.pill-avatar-img');
  assert.ok(!pillAvatar.querySelector('img'), 'No img tag when profile has no avatar');
  assert.ok(pillAvatar.textContent.includes('NP'), 'Initials NP displayed');
  assert.equal(pillAvatar.classList.contains('has-avatar-photo'), false, 'Class has-avatar-photo removed');
  assert.equal(win.localStorage.getItem('enquiz-user-avatar:u3'), null, 'Stale local storage entry removed');
});

test('Unit test: Multiple paint calls do not trigger duplicate profile requests', async () => {
  const win = createTestWindow();
  let calls = 0;
  win.fetch = async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({ profile: { id: 'u4', avatarUrl: '/avatar.png' } })
    };
  };

  win.authUser = {
    id: 'u4',
    login: 'user4',
    name: 'User Four',
    role: 'USER'
  };

  const context = vm.createContext(win);
  vm.runInContext(userProfilePillJs, context);

  win.paintUserProfilePill();
  win.paintUserProfilePill();
  win.paintUserProfilePill();

  await new Promise((r) => setTimeout(r, 20));

  assert.equal(calls, 1, 'Profile was fetched exactly once despite 3 paint calls');
});

test('Visual test: Playwright renders immediate avatar image in header shell', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 400 } });

    const avatarSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#0f766e"/><circle cx="50" cy="40" r="20" fill="#fde047"/></svg>`;
    const avatarDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(avatarSvg);

    const htmlContent = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        ${previewCss}
        body { margin: 0; padding: 20px; background: #d5e5db; font-family: system-ui; }
      </style>
    </head>
    <body>
      <header class="shell-header" id="shellHeader" style="display:flex; justify-content:flex-end;">
        <div class="shell-header-right" id="userProfilePillHost"></div>
      </header>
      <script>
        window.esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        window.authUser = {
          id: 'u_visual',
          login: 'tsovak',
          name: 'Tsovak Palakian',
          role: 'ADMIN'
        };
        window.fetch = async (url) => {
          if (url === '/api/messages/profile') {
            return {
              ok: true,
              json: async () => ({
                profile: {
                  id: 'u_visual',
                  avatarUrl: '${avatarDataUrl}'
                }
              })
            };
          }
          return { ok: false };
        };
        window.lucide = { createIcons: () => {} };
      </script>
      <script>${userProfilePillJs}</script>
      <script>
        window.paintUserProfilePill();
      </script>
    </body>
    </html>`;

    await page.setContent(htmlContent);

    const imgLocator = page.locator('#userProfilePillHost .pill-avatar-img img');
    await imgLocator.waitFor({ state: 'visible', timeout: 5000 });

    const hasPhotoClass = await page.locator('#userProfilePillHost .pill-avatar-img').evaluate(el => el.classList.contains('has-avatar-photo'));
    assert.equal(hasPhotoClass, true, 'Visual element has class has-avatar-photo');

    const statusDotVisible = await page.locator('#userProfilePillHost .pill-status-dot').isVisible();
    assert.equal(statusDotVisible, true, 'Online status dot is visible alongside avatar photo');
  } finally {
    await browser.close();
  }
});
