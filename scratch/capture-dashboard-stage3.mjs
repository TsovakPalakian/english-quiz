import { chromiumExecutable, resolveTestDependency } from '../ops/check-environment.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

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
    'Content-Type': file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.css')
      ? 'text/css'
      : file.endsWith('.html')
      ? 'text/html'
      : 'application/octet-stream'
  });
  res.end(readFileSync(file));
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable() });

try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
  const user = { id: 'a'.repeat(32), login: 'student', name: 'Alex Student', role: 'USER' };
  const mockCards = [
    { word: 'thunderstorm', ru: 'гроза', place: 'mine' },
    { word: 'lightning', ru: 'молния', place: 'mine' },
    { word: 'breeze', ru: 'легкий ветерок', place: 'mine' }
  ];

  await page.addInitScript(() => {
    try { localStorage.setItem('app-database-context-v1', 'd1:1'); } catch {}
  });

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data = {};
    if (path === '/api/database-context') data = { provider: 'd1', revision: 1, scope: 'site' };
    if (path === '/api/me' || path === '/api/me/account') data = { user };
    if (path === '/api/me/state') data = { bootstrap: true, stats: { learned: 24, total: 32 }, added: mockCards, songs: [], settings: {}, counts: { words: 24, songs: 3 }, stageAddedRevision: 1, stageActivity: {} };
    if (path === '/api/me/themes') data = { theme: 'almond', themes: [], revision: 0, customRevision: 0 };
    if (path === '/api/me/cards') data = { cards: mockCards, next: null, stageAddedRevision: 1 };
    if (path === '/api/me/songs') data = { songs: [], next: null };
    if (path === '/api/groups') data = { groups: [{ id: 1, title: 'A1 General English (Evening)', studentCount: 18, lessonIds: [101, 102], examIds: [201] }] };
    if (path === '/api/lessons') data = { materials: [{ id: 101, title: 'Day 02 Daily Routine', date: '2026-11-05', published: true }] };
    if (path === '/api/exams') data = { exams: [] };
    if (path === '/api/messages') data = { rooms: [], groups: [], contacts: [], unread: {}, total: 2 };
    if (path === '/api/error-bank') {
      if (url.searchParams.get('action') === 'stats') data = { dueToday: 3, masteredItems: 12 };
      else if (url.searchParams.get('action') === 'queue') {
        data = {
          queue: [
            { id: 42, stage: 2, prompt: 'She ________ (go) to bed early yesterday because she was completely exhausted.', cuedHint: 'Fill in: went', hint: 'Past Simple irregular verb', expected: 'went' }
          ]
        };
      }
    }
    if (path.includes('catalogs')) data = { documents: {}, cards: [], next: null };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => typeof accountReady !== 'undefined' && accountReady);

  // Navigate to home
  await page.evaluate(() => window.enquizVisit('home'));
  await page.waitForTimeout(400);

  const outPath = '/Users/tsovakpalakian/.gemini/antigravity/brain/eb97b91f-b10c-4f3e-a907-bfdb8eb3b794/lumiscia-dashboard-stage3.png';
  await page.screenshot({ path: outPath, fullPage: false });
  console.log('SAVED_SCREENSHOT:', outPath);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
