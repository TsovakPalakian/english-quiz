import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const result=spawnSync('python3',['-m','unittest','discover','-s','test','-p','test_ci_build_inputs.py'],{encoding:'utf8'});
assert.equal(result.error,undefined,'Python 3.11 or newer is required.');
assert.equal(result.status,0,result.stderr||result.stdout);
console.log('CI build input archive tests passed.');
