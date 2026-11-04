import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { extractFunctions } from './helpers/extract-function.mjs';
import { WorkbenchProviderSettings } from '../src/workbench-provider-settings.mjs';
import { AccountArchive } from '../src/account-archive.mjs';
import { teacherMayTeachGroup } from '../src/teacher-group-access.mjs';
import { StageAuthBudget } from '../src/learning-stage-worker.mjs';

// 1. Extract client security guard functions from client/03a-cards.js
const cardsSource = fs.readFileSync('client/03a-cards.js', 'utf8');
const CARD_GUARD_FUNCTIONS = [
  'sessionIsDeveloper',
  'hideStudentSongs',
  'canManageOwnThemes',
  'isTeacher',
  'canEditLessons',
  'canTuneStudentLessons',
  'isDeveloper'
];
const extractedCardGuards = extractFunctions(cardsSource, ...CARD_GUARD_FUNCTIONS);

// 2. Extract theme guards from client/02-themes.js
const themesSource = fs.readFileSync('client/02-themes.js', 'utf8');
const THEME_GUARD_FUNCTIONS = [
  'saveCustomThemes',
  'visibleCustomThemes',
  'customThemeOk'
];
const extractedThemeGuards = extractFunctions(themesSource, ...THEME_GUARD_FUNCTIONS);

