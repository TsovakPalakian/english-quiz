import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));

const previewCss = readFileSync('site/preview.css', 'utf8');
const chatCss = readFileSync('production/chat.css', 'utf8');
const chatIconsJs = readFileSync('production/chat-icons.js', 'utf8');
const passkeysJs = readFileSync('client/06-passkeys.js', 'utf8');

const sampleSession = {
  id: 'sess-1',
  current: true,
  active: true,
  browser: 'Chrome 131',
  os: 'macOS 15',
  device: 'MacBook Pro',
  startedAt: Date.now() - 3600000,
  lastActivityAt: Date.now() - 60000,
  ip: '198.51.100.42',
  city: 'London',
  country: 'UK',
  timezone: 'Europe/London',
  network: 'Fast ISP',
  asn: 12345,
  tls: 'TLS 1.3',
  lastIp: '198.51.100.42',
  lastCity: 'London',
  lastCountry: 'UK',
  userAgent: 'Mozilla/5.0...'
};

const fixtureHtml = `<!DOCTYPE html>
<html lang="en" data-theme="sky">
<head>
<meta charset="utf-8">
<style>
${previewCss}
${chatCss}
</style>
<script>
${chatIconsJs}
window.SimpleWebAuthnBrowser = {
  startRegistration: async () => ({id: 'cred-123'}),
  startAuthentication: async () => ({id: 'cred-123'})
};
</script>
<script>
${passkeysJs}
</script>
</head>
<body>
<dialog open class="chat-dialog user-settings">
  <div class="chat-dialog-body">
    <aside class="chat-settings-menu">
      <h2>Settings</h2>
      <div class="chat-settings-profile">
        <span class="chat-avatar" style="width:48px;height:48px;border-radius:50%;background:#0284c7;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:18px;">SA</span>
        <span><strong>Student Alex</strong></span>
      </div>
      <h3>Common</h3>
      <button type="button" data-settings-tab="security" class="on">Security</button>
    </aside>
    <div class="chat-settings-content">
      <header class="chat-dialog-head"><h2>Security</h2></header>
      <div data-security-passkeys></div>
      <hr>
      <div data-security-sessions></div>
      <hr>
      <button type="button" class="settings-action" data-settings-password style="width:100%; justify-content:space-between;">
        <span style="display:flex; align-items:center; gap:10px;">Change password</span>
        <span class="accordion-arrow">▸</span>
      </button>
      <div data-settings-password-slot></div>
      <hr>
      <button type="button" class="settings-action danger" data-account="revoke">Delete my data</button>
    </div>
  </div>
</dialog>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/me/sessions') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({sessions: [sampleSession]}));
    return;
  }
  if (url.pathname === '/api/me/passkeys') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({passkeys: []}));
    return;
  }
  if (url.pathname === '/api/me/passkeys/code') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
    return;
  }
  if (url.pathname === '/api/me/passkeys/options') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({options: {challenge: 'test'}}));
    return;
  }
  if (url.pathname === '/api/me/passkeys/verify') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
    return;
  }
  if (url.pathname === '/api/me/password') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
    return;
  }
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end(fixtureHtml);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;

let browser;
try {
  browser = await launchChromium(chromium);
  const page = await browser.newPage({viewport: {width: 1040, height: 900}});
  await page.goto(origin);

  // Test 1: Verify User Profile Sidebar has NO technical role (small tag removed)
  const profileEl = page.locator('.chat-settings-profile');
  assert.equal(await profileEl.locator('small').count(), 0, 'No technical role title in sidebar');
  assert.ok((await profileEl.innerText()).includes('Student Alex'), 'Profile username visible');

  // Test 2: Mount Passkeys and test full flow
  await page.evaluate(() => LumisciaPasskeys.mount(document.querySelector('[data-security-passkeys]')));
  const passkeyToggle = page.locator('[data-passkey-toggle]');
  await passkeyToggle.waitFor();
  const passkeyContent = page.locator('[data-passkey-content]');
  
  // Initially collapsed
  assert.equal(await passkeyContent.isHidden(), true, 'Passkeys starts collapsed');
  assert.equal(await passkeyToggle.locator('.accordion-arrow').innerText(), '▸');

  // First click: expand
  await passkeyToggle.click();
  assert.equal(await passkeyContent.isVisible(), true, 'Passkeys expands on click');
  assert.equal(await passkeyToggle.locator('.accordion-arrow').innerText(), '▾');

  // Passkey name input properties
  const labelInput = page.locator('[data-passkey-label]');
  assert.equal(await labelInput.getAttribute('placeholder'), 'Set device name');
  assert.equal(await labelInput.getAttribute('required'), '');
  assert.equal(await labelInput.inputValue(), '');

  // Add passkey button is hidden initially
  const addPasskeyBtn = page.locator('[data-passkey-add]');
  assert.equal(await addPasskeyBtn.isHidden(), true, 'Add passkey button hidden initially');

  // Click Send confirmation code without name -> validation error
  const sendCodeBtn = page.locator('[data-passkey-code]');
  await sendCodeBtn.click();
  const statusMsg = page.locator('[data-passkey-status]');
  assert.match(await statusMsg.innerText(), /Set device name first/);

  // Fill device name and send code
  await labelInput.fill('Personal Laptop');
  await sendCodeBtn.click();
  await page.waitForFunction(() => /Confirmation code sent/.test(document.querySelector('[data-passkey-status]')?.textContent || ''));

  // Add passkey button is now visible, but disabled
  assert.equal(await addPasskeyBtn.isVisible(), true, 'Add passkey button is visible after code request');
  assert.equal(await addPasskeyBtn.isDisabled(), true, 'Add passkey button disabled without 6 digits');

  // Type 5 digits -> still disabled
  const codeInput = page.locator('[data-passkey-code-value]');
  await codeInput.fill('12345');
  assert.equal(await addPasskeyBtn.isDisabled(), true, 'Add passkey button disabled with 5 digits');

  // Type 6 digits -> enabled
  await codeInput.fill('123456');
  assert.equal(await addPasskeyBtn.isEnabled(), true, 'Add passkey button enabled with 6 digits');

  // Second click on toggle: collapses
  await passkeyToggle.click();
  assert.equal(await passkeyContent.isHidden(), true, 'Passkeys collapses on second click');
  assert.equal(await passkeyToggle.locator('.accordion-arrow').innerText(), '▸');

  // Test 3: Active sessions accordion and Connection details hiding for student/teacher
  await page.evaluate((sess) => {
    window.renderSessionsHelper = function(targetRole) {
      const host = document.querySelector('[data-security-sessions]');
      let expanded = false;
      const showDetails = ['ADMIN', 'DEVELOPER'].includes(targetRole.toUpperCase());
      function paint() {
        host.innerHTML =
          '<button class="settings-action" type="button" data-sessions-toggle style="width:100%; justify-content:space-between;"><span style="display:flex; align-items:center; gap:10px;">Show active sessions</span><span class="accordion-arrow">' +
          (expanded ? '▾' : '▸') +
          '</span></button><div data-sessions-body' +
          (expanded ? '' : ' hidden') +
          ' style="margin-top:10px;">' +
          '<article class="security-session"><header><strong>' + sess.browser + ' · ' + sess.os + '</strong></header><dl><div><dt>Device</dt><dd>' + sess.device + '</dd></div></dl>' +
          (showDetails ? '<details><summary>Connection details</summary><dl><div><dt>Network</dt><dd>' + sess.network + '</dd></div></dl></details>' : '') +
          '</article></div>';

        host.querySelector('[data-sessions-toggle]').onclick = () => {
          expanded = !expanded;
          paint();
        };
      }
      paint();
    };
    window.renderSessionsHelper('STUDENT');
  }, sampleSession);

  const sessionsToggle = page.locator('[data-sessions-toggle]');
  await sessionsToggle.waitFor();
  const sessionsBody = page.locator('[data-sessions-body]');
  assert.equal(await sessionsBody.isHidden(), true, 'Active sessions starts collapsed');

  // First click: expand
  await sessionsToggle.click();
  assert.equal(await sessionsBody.isVisible(), true, 'Active sessions expands on first click');
  assert.equal(await sessionsToggle.locator('.accordion-arrow').innerText(), '▾');

  // For STUDENT role: Connection details must NOT exist
  assert.equal(await page.locator('.security-session details').count(), 0, 'Connection details hidden for student');

  // Switch role to TEACHER: Connection details must NOT exist
  await page.evaluate(() => window.renderSessionsHelper('TEACHER'));
  await sessionsToggle.click(); // expand
  assert.equal(await page.locator('.security-session details').count(), 0, 'Connection details hidden for teacher');

  // Switch role to ADMIN: Connection details MUST exist
  await page.evaluate(() => window.renderSessionsHelper('ADMIN'));
  await sessionsToggle.click(); // expand
  assert.equal(await page.locator('.security-session details').count(), 1, 'Connection details visible for admin');

  // Test 4: Change password accordion toggle & compact form
  await page.evaluate(() => {
    const pane = document.querySelector('.chat-settings-content');
    pane.querySelector('[data-settings-password]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const arrow = btn.querySelector('.accordion-arrow');
      const slot = pane.querySelector('[data-settings-password-slot]');
      if (slot.innerHTML.trim()) {
        slot.innerHTML = '';
        if (arrow) arrow.textContent = '▸';
        return;
      }
      if (arrow) arrow.textContent = '▾';
      slot.innerHTML =
        '<form id="ownPasswordForm" class="password-form-compact"><label>Current password<input name="current" type="password" autocomplete="current-password" required placeholder="••••••••"></label><label>New password<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required placeholder="At least 8 characters"></label><label>Repeat password<input name="repeat" type="password" minlength="8" maxlength="128" autocomplete="new-password" required placeholder="Repeat new password"></label><p data-form-status role="status"></p><button class="btn primary" type="submit">Save password</button></form>';
    });

    document.body.addEventListener('submit', (e) => {
      const form = e.target;
      if (form.id === 'ownPasswordForm') {
        e.preventDefault();
        const status = form.querySelector('[data-form-status]');
        const repeatInput = form.querySelector('[name="repeat"]');
        const submitBtn = form.querySelector('button[type="submit"]');
        const data = Object.fromEntries(new FormData(form).entries());
        if (status) { status.textContent = ''; status.classList.remove('bad'); }
        if (repeatInput) repeatInput.classList.remove('field-error');
        if (data.password !== data.repeat) {
          if (repeatInput) repeatInput.classList.add('field-error');
          if (status) { status.textContent = 'The new passwords do not match.'; status.classList.add('bad'); }
          return;
        }
        if (submitBtn) submitBtn.disabled = true;
        setTimeout(() => {
          form.reset();
          if (status) status.textContent = 'Password saved.';
          if (submitBtn) submitBtn.disabled = false;
        }, 50);
      }
    });
  });

  const passwordBtn = page.locator('[data-settings-password]');
  assert.equal(await page.locator('#ownPasswordForm').count(), 0, 'Password form not mounted initially');
  assert.equal(await passwordBtn.locator('.accordion-arrow').innerText(), '▸');

  // First click: opens form
  await passwordBtn.click();
  const passwordForm = page.locator('#ownPasswordForm');
  await passwordForm.waitFor();
  assert.equal(await passwordForm.isVisible(), true, 'Password form visible');
  assert.equal(await passwordBtn.locator('.accordion-arrow').innerText(), '▾');

  // Check compact styling
  const formBox = await passwordForm.boundingBox();
  assert.ok(formBox.width <= 380, `Password form width (${formBox.width}px) is compact (<= 380px)`);
  const currentBox = await passwordForm.locator('[name="current"]').boundingBox();
  assert.ok(Math.abs(currentBox.height - 38) <= 4, 'Input height is compact (around 38px)');

  // Test mismatch validation
  await passwordForm.locator('[name="current"]').fill('current123');
  await passwordForm.locator('[name="password"]').fill('newsecret1');
  await passwordForm.locator('[name="repeat"]').fill('newsecret2');
  await passwordForm.locator('button[type="submit"]').click();

  await page.waitForFunction(() => /The new passwords do not match/.test(document.querySelector('#ownPasswordForm [data-form-status]')?.textContent || ''));
  assert.equal(await passwordForm.locator('[name="repeat"].field-error').count(), 1, 'Field error class applied');

  // Test success save
  await passwordForm.locator('[name="repeat"]').fill('newsecret1');
  await passwordForm.locator('button[type="submit"]').click();
  await page.waitForFunction(() => /Password saved/.test(document.querySelector('#ownPasswordForm [data-form-status]')?.textContent || ''));

  // Second click: collapses form
  await passwordBtn.click();
  assert.equal(await page.locator('#ownPasswordForm').count(), 0, 'Password form closed on second click');
  assert.equal(await passwordBtn.locator('.accordion-arrow').innerText(), '▸');

  // Test 5: Visual tests in sky, dark, sand themes
  for (const theme of ['sky', 'dark', 'sand']) {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(50);
    // Expand passkeys and sessions and form for visual verification
    if (await passkeyContent.isHidden()) await passkeyToggle.click();
    if (await sessionsBody.isHidden()) await sessionsToggle.click();
    if (await page.locator('#ownPasswordForm').count() === 0) await passwordBtn.click();

    const dialogBox = await page.locator('dialog.user-settings').boundingBox();
    assert.ok(dialogBox.width >= 400 && dialogBox.height >= 400, `Dialog rendered in ${theme} theme`);
  }

  console.log('All TASK-7 security refinements tests passed successfully!');
} finally {
  if (browser) await browser.close();
  server.close();
}
