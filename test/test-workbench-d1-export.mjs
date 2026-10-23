import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {rehearseD1Export,localD1RestoreSQL,restrictExportImport} from '../ops/rehearse-workbench-d1-export.mjs';
import {rowFingerprintSQL,verifyLocalD1} from '../ops/verify-workbench-local-d1.mjs';
function source(){
  const db=new DatabaseSync(':memory:');applyLearningSchema(db);
  db.exec('CREATE TABLE backup_parent(id INTEGER PRIMARY KEY);CREATE TABLE backup_child(id INTEGER PRIMARY KEY,parent_id INTEGER REFERENCES backup_parent(id),value TEXT,payload BLOB,large INTEGER);INSERT INTO backup_parent VALUES(1)');
  db.prepare('INSERT INTO backup_child VALUES(1,1,?,?,?)').run("quote'; semicolon; null\0and текст",new Uint8Array([0,1,255]),9007199254740993n);
  return db;
}
test('schema-first local D1 restore preserves binary, NUL, quotes and large integers with enforced FKs',()=>{
  const db=source(),restored=new DatabaseSync(':memory:');try{
    const sql=localD1RestoreSQL(db);assert.ok(sql.indexOf('CREATE TABLE backup_parent')<sql.indexOf('INSERT INTO "backup_child"'));assert.ok(sql.indexOf('INSERT INTO "backup_parent"')<sql.indexOf('INSERT INTO "backup_child"'));
    restored.exec('PRAGMA foreign_keys=ON;BEGIN');restored.exec(sql);restored.exec('COMMIT');
    const rows=database=>{const statement=database.prepare('SELECT * FROM backup_child');statement.setReadBigInts(true);return statement.all();};
    assert.deepEqual(rows(restored),rows(db));assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{restored.close();db.close();}
});
test('offline export rehearsal preserves source, legacy data, both restores and private artifacts',async()=>{
  const db=source(),parent=mkdtempSync(join(tmpdir(),'workbench-d1-export-'));try{
    const path=join(parent,'source.sql'),sql=localD1RestoreSQL(db);writeFileSync(path,sql,{mode:0o600});
    const result=await rehearseD1Export(path,join(parent,'verified'));
    assert.equal(result.legacyRowsUnchanged,true);assert.equal(result.legacySchemaUnchanged,true);assert.equal(result.baselineRestoreVerified,true);assert.equal(result.migratedRestoreVerified,true);assert.equal(result.readiness.ready,true);assert.equal(result.remoteD1MigrationVerified,false);assert.equal(result.cloudWritesPerformed,false);assert.equal(readFileSync(path,'utf8'),sql);
    for(const file of ['baseline.sqlite','candidate.sqlite','restored.sqlite','migrated-restored.sqlite','bootstrap.sql','bootstrap-manifest.json','local-d1-restore.sql','verification.json'])assert.equal(statSync(join(parent,'verified',file)).mode&0o777,0o600);
    await assert.rejects(rehearseD1Export(path,join(parent,'verified')));
  }finally{db.close();rmSync(parent,{recursive:true,force:true});}
});
test('D1 child-before-parent dumps restore offline and generate a valid parent-first local import',async()=>{
  const db=source(),parent=mkdtempSync(join(tmpdir(),'workbench-d1-order-'));try{
    db.exec('DROP TABLE backup_child;DROP TABLE backup_parent');
    const sql='PRAGMA defer_foreign_keys=ON;CREATE TABLE early_child(id INTEGER REFERENCES late_parent(id));INSERT INTO early_child VALUES(1);CREATE TABLE late_parent(id INTEGER PRIMARY KEY);INSERT INTO late_parent VALUES(1);'+localD1RestoreSQL(db);
    const path=join(parent,'source.sql');writeFileSync(path,sql,{mode:0o600});const result=await rehearseD1Export(path,join(parent,'verified'));assert.equal(result.readiness.ready,true);
    const restored=new DatabaseSync(':memory:');try{restored.exec('PRAGMA foreign_keys=ON;BEGIN');restored.exec(readFileSync(join(parent,'verified','local-d1-restore.sql'),'utf8'));restored.exec('COMMIT');assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);}finally{restored.close();}
  }finally{db.close();rmSync(parent,{recursive:true,force:true});}
});
test('export import authorizer denies external attachments and unsafe pragmas',()=>{
  const db=new DatabaseSync(':memory:');try{restrictExportImport(db);assert.throws(()=>db.exec("ATTACH ':memory:' AS external"),/not authorized/);assert.throws(()=>db.exec('PRAGMA writable_schema=ON'),/not authorized/);db.exec('PRAGMA defer_foreign_keys=ON;CREATE TABLE sample(id INTEGER)');}finally{db.close();}
});
test('local import refuses cyclic dependencies rather than silently disabling D1 constraints',()=>{
  const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE a(id INTEGER PRIMARY KEY,b_id INTEGER REFERENCES b(id));CREATE TABLE b(id INTEGER PRIMARY KEY,a_id INTEGER REFERENCES a(id))');assert.throws(()=>localD1RestoreSQL(db),/Cyclic/);}finally{db.close();}
});
test('D1 comparison fingerprints preserve storage types and embedded NUL bytes without unsafe JSON integer conversion',()=>{
  const db=source();try{
    const row=db.prepare(rowFingerprintSQL(db,'backup_child')).get(),values=JSON.parse(row.value);
    assert.equal(values.at(-1),'integer:9007199254740993');assert.equal(values[3],'blob:0001FF');assert.ok(values[2].includes('00'));
    const before=row.value;db.prepare('UPDATE backup_child SET value=?').run('quote');assert.notEqual(db.prepare(rowFingerprintSQL(db,'backup_child')).get().value,before);
  }finally{db.close();}
});
test('invalid foreign keys stop rehearsal before a verified backup report is written',async()=>{
  const db=source(),parent=mkdtempSync(join(tmpdir(),'workbench-d1-invalid-'));try{
    db.exec('PRAGMA foreign_keys=OFF;DELETE FROM backup_parent');const path=join(parent,'invalid.sql'),sql=localD1RestoreSQL(db);writeFileSync(path,sql,{mode:0o600});
    await assert.rejects(rehearseD1Export(path,join(parent,'failed')),/integrity|foreign keys/);assert.throws(()=>statSync(join(parent,'failed','verification.json')));assert.equal(readFileSync(path,'utf8'),sql);
  }finally{db.close();rmSync(parent,{recursive:true,force:true});}
});
test('local emulator verification requires explicit runtime/parser dependencies before creating files',async()=>{
  await assert.rejects(verifyLocalD1({}),/Explicit local Miniflare/);
});
test('local emulator configuration is loopback-only, private, non-remote and telemetry-disabled',async()=>{
  const db=source(),parent=mkdtempSync(join(tmpdir(),'workbench-d1-config-'));let options;try{
    const path=join(parent,'source.sqlite'),target=new DatabaseSync(path);target.exec(localD1RestoreSQL(db));target.close();
    class Runtime{constructor(value){options=value;throw Error('Local test stop.');}}
    await assert.rejects(verifyLocalD1({source:path,directory:join(parent,'copy'),Miniflare:Runtime,splitSQL:()=>[]}),/Local test stop/);
    assert.equal(options.host,'127.0.0.1');assert.equal(options.cf,false);assert.equal(options.telemetry.enabled,false);assert.equal(options.workers[0].config.env.STUDY_DB.dev.remote,false);assert.equal(statSync(join(parent,'copy')).mode&0o777,0o700);
  }finally{db.close();rmSync(parent,{recursive:true,force:true});}
});
