import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {SongMediaService,audioMetadata,AUDIO_LIMIT} from '../src/turso-song-media.mjs';
import {StudyError,StudyService} from '../src/turso-study.mjs';
import {LessonMediaService,lessonMediaMetadata} from '../src/turso-lesson-media.mjs';
import {legacyLessons} from '../src/turso-legacy-read.mjs';
import {PersonalService} from '../src/turso-personal.mjs';
import {mediaKey} from '../src/turso-media.mjs';
import {localMediaStore} from './turso-local-media.mjs';
import {createMainServer} from './run-turso-main.mjs';
import {once} from 'node:events';
import {runInNewContext} from 'node:vm';
import {snapshot} from './turso-backup.mjs';
import {localMediaReferences,writeLocalMediaBackup,verifyLocalMediaBackup,restoreLocalMediaBackup} from './turso-media-backup.mjs';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['001_content_schema.sql','002_import_audit.sql'])sqlite.exec(readFileSync(new URL('../migrations/turso/'+name,import.meta.url),'utf8'));
  sqlite.exec("INSERT INTO account_refs(id) VALUES('one'),('two'); INSERT INTO study_profiles(id,kind) VALUES('p1','personal'),('p2','personal'); INSERT INTO profile_members VALUES('one','p1'),('two','p2');");
  const args=cmd=>cmd.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value);
  const db={read:async(sql,args=[])=>sqlite.prepare(sql).all(...args),readMany:async commands=>commands.map(cmd=>sqlite.prepare(cmd.sql).all(...args(cmd))),atomic:async commands=>{
    sqlite.exec('BEGIN');try{for(const cmd of commands)sqlite.prepare(cmd.sql).run(...cmd.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value));sqlite.exec('COMMIT');}
    catch{sqlite.exec('ROLLBACK');throw new StudyError(409,'Conflict');}
  }};
  const directory=mkdtempSync('/private/tmp/english-quiz-stage-media-'),store=localMediaStore(directory),own={id:'one',role:'USER'},other={id:'two',role:'DEVELOPER'};
  return {sqlite,db,directory,store,own,other,close(){sqlite.close();rmSync(directory,{recursive:true});}};
}
function wav(value=0){const bytes=Buffer.alloc(46);bytes.write('RIFF');bytes.writeUInt32LE(38,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(2,40);bytes.writeUInt16LE(value,44);return bytes;}
const body=(revision=1,name='audio.wav')=>({mutationId:crypto.randomUUID(),expectedRevision:revision,mime:'audio/wav',name});
async function song(f){await new PersonalService(f.db).createLibrary(f.own,{mutationId:crypto.randomUUID(),id:'song',kind:'song',changes:{title:'Song',lyrics:'Original lyrics',artist:'Artist'}});f.sqlite.exec("UPDATE library_items SET media_key='production/original' WHERE id='song'");}
test('Own audio: immutable upload/replay/replace, persisted metadata, private access and retained original',async()=>{
  const f=fixture();try{
    await song(f);const service=new SongMediaService(f.db,f.store),request=body(),first=await service.upload(f.own,'song',request,wav());
    assert.equal(first.revision,2);assert.equal(first.item.stageLocalMedia,true);assert.equal(first.item.lyrics,'Original lyrics');
    assert.deepEqual(await service.upload(f.own,'song',request,wav()),first);assert.equal(readdirSync(f.directory).length,2);
    assert.equal(await mediaKey(f.db,f.own,'song','song'),first.media.key);await assert.rejects(mediaKey(f.db,f.other,'song','song'),e=>e.status===404);
    await assert.rejects(service.upload(f.other,'song',body(2),wav(1)),e=>e.status===404);
    await assert.rejects(service.upload(f.own,'song',body(),wav(1)),e=>e.status===409);assert.equal(readdirSync(f.directory).length,2,'Stale/foreign upload writes no files');
    await assert.rejects(service.upload(f.own,'song',request,wav(1)),e=>e.status===409,'Operation ID cannot be reused with new bytes');
    const second=await service.upload(f.own,'song',body(2,'replacement.wav'),wav(1));assert.equal(second.revision,3);
    assert.notEqual(second.media.key,first.media.key);assert.deepEqual(Buffer.from(await (await f.store.response(first.media.key,'GET')).arrayBuffer()),wav(),'Old object retained, never destructively overwritten');
    const saved=(await new PersonalService(f.db).library(f.own))[0];assert.equal(saved.fileName,'replacement.wav');assert.equal(saved.stageRevision,3);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM catalog_documents").get().n,0,'No binary/base64 in SQL');
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.close();}
});
test('Audio validation and fail-closed configuration; no arbitrary store or filenames',async()=>{
  const f=fixture();try{
    await song(f);
    for(const [bytes,mime,name,status] of [[wav(),'text/html','x.wav',415],[Buffer.from('<html/>'),'audio/wav','x.wav',415],[wav(),'audio/wav','../x.wav',400],[new Uint8Array(),'audio/wav','x.wav',413],[new Uint8Array(AUDIO_LIMIT+1),'audio/wav','x.wav',413]]){
      await assert.rejects(audioMetadata(bytes,mime,name),e=>e.status===status);
    }
    await assert.rejects(new SongMediaService(f.db,{put(){throw new Error('Production write');}}).upload(f.own,'song',body(),wav()),e=>e.status===503);
    await assert.rejects(new SongMediaService(f.db,f.store).upload(f.own,'song',{...body(),owner:'p2'},wav()),e=>e.status===400);
    await assert.rejects(f.store.putImmutable('../escape',wav(),{}),e=>e.status===400);assert.equal(readdirSync(f.directory).length,0);
  }finally{f.close();}
});
test('Audio CAS race and uncertain commit do not delete a possibly referenced file',async()=>{
  const f=fixture();try{
    await song(f);const service=new SongMediaService(f.db,f.store),original=f.db.atomic;
    f.db.atomic=async commands=>{await original(commands);throw new StudyError(503,'Connection lost after commit');};
    const first=await service.upload(f.own,'song',body(),wav());assert.equal(first.revision,2);assert.equal(readdirSync(f.directory).length,2);
    f.db.atomic=async commands=>{f.sqlite.exec("UPDATE library_items SET revision=revision+1 WHERE id='song'");await original(commands);};
    await assert.rejects(service.upload(f.own,'song',body(2),wav(1)),e=>e.status===409);
    assert.equal(await mediaKey(f.db,f.own,'song','song'),first.media.key);assert.equal(readdirSync(f.directory).length,4,'Unreferenced journalled audio retained, no unsafe delete');
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM operation_receipts WHERE result_json LIKE '%stage-local/%'").get().n,1);
  }finally{f.close();}
});
test('Local audio HEAD/Range, private headers and checksum rejection',async()=>{
  const f=fixture();try{
    await song(f);const result=await new SongMediaService(f.db,f.store).upload(f.own,'song',body(),wav());
    const head=await f.store.response(result.media.key,'HEAD','bytes=-');assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),'46');
    const partial=await f.store.response(result.media.key,'GET','bytes=44-');assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 44-45/46');assert.equal(partial.headers.get('cache-control'),'private, no-store');
    assert.equal((await f.store.response(result.media.key,'GET','bytes=46-')).status,416);
    await assert.rejects(f.store.response(result.media.key,'GET','bytes=1-0'),e=>e.status===400);
    const binary=readdirSync(f.directory).find(name=>name.endsWith('.bin'));writeFileSync(resolve(f.directory,binary),wav(5));
    await assert.rejects(f.store.response(result.media.key,'GET'),e=>e.status===503);
  }finally{f.close();}
});
test('Local audio HTTP: origin/session/owner gates, binary point upload and no production reads',async()=>{
  const f=fixture();let server;try{
    await song(f);let productionReads=0,authReads=0;
    server=createMainServer({db:f.db,mediaStore:f.store,auth:{current:async req=>{authReads++;return req.headers.cookie==='own'?f.own:req.headers.cookie==='other'?f.other:null;},source:{readMedia(){productionReads++;throw new Error('Forbidden');}}}});
    server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
    const request=body(),url=origin+'/api/library/song/media?'+new URLSearchParams({mutationId:request.mutationId,expectedRevision:'1',name:request.name});
    const options={method:'POST',headers:{Origin:origin,Cookie:'own','Content-Type':'audio/wav'},body:wav()};
    assert.equal((await fetch(url,{...options,headers:{...options.headers,Origin:'https://evil.invalid'}})).status,403);assert.equal(authReads,0);
    assert.equal((await fetch(url,{...options,headers:{...options.headers,Cookie:''}})).status,401);
    assert.equal((await fetch(url,{...options,headers:{...options.headers,Cookie:'other'}})).status,404);
    const response=await fetch(url,options);assert.equal(response.status,200);assert.equal((await response.json()).revision,2);
    const path=origin+'/api/song-file?id=song';assert.equal((await fetch(path,{headers:{Cookie:'other'}})).status,404);
    const head=await fetch(path,{method:'HEAD',headers:{Cookie:'own'}});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'46');
    const saved=await fetch(path,{headers:{Cookie:'own',Range:'bytes=44-45'}});assert.equal(saved.status,206);assert.equal((await saved.arrayBuffer()).byteLength,2);assert.equal(productionReads,0);
    assert.equal((await fetch(url,options)).status,200,'Same mutation retry succeeds without another revision');
  }finally{if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}f.close();}
});
test('Audio browser retry preserves exact mutation after reload; bytes are not stored in localStorage',async()=>{
  const memory=new Map(),sent=[];let failed=false;
  const setup=()=>{
    const window={},scope={window,crypto,URLSearchParams,location:{hostname:'127.0.0.1',reload(){}},document:{addEventListener(){},getElementById(){return null;}},sessionStorage:{removeItem(){}},
      localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
      fetch:async(path,options)=>{
        if(path==='/api/me')return {ok:true,json:async()=>({user:{id:'one'}})};
        sent.push({path,mime:options.headers['Content-Type'],bytes:Buffer.from(options.body).toString('hex')});
        if(!failed){failed=true;throw new Error('Lost connection');}
        return {ok:true,json:async()=>({revision:2,item:{stageRevision:2}})};
      }};
    runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),scope);return window.TursoMain;
  };
  const file=value=>({size:46,type:'audio/wav',name:'audio.wav',arrayBuffer:async()=>Uint8Array.from(wav(value)).buffer});
  const item={stageId:'song',stageRevision:1,stageScope:'profile'},bridge=setup();await bridge.fetch('/api/me');
  await assert.rejects(bridge.uploadSongAudio(item,file(0)));const pending=JSON.parse(memory.get('turso-main-pending'));
  assert.equal(pending.kind,'audio');assert.equal(pending.body.expectedRevision,1);assert.equal(pending.body.size,46);
  assert.ok(!('bytes' in pending.body)&&!('base64' in pending.body));assert.equal(memory.get('turso-main-pending').includes(sent[0].bytes),false);
  await assert.rejects(bridge.uploadSongAudio(item,file(1)));assert.equal(sent.length,1,'Different file cannot reuse uncertain intent');
  const reloaded=setup();await reloaded.fetch('/api/me');assert.equal((await reloaded.uploadSongAudio({...item,stageRevision:2},file(0))).revision,2);
  assert.deepEqual(sent[1],sent[0]);assert.equal(memory.has('turso-main-pending'),false);
});
const pdf=()=>Buffer.from('%PDF-1.7\n%fixture\n%%EOF');
test('R5 image/audio replacement and point detach: CAS, replay, neighbouring definitions and binaries retained',async()=>{
  const f=fixture();try{
    await new StudyService(f.db).createLesson(f.other,{mutationId:crypto.randomUUID(),id:'media-lesson',changes:{title:'Images and audio',published:true},blocks:[
      {id:'image',type:'image',tab:'words',cardId:null,expectedRevision:0,content:{caption:'Keep caption'}},
      {id:'audio',type:'audio',tab:'words',cardId:null,expectedRevision:0,content:{title:'Keep title'}}]});
    const service=new LessonMediaService(f.db,f.store),png=Buffer.alloc(24);png.set([137,80,78,71,13,10,26,10]);png.write('IHDR',12);
    const upload=(expectedRevision,expectedBlockRevision,mime,name)=>({mutationId:crypto.randomUUID(),expectedRevision,expectedBlockRevision,mime,name});
    const image=await service.upload(f.other,'media-lesson','image',upload(1,1,'image/png','image.png'),png);
    const audio=await service.upload(f.other,'media-lesson','audio',upload(2,1,'audio/wav','audio.wav'),wav());
    const replace=await service.upload(f.other,'media-lesson','audio',upload(3,2,'audio/wav','audio.wav'),wav(1));
    assert.notEqual(replace.media.fileId,audio.media.fileId);assert.equal(replace.block.content.title,'Keep title');
    const request={mutationId:crypto.randomUUID(),expectedRevision:4,expectedBlockRevision:2};
    await assert.rejects(service.detach(f.own,'media-lesson','image',request),e=>e.status===403);
    await assert.rejects(service.detach(f.other,'media-lesson','image',{...request,expectedRevision:3}),e=>e.status===409);
    const neighbour=f.sqlite.prepare("SELECT * FROM lesson_blocks WHERE id='audio'").get();
    const first=await service.detach(f.other,'media-lesson','image',request);assert.deepEqual(await service.detach(f.other,'media-lesson','image',request),first);
    assert.equal(first.fileDeleted,false);assert.equal(first.detached.fileId,image.media.fileId);assert.equal(first.block.content.caption,'Keep caption');assert.equal(first.block.content.fileId,undefined);
    await assert.rejects(mediaKey(f.db,f.own,'lesson',image.media.fileId),e=>e.status===404);
    assert.deepEqual(f.sqlite.prepare("SELECT * FROM lesson_blocks WHERE id='audio'").get(),neighbour);
    for(const item of [image,audio,replace])assert.equal((await f.store.response(item.media.key,'GET')).status,200);
    await service.detach(f.other,'media-lesson','audio',{mutationId:crypto.randomUUID(),expectedRevision:5,expectedBlockRevision:3});
    assert.equal((await legacyLessons(f.db,f.own)).materials[0].blocks.every(b=>!b.hasFile),true);
  }finally{f.close();}
});
const lessonBody=(lessonRevision=1,blockRevision=1)=>({...body(lessonRevision,'lesson.pdf'),expectedBlockRevision:blockRevision,mime:'application/pdf'});
async function lesson(f){
  await new StudyService(f.db).createLesson(f.other,{mutationId:crypto.randomUUID(),id:'lesson',changes:{title:'Media lesson',published:true},blocks:[
    {id:'pdf',type:'pdf',tab:'words',cardId:null,expectedRevision:0,content:{title:'PDF',caption:'Keep me'}},
    {id:'text',type:'text',tab:'words',cardId:null,expectedRevision:0,content:{text:'Untouched'}}]});
  f.sqlite.prepare('INSERT INTO lesson_responses(profile_id,lesson_id,block_id,response_json) VALUES(?,?,?,?)').run('p1','lesson','pdf',JSON.stringify({definitionRevision:1,value:'Existing response'}));
}
test('Lesson media point upload/replay/replacement preserves neighbouring blocks and learner rows',async()=>{
  const f=fixture();try{
    await lesson(f);const service=new LessonMediaService(f.db,f.store),request=lessonBody();
    const before=f.sqlite.prepare("SELECT * FROM lesson_responses").all(),neighbour=f.sqlite.prepare("SELECT * FROM lesson_blocks WHERE id='text'").get();
    await assert.rejects(service.upload(f.own,'lesson','pdf',request,pdf()),e=>e.status===403);assert.equal(readdirSync(f.directory).length,0);
    const first=await service.upload(f.other,'lesson','pdf',request,pdf());assert.equal(first.revision,2);assert.equal(first.block.revision,2);assert.equal(first.block.content.caption,'Keep me');
    assert.deepEqual(await service.upload(f.other,'lesson','pdf',request,pdf()),first);assert.equal(readdirSync(f.directory).length,2);
    assert.equal(await mediaKey(f.db,f.own,'lesson',first.media.fileId),first.media.key);
    const visible=await legacyLessons(f.db,f.own);assert.equal(visible.materials[0].blocks[0].fileId,first.media.fileId);assert.equal(visible.materials[0].blocks[0].response,undefined,'Old response is retained in SQL but not reapplied to a changed definition');
    await assert.rejects(service.upload(f.other,'lesson','pdf',lessonBody(1,2),pdf()),e=>e.status===409);
    await assert.rejects(service.upload(f.other,'lesson','pdf',lessonBody(2,1),pdf()),e=>e.status===409);
    const second=await service.upload(f.other,'lesson','pdf',lessonBody(2,2),Buffer.from('%PDF-2.0\n%replacement\n%%EOF'));assert.equal(second.revision,3);assert.equal(second.block.revision,3);
    assert.notEqual(second.media.fileId,first.media.fileId);assert.equal((await f.store.response(first.media.key,'GET')).status,200);
    await assert.rejects(mediaKey(f.db,f.own,'lesson',first.media.fileId),e=>e.status===404,'Detached old file no longer publicly resolvable');
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM lesson_responses').all(),before);assert.deepEqual(f.sqlite.prepare("SELECT * FROM lesson_blocks WHERE id='text'").get(),neighbour);
    f.sqlite.exec("UPDATE lessons SET hidden_from_students=1 WHERE id='lesson'");await assert.rejects(mediaKey(f.db,f.own,'lesson',second.media.fileId),e=>e.status===404);
    assert.equal(await mediaKey(f.db,f.other,'lesson',second.media.fileId),second.media.key);
  }finally{f.close();}
});
test('Lesson file validation rejects unsafe formats, block type mismatch and transplanted local keys',async()=>{
  const f=fixture();try{
    await lesson(f);const service=new LessonMediaService(f.db,f.store);
    await assert.rejects(lessonMediaMetadata(Buffer.from('<svg/>'),'image/svg+xml','x.svg'),e=>e.status===415);
    await assert.rejects(lessonMediaMetadata(Buffer.from('<html/>'),'application/pdf','x.pdf'),e=>e.status===415);
    await assert.rejects(service.upload(f.other,'lesson','text',lessonBody(),pdf()),e=>e.status===415);assert.equal(readdirSync(f.directory).length,0);
    const saved=await service.upload(f.other,'lesson','pdf',lessonBody(),pdf());
    f.sqlite.prepare("UPDATE lesson_blocks SET content_json=? WHERE id='pdf'").run(JSON.stringify({...saved.block.content,localMediaKey:saved.media.key.replace('/lessons/lesson/pdf/','/songs/p1/song/')}));
    await assert.rejects(mediaKey(f.db,f.own,'lesson',saved.media.fileId),e=>e.status===404);
    f.sqlite.prepare("UPDATE lesson_blocks SET content_json=? WHERE id='pdf'").run(JSON.stringify({fileId:'legacy-file'}));
    f.sqlite.prepare("UPDATE lesson_blocks SET content_json=? WHERE id='text'").run(JSON.stringify({fileId:'legacy-file'}));
    assert.equal(await mediaKey(f.db,f.own,'lesson','legacy-file'),'lessons/files/legacy-file','Existing shared legacy file IDs retain compatibility');
  }finally{f.close();}
});
test('Lesson media HTTP protects role/origin and resolves local files without R2',async()=>{
  const f=fixture();let server;try{
    await lesson(f);let reads=0;
    server=createMainServer({db:f.db,mediaStore:f.store,auth:{current:async req=>req.headers.cookie==='dev'?f.other:f.own,source:{readMedia(){reads++;throw new Error('No production fallback');}}}});
    server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
    const url=origin+'/api/lessons/lesson/blocks/pdf/media?'+new URLSearchParams({mutationId:crypto.randomUUID(),expectedRevision:'1',expectedBlockRevision:'1',name:'lesson.pdf'});
    const options={method:'POST',headers:{Origin:origin,Cookie:'dev','Content-Type':'application/pdf'},body:pdf()};
    assert.equal((await fetch(url,{...options,headers:{...options.headers,Cookie:'student'}})).status,403);
    const response=await fetch(url,options);assert.equal(response.status,200);const saved=await response.json();
    const fetched=await fetch(origin+'/api/lesson-file?id='+saved.media.fileId,{headers:{Cookie:'student'}});
    assert.equal(fetched.status,200);assert.equal(fetched.headers.get('content-type'),'application/pdf');assert.equal(await fetched.text(),pdf().toString());assert.equal(reads,0);
    assert.match(fetched.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    f.sqlite.exec("UPDATE lessons SET published=0 WHERE id='lesson'");assert.equal((await fetch(origin+'/api/lesson-file?id='+saved.media.fileId)).status,404);
  }finally{if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}f.close();}
});
test('Lesson media bridge refuses unsaved drafts; only acknowledgement advances lesson/block baselines',async()=>{
  const sent=[],window={},memory=new Map();let fail=true;
  const material={id:'lesson',title:'Media',stageRevision:1,stageBlockOrder:['pdf'],blocks:[{id:'pdf',type:'pdf',tab:'',caption:'Keep',stageBlockRevision:1,stageDefinition:{type:'pdf',tab:'',cardId:null,content:{caption:'Keep'}}}]};
  const scope={window,crypto,URLSearchParams,location:{hostname:'127.0.0.1'},document:{addEventListener(){},getElementById(){return null;}},sessionStorage:{removeItem(){}},
    localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},fetch:async(path,options)=>{
      if(path==='/api/me')return {ok:true,json:async()=>({user:{id:'dev'}})};
      if(path==='/api/lessons')return {ok:true,json:async()=>({materials:[material]})};
      sent.push(path);if(fail){fail=false;throw new Error('Lost response');}
      return {ok:true,json:async()=>({revision:2,block:{revision:2,content:{caption:'Keep',fileId:'sf_test',name:'lesson.pdf',hasFile:true}}})};
    }};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),scope);const bridge=window.TursoMain;
  await bridge.fetch('/api/me');await bridge.fetch('/api/lessons');const block=material.blocks[0],file={type:'application/pdf',name:'lesson.pdf',size:pdf().length,arrayBuffer:async()=>Uint8Array.from(pdf()).buffer};
  block.caption='Unsaved';await assert.rejects(bridge.uploadLessonFile(material,block,file));assert.equal(sent.length,0);
  block.caption='Keep';await assert.rejects(bridge.uploadLessonFile(material,block,file));assert.equal(material.stageRevision,1);assert.equal(block.fileId,undefined);
  await bridge.uploadLessonFile(material,block,file);assert.equal(sent[1],sent[0]);assert.equal(material.stageRevision,2);assert.equal(block.stageBlockRevision,2);assert.equal(block.fileId,'sf_test');
  assert.equal(material.stageLessonBaseline.blocks[0].content.fileId,'sf_test');assert.equal(memory.has('turso-main-pending'),false);
});
test('Local media backup/restore includes song and lesson binaries, even soft-deleted references; originals unchanged',async()=>{
  const f=fixture(),directory=mkdtempSync('/private/tmp/english-quiz-turso-backup-');let restored;
  try{
    await song(f);await lesson(f);
    const audio=await new SongMediaService(f.db,f.store).upload(f.own,'song',body(),wav());
    const document=await new LessonMediaService(f.db,f.store).upload(f.other,'lesson','pdf',lessonBody(),pdf());
    f.sqlite.exec("UPDATE library_items SET deleted_at=123 WHERE id='song'");
    const data=await snapshot(f.db),originals=new Map([audio.media.key,document.media.key].map(key=>[key,Buffer.from(f.store.readVerified(key).bytes)]));
    const manifest=writeLocalMediaBackup(directory,data,f.store);
    assert.equal(manifest.objects,2);assert.equal(manifest.totalBytes,wav().length+pdf().length);assert.equal(manifest.productionR2Included,false);
    assert.deepEqual(verifyLocalMediaBackup(directory,data),manifest);
    restored=await restoreLocalMediaBackup(directory,data);assert.notEqual(restored.directory,f.directory);assert.equal(restored.runtimeChanged,false);
    const store=localMediaStore(restored.directory);
    for(const [key,bytes] of originals){assert.deepEqual(store.readVerified(key).bytes,bytes);assert.deepEqual(f.store.readVerified(key).bytes,bytes);}
    const after=await snapshot(f.db);assert.deepEqual(after.schema,data.schema);assert.deepEqual(after.tables,data.tables,'Backup/restore does not mutate database rows');
  }finally{if(restored)rmSync(restored.directory,{recursive:true});rmSync(directory,{recursive:true});f.close();}
});
test('Local media archive rejects corruption, missing/duplicate references and traversal without restoring',async()=>{
  const f=fixture(),directory=mkdtempSync('/private/tmp/english-quiz-turso-backup-');
  try{
    await song(f);await new SongMediaService(f.db,f.store).upload(f.own,'song',body(),wav());const data=await snapshot(f.db);
    writeLocalMediaBackup(directory,data,f.store);const path=resolve(directory,'local-media.json'),original=readFileSync(path),manifest=JSON.parse(original);
    const missing={...manifest,objects:[]};writeFileSync(path,JSON.stringify(missing));assert.throws(()=>verifyLocalMediaBackup(directory,data),/Missing\/extra\/duplicate/);
    writeFileSync(path,JSON.stringify({...manifest,objects:[...manifest.objects,...manifest.objects]}));assert.throws(()=>verifyLocalMediaBackup(directory,data),/Missing\/extra\/duplicate/);
    const traversal=structuredClone(manifest);traversal.objects[0].file='../outside';writeFileSync(path,JSON.stringify(traversal));assert.throws(()=>verifyLocalMediaBackup(directory,data));
    writeFileSync(path,original);const binary=resolve(directory,'local-media',manifest.objects[0].file);writeFileSync(binary,wav(9));
    assert.throws(()=>verifyLocalMediaBackup(directory,data));await assert.rejects(restoreLocalMediaBackup(directory,data));
    assert.equal(f.store.readVerified(manifest.objects[0].key).bytes[44],0,'Original source binary never changed');
  }finally{rmSync(directory,{recursive:true});f.close();}
});
test('Missing local source, wrong owner keys and backup object quota fail closed; empty local archive is valid',async()=>{
  const directory=mkdtempSync('/private/tmp/english-quiz-turso-backup-'),emptyDirectory=mkdtempSync('/private/tmp/english-quiz-turso-backup-');
  try{
    const data={version:1,testOnly:true,tables:{library_items:[{id:'song',kind:'song',scope:'profile',owner_profile_id:'p1',media_key:'stage-local/songs/p1/song/'+'a'.repeat(64)}],lesson_blocks:[]}};
    assert.throws(()=>writeLocalMediaBackup(directory,data),/storage is unavailable/);assert.equal(readdirSync(directory).length,0,'Missing source does not produce a successful manifest');
    const wrong=structuredClone(data);wrong.tables.library_items[0].owner_profile_id='p2';assert.throws(()=>localMediaReferences(wrong),/different owner/);
    const many=structuredClone(data);many.tables.library_items=Array.from({length:1001},(_,i)=>({...data.tables.library_items[0],id:'s'+i,media_key:'stage-local/songs/p1/s'+i+'/'+'a'.repeat(64)}));
    assert.throws(()=>localMediaReferences(many),/object limit/);
    const empty={version:1,testOnly:true,tables:{library_items:[],lesson_blocks:[]}};assert.equal(writeLocalMediaBackup(emptyDirectory,empty).objects,0);assert.equal(verifyLocalMediaBackup(emptyDirectory,empty).totalBytes,0);
  }finally{rmSync(directory,{recursive:true});rmSync(emptyDirectory,{recursive:true});}
});
