// Offline preparation only. Never connects to D1/Turso/R2 or deploys a Worker.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {restore,reverse,auditReverse} from './turso-backup.mjs';
import {localMediaReferences} from './turso-media-backup.mjs';
import {verifySourceMediaBackup} from './turso-source-media.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixtureSong='song_def18dc0-aa9e-43bc-ba2a-c2078d391c30';
const fixtureLesson='lm-muubb41b678e';
export function projectCandidate(data,anchor){
  assert.equal(data.version,1);assert.equal(data.testOnly,true);
  assert.equal(anchor.retainedLogin,'TsovakDev');
  const t=data.tables,account=anchor.retainedAccountId,profile=anchor.profileId;
  assert.equal(Object.keys(t).length,25,'Unexpected schema: review new tables first.');
  assert.equal(t.profile_members.filter(r=>r.account_id===account&&r.profile_id===profile).length,1);
  const song=t.library_items.find(r=>r.id===fixtureSong);
  if(song)assert.equal(JSON.parse(song.content_json).title,'TEST_MEDIA_20261005');
  const lesson=t.lessons.find(r=>r.id===fixtureLesson);
  if(lesson)assert.equal(lesson.title,'TEST_LESSON_MEDIA_20261005');
  const kept={...t};
  for(const name of ['account_refs','account_settings','operation_receipts','lesson_access'])
    kept[name]=t[name].filter(r=>(name==='account_refs'?r.id:r.account_id)===account);
  kept.study_profiles=t.study_profiles.filter(r=>r.id===profile);
  kept.profile_members=t.profile_members.filter(r=>r.account_id===account&&r.profile_id===profile);
  for(const name of ['profile_cards','profile_library_items','profile_settings','card_progress','quiz_progress','lesson_responses'])
    kept[name]=t[name].filter(r=>r.profile_id===profile);
  kept.cards=t.cards.filter(r=>r.scope==='shared'||r.owner_profile_id===profile);
  kept.library_items=t.library_items.filter(r=>r.id!==fixtureSong&&(r.scope==='shared'||r.owner_profile_id===profile));
  kept.lessons=t.lessons.filter(r=>r.id!==fixtureLesson);
  const ids=name=>new Set(kept[name].map(r=>r.id)),cards=ids('cards'),items=ids('library_items'),lessons=ids('lessons');
  kept.lesson_blocks=t.lesson_blocks.filter(r=>lessons.has(r.lesson_id));
  assert.ok(kept.lesson_blocks.every(r=>r.card_id===null||cards.has(r.card_id)),'Excluded private card referenced by shared lesson.');
  kept.lesson_access=kept.lesson_access.filter(r=>lessons.has(r.lesson_id));
  kept.lesson_responses=kept.lesson_responses.filter(r=>lessons.has(r.lesson_id));
  kept.profile_cards=kept.profile_cards.filter(r=>cards.has(r.card_id));
  kept.profile_library_items=kept.profile_library_items.filter(r=>items.has(r.item_id));
  for(const name of ['card_progress','quiz_progress'])kept[name]=kept[name].filter(r=>cards.has(r.card_id));
  kept.card_quiz_collections=t.card_quiz_collections.filter(r=>cards.has(r.card_id));
  const collections=new Set(kept.card_quiz_collections.map(r=>r.collection_id));
  // Preserve orphaned legacy collections for audit, never guess a card owner.
  kept.quiz_collections=t.quiz_collections.filter(r=>r.legacy_word_key!==null||collections.has(r.id));
  const collectionIds=ids('quiz_collections');
  kept.quizzes=t.quizzes.filter(r=>collectionIds.has(r.collection_id));
  const targets={card:cards,'added-card':cards,text:items,song:items,quiz:ids('quizzes')};
  kept.legacy_ids=t.legacy_ids.filter(r=>{
    assert.ok(targets[r.entity_kind],'Unknown polymorphic legacy target.');
    return targets[r.entity_kind].has(r.target_id);
  });
  const excluded=[...t.account_refs.filter(r=>r.id!==account),...t.study_profiles.filter(r=>r.id!==profile),
    ...t.cards.filter(r=>!cards.has(r.id)),...t.library_items.filter(r=>!items.has(r.id)),...t.lessons.filter(r=>!lessons.has(r.id))].map(r=>r.id);
  kept.operation_receipts=kept.operation_receipts.filter(r=>!excluded.some(id=>r.result_json.includes(id)));
  assert.equal(kept.account_refs.length,1);assert.equal(kept.study_profiles.length,1);
  assert.equal(kept.profile_members.length,1);
  return {data:{...data,createdAt:new Date().toISOString(),tables:kept},excluded,
    counts:Object.fromEntries(Object.entries(kept).map(([name,rows])=>[name,{kept:rows.length,excluded:t[name].length-rows.length}]))};
}
export async function createCandidate(backup,anchorFile,{persistent=false}={}){
  assert.match(backup,/^\/Users\/tsovakpalakian\/Downloads\/english-quiz-turso-backups\/turso-verified-[A-Za-z0-9]+$/);
  const manifest=JSON.parse(readFileSync(resolve(backup,'manifest.json')));
  for(const [name,hash] of Object.entries(manifest.files)){
    assert.ok(['snapshot.json','restored.sqlite','reverse-export.json','local-media.json','source-media.json'].includes(name));
    assert.equal(sha(readFileSync(resolve(backup,name))),hash,'Source backup checksum mismatch.');
  }
  const original=JSON.parse(readFileSync(resolve(backup,'snapshot.json')));
  restore(original).close();verifySourceMediaBackup(backup,original);
  const result=projectCandidate(original,JSON.parse(readFileSync(anchorFile)));
  assert.equal(localMediaReferences(result.data).length,0,'Unreviewed test media retained: stop before cutover.');
  const directory=mkdtempSync(persistent?'/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/candidate-verified-':'/private/tmp/english-quiz-candidate-');
  chmodSync(directory,0o700);
  const write=(name,value)=>writeFileSync(resolve(directory,name),value,{mode:0o600,flag:'wx'});
  write('snapshot.json',JSON.stringify(result.data));
  const sqlite=restore(result.data,resolve(directory,'restored.sqlite'));chmodSync(resolve(directory,'restored.sqlite'),0o600);
  let review;
  try{assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    const exported=await reverse(sqlite);review=auditReverse(sqlite,exported);write('reverse-export.json',JSON.stringify(exported));
  }finally{sqlite.close();}
  const sourceMedia=JSON.parse(readFileSync(resolve(backup,'source-media.json')));
  write('source-media.json',JSON.stringify(sourceMedia));mkdirSync(resolve(directory,'source-media'),{mode:0o700});
  for(const entry of sourceMedia.objects){assert.match(entry.file,/^[a-f0-9]{64}\.bin$/);
    const bytes=readFileSync(resolve(backup,'source-media',entry.file));assert.equal(sha(bytes),entry.sha256);write('source-media/'+entry.file,bytes);}
  verifySourceMediaBackup(directory,result.data);
  const report={status:'verified-offline-candidate-not-deployable',retainedLogin:'TsovakDev',retainedAccounts:1,
    retainedAccountId:result.data.tables.account_refs[0].id,retainedProfileId:result.data.tables.study_profiles[0].id,
    sourceBackup:backup,sourceSnapshotSha256:manifest.files['snapshot.json'],excludedEntityIds:result.excluded,
    tables:result.counts,review,networkRequests:0,liveDataChanged:false,cutoverAllowed:false};
  write('candidate-report.json',JSON.stringify(report,null,2));
  const files=['snapshot.json','restored.sqlite','reverse-export.json','source-media.json','candidate-report.json',...sourceMedia.objects.map(r=>'source-media/'+r.file)];
  write('candidate-manifest.json',JSON.stringify({version:1,cutoverAllowed:false,files:Object.fromEntries(files.map(name=>[name,sha(readFileSync(resolve(directory,name)))]))},null,2));
  return {directory,status:report.status,retainedAccounts:1,tables:25,definitions:result.data.tables.cards.length,
    libraryItems:result.data.tables.library_items.length,lessons:result.data.tables.lessons.length,
    excludedEntities:result.excluded.length,unresolvedIssues:review.unresolvedIssues,networkRequests:0,cutoverAllowed:false};
}
export async function verifyCandidate(directory){
  assert.match(directory,/^(?:\/private\/tmp\/english-quiz-candidate-|\/Users\/tsovakpalakian\/Downloads\/english-quiz-turso-backups\/candidate-verified-)[A-Za-z0-9]+$/);
  const manifest=JSON.parse(readFileSync(resolve(directory,'candidate-manifest.json')));
  assert.equal(manifest.version,1);assert.equal(manifest.cutoverAllowed,false);
  for(const [name,hash] of Object.entries(manifest.files)){
    assert.match(name,/^(snapshot\.json|restored\.sqlite|reverse-export\.json|source-media\.json|candidate-report\.json|source-media\/[a-f0-9]{64}\.bin)$/);
    assert.equal(sha(readFileSync(resolve(directory,name))),hash,'Candidate checksum mismatch.');
  }
  const data=JSON.parse(readFileSync(resolve(directory,'snapshot.json'))),report=JSON.parse(readFileSync(resolve(directory,'candidate-report.json')));
  assert.equal(Object.keys(data.tables).length,25);assert.equal(report.cutoverAllowed,false);
  assert.equal(data.tables.account_refs.length,1);assert.equal(data.tables.study_profiles.length,1);assert.equal(data.tables.profile_members.length,1);
  assert.equal(data.tables.account_refs[0].id,report.retainedAccountId);
  assert.equal(data.tables.study_profiles[0].id,report.retainedProfileId);
  for(const [table,rows] of Object.entries(data.tables))assert.equal(rows.length,report.tables[table].kept);
  assert.equal(localMediaReferences(data).length,0);
  const sqlite=restore(data);let review;
  try{assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    review=auditReverse(sqlite,JSON.parse(readFileSync(resolve(directory,'reverse-export.json'))));
  }finally{sqlite.close();}
  const media=verifySourceMediaBackup(directory,data);
  return {status:'verified-offline-candidate-not-deployable',tables:25,retainedAccounts:1,
    losslessIdExport:review.losslessIdExport,media,networkRequests:0,cutoverAllowed:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const [backup,anchor,option,...extra]=process.argv.slice(2);
    if(backup==='--verify'){assert.ok(anchor&&!option&&!extra.length);console.log(JSON.stringify(await verifyCandidate(anchor)));}
    else{
    assert.ok(backup&&anchor&&!extra.length&&(!option||option==='--persist'),'Usage: <verified-backup> <scope-anchor> [--persist]');
    console.log(JSON.stringify(await createCandidate(backup,anchor,{persistent:option==='--persist'})));
    }
  }catch(error){console.error('Candidate preparation stopped:',error.message);process.exitCode=1;}
}
