import {StudyError, statement as stmt} from './learning-study.mjs';
import {teacherMayTeachGroup} from './teacher-group-access.mjs';

const MONTH_KEY_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

function fail(status, message) {
  throw new StudyError(status, message);
}

function parseDoc(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

export class AttendanceService {
  constructor(db) {
    this.db = db;
  }

  async ensurePermission(actor, groupId) {
    if (!actor?.id) fail(401, 'Sign in first.');
    const allowed = await teacherMayTeachGroup(this.db, actor, groupId);
    if (!allowed) fail(403, 'You cannot manage attendance for this group.');
  }

  async listGroupMonths(actor, groupId) {
    const id = Number(groupId);
    if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Invalid group ID.');
    await this.ensurePermission(actor, id);

    const rows = await this.db.read(
      "SELECT key, value_json FROM catalog_documents WHERE namespace = 'group-attendance' AND key LIKE ?",
      [id + ':%']
    );

    const summaries = [];
    for (const row of rows) {
      const parts = row.key.split(':');
      const monthKey = parts[1];
      const parsed = parseDoc(row.value_json);
      if (parsed && monthKey) {
        summaries.push({
          groupId: id,
          monthKey,
          lessonCount: Array.isArray(parsed.lessonDates) ? parsed.lessonDates.length : 0,
          pricePerLesson: Number(parsed.pricePerLesson) || 0,
          currency: String(parsed.currency || 'BYN'),
          paymentDeadline: String(parsed.paymentDeadline || ''),
          revision: Number(parsed.revision) || 1,
          updatedAt: Number(parsed.updatedAt) || 0,
          updatedBy: String(parsed.updatedBy || '')
        });
      }
    }
    summaries.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    return summaries;
  }

  async getGroupAttendance(actor, groupId, monthKey) {
    const id = Number(groupId);
    if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Invalid group ID.');
    if (typeof monthKey !== 'string' || !MONTH_KEY_REGEX.test(monthKey)) fail(400, 'Invalid month format. Expected YYYY-MM.');
    await this.ensurePermission(actor, id);

    const key = id + ':' + monthKey;
    const [row] = await this.db.read(
      "SELECT value_json FROM catalog_documents WHERE namespace = 'group-attendance' AND key = ?",
      [key]
    );

    if (!row) {
      return {
        groupId: id,
        monthKey,
        lessonDates: [],
        pricePerLesson: 30,
        currency: 'BYN',
        paymentDeadline: '',
        attendance: {},
        revision: 0,
        exists: false
      };
    }

    const doc = parseDoc(row.value_json);
    if (!doc) fail(500, 'Corrupt attendance document.');
    return {
      groupId: id,
      monthKey,
      lessonDates: Array.isArray(doc.lessonDates) ? doc.lessonDates : [],
      pricePerLesson: Number(doc.pricePerLesson) || 0,
      currency: String(doc.currency || 'BYN'),
      paymentDeadline: String(doc.paymentDeadline || ''),
      attendance: doc.attendance && typeof doc.attendance === 'object' ? doc.attendance : {},
      revision: Number(doc.revision) || 1,
      updatedAt: Number(doc.updatedAt) || 0,
      updatedBy: String(doc.updatedBy || ''),
      exists: true
    };
  }

  async saveGroupAttendance(actor, groupId, monthKey, payload) {
    const id = Number(groupId);
    if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Invalid group ID.');
    if (typeof monthKey !== 'string' || !MONTH_KEY_REGEX.test(monthKey)) fail(400, 'Invalid month format. Expected YYYY-MM.');
    await this.ensurePermission(actor, id);

    if (!payload || typeof payload !== 'object') fail(400, 'Invalid payload.');

    // Validate lessonDates
    const rawDates = Array.isArray(payload.lessonDates) ? payload.lessonDates : [];
    for (const d of rawDates) {
      if (typeof d !== 'string' || !DATE_REGEX.test(d) || !d.startsWith(monthKey + '-')) {
        fail(400, 'Invalid lesson date: ' + String(d));
      }
    }
    const lessonDates = [...new Set(rawDates)].sort();

    // Validate pricing & deadline
    const pricePerLesson = Math.max(0, Number(payload.pricePerLesson) || 0);
    const currency = String(payload.currency || 'BYN').slice(0, 10);
    const paymentDeadline = typeof payload.paymentDeadline === 'string' && DATE_REGEX.test(payload.paymentDeadline)
      ? payload.paymentDeadline
      : '';

    // Validate attendance map: { [studentId]: { [date]: 'present' | 'absent' } }
    const attendance = {};
    if (payload.attendance && typeof payload.attendance === 'object') {
      for (const [studentId, dates] of Object.entries(payload.attendance)) {
        if (!studentId || typeof dates !== 'object' || dates === null) continue;
        const validDates = {};
        for (const [dateStr, status] of Object.entries(dates)) {
          if (lessonDates.includes(dateStr) && ['present', 'absent'].includes(status)) {
            validDates[dateStr] = status;
          }
        }
        attendance[studentId] = validDates;
      }
    }

    const key = id + ':' + monthKey;
    const [existing] = await this.db.read(
      "SELECT value_json FROM catalog_documents WHERE namespace = 'group-attendance' AND key = ?",
      [key]
    );

    const existingDoc = existing ? parseDoc(existing.value_json) : null;
    const currentRevision = existingDoc ? Number(existingDoc.revision) || 1 : 0;

    const expectedRevision = Number(payload.expectedRevision);
    if (Number.isSafeInteger(expectedRevision) && expectedRevision !== currentRevision) {
      fail(409, 'Attendance document changed. Reload it before editing.');
    }

    const nextRevision = currentRevision + 1;
    const now = Math.floor(Date.now() / 1000);
    const docToSave = {
      groupId: id,
      monthKey,
      lessonDates,
      pricePerLesson,
      currency,
      paymentDeadline,
      attendance,
      revision: nextRevision,
      updatedAt: now,
      updatedBy: String(actor.id)
    };

    await this.db.atomic([
      stmt(
        "INSERT INTO catalog_documents(namespace, key, value_json) VALUES('group-attendance', ?, ?) ON CONFLICT(namespace, key) DO UPDATE SET value_json = excluded.value_json",
        [key, JSON.stringify(docToSave)]
      )
    ]);

    return {
      ...docToSave,
      exists: true
    };
  }

  async deleteGroupAttendance(actor, groupId, monthKey) {
    const id = Number(groupId);
    if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Invalid group ID.');
    if (typeof monthKey !== 'string' || !MONTH_KEY_REGEX.test(monthKey)) fail(400, 'Invalid month format. Expected YYYY-MM.');
    await this.ensurePermission(actor, id);

    const key = id + ':' + monthKey;
    await this.db.atomic([
      stmt(
        "DELETE FROM catalog_documents WHERE namespace = 'group-attendance' AND key = ?",
        [key]
      )
    ]);

    return {
      deleted: true,
      groupId: id,
      monthKey
    };
  }
}
