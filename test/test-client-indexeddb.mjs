import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractFunctions} from './helpers/extract-function.mjs';

const storageSource = fs.readFileSync('client/03e-storage.js', 'utf8');
const STORAGE_FUNCTION_NAMES = [
  'mediaDb',
  'idbPutFile',
  'idbGetFile',
  'idbDeleteFile',
  'idbPutSongs',
  'idbGetSongs',
  'idbPutAdded',
  'idbGetAdded',
  'idbPutStash',
  'idbGetStash',
  'idbDeleteStash'
];

const extractedStorageCode = extractFunctions(storageSource, ...STORAGE_FUNCTION_NAMES);

function createMockIndexedDB({quotaExceededStore = null, failOnRead = false} = {}) {
  const dbs = new Map();

  class MockObjectStore {
    constructor(data, name) {
      this.data = data;
      this.name = name;
    }

    put(value, key) {
      if (quotaExceededStore === this.name) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      this.data.set(key, value);
      const req = {onsuccess: null, onerror: null, result: key};
      queueMicrotask(() => req.onsuccess?.());
      return req;
    }

    get(key) {
      const req = {onsuccess: null, onerror: null, result: undefined, error: null};
      queueMicrotask(() => {
        if (failOnRead) {
          req.error = new DOMException('Read failed', 'UnknownError');
          req.onerror?.();
        } else {
          req.result = this.data.get(key);
          req.onsuccess?.();
        }
      });
      return req;
    }

    delete(key) {
      this.data.delete(key);
      const req = {onsuccess: null, onerror: null, result: undefined};
      queueMicrotask(() => req.onsuccess?.());
      return req;
    }
  }

  class MockTransaction {
    constructor(db, storeNames, mode) {
      this.db = db;
      this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
      this.mode = mode;
      this.error = null;
      this.oncomplete = null;
      this.onerror = null;
      queueMicrotask(() => {
        if (!this.error) {
          this.oncomplete?.();
        } else {
          this.onerror?.();
        }
      });
    }

    objectStore(name) {
      if (!this.db._stores.has(name)) {
        throw new DOMException(`Store not found: ${name}`, 'NotFoundError');
      }
      const store = new MockObjectStore(this.db._stores.get(name), name);
      const origPut = store.put.bind(store);
      store.put = (value, key) => {
        try {
          return origPut(value, key);
        } catch (err) {
          this.error = err;
          throw err;
        }
      };
      return store;
    }
  }

  class MockIDBDatabase {
    constructor(name, version) {
      this.name = name;
      this.version = version;
      this._stores = new Map();
      this.onversionchange = null;
      this.isClosed = false;
    }

    get objectStoreNames() {
      const names = [...this._stores.keys()];
      return {
        contains: (n) => names.includes(n),
        length: names.length,
        item: (i) => names[i]
      };
    }

    createObjectStore(name) {
      if (!this._stores.has(name)) {
        this._stores.set(name, new Map());
      }
      return new MockObjectStore(this._stores.get(name), name);
    }

    transaction(storeNames, mode = 'readonly') {
      return new MockTransaction(this, storeNames, mode);
    }

    close() {
      this.isClosed = true;
    }
  }

  const idbInstance = {
    dbs,
    open(name, version) {
      const req = {onupgradeneeded: null, onsuccess: null, onerror: null, result: null, error: null};
      queueMicrotask(() => {
        let db = dbs.get(name);
        if (!db) {
          db = new MockIDBDatabase(name, version);
          dbs.set(name, db);
          req.result = db;
          req.onupgradeneeded?.();
        } else {
          req.result = db;
        }
        req.onsuccess?.();
      });
      return req;
    }
  };

  return idbInstance;
}

function instantiateStorage(mockIdb, {windowObj = {}, viewAccount = false, viewSwitching = false} = {}) {
  const runner = new Function(
    'window',
    'indexedDB',
    'viewAccount',
    'viewSwitching',
    `
    ${extractedStorageCode}
    return { mediaDb, idbPutFile, idbGetFile, idbDeleteFile, idbPutSongs, idbGetSongs, idbPutAdded, idbGetAdded, idbPutStash, idbGetStash, idbDeleteStash };
  `
  );
  return runner(windowObj, mockIdb, viewAccount, viewSwitching);
}

