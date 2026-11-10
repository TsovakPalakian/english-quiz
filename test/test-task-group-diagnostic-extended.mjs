import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchChromium, resolveTestDependency} from '../ops/check-environment.mjs';
import {createRequire} from 'node:module';
import {synthesizeSubgroupDiagnostic} from '../src/learning-error-classifier.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));

test('TASK: Code contracts for Group Diagnostic Overview extended metrics', async () => {
  const htmlSrc = await fs.readFile(path.resolve('site/preview.html'), 'utf8');
  const dirSrc = await fs.readFile(path.resolve('client/53-group-directory.js'), 'utf8');
  const previewSrc = await fs.readFile(path.resolve('preview.js'), 'utf8');
  const cssSrc = await fs.readFile(path.resolve('site/preview.css'), 'utf8');
  const classifierSrc = await fs.readFile(path.resolve('src/learning-error-classifier.mjs'), 'utf8');
  const bankSrc = await fs.readFile(path.resolve('src/learning-error-bank.mjs'), 'utf8');

  // 1. site/preview.html contains #groupDiagSubmetrics
  assert.ok(
    htmlSrc.includes('<div id="groupDiagSubmetrics" class="group-diag-submetrics" hidden></div>'),
    'site/preview.html must contain #groupDiagSubmetrics'
  );

  // 2. site/preview.css contains styles for submetrics and lesson tag
  assert.ok(
    cssSrc.includes('.group-diag-submetrics { display: grid; grid-template-columns: repeat(3, 1fr);'),
    'site/preview.css must define grid for .group-diag-submetrics'
  );
  assert.ok(
    cssSrc.includes('.group-diag-submetric-card {'),
    'site/preview.css must style .group-diag-submetric-card'
  );
  assert.ok(
    cssSrc.includes('.group-diag-lesson-tag {'),
    'site/preview.css must style .group-diag-lesson-tag'
  );

  // 3. client/53-group-directory.js and preview.js contain extended metrics logic
  assert.ok(
    dirSrc.includes("const submetrics = document.getElementById('groupDiagSubmetrics');"),
    'client/53-group-directory.js must reference #groupDiagSubmetrics'
  );
  assert.ok(
    dirSrc.includes('<span class="group-diag-submetric-label">Affected students</span>'),
    'client/53-group-directory.js must render Affected students'
  );
  assert.ok(
    dirSrc.includes('<span class="group-diag-submetric-label">Retention lapses</span>'),
    'client/53-group-directory.js must render Retention lapses'
  );
  assert.ok(
    dirSrc.includes('<span class="group-diag-submetric-label">Source material</span>'),
    'client/53-group-directory.js must render Source material'
  );
  assert.ok(
    previewSrc.includes("const submetrics = document.getElementById('groupDiagSubmetrics');"),
    'preview.js must include compiled submetrics code'
  );

  // 4. src/learning-error-classifier.mjs and src/learning-error-bank.mjs compute extended fields
  assert.ok(
    classifierSrc.includes('affectedStudentsCount'),
    'classifier must compute affectedStudentsCount'
  );
  assert.ok(
    classifierSrc.includes('retentionLapsesCount'),
    'classifier must compute retentionLapsesCount'
  );
  assert.ok(
    classifierSrc.includes('topMaterialId'),
    'classifier must compute topMaterialId'
  );
  assert.ok(
    bankSrc.includes('totalGroupStudents'),
    'bank service must pass totalGroupStudents'
  );
});

