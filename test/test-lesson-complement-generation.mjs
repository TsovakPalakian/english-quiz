import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFunction } from './helpers/extract-function.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('TASK-53: Stepper buttons removed and clean numeric input configured', () => {
  const html = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');
  assert.ok(html.includes('id="lmTaskCountPerSection"'), 'lmTaskCountPerSection must exist');
  assert.ok(html.includes('type="text" inputmode="numeric"'), 'lmTaskCountPerSection must use type="text" inputmode="numeric" to remove spin arrows');
  assert.ok(html.includes('class="lm-no-spin"'), 'lmTaskCountPerSection must have lm-no-spin class');
  assert.ok(html.includes('maxlength="2"'), 'lmTaskCountPerSection must have maxlength="2"');

  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  assert.ok(css.includes('-moz-appearance: textfield !important;'), 'CSS must disable default textfield appearance');
  assert.ok(css.includes('-webkit-appearance: none !important;'), 'CSS must disable webkit inner and outer spin buttons');
});

test('TASK-53: Max 30 limit and total summary display', () => {
  const html = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');
  assert.ok(html.includes('Max 30'), 'Should display Max 30 pill badge');
  assert.ok(html.includes('id="lmTaskTotalSummary"'), 'Should have lmTaskTotalSummary container');

  const code = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');
  assert.ok(code.includes('if (count > 30) count = 30;'), 'lmGetTaskCountPerSection must clamp at max 30');
  assert.ok(code.includes('if (total > 30) total = 30;'), 'lmGetTaskCounts must clamp at max 30');
  assert.ok(code.includes('replace(/\\D/g, "")'), 'lmGetTaskCountPerSection must strip non-digit characters');
});

test('TASK-53: Progress bars exist in all 4 generation tabs', () => {
  const html = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');
  assert.ok(html.includes('id="lmFileProgressWrap"'), 'File/PDF tab must have progress wrap');
  assert.ok(html.includes('id="lmFileProgressBar"'), 'File/PDF tab must have progress bar');
  assert.ok(html.includes('id="lmUrlProgressWrap"'), 'Web URL tab must have progress wrap');
  assert.ok(html.includes('id="lmUrlProgressBar"'), 'Web URL tab must have progress bar');
  assert.ok(html.includes('id="lmScriptProgressWrap"'), 'Manual Script tab must have progress wrap');
  assert.ok(html.includes('id="lmScriptProgressBar"'), 'Manual Script tab must have progress bar');
  assert.ok(html.includes('id="lmComplementProgressWrap"'), 'Complement Lesson tab must have progress wrap');
  assert.ok(html.includes('id="lmComplementProgressBar"'), 'Complement Lesson tab must have progress bar');
});

test('TASK-53: Undo generation button and banner exist in DOM', () => {
  const html = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');
  assert.ok(html.includes('id="lmUndoGenerationWrap"'), 'Undo banner wrap must exist');
  assert.ok(html.includes('id="lmUndoGenerationBtn"'), 'Undo generation button must exist');
  assert.ok(html.includes('id="lmUndoCount"'), 'Undo count indicator must exist');
});

test('TASK-53: Match quiz items and wordcard vocabulary preservation', () => {
  const pdfImportCode = fs.readFileSync(path.join(rootDir, 'client/52b-lesson-pdf-import.js'), 'utf8');

  // Verify Match preservation in renderClassworkCard and renderHomeworkCard
  assert.ok(pdfImportCode.includes('card._quizItems = r.items'), 'renderHomeworkCard must preserve r.items for quiz');
  assert.ok(pdfImportCode.includes('card.dataset.quizItems = JSON.stringify(r.items)'), 'renderHomeworkCard must store quizItems dataset');

  // Verify apply.onclick extracts quiz items
  assert.ok(pdfImportCode.includes('let items = card._quizItems;'), 'apply.onclick must read card._quizItems');
  assert.ok(pdfImportCode.includes('item.items = items;'), 'apply.onclick must assign items to quiz block');

  // Verify lmPdfDraftBlocks prioritizes quizType with items over choice
  const draftBlocksMatch = pdfImportCode.match(/const addTasks = \([\s\S]*?\n  \};/);
  assert.ok(draftBlocksMatch, 'addTasks function must exist');
  const addTasksStr = draftBlocksMatch[0];
  const quizTypeIdx = addTasksStr.indexOf("r.quizType && r.quizType !== 'Choice'");
  const choiceIdx = addTasksStr.indexOf("r.kind === 'choice'");
  assert.ok(quizTypeIdx !== -1 && choiceIdx !== -1 && quizTypeIdx < choiceIdx, 'quizType handling must precede generic choice handling');

  // Verify lmExtractLessonContextText extracts wordcard blocks
  assert.ok(pdfImportCode.includes("b.type === 'wordcard'"), 'lmExtractLessonContextText must extract wordcard blocks');
});

