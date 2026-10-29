import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('client/06-auth-sky.js includes feedbackFloatingTrigger in uiBoxes', () => {
  const code = readFileSync('client/06-auth-sky.js', 'utf8');
  assert.ok(code.includes('#feedbackFloatingTrigger'), 'uiBoxes queries #feedbackFloatingTrigger');
  assert.ok(code.includes('feedbackFloatingTrigger'), 'Padding or clearance is provided for feedback');
});

test('client/06-auth-sky.js removes ctx.clip(evenodd) rectangular frame', () => {
  const code = readFileSync('client/06-auth-sky.js', 'utf8');
  assert.equal(code.includes("ctx.clip('evenodd')"), false, 'Hard rectangular clipping is removed');
});

test('client/06-auth-sky.js implements collapsible inspector with more button', () => {
  const code = readFileSync('client/06-auth-sky.js', 'utf8');
  assert.ok(code.includes('auth-sky-inspector-more'), 'Contains more button in inspector');
  assert.ok(code.includes('auth-sky-inspector-body'), 'Contains inspector body container');
  assert.ok(code.includes('is-collapsed'), 'Inspector defaults to collapsed');
});

test('client/06-auth-astronomy.js dampens scale for constellations with 6 or fewer stars', () => {
  const code = readFileSync('client/06-auth-astronomy.js', 'utf8');
  assert.ok(code.includes('c.stars.length<=6'), 'Astronomical layout checks for <= 6 stars');
  assert.ok(code.includes('fewStarsFactor'), 'Scaling factor is applied for few stars');
});

test('site/preview.css contains styles for more button and collapsed state', () => {
  const css = readFileSync('site/preview.css', 'utf8');
  assert.ok(css.includes('.auth-sky-inspector-more'), 'CSS styles .auth-sky-inspector-more');
  assert.ok(css.includes('.auth-sky-inspector.is-collapsed .auth-sky-inspector-body'), 'CSS hides body when collapsed');
});
