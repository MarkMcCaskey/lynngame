// Mirrors a small set of localStorage keys into IndexedDB so iOS PWAs survive
// localStorage eviction (Safari's ~7-day inactivity sweep clears localStorage
// but is more conservative with IDB, especially with navigator.storage.persist).
//
// Strategy: on save, mirror to IDB asynchronously. On boot, if a key is missing
// from localStorage but present in IDB, hydrate localStorage from IDB.

(function () {
  var DB_NAME = "lynn2048";
  var STORE = "kv";
  var VERSION = 1;
  var MIRRORED_KEYS = ["gameState", "undoStack", "redoStack", "scoreHistory", "bestScore", "settings"];

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error("no idb"));
      var req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function withStore(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        var result = fn(store);
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(key) {
    return withStore("readonly", function (store) {
      return new Promise(function (resolve) {
        var r = store.get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { resolve(undefined); };
      });
    }).then(function (p) { return p; });
  }

  function idbSet(key, value) {
    return withStore("readwrite", function (store) { store.put(value, key); });
  }

  function idbDel(key) {
    return withStore("readwrite", function (store) { store.delete(key); });
  }

  // Hydrate localStorage from IDB for any missing mirrored key.
  function hydrate() {
    if (!window.indexedDB || !window.localStorage) return Promise.resolve();
    var pending = MIRRORED_KEYS.map(function (key) {
      if (window.localStorage.getItem(key) !== null) return Promise.resolve();
      return openDB()
        .then(function (db) {
          return new Promise(function (resolve) {
            var tx = db.transaction(STORE, "readonly");
            var r = tx.objectStore(STORE).get(key);
            r.onsuccess = function () { resolve(r.result); };
            r.onerror = function () { resolve(undefined); };
          });
        })
        .then(function (val) {
          if (val !== undefined && val !== null) {
            try { window.localStorage.setItem(key, val); } catch (e) {}
          }
        })
        .catch(function () {});
    });
    return Promise.all(pending);
  }

  function requestPersistence() {
    if (navigator.storage && typeof navigator.storage.persist === "function") {
      navigator.storage.persist().catch(function () {});
    }
  }

  window.IDBMirror = {
    keys: MIRRORED_KEYS,
    set: function (key, value) {
      if (MIRRORED_KEYS.indexOf(key) === -1) return;
      idbSet(key, value).catch(function () {});
    },
    remove: function (key) {
      if (MIRRORED_KEYS.indexOf(key) === -1) return;
      idbDel(key).catch(function () {});
    },
    hydrate: hydrate,
    requestPersistence: requestPersistence
  };
})();
