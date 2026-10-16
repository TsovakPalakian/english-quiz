import {StudyError,StudyService,statement as s,QUIZ_TYPES} from './learning-study.mjs';
import {validateContentGroups} from './exam-scoring.mjs';
import {legacyLessons} from './learning-legacy-read.mjs';
import {lessonMediaMetadata} from './learning-lesson-media.mjs';
import {validateColorDocument} from './text-formatting.mjs';
const ready=new WeakMap(),staff=actor=>['ADMIN','DEVELOPER'].includes(actor?.role);
const types=new Set(['text','heading','pdf','link','cards','image','audio','video','vocab','exercise','note','dialogue','reading','pronunciation','table','task','file','divider','phrase','quiz','wordcard','word','rule']);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value)),byte=>byte.toString(16).padStart(2,'0')).join('');
export function ensureSpeakout(db){
  if(!ready.has(db))ready.set(db,db.atomic([
    s(`CREATE TABLE IF NOT EXISTS speakout_documents(level TEXT NOT NULL,unit_index INTEGER NOT NULL,lesson_index INTEGER NOT NULL,content_json TEXT NOT NULL CHECK(json_valid(content_json)),published INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(level,unit_index,lesson_index))`),
    s(`CREATE TABLE IF NOT EXISTS speakout_answers(account_id TEXT NOT NULL,level TEXT NOT NULL,unit_index INTEGER NOT NULL,lesson_index INTEGER NOT NULL,definition_revision INTEGER NOT NULL,answers_json TEXT NOT NULL CHECK(json_valid(answers_json)),PRIMARY KEY(account_id,level,unit_index,lesson_index))`)
  ]).catch(error=>{ready.delete(db);throw error;}));return ready.get(db);
}
export async function speakoutRevisions(db,actor){
  const tables=await db.read("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('speakout_documents','speakout_answers')");
  const names=new Set(tables.map(row=>row.name));
  const [catalog,documents,answers]=await db.readMany([
    s("SELECT value_json FROM catalog_documents WHERE namespace='static' AND key='SPEAKOUT'"),
    s(names.has('speakout_documents')?'SELECT level,unit_index,lesson_index,revision,published FROM speakout_documents':'SELECT NULL level WHERE 0'),
    s(names.has('speakout_answers')?'SELECT level,unit_index,lesson_index,definition_revision,answers_json FROM speakout_answers WHERE account_id=?':'SELECT NULL level WHERE 0',names.has('speakout_answers')?[actor.id]:[])
  ]);
  const empty=await hash('{}'),own=new Map(answers.map(row=>[[row.level,row.unit_index,row.lesson_index].join(':'),row]));
  const lessons={};
  for(const row of documents){
    const key=[row.level,row.unit_index,row.lesson_index].join(':'),answer=own.get(key);
    lessons[key]=!row.published&&!staff(actor)?'hidden:'+row.revision:row.revision+':'+(answer?.definition_revision===row.revision?await hash(answer.answers_json):empty);
  }
  return {catalogRevision:catalog[0]?await hash(catalog[0].value_json):'',defaultRevision:staff(actor)?'0:'+empty:'hidden:0',lessons};
}
async function locate(db,{level,unit,lesson}){
  if(!['A1','A2','A2+','B1','B1+','B2','B2+','C1-C2'].includes(level)||!Number.isInteger(unit)||unit<0||!Number.isInteger(lesson)||lesson<0)throw new StudyError(400,'Invalid Speakout lesson.');
  const [doc]=await db.read("SELECT value_json FROM catalog_documents WHERE namespace='static' AND key='SPEAKOUT'");
  const entry=doc&&JSON.parse(doc.value_json).find(row=>row.level===level)?.units?.[unit]?.lessons?.[lesson];
  if(!entry)throw new StudyError(404,'Speakout lesson not found.');return {args:[level,unit,lesson],title:(unit+1)+entry.letter+' '+entry.title};
}
async function document(db,location,store){
  const {args,title}=await locate(db,location);await ensureSpeakout(db);
  const query='SELECT * FROM speakout_documents WHERE level=? AND unit_index=? AND lesson_index=?';let [row]=await db.read(query,args);
  // One-time snapshot of the previous integration, never a write back to Lessons.
  if(!row&&(await db.read("SELECT name FROM sqlite_master WHERE type='table' AND name='speakout_lessons'")).length){
    const [old]=await db.read('SELECT lesson_id FROM speakout_lessons WHERE level=? AND unit_index=? AND lesson_index=?',args);
    if(old){let source;try{source=(await legacyLessons(db,{id:'speakout-import',role:'DEVELOPER'},{lessonId:old.lesson_id})).materials[0];}catch(error){if(error.status!==404)throw error;}
      if(source){
        const blocks=source.blocks.map(block=>{const copy=structuredClone(block);for(const key of Object.keys(copy))if(key.startsWith('stage')||['response','score','fileId'].includes(key))delete copy[key];copy.id=String(copy.id);return copy;});
        for(const block of blocks)if(block.localMediaKey){if(!store)throw new StudyError(503,'Speakout storage unavailable.');const file=await store.readVerified(block.localMediaKey);const key='stage-local/speakout/'+await hash(JSON.stringify(args))+'/'+block.id+'/'+file.metadata.sha256;await store.putImmutable(key,file.bytes,file.metadata);block.localMediaKey=key;}
        await db.atomic([s('INSERT OR IGNORE INTO speakout_documents(level,unit_index,lesson_index,content_json,published) VALUES(?,?,?,?,?)',[...args,JSON.stringify({title:source.title,description:source.description||'',blocks}),+source.published])]);[row]=await db.read(query,args);
      }
    }
  }return {row,args,title};
}
export async function speakoutLesson(db,actor,location,_mutationId,store,summary=false){
  const {row,title}=await document(db,location,store);if((!row||!row.published)&&!staff(actor))return {cacheRevision:'hidden:'+(row?.revision||0),materials:[]};
  const content=row?JSON.parse(row.content_json):{title,description:'',blocks:[]};
  const [answers]=row?await db.read('SELECT answers_json FROM speakout_answers WHERE account_id=? AND level=? AND unit_index=? AND lesson_index=? AND definition_revision=?',[actor.id,location.level,location.unit,location.lesson,row.revision]):[];
  const cacheRevision=(row?.revision||0)+':'+await hash(answers?.answers_json||'{}');
  if(summary)return {revision:row?.revision||0,cacheRevision,available:true};
  return {cacheRevision,materials:[{...content,id:location.level+':'+location.unit+':'+location.lesson,revision:row?.revision||0,published:!!row?.published,answers:answers?JSON.parse(answers.answers_json):{}}]};
}
function content(value){
  if(!value||Object.keys(value).some(key=>!['title','description','descriptionFormatting','date','className','unit','lesson','blocks'].includes(key))||typeof value.title!=='string'||!value.title.trim()||value.title.length>300||typeof value.description!=='string'||value.description.length>5000||!Array.isArray(value.blocks)||value.blocks.length>200)throw new StudyError(400,'Invalid Speakout content.');
  if(value.descriptionFormatting)validateColorDocument(value.descriptionFormatting,value.description);
  for(const key of ['date','className','unit','lesson'])if(value[key]!==undefined&&(typeof value[key]!=='string'||value[key].length>40))throw new StudyError(400,'Invalid Speakout information.');
  if(value.date&&!/^\d{4}-\d{2}-\d{2}$/.test(value.date))throw new StudyError(400,'Use YYYY-MM-DD for the date.');
  const ids=new Set();for(const block of value.blocks){if(!block||!types.has(block.type)||typeof block.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(block.id)||ids.has(block.id)||JSON.stringify(block).length>32000||Object.keys(block).some(key=>key.startsWith('stage')||['response','score','fileId'].includes(key)))throw new StudyError(400,'Invalid independent Speakout block.');if(block.type==='quiz'&&block.quizType&&!QUIZ_TYPES.includes(block.quizType))throw new StudyError(400,'Invalid quiz type.');ids.add(block.id);}
  try{validateContentGroups(value.blocks);}catch(error){throw new StudyError(400,error.message);}return value;
}
export async function saveSpeakout(db,actor,body,store){
  if(!staff(actor))throw new StudyError(403,'Only a teacher can edit Speakout.');
  if(Object.keys(body).some(key=>!['level','unit','lesson','action','mutationId','expectedRevision','published','content'].includes(key))||body.action!=='save'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||typeof body.published!=='boolean')throw new StudyError(400,'Invalid Speakout save.');
  const next=content(body.content),{row,args}=await document(db,body,store),files=new Set(JSON.parse(row?.content_json||'{"blocks":[]}').blocks.map(block=>block.localMediaKey).filter(Boolean));
  for(const block of next.blocks)if(block.localMediaKey&&!files.has(block.localMediaKey))throw new StudyError(400,'Upload the file through Speakout first.');
  const tx=new StudyService(db);return tx.mutate(actor,body,['speakout-save',...args],async()=>({statements:[body.expectedRevision===0?s('INSERT INTO speakout_documents(level,unit_index,lesson_index,content_json,published) VALUES(?,?,?,?,?)',[...args,JSON.stringify(next),+body.published]):s('UPDATE speakout_documents SET content_json=?,published=?,revision=revision+1 WHERE level=? AND unit_index=? AND lesson_index=? AND revision=?',[JSON.stringify(next),+body.published,...args,body.expectedRevision]),tx.guard()],result:{revision:body.expectedRevision+1,published:body.published,cacheRevision:(body.expectedRevision+1)+':'+await hash('{}')}}));
}
export async function uploadSpeakout(db,actor,location,bytes,mime,name,store){
  if(!staff(actor))throw new StudyError(403,'Only a teacher can upload Speakout files.');
  const {row,args}=await document(db,location,store),expected=Number(location.expectedRevision),data=row&&JSON.parse(row.content_json),block=data?.blocks.find(block=>block.id===location.block);
  if(!block||row.revision!==expected)throw new StudyError(409,'Save or reload Speakout before uploading.');
  const metadata=await lessonMediaMetadata(bytes,mime,name);
  if(!(block.type==='file'||block.type==='pdf'&&mime==='application/pdf'||block.type==='image'&&mime.startsWith('image/')||['audio','pronunciation'].includes(block.type)&&mime.startsWith('audio/')))throw new StudyError(415,'File does not match this block.');
  const key='stage-local/speakout/'+await hash(JSON.stringify(args))+'/'+block.id+'/'+metadata.sha256;await store.putImmutable(key,bytes,metadata);Object.assign(block,{localMediaKey:key,name:metadata.name,fileType:mime,hasFile:true});
  const tx=new StudyService(db);return tx.mutate(actor,{...location,mime,name,sha256:metadata.sha256},['speakout-file',...args,block.id],async()=>({statements:[s('UPDATE speakout_documents SET content_json=?,revision=revision+1 WHERE level=? AND unit_index=? AND lesson_index=? AND revision=?',[JSON.stringify(data),...args,expected]),tx.guard()],result:{revision:expected+1,block,cacheRevision:(expected+1)+':'+await hash('{}')}}));
}
export async function speakoutMedia(db,actor,location,store,request){
  const {row}=await document(db,location,store);if(!row||!row.published&&!staff(actor))throw new StudyError(404,'File unavailable.');
  const block=JSON.parse(row.content_json).blocks.find(block=>block.id===location.block);if(!block?.localMediaKey?.startsWith('stage-local/speakout/'))throw new StudyError(404,'File unavailable.');return store.response(block.localMediaKey,request.method,request.headers.get('range')||'');
}
export async function answerSpeakout(db,actor,body,store){
  const {row,args}=await document(db,body,store);if(!row?.published||row.revision!==body.expectedRevision||!body.answers||typeof body.answers!=='object'||Array.isArray(body.answers)||JSON.stringify(body.answers).length>32000)throw new StudyError(409,'Speakout changed. Reopen the lesson.');
  const ids=new Set(JSON.parse(row.content_json).blocks.filter(block=>!block.contentGroup&&(['task','quiz','exercise'].includes(block.type)||block.type==='text'&&block.answerEnabled===true)).map(block=>block.id));if(Object.keys(body.answers).some(id=>id!=='_formatting'&&!ids.has(id)))throw new StudyError(400,'Invalid task.');
  for(const [id,items] of Object.entries(body.answers._formatting||{})){if(!ids.has(id))throw new StudyError(400,'Invalid task.');const block=JSON.parse(row.content_json).blocks.find(block=>block.id===id);for(const [index,format] of Object.entries(items))validateColorDocument(format,typeof body.answers[id]==='string'?body.answers[id]:body.answers[id]?.[index],block.answerEnabled===true);}
  await db.atomic([s('INSERT INTO speakout_answers(account_id,level,unit_index,lesson_index,definition_revision,answers_json) VALUES(?,?,?,?,?,?) ON CONFLICT(account_id,level,unit_index,lesson_index) DO UPDATE SET definition_revision=excluded.definition_revision,answers_json=excluded.answers_json',[actor.id,...args,row.revision,JSON.stringify(body.answers)])]);return {saved:true,cacheRevision:row.revision+':'+await hash(JSON.stringify(body.answers))};
}
