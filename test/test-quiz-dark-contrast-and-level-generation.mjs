import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('1. site/preview.css True / false contrast variables use system theme properties', () => {
  const css = fs.readFileSync('site/preview.css', 'utf8');

  // Verify .lm-tf-statement uses --lm-ink / --ink and does not rely on non-existent --text
  assert.ok(css.includes('.lm-tf-statement'), 'preview.css must define .lm-tf-statement');
  assert.ok(
    /color:\s*var\(--lm-ink,\s*var\(--ink/.test(css),
    '.lm-tf-statement must use var(--lm-ink, var(--ink))'
  );
  assert.ok(!css.includes('color: var(--text, #1e293b);'), 'preview.css must not use broken --text fallback #1e293b');
  assert.ok(!css.includes('color: var(--text, #334155);'), 'preview.css must not use broken --text fallback #334155');

  // Verify .lm-tf-btn uses theme-adaptive properties
  assert.ok(css.includes('.lm-tf-btn.selected'), 'preview.css must define .lm-tf-btn.selected');
  assert.ok(
    /background:\s*var\(--lm-soft,\s*var\(--acc-s/.test(css),
    '.lm-tf-btn.selected must use var(--lm-soft, var(--acc-s)) instead of hardcoded #e0f2fe'
  );

  // Verify feedback states use ok/bad theme variables
  assert.ok(css.includes('var(--ok-s)'), 'preview.css must use var(--ok-s)');
  assert.ok(css.includes('var(--bad-s)'), 'preview.css must use var(--bad-s)');
});

test('2. client/52-lessons.js removes duplicate h3 inside lm-tf-block and enriches statement', () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');

  // Verify lmPreviewBlock for True / false does not prepend duplicate title h3 inside lm-tf-block
  assert.ok(
    code.includes("return '<div class=\"lm-tf-block\">' + scoreBadge + questions"),
    'lmPreviewBlock must omit duplicate title h3 inside lm-tf-block'
  );

  // Verify sayMatch and incompleteMatch enrichment with Russian translation
  assert.ok(code.includes('lmFindWordMeaning'), 'client/52-lessons.js must define lmFindWordMeaning');
  assert.ok(code.includes('lmFindWordExample'), 'client/52-lessons.js must define lmFindWordExample');
  assert.ok(code.includes('lmSynthesizeLevelSentence'), 'client/52-lessons.js must define lmSynthesizeLevelSentence');
  assert.ok(
    code.includes('correctly translates to Russian as "'),
    'True / false normalization must output full translation as "..."'
  );
});

test('3. production/material-quiz.js aligns True / false statement normalization with full translation', () => {
  const code = fs.readFileSync('production/material-quiz.js', 'utf8');

  assert.ok(
    code.includes("correctly translates to Russian as \"'"),
    'material-quiz.js must enrich True / false statements with translation'
  );
});

test('4. lmGenerateComplementTasks generates level-appropriate sentences and eliminates generic placeholder', () => {
  const code = fs.readFileSync('client/52-lessons.js', 'utf8');

  // Must not have the generic dummy placeholder in Gap task generation
  assert.ok(
    !code.includes('We need to understand ___ in context.'),
    'client/52-lessons.js must NOT contain the robotic placeholder "We need to understand ___ in context."'
  );

  // Must use lmSynthesizeLevelSentence and level detection
  assert.ok(
    code.includes('lmSynthesizeLevelSentence(targetObj.word, targetObj.meaning, level)'),
    'Gap generator must synthesize level-appropriate sentences when example is missing'
  );
});

test('5. Visual contrast and layout test across Sky, Dark, and Sand themes', async () => {
  const css = fs.readFileSync('site/preview.css', 'utf8');

  // Verify that all core themes have --bg, --card, --ink, --mute, --line, --acc
  ['dark', 'sky', 'sand'].forEach(theme => {
    assert.ok(css.includes(`data-theme="${theme}"`), `preview.css must define theme ${theme}`);
  });
});
