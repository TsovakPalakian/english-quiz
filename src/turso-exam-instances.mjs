import {statement as s,StudyError} from './turso-study.mjs';
import {legacyLessonFileKey} from './turso-media.mjs';
const id=()=>Number.parseInt(crypto.randomUUID().replaceAll('-','').slice(0,12),16)+1;
export async function instanceCommands(db,source,assignment,recipients,storage,metadata={}){
  const blocks=await db.read('SELECT * FROM exam_blocks WHERE exam_id=? AND deleted_at IS NULL ORDER BY position',[source.id]);
  const parts=await db.read('SELECT * FROM exam_materials WHERE exam_id=? AND deleted_at IS NULL ORDER BY position',[source.id]);
  const commands=[];
  for(const account of recipients){
    const [group]=await db.read('SELECT g.id,g.title FROM class_group_students c JOIN class_groups g ON g.id=c.group_id WHERE c.account_id=?',[account]);
    const student=metadata.students?.find(u=>u.id===account);
    const copy=id();commands.push(s('INSERT INTO exams(id,title,lesson_date,published,hidden_from_students) VALUES(?,?,?,?,0)',[copy,source.title,source.lesson_date,source.published]),s('INSERT INTO exam_instances(exam_id,source_exam_id,account_id,assignment_id,group_id,group_title,reviewer_id,reviewer_name,student_name,student_email,assigned_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[copy,source.id,account,assignment,group?.id||null,group?.title||'',metadata.reviewer?.id||'',metadata.reviewer?.name||'Teacher',student?.name||account,student?.email||'',Date.now()]));
    const materialIds=new Map(parts.map(part=>[part.id,id()]));
    const mediaNamespace='copy-'+crypto.randomUUID();
    const assignmentKeys=new Map(parts.map(part=>{const content=JSON.parse(part.content_json);return [content.assignmentId||('part-'+part.id),'a-'+copy+'-'+materialIds.get(part.id)];}));
    for(const block of blocks){
      const blockId=id();commands.push(s('INSERT INTO exam_blocks(id,exam_id,position,title,published,hidden_from_students) VALUES(?,?,?,?,?,0)',[blockId,copy,block.position,block.title,block.published]));
      for(const part of parts.filter(part=>part.block_id===block.id)){
        const content=JSON.parse(part.content_json);for(const key of ['id','response','score','examPoints','examCorrections','studentSaved'])delete content[key];
        if(content.localMediaKey||content.fileId){
          const store=typeof storage==='function'?storage():storage;if(!store)throw new StudyError(503,'Exam attachment storage unavailable.');
          const file=content.localMediaKey?await store.readVerified(content.localMediaKey):await store.readLegacy(await legacyLessonFileKey(db,part.id,content.fileId),content.name||'attachment');
          const key='stage-local/copies/'+mediaNamespace+'/'+crypto.randomUUID()+'/'+file.metadata.sha256;await store.putImmutable(key,file.bytes,file.metadata);
          const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');content.localMediaKey=key;content.fileId='sf_'+hash;
        }
        for(const item of content.items||[])for(const key of ['given','picked','typed','marked','correct'])delete item[key];
        content.scoringVersion=content.scoringVersion>=3?3:2;
        if(['task','quiz','exercise'].includes(part.type))content.assignmentId=assignmentKeys.get(content.assignmentId||('part-'+part.id));
        if(content.assignmentKey)content.assignmentKey=assignmentKeys.get(content.assignmentKey)||content.assignmentKey;
        if(['task','quiz','exercise'].includes(part.type)&&content.maxPoints==null){
          content.maxPoints=part.type==='task'||content.gradeMode==='assignment'?1:(content.items||[]).reduce((sum,item)=>sum+Number(String(item.maxPoints??1).replace(',','.')),0)||1;
        }
        commands.push(s('INSERT INTO exam_materials(id,exam_id,block_id,position,type,tab,content_json) VALUES(?,?,?,?,?,?,?)',[materialIds.get(part.id),copy,blockId,part.position,part.type,part.tab,JSON.stringify(content)]));
      }
    }
  }
  return commands;
}
export async function instanceAccess(db,examId,account){
  const [row]=await db.read('SELECT account_id,active FROM exam_instances WHERE exam_id=?',[examId]);
  if(row&&(row.account_id!==account||!row.active))throw new StudyError(404,'Exam not found.');
}
