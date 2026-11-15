import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MANIFEST_PATH = path.join(__dirname, '../data/manifest.json');

test('Lesson 1D Data Integrity & Curriculum Specification', async (t) => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  const manifest = JSON.parse(raw);

  await t.test('manifest contains dedicated lesson1d block', () => {
    assert.ok(manifest.lesson1d, 'lesson1d must be defined');
    assert.equal(manifest.lesson1d.lessonId, '1D');
    assert.equal(manifest.lesson1d.lessonTitle, 'BBC Video Lesson: Street Interviews & Vlogs');
    assert.deepEqual(manifest.lesson1d.pages.studentBook, [14, 15]);
    assert.deepEqual(manifest.lesson1d.pages.vocabBank, [127]);
  });

  await t.test('lesson1d contains verbatim videoscripts from Pearson materials', () => {
    const scripts = manifest.lesson1d.videoscripts;
    assert.ok(scripts, 'videoscripts must be present');
    assert.equal(scripts.vlogs.length, 10, 'must have 10 vlog speakers');
    assert.equal(scripts.vlogs[0].speaker, 'Beatriz');
    assert.equal(scripts.vlogs[0].country, 'Portugal');
    assert.equal(scripts.vlogs[1].speaker, 'Mo');
    assert.equal(scripts.vlogs[1].country, 'China');

    // Street Interviews spelling script
    const spelling = scripts.streetInterviews.spelling;
    assert.equal(spelling.length, 8, 'must have 8 speakers spelling names');
    assert.equal(spelling[0].speaker, 'William');
    assert.equal(spelling[0].spelling, 'W-I-L-L-I-A-M');
    assert.equal(spelling[1].speaker, 'Rachael');
    assert.equal(spelling[1].spelling, 'R-A-C-H-A-E-L');

    // Street Interviews bag contents script
    const bags = scripts.streetInterviews.bags;
    assert.equal(bags.length, 9, 'must have 9 speakers describing bag contents');
    assert.equal(bags[0].speaker, 'William');
    assert.match(bags[0].quote, /sandwich/);
  });

  await t.test('lesson1d contains 13 Common Objects with IPA and definitions', () => {
    const vocab = manifest.lesson1d.vocabulary;
    assert.equal(vocab.length, 13, 'must contain exactly 13 common objects');
    
    const requiredWords = [
      'bag', 'banana', 'book', 'bottle of water', 'key', 'laptop',
      'make-up', 'mobile phone', 'notebook', 'purse', 'sandwich', 'umbrella', 'wallet'
    ];
    
    requiredWords.forEach((word) => {
      const entry = vocab.find(v => v.word.toLowerCase() === word);
      assert.ok(entry, `Word ${word} must exist in 1D vocabulary`);
      assert.ok(entry.ipa.length > 0, `Word ${word} must have IPA transcription`);
      assert.ok(entry.definition.length > 0, `Word ${word} must have definition`);
    });
  });

  await t.test('lesson1d defines all core interactive exercises', () => {
    const exs = manifest.lesson1d.exercises;
    assert.equal(exs.length, 3, 'must define 3 interactive exercises');
    assert.equal(exs[0].id, 'ex1d_names');
    assert.equal(exs[1].id, 'ex1d_bags');
    assert.equal(exs[2].id, 'ex1d_grammar');
  });

  await t.test('lesson1d contains complete verified answer keys', () => {
    const keys = manifest.lesson1d.answerKeys;
    assert.ok(keys.preview, 'preview answer keys must be present');
    assert.equal(keys.preview.bagA, 'an umbrella, a mobile phone, a purse');
    assert.equal(keys.preview.bagB, 'a laptop, two books');
    assert.ok(keys.view2A.length >= 9, 'view2A keys must be present');
    assert.equal(keys.view2B['2'], 'Rachael');
    assert.equal(keys.view3A['Bag A'], 'Speaker D (Simnit)');
    assert.equal(keys.view3A['Bag B'], 'Speaker F (Tom)');
    assert.ok(keys.grammar4A.length >= 5, 'grammar4A keys must be present');
    assert.ok(keys.workbook1D.ex1B.length >= 8, 'workbook1D keys must be present');
  });
});
