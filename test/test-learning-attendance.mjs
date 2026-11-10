import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AttendanceService} from '../src/learning-attendance.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {extractFunction} from './helpers/extract-function.mjs';

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

    // 200 GET calendar.ics download endpoint with 60m and 15m reminders
    const icsResp = await app.fetch(
      new Request('https://quiz.example/api/groups/calendar.ics?groupId=1&date=2026-11-05&time=18:30&duration=90&period=month&title=B1%20Group&material=Grammar%20Unit%201'),
      env,
      ctx
    );
    assert.equal(icsResp.status, 200);
    assert.ok(icsResp.headers.get('Content-Type').includes('text/calendar'));
    const icsText = await icsResp.text();
    assert.ok(icsText.includes('TRIGGER:-PT60M'), 'Must contain 60 min alarm');
    assert.ok(icsText.includes('TRIGGER:-PT15M'), 'Must contain 15 min alarm');
    assert.ok(icsText.includes('RRULE:FREQ=WEEKLY'), 'Must contain recurrence rule');
    assert.ok(icsText.includes('DTSTART;TZID=Europe/Minsk:20261105T183000'), 'Must contain start time in Minsk timezone');
    assert.ok(icsText.includes('DTEND;TZID=Europe/Minsk:20261105T200000'), 'Must contain end time reflecting 90 min duration');

    // 200 HEAD calendar.ics endpoint returns identical headers without body
    const headCalResp = await app.fetch(
      new Request('https://quiz.example/api/groups/calendar.ics?groupId=1&date=2026-11-05&time=18:30&duration=90&period=month&title=B1%20Group&material=Grammar%20Unit%201', {
        method: 'HEAD'
      }),
      env,
      ctx
    );
    assert.equal(headCalResp.status, 200);
    assert.ok(headCalResp.headers.get('Content-Type').includes('text/calendar'));
    assert.equal(headCalResp.headers.get('Content-Disposition'), 'inline; filename="lesson.ics"');
    assert.equal(headCalResp.headers.get('Cache-Control'), 'no-cache');
    const headCalText = await headCalResp.text();
    assert.equal(headCalText, '');

    // 200 GET payment-deadline.ics standard: 2d, 1d, 1h reminders
    const payIcsResp = await app.fetch(
      new Request('https://quiz.example/api/groups/payment-deadline.ics?groupId=1&date=2026-11-25&amount=240%20BYN&isEndMonth=false'),
      env,
      ctx
    );
    assert.equal(payIcsResp.status, 200);
    const payIcsText = await payIcsResp.text();
    assert.ok(payIcsText.includes('TRIGGER:-P2D'), 'Standard deadline must contain 2d reminder');
    assert.ok(payIcsText.includes('TRIGGER:-P1D'), 'Standard deadline must contain 1d reminder');
    assert.ok(payIcsText.includes('TRIGGER:-PT1H'), 'Standard deadline must contain 1h reminder');

    // 200 HEAD payment-deadline.ics returns identical headers without body (fixes Bug ID: 4543936f5f0a347326a7a8654e9f8c91)
    const headPayResp = await app.fetch(
      new Request('https://quiz.example/api/groups/payment-deadline.ics?groupId=24&date=2026-11-26&title=Tuition%20Payment%20Due%20%C2%B7%20C2%20Group&isEndMonth=false&requisites=Bank%20transfer', {
        method: 'HEAD'
      }),
      env,
      ctx
    );
    assert.equal(headPayResp.status, 200);
    assert.ok(headPayResp.headers.get('Content-Type').includes('text/calendar'));
    assert.equal(headPayResp.headers.get('Content-Disposition'), 'inline; filename="payment-deadline.ics"');
    assert.equal(headPayResp.headers.get('Cache-Control'), 'no-cache');
    const headPayText = await headPayResp.text();
    assert.equal(headPayText, '');

    // 200 GET payment-deadline.ics end of month: only same-day alert (no 2d or 1d)
    const endMonthResp = await app.fetch(
      new Request('https://quiz.example/api/groups/payment-deadline.ics?groupId=1&date=2026-12-01&amount=240%20BYN&isEndMonth=true'),
      env,
      ctx
    );
    assert.equal(endMonthResp.status, 200);
    const endMonthText = await endMonthResp.text();
    assert.ok(!endMonthText.includes('TRIGGER:-P2D'), 'End of month deadline must NOT contain 2d reminder');
    assert.ok(!endMonthText.includes('TRIGGER:-P1D'), 'End of month deadline must NOT contain 1d reminder');
    assert.ok(endMonthText.includes('TRIGGER:-PT1H'), 'End of month deadline must contain same-day 1h reminder');

    // 400 validation on schedule.ics missing parameters
    const noGroupSched = await app.fetch(new Request('https://quiz.example/api/groups/schedule.ics?month=2026-11'), env, ctx);
    assert.equal(noGroupSched.status, 400);
    const noMonthSched = await app.fetch(new Request('https://quiz.example/api/groups/schedule.ics?groupId=1'), env, ctx);
    assert.equal(noMonthSched.status, 400);

    // 200 GET schedule.ics with lessons and reminders (fixes Bug ID: 69228c43e763c56e997ebf21c168ab99)
    await f.db.atomic([{
      sql: "INSERT OR REPLACE INTO catalog_documents (namespace, key, value_json) VALUES ('group-attendance', ?, ?)",
      args: [
        {type: 'text', value: '1:2026-11'},
        {type: 'text', value: JSON.stringify({
          lessonDates: ['2026-11-04', '2026-11-11'],
          scheduleData: {
            '2026-11-04': {startTime: '19:00', durationMinutes: 90}
          }
        })}
      ]
    }]);

    const schedResp = await app.fetch(
      new Request('https://quiz.example/api/groups/schedule.ics?groupId=1&month=2026-11&title=B1%20Group'),
      env,
      ctx
    );
    assert.equal(schedResp.status, 200);
    assert.ok(schedResp.headers.get('Content-Type').includes('text/calendar'));
    assert.equal(schedResp.headers.get('Content-Disposition'), 'attachment; filename="group-1-schedule-2026-11.ics"');
    assert.equal(schedResp.headers.get('Cache-Control'), 'no-cache');
    const schedText = await schedResp.text();
    assert.ok(schedText.includes('PRODID:-//EnglishQuiz//GroupSchedule//EN'));
    assert.ok(schedText.includes('DTSTART;TZID=Europe/Minsk:20261104T190000'));
    assert.ok(schedText.includes('DTEND;TZID=Europe/Minsk:20261104T203000'));
    assert.ok(schedText.includes('SUMMARY:English Lesson · B1 Group'));
    assert.ok(schedText.includes('TRIGGER:-PT60M'));
    assert.ok(schedText.includes('TRIGGER:-PT15M'));
    assert.ok(schedText.includes('DTSTART;TZID=Europe/Minsk:20261111T183000'));
    assert.ok(schedText.includes('DTEND;TZID=Europe/Minsk:20261111T193000'));

    // 200 HEAD schedule.ics returns identical headers with empty body
    const headSchedResp = await app.fetch(
      new Request('https://quiz.example/api/groups/schedule.ics?groupId=1&month=2026-11&title=B1%20Group', {
        method: 'HEAD'
      }),
      env,
      ctx
    );
    assert.equal(headSchedResp.status, 200);
    assert.ok(headSchedResp.headers.get('Content-Type').includes('text/calendar'));
    assert.equal(headSchedResp.headers.get('Content-Disposition'), 'attachment; filename="group-1-schedule-2026-11.ics"');
    assert.equal(headSchedResp.headers.get('Cache-Control'), 'no-cache');
    const headSchedText = await headSchedResp.text();
    assert.equal(headSchedText, '');

    // 200 GET schedule.ics with inline=1 returns inline Content-Disposition
    const inlineSchedResp = await app.fetch(
      new Request('https://quiz.example/api/groups/schedule.ics?groupId=1&month=2026-11&title=B1%20Group&inline=1'),
      env,
      ctx
    );
    assert.equal(inlineSchedResp.status, 200);
    assert.equal(inlineSchedResp.headers.get('Content-Disposition'), 'inline; filename="group-1-schedule-2026-11.ics"');

    // 200 GET schedule.ics with empty schedule returns fallback month event
    const emptySchedResp = await app.fetch(
      new Request('https://quiz.example/api/groups/schedule.ics?groupId=1&month=2026-12&title=B1%20Group'),
      env,
      ctx
    );
    assert.equal(emptySchedResp.status, 200);
    const emptySchedText = await emptySchedResp.text();
    assert.ok(emptySchedText.includes('DTSTART;VALUE=DATE:20261201'));
    assert.ok(emptySchedText.includes('SUMMARY:Group Schedule · B1 Group'));

    // 200 POST /api/groups/absence allows student to record absence and optional reason
    identity = student;
    const absResp = await app.fetch(
      new Request('https://quiz.example/api/groups/absence', {
        method: 'POST',
        headers: {Origin: 'https://quiz.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({groupId: 1, date: '2026-11-20', reason: 'Doctor appointment'})
      }),
      env,
      ctx
    );
    assert.equal(absResp.status, 200);
    const absJson = await absResp.json();
    assert.equal(absJson.success, true);
    assert.equal(absJson.date, '2026-11-20');

    identity = teacher1;
    const checkDoc = await get('?groupId=1&month=2026-11');
    assert.equal(checkDoc.status, 200);
    const checkJson = await checkDoc.json();
    assert.equal(checkJson.attendance[String(student.id)]['2026-11-20'], 'absent');
    assert.equal(checkJson.absenceReasons[String(student.id)]['2026-11-20'], 'Doctor appointment');
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
  assert.ok(calSrc.includes('Scheduled lessons · <b>'), 'Calendar footer must format Scheduled lessons with middle dot');
  assert.ok(calSrc.includes('Scheduled exams · <b>'), 'Calendar footer must format Scheduled exams with middle dot');
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

  // 7. Context menu and lesson scheduler contracts
  assert.ok(calSrc.includes('function openCalendarContextMenu'), 'Calendar must implement date context menu');
  assert.ok(calSrc.includes('function showLessonSchedulerModal'), 'Calendar must implement lesson scheduler modal');
  assert.ok(calSrc.includes('function postLessonAlertToChat'), 'Calendar must implement chat alert posting for scheduled lessons');
  assert.ok(calSrc.includes('TRIGGER:-PT60M') || calSrc.includes('calendar.ics'), 'Calendar must reference .ics calendar triggers');

  // 8. Payment deadline, tuition calculation, and student confirmation contracts
  assert.ok(calSrc.includes('function calculateStudentTuition'), 'Calendar must implement attendance-based tuition calculation');
  assert.ok(calSrc.includes('function postPaymentInvoiceToChat'), 'Calendar must implement invoice chat dispatch');
  assert.ok(calSrc.includes('function showPaymentDeadlineModal'), 'Calendar must implement payment deadline modal');
  assert.ok(calSrc.includes('function showStudentPaymentDialog'), 'Calendar must implement student payment dialog with I have paid');

  // 9. Student absence reporting contracts
  assert.ok(calSrc.includes('function showStudentLessonDialog'), 'Calendar must implement student lesson dialog');
  assert.ok(calSrc.includes('/api/groups/absence'), 'Calendar must call absence endpoint');

  // 10. Reliable report to chat contracts
  assert.ok(calSrc.includes('await window.ensureMessages()'), 'Calendar must ensure messages before dispatching report');
  assert.ok(calSrc.includes('Number(groupId)'), 'Calendar must normalize groupId as Number');

  const durableSrc = await fs.readFile(path.resolve('src/chat-durable.mjs'), 'utf8');
  assert.ok(durableSrc.includes('Number(g.id)===Number(body.groupId)'), 'Chat durable must use numeric comparison for groupId');

  // 11. In-class mode and audio notification filtering contracts
  assert.ok(pillSrc.includes('window.getUserStatus = getUserStatus'), 'Profile pill must export getUserStatus globally');
  assert.ok(calSrc.includes('window.isCurrentTimeInScheduledLesson'), 'Calendar must expose scheduled lesson window helper');

  const chatRoomsSrc = await fs.readFile(path.resolve('production/chat/30-rooms.js'), 'utf8');
  assert.ok(chatRoomsSrc.includes("userStatus === 'in_class' && event.message?.category !== 'learning'"), 'Chat rooms must mute non-learning message sounds when in class');
});

