// Cross-database migration orchestration for account integer ID transition.
// Applied to Cloudflare D1 account database (DB), study database (STUDY_DB), and MEDIA storage.

import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACCOUNT_MIGRATION_PATH = resolve(__dirname, '../migrations/account/001_integer_account_ids.sql');
const STUDY_MIGRATION_PATH = resolve(__dirname, '../migrations/learning/009_account_integer_ids.sql');

export async function migrateAccountDatabase(db) {
  const sql = readFileSync(ACCOUNT_MIGRATION_PATH, 'utf8');
  if (typeof db.exec === 'function') {
    db.exec(sql);
  } else if (typeof db.executescript === 'function') {
    db.executescript(sql);
  } else if (typeof db.atomic === 'function') {
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
      .map(s => ({sql: s + ';', args: []}));
    await db.atomic(statements);
  }
}

export async function extractLegacyAccountMappings(db) {
  let rows = [];
  if (typeof db.prepare === 'function') {
    rows = db.prepare('SELECT old_id, new_id FROM legacy_account_ids').all();
  } else if (typeof db.read === 'function') {
    rows = await db.read('SELECT old_id, new_id FROM legacy_account_ids');
  }
  const accountMap = new Map();
  for (const row of rows) {
    accountMap.set(String(row.old_id), Number(row.new_id));
  }

  let regRows = [];
  try {
    if (typeof db.prepare === 'function') {
      regRows = db.prepare('SELECT old_id, new_id FROM legacy_registration_ids').all();
    } else if (typeof db.read === 'function') {
      regRows = await db.read('SELECT old_id, new_id FROM legacy_registration_ids');
    }
  } catch {}
  const regMap = new Map();
  for (const row of regRows) {
    regMap.set(String(row.old_id), Number(row.new_id));
  }

  return {accountMap, regMap};
}

export async function migrateStudyDatabase(studyDb, {accountMap, regMap, cipher = null} = {}) {
  // 1. Populate legacy_account_ids in STUDY_DB
  const populateCommands = [
    'CREATE TABLE IF NOT EXISTS legacy_account_ids (old_id TEXT PRIMARY KEY, new_id INTEGER UNIQUE NOT NULL CHECK (new_id > 0));',
    'CREATE TABLE IF NOT EXISTS legacy_registration_ids (old_id TEXT PRIMARY KEY, new_id INTEGER UNIQUE NOT NULL CHECK (new_id > 0));'
  ];
  if (typeof studyDb.exec === 'function') {
    for (const cmd of populateCommands) studyDb.exec(cmd);
    const insertAccount = studyDb.prepare('INSERT OR REPLACE INTO legacy_account_ids (old_id, new_id) VALUES (?, ?)');
    for (const [oldId, newId] of accountMap.entries()) {
      insertAccount.run(oldId, newId);
    }
    const insertReg = studyDb.prepare('INSERT OR REPLACE INTO legacy_registration_ids (old_id, new_id) VALUES (?, ?)');
    for (const [oldId, newId] of regMap.entries()) {
      insertReg.run(oldId, newId);
    }
  }

  // 2. Execute 009_account_integer_ids.sql on STUDY_DB
  const sql = readFileSync(STUDY_MIGRATION_PATH, 'utf8');
  if (typeof studyDb.exec === 'function') {
    studyDb.exec(sql);
  }

  // 3. Remap catalog_documents namespaces
  await remapCatalogDocuments(studyDb, {accountMap, regMap});

  // 4. Rebuild direct chat rooms and preserve AEAD decryption context
  await rebuildDirectChatRooms(studyDb, {accountMap, cipher});
}

