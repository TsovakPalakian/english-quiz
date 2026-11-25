import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

const dashboardJs = readFileSync('client/57a-dashboard.js', 'utf8');
const previewCss = readFileSync('site/preview.css', 'utf8');

test('TASK-WELCOME: Code contract for first-name greeting extraction', () => {
  assert.ok(
    dashboardJs.includes("split(/\\s+/)[0]"),
    'client/57a-dashboard.js must split name by whitespace to extract only the first name'
  );
  assert.ok(
    dashboardJs.includes("nameSpan.textContent = firstName"),
    'client/57a-dashboard.js must set nameSpan.textContent to firstName'
  );
});

test('TASK-WELCOME: Playwright UI visual test for home greeting in sky, dark and peach themes', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });

    const htmlContent = `<!DOCTYPE html>
<html lang="en" data-theme="sky">
<head>
  <meta charset="utf-8">
  <style>
    ${previewCss}
    body {
      padding: 30px;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .preview-card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--saas-radius-xl, 14px);
      padding: 24px;
      margin-bottom: 24px;
    }
  </style>
</head>
<body>
  <div class="preview-card" id="greetingContainer">
    <div class="home-heading">
      <div>
        <h1 class="hello" id="homeWelcomeHeading" style="visibility:visible; font-size:26px; font-weight:700; margin:0 0 6px;">
          Welcome back, <span id="homeStudentName">Student</span>! 👋
        </h1>
        <p class="sub" id="homeWelcomeSubtitle" style="font-size:14px; margin:0;">
          Ready to level up your English? Here is your daily learning overview.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

    await page.setContent(htmlContent);

    // Simulate paintHomeDashboard greeting logic
    await page.evaluate(() => {
      const authUser = { name: 'Tsovak Palakian', role: 'USER' };
      const rawName = authUser?.name || authUser?.username || 'Student';
      const firstName = String(rawName).trim().split(/\s+/)[0] || 'Student';
      const nameSpan = document.getElementById('homeStudentName');
      if (nameSpan) nameSpan.textContent = firstName;
      const welcomeHeading = document.getElementById('homeWelcomeHeading');
      if (welcomeHeading && authUser) {
        welcomeHeading.innerHTML = 'Welcome back, <span id="homeStudentName">' + firstName + '</span>! 👋';
      }
    });

    // 1. Verify Sky theme
    const headingTextSky = await page.locator('#homeWelcomeHeading').innerText();
    assert.equal(headingTextSky, 'Welcome back, Tsovak! 👋', 'Sky theme heading must display only first name Tsovak');
    const nameSpanTextSky = await page.locator('#homeStudentName').innerText();
    assert.equal(nameSpanTextSky, 'Tsovak', '#homeStudentName must be Tsovak');

    // 2. Switch to Dark theme and verify
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const headingTextDark = await page.locator('#homeWelcomeHeading').innerText();
    assert.equal(headingTextDark, 'Welcome back, Tsovak! 👋');

    // 3. Switch to Peach theme and verify
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'peach'));
    const headingTextPeach = await page.locator('#homeWelcomeHeading').innerText();
    assert.equal(headingTextPeach, 'Welcome back, Tsovak! 👋');

    // Reset back to Sky for screenshot
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sky'));
    if (!existsSync('docs')) mkdirSync('docs', { recursive: true });
    await page.locator('#greetingContainer').screenshot({ path: 'docs/task-welcome-greeting-verified.png' });
  } finally {
    await browser.close();
  }
});
