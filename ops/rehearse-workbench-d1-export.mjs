// Offline restoration of an explicit D1 SQL export. No network or production writes.
import {DatabaseSync,backup,constants} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,chmodSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {workbenchBootstrap} from './prepare-workbench-bootstrap.mjs';
import {learningWorkbenchReadiness} from '../src/learning-workbench-schema.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const canonical=value=>JSON.stringify(value,(_,item)=>typeof item==='bigint'?{$integer:item.toString()}:item instanceof Uint8Array?{$blob:Buffer.from(item).toString('hex')}:item);
function inspect(db){
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name").all(),tables=[];
  for(const {name} of schema.filter(row=>row.type==='table')){
    const rows=[],statement=db.prepare('SELECT * FROM '+quote(name));statement.setReadBigInts(true);for(const row of statement.iterate()){
      if(rows.length>=250000)throw Error('Rehearsal table row limit exceeded.');rows.push(canonical(row));
    }
    tables.push({name,count:rows.length,sha256:hash(rows.sort().join('\n'))});
  }
  return {schema,tables};
}
const integrity=db=>{if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup integrity or foreign keys failed.');};
const same=(before,after)=>{if(canonical(before)!==canonical(after))throw Error('Backup restore changed schema or rows.');};
const literal=value=>{
  if(value===null)return 'NULL';if(typeof value==='bigint')return value.toString();
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  if(value instanceof Uint8Array)return "X'"+Buffer.from(value).toString('hex')+"'";
  if(typeof value==='string')return value.includes('\0')?"CAST(X'"+Buffer.from(value).toString('hex')+"' AS TEXT)":"'"+value.replaceAll("'","''")+"'";
  throw Error('Unsupported backup value.');
};
// D1 export order is not always importable with enforced FKs. Generate a local-only
// schema-first restore with parent rows before children and triggers after data.
export function localD1TableOrder(db){
  const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all(),pending=new Map(tables.map(row=>[row.name,row])),order=[];
  while(pending.size){
    const ready=[...pending.values()].filter(row=>db.prepare('PRAGMA foreign_key_list('+quote(row.name)+')').all().every(ref=>ref.table===row.name||!pending.has(ref.table)));
    if(!ready.length)throw Error('Cyclic table dependencies require a reviewed restore strategy.');
    for(const row of ready){order.push(row);pending.delete(row.name);}
  }
  return order;
}
export function localD1RestoreSQL(db){
  const {schema}=inspect(db),tables=schema.filter(row=>row.type==='table'),order=localD1TableOrder(db);
  const parts=['PRAGMA defer_foreign_keys=ON;',...tables.map(row=>row.sql+';'),...schema.filter(row=>row.type==='index').map(row=>row.sql+';')];
  for(const {name} of order){
    const statement=db.prepare('SELECT * FROM '+quote(name));statement.setReadBigInts(true);
    for(const row of statement.iterate()){const columns=Object.keys(row);parts.push('INSERT INTO '+quote(name)+'('+columns.map(quote).join(',')+') VALUES('+columns.map(key=>literal(row[key])).join(',')+');');}
  }
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").get()){
    parts.push('DELETE FROM sqlite_sequence;');const sequence=db.prepare('SELECT name,seq FROM sqlite_sequence');sequence.setReadBigInts(true);
    for(const row of sequence.iterate())parts.push('INSERT INTO sqlite_sequence(name,seq) VALUES('+literal(row.name)+','+literal(row.seq)+');');
  }
  parts.push(...schema.filter(row=>['view','trigger'].includes(row.type)).map(row=>row.sql+';'));
  const sql=parts.join('\n')+'\n';if(Buffer.byteLength(sql)>128*1024*1024)throw Error('Local restore SQL exceeds bounds.');return sql;
}
export function restrictExportImport(db){
  if(typeof db.setAuthorizer!=='function')throw Error('SQLite authorizer support is required.');
  db.setAuthorizer((action,first,second)=>{
    if([constants.SQLITE_ATTACH,constants.SQLITE_DETACH].includes(action))return constants.SQLITE_DENY;
    if(action===constants.SQLITE_PRAGMA&&!['defer_foreign_keys','foreign_keys'].includes(String(first).toLowerCase()))return constants.SQLITE_DENY;
    if(action===constants.SQLITE_FUNCTION&&['load_extension','readfile','writefile'].includes(String(second||first).toLowerCase()))return constants.SQLITE_DENY;
    return constants.SQLITE_OK;
  });
}
export async function rehearseD1Export(sourcePath,directory){
  if(typeof sourcePath!=='string'||typeof directory!=='string'||!statSync(sourcePath).isFile()||statSync(sourcePath).size>128*1024*1024)throw Error('An explicit bounded local D1 SQL export is required.');
  const source=readFileSync(sourcePath),sourceSha256=hash(source),pack=workbenchBootstrap();mkdirSync(directory,{mode:0o700});
  const path=name=>join(directory,name),write=(name,value)=>writeFileSync(path(name),value,{flag:'wx',mode:0o600});
  let baseline,candidate,restored,migratedRestore;
  try{
    baseline=new DatabaseSync(path('baseline.sqlite'));chmodSync(path('baseline.sqlite'),0o600);
    // D1 dumps may insert child rows before their parent tables exist.
    baseline.exec('PRAGMA foreign_keys=OFF');restrictExportImport(baseline);baseline.exec(source.toString('utf8'));if(baseline.isTransaction)throw Error('Export left an open transaction.');baseline.setAuthorizer(null);baseline.exec('PRAGMA foreign_keys=ON');integrity(baseline);
    const before=inspect(baseline);if(before.schema.some(row=>row.name.startsWith('qr_')))throw Error('This fresh rehearsal refuses existing workbench tables. Use a reviewed upgrade baseline.');
    write('bootstrap.sql',pack.sql);write('bootstrap-manifest.json',JSON.stringify(pack.manifest,null,2)+'\n');write('local-d1-restore.sql',localD1RestoreSQL(baseline));
    await backup(baseline,path('candidate.sqlite'));chmodSync(path('candidate.sqlite'),0o600);candidate=new DatabaseSync(path('candidate.sqlite'));candidate.exec('PRAGMA foreign_keys=ON;BEGIN IMMEDIATE');
    try{candidate.exec(pack.sql);integrity(candidate);candidate.exec('COMMIT');}catch(error){if(candidate.isTransaction)candidate.exec('ROLLBACK');throw error;}
    const migrated=inspect(candidate);same(before,{schema:migrated.schema.filter(row=>!row.name.startsWith('qr_')),tables:migrated.tables.filter(row=>!row.name.startsWith('qr_'))});
    const readiness=await learningWorkbenchReadiness({read:async(sql,args=[])=>candidate.prepare(sql).all(...args)});if(!readiness.ready)throw Error('Migrated backup failed readiness.');
    await backup(baseline,path('restored.sqlite'));chmodSync(path('restored.sqlite'),0o600);restored=new DatabaseSync(path('restored.sqlite'),{readOnly:true});integrity(restored);same(before,inspect(restored));
    await backup(candidate,path('migrated-restored.sqlite'));chmodSync(path('migrated-restored.sqlite'),0o600);migratedRestore=new DatabaseSync(path('migrated-restored.sqlite'),{readOnly:true});integrity(migratedRestore);same(migrated,inspect(migratedRestore));
    if(hash(readFileSync(sourcePath))!==sourceSha256)throw Error('Source export changed during verification.');
    const result={version:1,kind:'offline-d1-export-rehearsal',directory:resolve(directory),sourceSha256,sourceBytes:source.length,legacyTables:before.tables.length,legacyRows:before.tables.reduce((sum,row)=>sum+row.count,0),legacySchemaUnchanged:true,legacyRowsUnchanged:true,baselineRestoreVerified:true,migratedRestoreVerified:true,readiness,bootstrapSha256:pack.manifest.sqlSha256,tables:migrated.tables,remoteD1MigrationVerified:false,productionApproved:false,sourceModified:false,cloudWritesPerformed:false};
    write('verification.json',JSON.stringify(result,null,2)+'\n');return result;
  }finally{migratedRestore?.close();restored?.close();candidate?.close();baseline?.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--source'||args[2]!=='--out')throw Error('Usage: node ops/rehearse-workbench-d1-export.mjs --source <private-export.sql> --out <new-private-directory>');
  try{const {tables,...summary}=await rehearseD1Export(args[1],args[3]);console.log(JSON.stringify(summary));}
  catch{console.error('Offline D1 export rehearsal failed. Source and production were not modified; inspect private artifacts locally.');process.exitCode=1;}
}
