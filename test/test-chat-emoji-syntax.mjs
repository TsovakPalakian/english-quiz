import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('chat emoji regex syntax and matching validation', async (t) => {
  const coreSource = readFileSync(resolve('production/chat/00-core.js'), 'utf8');
  const bundleSource = readFileSync(resolve('production/chat.js'), 'utf8');

  // Verify that redundant square brackets around \p{Emoji_Modifier} are removed
  assert.equal(
    coreSource.includes('[\\p{Emoji_Modifier}]'),
    false,
    '00-core.js must not contain redundant square brackets around \\p{Emoji_Modifier}'
  );
  assert.equal(
    bundleSource.includes('[\\p{Emoji_Modifier}]'),
    false,
    'production/chat.js must not contain redundant square brackets around \\p{Emoji_Modifier}'
  );

  // Extract the emoji regex from production/chat/00-core.js
  const match = coreSource.match(/const emoji =\s*(\/[^\n]+\/u);/);
  assert.ok(match, 'Must find emoji regex declaration in 00-core.js');

  const emojiRegex = new Function(`return ${match[1]};`)();
  assert.ok(emojiRegex instanceof RegExp, 'Extracted regex must be a valid RegExp object');
  assert.equal(emojiRegex.unicode, true, 'Regex must have the unicode (u) flag enabled');

  await t.test('standard pictographic emojis match', () => {
    const list = ['😀', '🎉', '🔥', '❤️', '🌟', '🚀', '🐱', '🍕'];
    for (const item of list) {
      assert.equal(emojiRegex.test(item), true, `Standard emoji ${item} must match`);
    }
  });

  await t.test('skin tone modified emojis match', () => {
    const list = ['👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿', '👋🏽', '🧘🏿'];
    for (const item of list) {
      assert.equal(emojiRegex.test(item), true, `Skin tone modified emoji ${item} must match`);
    }
  });

  await t.test('regional indicator flag emojis match', () => {
    const list = ['🇺🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇯🇵', '🇦🇲'];
    for (const item of list) {
      assert.equal(emojiRegex.test(item), true, `Flag emoji ${item} must match`);
    }
  });

  await t.test('zero-width joiner (ZWJ) composite emojis match', () => {
    const list = ['👨‍👩‍👧‍👦', '👩‍💻', '🧑‍🔬', '🏳️‍🌈', '👁️‍🗨️'];
    for (const item of list) {
      assert.equal(emojiRegex.test(item), true, `ZWJ composite emoji ${item} must match`);
    }
  });

  await t.test('emoji tag sequences match', () => {
    const list = ['🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🏴󠁧󠁢󠁷󠁬󠁳󠁿'];
    for (const item of list) {
      assert.equal(emojiRegex.test(item), true, `Tag sequence emoji ${item} must match`);
    }
  });

  await t.test('keycap sequences match', () => {
    const list = ['0️⃣', '1️⃣', '2️⃣', '9️⃣', '#️⃣', '*️⃣'];
    for (const item of list) {
      assert.equal(emojiRegex.test(item), true, `Keycap sequence ${item} must match`);
    }
  });

  await t.test('plain text and non-emojis are rejected', () => {
    const list = ['abc', '123', 'hello', '!', '@', 'test 😀', '😀 test'];
    for (const item of list) {
      assert.equal(emojiRegex.test(item), false, `Non-emoji string "${item}" must not match`);
    }
  });
});
