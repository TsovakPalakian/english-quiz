import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Verified cards accordion across phrases, words, rules, and classwork tabs', async (t) => {
  const code = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');
  const previewCode = fs.readFileSync(path.join(rootDir, 'preview.js'), 'utf8');

  await t.test('1. Editor logic implements dynamic titles for phrases, words, rules, and general tabs', () => {
    assert.ok(code.includes('tabVerifiedTitle = "Verified phrases"'), 'Must define Verified phrases title');
    assert.ok(code.includes('tabVerifiedTitle = "Verified words"'), 'Must define Verified words title');
    assert.ok(code.includes('tabVerifiedTitle = "Verified rules"'), 'Must define Verified rules title');
    assert.ok(code.includes('tabVerifiedTitle = "Verified materials & quizzes"'), 'Must retain Verified materials & quizzes title');
  });

  await t.test('2. Single block renderer collapses verified blocks by default inside verified section', () => {
    assert.ok(
      code.includes('const isShut = isVerifiedSection ? !block.unfolded : Boolean(block.collapsed);'),
      'renderSingleBlock must set isShut for verified section unless explicitly expanded'
    );
    assert.ok(
      code.includes('lmHead(block,label,isFirst,isLast,isVerifiedSection)'),
      'renderSingleBlock must forward isVerifiedSection to lmHead'
    );
  });

  await t.test('3. Fold button handler correctly toggles collapsed state on verified blocks', () => {
    assert.ok(
      code.includes('const isCurrentlyShut = block.teacherVerified ? !block.unfolded : Boolean(block.collapsed);'),
      'data-lm-fold must handle verified blocks default shut state'
    );
  });

  await t.test('4. preview.js contains the compiled accordion and folding logic', () => {
    assert.ok(previewCode.includes('Verified phrases'), 'preview.js must include Verified phrases');
    assert.ok(previewCode.includes('Verified words'), 'preview.js must include Verified words');
    assert.ok(previewCode.includes('Verified rules'), 'preview.js must include Verified rules');
  });

  await t.test('5. Word input fields and summary have bold and enlarged typography', () => {
    const css = fs.readFileSync(path.join(rootDir, 'site/preview.css'), 'utf8');
    assert.ok(css.includes('input[data-item-field="word"]'), 'Must target data-item-field="word"');
    assert.ok(css.includes('input[data-field="word"]'), 'Must target data-field="word"');
    assert.ok(css.includes('input[data-item-field="phrase"]'), 'Must target data-item-field="phrase"');
    assert.ok(css.includes('font-weight: 700;'), 'Must apply bold font weight');
    assert.ok(css.includes('font-size: 16px;'), 'Must increase word font size to 16px');
    assert.ok(css.includes('.lm-block.is-shut .lm-summary'), 'Must style collapsed block summary');
  });
});
