import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {retainedScope} from './turso-retained-scope.mjs';
import {build,insertSql} from './import-turso-snapshot.mjs';
import {planRetainedSnapshot} from './plan-turso-retained.mjs';
const dev={id:'a'.repeat(32),login:'TsovakDev',active:1,is_personal_data_revoked:0},twin={id:'b'.repeat(32),login:'Tsovak',active:1},other={id:'c'.repeat(32),login:'Other',active:1};
const sha=value=>createHash('sha256').update(value).digest('hex'),pairKey='pair/tsovak-study.json';
test('Scope preserves old pair identity but never imports the twin or other account',()=>{
  const scope=retainedScope([dev,twin,other],[pairKey]);
  assert.equal(scope.account,dev);assert.equal(scope.excludedAccounts,2);
  assert.equal(scope.anchor.profileId,'profile_'+sha(JSON.stringify(['pair',[dev.id,twin.id].sort()])));
  assert.equal(scope.includesSource(twin.id+'/account-state.json'),false);
  assert.equal(scope.includesSource(other.id+'/texts.json'),false);
  assert.equal(scope.includesSource('stats/month/2026-09.json'),false);
  assert.equal(scope.includesSource('shared/card-quizzes.json'),true);assert.equal(scope.includesSource(dev.id+'/texts.json'),true);
});
test('Fresh snapshot can omit deleted Tsovak using the saved anchor, without changing IDs',()=>{
  const original=retainedScope([dev,twin],[pairKey]);
  const fresh=retainedScope([dev],[pairKey],original.anchor);
  assert.deepEqual(fresh.anchor,original.anchor);assert.deepEqual(fresh.mediaAccountIds,[dev.id,twin.id]);
  assert.throws(()=>retainedScope([dev],[pairKey]),/saved scope anchor/);
  assert.throws(()=>retainedScope([dev],[],original.anchor),/Scope\/source changed/);
});
test('Missing, revoked, inactive, duplicate or replacement account and forged scope fail closed',()=>{
  for(const rows of [[twin],[{...dev,active:0}],[{...dev,is_personal_data_revoked:1}],[dev,{...dev,id:other.id}],[dev,{...dev,id:other.id,login:'tsovakdev'}]])
    assert.throws(()=>retainedScope(rows,[pairKey]));
  const prior=retainedScope([dev,twin],[pairKey]).anchor;
  assert.throws(()=>retainedScope([{...dev,id:other.id}],[pairKey],prior),/Invalid retained scope anchor/);
  assert.throws(()=>retainedScope([dev],[pairKey],{...prior,profileId:'profile_'+'0'.repeat(64)}),/Scope\/source changed/);
  assert.throws(()=>retainedScope([dev],[pairKey],{...prior,sourcePairAccountIds:[dev.id,dev.id]}),/profile identity/);
  assert.throws(()=>retainedScope([dev],['pair/tsovak-songs.json']),/Incomplete/);
  assert.equal(retainedScope([dev],[]).anchor.pairedSource,false);
});
function fixture(){
  const directory=mkdtempSync('/private/tmp/english-quiz-retained-fixture-');
  mkdirSync(resolve(directory,'objects'),{mode:0o700});mkdirSync(resolve(directory,'local-catalogs'),{mode:0o700});
  const accountBytes=Buffer.from(JSON.stringify([dev,twin,other]));writeFileSync(resolve(directory,'accounts.json'),accountBytes,{mode:0o600});
  const records=new Map([
    ['shared/lessons.json',{materials:[{id:'lesson',title:'Shared lesson',published:true,blocks:[{id:'text',type:'text',html:'Shared content',response:'UNKNOWN_PRIVATE_ANSWER'}]}]}],
    ['shared/card-edits.json',{}],['shared/card-quizzes.json',{common:[{id:'quiz',type:'Flip',items:[{front:'common',back:'shared'}]}]}],
    [pairKey,{added:[{word:'personal',ru:'mine'}],songs:[{id:'song',title:'Paired song',lyrics:'Paired lyrics'}],learned:['personal'],variants:{personal:{known:true}},mistakes:[]}],
    ['pair/tsovak-settings.json',{theme:'pair-theme',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1sAAAAASUVORK5CYII='}],['pair/tsovak-songs.json',[]],['pair/tsovak-added.json',[]],['pair/tsovak-texts.json',[{id:'text',title:'Paired text',text:'Retained text'}]],
    [dev.id+'/account-state.json',{added:[],songs:[],learned:[],variants:{},stats:{theme:'projected-theme',allowedLessons:['lesson']}}],
    [twin.id+'/account-state.json',{added:[{word:'EXCLUDED_PRIVATE_CARD'}],stats:{private:'EXCLUDED_PRIVATE_SETTINGS'}}],
    [other.id+'/texts.json',[{id:'excluded',text:'EXCLUDED_PRIVATE_TEXT'}]]]);
  const objects=[];
  for(const [key,value] of records){const bytes=Buffer.from(JSON.stringify(value)),file='objects/'+sha(key)+'.json';writeFileSync(resolve(directory,file),bytes,{mode:0o600});objects.push({key,file,sha256:sha(bytes),bytes:bytes.length,etag:'fixture'});}
  const manifest={version:1,status:'complete',bucket:'learn-english-media',accountsSha256:sha(accountBytes),objects,inventory:[{key:twin.id+'/song'}]};
  writeFileSync(resolve(directory,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
  for(const [name,value] of [['lesson-data.js','window.LESSON_DATA={words:[{en:"common",ru:"shared"}]};'],['irregular.js','window.IRREGULAR=[];'],['grammar.js','window.GRAMMAR={};'],['speakout.js','window.SPEAKOUT={};'],['demonstratives.js',''],['tense-bank.json','{}']])writeFileSync(resolve(directory,'local-catalogs',name),value,{mode:0o600});
  return {directory,manifest,close(){rmSync(directory,{recursive:true});}};
}
test('Scoped full model restores with FK checks, preserves retained study/library/media and shared content only',()=>{
  const f=fixture(),db=new DatabaseSync(':memory:');try{
    const plan=build(f.directory);
    for(const name of ['001_content_schema.sql','002_import_audit.sql'])db.exec(readFileSync(new URL('../migrations/turso/'+name,import.meta.url),'utf8'));
    db.exec(insertSql(plan.model));assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.deepEqual(db.prepare('SELECT id FROM account_refs').all().map(r=>r.id),[dev.id]);
    assert.equal(db.prepare('SELECT count(*) n FROM profile_members').get().n,1);
    const profile=db.prepare('SELECT * FROM study_profiles').get();assert.equal(profile.kind,'personal');assert.equal(profile.id,plan.scopeAnchor.profileId);
    assert.equal(db.prepare('SELECT count(*) n FROM card_progress WHERE learned=1').get().n,1);
    assert.equal(db.prepare("SELECT value_json FROM profile_settings WHERE key='theme'").get().value_json,'"pair-theme"');
    assert.equal(db.prepare("SELECT count(*) n FROM library_items").get().n,2);
    assert.equal(db.prepare("SELECT media_key FROM library_items WHERE kind='song'").get().media_key,twin.id+'/song');
    assert.equal(db.prepare('SELECT count(*) n FROM lessons').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM quizzes').get().n,1);
    assert.equal(db.prepare('SELECT count(*) n FROM lesson_access').get().n,1);
    const payload=JSON.stringify(Object.fromEntries(Object.entries(plan.model).map(([k,rows])=>[k,[...rows.values()]])));
    assert.doesNotMatch(payload,/EXCLUDED_PRIVATE|UNKNOWN_PRIVATE_ANSWER/);
    assert.equal(plan.report.scope.retainedAccounts,1);assert.equal(plan.report.productionReady,false);
    assert.throws(()=>db.exec(insertSql(plan.model)),/CHECK constraint failed/,'Never overwrite a populated target');
  }finally{db.close();f.close();}
});
test('Exclusion happens before JSON parsing; scoped source tampering fails checksum verification',()=>{
  const f=fixture();try{
    const excluded=f.manifest.objects.find(e=>e.key===other.id+'/texts.json');writeFileSync(resolve(f.directory,excluded.file),'not-json');
    assert.doesNotThrow(()=>build(f.directory));
    const included=f.manifest.objects.find(e=>e.key===pairKey);writeFileSync(resolve(f.directory,included.file),'{}');
    assert.throws(()=>build(f.directory),/checksum mismatch/);
  }finally{f.close();}
});
test('Fresh one-account model reuses old scope/card/song IDs; changed policy has a distinct import fingerprint',()=>{
  const f=fixture();try{
    const old=build(f.directory),accounts=Buffer.from(JSON.stringify([dev]));
    writeFileSync(resolve(f.directory,'accounts.json'),accounts);f.manifest.accountsSha256=sha(accounts);
    writeFileSync(resolve(f.directory,'manifest.json'),JSON.stringify(f.manifest));
    const fresh=build(f.directory,{scopeAnchor:old.scopeAnchor});
    assert.deepEqual([...fresh.model.cards.keys()],[...old.model.cards.keys()]);assert.deepEqual([...fresh.model.library_items.keys()],[...old.model.library_items.keys()]);
    assert.notEqual(old.fingerprint,fresh.fingerprint);
    assert.deepEqual([...fresh.model.account_refs.values()],[{id:dev.id}]);
  }finally{f.close();}
});
test('Private projection contains one account only, strips credentials, restores SQLite and never modifies the source archive',()=>{
  const f=fixture();let output;try{
    const accounts=Buffer.from(JSON.stringify([{...dev,password_hash:'NEVER_COPY_CREDENTIALS'},twin,other]));
    writeFileSync(resolve(f.directory,'accounts.json'),accounts);f.manifest.accountsSha256=sha(accounts);
    writeFileSync(resolve(f.directory,'manifest.json'),JSON.stringify(f.manifest));
    const originalManifest=readFileSync(resolve(f.directory,'manifest.json'));
    output=planRetainedSnapshot(f.directory);
    assert.equal(output.retainedAccounts,1);assert.equal(output.excludedSnapshotAccounts,2);assert.equal(output.networkRequests,0);
    assert.equal(output.cutoverAllowed,false);assert.equal(output.liveAccountVerified,false);
    const retained=JSON.parse(readFileSync(resolve(output.directory,'accounts.json'),'utf8'));
    assert.deepEqual(retained,[dev]);
    const projected=JSON.parse(readFileSync(resolve(output.directory,'manifest.json'),'utf8'));
    assert.ok(projected.objects.every(e=>!e.key.startsWith(twin.id+'/')&&!e.key.startsWith(other.id+'/')));
    assert.equal(projected.projection.originalManifestSha256,sha(originalManifest));
    assert.deepEqual(readFileSync(resolve(f.directory,'manifest.json')),originalManifest);assert.deepEqual(readFileSync(resolve(f.directory,'accounts.json')),accounts);
    const db=new DatabaseSync(resolve(output.directory,'scoped.sqlite'),{readOnly:true});
    try{assert.deepEqual(db.prepare('SELECT id FROM account_refs').all().map(row=>row.id),[dev.id]);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{db.close();}
  }finally{if(output)rmSync(output.directory,{recursive:true});f.close();}
});
test('Projection refuses missing frozen catalogs instead of picking up changed working code',()=>{
  const f=fixture();try{
    rmSync(resolve(f.directory,'local-catalogs/grammar.js'));
    assert.throws(()=>planRetainedSnapshot(f.directory),/Frozen catalog missing/);
  }finally{f.close();}
});
test('CLI refuses original full archives before creating artifacts or reading remote credentials',()=>{
  const f=fixture();try{
    assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(new URL('./import-turso-snapshot.mjs',import.meta.url)),'plan',f.directory],{stdio:['ignore','pipe','pipe']}),error=>{
      assert.match(error.stderr.toString(),/Original full archives must not be imported or modified directly/);return true;
    });
    assert.throws(()=>readFileSync(resolve(f.directory,'tsovakdev-scope.json')),error=>error.code==='ENOENT');
    assert.throws(()=>readFileSync(resolve(f.directory,'import-plan-tsovakdev.json')),error=>error.code==='ENOENT');
  }finally{f.close();}
});
test('Repeated planning rejects corrupted inline bytes rather than silently reusing or overwriting them',()=>{
  const f=fixture();try{
    const plan=build(f.directory),entry=[...plan.model.catalog_documents.values()].find(row=>row.namespace==='private-migration-media');
    const file=resolve(f.directory,JSON.parse(entry.value_json).file);writeFileSync(file,'corrupted');
    assert.throws(()=>build(f.directory),/inline media checksum mismatch/);assert.equal(readFileSync(file,'utf8'),'corrupted');
  }finally{f.close();}
});
