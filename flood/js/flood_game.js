// Color Flood (Flood-it). The top-left region is "yours". Tap a color and
// every cell in your region recolors to it, absorbing any same-colored
// neighbors. Win when the whole board is one color. Target par for a 14x14
// board with 6 colors is ~25 moves.
function FloodGame(opts) {
  BaseGame.call(this, opts);
  this.size = 14;
  this.colorCount = 6;
  this.target = 25;
}
FloodGame.prototype = Object.create(BaseGame.prototype);
FloodGame.prototype.constructor = FloodGame;

FloodGame.prototype.newGame = function () {
  var cells = [];
  for (var x = 0; x < this.size; x++) {
    var col = [];
    for (var y = 0; y < this.size; y++) {
      col.push(Math.floor(Math.random() * this.colorCount));
    }
    cells.push(col);
  }
  this.state = {
    cells: cells,
    moves: 0,
    won: false
  };
};

FloodGame.prototype.serialize = function () {
  return JSON.parse(JSON.stringify(this.state));
};
FloodGame.prototype.applyState = function (snap) {
  this.state = JSON.parse(JSON.stringify(snap));
};

FloodGame.prototype.score = function () {
  if (!this.state.won) return 0;
  // Best when moves is small. Bonus for finishing under target.
  return Math.max(0, (this.target - this.state.moves) * 40 + 200);
};

FloodGame.prototype.isOver = function () {
  return this.state.won;
};

FloodGame.prototype.currentColor = function () {
  return this.state.cells[0][0];
};

// Returns the list of [x,y] cells currently part of the player's region
// (top-left flood-fill of the current color).
FloodGame.prototype.region = function () {
  var color = this.currentColor();
  var seen = {};
  var stack = [[0, 0]];
  var out = [];
  while (stack.length) {
    var p = stack.pop();
    var x = p[0], y = p[1];
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
    var key = x + "," + y;
    if (seen[key]) continue;
    if (this.state.cells[x][y] !== color) continue;
    seen[key] = true;
    out.push(p);
    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }
  return out;
};

FloodGame.prototype.pick = function (color) {
  if (color === this.currentColor()) return false; // No-op picks don't count
  var self = this;
  return this.act(function () {
    var region = self.region();
    region.forEach(function (p) { self.state.cells[p[0]][p[1]] = color; });
    self.state.moves += 1;
    self.haptics.pulse(10);

    // Win: everything is the new color.
    var size = self.size;
    var won = true;
    outer: for (var x = 0; x < size; x++) {
      for (var y = 0; y < size; y++) {
        if (self.state.cells[x][y] !== color) { won = false; break outer; }
      }
    }
    if (won) self.state.won = true;
    return true;
  });
};

FloodGame.prototype.render = function (actuator) {
  actuator.renderBoard(this.state, this.size, this.currentColor(), this.colorCount, this.target);
};

FloodGame.prototype.gameOverMessage = function () {
  var moves = this.state.moves;
  var diff = moves - this.target;
  if (diff < 0) return "Done in " + moves + "! (" + Math.abs(diff) + " under)";
  if (diff === 0) return "Done in " + moves + "! Bang on par.";
  return "Done in " + moves + " (" + diff + " over par)";
};

FloodGame.prototype.extrasForHistory = function () {
  return { note: this.state.moves + "/" + this.target + " moves" };
};
