import {statement as stmt,StudyError} from './turso-study.mjs';

const fail=(status,message)=>{throw new StudyError(status,message);};
const reviewer=actor=>['ADMIN','DEVELOPER'].includes(actor?.role);
const types={
  lesson:{table:'lessons',title:'title'},
  group:{table:'class_groups',title:'title'},
  exam:{table:'exams',title:'title'},
  'exam-block':{table:'exam_blocks',title:'title'},
  card:{table:'cards',title:'en'},
  song:{table:'library_items',title:"json_extract(content_json,'$.title')",kind:'song'},
  text:{table:'library_items',title:"json_extract(content_json,'$.title')",kind:'text'}
};
const schema=`CREATE TABLE IF NOT EXISTS content_archive (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  archived_by TEXT NOT NULL,
  archived_by_name TEXT NOT NULL DEFAULT '',
  archived_by_role TEXT NOT NULL DEFAULT 'ADMIN',
  archived_at INTEGER NOT NULL DEFAULT (unixepoch()),
  teacher_hidden_at INTEGER,
  teacher_hidden_by TEXT,
  PRIMARY KEY(entity_type,entity_id)
)`;
const stateSchema=`CREATE TABLE IF NOT EXISTS content_archive_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0)
)`;
const ready=new WeakMap();
function entity(type,id){
  const item=types[type],key=String(id??'');
  if(!item||!/^[A-Za-z0-9_-]{1,100}$/.test(key))fail(400,'Invalid archive material.');
  return {item,key};
}
function actorName(actor){return String(actor.login||actor.name||actor.id||'').slice(0,120);}

