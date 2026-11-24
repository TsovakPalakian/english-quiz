import {launchChromium, resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';
import {resolve} from 'node:path';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));
const preview = await previewAuthStudio();
let browser;

try {
  browser = await launchChromium(chromium);
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  // 1. Visit home page and verify banner appears
  await page.goto(preview.url + '/#home');
  const banner = page.locator('#cookieConsentBanner');
  await banner.waitFor({state: 'visible', timeout: 5000});

  // Verify elements exist
  const acceptBtn = banner.locator('#cookieAcceptBtn');
  const partialBtn = banner.locator('#cookiePartialBtn');
  const declineBtn = banner.locator('#cookieDeclineBtn');
  const dismissBtn = banner.locator('#cookieDismissBtn');

  assert.equal(await acceptBtn.isVisible(), true, 'Accept all button must be visible');
  assert.equal(await partialBtn.isVisible(), true, 'Essential button must be visible');
  assert.equal(await declineBtn.isVisible(), true, 'Decline button must be visible');
  assert.equal(await dismissBtn.isVisible(), true, 'Dismiss button must be visible');

  // Verify banner does not overlap the footer copyright text
  const positions = await page.evaluate(() => {
    const b = document.getElementById('cookieConsentBanner')?.getBoundingClientRect();
    const f = document.querySelector('footer')?.getBoundingClientRect();
    return {bannerBottom: b?.bottom, footerTop: f?.top};
  });
  assert.ok(positions.bannerBottom, 'Banner must have a valid bounding rect');
  if (positions.footerTop) {
    assert.ok(
      positions.bannerBottom <= positions.footerTop,
      `Banner bottom (${positions.bannerBottom}) must not overlap footer top (${positions.footerTop})`
    );
  }

  // 2. Capture verification screenshots across themes
  const rootDir = resolve('.');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sky'));
  await page.waitForTimeout(100);
  await page.screenshot({path: resolve(rootDir, 'docs/task-9-screenshot-1-sky.png')});

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(100);
  await page.screenshot({path: resolve(rootDir, 'docs/task-9-screenshot-2-dark.png')});

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sand'));
  await page.waitForTimeout(100);
  await page.screenshot({path: resolve(rootDir, 'docs/task-9-screenshot-3-sand.png')});

  // 3. Test clicking Accept all
  await acceptBtn.click();
  await page.waitForTimeout(300);
  assert.equal(await banner.count(), 0, 'Banner must be removed after clicking Accept all');

  const storedConsent = await page.evaluate(() => localStorage.getItem('cookie_consent'));
  assert.equal(storedConsent, 'all', 'localStorage cookie_consent must be "all"');

  const cookieVal = await page.evaluate(() => {
    const match = document.cookie.match(/(?:^|;\s*)cookie_consent=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  });
  assert.equal(cookieVal, 'all', 'document.cookie must contain cookie_consent=all');

  // Reload page to verify banner does NOT reappear
  await page.reload();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#cookieConsentBanner').count(), 0, 'Banner must not reappear after consent is saved');

  // 4. Test Essential only choice
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = 'cookie_consent=; Path=/; Max-Age=0';
  });
  await page.reload();
  const banner2 = page.locator('#cookieConsentBanner');
  await banner2.waitFor({state: 'visible', timeout: 5000});

  await banner2.locator('#cookiePartialBtn').click();
  await page.waitForTimeout(300);
  assert.equal(await banner2.count(), 0, 'Banner must be removed after clicking Essential');

  const essentialStored = await page.evaluate(() => localStorage.getItem('cookie_consent'));
  assert.equal(essentialStored, 'essential', 'localStorage cookie_consent must be "essential"');
  const telemetryDisabled = await page.evaluate(() => window.__lumisciaTelemetryDisabled);
  assert.equal(telemetryDisabled, true, 'Telemetry must be disabled on essential only');

  // 5. Test Decline choice
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = 'cookie_consent=; Path=/; Max-Age=0';
  });
  await page.reload();
  const banner3 = page.locator('#cookieConsentBanner');
  await banner3.waitFor({state: 'visible', timeout: 5000});

  await banner3.locator('#cookieDeclineBtn').click();
  await page.waitForTimeout(300);
  assert.equal(await banner3.count(), 0, 'Banner must be removed after clicking Decline');

  const declineStored = await page.evaluate(() => localStorage.getItem('cookie_consent'));
  assert.equal(declineStored, 'declined', 'localStorage cookie_consent must be "declined"');

  // 6. Test Dismiss (✕)
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = 'cookie_consent=; Path=/; Max-Age=0';
  });
  await page.reload();
  const banner4 = page.locator('#cookieConsentBanner');
  await banner4.waitFor({state: 'visible', timeout: 5000});

  await banner4.locator('#cookieDismissBtn').click();
  await page.waitForTimeout(300);
  assert.equal(await banner4.count(), 0, 'Banner must be removed after clicking dismiss ✕');

  const dismissedFlag = await page.evaluate(() => sessionStorage.getItem('cookie_dismissed'));
  assert.equal(dismissedFlag, 'true', 'sessionStorage must have cookie_dismissed="true"');

  // Verify ZERO console errors throughout all tests
  assert.equal(consoleErrors.length, 0, 'Console errors encountered: ' + consoleErrors.join(', '));
  console.log('Cookie consent banner visual and functional test passed successfully!');
} finally {
  await browser?.close();
  await preview.close();
}
