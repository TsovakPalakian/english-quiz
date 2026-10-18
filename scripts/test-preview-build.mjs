import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {bundles,bundleSource} from './build-preview.mjs';

for(const [target,dir] of Object.entries(bundles))
  assert.ok(readFileSync(new URL('../'+target,import.meta.url),'utf8')===bundleSource(target),target+' is out of date with '+dir+'/: run npm run build:preview');
console.log('Generated bundles match their parts');
