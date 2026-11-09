import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {GroupService} from '../src/learning-groups.mjs';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {launchChromium, resolveTestDependency} from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));

const teacher = {id: 'teacher-1', role: 'ADMIN'};
const student = {id: 'student-1', role: 'USER'};
const developer = {id: 'developer-1', role: 'DEVELOPER'};

function createMemoryCurriculumDb() {
  const sqlite = new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  const args = c => c.args.map(a => a.type === 'null' ? null : ['integer', 'float'].includes(a.type) ? Number(a.value) : a.value);
  const db = {
    read: async (q, a = []) => sqlite.prepare(q).all(...a),
    atomic: async commands => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const c of commands) {
          const statement = sqlite.prepare(c.sql);
          if (/^\s*SELECT\b/i.test(c.sql)) results.push({rows: statement.all(...args(c)).map(row => Object.values(row).map(value => ({value})))});
          else { statement.run(...args(c)); results.push({rows: []}); }
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  return {sqlite, db};
}

test('GroupService excludes hidden students from studentCount and members for teachers, allows for developer (accounts D1 model)', async () => {
  const {sqlite, db} = createMemoryCurriculumDb();
  const accountsSql = new DatabaseSync(':memory:');
  accountsSql.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      hidden INTEGER NOT NULL DEFAULT 0,
      is_personal_data_revoked INTEGER NOT NULL DEFAULT 0
    );
    -- 3 regular active students
    INSERT INTO users(id, login, role, active, hidden) VALUES
      ('u1', 'student_1', 'USER', 1, 0),
      ('u2', 'student_2', 'USER', 1, 0),
      ('u3', 'student_3', 'USER', 1, 0),
    -- 3 hidden students
      ('u4_hidden', 'student_4', 'USER', 1, 1),
      ('u5_hidden', 'student_5', 'USER', 1, 1),
      ('u6_hidden', 'student_6', 'USER', 1, 1);
  `);

  const accounts = {
    prepare(query) {
      let bound = [];
      const stmt = {
        bind(...args) { bound = args; return stmt; },
        async all() {
          return { results: accountsSql.prepare(query).all(...bound) };
        },
        async first() {
          return accountsSql.prepare(query).get(...bound);
        }
      };
      return stmt;
    }
  };

  const service = new GroupService(db, accounts);
  await service.ensure();

  sqlite.exec(`
    INSERT OR IGNORE INTO class_group_setup(key) VALUES('levels-v1'),('level-names-v2');
    DELETE FROM class_groups;
    INSERT INTO class_groups(id, title, lesson_date, revision) VALUES(501, 'B1 Group', '2026-10-09', 1);
    INSERT INTO class_group_students(account_id, group_id, assigned_by) VALUES
      ('u1', 501, 'teacher-1'),
      ('u2', 501, 'teacher-1'),
      ('u3', 501, 'teacher-1'),
      ('u4_hidden', 501, 'teacher-1'),
      ('u5_hidden', 501, 'teacher-1'),
      ('u6_hidden', 501, 'teacher-1');
    INSERT OR REPLACE INTO catalog_documents(namespace, key, value_json) VALUES
      ('accounts-group-teachers', '501', '{"revision":1,"teacherIds":["teacher-1"]}');
  `);

  try {
    // 1. Teacher views group list -> only 3 students counted
    const teacherGroups = await service.list(teacher);
    assert.equal(teacherGroups.length, 1);
    assert.equal(teacherGroups[0].studentCount, 3, 'Teacher must see only 3 active non-hidden students');

    // 2. Student views group list -> student u1 is enrolled, sees only 3 students counted
    const studentUser = {id: 'u1', role: 'USER'};
    const studentGroups = await service.list(studentUser);
    assert.equal(studentGroups.length, 1);
    assert.equal(studentGroups[0].studentCount, 3, 'Student must see only 3 active non-hidden students');

    // 3. Developer views group list -> sees all 6 students
    const devGroups = await service.list(developer);
    assert.equal(devGroups.length, 1);
    assert.equal(devGroups[0].studentCount, 6, 'Developer must see all 6 students including hidden');

    // 4. Teacher members list -> only u1, u2, u3 returned
    const teacherMembers = await service.members(teacher);
    assert.deepEqual(
      teacherMembers.map(m => m.accountId).sort(),
      ['u1', 'u2', 'u3'],
      'Teacher members list must strictly exclude hidden users'
    );

    // 5. Developer members list -> all 6 returned
    const devMembers = await service.members(developer);
    assert.deepEqual(
      devMembers.map(m => m.accountId).sort(),
      ['u1', 'u2', 'u3', 'u4_hidden', 'u5_hidden', 'u6_hidden'],
      'Developer members list must include all students'
    );
  } finally {
    sqlite.close();
    accountsSql.close();
  }
});

test('GroupService with local SQLite users table respects hidden flag', async () => {
  const {sqlite, db} = createMemoryCurriculumDb();
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      hidden INTEGER NOT NULL DEFAULT 0,
      is_personal_data_revoked INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO users(id, role, active, hidden) VALUES
      ('u1', 'USER', 1, 0),
      ('u2', 'USER', 1, 0),
      ('u3', 'USER', 1, 0),
      ('u4_hidden', 'USER', 1, 1),
      ('u5_hidden', 'USER', 1, 1),
      ('u6_hidden', 'USER', 1, 1);
  `);

  const service = new GroupService(db);
  await service.ensure();

  sqlite.exec(`
    INSERT OR IGNORE INTO class_group_setup(key) VALUES('levels-v1'),('level-names-v2');
    DELETE FROM class_groups;
    INSERT INTO class_groups(id, title, lesson_date, revision) VALUES(501, 'B1 Group', '2026-10-09', 1);
    INSERT INTO class_group_students(account_id, group_id, assigned_by) VALUES
      ('u1', 501, 'teacher-1'),
      ('u2', 501, 'teacher-1'),
      ('u3', 501, 'teacher-1'),
      ('u4_hidden', 501, 'teacher-1'),
      ('u5_hidden', 501, 'teacher-1'),
      ('u6_hidden', 501, 'teacher-1');
    INSERT OR REPLACE INTO catalog_documents(namespace, key, value_json) VALUES
      ('accounts-group-teachers', '501', '{"revision":1,"teacherIds":["teacher-1"]}');
  `);

  try {
    const teacherGroups = await service.list(teacher);
    assert.equal(teacherGroups[0].studentCount, 3);

    const devGroups = await service.list(developer);
    assert.equal(devGroups[0].studentCount, 6);

    const teacherMembers = await service.members(teacher);
    assert.deepEqual(teacherMembers.map(m => m.accountId).sort(), ['u1', 'u2', 'u3']);

    const devMembers = await service.members(developer);
    assert.deepEqual(devMembers.map(m => m.accountId).sort(), ['u1', 'u2', 'u3', 'u4_hidden', 'u5_hidden', 'u6_hidden']);
  } finally {
    sqlite.close();
  }
});

