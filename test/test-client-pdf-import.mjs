import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { extractFunctions, extractStatement } from './helpers/extract-function.mjs';

const source = fs.readFileSync('client/52b-lesson-pdf-import.js', 'utf8');

const IMPORT_PDF_FUNCTIONS = [
  'lmStripHtmlOrXml',
  'lmExtractRtfText',
  'lmExtractTextFromFile',
  'lmDetectCefrLevel',
  'lmParseScriptToLessonData',
  'lmPdfIdentity',
  'lmPdfContentKey',
  'lmPdfGrammarMatch',
  'lmPdfBlockBudget',
  'lmPdfBlockBudgetText',
  'lmPdfIncomingBlocks',
  'lmPdfPayloadBytes',
  'lmPdfSaveBounded',
  'lmPdfDraftBlocks',
  'lmMountLessonDraftDialog',
  'lmImportPdfDraft',
  'lmGenerateLessonFromScript',
  'lmHandleScriptFileUpload'
];

const extractedImportCode = extractFunctions(source, ...IMPORT_PDF_FUNCTIONS);
const changeListener = extractStatement(source, "document.addEventListener('change'");
const dragoverListener = extractStatement(source, "document.addEventListener('dragover'");
const dragleaveListener = extractStatement(source, "document.addEventListener('dragleave'");
const dropListener = extractStatement(source, "document.addEventListener('drop'");
const clickListener = extractStatement(source, "document.addEventListener('click'");

function createLessonImportEnvironment({
  initialUser = { id: 'teacher-1', role: 'ADMIN' },
  canEdit = true,
  fetchHandler = null
} = {}) {
  const win = new Window({ url: 'https://preview.invalid/lessons' });
  const doc = win.document;

  doc.body.innerHTML = `
    <div id="material">
      <div data-lesson-pdf-import></div>
      <input data-lesson-pdf-import-file type="file">
      <div id="lmPdfImportStatus" hidden></div>
      <div id="lmPdfProgress"></div>
      <div id="lmUploadBox"></div>
      <div id="lmScriptBox" hidden></div>
      <button id="lmTabUpload" class="primary" data-lm-import-tab="upload">Upload</button>
      <button id="lmTabScript" class="ghost" data-lm-import-tab="script">Script</button>
      <div data-lesson-script-drop></div>
      <input data-lesson-script-file type="file">
      <textarea id="lmScriptInput"></textarea>
      <span id="lmScriptStatus"></span>
      <button id="lmGenerateFromScriptBtn">Generate</button>
    </div>
  `;

  const state = {
    user: initialUser,
    canEditLessons: canEdit,
    lmState: { id: 'les-draft-1', blocks: [] },
    viewGen: 1,
    pdfDraftRequest: null,
    progressCalls: [],
    statusCalls: [],
    fetchCalls: []
  };

  win.esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  win.lmBlank = (type) => ({ id: 'b-' + Math.random().toString(36).slice(2, 9), type, items: [] });
  win.canEditLessons = () => state.canEditLessons;
  win.lmState = state.lmState;
  win.viewGen = state.viewGen;
  win.authUser = state.user;
  win.lmPdfDraftRequest = null;

  win.lmPdfProgress = (label, completed = [], done = null, total = null) => {
    state.progressCalls.push({ label, completed, done, total });
  };
  win.lmPdfProgressEnd = () => {
    state.progressCalls.push({ end: true });
  };

  win.lmPdfImportStatus = (text, bad) => {
    state.statusCalls.push({ text, bad });
    const el = doc.getElementById('lmPdfImportStatus');
    if (el) {
      el.hidden = !text;
      el.textContent = text || '';
      el.classList.toggle('bad', !!bad);
    }
  };

  win.accountFetch = async (url, opts = {}) => {
    state.fetchCalls.push({ url, opts });
    if (fetchHandler) return fetchHandler(url, opts);
    return {
      title: 'Mock Lesson Title',
      description: 'Mock Description',
      unit: '3',
      lesson: '1',
      className: 'A2',
      words: [
        { word: 'explore', meaning: 'to travel around', translation: 'исследовать', example: 'Let us explore the city.', pages: [1] }
      ],
      phrases: [
        { phrase: 'take care', meaning: 'be careful', translation: 'береги себя', example: 'Take care of yourself.', pages: [1] }
      ],
      rules: [
        { title: 'Present Perfect', explanation: 'Completed action with present result', pattern: 'have/has + V3', examples: ['I have done it — Я сделал это'], pages: [1] }
      ],
      classwork: [
        { title: 'Quiz 1', text: 'Choose the correct option', kind: 'choice', options: ['have seen', 'saw'], answer: 0, feedback: 'Great job!', pages: [1] }
      ]
    };
  };

  const contextScript = `
    ${extractedImportCode}
    ${changeListener}
    ${dragoverListener}
    ${dragleaveListener}
    ${dropListener}
    ${clickListener}
  `;

  vm.createContext(win);
  vm.runInContext(contextScript, win);

  return { win, doc, state };
}

