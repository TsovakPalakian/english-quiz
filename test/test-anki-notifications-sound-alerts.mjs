import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';
const { chromium } = playwright;

const rootDir = process.cwd();

test('Unit test for sound alert timings, notification preferences, and Anki next due', async () => {
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
      '.json': 'application/json'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/preview.html`;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(targetUrl);
    await page.waitForLoadState('networkidle');

    const results = await page.evaluate(() => {
      localStorage.clear();

      // 1. Check default timings
      const defaultTimings = typeof window.getSoundAlertTimings === 'function' ? window.getSoundAlertTimings() : null;

      // 2. Format timing tests
      const fmt3h = typeof window.formatAlertTiming === 'function' ? window.formatAlertTiming(180) : '';
      const fmt1h = typeof window.formatAlertTiming === 'function' ? window.formatAlertTiming(60) : '';
      const fmt15m = typeof window.formatAlertTiming === 'function' ? window.formatAlertTiming(15) : '';
      const fmt5m = typeof window.formatAlertTiming === 'function' ? window.formatAlertTiming(5) : '';

      // 3. Save custom timings
      if (typeof window.saveSoundAlertTimings === 'function') {
        window.saveSoundAlertTimings([180, 60, 30, 15, 5]);
      }
      const updatedTimings = typeof window.getSoundAlertTimings === 'function' ? window.getSoundAlertTimings() : null;

      // 4. Anki next due setting
      if (typeof window.setAnkiNextDue === 'function') {
        window.setAnkiNextDue({
          count: 2,
          stage: 'Due tomorrow',
          timeDesc: 'tomorrow at 10:00',
          dueAt: Date.now() + 86400000
        });
      }
      const storedAnkiRaw = localStorage.getItem('lumiscia-anki-next-due');
      const storedAnki = storedAnkiRaw ? JSON.parse(storedAnkiRaw) : null;

      // 5. Check active notifications contain Anki cards
      if (typeof window.openLessonNotifications === 'function') {
        window.openLessonNotifications();
      }
      const notifyCards = [...document.querySelectorAll('.lesson-notify-card')];
      const ankiCard = notifyCards.find(c => c.textContent.includes('Anki cards'));
      const ankiCardTitle = ankiCard ? ankiCard.querySelector('.lesson-notify-card-title')?.textContent : '';
      const ankiCardStage = ankiCard ? ankiCard.querySelector('.lesson-notify-card-stage')?.textContent : '';

      // 6. Check sound alert section rendered in modal
      const schedSec = document.getElementById('notifyAudioScheduleSection');
      const chips = schedSec ? [...schedSec.querySelectorAll('.lesson-notify-chip')].map(c => c.textContent.trim()) : [];
      const addBtn = document.getElementById('notifyAddAlertBtn');

      return {
        defaultTimings,
        fmt3h,
        fmt1h,
        fmt15m,
        fmt5m,
        updatedTimings,
        storedAnki,
        hasAnkiCard: !!ankiCard,
        ankiCardTitle,
        ankiCardStage,
        hasSchedSec: !!schedSec,
        chips,
        hasAddBtn: !!addBtn
      };
    });

    assert.deepEqual(results.defaultTimings, [180, 60, 15, 5], 'Default timings should be 180, 60, 15, 5');
    assert.equal(results.fmt3h, '3h before', '180 minutes should format as 3h before');
    assert.equal(results.fmt1h, '1h before', '60 minutes should format as 1h before');
    assert.equal(results.fmt15m, '15m before', '15 minutes should format as 15m before');
    assert.equal(results.fmt5m, '5m before', '5 minutes should format as 5m before');
    assert.deepEqual(results.updatedTimings, [180, 60, 30, 15, 5], 'Updated timings should be saved and returned in descending order');
    assert.equal(results.storedAnki?.count, 2, 'Stored Anki due count should match');
    assert.equal(results.hasAnkiCard, true, 'Modal should contain Anki cards reminder');
    assert.equal(results.ankiCardTitle, 'Anki cards · Spaced repetition', 'Anki title should match');
    assert.equal(results.ankiCardStage, 'Due tomorrow', 'Stage should be Due tomorrow');
    assert.equal(results.hasSchedSec, true, 'Modal should have sound alert timing schedule section');
    assert.equal(results.hasAddBtn, true, 'Modal should have + Add alert button');
    assert.equal(results.chips.length, 5, 'Should render 5 chips for 5 timings');
  } finally {
    await browser.close();
    server.close();
  }
});
