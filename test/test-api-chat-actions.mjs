import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {durableChatWorker} from '../src/chat-worker.mjs';
import {messagesWorker} from '../src/learning-messages-worker.mjs';
import {MessageService} from '../src/learning-messages.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';

function setupGlobalCache() {
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(key) {
        return store.get(key) || null;
      },
      async put(key, res) {
        store.set(key, res);
      }
    }
  };
  return {
    set: (key, res) => store.set(key, res),
    clear: () => store.clear()
  };
}

function createMessagesFixture() {
  const sql = new DatabaseSync(':memory:');
  const cleanArg = (a) =>
    a && typeof a === 'object' && 'type' in a
      ? a.type === 'null'
        ? null
        : ['integer', 'float'].includes(a.type)
        ? Number(a.value)
        : a.value
      : typeof a === 'number' && Number.isInteger(a)
      ? BigInt(a)
      : a;

  const db = {
    read: async (q, a = []) => sql.prepare(q).all(...a.map(cleanArg)),
    atomic: async (commands) => {
      sql.exec('BEGIN');
      try {
        for (const c of commands) sql.prepare(c.sql).run(...(c.args || []).map(cleanArg));
        sql.exec('COMMIT');
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    }
  };

  let currentActor = null;
  const worker = messagesWorker({
    mode: 'production',
    authenticate: async () => currentActor,
    studyDatabase: () => db,
    directory: async () => []
  });

  const env = {
    STAGE_ENABLED: 'true',
    STORAGE_MODE: 'production',
    MESSAGES_ENABLED: 'true',
    STAGE_ALLOWED_HOST: 'stage.example',
    CONTENT_ALLOWED_HOST: 'stage.example',
    STAGE_WRITES: 'true',
    DB: {prepare: () => ({all: async () => ({results: []})})}
  };

  return {
    sql,
    db,
    env,
    worker,
    setActor: (actor) => {
      currentActor = actor;
    },
    close: () => sql.close()
  };
}

function createFeedbackFixture() {
  const sql = new DatabaseSync(':memory:');
  const cleanArg = (a) =>
    a && typeof a === 'object' && 'type' in a
      ? a.type === 'null'
        ? null
        : ['integer', 'float'].includes(a.type)
        ? Number(a.value)
        : a.value
      : typeof a === 'number' && Number.isInteger(a)
      ? BigInt(a)
      : a;

  const db = {
    read: async (q, a = []) => sql.prepare(q).all(...a.map(cleanArg)),
    atomic: async () => {}
  };

  const accountDb = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return null;
        },
        async run() {
          return {};
        },
        async all() {
          return [];
        }
      };
    }
  };

  const mediaStore = new Map();
  let currentActor = null;

  const env = {
    STAGE_ENABLED: 'true',
    STAGE_ALLOWED_HOST: 'stage.example',
    STAGE_WRITES: 'true',
    ACCOUNT_MUTATIONS_ENABLED: 'true',
    ACCOUNT_QUERY_LIMIT_ENABLED: 'false',
    DB: accountDb,
    MEDIA: {
      async get(key) {
        if (!mediaStore.has(key)) return null;
        const item = mediaStore.get(key);
        return {
          body: item.bytes,
          httpMetadata: {contentType: item.contentType}
        };
      }
    }
  };

  const app = integratedWorker({
    authenticate: async () => currentActor,
    studyDatabase: () => db
  });

  return {
    sql,
    env,
    app,
    mediaStore,
    setActor: (actor) => {
      currentActor = actor;
    },
    close: () => sql.close()
  };
}

