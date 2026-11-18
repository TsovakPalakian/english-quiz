import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLessonFromText } from '../src/lesson-pdf-meta.mjs';
import { chromium } from '../node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Natural Language Command Ingestion: generateLessonFromText parses bare multi-word phrases and autogenerates translations', async () => {
  const input = `Добавь эти слова или фразы\nmake future plans\nmake a to-do list\nplan things in advance`;
  const result = await generateLessonFromText({ text: input, level: 'B1' });

  assert.ok(Array.isArray(result.phrases), 'Result should include phrases array');
  assert.ok(result.phrases.length >= 3, `Expected at least 3 phrases, got ${result.phrases.length}`);

  const p1 = result.phrases.find(p => p.phrase === 'make future plans');
  assert.ok(p1, 'Should find "make future plans" in phrases');
  assert.equal(p1.translation, 'строить планы на будущее');
  assert.ok(p1.example && p1.example.length > 5, 'Should generate contextual example sentence');

  const p2 = result.phrases.find(p => p.phrase === 'make a to-do list');
  assert.ok(p2, 'Should find "make a to-do list" in phrases');
  assert.equal(p2.translation, 'составить список дел');

  const p3 = result.phrases.find(p => p.phrase === 'plan things in advance');
  assert.ok(p3, 'Should find "plan things in advance" in phrases');
  assert.equal(p3.translation, 'планировать всё заранее');
});

test('Natural Language Command Ingestion: single words are routed to Words collection with translations', async () => {
  const input = `Добавь слова:\nserendipity\ncommute\ndetour`;
  const result = await generateLessonFromText({ text: input, level: 'B1' });

  assert.ok(Array.isArray(result.words), 'Result should include words array');
  assert.ok(result.words.length >= 3, `Expected at least 3 words, got ${result.words.length}`);

  const w1 = result.words.find(w => w.word === 'serendipity');
  assert.ok(w1, 'Should find "serendipity" in words');
  assert.equal(w1.translation, 'счастливая случайность');

  const w2 = result.words.find(w => w.word === 'commute');
  assert.ok(w2, 'Should find "commute" in words');
  assert.equal(w2.translation, 'ежедневная поездка на работу');

  const w3 = result.words.find(w => w.word === 'detour');
  assert.ok(w3, 'Should find "detour" in words');
  assert.equal(w3.translation, 'объезд');
});

test('Natural Language Command Ingestion: rules are routed to Rules collection', async () => {
  const input = `Rule: Present Perfect vs Past Simple\nmake future plans`;
  const result = await generateLessonFromText({ text: input, level: 'B1' });

  assert.ok(Array.isArray(result.rules), 'Result should include rules array');
  const r1 = result.rules.find(r => r.title.includes('Present Perfect'));
  assert.ok(r1, 'Should extract rule');

  const p1 = result.phrases.find(p => p.phrase === 'make future plans');
  assert.ok(p1, 'Should extract phrase alongside rule');
});

