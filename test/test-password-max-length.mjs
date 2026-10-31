import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('signup and reset paths accept passwords up to 128 characters',()=>{
  const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
  assert.match(worker,/const PASSWORD_MAX=128/);
  assert.match(worker,/Password needs 8 to 128 characters/);
  assert.doesNotMatch(worker,/Password needs 8 to 32 characters/);
  const account=readFileSync(new URL('../client/05-account.js',import.meta.url),'utf8');
  assert.match(account,/maxlength="128"/);
  assert.match(account,/8–128 characters|8 to 128 characters/);
});
