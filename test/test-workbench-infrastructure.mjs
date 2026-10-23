import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Readable} from 'node:stream';
import {fixture,actors} from './quiz-review-fixture.mjs';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {workbenchBootstrap,writeWorkbenchBootstrap} from '../ops/prepare-workbench-bootstrap.mjs';
import {workbenchInfrastructure,WORKBENCH_OFF_FLAGS} from '../src/workbench-infrastructure.mjs';
import {learningWorkbenchReadiness} from '../src/learning-workbench-schema.mjs';
import {WORKBENCH_PRIVATE_BUCKET} from '../src/learning-workbench-runtime.mjs';
import {workbenchMigrationPlan} from '../ops/learning-workbench-migration-plan.mjs';
import {createWorkbenchInspector} from '../src/workbench-inspector-worker.mjs';
import {describeMedia,inspectMedia,inspectorServer} from '../ops/workbench-inspector/server.mjs';
const descriptor={kind:'audio',duration:2,width:0,height:0},token='t'.repeat(40);
const probe={format:{duration:'2'},streams:[{codec_type:'audio',codec_name:'pcm_s16le',channels:1,sample_rate:'16000'}]};
test('fresh bootstrap installs final schema with foreign keys enabled, preserves legacy rows and refuses a second install',async()=>{
  const sql=new DatabaseSync(':memory:');try{
    applyLearningSchema(sql);sql.exec("PRAGMA foreign_keys=ON;INSERT INTO account_refs(id) VALUES('fixture');");
    const before=sql.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const pack=workbenchBootstrap();assert.equal(pack.manifest.sourceMigrations.length,20);assert.ok(!pack.sql.includes('DROP TABLE qr_speech_tasks;'));assert.ok(!pack.sql.includes('PRAGMA foreign_keys=OFF'));
    sql.exec('BEGIN');try{sql.exec(pack.sql);sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
    assert.equal((await learningWorkbenchReadiness({read:async(query,args=[])=>sql.prepare(query).all(...args)})).ready,true);
    assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(sql.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
    assert.equal(sql.prepare('SELECT id FROM account_refs').get().id,'fixture');
    assert.deepEqual(sql.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT GLOB 'qr_*' AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),before);
    assert.throws(()=>sql.exec(pack.sql),/CHECK constraint/);
    const columns=sql.prepare('PRAGMA table_info(qr_speech_tasks)').all();assert.ok(columns.filter(row=>['card_id','sense_id'].includes(row.name)).every(row=>row.notnull===0));
    assert.throws(()=>sql.exec("INSERT INTO qr_speech_tasks VALUES('bad',1,1,1,NULL,'fixture',0,'{}')"),/CHECK constraint/);
  }finally{sql.close();}
});
test('bootstrap artifacts are private, immutable by overwrite and retain original migration digests',()=>{
  const parent=mkdtempSync(join(tmpdir(),'workbench-release-')),directory=join(parent,'bundle');try{
    const result=writeWorkbenchBootstrap(directory);assert.equal(statSync(join(directory,'bootstrap.sql')).mode&0o777,0o600);assert.equal(statSync(directory).mode&0o777,0o700);
    assert.deepEqual(result.sourceMigrations,workbenchMigrationPlan().steps);assert.throws(()=>writeWorkbenchBootstrap(directory));assert.equal(result.remoteApplied,false);
  }finally{rmSync(parent,{recursive:true,force:true});}
});
test('infrastructure preflight is read-only, fails closed and never exposes configured secrets',async()=>{
  const f=await fixture({d1:true,extendedLifecycle:true});try{
    let result=await workbenchInfrastructure({db:f.db,env:{},resolveActor:async()=>null});assert.equal(result.configurationReady,false);assert.ok(result.missing.includes('schema'));
    for(const step of workbenchMigrationPlan().steps.slice(1))f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8'));
    const bucket={},env={WORKBENCH_MEDIA:bucket,WORKBENCH_MEDIA_BUCKET:WORKBENCH_PRIVATE_BUCKET,WORKBENCH_STORAGE_APPROVED:'true',WORKBENCH_MEDIA_INSPECTOR:{fetch:()=>{throw Error('No network probes permitted.');}},WORKBENCH_GEMINI_KEY:'private-fixture',WORKBENCH_GEMINI_PROJECT:'fixture-project',WORKBENCH_GEMINI_GENERATION_MODEL:'gemini-3.5-flash-lite',LEARNING_WORKBENCH_POLICY:JSON.stringify({version:1,revision:'fixture-v1',approved:true,language:{geminiGeneration:true,allowDataProcessing:true,freeTierVerified:true,credentialRevision:'fixture-v1',termsRevision:'fixture-v1'}})};
    const before=f.sql.prepare('SELECT total_changes() AS n').get().n;result=await workbenchInfrastructure({db:f.db,env,resolveActor:async()=>actors.dev});assert.equal(result.configurationReady,true);assert.equal(result.productionApproved,false);assert.equal(result.networkRequests,0);
    assert.equal(f.sql.prepare('SELECT total_changes() AS n').get().n,before);assert.ok(!JSON.stringify(result).includes('private-fixture'));
    env.CONTENT_MEDIA=bucket;assert.ok((await workbenchInfrastructure({db:f.db,env,resolveActor:async()=>actors.dev})).missing.includes('dedicated-private-binding'));
    assert.ok(Object.values(WORKBENCH_OFF_FLAGS).every(value=>value==='false'));
  }finally{f.close();}
});
test('private inspector gateway forwards only bounded raw media to its fixed authenticated endpoint',async()=>{
  let sent;const worker=createWorkbenchInspector({fetchImpl:async(url,init)=>{sent={url,init};return Response.json(descriptor);}});
  const env={INSPECTOR_ENABLED:'true',INSPECTOR_ENDPOINT:'https://inspector.example.test/inspect',INSPECTOR_TOKEN:token};
  const request=()=>new Request('https://internal/inspect',{method:'POST',headers:{'Content-Type':'audio/wav',Cookie:'private-cookie',Authorization:'client-credential'},body:new Uint8Array([1,2,3])});
  assert.deepEqual(await (await worker.fetch(request(),env)).json(),descriptor);assert.equal(sent.url,env.INSPECTOR_ENDPOINT);assert.equal(sent.init.headers.Authorization,'Bearer '+token);assert.equal(sent.init.headers.Cookie,undefined);assert.equal(sent.init.redirect,'error');assert.equal(sent.init.credentials,'omit');
  sent=null;assert.equal((await worker.fetch(request(),{...env,INSPECTOR_ENABLED:'false'})).status,503);assert.equal(sent,null);
  for(const endpoint of ['http://inspector.example.test/inspect','https://user:password@inspector.example.test/inspect','https://inspector.example.test/inspect?q=x','https://inspector.example.test/elsewhere'])assert.equal((await worker.fetch(request(),{...env,INSPECTOR_ENDPOINT:endpoint})).status,503);
  assert.equal((await worker.fetch(new Request('https://internal/inspect',{method:'POST',headers:{'Content-Type':'image/svg+xml'},body:'<svg/>'}),env)).status,415);
  assert.equal((await worker.fetch(new Request('https://internal/inspect',{method:'POST',headers:{'Content-Type':'constructor'},body:'test'}),env)).status,415);
});
test('gateway rejects invalid decoder output, redirects, missing content type and upstream secret errors',async()=>{
  const env={INSPECTOR_ENABLED:'true',INSPECTOR_ENDPOINT:'https://inspector.example.test/inspect',INSPECTOR_TOKEN:token};
  for(const response of [Response.json({...descriptor,raw:'private-data'}),Response.json({...descriptor,kind:'video'}),Response.json({...descriptor,duration:-1}),new Response('private-token',{status:500}),new Response('{}'),new Response('x'.repeat(8193),{headers:{'Content-Type':'application/json'}}),new Response(null,{status:302,headers:{Location:'https://untrusted.test'}})]){
    const worker=createWorkbenchInspector({fetchImpl:async()=>response}),result=await worker.fetch(new Request('https://internal/inspect',{method:'POST',headers:{'Content-Type':'audio/wav'},body:'test'}),env);
    assert.equal(result.status,503);assert.ok(!(await result.text()).includes('private-'));
  }
});
test('decoder validates streams before bounded full decoding, forces demuxers and cleans private temporary files',async()=>{
  assert.deepEqual(describeMedia(probe,'audio/wav'),descriptor);
  for(const invalid of [{...probe,format:{duration:'181'}},{...probe,streams:[{...probe.streams[0],channels:99}]},{...probe,streams:[{codec_type:'data'}]},{...probe,streams:[...probe.streams,...probe.streams]}])assert.throws(()=>describeMedia(invalid,'audio/wav'));
  assert.throws(()=>describeMedia({format:{duration:'4'},streams:[{codec_type:'video',codec_name:'h264',width:9000,height:9000}]},'video/mp4'));
  const calls=[];let path;
  const result=await inspectMedia(new Uint8Array([1,2]),'audio/wav',{run:async(binary,args,options)=>{calls.push({binary,args,options});if(binary==='ffprobe'){path=args.at(-1);assert.equal(statSync(path).mode&0o777,0o600);return {stdout:JSON.stringify(probe)};}return {stdout:''};}});
  assert.deepEqual(result,descriptor);assert.equal(calls.length,2);assert.equal(calls[0].options.timeout,2000);assert.equal(calls[1].options.timeout,6000);assert.ok(calls[0].args.includes('file,pipe'));assert.ok(calls[1].args.includes('-xerror'));assert.ok(calls[1].args.includes('null'));assert.throws(()=>statSync(path));
  await assert.rejects(inspectMedia(new Uint8Array([1]),'audio/wav',{run:async binary=>{if(binary==='ffprobe')return {stdout:JSON.stringify(probe)};throw Error('Decode failed.');}}));
});
test('decoder server refuses startup without a strong shared credential',()=>{
  assert.throws(()=>inspectorServer({token:'weak'}));const server=inspectorServer({token});assert.equal(server.listening,false);
});
test('decoder HTTP boundary authenticates before reading and bounds simultaneous inspections',async()=>{
  let release,calls=0;const pending=new Promise(resolve=>release=resolve),server=inspectorServer({token,inspect:async bytes=>{calls++;assert.deepEqual([...bytes],[1,2]);await pending;return descriptor;}});
  const invoke=(headers={},path='/inspect',method='POST')=>new Promise(resolve=>{
    const request=Readable.from([Buffer.from([1,2])]);Object.assign(request,{headers:{authorization:'Bearer '+token,'content-type':'audio/wav',...headers},url:path,method});
    const response={writeHead(status){this.status=status;},end(bytes){resolve({status:this.status,value:JSON.parse(bytes)});}};server.emit('request',request,response);
  });
  assert.equal((await invoke({authorization:'Bearer invalid'})).status,401);assert.equal((await invoke({},'/other')).status,404);assert.equal((await invoke({'content-type':'text/html'})).status,415);assert.equal((await invoke({'content-type':'constructor'})).status,415);assert.equal(calls,0);
  const first=invoke(),second=invoke();await new Promise(resolve=>setImmediate(resolve));assert.equal((await invoke()).status,429);release();
  assert.deepEqual(await first,{status:200,value:descriptor});assert.deepEqual(await second,{status:200,value:descriptor});assert.equal(calls,2);
});
