import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

test('TASK-13: Student home dashboard markup and static elements', () => {
  const html = readFileSync(resolve('site/preview.html'), 'utf8');

  // 1. Personalized heading & subtitle
  assert.ok(html.includes('id="homeWelcomeHeading"'), 'Must contain #homeWelcomeHeading');
  assert.ok(html.includes('id="homeStudentName"'), 'Must contain #homeStudentName');
  assert.ok(html.includes('id="homeWelcomeSubtitle"'), 'Must contain #homeWelcomeSubtitle');

  // 2. Priority Row: Your group & Next lesson
  assert.ok(html.includes('id="homePriorityRow"'), 'Must contain #homePriorityRow');
  assert.ok(html.includes('id="homeNextLessonSlotDate"'), 'Must contain #homeNextLessonSlotDate');
  assert.ok(html.includes('id="homeNextLessonSlotNote"'), 'Must contain #homeNextLessonSlotNote');
  assert.ok(html.includes('id="homeNextLessonSlotBtn"'), 'Must contain #homeNextLessonSlotBtn');
  assert.ok(html.includes('id="homeNextLessonSlotBadge"'), 'Must contain #homeNextLessonSlotBadge');

  // 3. Mastery Milestones Banner & 5 Tiers
  assert.ok(html.includes('id="homeMasteryBanner"'), 'Must contain #homeMasteryBanner');
  assert.ok(html.includes('id="homeTierTrack"'), 'Must contain #homeTierTrack');
  assert.ok(html.includes('data-tier="1"'), 'Must contain Level 1 tier card');
  assert.ok(html.includes('data-tier="2"'), 'Must contain Level 2 tier card');
  assert.ok(html.includes('data-tier="3"'), 'Must contain Level 3 tier card');
  assert.ok(html.includes('data-tier="4"'), 'Must contain Level 4 tier card');
  assert.ok(html.includes('data-tier="5"'), 'Must contain Level 5 tier card');

  // 4. Clean symbols without borders in site/badges
  assert.ok(html.includes('/badges/badge-1-symbol.png'), 'Level 1 must link to badge-1-symbol.png');
  assert.ok(html.includes('/badges/badge-2-symbol.png'), 'Level 2 must link to badge-2-symbol.png');
  assert.ok(html.includes('/badges/badge-3-symbol.png'), 'Level 3 must link to badge-3-symbol.png');
  assert.ok(html.includes('/badges/badge-4-symbol.png'), 'Level 4 must link to badge-4-symbol.png');
  assert.ok(html.includes('/badges/badge-5-symbol.png'), 'Level 5 must link to badge-5-symbol.png');

  // 5. Target threshold chips
  assert.ok(html.includes('id="homeTargetChips"'), 'Must contain #homeTargetChips');
  assert.ok(html.includes('data-target-pct="80"'), 'Must contain 80% chip');
  assert.ok(html.includes('data-target-pct="85"'), 'Must contain 85% chip');
  assert.ok(html.includes('data-target-pct="90"'), 'Must contain 90% chip');
  assert.ok(html.includes('data-target-pct="95"'), 'Must contain 95% chip');
  assert.ok(html.includes('data-target-pct="100"'), 'Must contain 100% chip');

  // 6. Badges Modal & Recent Activity View All
  assert.ok(html.includes('id="homeBadgesDialog"'), 'Must contain #homeBadgesDialog');
  assert.ok(html.includes('id="homeRecentViewAll"'), 'Must contain #homeRecentViewAll');
});

test('TASK-13: CSS rules for themes, backdrop blur, and sidebar progress', () => {
  const css = readFileSync(resolve('site/preview.css'), 'utf8');

  // 1. Sidebar progress display and home suppression
  assert.ok(css.includes('.shell-progress { display: block;'), 'shell-progress must be display: block by default');
  assert.ok(css.includes('body:has(#home.on) .shell-progress'), 'Must suppress .shell-progress when #home.on is active');

  // 2. Van Gogh / Almond backdrop blur
  assert.ok(css.includes(':root[data-theme="almond"] #home .saas-card'), 'Must style cards for almond theme');
  assert.ok(css.includes('backdrop-filter: blur(14px)'), 'Must apply backdrop-filter blur for almond theme');

  // 3. Cocoa theme contrast auto-brightening
  assert.ok(css.includes(':root[data-theme="cocoa"]'), 'Must contain cocoa theme adjustments');
  assert.ok(css.includes('#FFA49C'), 'Must brighten bad/error indicator in cocoa');
  assert.ok(css.includes('#7DD3FC'), 'Must brighten unread indicator in cocoa');

  // 4. Mastery banner and tier track styles
  assert.ok(css.includes('.home-mastery-banner'), 'Must define .home-mastery-banner');
  assert.ok(css.includes('.home-tier-track'), 'Must define .home-tier-track');
  assert.ok(css.includes('.home-tier-card'), 'Must define .home-tier-card');
  assert.ok(css.includes('.warmup-slim-banner'), 'Must define .warmup-slim-banner');
});

