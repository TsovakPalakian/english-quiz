import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {scenarioSubtests} from './helpers/scenario-subtests.mjs';

await scenarioSubtests('student-lessons-ui', async function*() {
  yield '00. Browser and test server setup';

  const require = createRequire(import.meta.url);
  const {chromium} = require(resolveTestDependency('playwright'));
  const root = resolve('rollback/production-assets');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(root + '/') || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(readFileSync(file));
  });

  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;

  let browser;
  try {
    browser = await launchChromium(chromium);

    yield '01. Student view verification for lessons page';
    {
      const page = await browser.newPage({viewport: {width: 1440, height: 900}});
      const studentUser = {id: '1'.repeat(32), login: 'student1', name: 'Student One', role: 'USER'};
      const materials = [
        {
          id: 101,
          title: 'Lesson With Vocab',
          date: '2026-11-01',
          published: true,
          blocks: [
            {type: 'wordcard', word: 'apple'},
            {type: 'wordcard', word: 'banana'}
          ]
        },
        {
          id: 102,
          title: 'Lesson Empty Subtitle',
          date: '2026-10-25',
          published: true,
          blocks: [{type: 'text', html: '<p>Reading text</p>'}]
        }
      ];

      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data = {};
        if (path === '/api/database-context') data = {provider: 'd1', revision: 1, scope: 'site'};
        if (path === '/api/me' || path === '/api/me/account') data = {user: studentUser};
        if (path === '/api/me/state') data = {bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: {lessons: 2}, stageActivity: {}};
        if (path === '/api/me/themes') data = {theme: 'light', themes: [], revision: 0, customRevision: 0};
        if (path === '/api/groups') data = {groups: [{id: 77, title: 'B1 Group', date: '2026-10-10', revision: 1, studentCount: 1, lessonIds: [101, 102]}]};
        if (path === '/api/lessons') data = {materials};
        if (path === '/api/exams') data = {exams: []};
        if (path === '/api/exams/work') data = {work: []};
        await route.fulfill({contentType: 'application/json', body: JSON.stringify(data)});
      });

      await page.goto('http://127.0.0.1:' + port);
      await page.waitForFunction(() => typeof accountReady !== 'undefined' && accountReady && typeof placeBoot !== 'undefined' && placeBoot);
      await page.evaluate(() => { classGroupId = 77; show('days'); });
      await page.locator('#days.on').waitFor();

      const subText = await page.$eval('#lmDaysSub', el => el.textContent.trim());
      assert.equal(subText, 'Your curriculum', 'Student sub header should read "Your curriculum"');

      const groupNameText = await page.$eval('#lmGroupName', el => el.textContent.trim());
      assert.ok(!groupNameText.endsWith('·'), 'Group name should not end with trailing separator: ' + groupNameText);
      assert.equal(groupNameText, 'B1 Group', 'Group name for student should be clean');

      const crumbItems = await page.$$eval('#days .page-path li', lis => lis.map(li => ({
        text: li.textContent.trim(),
        isCurrent: Boolean(li.querySelector('[aria-current="page"]')),
        isButton: Boolean(li.querySelector('button'))
      })));

      assert.equal(crumbItems.length, 2, 'Student breadcrumbs should have 2 items: group and lessons');
      assert.equal(crumbItems[0].text, 'B1 Group');
      assert.ok(crumbItems[0].isButton, 'First breadcrumb should be interactive');
      assert.equal(crumbItems[1].text, 'Lessons');
      assert.ok(crumbItems[1].isCurrent, 'Final breadcrumb item should have aria-current="page"');
      assert.ok(!crumbItems[1].isButton, 'Final breadcrumb item should NOT be a button');

      const badges = await page.$$eval('#lmDayList .day .about', els => els.map(el => ({
        text: el.textContent.trim(),
        hasActive: el.classList.contains('saas-badge-active'),
        hasMuted: el.classList.contains('saas-badge-muted'),
        hasInfo: el.classList.contains('saas-badge-info')
      })));

      assert.ok(badges.every(b => ['Not started', 'In progress', 'Completed'].includes(b.text)), 'Student badges should be progress states');

      const cardMinHeight = await page.$eval('#lmDayList .day', el => window.getComputedStyle(el).minHeight);
      assert.notEqual(cardMinHeight, '168px', 'Card min-height must not be locked to 168px');

      await page.close();
    }

    yield '02. Teacher view verification for lessons page';
    {
      const page = await browser.newPage({viewport: {width: 1440, height: 900}});
      const teacherUser = {id: '2'.repeat(32), login: 'teacher1', name: 'Teacher One', role: 'ADMIN'};

      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data = {};
        if (path === '/api/database-context') data = {provider: 'd1', revision: 1, scope: 'site'};
        if (path === '/api/me' || path === '/api/me/account') data = {user: teacherUser};
        if (path === '/api/me/state') data = {bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: {lessons: 1}, stageActivity: {}};
        if (path === '/api/me/themes') data = {theme: 'light', themes: [], revision: 0, customRevision: 0};
        if (path === '/api/groups') data = {groups: [{id: 77, title: 'B1 Group', date: '2026-10-10', revision: 1, studentCount: 5, lessonIds: [101]}]};
        if (path === '/api/lessons') data = {materials: [{id: 101, title: 'Teacher Lesson', date: '2026-11-01', published: true, blocks: []}]};
        if (path === '/api/exams') data = {exams: []};
        if (path === '/api/exams/work') data = {work: []};
        if (path === '/api/admin/users') data = {users: [teacherUser]};
        if (path === '/api/accounts/group-teachers') data = {assignments: [{groupId: 77, teacherIds: [teacherUser.id]}]};
        await route.fulfill({contentType: 'application/json', body: JSON.stringify(data)});
      });

      await page.goto('http://127.0.0.1:' + port);
      await page.waitForFunction(() => typeof accountReady !== 'undefined' && accountReady && typeof placeBoot !== 'undefined' && placeBoot);
      await page.evaluate(() => { classGroupId = 77; show('days'); });
      await page.locator('#days.on').waitFor();

      const subText = await page.$eval('#lmDaysSub', el => el.textContent.trim());
      assert.equal(subText, 'In date order. One date can hold as many lessons as you add.', 'Teacher sub header should retain creator copy');

      const badgeText = await page.$eval('#lmDayList .day .about', el => el.textContent.trim());
      assert.equal(badgeText, 'Published lesson', 'Teacher sees publication status');

      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