test('admin profile label follows group assignment', () => {
  const pill = readFileSync(new URL('../client/20a-user-profile-pill.js', import.meta.url), 'utf8');
  const cards = readFileSync(new URL('../client/03a-cards.js', import.meta.url), 'utf8');
  const scope = { groupDirectory: { assignments: [{ groupId: 24, teacherIds: [10] }] }, adminTeacherAssignments: [], classGroups: [] };
  runInNewContext(extractFunction(pill, 'profileAssignedTeacher') + '\n' + extractFunction(pill, 'profileTeacherRows') + '\n' + extractFunction(pill, 'getUserRoleInfo'), scope);
  assert.equal(scope.getUserRoleInfo({ id: 10, role: 'ADMIN', login: 'yester' }).label, 'Teacher');
  assert.equal(scope.getUserRoleInfo({ id: 11, role: 'ADMIN', login: 'teacher_other' }).label, 'Support');
  assert.equal(scope.getUserRoleInfo({ id: 12, role: 'USER', login: 'teacher_student' }).label, 'Student');
  assert.equal(scope.getUserRoleInfo({ id: 13, role: 'DEVELOPER', login: 'teacher_dev' }).label, 'Support');
  assert.match(cards, /authUser\.role === "ADMIN" \|\| authUser\.role === "DEVELOPER"/);
});

