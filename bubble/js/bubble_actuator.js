function BubbleActuator() {
  BaseActuator.call(this);
  this.boardEl = document.querySelector(".bubble-board");
  this.onCellTap = null; // wired by application code
  this._bound = false;
}
BubbleActuator.prototype = Object.create(BaseActuator.prototype);
BubbleActuator.prototype.constructor = BubbleActuator;

BubbleActuator.prototype.renderBoard = function (state, cols, rows) {
  if (!this.boardEl) return;
  this.boardEl.style.setProperty("--cols", cols);
  this.boardEl.style.setProperty("--rows", rows);

  while (this.boardEl.firstChild) this.boardEl.removeChild(this.boardEl.firstChild);

  // Render row-major top-to-bottom so visual gravity matches state.
  for (var y = 0; y < rows; y++) {
    for (var x = 0; x < cols; x++) {
      var v = state.cells[x][y];
      var cell = document.createElement("div");
      cell.className = "bubble-cell";
      if (v == null) {
        cell.classList.add("empty");
      } else {
        cell.classList.add("color-" + v);
      }
      cell.dataset.x = x;
      cell.dataset.y = y;
      this.boardEl.appendChild(cell);
    }
  }

  this.bindOnce();
};

BubbleActuator.prototype.bindOnce = function () {
  if (this._bound || !this.boardEl) return;
  this._bound = true;
  var self = this;
  // Single delegated handler, fires for both click and touchend.
  function handle(e) {
    var t = e.target;
    if (!t.classList || !t.classList.contains("bubble-cell")) return;
    if (t.classList.contains("empty")) return;
    var x = parseInt(t.dataset.x, 10);
    var y = parseInt(t.dataset.y, 10);
    if (isNaN(x) || isNaN(y)) return;
    e.preventDefault();
    if (self.onCellTap) self.onCellTap(x, y);
  }
  this.boardEl.addEventListener("click", handle);
  this.boardEl.addEventListener("touchend", handle);
};
