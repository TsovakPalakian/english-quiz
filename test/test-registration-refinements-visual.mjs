import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { previewAuthStudio } from '../ops/preview-auth-studio.mjs';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('TASK-12 Visual and functional test: Registration form, star checkbox, legal modals, and alert banner', async (t) => {
  const preview = await previewAuthStudio();
  let browser;

  try {
    browser = await launchChromium(chromium);
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    await page.goto(preview.url, { waitUntil: 'domcontentloaded' });

    // Open login screen then switch to register screen
    const enterBtn = page.getByRole('button', { name: 'Enter the Learning Studio', exact: true });
    await enterBtn.waitFor({ state: 'visible' });
    await enterBtn.click();
    await page.waitForSelector('#loginForm', { state: 'visible' });

    const createAccountTab = page.locator('.auth-create [data-account="show-register"]');
    if (await createAccountTab.isVisible()) {
      await createAccountTab.click();
    } else {
      await page.locator('.auth-tabs [data-account="show-register"]').click();
    }
    await page.waitForSelector('#registerForm', { state: 'visible' });

    // 1. Structure and initial layout across themes
    for (const theme of ['sky', 'dark', 'sand']) {
      await t.test(`Theme ${theme}: Verify registration form visual presentation`, async () => {
        await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme);

        const form = page.locator('#registerForm');
        assert.equal(await form.getAttribute('novalidate'), '', 'registerForm has novalidate attribute to suppress native browser tooltip');

        const nameInput = page.locator('#authName');
        assert.equal(await nameInput.getAttribute('maxlength'), '50', 'Name field has maxlength 50');

        const pwdInput = page.locator('#authPassword');
        assert.equal(await pwdInput.getAttribute('maxlength'), '128', 'Password field has maxlength 128');
        assert.equal(await pwdInput.getAttribute('minlength'), '8', 'Password field has minlength 8');

        // Check password hint styling (no input-like border or background)
        const pwdHint = page.locator('#authPasswordHint');
        assert.equal(await pwdHint.isVisible(), true, 'Password hint 8–128 characters is visible');
        const hintStyle = await pwdHint.evaluate((el) => {
          const s = getComputedStyle(el);
          return { borderTopWidth: s.borderTopWidth, background: s.backgroundColor };
        });
        assert.equal(hintStyle.borderTopWidth, '0px', 'Password hint has no border');

        // Check Confirm password field
        const confirmInput = page.locator('#authPasswordConfirm');
        assert.equal(await confirmInput.isVisible(), true, 'Confirm password field is visible');
        assert.equal(await confirmInput.getAttribute('placeholder'), 'Confirm password', 'Confirm password placeholder is set');
        assert.equal(await confirmInput.getAttribute('type'), 'password', 'Confirm password type is password');

        // Check Confirm password toggle button
        const confirmToggle = page.locator('.auth-confirm-password [data-auth-confirm-password]');
        assert.equal(await confirmToggle.isVisible(), true, 'Confirm password visibility toggle button is present');

        // Check Star Checkbox legal consent
        const legalCheckbox = page.locator('#authLegalConsent');
        assert.equal(await legalCheckbox.count(), 1, 'authLegalConsent checkbox exists');
        const starControl = page.locator('.auth-legal-consent .star-checkbox-control');
        assert.equal(await starControl.isVisible(), true, 'Custom star checkbox control is visible');

        const termsBtn = page.locator('.auth-legal-consent [data-legal="terms"]');
        const privacyBtn = page.locator('.auth-legal-consent [data-legal="privacy"]');
        assert.equal(await termsBtn.textContent(), 'Terms of Use', 'Terms of Use link button exists');
        assert.equal(await privacyBtn.textContent(), 'Privacy Policy', 'Privacy Policy link button exists');
      });
    }

    // 2. Password toggle functionality for Confirm password
    await t.test('Confirm password visibility toggle', async () => {
      const confirmInput = page.locator('#authPasswordConfirm');
      const confirmToggle = page.locator('.auth-confirm-password [data-auth-confirm-password]');

      await confirmToggle.click();
      assert.equal(await confirmInput.getAttribute('type'), 'text', 'Confirm password toggled to text');
      assert.equal(await confirmToggle.getAttribute('aria-pressed'), 'true', 'Toggle button aria-pressed is true');

      await confirmToggle.click();
      assert.equal(await confirmInput.getAttribute('type'), 'password', 'Confirm password toggled back to password');
      assert.equal(await confirmToggle.getAttribute('aria-pressed'), 'false', 'Toggle button aria-pressed is false');
    });

    // 3. Validation: Name field sanitization and limits
    await t.test('Name field validation and sanitization', async () => {
      const nameInput = page.locator('#authName');
      await nameInput.fill('<script>alert(1)</script>');
      await nameInput.dispatchEvent('focusout');

      const nameError = page.locator('#signup-name-error');
      assert.equal(await nameError.isVisible(), true, 'Name error is displayed for code characters');
      assert.ok((await nameError.textContent()).includes('code characters'), 'Error specifies code characters ban');
      assert.equal(await nameInput.getAttribute('aria-invalid'), 'true', 'aria-invalid is true on name field');

      // Valid international name
      await nameInput.fill("Marie Curie-Skłodowska");
      await nameInput.dispatchEvent('focusout');
      assert.equal(await nameError.isVisible(), false, 'Name error is hidden for valid international name');
      assert.equal(await nameInput.getAttribute('aria-invalid'), 'false', 'aria-invalid is false for valid name');
    });

    // 4. Validation: Password and Confirm password matching & length
    await t.test('Password length and confirmation matching validation', async () => {
      const pwdInput = page.locator('#authPassword');
      const confirmInput = page.locator('#authPasswordConfirm');
      const pwdError = page.locator('#signup-password-error');
      const confirmError = page.locator('#signup-passwordConfirm-error');

      // Short password (less than 8 chars)
      await pwdInput.fill('1234');
      await pwdInput.dispatchEvent('focusout');
      assert.equal(await pwdError.isVisible(), true, 'Password length error displayed inline');
      assert.ok((await pwdError.textContent()).includes('at least 8 characters'), 'Password error specifies minimum length');
      assert.equal(await pwdInput.getAttribute('aria-invalid'), 'true', 'Password aria-invalid is true');

      // Valid password length but mismatching confirmation
      await pwdInput.fill('ValidPassword123');
      await pwdInput.dispatchEvent('focusout');
      assert.equal(await pwdError.isVisible(), false, 'Password error is hidden when length >= 8');

      await confirmInput.fill('DifferentPass123');
      await confirmInput.dispatchEvent('focusout');
      assert.equal(await confirmError.isVisible(), true, 'Confirm password error is visible on mismatch');
      assert.equal(await confirmError.textContent(), 'Passwords do not match.', 'Mismatch error message displayed');

      // Matching password
      await confirmInput.fill('ValidPassword123');
      await confirmInput.dispatchEvent('focusout');
      assert.equal(await confirmError.isVisible(), false, 'Confirm password error is hidden when matching');
      assert.equal(await confirmInput.getAttribute('aria-invalid'), 'false', 'aria-invalid is false');
    });

    // 5. Validation: Legal agreement checkbox requirement
    await t.test('Legal consent checkbox validation', async () => {
      const legalCheckbox = page.locator('#authLegalConsent');
      const legalError = page.locator('#signup-legalConsent-error');

      // Try triggering validation while unchecked
      await page.evaluate(() => {
        const cb = document.getElementById('authLegalConsent');
        if (window.validateSignupInput) window.validateSignupInput(cb);
      });
      assert.equal(await legalError.isVisible(), true, 'Legal consent error is displayed when unchecked');
      assert.ok((await legalError.textContent()).includes('Terms of Use and Privacy Policy'), 'Consent message displayed');

      // Check the checkbox by clicking its custom control
      await page.locator('.star-checkbox-control').click();
      assert.equal(await legalCheckbox.isChecked(), true, 'Checkbox is checked after click');
      assert.equal(await legalError.isVisible(), false, 'Legal consent error is hidden when checked');
    });

    // 6. Star checkbox visual activation
    await t.test('Celestial star checkbox visual activation', async () => {
      const legalCheckbox = page.locator('#authLegalConsent');
      const starControl = page.locator('.star-checkbox-control');
      const starSvg = page.locator('.auth-legal-consent .star-svg');

      if (await legalCheckbox.isChecked()) {
        await starControl.click();
        await page.waitForTimeout(350);
      }
      assert.equal(await legalCheckbox.isChecked(), false, 'Checkbox is unchecked');
      let starOpacity = await starSvg.evaluate((el) => getComputedStyle(el).opacity);
      assert.equal(starOpacity, '0', 'Star is hidden when unchecked');

      await starControl.click();
      await page.waitForTimeout(350);
      assert.equal(await legalCheckbox.isChecked(), true, 'Checkbox is checked');
      starOpacity = await starSvg.evaluate((el) => getComputedStyle(el).opacity);
      assert.equal(starOpacity, '1', 'Star is visible when checked');
    });

    // 7. Legal document modal dialogs (Terms of Use and Privacy Policy)
    await t.test('Terms of Use and Privacy Policy modal dialogs', async () => {
      const termsBtn = page.locator('.auth-legal-consent [data-legal="terms"]');
      await termsBtn.click();

      const modal = page.locator('#authLegalModal');
      await modal.waitFor({ state: 'visible' });
      assert.ok((await modal.locator('.auth-legal-modal-title').textContent()).includes('Terms of Use'), 'Modal shows Terms of Use');

      // Close modal using Got it button
      const gotItBtn = modal.locator('[data-legal-close]').last();
      await gotItBtn.click();
      await modal.waitFor({ state: 'detached' });

      // Open Privacy Policy
      const privacyBtn = page.locator('.auth-legal-consent [data-legal="privacy"]');
      await privacyBtn.click();

      const privacyModal = page.locator('#authLegalModal');
      await privacyModal.waitFor({ state: 'visible' });
      assert.ok((await privacyModal.locator('.auth-legal-modal-title').textContent()).includes('Privacy Policy'), 'Modal shows Privacy Policy');

      // Close modal using ✕ button
      const closeBtn = privacyModal.locator('.auth-legal-modal-close');
      await closeBtn.click();
      await privacyModal.waitFor({ state: 'detached' });
    });

    // 8. Post-registration notice on login screen (Alert banner)
    await t.test('Post-registration notice styled as alert banner with star badge', async () => {
      // Simulate registration redirect with flash message
      await page.evaluate(() => {
        sessionStorage.setItem('enquiz-auth-flash', 'Registration successful.\nWaiting for teacher approval before you can sign in.');
        if (window.paintAccountForm) window.paintAccountForm(false);
      });

      await page.waitForSelector('#loginForm', { state: 'visible' });

      const alertBanner = page.locator('.account-gate .auth-alert');
      await alertBanner.waitFor({ state: 'visible' });

      const starBadge = alertBanner.locator('.auth-alert-icon-wrap');
      assert.equal(await starBadge.isVisible(), true, 'Star badge ✦ is visible in alert');
      assert.equal(await starBadge.textContent(), '✦', 'Badge shows celestial star');

      const title = alertBanner.locator('.auth-alert-title');
      assert.equal(await title.textContent(), 'Registration successful', 'Alert title is Registration successful');

      const subtext = alertBanner.locator('.auth-alert-text');
      assert.equal(await subtext.textContent(), 'Waiting for teacher approval before you can sign in.', 'Alert subtext is correct');

      // Verify alert banner does not look like an input box (has border radius, distinctive styling)
      const alertStyle = await alertBanner.evaluate((el) => {
        const s = getComputedStyle(el);
        return { display: s.display, borderRadius: s.borderRadius };
      });
      assert.equal(alertStyle.display, 'flex', 'Alert banner uses flex display');
      assert.equal(alertStyle.borderRadius, '8px', 'Alert banner has 8px border radius');
    });

  } finally {
    await browser?.close();
    await preview.close();
  }
});