test('TASK-53: Existing unpublished lesson (draft) is preserved without wiping', () => {
  const pdfImportCode = fs.readFileSync(path.join(rootDir, 'client/52b-lesson-pdf-import.js'), 'utf8');

  // Verify lmHasExistingLesson helper exists and checks blocks, title, description, id
  assert.ok(pdfImportCode.includes('function lmHasExistingLesson('), 'lmHasExistingLesson helper must exist');
  assert.ok(pdfImportCode.includes('window.lmHasExistingLesson = lmHasExistingLesson'), 'lmHasExistingLesson must be exported');

  // Verify lmImportPdfDraft checks existing lesson before calling lmCreateLesson
  assert.ok(pdfImportCode.includes('if(!hasExisting && (!appendTasks || !lmState)){'), 'lmImportPdfDraft must check hasExisting before lmCreateLesson');

  // Verify lmMountLessonDraftDialog preserves metadata for existing lessons
  assert.ok(pdfImportCode.includes('const isNonEmptyLesson = Boolean(isDocument && current &&'), 'lmMountLessonDraftDialog must detect non-empty lesson');
  assert.ok(pdfImportCode.includes("section('metadata','Basic information',(container)=>{"), 'Basic information section must exist');
  assert.ok(pdfImportCode.includes('},!isNonEmptyLesson);'), 'Basic information must respect non-empty lesson selection');

  // Verify persistent append mode badge in HTML
  const html = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');
  assert.ok(html.includes('id="lmAppendModeBadge"'), 'preview.html must include lmAppendModeBadge');
  assert.ok(html.includes('Append Mode Active'), 'preview.html must display Append Mode Active text');
});

test('TASK-54: Thematic expansion pool enriches vocabulary with phrasal verbs, idioms, and collocations', () => {
  const code = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');
  assert.ok(code.includes('THEMATIC_VOCABULARY_BANKS'), 'Must define THEMATIC_VOCABULARY_BANKS');
  assert.ok(code.includes('phrasalVerbs:'), 'Must include phrasal verbs bank');
  assert.ok(code.includes('idioms:'), 'Must include idioms bank');
  assert.ok(code.includes('collocations:'), 'Must include collocations bank');

  // Verify extraction of expansion pool
  const lessonFixture = {
    title: 'Superstitions and Prepositions',
    description: 'A lesson about common omens and superstitions',
    blocks: [
      { id: 'w1', type: 'wordcard', tab: 'words', word: 'superstition', ru: 'суеверие' },
      { id: 'w2', type: 'wordcard', tab: 'words', word: 'black cat', ru: 'черная кошка' },
      { id: 'w3', type: 'wordcard', tab: 'words', word: 'lucky charm', ru: 'талисман' }
    ]
  };

  // Extract function and test pool growth
  const extractFn = extractFunction(code, 'lmExtractLessonVocabularyPool');
  const thematicFn = extractFunction(code, 'lmGetThematicExpansionPool');
  const banksVar = extractFunction(code, 'THEMATIC_VOCABULARY_BANKS');

  const runner = new Function('lesson', banksVar + '\n' + thematicFn + '\n' + extractFn + '\nreturn lmExtractLessonVocabularyPool(lesson, 20);');
  const pool = runner(lessonFixture);

  assert.ok(pool.length >= 20, 'Vocabulary pool must expand to at least 20 unique items');
  const words = pool.map(p => p.word.toLowerCase());
  const uniqueWords = new Set(words);
  assert.equal(words.length, uniqueWords.size, 'Every item in expanded pool must be unique (no duplicates)');

  // Verify phrasal verbs, idioms, and collocations exist in pool
  assert.ok(pool.some(p => p.expressionType === 'PHRASAL_VERB'), 'Pool must contain phrasal verbs');
  assert.ok(pool.some(p => p.expressionType === 'IDIOM'), 'Pool must contain idioms');
  assert.ok(pool.some(p => p.expressionType === 'COLLOCATION'), 'Pool must contain collocations');
});

