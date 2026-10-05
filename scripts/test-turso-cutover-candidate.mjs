import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCandidate} from './turso-cutover-candidate.mjs';
function fixture(){
  const names=['account_refs','account_settings','card_progress','card_quiz_collections','cards','catalog_documents','legacy_ids','lesson_access','lesson_blocks','lesson_responses','lessons','library_items','migration_issues','migration_runs','migration_sources','operation_receipts','profile_cards','profile_library_items','profile_members','profile_settings','quiz_collections','quiz_progress','quizzes','schema_migrations','study_profiles'];
  const tables=Object.fromEntries(names.map(name=>[name,[]]));
  tables.account_refs=[{id:'dev'},{id:'r7'}];tables.study_profiles=[{id:'retained'},{id:'temporary'}];
  tables.profile_members=[{account_id:'dev',profile_id:'retained'},{account_id:'r7',profile_id:'temporary'}];
  tables.cards=[{id:'shared',scope:'shared',owner_profile_id:null},{id:'own',scope:'profile',owner_profile_id:'retained'},
    {id:'test',scope:'profile',owner_profile_id:'temporary'}];
  tables.profile_cards=[{profile_id:'retained',card_id:'own'},{profile_id:'temporary',card_id:'test'}];
  tables.operation_receipts=[{account_id:'dev',result_json:'{"id":"own"}'},{account_id:'dev',result_json:'{"id":"test"}'},
    {account_id:'r7',result_json:'{}'}];
  return {data:{version:1,testOnly:true,tables},anchor:{retainedLogin:'TsovakDev',retainedAccountId:'dev',profileId:'retained'}};
}
test('R9 candidate keeps exact retained IDs/content, removes foreign profiles and dependent receipts without mutating backup',()=>{
  const {data,anchor}=fixture(),before=structuredClone(data),result=projectCandidate(data,anchor);
  assert.deepEqual(data,before);assert.deepEqual(result.data.tables.account_refs,[{id:'dev'}]);
  assert.deepEqual(result.data.tables.cards.map(r=>r.id),['shared','own']);
  assert.equal(result.data.tables.operation_receipts.length,1);
  assert.deepEqual(result.data.tables.profile_cards,[{profile_id:'retained',card_id:'own'}]);
});
test('R9 candidate fails closed on schema drift, replaced identity, unknown polymorphic IDs and foreign lesson references',()=>{
  for(const change of [f=>f.data.tables.unreviewed=[],f=>f.anchor.profileId='replacement',
    f=>f.data.tables.legacy_ids.push({entity_kind:'unknown',target_id:'own'}),
    f=>{f.data.tables.lessons.push({id:'real'});f.data.tables.lesson_blocks.push({lesson_id:'real',card_id:'test'});}]){
    const f=fixture();change(f);assert.throws(()=>projectCandidate(f.data,f.anchor));
  }
});
test('R9 candidate requires exact fixture identity/title and never drops similar non-fixture lessons',()=>{
  const f=fixture();f.data.tables.lessons=[{id:'real',title:'TEST_LESSON_MEDIA_20261005'},
    {id:'lm-muubb41b678e',title:'TEST_LESSON_MEDIA_20261005'}];
  assert.deepEqual(projectCandidate(f.data,f.anchor).data.tables.lessons,[f.data.tables.lessons[0]]);
  f.data.tables.lessons[1].title='Real content';assert.throws(()=>projectCandidate(f.data,f.anchor));
});
