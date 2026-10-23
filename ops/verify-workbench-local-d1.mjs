// Local workerd D1 only: parameter bindings avoid export statement-length limits.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {localD1TableOrder} from './rehearse-workbench-d1-export.mjs';
import {workbenchBootstrap} from './prepare-workbench-bootstrap.mjs';
import {learningWorkbenchReadiness} from '../src/learning-workbench-schema.mjs';
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function rowFingerprintSQL(db,name){
  const columns=db.prepare('PRAGMA table_info('+quote(name)+')').all().map(row=>row.name);
  return 'SELECT json_array('+columns.map(name=>{const col=quote(name);return "CASE typeof("+col+") WHEN 'blob' THEN 'blob:'||hex("+col+") WHEN 'text' THEN 'text:'||hex("+col+") WHEN 'integer' THEN 'integer:'||CAST("+col+" AS TEXT) WHEN 'real' THEN 'real:'||printf('%!.17g',"+col+") ELSE 'null' END";}).join(',')+') AS value FROM '+quote(name);
}
const digest=rows=>hash(rows.map(row=>row.value).sort().join('\n'));
export async function verifyLocalD1({source,directory,Miniflare,splitSQL}={}){
  if(typeof Miniflare!=='function'||typeof splitSQL!=='function')throw Error('Explicit local Miniflare and Wrangler SQL parser dependencies are required.');
  mkdirSync(directory,{mode:0o700});const baseline=new DatabaseSync(resolve(source),{readOnly:true}),pack=workbenchBootstrap();let mf;
  try{
    const schema=baseline.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name").all();if(schema.some(row=>row.name.startsWith('qr_')))throw Error('Fresh D1 verification requires a baseline without workbench tables.');
    mf=new Miniflare({host:'127.0.0.1',cf:false,logRequests:false,telemetry:{enabled:false},resourcePersistencePath:resolve(directory,'state'),workers:[{config:{name:'workbench-copy',compatibilityDate:'2026-08-01',manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:'export default {fetch(){return new Response("Local D1 verification only.")}}'}}},env:{STUDY_DB:{type:'d1',id:randomUUID(),dev:{remote:false}}}}}]});
    const db=await mf.getD1Database('STUDY_DB'),read=async(sql,args=[])=>(await db.prepare(sql).bind(...args).all()).results;
    for(const type of ['table','index'])for(const row of schema.filter(row=>row.type===type))await db.prepare(row.sql).run();
    let batch=[],bytes=0,rows=0;const flush=async()=>{if(batch.length){const result=await db.batch(batch);if(result.some(row=>!row.success))throw Error('Local D1 import failed.');batch=[];bytes=0;}};
    for(const {name} of localD1TableOrder(baseline)){
      const statement=baseline.prepare('SELECT * FROM '+quote(name));statement.setReadBigInts(true);
      for(const row of statement.iterate()){
        const columns=Object.keys(row),values=columns.map(key=>{const value=row[key];if(typeof value!=='bigint')return value;const number=Number(value);if(!Number.isSafeInteger(number))throw Error('D1 binding would lose integer precision.');return number;}),size=values.reduce((sum,value)=>sum+(typeof value==='string'?Buffer.byteLength(value):value?.byteLength||8),0);
        if(batch.length>=50||bytes+size>1024*1024)await flush();
        batch.push(db.prepare('INSERT INTO '+quote(name)+'('+columns.map(quote).join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').bind(...values));bytes+=size;rows++;
      }
    }
    await flush();
    for(const type of ['view','trigger'])for(const row of schema.filter(row=>row.type===type))await db.prepare(row.sql).run();
    const verifyRows=async()=>{for(const row of schema.filter(row=>row.type==='table')){const sql=rowFingerprintSQL(baseline,row.name);if(digest(baseline.prepare(sql).all())!==digest(await read(sql)))throw Error('Local D1 changed source rows.');}};
    await verifyRows();
    // Use Wrangler's parser, including trigger bodies and quoted semicolons.
    const statements=splitSQL(pack.sql);if(!Array.isArray(statements)||!statements.length||statements.some(sql=>typeof sql!=='string'||!sql.trim()))throw Error('Invalid bootstrap SQL parse.');
    const applied=await db.batch(statements.map(sql=>db.prepare(sql)));if(applied.some(row=>!row.success))throw Error('Local D1 bootstrap failed.');
    await verifyRows();
    const retained=await read("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB 'qr_*' AND sql IS NOT NULL ORDER BY type,name");
    for(const old of schema){const current=retained.find(row=>row.name===old.name&&row.type===old.type);if(!current||current.sql!==old.sql)throw Error('Local D1 changed legacy schema.');}
    const readiness=await learningWorkbenchReadiness({read});if(!readiness.ready||(await read('PRAGMA foreign_key_check')).length)throw Error('Local D1 migration failed readiness/integrity.');
    await mf.dispose();mf=null;
    const report={kind:'local-workerd-d1-rehearsal',legacyTables:schema.filter(row=>row.type==='table').length,legacyRows:rows,parameterizedImport:true,legacyRowsUnchanged:true,legacySchemaUnchanged:true,readiness,bootstrapSha256:pack.manifest.sqlSha256,remoteD1MigrationVerified:false,cloudWritesPerformed:false,productionApproved:false};
    writeFileSync(join(directory,'verification.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return report;
  }finally{await mf?.dispose();baseline.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);if(args.length!==6||args[0]!=='--source'||args[2]!=='--out'||args[4]!=='--miniflare')throw Error('Usage: node ops/verify-workbench-local-d1.mjs --source <baseline.sqlite> --out <new-private-directory> --miniflare <installed-package-directory>');
  process.umask(0o077);const require=createRequire(resolve(args[5],'package.json')),{Miniflare}=require(resolve(args[5])),{unstable_splitSqlQuery:splitSQL}=require(resolve(args[5],'../wrangler'));
  try{console.log(JSON.stringify(await verifyLocalD1({source:args[1],directory:args[3],Miniflare,splitSQL})));}catch{console.error('Local D1 rehearsal failed. Production was not modified.');process.exitCode=1;}
}
