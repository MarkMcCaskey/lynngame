// BaseGame is the shared engine for all three lynngame games. It owns the
// undo/redo stack, score persistence, and the actuate/render lifecycle. Each
// concrete game (BubbleGame, DropGame, FloodGame) extends it by implementing:
//
//   - newGame()         : initialize fresh state on `this.state`
//   - serialize()       : return a JSON-safe snapshot of the current state
//   - applyState(snap)  : restore state from a snapshot
//   - score()           : current score (number)
//   - isOver()          : true if the game has ended (loss or win)
//   - extrasForHistory(): optional object merged into score history
//   - render(actuator)  : push state to the actuator
//
// And by calling `this.commit()` after a successful player action so the
// before-state snapshot pushed in `act()` lands on the undo stack.
function BaseGame(opts) {
  this.gameId         = opts.gameId;
  this.storageManager = opts.storageManager;
  this.inputManager   = opts.inputManager;
  this.actuator       = opts.actuator;
  this.settings       = opts.settings;
  this.haptics        = opts.haptics  || { pulse: function () {} };
  this.scoreHistory   = opts.scoreHistory;

  this.undoStack = this.storageManager.getUndoStack();
  this.redoStack = this.storageManager.getRedoStack();

  // Subscribe to common events. Game-specific events (e.g. cell taps) are
  // wired by the actuator and forwarded to the subclass via `act(fn)`.
  var self = this;
  this.inputManager.on("restart", function () { self.restart(); });
  this.inputManager.on("undo",    function () { self.undo(); });
  this.inputManager.on("redo",    function () { self.redo(); });
}

BaseGame.prototype.boot = function () {
  var prev = this.storageManager.getGameState();
  if (prev) {
    this.applyState(prev);
  } else {
    this.newGame();
  }
  this._scoreRecorded = false;
  this.actuate();
};

BaseGame.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.storageManager.clearHistoryStacks();
  this.undoStack = [];
  this.redoStack = [];
  this._scoreRecorded = false;
  if (this.actuator.continueGame) this.actuator.continueGame();
  this.newGame();
  this.actuate();
};

// Wraps a player action: snapshot, run fn, if fn returns true the action
// counted as a real move (push undo, clear redo, actuate). Subclasses call
// this from their own input handlers.
BaseGame.prototype.act = function (fn) {
  if (this.isOver()) return false;
  var snapshot = this.serialize();
  var moved = fn();
  if (!moved) return false;
  this.pushUndo(snapshot);
  this.redoStack = [];
  this.actuate();
  return true;
};

BaseGame.prototype.pushUndo = function (snapshot) {
  this.undoStack.push(snapshot);
  var depth = this.settings ? this.settings.get("undoDepth") : 10;
  if (depth > 0 && this.undoStack.length > depth) {
    this.undoStack.splice(0, this.undoStack.length - depth);
  }
};

BaseGame.prototype.undo = function () {
  if (!this.undoStack.length) return;
  this.redoStack.push(this.serialize());
  this.applyState(this.undoStack.pop());
  this._scoreRecorded = false;
  if (this.actuator.continueGame) this.actuator.continueGame();
  this.actuate();
};

BaseGame.prototype.redo = function () {
  if (!this.redoStack.length) return;
  this.undoStack.push(this.serialize());
  this.applyState(this.redoStack.pop());
  this._scoreRecorded = false;
  if (this.actuator.continueGame) this.actuator.continueGame();
  this.actuate();
};

BaseGame.prototype.actuate = function () {
  var s = this.score();
  if (this.storageManager.getBestScore() < s) {
    this.storageManager.setBestScore(s);
  }
  if (this.isOver()) {
    this.storageManager.clearGameState();
    this.recordFinalScore();
  } else {
    this.storageManager.setGameState(this.serialize());
  }
  this.storageManager.setUndoStack(this.undoStack);
  this.storageManager.setRedoStack(this.redoStack);

  this.render(this.actuator);

  this.actuator.updateScore(s);
  this.actuator.updateBestScore(this.storageManager.getBestScore());
  if (this.actuator.updateHistoryControls) {
    this.actuator.updateHistoryControls(this.undoStack.length > 0,
                                        this.redoStack.length > 0);
  }
  if (this.isOver() && this.actuator.showGameOver) {
    this.actuator.showGameOver(this.gameOverMessage ? this.gameOverMessage() : null);
  }
};

BaseGame.prototype.recordFinalScore = function () {
  if (this._scoreRecorded) return;
  this._scoreRecorded = true;
  if (!this.scoreHistory) return;
  var extras = this.extrasForHistory ? this.extrasForHistory() : null;
  this.scoreHistory.add(this.score(), extras);
  if (this.actuator.renderHistoryStrip && this.settings) {
    this.actuator.renderHistoryStrip(this.scoreHistory.list(),
                                     this.settings.get("showHistory"));
  }
};
