import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { previewAuthStudio } from '../ops/preview-auth-studio.mjs';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('TASK-10 Visual and functional test: Login page placeholders, button states, provider cleanup and OTP flow', async (t) => {
  const preview = await previewAuthStudio();
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(preview.url, { waitUntil: 'domcontentloaded' });

    // Open login screen from landing page
    const enterBtn = page.getByRole('button', { name: 'Enter the Learning Studio', exact: true });
    await enterBtn.waitFor({ state: 'visible' });
    await enterBtn.click();

    await page.waitForSelector('#loginForm', { state: 'visible' });

    // Test across themes: sky, dark, sand
    for (const theme of ['sky', 'dark', 'sand']) {
      await t.test(`Theme ${theme}: Verify login form visual presentation and placeholders`, async () => {
        await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme);

        const loginInput = page.locator('#authLogin');
        const passInput = page.locator('#authPassword');
        const submitBtn = page.locator('#loginForm button[type="submit"]');

        // Check placeholders
        assert.equal(await loginInput.getAttribute('placeholder'), 'user@example.com', 'Login input has user@example.com placeholder');
        assert.equal(await passInput.getAttribute('placeholder'), '••••••••', 'Password input has •••••••• placeholder');

        // Check button text and disabled state
        assert.equal(await submitBtn.textContent(), 'Log in', 'Submit button says Log in');
        assert.equal(await submitBtn.isDisabled(), true, 'Submit button starts disabled');

        const btnStyle = await submitBtn.evaluate((el) => {
          const s = getComputedStyle(el);
          return { opacity: s.opacity, cursor: s.cursor };
        });
        assert.equal(btnStyle.opacity, '0.5', 'Disabled submit button has 0.5 opacity');
        assert.equal(btnStyle.cursor, 'not-allowed', 'Disabled submit button has not-allowed cursor');

        // Check providers: no envelope button, exactly 4 providers
        const providerBtns = page.locator('.auth-providers button:not([hidden])');
        assert.equal(await providerBtns.count(), 4, 'Exactly 4 provider buttons (Passkey, Google, Microsoft, Telegram)');
        const envelopeBtn = page.locator('.auth-providers [data-login-mode="otp"]');
        assert.equal(await envelopeBtn.count(), 0, 'No envelope button in auth-providers');

        // Check duplicate mode switch tabs are hidden
        const modeSwitch = page.locator('.auth-mode-switch');
        if (await modeSwitch.count() > 0) {
          const visible = await modeSwitch.evaluate((el) => getComputedStyle(el).display !== 'none');
          assert.equal(visible, false, 'auth-mode-switch is hidden');
        }
      });
    }

    await t.test('Submit button reactivity and empty submit preventDefault', async () => {
      const loginInput = page.locator('#authLogin');
      const passInput = page.locator('#authPassword');
      const submitBtn = page.locator('#loginForm button[type="submit"]');

      // Fill only login
      await loginInput.fill('user@example.com');
      assert.equal(await submitBtn.isDisabled(), true, 'Still disabled with only login filled');

      // Fill only password
      await loginInput.fill('');
      await passInput.fill('secret123');
      assert.equal(await submitBtn.isDisabled(), true, 'Still disabled with only password filled');

      // Fill both
      await loginInput.fill('user@example.com');
      assert.equal(await submitBtn.isDisabled(), false, 'Enabled when both fields are filled');

      // Try empty submission trigger: clear fields and trigger submit programmatically
      await loginInput.fill('');
      await passInput.fill('');
      const redirected = await page.evaluate(() => {
        const form = document.getElementById('loginForm');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        return document.body.className;
      });
      assert.ok(redirected.includes('guest-auth'), 'Page remains on guest-auth and did not redirect to home');
      assert.ok(!redirected.includes('guest-home'), 'Page did not redirect to guest-home');
    });

    await t.test('OTP login screen: full width button, hidden forgot password, and navigation', async () => {
      // Switch to OTP mode
      await page.evaluate(() => {
        const lf = document.getElementById('loginForm');
        const olf = document.getElementById('otpLoginForm');
        if (lf) lf.hidden = true;
        if (olf) olf.hidden = false;
        if (window.backLink) window.backLink();
      });

      const otpForm = page.locator('#otpLoginForm');
      assert.equal(await otpForm.isVisible(), true, 'OTP login form is visible');

      // Forgot password link must be hidden
      const forgotLink = page.locator('[data-password-recovery]');
      assert.equal(await forgotLink.isVisible(), false, 'Forgot password link is hidden on OTP screen');

      // Send code button must be full width
      const sendCodeBtn = page.locator('#otpLoginForm [data-otp-send]');
      assert.equal(await sendCodeBtn.count(), 1, 'Send code button exists');
      const sendCodeWidth = await sendCodeBtn.evaluate((el) => {
        const inputWidth = document.getElementById('otpEmail').getBoundingClientRect().width;
        const btnWidth = el.getBoundingClientRect().width;
        return { inputWidth, btnWidth, ratio: btnWidth / inputWidth };
      });
      assert.ok(sendCodeWidth.ratio >= 0.95, `Send code button width (${sendCodeWidth.btnWidth}) matches input width (${sendCodeWidth.inputWidth})`);

      // Back navigation controls
      const backBtn = page.locator('[data-studio-back]');
      const homeBtn = page.locator('[data-studio-home]');
      assert.equal(await backBtn.textContent(), 'Log in with password', 'Back button says Log in with password');
      assert.equal(await homeBtn.isVisible(), true, 'Back to home button is visible');
      assert.equal(await homeBtn.textContent(), 'Back to home', 'Home button says Back to home');

      // Click Log in with password: returns to password form
      await backBtn.click();
      assert.equal(await page.locator('#loginForm').isVisible(), true, 'Password form is restored');
      assert.equal(await page.locator('#otpLoginForm').isVisible(), false, 'OTP form is hidden');
      assert.equal(await forgotLink.isVisible(), true, 'Forgot password link is visible again');
      assert.equal(await page.locator('[data-studio-back]').textContent(), 'Back to home', 'Back button says Back to home');
      assert.equal(await page.locator('[data-studio-home]').count(), 0, 'Back to home secondary button is removed');
    });
  } finally {
    await browser?.close();
    await preview?.close();
  }
});
