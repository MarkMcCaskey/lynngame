window.fakeStorage = {
  _data: {},
  setItem: function (id, val) { return this._data[id] = String(val); },
  getItem: function (id) { return this._data.hasOwnProperty(id) ? this._data[id] : undefined; },
  removeItem: function (id) { return delete this._data[id]; },
  clear: function () { return this._data = {}; }
};

// Per-game namespaced storage. Pass a gameId so keys don't collide across
// the three games packaged in this PWA (e.g. "bubble:gameState").
function LocalStorageManager(gameId) {
  if (!gameId) throw new Error("LocalStorageManager requires a gameId");
  this.gameId = gameId;
  this.bestScoreKey  = gameId + ":bestScore";
  this.gameStateKey  = gameId + ":gameState";
  this.undoStackKey  = gameId + ":undoStack";
  this.redoStackKey  = gameId + ":redoStack";

  var supported = this.localStorageSupported();
  this.storage = supported ? window.localStorage : window.fakeStorage;
}

LocalStorageManager.prototype.localStorageSupported = function () {
  try {
    var s = window.localStorage;
    s.setItem("__test__", "1"); s.removeItem("__test__");
    return true;
  } catch (e) { return false; }
};

LocalStorageManager.prototype._mirrorSet = function (k, v) {
  if (window.IDBMirror) window.IDBMirror.set(k, v);
};
LocalStorageManager.prototype._mirrorRemove = function (k) {
  if (window.IDBMirror) window.IDBMirror.remove(k);
};

LocalStorageManager.prototype.getBestScore = function () {
  var v = this.storage.getItem(this.bestScoreKey);
  return v ? parseInt(v, 10) || 0 : 0;
};
LocalStorageManager.prototype.setBestScore = function (score) {
  var s = String(score);
  this.storage.setItem(this.bestScoreKey, s);
  this._mirrorSet(this.bestScoreKey, s);
};

LocalStorageManager.prototype.getGameState = function () {
  var raw = this.storage.getItem(this.gameStateKey);
  return raw ? JSON.parse(raw) : null;
};
LocalStorageManager.prototype.setGameState = function (state) {
  var s = JSON.stringify(state);
  this.storage.setItem(this.gameStateKey, s);
  this._mirrorSet(this.gameStateKey, s);
};
LocalStorageManager.prototype.clearGameState = function () {
  this.storage.removeItem(this.gameStateKey);
  this._mirrorRemove(this.gameStateKey);
};

LocalStorageManager.prototype.getUndoStack = function () {
  var raw = this.storage.getItem(this.undoStackKey);
  if (!raw) return [];
  try { var p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  catch (e) { return []; }
};
LocalStorageManager.prototype.setUndoStack = function (stack) {
  var s = JSON.stringify(stack);
  this.storage.setItem(this.undoStackKey, s);
  this._mirrorSet(this.undoStackKey, s);
};
LocalStorageManager.prototype.getRedoStack = function () {
  var raw = this.storage.getItem(this.redoStackKey);
  if (!raw) return [];
  try { var p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  catch (e) { return []; }
};
LocalStorageManager.prototype.setRedoStack = function (stack) {
  var s = JSON.stringify(stack);
  this.storage.setItem(this.redoStackKey, s);
  this._mirrorSet(this.redoStackKey, s);
};
LocalStorageManager.prototype.clearHistoryStacks = function () {
  this.storage.removeItem(this.undoStackKey);
  this.storage.removeItem(this.redoStackKey);
  this._mirrorRemove(this.undoStackKey);
  this._mirrorRemove(this.redoStackKey);
};
