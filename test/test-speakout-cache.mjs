import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function fixture(storage=new Map()){
  const events=new Map(),memory=new Map(),loads=new Map(),requests=[];
  const listeners=new Map(),window={addEventListener(type,fn){listeners.set(type,fn);},dispatchEvent(event){events.set(event.type,event.detail);listeners.get(event.type)?.(event);}};
  const source={revision:'1',published:true,answers:{},catalogRevision:'catalog-1'};
  const where={level:'A1',unit:0,lesson:0};
  const read=async path=>{
    requests.push(path);
    if(path.endsWith('/revisions'))return {catalogRevision:source.catalogRevision,defaultRevision:'0',lessons:{'A1:0:0':source.revision}};
    return {cacheRevision:source.revision,materials:[{revision:Number(source.revision),answers:structuredClone(source.answers)}]};
  };
  window.ContentCache={
    get:key=>memory.get(key)||storage.get(key),
    set(key,value){memory.set(key,value);storage.set(key,value);},
    invalidate(key){memory.delete(key);storage.delete(key);loads.delete(key);},
    load(key,fetcher){if(this.get(key))return Promise.resolve(this.get(key));if(loads.has(key))return loads.get(key);const job=fetcher().then(data=>{this.set(key,data);loads.delete(key);return data;});loads.set(key,job);return job;}
  };
  const scope={window,document:{addEventListener(){}},URLSearchParams,structuredClone,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},Date};
  runInNewContext(readFileSync(new URL('../production/speakout-cache.js',import.meta.url),'utf8'),scope);
  const options={actor:'student',role:'USER',read,active:()=>true};
  return {cache:window.SpeakoutCache,where,options,source,requests,storage,events,listeners};
}
test('Speakout coalesces opens and reads unchanged lessons from persistent cache',async()=>{
  const f=fixture();
  await Promise.all([f.cache.load(f.where,f.options),f.cache.load(f.where,f.options)]);
  assert.equal(f.requests.length,2,'One manifest and one document');
  await f.cache.load(f.where,f.options);assert.equal(f.requests.length,2);
  await f.cache.refresh(true);await f.cache.load(f.where,f.options);assert.equal(f.requests.length,3,'An unchanged background check does not fetch the document');
  const reopened=fixture(f.storage);await reopened.cache.load(reopened.where,reopened.options);
  assert.equal(reopened.requests.length,1,'Reload verifies all revisions once and reuses persisted data');
});
test('Changed revisions invalidate only affected Speakout content',async()=>{
  const f=fixture();await f.cache.load(f.where,f.options);
  f.source.revision='2';await f.cache.refresh(true);
  assert.equal(f.events.get('speakout-cache-change').changed[0],'A1:0:0');
  assert.equal((await f.cache.load(f.where,f.options)).cacheRevision,'2');
  assert.equal(f.requests.length,4);
  f.cache.put(f.where,f.options,{cacheRevision:'3',materials:[{revision:3,answers:{answer:'mine'}}]});
  assert.equal((await f.cache.load(f.where,f.options)).materials[0].answers.answer,'mine');
  assert.equal(f.requests.length,4,'Saving updates cache without a verification fetch');
});
test('Speakout keeps account and role caches separate and rejects obsolete responses',async()=>{
  const f=fixture();await f.cache.load(f.where,f.options);
  f.source.answers={answer:'other'};
  const other={...f.options,actor:'other'};
  assert.equal((await f.cache.load(f.where,other)).materials[0].answers.answer,'other');
  assert.equal(f.requests.length,4);
  await f.cache.load(f.where,{...other,role:'ADMIN'});assert.equal(f.requests.length,6);
  let release;const stale={...other,actor:'stale',read:()=>new Promise(resolve=>{release=resolve;})};
  const job=f.cache.load(f.where,stale);
  f.cache.configure(other);release({defaultRevision:'0',lessons:{}});
  await assert.rejects(job,/Access changed/);
});
test('A delayed background response cannot roll back a freshly saved Speakout cache',async()=>{
  const f=fixture();await f.cache.load(f.where,f.options);
  let release;const options={...f.options,read:path=>path.endsWith('/revisions')?new Promise(resolve=>{release=resolve;}):f.options.read(path)};
  f.cache.configure(options);const check=f.cache.refresh(true);
  f.cache.put(f.where,options,{cacheRevision:'2',materials:[{revision:2}]});
  release({defaultRevision:'0',lessons:{'A1:0:0':'1'}});await check;
  assert.equal((await f.cache.load(f.where,options)).cacheRevision,'2');
  assert.equal(f.events.size,0);
});
