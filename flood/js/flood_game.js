// Color Flood with a center starting cell. Tap a color and your region
// (everything connected to the center cell with the current color) repaints
// to the chosen color, absorbing any newly-matching neighbors. There's no
// move limit and no losing — par (18) is just guidance. Score scales with
// efficiency so a clean game scores higher.
function FloodGame(opts) {
  BaseGame.call(this, opts);
  this.size = 13;
  this.colorCount = 6;
  this.par = 18; // Par for 13x13 / 6 colors / center start.
}
FloodGame.prototype = Object.create(BaseGame.prototype);
FloodGame.prototype.constructor = FloodGame;

FloodGame.prototype.start = function () {
  // Center cell. For a 13x13 board this is (6, 6).
  var c = (this.size - 1) >> 1;
  return { x: c, y: c };
};

FloodGame.prototype.newGame = function () {
  var cells = [];
  for (var x = 0; x < this.size; x++) {
    var col = [];
    for (var y = 0; y < this.size; y++) {
      col.push(Math.floor(Math.random() * this.colorCount));
    }
    cells.push(col);
  }
  this.state = { cells: cells, moves: 0, won: false };
};

FloodGame.prototype.serialize = function () {
  return JSON.parse(JSON.stringify(this.state));
};
FloodGame.prototype.applyState = function (snap) {
  this.state = JSON.parse(JSON.stringify(snap));
};

// Score is awarded only on win. Always positive (50 minimum) so even a
// long, sloppy game still feels rewarding.
FloodGame.prototype.score = function () {
  if (!this.state.won) return 0;
  var raw = 1000 - this.state.moves * 30;
  return Math.max(50, raw);
};

FloodGame.prototype.isOver = function () {
  return this.state.won;
};

FloodGame.prototype.currentColor = function () {
  var s = this.start();
  return this.state.cells[s.x][s.y];
};

// Returns [x, y] cells currently part of the player's region (flood-fill
// from the start cell of the current color).
FloodGame.prototype.region = function () {
  var color = this.currentColor();
  var seen = {};
  var s = this.start();
  var stack = [[s.x, s.y]];
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
    stack.push([x + 1, y]); stack.push([x - 1, y]);
    stack.push([x, y + 1]); stack.push([x, y - 1]);
  }
  return out;
};

FloodGame.prototype.pick = function (color) {
  if (color === this.currentColor()) return false;
  var self = this;
  return this.act(function () {
    var region = self.region();
    region.forEach(function (p) { self.state.cells[p[0]][p[1]] = color; });
    self.state.moves += 1;
    self.haptics.pulse(10);

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
  actuator.renderBoard(this.state, this.size, this.currentColor(),
                       this.colorCount, this.par, this.start(), this.region());
};

FloodGame.prototype.gameOverMessage = function () {
  var moves = this.state.moves;
  var diff = moves - this.par;
  if (diff < 0) return "Done in " + moves + "! " + Math.abs(diff) + " under par ✨";
  if (diff === 0) return "Done in " + moves + "! Right on par.";
  return "Done in " + moves + " (par " + this.par + ").";
};

FloodGame.prototype.extrasForHistory = function () {
  return { note: this.state.moves + " moves" };
};
