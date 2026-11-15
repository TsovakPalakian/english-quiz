import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MANIFEST_PATH = path.join(__dirname, '../data/manifest.json');

test('Lesson 1A Manifest Data Integrity', async (t) => {
  await t.test('manifest file exists and is valid JSON', () => {
    assert.equal(fs.existsSync(MANIFEST_PATH), true, 'manifest.json must exist');
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    const manifest = JSON.parse(raw);
    assert.ok(manifest, 'manifest must be an object');
  });

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

  await t.test('metadata fields match Speakout A1 Unit 1 Lesson 1A', () => {
    assert.equal(manifest.course, 'Speakout 3rd Edition');
    assert.equal(manifest.level, 'A1');
    assert.equal(manifest.unit, 1);
    assert.equal(manifest.lessonId, '1A');
    assert.equal(manifest.lessonTitle, 'Hello');
    assert.deepEqual(manifest.pages.studentBook, [8, 9]);
    assert.deepEqual(manifest.pages.vocabBank, [125]);
  });

  await t.test('all referenced class audio files physically exist on disk', () => {
    assert.ok(manifest.audio.classAudio.length >= 4, 'must have at least 4 class audio tracks');
    manifest.audio.classAudio.forEach((track) => {
      assert.ok(track.id, 'track must have an id');
      assert.ok(fs.existsSync(track.path), `audio file must exist on disk: ${track.path}`);
      const stat = fs.statSync(track.path);
      assert.ok(stat.size > 10000, `audio file must not be empty: ${track.path}`);
    });
  });

  await t.test('vocabulary bank contains parsed Pearson words with IPA', () => {
    assert.ok(manifest.vocabulary.length >= 10, 'must have at least 10 vocabulary words');
    const greetings = manifest.vocabulary.filter(w => w.topic === 'Greetings & Goodbyes');
    assert.ok(greetings.length >= 5, 'must have greetings words');
    const countries = manifest.vocabulary.filter(w => w.topic === 'Countries & Nationalities');
    assert.ok(countries.length >= 5, 'must have countries words');

    // Verify presence of IPA pronunciation
    const sample = manifest.vocabulary.find(w => w.word.toLowerCase() === 'good morning');
    assert.ok(sample, 'Good morning must be present');
    assert.ok(sample.ipa.length > 0, 'Good morning must have IPA transcription');
  });

  await t.test('exercises and answer keys are fully defined', () => {
    assert.equal(manifest.exercises.length, 3, 'must define 3 core interactive exercises');
    assert.ok(manifest.answerKeys.studentBook.ex1, 'ex1 answer key must be present');
    assert.ok(manifest.answerKeys.studentBook.ex2, 'ex2 answer key must be present');
    assert.ok(manifest.answerKeys.studentBook.ex3, 'ex3 answer key must be present');
    assert.ok(manifest.answerKeys.workbook.ex1, 'workbook answer key must be present');
  });
});