test('Visual and UI Integration: Manual Script command approval gate and execution into lesson state', async () => {
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

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Initialize active lesson in append mode with existing counts: Words · 6, Phrases · 6, Rules · 2
    const initialStats = await page.evaluate(() => {
      document.body.removeAttribute('data-shell-pending');
      document.querySelectorAll('.main > section, .wrap > section').forEach(s => {
        s.classList.remove('on');
        s.style.display = 'none';
      });
      const mat = document.getElementById('material');
      if (mat) {
        mat.classList.add('on');
        mat.style.display = 'block';
      }

      // Set initial dummy blocks in lmState
      if (!window.lmState) {
        window.lmState = { id: 'test_material', blocks: [] };
      } else {
        window.lmState.blocks = [];
      }
      for (let i = 1; i <= 6; i++) {
        window.lmState.blocks.push({ id: 'w_' + i, type: 'wordcard', tab: 'words', word: 'word' + i, ru: 'слово' + i });
      }
      for (let i = 1; i <= 6; i++) {
        window.lmState.blocks.push({ id: 'p_' + i, type: 'phrase', tab: 'phrases', items: [{ phrase: 'phrase ' + i, meaning: 'фраза ' + i }] });
      }
      for (let i = 1; i <= 2; i++) {
        window.lmState.blocks.push({ id: 'r_' + i, type: 'rule', tab: 'rules', title: 'Rule ' + i });
      }

      // Switch to Manual Script tab
      if (typeof window.lmSwitchImportTab === 'function') {
        window.lmSwitchImportTab('script');
      }

      return typeof window.lmBlockCounts === 'function' ? window.lmBlockCounts(window.lmState) : null;
    });

    assert.equal(initialStats?.phrases, 6, 'Initial phrases should be 6');
    assert.equal(initialStats?.words, 6, 'Initial words should be 6');
    assert.equal(initialStats?.rules, 2, 'Initial rules should be 2');

    // Input command without translations
    await page.evaluate(() => {
      const input = document.getElementById('lmScriptInput');
      if (input) {
        input.value = 'Добавь эти слова или фразы\nmake future plans\nmake a to-do list\nplan things in advance';
      }
    });

    // Call lmMountScriptApprovalGate directly to simulate command execution
    await page.evaluate(() => {
      const data = {
        phrases: [
          { phrase: 'make future plans', meaning: 'строить планы на будущее', translation: 'строить планы на будущее', example: 'It is essential to make future plans.' },
          { phrase: 'make a to-do list', meaning: 'составить список дел', translation: 'составить список дел', example: 'Every morning I make a to-do list.' },
          { phrase: 'plan things in advance', meaning: 'планировать всё заранее', translation: 'планировать всё заранее', example: 'She always prefers to plan things in advance.' }
        ]
      };
      if (typeof window.lmMountScriptApprovalGate === 'function') {
        window.lmMountScriptApprovalGate(data, 'Добавь эти слова или фразы...');
      }
    });

    // Verify Approval Gate is visible
    const isApprovalVisible = await page.evaluate(() => {
      const wrap = document.getElementById('lmScriptApprovalWrap');
      return wrap && getComputedStyle(wrap).display !== 'none';
    });
    assert.ok(isApprovalVisible, 'Approval Gate wrap should be visible');

    // Capture verification screenshot
    const rect = await page.evaluate(() => {
      const box = document.getElementById('lmFrameImport').getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    });
    await page.screenshot({
      path: path.join(rootDir, 'docs/task-manual-script-ai-agent-screenshot-verification.png'),
      clip: rect
    });

    // Click Approve & Add to Lesson
    await page.evaluate(() => {
      const approveBtn = document.getElementById('lmCommandApproveBtn');
      if (approveBtn) approveBtn.click();
    });

    // Verify lesson state updated: phrases changed from 6 to 9
    const updatedStats = await page.evaluate(() => {
      return typeof window.lmBlockCounts === 'function' ? window.lmBlockCounts(window.lmState) : null;
    });

    assert.equal(updatedStats?.phrases, 9, 'Updated phrases count should be exactly 9 (6 + 3)');
    assert.equal(updatedStats?.words, 6, 'Words count should remain 6');
    assert.equal(updatedStats?.rules, 2, 'Rules count should remain 2');

    // Verify success banner is shown with Undo button
    const isSuccessVisible = await page.evaluate(() => {
      const wrap = document.getElementById('lmScriptSuccessWrap');
      const text = document.getElementById('lmScriptSuccessText');
      return wrap && getComputedStyle(wrap).display === 'flex' && text && text.textContent.includes('Successfully added');
    });
    assert.ok(isSuccessVisible, 'Success banner should be visible with confirmation message');

    // Test Undo functionality
    await page.evaluate(() => {
      const undoBtn = document.getElementById('lmScriptUndoBtn');
      if (undoBtn) undoBtn.click();
    });

    const revertedStats = await page.evaluate(() => {
      return typeof window.lmBlockCounts === 'function' ? window.lmBlockCounts(window.lmState) : null;
    });

    assert.equal(revertedStats?.phrases, 6, 'Phrases should be reverted back to 6 on undo');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