export class ArchiveService{
  constructor(db){this.db=db;}
  ensure(){
    if(!ready.has(this.db))ready.set(this.db,(async()=>{
      await this.db.atomic([stmt(schema),stmt(stateSchema),stmt('INSERT OR IGNORE INTO content_archive_state(id,revision) VALUES(1,1)')]);
      const columns=await this.db.read('PRAGMA table_info(content_archive)');
      if(!columns.some(column=>column.name==='archived_by_role'))await this.db.atomic([stmt("ALTER TABLE content_archive ADD COLUMN archived_by_role TEXT NOT NULL DEFAULT 'ADMIN'")]);
      // Earlier exam saves soft-deleted blocks without creating archive entries.
      await this.db.atomic([stmt(`INSERT OR IGNORE INTO content_archive(entity_type,entity_id,title,archived_by,archived_by_name,archived_by_role,archived_at)
        SELECT 'exam-block',CAST(b.id AS TEXT),b.title,'','Unknown (before archive tracking)','ADMIN',b.deleted_at
        FROM exam_blocks b JOIN exams e ON e.id=b.exam_id WHERE b.deleted_at IS NOT NULL AND e.deleted_at IS NULL`),
        stmt('UPDATE content_archive_state SET revision=revision+1 WHERE id=1 AND changes()>0')]);
    })().catch(error=>{ready.delete(this.db);throw error;}));
    return ready.get(this.db);
  }
  async revision(){await this.ensure();const rows=await this.db.read('SELECT revision FROM content_archive_state WHERE id=1');return Number(rows[0]?.revision)||1;}
  bump(){return stmt('UPDATE content_archive_state SET revision=revision+1 WHERE id=1');}
  async list(actor){
    if(!actor?.id)fail(401,'Sign in first.');
    await this.ensure();
    const rows=await this.db.read(`SELECT entity_type type,entity_id id,title,archived_by archivedBy,
      archived_by_name archivedByName,archived_by_role archivedByRole,archived_at archivedAt,teacher_hidden_at teacherHiddenAt,
      teacher_hidden_by teacherHiddenBy FROM content_archive
      WHERE (?=1 OR (teacher_hidden_at IS NULL AND (?=1 OR (archived_by=? AND archived_by_role='USER'))))
      ORDER BY entity_type,archived_at DESC`,[actor.role==='DEVELOPER'?1:0,actor.role==='ADMIN'?1:0,actor.id]);
    return {revision:await this.revision(),items:rows.map(row=>({...row,archivedAt:Number(row.archivedAt)||0,teacherHiddenAt:Number(row.teacherHiddenAt)||0}))};
  }
  async archive(actor,value){
    if(!actor?.id)fail(401,'Sign in first.');
    const {item,key}=entity(value?.type,value?.id);
    if(!reviewer(actor)&&!['card','song','text'].includes(value.type))fail(403,'Only a teacher can archive this material.');
    await this.ensure();
    const args=[key,...(item.kind?[item.kind]:[])];
    let owner='';
    if(!reviewer(actor)){
      owner=` AND scope='profile' AND owner_profile_id=(SELECT profile_id FROM profile_members WHERE account_id=?)`;
      args.push(actor.id);
    }
    const rows=await this.db.read(`SELECT ${item.title} title FROM ${item.table} WHERE CAST(id AS TEXT)=?${item.kind?' AND kind=?':''}${owner} AND deleted_at IS NULL`,args);
    if(rows.length!==1)fail(404,'Material not found.');
    const commands=[];
    if(value.type==='group')commands.push(stmt(`UPDATE class_group_lessons SET group_id=(SELECT id FROM class_groups
      WHERE deleted_at IS NULL AND CAST(id AS TEXT)<>? ORDER BY position,created_at,id LIMIT 1) WHERE group_id=CAST(? AS INTEGER)`,[key,key]));
    commands.push(stmt(`UPDATE ${item.table} SET deleted_at=unixepoch()${['lesson','group','exam','exam-block','card'].includes(value.type)?',revision=revision+1':''} WHERE CAST(id AS TEXT)=? AND deleted_at IS NULL`,[key]));
    commands.push(stmt(`INSERT INTO content_archive(entity_type,entity_id,title,archived_by,archived_by_name,archived_by_role)
      VALUES(?,?,?,?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET title=excluded.title,archived_by=excluded.archived_by,
      archived_by_name=excluded.archived_by_name,archived_by_role=excluded.archived_by_role,archived_at=unixepoch(),teacher_hidden_at=NULL,teacher_hidden_by=NULL`,
      [value.type,key,String(rows[0].title||'Untitled').slice(0,300),actor.id,actorName(actor),actor.role]));
    commands.push(this.bump());
    await this.db.atomic(commands);
    return {archived:true,type:value.type,id:key,revision:await this.revision()};
  }
  async restore(actor,value){
    if(!actor?.id)fail(401,'Sign in first.');
    const {item,key}=entity(value?.type,value?.id);await this.ensure();
    const found=await this.db.read(`SELECT entity_id FROM content_archive WHERE entity_type=? AND entity_id=?
      AND (?=1 OR (teacher_hidden_at IS NULL AND (?=1 OR (archived_by=? AND archived_by_role='USER'))))`,
      [value.type,key,actor.role==='DEVELOPER'?1:0,actor.role==='ADMIN'?1:0,actor.id]);
    if(found.length!==1)fail(404,'Archived material not found.');
    if(value.type==='exam-block'){
      const parent=await this.db.read('SELECT e.deleted_at FROM exams e JOIN exam_blocks b ON b.exam_id=e.id WHERE CAST(b.id AS TEXT)=?',[key]);
      if(parent[0]?.deleted_at!=null)fail(409,'Restore the parent exam before this examination block.');
    }
    await this.db.atomic([
      stmt(`UPDATE ${item.table} SET deleted_at=NULL${['lesson','group','exam','exam-block','card'].includes(value.type)?',revision=revision+1':''} WHERE CAST(id AS TEXT)=?`,[key]),
      stmt('DELETE FROM content_archive WHERE entity_type=? AND entity_id=?',[value.type,key]),this.bump()
    ]);
    return {restored:true,type:value.type,id:key,revision:await this.revision()};
  }
  async remove(actor,value,{passwordVerified=false}={}){
    if(!actor?.id)fail(401,'Sign in first.');
    const {item,key}=entity(value?.type,value?.id);await this.ensure();
    const found=await this.db.read(`SELECT archived_by,archived_by_role,teacher_hidden_at FROM content_archive
      WHERE entity_type=? AND entity_id=?`,[value.type,key]);
    if(found.length!==1)fail(404,'Archived material not found.');
    if(actor.role==='USER'){
      if(found[0].archived_by!==actor.id||found[0].archived_by_role!=='USER'||found[0].teacher_hidden_at)fail(404,'Archived material not found.');
      await this.db.atomic([stmt(`UPDATE content_archive SET teacher_hidden_at=unixepoch(),teacher_hidden_by=?
        WHERE entity_type=? AND entity_id=? AND teacher_hidden_at IS NULL`,[actor.id,value.type,key]),this.bump()]);
      return {hidden:true,type:value.type,id:key,revision:await this.revision()};
    }
    if(!reviewer(actor))fail(403,'You cannot remove this archived material.');
    if(actor.role!=='DEVELOPER'){
      if(!passwordVerified)fail(401,'Wrong password.');
      await this.db.atomic([stmt(`UPDATE content_archive SET teacher_hidden_at=unixepoch(),teacher_hidden_by=?
        WHERE entity_type=? AND entity_id=? AND teacher_hidden_at IS NULL`,[actor.id,value.type,key]),this.bump()]);
      return {hidden:true,type:value.type,id:key,revision:await this.revision()};
    }
    const commands=[];
    if(value.type==='lesson')commands.push(stmt('DELETE FROM lesson_responses WHERE CAST(lesson_id AS TEXT)=?',[key]),stmt('DELETE FROM lesson_access WHERE CAST(lesson_id AS TEXT)=?',[key]),stmt('DELETE FROM class_group_lessons WHERE CAST(lesson_id AS TEXT)=?',[key]),stmt('DELETE FROM lesson_blocks WHERE CAST(lesson_id AS TEXT)=?',[key]));
    if(value.type==='group')commands.push(stmt('DELETE FROM class_group_lessons WHERE CAST(group_id AS TEXT)=?',[key]));
    if(value.type==='exam')commands.push(stmt("DELETE FROM content_archive WHERE entity_type='exam-block' AND entity_id IN (SELECT CAST(id AS TEXT) FROM exam_blocks WHERE CAST(exam_id AS TEXT)=?)",[key]),stmt('DELETE FROM exam_work WHERE CAST(exam_id AS TEXT)=?',[key]),stmt('DELETE FROM exam_materials WHERE CAST(exam_id AS TEXT)=?',[key]),stmt('DELETE FROM exam_blocks WHERE CAST(exam_id AS TEXT)=?',[key]));
    if(value.type==='exam-block')commands.push(stmt('DELETE FROM exam_work WHERE CAST(block_id AS TEXT)=?',[key]),stmt('DELETE FROM exam_materials WHERE CAST(block_id AS TEXT)=?',[key]));
    if(value.type==='card')commands.push(stmt('DELETE FROM quiz_progress WHERE CAST(card_id AS TEXT)=?',[key]),stmt('DELETE FROM card_progress WHERE CAST(card_id AS TEXT)=?',[key]),stmt('DELETE FROM profile_cards WHERE CAST(card_id AS TEXT)=?',[key]),stmt('DELETE FROM card_quiz_collections WHERE CAST(card_id AS TEXT)=?',[key]),stmt('UPDATE lesson_blocks SET card_id=NULL WHERE CAST(card_id AS TEXT)=?',[key]));
    if(item.kind)commands.push(stmt('DELETE FROM profile_library_items WHERE CAST(item_id AS TEXT)=?',[key]));
    commands.push(stmt(`DELETE FROM ${item.table} WHERE CAST(id AS TEXT)=? AND deleted_at IS NOT NULL`,[key]),stmt('DELETE FROM content_archive WHERE entity_type=? AND entity_id=?',[value.type,key]),this.bump());
    await this.db.atomic(commands);
    return {removed:true,type:value.type,id:key,revision:await this.revision()};
  }
}
