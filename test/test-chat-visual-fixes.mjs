import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {stageContentPolicy} from '../src/learning-embed.mjs';
import {everydayGroups} from '../src/essential-data.mjs';

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
  const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
  res.writeHead(200, {'Content-Type': type, 'Content-Security-Policy': stageContentPolicy + "; worker-src 'self' blob:"});
  res.end(readFileSync(file));
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const student = {id: 'b'.repeat(32), login: 'fixture_student', email: 'alice@example.com', name: 'Alice', role: 'USER', online: true};
  const teacher = 'a'.repeat(32);
  const roomId = 'direct:' + teacher + ':' + student.id;
  const rows = [{id: 1, senderId: teacher, sender: 'Teacher', category: 'personal', text: 'Hello Alice', createdMs: 1780000000123}];
  let seq = 0, connection, unread = {personal: 1, learning: 0};
  const avatarUrl = '/api/messages/avatar?subject=' + teacher;
  const profiles = new Map([[teacher, {id: teacher, online: true, username: '@teacher', avatarUrl}], [student.id, {id: student.id, online: true, username: ''}] ]);
  const room = () => ({id: roomId, title: 'Teacher', peerId: teacher, kind: 'direct', access: {protected: true, state: 'accepted', canSend: true}, revision: seq, unread: {...unread}, has: {personal: true, learning: false}, lastMessage: rows.at(-1), muted: false, members: 2});
  const snapshot = () => ({rooms: [room()], contacts: [{id: teacher, name: 'Teacher', role: 'Teacher'}], groups: [], profile: {...student, role: 'Student', online: true}, profiles: Object.fromEntries(profiles), seq, total: unread.personal + unread.learning});
  const event = (type, extra = {}) => connection.send(JSON.stringify({type: 'event', seq: ++seq, event: {type, key: 'fixture:' + seq, room: room(), ...extra}}));
  await page.routeWebSocket('**/api/messages/socket*', ws => {
    connection = ws;
    ws.send(JSON.stringify({type: 'snapshot', data: snapshot()}));
    ws.onMessage(raw => {
      const value = JSON.parse(raw), {requestId, action, body} = value;
      let result = {};
      if (action === 'history') result = {room: room(), readThrough: 0, more: false, messages: rows.filter(row => row.category === body.category)};
      if (action === 'read') { unread[body.category] = 0; event('room'); result = {room: room()}; }
      if (action === 'send') {
        const message = {id: rows.at(-1).id + 1, senderId: student.id, sender: 'Alice', category: 'personal', text: body.text, createdMs: Date.now(), clientKey: body.clientKey};
        rows.push(message);
        event('message', {message});
        result = {message};
      }
      if (action === 'members') result = {members: [{id: teacher, name: 'Teacher', role: 'Teacher'}, {id: student.id, name: 'Alice', role: 'Student'}]};
      if (action === 'profiles') result = {profiles: body.ids.map(id => profiles.get(id) || {id, online: false})};
      if (action === 'delivered') result = {read: true};
      ws.send(JSON.stringify({type: 'response', requestId, result}));
    });
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path === '/api/messages/avatar') {
      await route.fulfill({contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')});
      return;
    }
    let data = {cards: [], groups: [], songs: [], texts: [], progress: [], quizzes: [], documents: {}, next: null};
    if (path === '/api/me' || path === '/api/me/account') data = {user: student};
    if (path === '/api/account/bootstrap') data = {versions: {}, catalogs: [], user: student};
    if (path === '/api/me/state') data = {learned: [], added: [], stats: {}, stageThemeRevision: 0, stageCustomRevision: 0};
    if (path === '/api/me/themes') data = {theme: 'almond', themes: [], revision: 0, customRevision: 0};
    if (path === '/api/database-context') data = {provider: 'd1', revision: 0, scope: 'site'};
    if (path === '/api/everyday') {
      let id = 20000;
      data = {version: 1, groups: everydayGroups.map(group => ({...group, topics: group.topics.map(topic => ({...topic, entries: topic.entries.map(entry => ({...entry, cardId: ++id, card: {en: entry.en, word: entry.en, ru: entry.ru, stageId: id, stageRevision: 1, stageScope: 'shared'}}))}))}))};
    }
    if (path === '/api/me/notification-sounds') data = {enabled: true, volume: .65, sound: 'soft-double', sounds: [], revision: ''};
    await route.fulfill({contentType: 'application/json', body: JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => accountReady);
  await page.locator('.side nav [data-msg-open]').click();
  await page.waitForFunction(() => document.querySelector('.side nav [data-msg-open]')?.textContent.includes('Messages'));
  const foot = await page.locator('.side-foot button').allTextContents();
  assert.ok(foot.every(text => !text.trim().startsWith('Messages')), 'Sidebar foot shows Messages: ' + foot.join(' | '));
  await page.locator('[data-msg-room]').click();
  await page.locator('.msg-room.on').waitFor();
  await page.waitForFunction(() => !document.querySelector('.msg-room.on .chat-counter'));
  await page.locator('#msgText').fill('My reply');
  await page.locator('#msgSend').click();
  await page.locator('.msg-message.is-own').waitFor();
  const [otherLeft, ownLeft] = await page.locator('.msg-message').evaluateAll(nodes => {
    const other = nodes.find(node => !node.classList.contains('is-own'));
    const own = nodes.find(node => node.classList.contains('is-own'));
    return [other.getBoundingClientRect().left, own.getBoundingClientRect().left];
  });
  assert.ok(ownLeft > otherLeft, 'Own message stays on the right');
  const directHeadersHidden = await page.locator('#messages .msg-message:not(.is-group-message) > header').evaluateAll(headers =>
    headers.every(h => window.getComputedStyle(h).display === 'none')
  );
  assert.ok(directHeadersHidden, 'Direct conversation headers are hidden');
  const photoMetrics = await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'messages';
    el.innerHTML = '<article class="msg-message"><button class="chat-file" data-photo-preview><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></button></article>';
    document.body.appendChild(el);
    const img = el.querySelector('img');
    const btn = el.querySelector('.chat-file');
    const style = window.getComputedStyle(img);
    const btnStyle = window.getComputedStyle(btn);
    const res = { objectFit: style.objectFit, maxHeight: style.maxHeight, btnMaxWidth: btnStyle.maxWidth };
    el.remove();
    return res;
  });
  assert.equal(photoMetrics.objectFit, 'contain');
  assert.ok(photoMetrics.maxHeight.includes('320px') || parseFloat(photoMetrics.maxHeight) <= 320);
  await page.locator('#msgRoomAvatar.has-avatar-photo').click();
  await page.locator('#msgRight:not([hidden])').waitFor();
  assert.equal(await page.locator('dialog.chat-avatar-dialog').count(), 0);
  assert.match(await page.locator('#msgInfoContent').innerText(), /Private conversation/);
  await page.evaluate(() => {
    const card = document.createElement('div');
    card.id = 'visual-checkbox';
    card.className = 'card admin-user-card';
    card.innerHTML = '<div class="admin-form-field saas-form-group is-full"><label class="account-earlier-history"><input type="checkbox" data-show-earlier> Show earlier group messages</label></div>';
    document.body.append(card);
    card.scrollIntoView();
  });
  const box = await page.locator('#visual-checkbox [data-show-earlier]').boundingBox();
  const label = await page.locator('#visual-checkbox .account-earlier-history').boundingBox();
  assert.ok(box.width <= 20 && box.height <= 20, 'Checkbox stays a small square');
  assert.ok(Math.abs(box.y - label.y) < 12, 'Checkbox and its text stay on one line');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Visual chat fixes passed.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
