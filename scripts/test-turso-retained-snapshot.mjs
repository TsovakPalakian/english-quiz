import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {snapshotRetained} from './snapshot-turso-retained.mjs';
import {retainedScope} from './turso-retained-scope.mjs';
import {credentials} from './turso-staging.mjs';
const dev={id:'a'.repeat(32),login:'TsovakDev',role:'DEVELOPER',active:1,is_personal_data_revoked:0};
const twin={...dev,id:'b'.repeat(32),login:'Tsovak'};
function fixture({changed=false,badObject=false,accounts=[dev]}={}){
  const directory=mkdtempSync('/private/tmp/english-quiz-retained-capture-fixture-');
  mkdirSync(directory+'/local-catalogs',{mode:0o700});
  const account='1'.repeat(32),database='12345678-1234-1234-1234-123456789abc',bucket='learn-english-media';
  writeFileSync(directory+'/manifest.json',JSON.stringify({status:'complete',account,bucket}),{mode:0o600});
  for(const name of ['lesson-data.js','irregular.js','grammar.js','speakout.js','demonstratives.js','tense-bank.json'])
    writeFileSync(directory+'/local-catalogs/'+name,'{}',{mode:0o600});
  const anchor=retainedScope([dev,twin],['pair/tsovak-study.json']).anchor;
  const records=new Map([['pair/tsovak-study.json','{}'],['shared/card-quizzes.json','{}'],[dev.id+'/texts.json','[]'],[twin.id+'/texts.json','EXCLUDED_PRIVATE_JSON']]);
  const inventory=[...records].map(([key,bytes])=>({key,size:Buffer.byteLength(bytes),etag:createHash('md5').update(bytes).digest('hex')}));
  const calls=[];let lists=0;
  const config={account,database,bucket,bearer:'FAKE',anchor,catalogSource:directory,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/d1/'))return Response.json({success:true,result:[{success:true,results:accounts}]});
    if(url.includes('/objects?')){lists++;return Response.json({success:true,result:inventory.map(item=>({...item,...(changed&&lists===2&&item.key.startsWith('shared/')?{etag:'changed'}:{})}))});}
    const key=decodeURIComponent(url.split('/objects/')[1]);assert.notEqual(key,twin.id+'/texts.json');
    return new Response(badObject?'bad':records.get(key));
  }};
  return {directory,config,calls,close(){rmSync(directory,{recursive:true});}};
}
test('Fresh capture uses one fixed account SELECT, retained R2 GETs only and strips excluded accounts',async()=>{
  const f=fixture({accounts:[dev,twin]});let result;try{
    result=await snapshotRetained(f.config);
    assert.equal(result.d1Selects,1);assert.equal(result.sourceObjects,3);assert.equal(result.excludedLiveAccounts,1);assert.equal(result.cutoverAllowed,false);
    assert.deepEqual(JSON.parse(readFileSync(result.directory+'/accounts.json','utf8')),[dev]);
    const manifest=JSON.parse(readFileSync(result.directory+'/manifest.json','utf8'));assert.equal(manifest.status,'complete');
    assert.equal(manifest.retainedCapture.catalogs.length,6);
    assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
    const query=JSON.parse(f.calls.find(c=>c.options.method==='POST').options.body);assert.match(query.sql,/^SELECT id, login, role, active, is_personal_data_revoked FROM users ORDER BY id$/);
    assert.ok(f.calls.every(c=>['GET','POST'].includes(c.options.method)));assert.equal(result.sourceRequests,6);
  }finally{if(result)rmSync(result.directory,{recursive:true});f.close();}
});
test('Forged scope and missing frozen catalog fail before source requests',async()=>{
  const f=fixture();try{
    await assert.rejects(snapshotRetained({...f.config,anchor:{...f.config.anchor,profileId:'bad'}}));assert.equal(f.calls.length,0);
    rmSync(f.directory+'/local-catalogs/grammar.js');await assert.rejects(snapshotRetained(f.config));assert.equal(f.calls.length,0);
  }finally{f.close();}
});
test('Missing/recreated account fails without downloading retained or excluded private JSON',async()=>{
  for(const accounts of [[],[{...dev,id:'c'.repeat(32)}]]){
    const f=fixture({accounts});try{await assert.rejects(snapshotRetained(f.config));assert.equal(f.calls.length,2);}finally{f.close();}
  }
});
test('Source drift or checksum mismatch fails without retries or writes to the source',async()=>{
  for(const option of [{changed:true},{badObject:true}]){
    const f=fixture(option);try{
      await assert.rejects(snapshotRetained(f.config),/Source (changed|object changed)/);
      assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
      assert.ok(f.calls.every(c=>!['PUT','DELETE'].includes(c.options.method)));
      // Only generated fixture snapshots are removed, never user archives.
    }finally{f.close();}
  }
});
test('A dedicated credential file never changes default secrets; unsafe hosts are rejected',()=>{
  const directory=mkdtempSync('/private/tmp/english-quiz-retained-vars-fixture-'),old=process.env.TURSO_STAGE_VARS_FILE;
  try{
    const file=directory+'/test.vars';process.env.TURSO_STAGE_VARS_FILE=file;
    const write=host=>writeFileSync(file,`TURSO_URL=libsql://${host}\nTURSO_AUTH_TOKEN=FAKE.FAKE.FAKE\n`,{mode:0o600});
    write('english-quiz-test-retained-example.aws-eu-west-1.turso.io');assert.match(credentials().endpoint,/test-retained/);
    write('production-example.turso.io');assert.throws(credentials,/Only the english-quiz-test/);
    process.env.TURSO_STAGE_VARS_FILE='relative.vars';assert.throws(credentials,/absolute private/);
  }finally{if(old===undefined)delete process.env.TURSO_STAGE_VARS_FILE;else process.env.TURSO_STAGE_VARS_FILE=old;rmSync(directory,{recursive:true});}
});
