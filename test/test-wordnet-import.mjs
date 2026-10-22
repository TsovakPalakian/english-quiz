import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {WORDNET_FILES,parseWordNetSource} from '../src/wordnet-format.mjs';
import {inspectWordNetSource,importWordNet} from '../ops/import-wordnet.mjs';
import {openWordNetDataset} from '../src/wordnet-dataset.mjs';
import {createWordNetAdapter} from '../src/wordnet-language-provider.mjs';
const bytes=value=>new TextEncoder().encode(value);
function fixture(){
  const directory=mkdtempSync(join(tmpdir(),'wordnet-test-')),source=join(directory,'source'),target=join(directory,'import');mkdirSync(source);mkdirSync(join(source,'dict'));
  const files=Object.fromEntries(WORDNET_FILES.map(name=>[name,bytes('')]));
  files.LICENSE=bytes('WordNet Release 3.0\nPrinceton University\nSynthetic test fixture, not the corpus license; disclaimer.\n');
  files['dict/data.noun']=bytes('00000000 00 n 01 drizzle 0 000 | Synthetic light rain; "Synthetic example."\n');
  files['dict/index.sense']=bytes('drizzle%1:00:00:: 00000000 1 0\n');files['dict/noun.exc']=bytes('drizzles drizzle\n');
  for(const [name,value] of Object.entries(files))writeFileSync(join(source,name),value);
  return {directory,source,target,files,close:()=>rmSync(directory,{recursive:true,force:true})};
}
test('WordNet importer pins inputs, preserves license and persists immutable bounded lookup',async()=>{
  const f=fixture();let sql;try{
    const before=inspectWordNetSource(f.source),manifest=importWordNet(f.source,f.target,before.manifest.sha256);
    assert.equal(manifest.records,1);assert.equal(manifest.synsets,1);assert.deepEqual(readFileSync(join(f.target,'LICENSE')),readFileSync(join(f.source,'LICENSE')));
    sql=new DatabaseSync(join(f.target,'wordnet.sqlite'));
    for(const query of ['DELETE FROM wn_records','UPDATE wn_manifest SET license_notice=\'changed\''])assert.throws(()=>sql.exec(query),/immutable/);
    const db={read:async(q,args)=>sql.prepare(q).all(...args)},dataset=await openWordNetDataset({db,expectedDigest:manifest.sha256});
    const adapter=createWordNetAdapter({enabled:true,dataset}),result=await adapter.invoke({word:'DRIZZLE'});
    assert.equal(result.entries[0].definition,'Synthetic light rain');assert.equal(result.entries[0].examples[0].en,'Synthetic example.');assert.deepEqual(result.entries[0].forms,['drizzles']);assert.equal(result.entries[0].translation,null);
    await assert.rejects(openWordNetDataset({db,expectedDigest:'0'.repeat(64)}),error=>error.code==='invalid_wordnet_import');
    await assert.rejects(dataset.lookup('drizzle',{limit:9}));const abort=new AbortController();abort.abort();await assert.rejects(dataset.lookup('drizzle',{signal:abort.signal}),error=>error.code==='cancelled');
    assert.throws(()=>importWordNet(f.source,f.target,manifest.sha256),/EEXIST/);assert.equal(existsSync(join(f.target,'wordnet.sqlite')),true);
  }finally{sql?.close();f.close();}
});
test('bad WordNet version, offsets, links, files and changed pins never leave a partial import',()=>{
  const f=fixture();try{
    const original=inspectWordNetSource(f.source).manifest;
    for(const change of [{LICENSE:bytes('Other version')},{'dict/data.noun':bytes('00000001 00 n 01 drizzle 0 000 | Meaning\n')},{'dict/index.sense':bytes('bank%1:00:00:: 00000000 1 0\n')},{'dict/index.sense':bytes('drizzle%1:00:00:: 99999999 1 0\n')}]){
      const altered={...f.files,...change};assert.throws(()=>[...parseWordNetSource(altered).records()]);
    }
    writeFileSync(join(f.source,'dict/index.sense'),'bad source');assert.throws(()=>importWordNet(f.source,f.target,original.sha256),/digest changed/);assert.equal(existsSync(f.target),false);
    const changed=inspectWordNetSource(f.source).manifest;assert.throws(()=>importWordNet(f.source,f.target,changed.sha256));assert.equal(existsSync(f.target),false);
    rmSync(join(f.source,'dict/index.sense'));symlinkSync(join(f.source,'LICENSE'),join(f.source,'dict/index.sense'));assert.throws(()=>inspectWordNetSource(f.source),/Invalid/);
  }finally{f.close();}
});
test('downloaded official WordNet import supports real polysemy and source/license pins',{skip:!process.env.WORDNET_TEST_IMPORT},async()=>{
  const directory=process.env.WORDNET_TEST_IMPORT,manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8')),sql=new DatabaseSync(join(directory,'wordnet.sqlite'),{readOnly:true});
  try{
    assert.equal(manifest.records,206941);assert.equal(manifest.synsets,117659);
    const dataset=await openWordNetDataset({db:{read:async(q,args)=>sql.prepare(q).all(...args)},expectedDigest:'82f8078fd81d47a850940ce60a8c4d4314ed5eef0e5432448ae8ee515c86d02a'}),adapter=createWordNetAdapter({enabled:true,dataset});
    for(const word of ['drizzle','bank','able','take off','go']){const result=await adapter.invoke({word});assert.ok(result.entries.length>1,word);assert.ok(result.entries.every(entry=>entry.ipa===null&&entry.translation===null&&entry.level===null));}
    assert.equal((await adapter.invoke({word:'drizzle'})).entries.length,3);
    assert.equal(dataset.licenseNotice,readFileSync(join(directory,'LICENSE'),'utf8'));assert.equal(sql.prepare('PRAGMA quick_check').get().quick_check,'ok');
  }finally{sql.close();}
});
