// Recovery ledger for one lesson created through the real teacher UI.
// No production queries/writes. Exact UUID title is recorded BEFORE UI creation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {TursoStudyClient,StudyService,statement as s} from '../src/turso-study.mjs';
import {legacyLessons} from '../src/turso-legacy-read.mjs';
import {credentials} from './turso-staging.mjs';
import {snapshotPersonas} from './run-turso-stage.mjs';
const db=new TursoStudyClient(credentials()),actors=snapshotPersonas();
const path=fileURLToPath(new URL('../rollback/turso-lesson-ui.json',import.meta.url));
const save=l=>writeFileSync(path,JSON.stringify(l,null,2),{mode:0o600});
const counts=()=>db.read(`SELECT (SELECT count(*) FROM lessons) lessons,(SELECT count(*) FROM lesson_blocks) blocks,
  (SELECT count(*) FROM cards) cards,(SELECT count(*) FROM operation_receipts) receipts,(SELECT count(*) FROM lesson_responses) responses`);
const versions=()=>db.read('SELECT id,revision,deleted_at FROM lessons ORDER BY id');
async function resolve(l){
  assert.match(l.prefix,/^stage_[a-f0-9-]{36}$/);assert.equal(l.title,l.prefix+' UI lesson');
  if(!l.id){
    const rows=await db.read('SELECT id,title,created_at FROM lessons WHERE title=?',[l.title]);
    assert.equal(rows.length,1,'Expected exactly one lesson with the predeclared test title');
    assert.match(rows[0].id,/^lm-[a-z0-9]{8,40}$/);
    assert.ok(!l.before.some(row=>row.id===rows[0].id),'Never target a pre-existing lesson');
    const receipts=await db.read("SELECT mutation_id FROM operation_receipts WHERE account_id=? AND json_extract(result_json,'$.id')=? AND json_extract(result_json,'$.revision')=1",[actors[0].id,rows[0].id]);
    assert.equal(receipts.length,1,'Teacher UI creation receipt is required');
    l.id=rows[0].id;save(l);
  }
  assert.match(l.id,/^lm-[a-z0-9]{8,40}$/);assert.ok(!l.before.some(row=>row.id===l.id));
  return l;
}
async function check(l,phase){
  await resolve(l);
  const [lesson]=await db.read('SELECT * FROM lessons WHERE id=? AND title=?',[l.id,l.title]);assert.ok(lesson);
  const blocks=await db.read('SELECT * FROM lesson_blocks WHERE lesson_id=? ORDER BY position,id',[l.id]);
  const stages={draft:1,published:2,edited:3,hidden:4,unhidden:5,deleted:6};assert.equal(lesson.revision,stages[phase]);
  assert.equal(lesson.published,phase==='draft'?0:1);assert.equal(lesson.hidden_from_students,phase==='hidden'?1:0);
  assert.equal(lesson.deleted_at!==null,phase==='deleted');assert.equal(blocks.length,2);
  const heading=blocks.find(b=>b.type==='heading'),task=blocks.find(b=>b.type==='task');assert.ok(heading);assert.ok(task);
  assert.equal(JSON.parse(heading.content_json).text,'Temporary heading');assert.equal(heading.revision,1);
  const edited=!['draft','published'].includes(phase);
  assert.equal(JSON.parse(task.content_json).text,edited?'Updated instruction':'Original instruction');
  assert.equal(task.revision,edited?2:1);assert.equal(lesson.description,edited?'Edited through UI':'Created through UI');
  const own=(await legacyLessons(db,actors[0])).materials.find(row=>row.id===l.id);
  const student=(await legacyLessons(db,actors[2])).materials.find(row=>row.id===l.id);
  assert.equal(!!own,phase!=='deleted');assert.equal(!!student,!['draft','hidden','deleted'].includes(phase));
  if(l.answerSeeded){
    const [response]=await db.read('SELECT response_json,revision FROM lesson_responses WHERE lesson_id=? AND block_id=?',[l.id,task.id]);
    assert.equal(JSON.parse(response.response_json).value,'Temporary learner answer');assert.equal(response.revision,1);
    if(student)assert.equal(student.blocks.find(b=>b.id===task.id).response,edited?undefined:'Temporary learner answer');
  }
  assert.deepEqual((await versions()).filter(row=>row.id!==l.id),l.before,'Other lessons were changed');
  console.log('PASS teacher browser lesson '+phase+': fresh Turso readback, visibility, exact block revisions and other lessons unchanged');
}
try{
  const mode=process.argv[2];
  if(mode==='--prepare'){
    assert.ok(!existsSync(path),'Existing UI ledger: check or clean it first');
    const prefix='stage_'+crypto.randomUUID(),l={prefix,title:prefix+' UI lesson',before:await versions(),baseline:await counts()};save(l);
    console.log(JSON.stringify({title:l.title}));
  }else{
    const l=await resolve(JSON.parse(readFileSync(path,'utf8')));
    if(mode==='--seed-answer'){
      const [task]=await db.read("SELECT id FROM lesson_blocks WHERE lesson_id=? AND type='task' AND revision=1 AND deleted_at IS NULL",[l.id]);assert.ok(task);
      l.answerMutation||=crypto.randomUUID();save(l);
      await new StudyService(db).saveLessonResponse(actors[2],l.id,task.id,{mutationId:l.answerMutation,expectedRevision:0,expectedBlockRevision:1,response:'Temporary learner answer'});
      l.answerSeeded=true;save(l);console.log('PASS disposable learner answer seeded for preservation check (adapter, not browser login)');
    }else if(mode==='--cleanup'){
      const [lesson]=await db.read('SELECT title FROM lessons WHERE id=?',[l.id]);
      if(!lesson){
        // A prior cleanup may have committed before its response was lost.
        assert.deepEqual(await counts(),l.baseline);assert.deepEqual(await versions(),l.before);assert.deepEqual(await db.read('PRAGMA foreign_key_check'),[]);
        unlinkSync(path);console.log('PASS previous cleanup committed; baseline verified');
      }else{
      assert.equal(lesson.title,l.title);
      const receipts=await db.read("SELECT account_id,mutation_id FROM operation_receipts WHERE json_extract(result_json,'$.id')=? OR json_extract(result_json,'$.lessonId')=?",[l.id,l.id]);
      for(const r of receipts){assert.ok(actors.some(a=>a.id===r.account_id));assert.match(r.mutation_id,/^[a-f0-9-]{36}$/);}
      l.receipts=receipts.length?receipts:l.receipts||[];save(l);
      await db.atomic([s('DELETE FROM lesson_responses WHERE lesson_id=?',[l.id]),s('DELETE FROM lesson_blocks WHERE lesson_id=?',[l.id]),s('DELETE FROM lesson_access WHERE lesson_id=?',[l.id]),s('DELETE FROM lessons WHERE id=?',[l.id]),...l.receipts.map(r=>s('DELETE FROM operation_receipts WHERE account_id=? AND mutation_id=?',[r.account_id,r.mutation_id]))]);
      assert.deepEqual(await counts(),l.baseline);assert.deepEqual(await versions(),l.before);assert.deepEqual(await db.read('PRAGMA foreign_key_check'),[]);
      unlinkSync(path);console.log('PASS disposable UI lesson/answer/receipts removed; baseline counts and other lesson versions restored');
      }
    }else if(/^--check-(draft|published|edited|hidden|unhidden|deleted)$/.test(mode||''))await check(l,mode.slice(8));
    else throw new Error('Use --prepare, --seed-answer, --check-<phase> or --cleanup');
  }
}catch(error){console.error('UI lesson check failed:',error.message);console.error('Keep the recovery ledger; cleanup targets only its recorded test lesson.');process.exitCode=1;}
