import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function getContext() {
  const code = readFileSync('client/52b-lesson-pdf-import.js', 'utf8');
  const sandbox = {
    window: {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    JSON,
    esc: s => String(s || ''),
    canEditLessons: () => true
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

test('lmParseScriptToLessonData extracts metadata, vocabulary, rules and complete 5-stage classwork', () => {
  const ctx = getContext();
  const script = `
Title: B2 Advanced Collocations
Description: Master essential collocations and nuances for B2 level.
Unit: 5
Lesson: 2
Class: B2+

Words:
breakthrough - прорыв - an important discovery - Scientists made a major breakthrough.
drawback - недостаток - a disadvantage or problem - One drawback of the plan is cost.
turnover - текучесть кадров - rate at which employees leave - High staff turnover is an issue.

Rules:
Rule: Phrasal verbs with "turn"
Explanation: Turn down means to reject; turn up means to arrive.
Pattern: turn + particle
Examples:
He turned down the offer. — Он отклонил предложение.
She turned up late. — Она пришла поздно.

Quiz: Which phrasal verb means to refuse?
Which phrasal verb means to refuse? | turn down, turn up, turn into | 0 | "Turn down" means to refuse or reject.
`;

  const data = ctx.window.lmParseScriptToLessonData(script, 'test-script.txt');
  assert.equal(data.title, 'B2 Advanced Collocations');
  assert.equal(data.description, 'Master essential collocations and nuances for B2 level.');
  assert.equal(data.unit, '5');
  assert.equal(data.lesson, '2');
  assert.equal(data.className, 'B2+');
  assert.equal(data.words.length, 3);
  assert.equal(data.words[0].word, 'breakthrough');
  assert.equal(data.words[0].translation, 'прорыв');
  assert.equal(data.rules.length, 1);
  assert.equal(data.rules[0].title, 'Phrasal verbs with "turn"');
  assert.equal(data.rules[0].examples.length, 2);

  // Check 5 required learning stages
  const stages = data.classwork.map(c => c.stage);
  assert.ok(stages.includes('explanation'), 'Must include explanation stage');
  assert.ok(stages.includes('comprehension'), 'Must include comprehension stage');
  assert.ok(stages.includes('guided'), 'Must include guided stage');
  assert.ok(stages.includes('independent'), 'Must include independent stage');
  assert.ok(stages.includes('final'), 'Must include final stage');
});

test('lmParseScriptToLessonData handles freeform description and generates target structure', () => {
  const ctx = getContext();
  const freeform = `Environmental Conservation and Sustainability
Explore global ecological challenges, renewable energy solutions, and climate policy.
Biodiversity, sustainability, emissions, conservation, renewables, ecosystems.`;

  const data = ctx.window.lmParseScriptToLessonData(freeform, 'ecology.txt');
  assert.equal(data.title, 'Environmental Conservation and Sustainability');
  assert.equal(data.description, 'Explore global ecological challenges, renewable energy solutions, and climate policy.');
  assert.ok(data.words.length >= 3, 'Must extract vocabulary words from description');
  assert.equal(data.classwork.length >= 5, true, 'Must produce full 5-stage learning progression');
});

test('lmExtractTextFromFile extracts text from arbitrary files and mock docx', async () => {
  const ctx = getContext();
  const mockTxtFile = {
    name: 'notes.custom_ext',
    async arrayBuffer() {
      return new TextEncoder().encode('Custom file content\nWords: test - тест\n');
    }
  };
  const text = await ctx.window.lmExtractTextFromFile(mockTxtFile);
  assert.equal(text, 'Custom file content\nWords: test - тест');

  ctx.window.fflate = {
    unzipSync: () => ({
      'word/document.xml': new TextEncoder().encode('<w:document><w:p><w:r><w:t>Hello from DOCX XML</w:t></w:r></w:p></w:document>')
    }),
    strFromU8: bytes => new TextDecoder().decode(bytes)
  };
  const mockDocxFile = {
    name: 'syllabus.docx',
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3]).buffer;
    }
  };
  const docxText = await ctx.window.lmExtractTextFromFile(mockDocxFile);
  assert.equal(docxText, 'Hello from DOCX XML');

  // Test ODT extraction
  ctx.window.fflate.unzipSync = () => ({
    'content.xml': new TextEncoder().encode('<office:document-content><text:p>Hello from ODT document</text:p></office:document-content>')
  });
  const mockOdtFile = { name: 'lesson.odt', async arrayBuffer() { return new Uint8Array([0x50, 0x4B, 0x03, 0x04]).buffer; } };
  const odtText = await ctx.window.lmExtractTextFromFile(mockOdtFile);
  assert.equal(odtText, 'Hello from ODT document');

  // Test PPTX extraction
  ctx.window.fflate.unzipSync = () => ({
    'ppt/slides/slide1.xml': new TextEncoder().encode('<p:sld><a:p><a:r><a:t>Slide 1 Title</a:t></a:r></a:p></p:sld>'),
    'ppt/slides/slide2.xml': new TextEncoder().encode('<p:sld><a:p><a:r><a:t>Slide 2 Details</a:t></a:r></a:p></p:sld>')
  });
  const mockPptxFile = { name: 'presentation.pptx', async arrayBuffer() { return new Uint8Array([0x50, 0x4B, 0x03, 0x04]).buffer; } };
  const pptxText = await ctx.window.lmExtractTextFromFile(mockPptxFile);
  assert.ok(pptxText.includes('Slide 1 Title'));
  assert.ok(pptxText.includes('Slide 2 Details'));

  // Test RTF extraction
  const mockRtfFile = {
    name: 'notes.rtf',
    async arrayBuffer() {
      return new TextEncoder().encode('{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\b Grammar Focus\\b0\\par Present Perfect practice\\par}');
    }
  };
  const rtfText = await ctx.window.lmExtractTextFromFile(mockRtfFile);
  assert.ok(rtfText.includes('Grammar Focus'));
  assert.ok(rtfText.includes('Present Perfect practice'));

  // Test HTML extraction
  const mockHtmlFile = {
    name: 'article.html',
    async arrayBuffer() {
      return new TextEncoder().encode('<html><body><h1>Web Article</h1><p>First paragraph &amp; details</p></body></html>');
    }
  };
  const htmlText = await ctx.window.lmExtractTextFromFile(mockHtmlFile);
  assert.ok(htmlText.includes('Web Article'));
  assert.ok(htmlText.includes('First paragraph & details'));

  // Test EPUB extraction
  ctx.window.fflate.unzipSync = () => ({
    'mimetype': new TextEncoder().encode('application/epub+zip'),
    'OEBPS/chapter1.xhtml': new TextEncoder().encode('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h2>Chapter One</h2><p>The journey began at dawn.</p></body></html>')
  });
  const mockEpubFile = { name: 'novel.epub', async arrayBuffer() { return new Uint8Array([0x50, 0x4B, 0x03, 0x04]).buffer; } };
  const epubText = await ctx.window.lmExtractTextFromFile(mockEpubFile);
  assert.ok(epubText.includes('Chapter One'));
  assert.ok(epubText.includes('The journey began at dawn.'));

  // Test binary document with printable ASCII runs
  const binaryPayload = new Uint8Array([
    0x00, 0x01, 0xFF, 0xFE, // binary header
    ...new TextEncoder().encode('Exploration of deep ocean hydrothermal vents and marine ecosystems.'),
    0x00, 0x00, 0x80, 0x90 // binary footer
  ]);
  const mockBinFile = { name: 'data.dat', async arrayBuffer() { return binaryPayload.buffer; } };
  const binText = await ctx.window.lmExtractTextFromFile(mockBinFile);
  assert.ok(binText.includes('Exploration of deep ocean'));
  assert.ok(binText.includes('marine ecosystems.'));
});