export async function remapCatalogDocuments(db, {accountMap, regMap}) {
  const getRows = (sql, params = []) => {
    if (typeof db.prepare === 'function') return db.prepare(sql).all(...params);
    return db.read(sql, params);
  };
  const runSql = (sql, params = []) => {
    if (typeof db.prepare === 'function') return db.prepare(sql).run(...params);
    return db.atomic([{sql, args: params.map(value => ({type: typeof value === 'number' ? 'integer' : 'text', value: String(value)}))}]);
  };

  // 3.1 accounts-group-teachers
  const teacherRows = getRows("SELECT key, value_json FROM catalog_documents WHERE namespace = 'accounts-group-teachers'");
  for (const row of teacherRows) {
    try {
      const parsed = JSON.parse(row.value_json);
      let changed = false;
      if (Array.isArray(parsed.teacherIds)) {
        const remappedTeachers = parsed.teacherIds.map(tid => {
          const next = accountMap.get(String(tid));
          if (next !== undefined && next !== tid) {
            changed = true;
            return next;
          }
          return tid;
        });
        if (changed) parsed.teacherIds = remappedTeachers;
      }
      if (parsed.updatedBy != null) {
        const nextUpdatedBy = accountMap.get(String(parsed.updatedBy));
        if (nextUpdatedBy !== undefined && nextUpdatedBy !== parsed.updatedBy) {
          changed = true;
          parsed.updatedBy = nextUpdatedBy;
        }
      }
      if (changed) {
        runSql("UPDATE catalog_documents SET value_json = ? WHERE namespace = 'accounts-group-teachers' AND key = ?", [JSON.stringify(parsed), row.key]);
      }
    } catch {}
  }

  // 3.2 feedback-user-limits
  const limitRows = getRows("SELECT key, value_json FROM catalog_documents WHERE namespace = 'feedback-user-limits'");
  for (const row of limitRows) {
    const nextKey = accountMap.get(String(row.key));
    if (nextKey !== undefined && String(nextKey) !== String(row.key)) {
      runSql("DELETE FROM catalog_documents WHERE namespace = 'feedback-user-limits' AND key = ?", [row.key]);
      runSql("INSERT OR REPLACE INTO catalog_documents (namespace, key, value_json) VALUES ('feedback-user-limits', ?, ?)", [String(nextKey), row.value_json]);
    }
  }

  // 3.3 account-invites
  const inviteRows = getRows("SELECT key, value_json FROM catalog_documents WHERE namespace = 'account-invites'");
  for (const row of inviteRows) {
    try {
      const parsed = JSON.parse(row.value_json);
      let changed = false;
      if (parsed.teacherId != null) {
        const nextTeacher = accountMap.get(String(parsed.teacherId));
        if (nextTeacher !== undefined && nextTeacher !== parsed.teacherId) {
          changed = true;
          parsed.teacherId = nextTeacher;
        }
      }
      if (parsed.createdBy != null) {
        const nextCreator = accountMap.get(String(parsed.createdBy));
        if (nextCreator !== undefined && nextCreator !== parsed.createdBy) {
          changed = true;
          parsed.createdBy = nextCreator;
        }
      }
      if (parsed.claimedUserId != null) {
        const nextClaimed = accountMap.get(String(parsed.claimedUserId));
        if (nextClaimed !== undefined && nextClaimed !== parsed.claimedUserId) {
          changed = true;
          parsed.claimedUserId = nextClaimed;
        }
      }
      if (parsed.pendingRegistrationId != null) {
        const nextReg = regMap.get(String(parsed.pendingRegistrationId));
        if (nextReg !== undefined && nextReg !== parsed.pendingRegistrationId) {
          changed = true;
          parsed.pendingRegistrationId = nextReg;
        }
      }
      if (changed) {
        runSql("UPDATE catalog_documents SET value_json = ? WHERE namespace = 'account-invites' AND key = ?", [JSON.stringify(parsed), row.key]);
      }
    } catch {}
  }

  // 3.4 passkey-credentials
  const credRows = getRows("SELECT key, value_json FROM catalog_documents WHERE namespace = 'passkey-credentials'");
  for (const row of credRows) {
    try {
      const parsed = JSON.parse(row.value_json);
      if (parsed.account != null) {
        const nextAccount = accountMap.get(String(parsed.account));
        if (nextAccount !== undefined && String(nextAccount) !== String(parsed.account)) {
          parsed.account = String(nextAccount);
          runSql("UPDATE catalog_documents SET value_json = ? WHERE namespace = 'passkey-credentials' AND key = ?", [JSON.stringify(parsed), row.key]);
        }
      }
    } catch {}
  }

  // 3.5 passkey-challenges
  const chalRows = getRows("SELECT key, value_json FROM catalog_documents WHERE namespace = 'passkey-challenges'");
  for (const row of chalRows) {
    try {
      const parsed = JSON.parse(row.value_json);
      if (parsed.account) {
        const nextAccount = accountMap.get(String(parsed.account));
        if (nextAccount !== undefined && String(nextAccount) !== String(parsed.account)) {
          parsed.account = String(nextAccount);
          runSql("UPDATE catalog_documents SET value_json = ? WHERE namespace = 'passkey-challenges' AND key = ?", [JSON.stringify(parsed), row.key]);
        }
      }
    } catch {}
  }

  // 3.6 & 3.7 microsoft-identities & google-identities
  for (const ns of ['microsoft-identities', 'google-identities']) {
    const idRows = getRows("SELECT key, value_json FROM catalog_documents WHERE namespace = ?", [ns]);
    for (const row of idRows) {
      try {
        const parsed = JSON.parse(row.value_json);
        let changed = false;
        if (parsed.accountId != null) {
          const nextAccount = accountMap.get(String(parsed.accountId));
          if (nextAccount !== undefined && nextAccount !== parsed.accountId) {
            changed = true;
            parsed.accountId = nextAccount;
          }
        }
        if (parsed.registrationId != null) {
          const nextReg = regMap.get(String(parsed.registrationId));
          if (nextReg !== undefined && nextReg !== parsed.registrationId) {
            changed = true;
            parsed.registrationId = nextReg;
          }
        }
        if (changed) {
          runSql("UPDATE catalog_documents SET value_json = ? WHERE namespace = ? AND key = ?", [JSON.stringify(parsed), ns, row.key]);
        }
      } catch {}
    }
  }
}

