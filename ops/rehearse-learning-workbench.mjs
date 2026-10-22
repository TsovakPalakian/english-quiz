// Explicit local SQLite source only. All writes go into a newly created temporary directory.
import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,mkdtempSync,chmodSync,writeFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {workbenchUpgradePlan} from './learning-workbench-migration-plan.mjs';
import {learningWorkbenchReadiness} from '../src/learning-workbench-schema.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const quoted=name=>'"'+name.replaceAll('"','""')+'"';
function fingerprint(db,names,columns){
  const entries=names.map(name=>{
    const rows=[];for(const row of db.prepare('SELECT '+(columns?columns.get(name).map(quoted).join(','):'*')+' FROM '+quoted(name)).iterate()){
      if(rows.length>=100000)throw Error('Local rehearsal row limit exceeded.');rows.push(JSON.stringify(row));
    }
    return {name,count:rows.length,sha256:hash(rows.sort().join('\n'))};
  });
  return hash(JSON.stringify(entries));
}
export async function rehearseWorkbench(sourcePath,{applied=[]}={}){
  if(typeof sourcePath!=='string'||!sourcePath||!statSync(sourcePath).isFile())throw Error('Choose an existing local SQLite file explicitly.');
  const source=new DatabaseSync(resolve(sourcePath),{readOnly:true});let baseline,copy,restored,complete=false;
  const directory=mkdtempSync(join(tmpdir(),'lumiscia-workbench-rehearsal-'));chmodSync(directory,0o700);
  try{
    const originalSchema=source.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const plan=workbenchUpgradePlan(applied),existing=originalSchema.some(row=>row.name.startsWith('qr_'));
    if(existing!==plan.incremental)throw Error('Existing workbench schema requires an explicitly reviewed checksum baseline/upgrade plan.');
    const names=originalSchema.filter(row=>row.type==='table').map(row=>row.name),columns=new Map(names.map(name=>[name,source.prepare('PRAGMA table_info('+quoted(name)+')').all().map(column=>column.name)]));
    const before=fingerprint(source,names,columns),legacySchema=originalSchema.filter(row=>!row.name.startsWith('qr_')),schemaHash=hash(JSON.stringify(legacySchema));
    const baselinePath=join(directory,'baseline.sqlite'),candidatePath=join(directory,'candidate.sqlite'),restoredPath=join(directory,'restored.sqlite');
    await backup(source,baselinePath);chmodSync(baselinePath,0o600);baseline=new DatabaseSync(baselinePath,{readOnly:true});
    if(fingerprint(baseline,names,columns)!==before)throw Error('Source changed during backup.');
    await backup(baseline,candidatePath);chmodSync(candidatePath,0o600);copy=new DatabaseSync(candidatePath);copy.exec('PRAGMA foreign_keys=ON');
    // SQLite parent-table rebuilds need FK enforcement off before BEGIN, not merely deferred.
    copy.exec('PRAGMA foreign_keys=OFF');copy.exec('BEGIN IMMEDIATE');
    try{for(const step of plan.steps){const sql=readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url));if(hash(sql)!==step.sha256)throw Error('Migration checksum changed.');copy.exec(sql.toString());}if(copy.prepare('PRAGMA foreign_key_check').all().length)throw Error('Migrated clone has invalid foreign keys.');copy.exec('COMMIT');copy.exec('PRAGMA foreign_keys=ON');}
    catch(error){copy.exec('ROLLBACK');throw error;}
    const readiness=await learningWorkbenchReadiness({read:async(sql,args=[])=>copy.prepare(sql).all(...args)});
    if(!readiness.ready||fingerprint(copy,names,columns)!==before||copy.prepare('PRAGMA foreign_key_check').all().length||copy.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Migrated clone failed readiness/integrity or changed original rows.');
    const retained=copy.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().filter(row=>legacySchema.some(old=>old.type===row.type&&old.name===row.name));
    if(hash(JSON.stringify(retained))!==schemaHash)throw Error('A migration changed the legacy schema.');
    await backup(baseline,restoredPath);chmodSync(restoredPath,0o600);restored=new DatabaseSync(restoredPath,{readOnly:true});
    if(fingerprint(restored,names,columns)!==before||fingerprint(source,names,columns)!==before)throw Error('Restore or read-only source verification failed.');
    const result={localOnly:true,sourceModified:false,productionApproved:false,directory,migrations:plan.steps,legacyRowsUnchanged:true,legacySchemaUnchanged:true,backupRestoreVerified:true,readiness,
      disable:{flags:['LEARNING_WORKBENCH_ENABLED','LEARNING_WORKBENCH_WRITES'],preserveTablesAndObjects:true,verifiedBy:'test/test-learning-workbench.mjs'},
      baseline:plan.baseline,incremental:plan.incremental,limitations:['No real D1/R2 or cloud rollback was exercised.','The supplied baseline is a human-reviewed assertion, not inferred migration history.','Temporary clones may contain private data; keep private and remove after review.']};
    writeFileSync(join(directory,'report.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});complete=true;return result;
  }finally{restored?.close();copy?.close();baseline?.close();source.close();if(!complete)rmSync(directory,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);if(![2,4].includes(args.length)||args[0]!=='--source'||args.length===4&&args[2]!=='--baseline-manifest')throw Error('Usage: node ops/rehearse-learning-workbench.mjs --source <explicit-local.sqlite> [--baseline-manifest <reviewed-checksums.json>]');
  let applied=[];if(args.length===4){if(statSync(args[3]).size>20000)throw Error('Baseline manifest exceeds bounds.');applied=JSON.parse(readFileSync(args[3],'utf8'));}
  console.log(JSON.stringify(await rehearseWorkbench(args[1],{applied})));
}