test('lmParseScriptToLessonData extracts structured lesson targets, vocabulary, rules, and classwork exercises', () => {
  const { win } = createLessonImportEnvironment();

  const script = `
Title: Past Continuous vs Past Simple
Description: Learn when to use progressive forms in the past
Unit: 5
Lesson: 2
Class: B1 Intermediate

Words:
wander | бродить | to walk slowly around | I wandered through the park
• glance - взгляд - a quick look - She gave a quick glance

Phrases:
out of the blue | внезапно | unexpectedly | It happened out of the blue

Rules:
rule: Past Continuous
explanation: An action in progress at a specific time in the past
pattern: was / were + V-ing
examples:
I was reading at 8 PM — Я читал в 8 вечера

Classwork:
What were you doing when I called? | I was cooking, I cooked, I cook | 0 | Correct! Past Continuous describes ongoing background action.
`;

  const parsed = win.lmParseScriptToLessonData(script, 'Fallback Title');

  assert.equal(parsed.title, 'Past Continuous vs Past Simple');
  assert.equal(parsed.description, 'Learn when to use progressive forms in the past');
  assert.equal(parsed.unit, '5');
  assert.equal(parsed.lesson, '2');
  assert.equal(parsed.className, 'B1 Intermediate');

  // Words verification
  assert.equal(parsed.words.length, 2);
  assert.equal(parsed.words[0].word, 'wander');
  assert.equal(parsed.words[0].translation, 'бродить');
  assert.equal(parsed.words[0].meaning, 'to walk slowly around');
  assert.equal(parsed.words[0].example, 'I wandered through the park');
  assert.deepEqual(Array.from(parsed.words[0].pages), [1]);

  assert.equal(parsed.words[1].word, 'glance');
  assert.equal(parsed.words[1].translation, 'взгляд');
  assert.equal(parsed.words[1].meaning, 'a quick look');
  assert.equal(parsed.words[1].example, 'She gave a quick glance');
  assert.deepEqual(Array.from(parsed.words[1].pages), [1]);

  // Phrases verification
  assert.equal(parsed.phrases.length, 1);
  assert.equal(parsed.phrases[0].phrase, 'out of the blue');
  assert.equal(parsed.phrases[0].translation, 'внезапно');
  assert.equal(parsed.phrases[0].meaning, 'unexpectedly');
  assert.equal(parsed.phrases[0].example, 'It happened out of the blue');
  assert.deepEqual(Array.from(parsed.phrases[0].pages), [1]);

  // Rules verification
  assert.equal(parsed.rules.length, 1);
  assert.equal(parsed.rules[0].title, 'Past Continuous');
  assert.equal(parsed.rules[0].explanation, 'An action in progress at a specific time in the past');
  assert.equal(parsed.rules[0].pattern, 'was / were + V-ing');
  assert.deepEqual(Array.from(parsed.rules[0].examples), ['I was reading at 8 PM — Я читал в 8 вечера']);

  // Classwork / Quizzes verification: custom quiz parsed and pedagogical stages synthesized
  assert.equal(parsed.classwork.length, 5);
  const customQuiz = parsed.classwork.find(c => c.title === 'What were you doing when I called?');
  assert.ok(customQuiz, 'Custom parsed quiz must be present in classwork');
  assert.equal(customQuiz.kind, 'choice');
  assert.deepEqual(Array.from(customQuiz.options), ['I was cooking', 'I cooked', 'I cook']);
  assert.equal(customQuiz.answer, 0);
  assert.equal(customQuiz.feedback, 'Correct! Past Continuous describes ongoing background action.');
  assert.equal(customQuiz.generated, true);
});

test('lmParseScriptToLessonData falls back gracefully when metadata headers are omitted', () => {
  const { win } = createLessonImportEnvironment();

  const script = `
# Natural Disasters
A lesson about earthquakes and volcanoes

Words:
eruption | извержение | explosion of a volcano | The eruption began suddenly
`;

  const parsed = win.lmParseScriptToLessonData(script, 'Default Script');

  assert.equal(parsed.title, 'Natural Disasters');
  assert.equal(parsed.description, 'A lesson about earthquakes and volcanoes');
  assert.equal(parsed.words.length, 1);
  assert.equal(parsed.words[0].word, 'eruption');
});

