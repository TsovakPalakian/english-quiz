// Export only the pinned local dictionary. Never connect to a remote database.
import {openSync,writeSync,closeSync,rmSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openWordNetDataset} from '../src/wordnet-dataset.mjs';
import {WORDNET_DIGEST} from '../src/wordnet-runtime.mjs';

const quote=value=>{
  if(typeof value!=='string'||value.includes('\0'))throw Error('Invalid WordNet text.');
  return "'"+value.replaceAll("'","''")+"'";
};
export async function exportWordNetD1(source,target,{expectedDigest=WORDNET_DIGEST}={}){
  const db=new DatabaseSync(resolve(source,'wordnet.sqlite'),{readOnly:true});let fd;
  try{
    const dataset=await openWordNetDataset({db:{read:async(sql,args)=>db.prepare(sql).all(...args)},expectedDigest});
    const row=db.prepare('SELECT manifest_json,license_notice FROM wn_manifest WHERE id=1').get();
    if(readFileSync(resolve(source,'LICENSE'),'utf8')!==dataset.licenseNotice||JSON.stringify(JSON.parse(readFileSync(resolve(source,'manifest.json'),'utf8')))!==JSON.stringify(JSON.parse(row.manifest_json)))throw Error('WordNet sidecar files do not match the database.');
    fd=openSync(target,'wx',0o600);
    const emit=text=>{const bytes=Buffer.from(text+'\n');let offset=0;while(offset<bytes.length)offset+=writeSync(fd,bytes,offset,bytes.length-offset);};
    emit('-- Princeton WordNet 3.0. The full license is preserved in wn_manifest.');
    emit('CREATE TABLE wn_manifest(id INTEGER PRIMARY KEY CHECK(id=1),manifest_json TEXT NOT NULL,license_notice TEXT NOT NULL);');
    emit('CREATE TABLE wn_records(sense_key TEXT PRIMARY KEY,word TEXT NOT NULL,pos TEXT NOT NULL,definition TEXT NOT NULL,examples_json TEXT NOT NULL,forms_json TEXT NOT NULL,sense_number INTEGER NOT NULL);');
    for(const record of db.prepare('SELECT sense_key,word,pos,definition,examples_json,forms_json,sense_number FROM wn_records ORDER BY sense_key').iterate()){
      if(!Number.isSafeInteger(record.sense_number)||record.sense_number<1)throw Error('Invalid WordNet sense number.');
      emit('INSERT INTO wn_records VALUES('+['sense_key','word','pos','definition','examples_json','forms_json'].map(key=>quote(record[key])).join(',')+','+record.sense_number+');');
    }
    emit('CREATE INDEX wn_lookup ON wn_records(word,sense_number,pos,sense_key);');
    // The manifest is the readiness marker: write it only after the records and index.
    emit('INSERT INTO wn_manifest VALUES(1,'+quote(row.manifest_json)+','+quote(row.license_notice)+');');
    for(const table of ['wn_manifest','wn_records'])for(const action of ['INSERT','UPDATE','DELETE'])emit(`CREATE TRIGGER ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'immutable WordNet import'); END;`);
    closeSync(fd);fd=undefined;
    return {sha256:dataset.sha256,records:JSON.parse(row.manifest_json).records};
  }catch(error){if(fd!==undefined){closeSync(fd);rmSync(target,{force:true});}throw error;}
  finally{db.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [source,target,...extra]=process.argv.slice(2);
  if(!source||!target||extra.length)throw Error('Use: node ops/export-wordnet-d1.mjs SOURCE NEW_OUTPUT.sql');
  console.log(JSON.stringify(await exportWordNetD1(source,resolve(target))));
}
