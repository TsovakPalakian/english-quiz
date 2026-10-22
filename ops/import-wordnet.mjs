// Local import only: no network, production DB, existing output replacement or SQL migration.
import {readFileSync,writeFileSync,mkdirSync,lstatSync,rmSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {WORDNET_FILES,parseWordNetSource} from '../src/wordnet-format.mjs';
export function inspectWordNetSource(source){
  const files={},hashes={};let total=0;
  for(const name of WORDNET_FILES){const path=resolve(source,name),stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>30000000||(total+=stat.size)>80000000)throw Error('Invalid or oversized WordNet file.');
    files[name]=readFileSync(path);hashes[name]=createHash('sha256').update(files[name]).digest('hex');}
  const sha256=createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
  return {files,manifest:{version:'3.0',sha256,files:hashes}};
}
export function importWordNet(source,target,expectedDigest){
  if(!/^[a-f0-9]{64}$/.test(expectedDigest||''))throw Error('Pin the inspected source digest before importing.');
  const {files,manifest}=inspectWordNetSource(source);if(manifest.sha256!==expectedDigest)throw Error('WordNet source digest changed.');
  const parsed=parseWordNetSource(files);mkdirSync(target,{mode:0o700});let db;
  try{
    const path=resolve(target,'wordnet.sqlite');db=new DatabaseSync(path);chmodSync(path,0o600);
    db.exec('CREATE TABLE wn_manifest(id INTEGER PRIMARY KEY CHECK(id=1),manifest_json TEXT NOT NULL,license_notice TEXT NOT NULL); CREATE TABLE wn_records(sense_key TEXT PRIMARY KEY,word TEXT NOT NULL,pos TEXT NOT NULL,definition TEXT NOT NULL,examples_json TEXT NOT NULL,forms_json TEXT NOT NULL,sense_number INTEGER NOT NULL); BEGIN IMMEDIATE;');
    const insert=db.prepare('INSERT INTO wn_records VALUES(?,?,?,?,?,?,?)');let records=0;
    for(const record of parsed.records()){insert.run(record.senseKey,record.word,record.pos,record.definition,JSON.stringify(record.examples),JSON.stringify(record.forms),record.senseNumber);records++;}
    if(!records)throw Error('Empty WordNet import.');manifest.records=records;manifest.synsets=parsed.synsetCount;
    db.prepare('INSERT INTO wn_manifest VALUES(1,?,?)').run(JSON.stringify(manifest),parsed.licenseNotice);
    db.exec('CREATE INDEX wn_lookup ON wn_records(word,sense_number,pos,sense_key); COMMIT;');
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('WordNet import integrity check failed.');
    for(const table of ['wn_manifest','wn_records'])for(const action of ['INSERT','UPDATE','DELETE'])db.exec(`CREATE TRIGGER ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'immutable WordNet import'); END`);
    db.close();db=null;
    writeFileSync(resolve(target,'LICENSE'),files.LICENSE,{flag:'wx',mode:0o600});writeFileSync(resolve(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    return manifest;
  }catch(error){db?.close();rmSync(target,{recursive:true,force:true});throw error;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [mode,source,target,digest,...extra]=process.argv.slice(2);
  if(extra.length||!source||!['inspect','import'].includes(mode)||mode==='inspect'&&(target||digest)||mode==='import'&&(!target||!digest))throw Error('Use: inspect SOURCE or import SOURCE NEW_TARGET EXPECTED_DIGEST');
  console.log(JSON.stringify(mode==='inspect'?inspectWordNetSource(source).manifest:importWordNet(source,target,digest)));
}
