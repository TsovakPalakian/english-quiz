import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', err => {
    errors.push(err.message);
    console.error(err.message);
  });

  const user = { id: 'a'.repeat(32), login: 'admin', name: 'Admin', role: 'DEVELOPER' };
  const groups = [
    { id: 1, title: 'A1 Morning', date: '2026-01-01', studentCount: 4, lessonIds: [10, 11, 12, 13], teacherIds: [user.id], revision: 1 },
    { id: 2, title: 'B1 Evening', date: '2026-02-01', studentCount: 3, lessonIds: Array.from({ length: 12 }, (_, i) => 20 + i), teacherIds: [user.id], revision: 1 },
    { id: 3, title: 'B1 Weekend', date: '2026-02-05', studentCount: 3, lessonIds: Array.from({ length: 11 }, (_, i) => 40 + i), teacherIds: [user.id], revision: 1 }
  ];
  const lessons = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    title: `Lesson ${i + 1}`,
    published: true,
    date: '2026-01-10',
    blocks: []
  }));

  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path === '/api/database-context') data = { provider: 'd1', revision: 0, scope: 'site' };
    if (path === '/api/me' || path === '/api/me/account') data = { user };
    if (path === '/api/me/state') data = { bootstrap: true, stats: {}, added: [], songs: [], settings: {}, counts: { lessons: 2 }, stageActivity: {} };
    if (path === '/api/me/themes') data = { theme: 'almond', themes: [], revision: 0, customRevision: 0 };
    if (path === '/api/groups') data = { groups };
    if (path === '/api/groups/members') data = { members: [] };
    if (path === '/api/admin/users') data = { users: [] };
    if (path === '/api/lessons') data = { materials: lessons };
    if (path === '/api/exams') data = { exams: [] };
    if (path === '/api/archive') data = { archived: true, revision: 1 };
    if (path === '/api/messages') data = { rooms: [], groups: [], contacts: [], unread: {}, total: 0 };
    if (path.includes('catalogs')) data = { documents: {}, cards: [], next: null };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => typeof accountReady !== 'undefined' && accountReady && typeof placeBoot !== 'undefined' && placeBoot);
  await page.evaluate(async () => {
    authUser.role = 'DEVELOPER';
    await groupPull(true);
    window.enquizVisit('groups');
  });

  await page.locator('#groupList .decks').waitFor();

  // Test B1 card with 2 groups, 6 students, 23 lessons
  const b1Card = page.locator('#groupList [data-group-level="B1"]');
  await b1Card.waitFor();

  const labels = await b1Card.locator('.metric-pairs > span > span').allTextContents();
  const values = await b1Card.locator('.metric-pairs > span > b').allTextContents();
  assert.deepEqual(labels, ['Groups', 'Students', 'Lessons'], 'Labels match title-cased plural metrics');
  assert.deepEqual(values, ['2', '6', '23'], 'Values correctly sum 2 groups, 6 students, 23 lessons without text collision');

  // Verify CSS styles: column layout with space-between rows
  const cardStyle = await b1Card.evaluate(el => {
    const card = window.getComputedStyle(el);
    const container = el.querySelector('.metric-pairs');
    const containerStyle = window.getComputedStyle(container);
    const row = container.querySelector('span');
    const rowStyle = window.getComputedStyle(row);
    const bold = row.querySelector('b');
    const boldStyle = window.getComputedStyle(bold);
    return {
      cardMinHeight: card.minHeight,
      display: containerStyle.display,
      flexDirection: containerStyle.flexDirection,
      rowDisplay: rowStyle.display,
      rowJustifyContent: rowStyle.justifyContent,
      boldFontWeight: boldStyle.fontWeight
    };
  });

  assert.equal(cardStyle.cardMinHeight, '120px', 'Level card has min-height 120px for uniform vertical layout');
  assert.equal(cardStyle.display, 'flex', 'Container has flex display');
  assert.equal(cardStyle.flexDirection, 'column', 'Container displays metrics in a column (vertical)');
  assert.equal(cardStyle.rowDisplay, 'flex', 'Metric row has flex display');
  assert.equal(cardStyle.rowJustifyContent, 'space-between', 'Metric row spaces label and value across card width');
  assert.equal(cardStyle.boldFontWeight, '700', 'Metric value is rendered bold');

  // Verify empty card
  const a2Card = page.locator('#groupList [data-group-level="A2"]');
  const isEmpty = await a2Card.evaluate(el => el.classList.contains('is-empty'));
  assert.equal(isEmpty, true, 'Zero-data level card retains is-empty class');

  // Capture verification screenshot of level cards grid when local artifact directory exists
  const dir = '/Users/tsovakpalakian/.gemini/antigravity/brain/5c793067-76f1-4552-abc6-d03e3e3b29f0';
  if (existsSync(dir)) {
    const decks = page.locator('#groupList .decks');
    await decks.screenshot({
      path: `${dir}/final-implementation-level-cards.png`
    });
  }

  assert.equal(errors.length, 0, 'No JavaScript console errors encountered');
  console.log('test-level-cards-vertical-metrics-ui passed successfully');
} finally {
  await browser.close();
  await new Promise(res => server.close(res));
}
