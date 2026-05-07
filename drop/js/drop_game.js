// Drop & Merge: tap a column to drop the "next" number. The dropped tile
// lands on top of existing tiles in that column. If it matches the tile
// directly below, they merge into 2x and the chain continues downward.
// Game over when all columns are full.
function DropGame(opts) {
  BaseGame.call(this, opts);
  this.cols = 5;
  this.rows = 7;
}
DropGame.prototype = Object.create(BaseGame.prototype);
DropGame.prototype.constructor = DropGame;

DropGame.prototype.newGame = function () {
  var cells = [];
  for (var c = 0; c < this.cols; c++) {
    var col = [];
    for (var r = 0; r < this.rows; r++) col.push(null);
    cells.push(col);
  }
  this.state = {
    cells: cells,
    next: this._rollNext(),
    score: 0,
    highTile: 0
  };
};

DropGame.prototype._rollNext = function () {
  // 80% 2, 18% 4, 2% 8 — a tiny chance of an 8 keeps it spicy.
  var r = Math.random();
  if (r < 0.80) return 2;
  if (r < 0.98) return 4;
  return 8;
};

DropGame.prototype.serialize = function () {
  return JSON.parse(JSON.stringify(this.state));
};
DropGame.prototype.applyState = function (snap) {
  this.state = JSON.parse(JSON.stringify(snap));
};
DropGame.prototype.score = function () { return this.state.score; };

DropGame.prototype.isOver = function () {
  // All columns full → no legal drops
  for (var x = 0; x < this.cols; x++) {
    if (this.state.cells[x][0] == null) return false;
  }
  return true;
};

DropGame.prototype.canDrop = function (col) {
  return this.state.cells[col][0] == null;
};

DropGame.prototype.drop = function (col) {
  if (col < 0 || col >= this.cols) return false;
  var self = this;
  return this.act(function () {
    var c = self.state.cells[col];
    // Find lowest empty row (search from bottom).
    var r = -1;
    for (var i = self.rows - 1; i >= 0; i--) {
      if (c[i] == null) { r = i; break; }
    }
    if (r < 0) return false; // Column full

    var value = self.state.next;
    c[r] = value;
    self.haptics.pulse(8);

    // Vertical chain merging: if the tile directly below has the same
    // value, fuse into 2x at the lower row, and keep chaining.
    var didMerge = false;
    while (r + 1 < self.rows && c[r + 1] === c[r]) {
      var merged = c[r] * 2;
      c[r] = null;
      c[r + 1] = merged;
      self.state.score += merged;
      if (merged > self.state.highTile) self.state.highTile = merged;
      didMerge = true;
      r += 1;
    }
    if (didMerge) self.haptics.pulse(14);

    self.state.next = self._rollNext();
    return true;
  });
};

DropGame.prototype.render = function (actuator) {
  actuator.renderBoard(this.state, this.cols, this.rows);
};

DropGame.prototype.gameOverMessage = function () {
  return "All columns full!";
};

DropGame.prototype.extrasForHistory = function () {
  return { note: "max " + this.state.highTile };
};
