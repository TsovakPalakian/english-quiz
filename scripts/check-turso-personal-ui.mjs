// Exact recovery ledger for disposable fixtures created through the real USER UI.
// No production reads/writes; do not delete an account or reset profile versions.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {TursoStudyClient,statement as s} from '../src/turso-study.mjs';
import {credentials} from './turso-staging.mjs';
import {defaultSnapshot} from './run-turso-stage.mjs';
import {resolve} from 'node:path';
const db=new TursoStudyClient(credentials()),path=fileURLToPath(new URL('../rollback/turso-personal-ui.json',import.meta.url));
const save=l=>writeFileSync(path,JSON.stringify(l,null,2),{mode:0o600});
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
async function otherRows(l){
  const ids=Object.values(l.entities).map(row=>row.id),exclude=ids.length?` WHERE id NOT IN (${ids.map(()=>'?').join(',')})`:'';
  const cards=await db.read('SELECT * FROM cards'+exclude+' ORDER BY id',ids);
  const library=await db.read('SELECT * FROM library_items'+exclude+' ORDER BY id',ids);
  return {cards:hash(cards),library:hash(library)};
}
function load(){const l=JSON.parse(readFileSync(path));assert.match(l.prefix,/^stage_personal_[a-f0-9-]{36}$/);if(l.actor)assert.match(l.actor,/^[a-f0-9]{16,64}$/);
  for(const [kind,row] of Object.entries(l.entities)){assert.ok(['card','text','song'].includes(kind));assert.match(row.id,new RegExp('^'+({card:'own_',text:'text_',song:'song_'}[kind])+'[a-f0-9-]{36}$'));}return l;}
async function check(l,kind){
  assert.ok(['card','text','song'].includes(kind));
  const rows=kind==='card'?await db.read('SELECT * FROM cards WHERE en=?',[l.prefix+' card']):await db.read("SELECT * FROM library_items WHERE kind=? AND json_extract(content_json,'$.title')=?",[kind,l.prefix+' '+kind]);
  assert.equal(rows.length,1,'Exactly one predeclared fixture is required');const row=rows[0];
  if(!l.actor){
    const receipts=await db.read("SELECT account_id FROM operation_receipts WHERE json_extract(result_json,'$.id')=?",[row.id]);assert.equal(receipts.length,1,'Require a single authenticated creation receipt');
    const raw=JSON.parse(readFileSync(resolve(defaultSnapshot,'accounts.json'))),accounts=Array.isArray(raw)?raw:raw.accounts;
    assert.ok(accounts.some(a=>a.id===receipts[0].account_id&&a.role==='USER'&&Number(a.active)===1&&!Number(a.is_personal_data_revoked)));
    const members=await db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[receipts[0].account_id]);assert.equal(members.length,1);
    l.actor=receipts[0].account_id;l.profile=members[0].profile_id;save(l);
  }
  assert.equal(row.owner_profile_id,l.profile);assert.equal(row.scope,'profile');assert.equal(row.deleted_at,null);
  if(l.entities[kind])assert.equal(row.id,l.entities[kind].id);else{l.entities[kind]={id:row.id};save(l);}
  if(kind==='card'){assert.equal(row.ru,'Временная личная карточка');assert.equal(row.revision,1);assert.equal((await db.read("SELECT * FROM profile_cards WHERE profile_id=? AND card_id=? AND place='mine'",[l.profile,row.id])).length,1);}
  else{assert.equal(row.revision,kind==='text'?2:3);const content=JSON.parse(row.content_json);assert.equal(content[kind==='text'?'text':'lyrics'],kind==='text'?'Updated temporary text.':'Updated temporary lyrics.');if(kind==='song')assert.equal(content.artist,'Updated disposable UI fixture');}
  const receipts=await db.read("SELECT account_id,mutation_id FROM operation_receipts WHERE account_id=? AND json_extract(result_json,'$.id')=?",[l.actor,row.id]);
  assert.equal(receipts.length,kind==='card'?1:kind==='text'?2:3);l.entities[kind].receipts=receipts;save(l);
  assert.deepEqual(await otherRows(l),l.before,'Other definitions/library rows changed');
  console.log('PASS real USER browser '+kind+': fresh Turso readback, owner, revision, receipts and other rows unchanged');
}
try{
  const mode=process.argv[2];
  if(mode==='--prepare'){
    assert.ok(!existsSync(path),'Existing recovery ledger; do not create another fixture');
    const l={prefix:'stage_personal_'+crypto.randomUUID(),actor:null,profile:null,entities:{}};l.before=await otherRows(l);save(l);
    console.log(JSON.stringify({card:l.prefix+' card',text:l.prefix+' text',song:l.prefix+' song'}));
  }else if(mode?.startsWith('--check-'))await check(load(),mode.slice(8));
  else if(mode==='--cleanup'){
    const l=load();assert.deepEqual(Object.keys(l.entities).sort(),['card','song','text']);
    for(const kind of ['card','text','song'])await check(l,kind);
    const card=l.entities.card.id,library=[l.entities.text.id,l.entities.song.id];
    await db.atomic([
      s('DELETE FROM quiz_progress WHERE card_id=? AND profile_id=?',[card,l.profile]),s('DELETE FROM card_progress WHERE card_id=? AND profile_id=?',[card,l.profile]),
      s('DELETE FROM profile_cards WHERE card_id=? AND profile_id=?',[card,l.profile]),
      s('DELETE FROM cards WHERE id=? AND owner_profile_id=? AND en=?',[card,l.profile,l.prefix+' card']),
      ...library.map(id=>s('DELETE FROM profile_library_items WHERE item_id=? AND profile_id=?',[id,l.profile])),
      ...library.map(id=>s('DELETE FROM library_items WHERE id=? AND owner_profile_id=?',[id,l.profile])),
      ...Object.values(l.entities).flatMap(row=>row.receipts.map(r=>s('DELETE FROM operation_receipts WHERE account_id=? AND mutation_id=?',[r.account_id,r.mutation_id])))
    ]);
    assert.deepEqual(await otherRows(l),l.before);assert.deepEqual(await db.read('PRAGMA foreign_key_check'),[]);
    assert.equal((await db.read('SELECT id FROM cards WHERE id=?',[card])).length,0);assert.equal((await db.read('SELECT id FROM library_items WHERE id IN (?,?)',library)).length,0);
    unlinkSync(path);console.log('PASS only recorded UI fixtures/receipts removed; other content unchanged. Profile CAS and activity counters retained.');
  }else throw new Error('Use --prepare, --check-card/text/song or --cleanup');
}catch(error){console.error('Personal UI check failed:',error.message);console.error('Keep the recovery ledger; no production fallback or broad cleanup.');process.exitCode=1;}
