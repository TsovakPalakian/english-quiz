import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync} from 'node:crypto';
import {PersonalService} from '../src/turso-personal.mjs';
import {ActivityService} from '../src/turso-activity.mjs';
import {StudyError} from '../src/turso-study.mjs';
import {legacyState,legacyTexts,accountThemes} from '../src/turso-legacy-read.mjs';
import {ThemeMediaService} from '../src/turso-theme-media.mjs';
import {inlineMedia,mediaKey,mediaPlaceholders,mediaRange,storedMediaResponse} from '../src/turso-media.mjs';
import worker,{StageAuth,StageAuthBudget,reserveBudget} from '../src/turso-stage-worker.mjs';
import {snapshot,restore,reverse,auditReverse} from './turso-backup.mjs';
import {migrationReview} from './turso-migration-review.mjs';
import {applyTursoSchema} from './turso-test-schema.mjs';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  applyTursoSchema(sqlite);
  sqlite.exec("INSERT INTO account_refs(id) VALUES('u1'),('u2'),('dev'); INSERT INTO study_profiles(id,kind) VALUES(1,'personal'),(2,'personal'); INSERT INTO profile_members VALUES('u1',1),('u2',2),('dev',1);");
  const args=cmd=>cmd.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value);
  const db={read:async(sql,values=[])=>sqlite.prepare(sql).all(...values),readMany:async cmds=>cmds.map(cmd=>sqlite.prepare(cmd.sql).all(...args(cmd))),atomic:async cmds=>{
    sqlite.exec('BEGIN IMMEDIATE');try{for(const cmd of cmds)sqlite.prepare(cmd.sql).run(...args(cmd));sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw new StudyError(/constraint/i.test(error.message)?409:503,'Fixture transaction failed.');}
  }};
  return {sqlite,db,own:{id:'u1',role:'USER'},other:{id:'u2',role:'USER'},dev:{id:'dev',role:'DEVELOPER'}};
}
const mutation=()=>crypto.randomUUID();
test('Shared dictionary lookup creates one definition, replays before lookup and preserves existing/shared/private data',async()=>{
  const f=fixture(),service=new PersonalService(f.db);let lookups=0;
  const data={found:true,word:'new fixture word',ru:'translation',cambridge:{pos:'adjective',uk:'ipa'},wooordhunt:{us:'ipa-us'}};
  const lookup=async()=>{lookups++;return data;},body={mutationId:mutation(),word:'new fixture word'};
  try{
    await assert.rejects(service.lookupSharedCard(f.own,body,lookup),e=>e.status===403);assert.equal(lookups,0);
    const card=await service.lookupSharedCard(f.dev,body,lookup);assert.equal(card.scope,'shared');assert.equal(lookups,1);
    assert.deepEqual(await service.lookupSharedCard(f.dev,body,lookup),card);assert.equal(lookups,1);
    const again=await service.lookupSharedCard(f.dev,{...body,mutationId:mutation()},lookup);assert.equal(again.id,card.id);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM cards WHERE scope='shared'").get().n,1);
    const stored=f.sqlite.prepare('SELECT * FROM cards WHERE id=?').get(card.id);assert.equal(JSON.parse(stored.extra_json).uk,'ipa');
    const lesson=await service.createLesson(f.dev,{mutationId:mutation(),changes:{title:'Lookup'},blocks:[{id:null,type:'wordcard',tab:'words',cardId:card.id,content:{},expectedRevision:0}]});assert.equal(lesson.revision,1);assert.equal(typeof lesson.id,'number');
    assert.equal(f.sqlite.prepare('SELECT card_id FROM lesson_blocks WHERE lesson_id=?').get(lesson.id).card_id,card.id);
    await assert.rejects(service.lookupSharedCard(f.dev,{...body,mutationId:mutation()},async()=>({found:false})),e=>e.status===404);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM cards WHERE scope='shared'").get().n,1);
  }finally{f.sqlite.close();}
});
test('Own account theme persists, overrides legacy profile theme and retains replay/CAS and pair isolation',async()=>{
  const f=fixture(),service=new PersonalService(f.db);
  try{
    f.sqlite.prepare("INSERT INTO profile_settings(profile_id,key,value_json) VALUES(1,'theme','\"almond\"')").run();
    const body={mutationId:mutation(),expectedRevision:0,theme:'mint'};
    assert.equal((await service.saveTheme(f.own,body)).revision,1);
    assert.deepEqual(await service.saveTheme(f.own,body),{theme:'mint',revision:1});
    assert.equal((await legacyState(f.db,f.own)).stats.theme,'mint');
    assert.equal((await legacyState(f.db,f.own)).stageThemeRevision,1);
    assert.equal((await legacyState(f.db,f.dev)).stats.theme,'almond','Shared profile does not share new theme choice');
    assert.equal((await legacyState(f.db,f.other)).stageThemeRevision,0);
    await assert.rejects(service.saveTheme(f.own,{...body,mutationId:mutation(),theme:'dark'}),e=>e.status===409);
    await assert.rejects(service.saveTheme(f.own,{...body,mutationId:mutation(),account_id:'u2'}),e=>e.status===400);
    await assert.rejects(service.saveTheme(f.own,{...body,mutationId:mutation(),theme:'<script>'}),e=>e.status===400);
    await service.saveTheme(f.own,{mutationId:mutation(),expectedRevision:1,theme:'dark'});
    assert.equal((await legacyState(f.db,f.own)).stats.theme,'dark');
    assert.equal((await legacyState(f.db,f.own)).stageThemeRevision,2);
    assert.equal(f.sqlite.prepare("SELECT value_json FROM profile_settings WHERE key='theme'").get().value_json,'"almond"');
  }finally{f.sqlite.close();}
});
test('A personal theme, its picture, and the selected choice survive a new session',async()=>{
  const f=fixture(),actor={...f.own,login:'Student'},uploads=[];
  const service=new ThemeMediaService(f.db,{kind:'isolated-r2-stage',putImmutable:async(...args)=>uploads.push(args)});
  try{
    const png=new Uint8Array([137,80,78,71,13,10,26,10,1]);
    const picture=await service.upload(actor,'user-gallery',png,'image/png');
    assert.equal(uploads.length,1);
    const row={id:'user-gallery',name:'My painting',owner:'Student',vars:{'--bg':'#D4EEEA','--card':'#FFFFFF','--acc':'#123456','color-scheme':'light'},photo:picture.photo};
    await service.saveCustomThemes(actor,{mutationId:mutation(),expectedRevision:0,themes:[row]});
    await service.saveTheme(actor,{mutationId:mutation(),expectedRevision:0,theme:row.id});
    const reopened=await accountThemes(f.db,actor);
    assert.equal(reopened.theme,row.id);
    assert.equal(reopened.themes.length,1);
    assert.equal(reopened.themes[0].name,row.name);
    assert.equal(reopened.themes[0].photo,picture.photo);
    assert.equal(await new ThemeMediaService(f.db,service.store).ownedKey(actor,row.id),picture.photo);
    assert.deepEqual((await accountThemes(f.db,f.other)).themes,[]);
  }finally{f.sqlite.close();}
});
test('R2 managed texts: target ownership, teacher receipts, replay, isolation and recoverable archive',async()=>{
  const f=fixture(),service=new PersonalService(f.db),teacher={id:'u1',role:'ADMIN'};
  const body={mutationId:mutation(),changes:{title:'Student text',text:'Content'}};
  const created=await service.createManagedLibrary(teacher,'u2','text',body);
  assert.equal(typeof created.id,'number');
  assert.deepEqual(await service.createManagedLibrary(teacher,'u2','text',body),created);
  assert.equal(f.sqlite.prepare('SELECT account_id FROM operation_receipts WHERE mutation_id=?').get(body.mutationId).account_id,'u1');
  assert.equal((await service.library(f.other))[0].stageId,created.id);assert.equal((await service.library(f.own)).length,0);
  await assert.rejects(service.createManagedLibrary(f.own,'u2','text',{...body,mutationId:mutation()}),e=>e.status===403);
  await assert.rejects(service.createManagedLibrary(teacher,'missing','text',{...body,mutationId:mutation()}),e=>e.status===409);
  await assert.rejects(service.createManagedLibrary(teacher,'u2','text',{...body,owner_profile_id:1}),e=>e.status===400);
  await assert.rejects(service.editManagedLibrary(teacher,'u1',created.id,'text',{mutationId:mutation(),expectedRevision:1},true),e=>e.status===404);
  await assert.rejects(service.editManagedLibrary(teacher,'u2',created.id,'text',{mutationId:mutation(),expectedRevision:2},true),e=>e.status===409);
  const archived={mutationId:mutation(),expectedRevision:1};
  const result=await service.editManagedLibrary(teacher,'u2',created.id,'text',archived,true);
  assert.deepEqual(await service.editManagedLibrary(teacher,'u2',created.id,'text',archived,true),result);
  assert.equal(result.deleted,true);assert.equal((await service.library(f.other)).length,0);
  const row=f.sqlite.prepare('SELECT * FROM library_items WHERE id=?').get(created.id);
  assert.ok(row.deleted_at);assert.equal(row.revision,2);assert.equal(JSON.parse(row.content_json).text,'Content');f.sqlite.close();
});
test('R2 managed songs: developer only, point edits, CAS and media preserved on archive',async()=>{
  const f=fixture(),service=new PersonalService(f.db),body={mutationId:mutation(),changes:{title:'Song',artist:'Artist',lyrics:'Original'}};
  for(const actor of [f.own,{id:'u1',role:'ADMIN'}])await assert.rejects(service.createManagedLibrary(actor,'u2','song',body),e=>e.status===403);
  const created=await service.createManagedLibrary(f.dev,'u2','song',body);
  f.sqlite.prepare('UPDATE library_items SET media_key=? WHERE id=?').run('songs/retained-file',created.id);
  const edit={mutationId:mutation(),expectedRevision:1,changes:{lyrics:'Changed'}};
  const result=await service.editManagedLibrary(f.dev,'u2',created.id,'song',edit);
  assert.deepEqual(await service.editManagedLibrary(f.dev,'u2',created.id,'song',edit),result);
  assert.equal(result.item.artist,'Artist');assert.deepEqual(result.item.marks,{});
  await assert.rejects(service.editManagedLibrary(f.dev,'u2',created.id,'song',{...edit,mutationId:mutation()}),e=>e.status===409);
  await assert.rejects(service.editManagedLibrary(f.dev,'u1',created.id,'song',{...edit,mutationId:mutation()}),e=>e.status===404);
  await assert.rejects(service.editManagedLibrary({id:'u1',role:'ADMIN'},'u2',created.id,'song',{...edit,expectedRevision:2,mutationId:mutation()}),e=>e.status===403);
  await service.editManagedLibrary(f.dev,'u2',created.id,'song',{mutationId:mutation(),expectedRevision:2,changes:{archived:true}});
  const row=f.sqlite.prepare('SELECT * FROM library_items WHERE id=?').get(created.id);
  assert.equal(row.media_key,'songs/retained-file');assert.equal(row.revision,3);assert.equal(JSON.parse(row.content_json).archived,true);
  assert.equal((await service.library(f.own)).length,0);f.sqlite.close();
});
test('Managed new card belongs to target, rejects duplicates and retains teacher receipt/replay',async()=>{
  const f=fixture(),service=new PersonalService(f.db),body={mutationId:mutation(),expectedRevision:0,card:{en:'New',ru:'Новый'}};
  const first=await service.createManagedCard(f.dev,'u2',body);
  assert.equal(typeof first.card.stageId,'number');
  assert.deepEqual(await service.createManagedCard(f.dev,'u2',body),first);
  assert.equal(f.sqlite.prepare('SELECT owner_profile_id FROM cards WHERE id=?').get(first.card.stageId).owner_profile_id,2);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM profile_cards WHERE profile_id=1').get().n,0);
  await assert.rejects(service.createManagedCard(f.dev,'u2',{...body,expectedRevision:1,mutationId:mutation()}),e=>e.status===409);
  await assert.rejects(service.createManagedCard(f.other,'u1',{...body,mutationId:mutation()}),e=>e.status===403);
  await assert.rejects(service.createManagedCard(f.dev,'missing',{...body,mutationId:mutation()}),e=>e.status===409);
  await assert.rejects(service.createManagedCard(f.dev,'u2',{...body,profileId:'spoof'}),e=>e.status===400);
  f.sqlite.close();
});
test('Managed card translation is private-owner scoped, CAS/replay safe and leaves links/progress intact',async()=>{
  const f=fixture(),service=new PersonalService(f.db);
  const owned=await service.createOwnCard(f.other,{mutationId:mutation(),expectedRevision:0,card:{en:'Word',ru:'Original'}});
  const cardId=owned.card.stageId;
  f.sqlite.exec("INSERT INTO cards(scope,en,word_key,ru) VALUES('shared','Shared','shared','Keep'); INSERT INTO profile_cards(profile_id,card_id,place,position) VALUES(2,2,'mine',2);");
  const body={mutationId:mutation(),expectedRevision:1,changes:{ru:'Changed'}};
  const first=await service.editManagedCard(f.dev,'u2',cardId,body);
  assert.deepEqual(await service.editManagedCard(f.dev,'u2',cardId,body),first);
  assert.equal(f.sqlite.prepare('SELECT ru FROM cards WHERE id=?').get(cardId).ru,'Changed');
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM profile_cards WHERE profile_id=2').get().n,2);
  await assert.rejects(service.editManagedCard(f.dev,'u2',cardId,{...body,mutationId:mutation()}),e=>e.status===409);
  await assert.rejects(service.editManagedCard(f.dev,'u1',cardId,{...body,mutationId:mutation()}),e=>e.status===404);
  await assert.rejects(service.editManagedCard(f.dev,'u2',2,{...body,mutationId:mutation()}),e=>e.status===404);
  await assert.rejects(service.editManagedCard(f.other,'u2',cardId,{...body,mutationId:mutation()}),e=>e.status===403);
  await assert.rejects(service.editManagedCard(f.dev,'u2',cardId,{...body,changes:{ru:'X',owner_profile_id:1}}),e=>e.status===400);
  f.sqlite.close();
});
test('Managed text edits retain actor receipts, target ownership, CAS and unrelated content',async()=>{
  const f=fixture(),service=new PersonalService(f.db);
  const target=await service.createLibrary(f.other,{mutationId:mutation(),kind:'text',changes:{title:'Student',text:'Original'}});
  await service.createLibrary(f.own,{mutationId:mutation(),kind:'text',changes:{title:'Teacher',text:'Untouched'}});
  const body={mutationId:mutation(),expectedRevision:1,changes:{text:'Changed'}};
  const first=await service.editManagedText(f.dev,'u2',target.id,body);
  assert.deepEqual(await service.editManagedText(f.dev,'u2',target.id,body),first);
  assert.equal((await service.library(f.other))[0].text,'Changed');assert.equal((await service.library(f.own))[0].text,'Untouched');
  assert.equal(first.item.title,'Student');assert.equal(first.item.analysis,null);
  const analyzed=await service.editManagedText(f.dev,'u2',target.id,{mutationId:mutation(),expectedRevision:first.revision,changes:{analysis:{expressions:[{type:'IDIOM'}],stats:null}}});
  assert.equal(analyzed.item.analysis.expressions[0].type,'IDIOM');
  const cleared=await service.editManagedText(f.dev,'u2',target.id,{mutationId:mutation(),expectedRevision:analyzed.revision,changes:{text:'Again'}});
  assert.equal(cleared.item.analysis,null);
  assert.equal(f.sqlite.prepare('SELECT account_id FROM operation_receipts WHERE mutation_id=?').get(body.mutationId).account_id,'dev');
  await assert.rejects(service.editManagedText(f.dev,'u2',target.id,{...body,mutationId:mutation()}),e=>e.status===409);
  await assert.rejects(service.editManagedText(f.dev,'u1',target.id,{...body,mutationId:mutation()}),e=>e.status===404);
  await assert.rejects(service.editManagedText(f.own,'u2',target.id,{...body,mutationId:mutation()}),e=>e.status===403);
  await assert.rejects(service.editManagedText(f.dev,'u2',target.id,{...body,mutationId:mutation(),changes:{title:'X',owner_profile_id:1}}),e=>e.status===400);
  f.sqlite.close();
});
test('Own new card: ID/replay, link CAS, private isolation, no duplicate definition or owner spoof',async()=>{
  const f=fixture(),service=new PersonalService(f.db),body={mutationId:mutation(),expectedRevision:0,card:{en:'New word',ru:'новое'}};
  const first=await service.createOwnCard(f.own,body);assert.equal(typeof first.card.stageId,'number');assert.deepEqual(await service.createOwnCard(f.own,body),first);
  assert.equal((await legacyState(f.db,f.own)).added[0].stageId,first.card.stageId);assert.equal((await legacyState(f.db,f.dev)).added[0].stageId,first.card.stageId);
  await assert.rejects(service.card(f.other,first.card.stageId),e=>e.status===404);
  await assert.rejects(service.createOwnCard(f.own,{...body,mutationId:mutation(),expectedRevision:1}),e=>e.status===409);
  await assert.rejects(service.createOwnCard(f.own,{...body,mutationId:mutation(),profileId:2}),e=>e.status===400);
  await assert.rejects(service.createOwnCard(f.own,{...body,mutationId:mutation(),card:{en:'Other',ru:'другое'}}),e=>e.status===409);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM cards').get().n,1);f.sqlite.close();
});
test('A new personal card keeps an idiom or phrasal destination',async()=>{
  const f=fixture(),service=new PersonalService(f.db);
  const idiom=await service.createOwnCard(f.own,{mutationId:mutation(),expectedRevision:0,card:{en:'break the ice',ru:'начать',place:'idioms'}});
  assert.equal(idiom.card.place,'idioms');
  assert.equal(f.sqlite.prepare('SELECT place FROM profile_cards WHERE card_id=?').get(idiom.card.stageId).place,'idioms');
  const verb=await service.createOwnCard(f.own,{mutationId:mutation(),expectedRevision:1,card:{en:'give up',ru:'сдаваться',place:'phrasal'}});
  assert.equal(verb.card.place,'phrasal');
  await assert.rejects(service.createOwnCard(f.own,{mutationId:mutation(),expectedRevision:2,card:{en:'nope',ru:'нет',place:'library'}}),error=>error.status===400);
  f.sqlite.close();
});
test('Own text/song: point edit, saved IDs and revisions, replay/stale/foreign denial, metadata/media preserved and soft delete',async()=>{
  const f=fixture(),service=new PersonalService(f.db);
  const body={mutationId:mutation(),kind:'text',changes:{title:'Title',text:"Body ' ; DROP TABLE cards; — юникод"}};
  const created=await service.createLibrary(f.own,body);assert.equal(typeof created.id,'number');assert.deepEqual(await service.createLibrary(f.own,body),created);
  assert.equal((await legacyTexts(f.db,f.own)).texts[0].stageId,created.id);assert.deepEqual((await service.library(f.other)),[]);
  const edit={mutationId:mutation(),expectedRevision:1,changes:{title:'Edited'}};
  await service.editLibrary(f.own,created.id,edit);assert.equal((await service.library(f.own))[0].text,body.changes.text);
  await assert.rejects(service.editLibrary(f.own,created.id,{...edit,mutationId:mutation()}),e=>e.status===409);
  await assert.rejects(service.editLibrary(f.other,created.id,{...edit,mutationId:mutation(),expectedRevision:2}),e=>e.status===404);
  const song=await service.createLibrary(f.own,{mutationId:mutation(),kind:'song',changes:{title:'Song',lyrics:'Words',artist:'Artist'}});
  f.sqlite.prepare("UPDATE library_items SET media_key='u1/song' WHERE id=?").run(song.id);
  await service.editLibrary(f.dev,song.id,{mutationId:mutation(),expectedRevision:1,changes:{lyrics:'New words'}});
  const marked=await service.editLibrary(f.own,song.id,{mutationId:mutation(),expectedRevision:2,changes:{marks:{'give up':{state:'new'}}}});
  assert.equal(marked.item.marks['give up'].state,'new');
  const cleared=await service.editLibrary(f.own,song.id,{mutationId:mutation(),expectedRevision:marked.revision,changes:{lyrics:'Again'}});
  assert.deepEqual(cleared.item.marks,{});
  assert.equal(await mediaKey(f.db,f.own,'song',String(song.id)),'u1/song');await assert.rejects(mediaKey(f.db,f.other,'song',String(song.id)),e=>e.status===404);
  const result=await service.editLibrary(f.own,created.id,{mutationId:mutation(),expectedRevision:2},true);assert.equal(result.revision,3);
  assert.ok(!(await service.library(f.own)).some(row=>row.stageId===created.id));assert.ok(f.sqlite.prepare('SELECT deleted_at FROM library_items WHERE id=?').get(created.id).deleted_at);
  await assert.rejects(service.createLibrary(f.own,{...body,mutationId:mutation(),changes:{title:'X',text:'X',owner_profile_id:2}}),e=>e.status===400);
  await assert.rejects(service.editLibrary(f.own,song.id,{mutationId:mutation(),expectedRevision:2,changes:{videoUrl:'javascript:alert(1)'}}),e=>e.status===400);
  f.sqlite.close();
});
test('Activity batch: replay counts once, UTC period/previous, profile isolation, no fake historical zero or foreign statistics',async()=>{
  const f=fixture(),service=new ActivityService(f.db),body={mutationId:mutation(),events:[{kind:'answer',area:'Type',result:'ok'},{kind:'exam',area:'score',result:'pass'},{kind:'duration',area:'study',result:'',seconds:60}]};
  const result=await service.events(f.own,body);assert.deepEqual(await service.events(f.own,body),result);
  const stats=await service.stats(f.own,{});assert.equal(stats.activity.answers,1);assert.equal(stats.activity.examPass,1);assert.equal(stats.activity.seconds,60);assert.equal(stats.legacyHistoryIncluded,false);
  assert.equal((await service.stats(f.other,{})).activity.tracked,false);
  await assert.rejects(service.stats(f.own,{user:'u2'}),e=>e.status===403);await assert.rejects(service.stats(f.own,{to:'invalid'}),e=>e.status===400);
  await assert.rejects(service.events(f.own,{...body,mutationId:mutation(),forUserId:'u2'}),e=>e.status===400);
  assert.ok(!Object.keys((await legacyState(f.db,f.own)).stats).some(k=>k.startsWith('activity:')));f.sqlite.close();
});
test('Inline media is owner-bound, immutable checksum metadata and unsafe SVG rejected',async()=>{
  const f=fixture(),digest='a'.repeat(64),entry={sha256:digest,file:'inline-media/'+digest+'.bin',mime:'image/png',bytes:4};
  f.sqlite.prepare('INSERT INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)').run('private-migration-media',digest,JSON.stringify(entry));
  f.sqlite.prepare('INSERT INTO profile_settings(profile_id,key,value_json) VALUES(?,?,?)').run(1,'customThemes',JSON.stringify([{image:'migration-media:'+digest}]));
  assert.deepEqual(await inlineMedia(f.db,f.own,digest),entry);await assert.rejects(inlineMedia(f.db,f.other,digest),e=>e.status===404);
  assert.equal(mediaPlaceholders({image:'migration-media:'+digest}).image,'/api/migration-media/'+digest);
  f.sqlite.prepare('UPDATE catalog_documents SET value_json=? WHERE key=?').run(JSON.stringify({...entry,mime:'image/svg+xml'}),digest);
  await assert.rejects(inlineMedia(f.db,f.own,digest),e=>e.status===415);f.sqlite.close();
});
test('Stored media: HEAD reads metadata only; Range is bounded; object metadata cannot enable caching',async()=>{
  const calls=[],object={size:4,body:'data',writeHttpMetadata(headers){headers.set('Content-Type','audio/mpeg; charset=binary');headers.set('Cache-Control','public, max-age=3600');headers.set('Content-Length','999');headers.set('Content-Range','bytes 0-998/999');}};
  const store={head:async key=>{calls.push(['HEAD',key]);return object;},get:async(key,options)=>{calls.push(['GET',key,options?.range?.get('Range')]);return object;}};
  const request=(method='GET',range='')=>new Request('https://stage.test/api/song-file?id=song',{method,headers:range?{Range:range}:{}});
  const head=await storedMediaResponse(store,'known/song',request('HEAD','bytes=2-3'));
  assert.deepEqual(calls,[['HEAD','known/song']]);assert.equal(await head.text(),'');assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'4');assert.equal(head.headers.get('content-range'),null);
  assert.equal(head.headers.get('cache-control'),'private, no-store');assert.equal(head.headers.get('cross-origin-resource-policy'),'same-origin');assert.equal(head.headers.get('content-type'),'audio/mpeg');
  for(const range of ['bytes=-','bytes=-0','bytes=3-2','bytes=0-1,2-3','bytes=9007199254740992-','items=0-1']){
    await assert.rejects(storedMediaResponse(store,'known/song',request('GET',range)),e=>e.status===400);
  }
  assert.equal(calls.length,1,'Malformed ranges do not read object storage');
  for(const range of ['bytes=0-','bytes=-2','bytes=0-3'])assert.equal(mediaRange(range),range);
  object.body='ta';object.range={offset:2,length:99};
  const partial=await storedMediaResponse(store,'known/song',request('GET','bytes=2-999'));
  assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 2-3/4');assert.equal(partial.headers.get('content-length'),'2');assert.equal(await partial.text(),'ta');
  assert.deepEqual(calls[1],['GET','known/song','bytes=2-999']);
  object.range={offset:4,length:1};const unsatisfied=await storedMediaResponse(store,'known/song',request('GET','bytes=4-'));
  assert.equal(unsatisfied.status,416);assert.equal(unsatisfied.headers.get('content-range'),'bytes */4');assert.equal(await unsatisfied.text(),'');
  object.writeHttpMetadata=headers=>headers.set('Content-Type','image/svg+xml');
  await assert.rejects(storedMediaResponse(store,'known/song',request('HEAD')),e=>e.status===415);
});
test('Backup snapshot restores all rows/FKs, reverse export preserves IDs and explicitly blocks unsafe live import',async()=>{
  const f=fixture();const created=await new PersonalService(f.db).createLibrary(f.own,{mutationId:mutation(),kind:'text',changes:{title:'Title',text:'Привет'}});
  const data=await snapshot(f.db),copy=restore(data);assert.equal(copy.prepare('SELECT count(*) n FROM library_items').get().n,1);
  const result=await reverse(copy);assert.equal(result.status,'review-required-not-for-live-import');assert.equal(result.accounts.u1.texts[0].id,created.id);assert.equal(result.accounts.u2.texts.length,0);
  assert.deepEqual(copy.prepare('PRAGMA foreign_key_check').all(),[]);copy.close();f.sqlite.close();
});
test('Reverse export preserves NULL-key quiz collections, revisions/tombstones and links; audit rejects losses',async()=>{
  const f=fixture();f.sqlite.exec(`INSERT INTO cards(scope,en,word_key,ru) VALUES('shared','word','word','first'),('shared','word','word','second');
    INSERT INTO quiz_collections(legacy_word_key,revision) VALUES(NULL,2),(NULL,3);
    INSERT INTO card_quiz_collections VALUES(1,1),(2,2);
    INSERT INTO quizzes(collection_id,position,type,items_json,revision,deleted_at) VALUES(1,0,'Flip','[]',4,NULL),(2,0,'Type','[]',5,123);`);
  const result=await reverse(f.sqlite),review=auditReverse(f.sqlite,result);
  assert.deepEqual(result.shared.cardQuizzes,{});assert.deepEqual(result.blockers.unmappedQuizCollections,[1,2]);
  assert.deepEqual(result.blockers.wordKeyCollisions[0].cardIds,[1,2]);assert.equal(review.quizzes,2);assert.equal(review.deletedQuizzes,1);assert.equal(review.cutoverAllowed,false);
  assert.equal(review.losslessIdExport,true);const copy=restore(result.idExport);assert.equal(copy.prepare('SELECT count(*) n FROM cards').get().n,2);assert.deepEqual(copy.prepare('PRAGMA foreign_key_check').all(),[]);copy.close();
  const damagedIds=structuredClone(result);damagedIds.idExport.tables.quizzes=[];assert.throws(()=>auditReverse(f.sqlite,damagedIds),/lost or changed quizzes/);
  const damaged=structuredClone(result);damaged.quizCollections[0].quizzes=[];assert.throws(()=>auditReverse(f.sqlite,damaged),/lost or changed quizzes/);
  const badLink=structuredClone(result);badLink.quizCollections[1].cardIds=[];assert.throws(()=>auditReverse(f.sqlite,badLink),/lost or changed card_quiz_collections/);
  f.sqlite.close();
});
test('R6 migration review never resolves unknown ownership or applies non-authoritative legacy caches',()=>{
  const f=fixture();f.sqlite.exec("INSERT INTO migration_runs(id,source_manifest_sha256,status) VALUES('run','fixture','verified')");
  const reasons=['unknown-lesson-response-owner','unmapped-word-progress','legacy-card-edits-not-authoritative','future-unknown-reason'];
  for(const [i,reason] of reasons.entries())f.sqlite.prepare('INSERT INTO migration_issues(id,migration_id,source_key,reason,detail_json,sensitive) VALUES(?,?,?,?,?,?)').run('issue'+i,'run','private-source',reason,'{}',1);
  const before=f.sqlite.prepare('SELECT * FROM migration_issues').all(),result=migrationReview(f.sqlite);
  assert.equal(result.quarantined,2);assert.equal(result.ownerGuesses,0);assert.equal(result.resolvedFlagsChanged,0);
  assert.equal(result.issues.find(i=>i.reason==='future-unknown-reason').decision,'manual-review-no-automatic-change');
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM migration_issues').all(),before);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM lesson_responses').get().n,0);f.sqlite.close();
});
test('TEST Worker stays closed by default and refuses other hosts and unsupported writes before D1 reads',async()=>{
  let queries=0;const env={DB:{prepare(){queries++;throw new Error('Forbidden');}}};
  assert.equal((await worker.fetch(new Request('https://stage.test/'),env)).status,503);assert.equal(queries,0);
  const enabled={...env,STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'stage.test'};
  assert.equal((await worker.fetch(new Request('https://evil.test/'),enabled)).status,403);
  assert.equal((await worker.fetch(new Request('https://stage.test/api/me/state',{method:'PUT',headers:{Origin:'https://stage.test'}}),enabled)).status,501);assert.equal(queries,0);
});
test('Worker real-password path, signed session, live role/password/revocation and persistent logout, 50 auth SELECT ceiling',async()=>{
  const id='a'.repeat(32),salt='ab'.repeat(16),password='fixture-only';let queries=0,gone=false;
  const row={id,login:'student',role:'USER',active:1,is_personal_data_revoked:0,password_salt:salt,password_hash:pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex'),password_iterations:100000};
  const memory=new Map(),ctx={storage:{transaction:async fn=>fn({get:async k=>structuredClone(memory.get(k)),put:async(k,v)=>memory.set(k,structuredClone(v))})}};
  const budget=new StageAuthBudget(ctx),env={STAGE_SESSION_SECRET:'b'.repeat(64),AUTH_BUDGET:{idFromName:()=>1,get:()=>({fetch:(url,options)=>budget.fetch(new Request(url,options))})},
    DB:{prepare(sql){return {bind(){return {async first(){assert.match(sql,/^SELECT .* FROM users WHERE /);queries++;return row;}};}};}},
    MEDIA:{head:async()=>gone?{}:null}};
  const auth=new StageAuth(env);await assert.rejects(auth.login({login:'student',password:'wrong'}),e=>e.status===401);
  const login=await auth.login({login:'student',password}),request=new Request('https://stage.test/api/me',{headers:{Cookie:login.cookie.split(';')[0]}});
  assert.equal((await auth.current(request)).role,'USER');row.role='DEVELOPER';assert.equal((await auth.current(request)).role,'DEVELOPER');
  gone=true;assert.equal(await auth.current(request),null);gone=false;const old=row.password_hash;row.password_hash='c'.repeat(64);assert.equal(await auth.current(request),null);row.password_hash=old;
  row.role='USER';Object.assign(env,{STAGE_ENABLED:'true',STAGE_WRITES:'true',STAGE_ALLOWED_HOST:'stage.test',TURSO_URL:'libsql://english-quiz-test-fixture.turso.io',TURSO_AUTH_TOKEN:'offline-only',ASSETS:{fetch:async()=>new Response('<html>public test assets</html>')}});
  const count=queries;
  const protectedHead=await worker.fetch(new Request('https://stage.test/api/song-file?id=song',{method:'HEAD'}),env);
  assert.equal(protectedHead.status,401,'HEAD media uses the protected read route, not the unsupported or public route');assert.equal(queries,count);
  const publicPage=await worker.fetch(new Request('https://stage.test/'),env);assert.equal(publicPage.status,200);assert.equal(queries,count,'No auth queries per public asset');assert.ok(publicPage.headers.get('Content-Security-Policy'));
  const pdfRenderer=await worker.fetch(new Request('https://stage.test/pdfjs/pdf.mjs'),env);
  assert.equal(pdfRenderer.status,200);assert.equal(queries,count,'Pinned PDF assets do not spend auth SELECTs');
  assert.equal((await worker.fetch(new Request('https://stage.test/pdfjs/package.json'),env)).status,501);
  assert.equal(queries,count,'Package/configuration files are not public');
  const denied=await worker.fetch(new Request('https://stage.test/api/cards/1',{method:'DELETE',headers:{Cookie:login.cookie.split(';')[0],Origin:'https://stage.test','Content-Type':'application/json'},body:JSON.stringify({mutationId:mutation(),expectedRevision:1,role:'ADMIN'})}),env);
  assert.equal(denied.status,403);assert.equal(queries,count+1,'Exactly one live users SELECT; no study D1 calls');
  await auth.logout(request);const before=queries;await assert.rejects(auth.current(request),e=>e.status===401);assert.equal(queries,before);
  let state;for(let i=0;i<50;i++){const result=reserveBudget(state,'read',1);assert.equal(result.status,200);state=result.state;}assert.equal(reserveBudget(state,'read',1).status,503);
});