test('Chat V2 interceptor returns HTTP 410 for legacy chat endpoints', async () => {
  const app = durableChatWorker(
    {
      async fetch() {
        return new Response('base app');
      }
    },
    {
      authenticate: async () => ({id: 'actor-1', role: 'USER'})
    }
  );

  const env = {
    CHAT_V2_ENABLED: 'true',
    CONTENT_ALLOWED_HOST: 'chat.example',
    STORAGE_MODE: 'production'
  };

  // 1. POST /api/messages/mute -> 410
  const muteRes = await app.fetch(
    new Request('https://chat.example/api/messages/mute', {
      method: 'POST',
      headers: {Origin: 'https://chat.example', 'Content-Type': 'application/json'},
      body: JSON.stringify({roomId: 'r1', muted: true})
    }),
    env
  );
  assert.equal(muteRes.status, 410);
  const muteData = await muteRes.json();
  assert.equal(muteData.error, 'Reload the page to connect to the new chat.');

  // 2. POST /api/messages/read -> 410
  const readRes = await app.fetch(
    new Request('https://chat.example/api/messages/read', {
      method: 'POST',
      headers: {Origin: 'https://chat.example', 'Content-Type': 'application/json'},
      body: JSON.stringify({roomId: 'r1', category: 'personal', through: 5})
    }),
    env
  );
  assert.equal(readRes.status, 410);
  const readData = await readRes.json();
  assert.equal(readData.error, 'Reload the page to connect to the new chat.');
});

test('POST /api/messages/mute updates room notification preference in database', async () => {
  const f = createMessagesFixture();
  try {
    await new MessageService(f.db, () => []).ensure();

    // Seed direct room and membership
    f.sql.prepare("INSERT INTO chat_rooms(id, kind) VALUES('direct-room-1', 'direct')").run();
    f.sql
      .prepare(`
      INSERT INTO chat_members(room_id, account_id, joined_seq, group_epoch, read_personal, read_learning, muted)
      VALUES('direct-room-1', 'user-42', 0, 0, 0, 0, 0)
    `)
      .run();

    // 1. Unauthenticated -> 401
    f.setActor(null);
    const unauthRes = await f.worker.fetch(
      new Request('https://stage.example/api/messages/mute', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({roomId: 'direct-room-1', muted: true})
      }),
      f.env
    );
    assert.equal(unauthRes.status, 401);
    assert.equal((await unauthRes.json()).error, 'Sign in to open messages.');

    // 2. Authenticated user mutes room -> 200, muted = 1
    f.setActor({id: 'user-42', role: 'USER'});
    const muteRes = await f.worker.fetch(
      new Request('https://stage.example/api/messages/mute', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({roomId: 'direct-room-1', muted: true})
      }),
      f.env
    );
    assert.equal(muteRes.status, 200);
    const muteData = await muteRes.json();
    assert.equal(muteData.saved, true);

    const mutedRow = f.sql
      .prepare("SELECT muted FROM chat_members WHERE room_id = 'direct-room-1' AND account_id = 'user-42'")
      .get();
    assert.equal(mutedRow.muted, 1);

    // 3. Authenticated user unmutes room -> 200, muted = 0
    const unmuteRes = await f.worker.fetch(
      new Request('https://stage.example/api/messages/mute', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({roomId: 'direct-room-1', muted: false})
      }),
      f.env
    );
    assert.equal(unmuteRes.status, 200);
    assert.equal((await unmuteRes.json()).saved, true);

    const unmutedRow = f.sql
      .prepare("SELECT muted FROM chat_members WHERE room_id = 'direct-room-1' AND account_id = 'user-42'")
      .get();
    assert.equal(unmutedRow.muted, 0);

    // 4. Invalid muted type (not a boolean) -> 400
    const invalidRes = await f.worker.fetch(
      new Request('https://stage.example/api/messages/mute', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({roomId: 'direct-room-1', muted: 'yes'})
      }),
      f.env
    );
    assert.equal(invalidRes.status, 400);
    assert.equal((await invalidRes.json()).error, 'Invalid notification setting.');

    // 5. User not in room -> 403
    f.setActor({id: 'stranger-99', role: 'USER'});
    const strangerRes = await f.worker.fetch(
      new Request('https://stage.example/api/messages/mute', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({roomId: 'direct-room-1', muted: true})
      }),
      f.env
    );
    assert.equal(strangerRes.status, 403);
    assert.equal((await strangerRes.json()).error, 'This is a private conversation.');
  } finally {
    f.close();
  }
});

