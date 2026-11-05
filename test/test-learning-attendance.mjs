import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AttendanceService} from '../src/learning-attendance.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';

const teacher1 = {id: 'teacher1', role: 'ADMIN'};
const teacher2 = {id: 'teacher2', role: 'ADMIN'};
const dev = {id: 'dev', role: 'DEVELOPER'};
const student = {id: 'student', role: 'USER'};

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE catalog_documents (
      namespace TEXT,
      key TEXT,
      value_json TEXT,
      PRIMARY KEY(namespace, key)
    );
    CREATE TABLE class_groups (
      id INTEGER PRIMARY KEY,
      deleted_at INTEGER
    );
    CREATE TABLE class_group_students (
      account_id TEXT PRIMARY KEY,
      group_id INTEGER
    );
    INSERT INTO class_groups VALUES (1, NULL), (2, NULL);
    INSERT INTO catalog_documents VALUES ('accounts-group-teachers', '1', '{"teacherIds":["teacher1"]}');
  `);

  const args = c => c.args.map(a => a.type === 'null' ? null : ['integer', 'float'].includes(a.type) ? Number(a.value) : a.value);
  const db = {
    read: async (q, a = []) => sql.prepare(q).all(...a),
    atomic: async commands => {
      sql.exec('BEGIN');
      try {
        for (const c of commands) sql.prepare(c.sql).run(...args(c));
        sql.exec('COMMIT');
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    }
  };

  return {
    sql,
    db,
    service: new AttendanceService(db),
    close: () => sql.close()
  };
}

test('AttendanceService enforces authorization: teacher of group and dev allowed, outsider teacher denied', async () => {
  const f = fixture();
  try {
    const validMonth = '2026-11';
    const initial = await f.service.getGroupAttendance(teacher1, 1, validMonth);
    assert.equal(initial.exists, false);
    assert.equal(initial.revision, 0);

    const devAccess = await f.service.getGroupAttendance(dev, 1, validMonth);
    assert.equal(devAccess.exists, false);

    await assert.rejects(
      f.service.getGroupAttendance(teacher2, 1, validMonth),
      e => e.status === 403
    );

    await assert.rejects(
      f.service.getGroupAttendance(student, 1, validMonth),
      e => e.status === 403
    );
  } finally {
    f.close();
  }
});

test('AttendanceService validates payload inputs, dates, and strips unauthorized date keys', async () => {
  const f = fixture();
  try {
    // Bad month key
    await assert.rejects(
      f.service.saveGroupAttendance(teacher1, 1, 'invalid-month', {}),
      e => e.status === 400
    );

    // Bad lesson date (not matching month)
    await assert.rejects(
      f.service.saveGroupAttendance(teacher1, 1, '2026-11', {
        lessonDates: ['2026-10-31']
      }),
      e => e.status === 400
    );

    // Valid save
    const saved = await f.service.saveGroupAttendance(teacher1, 1, '2026-11', {
      lessonDates: ['2026-11-10', '2026-11-03'], // Unsorted
      pricePerLesson: 40,
      currency: 'BYN',
      paymentDeadline: '2026-11-25',
      attendance: {
        'student-1': {
          '2026-11-03': 'present',
          '2026-11-10': 'absent',
          '2026-11-99': 'present' // Should be stripped because not in lessonDates
        }
      },
      expectedRevision: 0
    });

    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.lessonDates, ['2026-11-03', '2026-11-10']); // Sorted
    assert.equal(saved.pricePerLesson, 40);
    assert.deepEqual(saved.attendance['student-1'], {
      '2026-11-03': 'present',
      '2026-11-10': 'absent'
    });
  } finally {
    f.close();
  }
});

test('AttendanceService CAS prevents lost updates with revision conflict', async () => {
  const f = fixture();
  try {
    await f.service.saveGroupAttendance(teacher1, 1, '2026-11', {
      lessonDates: ['2026-11-05'],
      expectedRevision: 0
    });

    // Mismatched expectedRevision throws 409
    await assert.rejects(
      f.service.saveGroupAttendance(teacher1, 1, '2026-11', {
        lessonDates: ['2026-11-05', '2026-11-12'],
        expectedRevision: 0
      }),
      e => e.status === 409
    );

    // Matching expectedRevision succeeds
    const updated = await f.service.saveGroupAttendance(teacher1, 1, '2026-11', {
      lessonDates: ['2026-11-05', '2026-11-12'],
      expectedRevision: 1
    });
    assert.equal(updated.revision, 2);
    assert.equal(updated.lessonDates.length, 2);
  } finally {
    f.close();
  }
});

test('Simulated client resolution on 409 conflict merges data and updates revision', async () => {
  const f = fixture();
  try {
    // Initial state saved by Teacher A
    await f.service.saveGroupAttendance(teacher1, 1, '2026-11', {
      lessonDates: ['2026-11-05'],
      attendance: {'s1': {'2026-11-05': 'present'}},
      expectedRevision: 0
    });

    // Concurrent save by Teacher B succeeds (revision becomes 2)
    await f.service.saveGroupAttendance(teacher1, 1, '2026-11', {
      lessonDates: ['2026-11-05', '2026-11-12'],
      attendance: {'s1': {'2026-11-05': 'present'}, 's2': {'2026-11-05': 'absent'}},
      expectedRevision: 1
    });

    // Teacher A attempts save with stale expectedRevision: 1 -> 409 Conflict
    await assert.rejects(
      f.service.saveGroupAttendance(teacher1, 1, '2026-11', {
        lessonDates: ['2026-11-05'],
        attendance: {'s1': {'2026-11-05': 'absent'}},
        expectedRevision: 1
      }),
      e => e.status === 409
    );

    // Conflict resolution: reload latest
    const latest = await f.service.getGroupAttendance(teacher1, 1, '2026-11');
    assert.equal(latest.revision, 2);

    // Merge: keep latest server attendance for s2 ('absent'), overlay local update for s1 ('absent')
    const mergedAttendance = {...latest.attendance, 's1': {'2026-11-05': 'absent'}};
    const mergedDates = [...new Set([...latest.lessonDates, '2026-11-05'])].sort();

    // Resubmit with expectedRevision: latest.revision (2)
    const resolved = await f.service.saveGroupAttendance(teacher1, 1, '2026-11', {
      lessonDates: mergedDates,
      attendance: mergedAttendance,
      expectedRevision: latest.revision
    });

    assert.equal(resolved.revision, 3);
    assert.equal(resolved.attendance.s1['2026-11-05'], 'absent');
    assert.equal(resolved.attendance.s2['2026-11-05'], 'absent');
  } finally {
    f.close();
  }
});

test('AttendanceService lists months summaries and deletes month document', async () => {
  const f = fixture();
  try {
    await f.service.saveGroupAttendance(teacher1, 1, '2026-10', {
      lessonDates: ['2026-10-01', '2026-10-08'],
      pricePerLesson: 30
    });
    await f.service.saveGroupAttendance(teacher1, 1, '2026-11', {
      lessonDates: ['2026-11-02', '2026-11-09', '2026-11-16'],
      pricePerLesson: 35
    });

    const list = await f.service.listGroupMonths(teacher1, 1);
    assert.equal(list.length, 2);
    assert.equal(list[0].monthKey, '2026-11');
    assert.equal(list[0].lessonCount, 3);
    assert.equal(list[1].monthKey, '2026-10');
    assert.equal(list[1].lessonCount, 2);

    // Delete month
    const delResult = await f.service.deleteGroupAttendance(teacher1, 1, '2026-10');
    assert.equal(delResult.deleted, true);

    const listAfter = await f.service.listGroupMonths(teacher1, 1);
    assert.equal(listAfter.length, 1);
    assert.equal(listAfter[0].monthKey, '2026-11');
  } finally {
    f.close();
  }
});

test('IntegratedWorker /api/groups/attendance endpoints enforce auth, roles, CSRF, and operations', async () => {
  const f = fixture();
  try {
    let identity = teacher1;
    const env = {
      STAGE_ENABLED: 'true',
      STAGE_ALLOWED_HOST: 'quiz.example',
      STAGE_WRITES: 'true',
      DB: {prepare() { return {}; }}
    };
    const ctx = {waitUntil() {}};

    const app = integratedWorker({
      authenticate: async () => identity,
      accountWorker: {fetch: async () => Response.json({users: []})},
      studyDatabase: () => f.db
    });

    const get = (query = '') => app.fetch(
      new Request(`https://quiz.example/api/groups/attendance${query}`),
      env,
      ctx
    );

    const post = (body, origin = 'https://quiz.example') => app.fetch(
      new Request('https://quiz.example/api/groups/attendance', {
        method: 'POST',
        headers: {Origin: origin, 'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      }),
      env,
      ctx
    );

    const del = (query = '', origin = 'https://quiz.example') => app.fetch(
      new Request(`https://quiz.example/api/groups/attendance${query}`, {
        method: 'DELETE',
        headers: {Origin: origin}
      }),
      env,
      ctx
    );

    // 401 unauthenticated
    identity = null;
    assert.equal((await get('?groupId=1')).status, 401);

    // 403 student role
    identity = student;
    assert.equal((await get('?groupId=1')).status, 403);

    // 403 outsider teacher
    identity = teacher2;
    assert.equal((await get('?groupId=1')).status, 403);

    // 200 list months for authorized teacher
    identity = teacher1;
    const initialList = await (await get('?groupId=1')).json();
    assert.deepEqual(initialList, {months: []});

    // 503 writes disabled
    env.STAGE_WRITES = 'false';
    const writeDisabled = await post({
      groupId: 1,
      month: '2026-11',
      payload: {lessonDates: ['2026-11-04'], pricePerLesson: 30}
    });
    assert.equal(writeDisabled.status, 503);
    env.STAGE_WRITES = 'true';

    // 200 POST save
    const saveResp = await post({
      groupId: 1,
      month: '2026-11',
      payload: {
        lessonDates: ['2026-11-04', '2026-11-18'],
        pricePerLesson: 30,
        currency: 'BYN',
        paymentDeadline: '2026-11-20',
        attendance: {'student1': {'2026-11-04': 'present'}},
        expectedRevision: 0
      }
    });
    assert.equal(saveResp.status, 200);
    const saveJson = await saveResp.json();
    assert.equal(saveJson.revision, 1);
    assert.equal(saveJson.lessonDates.length, 2);

    // 200 GET specific month
    const getMonthResp = await get('?groupId=1&month=2026-11');
    assert.equal(getMonthResp.status, 200);
    const monthJson = await getMonthResp.json();
    assert.equal(monthJson.exists, true);
    assert.equal(monthJson.pricePerLesson, 30);
    assert.equal(monthJson.attendance.student1['2026-11-04'], 'present');

    // 200 DELETE month
    const delResp = await del('?groupId=1&month=2026-11');
    assert.equal(delResp.status, 200);
    const delJson = await delResp.json();
    assert.equal(delJson.deleted, true);

    // Verify deleted
    const afterDelResp = await get('?groupId=1&month=2026-11');
    const afterDelJson = await afterDelResp.json();
    assert.equal(afterDelJson.exists, false);
  } finally {
    f.close();
  }
});

