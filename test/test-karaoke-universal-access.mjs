import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { extractFunction } from './helpers/extract-function.mjs';

const source03d = readFileSync(new URL('../client/03d-songs.js', import.meta.url), 'utf-8');
const source03f = readFileSync(new URL('../client/03f-songs.js', import.meta.url), 'utf-8');
const previewCss = readFileSync(new URL('../site/preview.css', import.meta.url), 'utf-8');

const parseLrcTimestampCode = extractFunction(source03d, 'parseLrcTimestamp');
const formatLrcTimestampCode = extractFunction(source03d, 'formatLrcTimestamp');
const interpolateWordTimingsCode = extractFunction(source03d, 'interpolateWordTimings');
const parseLrcCode = extractFunction(source03d, 'parseLrc');
const formatLrcCode = extractFunction(source03d, 'formatLrc');
const findActiveTimingCode = extractFunction(source03d, 'findActiveTiming');
const stripTimestampsCode = extractFunction(source03d, 'stripTimestamps');
const generateAutoTimingsCode = extractFunction(source03d, 'generateAutoTimings');
const getSongTimingsForSourceCode = extractFunction(source03d, 'getSongTimingsForSource');

const sandbox = {};
runInNewContext([
  parseLrcTimestampCode,
  formatLrcTimestampCode,
  interpolateWordTimingsCode,
  parseLrcCode,
  formatLrcCode,
  findActiveTimingCode,
  stripTimestampsCode,
  generateAutoTimingsCode,
  getSongTimingsForSourceCode
].join('\n;\n'), sandbox);

const {
  stripTimestamps,
  generateAutoTimings,
  getSongTimingsForSource,
  parseLrc,
  formatLrc
} = sandbox;

test('stripTimestamps removes all standard LRC and word-level tags', () => {
  const input = '[ti:Stole the Show]\n[ar:Kygo]\n[00:15.50]Curtain call\n[00:18.20]<00:18.20>So <00:18.60>hold <00:19.00>for <00:19.30>the applause\n[00:22.00]And wave out to the crowd';
  const clean = stripTimestamps(input);
  assert.equal(clean.includes('[00:15.50]'), false);
  assert.equal(clean.includes('<00:18.20>'), false);
  assert.equal(clean.includes('[ti:Stole the Show]'), false);
  assert.equal(clean.includes('Curtain call'), true);
  assert.equal(clean.includes('So hold for the applause'), true);
  assert.equal(clean.includes('And wave out to the crowd'), true);
});

test('generateAutoTimings creates valid sequential timings for untimed lyrics', () => {
  const rawLyrics = 'Curtain call\nSo hold for the applause, oh\nAnd wave out to the crowd, and take our final bow\nOh, its our time to go, but at least we stole the show';
  const timings = generateAutoTimings(rawLyrics, 120);

  assert.ok(timings && Array.isArray(timings.lines));
  assert.equal(timings.lines.length, 4);

  timings.lines.forEach((line, idx) => {
    assert.ok(line.start >= 0);
    assert.ok(line.end > line.start);
    assert.ok(line.text.length > 0);
    assert.ok(Array.isArray(line.words) && line.words.length > 0);
    if (idx > 0) {
      assert.ok(line.start >= timings.lines[idx - 1].end - 0.5);
    }
  });
});

test('getSongTimingsForSource applies per-source offsets accurately', () => {
  const song = {
    title: 'Stole the Show',
    lyrics: '[00:10.00]First line\n[00:20.00]Second line',
    timingOffsets: {
      audio: 0.0,
      video: -0.5,
      spotify: 0.25
    }
  };

  const audioTimings = getSongTimingsForSource(song, 'audio');
  assert.equal(audioTimings.lines[0].start, 10.0);

  const videoTimings = getSongTimingsForSource(song, 'video');
  assert.equal(videoTimings.lines[0].start, 9.5);

  const spotifyTimings = getSongTimingsForSource(song, 'spotify');
  assert.equal(spotifyTimings.lines[0].start, 10.25);
});

test('CSS verification: data-lyric-editor spans full width and textarea fills container', () => {
  assert.match(previewCss, /\[data-lyric-editor\]\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(previewCss, /\[data-lyric-editor\]\s+textarea\[data-lyric-draft\]\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(previewCss, /\[data-lyric-editor\]\s+\.row\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
});

test('CSS verification: Karaoke lines and words are centered', () => {
  assert.match(previewCss, /\.karaoke-lines\s*\{[^}]*text-align:\s*center/);
  assert.match(previewCss, /\.karaoke-line\s*\{[^}]*text-align:\s*center/);
  assert.match(previewCss, /\.karaoke-words\s*\{[^}]*justify-content:\s*center/);
  assert.match(previewCss, /\.karaoke-translation\s*\{[^}]*text-align:\s*center/);
});

test('CSS verification: Clean lyric-text is single column', () => {
  assert.doesNotMatch(previewCss, /\.lyric-text\s*\{[^}]*columns:\s*2/);
  assert.match(previewCss, /\.lyric-text\s*\{[^}]*font-size:\s*20px/);
});
