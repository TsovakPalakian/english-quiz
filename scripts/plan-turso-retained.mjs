// Read a frozen private archive, project ONLY retained sources into a new private
// directory, and validate SQLite locally. No credentials, network or live writes.
import {readFileSync,writeFileSync,existsSync,mkdtempSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {retainedScope} from './turso-retained-scope.mjs';
import {build,insertSql} from './import-turso-snapshot.mjs';
import {applyTursoSchema} from './turso-test-schema.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=fileURLToPath(new URL('../',import.meta.url));
export function planRetainedSnapshot(source,{scopeAnchor=null,persistent=false}={}){
  source=realpathSync(source);
  if(source===root||source.startsWith(root+'/'))throw new Error('Use a private source snapshot outside published assets.');
  const manifestBytes=readFileSync(resolve(source,'manifest.json')),manifest=JSON.parse(manifestBytes);
  if(manifest.version!==1||manifest.status!=='complete'||manifest.bucket!=='learn-english-media')throw new Error('Completed frozen source snapshot required.');
  const accountBytes=readFileSync(resolve(source,'accounts.json'));
  if(hash(accountBytes)!==manifest.accountsSha256)throw new Error('Account source checksum mismatch.');
  const scope=retainedScope(JSON.parse(accountBytes),manifest.objects.map(entry=>entry.key),scopeAnchor);
  const selected=manifest.objects.filter(entry=>scope.includesSource(entry.key));
  const seen=new Set(),verified=new Map();
  for(const entry of manifest.objects){
    if(seen.has(entry.key)||!/^objects\/[a-f0-9]{64}\.json$/.test(entry.file))throw new Error('Invalid source object identity.');
    seen.add(entry.key);if(!scope.includesSource(entry.key))continue;
    const bytes=readFileSync(resolve(source,entry.file));
    if(hash(bytes)!==entry.sha256||bytes.length!==entry.bytes)throw new Error('Retained source checksum mismatch.');
    verified.set(entry.file,bytes);
  }
  const catalogs=new Map();
  for(const name of ['lesson-data.js','irregular.js','grammar.js','speakout.js','demonstratives.js','tense-bank.json']){
    const file=resolve(source,'local-catalogs',name);
    if(!existsSync(file))throw new Error('Frozen catalog missing; refusing to substitute current code.');
    catalogs.set(name,readFileSync(file));
  }
  let prefix='/private/tmp/english-quiz-tsovakdev-plan-';
  if(persistent){
    const parent=resolve(root,'..','english-quiz-turso-backups');
    if(realpathSync(parent)!==parent)throw new Error('Private backup directory symlink rejected.');
    prefix=resolve(parent,'tsovakdev-plan-');
  }
  const directory=mkdtempSync(prefix);
  for(const name of ['objects','local-catalogs'])mkdirSync(resolve(directory,name),{mode:0o700});
  const write=(name,bytes)=>writeFileSync(resolve(directory,name),bytes,{mode:0o600,flag:'wx'});
  // Never copy passwords/hashes, even if an unexpected source archive has them.
  const account=Object.fromEntries(['id','login','role','active','is_personal_data_revoked','created_at'].filter(key=>Object.hasOwn(scope.account,key)).map(key=>[key,scope.account[key]]));
  const retainedBytes=Buffer.from(JSON.stringify([account]));write('accounts.json',retainedBytes);
  const projected={...manifest,accountsSha256:hash(retainedBytes),objects:selected,
    projection:{retainedLogin:'TsovakDev',originalManifestSha256:hash(manifestBytes),originalAccountsSha256:hash(accountBytes),excludedSnapshotAccounts:scope.excludedAccounts},
    inventory:manifest.inventory.filter(entry=>entry.key.startsWith('lessons/files/')||scope.mediaAccountIds.some(id=>entry.key.startsWith(id+'/')))};
  write('manifest.json',JSON.stringify(projected,null,2));write('tsovakdev-scope.json',JSON.stringify(scope.anchor,null,2));
  for(const [name,bytes] of verified)write(name,bytes);
  for(const [name,bytes] of catalogs)write('local-catalogs/'+name,bytes);
  const plan=build(directory,{scopeAnchor:scope.anchor});
  write('scoped.sqlite',new Uint8Array());const db=new DatabaseSync(resolve(directory,'scoped.sqlite'));
  try{
    applyTursoSchema(db);
    db.exec(insertSql(plan.model));
    if(db.prepare('PRAGMA foreign_key_check').all().length||db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Scoped SQLite verification failed.');
    for(const [table,rows] of Object.entries(plan.model))if(db.prepare('SELECT count(*) n FROM '+table).get().n!==rows.size)throw new Error('Scoped table count mismatch.');
    const refs=db.prepare('SELECT id FROM account_refs').all();
    if(refs.length!==1||refs[0].id!==scope.account.id)throw new Error('Excluded account leaked into scoped model.');
  }finally{db.close();}
  write('import-plan-tsovakdev.json',JSON.stringify(plan.report,null,2));
  const result={status:'verified-offline-scoped-plan',directory,retainedLogin:'TsovakDev',retainedAccounts:1,
    excludedSnapshotAccounts:scope.excludedAccounts,selectedSourceObjects:selected.length,counts:plan.report.counts,
    formerPairDataRetained:scope.anchor.pairedSource,profileIdentityPreserved:true,sourceSnapshotChanged:false,
    networkRequests:0,liveAccountVerified:false,existingTestDatabaseChanged:false,productionChanged:false,cutoverAllowed:false};
  write('planning-result.json',JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [source,...options]=process.argv.slice(2);let persistent=false,anchorPath=null;
    for(let i=0;i<options.length;i++){
      if(options[i]==='--persist'&&!persistent)persistent=true;
      else if(options[i]==='--scope'&&!anchorPath&&options[i+1]&&!options[i+1].startsWith('--'))anchorPath=options[++i];
      else throw new Error('Unknown or duplicate planning option.');
    }
    if(!source)throw new Error('Usage: node scripts/plan-turso-retained.mjs /private/frozen-snapshot [--scope /private/tsovakdev-scope.json] [--persist]');
    console.log(JSON.stringify(planRetainedSnapshot(source,{scopeAnchor:anchorPath?JSON.parse(readFileSync(anchorPath,'utf8')):null,persistent}),null,2));
  }catch(error){console.error(error instanceof Error?error.message:'Scoped planning failed.');process.exitCode=1;}
}