test('mediaDb initializes database version 4 and registers all required object stores', async () => {
  const mockIdb = createMockIndexedDB();
  const storage = instantiateStorage(mockIdb);

  const db = await storage.mediaDb();
  assert.ok(db);
  assert.equal(db.name, 'enquiz-media');
  assert.equal(db.version, 4);

  // Verify all 4 object stores were created during upgradeneeded
  assert.equal(db.objectStoreNames.contains('files'), true);
  assert.equal(db.objectStoreNames.contains('added'), true);
  assert.equal(db.objectStoreNames.contains('stash'), true);
  assert.equal(db.objectStoreNames.contains('songs'), true);

  // Verify onversionchange automatically closes the database
  assert.equal(db.isClosed, false);
  assert.equal(typeof db.onversionchange, 'function');
  db.onversionchange();
  assert.equal(db.isClosed, true);
});

test('mediaDb synchronizes with window.DatabaseContext readiness and respects custom database names', async () => {
  const mockIdb = createMockIndexedDB();

  let readyResolved = false;
  let triggerReady = null;
  const readyPromise = new Promise((resolve) => {
    triggerReady = () => {
      readyResolved = true;
      resolve();
    };
  });

  const windowObj = {
    DatabaseContext: {
      confirmed: false,
      ready: readyPromise,
      mediaDatabase: 'profile-alpha-media'
    }
  };

  const storage = instantiateStorage(mockIdb, {windowObj});

  let dbPromiseDone = false;
  const dbPromise = storage.mediaDb().then((db) => {
    dbPromiseDone = true;
    return db;
  });

  // Verify mediaDb did not complete before DatabaseContext.confirmed was ready
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(dbPromiseDone, false);
  assert.equal(readyResolved, false);

  // Trigger DatabaseContext readiness
  windowObj.DatabaseContext.confirmed = true;
  triggerReady();

  const db = await dbPromise;
  assert.equal(dbPromiseDone, true);
  assert.equal(readyResolved, true);
  assert.equal(db.name, 'profile-alpha-media');
});

test('idbPutSongs and idbGetSongs persist songs offline and respect student view guards', async () => {
  const mockIdb = createMockIndexedDB();

  // 1. Regular user stores songs in offline cache
  const storage = instantiateStorage(mockIdb);
  const songsList = [
    {id: 'song-1', title: 'Yesterday', artist: 'Beatles'},
    {id: 'song-2', title: 'Bohemian Rhapsody', artist: 'Queen'}
  ];

  await storage.idbPutSongs(songsList);
  const retrievedSongs = await storage.idbGetSongs();
  assert.deepEqual(retrievedSongs, songsList);

  // 2. Teacher viewing student account (viewAccount = true) does not pollute local offline store
  const teacherViewingStorage = instantiateStorage(mockIdb, {viewAccount: true});
  const studentSongs = [{id: 'student-song-99', title: 'Student Song'}];
  await teacherViewingStorage.idbPutSongs(studentSongs);

  // The local store still contains the teacher's original songsList
  const untouchedSongs = await storage.idbGetSongs();
  assert.deepEqual(untouchedSongs, songsList);

  // 3. Account switching in progress (viewSwitching = true) skips writes
  const switchingStorage = instantiateStorage(mockIdb, {viewSwitching: true});
  await switchingStorage.idbPutSongs([{id: 'song-ignore', title: 'Ignore'}]);
  const stillUntouched = await storage.idbGetSongs();
  assert.deepEqual(stillUntouched, songsList);
});

test('idbPutAdded and idbGetAdded persist dictionary cards offline and respect view guards', async () => {
  const mockIdb = createMockIndexedDB();

  // 1. Regular user stores added cards list
  const storage = instantiateStorage(mockIdb);
  const cardsList = [
    {id: 101, en: 'ephemeral', ru: 'мимолётный'},
    {id: 102, en: 'serendipity', ru: 'интуитивная прозорливость'}
  ];

  await storage.idbPutAdded(cardsList);
  const retrievedCards = await storage.idbGetAdded();
  assert.deepEqual(retrievedCards, cardsList);

  // 2. Teacher viewing student account (viewAccount = true) does not overwrite added cards
  const teacherStorage = instantiateStorage(mockIdb, {viewAccount: true});
  await teacherStorage.idbPutAdded([{id: 999, en: 'student-word'}]);
  const preservedCards = await storage.idbGetAdded();
  assert.deepEqual(preservedCards, cardsList);

  // 3. Switching view (viewSwitching = true) skips writes
  const switchingStorage = instantiateStorage(mockIdb, {viewSwitching: true});
  await switchingStorage.idbPutAdded([{id: 888, en: 'switching-word'}]);
  const stillPreserved = await storage.idbGetAdded();
  assert.deepEqual(stillPreserved, cardsList);
});

