// Common UI machinery for all three lynngame games: score / best / undo+redo
// button enabled state, history strip, game-over message overlay. Each game
// subclasses or composes this with its own renderBoard().
function BaseActuator() {
  this.scoreContainer   = document.querySelector(".score-container");
  this.bestContainer    = document.querySelector(".best-container");
  this.undoButton       = document.querySelector(".undo-button");
  this.redoButton       = document.querySelector(".redo-button");
  this.messageContainer = document.querySelector(".game-message");
  this.historyStrip     = document.querySelector(".score-history-strip");
  this.lastScore        = 0;
}

BaseActuator.prototype.updateScore = function (score) {
  if (!this.scoreContainer) return;
  // Keep the upstream lynn2048 floating "+N" affordance.
  while (this.scoreContainer.firstChild) {
    this.scoreContainer.removeChild(this.scoreContainer.firstChild);
  }
  var diff = score - this.lastScore;
  this.lastScore = score;
  this.scoreContainer.textContent = score;
  if (diff > 0) {
    var add = document.createElement("div");
    add.className = "score-addition";
    add.textContent = "+" + diff;
    this.scoreContainer.appendChild(add);
  }
};

BaseActuator.prototype.updateBestScore = function (best) {
  if (this.bestContainer) this.bestContainer.textContent = best;
};

BaseActuator.prototype.updateHistoryControls = function (canUndo, canRedo) {
  if (this.undoButton) this.undoButton.classList.toggle("is-disabled", !canUndo);
  if (this.redoButton) this.redoButton.classList.toggle("is-disabled", !canRedo);
};

BaseActuator.prototype.showGameOver = function (msg) {
  if (!this.messageContainer) return;
  this.messageContainer.classList.add("game-over");
  var p = this.messageContainer.querySelector("p");
  if (p) p.textContent = msg || "Game over";
};

BaseActuator.prototype.continueGame = function () {
  if (!this.messageContainer) return;
  this.messageContainer.classList.remove("game-over");
  this.messageContainer.classList.remove("game-won");
};

BaseActuator.prototype.renderHistoryStrip = function (entries, visible) {
  if (!this.historyStrip) return;
  if (!visible) {
    this.historyStrip.classList.add("is-hidden");
    return;
  }
  this.historyStrip.classList.remove("is-hidden");
  while (this.historyStrip.firstChild) this.historyStrip.removeChild(this.historyStrip.firstChild);

  if (!entries || !entries.length) {
    var hint = document.createElement("span");
    hint.className = "score-history-empty";
    hint.textContent = "Recent scores appear here.";
    this.historyStrip.appendChild(hint);
    return;
  }
  entries.slice(0, 5).forEach(function (e) {
    var pill = document.createElement("span");
    pill.className = "score-history-pill";
    pill.textContent = e.score;
    this.historyStrip.appendChild(pill);
  }, this);
};
