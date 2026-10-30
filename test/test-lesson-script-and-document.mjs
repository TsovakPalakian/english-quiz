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
