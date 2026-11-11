import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLessonFromText } from '../src/lesson-pdf-meta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('TASK-53: lmParseResourceUrlMeta parses Wordwall Speakout URL correctly', () => {
  const previewJs = fs.readFileSync(path.join(rootDir, 'preview.js'), 'utf8');
  assert.ok(previewJs.includes('lmParseResourceUrlMeta'), 'lmParseResourceUrlMeta should be exported in preview.js');

  const code = fs.readFileSync(path.join(rootDir, 'client/52b-lesson-pdf-import.js'), 'utf8');
  const funcMatch = code.match(/function lmParseResourceUrlMeta\([\s\S]*?\n\}/);
  assert.ok(funcMatch, 'Function lmParseResourceUrlMeta must exist in client/52b-lesson-pdf-import.js');
  const parseFn = new Function(`${funcMatch[0]}; return lmParseResourceUrlMeta;`)();

  const url = 'https://wordwall.net/ru/resource/30978515/english/sointer82-relative-clausesedited';
  const parsed = parseFn(url);
  assert.equal(parsed.unit, '8', 'Unit should be 8');
  assert.equal(parsed.lesson, '2', 'Lesson should be 2');
  assert.equal(parsed.level, 'B1', 'Level should be B1');
  assert.equal(parsed.topic, 'Relative Clauses', 'Topic should be Relative Clauses');
  assert.equal(parsed.title, 'Speakout Intermediate • Unit 8.2 Relative Clauses', 'Title should be formatted properly');

  // Also test Elementary with decimal lesson format
  const parsedElem = parseFn('https://wordwall.net/resource/123/so_elem_3.1_family');
  assert.equal(parsedElem.unit, '3', 'Unit should be 3');
  assert.equal(parsedElem.lesson, '1', 'Lesson should be 1');
  assert.equal(parsedElem.level, 'A2', 'Level should be A2');
  assert.equal(parsedElem.title, 'Speakout Elementary • Unit 3.1 Family');
});

test('TASK-53: generateLessonFromText creates authentic topic words instead of accuracy/fluency stubs', async () => {
  const result = await generateLessonFromText({
    text: 'Title: Speakout Intermediate • Unit 8.2 Relative Clauses\nTopic: Relative clauses\nUnit: 8\nLesson: 2\nLevel: B1',
    title: 'Speakout Intermediate • Unit 8.2 Relative Clauses',
    level: 'B1'
  });

  assert.equal(result.unit, '8', 'Unit should be 8');
  assert.equal(result.lesson, '2', 'Lesson should be 2');
  assert.equal(result.className, 'B1', 'Level should be B1');

  // Verify words are related to relative clauses, NOT accuracy/fluency stubs
  const wordNames = result.words.map(w => w.word);
  assert.ok(wordNames.includes('defining relative clause'), 'Should include defining relative clause');
  assert.ok(wordNames.includes('relative pronoun'), 'Should include relative pronoun');
  assert.ok(!wordNames.includes('accuracy'), 'Must NOT fall back to static accuracy stub');
  assert.ok(!wordNames.includes('fluency'), 'Must NOT fall back to static fluency stub');

  // Verify grammar rule is authentic
  assert.ok(result.rules.length > 0, 'Should have rules');
  assert.ok(/relative clause/i.test(result.rules[0].title), 'Rule title should cover relative clauses');
});

test('TASK-53: generateLessonFromText extracts custom user vocabulary pairs', async () => {
  const result = await generateLessonFromText({
    text: 'Words: laptop - ноутбук, wireless mouse - беспроводная мышь, keyboard - клавиатура\nRule: Computer essentials',
    title: 'Computer Basics',
    level: 'A2'
  });

  assert.equal(result.words.length, 3, 'Should extract exactly 3 words');
  assert.equal(result.words[0].word, 'laptop');
  assert.equal(result.words[0].translation, 'ноутбук');
  assert.equal(result.words[1].word, 'wireless mouse');
  assert.equal(result.words[1].translation, 'беспроводная мышь');
});

test('TASK-53: site/preview.html contains all 4 tabs and elements', () => {
  const html = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');

  // 4 Tabs
  assert.ok(html.includes('id="lmTabBtnFile"'), 'Tab 1 File / PDF button should exist');
  assert.ok(html.includes('id="lmTabBtnUrl"'), 'Tab 2 Web URL button should exist');
  assert.ok(html.includes('id="lmTabBtnScript"'), 'Tab 3 Manual Script button should exist');
  assert.ok(html.includes('id="lmTabBtnLesson"'), 'Tab 4 Complement Lesson button should exist');

  // 4 Panes
  assert.ok(html.includes('id="lmTabPaneFile"'), 'Tab 1 Pane should exist');
  assert.ok(html.includes('id="lmTabPaneUrl"'), 'Tab 2 Pane should exist');
  assert.ok(html.includes('id="lmTabPaneScript"'), 'Tab 3 Pane should exist');
  assert.ok(html.includes('id="lmTabPaneLesson"'), 'Tab 4 Pane should exist');

  // Dropzone text
  assert.ok(html.includes('Drop lesson or exam file / PDF'), 'Centered dropzone inscription should exist');
  assert.ok(html.includes('Direct PDF Analysis:'), 'PDF note box should exist');

  // Web URL controls
  assert.ok(html.includes('id="lmUrlFetchBtn"'), 'URL Fetch button should exist');
  assert.ok(html.includes('Wordwall'), 'Supported Wordwall tag should exist');
  assert.ok(html.includes('Quizlet'), 'Supported Quizlet tag should exist');
  assert.ok(!html.includes('BBC Learning English'), 'BBC Learning English should be removed per user request');

  // Quick templates in Manual Script
  assert.ok(html.includes('data-template="rule"'), 'Quick template for grammar rule should exist');
  assert.ok(html.includes('data-template="vocab"'), 'Quick template for vocabulary should exist');

  // Complement Lesson Pills
  assert.ok(html.includes('id="lmPillClasswork"'), 'Classwork pill button should exist');
  assert.ok(html.includes('id="lmPillHomework"'), 'Homework pill button should exist');
  assert.ok(html.includes('id="lmPillSelectAll"'), 'All 20 selection pill should exist');
  assert.ok(html.includes('id="lmPillDeselectAll"'), 'None selection pill should exist');
  assert.ok(html.includes('id="lmQuizTypesPillCloud"'), 'Quiz types pill cloud container should exist');
  assert.ok(html.includes('id="lmGenerateTasksBtn"'), 'Generate tasks button should exist');
});

