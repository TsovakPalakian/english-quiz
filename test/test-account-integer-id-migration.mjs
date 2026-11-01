import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {
  migrateAccountDatabase,
  extractLegacyAccountMappings,
  migrateStudyDatabase,
  migrateR2StorageObjects
} from '../ops/migrate-account-integer-ids.mjs';
import {chatCipher} from '../src/chat-encryption.mjs';

test('End-to-End Account Database (DB) Migration: Strings to Autoincrement Integers', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    // 1. Setup legacy text-id schema
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        login TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_iterations INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER',
        is_personal_data_revoked INTEGER NOT NULL DEFAULT 0,
        revoked_at INTEGER,
        hidden INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE registrations (
        id TEXT PRIMARY KEY,
        login TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_iterations INTEGER NOT NULL,
        status TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER',
        user_id TEXT,
        created_at INTEGER NOT NULL,
        decided_at INTEGER
      );
      CREATE TABLE account_changes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        login TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        from_login TEXT NOT NULL,
        from_email TEXT NOT NULL,
        from_name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'USER',
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        decided_at INTEGER
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE user_state (
        user_id TEXT PRIMARY KEY,
        added TEXT NOT NULL DEFAULT '[]',
        songs TEXT NOT NULL DEFAULT '[]',
        learned TEXT NOT NULL DEFAULT '[]',
        variants TEXT NOT NULL DEFAULT '{}',
        stats TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE user_added (
        user_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        card TEXT NOT NULL,
        PRIMARY KEY (user_id, idx)
      );
      CREATE TABLE user_card_gone (
        user_id TEXT NOT NULL,
        card_key TEXT NOT NULL,
        PRIMARY KEY (user_id, card_key)
      );
    `);

    // Insert mock rows
    db.prepare("INSERT INTO users VALUES ('usr_first', 'alice', 'alice@test.local', 'Alice', 's1', 'h1', 100000, 'USER', 0, NULL, 0, 1, 100)").run();
    db.prepare("INSERT INTO users VALUES ('usr_second', 'bob', 'bob@test.local', 'Bob', 's2', 'h2', 100000, 'ADMIN', 0, NULL, 0, 1, 200)").run();
    db.prepare("INSERT INTO registrations VALUES ('reg_1', 'alice', 'alice@test.local', 'Alice', 's1', 'h1', 100000, 'approved', 'USER', 'usr_first', 50, 100)").run();
    db.prepare("INSERT INTO registrations VALUES ('reg_2', 'charlie', 'charlie@test.local', 'Charlie', 's3', 'h3', 100000, 'pending', 'USER', NULL, 300, NULL)").run();
    db.prepare("INSERT INTO account_changes VALUES ('chg_1', 'usr_first', 'alice2', 'alice@test.local', 'Alice', 'alice', 'alice@test.local', 'Alice', 'USER', 'pending', 400, NULL)").run();
    db.prepare("INSERT INTO sessions VALUES ('tok_alice', 'usr_first', 9999999)").run();
    db.prepare("INSERT INTO user_state VALUES ('usr_first', '[\"c1\"]', '[]', '[]', '{}', '{}', 500)").run();
    db.prepare("INSERT INTO user_added VALUES ('usr_first', 0, 'c1')").run();
    db.prepare("INSERT INTO user_card_gone VALUES ('usr_first', 'c2')").run();

    // 2. Run migration
    await migrateAccountDatabase(db);

    // 3. Verify mappings and integer autoincrement
    const {accountMap, regMap} = await extractLegacyAccountMappings(db);
    assert.equal(accountMap.get('usr_first'), 1);
    assert.equal(accountMap.get('usr_second'), 2);
    assert.equal(regMap.get('reg_1'), 1);
    assert.equal(regMap.get('reg_2'), 2);

    const clean = rows => JSON.parse(JSON.stringify(rows));

    const users = db.prepare('SELECT id, login, email, role FROM users ORDER BY id').all();
    assert.deepEqual(clean(users), [
      {id: 1, login: 'alice', email: 'alice@test.local', role: 'USER'},
      {id: 2, login: 'bob', email: 'bob@test.local', role: 'ADMIN'}
    ]);

    const regs = db.prepare('SELECT id, login, user_id, status FROM registrations ORDER BY id').all();
    assert.deepEqual(clean(regs), [
      {id: 1, login: 'alice', user_id: 1, status: 'approved'},
      {id: 2, login: 'charlie', user_id: null, status: 'pending'}
    ]);

    const changes = db.prepare('SELECT id, user_id, login FROM account_changes').all();
    assert.deepEqual(clean(changes), [{id: 1, user_id: 1, login: 'alice2'}]);

    const sessions = db.prepare('SELECT token_hash, user_id FROM sessions').all();
    assert.deepEqual(clean(sessions), [{token_hash: 'tok_alice', user_id: 1}]);

    const userState = db.prepare('SELECT user_id, added FROM user_state').all();
    assert.deepEqual(clean(userState), [{user_id: 1, added: '["c1"]'}]);

    const userAdded = db.prepare('SELECT user_id, idx, card FROM user_added').all();
    assert.deepEqual(clean(userAdded), [{user_id: 1, idx: 0, card: 'c1'}]);

    const userCardGone = db.prepare('SELECT user_id, card_key FROM user_card_gone').all();
    assert.deepEqual(clean(userCardGone), [{user_id: 1, card_key: 'c2'}]);

    // Verify autoincrement insertion works cleanly without specifying id
    db.prepare("INSERT INTO users (login, email, password_salt, password_hash, password_iterations, role, created_at) VALUES ('david', 'david@test.local', 's4', 'h4', 100000, 'USER', 600)").run();
    const newUser = db.prepare("SELECT id, login FROM users WHERE login = 'david'").get();
    assert.equal(newUser.id, 3);
  } finally {
    db.close();
  }
});

test('Cross-Database STUDY_DB Rebuilding, Catalog Remapping & Direct Chat Preservation', async () => {
  const studyDb = new DatabaseSync(':memory:');
  try {
    // 1. Setup base STUDY_DB tables
    studyDb.exec(`
      CREATE TABLE account_refs (id TEXT PRIMARY KEY NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE study_profiles (id INTEGER PRIMARY KEY CHECK (id > 0), kind TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE profile_members (account_id TEXT PRIMARY KEY NOT NULL REFERENCES account_refs(id), profile_id INTEGER NOT NULL REFERENCES study_profiles(id));
      CREATE TABLE lessons (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
      CREATE TABLE cards (id INTEGER PRIMARY KEY, en TEXT NOT NULL);
      CREATE TABLE account_settings (account_id TEXT NOT NULL REFERENCES account_refs(id), key TEXT NOT NULL, value_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (account_id, key));
      CREATE TABLE lesson_access (account_id TEXT NOT NULL REFERENCES account_refs(id), lesson_id INTEGER NOT NULL REFERENCES lessons(id), allow_hidden INTEGER NOT NULL DEFAULT 0, personal_hidden INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (account_id, lesson_id));
      CREATE TABLE operation_receipts (account_id TEXT NOT NULL REFERENCES account_refs(id), mutation_id TEXT NOT NULL, request_sha256 TEXT NOT NULL, result_json TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY (account_id, mutation_id));
      CREATE TABLE class_groups (id INTEGER PRIMARY KEY, title TEXT NOT NULL, deleted_at INTEGER);
      CREATE TABLE class_group_students (account_id TEXT PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES class_groups(id), assigned_by TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE exams (id INTEGER PRIMARY KEY, title TEXT NOT NULL, deleted_at INTEGER);
      CREATE TABLE exam_blocks (id INTEGER PRIMARY KEY, exam_id INTEGER NOT NULL, deleted_at INTEGER);
      CREATE TABLE exam_work (account_id TEXT NOT NULL, exam_id INTEGER NOT NULL, block_id INTEGER NOT NULL, saved INTEGER NOT NULL DEFAULT 0, answers_json TEXT NOT NULL DEFAULT '{}', corrections_json TEXT NOT NULL DEFAULT '{}', points_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (account_id, exam_id, block_id));
      CREATE TABLE exam_instances (exam_id INTEGER PRIMARY KEY, source_exam_id INTEGER NOT NULL, account_id TEXT NOT NULL, assignment_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', group_id INTEGER, group_title TEXT NOT NULL DEFAULT '', reviewer_id TEXT, reviewer_name TEXT NOT NULL DEFAULT 'Teacher', student_name TEXT NOT NULL DEFAULT '', student_email TEXT NOT NULL DEFAULT '', assigned_at INTEGER NOT NULL DEFAULT 0, completed_at INTEGER, max_points REAL, earned_points REAL);
      CREATE TABLE exam_reviewer_hides (account_id TEXT NOT NULL, exam_id INTEGER NOT NULL, PRIMARY KEY(account_id, exam_id));
      CREATE TABLE assessment_work (account_id TEXT NOT NULL, kind TEXT NOT NULL, material_id INTEGER NOT NULL, exam_id INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL DEFAULT 'draft', answers_json TEXT NOT NULL DEFAULT '{}', grading_json TEXT NOT NULL DEFAULT '{}', snapshot_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(account_id, kind, material_id));
      CREATE TABLE assessment_history (id INTEGER PRIMARY KEY, account_id TEXT NOT NULL, kind TEXT NOT NULL, material_id INTEGER NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', snapshot_json TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE assessment_recordings (account_id TEXT NOT NULL, kind TEXT NOT NULL, material_id INTEGER NOT NULL, part_id INTEGER NOT NULL, question_index INTEGER NOT NULL, object_key TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(account_id, kind, material_id, part_id, question_index));
      CREATE TABLE account_error_items (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, material_id INTEGER NOT NULL, kind TEXT NOT NULL, part_id TEXT NOT NULL, question_index INTEGER NOT NULL, prompt TEXT NOT NULL DEFAULT '', expected_answer TEXT NOT NULL DEFAULT '', given_answer TEXT NOT NULL DEFAULT '', error_tag TEXT NOT NULL DEFAULT 'grammar', error_category TEXT NOT NULL DEFAULT '', diagnostic_note TEXT NOT NULL DEFAULT '', stage INTEGER NOT NULL DEFAULT 1, interval_days INTEGER NOT NULL DEFAULT 1, next_review_at INTEGER NOT NULL, error_count INTEGER NOT NULL DEFAULT 1, success_streak INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', stability REAL NOT NULL DEFAULT 0.0, difficulty REAL NOT NULL DEFAULT 0.0, retrievability REAL NOT NULL DEFAULT 0.0, last_reviewed_at INTEGER NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE speakout_answers (account_id TEXT NOT NULL, level TEXT NOT NULL, unit_index INTEGER NOT NULL, lesson_index INTEGER NOT NULL, definition_revision INTEGER NOT NULL, answers_json TEXT NOT NULL, PRIMARY KEY(account_id, level, unit_index, lesson_index));
      CREATE TABLE account_archives (account_id TEXT PRIMARY KEY, archived_by TEXT NOT NULL, archived_by_name TEXT NOT NULL, title TEXT NOT NULL, login TEXT NOT NULL, email TEXT NOT NULL, archived_at INTEGER NOT NULL DEFAULT(unixepoch()), hidden_at INTEGER, original_active INTEGER NOT NULL, original_hidden INTEGER NOT NULL, purge_started_at INTEGER);
      CREATE TABLE content_archive (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', archived_by TEXT NOT NULL, archived_by_name TEXT NOT NULL DEFAULT '', archived_by_role TEXT NOT NULL DEFAULT 'ADMIN', archived_at INTEGER NOT NULL DEFAULT (unixepoch()), teacher_hidden_at INTEGER, teacher_hidden_by TEXT, PRIMARY KEY(entity_type, entity_id));
      CREATE TABLE chat_rooms (id TEXT PRIMARY KEY, kind TEXT NOT NULL, group_id INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE chat_members (room_id TEXT NOT NULL REFERENCES chat_rooms(id), account_id TEXT NOT NULL, joined_seq INTEGER NOT NULL DEFAULT 0, group_epoch INTEGER NOT NULL DEFAULT 0, read_personal INTEGER NOT NULL DEFAULT 0, read_learning INTEGER NOT NULL DEFAULT 0, muted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(room_id, account_id));
      CREATE TABLE chat_assignments (id TEXT PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exams(id), target_kind TEXT NOT NULL, target_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES chat_rooms(id), sender_id TEXT NOT NULL, sender_name TEXT NOT NULL, category TEXT NOT NULL, body TEXT NOT NULL, reply_to INTEGER, assignment_id TEXT, client_key TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE chat_mutations (actor_id TEXT NOT NULL, client_key TEXT NOT NULL, result_json TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(actor_id, client_key));
      CREATE TABLE chat_send_budget (account_id TEXT PRIMARY KEY, window_start INTEGER NOT NULL, n INTEGER NOT NULL);
      CREATE TABLE security_sessions (account_id TEXT NOT NULL, id TEXT NOT NULL, value_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, expires_at INTEGER NOT NULL, PRIMARY KEY(account_id, id));
      CREATE TABLE qr_senses (id TEXT PRIMARY KEY);
      CREATE TABLE qr_versions (id TEXT PRIMARY KEY);
      CREATE TABLE qr_media (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES account_refs(id), purpose TEXT NOT NULL, digest TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, name TEXT NOT NULL, descriptor_json TEXT NOT NULL, source_json TEXT NOT NULL, created_at INTEGER NOT NULL, deleted_at INTEGER);
      CREATE TABLE qr_feedback (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES account_refs(id), card_id INTEGER NOT NULL, sense_id TEXT NOT NULL, version_id TEXT, category TEXT NOT NULL, description TEXT NOT NULL, attachments_json TEXT NOT NULL, created_at INTEGER NOT NULL, deleted_at INTEGER, expires_at INTEGER, privacy_consent_at INTEGER);
      CREATE TABLE qr_speech_tasks (id TEXT PRIMARY KEY);
      CREATE TABLE qr_speech_attempts (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES qr_speech_tasks(id), owner_id TEXT NOT NULL REFERENCES account_refs(id), media_id TEXT NOT NULL, consent_at INTEGER NOT NULL, created_at INTEGER NOT NULL, deadline_at INTEGER NOT NULL, snapshot_json TEXT NOT NULL, comparison_key TEXT NOT NULL, state TEXT NOT NULL, result_json TEXT, error_code TEXT, finished_at INTEGER, deleted_at INTEGER);
      CREATE TRIGGER qr_media_immutable BEFORE UPDATE ON qr_media WHEN OLD.purpose IS NOT NEW.purpose BEGIN SELECT RAISE(ABORT, 'Media immutable'); END;
      CREATE TRIGGER qr_feedback_no_update BEFORE UPDATE ON qr_feedback WHEN OLD.owner_id IS NOT NEW.owner_id BEGIN SELECT RAISE(ABORT, 'Feedback immutable'); END;
      CREATE TABLE catalog_documents (namespace TEXT, key TEXT, value_json TEXT, PRIMARY KEY (namespace, key));
    `);

    // Insert mock data into parent & dependent tables
    studyDb.prepare("INSERT INTO account_refs VALUES ('usr_first', 100), ('usr_second', 200)").run();
    studyDb.prepare("INSERT INTO study_profiles VALUES (10, 'personal', 100)").run();
    studyDb.prepare("INSERT INTO profile_members VALUES ('usr_first', 10)").run();
    studyDb.prepare("INSERT INTO lessons VALUES (20, 'Lesson 1')").run();
    studyDb.prepare("INSERT INTO cards VALUES (1, 'hello')").run();
    studyDb.prepare("INSERT INTO account_settings VALUES ('usr_first', 'theme', '\"dark\"', 1)").run();
    studyDb.prepare("INSERT INTO lesson_access VALUES ('usr_first', 20, 1, 0)").run();
    studyDb.prepare("INSERT INTO operation_receipts VALUES ('usr_first', 'mut_1', 'sha', '{}', 999)").run();
    studyDb.prepare("INSERT INTO class_groups VALUES (30, 'Group A', NULL)").run();
    studyDb.prepare("INSERT INTO class_group_students VALUES ('usr_first', 30, 'usr_second', 100)").run();
    studyDb.prepare("INSERT INTO exams VALUES (40, 'Exam 1', NULL)").run();
    studyDb.prepare("INSERT INTO exam_blocks VALUES (50, 40, NULL)").run();
    studyDb.prepare("INSERT INTO exam_work VALUES ('usr_first', 40, 50, 1, '{}', '{}', '{}', 100)").run();
    studyDb.prepare("INSERT INTO exam_instances VALUES (40, 40, 'usr_first', 'asg_1', 1, 'active', 30, 'Group A', 'usr_second', 'Bob', 'Alice', 'alice@test.local', 100, NULL, 10.0, 9.0)").run();
    studyDb.prepare("INSERT INTO exam_reviewer_hides VALUES ('usr_second', 40)").run();
    studyDb.prepare("INSERT INTO assessment_work VALUES ('usr_first', 'exam-block', 50, 40, 1, 'draft', '{}', '{}', '[]', 100)").run();
    studyDb.prepare("INSERT INTO assessment_history VALUES (1, 'usr_first', 'exam-block', 50, 'usr_second', 'graded', 'well done', '[]', 100)").run();
    studyDb.prepare("INSERT INTO assessment_recordings VALUES ('usr_first', 'exam-block', 50, 1, 0, 'usr_first/rec.mp3', 'audio/mpeg', 1024)").run();
    studyDb.prepare("INSERT INTO account_error_items (account_id, material_id, kind, part_id, question_index, next_review_at) VALUES ('usr_first', 50, 'exam-block', 'p1', 0, 100)").run();
    studyDb.prepare("INSERT INTO speakout_answers VALUES ('usr_first', 'b1', 1, 1, 1, '{}')").run();
    studyDb.prepare("INSERT INTO account_archives VALUES ('usr_first', 'usr_second', 'Bob', 'Alice', 'alice', 'alice@test.local', 100, NULL, 1, 0, NULL)").run();
    studyDb.prepare("INSERT INTO content_archive VALUES ('lesson', '20', 'Lesson 1', 'usr_second', 'Bob', 'ADMIN', 100, NULL, NULL)").run();
    studyDb.prepare("INSERT INTO chat_send_budget VALUES ('usr_first', 100, 5)").run();
    studyDb.prepare("INSERT INTO chat_mutations VALUES ('usr_first', 'k1', '{}', '{}')").run();
    studyDb.prepare("INSERT INTO chat_assignments VALUES ('asg_1', 40, 'student', 'usr_first', 1, 100)").run();
    studyDb.prepare("INSERT INTO security_sessions VALUES ('usr_first', 'sid_1', '{}', 1, 999999)").run();
    studyDb.prepare("INSERT INTO qr_media VALUES ('qm_1', 'usr_first', 'quiz', 'digest1', 'audio/mp3', 500, 'audio.mp3', '{}', '{}', 100, NULL)").run();
    studyDb.prepare("INSERT INTO qr_senses VALUES ('qs_1')").run();
    studyDb.prepare("INSERT INTO qr_feedback VALUES ('qf_1', 'usr_first', 1, 'qs_1', NULL, 'grammar', 'correction', '[]', 100, NULL, NULL, NULL)").run();
    studyDb.prepare("INSERT INTO qr_speech_tasks VALUES ('st_1')").run();
    studyDb.prepare("INSERT INTO qr_speech_attempts VALUES ('sa_1', 'st_1', 'usr_first', 'qm_1', 100, 100, 200, '{}', 'comp', 'complete', '{}', NULL, 150, NULL)").run();

    // Setup Chat Encryption Cipher
    const testKey = btoa('a'.repeat(32));
    const cipher = chatCipher({
      CHAT_ENCRYPTION_KEY: testKey,
      CHAT_ENCRYPTION_KEY_ID: 'v1'
    });
    assert.ok(cipher);

    // Direct room between usr_first and usr_second
    const oldRoomId = 'direct:usr_first:usr_second';
    studyDb.prepare("INSERT INTO chat_rooms VALUES ('" + oldRoomId + "', 'direct', NULL, 100)").run();
    studyDb.prepare("INSERT INTO chat_members VALUES ('" + oldRoomId + "', 'usr_first', 0, 0, 0, 0, 0)").run();
    studyDb.prepare("INSERT INTO chat_members VALUES ('" + oldRoomId + "', 'usr_second', 0, 0, 0, 0, 0)").run();

    // Encrypt message body with old room context
    const sealedBody = cipher.seal('Secret Hello from Alice', 'journal:' + oldRoomId + ':body');
    studyDb.prepare("INSERT INTO chat_messages (room_id, sender_id, sender_name, category, body, client_key, created_at) VALUES ('" + oldRoomId + "', 'usr_first', 'Alice', 'personal', ?, 'ckey_1', 100)").run(sealedBody);

    // Setup catalog_documents
    studyDb.prepare("INSERT INTO catalog_documents VALUES ('accounts-group-teachers', '30', ?)").run(JSON.stringify({revision: 1, teacherIds: ['usr_second'], updatedBy: 'usr_second', updatedAt: 100}));
    studyDb.prepare("INSERT INTO catalog_documents VALUES ('feedback-user-limits', 'usr_first', ?)").run(JSON.stringify({limit: 10, updatedAt: 100}));
    studyDb.prepare("INSERT INTO catalog_documents VALUES ('account-invites', 'inv_1', ?)").run(JSON.stringify({groupId: 30, teacherId: 'usr_second', createdBy: 'usr_second', claimedUserId: 'usr_first', pendingRegistrationId: 'reg_1'}));
    studyDb.prepare("INSERT INTO catalog_documents VALUES ('passkey-credentials', 'cred_hash', ?)").run(JSON.stringify({id: 'cred_1', account: 'usr_first', handle: 'preserved_hw_handle', rpID: 'lumiscia.org'}));
    studyDb.prepare("INSERT INTO catalog_documents VALUES ('passkey-challenges', 'tok_1', ?)").run(JSON.stringify({kind: 'register', account: 'usr_first'}));
    studyDb.prepare("INSERT INTO catalog_documents VALUES ('microsoft-identities', 'sub_ms', ?)").run(JSON.stringify({accountId: 'usr_first', registrationId: 'reg_1'}));
    studyDb.prepare("INSERT INTO catalog_documents VALUES ('google-identities', 'sub_g', ?)").run(JSON.stringify({accountId: 'usr_second', registrationId: 'reg_2'}));

    // 2. Perform Migration
    const accountMap = new Map([['usr_first', 1], ['usr_second', 2]]);
    const regMap = new Map([['reg_1', 1], ['reg_2', 2]]);

    await migrateStudyDatabase(studyDb, {accountMap, regMap, cipher});

    const clean = rows => JSON.parse(JSON.stringify(rows));

    // 3. Verify Foreign Keys and Integrity
    const fkErrors = studyDb.prepare('PRAGMA foreign_key_check').all();
    assert.deepEqual(clean(fkErrors), []);
    assert.equal(studyDb.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');

    // Verify account_refs has integer IDs
    assert.deepEqual(clean(studyDb.prepare('SELECT id FROM account_refs ORDER BY id').all()), [{id: 1}, {id: 2}]);

    // Verify profile_members
    assert.deepEqual(clean(studyDb.prepare('SELECT account_id, profile_id FROM profile_members').all()), [{account_id: 1, profile_id: 10}]);

    // Verify class_group_students
    assert.deepEqual(clean(studyDb.prepare('SELECT account_id, group_id, assigned_by FROM class_group_students').all()), [{account_id: 1, group_id: 30, assigned_by: 2}]);

    // Verify exam_instances
    assert.deepEqual(clean(studyDb.prepare('SELECT exam_id, account_id, reviewer_id FROM exam_instances').all()), [{exam_id: 40, account_id: 1, reviewer_id: 2}]);

    // Verify qr_media & qr_feedback
    assert.deepEqual(clean(studyDb.prepare('SELECT id, owner_id FROM qr_media').all()), [{id: 'qm_1', owner_id: 1}]);
    assert.deepEqual(clean(studyDb.prepare('SELECT id, owner_id FROM qr_feedback').all()), [{id: 'qf_1', owner_id: 1}]);

    // Verify catalog_documents remapping
    const teacherDoc = JSON.parse(studyDb.prepare("SELECT value_json FROM catalog_documents WHERE namespace = 'accounts-group-teachers' AND key = '30'").get().value_json);
    assert.deepEqual(teacherDoc.teacherIds, [2]);
    assert.equal(teacherDoc.updatedBy, 2);

    const limitDoc = studyDb.prepare("SELECT key, value_json FROM catalog_documents WHERE namespace = 'feedback-user-limits'").all();
    assert.equal(limitDoc.length, 1);
    assert.equal(limitDoc[0].key, '1');

    const inviteDoc = JSON.parse(studyDb.prepare("SELECT value_json FROM catalog_documents WHERE namespace = 'account-invites' AND key = 'inv_1'").get().value_json);
    assert.equal(inviteDoc.teacherId, 2);
    assert.equal(inviteDoc.createdBy, 2);
    assert.equal(inviteDoc.claimedUserId, 1);
    assert.equal(inviteDoc.pendingRegistrationId, 1);

    const passkeyDoc = JSON.parse(studyDb.prepare("SELECT value_json FROM catalog_documents WHERE namespace = 'passkey-credentials'").get().value_json);
    assert.equal(passkeyDoc.account, '1');
    assert.equal(passkeyDoc.handle, 'preserved_hw_handle');

    const msDoc = JSON.parse(studyDb.prepare("SELECT value_json FROM catalog_documents WHERE namespace = 'microsoft-identities'").get().value_json);
    assert.equal(msDoc.accountId, 1);
    assert.equal(msDoc.registrationId, 1);

    const gDoc = JSON.parse(studyDb.prepare("SELECT value_json FROM catalog_documents WHERE namespace = 'google-identities'").get().value_json);
    assert.equal(gDoc.accountId, 2);
    assert.equal(gDoc.registrationId, 2);

    // Verify Direct Chat Room Rebuild and AEAD Message Decryption Context
    const newRoomId = 'direct:1:2';
    const oldRooms = studyDb.prepare("SELECT id FROM chat_rooms WHERE id = '" + oldRoomId + "'").all();
    assert.equal(oldRooms.length, 0);

    const newRooms = studyDb.prepare("SELECT id FROM chat_rooms WHERE id = '" + newRoomId + "'").all();
    assert.equal(newRooms.length, 1);

    const members = studyDb.prepare("SELECT room_id, account_id FROM chat_members WHERE room_id = '" + newRoomId + "' ORDER BY account_id").all();
    assert.deepEqual(clean(members), [
      {room_id: newRoomId, account_id: '1'},
      {room_id: newRoomId, account_id: '2'}
    ]);

    const msg = studyDb.prepare("SELECT room_id, sender_id, body FROM chat_messages WHERE room_id = '" + newRoomId + "'").get();
    assert.equal(msg.room_id, newRoomId);
    assert.equal(msg.sender_id, '1');

    // Decrypt with NEW room context to prove AEAD authenticated decryption succeeds
    const decrypted = cipher.open(msg.body, 'journal:' + newRoomId + ':body');
    assert.equal(decrypted, 'Secret Hello from Alice');
  } finally {
    studyDb.close();
  }
});

test('R2 Storage Object Migration and Directory Cache Invalidation', async () => {
  const objects = new Map([
    ['gone/usr_first', {body: '1', httpMetadata: {contentType: 'text/plain'}}],
    ['usr_first/account-state.json', {body: JSON.stringify({added: []}), httpMetadata: {contentType: 'application/json'}}],
    ['usr_first/audio_1.mp3', {body: 'audio-bytes', httpMetadata: {contentType: 'audio/mpeg'}, customMetadata: {duration: '10'}}],
    ['directory/accounts.json', {body: '{"accounts":[]}', httpMetadata: {contentType: 'application/json'}}]
  ]);

  const mockBucket = {
    async head(key) {
      return objects.has(key) ? {key} : null;
    },
    async get(key) {
      if (!objects.has(key)) return null;
      return objects.get(key);
    },
    async put(key, body, options = {}) {
      objects.set(key, {body, ...options});
      return true;
    },
    async delete(key) {
      objects.delete(key);
      return true;
    },
    async list({prefix, cursor}) {
      const matched = [];
      for (const key of objects.keys()) {
        if (key.startsWith(prefix)) matched.push({key});
      }
      return {objects: matched, cursor: null};
    }
  };

  const accountMap = new Map([['usr_first', 1], ['usr_second', 2]]);
  const result = await migrateR2StorageObjects(mockBucket, {accountMap});

  assert.equal(result.migrated, 3);
  assert.equal(objects.has('gone/usr_first'), false);
  assert.equal(objects.has('gone/1'), true);
  assert.equal(objects.has('usr_first/account-state.json'), false);
  assert.equal(objects.has('1/account-state.json'), true);
  assert.equal(objects.has('usr_first/audio_1.mp3'), false);
  assert.equal(objects.has('1/audio_1.mp3'), true);
  assert.equal(objects.has('directory/accounts.json'), false);
});
