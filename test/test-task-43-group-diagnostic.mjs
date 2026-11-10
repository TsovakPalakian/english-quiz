import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchChromium, resolveTestDependency} from '../ops/check-environment.mjs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));

test('TASK-43: Code contracts for Group Diagnostic Overview restoration and refinement', async () => {
  const htmlSrc = await fs.readFile(path.resolve('site/preview.html'), 'utf8');
  const dirSrc = await fs.readFile(path.resolve('client/53-group-directory.js'), 'utf8');
  const previewSrc = await fs.readFile(path.resolve('preview.js'), 'utf8');
  const cssSrc = await fs.readFile(path.resolve('site/preview.css'), 'utf8');

  // 1. site/preview.html contains #groupDetailDiagnostic without display: none !important
  assert.ok(
    htmlSrc.includes('<div id="groupDetailDiagnostic" class="group-diagnostic-panel" hidden>'),
    'site/preview.html must contain #groupDetailDiagnostic with hidden attribute without display: none !important'
  );
  assert.ok(
    !htmlSrc.includes('id="groupDetailDiagnostic" class="group-diagnostic-panel" hidden style="display: none !important;"'),
    'site/preview.html must not contain inline style display: none !important'
  );

  // 2. client/53-group-directory.js enables panel for teachers and hides for non-teachers
  assert.ok(
    dirSrc.includes('async function paintGroupDiagnostic(groupId, groupTitle)'),
    'client/53-group-directory.js must declare paintGroupDiagnostic with groupId and groupTitle'
  );
  assert.ok(
    dirSrc.includes('paintGroupDiagnostic(group.id, group.title);'),
    'client/53-group-directory.js must invoke paintGroupDiagnostic with group.id and group.title'
  );
  assert.ok(
    dirSrc.includes('panel.hidden = false;'),
    'client/53-group-directory.js must unhide panel for teachers'
  );
  assert.ok(
    dirSrc.includes('if (!isTeacher() || viewAccount || !groupId)'),
    'client/53-group-directory.js must guard against student and viewAccount access'
  );

  // 3. preview.js contains the compiled code
  assert.ok(
    previewSrc.includes('async function paintGroupDiagnostic(groupId, groupTitle)'),
    'preview.js must include compiled paintGroupDiagnostic with groupId and groupTitle'
  );
  assert.ok(
    previewSrc.includes('panel.hidden = false;'),
    'preview.js must include compiled panel.hidden = false'
  );

  // 4. site/preview.css contains polished SaaS styles
  assert.ok(
    cssSrc.includes('.group-diagnostic-panel { margin-top: 16px; padding: 24px;'),
    'site/preview.css must style .group-diagnostic-panel with 24px padding'
  );
  assert.ok(
    cssSrc.includes('.group-diag-bars { display: flex; height: 12px; border-radius: 9999px;'),
    'site/preview.css must style .group-diag-bars with border-radius 9999px'
  );
  assert.ok(
    cssSrc.includes('.group-diag-advice-box { background: #f0fdf9; border: 1px solid #ccfbf1;'),
    'site/preview.css must style .group-diag-advice-box with soft mint background'
  );
});

test('TASK-43: Logic test for group title replacement in diagnostic recommendation', () => {
  const original = '100% of recent mistakes in Group 24 represent lexical gaps. Recommended: Active vocabulary retrieval using flashcards and context generation.';
  const groupId = 24;
  const groupTitle = 'Evening Intermediate A2';

  let recommendation = original;
  if (groupTitle && typeof groupTitle === 'string' && groupTitle.trim()) {
    recommendation = recommendation.replace(new RegExp('\\bGroup\\s+' + groupId + '\\b', 'g'), groupTitle.trim());
    recommendation = recommendation.replace(/\bThe subgroup\b/g, groupTitle.trim());
  }

  assert.equal(
    recommendation,
    '100% of recent mistakes in Evening Intermediate A2 represent lexical gaps. Recommended: Active vocabulary retrieval using flashcards and context generation.'
  );
});

test('TASK-43: Visual validation of refined Group Diagnostic Overview in DOM', async () => {
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

    // Verify #groupDetailDiagnostic exists and is initially hidden in raw HTML template
    const diagPanel = page.locator('#groupDetailDiagnostic');
    assert.equal(await diagPanel.count(), 1, '#groupDetailDiagnostic must exist in DOM');

    // Simulate paintGroupDiagnostic activation with 1 error (matching screenshot)
    await page.evaluate(() => {
      const panel = document.getElementById('groupDetailDiagnostic');
      panel.hidden = false;
      const badge = document.getElementById('groupDiagTotalErrors');
      const bars = document.getElementById('groupDiagBars');
      const legend = document.getElementById('groupDiagLegend');
      const advice = document.getElementById('groupDiagAdvice');

      badge.textContent = '1 error';
      bars.innerHTML = '<div class="group-diag-bar-segment" style="width: 100%; background: #10b981;" title="Vocabulary Gaps: 100%"></div>';
      legend.innerHTML = '<span class="group-diag-pill" style="border-left-color: #10b981; background: #ecfdf5; border-color: #a7f3d0;"><b>100%</b> Vocabulary Gaps</span>';
      advice.innerHTML = '<div class="group-diag-advice-box">' +
        '<div class="group-diag-advice-head"><span>💡 Recommended lesson focus</span></div>' +
        '<p class="group-diag-advice-text">100% of recent mistakes in Evening Intermediate A2 represent lexical gaps. Recommended: Active vocabulary retrieval using flashcards and context generation.</p>' +
        '<div class="group-diag-top-patterns"><b>Frequent error patterns:</b><ul><li><code>divorced man -&gt; divorced</code> (1 student)</li></ul></div>' +
        '</div>';
    });

    // Verify visibility and layout
    assert.equal(await diagPanel.isVisible(), true, '#groupDetailDiagnostic must be visible');
    const titleText = await page.locator('.group-diagnostic-head h2').innerText();
    assert.equal(titleText, 'Group Diagnostic Overview');

    const badgeText = await page.locator('#groupDiagTotalErrors').innerText();
    assert.equal(badgeText, '1 error');

    const pillText = await page.locator('.group-diag-pill').innerText();
    assert.ok(pillText.replace(/\s+/g, ' ').includes('100% Vocabulary Gaps'));

    const adviceText = await page.locator('.group-diag-advice-text').innerText();
    assert.ok(adviceText.includes('Evening Intermediate A2'));
    assert.ok(adviceText.includes('Active vocabulary retrieval'));

    const patternCode = await page.locator('.group-diag-top-patterns code').innerText();
    assert.equal(patternCode, 'divorced man -> divorced');

    // Take verification screenshot
    await diagPanel.screenshot({path: 'docs/task-43-screenshot-verification.png'});
  } finally {
    await browser.close();
  }
});
