import {StudyService,StudyError,statement as s,recordId} from './learning-study.mjs';
import {ExamService} from './learning-exams.mjs';
import {GroupService} from './learning-groups.mjs';
import {lessonMediaMetadata} from './learning-lesson-media.mjs';
import {legacyLessonFileKey} from './learning-media.mjs';

const fail=(status,message)=>{throw new StudyError(status,message);};
const own=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const personalFields=new Set(['response','score','given','picked','typed','marked','correct','studentSaved','examAnswers','examCorrections','examPoints','examReviewText','marks']);
export function copyDefinition(value){
  if(Array.isArray(value))return value.map(copyDefinition);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
    .filter(([key])=>!personalFields.has(key)&&!key.startsWith('stage')&&!['id','cardId','quizKey','revision','examId','blockId','lessonId','examOwned','fileId','localMediaKey','copyMediaKey'].includes(key))
    .map(([key,item])=>[key,copyDefinition(item)]));
  return value;
}

// Only trusted saved definitions are copied. One transaction publishes the new
// IDs and destination membership; immutable files are prepared before that commit.
export class ContentCopyService extends StudyService {
  constructor(db,{store=null,readLegacy=null}={}){super(db);this.store=store;this.readLegacy=readLegacy;}
  async copy(actor,body){
    if(!actor?.id||!['ADMIN','DEVELOPER'].includes(actor.role))fail(403,'Copy is available only in a teaching account.');
    if(!own(body,['mutationId','source','destination','title'])||!own(body.source,['type','id','parent','parentId'])||!own(body.destination,['type','id','tab']))fail(400,'Invalid copy request.');
    const source=body.source,target=body.destination;
    if(!['lesson','exam','exam-block','material'].includes(source.type)||!['group','exam','lesson','exam-block'].includes(target.type))fail(400,'Invalid copy location.');
    recordId(source.id);
    if(target.id!=null)recordId(target.id);
    if(source.type==='material'){
      if(!['lesson','exam-block'].includes(source.parent))fail(400,'Select the saved material container.');
      recordId(source.parentId);
      if(!['lesson','exam-block'].includes(target.type)||target.id==null)fail(400,'Select a destination block or lesson.');
    }else if(!['group','exam'].includes(target.type)||target.type==='group'&&target.id==null||source.type!=='exam'&&target.type==='exam'&&target.id==null)fail(400,'Select a destination group or exam.');
    if(typeof body.title!=='string'||!body.title.trim()||body.title.length>120)fail(400,'Enter a copy name (up to 120 characters).');
    if(target.tab!==undefined&&!['overview','words','phrases','rules','classwork','homework','pdf'].includes(target.tab))fail(400,'Invalid destination page.');
    await new ExamService(this.db).ensure();await new GroupService(this.db).ensure();
    return this.mutate(actor,body,['copy-content'],async()=>{
      const commands=[s('DROP TABLE IF EXISTS temp.copy_ids'),s('CREATE TEMP TABLE copy_ids(kind TEXT, seq INTEGER, id INTEGER NOT NULL, PRIMARY KEY(kind,seq))')];
      const guards=[];
      const read=async(table,id)=>{
        const [row]=await this.db.read(`SELECT * FROM ${table} WHERE id=? AND deleted_at IS NULL`,[id]);
        if(!row)fail(404,'The saved source or destination is no longer available.');
        guards.push(s(`INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM ${table} WHERE id=? AND revision=? AND deleted_at IS NULL)`,[id,row.revision]));
        return row;
      };
      let lesson,exam,containers=[];
      if(source.type==='lesson'||source.type==='material'&&source.parent==='lesson'){
        lesson=await read('lessons',source.type==='lesson'?source.id:source.parentId);
        const parts=await this.db.read('SELECT * FROM lesson_blocks WHERE lesson_id=? AND deleted_at IS NULL ORDER BY position,id',[lesson.id]);
        containers=[{title:lesson.title,published:lesson.published,hidden:lesson.hidden_from_students,parts}];
      }else{
        if(source.type==='exam'){
          exam=await read('exams',source.id);
          const blocks=await this.db.read('SELECT * FROM exam_blocks WHERE exam_id=? AND deleted_at IS NULL ORDER BY position,id',[exam.id]);
          for(const block of blocks){await read('exam_blocks',block.id);containers.push({...block,hidden:block.hidden_from_students,parts:await this.db.read('SELECT * FROM exam_materials WHERE block_id=? AND deleted_at IS NULL ORDER BY position,id',[block.id])});}
        }else{
          const block=await read('exam_blocks',source.type==='exam-block'?source.id:source.parentId);
          exam=await read('exams',block.exam_id);
          containers=[{...block,hidden:block.hidden_from_students,parts:await this.db.read('SELECT * FROM exam_materials WHERE block_id=? AND deleted_at IS NULL ORDER BY position,id',[block.id])}];
        }
      }
      if(source.type==='material'){
        const parts=containers[0].parts.filter(part=>part.id===source.id);
        if(parts.length!==1)fail(404,'Save this material before copying.');
        containers[0].parts=parts;
      }
      if(containers.length>100||containers.some(container=>container.parts.length>200))fail(413,'Too much material for one copy.');
      let destination;
      if(target.id!=null)destination=await read({group:'class_groups',exam:'exams',lesson:'lessons','exam-block':'exam_blocks'}[target.type],target.id);
      if(target.type==='exam-block')await read('exams',destination.exam_id);
      const destinationExam=target.type==='exam'?destination?.id:target.type==='exam-block'?destination.exam_id:null;
      if(destinationExam&&(await this.db.read('SELECT exam_id FROM exam_instances WHERE exam_id=?',[destinationExam])).length)fail(403,'Assigned exam materials are a frozen student copy.');
      const newLesson=target.type==='group',newExam=target.type==='exam'&&target.id==null;
      const lessonTarget=newLesson||target.type==='lesson';
      let next=0;
      if(!newLesson&&!newExam){
        const table={exam:'exam_blocks',lesson:'lesson_blocks','exam-block':'exam_materials'}[target.type];
        const column={exam:'exam_id',lesson:'lesson_id','exam-block':'block_id'}[target.type];
        const [count]=await this.db.read(`SELECT COUNT(*) n,COALESCE(MAX(position)+1,0) position FROM ${table} WHERE ${column}=? AND deleted_at IS NULL`,[target.id]);
        next=count.position;
        if(count.n+(source.type==='material'?1:containers.length)>(target.type==='exam'?100:200))fail(400,'The destination is full.');
      }
      const mediaNamespace='copy-'+crypto.randomUUID();
      let materialSeq=0,cardSeq=0,unattachedFiles=0;
      const cards=new Map();
      const prepare=async(part)=>{
        const raw=JSON.parse(part.content_json),content=copyDefinition(raw);
        if(content.assignmentId)content.assignmentId=mediaNamespace+'-'+content.assignmentId;
        if(content.assignmentKey)content.assignmentKey=mediaNamespace+'-'+content.assignmentKey;
        if(source.type==='material')delete content.assignmentKey;
        let card=null,cardKey=part.card_id||null,linkedQuizzes=[];
        if(cardKey){
          const [row]=await this.db.read('SELECT * FROM cards WHERE id=? AND deleted_at IS NULL',[cardKey]);
          if(!row)fail(409,'A linked word is unavailable. Reload before copying.');
          guards.push(s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM cards WHERE id=? AND revision=? AND deleted_at IS NULL)',[row.id,row.revision]));
          card=row;
          if(!lessonTarget)Object.assign(content,copyDefinition(JSON.parse(row.extra_json)),{word:row.en,ru:row.ru,pos:row.part_of_speech});
        }
        if(card&&!lessonTarget){
          const quizzes=await this.db.read(`SELECT q.*,c.revision collection_revision FROM quizzes q JOIN quiz_collections c ON c.id=q.collection_id JOIN card_quiz_collections x ON x.collection_id=q.collection_id WHERE x.card_id=? AND q.deleted_at IS NULL ORDER BY q.position,q.id`,[card.id]);
          for(const quiz of quizzes){
            guards.push(s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM quiz_collections WHERE id=? AND revision=?)',[quiz.collection_id,quiz.collection_revision]),s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM quizzes WHERE id=? AND revision=? AND deleted_at IS NULL)',[quiz.id,quiz.revision]));
            linkedQuizzes.push({type:'quiz',content:{title:card.en+' - '+quiz.type,quizType:quiz.type,items:copyDefinition(JSON.parse(quiz.items_json))}});
          }
        }
        if(lessonTarget&&['word','wordcard'].includes(part.type)){
          cardKey=cardKey||'part-'+part.id;
          if(!cards.has(cardKey)){
            const seq=cardSeq++,extra=card?copyDefinition(JSON.parse(card.extra_json)):content;
            commands.push(s("INSERT INTO cards(scope,en,word_key,ru,part_of_speech,extra_json) VALUES('shared',?,?,?,?,?)",[card?.en||content.word||content.en||'',card?.word_key||String(content.word||content.en||'').toLowerCase(),card?.ru||content.ru||'',card?.part_of_speech||content.pos||'',JSON.stringify(extra)]),s("INSERT INTO copy_ids VALUES('card',?,last_insert_rowid())",[seq]),this.guard());
            cards.set(cardKey,seq);
            commands.push(s("UPDATE cards SET extra_json=json_set(extra_json,'$.quizKey','copy-card:'||id) WHERE id=(SELECT id FROM copy_ids WHERE kind='card' AND seq=?)",[seq]),this.guard());
            if(card){
              const collections=await this.db.read('SELECT q.id,q.revision FROM quiz_collections q JOIN card_quiz_collections x ON x.collection_id=q.id WHERE x.card_id=?',[card.id]);
              for(const collection of collections)guards.push(s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM quiz_collections WHERE id=? AND revision=?)',[collection.id,collection.revision]));
              const quizzes=await this.db.read(`SELECT q.* FROM quizzes q JOIN card_quiz_collections x ON x.collection_id=q.collection_id WHERE x.card_id=? AND q.deleted_at IS NULL ORDER BY q.position,q.id`,[card.id]);
              if(quizzes.length){
                commands.push(s("INSERT INTO quiz_collections(legacy_word_key) SELECT 'copy-card:'||id FROM copy_ids WHERE kind='card' AND seq=?",[seq]),s("INSERT INTO copy_ids VALUES('collection',?,last_insert_rowid())",[seq]),this.guard(),s("INSERT INTO card_quiz_collections SELECT c.id,q.id FROM copy_ids c JOIN copy_ids q ON q.kind='collection' AND q.seq=? WHERE c.kind='card' AND c.seq=?",[seq,seq]),this.guard());
                for(const [position,quiz] of quizzes.entries()){
                  guards.push(s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM quizzes WHERE id=? AND revision=? AND deleted_at IS NULL)',[quiz.id,quiz.revision]));
                  commands.push(s("INSERT INTO quizzes(collection_id,position,type,items_json) SELECT id,?,?,? FROM copy_ids WHERE kind='collection' AND seq=?",[position,quiz.type,JSON.stringify(copyDefinition(JSON.parse(quiz.items_json))),seq]),this.guard());
                }
              }
            }
          }
          cardKey=cards.get(cardKey);
        }else cardKey=null;
        if(source.type==='material'&&Object.hasOwn(content,'title'))content.title=body.title.trim();
        const attachment=['image','audio','pronunciation','pdf','file'].includes(part.type)&&raw.hasFile!==false&&!raw.sample&&!raw.remoteUrl&&(raw.hasFile||raw.name);
        if(raw.localMediaKey||attachment||raw.fileId){
          if(!this.store)fail(503,'File-copy storage is unavailable. Nothing was copied.');
          let bytes,metadata;
          if(raw.localMediaKey){({bytes,metadata}=await this.store.readVerified(raw.localMediaKey));}
          else{
            if(!this.readLegacy)fail(503,'The original attachment is unavailable. Nothing was copied.');
            const key=lesson?await legacyLessonFileKey(this.db,part.id,raw.fileId):'lessons/files/'+(raw.fileId||part.id);
            let media;
            try{media=await this.readLegacy(key);}catch(error){
              if(!(error instanceof StudyError)||error.status!==404||raw.hasFile||raw.fileId)throw error;
              content.hasFile=false;content.size='';unattachedFiles++;
            }
            if(media){bytes=media.bytes;metadata=await lessonMediaMetadata(bytes,media.mime.split(';')[0].trim(),raw.name||'attachment');}
          }
          if(bytes){
            const key=`stage-local/copies/${mediaNamespace}/${crypto.randomUUID()}/${metadata.sha256}`;
            await this.store.putImmutable(key,bytes,metadata);
            Object.assign(content,{fileId:'sf_'+await digest(key),localMediaKey:key,hasFile:true,sample:false,name:metadata.name||raw.name,fileType:metadata.mime,size:`${bytes.length} B`});
          }
        }
        return {content,cardSeq:cardKey,type:part.type,tab:target.tab||part.tab||'overview',linkedQuizzes};
      };
      if(newExam)commands.push(s('INSERT INTO exams(title,lesson_date,published,hidden_from_students) VALUES(?,?,?,?)',[body.title.trim(),exam?.lesson_date||lesson?.lesson_date||'',exam?.published||0,exam?.hidden_from_students||0]),s("INSERT INTO copy_ids VALUES('exam',0,last_insert_rowid())"),this.guard());
      else if(target.type==='exam')commands.push(s("INSERT INTO copy_ids VALUES('exam',0,?)",[target.id]),s('UPDATE exams SET revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=?',[target.id,destination.revision]),this.guard());
      for(const [seq,container] of containers.entries()){
        if(newLesson){
          const published=lesson?container.published:+!!(exam.published&&container.published),hidden=lesson?container.hidden:+!!(exam.hidden_from_students||container.hidden);
          commands.push(s('INSERT INTO lessons(title,description,class_name,unit,lesson,lesson_date,mode,published,hidden_from_students,extra_json) VALUES(?,?,?,?,?,?,?,?,?,?)',[containers.length===1?body.title.trim():`${body.title.trim()} - ${container.title}`.slice(0,120),lesson?.description||'',lesson?.class_name||'',lesson?.unit||'',lesson?.lesson||'',lesson?.lesson_date||exam?.lesson_date||'',published?'preview':'edit',published||0,hidden||0,JSON.stringify(copyDefinition(JSON.parse(lesson?.extra_json||'{}')))]),s("INSERT INTO copy_ids VALUES('lesson',?,last_insert_rowid())",[seq]),this.guard(),s("INSERT INTO class_group_lessons(group_id,lesson_id,position) SELECT ?,id,(SELECT COALESCE(MAX(position)+1,0) FROM class_group_lessons WHERE group_id=?) FROM copy_ids WHERE kind='lesson' AND seq=?",[target.id,target.id,seq]),this.guard());
        }else if(target.type==='lesson')commands.push(s("INSERT INTO copy_ids VALUES('lesson',?,?)",[seq,target.id]));
        else if(target.type==='exam')commands.push(s("INSERT INTO exam_blocks(exam_id,position,title,published,hidden_from_students) SELECT id,?,?,?,? FROM copy_ids WHERE kind='exam' AND seq=0",[next+seq,containers.length===1&&!newExam?body.title.trim():container.title,container.published||0,container.hidden||0]),s("INSERT INTO copy_ids VALUES('block',?,last_insert_rowid())",[seq]),this.guard());
        else commands.push(s("INSERT INTO copy_ids VALUES('block',?,?)",[seq,target.id]));
        let examPosition=source.type==='material'?next:0;
        for(const [position,part] of container.parts.entries()){
          const prepared=await prepare(part),json=JSON.stringify(prepared.content);
          if(json.length>256000)fail(413,'One material is too large to copy.');
          if(lessonTarget)commands.push(s(`INSERT INTO lesson_blocks(lesson_id,position,type,tab,card_id,content_json) SELECT id,?,?,?,${prepared.cardSeq==null?'NULL':"(SELECT id FROM copy_ids WHERE kind='card' AND seq="+prepared.cardSeq+')'},? FROM copy_ids WHERE kind='lesson' AND seq=?`,[next+position,prepared.type,prepared.tab,json,seq]));
          else commands.push(s(`INSERT INTO exam_materials(exam_id,block_id,position,type,tab,content_json) SELECT ${target.type==='exam' ? "(SELECT id FROM copy_ids WHERE kind='exam' AND seq=0)":destination.exam_id},id,?,?,?,? FROM copy_ids WHERE kind='block' AND seq=?`,[examPosition++,prepared.type,'overview',json,seq]));
          commands.push(s("INSERT INTO copy_ids VALUES('material',?,last_insert_rowid())",[materialSeq++]),this.guard());
          for(const quiz of prepared.linkedQuizzes){
            if(examPosition>=200)fail(413,'Too much material for one examination block.');
            commands.push(s(`INSERT INTO exam_materials(exam_id,block_id,position,type,tab,content_json) SELECT ${target.type==='exam'?"(SELECT id FROM copy_ids WHERE kind='exam' AND seq=0)":destination.exam_id},id,?,'quiz','overview',? FROM copy_ids WHERE kind='block' AND seq=?`,[examPosition++,JSON.stringify(quiz.content),seq]),s("INSERT INTO copy_ids VALUES('material',?,last_insert_rowid())",[materialSeq++]),this.guard());
          }
        }
      }
      if(target.type==='group')commands.push(s('UPDATE class_groups SET revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=?',[target.id,destination.revision]),this.guard());
      if(target.type==='lesson')commands.push(s('UPDATE lessons SET revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=?',[target.id,destination.revision]),this.guard());
      if(target.type==='exam-block')commands.push(s('UPDATE exam_blocks SET revision=revision+1 WHERE id=? AND revision=?',[target.id,destination.revision]),this.guard(),s('UPDATE exams SET revision=revision+1,updated_at=unixepoch() WHERE id=? AND deleted_at IS NULL',[destination.exam_id]),this.guard());
      commands.splice(2,0,...guards);
      return {statements:commands,resultSql:`SELECT json_object('copied',json('true'),'destination',?,'unattachedFiles',?, 'ids',json((SELECT json_group_array(json_object('type',kind,'id',id)) FROM copy_ids))) result_json`,resultArgs:[target.type,unattachedFiles]};
    });
  }
}
