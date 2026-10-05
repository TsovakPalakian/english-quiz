// Read-only production verification and private recovery archive. No deployment.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,chmodSync,cpSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {productionCredentials,candidatePlan} from './import-turso-production.mjs';
import {TursoStudyClient} from '../src/turso-study.mjs';
import {snapshot,restore,reverse,auditReverse} from './turso-backup.mjs';
import {cloudflareMediaReader} from './turso-source-media.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const rowHash=rows=>hash(canonical(rows.map(canonical).sort()));
try {
  const [candidate,credentialFile,sourceCapture,...extra]=process.argv.slice(2);
  assert.equal(extra.length,0);assert.ok(sourceCapture);
  const {data:expected}=await candidatePlan(candidate);
  const actual=await snapshot(new TursoStudyClient({...productionCredentials(credentialFile),mode:'production'}));
  assert.equal(canonical(actual.schema),canonical(expected.schema));
  const tableHashes={};
  for(const [table,rows] of Object.entries(expected.tables)){
    assert.equal(rowHash(actual.tables[table]),rowHash(rows),'Table mismatch: '+table);
    tableHashes[table]={rows:rows.length,sha256:rowHash(rows)};
  }
  const dir=mkdtempSync('/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/production-verified-');chmodSync(dir,0o700);
  const write=(name,value)=>writeFileSync(resolve(dir,name),value,{mode:0o600,flag:'wx'});
  write('snapshot.json',JSON.stringify(actual));
  const sqlite=restore(actual,resolve(dir,'restored.sqlite'));chmodSync(resolve(dir,'restored.sqlite'),0o600);
  let review;
  try {
    assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    const exported=await reverse(sqlite);review=auditReverse(sqlite,exported);
    write('reverse-export.json',JSON.stringify(exported));
  } finally {sqlite.close();}
  cpSync(resolve(candidate,'source-media'),resolve(dir,'source-media'),{recursive:true});
  cpSync(resolve(candidate,'source-media.json'),resolve(dir,'source-media.json'));
  cpSync(sourceCapture,resolve(dir,'source-capture'),{recursive:true});
  const media=JSON.parse(readFileSync(resolve(candidate,'source-media.json'))),reader=cloudflareMediaReader();
  const verified=[];
  for(const entry of media.objects){
    let bytes;
    if(entry.kind==='r2')bytes=(await reader.read(entry)).bytes;
    else bytes=readFileSync(resolve('rollback/turso-production-assets/private-migration-media',entry.key+'.bin'));
    assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);
    verified.push({kind:entry.kind,key:entry.key,bytes:entry.bytes,sha256:entry.sha256});
  }
  const files=Object.fromEntries(['snapshot.json','restored.sqlite','reverse-export.json','source-media.json'].map(name=>[name,hash(readFileSync(resolve(dir,name)))]));
  const report={status:'production-data-and-media-verified',checkedAt:new Date().toISOString(),candidate,
    sourceCapture,tables:tableHashes,media:verified,sourceMediaGets:reader.requests,review,files,
    oldMediaReadBinding:'learn-english-media',newMediaWriteBinding:'learn-english-production-media',
    mediaCopiedToNewBucket:false,siteSwitched:false,cutoverAllowed:false};
  write('verification.json',JSON.stringify(report,null,2));
  // Restore the saved bytes once more, not merely the in-memory snapshot.
  restore(JSON.parse(readFileSync(resolve(dir,'snapshot.json')))).close();
  console.log(JSON.stringify({backup:dir,status:report.status,tables:Object.keys(tableHashes).length,
    accounts:actual.tables.account_refs.length,mediaObjects:verified.length,mediaBytes:verified.reduce((n,e)=>n+e.bytes,0),
    sourceMediaGets:reader.requests,losslessIdExport:review.losslessIdExport,siteSwitched:false}));
} catch {
  console.error('Production verification stopped; no automatic retry or database changes.');process.exitCode=1;
}
