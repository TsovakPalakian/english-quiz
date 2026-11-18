import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const notes = fs.readFileSync(path.join(root, 'client/20b-lesson-notifications.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'site/preview.css'), 'utf8');
const block = css.slice(css.indexOf('/* Lesson Notifications Modal */'), css.indexOf('#messages .chat-action-btn'));

test('lesson notifications use stage words and a compact preference bar', () => {
  assert.match(notes, /Class today/);
  assert.match(notes, /Material today/);
  assert.match(notes, /Waiting for review/);
  assert.match(notes, /Review published/);
  assert.match(notes, /No active reminders\./);
  assert.match(notes, /Sound stays on this device\./);
  assert.match(notes, />Today</);
  assert.match(notes, />Reviews</);
  assert.match(notes, />Sound</);
  assert.doesNotMatch(notes, /Vocabulary Review Ready/);
  assert.doesNotMatch(notes, /v2\.4\.0/);
  assert.doesNotMatch(notes, /lesson-notify-card-icon/);
  assert.doesNotMatch(notes, /24 \* 60 \* 60 \* 1000/);
  assert.match(notes, /viewAccount/);
  assert.match(notes, /touchDot: false/);
  assert.match(block, /\.lesson-notify-settings \{[^}]*grid-template-columns: repeat\(3/);
  assert.match(block, /\.lesson-notify-card-stage \{[^}]*color: var\(--acc\)/);
  assert.doesNotMatch(block, /#dbeafe|#1d4ed8|#fef3c7/);
});
