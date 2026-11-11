import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { extractFunction } from './helpers/extract-function.mjs';

const playerSource = readFileSync(new URL('../client/03f-songs.js', import.meta.url), 'utf-8');

const assessSingingPerformanceCode = extractFunction(playerSource, 'assessSingingPerformance');
const buildCoachPanelHtmlCode = extractFunction(playerSource, 'buildCoachPanelHtml');
const karaokeCoachRecorderCode = extractFunction(playerSource, 'KaraokeCoachRecorder');

const sandbox = {
  esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  navigator: {},
  MediaRecorder: class {},
  Blob: class { constructor(chunks, opts) { this.chunks = chunks; this.type = opts?.type; } }
};

runInNewContext([
  assessSingingPerformanceCode,
  buildCoachPanelHtmlCode,
  karaokeCoachRecorderCode
].join('\n;\n'), sandbox);

const { assessSingingPerformance, buildCoachPanelHtml, KaraokeCoachRecorder } = sandbox;

test('assessSingingPerformance computes pronunciation, fluency, prosody metrics and phoneme findings', () => {
  const lyrics = 'Think through the things that matter';
  const result = assessSingingPerformance({}, lyrics);

  assert.ok(typeof result.overall === 'number');
  assert.ok(result.overall >= 50 && result.overall <= 100);

  assert.ok(typeof result.scores.accuracy === 'number');
  assert.ok(typeof result.scores.fluency === 'number');
  assert.ok(typeof result.scores.prosody === 'number');

  assert.ok(Array.isArray(result.findings));
  assert.ok(result.findings.length > 0);

  // Check phoneme finding structure
  const firstFinding = result.findings[0];
  assert.ok(firstFinding.phoneme);
  assert.ok(firstFinding.word);
  assert.ok(firstFinding.message.includes(firstFinding.phoneme));
});

test('buildCoachPanelHtml renders idle, recording, and assessment result scorecards', () => {
  // Idle state
  const idleHtml = buildCoachPanelHtml(null, false);
  assert.ok(idleHtml.includes('data-karaoke-coach-panel'));
  assert.ok(idleHtml.includes('Record &amp; Assess Voice'));
  assert.ok(!idleHtml.includes('recording'));

  // Recording state
  const recHtml = buildCoachPanelHtml(null, true);
  assert.ok(recHtml.includes('Stop &amp; Assess'));
  assert.ok(recHtml.includes('recording'));

  // Result state
  const mockResult = {
    overall: 88.5,
    scores: {
      accuracy: 92,
      fluency: 84,
      prosody: 89
    },
    findings: [
      { wordIndex: 0, word: 'Think', phoneme: 'θ', message: 'Voiceless dental fricative' }
    ]
  };

  const scoredHtml = buildCoachPanelHtml(mockResult, false);
  assert.ok(scoredHtml.includes('coach-score-card'));
  assert.ok(scoredHtml.includes('88.5'));
  assert.ok(scoredHtml.includes('Accuracy: 92%'));
  assert.ok(scoredHtml.includes('Fluency: 84%'));
  assert.ok(scoredHtml.includes('Prosody: 89%'));
  assert.ok(scoredHtml.includes('coach-phoneme-badge'));
  assert.ok(scoredHtml.includes('/θ/ in Think'));
});

test('KaraokeCoachRecorder handles start/stop lifecycle and microphone states', async () => {
  const recorder = new KaraokeCoachRecorder();
  assert.equal(recorder.isRecording, false);

  // Stopping when not recording resolves to null
  const res = await recorder.stop();
  assert.equal(res, null);

  // Mock navigator.mediaDevices.getUserMedia
  let trackStopped = false;
  sandbox.navigator.mediaDevices = {
    getUserMedia: async () => ({
      getTracks: () => [{ stop: () => { trackStopped = true; } }]
    })
  };

  class MockMediaRecorder {
    constructor(stream, opts) {
      this.stream = stream;
      this.mimeType = opts.mimeType || 'audio/webm';
      this.ondataavailable = null;
      this.onstop = null;
    }
    start(interval) {
      setTimeout(() => {
        if (this.ondataavailable) {
          this.ondataavailable({ data: { size: 100 } });
        }
      }, 5);
    }
    stop() {
      setTimeout(() => {
        if (this.onstop) this.onstop();
      }, 5);
    }
  }
  MockMediaRecorder.isTypeSupported = () => true;
  sandbox.MediaRecorder = MockMediaRecorder;

  await recorder.start();
  assert.equal(recorder.isRecording, true);

  const recordedBlob = await recorder.stop();
  assert.equal(recorder.isRecording, false);
  assert.ok(recordedBlob);
  assert.equal(trackStopped, true);
});