export async function rebuildDirectChatRooms(db, {accountMap, cipher = null}) {
  const getRows = (sql, params = []) => {
    if (typeof db.prepare === 'function') return db.prepare(sql).all(...params);
    return db.read(sql, params);
  };
  const runSql = (sql, params = []) => {
    if (typeof db.prepare === 'function') return db.prepare(sql).run(...params);
    return db.atomic([{sql, args: params.map(value => ({type: typeof value === 'number' ? 'integer' : 'text', value: String(value)}))}]);
  };

  const directRooms = getRows("SELECT id, kind, group_id, created_at FROM chat_rooms WHERE kind = 'direct'");
  for (const room of directRooms) {
    const parts = room.id.split(':');
    if (parts.length !== 3 || parts[0] !== 'direct') continue;
    const oldA = parts[1], oldB = parts[2];
    const newA = accountMap.get(oldA) ?? oldA;
    const newB = accountMap.get(oldB) ?? oldB;
    const sorted = [newA, newB].sort((x, y) => Number(x) - Number(y));
    const newRoomId = 'direct:' + sorted.join(':');

    if (newRoomId === room.id) continue;

    // 1. Insert new room
    runSql('INSERT OR IGNORE INTO chat_rooms(id, kind, group_id, created_at) VALUES(?, ?, ?, ?)', [newRoomId, room.kind, room.group_id, room.created_at]);

    // 2. Update chat_members
    const members = getRows('SELECT account_id, joined_seq, group_epoch, read_personal, read_learning, muted FROM chat_members WHERE room_id = ?', [room.id]);
    for (const member of members) {
      const newAccountId = String(accountMap.get(String(member.account_id)) ?? member.account_id);
      runSql('INSERT OR REPLACE INTO chat_members(room_id, account_id, joined_seq, group_epoch, read_personal, read_learning, muted) VALUES(?, ?, ?, ?, ?, ?, ?)',
        [newRoomId, newAccountId, member.joined_seq, member.group_epoch, member.read_personal, member.read_learning, member.muted]);
    }
    runSql('DELETE FROM chat_members WHERE room_id = ?', [room.id]);

    // 3. Update chat_messages with AEAD cipher preservation
    const messages = getRows('SELECT id, sender_id, sender_name, category, body, reply_to, assignment_id, client_key, created_at FROM chat_messages WHERE room_id = ?', [room.id]);
    for (const msg of messages) {
      const newSenderId = String(accountMap.get(String(msg.sender_id)) ?? msg.sender_id);
      let body = msg.body;
      if (cipher && typeof body === 'string' && body.startsWith('chatenc:')) {
        try {
          const decrypted = cipher.open(body, 'journal:' + room.id + ':body');
          body = cipher.seal(decrypted, 'journal:' + newRoomId + ':body');
        } catch {}
      }
      runSql('UPDATE chat_messages SET room_id = ?, sender_id = ?, body = ? WHERE id = ?', [newRoomId, newSenderId, body, msg.id]);
    }

    // 4. Delete old room
    runSql('DELETE FROM chat_rooms WHERE id = ?', [room.id]);
  }
}

export async function migrateR2StorageObjects(mediaBucket, {accountMap}) {
  if (!mediaBucket) return {migrated: 0, errors: 0};
  let count = 0;

  for (const [oldId, newId] of accountMap.entries()) {
    if (String(oldId) === String(newId)) continue;

    // 1. gone/${old_id}
    const goneKey = 'gone/' + oldId;
    try {
      const goneHead = await mediaBucket.head(goneKey);
      if (goneHead) {
        await mediaBucket.put('gone/' + newId, '1', {httpMetadata: {contentType: 'text/plain'}});
        await mediaBucket.delete(goneKey);
        count++;
      }
    } catch {}

    // 2. ${old_id}/account-state.json
    const stateKey = oldId + '/account-state.json';
    try {
      const stateObj = await mediaBucket.get(stateKey);
      if (stateObj) {
        await mediaBucket.put(newId + '/account-state.json', stateObj.body, {httpMetadata: stateObj.httpMetadata});
        await mediaBucket.delete(stateKey);
        count++;
      }
    } catch {}

    // 3. Prefix objects ${old_id}/*
    try {
      const prefix = oldId + '/';
      let cursor = undefined;
      do {
        const page = await mediaBucket.list({prefix, cursor});
        for (const obj of page.objects || []) {
          if (obj.key === stateKey) continue;
          const newKey = newId + '/' + obj.key.slice(prefix.length);
          const source = await mediaBucket.get(obj.key);
          if (source) {
            await mediaBucket.put(newKey, source.body, {
              httpMetadata: source.httpMetadata,
              customMetadata: source.customMetadata
            });
            await mediaBucket.delete(obj.key);
            count++;
          }
        }
        cursor = page.cursor;
      } while (cursor);
    } catch {}
  }

  // Invalidate cached directory in R2
  try {
    await mediaBucket.delete('directory/accounts.json');
  } catch {}

  return {migrated: count, errors: 0};
}
