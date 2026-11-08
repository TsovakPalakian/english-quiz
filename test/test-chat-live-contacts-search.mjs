import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import {stageContentPolicy} from '../src/learning-embed.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));
const root = resolve('rollback/production-assets');

test('live contacts search operates without lookup button or enter key', async () => {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(root + '/') || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream',
      'Content-Security-Policy': stageContentPolicy + "; worker-src 'self' blob:"
    });
    res.end(readFileSync(file));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const student = {id: 'b'.repeat(32), login: 'fixture_student', email: 'alice@example.com', name: 'Alice', role: 'USER', online: true};
    const teacher = 'a'.repeat(32);
    const roomId = 'direct:' + teacher + ':' + student.id;
    const rows = [{id: 1, senderId: teacher, sender: 'Teacher', category: 'personal', text: 'Hello Alice', createdMs: 1780000000123}];
    let seq = 0;
    const lookupQueries = [];

    const room = () => ({
      id: roomId,
      title: 'Teacher',
      peerId: teacher,
      kind: 'direct',
      groupId: null,
      access: {protected: true, state: 'accepted', canSend: true},
      members: 2,
      revision: seq,
      unread: {personal: 0, learning: 0},
      has: {personal: true, learning: true},
      lastMessage: rows.at(-1),
      muted: false
    });

    const snapshot = () => ({
      rooms: [room()],
      folders: [],
      contacts: [{id: teacher, name: 'Teacher', role: 'Teacher'}],
      groups: [{id: 1, title: 'A1'}],
      profile: {...student, role: 'Student', online: true},
      seq,
      total: 0
    });

    await page.routeWebSocket('**/api/messages/socket*', ws => {
      ws.send(JSON.stringify({type: 'snapshot', data: snapshot()}));
      ws.onMessage(raw => {
        const {requestId, action, body} = JSON.parse(raw);
        let result = {};
        if (action === 'history') result = {room: room(), readThrough: 100, more: false, messages: rows};
        if (action === 'profiles') result = {profiles: (body.ids || []).map(id => ({id, online: true, username: id === teacher ? '@teacher' : ''}))};
        if (action === 'lookup') {
          lookupQueries.push(body.query);
          result = {person: {id: 'c'.repeat(32), name: 'Bob Smith', role: 'Student'}};
        }
        ws.send(JSON.stringify({type: 'response', requestId, result}));
      });
    });

    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let data = {cards: [], groups: [], songs: [], texts: [], progress: [], quizzes: [], documents: {}, next: null};
      if (path === '/api/database-context') data = {provider: 'd1', revision: 0, scope: 'site'};
      if (path === '/api/me' || path === '/api/me/account') data = {user: student};
      if (path === '/api/account/bootstrap') data = {versions: {}, catalogs: [], user: student};
      if (path === '/api/me/themes') data = {theme: 'light', themes: [], revision: 0, customRevision: 0};
      await route.fulfill({contentType: 'application/json', body: JSON.stringify(data)});
    });

    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => typeof accountReady !== 'undefined' && accountReady);
    await page.evaluate(() => window.enquizVisit('messages'));
    await page.locator('#msgContacts').waitFor();
    await page.locator('#msgContacts').click();
    await page.waitForTimeout(300);

    // 1. Verify #msgLookup button does not exist in DOM
    const lookupButtonCount = await page.locator('#msgLookup').count();
    assert.equal(lookupButtonCount, 0, '#msgLookup button must be completely removed from DOM');

    // 2. Visual layout check: ensure search container is directly adjacent to categories
    const isAdjacent = await page.evaluate(() => {
      const search = document.querySelector('.chat-list .chat-search');
      const categories = document.querySelector('.chat-list .chat-categories');
      return search && categories && search.nextElementSibling === categories;
    });
    assert.equal(isAdjacent, true, 'Search input must be directly adjacent to category tabs (no intervening button)');

    // 3. Short queries (< 3 chars) do not trigger lookup
    await page.locator('#msgRoomSearch').fill('bo');
    await page.waitForTimeout(350);
    assert.equal(lookupQueries.length, 0, 'Short query (< 3 chars) must not query server directory');

    // 4. Live typing queries directory without pressing Enter
    await page.locator('#msgRoomSearch').fill('bob');
    await page.waitForTimeout(400);
    assert.equal(lookupQueries.length, 1, 'Typing >= 3 chars triggers live lookup automatically');
    assert.equal(lookupQueries[0], 'bob');

    // 5. Contact found by live lookup is rendered in the list
    await page.locator('[data-contact-id="' + 'c'.repeat(32) + '"]').waitFor();
    const contactText = await page.locator('[data-contact-id="' + 'c'.repeat(32) + '"]').innerText();
    assert.match(contactText, /Bob Smith/);

    // 6. Enter key triggers immediate lookup without error
    await page.locator('#msgRoomSearch').fill('teacher@example.com');
    await page.locator('#msgRoomSearch').press('Enter');
    await page.waitForTimeout(100);
    assert.ok(lookupQueries.includes('teacher@example.com'), 'Pressing Enter flushes and triggers immediate lookup');
  } finally {
    await browser.close();
    server.close();
  }
});
