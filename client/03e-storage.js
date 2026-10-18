    function mediaDb() {
      if (window.DatabaseContext && !window.DatabaseContext.confirmed) return window.DatabaseContext.ready.then(() => mediaDb());
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(window.DatabaseContext?.mediaDatabase || "enquiz-media", 4);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
          if (!db.objectStoreNames.contains("added")) db.createObjectStore("added");
          if (!db.objectStoreNames.contains("stash")) db.createObjectStore("stash");
          if (!db.objectStoreNames.contains("songs")) db.createObjectStore("songs");
        };
        req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
        req.onerror = () => reject(req.error);
      });
    }
    function idbPutFile(id, file) {
      if (viewAccount || viewSwitching) return Promise.resolve();
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").put({ blob: file, name: file.name, type: file.type || "" }, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    }
    function idbGetFile(id) {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readonly");
        const req = tx.objectStore("files").get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }));
    }
    function idbPutSongs(list) {
      if (viewAccount || viewSwitching) return Promise.resolve();
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains("songs")) { resolve(); return; }
        const tx = db.transaction("songs", "readwrite");
        tx.objectStore("songs").put(list, "list");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })).catch(() => {});
    }
    function idbGetSongs() {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains("songs")) { resolve(null); return; }
        const req = db.transaction("songs", "readonly").objectStore("songs").get("list");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })).catch(() => null);
    }
    function idbPutAdded(list) {
      if (viewAccount || viewSwitching) return Promise.resolve();
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction("added", "readwrite");
        tx.objectStore("added").put(list, "list");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })).catch(() => {});
    }
    function idbGetAdded() {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains("added")) { resolve(null); return; }
        const req = db.transaction("added", "readonly").objectStore("added").get("list");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })).catch(() => null);
    }
    function idbDeleteFile(id) {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    }
    function idbPutStash(snap) {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction("stash", "readwrite");
        tx.objectStore("stash").put(snap, "developer");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("stash"));
      }));
    }
    function idbGetStash() {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains("stash")) { resolve(null); return; }
        const req = db.transaction("stash", "readonly").objectStore("stash").get("developer");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error("stash"));
      }));
    }
    function idbDeleteStash() {
      return mediaDb().then((db) => new Promise((resolve) => {
        if (!db.objectStoreNames.contains("stash")) { resolve(); return; }
        const tx = db.transaction("stash", "readwrite");
        tx.objectStore("stash").delete("developer");
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      })).catch(() => {});
    }
