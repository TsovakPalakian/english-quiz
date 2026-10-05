// Verify a completed educational archive and add a separate auth restore proof.
// No cloud writes or D1 queries. Never restore either database in production.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
  const [dir,...extra]=process.argv.slice(2);assert.equal(extra.length,0);
  assert.match(dir,/^\/Users\/tsovakpalakian\/Downloads\/english-quiz-turso-backups\/production-final-[A-Za-z0-9]+$/);
  const report=JSON.parse(readFileSync(resolve(dir,'verification.json')));
  assert.equal(report.status,'verified-post-cutover-backup');assert.equal(report.offlineRestoreVerified,true);
  for(const [name,digest] of Object.entries(report.files))assert.equal(sha(readFileSync(resolve(dir,name))),digest);
  assert.ok(report.files['worker/auth-d1.sql'],'Fresh scoped D1 export required');
  const schema=readFileSync('schema.sql','utf8').split('CREATE TABLE IF NOT EXISTS sessions (')[0];
  const write=(name,value)=>writeFileSync(resolve(dir,name),value,{mode:0o600,flag:'wx'});
  write('auth-schema.sql',schema);
  const db=new DatabaseSync(resolve(dir,'auth-restored.sqlite'));chmodSync(resolve(dir,'auth-restored.sqlite'),0o600);
  let accountCount;
  try{
    db.exec(schema);db.exec(readFileSync(resolve(dir,'worker/auth-d1.sql'),'utf8'));
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name),['account_changes','registrations','users']);
    const dev=db.prepare("SELECT id,role,is_personal_data_revoked,active FROM users WHERE login='TsovakDev'").get();
    assert.ok(dev);assert.equal(dev.role,'DEVELOPER');assert.equal(dev.is_personal_data_revoked,0);assert.equal(dev.active,1);
    const data=JSON.parse(readFileSync(resolve(dir,'snapshot.json')));
    assert.ok(data.tables.account_refs.some(row=>row.id===dev.id));
    assert.ok(data.tables.profile_members.some(row=>row.account_id===dev.id));
    accountCount=db.prepare('SELECT count(*) n FROM users').get().n;
  }finally{db.close();}
  const response=await fetch('https://learn-english.east-tarsal.workers.dev/',{redirect:'error',signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200);assert.ok((await response.text()).includes('<html'));
  const files={...report.files};
  for(const name of ['auth-schema.sql','auth-restored.sqlite','verification.json'])files[name]=sha(readFileSync(resolve(dir,name)));
  const result={status:'migration-accepted-with-documented-known-issues',acceptedAt:new Date().toISOString(),
    workerVersion:report.workerVersion,educationalTables:Object.keys(report.tables).length,
    mediaObjects:report.mediaObjects,mediaBytes:report.mediaBytes,offlineEducationRestore:true,offlineAuthRestore:true,
    authTables:['users','registrations','account_changes'],authAccountCount:accountCount,retainedTsovakDev:true,
    liveHomepageStatus:response.status,productionWritesPerformed:false,d1AccountExportOperations:1,
    authAndEducationAreSeparateSnapshots:true,automaticLegacyRollbackAllowed:false,
    knownIssues:report.knownIssues,files};
  write('acceptance.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({backup:dir,status:result.status,workerVersion:result.workerVersion,
    offlineEducationRestore:true,offlineAuthRestore:true,liveHomepageStatus:response.status,retainedTsovakDev:true}));
}catch{console.error('Final acceptance stopped; production data not modified.');process.exitCode=1;}
