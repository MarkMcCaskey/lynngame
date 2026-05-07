// Bubble Tap (a.k.a. Same Game). Tap any connected group of 2+ same-colored
// bubbles to pop them. Gravity pulls remaining bubbles down within each
// column, then empty columns slide left. Score = n*(n-1) per pop, +500
// for clearing the whole board.
function BubbleGame(opts) {
  BaseGame.call(this, opts);
  this.cols = 7;
  this.rows = 10;
  this.colorCount = 4;
}
BubbleGame.prototype = Object.create(BaseGame.prototype);
BubbleGame.prototype.constructor = BubbleGame;

BubbleGame.prototype.newGame = function () {
  var cells = [];
  for (var c = 0; c < this.cols; c++) {
    var col = [];
    for (var r = 0; r < this.rows; r++) {
      col.push(Math.floor(Math.random() * this.colorCount));
    }
    cells.push(col);
  }
  this.state = { cells: cells, score: 0 };
};

BubbleGame.prototype.serialize = function () {
  return JSON.parse(JSON.stringify(this.state));
};
BubbleGame.prototype.applyState = function (snap) {
  this.state = JSON.parse(JSON.stringify(snap));
};
BubbleGame.prototype.score = function () { return this.state.score; };

BubbleGame.prototype.isOver = function () {
  var c = this.state.cells;
  for (var x = 0; x < this.cols; x++) {
    for (var y = 0; y < this.rows; y++) {
      var v = c[x][y];
      if (v == null) continue;
      if (x + 1 < this.cols && c[x + 1][y] === v) return false;
      if (y + 1 < this.rows && c[x][y + 1] === v) return false;
    }
  }
  return true;
};

BubbleGame.prototype.isBoardEmpty = function () {
  for (var x = 0; x < this.cols; x++) {
    for (var y = 0; y < this.rows; y++) {
      if (this.state.cells[x][y] != null) return false;
    }
  }
  return true;
};

BubbleGame.prototype.findGroup = function (x, y) {
  var color = this.state.cells[x][y];
  if (color == null) return [];
  var seen = {};
  var stack = [[x, y]];
  var group = [];
  while (stack.length) {
    var p = stack.pop();
    var key = p[0] + "," + p[1];
    if (seen[key]) continue;
    if (p[0] < 0 || p[0] >= this.cols || p[1] < 0 || p[1] >= this.rows) continue;
    if (this.state.cells[p[0]][p[1]] !== color) continue;
    seen[key] = true;
    group.push(p);
    stack.push([p[0] + 1, p[1]]);
    stack.push([p[0] - 1, p[1]]);
    stack.push([p[0], p[1] + 1]);
    stack.push([p[0], p[1] - 1]);
  }
  return group;
};

BubbleGame.prototype.pop = function (x, y) {
  var self = this;
  return this.act(function () {
    var group = self.findGroup(x, y);
    if (group.length < 2) return false;
    group.forEach(function (p) { self.state.cells[p[0]][p[1]] = null; });
    self.state.score += group.length * (group.length - 1);
    self.applyGravity();
    self.compactColumns();
    if (self.isBoardEmpty()) self.state.score += 500;
    self.haptics.pulse(12);
    return true;
  });
};

BubbleGame.prototype.applyGravity = function () {
  for (var x = 0; x < this.cols; x++) {
    var col = this.state.cells[x];
    var nonNull = [];
    for (var i = 0; i < col.length; i++) if (col[i] != null) nonNull.push(col[i]);
    var newCol = [];
    var empty = this.rows - nonNull.length;
    for (var k = 0; k < empty; k++) newCol.push(null);
    for (var j = 0; j < nonNull.length; j++) newCol.push(nonNull[j]);
    this.state.cells[x] = newCol;
  }
};

BubbleGame.prototype.compactColumns = function () {
  var keep = [];
  for (var x = 0; x < this.cols; x++) {
    var hasAny = false;
    for (var y = 0; y < this.rows; y++) if (this.state.cells[x][y] != null) { hasAny = true; break; }
    if (hasAny) keep.push(this.state.cells[x]);
  }
  while (keep.length < this.cols) {
    var emptyCol = [];
    for (var i = 0; i < this.rows; i++) emptyCol.push(null);
    keep.push(emptyCol);
  }
  this.state.cells = keep;
};

BubbleGame.prototype.render = function (actuator) {
  actuator.renderBoard(this.state, this.cols, this.rows);
};

BubbleGame.prototype.gameOverMessage = function () {
  if (this.isBoardEmpty()) return "Cleared!";
  var remaining = 0;
  for (var x = 0; x < this.cols; x++) {
    for (var y = 0; y < this.rows; y++) {
      if (this.state.cells[x][y] != null) remaining++;
    }
  }
  return "No more pops (" + remaining + " left)";
};

BubbleGame.prototype.extrasForHistory = function () {
  if (this.isBoardEmpty()) return { note: "cleared!" };
  var remaining = 0;
  for (var x = 0; x < this.cols; x++) {
    for (var y = 0; y < this.rows; y++) {
      if (this.state.cells[x][y] != null) remaining++;
    }
  }
  return { note: remaining + " left" };
};
