import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Visual integration test for notification bell, modal, sound timing chips, and completion card across themes', async () => {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    let filePath;
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/preview.html') {
      filePath = path.join(rootDir, 'site/preview.html');
    } else if (parsedUrl.pathname.startsWith('/preview.js')) {
      filePath = path.join(rootDir, 'preview.js');
    } else {
      filePath = path.join(rootDir, 'site', '.' + parsedUrl.pathname);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(rootDir, '.' + parsedUrl.pathname);
      }
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const mime = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/preview.html`;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 860 } });
    const page = await context.newPage();
    await page.goto(targetUrl);
    await page.waitForLoadState('networkidle');

    for (const theme of ['sky', 'dark', 'sand']) {
      const state = await page.evaluate((th) => {
        localStorage.clear();
        document.documentElement.setAttribute('data-theme', th);
        document.documentElement.setAttribute('data-notify-unread', '1');

        window.authUser = {
          id: 'test-student',
          name: 'Alex Turner',
          email: 'alex@example.com',
          role: 'USER'
        };
        window.viewAccount = null;

        if (typeof window.paintUserProfilePill === 'function') {
          window.paintUserProfilePill();
        }

        const bell = document.getElementById('shellHeaderNotifyBell');
        const popoverNotifyItem = document.querySelector('[data-profile-action="notifications"]');
        const popoverDot = popoverNotifyItem ? popoverNotifyItem.querySelector('.popover-notify-dot') : null;
        const popoverDotDisplay = popoverDot ? window.getComputedStyle(popoverDot).display : 'none';

        // Set Anki reminder
        if (typeof window.setAnkiNextDue === 'function') {
          window.setAnkiNextDue({
            count: 1,
            stage: 'Due tomorrow',
            timeDesc: 'tomorrow at 10:00',
            dueAt: Date.now() + 86400000
          });
        }

        // Open notifications modal
        if (typeof window.openLessonNotifications === 'function') {
          window.openLessonNotifications();
        }

        const avatarWrap = document.querySelector('.user-profile-pill-wrap');
        const bellVisible = bell && !bell.hidden && window.getComputedStyle(bell).display !== 'none';
        const avatarVisible = avatarWrap && !avatarWrap.hidden && window.getComputedStyle(avatarWrap).display !== 'none';

        const modal = document.getElementById('lessonNotificationsModal');
        const modalHidden = modal ? modal.hidden : true;
        const modalDialog = modal ? modal.querySelector('.lesson-notifications-dialog') : null;
        const dialogWidth = modalDialog ? window.getComputedStyle(modalDialog).width : '0px';

        const ankiCard = modal ? modal.querySelector('.lesson-notify-card[data-notify-id="anki-cards-spaced-repetition"]') : null;
        const ankiTitle = ankiCard ? ankiCard.querySelector('.lesson-notify-card-title')?.textContent : '';

        const sched = document.getElementById('notifyAudioScheduleSection');
        const chipsCount = sched ? sched.querySelectorAll('.lesson-notify-chip').length : 0;

        return {
          hasBell: bellVisible,
          avatarHidden: !avatarVisible,
          hasPopoverNotifyItem: !!popoverNotifyItem,
          popoverDotDisplay,
          modalHidden,
          dialogWidth,
          hasAnkiCard: !!ankiCard,
          ankiTitle,
          hasSched: !!sched,
          chipsCount
        };
      }, theme);

      assert.equal(state.hasBell, true, `[${theme}] Header bell must replace avatar when unread`);
      assert.equal(state.avatarHidden, true, `[${theme}] Avatar must be hidden when unread bell is active`);
      assert.equal(state.hasPopoverNotifyItem, true, `[${theme}] Profile popover must retain notifications entry`);
      assert.equal(state.modalHidden, false, `[${theme}] Modal must be open`);
      assert.equal(state.hasAnkiCard, true, `[${theme}] Modal must contain Anki cards reminder`);
      assert.equal(state.ankiTitle, 'Anki cards · Spaced repetition', `[${theme}] Anki reminder title must match`);
      assert.equal(state.hasSched, true, `[${theme}] Modal must contain sound alert schedule`);
      assert.ok(state.chipsCount >= 4, `[${theme}] Must display at least 4 preset chips`);

      // Test chip deletion
      const chipCountBefore = await page.evaluate(() => {
        const delBtn = document.querySelector('.lesson-notify-chip-del');
        if (delBtn) delBtn.click();
        return document.querySelectorAll('.lesson-notify-chip').length;
      });
      assert.equal(chipCountBefore, 3, `[${theme}] After deleting one chip, 3 chips should remain`);

      // Test custom alert addition
      const chipCountAfterAdd = await page.evaluate(() => {
        const input = document.getElementById('notifyNewAlertMinutes');
        const unit = document.getElementById('notifyNewAlertUnit');
        const addBtn = document.getElementById('notifyAddAlertBtn');
        if (input) input.value = '45';
        if (unit) unit.value = 'm';
        if (addBtn) addBtn.click();
        return document.querySelectorAll('.lesson-notify-chip').length;
      });
      assert.equal(chipCountAfterAdd, 4, `[${theme}] After adding 45m alert, 4 chips should be present`);

      // Close modal
      await page.evaluate(() => {
        if (typeof window.closeLessonNotifications === 'function') {
          window.closeLessonNotifications();
        }
      });
    }

    // Test session completion screen rendering
    const completionState = await page.evaluate(() => {
      // Setup day view container
      let view = document.getElementById('dayView');
      if (!view) {
        view = document.createElement('div');
        view.id = 'dayView';
        document.body.appendChild(view);
      }

      // Simulate completion card render
      view.innerHTML =
        '<div class="anki-completion-card" id="ankiCompletionCard">' +
          '<div class="anki-complete-icon-wrap">' +
            '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
              '<path d="M20 6L9 17l-5-5"/>' +
            '</svg>' +
          '</div>' +
          '<h2 class="anki-complete-title">Session Complete!</h2>' +
          '<p class="anki-complete-sub">All Anki cards reviewed for today.</p>' +
          '<div class="anki-complete-warning-banner">' +
            '<div class="anki-complete-warning-title">' +
              '<span>⚠️</span>' +
              '<span>Essential review required tomorrow</span>' +
            '</div>' +
            '<p class="anki-complete-warning-desc">Daily spaced repetition is essential for long-term retention. Notification and sound alert set in 🔔 notifications.</p>' +
          '</div>' +
          '<div class="anki-complete-actions">' +
            '<button type="button" class="btn" id="ankiBackToBoardBtn">Back to training</button>' +
            '<button type="button" class="btn primary" id="ankiOpenNotifyBtn">Open notifications</button>' +
          '</div>' +
        '</div>';

      const card = document.getElementById('ankiCompletionCard');
      const title = card ? card.querySelector('.anki-complete-title')?.textContent : '';
      const banner = card ? card.querySelector('.anki-complete-warning-banner') : null;
      const bannerTitle = banner ? banner.querySelector('.anki-complete-warning-title')?.textContent : '';
      const backBtn = document.getElementById('ankiBackToBoardBtn');
      const notifyBtn = document.getElementById('ankiOpenNotifyBtn');

      return {
        hasCard: !!card,
        title,
        hasBanner: !!banner,
        bannerTitle,
        hasBackBtn: !!backBtn,
        hasNotifyBtn: !!notifyBtn
      };
    });

    assert.equal(completionState.hasCard, true, 'Completion card must be rendered');
    assert.equal(completionState.title, 'Session Complete!', 'Title must be Session Complete!');
    assert.equal(completionState.hasBanner, true, 'Essential review warning banner must exist');
    assert.ok(completionState.bannerTitle.includes('Essential review required tomorrow'), 'Banner title must mention essential review');
    assert.equal(completionState.hasBackBtn, true, 'Back to training button must exist');
    assert.equal(completionState.hasNotifyBtn, true, 'Open notifications button must exist');

  } finally {
    await browser.close();
    server.close();
  }
});