test('Visual UI: Teacher sees Students · 3 while Developer sees Students · 6 on B1 Group card', async () => {
  const root = resolve('rollback/production-assets');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(root + '/') || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'
    });
    res.end(readFileSync(file));
  });

  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  const browser = await launchChromium(chromium);

  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    let currentRole = 'ADMIN';

    const mockGroup = {
      id: 501,
      title: 'B1 Group',
      date: '2026-10-09',
      studentCount: 3,
      lessonIds: Array.from({length: 21}, (_, i) => 100 + i),
      revision: 1
    };

    const mockAdminUsers = [
      {id: 't1', login: 'teacher1', name: 'Teacher One', role: 'ADMIN', active: 1, hidden: 0},
      {id: 'u1', login: 'student1', name: 'Alice', role: 'USER', active: 1, hidden: 0},
      {id: 'u2', login: 'student2', name: 'Bob', role: 'USER', active: 1, hidden: 0},
      {id: 'u3', login: 'student3', name: 'Charlie', role: 'USER', active: 1, hidden: 0}
    ];

    const mockMembers = [
      {accountId: 'u1', groupId: 501},
      {accountId: 'u2', groupId: 501},
      {accountId: 'u3', groupId: 501}
    ];

    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let data = {};
      if (path === '/api/database-context') data = {provider: 'd1', revision: 0, scope: 'site'};
      if (path === '/api/me' || path === '/api/me/account') {
        data = {user: {id: 't1', login: 'teacher1', name: 'Teacher One', role: currentRole}};
      }
      if (path === '/api/me/state') data = {bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: {lessons: 21}, stageActivity: {}};
      if (path === '/api/me/themes') data = {theme: 'almond', themes: [], revision: 0, customRevision: 0};
      if (path === '/api/groups') {
        data = {groups: [{...mockGroup, studentCount: currentRole === 'DEVELOPER' ? 6 : 3}]};
      }
      if (path === '/api/groups/members') data = {members: mockMembers};
      if (path === '/api/accounts/group-teachers') data = {assignments: [{groupId: 501, teacherIds: ['t1']}]};
      if (path === '/api/admin/users') data = {users: mockAdminUsers};
      if (path === '/api/lessons') data = {materials: mockGroup.lessonIds.map(id => ({id, title: 'Lesson ' + id, date: '2026-10-09', published: true, blocks: []}))};
      if (path === '/api/exams') data = {exams: []};
      if (path === '/api/archive') data = {archived: true, revision: 1};
      if (path === '/api/messages') data = {rooms: [], groups: [], contacts: [], unread: {}, total: 0};
      if (path.includes('catalogs')) data = {documents: {}, cards: [], next: null};
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)});
    });

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => typeof accountReady !== 'undefined' && accountReady && typeof placeBoot !== 'undefined' && placeBoot);

    // 1. Check as Teacher
    await page.evaluate(async () => {
      authUser.role = 'ADMIN';
      groupViewLevel = 'B1';
      await groupPull(true);
      window.enquizVisit('groups');
    });

    const b1Card = page.locator('#groupList .day-row:has-text("B1 Group")');
    await b1Card.waitFor({timeout: 5000});

    const cardTextTeacher = (await b1Card.innerText()).replace(/\s+/g, ' ');
    assert.ok(cardTextTeacher.includes('Students · 3'), `Teacher must see Students · 3, saw: ${cardTextTeacher}`);
    assert.ok(!cardTextTeacher.includes('Students · 6'), `Teacher must NOT see Students · 6, saw: ${cardTextTeacher}`);
    assert.ok(cardTextTeacher.includes('Lessons · 21'), `Teacher must see Lessons · 21, saw: ${cardTextTeacher}`);

    // Take verified screenshot matching approved design when local artifact directory exists
    const dir = '/Users/tsovakpalakian/.gemini/antigravity/brain/fe4597bd-fc87-4746-ab6c-b3c6050eb075';
    if (existsSync(dir)) {
      await b1Card.screenshot({path: `${dir}/screenshot-2-proposed-teacher-group-card.png`});
    }

    // 2. Check as Developer
    currentRole = 'DEVELOPER';
    await page.evaluate(async () => {
      authUser.role = 'DEVELOPER';
      groupViewLevel = 'B1';
      await groupPull(true);
      if (typeof paintGroups === 'function') paintGroups();
    });

    await page.waitForTimeout(100);
    const cardTextDev = (await b1Card.innerText()).replace(/\s+/g, ' ');
    assert.ok(cardTextDev.includes('Students · 6'), `Developer must see Students · 6, saw: ${cardTextDev}`);

  } finally {
    await browser.close();
    await new Promise(res => server.close(res));
  }
});
