// Generated silence only; never reads/uploads the user's audio files.
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const directory=mkdtempSync('/private/tmp/english-quiz-media-fixture-');
const samples=8000,bytes=Buffer.alloc(44+samples*2);
bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);
const path=join(directory,'synthetic-silence.wav');writeFileSync(path,bytes,{mode:0o600,flag:'wx'});
console.log(JSON.stringify({path,bytes:bytes.length,durationSeconds:1}));
