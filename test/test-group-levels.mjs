import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_LEVELS,
  groupLevel,
  normalizedGroupTitle,
  prefixedExamTitle
} from '../src/group-levels.mjs';

test('GROUP_LEVELS contains standard CEFR progression of nine levels', () => {
  assert.equal(Array.isArray(GROUP_LEVELS), true);
  assert.equal(GROUP_LEVELS.length, 9);
  assert.deepEqual(GROUP_LEVELS, ['A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2']);
});

test('groupLevel identifies exact matches for all nine CEFR levels', () => {
  for (const level of GROUP_LEVELS) {
    assert.equal(groupLevel(level), level);
    assert.equal(groupLevel(`  ${level}  `), level);
  }
});

test('groupLevel detects prefix levels with trailing space', () => {
  assert.equal(groupLevel('A1 Beginners'), 'A1');
  assert.equal(groupLevel('A2 Elementary'), 'A2');
  assert.equal(groupLevel('A2+ Pre-Intermediate'), 'A2+');
  assert.equal(groupLevel('B1 Intermediate'), 'B1');
  assert.equal(groupLevel('B1+ Intermediate Plus'), 'B1+');
  assert.equal(groupLevel('B2 Upper-Intermediate'), 'B2');
  assert.equal(groupLevel('B2+ Kate Group'), 'B2+');
  assert.equal(groupLevel('C1 Advanced'), 'C1');
  assert.equal(groupLevel('C2 Proficiency'), 'C2');
});

test('groupLevel detects suffix levels with leading space', () => {
  assert.equal(groupLevel('Beginners A1'), 'A1');
  assert.equal(groupLevel('Elementary A2'), 'A2');
  assert.equal(groupLevel('Pre-Intermediate A2+'), 'A2+');
  assert.equal(groupLevel('Intermediate B1'), 'B1');
  assert.equal(groupLevel('Intermediate Plus B1+'), 'B1+');
  assert.equal(groupLevel('Upper-Intermediate B2'), 'B2');
  assert.equal(groupLevel('Kate Group B2+'), 'B2+');
  assert.equal(groupLevel('Advanced C1'), 'C1');
  assert.equal(groupLevel('Proficiency C2'), 'C2');
});

test('groupLevel resolves overlapping levels without false positives', () => {
  // Plus variants must not collide with base variants
  assert.equal(groupLevel('A2+ Intensive'), 'A2+');
  assert.equal(groupLevel('Intensive A2+'), 'A2+');
  assert.equal(groupLevel('A2 Intensive'), 'A2');
  assert.equal(groupLevel('Intensive A2'), 'A2');

  assert.equal(groupLevel('B1+ Intensive'), 'B1+');
  assert.equal(groupLevel('Intensive B1+'), 'B1+');
  assert.equal(groupLevel('B1 Intensive'), 'B1');
  assert.equal(groupLevel('Intensive B1'), 'B1');

  assert.equal(groupLevel('B2+ Intensive'), 'B2+');
  assert.equal(groupLevel('Intensive B2+'), 'B2+');
  assert.equal(groupLevel('B2 Intensive'), 'B2');
  assert.equal(groupLevel('Intensive B2'), 'B2');
});

test('groupLevel returns null for non-boundary, non-matching or falsy inputs', () => {
  assert.equal(groupLevel('A10 Group'), null);
  assert.equal(groupLevel('SuperB2Group'), null);
  assert.equal(groupLevel('Middle B2 Group'), null);
  assert.equal(groupLevel('General English'), null);
  assert.equal(groupLevel(''), null);
  assert.equal(groupLevel('   '), null);
  assert.equal(groupLevel(null), null);
  assert.equal(groupLevel(undefined), null);
  assert.equal(groupLevel(123), null);
});

test('normalizedGroupTitle appends Group when name matches bare level exactly', () => {
  assert.equal(normalizedGroupTitle('A1'), 'A1 Group');
  assert.equal(normalizedGroupTitle('B2+'), 'B2+ Group');
  assert.equal(normalizedGroupTitle('  C1  '), 'C1 Group');
});

test('normalizedGroupTitle preserves existing prefix levels', () => {
  assert.equal(normalizedGroupTitle('B2+ Kate Group'), 'B2+ Kate Group');
  assert.equal(normalizedGroupTitle('A1 Morning'), 'A1 Morning');
});

test('normalizedGroupTitle moves suffix levels to prefix position', () => {
  assert.equal(normalizedGroupTitle('Kate Group B2+'), 'B2+ Kate Group');
  assert.equal(normalizedGroupTitle('Evening Class A2'), 'A2 Evening Class');
  assert.equal(normalizedGroupTitle('Weekend Club C2'), 'C2 Weekend Club');
});

test('normalizedGroupTitle returns unlevelled and falsy titles unchanged', () => {
  assert.equal(normalizedGroupTitle('General Conversation'), 'General Conversation');
  assert.equal(normalizedGroupTitle(''), '');
  assert.equal(normalizedGroupTitle(null), '');
  assert.equal(normalizedGroupTitle(undefined), '');
});

test('prefixedExamTitle returns original name when group has no level', () => {
  assert.equal(prefixedExamTitle('Midterm Exam', 'General Conversation'), 'Midterm Exam');
  assert.equal(prefixedExamTitle('  Final Test  ', 'No Level Group'), 'Final Test');
  assert.equal(prefixedExamTitle('Grammar Quiz', null), 'Grammar Quiz');
  assert.equal(prefixedExamTitle('Grammar Quiz', undefined), 'Grammar Quiz');
});

test('prefixedExamTitle prefixes level to title when title has no prior level', () => {
  assert.equal(prefixedExamTitle('Midterm Exam', 'B2+ Kate Group'), 'B2+ Midterm Exam');
  assert.equal(prefixedExamTitle('Vocabulary Review', 'A1 Beginners'), 'A1 Vocabulary Review');
});

test('prefixedExamTitle replaces previous prefix or suffix level with target group level', () => {
  // Exam with previous prefix level
  assert.equal(prefixedExamTitle('A1 Midterm Exam', 'B2+ Kate Group'), 'B2+ Midterm Exam');
  assert.equal(prefixedExamTitle('B1 Progress Test', 'C1 Advanced'), 'C1 Progress Test');

  // Exam with previous suffix level
  assert.equal(prefixedExamTitle('Midterm Exam A1', 'B2+ Kate Group'), 'B2+ Midterm Exam');
  assert.equal(prefixedExamTitle('Progress Test B1', 'C1 Advanced'), 'C1 Progress Test');
});

test('prefixedExamTitle defaults suffix to Exam when name equals previous level or is empty', () => {
  assert.equal(prefixedExamTitle('A1', 'B2+ Kate Group'), 'B2+ Exam');
  assert.equal(prefixedExamTitle('', 'B2+ Kate Group'), 'B2+ Exam');
  assert.equal(prefixedExamTitle(null, 'B2+ Kate Group'), 'B2+ Exam');
  assert.equal(prefixedExamTitle(undefined, 'B2+ Kate Group'), 'B2+ Exam');
});

test('prefixedExamTitle truncates result to 120 characters maximum', () => {
  const longExamTitle = 'Very Long Examination Title '.repeat(10);
  const result = prefixedExamTitle(longExamTitle, 'B2+ Group');
  assert.equal(result.length, 120);
  assert.equal(result.startsWith('B2+ Very Long Examination Title'), true);
});
