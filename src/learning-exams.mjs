import {statement as stmt, StudyError, recordId,validateAssessmentContent} from './learning-study.mjs';
import {ArchiveService} from './learning-archive.mjs';
import {ensureAccountArchive} from './account-archive.mjs';
import {materialVisibility} from './learning-visibility.mjs';
import {AssessmentService} from './learning-assessment.mjs';
import {GroupService} from './learning-groups.mjs';
import {validateExamScoring,memoryDeck} from './exam-scoring.mjs';
import {assignedExamIds,assignedExamSql} from './learning-exam-access.mjs';
import {prefixedExamTitle} from './group-levels.mjs';
import {prepareExamContent} from './exam-content.mjs';
import {requireExamStarted} from './exam-workflow.mjs';

const reviewer = actor => ['ADMIN', 'DEVELOPER'].includes(actor?.role);
const accountOk = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
function optionalId(value){if(value==null||value==='')return null;return recordId(value);}
export function studentExamContent(content,type,{revealAnswer=false,protectAnswer=true}={}){
  if(protectAnswer&&type==='text'&&content.answerEnabled){
    const projected={...content,html:'',allowedAnswers:'',teacherAnswer:undefined,modelAnswer:undefined};
    delete projected.response;delete projected.responseFormatting;delete projected.text;delete projected.formatting;
    if(revealAnswer)projected.modelAnswer=content.teacherAnswer||content.html||'';
    return projected;
  }
  const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['answer','answers','write','back','hint','correct','marked','score','response','given','picked','typed','examCorrections','examPoints'].includes(key)).map(([key,item])=>[key,clean(item)])):value;
  if(type==='quiz'&&content.scoringVersion>=3&&content.quizType==='Memory'){const projected=clean(content);for(const item of projected.items||[])delete item.right;return {...projected,memoryFaces:memoryDeck(content)};}
  if(type==='quiz'&&content.scoringVersion>=3&&content.quizType==='Letters'){const projected=clean(content);for(const [i,item] of (projected.items||[]).entries()){item.letterOptions=String(content.items[i].word||'').split('').sort();delete item.word;}return projected;}
  if(type==='quiz'&&['Match','Memory'].includes(content.quizType)){
    const answerOptions=[...new Set((content.items||[]).map(item=>item.right||'').filter(Boolean))].sort();
    const projected=clean(content);projected.answerOptions=answerOptions;
    for(const item of projected.items||[])delete item.right;
    return projected;
  }
  if(content.scoringVersion>=3&&type==='vocab'){const projected=clean(content);for(const item of projected.items||[])delete item.translation;return projected;}
  if(content.scoringVersion>=3&&type==='cards')return clean(content);
  if(content.scoringVersion>=3&&content.quizType==='Hangman'){const projected=clean(content);for(const item of projected.items||[])delete item.word;return projected;}
  return ['quiz','exercise','task'].includes(type)?clean(content):content;
}
const fail = (status, message) => { throw new StudyError(status, message); };
const schema = [
  `CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY CHECK (id > 0),
    title TEXT NOT NULL DEFAULT 'Exam',
    lesson_date TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
    hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1)),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    deleted_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS exam_blocks (
    id INTEGER PRIMARY KEY CHECK (id > 0),
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    position INTEGER NOT NULL CHECK (position >= 0),
    title TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
    hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1)),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    deleted_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS exam_materials (
    id INTEGER PRIMARY KEY CHECK (id > 0),
    exam_id INTEGER NOT NULL,
    block_id INTEGER NOT NULL REFERENCES exam_blocks(id),
    position INTEGER NOT NULL CHECK (position >= 0),
    type TEXT NOT NULL,
    tab TEXT NOT NULL DEFAULT '',
    content_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(content_json) AND json_type(content_json) = 'object'),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    deleted_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS exam_work (
    account_id TEXT NOT NULL,
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    block_id INTEGER NOT NULL REFERENCES exam_blocks(id),
    saved INTEGER NOT NULL DEFAULT 0 CHECK (saved IN (0, 1)),
    answers_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(answers_json) AND json_type(answers_json) = 'object'),
    corrections_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(corrections_json) AND json_type(corrections_json) = 'object'),
    points_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(points_json) AND json_type(points_json) = 'object'),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (account_id, exam_id, block_id)
  )`,
  `CREATE TABLE IF NOT EXISTS exam_instances(exam_id INTEGER PRIMARY KEY REFERENCES exams(id),source_exam_id INTEGER NOT NULL,account_id TEXT NOT NULL,assignment_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,UNIQUE(assignment_id,account_id))`
];
const ready = new WeakMap();