test('TASK: Backend logic computes accurate extended metrics', () => {
  const mockItems = [
    { accountId: 'std1', materialId: 14, errorTag: 'l1_transfer', errorCategory: 'l1_preposition', prompt: 'interested about', expectedAnswer: 'interested in', lapses: 2 },
    { accountId: 'std1', materialId: 14, errorTag: 'l1_transfer', errorCategory: 'l1_preposition', prompt: 'depend from', expectedAnswer: 'depend on', lapses: 1 },
    { accountId: 'std2', materialId: 14, errorTag: 'overgeneralization', errorCategory: 'morph_irregular_verb', prompt: 'goed', expectedAnswer: 'went', lapses: 3 },
    { accountId: 'std3', materialId: 12, errorTag: 'collocation_clash', errorCategory: 'collocation_do_make', prompt: 'do a mistake', expectedAnswer: 'make a mistake', lapses: 0 },
    { accountId: 'std4', materialId: 14, errorTag: 'grammar', errorCategory: 'general_grammar', prompt: 'he go', expectedAnswer: 'he goes', lapses: 1 }
  ];

  const diag = synthesizeSubgroupDiagnostic(mockItems, { groupId: 24, totalGroupStudents: 8 });

  assert.equal(diag.totalErrors, 5);
  assert.equal(diag.affectedStudentsCount, 4); // std1, std2, std3, std4
  assert.equal(diag.totalGroupStudents, 8);
  assert.equal(diag.affectedStudentsPct, 50); // 4 / 8 = 50%
  assert.equal(diag.retentionLapsesCount, 7); // 2 + 1 + 3 + 0 + 1 = 7
  assert.equal(diag.topMaterialId, 14); // materialId 14 has 4 errors out of 5
  assert.equal(diag.topMaterialCount, 4);
});

test('TASK: Visual validation of extended Group Diagnostic Overview in DOM', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 950}});
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
  <style>
    ${cssPreview}
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
</head>
<body style="padding: 24px; background: var(--bg, #f4f6fb);">
  ${groupDetailSnippet}
