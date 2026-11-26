import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {stageContentPolicy} from '../src/learning-embed.mjs';

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
  const teacher2 = 'c'.repeat(32);
  const roomId = 'direct:' + teacher + ':' + student.id;
  const roomId2 = 'direct:' + teacher2 + ':' + student.id;
  const rows = [
    {id: 1, senderId: teacher, sender: 'Teacher', category: 'personal', text: 'Hello Alice, ready for the test?', createdMs: 1780000000123},
    {id: 2, senderId: student.id, sender: 'Alice', category: 'personal', text: 'Yes, absolutely ready!', createdMs: 1780000001000}
  ];
  let seq = 0, connection, unread = {personal: 0, learning: 0};
  const avatarUrl = '/api/messages/avatar?subject=' + teacher;
  const profiles = new Map([
    [teacher, {id: teacher, online: true, username: '@teacher', avatarUrl}],
    [teacher2, {id: teacher2, online: true, username: '@elena', avatarUrl}],
    [student.id, {id: student.id, online: true, username: ''}]
  ]);
  const room = () => ({id: roomId, title: 'Teacher', peerId: teacher, kind: 'direct', access: {protected: true, state: 'accepted', canSend: true}, revision: seq, unread: {...unread}, has: {personal: true, learning: false}, lastMessage: rows.at(-1), muted: false, members: 2});
  const room2 = () => ({id: roomId2, title: 'Elena', peerId: teacher2, kind: 'direct', access: {protected: true, state: 'accepted', canSend: true}, revision: seq, unread: {...unread}, has: {personal: true, learning: false}, lastMessage: {text: 'Hi Alice'}, muted: false, members: 2});
  const snapshot = () => ({
    rooms: [room(), room2()],
    contacts: [{id: teacher, name: 'Teacher', role: 'Teacher'}, {id: teacher2, name: 'Elena', role: 'Teacher'}],
    groups: [],
    profile: {...student, role: 'Student', online: true},
    profiles: Object.fromEntries(profiles),
    seq,
    total: 0
  });

  await page.routeWebSocket('**/api/messages/socket*', ws => {
    connection = ws;
    ws.send(JSON.stringify({type: 'snapshot', data: snapshot()}));
    ws.onMessage(raw => {
      const value = JSON.parse(raw), {requestId, action, body} = value;
      let result = {};
      if (action === 'history') result = {room: room(), readThrough: 0, more: false, messages: rows};
      if (action === 'members') result = {members: [{id: teacher, name: 'Teacher', role: 'Teacher'}, {id: student.id, name: 'Alice', role: 'Student'}]};
      if (action === 'profiles') result = {profiles: body.ids.map(id => profiles.get(id) || {id, online: false})};
      ws.send(JSON.stringify({type: 'response', requestId, result}));
    });
  });

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let data = {cards: [], groups: [], songs: [], texts: [], progress: [], quizzes: [], documents: {}, next: null};
    if (path === '/api/me' || path === '/api/me/account') data = {user: student};
    if (path === '/api/account/bootstrap') data = {versions: {}, catalogs: [], user: student};
    if (path === '/api/me/state') data = {learned: [], added: [], stats: {}, stageThemeRevision: 0, stageCustomRevision: 0};
    if (path === '/api/me/themes') data = {theme: 'sky', themes: [], revision: 0, customRevision: 0};
    await route.fulfill({contentType: 'application/json', body: JSON.stringify(data)});
  });

  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => accountReady);

  // 1. Open messages and select a conversation
  await page.locator('.side nav [data-msg-open]').click();
  await page.waitForFunction(() => document.getElementById('messages')?.classList.contains('on'));
  await page.locator('[data-msg-room]').first().click();
  await page.locator('.msg-room.on').waitFor();
  await page.locator('.msg-message').first().waitFor();

  // 2. Verify window controls in rail
  const closeBtn = page.locator('#msgWinClose');
  const minBtn = page.locator('#msgWinMin');
  const expandBtn = page.locator('#msgWinExpand');
  assert.equal(await closeBtn.count(), 1, 'Close window button exists');
  assert.equal(await minBtn.count(), 1, 'Minimize window button exists');
  assert.equal(await expandBtn.count(), 1, 'Expand window button exists');

  // 3. Test minimize to dock widget in bottom-left
  await minBtn.click();
  await page.waitForFunction(() => !document.getElementById('messages')?.classList.contains('on'));
  const dock = page.locator('#chatDockWidget:not([hidden])');
  await dock.waitFor();
  const initDockBox = await dock.boundingBox();
  assert.ok(initDockBox.x < 50, 'Dock widget placed near left edge');

  // 4. Test dragging dock widget to a new position in upper half
  const startX = initDockBox.x + 30;
  const startY = initDockBox.y + 15;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 250, startY - 450, {steps: 10});
  await page.mouse.up();

  const draggedDockBox = await dock.boundingBox();
  assert.ok(draggedDockBox.x > initDockBox.x + 150, 'Dock was dragged horizontally: ' + draggedDockBox.x);
  assert.ok(draggedDockBox.y < initDockBox.y - 250, 'Dock was dragged vertically: ' + draggedDockBox.y);

  // 5. Test opening window from dock:
  // Since dock was dragged to upper half, there is ample space below (spaceBelow >= 460) -> opens DOWNWARDS
  // And dock itself must disappear!
  await page.mouse.click(draggedDockBox.x + 30, draggedDockBox.y + 15);
  await page.waitForFunction(() => document.getElementById('chatDockWidget')?.hasAttribute('hidden'));
  const miniWindow = page.locator('#chatMiniWindow:not([hidden])');
  await miniWindow.waitFor();

  const miniBox = await miniWindow.boundingBox();
  assert.ok(miniBox.y >= draggedDockBox.y, 'Window opened downwards from upper dock position: miniY=' + miniBox.y + ' dockY=' + draggedDockBox.y);
  assert.ok(await page.locator('#chatDockWidget').isHidden(), 'Dock widget is completely hidden when window is open');

  // 6. Test timeline avatars for incoming messages
  const incomingAvatar = page.locator('#miniTimeline .chat-mini-msg-row.other .chat-mini-msg-avatar');
  assert.ok(await incomingAvatar.count() > 0, 'Incoming messages render peer avatar in timeline');
  assert.equal(await incomingAvatar.first().innerText(), 'T', 'Peer avatar shows correct initials');

  // 7. Test peer selector dropdown in header
  const peerTrigger = page.locator('#miniPeerSelector');
  await peerTrigger.click();
  const dropdown = page.locator('#miniPeerDropdown:not([hidden])');
  await dropdown.waitFor();
  const peerItems = page.locator('.chat-mini-peer-item');
  assert.ok(await peerItems.count() >= 2, 'Peer dropdown displays available rooms/contacts');

  // Switch peer in dropdown
  await peerItems.nth(1).click();
  await page.waitForFunction(() => document.getElementById('miniPeerDropdown')?.hasAttribute('hidden'));

  // 8. Test minimize back to dock: dock must reappear at its dragged position
  await page.locator('#miniWinMin').click();
  await page.waitForFunction(() => document.getElementById('chatMiniWindow')?.hasAttribute('hidden'));
  await page.locator('#chatDockWidget:not([hidden])').waitFor();
  const restoredDockBox = await page.locator('#chatDockWidget').boundingBox();
  assert.ok(Math.abs(restoredDockBox.x - draggedDockBox.x) < 20, 'Dock reappeared at saved X position');
  assert.ok(Math.abs(restoredDockBox.y - draggedDockBox.y) < 20, 'Dock reappeared at saved Y position');

  // 9. Test opening upwards when dock is near bottom
  // Drag dock down to near bottom
  const curX = restoredDockBox.x + 30;
  const curY = restoredDockBox.y + 15;
  await page.mouse.move(curX, curY);
  await page.mouse.down();
  await page.mouse.move(40, 830, {steps: 10});
  await page.mouse.up();

  const bottomDockBox = await page.locator('#chatDockWidget').boundingBox();
  assert.ok(bottomDockBox.y > 700, 'Dock moved near bottom');

  // Click to open -> must open upwards
  await page.mouse.click(bottomDockBox.x + 30, bottomDockBox.y + 15);
  await miniWindow.waitFor();
  const upwardMiniBox = await miniWindow.boundingBox();
  assert.ok(upwardMiniBox.y + upwardMiniBox.height <= bottomDockBox.y + 50, 'Window opened upwards from bottom dock position');

  // 10. Close from window
  await page.locator('#miniWinClose').click();
  await page.waitForFunction(() => document.getElementById('chatMiniWindow')?.hasAttribute('hidden'));
  assert.ok(await page.locator('#chatDockWidget').isHidden(), 'Dock widget stays hidden after close');

  assert.equal(errors.length, 0, 'No errors during test: ' + errors.join('\n'));
  console.log('All tests passed for dragging, smart direction, resize, peer selector, and timeline avatars!');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