test('lmPdfSavePreparedDraft replaces temporary ID in classGroups and invalidates cache', async () => {
  const code = readFileSync('client/52b-lesson-pdf-import.js', 'utf8');
  let groupSaved = false;
  const droppedCaches = [];
  const writtenBlocks = [];
  const classGroups = [{ id: 'group-1', lessonIds: ['lm-temp-101', 99] }];
  const lmLibrary = { materials: [{ id: 'lm-temp-101', title: 'Old' }, { id: 99, title: 'Another' }] };
  const current = { id: 'lm-temp-101', title: 'Old', blocks: [] };
  const draft = { id: 45, stageRevision: 1, title: 'Imported', blocks: [{ id: 'b1', type: 'text' }] };

  const sandbox = {
    window: {
      LearningMain: {
        saveLesson: async (d) => {
          d.id = 45;
          d.stageRevision = 1;
        }
      },
      ContentCache: {
        drop: (k) => droppedCaches.push(k)
      }
    },
    classGroups,
    lmLibrary,
    groupSave: () => { groupSaved = true; },
    stageWriteBlock: (id, kind, rev, payload) => writtenBlocks.push({ id, kind, rev, payload }),
    stageFlushBlocks: () => {},
    lmKeepLesson: () => {},
    lmPersist: () => {},
    canEditLessons: () => true,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    JSON,
    esc: s => String(s || '')
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  await sandbox.lmPdfSavePreparedDraft(draft, current, () => true);

  assert.equal(current.id, 45);
  assert.deepEqual(classGroups[0].lessonIds, [45, 99]);
  assert.equal(groupSaved, true);
  assert.equal(lmLibrary.materials.some(m => m.id === 'lm-temp-101'), false);
  assert.ok(droppedCaches.includes(':45:'));
  assert.ok(droppedCaches.includes(':lm-temp-101:'));
  assert.ok(droppedCaches.includes('lesson:'));
  assert.ok(droppedCaches.includes('library:summary'));
  assert.equal(writtenBlocks.length, 1);
  assert.equal(writtenBlocks[0].id, 45);
});

test('lmHandleScriptFileUpload and lmImportPdfDraft initialize fresh lesson if lmState is null', async () => {
  const code = readFileSync('client/52b-lesson-pdf-import.js', 'utf8');
  let createdCount = 0;
  const sandbox = {
    window: {},
    lmState: null,
    canEditLessons: () => true,
    lmCreateLesson: () => {
      createdCount++;
      sandbox.lmState = { id: 'fresh-1', blocks: [] };
    },
    lmExtractTextFromFile: async () => 'sample text',
    lmGenerateLessonFromScript: async () => {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    JSON,
    esc: s => String(s || '')
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const mockFile = { name: 'lesson.txt', type: 'text/plain', size: 100 };
  await sandbox.lmHandleScriptFileUpload(mockFile);

  assert.equal(createdCount, 1);
  assert.ok(sandbox.lmState);
  assert.equal(sandbox.lmState.id, 'fresh-1');
});

test('lmCreateLesson resets script and file inputs', () => {
  const code = readFileSync('client/52-lessons.js', 'utf8');
  const elements = {
    lmScriptInput: { value: 'old text' },
    lmScriptStatus: { textContent: 'old status' },
    lmPdfImportStatus: { textContent: 'old error', hidden: false },
    '[data-lesson-script-file]': { value: 'C:\\fakepath\\file.txt' },
    '[data-lesson-pdf-import-file]': { value: 'C:\\fakepath\\doc.pdf' }
  };
  const sandbox = {
    window: {},
    document: {
      getElementById: (id) => elements[id] || null,
      querySelector: (sel) => elements[sel] || null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    canEditLessons: () => true,
    lmEnsure: () => {},
    lmPdfProgressEnd: () => {},
    lmBlankMaterial: () => ({ id: '', blocks: [] }),
    lmUniqueId: () => 'fresh-id',
    lmToday: () => '2026-10-30',
    groupNormalize: () => {},
    classGroups: [{ id: 'g1', lessonIds: [] }],
    classGroupId: 'g1',
    lmKeepLesson: () => {},
    show: () => {},
    lmRenderEditor: () => {},
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    JSON,
    esc: s => String(s || '')
  };
  vm.createContext(sandbox);
  const fnStart = code.indexOf('function lmCreateLesson() {');
  const fnEnd = code.indexOf('function paintMaterial() {');
  const fnCode = code.slice(fnStart, fnEnd);
  vm.runInContext(fnCode + '\nlmCreateLesson();', sandbox);

  assert.equal(elements.lmScriptInput.value, '');
  assert.equal(elements.lmScriptStatus.textContent, '');
  assert.equal(elements.lmPdfImportStatus.textContent, '');
  assert.equal(elements.lmPdfImportStatus.hidden, true);
  assert.equal(elements['[data-lesson-script-file]'].value, '');
  assert.equal(elements['[data-lesson-pdf-import-file]'].value, '');
  assert.equal(sandbox.lmState.id, 'fresh-id');
});

test('lmParseScriptToLessonData verifies words via catalog and avoids dummy placeholder options', () => {
  const code = readFileSync('client/52b-lesson-pdf-import.js', 'utf8');
  const catalog = {
    commuter: { en: 'commuter', ru: 'пригородный пассажир', example: 'A daily commuter.' },
    detour: { en: 'detour', ru: 'объезд', example: 'Take a detour.' }
  };
  const sandbox = {
    window: {},
    findCatalog: (word) => catalog[word.toLowerCase()] || null,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    JSON,
    esc: s => String(s || ''),
    canEditLessons: () => true
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const textWithCodeAndWords = `
Title: Daily Transport
xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
w:pPr w:rFonts="Arial" rsid="12345"
Commuters experience significant detour delays during peak hours.
`;

  const data = sandbox.lmParseScriptToLessonData(textWithCodeAndWords, 'transport.docx');
  assert.equal(data.title, 'Daily Transport');

  const extractedWords = data.words.map(w => w.word.toLowerCase());
  assert.ok(!extractedWords.includes('xmlns'));
  assert.ok(!extractedWords.includes('schemas'));
  assert.ok(!extractedWords.includes('openxmlformats'));
  assert.ok(!extractedWords.includes('wordprocessingml'));
  assert.ok(!extractedWords.includes('rsid'));

  const commuter = data.words.find(w => w.word.toLowerCase() === 'commuter');
  assert.ok(commuter, 'Must extract verified commuter');
  assert.equal(commuter.translation, 'пригородный пассажир');
  assert.ok(!commuter.translation.startsWith('слово: '));

  const choiceExercises = data.classwork.filter(c => c.kind === 'choice');
  assert.ok(choiceExercises.length >= 2);
  for (const ex of choiceExercises) {
    assert.ok(!ex.options.includes('Option A (Correct)'));
    assert.ok(!ex.options.includes('Distractor 1'));
    assert.ok(!ex.options.includes('Option B (Incorrect)'));
  }
});

test('multi-cycle file import, delete draft, and re-upload isolation lifecycle', async () => {
  const codePdfImport = readFileSync('client/52b-lesson-pdf-import.js', 'utf8');
  const codeLessons = readFileSync('client/52-lessons.js', 'utf8');
  const codeMainHooks = readFileSync('client/main/main-hooks.js', 'utf8');

  const domElements = {
    lmTitle: { id: 'lmTitle', value: '' },
    lmDescription: { id: 'lmDescription', value: '' },
    lmDate: { id: 'lmDate', value: '' },
    lmClass: { id: 'lmClass', value: '' },
    lmUnit: { id: 'lmUnit', value: '' },
    lmLesson: { id: 'lmLesson', value: '' },
    lmScriptInput: { id: 'lmScriptInput', value: '' },
    lmScriptStatus: { id: 'lmScriptStatus', textContent: '' },
    lmPdfImportStatus: { id: 'lmPdfImportStatus', textContent: '', hidden: false },
    lmBlocks: { id: 'lmBlocks', innerHTML: '' },
    lmPdfDraftDialog: null
  };

  const catalog = {
    biodiversity: { en: 'biodiversity', ru: 'биоразнообразие', example: 'Ocean biodiversity is fragile.' },
    ecosystem: { en: 'ecosystem', ru: 'экосистема', example: 'Coral reef ecosystem.' },
    commuter: { en: 'commuter', ru: 'пригородный пассажир', example: 'A busy commuter.' },
    detour: { en: 'detour', ru: 'объезд', example: 'Road detour.' }
  };

  let idCounter = 1;
  const library = { materials: [], activeId: '' };

  const sandbox = {
    window: {},
    document: {
      getElementById: (id) => {
        if (id === 'lmPdfDraftDialog') return domElements.lmPdfDraftDialog;
        return domElements[id] || null;
      },
      querySelector: (sel) => {
        if (sel === '#lmPdfDraftDialog') return domElements.lmPdfDraftDialog;
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    findCatalog: (w) => catalog[w.toLowerCase()] || null,
    lmLibrary: library,
    lmState: null,
    viewGen: 1,
    viewSwitching: false,
    confirm: () => true,
    authUser: 'teacher',
    canEditLessons: () => true,
    lmEnsure: () => {},
    lmPdfProgressEnd: () => {},
    lmUniqueId: () => 'lesson-' + (idCounter++),
    lmBlankMaterial: () => ({ id: '', title: '', description: '', blocks: [] }),
    lmKeepLesson: () => {
      if (sandbox.lmState) {
        const idx = library.materials.findIndex(m => m.id === sandbox.lmState.id);
        if (idx < 0) library.materials.push(sandbox.lmState);
        else library.materials[idx] = sandbox.lmState;
        library.activeId = sandbox.lmState.id;
      }
    },
    lmPersist: () => {},
    show: () => {},
    lmToday: () => '2026-10-30',
    groupNormalize: () => {},
    classGroups: [{ id: 'g1', lessonIds: [] }],
    classGroupId: 'g1',
    clearTimeout: () => {},
    setTimeout: () => {},
    stageSaveTimer: null,
    lmSaveTimer: null,
    paintLmDays: () => {},
    lmRenderEditor: () => {},
    domEntityId: (id) => id,
    stageDomId: (val) => /^[1-9]\d{0,15}$/.test(String(val || '')) ? Number(val) : val,
    crypto,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    JSON,
    console,
    esc: s => String(s || '')
  };

  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const fnCreateStart = codeLessons.indexOf('function lmCreateLesson() {');
  const fnCreateEnd = codeLessons.indexOf('function paintMaterial() {');
  const fnDeleteStart = codeLessons.indexOf('function lmDeleteLesson(id) {');
  const fnDeleteEnd = codeLessons.indexOf('function lmHideLesson(id) {');

  const fnStageDeleteStart = codeMainHooks.indexOf('function stageDeleteLesson(id){');
  const fnStageDeleteEnd = codeMainHooks.indexOf('function stageRenameLesson(id,newName){');

  vm.runInContext(codePdfImport, sandbox);
  vm.runInContext(codeLessons.slice(fnCreateStart, fnCreateEnd), sandbox);
  vm.runInContext(codeLessons.slice(fnDeleteStart, fnDeleteEnd), sandbox);
  vm.runInContext(codeMainHooks.slice(fnStageDeleteStart, fnStageDeleteEnd), sandbox);

  // === CYCLE 1: File 1 (Marine Biology) ===
  const file1Content = `
Title: Marine Biology
Class: Advanced Ecology
Unit: 4
Lesson: 2
Words:
biodiversity - биоразнообразие
ecosystem - экосистема
Overview: Coastal marine environments and coral reefs.
`;
  const data1 = sandbox.lmParseScriptToLessonData(file1Content, 'marine.docx');
  assert.equal(data1.title, 'Marine Biology');
  assert.equal(data1.className, 'Advanced Ecology');
  assert.equal(data1.unit, '4');
  assert.equal(data1.lesson, '2');

  sandbox.lmCreateLesson();
  const lesson1 = sandbox.lmState;
  assert.ok(lesson1);
  lesson1.title = data1.title;
  lesson1.className = data1.className;
  lesson1.unit = data1.unit;
  lesson1.lesson = data1.lesson;
  lesson1.blocks = [{ type: 'vocab', word: 'biodiversity' }, { type: 'vocab', word: 'ecosystem' }];
  sandbox.lmKeepLesson();

  domElements.lmTitle.value = data1.title;
  domElements.lmClass.value = data1.className;
  domElements.lmUnit.value = data1.unit;
  domElements.lmLesson.value = data1.lesson;
  domElements.lmBlocks.innerHTML = '<div>2 blocks</div>';
  domElements.lmPdfDraftDialog = { remove: () => { domElements.lmPdfDraftDialog = null; } };

  assert.equal(domElements.lmTitle.value, 'Marine Biology');
  assert.equal(domElements.lmClass.value, 'Advanced Ecology');
  assert.equal(library.materials.length, 1);
  assert.equal(library.materials[0].title, 'Marine Biology');

  // === STEP 2: Delete Draft / Lesson ===
  sandbox.stageDeleteLesson(lesson1.id);

  assert.equal(sandbox.lmState, null, 'lmState must be null after delete');
  assert.equal(domElements.lmTitle.value, '', 'lmTitle DOM input must be cleared');
  assert.equal(domElements.lmDescription.value, '', 'lmDescription DOM input must be cleared');
  assert.equal(domElements.lmClass.value, '', 'lmClass DOM input must be cleared');
  assert.equal(domElements.lmUnit.value, '', 'lmUnit DOM input must be cleared');
  assert.equal(domElements.lmLesson.value, '', 'lmLesson DOM input must be cleared');
  assert.equal(domElements.lmBlocks.innerHTML, '', 'lmBlocks DOM element must be cleared');
  assert.equal(domElements.lmPdfDraftDialog, null, 'Draft dialog must be removed');
  assert.equal(library.materials.length, 0, 'Lesson must be removed from library');

  // === CYCLE 2: File 2 (Urban Transit) ===
  const file2Content = `
Title: Urban Transit
Class: Mobility Systems
Unit: 9
Lesson: 1
Words:
commuter - пригородный пассажир
detour - объезд
Overview: Efficient mass transit options for city dwellers.
`;
  const data2 = sandbox.lmParseScriptToLessonData(file2Content, 'transit.odt');
  assert.equal(data2.title, 'Urban Transit');
  assert.equal(data2.className, 'Mobility Systems');
  assert.equal(data2.unit, '9');
  assert.equal(data2.lesson, '1');

  const words2 = data2.words.map(w => w.word.toLowerCase());
  assert.ok(words2.includes('commuter'));
  assert.ok(words2.includes('detour'));
  assert.ok(!words2.includes('biodiversity'), 'Must not contain File 1 words');
  assert.ok(!words2.includes('ecosystem'), 'Must not contain File 1 words');

  sandbox.lmCreateLesson();
  const lesson2 = sandbox.lmState;
  assert.notEqual(lesson2.id, lesson1.id, 'Must have a new unique ID');
  lesson2.title = data2.title;
  lesson2.className = data2.className;
  lesson2.unit = data2.unit;
  lesson2.lesson = data2.lesson;
  lesson2.blocks = [{ type: 'vocab', word: 'commuter' }, { type: 'vocab', word: 'detour' }];
  sandbox.lmKeepLesson();

  domElements.lmTitle.value = data2.title;
  domElements.lmClass.value = data2.className;
  domElements.lmUnit.value = data2.unit;
  domElements.lmLesson.value = data2.lesson;
  domElements.lmBlocks.innerHTML = '<div>2 new blocks</div>';

  assert.equal(domElements.lmTitle.value, 'Urban Transit');
  assert.equal(domElements.lmClass.value, 'Mobility Systems');
  assert.equal(domElements.lmUnit.value, '9');
  assert.equal(domElements.lmLesson.value, '1');
  assert.equal(library.materials.length, 1);
  assert.equal(library.materials[0].title, 'Urban Transit');
  assert.equal(library.materials[0].className, 'Mobility Systems');

  // === CYCLE 3: Delete using lmDeleteLesson and load File 3 ===
  domElements.lmPdfDraftDialog = { remove: () => { domElements.lmPdfDraftDialog = null; } };
  sandbox.lmDeleteLesson(lesson2.id);

  assert.equal(sandbox.lmState, null, 'lmState must be null after lmDeleteLesson');
  assert.equal(domElements.lmTitle.value, '', 'lmTitle DOM input must be cleared by lmDeleteLesson');
  assert.equal(domElements.lmDescription.value, '', 'lmDescription DOM input must be cleared');
  assert.equal(domElements.lmClass.value, '', 'lmClass DOM input must be cleared');
  assert.equal(domElements.lmUnit.value, '', 'lmUnit DOM input must be cleared');
  assert.equal(domElements.lmLesson.value, '', 'lmLesson DOM input must be cleared');
  assert.equal(domElements.lmBlocks.innerHTML, '', 'lmBlocks DOM element must be cleared');
  assert.equal(domElements.lmPdfDraftDialog, null, 'Draft dialog must be removed by lmDeleteLesson');
  assert.equal(library.materials.length, 0, 'Library must be empty');

  // Load File 3 with freeform text and filename fallback title
  const file3Content = `
Commuters encounter a sudden detour on their morning journey.
`;
  const data3 = sandbox.lmParseScriptToLessonData(file3Content, 'Rapid Transit');
  assert.equal(data3.title, 'Rapid Transit', 'Must use Rapid Transit fallback title');
  const words3 = data3.words.map(w => w.word.toLowerCase());
  assert.ok(words3.includes('commuter'));
  assert.ok(words3.includes('detour'));
  assert.ok(!words3.includes('biodiversity'));

  sandbox.lmCreateLesson();
  const lesson3 = sandbox.lmState;
  assert.notEqual(lesson3.id, lesson2.id);
  assert.notEqual(lesson3.id, lesson1.id);
  lesson3.title = data3.title;
  sandbox.lmKeepLesson();
  assert.equal(library.materials.length, 1);
  assert.equal(library.materials[0].title, 'Rapid Transit');
});