test('POST /api/messages/read marks messages read up to sequence id in chat_members', async () => {
  const f = createMessagesFixture();
  try {
    await new MessageService(f.db, () => []).ensure();

    f.sql.prepare("INSERT INTO chat_rooms(id, kind) VALUES('direct-room-2', 'direct')").run();
    f.sql
      .prepare(`
      INSERT INTO chat_members(room_id, account_id, joined_seq, group_epoch, read_personal, read_learning, muted)
      VALUES('direct-room-2', 'reader-1', 0, 0, 0, 0, 0)
    `)
      .run();

    // Seed messages in both categories
    f.sql
      .prepare(`
      INSERT INTO chat_messages(id, room_id, sender_id, sender_name, category, body, client_key)
      VALUES(10, 'direct-room-2', 'sender-2', 'Sender', 'personal', 'Hi there', 'c1'),
            (20, 'direct-room-2', 'sender-2', 'Sender', 'learning', 'Homework assigned', 'c2')
    `)
      .run();

    f.setActor({id: 'reader-1', role: 'USER'});

    // 1. Mark personal messages read through sequence 10
    const readPersonalRes = await f.worker.fetch(
      new Request('https://stage.example/api/messages/read', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({roomId: 'direct-room-2', category: 'personal', through: 10})
      }),
      f.env
    );
    assert.equal(readPersonalRes.status, 200);
    assert.equal((await readPersonalRes.json()).read, true);

    const memberAfterPersonal = f.sql
      .prepare("SELECT read_personal, read_learning FROM chat_members WHERE room_id = 'direct-room-2' AND account_id = 'reader-1'")
      .get();
    assert.equal(memberAfterPersonal.read_personal, 10);
    assert.equal(memberAfterPersonal.read_learning, 0);

    // 2. Mark learning messages read through sequence 20
    const readLearningRes = await f.worker.fetch(
      new Request('https://stage.example/api/messages/read', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({roomId: 'direct-room-2', category: 'learning', through: 20})
      }),
      f.env
    );
    assert.equal(readLearningRes.status, 200);
    assert.equal((await readLearningRes.json()).read, true);

    const memberAfterLearning = f.sql
      .prepare("SELECT read_personal, read_learning FROM chat_members WHERE room_id = 'direct-room-2' AND account_id = 'reader-1'")
      .get();
    assert.equal(memberAfterLearning.read_personal, 10);
    assert.equal(memberAfterLearning.read_learning, 20);

    // 3. Invalid category -> 400
    const badCatRes = await f.worker.fetch(
      new Request('https://stage.example/api/messages/read', {
        method: 'POST',
        headers: {Origin: 'https://stage.example', 'Content-Type': 'application/json'},
        body: JSON.stringify({roomId: 'direct-room-2', category: 'unknown', through: 20})
      }),
      f.env
    );
    assert.equal(badCatRes.status, 400);
    assert.equal((await badCatRes.json()).error, 'Choose a message category.');
  } finally {
    f.close();
  }
});

test('GET /api/messages/preview-image validates host, authentication, method and returns cached image', async () => {
  const cacheMock = setupGlobalCache();
  try {
    let currentActor = {id: 'actor-10', role: 'USER'};
    const app = durableChatWorker(
      {
        async fetch() {
          return new Response('base app');
        }
      },
      {
        authenticate: async () => currentActor
      }
    );

    const env = {
      CHAT_V2_ENABLED: 'true',
      CONTENT_ALLOWED_HOST: 'chat.example',
      STORAGE_MODE: 'production'
    };

    const validHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const imagePayload = new Uint8Array([255, 216, 255, 224]); // JPEG magic header
    cacheMock.set(
      'https://chat.example/__chat_preview_image/' + validHash,
      new Response(imagePayload, {
        headers: {'Content-Type': 'image/jpeg'}
      })
    );

    // 1. Successful retrieval of cached preview image
    const successRes = await app.fetch(
      new Request('https://chat.example/api/messages/preview-image?id=' + validHash),
      env
    );
    assert.equal(successRes.status, 200);
    assert.equal(successRes.headers.get('Content-Type'), 'image/jpeg');
    assert.equal(successRes.headers.get('Cache-Control'), 'private, max-age=3600');
    assert.equal(successRes.headers.get('X-Content-Type-Options'), 'nosniff');
    const returnedBytes = new Uint8Array(await successRes.arrayBuffer());
    assert.deepEqual(returnedBytes, imagePayload);

    // 2. Unauthenticated request -> 401
    currentActor = null;
    const unauthRes = await app.fetch(
      new Request('https://chat.example/api/messages/preview-image?id=' + validHash),
      env
    );
    assert.equal(unauthRes.status, 401);
    assert.equal((await unauthRes.json()).error, 'Sign in first.');

    // 3. Non-GET method (POST) -> 405
    currentActor = {id: 'actor-10', role: 'USER'};
    const postRes = await app.fetch(
      new Request('https://chat.example/api/messages/preview-image?id=' + validHash, {method: 'POST'}),
      env
    );
    assert.equal(postRes.status, 405);
    assert.equal((await postRes.json()).error, 'Use GET.');

    // 4. Malformed id (not 64-char hex) -> 404
    const badHashRes = await app.fetch(
      new Request('https://chat.example/api/messages/preview-image?id=short-id'),
      env
    );
    assert.equal(badHashRes.status, 404);

    // 5. Valid hash but not present in cache -> 404
    const missingHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const missingRes = await app.fetch(
      new Request('https://chat.example/api/messages/preview-image?id=' + missingHash),
      env
    );
    assert.equal(missingRes.status, 404);

    // 6. Invalid host -> 403
    const badHostRes = await app.fetch(
      new Request('https://foreign.example/api/messages/preview-image?id=' + validHash),
      env
    );
    assert.equal(badHostRes.status, 403);
  } finally {
    cacheMock.clear();
  }
});

