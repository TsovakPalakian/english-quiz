import {statement as stmt, StudyError, recordId} from './turso-study.mjs';

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
  )`
];
let ready=null;

function signedIn(actor){
  if(!actor?.id||!['USER','ADMIN','DEVELOPER'].includes(actor.role))fail(401,'Sign in first.');
}

export class GroupService{
  constructor(db){this.db=db;}
  ensure(){
    if(!ready)ready=(async()=>{
      await this.db.atomic(schema.map(sql=>stmt(sql)));
      const columns=await this.db.read('PRAGMA table_info(class_groups)');
      const names=new Set(columns.map(column=>column.name));
      const changes=[];
      if(!names.has('lesson_date'))changes.push(stmt("ALTER TABLE class_groups ADD COLUMN lesson_date TEXT NOT NULL DEFAULT ''"));
      if(!names.has('hidden_from_students'))changes.push(stmt('ALTER TABLE class_groups ADD COLUMN hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1))'));
      if(changes.length)await this.db.atomic(changes);
    })().catch(error=>{ready=null;throw error;});
    return ready;
  }
  async seed(){
    await this.ensure();
    await this.db.atomic([
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
  }
  async list(actor){
    signedIn(actor);
    await this.seed();
    const teacher=reviewer(actor);
    const groups=await this.db.read(`SELECT id,title,lesson_date,hidden_from_students,position,revision FROM class_groups
      WHERE deleted_at IS NULL AND (?=1 OR hidden_from_students=0) ORDER BY lesson_date DESC,position,created_at,id`,[teacher?1:0]);
    const links=await this.db.read(`SELECT x.group_id,x.lesson_id,x.position FROM class_group_lessons x
      JOIN lessons l ON l.id=x.lesson_id
      WHERE l.deleted_at IS NULL AND (?=1 OR (l.published=1
        AND NOT EXISTS(SELECT 1 FROM lesson_access a WHERE a.lesson_id=l.id AND a.account_id=? AND a.personal_hidden=1)
        AND (l.hidden_from_students=0 OR EXISTS(SELECT 1 FROM lesson_access a WHERE a.lesson_id=l.id AND a.account_id=? AND a.allow_hidden=1))))
      ORDER BY x.position,x.lesson_id`,[teacher?1:0,actor.id,actor.id]);
    return groups.map(group=>({id:group.id,title:group.title,date:group.lesson_date||'',hidden:!!group.hidden_from_students,revision:group.revision,
      lessonIds:links.filter(link=>link.group_id===group.id).map(link=>link.lesson_id)}));
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
    const commands=[stmt('DROP TABLE IF EXISTS temp.saved_ids'),stmt('CREATE TEMP TABLE saved_ids(seq INTEGER PRIMARY KEY, id INTEGER NOT NULL)')];
    groups.forEach((group,position)=>{
      const groupId=optionalId(group.id);
      if(groupId==null)commands.push(
        stmt('INSERT INTO class_groups(title,lesson_date,hidden_from_students,position) VALUES(?,?,?,?)',[group.title.trim(),group.date,group.hidden?1:0,position]),
        stmt('INSERT INTO saved_ids(id) VALUES(last_insert_rowid())'));
      else commands.push(
        stmt(`UPDATE class_groups SET title=?,lesson_date=?,hidden_from_students=?,position=?,deleted_at=NULL,revision=revision+1,updated_at=unixepoch() WHERE id=?`,
          [group.title.trim(),group.date,group.hidden?1:0,position,groupId]),
        stmt('INSERT INTO saved_ids(id) SELECT id FROM class_groups WHERE id=? AND changes()=1',[groupId]));
    });
    commands.push(stmt(`UPDATE class_groups SET deleted_at=unixepoch(),revision=revision+1,updated_at=unixepoch()
      WHERE deleted_at IS NULL AND id NOT IN (SELECT id FROM saved_ids)`));
    commands.push(stmt('DELETE FROM class_group_lessons'));
    groups.forEach((group,index)=>group.lessonIds.forEach((lessonId,position)=>
      commands.push(stmt('INSERT INTO class_group_lessons(group_id,lesson_id,position) SELECT id,?,? FROM saved_ids WHERE seq=?',[lessonId,position,index+1]))));
    commands.push(stmt('SELECT id FROM saved_ids ORDER BY seq'));
    const results=await this.db.atomic(commands);
    const ids=(results.at(-1)?.rows||[]).map(row=>Number(row[0]?.value));
    return {saved:true,ids};
  }
}
