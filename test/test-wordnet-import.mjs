import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {WORDNET_FILES,parseWordNetSource} from '../src/wordnet-format.mjs';
import {inspectWordNetSource,importWordNet} from '../ops/import-wordnet.mjs';
import {openWordNetDataset} from '../src/wordnet-dataset.mjs';
import {createWordNetAdapter} from '../src/wordnet-language-provider.mjs';
import {exportWordNetD1} from '../ops/export-wordnet-d1.mjs';
import {configuredWordNet} from '../src/wordnet-runtime.mjs';
import {learningWorkbenchAPI,WORKBENCH_PREFIX} from '../src/learning-workbench-api.mjs';
const bytes=value=>new TextEncoder().encode(value);
const officialDirectory=()=>process.env.WORDNET_TEST_IMPORT||fileURLToPath(new URL('../private/wordnet-3.0/',import.meta.url));
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
test('D1 export preserves dictionary data, license and immutability without overwriting output',async()=>{
  const f=fixture();let restored;
  try{
    const manifest=importWordNet(f.source,f.target,inspectWordNetSource(f.source).manifest.sha256),output=join(f.directory,'wordnet.sql');
    const result=await exportWordNetD1(f.target,output,{expectedDigest:manifest.sha256});assert.equal(result.records,1);
    restored=new DatabaseSync(':memory:');restored.exec(readFileSync(output,'utf8'));
    const dataset=await openWordNetDataset({db:{read:async(sql,args)=>restored.prepare(sql).all(...args)},expectedDigest:manifest.sha256});
    assert.equal((await dataset.lookup('drizzle'))[0].definition,'Synthetic light rain');
    assert.equal(dataset.licenseNotice,readFileSync(join(f.target,'LICENSE'),'utf8'));
    assert.throws(()=>restored.exec('DELETE FROM wn_records'),/immutable/);
    const original=readFileSync(output,'utf8');await assert.rejects(exportWordNetD1(f.target,output,{expectedDigest:manifest.sha256}),/EEXIST/);assert.equal(readFileSync(output,'utf8'),original);
    await assert.rejects(exportWordNetD1(f.target,join(f.directory,'wrong.sql'),{expectedDigest:'0'.repeat(64)}));assert.equal(existsSync(join(f.directory,'wrong.sql')),false);
  }finally{restored?.close();f.close();}
});
test('WordNet runtime uses only its dedicated database and retries failed initialization',async()=>{
  const sql=new DatabaseSync(join(officialDirectory(),'wordnet.sqlite'),{readOnly:true});let reads=0,unavailable=true;
  const binding={prepare(query){let args=[];const statement={bind(...values){args=values;return statement;},async all(){reads++;if(unavailable)return {success:false};return {success:true,results:sql.prepare(query).all(...args)};}};return statement;}};
  try{
    assert.equal(await configuredWordNet({}),null);
    for(const env of [{},{WORDNET_DB:binding,DB:binding},{WORDNET_DB:binding,STUDY_DB:binding}])await assert.rejects(configuredWordNet({...env,LEARNING_WORDNET_ENABLED:'true'}),/separate WordNet/);
    const env={LEARNING_WORDNET_ENABLED:'true',WORDNET_DB:binding};await assert.rejects(configuredWordNet(env),/unavailable/);
    unavailable=false;const first=await configuredWordNet(env),count=reads,second=await configuredWordNet(env);
    assert.equal(first.enabled,true);assert.equal(first.dataset,second.dataset);assert.equal(reads,count);
    assert.ok((await first.dataset.lookup('drizzle')).length>1);
  }finally{sql.close();}
});
test('dictionary lookup requires staff, same origin, writable mode and bounded input',async()=>{
  let calls=0;const controller=new AbortController();
  const request=(data,{origin='https://example.test',method='POST'}={})=>new Request('https://example.test'+WORKBENCH_PREFIX+'/dictionary/lookup',{method,headers:{origin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(data)}:{}),signal:controller.signal});
  const actor={id:'teacher',role:'ADMIN'},services={providers:{async execute(task,data,options){calls++;assert.equal(task,'dictionary');assert.deepEqual(data,{word:'drizzle'});assert.equal(options.signal.aborted,false);return {data:{entries:[]}};}}};
  const invoke=(req,options={})=>learningWorkbenchAPI(req,{actor,services,writable:true,...options});
  await assert.rejects(invoke(request({word:'drizzle'}),{actor:{id:'student',role:'USER'}}),error=>error.status===403);
  await assert.rejects(invoke(request({word:'drizzle'}),{writable:false}),error=>error.status===503);
  await assert.rejects(invoke(request({word:'drizzle'},{origin:'https://other.test'})),error=>error.status===403);
  for(const data of [null,[],{}, {word:' '},{word:'a'.repeat(201)},{word:'drizzle',role:'DEVELOPER'}])await assert.rejects(invoke(request(data)),error=>error.status===400);
  assert.equal(calls,0);
  const response=await invoke(request({word:' drizzle '}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{data:{entries:[]}});assert.equal(calls,1);
});
test('downloaded official WordNet import supports real polysemy and source/license pins',async()=>{
  const directory=officialDirectory();
  for(const name of ['manifest.json','wordnet.sqlite','LICENSE'])assert.ok(existsSync(join(directory,name)),`Missing WordNet data: ${name}. Prepare private/wordnet-3.0 or set WORDNET_TEST_IMPORT.`);
  const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8')),sql=new DatabaseSync(join(directory,'wordnet.sqlite'),{readOnly:true});
  try{
    assert.equal(manifest.records,206941);assert.equal(manifest.synsets,117659);
    const dataset=await openWordNetDataset({db:{read:async(q,args)=>sql.prepare(q).all(...args)},expectedDigest:'82f8078fd81d47a850940ce60a8c4d4314ed5eef0e5432448ae8ee515c86d02a'}),adapter=createWordNetAdapter({enabled:true,dataset});
    for(const word of ['drizzle','bank','able','take off','go']){const result=await adapter.invoke({word});assert.ok(result.entries.length>1,word);assert.ok(result.entries.every(entry=>entry.ipa===null&&entry.translation===null&&entry.level===null));}
    assert.equal((await adapter.invoke({word:'drizzle'})).entries.length,3);
    assert.equal(dataset.licenseNotice,readFileSync(join(directory,'LICENSE'),'utf8'));assert.equal(sql.prepare('PRAGMA quick_check').get().quick_check,'ok');
  }finally{sql.close();}
});