test('idbPutFile, idbGetFile, and idbDeleteFile manage media file cache lifecycle', async () => {
  const mockIdb = createMockIndexedDB();
  const storage = instantiateStorage(mockIdb);

  const fakeBlob = new Uint8Array([0, 1, 2, 3]);
  const audioFile = {
    name: 'lesson-audio.mp3',
    type: 'audio/mpeg',
    blob: fakeBlob
  };

  // 1. Put file
  await storage.idbPutFile('audio-101', audioFile);

  // 2. Get file
  const cachedFile = await storage.idbGetFile('audio-101');
  assert.ok(cachedFile);
  assert.equal(cachedFile.name, 'lesson-audio.mp3');
  assert.equal(cachedFile.type, 'audio/mpeg');
  assert.deepEqual(cachedFile.blob, audioFile);

  // 3. Delete file
  await storage.idbDeleteFile('audio-101');
  const deletedFile = await storage.idbGetFile('audio-101');
  assert.equal(deletedFile, null);

  // 4. viewAccount = true skips file put
  const teacherStorage = instantiateStorage(mockIdb, {viewAccount: true});
  await teacherStorage.idbPutFile('audio-202', audioFile);
  const unwrittenFile = await storage.idbGetFile('audio-202');
  assert.equal(unwrittenFile, null);
});

test('idbPutStash, idbGetStash, and idbDeleteStash handle developer state snapshots', async () => {
  const mockIdb = createMockIndexedDB();
  const storage = instantiateStorage(mockIdb);

  const snapshot = {
    timestamp: 1730000000,
    theme: 'almond-blossom',
    drafts: {notes: 'Draft note in progress'}
  };

  // 1. Put stash snapshot
  await storage.idbPutStash(snapshot);

  // 2. Retrieve stash snapshot
  const retrievedStash = await storage.idbGetStash();
  assert.deepEqual(retrievedStash, snapshot);

  // 3. Delete stash snapshot
  await storage.idbDeleteStash();
  const deletedStash = await storage.idbGetStash();
  assert.equal(deletedStash, null);
});

test('idb storage functions handle QuotaExceededError and database errors gracefully', async () => {
  // 1. QuotaExceededError on idbPutFile propagates rejection to caller
  const quotaIdb = createMockIndexedDB({quotaExceededStore: 'files'});
  const quotaStorage = instantiateStorage(quotaIdb);

  await assert.rejects(
    () => quotaStorage.idbPutFile('huge-file', {name: 'huge.mp3', type: 'audio/mpeg'}),
    (err) => err.name === 'QuotaExceededError'
  );

  // 2. QuotaExceededError on idbPutSongs is caught gracefully without throwing
  const quotaSongsIdb = createMockIndexedDB({quotaExceededStore: 'songs'});
  const quotaSongsStorage = instantiateStorage(quotaSongsIdb);
  // Should resolve without rejecting
  await quotaSongsStorage.idbPutSongs([{id: 'overflow-song'}]);

  // 3. QuotaExceededError on idbPutAdded is caught gracefully without throwing
  const quotaAddedIdb = createMockIndexedDB({quotaExceededStore: 'added'});
  const quotaAddedStorage = instantiateStorage(quotaAddedIdb);
  // Should resolve without rejecting
  await quotaAddedStorage.idbPutAdded([{id: 1, en: 'overflow-card'}]);

  // 4. Storage read failure on idbGetSongs resolves to null
  const failReadIdb = createMockIndexedDB({failOnRead: true});
  const failReadStorage = instantiateStorage(failReadIdb);
  const songsResult = await failReadStorage.idbGetSongs();
  assert.equal(songsResult, null);

  // 5. Storage read failure on idbGetAdded resolves to null
  const addedResult = await failReadStorage.idbGetAdded();
  assert.equal(addedResult, null);
});
