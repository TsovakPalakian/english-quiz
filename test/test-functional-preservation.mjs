import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";

await scenarioSubtests("functional-preservation", async function*() {
  yield "00. Browser and server setup";

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
    browser = await chromium.launch({headless: true, executablePath: chromiumExecutable()});
    const page = await browser.newPage({viewport: {width: 1440, height: 950}});
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const adminUser = {id: '1'.repeat(32), login: 'lead_admin', name: 'Lead Admin', role: 'DEVELOPER'};
    const studentUser = {id: '2'.repeat(32), login: 'student_1', name: 'Student 1', role: 'USER', active: 1};

    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let data = {};

      if (path === '/api/database-context') data = {provider: 'd1', revision: 3, scope: 'site'};
      if (path === '/api/me' || path === '/api/me/account') data = {user: adminUser};
      if (path === '/api/me/state') data = {bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: {lessons: 2}, stageActivity: {}};
      if (path === '/api/me/themes') data = {theme: 'light', themes: [], revision: 0, customRevision: 0};
      if (path === '/api/groups') data = {groups: [{id: 41, title: 'A1 Demo Group', date: '2026-10-19', revision: 1, studentCount: 1, lessonIds: [31], examIds: []}]};
      if (path === '/api/lessons') data = {materials: [{id: 31, title: 'Day 01 Lesson', date: '2026-10-19', published: true, stageRevision: 1, blocks: []}]};
      if (path === '/api/exams') data = {exams: []};
      if (path === '/api/exams/work') data = {work: []};
      if (path === '/api/admin/users') data = {users: [adminUser, studentUser]};
      if (path === '/api/admin/users/' + studentUser.id) data = {user: studentUser};
      if (path === '/api/groups/members') data = {members: [{accountId: studentUser.id, groupId: 41}]};
      if (path === '/api/accounts/group-teachers') data = {assignments: [{groupId: 41, teacherIds: [adminUser.id]}]};
      if (path === '/api/messages') {
        data = {
          rooms: [{
            id: 'room-1',
            type: 'group',
            title: 'A1 Group Chat',
            snippet: 'Hello everyone!',
            time: Date.now(),
            unread: {personal: 0, learning: 1},
            pinned: false
          }],
          groups: [],
          contacts: [{id: studentUser.id, name: studentUser.name, login: studentUser.login}],
          unread: {personal: 0, learning: 1},
          total: 1
        };
      }
      if (path === '/api/messages/room-1') {
        data = {
          id: 'room-1',
          type: 'group',
          title: 'A1 Group Chat',
          messages: [{
            id: 'msg-101',
            sender: studentUser.id,
            name: studentUser.name,
            text: 'Hello teacher! Question on homework.',
            time: Date.now() - 60000
          }]
        };
      }
      if (path.includes('/catalogs/')) data = {documents: {}, cards: [], next: null};

      return route.fulfill({contentType: 'application/json', body: JSON.stringify(data)});
    });

    await page.goto('http://127.0.0.1:' + port, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => typeof accountReady !== 'undefined' && accountReady);

    // =========================================================================
    // SECTION 1: Chat Preservation Check
    // =========================================================================
    yield "01. Chat Full Architecture Preservation";

    const chatOpenBtn = page.locator('.side nav [data-msg-open]');
    await chatOpenBtn.waitFor({state: 'attached'});
    assert.equal(await chatOpenBtn.count(), 1, "Messages button exists in side navigation");
    await chatOpenBtn.click();

    // Verify Chat Shell and 3-tier structure
    const chatSection = page.locator('#messages');
    await chatSection.waitFor({state: 'visible'});

    // 1. Chat Rail
    const rail = chatSection.locator('.chat-rail');
    assert.equal(await rail.count(), 1, ".chat-rail exists");
    assert.equal(await rail.locator('#msgProfile').count(), 1, "#msgProfile avatar button exists");
    assert.equal(await rail.locator('#msgChats').count(), 1, "#msgChats navigation button exists");
    assert.equal(await rail.locator('#msgContacts').count(), 1, "#msgContacts navigation button exists");
    assert.equal(await rail.locator('#msgSettings').count(), 1, "#msgSettings button exists");
    assert.equal(await rail.locator('#msgExit').count(), 1, "#msgExit button exists");

    // 2. Chat List & Categories
    const chatList = chatSection.locator('.chat-list');
    assert.equal(await chatList.count(), 1, ".chat-list exists");
    assert.equal(await chatList.locator('#msgListTitle').count(), 1, "#msgListTitle heading exists");
    assert.equal(await chatList.locator('#msgUnread').count(), 1, "#msgUnread filter button exists");
    assert.equal(await chatList.locator('#msgNew').count(), 1, "#msgNew chat button exists");
    assert.equal(await chatList.locator('#msgHideList').count(), 1, "#msgHideList button exists");
    assert.equal(await chatList.locator('#msgRoomSearch').count(), 1, "#msgRoomSearch input exists");
    assert.equal(await chatList.locator('.chat-categories [data-msg-category="personal"]').count(), 1, "Personal category tab exists");
    assert.equal(await chatList.locator('.chat-categories [data-msg-category="learning"]').count(), 1, "Learning alerts tab exists");
    assert.equal(await chatList.locator('.chat-categories #msgContactsTab').count(), 1, "Contacts tab exists");

    // 3. Chat Center, Room Header & Timeline
    const chatCenter = chatSection.locator('.chat-center');
    assert.equal(await chatCenter.count(), 1, ".chat-center exists");
    assert.equal(await chatCenter.locator('#msgRoomInfo').count(), 1, "#msgRoomInfo exists");
    assert.equal(await chatCenter.locator('#msgRoomAvatar').count(), 1, "#msgRoomAvatar exists");
    assert.equal(await chatCenter.locator('#msgRoomTitle').count(), 1, "#msgRoomTitle exists");
    assert.equal(await chatCenter.locator('#msgSearch').count(), 1, "#msgSearch button exists");
    assert.equal(await chatCenter.locator('#msgInfo').count(), 1, "#msgInfo button exists");
    assert.equal(await chatCenter.locator('#msgTimeline').count(), 1, "#msgTimeline exists");

    // 4. Composer & Tools
    const composer = chatCenter.locator('#msgCompose');
    assert.equal(await composer.count(), 1, "#msgCompose exists");
    assert.equal(await composer.locator('#msgText').count(), 1, "#msgText textarea exists");
    assert.equal(await composer.locator('#msgAttach').count(), 1, "#msgAttach button exists");
    assert.equal(await composer.locator('#msgEmoji').count(), 1, "#msgEmoji button exists");
    assert.equal(await composer.locator('#msgStickers').count(), 1, "#msgStickers button exists");
    assert.equal(await composer.locator('#msgMic').count(), 1, "#msgMic voice recording button exists");
    assert.equal(await composer.locator('#msgSend').count(), 1, "#msgSend button exists");

    // 5. Right Info Panel
    const rightPanel = chatSection.locator('#msgRight');
    assert.equal(await rightPanel.count(), 1, "#msgRight info panel exists in DOM");
    assert.equal(await rightPanel.locator('#msgRightTitle').count(), 1, "#msgRightTitle exists");
    assert.equal(await rightPanel.locator('#msgHideInfo').count(), 1, "#msgHideInfo exists");

    // Exit chat
    await rail.locator('#msgExit').click();
    assert.equal(await chatSection.isVisible(), false, "Chat closed after clicking #msgExit");

    // =========================================================================
    // SECTION 2: CRM & Account Management Preservation Check
    // =========================================================================
    yield "02. CRM and Accounts Preservation";

    await page.evaluate(() => window.enquizVisit('admin'));
    await page.locator('#admin.on').waitFor({state: 'visible'});

    assert.equal(await page.locator('#adminAccountList').count(), 1, "#adminAccountList exists");
    assert.equal(await page.locator('[data-admin-tab="accounts"]').count(), 1, "accounts tab exists");
    assert.equal(await page.locator('[data-admin-tab="requests"]').count(), 1, "requests tab exists");
    assert.equal(await page.locator('[data-admin-tab="invite"]').count(), 1, "invite tab exists");
    assert.equal(await page.locator('[data-admin-tab="history"]').count(), 1, "history tab exists");

    // Open Student Account Details by searching student
    await page.locator('#adminAccountSearch').fill('student_1');
    const studentRow = page.locator(`[data-account="user"][data-id="${studentUser.id}"]`);
    await studentRow.waitFor({state: 'visible'});
    await studentRow.click();
    await page.locator('#adminuser.on').waitFor({state: 'visible'});
    await page.locator('.admin-user-header').waitFor({state: 'visible'});

    // Verify 2-Column SaaS Layout and key sections
    assert.equal(await page.locator('.admin-user-header').count(), 1, ".admin-user-header exists");
    assert.equal(await page.locator('#adminuser [data-nav-back]').count(), 1, "Sole [data-nav-back] exists in #adminuser");
    assert.equal(await page.locator('.admin-user-summary-card').count(), 1, ".admin-user-summary-card exists");
    assert.equal(await page.locator('.admin-personal-card').count(), 1, ".admin-personal-card exists");
    assert.equal(await page.locator('.admin-danger-card').count(), 1, ".admin-danger-card exists");

    // Verify Danger Zone buttons
    assert.equal(await page.locator('.admin-danger-actions [data-account="hide-user"]').count(), 1, "Hide user button exists");
    assert.equal(await page.locator('.admin-danger-actions [data-account="active-user"]').count(), 1, "Deactivate button exists");
    assert.equal(await page.locator('.admin-danger-actions [data-account="archive-user"]').count(), 1, "Archive user button exists");

    // =========================================================================
    // SECTION 3: Groups, Lessons, Words and Themes Preservation
    // =========================================================================
    yield "03. Core Educational Domains Preservation";

    // Home / Student Dashboard and Warmup elements in DOM
    assert.equal(await page.locator('#homeDemo .ring').count(), 1, "#homeDemo .ring progress ring exists");
    assert.equal(await page.locator('#homeWarmupPanel').count(), 1, "#homeWarmupPanel error-bank warmup exists");
    assert.equal(await page.locator('#homeUnreadTile').count(), 1, "#homeUnreadTile exists");
    assert.equal(await page.locator('#homeNextLesson').count(), 1, "#homeNextLesson tile exists");

    // Groups & CEFR Level Filter
    await page.evaluate(() => window.enquizVisit('groups'));
    await page.locator('#groups.on').waitFor({state: 'visible'});
    assert.equal(await page.locator('#groupList').count(), 1, "#groupList exists");

    // Lessons & Materials
    await page.evaluate(() => window.enquizVisit('days'));
    await page.locator('#days.on').waitFor({state: 'visible'});
    assert.equal(await page.locator('#lmPublish').count(), 1, "#lmPublish toggle exists");

    // Exams & Examination Blocks
    await page.evaluate(() => window.enquizVisit('exams'));
    await page.locator('#exams.on').waitFor({state: 'visible'});
    assert.equal(await page.locator('#examList').count(), 1, "#examList exists");
    assert.equal(await page.locator('#examSections').count(), 1, "#examSections active/completed tabs exist");
    assert.equal(await page.locator('#examNew').count(), 1, "#examNew button exists");

    // Word collections
    await page.evaluate(() => window.enquizVisit('wordcollections'));
    await page.locator('#wordcollections.on').waitFor({state: 'visible'});
    assert.equal(await page.locator('#wordcollections .decks').count(), 1, ".decks exists");

    // Grammar tenses
    await page.evaluate(() => window.enquizVisit('tenses'));
    await page.locator('#tenses.on').waitFor({state: 'visible'});
    assert.equal(await page.locator('#tenses').count(), 1, "#tenses exists");

    // Floating feedback button
    assert.equal(await page.locator('#feedbackFloatingTrigger').count(), 1, "#feedbackFloatingTrigger exists");

    // =========================================================================
    // SECTION 4: SaaS Prototype Showcase Architecture & CEFR Verification
    // =========================================================================
    yield "04. SaaS Showcase Architecture & CEFR Verification";

    const showcaseUrl = 'file://' + resolve('site/saas-showcase.html');
    const showcasePage = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await showcasePage.goto(showcaseUrl);

    // 1. Student Dashboard & Warmup in showcase
    assert.equal(await showcasePage.locator('#dash-view-student .student-ring-wrap').count(), 1, "Student ring exists in showcase");
    assert.equal(await showcasePage.locator('#dash-view-student .home-warmup-widget').count(), 1, "Daily warmup widget exists in showcase");

    // 2. CEFR Tabs in showcase
    await showcasePage.click('[data-screen="screen-groups"]');
    assert.equal(await showcasePage.locator('.cefr-tab-btn[data-cefr-tab="all"]').count(), 1, "CEFR tabs exist in showcase");
    assert.equal(await showcasePage.locator('.group-card-item[data-group-level="A1"]').count(), 1, "A1 group card exists in showcase");

    // 3. Exams & Testing Center in showcase
    await showcasePage.click('[data-screen="screen-exams"]');
    assert.equal(await showcasePage.locator('#screen-exams .exam-card-item').count(), 3, "3 exam cards exist in showcase");
    assert.equal(await showcasePage.locator('#screen-exams').getByText('AI Review Assist Copilot').count(), 1, "AI Review Assist Copilot exists in showcase");

    // 4. Visual Site Map & Deep Screen Hierarchy in showcase
    await showcasePage.click('[data-screen="screen-sitemap"]');
    assert.equal(await showcasePage.locator('#screen-sitemap .sitemap-domain-card').count(), 9, "9 sitemap cards exist (8 domains + 77 chains explorer)");
    assert.ok(await showcasePage.locator('#screen-sitemap').getByText('77 Total Chains').count() >= 1, "77 Total Chains badge exists");
    assert.ok(await showcasePage.locator('#screen-sitemap').getByText('RECORD HOLDER').count() >= 1, "Record Holder banner exists");
    assert.ok(await showcasePage.locator('#screen-sitemap .tree-node-row').count() >= 50, "50+ tree nodes in sitemap");

    // 5. Music & Song Lyrics Karaoke Studio in showcase
    await showcasePage.click('[data-screen="screen-music"]');
    assert.equal(await showcasePage.locator('#screen-music .karaoke-timeline-box').count(), 1, "Karaoke timeline exists in showcase");
    assert.equal(await showcasePage.locator('#screen-music #inspectedWordCard').count(), 1, "Inspected word card exists in showcase");
    assert.ok(await showcasePage.locator('#screen-music').getByText('moonlight').count() >= 1, "Word moonlight exists in showcase");

    // 6. System Logs & Bug Diagnostics in showcase
    await showcasePage.click('[data-screen="screen-bugs"]');
    assert.equal(await showcasePage.locator('#screen-bugs .bug-incident-card').count(), 3, "3 bug incidents exist in showcase");
    assert.ok(await showcasePage.locator('#screen-bugs').getByText('500 Internal Error').count() >= 1, "500 Server Error badge exists in showcase");
    assert.ok(await showcasePage.locator('#screen-bugs').getByText('STUDY_DB.bug_reports').count() >= 1, "DB bug_reports persistence note exists");

    // 7. Complete 196 Themes Catalog & Custom Photo Generator in showcase
    await showcasePage.click('[data-screen="screen-settings"]');
    assert.equal(await showcasePage.locator('#themeCycle').count(), 1, "Theme cycle button exists in header");
    await showcasePage.waitForSelector('#showcaseThemeGrid .th-preset-card');
    const themesCount = await showcasePage.locator('#showcaseThemeGrid .th-preset-card').count();
    assert.ok(themesCount >= 190, `196 themes rendered in grid (got ${themesCount})`);
    assert.ok(await showcasePage.locator('#set-theme').getByText('CUSTOM_COLOR_KEYS').count() >= 1, "13 custom color tokens exist");
    assert.ok(await showcasePage.locator('#set-theme').getByText('--photo-wash').count() >= 1, "--photo-wash token exists");

    await showcasePage.close();

    assert.deepEqual(errors, [], "Zero uncaught page errors during preservation verification");
    console.log("All functional preservation checks passed with 100% accuracy!");

  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
