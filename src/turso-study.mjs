// Isolated study-data adapter. Not imported by the production Worker.
// Actors MUST be supplied by a trusted authentication layer, never a request body.
export class StudyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new StudyError(status, message); };
const reviewer = actor => ['ADMIN', 'DEVELOPER'].includes(actor?.role);
const stable = value => Array.isArray(value) ? '[' + value.map(stable).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}' : JSON.stringify(value);
const decode = result => result.rows.map(row => Object.fromEntries(result.cols.map((col,i) => {
  const value = row[i];
  return [col.name, value.type === 'null' ? null : ['integer','float'].includes(value.type) ? Number(value.value) : value.value];
})));
const encode = value => value === null ? {type:'null'} : typeof value === 'number'
  ? {type:'integer',value:String(value)} : {type:'text',value:String(value)};
export const statement = (sql,args=[]) => ({sql,args:args.map(encode),want_rows:true});
const stmt = statement;

export class TursoStudyClient {
  constructor({endpoint,token,fetchImpl=fetch,mode='test'}) {
    const url = new URL(endpoint);
    const host=mode==='test'?/^english-quiz-test-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.turso\.io$/
      :mode==='production'?/^english-quiz-production-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.turso\.io$/:null;
    if (url.protocol !== 'https:' || !host?.test(url.hostname)
        || url.pathname !== '/v2/pipeline' || url.search || url.hash || url.username || url.password || url.port) fail(500,'Only the test Turso database is allowed.');
    this.endpoint=endpoint; this.token=token; this.fetchImpl=fetchImpl;
  }
  async send(requests,{readSnapshot=false}={}) {
    let response;
    try {
      // Worker-native fetch must not receive the adapter as its receiver.
      response=await (0,this.fetchImpl)(this.endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(readSnapshot?45_000:20_000),
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.token},
        body:JSON.stringify({requests:[...requests,{type:'close'}]})});
    } catch(error) {
      // Fixed diagnostic categories only: never expose URLs, tokens or SQL.
      const message=String(error?.message||'');
      const reason=/redirect/i.test(message)?'REDIRECT':/illegal invocation|receiver/i.test(message)?'RECEIVER':/signal|timeout|abort/i.test(message)?'TIMEOUT':/dns|resolve/i.test(message)?'DNS':error?.name==='TypeError'?'TYPE':'NETWORK';
      fail(503,`Test database connection failed (${reason}). Retry the same operation.`);
    }
    if (!response.ok) fail(503,'Test database request failed.');
    let body;
    try { body=await response.json(); } catch { fail(503,'Unexpected database response. Retry the same operation.'); }
    if (body.baton != null || body.results?.length !== requests.length+1) fail(503,'Unexpected database response.');
    for (let i=0;i<body.results.length;i++) if (body.results[i].type !== 'ok'
      || body.results[i].response?.type !== (requests[i]?.type || 'close')) fail(503,'Database operation failed.');
    return body.results.slice(0,-1).map(item=>item.response);
  }
  async read(sql,args=[]) {
    const [response]=await this.send([{type:'execute',stmt:stmt(sql,args)}]);
    return decode(response.result);
  }
  async readMany(statements) {
    if(statements.some(command=>!/^\s*SELECT\b/i.test(command.sql))) fail(500,'Only SELECTs are allowed in a read snapshot.');
    return (await this.atomic(statements,{readOnly:true})).map(decode);
  }
  async atomic(statements,{readOnly=false}={}) {
    const commands=[stmt('PRAGMA foreign_keys=ON'),stmt(readOnly?'BEGIN':'BEGIN IMMEDIATE'),...statements,stmt('COMMIT')];
    const steps=commands.map((command,i)=>({stmt:command,...(i ? {condition:{type:'ok',step:i-1}} : {})}));
    // Retained dictionary data makes the initial read snapshot ~7 MiB. Give
    // that one atomic read time to arrive; writes keep their 20s bound. No retry.
    const [response]=await this.send([{type:'batch',batch:{steps}}],{readSnapshot:readOnly});
    const errors=response.result?.step_errors;
    const results=response.result?.step_results;
    if (!Array.isArray(errors) || !Array.isArray(results) || errors.length!==commands.length || results.length!==commands.length) fail(503,'Unexpected transaction response.');
    if (errors.some(Boolean)) {
      if (errors.some(error=>error && /CONSTRAINT/.test(error.code || ''))) fail(409,'The record changed. Reload it before editing.');
      const failure=new StudyError(503,'The transaction could not be saved.');
      failure.databaseCodes=errors.filter(Boolean).map(error=>error.code || 'UNKNOWN');
      throw failure;
    }
    if (results.some(result=>!result)) fail(503,'The transaction was not committed.');
    return results.slice(2,-1);
  }
}

function signedIn(actor) {
  if (!actor?.id || !['USER','ADMIN','DEVELOPER'].includes(actor.role)) fail(401,'Select a test session first.');
}
const lessonAccess = `l.deleted_at IS NULL AND (?=1 OR (l.published=1
  AND NOT EXISTS(SELECT 1 FROM lesson_access a WHERE a.lesson_id=l.id AND a.account_id=? AND a.personal_hidden=1)
  AND (l.hidden_from_students=0 OR EXISTS(SELECT 1 FROM lesson_access a WHERE a.lesson_id=l.id AND a.account_id=? AND a.allow_hidden=1))))`;
