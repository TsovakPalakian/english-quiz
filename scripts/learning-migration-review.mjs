// Read-only classification. Never guesses an owner, edits SQL or resolves flags.
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
export function catalogEvidence(reportFile,sourceDirectory){
  const value=JSON.parse(readFileSync(reportFile,'utf8'));
  const names=['lesson-data.js','irregular.js','grammar.js','speakout.js','demonstratives.js','tense-bank.json'];
  if(value.allMatch!==true||value.productionChanged!==false||value.sourceOrigin!=='https://learn-english.east-tarsal.workers.dev'||value.results?.length!==names.length)throw Error('Invalid catalog evidence.');
  for(const name of names){const row=value.results.find(r=>r.name===name),digest=createHash('sha256').update(readFileSync(resolve(sourceDirectory,name))).digest('hex');
    if(!row||row.compared!==true||row.matches!==true||row.expectedSha256!==digest||row.deployedSha256!==digest)throw Error('Catalog evidence mismatch.');}
  return {files:names.length,checkedAt:value.checkedAt,sourceRefreshPerformed:false};
}
export function quarantineArchiveEvidence(sqlite,sourceDirectory){
  const manifest=JSON.parse(readFileSync(resolve(sourceDirectory,'manifest.json'),'utf8'));
  const sources=sqlite.prepare("SELECT DISTINCT source_key FROM migration_issues WHERE reason IN ('unknown-lesson-response-owner','unmapped-word-progress')").all();
  for(const {source_key} of sources){const entry=manifest.objects.find(row=>row.key===source_key);if(!entry)throw Error('Missing quarantine archive.');
    const path=resolve(sourceDirectory,entry.file);if(!path.startsWith(resolve(sourceDirectory)+'/'))throw Error('Unsafe archive path.');
    const bytes=readFileSync(path),digest=createHash('sha256').update(bytes).digest('hex');
    const row=sqlite.prepare('SELECT sha256,bytes FROM migration_sources WHERE source_key=?').get(source_key);
    if(!row||row.sha256!==digest||row.bytes!==bytes.length||entry.sha256!==digest||entry.bytes!==bytes.length)throw Error('Archive checksum mismatch.');
  }
  return {verifiedSourceObjects:sources.length,ownerGuesses:0,sourceChanged:false};
}
export function migrationReview(sqlite,{catalog=null,archive=null}={}){
  const decisions={
    'unknown-lesson-response-owner':'keep-private-source-archive-do-not-assign',
    'unmapped-word-progress':'keep-private-source-archive-do-not-create-card',
    'legacy-quizzes-not-authoritative':'keep-authoritative-shared-quiz-do-not-merge-legacy-cache',
    'legacy-card-edits-not-authoritative':'keep-authoritative-card-definition-do-not-apply-legacy-overlay',
    'local-catalog-version-not-compared-with-deployed-assets':'retain-unresolved-until-checksum-evidence-is-reviewed'
  };
  const issues=sqlite.prepare('SELECT id,reason,sensitive,resolved FROM migration_issues ORDER BY id').all();
  const rows=issues.map(row=>({...row,decision:row.reason==='local-catalog-version-not-compared-with-deployed-assets'&&catalog?'matching-frozen-deployed-checksum-evidence-reviewed':decisions[row.reason]||'manual-review-no-automatic-change'}));
  const collisions=sqlite.prepare("SELECT word_key,count(*) cards FROM cards WHERE scope='shared' GROUP BY word_key HAVING count(*)>1").all();
  const unknownCollections=sqlite.prepare('SELECT count(*) n FROM quiz_collections WHERE legacy_word_key IS NULL').get().n;
  const foreignKeys=sqlite.prepare('PRAGMA foreign_key_check').all();
  return {readOnly:true,ownerGuesses:0,resolvedFlagsChanged:0,issues:rows,issueCount:rows.length,
    quarantined:rows.filter(row=>row.decision.startsWith('keep-private-source-archive')).length,
    collisionGroups:collisions.length,unmappedQuizCollections:unknownCollections,foreignKeyErrors:foreignKeys.length,
    catalogEvidence:catalog,quarantineArchiveEvidence:archive,cutoverAllowed:false,policy:'ID-only export; ambiguous private material remains in source archive, excluded from runtime.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let db;try{db=new DatabaseSync(process.argv[2],{readOnly:true});const catalog=process.argv[3]?catalogEvidence(process.argv[3],process.argv[4]):null;
    const archive=process.argv[5]?quarantineArchiveEvidence(db,process.argv[5]):null;const result=migrationReview(db,{catalog,archive});
    // Print only aggregate metadata, never private details or account identifiers.
    const {issues,...summary}=result;console.log(JSON.stringify(summary));
  }catch{console.error('Read-only migration review failed. No data changed.');process.exitCode=1;}finally{db?.close();}
}
