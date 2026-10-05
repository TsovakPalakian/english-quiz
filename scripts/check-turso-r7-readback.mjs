// Bounded read-only verification of the explicitly disposable R7 UI fixture.
import assert from 'node:assert/strict';
import {TursoStudyClient} from '../src/turso-study.mjs';
import {credentials} from './turso-staging.mjs';
const mode=process.argv[2];
assert.ok(['--active','--deleted'].includes(mode));
try {
  const db=new TursoStudyClient(credentials());
  const [counts]=await db.read(`SELECT
    (SELECT count(*) FROM cards WHERE en='gardening' AND ru LIKE '%TEST_R7_20261005%') translation_markers,
    (SELECT count(*) FROM quizzes WHERE json_extract(items_json,'$[0].front')=? AND deleted_at IS NULL) active_quizzes,
    (SELECT count(*) FROM quizzes WHERE json_extract(items_json,'$[0].front')=? AND deleted_at IS NOT NULL) archived_quizzes,
    (SELECT count(*) FROM quizzes WHERE json_extract(items_json,'$[0].front')=? AND json_extract(items_json,'$[0].back')=? AND revision>=2) updated_quizzes`,
    ['TEST_R7_FLIP_20261005','TEST_R7_FLIP_20261005','TEST_R7_FLIP_20261005','Тестовый квиз R7 — обновлён']);
  assert.equal(counts.translation_markers,0);assert.equal(counts.updated_quizzes,1);
  assert.equal(counts.active_quizzes,mode==='--active'?1:0);assert.equal(counts.archived_quizzes,mode==='--active'?0:1);
  console.log(JSON.stringify({testOnly:true,readOnly:true,d1Queries:0,...counts}));
} catch(error) {console.error('R7 fixture readback failed; no data changed.');process.exitCode=1;}
