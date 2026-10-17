import {statement as stmt, StudyError, recordId} from './learning-study.mjs';
import {materialVisibility} from './learning-visibility.mjs';
import {ArchiveService} from './learning-archive.mjs';
import {normalizedGroupTitle,prefixedExamTitle,groupLevel} from './group-levels.mjs';

const reviewer=actor=>['ADMIN','DEVELOPER'].includes(actor?.role);
function optionalId(value){if(value==null||value==='')return null;return recordId(value);}
const fail=(status,message)=>{throw new StudyError(status,message);};
const schema=[
  `CREATE TABLE IF NOT EXISTS class_groups (
    id INTEGER PRIMARY KEY CHECK (id > 0),
    title TEXT NOT NULL,
    lesson_date TEXT NOT NULL DEFAULT '',
    hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1)),
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    deleted_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS class_group_lessons (
    group_id INTEGER NOT NULL REFERENCES class_groups(id),
    lesson_id INTEGER NOT NULL UNIQUE REFERENCES lessons(id),
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (group_id, lesson_id)
  )`,
  `CREATE TABLE IF NOT EXISTS class_group_students (account_id TEXT PRIMARY KEY,group_id INTEGER NOT NULL REFERENCES class_groups(id),assigned_by TEXT NOT NULL,updated_at INTEGER NOT NULL DEFAULT (unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS class_group_exams (group_id INTEGER NOT NULL REFERENCES class_groups(id),exam_id INTEGER NOT NULL UNIQUE REFERENCES exams(id),PRIMARY KEY(group_id,exam_id))`,
  `CREATE TABLE IF NOT EXISTS class_group_setup (key TEXT PRIMARY KEY)`
];
const ready=new WeakMap();

function signedIn(actor){
  if(!actor?.id||!['USER','ADMIN','DEVELOPER'].includes(actor.role))fail(401,'Sign in first.');
}