test('TASK-13: Dashboard logic, greeting personalization, and mastery track wiring', () => {
  const dashboardSrc = readFileSync(resolve('client/57a-dashboard.js'), 'utf8');

  // Simple mock DOM environment
  const elements = new Map();
  function getEl(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: '',
        style: {},
        parentElement: { setAttribute() {} },
        classList: {
          _set: new Set(),
          add(c) { this._set.add(c); },
          remove(c) { this._set.delete(c); },
          toggle(c, v) { if (v === undefined) v = !this._set.has(c); if (v) this._set.add(c); else this._set.delete(c); return v; },
          contains(c) { return this._set.has(c); }
        },
        hasAttribute(a) { return false; },
        setAttribute(a, v) {},
        removeAttribute(a) {},
        querySelector(s) { return null; },
        querySelectorAll(s) { return []; }
      });
    }
    return elements.get(id);
  }

  const storage = new Map();
  const mockLocalStorage = {
    getItem(k) { return storage.get(k) ?? null; },
    setItem(k, v) { storage.set(k, String(v)); },
    removeItem(k) { storage.delete(k); }
  };

  const studentUser = { id: 101, name: 'Alice Smith', role: 'USER' };
  const mockContext = {
    authUser: studentUser,
    viewAccount: null,
    classGroupId: 1,
    classGroups: [{ id: 1, title: 'English A2', lessonIds: [201, 202], studentCount: 5 }],
    lmLibrary: {
      materials: [
        { id: 201, title: 'Lesson 1', published: true, date: '2026-11-20', words: ['apple', 'book'] },
        { id: 202, title: 'Lesson 2', published: true, date: '2026-11-26', words: ['car', 'door'] }
      ]
    },
    loadLearned: () => new Set(['apple', 'book']),
    loadStarted: () => [201],
    lmLessonWordList: (m) => m.words || [],
    lmLessonVisibleToViewer: () => true,
    localStorage: mockLocalStorage,
    sessionStorage: mockLocalStorage,
    document: {
      getElementById: getEl,
      querySelector: (sel) => {
        if (sel === '.shell-progress') return getEl('shellProgress');
        if (sel === '#home') return { classList: { contains: () => true } };
        return null;
      },
      querySelectorAll: (sel) => []
    },
    window: {}
  };

  // Run dashboard script in isolated context
  runInNewContext(dashboardSrc, mockContext);

  // 1. Verify next lesson calculation with 80% target threshold
  const nextLesson = mockContext.window.homeFindNextLesson(80);
  assert.ok(nextLesson, 'Should find next unstudied lesson');
  assert.equal(nextLesson.id, 202, 'Lesson 201 is 100% learned, so next unstudied should be 202');

  // 2. When target is 100%, 201 has 100% and 202 has 0%, so 202 is next
  mockLocalStorage.setItem('lmLessonTargetPct', '85');
  assert.equal(mockContext.window.homeFindNextLesson(85).id, 202);

  // 3. Test empty slot Next lesson when no lessons upcoming
  mockContext.lmLibrary.materials = [];
  mockContext.paintHomeDashboard({ learned: 0, total: 10, pct: 0 });

  const slotDate = getEl('homeNextLessonSlotDate');
  const slotBtn = getEl('homeNextLessonSlotBtn');
  assert.equal(slotDate.textContent, '—', 'Empty next lesson slot should show em-dash');
  assert.equal(slotBtn.disabled, true, 'Next lesson button should be disabled when empty');

  // 4. Test first name greeting extraction (e.g. Alice Smith -> Alice, Tsovak Palakian -> Tsovak)
  assert.equal(getEl('homeStudentName').textContent, 'Alice', 'Must extract first name Alice from Alice Smith');
  assert.equal(getEl('homeWelcomeHeading').innerHTML, 'Welcome back, <span id="homeStudentName">Alice</span>! 👋');

  mockContext.authUser = { id: 102, name: 'Tsovak Palakian', role: 'USER' };
  mockContext.paintHomeDashboard({ learned: 2, total: 10, pct: 20 });
  assert.equal(getEl('homeStudentName').textContent, 'Tsovak', 'Must extract first name Tsovak from Tsovak Palakian');
  assert.equal(getEl('homeWelcomeHeading').innerHTML, 'Welcome back, <span id="homeStudentName">Tsovak</span>! 👋');

  mockContext.authUser = { id: 103, username: '   John Doe   ', role: 'USER' };
  mockContext.paintHomeDashboard({ learned: 2, total: 10, pct: 20 });
  assert.equal(getEl('homeStudentName').textContent, 'John', 'Must trim and extract first name John');

  mockContext.authUser = null;
  mockContext.paintHomeDashboard({ learned: 0, total: 0, pct: 0 });
  assert.equal(getEl('homeStudentName').textContent, 'Student', 'Must fall back to Student when unauthenticated');
});
