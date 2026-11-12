import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const rootDir = process.cwd();

test('Stage 18: Voice Mode AI Tutor & Speaking Examiner markup and controls', () => {
  const html = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');

  // 1. Interactive Bar trigger
  assert.ok(html.includes('id="lmVoiceModeBar"'), '#lmVoiceModeBar exists in HTML');
  assert.ok(html.includes('role="button"'), 'Voice bar has role=button');
  assert.ok(html.includes('tabindex="0"'), 'Voice bar has tabindex=0 for keyboard accessibility');
  assert.ok(html.includes('Speaking Examiner'), 'Voice bar reflects Speaking Examiner renaming');

  // 2. Modal structure
  assert.ok(html.includes('id="lmVoiceModeModal"'), '#lmVoiceModeModal exists');
  assert.ok(html.includes('id="lmVoiceRoleTutorBtn"'), '#lmVoiceRoleTutorBtn exists');
  assert.ok(html.includes('id="lmVoiceRoleExaminerBtn"'), '#lmVoiceRoleExaminerBtn exists');
  assert.ok(html.includes('Speaking Examiner'), 'Modal role button reflects Speaking Examiner');
  assert.ok(html.includes('id="lmVoiceTimer"'), '#lmVoiceTimer exists');
  assert.ok(html.includes('id="lmVoiceDialogueHistory"'), '#lmVoiceDialogueHistory exists');
  assert.ok(html.includes('id="lmVoiceTextInput"'), '#lmVoiceTextInput exists');
  assert.ok(html.includes('id="lmVoiceSendBtn"'), '#lmVoiceSendBtn exists');
  assert.ok(html.includes('id="lmVoiceMicBtn"'), '#lmVoiceMicBtn exists');
});

test('Stage 18: Voice Mode interactive browser flows (Playwright)', async () => {
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
    if (!fs.existsSync(filePath)) {
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
    const context = await browser.newContext({ viewport: { width: 1000, height: 750 } });
    const page = await context.newPage();

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    await page.evaluate(() => {
      document.getElementById('learning-main-banner')?.remove();
      document.body.removeAttribute('data-shell-pending');
      document.querySelectorAll('section.on').forEach(s => s.classList.remove('on'));
      const mat = document.getElementById('material');
      if (mat) {
        mat.classList.add('on');
        mat.style.display = 'flex';
      }
      window.lmState = {
        title: 'Weather and Climate',
        blocks: [
          { id: 'b1', type: 'vocab', word: 'precipitation' },
          { id: 'b2', type: 'rule', title: 'Conditional sentences' }
        ]
      };
      if (typeof window.lmRenderEditor === 'function') window.lmRenderEditor();
    });

    await page.waitForTimeout(300);

    // 1. Verify clicking #lmVoiceModeBar opens modal
    const initialModalDisplay = await page.evaluate(() => document.getElementById('lmVoiceModeModal')?.style.display);
    assert.strictEqual(initialModalDisplay, 'none', 'Modal is hidden initially');

    await page.click('#lmVoiceModeBar');
    await page.waitForTimeout(300);

    const openedModalDisplay = await page.evaluate(() => document.getElementById('lmVoiceModeModal')?.style.display);
    assert.strictEqual(openedModalDisplay, 'flex', 'Clicking #lmVoiceModeBar opened the modal');

    // 2. Verify Timer started
    await page.waitForTimeout(1100);
    const timerText = await page.evaluate(() => document.getElementById('lmVoiceTimer')?.textContent);
    assert.match(timerText || '', /^00:0[1-9]/, 'Timer is counting up');

    // 3. Switch to Speaking Examiner mode
    await page.click('#lmVoiceRoleExaminerBtn');
    await page.waitForTimeout(300);

    const examinerHistory = await page.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('#lmVoiceDialogueHistory .voice-msg'));
      return msgs.map(m => m.textContent);
    });
    assert.ok(
      examinerHistory.some(m => m.includes('Speaking Examination started') && m.includes('precipitation')),
      'Examiner uses authentic lesson vocabulary in Question 1'
    );

    // 4. Send student answer to Question 1
    await page.fill('#lmVoiceTextInput', 'Precipitation means water falling from clouds like rain or snow.');
    await page.click('#lmVoiceSendBtn');
    await page.waitForTimeout(800);

    const examinerFollowup = await page.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('#lmVoiceDialogueHistory .voice-msg'));
      return msgs.map(m => m.textContent);
    });
    assert.ok(
      examinerFollowup.some(m => m.includes('Question 2:')),
      'Examiner evaluates answer and advances to Question 2'
    );

    // 5. Switch back to AI Tutor mode
    await page.click('#lmVoiceRoleTutorBtn');
    await page.waitForTimeout(300);

    const tutorHistory = await page.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('#lmVoiceDialogueHistory .voice-msg'));
      return msgs.map(m => m.textContent);
    });
    assert.ok(
      tutorHistory.some(m => m.includes('AI Tutor: Hello!')),
      'Switched cleanly back to AI Tutor mode'
    );

    // 6. Test natural dialogue on "How are you" (not repetitive template!)
    await page.fill('#lmVoiceTextInput', 'How are you?');
    await page.click('#lmVoiceSendBtn');
    await page.waitForTimeout(800);

    const afterHowAreYou = await page.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('#lmVoiceDialogueHistory .voice-msg'));
      return msgs.map(m => m.textContent);
    });
    assert.ok(
      afterHowAreYou.some(m => m.includes('doing well') || m.includes('doing great')),
      'AI Tutor provides warm natural greeting reply instead of robotic template'
    );

    // 7. Test rapid duplicate submission prevention
    await page.evaluate(() => {
      // Simulate rapid duplicate dispatches
      if (typeof window.voiceSubmitUserText === 'function') {
        window.voiceSubmitUserText('Test phrase');
        window.voiceSubmitUserText('Test phrase');
        window.voiceSubmitUserText('Test phrase');
      }
    });
    await page.waitForTimeout(600);

    const userMessageCount = await page.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('#lmVoiceDialogueHistory .voice-msg.user'));
      return msgs.filter(m => m.textContent.includes('Test phrase')).length;
    });
    assert.strictEqual(userMessageCount, 1, 'Duplicate rapid submissions are deduplicated to exactly 1 message bubble');

    // 8. Close Voice Mode cleanly
    await page.click('#lmVoiceCloseBtn');
    await page.waitForTimeout(200);

    const closedModalDisplay = await page.evaluate(() => document.getElementById('lmVoiceModeModal')?.style.display);
    assert.strictEqual(closedModalDisplay, 'none', 'Modal closed cleanly');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