export class GroupService{
  constructor(db){this.db=db;}
  ensure(){
    // Request wrappers are rebuilt per call; the schema check belongs to the binding.
    const key=this.db?.binding||this.db;
    if(!ready.has(key))ready.set(key,(async()=>{
      await this.db.atomic(schema.map(sql=>stmt(sql)));
      const columns=await this.db.read('PRAGMA table_info(class_groups)');
      const names=new Set(columns.map(column=>column.name));
      const changes=[];
      if(!names.has('lesson_date'))changes.push(stmt("ALTER TABLE class_groups ADD COLUMN lesson_date TEXT NOT NULL DEFAULT ''"));
      if(!names.has('hidden_from_students'))changes.push(stmt('ALTER TABLE class_groups ADD COLUMN hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1))'));
      if(changes.length)await this.db.atomic(changes);
    })().catch(error=>{ready.delete(key);throw error;}));
    return ready.get(key);
  }
  seed(){
    this.seeding||=this.seedOnce().catch(error=>{this.seeding=null;throw error;});
    return this.seeding;
  }
  async seedOnce(){
    await this.ensure();
    const [state]=await this.db.read(`SELECT
      (SELECT COUNT(*) FROM class_group_setup WHERE key IN ('levels-v1','level-names-v2')) AS setup,
      EXISTS(SELECT 1 FROM class_groups WHERE deleted_at IS NULL) AS has_groups,
      EXISTS(SELECT 1 FROM class_groups WHERE deleted_at IS NULL AND lesson_date='') AS blank_dates,
      EXISTS(SELECT 1 FROM lessons l WHERE l.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM class_group_lessons x WHERE x.lesson_id=l.id)) AS loose_lessons`);
    if(Number(state?.setup)===2&&Number(state.has_groups)&&!Number(state.blank_dates)&&!Number(state.loose_lessons))return;
    await this.db.atomic([
      ...['A1','A2','A2+','B1','B1+','B2','B2+','C1','C2'].map((title,position)=>stmt(`INSERT INTO class_groups(title,lesson_date,position) SELECT ?,date('now'),? WHERE NOT EXISTS(SELECT 1 FROM class_group_setup WHERE key='levels-v1') AND NOT EXISTS(SELECT 1 FROM class_groups WHERE title=? AND deleted_at IS NULL)`,[title,position,title])),
      stmt("INSERT OR IGNORE INTO class_group_setup(key) VALUES('levels-v1')"),
      stmt(`INSERT INTO class_groups(title,lesson_date,position)
        SELECT 'Group 1',date('now'),0
        WHERE NOT EXISTS(SELECT 1 FROM class_groups WHERE deleted_at IS NULL)`),
      stmt("UPDATE class_groups SET lesson_date=date('now') WHERE deleted_at IS NULL AND lesson_date=''"),
      stmt(`INSERT INTO class_group_lessons(group_id,lesson_id,position)
        SELECT (SELECT id FROM class_groups WHERE deleted_at IS NULL ORDER BY position,created_at,id LIMIT 1),l.id,
          ROW_NUMBER() OVER (ORDER BY l.lesson_date,l.id)-1
        FROM lessons l WHERE l.deleted_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM class_group_lessons x WHERE x.lesson_id=l.id)
        ON CONFLICT(lesson_id) DO NOTHING`)
    ]);
    if (!(await this.db.read("SELECT key FROM class_group_setup WHERE key='level-names-v2'")).length) {
      const groups = await this.db.read('SELECT id,title,revision FROM class_groups WHERE deleted_at IS NULL');
      await this.groupTransaction([
        ...groups.filter(group => normalizedGroupTitle(group.title) !== group.title).flatMap(group => [
          stmt('UPDATE class_groups SET title=?,revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=?',[normalizedGroupTitle(group.title),group.id,group.revision]),
          stmt('INSERT INTO group_guard SELECT changes()=1')
        ]),
        stmt("INSERT OR IGNORE INTO class_group_setup(key) VALUES('level-names-v2')")
      ]);
    }
  }
  async list(actor){
    signedIn(actor);
    await this.seed();
    const teacher=reviewer(actor);
    const groups=await this.db.read(`SELECT id,title,lesson_date,hidden_from_students,position,revision FROM class_groups
      WHERE deleted_at IS NULL AND (?=1 OR (hidden_from_students=0 AND EXISTS(SELECT 1 FROM class_group_students gs WHERE gs.group_id=class_groups.id AND gs.account_id=?))) ORDER BY lesson_date DESC,position,created_at,id`,[teacher&&!actor.managedStudent?1:0,actor.id]);
    const links=await this.db.read(`SELECT x.group_id,x.lesson_id,x.position FROM class_group_lessons x
      JOIN lessons l ON l.id=x.lesson_id
      WHERE l.deleted_at IS NULL AND (?=1 OR (l.published=1
        AND NOT EXISTS(SELECT 1 FROM lesson_access a WHERE a.lesson_id=l.id AND a.account_id=? AND a.personal_hidden=1)
        AND (l.hidden_from_students=0 OR EXISTS(SELECT 1 FROM lesson_access a WHERE a.lesson_id=l.id AND a.account_id=? AND a.allow_hidden=1))))
      ORDER BY x.position,x.lesson_id`,[teacher?1:0,actor.id,actor.id]);
    const hidden=await materialVisibility(this.db,actor.id);
    const studentCounts=await this.db.read('SELECT group_id,COUNT(*) AS total FROM class_group_students GROUP BY group_id');
    const exams=await this.db.read('SELECT group_id,exam_id FROM class_group_exams');
    if((!teacher||actor.managedStudent)&&(await this.db.read("SELECT name FROM sqlite_master WHERE type='table' AND name='exam_instances'")).length){
      const copies=await this.db.read("SELECT exam_id,source_exam_id,status FROM exam_instances WHERE account_id=? AND active=1",[actor.id]);
      for(let index=exams.length-1;index>=0;index--){const link=exams[index],own=copies.filter(copy=>copy.source_exam_id===link.exam_id);if(own.length)exams.splice(index,1,...own.filter(copy=>copy.status!=='completed').map(copy=>({...link,exam_id:copy.exam_id})));}
    }
    return groups.filter(group=>teacher||!hidden.has('group:'+group.id)).map(group=>({id:group.id,title:group.title,date:group.lesson_date||'',hidden:!!group.hidden_from_students,personalHidden:hidden.has('group:'+group.id),revision:group.revision,studentCount:Number(studentCounts.find(row=>row.group_id===group.id)?.total||0),
      lessonIds:links.filter(link=>link.group_id===group.id).map(link=>link.lesson_id),examIds:exams.filter(link=>link.group_id===group.id).map(link=>link.exam_id)}));
  }
  async members(actor){
    signedIn(actor);if(!reviewer(actor))fail(403,'Teachers only.');await this.seed();
    return this.db.read('SELECT account_id AS accountId,group_id AS groupId FROM class_group_students');
  }
  async activeGroup(id){
    recordId(id);await this.seed();const [group]=await this.db.read('SELECT * FROM class_groups WHERE id=? AND deleted_at IS NULL',[id]);
    if(!group)fail(404,'Group not found.');return group;
  }
  async assignStudent(actor,accountId,groupId){
    signedIn(actor);if(!reviewer(actor))fail(403,'Teachers only.');
    if(typeof accountId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(accountId))fail(400,'Invalid student.');
    if(groupId!=null)await this.activeGroup(groupId);else await this.ensure();
    await this.groupTransaction(groupId==null?[stmt('DELETE FROM class_group_students WHERE account_id=?',[accountId])]:[
      stmt("INSERT INTO group_guard SELECT EXISTS(SELECT 1 FROM class_groups WHERE id=? AND deleted_at IS NULL)",[groupId]),
      stmt('INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET group_id=excluded.group_id,assigned_by=excluded.assigned_by,updated_at=unixepoch()',[accountId,groupId,actor.id]),
      stmt('UPDATE class_groups SET revision=revision+1 WHERE id=?',[groupId])]);return {saved:true};
  }
  async groupTransaction(commands){
    return this.db.atomic([stmt('DROP TABLE IF EXISTS temp.group_guard'),stmt('CREATE TEMP TABLE group_guard(ok INTEGER NOT NULL CHECK(ok=1))'),...commands,stmt('DROP TABLE temp.group_guard')]);
  }
  async examNameCommands(groupId,title) {
    const tables=new Set((await this.db.read("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('exams','exam_instances')")).map(row=>row.name));
    if(!tables.has('exams'))return [];
    const exams=await this.db.read(`SELECT id,title FROM exams WHERE deleted_at IS NULL AND (id IN (SELECT exam_id FROM class_group_exams WHERE group_id=?)${tables.has('exam_instances')?' OR id IN (SELECT exam_id FROM exam_instances WHERE group_id=?)':''})`,tables.has('exam_instances')?[groupId,groupId]:[groupId]);
    const commands=exams.filter(exam=>prefixedExamTitle(exam.title,title)!==exam.title).map(exam=>stmt('UPDATE exams SET title=?,revision=revision+1 WHERE id=?',[prefixedExamTitle(exam.title,title),exam.id]));
    if(tables.has('exam_instances')&&(await this.db.read('SELECT exam_id FROM exam_instances WHERE group_id=? AND group_title<>? LIMIT 1',[groupId,title])).length)commands.push(stmt('UPDATE exam_instances SET group_title=? WHERE group_id=?',[title,groupId]));
    return commands;
  }
  async manage(actor,body){
    signedIn(actor);if(!reviewer(actor))fail(403,'Teachers only.');await this.seed();
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['action','id','expectedRevision','title','examId','date'].includes(key)))fail(400,'Invalid group request.');
    if(body.action==='create'){
      if(typeof body.title!=='string'||!body.title.trim()||body.title.length>120)fail(400,'Enter a group name.');
      const date=body.date??new Date().toISOString().slice(0,10);
      if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))fail(400,'Enter a valid group date.');
      await this.db.atomic([stmt("INSERT INTO class_groups(title,lesson_date,position) VALUES(?,?,(SELECT COALESCE(MAX(position)+1,0) FROM class_groups))",[normalizedGroupTitle(body.title),date])]);
    }else{
      const group=await this.activeGroup(body.id);
      if(body.expectedRevision!==group.revision)fail(409,'The group changed. Reload Accounts.');
      if(body.action==='rename'){
        if(typeof body.title!=='string'||!body.title.trim()||body.title.length>120)fail(400,'Enter a group name.');
        if(groupLevel(group.title)&&!groupLevel(body.title))fail(400,'Start the group name with a standard level and a space.');
        const title=normalizedGroupTitle(body.title);
        await this.groupTransaction([stmt('UPDATE class_groups SET title=?,revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=? AND deleted_at IS NULL',[title,body.id,body.expectedRevision]),stmt('INSERT INTO group_guard SELECT changes()=1'),...await this.examNameCommands(body.id,title)]);
      }else if(body.action==='archive'){
        const [count]=await this.db.read('SELECT (SELECT COUNT(*) FROM class_group_students WHERE group_id=?)+(SELECT COUNT(*) FROM class_group_lessons WHERE group_id=?)+(SELECT COUNT(*) FROM class_group_exams WHERE group_id=?) n',[body.id,body.id,body.id]);
        if(count.n)fail(409,'Reassign students, lessons and exams before archiving this group.');
        await new ArchiveService(this.db).archive(actor,{type:'group',id:body.id});
      }else if(body.action==='unassign-exam'){
        recordId(body.examId);
        await this.groupTransaction([stmt('INSERT INTO group_guard SELECT EXISTS(SELECT 1 FROM class_groups WHERE id=? AND revision=? AND deleted_at IS NULL)',[body.id,body.expectedRevision]),stmt('DELETE FROM class_group_exams WHERE group_id=? AND exam_id=?',[body.id,body.examId]),stmt('INSERT INTO group_guard SELECT changes()=1'),stmt('UPDATE class_groups SET revision=revision+1 WHERE id=?',[body.id])]);
      }else if(body.action==='exam'){
        recordId(body.examId);const [exam]=await this.db.read('SELECT id FROM exams WHERE id=? AND deleted_at IS NULL',[body.examId]);if(!exam)fail(404,'Exam not found.');
        await this.groupTransaction([stmt('INSERT INTO group_guard SELECT EXISTS(SELECT 1 FROM class_groups WHERE id=? AND revision=? AND deleted_at IS NULL)',[body.id,body.expectedRevision]),stmt('INSERT INTO group_guard SELECT EXISTS(SELECT 1 FROM exams WHERE id=? AND deleted_at IS NULL)',[body.examId]),stmt('INSERT INTO class_group_exams(group_id,exam_id) VALUES(?,?) ON CONFLICT(exam_id) DO UPDATE SET group_id=excluded.group_id',[body.id,body.examId]),stmt('UPDATE class_groups SET revision=revision+1 WHERE id=?',[body.id])]);
      }else fail(400,'Invalid group action.');
    }
    return {groups:await this.list(actor)};
  }
  async save(actor,body){
    signedIn(actor);
    if(!reviewer(actor))fail(403,'Only a teacher can save groups.');
    await this.seed();
    const groups=body?.groups;
    if(!Array.isArray(groups)||!groups.length||groups.length>100)fail(400,'Invalid groups.');
    const groupIds=new Set(),lessonIds=new Set();
    for(const group of groups){
      const groupId=optionalId(group?.id);
      if(!group||typeof group.title!=='string'||!group.title.trim()||group.title.length>120
        ||typeof group.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(group.date)||typeof group.hidden!=='boolean'
        ||!Array.isArray(group.lessonIds)||group.lessonIds.length>1000)fail(400,'Invalid group.');
      if(groupId!=null){if(groupIds.has(groupId))fail(400,'Duplicate group.');groupIds.add(groupId);}
      for(const lessonId of group.lessonIds){
        recordId(lessonId);
        if(lessonIds.has(lessonId))fail(400,'A lesson can belong to only one group.');
        lessonIds.add(lessonId);
      }
    }
    if(lessonIds.size){
      const found=await this.db.read(`SELECT id FROM lessons WHERE deleted_at IS NULL AND id IN (${[...lessonIds].map(()=>'?').join(',')})`,[...lessonIds]);
      if(found.length!==lessonIds.size)fail(409,'A lesson changed. Reload groups.');
    }
    const enrolled=await this.db.read('SELECT DISTINCT group_id FROM class_group_students UNION SELECT DISTINCT group_id FROM class_group_exams');
    if(enrolled.some(row=>!groupIds.has(row.group_id)))fail(409,'Reassign students and exams before removing their group.');
    const commands=[stmt('DROP TABLE IF EXISTS temp.saved_ids'),stmt('CREATE TEMP TABLE saved_ids(seq INTEGER PRIMARY KEY, id INTEGER NOT NULL)')];
    groups.forEach((group,position)=>{
      const groupId=optionalId(group.id);
      if(groupId==null)commands.push(
        stmt('INSERT INTO class_groups(title,lesson_date,hidden_from_students,position) VALUES(?,?,?,?)',[normalizedGroupTitle(group.title),group.date,group.hidden?1:0,position]),
        stmt('INSERT INTO saved_ids(id) VALUES(last_insert_rowid())'));
      else commands.push(
        stmt(`UPDATE class_groups SET title=?,lesson_date=?,hidden_from_students=?,position=?,deleted_at=NULL,revision=revision+1,updated_at=unixepoch() WHERE id=?`,
          [normalizedGroupTitle(group.title),group.date,group.hidden?1:0,position,groupId]),
        stmt('INSERT INTO saved_ids(id) SELECT id FROM class_groups WHERE id=? AND changes()=1',[groupId]));
    });
    commands.push(stmt(`UPDATE class_groups SET deleted_at=unixepoch(),revision=revision+1,updated_at=unixepoch()
      WHERE deleted_at IS NULL AND id NOT IN (SELECT id FROM saved_ids)`));
    commands.push(stmt('DELETE FROM class_group_lessons'));
    groups.forEach((group,index)=>group.lessonIds.forEach((lessonId,position)=>
      commands.push(stmt('INSERT INTO class_group_lessons(group_id,lesson_id,position) SELECT id,?,? FROM saved_ids WHERE seq=?',[lessonId,position,index+1]))));
    for(const group of groups)if(group.id)commands.push(...await this.examNameCommands(group.id,normalizedGroupTitle(group.title)));
    commands.push(stmt('SELECT id FROM saved_ids ORDER BY seq'));
    const results=await this.db.atomic(commands);
    const ids=(results.at(-1)?.rows||[]).map(row=>Number(row[0]?.value));
    return {saved:true,ids};
  }
}