test('lmExtractTextFromFile decodes utf-8, utf-16 with BOM, HTML stripping, and RTF markup', async () => {
  const { win } = createLessonImportEnvironment();

  // 1. Plain UTF-8 text file
  const utf8File = new win.File([new TextEncoder().encode('Hello World\nLine 2')], 'lesson.txt', { type: 'text/plain' });
  const utf8Text = await win.lmExtractTextFromFile(utf8File);
  assert.equal(utf8Text, 'Hello World\nLine 2');

  // 2. UTF-16LE with Byte Order Mark [0xFF, 0xFE]
  const utf16leBytes = new Uint8Array([0xFF, 0xFE, 0x48, 0x00, 0x69, 0x00]); // "Hi"
  const utf16leFile = new win.File([utf16leBytes], 'script-le.txt', { type: 'text/plain' });
  const utf16leText = await win.lmExtractTextFromFile(utf16leFile);
  assert.equal(utf16leText, 'Hi');

  // 3. UTF-16BE with Byte Order Mark [0xFE, 0xFF]
  const utf16beBytes = new Uint8Array([0xFE, 0xFF, 0x00, 0x48, 0x00, 0x69]); // "Hi"
  const utf16beFile = new win.File([utf16beBytes], 'script-be.txt', { type: 'text/plain' });
  const utf16beText = await win.lmExtractTextFromFile(utf16beFile);
  assert.equal(utf16beText, 'Hi');

  // 4. HTML stripping with entities
  const htmlContent = '<h2>Unit 1</h2><p>Hello &amp; welcome &nbsp; to <b>English</b>!</p>';
  const htmlFile = new win.File([new TextEncoder().encode(htmlContent)], 'page.html', { type: 'text/html' });
  const htmlText = await win.lmExtractTextFromFile(htmlFile);
  assert.equal(htmlText, 'Unit 1 \nHello & welcome to English !');

  // 5. RTF stripping
  const rtfContent = '{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Courier;}}\\par Lesson Title\\par Second line\\par}';
  const rtfFile = new win.File([new TextEncoder().encode(rtfContent)], 'doc.rtf', { type: 'application/rtf' });
  const rtfText = await win.lmExtractTextFromFile(rtfFile);
  assert.equal(rtfText, 'Lesson Title\n Second line');
});

test('lmImportPdfDraft enforces 25MB file size limit, empty file rejection, and canEditLessons authorization guard', async () => {
  const { win, doc, state } = createLessonImportEnvironment({ canEdit: true });

  // 1. File size exceeding 25 MB
  const oversizedFile = {
    name: 'big-textbook.pdf',
    size: 26 * 1024 * 1024,
    type: 'application/pdf',
    arrayBuffer: async () => new ArrayBuffer(0)
  };
  await win.lmImportPdfDraft(oversizedFile);
  assert.equal(doc.getElementById('lmPdfImportStatus').textContent, 'File must be under 25 MB.');
  assert.equal(doc.getElementById('lmPdfImportStatus').classList.contains('bad'), true);

  // 2. Empty file (size 0)
  const emptyFile = {
    name: 'empty.pdf',
    size: 0,
    type: 'application/pdf',
    arrayBuffer: async () => new ArrayBuffer(0)
  };
  await win.lmImportPdfDraft(emptyFile);
  assert.equal(doc.getElementById('lmPdfImportStatus').textContent, 'File must be under 25 MB.');

  // 3. User lacks canEditLessons permission
  state.canEditLessons = false;
  state.fetchCalls.length = 0;
  const validFile = new win.File([new Uint8Array([1, 2, 3, 4])], 'valid.pdf', { type: 'application/pdf' });
  await win.lmImportPdfDraft(validFile);
  assert.equal(state.fetchCalls.length, 0); // Must not initiate network fetch
});