function createClientGuardEnvironment({
  authUser = null,
  viewAccount = null,
  viewSwitching = false,
  accountReady = true,
  materialReviewStudent = null,
  initialThemes = []
} = {}) {
  const store = new Map();
  if (initialThemes.length) {
    store.set('quiz_custom_themes_v1', JSON.stringify(initialThemes));
  }

  const syncCalls = [];
  const ctx = {
    authUser,
    viewAccount,
    viewSwitching,
    accountReady,
    materialReviewStudent,
    CUSTOM_THEME_KEY: 'quiz_custom_themes_v1',
    CUSTOM_COLOR_KEYS: ['--bg', '--card', '--ink', '--mute', '--line', '--acc', '--acc-s', '--ok', '--ok-s', '--bad', '--bad-s', '--on-acc', '--photo-wash'],
    THEMES: [['almond', 'Almond'], ['coral', 'Coral']],
    THEME_NAMES: { almond: 'Almond', coral: 'Coral' },
    localStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      _store: store
    },
    syncChange: (payload) => syncCalls.push(payload),
    queueThemePhotos: () => {},
    samePersonStudy: () => false,
    loadCustomThemes: () => {
      try {
        const raw = store.get('quiz_custom_themes_v1');
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    syncCalls
  };

  vm.createContext(ctx);
  vm.runInContext(`${extractedCardGuards}\n\n${extractedThemeGuards}`, ctx);

  return ctx;
}

test('[HIDDEN_GUARD] Client role predicate boundaries: isDeveloper, isTeacher, sessionIsDeveloper', () => {
  // 1. Role: USER (regular student)
  const userEnv = createClientGuardEnvironment({
    authUser: { id: 'student-1', role: 'USER' }
  });
  assert.equal(userEnv.sessionIsDeveloper(), false);
  assert.equal(userEnv.isDeveloper(), false);
  assert.equal(userEnv.isTeacher(), false);
  assert.equal(userEnv.canEditLessons(), false);
  assert.equal(userEnv.canTuneStudentLessons(), false);

  // 2. Role: ADMIN (teacher)
  const adminEnv = createClientGuardEnvironment({
    authUser: { id: 'teacher-1', role: 'ADMIN' }
  });
  assert.equal(adminEnv.sessionIsDeveloper(), false);
  assert.equal(adminEnv.isDeveloper(), false);
  assert.equal(adminEnv.isTeacher(), true);
  assert.equal(adminEnv.canEditLessons(), true);
  assert.equal(adminEnv.canTuneStudentLessons(), false);

  // 3. Role: DEVELOPER
  const devEnv = createClientGuardEnvironment({
    authUser: { id: 'dev-1', role: 'DEVELOPER' }
  });
  assert.equal(devEnv.sessionIsDeveloper(), true);
  assert.equal(devEnv.isDeveloper(), true);
  assert.equal(devEnv.isTeacher(), true);
  assert.equal(devEnv.canEditLessons(), true);
  assert.equal(devEnv.canTuneStudentLessons(), false);
});

test('[HIDDEN_GUARD] Context isolation: viewAccount strips developer privileges and blocks local mutations', () => {
  // Developer inspects a student account via viewAccount
  const devStudentEnv = createClientGuardEnvironment({
    authUser: { id: 'dev-1', role: 'DEVELOPER' },
    viewAccount: { id: 'student-42', login: 'student42', role: 'USER' }
  });

  // sessionIsDeveloper remains true for underlying auth, but isDeveloper MUST be false in viewAccount
  assert.equal(devStudentEnv.sessionIsDeveloper(), true);
  assert.equal(devStudentEnv.isDeveloper(), false, 'isDeveloper must return false when viewAccount is active');
  assert.equal(devStudentEnv.isTeacher(), false, 'isTeacher must check viewAccount.role, returning false for students');
  assert.equal(devStudentEnv.canManageOwnThemes(), false, 'canManageOwnThemes must be blocked in viewAccount');

  // Verify saveCustomThemes guard in viewAccount
  const dummyTheme = {
    id: 'user-sample',
    vars: { '--bg': '#101010', '--card': '#202020', '--acc': '#303030' }
  };
  devStudentEnv.saveCustomThemes([dummyTheme]);
  assert.equal(devStudentEnv.localStorage._store.has('quiz_custom_themes_v1'), false, 'saveCustomThemes must not write when viewAccount is active');
  assert.equal(devStudentEnv.syncCalls.length, 0, 'saveCustomThemes must not sync changes to server when viewAccount is active');

  // Verify viewSwitching flag also blocks theme management
  const switchingEnv = createClientGuardEnvironment({
    authUser: { id: 'student-1', role: 'USER' },
    viewSwitching: true
  });
  assert.equal(switchingEnv.canManageOwnThemes(), false, 'canManageOwnThemes must be blocked while viewSwitching is true');
});

test('[HIDDEN_GUARD] Content privacy: hideStudentSongs filters private media and custom themes', () => {
  const initialCustomThemes = [
    { id: 'user-shared', owner: 'student1', vars: { '--bg': '#111111', '--card': '#222222', '--acc': '#333333' } },
    { id: 'user-private', owner: 'teacher1', vars: { '--bg': '#444444', '--card': '#555555', '--acc': '#666666' } }
  ];

  // 1. Teacher inspecting student: hideStudentSongs returns true and visibleCustomThemes returns empty array
  const teacherInspectionEnv = createClientGuardEnvironment({
    authUser: { id: 'teacher-1', role: 'ADMIN', login: 'teacher1' },
    viewAccount: { id: 'student-1', role: 'USER', login: 'student1' },
    initialThemes: initialCustomThemes
  });
  assert.equal(teacherInspectionEnv.hideStudentSongs(), true, 'hideStudentSongs must return true when ADMIN views student');
  assert.equal(teacherInspectionEnv.visibleCustomThemes().length, 0, 'visibleCustomThemes must return empty list when hideStudentSongs is active');

  // 2. Regular student session: hideStudentSongs is false, sees only owned themes
  const studentEnv = createClientGuardEnvironment({
    authUser: { id: 'student-1', role: 'USER', login: 'student1' },
    viewAccount: null,
    initialThemes: initialCustomThemes
  });
  assert.equal(studentEnv.hideStudentSongs(), false);
  const studentThemes = studentEnv.visibleCustomThemes();
  assert.equal(studentThemes.length, 1);
  assert.equal(studentThemes[0].id, 'user-shared');

  // 3. Developer inspecting student: hideStudentSongs returns false to allow debugging
  const devInspectionEnv = createClientGuardEnvironment({
    authUser: { id: 'dev-1', role: 'DEVELOPER', login: 'dev1' },
    viewAccount: { id: 'student-1', role: 'USER', login: 'student1' },
    initialThemes: initialCustomThemes
  });
  assert.equal(devInspectionEnv.hideStudentSongs(), false, 'hideStudentSongs must be false for DEVELOPER role');
});

test('[HIDDEN_GUARD] Student exam review mode: materialReviewStudent blocks lesson editing', () => {
  // 1. Admin in normal mode can edit lessons
  const adminNormalEnv = createClientGuardEnvironment({
    authUser: { id: 'teacher-1', role: 'ADMIN' },
    materialReviewStudent: null
  });
  assert.equal(adminNormalEnv.canEditLessons(), true);
  assert.equal(adminNormalEnv.canTuneStudentLessons(), false);

  // 2. Admin in materialReviewStudent mode: canEditLessons MUST be false to protect master lesson
  const adminReviewEnv = createClientGuardEnvironment({
    authUser: { id: 'teacher-1', role: 'ADMIN' },
    materialReviewStudent: { id: 'student-88', name: 'Alice', email: 'alice@test.invalid' }
  });
  assert.equal(adminReviewEnv.canEditLessons(), false, 'canEditLessons must return false during student exam review');
  assert.equal(adminReviewEnv.canTuneStudentLessons(), true, 'canTuneStudentLessons must return true during student exam review');

  // 3. Regular student: canEditLessons and canTuneStudentLessons are strictly false
  const userReviewEnv = createClientGuardEnvironment({
    authUser: { id: 'student-88', role: 'USER' },
    materialReviewStudent: { id: 'student-88', name: 'Alice', email: 'alice@test.invalid' }
  });
  assert.equal(userReviewEnv.canEditLessons(), false);
  assert.equal(userReviewEnv.canTuneStudentLessons(), false);
});

test('[HIDDEN_GUARD] Backend developer gate: WorkbenchProviderSettings strictly limits access to active DEVELOPER', async () => {
  let authorized = true;
  const settings = new WorkbenchProviderSettings({
    providers: {},
    access: {},
    accounts: [],
    quota: {},
    authorize: async () => authorized
  });

  // 1. Student role rejected with 403
  await assert.rejects(
    async () => settings.gate({ id: 'u-1', role: 'USER', active: true }),
    (err) => err.status === 403 && err.message === 'Developer access required.'
  );

  // 2. Teacher/Admin role rejected with 403
  await assert.rejects(
    async () => settings.gate({ id: 'a-1', role: 'ADMIN', active: true }),
    (err) => err.status === 403 && err.message === 'Developer access required.'
  );

  // 3. Inactive developer rejected with 403
  await assert.rejects(
    async () => settings.gate({ id: 'd-1', role: 'DEVELOPER', active: false }),
    (err) => err.status === 403 && err.message === 'Developer access required.'
  );

  // 4. Revoked developer rejected with 403
  await assert.rejects(
    async () => settings.gate({ id: 'd-1', role: 'DEVELOPER', active: true, revoked: true }),
    (err) => err.status === 403 && err.message === 'Developer access required.'
  );

  // 5. Active developer passes gate when authorized is true
  await assert.doesNotReject(
    async () => settings.gate({ id: 'd-1', role: 'DEVELOPER', active: true })
  );

  // 6. When global authorization check fails, returns 503
  authorized = false;
  await assert.rejects(
    async () => settings.gate({ id: 'd-1', role: 'DEVELOPER', active: true }),
    (err) => err.status === 503 && err.message === 'Provider settings writes are off.'
  );
});

test('[HIDDEN_GUARD] Backend teacher & developer privileges in AccountArchive and teacherMayTeachGroup', async () => {
  // 1. teacherMayTeachGroup role boundaries
  const mockDb = {
    read: async (sql) => {
      if (sql.includes('catalog_documents')) {
        return [{ key: '10', value_json: JSON.stringify({ teacherIds: ['a-1'] }) }];
      }
      return [{ id: 10 }, { id: 20 }];
    }
  };

  const devUser = { id: 'd-1', role: 'DEVELOPER' };
  const adminUser = { id: 'a-1', role: 'ADMIN' };
  const regularUser = { id: 'u-1', role: 'USER' };

  // Developer can teach any group
  assert.equal(await teacherMayTeachGroup(mockDb, devUser, 999), true);
  assert.equal(await teacherMayTeachGroup(mockDb, devUser, 10), true);

  // Student cannot teach any group
  assert.equal(await teacherMayTeachGroup(mockDb, regularUser, 10), false);
  assert.equal(await teacherMayTeachGroup(mockDb, regularUser, 999), false);

  // Admin checks assigned groups
  assert.equal(await teacherMayTeachGroup(mockDb, adminUser, 10), true);
  assert.equal(await teacherMayTeachGroup(mockDb, adminUser, 999), false);

  // 2. AccountArchive role checks
  const mockArchiveDb = {
    read: async () => [{ account_id: 'target-1', archived_by: 'a-1', hidden_at: null }],
    atomic: async () => {}
  };
  const mockAccountsDb = {
    prepare: () => ({ bind: () => ({ run: async () => {} }) })
  };

  const archive = new AccountArchive(mockArchiveDb, mockAccountsDb);

  // Regular user rejected with 403 Teachers only
  assert.throws(
    () => archive.staff(regularUser),
    (err) => err.status === 403 && err.message === 'Teachers only.'
  );

  // Admin permitted in staff check
  assert.doesNotThrow(() => archive.staff(adminUser));
  assert.doesNotThrow(() => archive.staff(devUser));

  // Admin calling beginPurge rejected with 403 Developer only
  await assert.rejects(
    async () => archive.beginPurge(adminUser, 'target-1'),
    (err) => err.status === 403 && err.message === 'Developer only.'
  );

  // Developer calling hide rejected with 400 (developer must use permanent deletion)
  await assert.rejects(
    async () => archive.hide(devUser, 'target-1'),
    (err) => err.status === 400 && err.message === 'Use permanent deletion for this account.'
  );
});

test('[HIDDEN_GUARD] Session quota and nonce revocation in StageAuthBudget', async () => {
  const memory = new Map();
  const ctx = {
    storage: {
      transaction: async (fn) => fn({
        get: async (k) => structuredClone(memory.get(k)),
        put: async (k, v) => memory.set(k, structuredClone(v))
      })
    }
  };

  const budget = new StageAuthBudget(ctx);

  // 1. Invalid budget request kind returns 400
  const invalidReq = new Request('https://budget.internal/', {
    method: 'POST',
    body: JSON.stringify({ kind: 'unsupported' })
  });
  const invalidRes = await budget.fetch(invalidReq);
  assert.equal(invalidRes.status, 400);

  // 2. Revoke request with malformed nonce returns 400
  const malformedRevoke = new Request('https://budget.internal/', {
    method: 'POST',
    body: JSON.stringify({ kind: 'revoke', nonce: 'invalid-non-uuid', expires: Date.now() + 60000 })
  });
  const malformedRes = await budget.fetch(malformedRevoke);
  assert.equal(malformedRes.status, 400);

  // 3. Valid revocation of session nonce
  const testNonce = '12345678-1234-4234-8234-1234567890ab';
  const validRevoke = new Request('https://budget.internal/', {
    method: 'POST',
    body: JSON.stringify({ kind: 'revoke', nonce: testNonce, expires: Date.now() + 60000 })
  });
  const revokeRes = await budget.fetch(validRevoke);
  assert.equal(revokeRes.status, 200);

  // 4. Subsequent read with the revoked nonce returns 401 Unauthorized
  const readRevoked = new Request('https://budget.internal/', {
    method: 'POST',
    body: JSON.stringify({ kind: 'read', nonce: testNonce })
  });
  const readRevokedRes = await budget.fetch(readRevoked);
  assert.equal(readRevokedRes.status, 401, 'Read request with revoked nonce must be rejected with 401');

  // 5. Read with an active unrevoked nonce succeeds
  const activeNonce = 'abcdef01-abcd-4ef0-8ef0-abcdef012345';
  const readActive = new Request('https://budget.internal/', {
    method: 'POST',
    body: JSON.stringify({ kind: 'read', nonce: activeNonce })
  });
  const readActiveRes = await budget.fetch(readActive);
  assert.equal(readActiveRes.status, 200, 'Read request with unrevoked nonce must succeed');
});
