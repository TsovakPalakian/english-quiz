import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessPronunciation, extractPronunciationFeatures, featuresFromWav } from '../src/pronunciation-match.mjs';
import { createAzureTTSAdapter, AZURE_REFERENCE_VOICES } from '../src/azure-speech-provider.mjs';

const same = {
  energy: [1, 0.8, 0.6, 0.4, 0.3, 0.2, 0.2, 0.1],
  zcr: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  pitch: [0.4, 0.45, 0.5, 0.55],
  breath: 0.2
};

function pcmWav(samples) {
  const data = samples.length * 2;
  const bytes = new Uint8Array(44 + data);
  const view = new DataView(bytes.buffer);
  bytes.set([82, 73, 70, 70], 0);
  view.setUint32(4, 36 + data, true);
  bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set([100, 97, 116, 97], 36);
  view.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
  return bytes;
}

test('empty speech, another language, and a different word do not pass', () => {
  const empty = assessPronunciation({ target: 'sprinter', spoken: '' });
  assert.equal(empty.score, 0);
  assert.equal(empty.passed, false);
  const russian = assessPronunciation({ target: 'sprinter', spoken: 'привет' });
  assert.equal(russian.score, 0);
  assert.equal(russian.passed, false);
  assert.match(russian.feedback, /Heard: "привет"/);
  const other = assessPronunciation({ target: 'home', spoken: 'come' });
  assert.equal(other.passed, false);
  assert.ok(other.score < 75);
  const letters = assessPronunciation({ target: 'sprinter', spoken: 'sprinter' });
  assert.equal(letters.passed, false);
  assert.equal(letters.score, 0);
  assert.match(letters.feedback, /Reference pronunciation is not ready/);
});

test('only a matching reference scores 100 and any drift lowers it', () => {
  const exact = assessPronunciation({ target: 'sprinter', spoken: 'sprinter', student: same, etalon: same });
  assert.equal(exact.score, 100);
  assert.equal(exact.passed, true);
  assert.equal(exact.stress, 'Accurate');
  const stress = assessPronunciation({
    target: 'sprinter',
    spoken: 'sprinter',
    student: { ...same, energy: [0.7, 0.8, 0.6, 0.4, 0.3, 0.2, 0.2, 0.1] },
    etalon: same
  });
  assert.ok(stress.score < 100);
  assert.equal(stress.stress, 'Needs work');
  const rising = assessPronunciation({
    target: 'sprinter',
    spoken: 'sprinter',
    student: { ...same, pitch: [0.8, 0.6, 0.4, 0.2] },
    etalon: same
  });
  assert.ok(rising.score <= 40);
  assert.equal(rising.passed, false);
  const breath = assessPronunciation({
    target: 'sprinter',
    spoken: 'sprinter',
    student: { ...same, breath: 0.8 },
    etalon: same
  });
  assert.ok(breath.score < 100);
  assert.equal(breath.passed, false);
});

test('wav features are taken from the PCM samples', () => {
  const samples = new Float32Array(16000);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 180 * i) / 16000) * (i < 8000 ? 0.8 : 0.2);
  const features = featuresFromWav(pcmWav(samples));
  assert.equal(features.energy.length, 8);
  assert.ok(features.energy[0] > features.energy[7]);
  assert.equal(extractPronunciationFeatures(samples, 7999), null);
});

test('dictionary IPA is spoken as a phoneme and the lesson route no longer awards a fixed pass', async () => {
  let body = '';
  const adapter = createAzureTTSAdapter({
    enabled: true,
    freeTierVerified: true,
    resourceName: 'lumiscia-test',
    apiKey: 'SYNTHETIC-KEY',
    termsRevision: 'lesson-pronounce-v1',
    reuseConditions: 'Lesson pronunciation reference.',
    fetchImpl: async (_url, options) => {
      body = options.body;
      return new Response(pcmWav(new Float32Array(320)), { headers: { 'content-type': 'audio/wav' } });
    }
  });
  await adapter.invoke({ word: 'sprinter', voice: AZURE_REFERENCE_VOICES[0].id, ipa: 'ˈsprɪntər' }, { source: { locale: 'en-US' } });
  assert.match(body, /<phoneme alphabet="ipa" ph="ˈsprɪntər">sprinter<\/phoneme>/);
  const worker = readFileSync(new URL('../src/learning-stage-worker.mjs', import.meta.url), 'utf8');
  assert.equal(worker.includes('score=92'), false);
  assert.match(worker, /featuresFromWav/);
});
