// Read-only audit of one synthetic lesson PDF; never reads production R2.
import {mkdtempSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {credentials} from './turso-staging.mjs';
import {TursoStudyClient} from '../src/turso-study.mjs';
const bucket='learn-english-turso-test-media';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  const db=new TursoStudyClient(credentials());
  const rows=await db.read(`SELECT b.lesson_id,b.id,b.content_json,b.revision FROM lesson_blocks b
    JOIN lessons l ON l.id=b.lesson_id WHERE l.title=? AND l.deleted_at IS NULL
    AND b.deleted_at IS NULL AND b.type='pdf'`,['TEST_LESSON_MEDIA_20261005']);
  if(rows.length!==1)throw Error();
  const row=rows[0],content=JSON.parse(row.content_json),key=content.localMediaKey;
  if(!/^[A-Za-z0-9_-]+$/.test(row.lesson_id)||!new RegExp('^stage-local/lessons/'+row.lesson_id+'/'+row.id+'/[a-f0-9]{64}$').test(key))throw Error();
  const directory=mkdtempSync('/private/tmp/english-quiz-lesson-media-audit-'),path=directory+'/download.pdf';
  const cli='/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js';
  const result=spawnSync(process.execPath,[cli,'r2','object','get',bucket+'/'+key,'--remote','--file',path],{
    encoding:'utf8',timeout:60000,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:'/private/tmp/english-quiz-turso-media-audit-logs'}
  });
  if(result.status!==0)throw Error();
  const bytes=readFileSync(path),fixture=readFileSync('/private/tmp/english-quiz-synthetic-lesson-20261005.pdf');
  if(bytes.length!==1430||hash(bytes)!==hash(fixture)||!key.endsWith('/'+hash(bytes)))throw Error();
  const response=await fetch('https://learn-english-turso-integrated-test.east-tarsal.workers.dev/api/lesson-file?id='+encodeURIComponent(content.fileId),{redirect:'manual',signal:AbortSignal.timeout(20000)});
  await response.body?.cancel();if(response.status!==401)throw Error();
  console.log(JSON.stringify({bucket,lessonId:row.lesson_id,revision:row.revision,bytes:bytes.length,checksumMatch:true,anonymousReadStatus:401,downloadPath:path}));
} catch {console.error('Lesson fixture audit failed; private diagnostics suppressed.');process.exitCode=1;}