function signedIn(actor) {
  if (!actor?.id || !['USER', 'ADMIN', 'DEVELOPER'].includes(actor.role)) fail(401, 'Sign in first.');
}

export class ExamService {
  constructor(db) { this.db = db; }
  ensure() {
    if (!ready.has(this.db)) ready.set(this.db,(async () => {
      await this.db.atomic(schema.map(sql => stmt(sql)));
      const columns = await this.db.read('PRAGMA table_info(exams)');
      if (!columns.some(column => column.name === 'title')) {
        await this.db.atomic([stmt("ALTER TABLE exams ADD COLUMN title TEXT NOT NULL DEFAULT 'Exam'")]);
      }
      const additions={status:"TEXT NOT NULL DEFAULT 'active'",group_id:'INTEGER',group_title:"TEXT NOT NULL DEFAULT ''",reviewer_id:"TEXT NOT NULL DEFAULT ''",reviewer_name:"TEXT NOT NULL DEFAULT 'Teacher'",student_name:"TEXT NOT NULL DEFAULT ''",student_email:"TEXT NOT NULL DEFAULT ''",assigned_at:'INTEGER NOT NULL DEFAULT 0',completed_at:'INTEGER',max_points:'REAL',earned_points:'REAL'};
      await this.db.atomic([stmt('CREATE TABLE IF NOT EXISTS exam_reviewer_hides(account_id TEXT NOT NULL,exam_id INTEGER NOT NULL,PRIMARY KEY(account_id,exam_id))')]);
      const instanceColumns=new Set((await this.db.read('PRAGMA table_info(exam_instances)')).map(column=>column.name));
      for(const [name,type] of Object.entries(additions)){
        if(!instanceColumns.has(name)){
          try{await this.db.atomic([stmt('ALTER TABLE exam_instances ADD COLUMN '+name+' '+type)]);}catch(error){if(!(await this.db.read('PRAGMA table_info(exam_instances)')).some(c=>c.name===name))throw error;}
          instanceColumns.add(name);
        }
      }
    })().catch((error) => { ready.delete(this.db); throw error; }));
    return ready.get(this.db);
  }
  async list(actor) {
    signedIn(actor);
    await this.ensure();
    await new GroupService(this.db).ensure();
    const groupNames=await this.db.read(`SELECT e.id,e.title,COALESCE(g.title,ig.title) AS group_title,i.group_title AS instance_title
      FROM exams e LEFT JOIN class_group_exams gx ON gx.exam_id=e.id LEFT JOIN class_groups g ON g.id=gx.group_id AND g.deleted_at IS NULL
      LEFT JOIN exam_instances i ON i.exam_id=e.id LEFT JOIN class_groups ig ON ig.id=i.group_id AND ig.deleted_at IS NULL
      WHERE e.deleted_at IS NULL AND (g.id IS NOT NULL OR ig.id IS NOT NULL)`);
    const nameCommands=[];
    for(const exam of groupNames){
      const title=prefixedExamTitle(exam.title,exam.group_title);
      if(title!==exam.title)nameCommands.push(stmt('UPDATE exams SET title=?,revision=revision+1 WHERE id=? AND title=?',[title,exam.id,exam.title]));
      if(exam.instance_title!=null&&exam.instance_title!==exam.group_title)nameCommands.push(stmt('UPDATE exam_instances SET group_title=? WHERE exam_id=?',[exam.group_title,exam.id]));
    }
    if(nameCommands.length)await this.db.atomic(nameCommands);
    const teacher = reviewer(actor);
    const catalogView=teacher&&!actor.managedStudent;
    await ensureAccountArchive(this.db);
    const assigned=await assignedExamIds(this.db,actor.id);
    const exams = await this.db.read(`SELECT id, title, lesson_date, published, hidden_from_students, created_at,revision,
      (SELECT i.status FROM exam_instances i WHERE i.exam_id=exams.id) instance_status,
      (SELECT i.group_title FROM exam_instances i WHERE i.exam_id=exams.id) instance_group_title,
      (SELECT i.completed_at FROM exam_instances i WHERE i.exam_id=exams.id) completed_at,
      (SELECT i.account_id FROM exam_instances i WHERE i.exam_id=exams.id) instance_account,
      (SELECT i.student_name FROM exam_instances i WHERE i.exam_id=exams.id) instance_student,
      (SELECT i.student_email FROM exam_instances i WHERE i.exam_id=exams.id) instance_email,
      (SELECT i.max_points FROM exam_instances i WHERE i.exam_id=exams.id) instance_max,
      (SELECT i.earned_points FROM exam_instances i WHERE i.exam_id=exams.id) instance_earned,
      CASE WHEN EXISTS(SELECT 1 FROM exam_instances i WHERE i.exam_id=exams.id) THEN (SELECT i.group_id FROM exam_instances i WHERE i.exam_id=exams.id) ELSE (SELECT gx.group_id FROM class_group_exams gx JOIN class_groups g ON g.id=gx.group_id WHERE gx.exam_id=exams.id AND g.deleted_at IS NULL) END AS group_id FROM exams
      WHERE deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM exam_instances i WHERE i.exam_id=exams.id AND ((?=0 AND i.account_id<>?) OR i.active=0))
      AND NOT EXISTS(SELECT 1 FROM exam_instances i JOIN account_archives a ON a.account_id=i.account_id WHERE i.exam_id=exams.id)
      AND (?=0 OR NOT EXISTS(SELECT 1 FROM exam_reviewer_hides h WHERE h.exam_id=exams.id AND h.account_id=?))
      AND (?=1 OR ${assignedExamSql('exams.id',assigned)})
      AND (?=1 OR (published=1 AND (hidden_from_students=0 OR ${assignedExamSql('exams.id',assigned)})))
      AND (?=1 OR NOT EXISTS(SELECT 1 FROM exam_instances i WHERE i.source_exam_id=exams.id AND i.account_id=? AND i.active=1))
      ORDER BY lesson_date DESC, created_at DESC`, [+catalogView,actor.id,+catalogView,actor.id,+catalogView,+teacher,+catalogView,actor.id]);
    if (!exams.length) return [];
    const ids = exams.map(row => row.id);
    const marks = ids.map(() => '?').join(',');
    const blocks = await this.db.read(`SELECT exam_id, id, position, title, published, hidden_from_students FROM exam_blocks
      WHERE deleted_at IS NULL AND exam_id IN (${marks}) AND (?=1 OR (published=1 AND (hidden_from_students=0 OR ${assignedExamSql('exam_id',assigned)})))
      ORDER BY position`, [...ids, teacher ? 1 : 0]);
    const materials = await this.db.read(`SELECT exam_id, block_id, id, position, type, tab, content_json FROM exam_materials
      WHERE deleted_at IS NULL AND exam_id IN (${marks}) ORDER BY position`, ids);
    const hidden=await materialVisibility(this.db,actor.id);
    return exams.filter(exam=>teacher||assigned.has(exam.id)||!hidden.has('exam:'+exam.id)).map(exam => ({
      id: exam.id,
      revision: exam.revision,
      groupId:exam.group_id||null,
      instanceStatus:exam.instance_status||null,
      groupTitle:exam.instance_group_title||'',
      completedAt:exam.completed_at||null,
      studentId:exam.instance_account||null,
      studentName:exam.instance_student||'',
      studentEmail:exam.instance_email||'',
      maximumPoints:exam.instance_max,
      earnedPoints:exam.instance_earned,
      title: exam.title || 'Exam',
      date: exam.lesson_date || '',
      published: !!exam.published,
      hidden: !!exam.hidden_from_students&&(catalogView||!assigned.has(exam.id)),
      personalHidden: hidden.has('exam:'+exam.id)&&(catalogView||!assigned.has(exam.id)),
      created: Number(exam.created_at) || 0,
      blocks: blocks.filter(block => (teacher||exam.instance_status!=='ready')&&block.exam_id === exam.id&&(teacher||assigned.has(exam.id)||!hidden.has('exam-block:'+block.id))).map(block => ({
        id: block.id,
        title: block.title || '',
        published: !!block.published,
        hidden: !!block.hidden_from_students&&(catalogView||!assigned.has(exam.id)),
        personalHidden: hidden.has('exam-block:'+block.id)&&(catalogView||!assigned.has(exam.id)),
        materials: materials.filter(part => part.exam_id === exam.id && part.block_id === block.id).map(part => {
          const content = JSON.parse(part.content_json || '{}');
          return { ...(teacher?content:studentExamContent(content,part.type)), id: part.id, type: part.type, tab: part.tab || '' };
        })
      }))
    }));
  }
  async save(actor, body) {
    signedIn(actor);
    if (!reviewer(actor)) fail(403, 'Only a teacher can save an exam.');
    await this.ensure();
    const exam = body && body.exam;
    if (!exam || typeof exam !== 'object') fail(400, 'Invalid exam.');
    const examId = optionalId(exam.id);
    const date = String(exam.date || '');
    let title = String(exam.title || 'Exam').trim().slice(0, 120) || 'Exam';
    await new GroupService(this.db).ensure();
    const groupId=examId==null?optionalId(exam.groupId):(await this.db.read('SELECT group_id FROM class_group_exams WHERE exam_id=?',[examId]))[0]?.group_id;
    if(groupId){const group=await new GroupService(this.db).activeGroup(groupId);title=prefixedExamTitle(title,group.title);}
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'Invalid exam date.');
    const blocks = Array.isArray(exam.blocks) ? exam.blocks : [];
    if (blocks.length > 100) fail(400, 'Too many examination blocks.');
    const archive=new ArchiveService(this.db);await archive.ensure();
    if(examId!=null){
      if((await this.db.read('SELECT exam_id FROM exam_instances WHERE exam_id=?',[examId])).length)fail(403,'Assigned exam materials are a frozen student copy.');
      const active=await this.db.read('SELECT id FROM exams WHERE id=? AND deleted_at IS NULL',[examId]);
      if(!active.length)fail(409,'This exam is archived. Refresh the exam list.');
      const ids=blocks.map(block=>optionalId(block?.id)).filter(id=>id!=null);
      if(new Set(ids).size!==ids.length)fail(400,'Duplicate examination block.');
      if(ids.length){
        const found=await this.db.read(`SELECT id FROM exam_blocks WHERE exam_id=? AND deleted_at IS NULL AND id IN (${ids.map(()=>'?').join(',')})`,[examId,...ids]);
        if(found.length!==ids.length)fail(409,'An examination block is archived. Refresh the exam list.');
      }
    }
    const commands = [
      stmt('DROP TABLE IF EXISTS temp.saved_ids'),
      stmt("CREATE TEMP TABLE saved_ids(kind TEXT NOT NULL, seq INTEGER NOT NULL, id INTEGER NOT NULL, PRIMARY KEY(kind, seq))")
    ];
    if (examId == null) commands.push(
      stmt('INSERT INTO exams(title, lesson_date, published, hidden_from_students) VALUES(?,?,?,?)', [title, date, exam.published ? 1 : 0, exam.hidden ? 1 : 0]),
      stmt("INSERT INTO saved_ids(kind, seq, id) VALUES('exam', 0, last_insert_rowid())"));
    else commands.push(
      stmt(`UPDATE exams SET title=?, lesson_date=?, published=?, hidden_from_students=?, revision=revision+1, updated_at=unixepoch() WHERE id=? AND deleted_at IS NULL`, [title, date, exam.published ? 1 : 0, exam.hidden ? 1 : 0, examId]),
      stmt("INSERT INTO saved_ids(kind, seq, id) VALUES('exam',0,(SELECT id FROM exams WHERE id=? AND deleted_at IS NULL AND changes()=1))", [examId]));
    let materialSeq = 0;
    if(examId==null&&groupId)commands.push(stmt("INSERT INTO class_group_exams(group_id,exam_id) SELECT ?,id FROM saved_ids WHERE kind='exam' AND seq=0",[groupId]));
    blocks.forEach((block, index) => {
      if (!block || typeof block !== 'object') fail(400, 'Invalid examination block.');
      const blockId = optionalId(block.id);
      const materials = Array.isArray(block.materials) ? block.materials : [];
      try{validateExamScoring(materials,!block.published);}catch(error){fail(400,error.message);}
      const firstMaterialSeq=materialSeq;
      if (materials.length > 200) fail(400, 'Too many materials in one block.');
      if (blockId == null) commands.push(
        stmt(`INSERT INTO exam_blocks(exam_id, position, title, published, hidden_from_students)
          SELECT id,?,?,?,? FROM saved_ids WHERE kind='exam' AND seq=0`, [index, String(block.title || '').slice(0, 200), block.published ? 1 : 0, block.hidden ? 1 : 0]),
        stmt("INSERT INTO saved_ids(kind, seq, id) VALUES('block', ?, last_insert_rowid())", [index]));
      else commands.push(
        stmt(`UPDATE exam_blocks SET position=?, title=?, published=?, hidden_from_students=?, revision=revision+1
          WHERE id=? AND deleted_at IS NULL AND exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0)`, [index, String(block.title || '').slice(0, 200), block.published ? 1 : 0, block.hidden ? 1 : 0, blockId]),
        stmt("INSERT INTO saved_ids(kind, seq, id) VALUES('block',?,(SELECT id FROM exam_blocks WHERE id=? AND deleted_at IS NULL AND changes()=1))", [index, blockId]));
      const partIds = [];
      materials.forEach((part, position) => {
        if (!part || !part.type) fail(400, 'Invalid exam material.');
        const partId = optionalId(part.id);
        const content = { ...part };
        try{prepareExamContent(content,part.type);}catch(error){fail(400,error.message);}
        if(content.items!=null&&(!Array.isArray(content.items)||content.items.some(item=>!item||typeof item!=='object'||Array.isArray(item))))fail(400,'Invalid questions.');
        validateAssessmentContent(content,part.type);
        delete content.stageDefinition;
        delete content.studentSaved;
        if (partId == null) delete content.id;
        if (Array.isArray(content.items)) content.items.forEach(item => { if (item && typeof item === 'object') delete item.given; });
        const json = JSON.stringify(content);
        if (json.length > 20000) fail(413, 'One exam material is too large.');
        if (partId == null) commands.push(
          stmt(`INSERT INTO exam_materials(exam_id, block_id, position, type, tab, content_json)
            SELECT e.id, b.id, ?, ?, ?, ? FROM saved_ids e JOIN saved_ids b ON b.kind='block' AND b.seq=?
            WHERE e.kind='exam' AND e.seq=0`, [position, String(part.type).slice(0, 40), String(part.tab || '').slice(0, 40), json, index]),
          stmt("INSERT INTO saved_ids(kind, seq, id) VALUES('material', ?, last_insert_rowid())", [materialSeq]));
        else {
          partIds.push(partId);
          commands.push(stmt(`UPDATE exam_materials SET position=?, type=?, tab=?, content_json=?, deleted_at=NULL, revision=revision+1
            WHERE id=? AND block_id=? AND exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0)`,
            [position, String(part.type).slice(0, 40), String(part.tab || '').slice(0, 40), json, partId, blockId]));
        }
        materialSeq++;
      });
      commands.push(stmt(`UPDATE exam_materials SET deleted_at=unixepoch() WHERE exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0) AND block_id=(SELECT id FROM saved_ids WHERE kind='block' AND seq=?) AND deleted_at IS NULL
        AND id NOT IN (SELECT id FROM saved_ids WHERE kind='material' AND seq>=? AND seq<?)${partIds.length?' AND id NOT IN ('+partIds.map(()=>'?').join(',')+')':''}`,[index,firstMaterialSeq,materialSeq,...partIds]));
    });
    commands.push(stmt(`INSERT INTO content_archive(entity_type,entity_id,title,archived_by,archived_by_name,archived_by_role)
      SELECT 'exam-block',CAST(id AS TEXT),title,?,?,? FROM exam_blocks WHERE exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0)
      AND deleted_at IS NULL AND id NOT IN (SELECT id FROM saved_ids WHERE kind='block')
      ON CONFLICT(entity_type,entity_id) DO UPDATE SET title=excluded.title,archived_by=excluded.archived_by,archived_by_name=excluded.archived_by_name,
      archived_by_role=excluded.archived_by_role,archived_at=unixepoch(),teacher_hidden_at=NULL,teacher_hidden_by=NULL`,[actor.id,String(actor.login||actor.name||actor.id),actor.role]),
      stmt('UPDATE content_archive_state SET revision=revision+1 WHERE id=1 AND changes()>0'));
    commands.push(blocks.length
      ? stmt(`UPDATE exam_blocks SET deleted_at=unixepoch() WHERE exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0) AND deleted_at IS NULL AND id NOT IN (SELECT id FROM saved_ids WHERE kind='block')`)
      : stmt("UPDATE exam_blocks SET deleted_at=unixepoch() WHERE exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0) AND deleted_at IS NULL"));
    commands.push(stmt("SELECT id FROM saved_ids WHERE kind='exam' AND seq=0"));
    const results = await this.db.atomic(commands);
    const savedId = Number(results.at(-1)?.rows?.[0]?.[0]?.value);
    const exams = await this.list(actor);
    return exams.find(row => row.id === savedId) || { id: savedId, saved: true };
  }
  async remove(actor, id) {
    await this.ensure();
    if(reviewer(actor)){
      const [instance]=await this.db.read('SELECT status FROM exam_instances WHERE exam_id=?',[id]);
      if(instance){
        if(instance.status!=='completed')fail(409,'Only completed work can be removed from your list.');
        await this.db.atomic([stmt('INSERT OR IGNORE INTO exam_reviewer_hides(account_id,exam_id) VALUES(?,?)',[actor.id,id])]);
        return {removed:true,examId:id,referenceOnly:true};
      }
    }
    signedIn(actor);
    if (!reviewer(actor)) fail(403, 'Only a teacher can delete an exam.');
    recordId(id);
    await this.ensure();
    return new ArchiveService(this.db).archive(actor,{type:'exam',id});
  }
  async listWork(actor, studentId) {
    signedIn(actor);
    await this.ensure();
    const account = this.workAccount(actor, studentId);
    const assigned=await assignedExamIds(this.db,account);
    const rows = await this.db.read(`SELECT w.exam_id,w.block_id,w.saved,w.answers_json,w.corrections_json,w.points_json,(SELECT status FROM exam_instances i WHERE i.exam_id=w.exam_id AND i.active=1) instance_status FROM exam_work w
      JOIN exams e ON e.id=w.exam_id JOIN exam_blocks b ON b.id=w.block_id AND b.exam_id=e.id
      WHERE w.account_id=? AND e.deleted_at IS NULL AND b.deleted_at IS NULL
        AND (?=1 OR (e.published=1 AND b.published=1 AND ${assignedExamSql('e.id',assigned)}))`,[account,+reviewer(actor)]);
    const hidden=await materialVisibility(this.db,account);
    const service=new AssessmentService(this.db);await service.ensure();
    return Promise.all(rows.filter(row=>reviewer(actor)||assigned.has(row.exam_id)||!hidden.has('exam:'+row.exam_id)&&!hidden.has('exam-block:'+row.block_id)).map(async row => {
      if(!reviewer(actor)&&row.instance_status==='ready')return {examId:row.exam_id,blockId:row.block_id,saved:!!row.saved,state:'reviewing',answers:{},points:{},corrections:{},materials:[]};
      const tracked=await service.row(account,'exam-block',row.block_id);if(tracked){if(!reviewer(actor)&&['submitted','reviewing'].includes(tracked.state))return {examId:row.exam_id,blockId:row.block_id,saved:true,state:tracked.state,revision:tracked.revision,answers:{},points:{},corrections:{},materials:[]};return service.project(tracked,actor);}
      return ({
      examId: row.exam_id,
      blockId: row.block_id,
      saved: !!row.saved,
      answers: JSON.parse(row.answers_json || '{}'),
      corrections: reviewer(actor) ? JSON.parse(row.corrections_json || '{}') : {},
      points: reviewer(actor) ? JSON.parse(row.points_json || '{}') : {},
      state:row.saved?'submitted':'draft',revision:0
    });}));
  }
  workAccount(actor, studentId) {
    const account = studentId && studentId !== actor.id ? studentId : actor.id;
    if (account === actor.id) return account;
    if (!reviewer(actor)) fail(403, 'Only a teacher can open another student.');
    if (!accountOk(account)) fail(400, 'Invalid student.');
    return account;
  }
  async saveWork(actor, body) {
    await this.ensure();
    return new AssessmentService(this.db).write(actor,{...body,kind:'exam-block',id:body.blockId,action:body.action||(body.studentId&&body.studentId!==actor.id?'review':body.saved?'submit':'draft')});
  }
  async legacySaveWork(actor, body) {
    signedIn(actor);
    await this.ensure();
    const examId = body && body.examId;
    const blockId = body && body.blockId;
    recordId(examId);recordId(blockId);
    const account = this.workAccount(actor, body.studentId);
    const own = account === actor.id;
    const assigned=await assignedExamIds(this.db,account);
    const [block]=await this.db.read(`SELECT b.id FROM exam_blocks b JOIN exams e ON e.id=b.exam_id
      WHERE e.id=? AND b.id=? AND e.deleted_at IS NULL AND b.deleted_at IS NULL
        AND (?=1 OR (e.published=1 AND b.published=1 AND ${assignedExamSql('e.id',assigned)}))`,[examId,blockId,+reviewer(actor)]);
    const hidden=await materialVisibility(this.db,account);
    if(!block||!reviewer(actor)&&!assigned.has(examId)&&(hidden.has('exam:'+examId)||hidden.has('exam-block:'+blockId)))fail(404,'Exam not found.');
    if(own&&actor.role==='USER'&&body.saved){await new AssessmentService(this.db).ensure();await requireExamStarted(this.db,examId,account);}
    const current = await this.db.read('SELECT saved, answers_json, corrections_json, points_json FROM exam_work WHERE account_id=? AND exam_id=? AND block_id=?', [account, examId, blockId]);
    const prev = current[0] || {};
    if(own&&actor.role==='USER'&&prev.saved){
      if(body.saved&&JSON.stringify(body.answers||{})===prev.answers_json)return {saved:true};
      fail(409,'This examination block has already been submitted.');
    }
    const pack = (value, limit) => {
      const json = JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
      if (json.length > limit) fail(413, 'Exam work is too large.');
      return json;
    };
    const saved = own ? (body.saved ? 1 : Number(prev.saved) || 0) : (Number(prev.saved) || 0);
    const answers = own ? pack(body.answers, 20000) : (prev.answers_json || '{}');
    const corrections = own ? (prev.corrections_json || '{}') : pack(body.corrections, 20000);
    const points = own ? (prev.points_json || '{}') : pack(body.points, 8000);
    await this.db.atomic([stmt(`INSERT INTO exam_work(account_id, exam_id, block_id, saved, answers_json, corrections_json, points_json)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_id, exam_id, block_id) DO UPDATE SET
      saved=max(exam_work.saved,excluded.saved), answers_json=CASE WHEN ?=1 THEN excluded.answers_json ELSE exam_work.answers_json END,
      corrections_json=CASE WHEN ?=1 THEN exam_work.corrections_json ELSE excluded.corrections_json END,
      points_json=CASE WHEN ?=1 THEN exam_work.points_json ELSE excluded.points_json END, updated_at=unixepoch()
      WHERE exam_work.saved=0 OR ?=1`,
      [account, examId, blockId, saved, answers, corrections, points,+own,+own,+own,+(actor.role!=='USER')])]);
    if(own&&actor.role==='USER'){
      const [written]=await this.db.read('SELECT answers_json FROM exam_work WHERE account_id=? AND exam_id=? AND block_id=?',[account,examId,blockId]);
      if(written?.answers_json!==answers)fail(409,'This examination block has already been submitted.');
    }
    return { saved: true };
  }
}
