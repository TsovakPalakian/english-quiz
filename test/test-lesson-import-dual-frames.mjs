import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Stage 1: site/preview.html contains dual-frame layout and all required controls', () => {
  const htmlPath = path.resolve('site/preview.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Dual frames exist
  assert.ok(html.includes('id="lmFrameImport"'), 'Frame 1 #lmFrameImport exists');
  assert.ok(html.includes('id="lmFrameImportTitle"'), 'Frame 1 title #lmFrameImportTitle exists');
  assert.ok(html.includes('Generate & Import Lessons'), 'Frame 1 default text is present');
  assert.ok(html.includes('id="lmFrameBasic"'), 'Frame 2 #lmFrameBasic exists');

  // 2. URL Ingestion controls exist
  assert.ok(html.includes('id="lmUrlInput"'), '#lmUrlInput exists');
  assert.ok(html.includes('id="lmUrlFetchBtn"'), '#lmUrlFetchBtn exists');

  // 3. Quiz Options button & dropdown
  assert.ok(html.includes('id="lmQuizOptionsBtn"'), '#lmQuizOptionsBtn exists');
  assert.ok(html.includes('id="lmQuizOptionsDropdown"'), '#lmQuizOptionsDropdown exists');
  assert.ok(html.includes('id="lmQuizSelectedCount"'), '#lmQuizSelectedCount exists');
  assert.ok(html.includes('id="lmQuizTypesList"'), '#lmQuizTypesList exists');

  // 4. Task count per section input
  assert.ok(html.includes('id="lmTaskCountPerSection"'), '#lmTaskCountPerSection exists');

  // 5. Video choice warning banner with blinking alert class
  assert.ok(html.includes('id="lmVideoChoiceWarning"'), '#lmVideoChoiceWarning exists');
  assert.ok(html.includes('lm-blink-alert'), 'lm-blink-alert class is present');

  // 6. Action button with dynamic text capability
  assert.ok(html.includes('id="lmGenerateFromScriptBtn"'), '#lmGenerateFromScriptBtn exists');

  // 7. Voice Mode bar and disclaimer
  assert.ok(html.includes('Voice Mode in Antigravity'), 'Voice mode bar is present');
  assert.ok(html.includes('AI answers may contain inaccuracies'), 'Voice mode disclaimer is present');

  // 8. Teacher verification checkbox in Basic information
  assert.ok(html.includes('id="lmTeacherVerifyCheckbox"'), '#lmTeacherVerifyCheckbox exists');
  assert.ok(html.includes('Verified by Teacher'), 'Verified by Teacher label is present');

  // 9. Exam time limit selector
  assert.ok(html.includes('id="lmExamTimeLimitWrap"'), '#lmExamTimeLimitWrap exists');
  assert.ok(html.includes('id="lmExamTimeLimit"'), '#lmExamTimeLimit exists');

  // 10. Backward compatibility safety for #lmAppendTasks
  assert.ok(html.includes('id="lmAppendTasks"'), '#lmAppendTasks is preserved for backward compatibility');
});
