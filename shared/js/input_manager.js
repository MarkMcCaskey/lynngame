// Generic event hub for the lynngame games. Wires the common chrome buttons
// (Undo / Redo / New Game / Settings) and keyboard shortcuts. Game-specific
// input (tap on a board cell) lives in each game's actuator.
function InputManager() {
  this.events = {};
  if (window.navigator.msPointerEnabled) {
    this.eventTouchend = "MSPointerUp";
  } else {
    this.eventTouchend = "touchend";
  }
  this.listen();
}

InputManager.prototype.on = function (event, cb) {
  if (!this.events[event]) this.events[event] = [];
  this.events[event].push(cb);
};

InputManager.prototype.emit = function (event, data) {
  var cbs = this.events[event];
  if (!cbs) return;
  cbs.forEach(function (cb) { cb(data); });
};

InputManager.prototype.listen = function () {
  var self = this;

  document.addEventListener("keydown", function (event) {
    var hasModOther = event.altKey || event.ctrlKey || event.metaKey;

    // R = restart (no modifiers)
    if (!hasModOther && !event.shiftKey && event.which === 82) {
      event.preventDefault();
      self.emit("restart");
      return;
    }

    // Z = undo, Shift+Z (or Cmd/Ctrl+Shift+Z) = redo
    if (event.which === 90) {
      if (event.shiftKey) {
        event.preventDefault();
        self.emit("redo");
      } else {
        event.preventDefault();
        self.emit("undo");
      }
    }
  });

  this.bindButton(".restart-button", "restart");
  this.bindButton(".undo-button", "undo");
  this.bindButton(".redo-button", "redo");
  this.bindButton(".settings-button", "openSettings");
  this.bindButton(".settings-close", "closeSettings");
  this.bindButton(".retry-button", "restart");
};

InputManager.prototype.bindButton = function (selector, eventName) {
  var btn = document.querySelector(selector);
  if (!btn) return;
  var self = this;
  var handler = function (e) {
    e.preventDefault();
    self.emit(eventName);
  };
  btn.addEventListener("click", handler);
  btn.addEventListener(this.eventTouchend, handler);
};
