// Read-only TEST Turso backup, offline restore and compatibility export.
import {readFileSync,writeFileSync,mkdtempSync,chmodSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {TursoStudyClient,statement as s} from '../src/turso-study.mjs';
import {legacyState,legacyLessons,legacyTexts} from '../src/turso-legacy-read.mjs';
import {credentials} from './turso-staging.mjs';
import {localMediaStore} from './turso-local-media.mjs';
import {localMediaReferences,writeLocalMediaBackup,verifyLocalMediaBackup,restoreLocalMediaBackup,localMediaArchiveStore} from './turso-media-backup.mjs';
import {writeSourceMediaBackup,verifySourceMediaBackup,restoreSourceMediaBackup,cloudflareMediaReader} from './turso-source-media.mjs';
import {defaultSnapshot} from './run-turso-stage.mjs';
import {stageMediaArchiveStore} from './turso-stage-media-backup.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const tableHash=rows=>hash(canonical(rows.map(canonical).sort()));
const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!k.startsWith('stage')).map(([k,x])=>[k,clean(x)])):v;
export async function snapshot(db){
  const sql="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name";
  const schema=await db.read(sql),tables=schema.filter(row=>row.type==='table').map(row=>row.name);
  if(!tables.length||tables.some(name=>! /^[a-z_][a-z0-9_]*$/.test(name)))throw new Error('Unsafe schema.');
  const [before,...results]=await db.readMany([s(sql),...tables.map(name=>s('SELECT * FROM '+name)),s(sql)]);
  const after=results.pop();assert.deepEqual(before,schema);assert.deepEqual(after,schema);
  return {version:1,testOnly:true,createdAt:new Date().toISOString(),schema,tables:Object.fromEntries(tables.map((name,i)=>[name,results[i]]))};
}
export function restore(data,path=':memory:'){
  assert.equal(data.version,1);assert.equal(data.testOnly,true);
  const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA foreign_keys=ON; BEGIN; PRAGMA defer_foreign_keys=ON;');
  try{
    for(const type of ['table','index','view','trigger'])for(const row of data.schema.filter(row=>row.type===type)){
      if(! /^[a-z_][a-z0-9_]*$/.test(row.name))throw new Error('Unsafe schema ID.');sqlite.exec(row.sql);
    }
    for(const [name,rows] of Object.entries(data.tables)){
      assert.ok(data.schema.some(row=>row.type==='table'&&row.name===name));
      for(const row of rows){const columns=Object.keys(row);if(columns.some(k=>! /^[a-z_][a-z0-9_]*$/.test(k)))throw new Error('Unsafe column ID.');
        sqlite.prepare(`INSERT INTO ${name}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...Object.values(row));}
    }
    sqlite.exec('COMMIT');assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
    for(const [name,rows] of Object.entries(data.tables))assert.equal(tableHash(sqlite.prepare('SELECT * FROM '+name).all()),tableHash(rows));
    return sqlite;
  }catch(error){if(sqlite.isTransaction)sqlite.exec('ROLLBACK');sqlite.close();throw error;}
}
export async function reverse(sqlite){
  const args=cmd=>cmd.args.map(a=>a.type==='null'?null:a.type==='integer'?Number(a.value):a.value);
  const db={read:async(sql,params=[])=>sqlite.prepare(sql).all(...params),readMany:async cmds=>cmds.map(cmd=>sqlite.prepare(cmd.sql).all(...args(cmd)))};
  const accounts=sqlite.prepare('SELECT id FROM account_refs ORDER BY id').all(),states={};
  for(const {id} of accounts){const actor={id,role:'ADMIN'};states[id]={state:clean(await legacyState(db,actor)),texts:clean((await legacyTexts(db,actor)).texts)};}
  const lessons=clean((await legacyLessons(db,{id:'backup_no_owner',role:'ADMIN'})).materials);
  const collections=sqlite.prepare('SELECT * FROM quiz_collections ORDER BY id').all();
  // NULL legacy keys are valid for ID-based collections, but cannot become a
  // shared "null" object key: that would silently overwrite other collections.
  const quizCollections=collections.map(c=>({...c,
    cardIds:sqlite.prepare('SELECT card_id FROM card_quiz_collections WHERE collection_id=? ORDER BY card_id').all(c.id).map(row=>row.card_id),
    quizzes:sqlite.prepare('SELECT * FROM quizzes WHERE collection_id=? ORDER BY position,id').all(c.id)}));
  const cardQuizzes=Object.fromEntries(quizCollections.filter(c=>c.legacy_word_key!==null).map(c=>[c.legacy_word_key,c.quizzes.filter(q=>q.deleted_at===null).map(q=>({id:q.id,type:q.type,items:JSON.parse(q.items_json)}))]));
  // All definitions and owner-bound responses remain losslessly available in
  // the verified SQLite backup. Legacy word-key collisions MUST NOT be guessed.
  const definitions=sqlite.prepare('SELECT * FROM cards ORDER BY id').all();
  const collisions=sqlite.prepare("SELECT word_key,count(*) n FROM cards WHERE scope='shared' GROUP BY word_key HAVING count(*)>1").all().map(row=>({...row,cardIds:definitions.filter(c=>c.scope==='shared'&&c.word_key===row.word_key).map(c=>c.id)}));
  const issues=sqlite.prepare('SELECT reason,count(*) n FROM migration_issues WHERE resolved=0 GROUP BY reason').all();
  // Lossless ID export includes every relation, revision, tombstone and audit
  // row. The old word-key projection above is diagnostic, NEVER an importer.
  const idExport=await snapshot(db);
  return {version:1,status:'review-required-not-for-live-import',cutoverAllowed:false,shared:{lessons,cardQuizzes},accounts:states,definitions,quizCollections,
    idExport,compatibilityImportAllowed:false,
    profileMembers:sqlite.prepare('SELECT * FROM profile_members ORDER BY account_id').all(),
    lessonResponses:sqlite.prepare('SELECT * FROM lesson_responses ORDER BY profile_id,lesson_id,block_id').all(),
    blockers:{wordKeyCollisions:collisions,unmappedQuizCollections:collections.filter(c=>c.legacy_word_key===null).map(c=>c.id),unresolvedMigrationIssues:issues,liveRolesAndPairRoutingNeedReview:true,inlineMediaNeedResolution:true}};
}
export function auditReverse(sqlite,value){
  assert.equal(value.status,'review-required-not-for-live-import');assert.equal(value.cutoverAllowed,false);
  const compare=(table,rows)=>assert.equal(tableHash(rows),tableHash(sqlite.prepare('SELECT * FROM '+table).all()),'Reverse export lost or changed '+table);
  compare('cards',value.definitions);compare('profile_members',value.profileMembers);compare('lesson_responses',value.lessonResponses);
  compare('quiz_collections',value.quizCollections.map(({cardIds,quizzes,...row})=>row));
  compare('quizzes',value.quizCollections.flatMap(c=>c.quizzes));
  compare('card_quiz_collections',value.quizCollections.flatMap(c=>c.cardIds.map(card_id=>({card_id,collection_id:c.id}))));
  assert.equal(value.compatibilityImportAllowed,false);
  assert.equal(value.idExport.version,1);assert.equal(value.idExport.testOnly,true);
  const schema=sqlite.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name").all();
  assert.equal(canonical(value.idExport.schema),canonical(schema),'Reverse export changed schema');
  assert.deepEqual(Object.keys(value.idExport.tables).sort(),schema.filter(r=>r.type==='table').map(r=>r.name).sort());
  for(const [table,rows] of Object.entries(value.idExport.tables))compare(table,rows);
  assert.deepEqual(Object.keys(value.accounts).sort(),sqlite.prepare('SELECT id FROM account_refs ORDER BY id').all().map(row=>row.id));
  return {status:'verified-id-export-review-still-required',cutoverAllowed:false,
    definitions:value.definitions.length,quizCollections:value.quizCollections.length,
    quizzes:value.quizCollections.reduce((n,c)=>n+c.quizzes.length,0),
    deletedQuizzes:value.quizCollections.reduce((n,c)=>n+c.quizzes.filter(q=>q.deleted_at!==null).length,0),
    wordKeyCollisionGroups:value.blockers.wordKeyCollisions.length,unmappedQuizCollections:value.blockers.unmappedQuizCollections.length,
    unresolvedIssues:value.blockers.unresolvedMigrationIssues.reduce((n,row)=>n+row.n,0),idExportTables:Object.keys(value.idExport.tables).length,losslessIdExport:true,compatibilityImportAllowed:false};
}
function verifiedBackup(path){
  if(!path)throw new Error('Specify a private backup directory.');
  const dir=resolve(path);if(!dir.startsWith('/private/tmp/english-quiz-turso-backup-')&&!dir.startsWith('/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/turso-verified-'))throw new Error('Only a recorded private backup directory is allowed.');
  const manifest=JSON.parse(readFileSync(resolve(dir,'manifest.json')));for(const name of ['snapshot.json','reverse-export.json','restored.sqlite'])assert.equal(hash(readFileSync(resolve(dir,name))),manifest.files[name]);
  const data=JSON.parse(readFileSync(resolve(dir,'snapshot.json')));
  let localMedia;
  if(manifest.files['local-media.json']){
    assert.equal(hash(readFileSync(resolve(dir,'local-media.json'))),manifest.files['local-media.json']);localMedia=verifyLocalMediaBackup(dir,data);
  }else{
    assert.equal(localMediaReferences(data).length,0,'Legacy backup is missing referenced local media.');
    localMedia={scope:'isolated-local-media-only',objects:0,totalBytes:0,legacyManifest:true,productionR2Included:false,migrationInlineIncluded:false};
  }
  let sourceMedia;
  if(manifest.files['source-media.json']){
    assert.equal(hash(readFileSync(resolve(dir,'source-media.json'))),manifest.files['source-media.json']);sourceMedia=verifySourceMediaBackup(dir,data);
  }
  return {dir,manifest,data,localMedia,sourceMedia};
}
function recordedMediaStore(data){
  if(!localMediaReferences(data).length)return null;
  const root=fileURLToPath(new URL('../',import.meta.url));
  const ledger=JSON.parse(readFileSync(resolve(root,'rollback/turso-local-media.json'),'utf8'));
  assert.equal(ledger.testOnly,true);return localMediaStore(ledger.directory);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(['--create','--create-with-stage-media'].includes(process.argv[2])){
      const db=new TursoStudyClient(credentials()),data=await snapshot(db),dir=mkdtempSync('/private/tmp/english-quiz-turso-backup-');
      const raw=Buffer.from(canonical(data));writeFileSync(resolve(dir,'snapshot.json'),raw,{mode:0o600});
      const sqlite=restore(data,resolve(dir,'restored.sqlite'));
      const exported=await reverse(sqlite);auditReverse(sqlite,exported);
      const compatibility=Buffer.from(canonical(exported));writeFileSync(resolve(dir,'reverse-export.json'),compatibility,{mode:0o600});sqlite.close();chmodSync(resolve(dir,'restored.sqlite'),0o600);
      const store=process.argv[2]==='--create-with-stage-media'?await stageMediaArchiveStore(data):recordedMediaStore(data);
      const localMedia=writeLocalMediaBackup(dir,data,store);
      const manifest={version:1,status:'verified-offline-restore',testOnly:true,files:{'snapshot.json':hash(raw),'reverse-export.json':hash(compatibility),'restored.sqlite':hash(readFileSync(resolve(dir,'restored.sqlite'))),'local-media.json':hash(readFileSync(resolve(dir,'local-media.json')))},
        counts:Object.fromEntries(Object.entries(data.tables).map(([k,v])=>[k,v.length])),localMedia,cutoverAllowed:false};
      writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
      console.log(JSON.stringify({backup:dir,status:manifest.status,tables:Object.keys(data.tables).length,localMedia,reverseExport:'review required',cutoverAllowed:false}));
    }else if(process.argv[2]==='--verify'){
      const {data,localMedia,sourceMedia}=verifiedBackup(process.argv[3]);restore(data).close();console.log(JSON.stringify({status:'verified-offline-restore',localMedia,sourceMedia,productionChanged:false,cutoverAllowed:false}));
    }else if(process.argv[2]==='--with-source-media'){
      const original=verifiedBackup(process.argv[3]);assert.ok(!original.sourceMedia,'This backup already includes source media.');
      restore(original.data).close();const dir=mkdtempSync('/private/tmp/english-quiz-turso-backup-');
      const files={};for(const name of ['snapshot.json','restored.sqlite','reverse-export.json']){
        const bytes=readFileSync(resolve(original.dir,name));assert.equal(hash(bytes),original.manifest.files[name]);writeFileSync(resolve(dir,name),bytes,{flag:'wx',mode:0o600});files[name]=hash(bytes);}
      const localMedia=writeLocalMediaBackup(dir,original.data,original.manifest.files['local-media.json']?localMediaArchiveStore(original.dir,original.data):null);
      const reader=cloudflareMediaReader(),sourceMedia=await writeSourceMediaBackup(dir,original.data,defaultSnapshot,reader);
      files['local-media.json']=hash(readFileSync(resolve(dir,'local-media.json')));files['source-media.json']=hash(readFileSync(resolve(dir,'source-media.json')));
      const manifest={...original.manifest,files,localMedia,sourceMedia,parentSnapshotSha256:original.manifest.files['snapshot.json'],cutoverAllowed:false};
      writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});verifiedBackup(dir);
      console.log(JSON.stringify({backup:dir,localMedia,sourceMedia,r2GetRequests:reader.requests,d1Requests:0,originalBackupChanged:false,productionChanged:false,cutoverAllowed:false}));
    }else if(process.argv[2]==='--with-source-archive'){
      // Reuse verified frozen binaries without re-reading production R2.
      const original=verifiedBackup(process.argv[3]),source=verifiedBackup(process.argv[4]);
      assert.ok(!original.sourceMedia&&source.sourceMedia,'Need a new snapshot and verified source archive.');
      verifySourceMediaBackup(source.dir,original.data);restore(original.data).close();
      const dir=mkdtempSync('/private/tmp/english-quiz-turso-backup-'),files={};
      for(const name of ['snapshot.json','restored.sqlite','reverse-export.json']){
        const bytes=readFileSync(resolve(original.dir,name));assert.equal(hash(bytes),original.manifest.files[name]);
        writeFileSync(resolve(dir,name),bytes,{flag:'wx',mode:0o600});files[name]=hash(bytes);
      }
      const localMedia=writeLocalMediaBackup(dir,original.data,localMediaArchiveStore(original.dir,original.data));
      files['local-media.json']=hash(readFileSync(resolve(dir,'local-media.json')));
      const raw=readFileSync(resolve(source.dir,'source-media.json'));assert.equal(hash(raw),source.manifest.files['source-media.json']);
      writeFileSync(resolve(dir,'source-media.json'),raw,{flag:'wx',mode:0o600});files['source-media.json']=hash(raw);
      mkdirSync(resolve(dir,'source-media'),{mode:0o700});
      for(const entry of JSON.parse(raw).objects){
        assert.match(entry.file,/^[a-f0-9]{64}\.bin$/);
        const bytes=readFileSync(resolve(source.dir,'source-media',entry.file));assert.equal(hash(bytes),entry.sha256);
        writeFileSync(resolve(dir,'source-media',entry.file),bytes,{flag:'wx',mode:0o600});
      }
      const sourceMedia=verifySourceMediaBackup(dir,original.data),manifest={...original.manifest,files,localMedia,sourceMedia,
        frozenSourceArchiveSha256:source.manifest.files['source-media.json'],cutoverAllowed:false};
      writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});verifiedBackup(dir);
      console.log(JSON.stringify({backup:dir,localMedia,sourceMedia,networkRequests:0,originalBackupsChanged:false,cutoverAllowed:false}));
    }else if(process.argv[2]==='--restore-source-media'){
      const {dir,data,sourceMedia}=verifiedBackup(process.argv[3]);assert.ok(sourceMedia,'This backup has no source media archive.');console.log(JSON.stringify(restoreSourceMediaBackup(dir,data)));
    }else if(process.argv[2]==='--persist'){
      const original=verifiedBackup(process.argv[3]);restore(original.data).close();
      const dir=mkdtempSync('/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/turso-verified-');
      for(const name of Object.keys(original.manifest.files)){
        assert.ok(['snapshot.json','restored.sqlite','reverse-export.json','local-media.json','source-media.json'].includes(name));
        const bytes=readFileSync(resolve(original.dir,name));assert.equal(hash(bytes),original.manifest.files[name]);writeFileSync(resolve(dir,name),bytes,{flag:'wx',mode:0o600});}
      for(const [name,index] of [['local-media','local-media.json'],['source-media','source-media.json']])if(original.manifest.files[index]){
        mkdirSync(resolve(dir,name),{mode:0o700});const content=JSON.parse(readFileSync(resolve(original.dir,index)));
        for(const entry of content.objects)for(const field of name==='local-media'?['file','journal']:['file']){
          const file=entry[field];assert.match(file,/^[a-f0-9]{64}\.(bin|json)$/);
          writeFileSync(resolve(dir,name,file),readFileSync(resolve(original.dir,name,file)),{flag:'wx',mode:0o600});}
      }
      writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(original.manifest,null,2),{flag:'wx',mode:0o600});verifiedBackup(dir);
      console.log(JSON.stringify({backup:dir,status:'verified-private-persistent-copy',sourceMedia:original.sourceMedia,originalBackupChanged:false,networkRequests:0,cutoverAllowed:false}));
    }else if(process.argv[2]==='--restore-local-media'){
      const {dir,data,manifest}=verifiedBackup(process.argv[3]);
      assert.ok(manifest.files['local-media.json'],'This older backup has no local media archive.');
      console.log(JSON.stringify(await restoreLocalMediaBackup(dir,data)));
    }else if(process.argv[2]==='--review'){
      const {data,manifest}=verifiedBackup(process.argv[3]),sqlite=restore(data);
      try{const exported=await reverse(sqlite),review=auditReverse(sqlite,exported),dir=mkdtempSync('/private/tmp/english-quiz-turso-review-');
        writeFileSync(resolve(dir,'reverse-export.json'),canonical(exported),{mode:0o600});
        writeFileSync(resolve(dir,'review.json'),JSON.stringify({...review,sourceSnapshotSha256:manifest.files['snapshot.json'],exportSha256:hash(readFileSync(resolve(dir,'reverse-export.json')))},null,2),{mode:0o600});
        console.log(JSON.stringify({...review,reviewDirectory:dir}));
      }finally{sqlite.close();}
    }else throw new Error('Use --create, --verify, --review, --with-source-media, --persist, --restore-source-media or --restore-local-media <private backup directory>');
  }catch(error){console.error('Backup failed:',error.message);process.exitCode=1;}
}
