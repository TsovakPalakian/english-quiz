import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync} from 'node:crypto';
import {once} from 'node:events';
import {runInNewContext} from 'node:vm';
import {RealStageAuth,cloudflareAccountSource} from './turso-real-auth.mjs';
import {createMainServer} from './run-turso-main.mjs';
import {mainPreview} from './turso-main-preview.mjs';
import {pdfAsset,PDF_JS_VERSION} from '../src/turso-pdf-assets.mjs';
import {legacyState,legacyLessons,publicCatalogs,publicCatalogPage,publicCatalogCard} from '../src/turso-legacy-read.mjs';
import {StudyError,StudyService,QUIZ_TYPES} from '../src/turso-study.mjs';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/turso/001_content_schema.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/turso/002_import_audit.sql',import.meta.url),'utf8'));
  sqlite.exec(`INSERT INTO account_refs(id) VALUES('teacher'),('student'),('student2');
    INSERT INTO study_profiles(id,kind) VALUES('p1','personal'),('p2','personal');
    INSERT INTO profile_members VALUES('teacher','p1'),('student','p1'),('student2','p2');
    INSERT INTO lessons(id,title,published) VALUES('lesson','Visible',1),('hidden','Hidden',0);
    INSERT INTO cards(id,scope,en,word_key,ru) VALUES('shared','shared','competitive','competitive','before'),('hidden-card','shared','hidden','hidden','hidden');
    INSERT INTO cards(id,scope,owner_profile_id,en,word_key,ru) VALUES('private','profile','p1','personal','personal','личное');
    INSERT INTO profile_cards(profile_id,card_id,place) VALUES('p1','private','mine');
    INSERT INTO lesson_blocks(lesson_id,id,position,type,tab,card_id) VALUES('lesson','block',0,'wordcard','words','shared'),('hidden','block',0,'wordcard','words','hidden-card');
    INSERT INTO lesson_responses(profile_id,lesson_id,block_id,response_json) VALUES('p1','lesson','block','"my answer"');
    INSERT INTO migration_runs(id,source_manifest_sha256,status) VALUES('run','unused','verified');
    INSERT INTO legacy_ids VALUES('card','LESSON_DATA','/words/0','shared','run');
    INSERT INTO catalog_documents(namespace,key,value_json) VALUES('static','LESSON_DATA','{"words":[{"cardId":"shared"}]}'),('static','GRAMMAR','{}'),('static','IRREGULAR','[]'),('static','TENSE_BANK','{}');`);
  const sqlArgs=statement=>statement.args.map(a=>a.type==='null'?null:a.type==='integer'?Number(a.value):a.value);
  const db={
    async read(sql,args=[]){return sqlite.prepare(sql).all(...args);},
    async readMany(statements){return statements.map(s=>sqlite.prepare(s.sql).all(...sqlArgs(s)));},
    async atomic(statements){
      sqlite.exec('BEGIN IMMEDIATE');
      try{for(const s of statements)sqlite.prepare(s.sql).run(...sqlArgs(s));sqlite.exec('COMMIT');}
      catch(error){sqlite.exec('ROLLBACK');throw new StudyError(/constraint/i.test(error.message)?409:503,'Fixture transaction failed');}
    }
  };
  const salt='ab'.repeat(16),password='fixture-only';
  const hash=pbkdf2Sync(password,Buffer.from(salt,'hex'),100_000,32,'sha256').toString('hex');
  const users=new Map(['teacher','student','student2'].map(id=>[id,{id,login:id,email:id+'@example.invalid',name:id,role:id==='teacher'?'ADMIN':'USER',password_salt:salt,password_hash:hash,password_iterations:100_000,active:1,is_personal_data_revoked:0,created_at:1}]));
  let queries=0;const gone=new Set();
  const source={byLogin:async login=>{queries++;return users.get(login)||null;},byId:async id=>{queries++;return users.get(id)||null;},gone:async id=>gone.has(id)};
  return {sqlite,db,source,users,gone,password,queries:()=>queries};
}
test('Public catalog pages are bounded, cursor-based, compact and exclude private dictionaries',async()=>{
  const f=fixture();try{
    f.sqlite.prepare('UPDATE cards SET extra_json=? WHERE id=?').run(JSON.stringify({data:{links:{url:'large'},usages:['kept']}}),'shared');
    f.sqlite.exec("INSERT INTO legacy_ids VALUES('card','LESSON_DATA','/words/1','hidden-card','run');");
    const first=await publicCatalogPage(f.db,'LESSON_DATA',{limit:1});
    assert.equal(first.cards.length,1);assert.ok(first.next);assert.ok(first.documents.LESSON_DATA);
    const second=await publicCatalogPage(f.db,'LESSON_DATA',{limit:1,after:first.next});
    assert.equal(second.cards.length,1);assert.equal(second.next,null);assert.deepEqual(second.documents,{});
    assert.notEqual(first.cards[0].stageId,second.cards[0].stageId);
    const compact=[...first.cards,...second.cards].find(row=>row.stageId==='shared');
    assert.equal(compact.stageDataDeferred,true);assert.equal(compact.data.links,undefined);assert.deepEqual(compact.data.usages,['kept']);
    assert.deepEqual((await publicCatalogCard(f.db,'shared')).data.links,{url:'large'});
    await assert.rejects(publicCatalogCard(f.db,'private'),e=>e.status===404);
    await assert.rejects(publicCatalogPage(f.db,'LESSON_DATA',{limit:61}),e=>e.status===400);
    await assert.rejects(publicCatalogPage(f.db,'private'),e=>e.status===400);
  }finally{f.sqlite.close();}
});
test('Lesson summaries omit all blocks; one-lesson loading preserves access and learner responses',async()=>{
  const f=fixture();try{
    const actor={id:'student',role:'USER'},summary=await legacyLessons(f.db,actor,{summary:true});
    assert.equal(summary.materials.length,1);assert.deepEqual(summary.materials[0].blocks,[]);assert.equal(summary.materials[0].stageLessonDeferred,true);
    assert.equal(summary.materials[0].wordCount,1);assert.equal(summary.materials[0].phraseCount,0);assert.equal(summary.materials[0].ruleCount,0);
    const detail=await legacyLessons(f.db,actor,{lessonId:'lesson'});
    assert.equal(detail.materials.length,1);assert.equal(detail.materials[0].blocks[0].response,'my answer');
    assert.equal(detail.materials[0].wordCount,1);assert.equal(detail.materials[0].phraseCount,0);assert.equal(detail.materials[0].ruleCount,0);
    await assert.rejects(legacyLessons(f.db,actor,{lessonId:'hidden'}),e=>e.status===404);
    assert.equal((await legacyLessons(f.db,{id:'student2',role:'USER'},{lessonId:'lesson'})).materials[0].blocks[0].response,undefined);
  }finally{f.sqlite.close();}
});
test('Catalog loader uses paged endpoints, registers before starting UI and coalesces deferred tense loads',async()=>{
  const calls=[],loaded=[],window={TursoMain:{register:rows=>loaded.push(rows)}};
  const scope={window,Map,Promise,AbortSignal,encodeURIComponent,
    fetch:async path=>{calls.push(path);const key=path.split('/').at(-1);return {ok:true,json:async()=>({documents:{[key]:[{cardId:key}]},cards:[{stageId:key,en:key}],next:null})};},
    document:{getElementById:()=>null,createElement:()=>({}),body:{append:script=>{assert.equal(loaded.length,1);assert.equal(script.src,'/preview.js');script.onload();}}}};
  runInNewContext(readFileSync(new URL('../production/catalog-loader.js',import.meta.url),'utf8'),scope);
  await window.TursoCatalogReady;
  assert.equal(window.LESSON_DATA[0].stageId,'LESSON_DATA');assert.equal(calls.length,4);
  const [a,b]=await Promise.all([window.TursoLoadCatalog('TENSE_BANK'),window.TursoLoadCatalog('TENSE_BANK')]);
  assert.equal(a,b);assert.equal(calls.length,5);assert.ok(calls.every(path=>path.startsWith('/api/catalogs/')));
});
test('Tense bank does not load at startup, coalesces first use, and ignores a closed view',async()=>{
  const generated=mainPreview(readFileSync(new URL('../preview.js',import.meta.url),'utf8'),readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'));
  const start=generated.indexOf('    let tenseBank = {};'),end=generated.indexOf('    function markerLinks(card)',start);
  assert.doesNotMatch(generated.slice(start,end),/fetch\(|TursoLoadCatalog\(/);
  assert.doesNotMatch(generated,/fetch\("tense-bank\.json"\)/);
  const pending=[],painted=[];let section='tense',requests=0;
  const scope={tenseBank:{},tenseBankReady:false,viewGen:1,openTenseId:'ps',openMarkerName:'today',
    openTopic:id=>painted.push(id),openMarker:id=>painted.push(id),
    document:{addEventListener(){},querySelector:()=>({id:section})},window:{TursoLoadCatalog:()=>{requests++;return new Promise(resolve=>pending.push(resolve));},TursoMain:{notice(){}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  assert.equal(requests,0);
  const first=scope.stageLoadTenseView('tense','ps'),second=scope.stageLoadTenseView('marker','today');
  assert.equal(requests,1);section='home';pending.shift()({ps:{markers:[]}});await Promise.all([first,second]);
  assert.deepEqual(painted,[]);assert.equal(scope.tenseBankReady,true);
  section='tense';await scope.stageLoadTenseView('tense','ps');assert.deepEqual(painted,['ps']);assert.equal(requests,1);
});
test('Lazy lesson open coalesces clicks, guards navigation/profile changes, and never trusts disk-cached answers',async()=>{
  const pending=[],opened=[],root={},material={id:'lesson',stageRevision:1,stageLessonDeferred:true};let section='days';
  const scope={authUser:{id:'student'},accountReady:true,viewSwitching:false,viewGen:1,viewAccount:null,lmLibrary:{materials:[material]},
    lmLessonVisibleToViewer:()=>true,accountFetch:path=>new Promise(resolve=>pending.push({path,resolve})),lmOpenLesson:id=>opened.push(id),
    lmApplyRemote(rows){scope.lmLibrary.materials=rows;},
    document:{addEventListener(){},getElementById:()=>root,querySelector:()=>({id:section})},window:{TursoMain:{notice(){}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  const first=scope.stageOpenLesson(material),second=scope.stageOpenLesson(material);
  assert.equal(pending.length,1);assert.equal(root.inert,true);
  pending.shift().resolve({materials:[{id:'lesson',stageRevision:1,blocks:[{response:'own'}]}]});await Promise.all([first,second]);
  assert.deepEqual(opened,['lesson']);assert.equal(root.inert,false);
  const disk={id:'lesson',stageRevision:1,stageLessonOwner:'student:',blocks:[{response:'old disk answer'}]};scope.lmLibrary.materials=[disk];
  const pull=scope.stagePullLessons();assert.match(pending[0].path,/summary=1$/);
  pending.shift().resolve({materials:[material]});await pull;assert.equal(scope.lmLibrary.materials[0].stageLessonDeferred,true);
  const stale=scope.stageOpenLesson(scope.lmLibrary.materials[0]);section='home';pending.shift().resolve({materials:[disk]});await stale;assert.equal(opened.length,1);
  section='days';const switched=scope.stageOpenLesson(scope.lmLibrary.materials[0]);scope.viewGen++;scope.authUser={id:'student2'};
  pending.shift().resolve({materials:[disk]});await switched;assert.equal(opened.length,1);
});
test('Staging word rendering preserves the displayed identity across catalog refresh',()=>{
  const source=mainPreview(readFileSync(new URL('../preview.js',import.meta.url),'utf8'),readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'));
  const start=source.indexOf('    function renderWord(w) {'),end=source.indexOf('    function setDayFlip(w, open) {',start);
  assert.ok(start>=0&&end>start);
  const elements={wordView:{},toDayFlip:{},back:{dataset:{}}};
  const context={current:{en:'humid'},card:{en:'gardening',ru:'садоводство'},
    document:{getElementById:id=>elements[id],querySelector:()=>elements.back},
    catalogEditHtml:()=>'',wordPic:()=>'',esc:value=>value||'',ipaHtml:()=>'',clipLine:()=>'',clipOf:()=>'',meaningOf:()=>'',cardLinks:()=>'',cardQuizHtml:()=>''};
  runInNewContext(source.slice(start,end)+'\nrenderWord(card);renderWord(current);',context);
  assert.equal(context.current,context.card);
  assert.match(elements.wordView.innerHTML,/gardening/);assert.doesNotMatch(elements.wordView.innerHTML,/humid/);
});
test('Real password check, live roles, disable/revoke/password change, logout and rate bound',async()=>{
  const f=fixture(),auth=new RealStageAuth(f.source);
  const req=token=>({headers:{cookie:'turso_real='+token}});
  await assert.rejects(auth.login({login:'teacher',password:'wrong'}),e=>e.status===401);
  await assert.rejects(auth.login({login:'teacher',password:f.password,role:'DEVELOPER'}),e=>e.status===400);
  const session=await auth.login({login:'teacher',password:f.password});
  assert.equal((await auth.current(req(session.token))).role,'ADMIN');
  f.users.get('teacher').role='USER';assert.equal((await auth.current(req(session.token))).role,'USER');
  f.users.get('teacher').active=0;assert.equal(await auth.current(req(session.token)),null);
  f.users.get('teacher').active=1;
  const second=await auth.login({login:'teacher',password:f.password});
  f.users.get('teacher').password_hash='cd'.repeat(32);assert.equal(await auth.current(req(second.token)),null);
  const student=await auth.login({login:'student',password:f.password});
  f.gone.add('student');assert.equal(await auth.current(req(student.token)),null);f.gone.delete('student');
  const relogin=await auth.login({login:'student',password:f.password});auth.logout(req(relogin.token));
  const before=f.queries();assert.equal(await auth.current(req(relogin.token)),null);assert.equal(f.queries(),before);
  const rate=new RealStageAuth(f.source);for(let i=0;i<8;i++)await assert.rejects(rate.login({login:'absent',password:f.password}),e=>e.status===401);
  const reads=f.queries();await assert.rejects(rate.login({login:'absent',password:f.password}),e=>e.status===429);assert.equal(f.queries(),reads);
  f.sqlite.close();
});
test('Compatibility projection: profile pair, foreign private data, response and draft isolation',async()=>{
  const f=fixture(),teacher=f.users.get('teacher'),student=f.users.get('student'),other=f.users.get('student2');
  const first=await legacyState(f.db,student),shared=await legacyState(f.db,teacher),second=await legacyState(f.db,other);
  assert.equal(first.stageProfile,shared.stageProfile);assert.equal(first.added[0].word,'personal');assert.deepEqual(second.added,[]);
  const mine=await legacyLessons(f.db,student),theirs=await legacyLessons(f.db,other);
  assert.equal(mine.materials.length,1);assert.equal(mine.materials[0].blocks[0].response,'my answer');
  assert.equal(theirs.materials[0].blocks[0].response,undefined);assert.equal((await legacyLessons(f.db,teacher)).materials.length,2);
  assert.equal((await publicCatalogs(f.db)).LESSON_DATA.words[0].stageId,'shared');
  await new StudyService(f.db).deleteCard(teacher,'shared',{mutationId:crypto.randomUUID(),expectedRevision:1});
  assert.deepEqual((await publicCatalogs(f.db)).LESSON_DATA.words,[]);assert.equal((await legacyLessons(f.db,student)).materials[0].blocks.length,0);
  f.sqlite.close();
});
test('All original quiz type names are supported without legacy whole-map writes',async()=>{
  const f=fixture(),service=new StudyService(f.db);let collection=0;
  for(const type of QUIZ_TYPES){
    await service.createQuiz(f.users.get('teacher'),'shared',{mutationId:crypto.randomUUID(),expectedRevision:1,expectedCollectionRevision:collection,quiz:{type,items:[{front:'fixture',back:'test'}]}});
    collection=collection===0?1:collection+1;
  }
  assert.equal((await service.card(f.users.get('student'),'shared')).quizzes.length,QUIZ_TYPES.length);f.sqlite.close();
});
test('Personal card links: shared identity, own/pair isolation, monotonic CAS, replay and progress preservation',async()=>{
  const f=fixture(),service=new StudyService(f.db),student=f.users.get('student'),other=f.users.get('student2');
  const body={mutationId:crypto.randomUUID(),cardId:'shared',place:'mine',expectedRevision:0,expectedCardRevision:1};
  const baseline=f.sqlite.prepare('SELECT count(*) n FROM cards').get().n;
  const first=await service.linkCard(student,body);
  assert.deepEqual(await service.linkCard(student,body),first);
  assert.equal(first.card.stageId,'shared');assert.equal(first.card.word,'competitive');
  const own=await legacyState(f.db,student),pair=await legacyState(f.db,f.users.get('teacher'));
  assert.equal(own.stageAddedRevision,1);assert.equal(pair.stageAddedRevision,1);
  assert.equal(own.stats.tursoCardLinks,undefined);assert.equal(own.added[0].stageLinksRevision,1);
  assert.ok(own.added.some(row=>row.stageId==='shared'));assert.deepEqual((await legacyState(f.db,other)).added,[]);
  await service.linkCard(other,{...body,mutationId:crypto.randomUUID()});
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM cards').get().n,baseline,'Only references, not duplicate definitions');
  await assert.rejects(service.linkCard(other,{...body,mutationId:crypto.randomUUID(),cardId:'private',expectedRevision:1}),e=>e.status===404);
  await assert.rejects(service.linkCard(student,{...body,mutationId:crypto.randomUUID(),cardId:'hidden-card',expectedRevision:1}),e=>e.status===404);
  await assert.rejects(service.linkCard(student,{...body,mutationId:crypto.randomUUID(),profileId:'p2'}),e=>e.status===400);
  await assert.rejects(service.linkCard(student,{...body,mutationId:crypto.randomUUID(),place:'phrasal'}),e=>e.status===409);
  await assert.rejects(service.linkCard(student,{...body,mutationId:crypto.randomUUID(),expectedRevision:1}),e=>e.status===409);
  assert.equal((await legacyState(f.db,student)).stageAddedRevision,1,'Failed duplicate rolls back the version');
  f.sqlite.exec("INSERT INTO card_progress(profile_id,card_id,learned) VALUES('p1','shared',1)");
  const remove={mutationId:crypto.randomUUID(),place:'mine',expectedRevision:1};
  assert.equal((await service.unlinkCard(student,'shared',remove)).revision,2);
  assert.equal((await service.unlinkCard(student,'shared',remove)).revision,2);
  assert.ok(!(await legacyState(f.db,student)).added.some(row=>row.stageId==='shared'));
  assert.ok((await legacyState(f.db,other)).added.some(row=>row.stageId==='shared'));
  assert.equal((await service.card(student,'shared')).revision,1);
  assert.equal(f.sqlite.prepare("SELECT learned FROM card_progress WHERE profile_id='p1' AND card_id='shared'").get().learned,1);
  await service.linkCard(student,{...body,mutationId:crypto.randomUUID(),expectedRevision:2});
  await assert.rejects(service.unlinkCard(student,'shared',{...remove,mutationId:crypto.randomUUID()}),e=>e.status===409,'Delete/re-add does not reset CAS (no ABA)');
  await assert.rejects(service.unlinkCard(other,'private',{...remove,mutationId:crypto.randomUUID()}),e=>e.status===409);
  assert.equal((await legacyState(f.db,other)).stageAddedRevision,1);
  const atomic=f.db.atomic;let dropped=false;
  f.db.atomic=async commands=>{await atomic(commands);if(!dropped){dropped=true;throw new StudyError(503,'Lost after commit');}};
  const saved=await service.unlinkCard(student,'shared',{...remove,mutationId:crypto.randomUUID(),expectedRevision:3});
  assert.equal(saved.revision,4);assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  f.sqlite.close();
});
test('Personal card HTTP: own USER links, point removal and no client-supplied owner',async()=>{
  const f=fixture(),server=createMainServer({db:f.db,auth:new RealStageAuth(f.source)});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  let cookie='';const call=async(path,method='GET',body)=>{
    const r=await fetch(origin+path,{method,headers:{Origin:origin,Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;
  };
  try{
    const body={mutationId:crypto.randomUUID(),cardId:'shared',place:'mine',expectedRevision:0,expectedCardRevision:1};
    assert.equal((await call('/api/me/cards','POST',body)).status,401);
    assert.equal((await call('/api/login','POST',{login:'student',password:f.password})).status,200);
    assert.equal((await call('/api/cards?exact=1&q=comp')).status,200);
    assert.deepEqual(await (await call('/api/cards?exact=1&q=comp')).json(),[]);
    const before=f.queries();assert.equal((await call('/api/me/cards','POST',body)).status,200);assert.equal(f.queries()-before,1);
    assert.equal((await call('/api/cards/shared','DELETE',{mutationId:crypto.randomUUID(),expectedRevision:1})).status,403);
    assert.equal((await call('/api/me/cards/shared','DELETE',{mutationId:crypto.randomUUID(),place:'mine',expectedRevision:1})).status,200);
    assert.equal((await call('/api/cards/shared')).status,200);
    assert.equal((await call('/api/me/state','PUT',{op:'put-card',card:{}})).status,501);
  }finally{await new Promise(resolve=>server.close(resolve));f.sqlite.close();}
});
test('Main HTTP: real login, point Save, no persona or production write fallback, CSRF and live demotion',async()=>{
  const f=fixture(),auth=new RealStageAuth(f.source),server=createMainServer({db:f.db,auth});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  let cookie='';const call=async(path,method='GET',body,extra={})=>{
    const r=await fetch(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
    if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;
  };
  try{
    assert.equal((await (await call('/api/me')).json()).user,null);assert.equal(f.queries(),0);
    assert.equal((await call('/api/me/state')).status,401);
    assert.equal((await call('/api/test/session','POST',{persona:'teacher'})).status,501);
    assert.equal((await call('/api/login','POST',{login:'teacher',password:f.password})).status,200);
    const before=f.queries();const state=await call('/api/me/state');assert.equal(state.status,200);assert.equal(f.queries()-before,1);
    assert.equal((await call('/api/cards/shared','PATCH',{mutationId:crypto.randomUUID(),expectedRevision:1,changes:{ru:'saved'}})).status,200);
    assert.equal((await (await call('/api/cards/shared')).json()).ru,'saved');
    const baseline=f.queries();
    assert.equal((await call('/api/me/state','PUT',{op:'put-setting',key:'cardQuizzes',value:{}})).status,501);
    assert.equal((await call('/api/lessons','PUT',{materials:[]})).status,501);
    assert.equal((await call('/api/register','POST',{})).status,501);assert.equal(f.queries(),baseline);
    f.users.get('teacher').role='USER';
    assert.equal((await call('/api/cards/shared','DELETE',{mutationId:crypto.randomUUID(),expectedRevision:2})).status,403);
    assert.equal((await call('/api/logout','POST',{}, {Origin:'https://evil.invalid'})).status,403);
    assert.equal((await call('/.dev.vars')).status,404);
    const script=await (await call('/preview.js')).text();new Function(script);assert.match(script,/stageSaveTranslation/);
    const html=await (await call('/')).text();assert.match(html,/TEST Turso/);assert.ok(!html.includes('fonts.googleapis.com'));
    assert.equal((await call('/api/logout','POST',{})).status,200);assert.equal((await (await call('/api/me')).json()).user,null);
  }finally{await new Promise(resolve=>server.close(resolve));f.sqlite.close();}
});
test('Production auth provider has fixed users SELECTs, bounded requests, no retries/DDL',async()=>{
  const sent=[];
  const source=cloudflareAccountSource({limit:2,tokenProvider:()=> 'offline-only',fetchImpl:async(url,options)=>{
    sent.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});
    return new Response(JSON.stringify({success:true,result:[{success:true,results:[]}]}),{status:200});
  }});
  await source.byLogin("x' OR 1=1 --");await source.byId('known-id');
  await assert.rejects(source.byLogin('third'),e=>e.status===503);assert.equal(sent.length,2);
  for(const req of sent){assert.equal(req.method,'POST');assert.match(req.body.sql,/^SELECT .* FROM users WHERE/);assert.ok(!/CREATE|UPDATE|DELETE|user_state|sessions/.test(req.body.sql));}
  assert.deepEqual(sent[0].body.params,["x' OR 1=1 --","x' or 1=1 --"]);
});
test('Read-only R2 provider rejects malformed ranges before requests and forwards only a valid GET',async()=>{
  const sent=[],source=cloudflareAccountSource({tokenProvider:()=> 'offline-only',fetchImpl:async(url,options)=>{
    sent.push({url,method:options.method,range:options.headers.Range});return new Response('data',{headers:{'Content-Type':'audio/mpeg'}});
  }});
  for(const range of ['bytes=-','bytes=-0','bytes=5-4','bytes=0-1,2-3'])await assert.rejects(source.readMedia('songs/known',range),e=>e.status===400);
  await assert.rejects(source.readMedia('../private',''),e=>e.status===400);assert.equal(sent.length,0);
  const response=await source.readMedia('songs/known','bytes=0-3');await response.body.cancel();
  assert.equal(sent.length,1);assert.equal(sent[0].method,'GET');assert.equal(sent[0].range,'bytes=0-3');
  assert.ok(sent[0].url.endsWith('/r2/buckets/learn-english-media/objects/songs/known'));assert.equal(source.health().d1AuthQueries,0);
});
test('Main source hooks are exact, syntax-valid, original files never rewritten',()=>{
  const original=readFileSync(new URL('../preview.js',import.meta.url),'utf8'),hooks=readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8');
  new Function(mainPreview(original,hooks));assert.equal(readFileSync(new URL('../preview.js',import.meta.url),'utf8'),original);
  assert.match(mainPreview(original,hooks),/lmInsertBlockFront\(\{ id: lmId\(\), type: "rule", tab: "rules"[\s\S]{0,500}Rule added\. Click Save draft or Publish\./);
  assert.throws(()=>mainPreview(original.replace('function saveCardEdit(host)','function movedSaveCardEdit(host)'),hooks));
  const quizId='quiz_'+'a'.repeat(64),scope={document:{addEventListener(){}},result:null,value:{competitive:[{id:quizId,type:'Flip',items:[{}]}]}};
  runInNewContext(hooks+'\nresult=stageQuizMap(value);',scope);
  assert.equal(scope.result.competitive[0].id,quizId,'Imported 69-character ID must not be truncated by the legacy UI');
});
test('Stage PDF viewer renders with same-origin pinned assets and rejects unsafe URLs',async()=>{
  const elements=new Map(['pdfTitle','pdfStatus','pdfPages'].map(id=>[id,{children:[],replaceChildren(){this.children=[];},append(...nodes){this.children.push(...nodes);}}]));
  const notices=[],scope={URL,location:{origin:'http://127.0.0.1:8000'},window:{TursoMain:{notice:(...v)=>notices.push(v)}},
    document:{addEventListener(){},getElementById:id=>elements.get(id),createElement:tag=>({tag,style:{},getContext:()=>({})})},visit:view=>{scope.view=view;}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  let options;
  scope.fixturePdf={getDocument:value=>{options=value;return {destroy:async()=>{},promise:Promise.resolve({numPages:1,getPage:async()=>({getViewport:({scale})=>({width:300*scale,height:160*scale}),render:()=>({promise:Promise.resolve()}),cleanup(){}})})};}};
  runInNewContext('stageLoadPdf=async()=>fixturePdf;',scope);
  await runInNewContext("stageOpenPdf('/api/lesson-file?id=sf_fixture','Fixture <PDF>');",scope);
  assert.equal(scope.view,'pdfview');assert.equal(elements.get('pdfTitle').textContent,'Fixture <PDF>');
  const [link,canvas]=elements.get('pdfPages').children;
  assert.equal(link.rel,'noopener noreferrer');assert.equal(canvas.tag,'canvas');assert.equal(options.url,'/api/lesson-file?id=sf_fixture');
  assert.equal(options.isEvalSupported,false);assert.equal(options.useWasm,false);assert.equal(elements.get('pdfStatus').textContent,'1 page');
  assert.equal(notices.length,0);
  const original=readFileSync(new URL('../preview.js',import.meta.url),'utf8');
  assert.match(mainPreview(original,''),/async function openPdf\(href, title\) \{\s+return stageOpenPdf\(href,title\);/);
  for(const href of ['https://outside.invalid/file.pdf','javascript:alert(1)','/api/lesson-file?id=x&for=other','/api/lesson-file?id=x&id=y','/api/lesson-file?id=x#frag','/api/me','/pdf/../private.pdf','http://user:password@127.0.0.1:8000/pdf/test.pdf']){
    scope.href=href;await runInNewContext("stageOpenPdf(href,'Bad');",scope);
  }
  assert.equal(notices.length,8);assert.equal(elements.get('pdfPages').children[1],canvas,'Unsafe address cannot replace viewer');
});
test('PDF assets expose only renderer/worker/maps/fonts/decoders, never traversal or secrets',()=>{
  assert.equal(PDF_JS_VERSION,'6.4.299');assert.equal(pdfAsset('/pdfjs/pdf.mjs').file,'legacy/build/pdf.mjs');
  assert.equal(pdfAsset('/pdfjs/standard_fonts/FoxitSerif.pfb').mime,'application/octet-stream');
  for(const path of ['/pdfjs/../.dev.vars','/pdfjs/package.json','/pdfjs/pdf.mjs.map','/pdfjs/wasm/../password','/pdfjs/cmaps/secret.json','/pdfjs/wasm/%2e%2e.js'])assert.equal(pdfAsset(path),null);
});
test('Stage statistics separate Turso activity from history and hide unsupported global filters',()=>{
  const elements={statsRole:{hidden:false,value:'USER'},statsUser:{hidden:false,value:'other'},statsSub:{}};
  const scope={viewAccount:null,document:{addEventListener(){},getElementById:id=>elements[id]}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8')+'\nstageStatsIntro();',scope);
  assert.equal(elements.statsRole.hidden,true);assert.equal(elements.statsUser.hidden,true);
  assert.equal(elements.statsRole.value,'');assert.equal(elements.statsUser.value,'');
  assert.match(elements.statsSub.textContent,/new Turso activity only/);
});
test('R3 answer coverage: all checked game types except Flip, no-card questions and teacher inspection',()=>{
  const events=[],answers=[],scope={authUser:{id:'student',role:'USER'},accountReady:true,viewSwitching:false,viewAccount:null,
    document:{addEventListener(){}},window:{TursoMain:{event:(...args)=>events.push(args),answer:(...args)=>answers.push(args),notice(){}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  for(const type of QUIZ_TYPES)scope.stageNoteAnswer({type,card:{en:'Word'}},true);
  assert.equal(events.length,QUIZ_TYPES.length-1);assert.equal(answers.length,events.length);
  scope.stageNoteAnswer({type:'Choice'},false);assert.deepEqual(events.at(-1),['answer','Choice','miss']);assert.equal(answers.length,QUIZ_TYPES.length-1);
  scope.viewAccount={id:'other'};scope.stageNoteAnswer({type:'Type',card:{}},true);assert.equal(events.length,QUIZ_TYPES.length);
});
test('R3 generated dictionary quizzes count changed attempts once and skip foreign profiles',()=>{
  const events=[],scope={madeItem:{stageId:'card'},authUser:{id:'student'},accountReady:true,viewAccount:null,viewSwitching:false,
    trackEvent:(...args)=>events.push(args),document:{addEventListener(){}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  scope.stageMadeAnswer('Type','en',false,'bad');scope.stageMadeAnswer('Type','en',false,'bad');scope.stageMadeAnswer('Type','en',true,'good');
  assert.equal(events.length,2);scope.viewAccount={id:'other'};scope.stageMadeAnswer('Choice','en',true,'answer');assert.equal(events.length,2);
});
test('R3 duration tracks actual day quiz screen, flushes final visible seconds and excludes managed study',()=>{
  const events=[];let now=1000;const scope={Date:{now:()=>now},authUser:{id:'student'},accountReady:true,viewAccount:null,viewSwitching:false,
    document:{hidden:false,addEventListener(){},querySelector:()=>({id:'dayq'})},window:{TursoMain:{event:(...args)=>events.push(args),notice(){}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  scope.stageRecordTime();now=11000;scope.document.hidden=true;scope.stageRecordTime(true);assert.deepEqual(events[0],['duration','study','',10]);
  now=21000;scope.stageRecordTime(true);assert.equal(events.length,1);
  scope.document.hidden=false;scope.viewAccount={id:'foreign'};scope.stageRecordTime();now=31000;scope.stageRecordTime(true);assert.equal(events.length,1);
});
test('R3 confirmed lesson response counters use server score/marks only, never another profile',()=>{
  const listeners={},events=[],scope={authUser:{id:'student'},viewAccount:null,viewSwitching:false,lmState:null,trackEvent:(...args)=>events.push(args),
    document:{addEventListener:(key,fn)=>listeners[key]=fn}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  const saved=detail=>listeners['turso-personal-saved']({detail});
  saved({job:{kind:'response',actorId:'student'},result:{response:{checked:true,score:'1 / 2',items:[{},{}]}}});assert.deepEqual(events,[['answer','Lesson quiz','ok'],['answer','Lesson quiz','miss']]);
  saved({job:{kind:'response',actorId:'student'},result:{response:{checked:true,items:[{marked:true,correct:true}]}}});assert.equal(events.length,3);
  saved({job:{kind:'response',actorId:'student'},result:{response:{checked:false,items:[{}]}}});assert.equal(events.length,3);
  scope.viewAccount={id:'other'};saved({job:{kind:'response',actorId:'student'},result:{response:{checked:true,score:'1 / 1',items:[{}]}}});assert.equal(events.length,3);
});
test('R3 statistics select the managed endpoint and ignore late profile responses',async()=>{
  const pending=[],paths=[],elements={statsBody:{},statsRole:{},statsUser:{},statsSub:{},statsFrom:{value:'2026-10-01'},statsTo:{value:'2026-10-05'},statsCompare:{checked:false}};
  const scope={URLSearchParams,statsToken:0,viewGen:1,authUser:{role:'ADMIN'},accountReady:true,viewSwitching:false,viewAccount:{id:'b'.repeat(32)},
    renderStats:()=>'<p>confirmed</p>',accountFetch:path=>{paths.push(path);return new Promise(resolve=>pending.push(resolve));},
    document:{addEventListener(){},getElementById:id=>elements[id]}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  const load=scope.stagePaintStats();assert.match(paths[0],/^\/api\/admin\/users\/b+\/stats\?/);
  pending.shift()({statisticsSource:'turso-activity',legacyHistoryIncluded:false});await load;assert.match(elements.statsBody.innerHTML,/confirmed/);
  const late=scope.stagePaintStats();scope.viewGen++;scope.viewAccount=null;pending.shift()({statisticsSource:'turso-activity',legacyHistoryIncluded:false});await late;assert.equal(elements.statsBody.textContent,'Loading Turso activity…');
});
test('R4 compact bootstrap retains quiz inputs and full dictionary rows, scoped catalogs are equivalent',async()=>{
  const f=fixture();try{
    const data={usages:[{en:'Example',ru:'Пример'}],grammar:{note:'Keep'},cambridge:{uk:'/uk/',us:'/us/',pos:'noun',definition:'Meaning',examples:['Detailed example']},wooordhunt:{uk:'/w/',phrases:[{en:'Phrase'}]},links:{dictionary:'https://example.test'},longman:{definition:'x'.repeat(10000)}};
    const extra=JSON.stringify({data,custom:'keep'});f.sqlite.prepare("UPDATE cards SET extra_json=? WHERE id='private'").run(extra);
    const actor={id:'teacher',role:'ADMIN'},full=await legacyState(f.db,actor),compact=await legacyState(f.db,actor,{compact:true});
    const a=full.added[0],b=compact.added[0];assert.equal(b.stageDataDeferred,true);assert.deepEqual(b.data.usages,a.data.usages);assert.deepEqual(b.data.grammar,a.data.grammar);
    assert.equal(b.data.cambridge.definition,'Meaning');assert.equal(b.data.cambridge.uk,'/uk/');assert.equal(b.data.longman,undefined);
    assert.ok(JSON.stringify(compact).length<JSON.stringify(full).length/2);
    assert.equal(f.sqlite.prepare("SELECT extra_json FROM cards WHERE id='private'").get().extra_json,extra);
    const row=await new StudyService(f.db).readableCard(actor,'private');assert.deepEqual(JSON.parse(row.extra_json).data,data);
    await assert.rejects(new StudyService(f.db).readableCard({id:'student2',role:'USER'},'private'),e=>e.status===404);
    const all=await publicCatalogs(f.db),scoped=await publicCatalogs(f.db,['LESSON_DATA']);assert.deepEqual(scoped.LESSON_DATA,all.LESSON_DATA);assert.deepEqual(Object.keys(scoped),['LESSON_DATA']);
    await assert.rejects(publicCatalogs(f.db,['private']),e=>e.status===400);
  }finally{f.sqlite.close();}
});
test('R4 dictionary hydration preserves profile/place and ignores responses after navigation or revision changes',async()=>{
  const pending=[],painted=[],item={word:'Word',stageId:'card',stageRevision:1,stageDataDeferred:true,place:'mine'},box={};let rows=[item],section='made';
  const scope={authUser:{id:'student'},accountReady:true,viewAccount:null,viewSwitching:false,viewGen:1,loadAdded:()=>rows,rememberAdded:value=>rows=value,
    show(){},renderMade:value=>painted.push(value),document:{addEventListener(){},getElementById:()=>box,querySelector:()=>({id:section})},
    window:{TursoMain:{register(){},notice(){},dictionary:()=>new Promise(resolve=>pending.push(resolve))}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  const full={en:'Word',stageId:'card',stageRevision:1,data:{links:{dictionary:'https://example.test'},usages:[]}};
  const first=scope.stageHydrateMade(item);pending.shift()(full);await first;assert.equal(painted.length,1);assert.equal(rows[0].stageDataDeferred,false);assert.equal(rows[0].place,'mine');
  const switched=scope.stageHydrateMade(item);scope.viewGen++;pending.shift()(full);await switched;assert.equal(painted.length,1);
  const closed=scope.stageHydrateMade(item);section='days';pending.shift()(full);await closed;assert.equal(painted.length,1);
  section='made';const stale=scope.stageHydrateMade(item);pending.shift()({...full,stageRevision:2});await stale;assert.equal(painted.length,1);assert.match(box.textContent,/Dictionary changed/);
});
test('R5 attachment removal updates editor only after server success and ignores a switched lesson',async()=>{
  const pending=[],notes=[],material={id:'lesson'},block={id:'image',fileId:'saved'};
  const scope={lmState:material,viewGen:1,viewAccount:null,viewSwitching:false,lmFiles:{},canEditLessons:()=>true,lmBlock:()=>block,
    lmKeepLesson(){},lmPersist(){},lmRenderEditor(){},lmNote:value=>notes.push(value),document:{addEventListener(){},getElementById:()=>({})},
    window:{TursoMain:{detachLessonFile:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),perform:async fn=>{try{await fn();}catch{}}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  const failed=scope.stageClearLessonFile('image');assert.equal(block.fileId,'saved');pending.shift().reject(Error('offline'));await failed;assert.equal(notes.length,0);
  const done=scope.stageClearLessonFile('image');pending.shift().resolve({});await done;assert.equal(notes.length,1);
  const late=scope.stageClearLessonFile('image');scope.lmState={id:'other'};pending.shift().resolve({});await late;assert.equal(notes.length,1);
});
test('Offline UI status cannot claim real Turso acceptance',async()=>{
  const status={classList:{toggle(){}}},banner={dataset:{offlineFixture:'true'}},window={};
  const scope={window,crypto,location:{reload(){}},sessionStorage:{removeItem(){}},localStorage:{getItem(){return null;},removeItem(){}},
    document:{addEventListener(){},getElementById:id=>id==='turso-main-status'?status:id==='turso-main-banner'?banner:null},
    fetch:async()=>({ok:true,json:async()=>({user:{id:'fixture'}})})};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),scope);
  await window.TursoMain.fetch('/api/me');assert.match(status.textContent,/автономной SQLite/);assert.doesNotMatch(status.textContent,/Turso/);
  banner.dataset.offlineFixture='false';window.TursoMain.notice('Подтверждено тестовой Turso.');assert.match(status.textContent,/Turso/);
});
test('Production notices hide success, show errors and retain retry only for pending operations',()=>{
  for(const pending of [null,{actorId:'fixture',path:'/api/cards/fixture',method:'PATCH',body:{mutationId:'same-id'}}]){
    const banner={dataset:{compactNotices:'true'},hidden:true},status={classList:{toggle(){}}},retry={},window={};
    const scope={window,crypto,sessionStorage:{removeItem(){}},
      localStorage:{getItem:key=>key==='turso-main-pending'?JSON.stringify(pending):null,removeItem(){}},
      document:{addEventListener(){},getElementById:id=>({'turso-main-banner':banner,'turso-main-status':status,'turso-main-retry':retry}[id]||null)}};
    runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),scope);
    window.TursoMain.notice('Saving');assert.equal(banner.hidden,true);
    window.TursoMain.notice('Network error',true);assert.equal(banner.hidden,false);
    assert.equal(status.textContent,'Network error');assert.equal(retry.hidden,!pending);
    window.TursoMain.notice('Saved');assert.equal(banner.hidden,true);
  }
  const css=readFileSync(new URL('../production/notification.css',import.meta.url),'utf8');
  assert.match(css,/padding-top:0!important/);assert.match(css,/\[hidden\]\{display:none\}/);
});
test('Theme queue coalesces clicks, retries the same operation and drains before logout without legacy PUT',async()=>{
  const window={},saved=new Map(),sent=[];let fail=true;
  const scope={window,crypto,CustomEvent:class{},location:{reload(){}},
    setTimeout:()=>1,clearTimeout(){},sessionStorage:{removeItem(){}},
    localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},
    document:{addEventListener(){},dispatchEvent(){},getElementById:()=>null},
    fetch:async(path,options)=>{
      if(path==='/api/me')return {ok:true,json:async()=>({user:{id:'fixture'}})};
      if(path==='/api/me/state')return {ok:true,json:async()=>({stageThemeRevision:3})};
      if(path==='/api/me/theme'){
        const body=JSON.parse(options.body);sent.push(body);
        if(fail){fail=false;throw Error('offline');}
        return {ok:true,json:async()=>({theme:body.theme,revision:body.expectedRevision+1})};
      }
      assert.equal(path,'/api/logout');return {ok:true,json:async()=>({ok:true})};
    }};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),scope);
  await window.TursoMain.fetch('/api/me');await window.TursoMain.fetch('/api/me/state');
  window.TursoMain.theme('mint');window.TursoMain.theme('dark');
  await window.TursoMain.flushPersonal();assert.equal(sent.length,1);assert.equal(sent[0].theme,'dark');assert.equal(sent[0].expectedRevision,3);
  await window.TursoMain.fetch('/api/logout',{method:'POST',body:'{}'});
  assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(saved.has('turso-main-personal-pending'),false);
  const source=mainPreview(readFileSync(new URL('../preview.js',import.meta.url),'utf8'),readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'));
  assert.ok(!source.includes('return accountFetch("/api/me/state", { method: "PUT", body: JSON.stringify({ op: "put-setting", key: "theme", value: theme })'));
});
test('Static catalog IDs initialize before edits; broken login never falls back to GET',()=>{
  const listeners=new Map(),card={stageId:'card_static',stageRevision:1,en:'gardening',ru:'садоводство'},window={LESSON_DATA:{words:[card]}};
  const context={window,crypto,console,location:{hostname:'learn-english-turso-integrated-test.east-tarsal.workers.dev'},sessionStorage:{removeItem(){}},localStorage:{getItem:()=>null,removeItem(){}},
    document:{addEventListener:(event,fn)=>listeners.set(event,fn),getElementById:()=>({addEventListener(){}})}};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),context);
  listeners.get('DOMContentLoaded')();
  assert.equal(window.TursoMain.cardForProgress(card.stageId).stageId,'card_static');
  assert.equal(window.TursoMain.mediaAllowed(),true);
  context.location.hostname='learn-english.east-tarsal.workers.dev';assert.equal(window.TursoMain.mediaAllowed(),false);
  let prevented=false;listeners.get('submit')({target:{id:'loginForm'},preventDefault(){prevented=true;}});assert.equal(prevented,true);
});
test('Open form baseline survives later registry/state refresh',async()=>{
  const sent=[],memory=new Map(),window={};
  const context={window,crypto,console,location:{reload(){}},sessionStorage:{removeItem(){}},
    localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
    document:{addEventListener(){},getElementById:()=>null},
    fetch:async(path,options)=>{
      if(path==='/api/me')return {ok:true,json:async()=>({user:{id:'teacher'}})};
      if(path==='/api/me/state')return {ok:true,json:async()=>({stageCollections:[],added:[],stats:{cardQuizzes:{competitive:[{id:'quiz_'+'a'.repeat(64),type:'Flip',items:[{}],stageRevision:2}]}}})};
      sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:path.split('/').at(-1),ru:'saved',revision:3})};
    }
  };
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),context);
  const bridge=window.TursoMain;await bridge.fetch('/api/me');
  const form={stageId:'shared',stageRevision:1,stageScope:'shared',en:'competitive',ru:'before'};
  bridge.register(form);bridge.register({...form,stageRevision:2,ru:'other editor'});
  await bridge.editCard(form,'my draft');assert.equal(sent[0].expectedRevision,1);
  await bridge.fetch('/api/me/state');
  await bridge.writeQuiz('competitive',{id:'quiz_'+'a'.repeat(64),type:'Flip',items:[{front:'x',back:'y'}],stageRevision:1},false);
  assert.equal(sent[1].expectedRevision,1);
});
test('Successful login clears a stale provider error without reading or persisting the password',async()=>{
  const memory=new Map(),window={},status={textContent:'',classList:{toggle(name,bad){this.bad=bad;}}};let fail=true;
  const context={window,crypto,console,location:{reload(){}},sessionStorage:{removeItem(){}},
    localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
    document:{addEventListener(){},getElementById:id=>id==='turso-main-status'?status:null},
    fetch:async()=>({ok:!fail,status:fail?503:200,json:async()=>fail?{error:'Wrangler login expired.'}:{user:{id:'student',role:'USER'}}})};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),context);
  await assert.rejects(window.TursoMain.fetch('/api/login'),/Wrangler login expired/);assert.equal(status.classList.bad,true);
  fail=false;await window.TursoMain.fetch('/api/login');assert.equal(status.classList.bad,false);assert.match(status.textContent,/Вход подтверждён/);assert.equal(memory.size,0);
});
test('Personal card bridge carries only ID/place/versions and retains the exact uncertain intent',async()=>{
  const sent=[],memory=new Map(),window={};let fail=false;
  const card={id:'shared',en:'competitive',ru:'before',revision:1};
  const context={window,crypto,console,location:{reload(){}},sessionStorage:{removeItem(){}},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},document:{addEventListener(){},getElementById:()=>null},
    fetch:async(path,options)=>{
      if(path==='/api/me')return {ok:true,json:async()=>({user:{id:'student'}})};
      if(path==='/api/me/state')return {ok:true,json:async()=>({stageAddedRevision:4,added:[],stats:{}})};
      if(path.startsWith('/api/cards?'))return {ok:true,json:async()=>[card]};
      sent.push({path,method:options.method,body:JSON.parse(options.body)});if(fail){fail=false;throw new Error('uncertain');}
      return {ok:true,json:async()=>({revision:5,card:{stageId:'shared',stageRevision:1,word:'competitive'}})};
    }};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),context);
  const bridge=window.TursoMain;await bridge.fetch('/api/me');await bridge.fetch('/api/me/state');
  const found=await bridge.findCard('competitive');fail=true;
  await assert.rejects(bridge.linkCard(found,'mine'));
  assert.ok(memory.has('turso-main-pending'));await bridge.linkCard(found,'mine');
  assert.deepEqual(sent[1],sent[0]);assert.deepEqual(Object.keys(sent[0].body).sort(),['cardId','expectedCardRevision','expectedRevision','mutationId','place']);
  assert.equal(sent[0].body.expectedRevision,4);assert.equal(sent[0].body.cardId,'shared');
  await bridge.unlinkCard({stageId:'shared',place:'mine',stageLinksRevision:3});
  assert.equal(sent[2].method,'DELETE');assert.equal(sent[2].path,'/api/me/cards/shared');assert.equal(sent[2].body.expectedRevision,3,'Keep the displayed baseline, not a newer registry version');
});
test('Personal card hooks: USER removal only, acknowledgement before local updates and exact ID/place deletion',async()=>{
  let list=[],fail=true,rendered=null,removed=null;const notices=[];
  const scope={document:{addEventListener(){}},authUser:{id:'student',role:'USER'},accountReady:true,viewAccount:null,viewSwitching:false,madeItem:null,
    canEditLessons:()=>false,canEditAdded:item=>!!item.stageId,addedIndexOf:item=>list.findIndex(row=>row.stageId===item.stageId&&row.place===item.place),
    loadAdded:()=>list,rememberAdded:rows=>{list=rows;},paintAdded(){},paintAllWords(){},paintHomeStats(){},trackEvent(){},renderMade:card=>{rendered=card;},show(){},esc:String,
    window:{TursoMain:{notice:(...args)=>notices.push(args),perform:async action=>action(),findCard:async()=>({id:'shared'}),
      linkCard:async()=>{if(fail)throw new Error('Not saved');return {revision:1,card:{stageId:'shared',word:'test',ru:'тест',place:'mine',stageLinksRevision:1}};},
      unlinkCard:async card=>{removed=card;if(fail)throw new Error('Not removed');return {revision:2};}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  const input={value:'test'},status={};
  await assert.rejects(scope.stageSaveWord('mine',input,status,{},true));assert.equal(list.length,0);assert.equal(input.value,'test');assert.equal(rendered,null);
  fail=false;await scope.stageSaveWord('mine',input,status,{},true);assert.equal(list.length,1);assert.equal(input.value,'');
  assert.match(scope.stageAddedEditHtml(list[0]),/data-card-delete/);assert.ok(!scope.stageAddedEditHtml(list[0]).includes('data-edit-toggle'));
  list.push({...list[0],place:'phrasal'});scope.madeItem=list[0];
  const host={dataset:{editKind:'added',editId:'0'}};fail=true;
  await assert.rejects(scope.stageDeleteDefinition(host));assert.equal(list.length,2);
  fail=false;await scope.stageDeleteDefinition(host);assert.equal(removed.stageId,'shared');assert.equal(list.length,1);assert.equal(list[0].place,'phrasal');assert.equal(list[0].stageLinksRevision,2);
  scope.viewAccount={id:'other'};input.value='blocked';await scope.stageSaveWord('mine',input,status,{},false);assert.equal(notices.length,1);assert.equal(list.length,1);
});
test('Empty own My words exposes the first-add form without altering a foreign or non-empty group',()=>{
  let list=[],painted=0;
  const scope={document:{addEventListener(){}},authUser:{id:'student'},accountReady:true,viewAccount:null,viewSwitching:false,addGroup:'',
    loadAdded:()=>list,renderAddedList:()=>{painted++;}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),scope);
  scope.renderAddedList();assert.equal(scope.addGroup,'My words');assert.equal(painted,1);
  scope.addGroup='';list=[{stageId:'shared',place:'phrasal'}];scope.renderAddedList();assert.equal(scope.addGroup,'');
  list=[];scope.viewAccount={id:'foreign'};scope.renderAddedList();assert.equal(scope.addGroup,'');
  scope.viewAccount=null;scope.accountReady=false;scope.renderAddedList();assert.equal(scope.addGroup,'My words','Navigation stays available during profile hydration, but writes remain gated');
  scope.addGroup='';scope.authUser=null;scope.renderAddedList();assert.equal(scope.addGroup,'');
});
test('Main HTTP personal routes: real USER auth, one users check per request, own-only response readback',async()=>{
  const f=fixture();
  f.sqlite.exec("INSERT INTO lesson_blocks(lesson_id,id,position,type,content_json) VALUES('lesson','task',1,'task','{}')");
  const server=createMainServer({db:f.db,auth:new RealStageAuth(f.source)});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  const call=async(path,method='GET',body)=>{
    const r=await fetch(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;
  };
  try{
    await call('/api/login','POST',{login:'student',password:f.password});
    const before=f.queries();
    assert.equal((await call('/api/cards/shared/answers','POST',{mutationId:crypto.randomUUID(),expectedRevision:0,quizType:'Type',correct:false})).status,200);
    assert.equal(f.queries()-before,1);
    assert.equal((await call('/api/cards/shared/progress','PATCH',{mutationId:crypto.randomUUID(),expectedRevision:0,changes:{learned:true}})).status,200);
    const task={mutationId:crypto.randomUUID(),expectedRevision:0,expectedBlockRevision:1,response:'private HTTP answer'};
    assert.equal((await call('/api/lessons/lesson/blocks/task/response','PUT',task)).status,200);
    assert.equal((await call('/api/lessons/lesson/blocks/task/response','PUT',{...task,profileId:'p2'})).status,400);
    const own=await (await call('/api/lessons')).json();
    assert.equal(own.materials[0].blocks.find(b=>b.id==='task').response,'private HTTP answer');
    assert.equal(own.materials[0].blocks.find(b=>b.id==='task').stageResponseRevision,1);
    const state=await (await call('/api/me/state')).json();
    assert.equal(state.stageQuizProgress[0].revision,1);assert.deepEqual(state.learned,['competitive']);
    await call('/api/login','POST',{login:'student2',password:f.password});
    const other=await (await call('/api/lessons')).json();
    assert.equal(other.materials[0].blocks.find(b=>b.id==='task').response,undefined);
    assert.deepEqual((await (await call('/api/me/state')).json()).stats.mistakes,[]);
  }finally{await new Promise(resolve=>server.close(resolve));f.sqlite.close();}
});
test('Browser personal queue: coalesced inputs, editor CAS baseline, sequential revisions and durable uncertain retry',async()=>{
  const memory=new Map(),sent=[],events=[],timers=new Map(),listeners=new Map(),buttons=new Map();let drop=false,active='student';
  const state={added:[{stageId:'card',stageRevision:1,stageScope:'shared',en:'fixture',ru:'fixture'}],stats:{cardQuizzes:{}},stageQuizProgress:[]};
  function boot(){
    const window={},context={window,crypto,console,location:{reload(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
      setTimeout:fn=>{const key=crypto.randomUUID();timers.set(key,fn);return key;},clearTimeout:key=>timers.delete(key),
      sessionStorage:{removeItem(){}},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
      document:{addEventListener:(type,fn)=>listeners.set(type,fn),dispatchEvent:event=>events.push(event),
        getElementById:id=>({addEventListener:(_type,fn)=>buttons.set(id,fn),classList:{toggle(){}},textContent:''}),querySelectorAll:()=>[]},
      fetch:async(path,options)=>{
        if(path==='/api/me')return {ok:true,json:async()=>({user:{id:active}})};
        if(path==='/api/me/state')return {ok:true,json:async()=>state};
        const body=JSON.parse(options.body);sent.push({path,body});
        if(drop){drop=false;throw new Error('Response lost');}
        return {ok:true,json:async()=>({revision:body.expectedRevision+1,id:'card',response:body.response,progress:{}})};
      }};
    runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),context);
    listeners.get('DOMContentLoaded')();return window.TursoMain;
  }
  const settle=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
  let bridge=boot();await bridge.fetch('/api/me');await bridge.fetch('/api/me/state');
  const block={id:'task',stageBlockRevision:1,stageResponseRevision:0};
  bridge.response('lesson',block,'a');bridge.response('lesson',block,'answer');
  assert.equal(sent.length,0);assert.equal(JSON.parse(memory.get('turso-main-personal-pending')).length,1);
  for(const fn of timers.values())fn();timers.clear();await settle();
  assert.equal(sent[0].body.response,'answer');assert.equal(sent[0].body.expectedRevision,0);
  bridge.answer(state.added[0],'Type',false);bridge.answer(state.added[0],'Type',true);await settle();
  assert.equal(sent[1].body.expectedRevision,0);assert.equal(sent[2].body.expectedRevision,1);
  drop=true;bridge.response('lesson',{...block,stageResponseRevision:1},'uncertain',true);await settle();
  const original=sent[3];assert.ok(JSON.parse(memory.get('turso-main-personal-pending'))[0].paused);
  active='student2';bridge=boot();await bridge.fetch('/api/me');await bridge.fetch('/api/me/state');
  buttons.get('turso-main-retry')();await settle();assert.equal(sent.length,4,'Pending writes must never retarget another account');
  active='student';
  bridge=boot();await bridge.fetch('/api/me');await bridge.fetch('/api/me/state');await settle();assert.equal(sent.length,4);
  buttons.get('turso-main-retry')();await settle();
  assert.deepEqual(sent[4],original);assert.equal(memory.has('turso-main-personal-pending'),false);
  assert.ok(events.some(event=>event.type==='turso-personal-saved'));
});
test('Personal exercise marks restored only from own response; stale shared answers never leak',async()=>{
  const f=fixture(),service=new StudyService(f.db),student=f.users.get('student'),other=f.users.get('student2');
  const content={items:[{kind:'write',write:'Expected',typed:'shared private input',marked:true,correct:true},{kind:'choice',options:['yes','no'],answer:0,picked:1}],score:'shared score'};
  f.sqlite.prepare('INSERT INTO lesson_blocks(lesson_id,id,position,type,content_json) VALUES(?,?,?,?,?)').run('lesson','exercise',1,'exercise',JSON.stringify(content));
  const before=await legacyLessons(f.db,other);const empty=before.materials[0].blocks.find(row=>row.id==='exercise');
  assert.equal(empty.items[0].typed,undefined);assert.equal(empty.items[0].marked,undefined);assert.equal(empty.items[1].picked,undefined);assert.equal(empty.score,undefined);
  const result=await service.saveLessonResponse(student,'lesson','exercise',{mutationId:crypto.randomUUID(),expectedRevision:0,expectedBlockRevision:1,response:{items:[{typed:' expected '},{picked:1}],checked:true}});
  assert.equal(result.response.items[0].correct,true);assert.equal(result.response.items[1].correct,false);
  const mine=(await legacyLessons(f.db,student)).materials[0].blocks.find(row=>row.id==='exercise');
  assert.equal(mine.items[0].marked,true);assert.equal(mine.items[0].typed,' expected ');
  assert.equal((await legacyLessons(f.db,other)).materials[0].blocks.find(row=>row.id==='exercise').items[0].typed,undefined);
  assert.equal(f.sqlite.prepare('SELECT content_json FROM lesson_blocks WHERE id=?').get('exercise').content_json,JSON.stringify(content));
  f.sqlite.close();
});
test('Main response hooks intercept the old lesson-wide save and submit only personal inputs',()=>{
  const sent=[],listeners=new Map(),blocks=[{id:'task',type:'task',stageBlockRevision:1,stageResponseRevision:0},{id:'quiz',type:'quiz',stageBlockRevision:1,items:[{answer:1,options:['no','yes'],picked:1}]}];
  const context={document:{addEventListener:(type,fn)=>listeners.set(type,fn)},authUser:{id:'student'},accountReady:true,viewAccount:null,viewSwitching:false,
    lmState:{id:'lesson',blocks},window:{TursoMain:{response:(...args)=>sent.push(args),notice:()=>assert.fail('Unexpected notice')}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  let intercepted=0;
  listeners.get('input')({type:'input',target:{closest:()=>({dataset:{response:'task'},value:'private draft',hasAttribute:()=>false})},stopPropagation:()=>intercepted++});
  const input={dataset:{quizCheck:'quiz'},hasAttribute:key=>key==='data-quiz-check'};
  listeners.get('click')({type:'click',target:{closest:()=>input},stopPropagation:()=>intercepted++});
  assert.equal(intercepted,2);assert.equal(sent[0][2],'private draft');
  assert.equal(JSON.stringify(sent[1][2]),'{"items":[{"picked":1}],"checked":true}');
  assert.equal(sent[1][3],true);assert.ok(!JSON.stringify(sent[1][2]).includes('answer'));
});
test('Home weak count/list: visible unique words, multiple quizzes once, cleared/missing rows excluded; other buckets unchanged',()=>{
  const hooks=readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8');
  const counter={textContent:'0'},rows=[{en:'beta'},{en:'alpha'},{en:'alpha'},{en:'cleared'},{en:'no misses'}];
  const mistakes={a:{en:' ALPHA ',type:'Type',misses:2},b:{en:'alpha',type:'Choice',misses:1},
    c:{en:'beta',type:'Type',misses:1},d:{en:'cleared',misses:3,cleared:true},e:{en:'no misses',misses:0},f:{en:'foreign or deleted',misses:2}};
  const context={rows,result:null,homeBuckets:()=>({weak:[]}),loadLearned:()=>new Set(['alpha']),loadMistakeMap:()=>mistakes,
    byLesson:(a,b)=>a.en.localeCompare(b.en),fetch:()=>assert.fail('Home must not query a database'),
    document:{addEventListener(){},querySelector:selector=>{if(selector.startsWith('#homeDemo .overview'))return null;assert.equal(selector,'#homeDemo [data-stat="weak"] b');return counter;}}};
  runInNewContext(hooks+'\nresult=homeBuckets(rows);',context);
  assert.equal(JSON.stringify(context.result.weak.map(row=>row.en)),'["alpha","beta"]');assert.equal(counter.textContent,'2');
  assert.equal(JSON.stringify(context.result.learned.map(row=>row.en)),'["alpha","alpha"]');
  assert.equal(JSON.stringify(context.result.learning.map(row=>row.en)),'["beta","cleared","no misses"]');
  mistakes.a.cleared=true;mistakes.b.cleared=true;mistakes.c.cleared=true;
  runInNewContext('result=homeBuckets(rows);',context);
  assert.equal(counter.textContent,'0');assert.equal(context.result.weak.length,0);
});
test('Acknowledged progress refreshes Home and the open Weak cards list without legacy writes',()=>{
  const listeners=new Map(),memory=new Map();let home=0,list=0;
  const context={authUser:{id:'student'},viewAccount:null,viewSwitching:false,MISTAKE_KEY:'mistakes',
    loadMistakeMap:()=>JSON.parse(memory.get('mistakes')||'{}'),localStorage:{setItem:(k,v)=>memory.set(k,v)},
    paintHomeStats:()=>home++,paintStat:()=>list++,
    document:{addEventListener:(type,fn)=>listeners.set(type,fn),getElementById:id=>{assert.equal(id,'cardstat');return {classList:{contains:name=>name==='on'}};}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  const saved=listeners.get('turso-personal-saved'),job={kind:'answer',actorId:'student'};
  saved({detail:{job,result:{type:'Type',progress:{en:'fixture',misses:1,streak:0}}}});
  assert.equal(home,1);assert.equal(list,1);assert.equal(JSON.parse(memory.get('mistakes'))['fixture|Type'].misses,1);
  saved({detail:{job,result:{type:'Type',progress:{en:'fixture',cleared:true}}}});
  assert.equal(home,2);assert.equal(list,2);assert.equal(JSON.parse(memory.get('mistakes'))['fixture|Type'],undefined);
  saved({detail:{job:{...job,actorId:'another'},result:{}}});assert.equal(home,2);
});
test('Lesson bridge sends only changed metadata/blocks; excludes answers, preserves editor baseline and retries the same intent',async()=>{
  const memory=new Map(),sent=[],window={};let dropped=false;
  const remote={id:'lesson',title:'Original',published:true,stageRevision:3,blocks:[
    {id:'task',type:'task',text:'Write',response:'Private',stageBlockRevision:2,stageResponseRevision:1},
    {id:'quiz',type:'quiz',quizType:'Choice',items:[{prompt:'Pick',options:['yes','no'],answer:0,picked:1,marked:true,correct:false}],score:'0 / 1',stageBlockRevision:1}
  ]};
  const context={window,crypto,console,location:{reload(){}},sessionStorage:{removeItem(){}},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},document:{addEventListener(){},getElementById:()=>null},
    fetch:async(path,options)=>{
      if(path==='/api/me')return {ok:true,json:async()=>({user:{id:'teacher'}})};
      if(path==='/api/lessons'&&!options.method)return {ok:true,json:async()=>({materials:[structuredClone(remote)]})};
      const body=JSON.parse(options.body);sent.push({path,body});
      if(dropped){dropped=false;throw new Error('Lost response');}
      return {ok:true,json:async()=>({id:'lesson',revision:body.expectedRevision+1,blocks:[{id:'task',revision:2},{id:'quiz',revision:2}]})};
    }};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),context);
  const bridge=window.TursoMain;await bridge.fetch('/api/me');
  const lesson=(await bridge.fetch('/api/lessons')).materials[0];
  lesson.title='My edit';remote.stageRevision=9;await bridge.fetch('/api/lessons');
  await bridge.saveLesson(lesson);
  assert.equal(sent[0].body.expectedRevision,3);assert.deepEqual(sent[0].body.changes,{title:'My edit'});assert.deepEqual(sent[0].body.upserts,[]);assert.equal(sent[0].body.order,undefined);
  lesson.blocks[1].items[0].prompt='New prompt';dropped=true;
  await assert.rejects(bridge.saveLesson(lesson));assert.equal(lesson.stageRevision,4);
  await bridge.saveLesson(lesson);
  assert.deepEqual(sent[1],sent[2]);assert.equal(sent[2].body.upserts.length,1);
  assert.equal(sent[2].body.upserts[0].id,'quiz');assert.equal(sent[2].body.upserts[0].expectedRevision,2);
  assert.deepEqual(sent[2].body.upserts[0].content.items[0],{prompt:'New prompt',options:['yes','no'],answer:0});
  assert.equal(JSON.stringify(sent[2].body).includes('Private'),false);assert.equal(sent[2].body.upserts[0].content.score,undefined);
  assert.equal(memory.has('turso-main-pending'),false);
  assert.equal(lesson.blocks[1].score,undefined);assert.equal(lesson.blocks[1].items[0].picked,undefined);
  assert.equal(lesson.blocks[0].response,'Private','An unchanged task keeps its displayed answer');
  const count=sent.length;await bridge.saveLesson(lesson);assert.equal(sent.length,count,'Unchanged Save must not query the database');
  lesson.description='Unsaved text';await bridge.hideLesson(lesson,true);
  assert.deepEqual(sent.at(-1).body.changes,{hiddenFromStudents:true});assert.deepEqual(sent.at(-1).body.upserts,[]);
  assert.equal(lesson.description,'Unsaved text');assert.equal(lesson.stageLessonBaseline.changes.description,'');
});
test('Lesson word insertion sends one linked block, not dictionary or unchanged lesson content',async()=>{
  const sent=[],window={},remote={id:'lesson',title:'Saved',published:false,stageRevision:1,blocks:[{id:'text',type:'text',html:'Neighbour'.repeat(1000),stageBlockRevision:1}]};
  const scope={window,crypto,location:{reload(){}},sessionStorage:{removeItem(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},document:{addEventListener(){},getElementById:()=>null},
    fetch:async(path,options)=>{
      if(path==='/api/me')return {ok:true,json:async()=>({user:{id:'teacher'}})};
      if(path==='/api/lessons'&&!options.method)return {ok:true,json:async()=>({materials:[structuredClone(remote)]})};
      if(path.startsWith('/api/cards?'))return {ok:true,json:async()=>[{id:'shared_card',en:'competitive',ru:'before',scope:'shared',revision:1}]};
      const body=JSON.parse(options.body);sent.push({path,body});return {ok:true,json:async()=>({revision:body.expectedRevision+1,blocks:[{id:'text',revision:1},{id:'newword',revision:1}]})};
    }};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),scope);
  await window.TursoMain.fetch('/api/me');const lesson=(await window.TursoMain.fetch('/api/lessons')).materials[0];
  lesson.published=true;lesson.blocks.push({id:'newword',type:'wordcard',word:'competitive',ru:'before',data:{dictionary:'Huge'.repeat(10000)}});
  await window.TursoMain.saveLesson(lesson);
  assert.equal(sent.length,1);assert.equal(sent[0].path,'/api/lessons/lesson');
  assert.deepEqual(sent[0].body.changes,{published:true});assert.equal(sent[0].body.upserts.length,1);
  assert.equal(sent[0].body.upserts[0].cardId,'shared_card');assert.deepEqual(sent[0].body.upserts[0].content,{});
  assert.equal(sent[0].body.order,undefined);
  assert.ok(JSON.stringify(sent[0].body).length<1000);assert.ok(!JSON.stringify(sent[0].body).includes('Neighbour'));
  lesson.published=false;await window.TursoMain.saveLesson(lesson);assert.deepEqual(sent[1].body.upserts,[]);
});
test('Lesson rule insert sends a rules-tab block without catalog text',async()=>{
  const sent=[],window={},remote={id:'lesson',title:'Saved',published:true,stageRevision:2,blocks:[]};
  const scope={window,crypto,location:{reload(){}},sessionStorage:{removeItem(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},document:{addEventListener(){},getElementById:()=>null},
    fetch:async(path,options)=>{
      if(path==='/api/me')return {ok:true,json:async()=>({user:{id:'teacher'}})};
      if(path==='/api/lessons'&&!options.method)return {ok:true,json:async()=>({materials:[structuredClone(remote)]})};
      const body=JSON.parse(options.body);sent.push({path,body});return {ok:true,json:async()=>({revision:body.expectedRevision+1,blocks:[{id:'rule1',revision:1}]})};
    }};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),scope);
  await window.TursoMain.fetch('/api/me');const lesson=(await window.TursoMain.fetch('/api/lessons')).materials[0];
  lesson.blocks.push({id:'rule1',type:'rule',tab:'rules',topic:'predictions',compare:false,name:'Predictions',collapsed:false});
  await window.TursoMain.saveLesson(lesson);
  assert.equal(sent.length,1);assert.equal(sent[0].body.upserts.length,1);
  assert.equal(sent[0].body.upserts[0].type,'rule');assert.equal(sent[0].body.upserts[0].tab,'rules');
  assert.equal(sent[0].body.upserts[0].content.topic,'predictions');
  assert.equal(sent[0].body.order,undefined);
  assert.equal(JSON.stringify(sent[0].body).includes('will rain'),false);
});
test('Lesson block removal sends deletes and does not resurrect the id in order',async()=>{
  const sent=[],window={},remote={id:'lesson',title:'Saved',published:true,stageRevision:4,stageBlockOrder:['keep','gone'],blocks:[
    {id:'keep',type:'text',html:'A',stageBlockRevision:1},{id:'gone',type:'rule',tab:'rules',topic:'predictions',stageBlockRevision:2}
  ]};
  const scope={window,crypto,location:{reload(){}},sessionStorage:{removeItem(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},document:{addEventListener(){},getElementById:()=>null},
    fetch:async(path,options)=>{
      if(path==='/api/me')return {ok:true,json:async()=>({user:{id:'teacher'}})};
      if(path==='/api/lessons'&&!options.method)return {ok:true,json:async()=>({materials:[structuredClone(remote)]})};
      const body=JSON.parse(options.body);sent.push({path,body});return {ok:true,json:async()=>({revision:body.expectedRevision+1,blocks:[{id:'keep',revision:1}]})};
    }};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),scope);
  await window.TursoMain.fetch('/api/me');const lesson=(await window.TursoMain.fetch('/api/lessons')).materials[0];
  lesson.blocks=lesson.blocks.filter(block=>block.id!=='gone');
  await window.TursoMain.saveLesson(lesson);
  assert.equal(sent.length,1);assert.deepEqual(sent[0].body.deletes,[{id:'gone',expectedRevision:2}]);
  assert.equal(sent[0].body.order,undefined);assert.equal(JSON.stringify(lesson.stageBlockOrder),JSON.stringify(['keep']));
});
test('Lesson card lookup retains the shared ID and never uses the external dictionary route',async()=>{
  const input={value:'competitive'},status={},button={},blocks=[];
  const context={canEditLessons:()=>true,accountReady:true,viewAccount:null,viewSwitching:false,viewGen:1,lmState:{blocks},
    lmTab:()=> 'words',lmId:()=> 'new_word',lmInsertBlockFront:block=>blocks.push(block),lmRenderEditor(){},lmSchedule(){},
    document:{addEventListener(){},getElementById:id=>({lmWordInput:input,lmWordStatus:status,lmWordGo:button}[id])},
    window:{TursoMain:{lessonCards:async()=>[{id:'shared',en:'competitive'}],dictionary:async card=>({en:'competitive',ru:'before',stageId:card.stageId,stageRevision:2,data:{uk:'ipa'}}),notice(){}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  await context.stageLookupLessonWord();assert.equal(blocks.length,1);assert.equal(blocks[0].stageId,'shared');assert.equal(blocks[0].stageRevision,2);assert.equal(button.disabled,false);
});
test('New lesson words fall back to shared dictionary creation before adding an ID-linked block',async()=>{
  const blocks=[],calls=[],context={canEditLessons:()=>true,accountReady:true,viewAccount:null,viewSwitching:false,viewGen:1,lmState:{blocks},
    lmTab:()=> 'words',lmId:()=> 'new_word',lmInsertBlockFront:block=>blocks.push(block),lmRenderEditor(){},lmSchedule(){},
    document:{addEventListener(){},getElementById:id=>({lmWordInput:{value:'new word'},lmWordStatus:{},lmWordGo:{}}[id])},
    window:{TursoMain:{lessonCards:async()=>[],lookupLessonCard:async word=>{calls.push(word);return {id:'created-shared'};},dictionary:async card=>({en:'new word',ru:'translation',stageId:card.stageId,stageRevision:1}),notice(){}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  await context.stageLookupLessonWord();assert.deepEqual(calls,['new word']);assert.equal(blocks[0].stageId,'created-shared');assert.equal(blocks[0].stageScope,'shared');
});
test('Main HTTP lesson routes: teacher create/edit/delete, real-role denial and no whole-library PUT',async()=>{
  const f=fixture(),server=createMainServer({db:f.db,auth:new RealStageAuth(f.source)});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  let cookie='';const call=async(path,method='GET',body)=>{
    const response=await fetch(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;
  };
  try{
    const creation={mutationId:crypto.randomUUID(),id:'new_lesson',changes:{title:'New'},blocks:[]};
    assert.equal((await call('/api/lessons','POST',creation)).status,401);
    await call('/api/login','POST',{login:'teacher',password:f.password});
    const before=f.queries();assert.equal((await call('/api/lessons','POST',creation)).status,200);assert.equal(f.queries()-before,1);
    const patch={mutationId:crypto.randomUUID(),expectedRevision:1,changes:{published:true},upserts:[],deletes:[]};
    assert.equal((await call('/api/lessons/new_lesson','PATCH',patch)).status,200);
    assert.equal((await call('/api/lessons/new_lesson','PATCH',{...patch,mutationId:crypto.randomUUID()})).status,409);
    f.users.get('teacher').role='USER';
    assert.equal((await call('/api/lessons/new_lesson','DELETE',{mutationId:crypto.randomUUID(),expectedRevision:2})).status,403);
    f.users.get('teacher').role='DEVELOPER';
    assert.equal((await call('/api/lessons/new_lesson','DELETE',{mutationId:crypto.randomUUID(),expectedRevision:2})).status,200);
    const reads=f.queries();assert.equal((await call('/api/lessons','PUT',{materials:[]})).status,501);assert.equal(f.queries(),reads);
    assert.equal((await (await call('/api/lessons')).json()).materials.some(l=>l.id==='new_lesson'),false);
  }finally{await new Promise(resolve=>server.close(resolve));f.sqlite.close();}
});
test('Lesson buttons publish only after acknowledgement; failed Save keeps the original lesson and draft',async()=>{
  const pending=[],shown=[],notes=[],context={lmState:{id:'lesson',title:'Draft',published:false,mode:'edit',blocks:[]},lmSaveTimer:0,
    canEditLessons:()=>true,viewAccount:null,viewSwitching:false,clearTimeout(){},lmKeepLesson(){},lmPersist(){},
    lmShow:mode=>shown.push(mode),lmNote:message=>notes.push(message),
    document:{addEventListener(){},getElementById:()=>({})},
    window:{TursoMain:{saveLesson:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),perform:async(action)=>{try{await action();}catch{};}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  const save=context.stageSaveLesson(true);assert.equal(context.lmState.published,false);assert.equal(shown.length,0);
  pending.shift().resolve({});await save;assert.equal(context.lmState.published,true);assert.deepEqual(shown,['preview']);
  const failed=context.stageSaveLesson(false);pending.shift().reject(new Error('Network down'));await failed;
  assert.equal(context.lmState.published,true);assert.deepEqual(shown,['preview']);assert.equal(context.lmState.title,'Draft');assert.equal(notes.length,1);
});
test('Managed add uses target endpoint, waits for acknowledgement and drops late results',async()=>{
  const pending=[],calls=[];let list=[];
  const context={authUser:{role:'ADMIN'},accountReady:true,viewAccount:{id:'b'.repeat(32)},viewGen:1,viewSwitching:false,
    loadAdded:()=>list,rememberAdded:value=>list=value,paintAdded(){},paintAllWords(){},
    document:{addEventListener(){}},window:{TursoMain:{findCard:async()=>({id:'shared',revision:1}),
      linkManagedCard:(...args)=>{calls.push(args);return new Promise((resolve,reject)=>pending.push({resolve,reject}));},perform:async action=>{try{await action();}catch{};}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  const input={value:'Word'},save=context.stageSaveWord('mine',input,{},null,false);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(list.length,0);assert.equal(calls[0][0],context.viewAccount.id);
  pending.shift().resolve({card:{stageId:'shared',place:'mine'},revision:1});await save;assert.equal(list.length,1);assert.equal(input.value,'');
  list=[];input.value='Other';const late=context.stageSaveWord('mine',input,{},null,false);await new Promise(resolve=>setImmediate(resolve));
  context.viewGen++;context.viewAccount=null;pending.shift().resolve({card:{stageId:'other'},revision:2});await late;
  assert.equal(list.length,0);assert.equal(input.value,'Other');
});
test('Managed private card UI exposes edit/remove and ignores late saves after changing target',async()=>{
  const pending=[],card={stageId:'private',stageScope:'profile',stageRevision:1,ru:'Before'},paints=[];
  const context={authUser:{role:'ADMIN'},accountReady:true,viewAccount:{id:'b'.repeat(32)},viewGen:1,viewSwitching:false,
    madeItem:null,canEditLessons:()=>false,canEditAdded:()=>true,actionIcon:()=>'<svg></svg>',
    loadAdded:()=>[card],rememberAdded(){},paintAdded:()=>paints.push('paint'),addedIndexOf:()=>0,renderMade(){},
    document:{addEventListener(){}},window:{TursoMain:{editManagedCard:()=>new Promise(resolve=>pending.push(resolve)),perform:async action=>action()}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  assert.match(context.stageAddedActions(card),/data-edit-toggle/);assert.match(context.stageAddedActions(card),/Remove from student cards/);
  assert.ok(!context.stageAddedActions({...card,stageScope:'shared'}).includes('data-edit-toggle'));
  assert.equal(context.stageCanEditTranslation({...card,stageScope:'shared'}),false);
  const host={dataset:{editKind:'added',editId:'0'},isConnected:false,querySelector:selector=>selector.includes('field')?{value:'After'}:{}};
  const save=context.stageSaveTranslation(host);assert.equal(card.ru,'Before');pending.shift()({ru:'After',revision:2});await save;
  assert.equal(card.ru,'After');assert.equal(card.stageRevision,2);
  const late=context.stageSaveTranslation(host);context.viewGen++;context.viewAccount=null;pending.shift()({ru:'Late',revision:3});await late;
  assert.equal(card.ru,'After');assert.equal(paints.length,1);
});
test('Managed removal waits for acknowledgement, filters exact ID/place and ignores switched profiles',async()=>{
  const pending=[],removed=[];let list=[{stageId:'shared',stageScope:'shared',place:'mine'},{stageId:'shared',stageScope:'shared',place:'phrasal'}];
  const context={authUser:{role:'ADMIN'},accountReady:true,viewAccount:{id:'b'.repeat(32)},viewGen:1,viewSwitching:false,madeItem:null,
    loadAdded:()=>list,addedIndexOf:()=>0,rememberAdded:value=>list=value,paintAdded(){},paintAllWords(){},document:{addEventListener(){}},
    window:{TursoMain:{unlinkManagedCard:(account,card)=>{removed.push({account,card});return new Promise((resolve,reject)=>pending.push({resolve,reject}));},perform:async action=>{try{await action();}catch{};}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  const host={dataset:{editKind:'added',editId:'0'}};
  const failed=context.stageDeleteDefinition(host);pending.shift().reject(Error('offline'));await failed;assert.equal(list.length,2);
  const success=context.stageDeleteDefinition(host);assert.equal(list.length,2);pending.shift().resolve({revision:2});await success;
  assert.equal(list.length,1);assert.equal(list[0].place,'phrasal');assert.equal(removed[1].account,'b'.repeat(32));
  const late=context.stageDeleteDefinition(host);context.viewGen++;context.viewAccount=null;pending.shift().resolve({revision:3});await late;assert.equal(list.length,1);
});
test('Managed text UI waits for acknowledgement and ignores a response after leaving the target',async()=>{
  const pending=[],saved=[],item={id:'text',stageId:'text',stageScope:'profile',stageRevision:1,title:'Old',text:'Body'};
  const elements={textTitle:{value:'New'},textBody:{value:'Body'},textStatus:{},textReadStatus:{}};
  const context={authUser:{role:'ADMIN'},accountReady:true,viewAccount:{id:'b'.repeat(32)},viewGen:1,viewSwitching:false,
    openTextId:'text',loadTexts:()=>[item],stageInstallLibrary:value=>saved.push(value),showText(){},
    document:{addEventListener(){},getElementById:id=>elements[id]},window:{TursoMain:{
      saveManagedText:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),
      perform:async action=>{try{await action();}catch{};}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  context.stageInstallLibrary=value=>saved.push(value);
  const success=context.stageStoreText(false);assert.equal(saved.length,0);
  pending.shift().resolve({item:{...item,title:'New'}});await success;assert.equal(saved.length,1);
  const failure=context.stageStoreText(false);pending.shift().reject(Error('offline'));await failure;assert.equal(saved.length,1);
  const late=context.stageStoreText(false);context.viewGen++;context.viewAccount=null;
  pending.shift().resolve({item:{...item,title:'Late'}});await late;assert.equal(saved.length,1);
});
test('R2 managed text archive waits for server, preserves failures and ignores switched targets',async()=>{
  let list=[{id:'one',stageId:'one',stageScope:'profile'},{id:'two',stageId:'two',stageScope:'profile'}];const pending=[];
  const context={authUser:{role:'ADMIN'},accountReady:true,viewAccount:{id:'b'.repeat(32)},viewGen:1,viewSwitching:false,
    TEXT_KEY:'texts',loadTexts:()=>list,localStorage:{setItem:(key,value)=>list=JSON.parse(value)},paintTextCount(){},renderTextList(){},show(){},
    document:{addEventListener(){}},window:{TursoMain:{archiveManagedText:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),perform:async fn=>{try{await fn();}catch{}}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  const failed=context.stageArchiveText('one');assert.equal(list.length,2);pending.shift().reject(Error('offline'));await failed;assert.equal(list.length,2);
  const success=context.stageArchiveText('one');assert.equal(list.length,2);pending.shift().resolve({deleted:true});await success;assert.deepEqual(list.map(x=>x.id),['two']);
  const late=context.stageArchiveText('two');context.viewGen++;pending.shift().resolve({deleted:true});await late;assert.equal(list.length,1);
});
test('R2 developer managed song save waits for acknowledgement, excludes teacher and learner events',async()=>{
  const pending=[],saved=[],calls=[],elements=Object.fromEntries(['Title','Artist','Text','Video','Music','Status'].map(key=>['lyric'+key,{value:key}]));
  const context={crypto,authUser:{role:'DEVELOPER'},accountReady:true,viewAccount:{id:'b'.repeat(32)},viewGen:1,viewSwitching:false,
    pendingLyricFile:null,pendingEditFile:null,loadSongs:()=>[],trackEvent(){throw Error('No learner event');},renderUserSong(){},show(){},
    document:{addEventListener(){},getElementById:id=>elements[id]},window:{TursoMain:{notice(){},saveManagedLibrary:(...args)=>{calls.push(args);return new Promise(resolve=>pending.push(resolve));},perform:async fn=>fn()}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);context.stageInstallLibrary=item=>saved.push(item);
  const success=context.stageStoreSong();assert.equal(saved.length,0);assert.equal(calls[0][0],context.viewAccount.id);assert.equal(calls[0][2],'song');pending.shift()({item:{id:'saved'}});await success;assert.equal(saved.length,1);
  context.authUser.role='ADMIN';context.stageStoreSong();assert.equal(calls.length,1);
  context.authUser.role='DEVELOPER';const late=context.stageStoreSong();context.viewGen++;pending.shift()({item:{id:'late'}});await late;assert.equal(saved.length,1);
});
test('Managed lesson visibility updates local flags only after acknowledgement and keeps the selected target',async()=>{
  const pending=[],calls=[];let hidden=[],allowed=[],paints=0;
  const context={viewAccount:{id:'b'.repeat(32)},viewGen:1,viewSwitching:false,accountReady:true,
    lmLibrary:{materials:[{id:'lesson',stageRevision:1,hiddenFromStudents:false}]},
    canTuneStudentLessons:()=>true,canEditLessons:()=>false,lmAllowedForStudent:()=>false,lmHiddenForStudent:()=>false,
    loadAllowedLessons:()=>allowed,loadHiddenLessons:()=>hidden,installAllowedLessons:value=>allowed=value,installHiddenLessons:value=>hidden=value,
    paintLmDays:()=>paints++,document:{addEventListener(){}},window:{TursoMain:{
      setManagedLessonAccess:(...args)=>{calls.push(args);return new Promise((resolve,reject)=>pending.push({resolve,reject}));},
      perform:async action=>{try{await action();}catch{};}}}};
  runInNewContext(readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8'),context);
  const save=context.stageHideLesson('lesson');assert.equal(hidden.length,0);assert.equal(paints,0);
  assert.equal(calls[0][0],context.viewAccount.id);assert.equal(calls[0][1],'lesson');
  assert.equal(calls[0][3].personalHidden,true);assert.equal(calls[0][3].allowHidden,false);
  pending.shift().resolve({});await save;assert.equal(hidden[0],'lesson');assert.equal(paints,1);
  const failed=context.stageHideLesson('lesson');pending.shift().reject(Error('offline'));await failed;assert.equal(paints,1);
  const switched=context.stageHideLesson('lesson');context.viewGen++;context.viewAccount={id:'c'.repeat(32)};
  pending.shift().resolve({});await switched;assert.equal(paints,1);
});
test('Test banner reserves its actual wrapped height so editor buttons are not covered after scrolling',()=>{
  const listeners=new Map(),window={},offsets=[];let height=150,resize;
  const banner={getBoundingClientRect:()=>({height})};
  const context={window,crypto,console,sessionStorage:{removeItem(){}},localStorage:{getItem:()=>null,removeItem(){}},
    ResizeObserver:class{constructor(fn){resize=fn;}observe(el){assert.equal(el,banner);}},
    document:{addEventListener:(event,fn)=>listeners.set(event,fn),getElementById:id=>id==='turso-main-banner'?banner:{addEventListener(){}},documentElement:{style:{setProperty:(key,value)=>offsets.push([key,value])}}}};
  runInNewContext(readFileSync(new URL('../staging/main-bridge.js',import.meta.url),'utf8'),context);
  listeners.get('DOMContentLoaded')();assert.deepEqual(offsets.at(-1),['--turso-banner-offset','162px']);
  height=190;resize();assert.deepEqual(offsets.at(-1),['--turso-banner-offset','202px']);
  assert.match(readFileSync(new URL('../staging/main-stage.css',import.meta.url),'utf8'),/scroll-padding-top:var\(--turso-banner-offset/);
});