test('GET /api/feedback/attachment enforces authentication, role restrictions, key prefix and returns file stream', async () => {
  const f = createFeedbackFixture();
  try {
    const fileBytes = new Uint8Array([71, 73, 70, 56, 57, 97]); // GIF header
    f.mediaStore.set('feedback-attachments/audit-log.gif', {
      bytes: fileBytes,
      contentType: 'image/gif'
    });

    // 1. Unauthenticated -> 401
    f.setActor(null);
    const unauthRes = await f.app.fetch(
      new Request('https://stage.example/api/feedback/attachment?key=feedback-attachments/audit-log.gif'),
      f.env,
      {}
    );
    assert.equal(unauthRes.status, 401);
    assert.equal((await unauthRes.json()).error, 'Sign in first.');

    // 2. Student (USER role) -> 403
    f.setActor({id: 'student-9', role: 'USER'});
    const studentRes = await f.app.fetch(
      new Request('https://stage.example/api/feedback/attachment?key=feedback-attachments/audit-log.gif'),
      f.env,
      {}
    );
    assert.equal(studentRes.status, 403);
    assert.equal((await studentRes.json()).error, 'You cannot do that.');

    // 3. Teacher/Developer (ADMIN role) accessing valid attachment -> 200
    f.setActor({id: 'admin-1', role: 'ADMIN'});
    const successRes = await f.app.fetch(
      new Request('https://stage.example/api/feedback/attachment?key=feedback-attachments/audit-log.gif'),
      f.env,
      {}
    );
    assert.equal(successRes.status, 200);
    assert.equal(successRes.headers.get('Content-Type'), 'image/gif');
    assert.equal(successRes.headers.get('Content-Disposition'), 'inline');
    assert.equal(successRes.headers.get('Cache-Control'), 'private, max-age=86400');
    const receivedBytes = new Uint8Array(await successRes.arrayBuffer());
    assert.deepEqual(receivedBytes, fileBytes);

    // 4. Invalid key prefix (path traversal / unauthorized directory) -> 400
    const badPrefixRes = await f.app.fetch(
      new Request('https://stage.example/api/feedback/attachment?key=system/secret.key'),
      f.env,
      {}
    );
    assert.equal(badPrefixRes.status, 400);
    assert.equal((await badPrefixRes.json()).error, 'Invalid attachment key.');

    // 5. Empty key parameter -> 400
    const emptyKeyRes = await f.app.fetch(
      new Request('https://stage.example/api/feedback/attachment?key='),
      f.env,
      {}
    );
    assert.equal(emptyKeyRes.status, 400);
    assert.equal((await emptyKeyRes.json()).error, 'Invalid attachment key.');

    // 6. Valid prefix but attachment does not exist in MEDIA storage -> 404
    const notFoundRes = await f.app.fetch(
      new Request('https://stage.example/api/feedback/attachment?key=feedback-attachments/non-existent.png'),
      f.env,
      {}
    );
    assert.equal(notFoundRes.status, 404);
    assert.equal((await notFoundRes.json()).error, 'Attachment not found.');
  } finally {
    f.close();
  }
});