test('lmImportPdfDraft executes PDF analysis pipeline via accountFetch and mounts review dialog', async () => {
  const { win, doc, state } = createLessonImportEnvironment({ canEdit: true });

  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]); // "%PDF-1.4"
  const file = new win.File([pdfBytes], 'grammar-unit-3.pdf', { type: 'application/pdf' });

  await win.lmImportPdfDraft(file);

  // Verify accountFetch invocation
  assert.equal(state.fetchCalls.length, 1);
  assert.equal(state.fetchCalls[0].url, '/api/lessons/parse-pdf?scope=full');
  assert.equal(state.fetchCalls[0].opts.method, 'POST');
  assert.equal(state.fetchCalls[0].opts.headers['Content-Type'], 'application/pdf');

  // Verify dialog mounted in DOM
  const dialog = doc.getElementById('lmPdfDraftDialog');
  assert.ok(dialog, 'Review dialog must be mounted in DOM');
  assert.equal(dialog.hasAttribute('open'), true);
  assert.match(doc.getElementById('lmPdfBlockBudget').textContent, /already has 0 blocks\. 200 more can be added\./);

  // Lazy-mount Words section via toggle event on details
  const wordDetails = Array.from(dialog.querySelectorAll('details')).find(d => d.textContent.includes('Words'));
  assert.ok(wordDetails, 'Words section details must be present in dialog');
  wordDetails.open = true;
  wordDetails.dispatchEvent(new win.Event('toggle'));

  // Verify section checkboxes
  const wordSection = dialog.querySelector('.lm-pdf-word-list');
  assert.ok(wordSection, 'Word list container must be rendered');
  const wordCard = wordSection.querySelector('.lm-pdf-word-card');
  assert.ok(wordCard, 'Word card must be rendered in list');
  assert.equal(wordCard.querySelector('[data-word-key="word"]').value, 'explore');
  assert.equal(wordCard.querySelector('[data-word-key="translation"]').value, 'исследовать');

  // Verify review status message
  assert.equal(doc.getElementById('lmPdfImportStatus').textContent, 'Review the draft before applying it.');
  assert.equal(doc.getElementById('lmPdfImportStatus').classList.contains('bad'), false);
});

test('lmImportPdfDraft aborts mounting if user changes or request is cancelled during fetch', async () => {
  let resolveFetch;
  const delayedFetch = new Promise((resolve) => { resolveFetch = resolve; });

  const { win, doc, state } = createLessonImportEnvironment({
    canEdit: true,
    fetchHandler: async () => delayedFetch
  });

  const file = new win.File([new Uint8Array([1, 2, 3])], 'lesson.pdf', { type: 'application/pdf' });
  const importPromise = win.lmImportPdfDraft(file);

  // Switch authenticated user while fetch is in-flight
  win.authUser = { id: 'different-teacher', role: 'ADMIN' };

  resolveFetch({
    title: 'Stale PDF Title',
    words: [], phrases: [], rules: [], classwork: []
  });

  await importPromise;

  // Dialog must NOT be mounted for mismatched session owner
  const dialog = doc.getElementById('lmPdfDraftDialog');
  assert.equal(dialog, null, 'Dialog mount must be aborted when authUser changes');
});

test('lmImportPdfDraft handles server errors and network failures with error banner and busy reset', async () => {
  const { win, doc } = createLessonImportEnvironment({
    canEdit: true,
    fetchHandler: async () => {
      throw new Error('Server PDF parser timeout.');
    }
  });

  const file = new win.File([new Uint8Array([1, 2, 3])], 'corrupt.pdf', { type: 'application/pdf' });
  await win.lmImportPdfDraft(file);

  const status = doc.getElementById('lmPdfImportStatus');
  assert.equal(status.textContent, 'Server PDF parser timeout.');
  assert.equal(status.classList.contains('bad'), true);

  const dropZone = doc.querySelector('[data-lesson-pdf-import]');
  assert.equal(dropZone.classList.contains('is-busy'), false);
});

