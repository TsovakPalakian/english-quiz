import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('client bridge retry and error handling for GET vs mutation', async () => {
  const bridgeCode = readFileSync('client/main/main-bridge.js', 'utf8');

  // Verify code contains GET/HEAD retry logic
  assert.ok(bridgeCode.includes('isIdempotent=method===\'GET\'||method===\'HEAD\''));
  assert.ok(bridgeCode.includes('maxAttempts=isIdempotent?2:1'));
  assert.ok(bridgeCode.includes('Связь прервалась. Не удалось загрузить данные; повторите попытку.'));
  assert.ok(bridgeCode.includes('Связь прервалась. Сохранение не подтверждено; повторите ту же операцию.'));

  // Verify status === 0 filter for GET/HEAD
  assert.ok(bridgeCode.includes("status===0&&['GET','HEAD'].includes(String(entry.method||'GET').toUpperCase())"));
  assert.ok(bridgeCode.includes("isIdempotent=method==='GET'||method==='HEAD'||path==='/api/analyze'"));
  assert.ok(bridgeCode.includes("path==='/api/cards/lookup'||path==='/api/analyze'"));
});

test('production asset builder translates read error message without Cyrillic', async () => {
  const english = JSON.parse(readFileSync('production/ui-english.json', 'utf8'));
  const original = 'Связь прервалась. Не удалось загрузить данные; повторите попытку.';
  assert.ok(english[original], 'Missing English translation for read error');
  assert.equal(english[original], 'Connection interrupted. Unable to load data; retry the operation.');

  const builtBridge = readFileSync('rollback/production-assets/main-bridge.js', 'utf8');
  assert.ok(!/[А-Яа-яЁё]/.test(builtBridge), 'Built bridge must not contain Cyrillic');
  assert.ok(builtBridge.includes('Connection interrupted. Unable to load data; retry the operation.'));
});

test('Essential English error catch renders retry button', async () => {
  const hooksCode = readFileSync('client/main/main-hooks.js', 'utf8');
  assert.ok(hooksCode.includes('data-everyday-retry'));
  assert.ok(hooksCode.includes('stageEverydayFlight=null;stageEverydayLoad();'));
});
