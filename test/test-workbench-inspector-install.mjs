import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectorCaddyfile} from '../ops/install-workbench-inspector.mjs';
test('inspector site preserves original proxy bytes and refuses duplicate installation',()=>{
  const original='example.org {\n reverse_proxy localhost:8000\n}\n';
  const output=inspectorCaddyfile(original);
  assert.ok(output.startsWith(original));
  assert.match(output,/reverse_proxy 127\.0\.0\.1:8088/);
  assert.match(output,/output discard/);
  assert.match(output,/max_size 20MB/);
  assert.throws(()=>inspectorCaddyfile(output));
  assert.throws(()=>inspectorCaddyfile(''));
});