const cardAccess = `c.deleted_at IS NULL AND (
  (c.scope='profile' AND EXISTS(SELECT 1 FROM profile_members p WHERE p.account_id=? AND p.profile_id=c.owner_profile_id))
  OR (c.scope='shared' AND (?=1 OR EXISTS(SELECT 1 FROM legacy_ids x WHERE x.entity_kind='card' AND x.target_id=c.id
      AND x.source_namespace IN ('LESSON_DATA','IRREGULAR','GRAMMAR','TENSE_BANK','SPEAKOUT'))
    OR EXISTS(SELECT 1 FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id WHERE b.card_id=c.id AND b.deleted_at IS NULL AND ${lessonAccess}))))`;
function accessArgs(actor) { return [actor.id,+reviewer(actor),+reviewer(actor),actor.id,actor.id]; }
function cardDto(row) {
  return {id:row.id,en:row.en,ru:row.ru,partOfSpeech:row.part_of_speech,scope:row.scope,revision:row.revision};
}
export {lessonAccess,cardAccess,accessArgs};
function quizDto(row) { return {id:row.id,type:row.type,items:JSON.parse(row.items_json),revision:row.revision}; }
function revision(value) { if (!Number.isSafeInteger(value) || value<1) fail(400,'A valid expectedRevision is required.'); return value; }
function personalRevision(value){if(!Number.isSafeInteger(value)||value<0)fail(400,'A valid expectedRevision is required (0 for a new record).');return value;}
function fields(body,allowed){if(!body || Object.keys(body).some(key=>!allowed.includes(key)))fail(400,'Only the changed personal fields are allowed.');}
export const QUIZ_TYPES=['Flip','Choice','Type','Gap','Build','Match','True / false','Tap','Select all','Reverse','Spell','Letters','Listen','Definition','Odd one out','Memory','Hangman'];
function validateQuiz(value) {
  if (!value || !QUIZ_TYPES.includes(value.type) || !Array.isArray(value.items)
      || !value.items.length || value.items.length>100 || stable(value.items).length>50_000
      || value.items.some(item=>!item || typeof item!=='object' || Array.isArray(item))) fail(400,'Invalid quiz type or items.');
  // Keep the legacy type-specific fields intact; UI can render them as structured JSON.
  return {type:value.type,items:value.items};
}
async function requestHash(value) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

const lessonColumns={title:'title',description:'description',className:'class_name',unit:'unit',lesson:'lesson',date:'lesson_date',published:'published',hiddenFromStudents:'hidden_from_students'};
const lessonDefaults={title:'',description:'',className:'',unit:'',lesson:'',date:'',published:false,hiddenFromStudents:false};
const blockTypes=['heading','text','link','cards','vocab','exercise','quiz','note','dialogue','reading','table','task','divider','phrase','wordcard','word','rule','pdf','image','audio','file','pronunciation'];
function entityId(value){if(typeof value!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(value))fail(400,'Invalid lesson/block ID.');return value;}
function cardPlace(value){
  if(!['mine','music','tenses','phrasal','idioms','lesson-07','lesson-09','lesson-14','lesson-16','lesson-21','lesson-23'].includes(value))fail(400,'Invalid personal card destination.');
  return value;
}
function lessonChanges(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Invalid lesson changes.');
  fields(value,Object.keys(lessonColumns));
  for(const [key,item] of Object.entries(value)){
    if(['published','hiddenFromStudents'].includes(key)){if(typeof item!=='boolean')fail(400,'Invalid visibility flag.');}
    else if(typeof item!=='string'||item.length>(key==='description'?10_000:500))fail(400,'Invalid lesson metadata.');
    if(key==='date' && item && (!/^\d{4}-\d{2}-\d{2}$/.test(item)||!Number.isFinite(Date.parse(item+'T00:00:00Z'))||new Date(item+'T00:00:00Z').toISOString().slice(0,10)!==item))fail(400,'Invalid lesson date.');
  }
  return value;
}
function lessonBlock(value){
  fields(value,['id','expectedRevision','type','tab','cardId','content']);entityId(value.id);personalRevision(value.expectedRevision);
  if(!blockTypes.includes(value.type))fail(400,'This block type is not yet editable on the test server.');
  if(typeof value.tab!=='string'||value.tab.length>50||!value.content||typeof value.content!=='object'||Array.isArray(value.content)||stable(value.content).length>32_000)fail(400,'Invalid block content.');
  fields(value.content,Object.keys(value.content).filter(k=>!['id','type','tab','response','score','stageId','stageRevision','stageDefinition','stageBlockRevision','stageResponseRevision','__proto__','constructor','prototype'].includes(k)));
  if(value.content.items!==undefined && (!Array.isArray(value.content.items)||value.content.items.length>100||value.content.items.some(item=>!item||typeof item!=='object'||Array.isArray(item)||['picked','typed','marked','correct'].some(key=>key in item))))fail(400,'Personal answers are not lesson definitions.');
  if(value.cardId!==null)entityId(value.cardId);
  if(['word','wordcard'].includes(value.type) && !value.cardId)fail(400,'Word blocks require an existing shared card ID.');
  if(!['word','wordcard'].includes(value.type) && value.cardId!==null)fail(400,'Only word blocks may link a card.');
  return value;
}

