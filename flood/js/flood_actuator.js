function FloodActuator() {
  BaseActuator.call(this);
  this.boardEl = document.querySelector(".flood-board");
  this.pickerEl = document.querySelector(".flood-picker");
  this.movesEl = document.querySelector(".flood-moves");
  this.targetEl = document.querySelector(".flood-target");
  this.onColorPick = null;
  this._bound = false;
  this._pickerBuilt = false;
}
FloodActuator.prototype = Object.create(BaseActuator.prototype);
FloodActuator.prototype.constructor = FloodActuator;

FloodActuator.prototype.renderBoard = function (state, size, currentColor, colorCount, target) {
  this.buildPicker(colorCount);
  this.markCurrentColor(currentColor);

  if (this.movesEl) this.movesEl.textContent = state.moves;
  if (this.targetEl) this.targetEl.textContent = "/ " + target;

  if (!this.boardEl) return;
  this.boardEl.style.setProperty("--size", size);

  // Reuse cells across renders to keep DOM churn down — there are 196 cells.
  var existing = this.boardEl.querySelectorAll(".flood-cell");
  if (existing.length !== size * size) {
    while (this.boardEl.firstChild) this.boardEl.removeChild(this.boardEl.firstChild);
    for (var i = 0; i < size * size; i++) {
      var c = document.createElement("div");
      c.className = "flood-cell";
      this.boardEl.appendChild(c);
    }
    existing = this.boardEl.querySelectorAll(".flood-cell");
  }

  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var idx = y * size + x;
      var cell = existing[idx];
      var v = state.cells[x][y];
      // Strip existing color-N classes, set the new one
      cell.className = "flood-cell color-" + v;
    }
  }
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
