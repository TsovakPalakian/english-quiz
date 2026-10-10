import {statement as stmt, StudyError, recordId} from './turso-study.mjs';

const reviewer = actor => ['ADMIN', 'DEVELOPER'].includes(actor?.role);
const accountOk = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
function optionalId(value){if(value==null||value==='')return null;return recordId(value);}
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
  )`
];
let ready = null;

function signedIn(actor) {
  if (!actor?.id || !['USER', 'ADMIN', 'DEVELOPER'].includes(actor.role)) fail(401, 'Sign in first.');
}

export class ExamService {
  constructor(db) { this.db = db; }
  ensure() {
    if (!ready) ready = (async () => {
      await this.db.atomic(schema.map(sql => stmt(sql)));
      const columns = await this.db.read('PRAGMA table_info(exams)');
      if (!columns.some(column => column.name === 'title')) {
        await this.db.atomic([stmt("ALTER TABLE exams ADD COLUMN title TEXT NOT NULL DEFAULT 'Exam'")]);
      }
    })().catch((error) => { ready = null; throw error; });
    return ready;
  }
  async list(actor) {
    signedIn(actor);
    await this.ensure();
    const teacher = reviewer(actor);
    const exams = await this.db.read(`SELECT id, title, lesson_date, published, hidden_from_students, created_at FROM exams
      WHERE deleted_at IS NULL AND (?=1 OR (published=1 AND hidden_from_students=0))
      ORDER BY lesson_date DESC, created_at DESC`, [teacher ? 1 : 0]);
    if (!exams.length) return [];
    const ids = exams.map(row => row.id);
    const marks = ids.map(() => '?').join(',');
    const blocks = await this.db.read(`SELECT exam_id, id, position, title, published, hidden_from_students FROM exam_blocks
      WHERE deleted_at IS NULL AND exam_id IN (${marks}) AND (?=1 OR (published=1 AND hidden_from_students=0))
      ORDER BY position`, [...ids, teacher ? 1 : 0]);
    const materials = await this.db.read(`SELECT exam_id, block_id, id, position, type, tab, content_json FROM exam_materials
      WHERE deleted_at IS NULL AND exam_id IN (${marks}) ORDER BY position`, ids);
    return exams.map(exam => ({
      id: exam.id,
      title: exam.title || 'Exam',
      date: exam.lesson_date || '',
      published: !!exam.published,
      hidden: !!exam.hidden_from_students,
      created: Number(exam.created_at) || 0,
      blocks: blocks.filter(block => block.exam_id === exam.id).map(block => ({
        id: block.id,
        title: block.title || '',
        published: !!block.published,
        hidden: !!block.hidden_from_students,
        materials: materials.filter(part => part.exam_id === exam.id && part.block_id === block.id).map(part => {
          const content = JSON.parse(part.content_json || '{}');
          return { ...content, id: part.id, type: part.type, tab: part.tab || '' };
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
    const title = String(exam.title || 'Exam').trim().slice(0, 120) || 'Exam';
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'Invalid exam date.');
    const blocks = Array.isArray(exam.blocks) ? exam.blocks : [];
    if (blocks.length > 100) fail(400, 'Too many examination blocks.');
    const commands = [
      stmt('DROP TABLE IF EXISTS temp.saved_ids'),
      stmt("CREATE TEMP TABLE saved_ids(kind TEXT NOT NULL, seq INTEGER NOT NULL, id INTEGER NOT NULL, PRIMARY KEY(kind, seq))")
    ];
    if (examId == null) commands.push(
      stmt('INSERT INTO exams(title, lesson_date, published, hidden_from_students) VALUES(?,?,?,?)', [title, date, exam.published ? 1 : 0, exam.hidden ? 1 : 0]),
      stmt("INSERT INTO saved_ids(kind, seq, id) VALUES('exam', 0, last_insert_rowid())"));
    else commands.push(
      stmt(`UPDATE exams SET title=?, lesson_date=?, published=?, hidden_from_students=?, deleted_at=NULL, revision=revision+1, updated_at=unixepoch() WHERE id=?`, [title, date, exam.published ? 1 : 0, exam.hidden ? 1 : 0, examId]),
      stmt('INSERT INTO saved_ids(kind, seq, id) SELECT \'exam\', 0, id FROM exams WHERE id=? AND changes()=1', [examId]));
    let materialSeq = 0;
    blocks.forEach((block, index) => {
      if (!block || typeof block !== 'object') fail(400, 'Invalid examination block.');
      const blockId = optionalId(block.id);
      const materials = Array.isArray(block.materials) ? block.materials : [];
      if (materials.length > 200) fail(400, 'Too many materials in one block.');
      if (blockId == null) commands.push(
        stmt(`INSERT INTO exam_blocks(exam_id, position, title, published, hidden_from_students)
          SELECT id,?,?,?,? FROM saved_ids WHERE kind='exam' AND seq=0`, [index, String(block.title || '').slice(0, 200), block.published ? 1 : 0, block.hidden ? 1 : 0]),
        stmt("INSERT INTO saved_ids(kind, seq, id) VALUES('block', ?, last_insert_rowid())", [index]));
      else commands.push(
        stmt(`UPDATE exam_blocks SET position=?, title=?, published=?, hidden_from_students=?, deleted_at=NULL, revision=revision+1
          WHERE id=? AND exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0)`, [index, String(block.title || '').slice(0, 200), block.published ? 1 : 0, block.hidden ? 1 : 0, blockId]),
        stmt("INSERT INTO saved_ids(kind, seq, id) SELECT 'block', ?, id FROM exam_blocks WHERE id=? AND changes()=1", [index, blockId]));
      const partIds = [];
      materials.forEach((part, position) => {
        if (!part || !part.type) fail(400, 'Invalid exam material.');
        const partId = optionalId(part.id);
        const content = { ...part };
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
      commands.push(partIds.length
        ? stmt(`UPDATE exam_materials SET deleted_at=unixepoch() WHERE exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0) AND block_id=(SELECT id FROM saved_ids WHERE kind='block' AND seq=?) AND deleted_at IS NULL AND id NOT IN (${partIds.map(() => '?').join(',')})`, [index, ...partIds])
        : stmt("UPDATE exam_materials SET deleted_at=unixepoch() WHERE exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0) AND block_id=(SELECT id FROM saved_ids WHERE kind='block' AND seq=?) AND deleted_at IS NULL", [index]));
    });
    commands.push(blocks.length
      ? stmt(`UPDATE exam_blocks SET deleted_at=unixepoch() WHERE exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0) AND deleted_at IS NULL AND id NOT IN (SELECT id FROM saved_ids WHERE kind='block')`)
      : stmt("UPDATE exam_blocks SET deleted_at=unixepoch() WHERE exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0) AND deleted_at IS NULL"));
    commands.push(stmt("UPDATE exam_materials SET deleted_at=unixepoch() WHERE exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0) AND deleted_at IS NULL AND block_id NOT IN (SELECT id FROM exam_blocks WHERE exam_id=(SELECT id FROM saved_ids WHERE kind='exam' AND seq=0) AND deleted_at IS NULL)"));
    commands.push(stmt("SELECT id FROM saved_ids WHERE kind='exam' AND seq=0"));
    const results = await this.db.atomic(commands);
    const savedId = Number(results.at(-1)?.rows?.[0]?.[0]?.value);
    const exams = await this.list(actor);
    return exams.find(row => row.id === savedId) || { id: savedId, saved: true };
  }
  async remove(actor, id) {
    signedIn(actor);
    if (!reviewer(actor)) fail(403, 'Only a teacher can delete an exam.');
    recordId(id);
    await this.ensure();
    await this.db.atomic([
      stmt('UPDATE exam_materials SET deleted_at=unixepoch() WHERE exam_id=? AND deleted_at IS NULL', [id]),
      stmt('UPDATE exam_blocks SET deleted_at=unixepoch() WHERE exam_id=? AND deleted_at IS NULL', [id]),
      stmt('UPDATE exams SET deleted_at=unixepoch(), revision=revision+1, updated_at=unixepoch() WHERE id=? AND deleted_at IS NULL', [id])
    ]);
    return { id, deleted: true };
  }
  async listWork(actor, studentId) {
    signedIn(actor);
    await this.ensure();
    const account = this.workAccount(actor, studentId);
    const rows = await this.db.read('SELECT exam_id, block_id, saved, answers_json, corrections_json, points_json FROM exam_work WHERE account_id=?', [account]);
    return rows.map(row => ({
      examId: row.exam_id,
      blockId: row.block_id,
      saved: !!row.saved,
      answers: JSON.parse(row.answers_json || '{}'),
      corrections: JSON.parse(row.corrections_json || '{}'),
      points: JSON.parse(row.points_json || '{}')
    }));
  }
  workAccount(actor, studentId) {
    const account = studentId && studentId !== actor.id ? studentId : actor.id;
    if (account === actor.id) return account;
    if (!reviewer(actor)) fail(403, 'Only a teacher can open another student.');
    if (!accountOk(account)) fail(400, 'Invalid student.');
    return account;
  }
  async saveWork(actor, body) {
    signedIn(actor);
    await this.ensure();
    const examId = body && body.examId;
    const blockId = body && body.blockId;
    recordId(examId);recordId(blockId);
    const account = this.workAccount(actor, body.studentId);
    const own = account === actor.id;
    const current = await this.db.read('SELECT saved, answers_json, corrections_json, points_json FROM exam_work WHERE account_id=? AND exam_id=? AND block_id=?', [account, examId, blockId]);
    const prev = current[0] || {};
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
      saved=excluded.saved, answers_json=excluded.answers_json, corrections_json=excluded.corrections_json,
      points_json=excluded.points_json, updated_at=unixepoch()`,
      [account, examId, blockId, saved, answers, corrections, points])]);
    return { saved: true };
  }
}