export class StudyService {
  constructor(db) { this.db=db; }
  async lookupSharedCard(actor,body,lookup){
    fields(body,['mutationId','word']);
    if(typeof body.word!=='string'||!body.word.trim()||body.word.length>120)fail(400,'Enter a word or phrase.');
    return this.mutate(actor,body,['lookup-shared-card'],async()=>{
      const data=await lookup(body.word.trim());
      if(!data?.found||typeof data.word!=='string'||!data.word.trim()||data.word.length>200)fail(404,'No dictionary entry found.');
      const en=data.word.trim(),ru=typeof data.ru==='string'?data.ru:'',pos=data.cambridge?.pos||'';
      if(ru.length>10000||typeof pos!=='string'||pos.length>100||stable(data).length>256000)fail(413,'Dictionary entry is too large.');
      const existing=await this.db.read("SELECT id,revision FROM cards WHERE scope='shared' AND deleted_at IS NULL AND lower(en)=lower(?) AND ru=? AND part_of_speech=?",[en,ru,pos]);
      if(existing.length>1)fail(409,'Multiple shared cards match. Select the exact card instead.');
      const id=existing[0]?.id||'card_'+await requestHash({en:en.toLowerCase(),ru,pos});
      const extra={data,uk:data.cambridge?.uk||data.wooordhunt?.uk||'',us:data.cambridge?.us||data.wooordhunt?.us||''};
      return {statements:existing.length?[]:[
        stmt("INSERT INTO cards(id,scope,en,word_key,ru,part_of_speech,extra_json) VALUES(?,'shared',?,?,?,?,?) ON CONFLICT(id) DO NOTHING",[id,en,en.toLowerCase(),ru,pos,stable(extra)]),
        stmt("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM cards WHERE id=? AND scope='shared' AND deleted_at IS NULL AND lower(en)=lower(?) AND ru=? AND part_of_speech=?)",[id,en,ru,pos])],
        result:{id,en,ru,partOfSpeech:pos,scope:'shared',revision:existing[0]?.revision||1}};
    });
  }
  async lessons(actor) {
    signedIn(actor);
    return this.db.read(`SELECT l.id,l.title,l.revision,l.published FROM lessons l WHERE ${lessonAccess} ORDER BY l.lesson_date,l.id`,[+reviewer(actor),actor.id,actor.id]);
  }
  async cards(actor,{lessonId='',query='',offset=0,exact=false}={}) {
    signedIn(actor);
    if (typeof query!=='string' || query.length>120 || typeof exact!=='boolean' || !Number.isSafeInteger(offset) || offset<0 || offset>10_000) fail(400,'Invalid card search.');
    let restriction='';
    const args=accessArgs(actor);
    if (lessonId) {
      const visible=await this.db.read(`SELECT l.id FROM lessons l WHERE l.id=? AND ${lessonAccess}`,[lessonId,+reviewer(actor),actor.id,actor.id]);
      if (!visible.length) fail(404,'Lesson not found.');
      restriction=' AND EXISTS(SELECT 1 FROM lesson_blocks b WHERE b.lesson_id=? AND b.card_id=c.id AND b.deleted_at IS NULL)';
      args.push(lessonId);
    }
    args.push(query,offset);
    return (await this.db.read(`SELECT c.id,c.en,c.ru,c.part_of_speech,c.scope,c.revision FROM cards c WHERE ${cardAccess}${restriction}
      AND ${exact?'lower(c.en)=lower(?)':'instr(lower(c.en),lower(?))>0'} ORDER BY c.en,c.id LIMIT 40 OFFSET ?`,args)).map(cardDto);
  }
  async readableCard(actor,id) {
    signedIn(actor);
    const rows=await this.db.read(`SELECT c.* FROM cards c WHERE c.id=? AND ${cardAccess}`,[id,...accessArgs(actor)]);
    if (!rows.length) fail(404,'Card not found.');
    return rows[0];
  }
  async readableCards(actor,raw) {
    signedIn(actor);
    const ids=[...new Set(String(raw||'').split(',').map(item=>item.trim()).filter(Boolean))];
    if(!ids.length||ids.length>50||ids.some(item=>!/^[A-Za-z0-9_-]{1,100}$/.test(item)))fail(400,'Invalid card ids.');
    const rows=await this.db.read(`SELECT c.* FROM cards c WHERE c.id IN (${ids.map(()=>'?').join(',')}) AND ${cardAccess}`,[...ids,...accessArgs(actor)]);
    const byId=new Map(rows.map(row=>[row.id,row]));
    return ids.filter(id=>byId.has(id)).map(id=>byId.get(id));
  }
  async card(actor,id) {
    const record=await this.readableCard(actor,id);
    const collections=await this.db.read(`SELECT q.id,q.revision FROM quiz_collections q JOIN card_quiz_collections c ON c.collection_id=q.id WHERE c.card_id=? ORDER BY q.id`,[id]);
    const quizzes=await this.db.read(`SELECT q.id,q.type,q.items_json,q.revision FROM quizzes q JOIN card_quiz_collections c ON c.collection_id=q.collection_id
      WHERE c.card_id=? AND q.deleted_at IS NULL ORDER BY q.position,q.id`,[id]);
    return {...cardDto(record),canEdit:reviewer(actor),collections,quizzes:quizzes.map(quizDto)};
  }
  async receipt(actor,mutationId,hash) {
    const rows=await this.db.read(`SELECT request_sha256,result_json FROM operation_receipts WHERE account_id=? AND mutation_id=? AND expires_at>unixepoch()`,[actor.id,mutationId]);
    if (!rows.length) return null;
    if (rows[0].request_sha256!==hash) fail(409,'This operation ID was already used for different changes.');
    return JSON.parse(rows[0].result_json);
  }
  async mutate(actor,body,identity,build,{personal=false}={}) {
    signedIn(actor);
    if (!personal && !reviewer(actor)) fail(403,'Only teacher/developer test sessions can edit definitions.');
    if (!body || !/^[A-Za-z0-9_-]{12,100}$/.test(body.mutationId || '')) fail(400,'A stable mutationId is required.');
    const hash=await requestHash({identity,body});
    const replay=await this.receipt(actor,body.mutationId,hash);
    if (replay) return replay;
    const {statements,result}=await build();
    const commands=[stmt('DROP TABLE IF EXISTS temp.mutation_guard'),stmt('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))'),...statements,
      stmt('DELETE FROM operation_receipts WHERE account_id=? AND mutation_id=? AND expires_at<=unixepoch()',[actor.id,body.mutationId]),
      stmt('INSERT INTO operation_receipts(account_id,mutation_id,request_sha256,result_json,expires_at) VALUES(?,?,?,?,unixepoch()+86400)',[actor.id,body.mutationId,hash,stable(result)]),stmt('DROP TABLE temp.mutation_guard')];
    try { await this.db.atomic(commands); }
    catch (error) {
      // Concurrent duplicate requests may race past the initial receipt lookup.
      // An uncertain commit is retried with the same mutationId, never a new ID.
      const saved=await this.receipt(actor,body.mutationId,hash);
      if (saved) return saved;
      throw error;
    }
    return result;
  }
  guard() { return stmt('INSERT INTO mutation_guard SELECT changes()=1'); }
  async setLessonAccess(actor,accountId,lessonId,body){
    fields(body,['mutationId','expected','changes']);entityId(accountId);entityId(lessonId);
    for(const value of [body.expected,body.changes]){
      fields(value,['allowHidden','personalHidden']);
      if(typeof value.allowHidden!=='boolean'||typeof value.personalHidden!=='boolean')fail(400,'Two boolean access flags are required.');
    }
    return this.mutate(actor,body,['managed-lesson-access',accountId,lessonId],async()=>{
      const [row]=await this.db.read(`SELECT a.allow_hidden,a.personal_hidden FROM lessons l
        LEFT JOIN lesson_access a ON a.lesson_id=l.id AND a.account_id=?
        WHERE l.id=? AND l.deleted_at IS NULL AND EXISTS(SELECT 1 FROM account_refs WHERE id=?)`,[accountId,lessonId,accountId]);
      if(!row)fail(404,'Imported account or lesson not found.');
      const expected=body.expected,changes=body.changes;
      if(!!row.allow_hidden!==expected.allowHidden||!!row.personal_hidden!==expected.personalHidden)fail(409,'Lesson access changed. Reload before saving.');
      return {statements:[stmt(`INSERT INTO lesson_access(account_id,lesson_id,allow_hidden,personal_hidden)
        SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM lessons WHERE id=? AND deleted_at IS NULL)
        ON CONFLICT(account_id,lesson_id) DO UPDATE SET allow_hidden=excluded.allow_hidden,personal_hidden=excluded.personal_hidden
        WHERE lesson_access.allow_hidden=? AND lesson_access.personal_hidden=?`,[accountId,lessonId,+changes.allowHidden,+changes.personalHidden,lessonId,+expected.allowHidden,+expected.personalHidden]),this.guard()],
        result:{accountId,lessonId,...changes}};
    });
  }
  async createLesson(actor,body){
    fields(body,['mutationId','id','changes','blocks']);entityId(body.id);
    const changes={...lessonDefaults,...lessonChanges(body.changes)};
    if(!changes.title.trim())fail(400,'Enter a lesson title before saving.');
    if(!Array.isArray(body.blocks)||body.blocks.length>200)fail(400,'Invalid lesson blocks.');
    const blocks=body.blocks.map(lessonBlock);
    if(blocks.some(b=>b.expectedRevision!==0)||new Set(blocks.map(b=>b.id)).size!==blocks.length)fail(400,'New blocks must have unique IDs and revision 0.');
    return this.mutate(actor,body,['create-lesson',body.id],async()=>{
      const columns=Object.values(lessonColumns),args=Object.keys(lessonColumns).map(k=>typeof changes[k]==='boolean'?+changes[k]:changes[k]);
      const commands=[stmt(`INSERT INTO lessons(id,${columns.join(',')},mode) VALUES(?,${columns.map(()=>'?').join(',')},?)`,[body.id,...args,changes.published?'preview':'edit']),this.guard()];
      for(const [position,b] of blocks.entries())commands.push(...this.lessonBlockCommands(body.id,b,position));
      return {statements:commands,result:{id:body.id,revision:1,blocks:blocks.map(b=>({id:b.id,revision:1}))}};
    });
  }
  lessonBlockCommands(lessonId,b,position){
    const commands=[];
    if(b.cardId)commands.push(stmt("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM cards WHERE id=? AND scope='shared' AND deleted_at IS NULL)",[b.cardId]));
    commands.push(b.expectedRevision===0
      ?stmt('INSERT INTO lesson_blocks(lesson_id,id,position,type,tab,card_id,content_json) VALUES(?,?,?,?,?,?,?)',[lessonId,b.id,position,b.type,b.tab,b.cardId,stable(b.content)])
      :stmt('UPDATE lesson_blocks SET type=?,tab=?,card_id=?,content_json=?,revision=revision+1 WHERE lesson_id=? AND id=? AND revision=? AND deleted_at IS NULL',[b.type,b.tab,b.cardId,stable(b.content),lessonId,b.id,b.expectedRevision]),this.guard());
    return commands;
  }
  async editLesson(actor,id,body){
    entityId(id);fields(body,['mutationId','expectedRevision','changes','upserts','deletes','order']);
    const expected=revision(body.expectedRevision),changes=lessonChanges(body.changes);
    if(!Array.isArray(body.upserts)||!Array.isArray(body.deletes)||body.upserts.length+body.deletes.length>200)fail(400,'Invalid block changes.');
    const upserts=body.upserts.map(lessonBlock),deletes=body.deletes.map(b=>{fields(b,['id','expectedRevision']);entityId(b.id);revision(b.expectedRevision);return b;});
    if(new Set([...upserts,...deletes].map(b=>b.id)).size!==upserts.length+deletes.length)fail(400,'Conflicting block operations.');
    if(body.order!==undefined && (!Array.isArray(body.order)||body.order.length>200||new Set(body.order).size!==body.order.length))fail(400,'Invalid block order.');
    for(const block of body.order||[])entityId(block);
    if(!Object.keys(changes).length&&!upserts.length&&!deletes.length&&!body.order)fail(400,'No changed fields.');
    return this.mutate(actor,body,['edit-lesson',id],async()=>{
      const [lesson]=await this.db.read('SELECT * FROM lessons WHERE id=? AND deleted_at IS NULL',[id]);
      if(!lesson)fail(404,'Lesson not found.');
      if(lesson.revision!==expected)fail(409,'The lesson changed. Reload before saving.');
      if('title' in changes && !changes.title.trim())fail(400,'Enter a lesson title before saving.');
      const current=await this.db.read('SELECT id,revision,position FROM lesson_blocks WHERE lesson_id=? AND deleted_at IS NULL ORDER BY position,id',[id]);
      const active=new Set(current.map(b=>b.id));
      for(const b of deletes)active.delete(b.id);
      for(const b of upserts)active.add(b.id);
      if(active.size>200)fail(400,'Too many blocks.');
      if(body.order && (body.order.length!==active.size||body.order.some(key=>!active.has(key))))fail(400,'Order must contain exactly the remaining blocks.');
      const assignments=Object.keys(changes).map(k=>lessonColumns[k]+'=?'),args=Object.values(changes).map(v=>typeof v==='boolean'?+v:v);
      if('published' in changes){assignments.push('mode=?');args.push(changes.published?'preview':'edit');}
      const commands=[stmt(`UPDATE lessons SET ${[...assignments,'revision=revision+1','updated_at=unixepoch()'].join(',')} WHERE id=? AND revision=? AND deleted_at IS NULL`,[...args,id,expected]),this.guard()];
      let position=current.reduce((n,b)=>Math.max(n,b.position+1),0);
      for(const b of upserts)commands.push(...this.lessonBlockCommands(id,b,position++));
      for(const b of deletes)commands.push(stmt('UPDATE lesson_blocks SET deleted_at=unixepoch(),revision=revision+1 WHERE lesson_id=? AND id=? AND revision=? AND deleted_at IS NULL',[id,b.id,b.expectedRevision]),this.guard());
      for(const [i,key] of (body.order||[]).entries())commands.push(stmt('UPDATE lesson_blocks SET position=? WHERE lesson_id=? AND id=? AND deleted_at IS NULL',[i,id,key]),this.guard());
      return {statements:commands,result:{id,revision:expected+1,blocks:[...current.filter(b=>!deletes.some(d=>d.id===b.id)&&!upserts.some(u=>u.id===b.id)),...upserts.map(b=>({id:b.id,revision:b.expectedRevision+1}))].map(b=>({id:b.id,revision:b.revision}))}};
    });
  }
  async deleteLesson(actor,id,body){
    entityId(id);fields(body,['mutationId','expectedRevision']);const expected=revision(body.expectedRevision);
    return this.mutate(actor,body,['delete-lesson',id],async()=>({statements:[stmt('UPDATE lessons SET deleted_at=unixepoch(),revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=? AND deleted_at IS NULL',[id,expected]),this.guard()],result:{id,deleted:true,revision:expected+1}}));
  }
  async personal(actor,body,identity,build){
    signedIn(actor);
    const members=await this.db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[actor.id]);
    if(members.length!==1)fail(409,'This account has not been imported into test Turso.');
    const profile=members[0].profile_id;
    return this.mutate(actor,body,[...identity,profile],async()=>{
      const command=await build(profile);
      command.statements.unshift(stmt('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM profile_members WHERE account_id=? AND profile_id=?)',[actor.id,profile]));
      return command;
    },{personal:true});
  }
  cardGuard(actor,id){return stmt(`INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM cards c WHERE c.id=? AND ${cardAccess})`,[id,...accessArgs(actor)]);}
  linkRevisionCommands(profile,expected){
    return [expected===0
      ?stmt("INSERT INTO profile_settings(profile_id,key,value_json) VALUES(?,'tursoCardLinks','{}')",[profile])
      :stmt("UPDATE profile_settings SET revision=revision+1 WHERE profile_id=? AND key='tursoCardLinks' AND revision=?",[profile,expected]),this.guard()];
  }
  async linkCard(actor,body){
    fields(body,['mutationId','cardId','place','expectedRevision','expectedCardRevision']);entityId(body.cardId);
    const expected=personalRevision(body.expectedRevision),cardRevision=revision(body.expectedCardRevision);
    const place=cardPlace(body.place);
    return this.personal(actor,body,['link-card',body.cardId,place],async profile=>{
      const card=await this.readableCard(actor,body.cardId);
      return {statements:[...this.linkRevisionCommands(profile,expected),this.cardGuard(actor,card.id),
        stmt('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM cards WHERE id=? AND revision=?)',[card.id,cardRevision]),
        stmt('INSERT INTO profile_cards(profile_id,card_id,place,position) VALUES(?,?,?,(SELECT COALESCE(MIN(position),1)-1 FROM profile_cards WHERE profile_id=? AND place=?))',[profile,card.id,place,profile,place]),this.guard()],
        result:{id:card.id,place,revision:expected+1,card:{...JSON.parse(card.extra_json),en:card.en,word:card.en,ru:card.ru,pos:card.part_of_speech,
          stageId:card.id,stageRevision:card.revision,stageScope:card.scope,stageLinksRevision:expected+1,place}}};
    });
  }
  async unlinkCard(actor,id,body){
    entityId(id);fields(body,['mutationId','place','expectedRevision']);const expected=personalRevision(body.expectedRevision),place=cardPlace(body.place);
    // Removing an own link is also allowed when its definition is hidden/deleted.
    // Neither the physical card nor anyone's existing progress is deleted.
    return this.personal(actor,body,['unlink-card',id,place],async profile=>({statements:[...this.linkRevisionCommands(profile,expected),
      stmt('DELETE FROM profile_cards WHERE profile_id=? AND card_id=? AND place=?',[profile,id,place]),this.guard()],
      result:{id,place,unlinked:true,revision:expected+1}}));
  }
  async linkManagedCard(actor,accountId,body){
    entityId(accountId);fields(body,['mutationId','cardId','place','expectedRevision','expectedCardRevision']);entityId(body.cardId);
    const expected=personalRevision(body.expectedRevision),cardRevision=revision(body.expectedCardRevision),place=cardPlace(body.place);
    return this.mutate(actor,body,['managed-link-card',accountId,body.cardId,place],async()=>{
      const members=await this.db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[accountId]);
      if(members.length!==1)fail(409,'Target profile has not been imported.');
      const profile=members[0].profile_id,target={id:accountId,role:'USER'},card=await this.readableCard(target,body.cardId);
      return {statements:[...this.linkRevisionCommands(profile,expected),this.cardGuard(target,card.id),
        stmt('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM cards WHERE id=? AND revision=?)',[card.id,cardRevision]),
        stmt('INSERT INTO profile_cards(profile_id,card_id,place,position) VALUES(?,?,?,(SELECT COALESCE(MIN(position),1)-1 FROM profile_cards WHERE profile_id=? AND place=?))',[profile,card.id,place,profile,place]),this.guard()],
        result:{id:card.id,place,revision:expected+1,card:{...JSON.parse(card.extra_json),en:card.en,word:card.en,ru:card.ru,pos:card.part_of_speech,
          stageId:card.id,stageRevision:card.revision,stageScope:card.scope,stageLinksRevision:expected+1,place}}};
    });
  }
  async unlinkManagedCard(actor,accountId,id,body){
    entityId(accountId);entityId(id);fields(body,['mutationId','place','expectedRevision']);
    const expected=personalRevision(body.expectedRevision),place=cardPlace(body.place);
    return this.mutate(actor,body,['managed-unlink-card',accountId,id,place],async()=>{
      const members=await this.db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[accountId]);
      if(members.length!==1)fail(409,'Target profile has not been imported.');
      const profile=members[0].profile_id;
      return {statements:[...this.linkRevisionCommands(profile,expected),
        stmt('DELETE FROM profile_cards WHERE profile_id=? AND card_id=? AND place=?',[profile,id,place]),this.guard()],
        result:{id,place,unlinked:true,revision:expected+1}};
    });
  }
  async saveCardProgress(actor,id,body){
    fields(body,['mutationId','expectedRevision','changes']);
    const expected=personalRevision(body.expectedRevision),changes=body.changes;
    if(!changes || !Object.keys(changes).length || Object.keys(changes).some(key=>!['learned','variants'].includes(key))
      || ('learned' in changes && typeof changes.learned!=='boolean')
      || ('variants' in changes && (!Array.isArray(changes.variants)||changes.variants.length>100||changes.variants.some(v=>typeof v!=='string'||v.length>1000))))fail(400,'Invalid personal card progress.');
    return this.personal(actor,body,['card-progress',id],async profile=>{
      await this.readableCard(actor,id);
      const [old]=await this.db.read('SELECT learned,variants_json FROM card_progress WHERE profile_id=? AND card_id=?',[profile,id]);
      const learned='learned' in changes?+changes.learned:old?.learned||0;
      const variants='variants' in changes?changes.variants:old?JSON.parse(old.variants_json):[];
      const sql=expected===0?'INSERT INTO card_progress(profile_id,card_id,learned,variants_json) VALUES(?,?,?,?)'
        :'UPDATE card_progress SET learned=?,variants_json=?,revision=revision+1,updated_at=unixepoch() WHERE profile_id=? AND card_id=? AND revision=?';
      return {statements:[this.cardGuard(actor,id),stmt(sql,expected===0?[profile,id,learned,stable(variants)]:[learned,stable(variants),profile,id,expected]),this.guard()],
        result:{id,learned:!!learned,variants,revision:expected+1}};
    });
  }
  async answerCard(actor,id,body){
    fields(body,['mutationId','expectedRevision','quizType','correct']);
    const expected=personalRevision(body.expectedRevision),type=body.quizType;
    if(!QUIZ_TYPES.includes(type)||type==='Flip'||typeof body.correct!=='boolean')fail(400,'Invalid quiz answer.');
    return this.personal(actor,body,['quiz-answer',id,type],async profile=>{
      const card=await this.readableCard(actor,id);
      const [old]=await this.db.read('SELECT progress_json FROM quiz_progress WHERE profile_id=? AND card_id=? AND quiz_type=?',[profile,id,type]);
      const prior=old?JSON.parse(old.progress_json):{};
      // A cleared weak-card counter starts a new sequence on the next answer.
      const misses=prior.cleared?0:Number(prior.misses)||0,streak=prior.cleared?0:Number(prior.streak)||0;
      const progress={en:card.en,type,misses:misses+(body.correct?0:1),streak:body.correct?streak+1:0,cleared:body.correct && streak+1>=4};
      const sql=expected===0?'INSERT INTO quiz_progress(profile_id,card_id,quiz_type,progress_json) VALUES(?,?,?,?)'
        :'UPDATE quiz_progress SET progress_json=?,revision=revision+1,updated_at=unixepoch() WHERE profile_id=? AND card_id=? AND quiz_type=? AND revision=?';
      return {statements:[this.cardGuard(actor,id),stmt(sql,expected===0?[profile,id,type,stable(progress)]:[stable(progress),profile,id,type,expected]),this.guard()],result:{id,type,progress,revision:expected+1}};
    });
  }
  async saveLessonResponse(actor,lessonId,blockId,body){
    fields(body,['mutationId','expectedRevision','expectedBlockRevision','response']);
    const expected=personalRevision(body.expectedRevision),blockRevision=revision(body.expectedBlockRevision);
    return this.personal(actor,body,['lesson-response',lessonId,blockId],async profile=>{
      const [block]=await this.db.read(`SELECT b.type,b.content_json FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id
        WHERE b.lesson_id=? AND b.id=? AND b.deleted_at IS NULL AND ${lessonAccess}`,[lessonId,blockId,+reviewer(actor),actor.id,actor.id]);
      if(!block)fail(404,'Task not found.');
      let response=body.response;
      if(block.type==='task'){
        if(typeof response!=='string'||response.length>10_000)fail(400,'Invalid task response.');
      }else if(['quiz','exercise'].includes(block.type)){
        const content=JSON.parse(block.content_json),items=content.items||[];
        if(!response || Object.keys(response).some(key=>!['items','checked'].includes(key)) || (response.checked!==undefined && typeof response.checked!=='boolean')
          || !Array.isArray(response.items)||response.items.length!==items.length||items.length>100)fail(400,'Invalid exercise response.');
        const checked=response.checked===true;
        const answers=response.items.map((answer,i)=>{
          if(!answer || Object.keys(answer).some(key=>!['picked','typed'].includes(key))
            || (answer.picked!=null && (!Number.isSafeInteger(answer.picked)||answer.picked<0||answer.picked>=(items[i].options||[]).length))
            || (answer.typed!==undefined && (typeof answer.typed!=='string'||answer.typed.length>2000)))fail(400,'Send only selected options or typed answers.');
          return {...(answer.picked!=null?{picked:answer.picked}:{}),...(answer.typed!==undefined?{typed:answer.typed}:{})};
        });
        response={items:answers,...(checked?{checked:true}:{})};
        if(checked && block.type==='exercise')for(const [i,answer] of answers.entries()){
          answer.marked=true;
          answer.correct=items[i].kind==='write'
            ?String(answer.typed||'').trim().toLowerCase()===String(items[i].write||'').trim().toLowerCase()
            :answer.picked!==undefined && answer.picked===Number(items[i].answer);
        }
        if(checked && block.type==='quiz' && (content.quizType==='Choice'||(!content.quizType && items.some(item=>item.options))))
          response.score=answers.reduce((sum,answer,i)=>sum+(answer.picked!==undefined && answer.picked===Number(items[i].answer)?1:0),0)+' / '+items.length;
      }else fail(400,'This block has no personal answer field.');
      if(stable(response).length>50_000)fail(400,'Response too large.');
      const sql=expected===0?'INSERT INTO lesson_responses(profile_id,lesson_id,block_id,response_json) VALUES(?,?,?,?)'
        :'UPDATE lesson_responses SET response_json=?,revision=revision+1,updated_at=unixepoch() WHERE profile_id=? AND lesson_id=? AND block_id=? AND revision=?';
      return {statements:[stmt(`INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM lesson_blocks b JOIN lessons l ON l.id=b.lesson_id
          WHERE b.lesson_id=? AND b.id=? AND b.revision=? AND b.deleted_at IS NULL AND ${lessonAccess})`,[lessonId,blockId,blockRevision,+reviewer(actor),actor.id,actor.id]),
        stmt(sql,expected===0?[profile,lessonId,blockId,stable({definitionRevision:blockRevision,value:response})]:[stable({definitionRevision:blockRevision,value:response}),profile,lessonId,blockId,expected]),this.guard()],
        result:{lessonId,blockId,response,revision:expected+1}};
    });
  }
  async editCard(actor,id,body) {
    return this.mutate(actor,body,['edit-card',id],async()=>{
      const expected=revision(body.expectedRevision);
      if (!body.changes || Object.keys(body.changes).join(',')!=='ru' || typeof body.changes.ru!=='string' || body.changes.ru.length>10_000) fail(400,'Send only the changed translation in changes.ru.');
      await this.readableCard(actor,id);
      return {statements:[stmt(`UPDATE cards SET ru=?,revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=? AND deleted_at IS NULL`,[body.changes.ru,id,expected]),this.guard()],result:{id,ru:body.changes.ru,revision:expected+1}};
    });
  }
  async deleteCard(actor,id,body) {
    return this.mutate(actor,body,['delete-card',id],async()=>{
      const expected=revision(body.expectedRevision);
      await this.readableCard(actor,id);
      return {statements:[stmt('UPDATE cards SET deleted_at=unixepoch(),revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=? AND deleted_at IS NULL',[id,expected]),this.guard()],result:{id,deleted:true,revision:expected+1}};
    });
  }
  async createQuiz(actor,cardId,body) {
    return this.mutate(actor,body,['create-quiz',cardId],async()=>{
      const expected=revision(body.expectedRevision);
      const quiz=validateQuiz(body.quiz);
      const expectedCollection=body.expectedCollectionRevision;
      if (!Number.isSafeInteger(expectedCollection) || expectedCollection<0) fail(400,'A valid collection revision is required.');
      const card=await this.readableCard(actor,cardId);
      if (card.scope!=='shared') fail(403,'This staged quiz editor handles shared cards only.');
      const quizId='quiz_'+crypto.randomUUID(),collectionId='collection_'+crypto.randomUUID();
      const statements=[stmt('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM cards WHERE id=? AND revision=? AND deleted_at IS NULL)',[cardId,expected])];
      if (expectedCollection===0) statements.push(stmt('INSERT INTO quiz_collections(id,legacy_word_key) VALUES(?,?)',[collectionId,card.word_key]));
      else statements.push(stmt('UPDATE quiz_collections SET revision=revision+1 WHERE legacy_word_key=? AND revision=?',[card.word_key,expectedCollection]));
      statements.push(this.guard(),
        stmt('INSERT INTO card_quiz_collections(card_id,collection_id) SELECT c.id,q.id FROM cards c JOIN quiz_collections q ON q.legacy_word_key=c.word_key WHERE c.word_key=? AND c.deleted_at IS NULL ON CONFLICT(card_id,collection_id) DO NOTHING',[card.word_key]),
        stmt(`INSERT INTO quizzes(id,collection_id,position,type,items_json)
          SELECT ?,c.id,COALESCE((SELECT max(position)+1 FROM quizzes WHERE collection_id=c.id),0),?,? FROM quiz_collections c WHERE c.legacy_word_key=?`,[quizId,quiz.type,stable(quiz.items),card.word_key]),this.guard());
      return {statements,result:{id:quizId,type:quiz.type,items:quiz.items,revision:1}};
    });
  }
  async editQuiz(actor,id,body) {
    return this.mutate(actor,body,['edit-quiz',id],async()=>{
      const expected=revision(body.expectedRevision),quiz=validateQuiz(body.quiz);
      return {statements:[stmt('UPDATE quizzes SET type=?,items_json=?,revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=? AND deleted_at IS NULL',[quiz.type,stable(quiz.items),id,expected]),this.guard(),
        stmt('UPDATE quiz_collections SET revision=revision+1 WHERE id=(SELECT collection_id FROM quizzes WHERE id=?)',[id]),this.guard()],result:{id,...quiz,revision:expected+1}};
    });
  }
  async deleteQuiz(actor,id,body) {
    return this.mutate(actor,body,['delete-quiz',id],async()=>{
      const expected=revision(body.expectedRevision);
      return {statements:[stmt('UPDATE quizzes SET deleted_at=unixepoch(),revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=? AND deleted_at IS NULL',[id,expected]),this.guard(),
        stmt('UPDATE quiz_collections SET revision=revision+1 WHERE id=(SELECT collection_id FROM quizzes WHERE id=?)',[id]),this.guard()],result:{id,deleted:true,revision:expected+1}};
    });
  }
}
