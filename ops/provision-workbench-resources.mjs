import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {workbenchCloudControl,existingCloudToken} from './workbench-cloud-control.mjs';
import {localD1TableOrder,restrictExportImport} from './rehearse-workbench-d1-export.mjs';
import {rowFingerprintSQL} from './verify-workbench-local-d1.mjs';
import {workbenchBootstrap} from './prepare-workbench-bootstrap.mjs';
import {learningWorkbenchReadiness} from '../src/learning-workbench-schema.mjs';
const quote=name=>'"'+name.replaceAll('"','""')+'"',hash=value=>createHash('sha256').update(value).digest('hex');
const fingerprint=rows=>hash(rows.map(row=>row.value).sort().join('\n'));
export function mergedD1Insert(commands){
  const first=commands[0];
  if(!first||commands.some(row=>row.sql!==first.sql)||commands.reduce((sum,row)=>sum+row.params.length,0)>100)throw Error('Homogeneous bounded inserts required.');
  const split=first.sql.lastIndexOf(' VALUES(');
  if(split<0)throw Error('Generated INSERT required.');
  return {sql:first.sql.slice(0,split+7)+commands.map(()=>first.sql.slice(split+7)).join(','),params:commands.flatMap(row=>row.params)};
}
export async function provisionWorkbenchResources({source,directory,splitSQL,cloud}={}){
  if(typeof splitSQL!=='function'||!cloud)throw Error('Explicit operator dependencies required.');
  mkdirSync(directory,{mode:0o700});const db=new DatabaseSync(resolve(source),{readOnly:true});let temporary=null;
  const save=(name,value)=>writeFileSync(join(directory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  const stage=name=>save('progress.json',{stage:name,requests:cloud.usage(),updatedAt:new Date().toISOString()});
  try{
    stage('source-validation');
    const schema=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name").all(),tables=localD1TableOrder(db);
    const rows=tables.reduce((sum,row)=>sum+Number(db.prepare('SELECT count(*) AS n FROM '+quote(row.name)).get().n),0);if(rows>20000||schema.some(row=>row.name.startsWith('qr_')))throw Error('Rehearsal source exceeds reviewed scope.');
    stage('private-storage');
    const bucket='learn-english-workbench-private-media';if(!await cloud.scoped('/r2/buckets/'+bucket,{allow404:true}))await cloud.scoped('/r2/buckets',{method:'POST',body:{name:bucket}});
    await cloud.scoped('/r2/buckets/'+bucket+'/domains/managed',{method:'PUT',body:{enabled:false}});
    const managed=await cloud.scoped('/r2/buckets/'+bucket+'/domains/managed'),domains=await cloud.scoped('/r2/buckets/'+bucket+'/domains/custom');
    if(managed?.enabled!==false||!Array.isArray(domains?.domains)||domains.domains.some(row=>row.enabled!==false))throw Error('Bucket public access verification failed.');
    save('storage.json',{bucket,r2DevDisabled:true,publicCustomDomains:false,verifiedAt:new Date().toISOString()});
    try{
    stage('email-verification');
    const zones=await cloud.request('/zones?name=lumiscia.org');if(zones.length!==1)throw Error('Expected the existing project zone.');const zone=zones[0].id;
    // The installed inspector uses its separately verified HTTPS hostname;
    // provisioning the rehearsal does not require DNS mutation permissions.
    const addresses=await cloud.scoped('/email/routing/addresses'),rules=await cloud.request('/zones/'+zone+'/email/routing/rules');
    const route=rules.find(row=>row.enabled&&row.matchers?.some(match=>match.field==='to'&&match.value==='info@lumiscia.org'));
    if(!route)throw Error('Existing info mailbox routing is unavailable.');
    let recipient=addresses.find(row=>row.email==='info@lumiscia.org');
    if(!recipient){recipient=await cloud.scoped('/email/routing/addresses',{method:'POST',body:{email:'info@lumiscia.org'}});}
    save('email.json',{routingEnabled:true,recipientVerified:!!recipient?.verified,verificationRequested:!recipient?.verified,checkedAt:new Date().toISOString()});
    }catch(error){if(error.status!==403)throw error;save('zone-permissions.json',{requiresAdditionalPermissions:true,status:403,productionChanged:false});}
    temporary=await cloud.createRehearsal();save('rehearsal-owner.json',{id:temporary,temporary:true,sourceModified:false});
    const query=async(sql,params=[])=>{const result=await cloud.scoped('/d1/database/'+temporary+'/query',{method:'POST',body:{sql,params}});if(result.some(row=>row.success===false))throw Error('Remote rehearsal query failed.');return result.flatMap(row=>row.results||[]);};
    // REST query accepts one SQL statement. Combine homogeneous inserts within
    // D1's 100-parameter limit, keeping large values bound rather than SQL literals.
    const batch=async commands=>{
      if(!commands.length)return;
      let group=[];
      const flush=async()=>{if(!group.length)return;if(group.length===1){await query(group[0].sql,group[0].params);}else{const merged=mergedD1Insert(group);await query(merged.sql,merged.params);}group=[];};
      for(const command of commands){if(group.length&&(command.sql!==group[0].sql||(group.length+1)*command.params.length>100))await flush();group.push(command);}await flush();
    };
    stage('legacy-schema');
    for(const type of ['table','index'])await batch(schema.filter(row=>row.type===type).map(row=>({sql:row.sql,params:[]})));
    for(const {name} of tables){
      stage('legacy-import-'+tables.findIndex(row=>row.name===name));
      let commands=[],bytes=0;const statement=db.prepare('SELECT * FROM '+quote(name));statement.setReadBigInts(true);
      for(const row of statement.iterate()){
        const columns=Object.keys(row),params=columns.map(key=>{const value=row[key];if(typeof value==='bigint'){const number=Number(value);if(!Number.isSafeInteger(number))throw Error('Unsafe D1 integer.');return number;}if(value instanceof Uint8Array)return [...value];return value;}),size=Buffer.byteLength(JSON.stringify(params));
        if(commands.length>=100||bytes+size>1024*1024){await batch(commands);commands=[];bytes=0;}
        commands.push({sql:'INSERT INTO '+quote(name)+'('+columns.map(quote).join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',params});bytes+=size;
      }
      await batch(commands);
    }
    for(const type of ['view','trigger'])await batch(schema.filter(row=>row.type===type).map(row=>({sql:row.sql,params:[]})));
    const verify=async()=>{
      for(const {name} of tables){const sql=rowFingerprintSQL(db,name),expected=db.prepare(sql).all(),actual=[];for(let offset=0;offset<expected.length;offset+=200)actual.push(...await query(sql+' LIMIT 200 OFFSET '+offset));if(fingerprint(expected)!==fingerprint(actual))throw Error('Remote D1 rehearsal changed source rows.');}
      if((await query('PRAGMA foreign_key_check')).length)throw Error('Remote D1 foreign keys failed.');
    };
    stage('legacy-verification');await verify();const pack=workbenchBootstrap();stage('bootstrap');await batch(splitSQL(pack.sql).map(sql=>({sql,params:[]})));stage('post-migration-verification');await verify();
    const retained=await query("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB 'qr_*' AND sql IS NOT NULL ORDER BY type,name");
    for(const row of schema)if(!retained.some(value=>value.type===row.type&&value.name===row.name&&value.sql===row.sql))throw Error('Remote D1 changed legacy schema.');
    const readiness=await learningWorkbenchReadiness({read:query});if(!readiness.ready)throw Error('Remote D1 readiness failed.');
    stage('remote-export');let result,current;
    for(let attempt=0;attempt<30;attempt++){
      result=await cloud.scoped('/d1/database/'+temporary+'/export',{method:'POST',body:{output_format:'polling',dump_options:{},...(current?{current_bookmark:current}:{})}});
      if(result.status==='complete')break;if(result.status==='error')throw Error('Rehearsal export failed.');current=result.at_bookmark;await new Promise(resolve=>setTimeout(resolve,1000));
    }
    const url=new URL(result?.result?.signed_url);if(url.protocol!=='https:'||!url.hostname.endsWith('.r2.cloudflarestorage.com'))throw Error('Unexpected private export download host.');
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Private export download failed.');
    const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>128*1024*1024){await reader.cancel();throw Error('Private export exceeds bounds.');}chunks.push(value);}}finally{reader.releaseLock();}
    const exported=Buffer.concat(chunks);writeFileSync(join(directory,'remote-migrated-export.sql'),exported,{flag:'wx',mode:0o600});
    const restored=new DatabaseSync(join(directory,'remote-restored.sqlite'));
    try{
      restored.exec('PRAGMA foreign_keys=OFF');restrictExportImport(restored);
      restored.exec(exported.toString('utf8'));restored.setAuthorizer(null);restored.exec('PRAGMA foreign_keys=ON');
      if(restored.prepare('PRAGMA quick_check').get().quick_check!=='ok'||restored.prepare('PRAGMA foreign_key_check').all().length)throw Error('Remote backup restore failed.');
      for(const {name} of tables){const sql=rowFingerprintSQL(db,name);if(fingerprint(db.prepare(sql).all())!==fingerprint(restored.prepare(sql).all()))throw Error('Remote restore changed source rows.');}
      const restoredReadiness=await learningWorkbenchReadiness({read:async(sql,params=[])=>restored.prepare(sql).all(...params)});
      if(!restoredReadiness.ready)throw Error('Restored workbench schema is not ready.');
    }finally{restored.close();}
    const report={kind:'temporary-cloud-d1-rehearsal',legacyTables:tables.length,legacyRows:rows,remoteD1MigrationVerified:true,remoteBackupOfflineRestoreVerified:true,legacyRowsUnchanged:true,legacySchemaUnchanged:true,readiness,bootstrapSha256:pack.manifest.sqlSha256,exportSha256:hash(exported),liveDatabaseWrites:false,productionPublished:false,temporaryDatabaseRemoved:false,requests:cloud.usage()};
    await cloud.removeRehearsal(temporary);temporary=null;report.temporaryDatabaseRemoved=true;save('d1-verification.json',report);return report;
  }finally{try{if(temporary)await cloud.removeRehearsal(temporary);}finally{db.close();}}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);if(args.length!==6||args[0]!=='--source'||args[2]!=='--out'||args[4]!=='--wrangler-package')throw Error('Explicit baseline, new private directory and installed Wrangler package required.');
  process.umask(0o077);const require=createRequire(resolve(args[5],'package.json')),{unstable_splitSqlQuery:splitSQL}=require(resolve(args[5]));
  try{console.log(JSON.stringify(await provisionWorkbenchResources({source:args[1],directory:args[3],splitSQL,cloud:workbenchCloudControl({token:existingCloudToken(),maxRequests:2000,onError:details=>writeFileSync(join(args[3],'private-api-error.json'),JSON.stringify(details),{mode:0o600})})})));}
  catch(error){console.error(JSON.stringify({error:'Infrastructure preparation stopped safely.',status:error.status,codes:error.codes,message:error.message,productionPublished:false}));process.exitCode=1;}
}