test('TASK-53: site/preview.css contains centered dropzone and pill styles', () => {
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');

  assert.ok(css.includes('place-content: center;'), 'Dropzone should have place-content: center');
  assert.ok(css.includes('place-items: center;'), 'Dropzone should have place-items: center');
  assert.ok(css.includes('.lm-tabs-bar'), 'Tabs bar style should exist');
  assert.ok(css.includes('.lm-quiz-pill'), 'Quiz pill style should exist');
  assert.ok(css.includes('.pill-active-blue'), 'Active blue pill style should exist');
  assert.ok(css.includes('.pill-active-coral'), 'Active coral pill style should exist');
  assert.ok(css.includes('.pill-inactive'), 'Inactive pill style should exist');
});

test('TASK-53 Visual DOM: verify interactive tabs and pill toggle in browser', async () => {
  const { chromium } = await import(path.join(rootDir, 'node_modules/playwright/index.mjs')).catch(() => ({ chromium: null }));
  if (!chromium) return;

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
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const page = await context.newPage();

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    await page.evaluate(() => {
      document.getElementById('learning-main-banner')?.remove();
      document.body.removeAttribute('data-shell-pending');
      const mat = document.getElementById('material');
      if (mat) {
        mat.classList.add('on');
        mat.style.display = 'flex';
      }
      const editor = document.getElementById('lmEditor');
      if (editor) editor.style.display = 'block';
      const importFrame = document.getElementById('lmFrameImport');
      if (importFrame) importFrame.style.display = 'block';
      if (typeof window.lmInitImportTabs === 'function') window.lmInitImportTabs();
      if (typeof window.lmInitQuizOptions === 'function') window.lmInitQuizOptions();
    });

    // Tab 1 should be active initially
    const tab1Active = await page.evaluate(() => {
      const btn = document.getElementById('lmTabBtnFile');
      const pane = document.getElementById('lmTabPaneFile');
      return btn?.classList.contains('active') && pane?.style.display !== 'none';
    });
    assert.ok(tab1Active, 'Tab 1 should be active initially');

    // Switch to Tab 2
    const tab2Active = await page.evaluate(() => {
      document.getElementById('lmTabBtnUrl')?.click();
      const btn = document.getElementById('lmTabBtnUrl');
      const pane = document.getElementById('lmTabPaneUrl');
      const pane1 = document.getElementById('lmTabPaneFile');
      return btn?.classList.contains('active') && pane?.style.display === 'block' && pane1?.style.display === 'none';
    });
    assert.ok(tab2Active, 'Tab 2 Web URL should become active upon click');

    // Switch to Tab 3
    const tab3Active = await page.evaluate(() => {
      document.getElementById('lmTabBtnScript')?.click();
      const btn = document.getElementById('lmTabBtnScript');
      const pane = document.getElementById('lmTabPaneScript');
      return btn?.classList.contains('active') && pane?.style.display === 'block';
    });
    assert.ok(tab3Active, 'Tab 3 Manual Script should become active upon click');

    // Verify Tab 4 Complement Lesson when lesson has blocks
    const tab4Shown = await page.evaluate(() => {
      window.lmState = {
        title: 'Relative Clauses',
        blocks: [{ id: 'b1', type: 'vocab' }, { id: 'b2', type: 'grammar' }]
      };
      if (typeof window.lmSyncLessonComplementTab === 'function') {
        window.lmSyncLessonComplementTab();
      }
      const tab4Btn = document.getElementById('lmTabBtnLesson');
      return tab4Btn && !tab4Btn.hidden;
    });
    assert.ok(tab4Shown, 'Tab 4 should become visible when lesson has blocks');

    // Click Tab 4
    const tab4Active = await page.evaluate(() => {
      document.getElementById('lmTabBtnLesson')?.click();
      const btn = document.getElementById('lmTabBtnLesson');
      const pane = document.getElementById('lmTabPaneLesson');
      const cloud = document.getElementById('lmQuizTypesPillCloud');
      return btn?.classList.contains('active') && pane?.style.display === 'block' && cloud?.children.length === 20;
    });
    assert.ok(tab4Active, 'Tab 4 should be active and display 20 quiz type pills');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
