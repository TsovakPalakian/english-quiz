import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Import focus-player which attaches to globalThis
import '../client/52c-focus-player.js';

const {
  calculateMasteryScore,
  evaluateTwoFactorSubmission,
  renderTwoFactorReviewHtml
} = globalThis;

test('Stage 17: Cumulative Topic Mastery Score (40% CW + 40% HW + 20% DQ)', async (t) => {
  await t.test('calculates correct weighted score and Passed status (>= 90%)', () => {
    // 95*0.4 + 90*0.4 + 85*0.2 = 38 + 36 + 17 = 91
    const res = calculateMasteryScore({ cwScore: 95, hwScore: 90, dqScore: 85 });
    assert.equal(res.score, 91);
    assert.equal(res.passed, true);
    assert.equal(res.status, 'Passed');
    assert.equal(res.cwWeight, 0.40);
    assert.equal(res.hwWeight, 0.40);
    assert.equal(res.dqWeight, 0.20);
  });

  await t.test('calculates score below 90% as Needs work', () => {
    // 85*0.4 + 85*0.4 + 90*0.2 = 34 + 34 + 18 = 86
    const res = calculateMasteryScore({ cwScore: 85, hwScore: 85, dqScore: 90 });
    assert.equal(res.score, 86);
    assert.equal(res.passed, false);
    assert.equal(res.status, 'Needs work');
  });

  await t.test('strictly enforces 90% boundary: 89 is Needs work, 90 is Passed', () => {
    // 89*0.4 + 89*0.4 + 89*0.2 = 89
    const edgeFail = calculateMasteryScore({ cwScore: 89, hwScore: 89, dqScore: 89 });
    assert.equal(edgeFail.score, 89);
    assert.equal(edgeFail.passed, false);
    assert.equal(edgeFail.status, 'Needs work');

    // 90*0.4 + 90*0.4 + 90*0.2 = 90
    const edgePass = calculateMasteryScore({ cwScore: 90, hwScore: 90, dqScore: 90 });
    assert.equal(edgePass.score, 90);
    assert.equal(edgePass.passed, true);
    assert.equal(edgePass.status, 'Passed');
  });
});

test('Stage 16: Two-Factor Verification (Gemini AI + Teacher Final Word)', async (t) => {
  await t.test('returns Pending Teacher Review when not yet approved', () => {
    const unapproved = evaluateTwoFactorSubmission({
      aiScore: 88,
      aiFeedback: 'Minor grammatical issues with past perfect',
      approved: false
    });
    assert.equal(unapproved.teacherVerified, false);
    assert.equal(unapproved.finalScore, null);
    assert.equal(unapproved.status, 'Pending Teacher Review');
  });

  await t.test('approves AI score when confirmed by teacher', () => {
    const confirmed = evaluateTwoFactorSubmission({
      aiScore: 92,
      aiFeedback: 'Fluent usage of relative clauses',
      approved: true
    });
    assert.equal(confirmed.teacherVerified, true);
    assert.equal(confirmed.finalScore, 92);
    assert.equal(confirmed.passed, true);
    assert.equal(confirmed.status, 'Passed');
  });

  await t.test('teacher override takes precedence over AI score', () => {
    const overridden = evaluateTwoFactorSubmission({
      aiScore: 75,
      aiFeedback: 'Word repetition',
      teacherScore: 94,
      teacherComment: 'Excellent colloquial idioms used appropriately',
      approved: true
    });
    assert.equal(overridden.teacherVerified, true);
    assert.equal(overridden.finalScore, 94);
    assert.equal(overridden.passed, true);
    assert.equal(overridden.status, 'Passed');
    assert.equal(overridden.teacherComment, 'Excellent colloquial idioms used appropriately');
    assert.equal(overridden.lastWord, 'Teacher');
  });

  await t.test('renderTwoFactorReviewHtml renders UI with action buttons', () => {
    const html = renderTwoFactorReviewHtml({
      aiScore: 85,
      aiFeedback: 'Sound answer',
      teacherScore: 85,
      teacherVerified: false
    });
    assert.ok(html.includes('data-two-factor-submission'));
    assert.ok(html.includes('data-teacher-confirm-ai'));
    assert.ok(html.includes('data-teacher-override-score'));
    assert.ok(html.includes('data-teacher-approve'));
  });
});

test('Stage 18 & 19: Preview HTML and Teacher Verification Elements', () => {
  const htmlContent = fs.readFileSync(path.join(rootDir, 'site/preview.html'), 'utf8');

  // Voice mode button and modal
  assert.ok(htmlContent.includes('id="lmVoiceModeBtn"'), 'lmVoiceModeBtn must exist in HTML');
  assert.ok(htmlContent.includes('id="lmApproveAllBlocksBtn"'), 'lmApproveAllBlocksBtn must exist in HTML');
  assert.ok(htmlContent.includes('id="lmVoiceModeModal"'), 'lmVoiceModeModal must exist in HTML');

  // Mandatory disclaimer
  assert.ok(
    htmlContent.includes('⚠️ AI-generated responses may contain inaccuracies. Double-check important facts and language rules with your teacher.'),
    'Mandatory disclaimer must exist in Voice Mode'
  );

  // Lessons script contains teacher verify support
  const lessonsJs = fs.readFileSync(path.join(rootDir, 'client/52-lessons.js'), 'utf8');
  assert.ok(lessonsJs.includes('data-block-teacher-verified'), 'data-block-teacher-verified must be in client/52-lessons.js');
  assert.ok(lessonsJs.includes('lmSyncTeacherVerifySummary'), 'lmSyncTeacherVerifySummary must be in client/52-lessons.js');
  assert.ok(lessonsJs.includes('lm-verified-badge'), 'lm-verified-badge must be in client/52-lessons.js');
});
