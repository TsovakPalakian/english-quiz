import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { extractFunction } from './helpers/extract-function.mjs';

const source = readFileSync(new URL('../client/03d-songs.js', import.meta.url), 'utf-8');

const parseLrcTimestampCode = extractFunction(source, 'parseLrcTimestamp');
const formatLrcTimestampCode = extractFunction(source, 'formatLrcTimestamp');
const interpolateWordTimingsCode = extractFunction(source, 'interpolateWordTimings');
const parseLrcCode = extractFunction(source, 'parseLrc');
const formatLrcCode = extractFunction(source, 'formatLrc');
const findActiveTimingCode = extractFunction(source, 'findActiveTiming');

const sandbox = {};
runInNewContext([
  parseLrcTimestampCode,
  formatLrcTimestampCode,
  interpolateWordTimingsCode,
  parseLrcCode,
  formatLrcCode,
  findActiveTimingCode
].join('\n;\n'), sandbox);

const {
  parseLrcTimestamp,
  formatLrcTimestamp,
  interpolateWordTimings,
  parseLrc,
  formatLrc,
  findActiveTiming
} = sandbox;

test('parseLrcTimestamp parses 2-digit and 3-digit fractions accurately', () => {
  assert.equal(parseLrcTimestamp('00:00.00'), 0);
  assert.equal(parseLrcTimestamp('01:15.50'), 75.5);
  assert.equal(parseLrcTimestamp('02:05.125'), 125.125);
  assert.equal(parseLrcTimestamp('invalid'), null);
  assert.equal(parseLrcTimestamp(''), null);
});

test('formatLrcTimestamp formats seconds to standard [mm:ss.xx]', () => {
  assert.equal(formatLrcTimestamp(0), '[00:00.00]');
  assert.equal(formatLrcTimestamp(75.5), '[01:15.50]');
  assert.equal(formatLrcTimestamp(125.125), '[02:05.13]');
  assert.equal(formatLrcTimestamp(-10), '[00:00.00]');
});

test('parseLrc parses metadata tags and standard line timestamps with proportional word interpolation', () => {
  const lrc = [
    '[ti:Yesterday]',
    '[ar:The Beatles]',
    '[al:Help!]',
    '[00:03.50]Yesterday all my troubles seemed so far away',
    '[00:08.20]Now it looks as though they are here to stay'
  ].join('\n');

  const result = parseLrc(lrc);
  assert.equal(result.metadata.ti, 'Yesterday');
  assert.equal(result.metadata.ar, 'The Beatles');
  assert.equal(result.metadata.al, 'Help!');
  assert.equal(result.lines.length, 2);

  const line1 = result.lines[0];
  assert.equal(line1.start, 3.5);
  assert.equal(line1.end, 8.2);
  assert.equal(line1.text, 'Yesterday all my troubles seemed so far away');
  assert.equal(line1.words.length, 8);
  assert.equal(line1.words[0].word, 'Yesterday');
  assert.equal(line1.words[0].start, 3.5);
  assert.equal(line1.words[line1.words.length - 1].end, 8.2);

  const line2 = result.lines[1];
  assert.equal(line2.start, 8.2);
  assert.ok(line2.end > 8.2);
  assert.equal(line2.words[0].word, 'Now');
});

test('parseLrc parses enhanced word-level LRC tags with explicit word timings', () => {
  const lrc = [
    '[00:01.00]<00:01.00>Never <00:01.50>gonna <00:02.10>give <00:02.60>you <00:02.90>up',
    '[00:03.50]<00:03.50>Never <00:04.00>gonna <00:04.50>let <00:05.00>you <00:05.30>down'
  ].join('\n');

  const result = parseLrc(lrc);
  assert.equal(result.lines.length, 2);

  const line1 = result.lines[0];
  assert.equal(line1.text, 'Never gonna give you up');
  assert.equal(line1.words.length, 5);
  assert.equal(line1.words[0].word, 'Never');
  assert.equal(line1.words[0].start, 1.0);
  assert.equal(line1.words[0].end, 1.5);
  assert.equal(line1.words[1].word, 'gonna');
  assert.equal(line1.words[1].start, 1.5);
  assert.equal(line1.words[1].end, 2.1);
});

test('formatLrc serializes parsed object back to standard LRC string format', () => {
  const timings = {
    metadata: { ti: 'Demo', ar: 'Band' },
    lines: [
      {
        start: 5.0,
        end: 8.0,
        text: 'Hello world',
        words: [
          { word: 'Hello', start: 5.0, end: 6.5 },
          { word: 'world', start: 6.5, end: 8.0 }
        ]
      }
    ]
  };

  const output = formatLrc(timings);
  assert.ok(output.includes('[ti:Demo]'));
  assert.ok(output.includes('[ar:Band]'));
  assert.ok(output.includes('[00:05.00]'));
  assert.ok(output.includes('<00:05.00>Hello'));
  assert.ok(output.includes('<00:06.50>world'));
});

test('findActiveTiming locates active line, active word and fractional progress', () => {
  const timings = {
    lines: [
      {
        start: 10.0,
        end: 15.0,
        text: 'First line text',
        words: [
          { word: 'First', start: 10.0, end: 11.0 },
          { word: 'line', start: 11.0, end: 13.0 },
          { word: 'text', start: 13.0, end: 15.0 }
        ]
      },
      {
        start: 15.0,
        end: 20.0,
        text: 'Second line text',
        words: [
          { word: 'Second', start: 15.0, end: 17.0 },
          { word: 'line', start: 17.0, end: 18.5 },
          { word: 'text', start: 18.5, end: 20.0 }
        ]
      }
    ]
  };

  // Exact midpoint of word "line" (from 11.0 to 13.0 at t=12.0 -> 50% progress)
  const activeMid = findActiveTiming(timings, 12.0);
  assert.equal(activeMid.lineIndex, 0);
  assert.equal(activeMid.wordIndex, 1);
  assert.equal(activeMid.word.word, 'line');
  assert.equal(activeMid.wordProgress, 0.5);

  // Transition to second line
  const activeSecond = findActiveTiming(timings, 16.0);
  assert.equal(activeSecond.lineIndex, 1);
  assert.equal(activeSecond.wordIndex, 0);
  assert.equal(activeSecond.word.word, 'Second');
  assert.equal(activeSecond.wordProgress, 0.5);

  // Before first line clamps to start
  const activeBefore = findActiveTiming(timings, 2.0);
  assert.equal(activeBefore.lineIndex, 0);

  // Null input handles gracefully
  assert.equal(findActiveTiming(null, 5.0), null);
  assert.equal(findActiveTiming({ lines: [] }, 5.0), null);
});
