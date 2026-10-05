// Bounded read-only audit of the one disposable media fixture, never source R2.
import {mkdtempSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {credentials} from './turso-staging.mjs';
import {TursoStudyClient} from '../src/turso-study.mjs';
const id='song_def18dc0-aa9e-43bc-ba2a-c2078d391c30';
const bucket='learn-english-turso-test-media';
const cli='/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  const db=new TursoStudyClient(credentials());
  const [row]=await db.read('SELECT id,scope,media_key,revision FROM library_items WHERE id=? AND deleted_at IS NULL',[id]);
  if(row?.scope!=='profile'||!new RegExp('^stage-local/songs/[A-Za-z0-9_-]+/'+id+'/[a-f0-9]{64}$').test(row.media_key))throw Error();
  const directory=mkdtempSync('/private/tmp/english-quiz-remote-media-audit-');
  const path=directory+'/download.wav';
  const result=spawnSync(process.execPath,[cli,'r2','object','get',bucket+'/'+row.media_key,'--remote','--file',path],{
    encoding:'utf8',timeout:60000,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:'/private/tmp/english-quiz-turso-media-audit-logs'}
  });
  if(result.status!==0)throw Error();
  const bytes=readFileSync(path),fixture=readFileSync('/private/tmp/english-quiz-media-fixture-LBF9mE/synthetic-silence.wav');
  if(bytes.length!==16044||hash(bytes)!==hash(fixture)||!row.media_key.endsWith('/'+hash(bytes)))throw Error();
  const response=await fetch('https://learn-english-turso-integrated-test.east-tarsal.workers.dev/api/song-file?id='+id,{redirect:'manual',signal:AbortSignal.timeout(20000)});
  await response.body?.cancel();if(response.status!==401)throw Error();
  console.log(JSON.stringify({bucket,revision:row.revision,bytes:bytes.length,checksumMatch:true,anonymousReadStatus:401,downloadPath:path}));
} catch {console.error('Remote fixture audit failed; response bodies/CLI diagnostics suppressed.');process.exitCode=1;}