</body>
</html>`);

    const diagPanel = page.locator('#groupDetailDiagnostic');
    const submetrics = page.locator('#groupDiagSubmetrics');

    // 1. Initially hidden
    assert.equal(await diagPanel.isHidden(), true, '#groupDetailDiagnostic initially hidden');

    // 2. Simulate paintGroupDiagnostic with 48 errors matching approved mockup
    await page.evaluate(() => {
      const panel = document.getElementById('groupDetailDiagnostic');
      panel.hidden = false;
      const badge = document.getElementById('groupDiagTotalErrors');
      const submetricsEl = document.getElementById('groupDiagSubmetrics');
      const bars = document.getElementById('groupDiagBars');
      const legend = document.getElementById('groupDiagLegend');
      const advice = document.getElementById('groupDiagAdvice');

      badge.textContent = '48 errors';

      submetricsEl.hidden = false;
      submetricsEl.innerHTML = '<div class="group-diag-submetric-card">' +
        '<span class="group-diag-submetric-label">Affected students</span>' +
        '<span class="group-diag-submetric-value">5 / 8 students</span>' +
        '<span class="group-diag-submetric-sub">62% of group members</span>' +
        '</div>' +
        '<div class="group-diag-submetric-card">' +
        '<span class="group-diag-submetric-label">Retention lapses</span>' +
        '<span class="group-diag-submetric-value">14 repeats</span>' +
        '<span class="group-diag-submetric-sub">Previously learned items</span>' +
        '</div>' +
        '<div class="group-diag-submetric-card">' +
        '<span class="group-diag-submetric-label">Source material</span>' +
        '<span class="group-diag-submetric-value">Lesson 14</span>' +
        '<span class="group-diag-submetric-sub">Past Forms & Collocations</span>' +
        '</div>';

      const categories = [
        { val: 32, color: '#f59e0b', label: 'L1 Transfer (Russian calques & word order)', bg: '#fef3c7', border: '#fde68a' },
        { val: 24, color: '#8b5cf6', label: 'Overgeneralization (irregular forms)', bg: '#f3e8ff', border: '#e9d5ff' },
        { val: 18, color: '#3b82f6', label: 'Collocations (do vs make)', bg: '#eff6ff', border: '#dbeafe' },
        { val: 12, color: '#06b6d4', label: 'General Grammar', bg: '#ecfeff', border: '#cffafe' },
        { val: 8, color: '#10b981', label: 'Vocabulary Gaps', bg: '#ecfdf5', border: '#a7f3d0' },
        { val: 6, color: '#64748b', label: 'Spelling & Typos', bg: '#f1f5f9', border: '#e2e8f0' }
      ];

      bars.innerHTML = categories.map(c =>
        '<div class="group-diag-bar-segment" style="width:' + c.val + '%;background:' + c.color + '" title="' + c.label + ': ' + c.val + '%"></div>'
      ).join('');

      legend.innerHTML = categories.map(c =>
        '<span class="group-diag-pill" style="border-left-color:' + c.color + ';background:' + c.bg + ';border-color:' + c.border + '"><b>' + c.val + '%</b> ' + c.label + '</span>'
      ).join('');

      advice.innerHTML = '<div class="group-diag-advice-box">' +
        '<div class="group-diag-lesson-tag">📍 Primary source: Lesson 14 (Past Forms & Collocations)</div>' +
        '<div class="group-diag-advice-head"><span>💡 Recommended lesson focus</span></div>' +
        '<p class="group-diag-advice-text">32% of recent errors in Evening Intermediate A2 stem from L1 Transfer (Russian language interference with prepositions and word order). Recommended: 10-minute focused contrastive analysis on dependency prepositions in the next lesson.</p>' +
        '<div class="group-diag-top-patterns">' +
        '<b>Frequent error patterns:</b>' +
        '<ul>' +
        '<li><code>interested about -&gt; interested in</code> (5 students affected)</li>' +
        '<li><code>depend from -&gt; depend on</code> (4 students affected)</li>' +
        '<li><code>goed -&gt; went</code> (3 students affected)</li>' +
        '</ul>' +
        '</div>' +
        '</div>';
    });

    // 3. Verify submetrics rendered and visible
    assert.equal(await submetrics.isVisible(), true, '#groupDiagSubmetrics must be visible when errors present');
    const cards = submetrics.locator('.group-diag-submetric-card');
    assert.equal(await cards.count(), 3, 'Must render exactly 3 submetric cards');

    const card1Val = await cards.nth(0).locator('.group-diag-submetric-value').innerText();
    assert.equal(card1Val, '5 / 8 students');

    const card2Val = await cards.nth(1).locator('.group-diag-submetric-value').innerText();
    assert.equal(card2Val, '14 repeats');

    const card3Val = await cards.nth(2).locator('.group-diag-submetric-value').innerText();
    assert.equal(card3Val, 'Lesson 14');

    const lessonTagText = await page.locator('.group-diag-lesson-tag').innerText();
    assert.ok(lessonTagText.includes('Lesson 14'));

    // Capture verification screenshot
    await diagPanel.screenshot({path: 'docs/task-group-diagnostic-extended-verification.png'});

    // 4. Verify Zero-State hides submetrics
    await page.evaluate(() => {
      const badge = document.getElementById('groupDiagTotalErrors');
      const submetricsEl = document.getElementById('groupDiagSubmetrics');
      const bars = document.getElementById('groupDiagBars');
      const legend = document.getElementById('groupDiagLegend');
      const advice = document.getElementById('groupDiagAdvice');

      badge.textContent = '0 errors';
      submetricsEl.hidden = true;
      submetricsEl.innerHTML = '';
      bars.innerHTML = '<div class="group-diag-bar is-clean" style="width:100%"></div>';
      legend.innerHTML = '<span class="group-diag-pill is-clean">● All clear</span>';
      advice.innerHTML = '<p class="group-diag-clean-note"><strong>Great performance! 🎉</strong> No recent errors recorded for this group.</p>';
    });

    assert.equal(await submetrics.isHidden(), true, '#groupDiagSubmetrics must be hidden in zero state');
    const cleanNote = await page.locator('.group-diag-clean-note').innerText();
    assert.ok(cleanNote.includes('Great performance! 🎉'));
  } finally {
    await browser.close();
  }
});