test('lmGenerateLessonFromScript validates input and DOM event listeners dispatch drag-and-drop and tab toggles', async () => {
  const { win, doc } = createLessonImportEnvironment({ canEdit: true });

  const scriptTab = doc.getElementById('lmTabScript');
  const uploadTab = doc.getElementById('lmTabUpload');
  const uploadBox = doc.getElementById('lmUploadBox');
  const scriptBox = doc.getElementById('lmScriptBox');
  const generateBtn = doc.getElementById('lmGenerateFromScriptBtn');
  const scriptInput = doc.getElementById('lmScriptInput');
  const scriptStatus = doc.getElementById('lmScriptStatus');

  // 1. Switch to script tab
  scriptTab.click();
  assert.equal(uploadBox.hidden, true);
  assert.equal(scriptBox.hidden, false);
  assert.equal(scriptTab.classList.contains('primary'), true);
  assert.equal(uploadTab.classList.contains('ghost'), true);

  // 2. Click generate with empty text
  scriptInput.value = '   ';
  generateBtn.click();
  assert.equal(scriptStatus.textContent, 'Enter a script or topic description first.');

  // 3. Switch back to upload tab
  uploadTab.click();
  assert.equal(uploadBox.hidden, false);
  assert.equal(scriptBox.hidden, true);
  assert.equal(uploadTab.classList.contains('primary'), true);
  assert.equal(scriptTab.classList.contains('ghost'), true);

  // 4. Drag and drop events on [data-lesson-script-drop]
  const dropZone = doc.querySelector('[data-lesson-script-drop]');
  dropZone.dispatchEvent(new win.Event('dragover', { bubbles: true }));
  assert.equal(dropZone.classList.contains('is-over'), true);

  dropZone.dispatchEvent(new win.Event('dragleave', { bubbles: true }));
  assert.equal(dropZone.classList.contains('is-over'), false);
});

test('a large PDF import saves in bounded batches and shows the block room first', async () => {
  const code = extractFunctions(source, 'lmPdfBlockBudget', 'lmPdfBlockBudgetText', 'lmPdfIncomingBlocks', 'lmPdfPayloadBytes', 'lmPdfSaveBounded');
  const saves = [];
  function lessonSnapshot(draft) {
    return {
      changes: { title: 'Lesson' },
      blocks: (draft.blocks || []).map(block => ({
        ...(Number.isSafeInteger(block.id) && block.id > 0 ? { id: block.id } : {}),
        expectedRevision: block.stageBlockRevision || 0,
        type: 'text',
        content: { text: block.text || '' }
      }))
    };
  }
  const sandbox = {
    window: { LearningMain: { lessonSnapshot } },
    TextEncoder,
    JSON,
    Math,
    Map,
    Set,
    Number,
    Object,
    async lmPdfSavePreparedDraft(draft) {
      const bytes = sandbox.lmPdfPayloadBytes(draft);
      saves.push(bytes);
      draft.blocks.forEach((block, index) => {
        if (!block.id) block.id = saves.length * 100 + index + 1;
        block.stageBlockRevision = 1;
      });
      draft.stageLessonBaseline = lessonSnapshot(draft);
      draft.stageRevision = (draft.stageRevision || 0) + 1;
    }
  };
  vm.runInNewContext(code + '\nthis.lmPdfBlockBudget=lmPdfBlockBudget;this.lmPdfBlockBudgetText=lmPdfBlockBudgetText;this.lmPdfPayloadBytes=lmPdfPayloadBytes;this.lmPdfSaveBounded=lmPdfSaveBounded;this.lmPdfIncomingBlocks=lmPdfIncomingBlocks;', sandbox);
  const budget = sandbox.lmPdfBlockBudget(180, 30);
  assert.equal(budget.over, true);
  assert.equal(budget.room, 20);
  assert.equal(sandbox.lmPdfBlockBudgetText(180, 30), 'This lesson already has 180 blocks. 20 more can be added.');
  assert.equal(sandbox.lmPdfIncomingBlocks({ words: [{}, {}], rules: [{}] }, new Set(['words', 'pdf']), false), 3);
  const current = { blocks: [{ id: 1, text: 'kept', stageBlockRevision: 1 }] };
  const draft = {
    title: 'Lesson',
    stageRevision: 4,
    stageLessonBaseline: lessonSnapshot(current),
    blocks: [current.blocks[0], { text: 'n'.repeat(30000) }, { text: 'm'.repeat(30000) }, { text: 'p'.repeat(30000) }]
  };
  const batches = await sandbox.lmPdfSaveBounded(draft, current, () => true);
  assert.ok(batches > 1);
  assert.ok(saves.length > 1);
  assert.ok(saves.every(bytes => bytes <= 58000));
  assert.equal(draft.blocks.length, 4);
  saves.length = 0;
  const full = { blocks: Array.from({ length: 199 }, (_, index) => ({ id: index + 1, text: 'old' })) };
  const tooMany = { blocks: full.blocks.concat([{ text: 'a' }, { text: 'b' }]), stageLessonBaseline: lessonSnapshot(full) };
  await assert.rejects(() => sandbox.lmPdfSaveBounded(tooMany, full, () => true), /199 blocks/);
  assert.equal(saves.length, 0);
  assert.match(source, /lmPdfPrepareCards\(/);
  assert.match(source, /pdfGrammarAlerts\(/);
});
