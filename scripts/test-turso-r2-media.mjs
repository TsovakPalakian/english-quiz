import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {stageR2Media,TEST_MEDIA_BUCKET,boundedMediaBytes} from '../src/turso-r2-media.mjs';
import {SongMediaService} from '../src/turso-song-media.mjs';
import {LessonMediaService} from '../src/turso-lesson-media.mjs';
import {PersonalService} from '../src/turso-personal.mjs';
import {mediaKey} from '../src/turso-media.mjs';
import {StudyError} from '../src/turso-study.mjs';
import worker from '../src/turso-stage-worker.mjs';
import {inlineAssetResponse} from '../src/turso-inline-assets.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
  const objects=new Map(),calls=[];
  const wrap=entry=>entry&&({...entry,body:new Response(entry.bytes.slice()).body});
  const bucket={async put(key,bytes,options){
    calls.push(['put',key]);assert.equal(options.onlyIf.get('if-none-match'),'*');
    if(objects.has(key))return null;
    assert.equal(options.sha256,sha(bytes));
    const item={bytes:bytes.slice(),size:bytes.length,httpMetadata:options.httpMetadata,customMetadata:options.customMetadata,
      checksums:{sha256:Uint8Array.from(options.sha256.match(/../g),b=>parseInt(b,16)).buffer}};
    objects.set(key,item);return wrap(item);
  },async get(key){calls.push(['get',key]);return wrap(objects.get(key));},async head(key){calls.push(['head',key]);return wrap(objects.get(key));}};
  const production={put(){throw new Error('Production write!');},delete(){throw new Error('Production delete!');}};
  const env={STAGE_MEDIA:bucket,MEDIA:production,STAGE_MEDIA_BUCKET:TEST_MEDIA_BUCKET};
  return {env,objects,calls,store:stageR2Media(env)};
}
const file=Buffer.from('%PDF-1.7\nfixture'),metadata={sha256:sha(file),bytes:file.length,mime:'application/pdf',name:'fixture.pdf'};
const key='stage-local/lessons/lesson/block/'+metadata.sha256;
test('Dedicated R2 immutable writes, replay and corruption never touch production or overwrite objects',async()=>{
  const f=fixture();await f.store.putImmutable(key,file,metadata);await f.store.putImmutable(key,file,metadata);
  assert.equal(f.objects.size,1);assert.deepEqual(Buffer.from((await f.store.readVerified(key)).bytes),file);
  const saved=f.objects.get(key);saved.bytes=Buffer.from('%PDF-1.7\ntamper!');
  await assert.rejects(f.store.putImmutable(key,file,metadata),e=>e.status===503);assert.equal(f.objects.get(key),saved);
  assert.throws(()=>stageR2Media({...f.env,STAGE_MEDIA:f.env.MEDIA}),e=>e.status===503);
  assert.throws(()=>stageR2Media({...f.env,STAGE_MEDIA_BUCKET:'learn-english-media'}),e=>e.status===503);
  assert.throws(()=>stageR2Media({MEDIA:f.env.MEDIA}),e=>e.status===503);
  await assert.rejects(f.store.putImmutable('lessons/files/production',file,metadata),e=>e.status===400);
});
test('Remote media HEAD/Range/inline expectations, integrity and private headers',async()=>{
  const f=fixture();await f.store.putImmutable(key,file,metadata);f.calls.length=0;
  const head=await f.store.response(key,'HEAD');assert.equal(head.headers.get('content-length'),String(file.length));assert.deepEqual(f.calls.map(c=>c[0]),['head']);
  const range=await f.store.response(key,'GET','bytes=0-3');assert.equal(range.status,206);assert.equal(await range.text(),'%PDF');assert.equal(range.headers.get('cache-control'),'private, no-store');
  assert.equal((await f.store.response(key,'GET','bytes=999-')).status,416);
  f.calls.length=0;await assert.rejects(f.store.response(key,'GET','bytes=0-1,4-5'),e=>e.status===400);assert.equal(f.calls.length,0);
  const inline='migration-inline/'+metadata.sha256;await f.store.putImmutable(inline,file,metadata);
  assert.equal((await f.store.response(inline,'GET','',metadata)).status,200);
  await assert.rejects(f.store.response(inline,'GET','',{...metadata,mime:'image/png'}),e=>e.status===503);
  f.objects.get(key).checksums={};await assert.rejects(f.store.response(key,'HEAD'),e=>e.status===503);
});
test('Binary input is bounded before storage, including missing or dishonest lengths',async()=>{
  const make=(bytes,headers={})=>new Request('https://test.invalid/',{method:'POST',body:bytes,headers,duplex:'half'});
  assert.deepEqual(Buffer.from(await boundedMediaBytes(make(file))),file);
  await assert.rejects(boundedMediaBytes(make(file,{'content-length':'26214401'})),e=>e.status===413);
  await assert.rejects(boundedMediaBytes(make(new Uint8Array(25*1024*1024+1),{'content-length':'1'})),e=>e.status===413);
  await assert.rejects(boundedMediaBytes(make(new Uint8Array())),e=>e.status===400);
});
test('Existing song/lesson services use remote store with CAS, replay, roles and profile isolation',async()=>{
  const f=fixture(),sqlite=new DatabaseSync(':memory:');
  for(const name of ['001_content_schema.sql','002_import_audit.sql'])sqlite.exec(readFileSync(new URL('../migrations/turso/'+name,import.meta.url),'utf8'));
  sqlite.exec("INSERT INTO account_refs(id) VALUES('one'),('two'); INSERT INTO study_profiles(id,kind) VALUES('p1','personal'),('p2','personal'); INSERT INTO profile_members VALUES('one','p1'),('two','p2'); INSERT INTO lessons(id,title,published) VALUES('lesson','Test',1); INSERT INTO lesson_blocks(lesson_id,id,position,type) VALUES('lesson','block',0,'pdf');");
  const values=cmd=>cmd.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value);
  const db={read:async(sql,args=[])=>sqlite.prepare(sql).all(...args),readMany:async cmds=>cmds.map(c=>sqlite.prepare(c.sql).all(...values(c))),atomic:async cmds=>{
    sqlite.exec('BEGIN');try{for(const c of cmds)sqlite.prepare(c.sql).run(...values(c));sqlite.exec('COMMIT');}catch{sqlite.exec('ROLLBACK');throw new StudyError(409,'Conflict');}}};
  const own={id:'one',role:'USER'},other={id:'two',role:'DEVELOPER'};
  try{
    await new PersonalService(db).createLibrary(own,{mutationId:crypto.randomUUID(),id:'song',kind:'song',changes:{title:'Song',lyrics:'Fixture lyrics'}});
    const wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);
    const audio={mutationId:crypto.randomUUID(),expectedRevision:1,mime:'audio/wav',name:'song.wav'};
    const songs=new SongMediaService(db,f.store),saved=await songs.upload(own,'song',audio,wav);
    assert.deepEqual(await songs.upload(own,'song',audio,wav),saved);
    assert.equal(await mediaKey(db,own,'song','song'),saved.media.key);
    await assert.rejects(songs.upload(other,'song',{...audio,mutationId:crypto.randomUUID()},wav),e=>e.status===404);
    const lessons=new LessonMediaService(db,f.store),request={mutationId:crypto.randomUUID(),expectedRevision:1,expectedBlockRevision:1,mime:'application/pdf',name:'file.pdf'};
    const writes=f.calls.filter(c=>c[0]==='put').length;
    await assert.rejects(lessons.upload(own,'lesson','block',request,file),e=>e.status===403);assert.equal(f.calls.filter(c=>c[0]==='put').length,writes);
    const uploaded=await lessons.upload(other,'lesson','block',request,file);assert.deepEqual(await lessons.upload(other,'lesson','block',request,file),uploaded);
    assert.equal(await mediaKey(db,own,'lesson',uploaded.media.fileId),uploaded.media.key);
    await assert.rejects(lessons.upload(other,'lesson','block',{...request,mutationId:crypto.randomUUID()},file),e=>e.status===409);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{sqlite.close();}
});
test('Worker media routes require authentication and origin; disabled Worker remains disabled',async()=>{
  const env={STAGE_ENABLED:'true',STAGE_WRITES:'true',STAGE_ALLOWED_HOST:'stage.invalid',TURSO_URL:'libsql://english-quiz-test-fixture.turso.io',TURSO_AUTH_TOKEN:'fake'};
  for(const path of ['/api/library/song/media','/api/lessons/lesson/blocks/block/media']){
    assert.equal((await worker.fetch(new Request('https://stage.invalid'+path,{method:'POST',headers:{Origin:'https://stage.invalid'},body:file}),env)).status,401);
    assert.equal((await worker.fetch(new Request('https://stage.invalid'+path,{method:'POST',body:file}),env)).status,403);
  }
  assert.equal((await worker.fetch(new Request('https://stage.invalid/api/migration-media/'+'a'.repeat(64)),env)).status,401);
  assert.equal((await worker.fetch(new Request('https://stage.invalid/private-migration-media/'+'a'.repeat(64)+'.bin'),env)).status,501);
  assert.equal((await worker.fetch(new Request('https://stage.invalid/'),{...env,STAGE_ENABLED:'false'})).status,503);
});
test('Protected bundled inline assets strip cookies, verify hashes and never expose a raw public path',async()=>{
  const entry={sha256:sha(file),bytes:file.length,mime:'image/jpeg'},calls=[];
  const assets={fetch:async request=>{calls.push(request);return new Response(file);}};
  const request=new Request('https://stage.invalid/api/migration-media/'+entry.sha256+'?ignored=x',{headers:{Cookie:'private session',Range:'bytes=0-3'}});
  const result=await inlineAssetResponse(assets,request,entry);assert.equal(result.status,206);assert.equal(await result.text(),'%PDF');
  assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal(calls[0].headers.has('cookie'),false);assert.equal(new URL(calls[0].url).search,'');
  await assert.rejects(inlineAssetResponse({fetch:async()=>new Response('tampered')},request,entry),e=>e.status===503);
  assert.equal((await inlineAssetResponse(assets,new Request(request.url,{method:'HEAD'}),entry)).headers.get('content-length'),String(file.length));
});
