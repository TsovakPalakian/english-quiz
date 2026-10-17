import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {previewSource} from './build-preview.mjs';

assert.ok(readFileSync(new URL('../preview.js',import.meta.url),'utf8')===previewSource(),'preview.js is out of date with client/: run npm run build:preview');
console.log('preview.js matches client/');