test('TASK-54: Strict deduplication in Homework and Classwork blocks', () => {
  const code = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');

  // Verify duplicate tracking set exists in lmGenerateComplementTasks
  assert.ok(code.includes('const existingTasksInSec = new Set();'), 'Must track existing tasks in section to prevent duplicate cards');
  assert.ok(code.includes('existingTasksInSec.has(sig)'), 'Must check signature against existing tasks');
  assert.ok(code.includes('existingTasksInSec.add((quizType + "::" + targetObj.word).toLowerCase());'), 'Must register newly created task in existing set');
  assert.ok(code.includes('block.targetWord = targetObj.word;'), 'Must record targetWord on task block');
});

test('TASK-54: Words tab includes visual divider and supplementary badges for newly generated material', () => {
  const code = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');

  // Verify divider insertion in lmEnsureWordsInLesson
  assert.ok(code.includes('isSupplementaryDivider: true'), 'lmEnsureWordsInLesson must insert supplementary divider');
  assert.ok(code.includes('✨ Supplementary Material · Дополнительные материалы (Generated)'), 'Divider must have clear title');
  assert.ok(code.includes('supplementary: true'), 'New cards must be tagged with supplementary: true');

  // Verify lmWordCardHtml renders tags
  assert.ok(code.includes('lm-supplementary-tag'), 'lmWordCardHtml must render lm-supplementary-tag');
  assert.ok(code.includes('lm-expression-type-tag'), 'lmWordCardHtml must render lm-expression-type-tag');

  // Verify CSS contains supplementary divider and tag styles
  const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
  assert.ok(css.includes('.lm-supplementary-divider'), 'CSS must define .lm-supplementary-divider');
  assert.ok(css.includes('.lm-supplementary-tag'), 'CSS must define .lm-supplementary-tag');
  assert.ok(css.includes('.lm-expression-type-tag'), 'CSS must define .lm-expression-type-tag');
});

test('TASK-53: Visual test with Playwright - verifies clean input, progress bar, and complement generation', async () => {
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto(targetUrl);

    // Check count input attributes
    const countInput = page.locator('#lmTaskCountPerSection');
    await countInput.waitFor({ state: 'attached', timeout: 5000 });

    const inputType = await countInput.getAttribute('type');
    assert.equal(inputType, 'text', 'Count input must be type="text"');

    const inputMode = await countInput.getAttribute('inputmode');
    assert.equal(inputMode, 'numeric', 'Count input must have inputmode="numeric"');

    // Test progress bar functions in page context
    const progressTestResult = await page.evaluate(() => {
      if (typeof window.lmShowTabProgress !== 'function') return false;
      window.lmShowTabProgress('lesson', 'Test generating...', 50);
      const wrap = document.getElementById('lmComplementProgressWrap');
      const text = document.getElementById('lmComplementProgressText');
      const bar = document.getElementById('lmComplementProgressBar');
      const isVisible = wrap && wrap.style.display !== 'none';
      const textMatches = text && text.textContent === 'Test generating...';
      const widthMatches = bar && bar.style.width === '50%';
      window.lmHideTabProgress('lesson');
      const isHidden = wrap && wrap.style.display === 'none';
      return isVisible && textMatches && widthMatches && isHidden;
    });
    assert.ok(progressTestResult, 'Progress bar display and hide functions must work');

    // Test append mode badge sync in page context
    const appendModeResult = await page.evaluate(() => {
      if (typeof window.lmSyncLessonComplementTab !== 'function') return false;
      // Setup draft lesson (unpublished)
      window.lmState = {
        id: 'test-draft-lesson',
        title: 'Superstitions and Prepositions',
        description: 'Test lesson description',
        published: false,
        blocks: [{ id: 'b1', type: 'text', text: 'Hello' }]
      };
      window.lmSyncLessonComplementTab();
      const badge = document.getElementById('lmAppendModeBadge');
      const title = document.getElementById('lmAppendModeLessonTitle');
      const isVisible = badge && badge.style.display !== 'none';
      const titleMatches = title && title.textContent === 'Superstitions and Prepositions';
      return isVisible && titleMatches;
    });
    assert.ok(appendModeResult, 'Append mode banner must display title of active unpublished draft lesson');
  } finally {
    await browser.close();
    server.close();
  }
});

