function DropActuator() {
  BaseActuator.call(this);
  this.boardEl = document.querySelector(".drop-board");
  this.nextEl = document.querySelector(".drop-next");
  this.onColumnTap = null;
  this._bound = false;
}
DropActuator.prototype = Object.create(BaseActuator.prototype);
DropActuator.prototype.constructor = DropActuator;

DropActuator.prototype.renderBoard = function (state, cols, rows) {
  if (!this.boardEl) return;
  this.boardEl.style.setProperty("--cols", cols);
  this.boardEl.style.setProperty("--rows", rows);
  while (this.boardEl.firstChild) this.boardEl.removeChild(this.boardEl.firstChild);

  // We render columns as drop-targets; each column wraps its rows so a tap
  // anywhere in the column counts.
  for (var x = 0; x < cols; x++) {
    var colEl = document.createElement("div");
    colEl.className = "drop-col";
    colEl.dataset.col = x;
    if (state.cells[x][0] != null) colEl.classList.add("is-full");
    for (var y = 0; y < rows; y++) {
      var v = state.cells[x][y];
      var cell = document.createElement("div");
      cell.className = "drop-cell";
      if (v == null) {
        cell.classList.add("empty");
      } else {
        cell.classList.add("tile-" + v);
        if (v > 2048) cell.classList.add("tile-super");
        cell.textContent = v;
      }
      colEl.appendChild(cell);
    }
    this.boardEl.appendChild(colEl);
  }

  if (this.nextEl) {
    while (this.nextEl.firstChild) this.nextEl.removeChild(this.nextEl.firstChild);
    var pill = document.createElement("div");
    pill.className = "drop-cell tile-" + state.next;
    pill.textContent = state.next;
    this.nextEl.appendChild(pill);
  }

  this.bindOnce();
};

DropActuator.prototype.bindOnce = function () {
  if (this._bound || !this.boardEl) return;
  this._bound = true;
  var self = this;
  function handle(e) {
    var t = e.target;
    while (t && !(t.classList && t.classList.contains("drop-col"))) {
      t = t.parentElement;
    }
    if (!t) return;
    if (t.classList.contains("is-full")) return;
    var x = parseInt(t.dataset.col, 10);
    if (isNaN(x)) return;
    e.preventDefault();
    if (self.onColumnTap) self.onColumnTap(x);
  }
  this.boardEl.addEventListener("click", handle);
  this.boardEl.addEventListener("touchend", handle);
};
