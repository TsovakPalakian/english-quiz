import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchChromium, resolveTestDependency} from '../ops/check-environment.mjs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));

test('TASK: Verify code contracts for hiding Group Diagnostic Overview', async () => {
  const htmlSrc = await fs.readFile(path.resolve('site/preview.html'), 'utf8');
  const dirSrc = await fs.readFile(path.resolve('client/53-group-directory.js'), 'utf8');
  const previewSrc = await fs.readFile(path.resolve('preview.js'), 'utf8');

  // 1. Check site/preview.html contains hidden attribute on template
  assert.ok(
    htmlSrc.includes('<div id="groupDetailDiagnostic" class="group-diagnostic-panel" hidden>'),
    'site/preview.html must contain #groupDetailDiagnostic with hidden attribute'
  );

  // 2. Check client/53-group-directory.js keeps panel.hidden = true for students and viewAccount
  assert.ok(
    dirSrc.includes('panel.hidden = true;'),
    'client/53-group-directory.js must set panel.hidden = true for non-teachers'
  );
  assert.ok(
    dirSrc.includes('if (!isTeacher() || viewAccount || !groupId)'),
    'client/53-group-directory.js must hide diagnostic panel for students and viewAccount'
  );

  // 3. Check preview.js contains the compiled hidden enforcement for non-teachers
  assert.ok(
    previewSrc.includes('if (!isTeacher() || viewAccount || !groupId)'),
    'preview.js must include compiled hidden enforcement for non-teachers'
  );
});

test('TASK: Visual validation of hidden Group Diagnostic Overview in DOM', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    const cssPreview = await fs.readFile(path.resolve('site/preview.css'), 'utf8');
    const htmlSrc = await fs.readFile(path.resolve('site/preview.html'), 'utf8');

    // Extract groupdetail section
    const startIdx = htmlSrc.indexOf('<section id="groupdetail">');
    const endIdx = htmlSrc.indexOf('</section>', startIdx);
    assert.ok(startIdx > 0 && endIdx > startIdx, 'Must find section#groupdetail in preview.html');
    const groupDetailSnippet = htmlSrc.slice(startIdx, endIdx + '</section>'.length)
      .replace('<section id="groupdetail">', '<section id="groupdetail" class="on">');

    await page.setContent(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${cssPreview}</style>
</head>
<body style="padding: 24px; background: var(--bg, #f4f6fb);">
  ${groupDetailSnippet}
</body>
</html>`);

    // Verify #groupDetailDiagnostic has hidden attribute and computed display none
    const diagPanel = page.locator('#groupDetailDiagnostic');
    assert.equal(await diagPanel.count(), 1, '#groupDetailDiagnostic must exist in DOM');
    const diagDisplay = await diagPanel.evaluate(el => getComputedStyle(el).display);
    assert.equal(diagDisplay, 'none', '#groupDetailDiagnostic computed display must be none');
    const diagHiddenAttr = await diagPanel.evaluate(el => el.hasAttribute('hidden'));
    assert.equal(diagHiddenAttr, true, '#groupDetailDiagnostic must have hidden attribute');

    // Verify calendar widget is present and does not have hidden attribute or display none
    const calWidget = page.locator('#groupCalendarWidget');
    assert.equal(await calWidget.count(), 1, '#groupCalendarWidget must exist in DOM');
    const calDisplay = await calWidget.evaluate(el => getComputedStyle(el).display);
    assert.notEqual(calDisplay, 'none', '#groupCalendarWidget computed display must not be none');
    const calHiddenAttr = await calWidget.evaluate(el => el.hasAttribute('hidden'));
    assert.equal(calHiddenAttr, false, '#groupCalendarWidget must not have hidden attribute');

    // Verify destination cards remain visible
    const cards = page.locator('.group-detail-destinations .file-card');
    assert.equal(await cards.count(), 4, 'Must have 4 destination cards');
    for (let i = 0; i < 4; i++) {
      assert.equal(await cards.nth(i).isVisible(), true, `Card ${i} must remain visible`);
    }
  } finally {
    await browser.close();
  }
});
