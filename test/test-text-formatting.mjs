import test from 'node:test';
import assert from 'node:assert/strict';
import {validateColorDocument} from '../src/text-formatting.mjs';
import {StudyError} from '../src/learning-study.mjs';

test('validateColorDocument rejects non-object or null root values', () => {
  for (const invalid of [null, undefined, '', 'string', 123, false, true]) {
    assert.throws(
      () => validateColorDocument(invalid, 'sample'),
      (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text formatting.'
    );
  }
});

test('validateColorDocument rejects missing or non-array runs property', () => {
  for (const invalid of [{}, {runs: null}, {runs: 'runs'}, {runs: 42}, {runs: {}}]) {
    assert.throws(
      () => validateColorDocument(invalid, 'sample'),
      (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text formatting.'
    );
  }
});

test('validateColorDocument rejects runs array exceeding 2000 elements', () => {
  const runs = Array.from({length: 2001}, () => ({text: ''}));
  assert.throws(
    () => validateColorDocument({runs}, ''),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text formatting.'
  );
});

test('validateColorDocument rejects unexpected extra properties on root object', () => {
  const doc = {runs: [{text: 'sample'}], extraProp: 'malicious'};
  assert.throws(
    () => validateColorDocument(doc, 'sample'),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text formatting.'
  );
});

test('validateColorDocument rejects invalid run items or non-string text', () => {
  for (const badRun of [null, undefined, 42, {text: 123}, {text: null}, {text: undefined}, {text: 'hi', extraKey: 1}]) {
    assert.throws(
      () => validateColorDocument({runs: [badRun]}, 'hi'),
      (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text color.'
    );
  }
});

test('validateColorDocument rejects non-object or array marks', () => {
  for (const badMarks of ['invalid', 123, [], null]) {
    // null is typeof object, but run?.marks || {} converts null to {}
    if (badMarks !== null) {
      assert.throws(
        () => validateColorDocument({runs: [{text: 'a', marks: badMarks}]}, 'a'),
        (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text color.'
      );
    }
  }
});

test('validateColorDocument in basic mode permits only color mark', () => {
  const withColor = {runs: [{text: 'colored', marks: {color: '#123456'}}]};
  const result = validateColorDocument(withColor, 'colored', false);
  assert.equal(result, withColor);

  for (const disallowed of ['bold', 'italic', 'underline', 'strike', 'size', 'family', 'font']) {
    assert.throws(
      () => validateColorDocument({runs: [{text: 'sample', marks: {[disallowed]: true}}]}, 'sample', false),
      (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text color.'
    );
  }
});

test('validateColorDocument validates hex color format #RRGGBB case-insensitively', () => {
  const validColors = ['#000000', '#ffffff', '#FFFFFF', '#1a2b3c', '#4D5E6F'];
  for (const color of validColors) {
    const doc = {runs: [{text: 'word', marks: {color}}]};
    assert.equal(validateColorDocument(doc, 'word'), doc);
  }

  const invalidColors = ['red', '#fff', '#1234567', '#gggggg', '123456', '#12 456'];
  for (const color of invalidColors) {
    assert.throws(
      () => validateColorDocument({runs: [{text: 'word', marks: {color}}]}, 'word'),
      (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text color.'
    );
  }
});

test('validateColorDocument in full mode accepts all allowed formatting marks', () => {
  const fullDoc = {
    runs: [
      {text: 'Hello ', marks: {bold: true, italic: false}},
      {text: 'World', marks: {color: '#336699', underline: true, strike: false, size: 18, family: 'georgia'}}
    ]
  };
  const result = validateColorDocument(fullDoc, 'Hello World', true);
  assert.equal(result, fullDoc);
});

test('validateColorDocument in full mode enforces boolean type for styling flags', () => {
  for (const flag of ['bold', 'italic', 'underline', 'strike']) {
    for (const badValue of ['true', 1, 0, {}, []]) {
      assert.throws(
        () => validateColorDocument({runs: [{text: 'test', marks: {[flag]: badValue}}]}, 'test', true),
        (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text formatting.'
      );
    }
  }
});

test('validateColorDocument in full mode enforces font size bounds between 10 and 96', () => {
  // Boundary tests
  assert.equal(validateColorDocument({runs: [{text: 't', marks: {size: 10}}]}, 't', true).runs[0].marks.size, 10);
  assert.equal(validateColorDocument({runs: [{text: 't', marks: {size: 96}}]}, 't', true).runs[0].marks.size, 96);
  assert.equal(validateColorDocument({runs: [{text: 't', marks: {size: 48}}]}, 't', true).runs[0].marks.size, 48);

  // Out-of-bounds or non-finite values
  for (const badSize of [9, 9.99, 96.01, 97, -10, NaN, Infinity, -Infinity, '20']) {
    assert.throws(
      () => validateColorDocument({runs: [{text: 't', marks: {size: badSize}}]}, 't', true),
      (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text formatting.'
    );
  }
});

test('validateColorDocument in full mode allows only predefined font families', () => {
  const allowedFamilies = ['serif', 'sans', 'mono', 'georgia', 'verdana', 'palatino', 'trebuchet', 'courier'];
  for (const family of allowedFamilies) {
    const doc = {runs: [{text: 'f', marks: {family}}]};
    assert.equal(validateColorDocument(doc, 'f', true), doc);
  }

  for (const forbidden of ['arial', 'helvetica', 'times', 'comic sans', '', 'custom']) {
    assert.throws(
      () => validateColorDocument({runs: [{text: 'f', marks: {family: forbidden}}]}, 'f', true),
      (err) => err instanceof StudyError && err.status === 400 && err.message === 'Invalid text formatting.'
    );
  }
});

test('validateColorDocument throws StudyError when reconstructed text does not match expected text', () => {
  const doc = {
    runs: [
      {text: 'The quick '},
      {text: 'brown fox'}
    ]
  };

  // Missing space or altered character
  assert.throws(
    () => validateColorDocument(doc, 'The quick brown fox!'),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Text formatting does not match its content.'
  );
  assert.throws(
    () => validateColorDocument(doc, 'The quick brown'),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Text formatting does not match its content.'
  );
  assert.throws(
    () => validateColorDocument(doc, ''),
    (err) => err instanceof StudyError && err.status === 400 && err.message === 'Text formatting does not match its content.'
  );

  // Exact match succeeds
  assert.equal(validateColorDocument(doc, 'The quick brown fox'), doc);
});

test('validateColorDocument handles empty document matching empty string', () => {
  const emptyDoc = {runs: []};
  assert.equal(validateColorDocument(emptyDoc, ''), emptyDoc);
});
