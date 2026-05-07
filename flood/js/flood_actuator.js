function FloodActuator() {
  BaseActuator.call(this);
  this.boardEl = document.querySelector(".flood-board");
  this.pickerEl = document.querySelector(".flood-picker");
  this.movesEl = document.querySelector(".flood-moves");
  this.parEl = document.querySelector(".flood-par");
  this.parWrap = document.querySelector(".flood-par-wrap");
  this.onColorPick = null;
  this._bound = false;
  this._pickerBuilt = false;
  this._prevRegion = null;
  this._cells = null;
  this._lastSize = 0;
}
FloodActuator.prototype = Object.create(BaseActuator.prototype);
FloodActuator.prototype.constructor = FloodActuator;

FloodActuator.prototype.renderBoard = function (state, size, currentColor,
                                                 colorCount, par, start, region) {
  this.buildPicker(colorCount);
  this.markCurrentColor(currentColor);

  if (this.movesEl) this.movesEl.textContent = state.moves;
  if (this.parEl)   this.parEl.textContent = par;
  if (this.parWrap) {
    var diff = state.moves - par;
    this.parWrap.classList.toggle("over-par",  diff > 0);
    this.parWrap.classList.toggle("under-par", state.moves > 0 && diff <= 0);
  }

  if (!this.boardEl) return;
  this.boardEl.style.setProperty("--size", size);

  // Reuse cell elements between renders so CSS transitions apply on the
  // background-color change. Tearing down the DOM each time would defeat
  // the smooth color crossfade we want for juice.
  if (this._lastSize !== size || !this._cells) {
    while (this.boardEl.firstChild) this.boardEl.removeChild(this.boardEl.firstChild);
    this._cells = [];
    var startKey = start.x + "," + start.y;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var cellEl = document.createElement("div");
        cellEl.className = "flood-cell";
        // Distance from center used to stagger the win-celebration wave.
        var dist = Math.abs(x - start.x) + Math.abs(y - start.y);
        cellEl.style.setProperty("--cell-delay", (dist * 35) + "ms");
        if ((x + "," + y) === startKey) cellEl.classList.add("is-start");
        cellEl.dataset.x = x;
        cellEl.dataset.y = y;
        this.boardEl.appendChild(cellEl);
        this._cells.push(cellEl);
      }
    }
    this._lastSize = size;
    this._prevRegion = null; // Force a fresh diff on next render
  }

  // Build a set of keys "x,y" for O(1) "is this cell in the current region"
  // lookups during the per-cell update below.
  var inRegion = {};
  for (var i = 0; i < region.length; i++) {
    inRegion[region[i][0] + "," + region[i][1]] = true;
  }

  // Diff against the previous region so newly-joined cells get a "pop" animation.
  var newlyJoined = {};
  if (this._prevRegion) {
    for (var key in inRegion) {
      if (!this._prevRegion[key]) newlyJoined[key] = true;
    }
  }

  // Update each cell's class. We avoid re-creating the DOM so the
  // transition: background-color animates the color change.
  for (var yy = 0; yy < size; yy++) {
    for (var xx = 0; xx < size; xx++) {
      var idx = yy * size + xx;
      var cell = this._cells[idx];
      var v = state.cells[xx][yy];
      var k = xx + "," + yy;
      var classes = "flood-cell color-" + v;
      if (inRegion[k])    classes += " in-region";
      if (newlyJoined[k]) classes += " just-joined";
      if (xx === start.x && yy === start.y) classes += " is-start";
      cell.className = classes;
    }
  }

  // Strip the .just-joined class after the animation finishes so a re-render
  // (e.g. from undo) replays it cleanly when those cells re-join the region.
  if (Object.keys(newlyJoined).length) {
    setTimeout(function (cells) {
      cells.forEach(function (c) { c.classList.remove("just-joined"); });
    }, 360, this._cells);
  }

  this._prevRegion = inRegion;

  this.boardEl.classList.toggle("celebrating", !!state.won);
};

FloodActuator.prototype.buildPicker = function (colorCount) {
  if (this._pickerBuilt || !this.pickerEl) return;
  this._pickerBuilt = true;
  for (var i = 0; i < colorCount; i++) {
    var btn = document.createElement("button");
    btn.className = "flood-color-btn color-" + i;
    btn.dataset.color = i;
    btn.setAttribute("aria-label", "Color " + (i + 1));
    this.pickerEl.appendChild(btn);
  }
  var self = this;
  function handle(e) {
    var t = e.target;
    if (!t.classList || !t.classList.contains("flood-color-btn")) return;
    var c = parseInt(t.dataset.color, 10);
    if (isNaN(c)) return;
    e.preventDefault();
    if (self.onColorPick) self.onColorPick(c);
  }
  this.pickerEl.addEventListener("click", handle);
  this.pickerEl.addEventListener("touchend", handle);
};

FloodActuator.prototype.markCurrentColor = function (color) {
  if (!this.pickerEl) return;
  var btns = this.pickerEl.querySelectorAll(".flood-color-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("is-current", i === color);
  }
};

FloodActuator.prototype.continueGame = function () {
  BaseActuator.prototype.continueGame.call(this);
  if (this.boardEl) this.boardEl.classList.remove("celebrating");
};