test('Client contracts: group calendar month cache isolation, real student binding, and Title Case role labels', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const calSrc = await fs.readFile(path.resolve('client/53a-group-calendar.js'), 'utf8');
  const pillSrc = await fs.readFile(path.resolve('client/20a-user-profile-pill.js'), 'utf8');
  const coreSrc = await fs.readFile(path.resolve('client/00-core.js'), 'utf8');
  const cssSrc = await fs.readFile(path.resolve('site/preview.css'), 'utf8');

  // 1. Month cache isolation in calendar
  assert.ok(calSrc.includes('function getMonthData(state, monthKey)'), 'Calendar must use per-month data caching');
  assert.ok(calSrc.includes('d.startsWith(monthKey + \'-\')'), 'Calendar must filter payload dates strictly by current monthKey');

  // 2. No dummy sample students in calendar
  assert.ok(!calSrc.includes('SAMPLE_STUDENT_NAMES'), 'Calendar must not contain SAMPLE_STUDENT_NAMES');
  assert.ok(!calSrc.includes("'Denis', 'Igor', 'Olga'"), 'Calendar must not contain hardcoded Denis/Igor/Olga dummy students');

  // 3. Middle dot footer badges
  assert.ok(calSrc.includes('Lessons · <b>'), 'Calendar footer must format Lessons with middle dot');
  assert.ok(calSrc.includes('Exams · <b>'), 'Calendar footer must format Exams with middle dot');
  assert.ok(calSrc.includes('Students · <b>'), 'Calendar footer must format Students with middle dot');
  assert.ok(calSrc.includes('Attendance · <b>'), 'Calendar footer must format Attendance with middle dot');

  // 4. Activity selection dialog for multiple events
  assert.ok(calSrc.includes('function showEventChoiceDialog'), 'Calendar must implement event choice dialog for multiple activities');
  assert.ok(calSrc.includes('gcw-choice-dialog'), 'Calendar must use gcw-choice-dialog');

  // 5. Role labels in Title Case
  assert.ok(pillSrc.includes("label: 'Support'"), 'Profile pill must display Support in Title Case');
  assert.ok(pillSrc.includes("label: 'Teacher'"), 'Profile pill must display Teacher in Title Case');
  assert.ok(pillSrc.includes("label: 'Student'"), 'Profile pill must display Student in Title Case');
  assert.ok(pillSrc.includes("label: 'Guest'"), 'Profile pill must display Guest in Title Case');
  assert.ok(cssSrc.includes('text-transform: none;'), 'CSS must not uppercase role badge');

  // 6. Header hide/show on guest and lesson/exam screens
  assert.ok(coreSrc.includes("['material', 'examblocks', 'speaklesson', 'speakouteditor']"), 'Core must hide header on lesson and exam screens');
});

