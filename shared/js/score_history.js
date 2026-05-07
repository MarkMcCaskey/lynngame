// Per-game score history. Pass a gameId so each game keeps its own list.
function ScoreHistory(storage, gameId) {
  if (!gameId) throw new Error("ScoreHistory requires a gameId");
  this.storage = storage;
  this.key = gameId + ":scoreHistory";
  this.cap = 25;
}

ScoreHistory.prototype.list = function () {
  var raw = this.storage.getItem(this.key);
  if (!raw) return [];
  try {
    var p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (e) { return []; }
};

// extras: free-form per-game payload, e.g. { maxTile, movesUsed, cleared }.
ScoreHistory.prototype.add = function (score, extras) {
  var entries = this.list();
  var entry = { score: score, endedAt: new Date().toISOString() };
  if (extras && typeof extras === "object") {
    for (var k in extras) entry[k] = extras[k];
  }
  entries.unshift(entry);
  if (entries.length > this.cap) entries.length = this.cap;
  this.storage.setItem(this.key, JSON.stringify(entries));
  if (window.IDBMirror) window.IDBMirror.set(this.key, this.storage.getItem(this.key));
};

ScoreHistory.prototype.clear = function () {
  this.storage.removeItem(this.key);
  if (window.IDBMirror) window.IDBMirror.remove(this.key);
};
