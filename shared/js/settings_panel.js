function SettingsPanel(settings, gameManager, scoreHistory) {
  this.settings = settings;
  this.gameManager = gameManager;
  this.scoreHistory = scoreHistory;
  this.root = document.querySelector(".settings-panel");
  if (!this.root) return;

  this.depthSelect = this.root.querySelector(".settings-undo-depth");
  this.hapticsToggle = this.root.querySelector(".settings-haptics");
  this.historyToggle = this.root.querySelector(".settings-history");
  this.clearHistoryBtn = this.root.querySelector(".settings-clear-history");
  this.historyList = this.root.querySelector(".settings-history-list");

  this.bind();
  this.syncFromSettings();
}

SettingsPanel.prototype.bind = function () {
  var self = this;

  if (this.depthSelect) {
    this.depthSelect.addEventListener("change", function () {
      var v = parseInt(self.depthSelect.value, 10);
      self.settings.set("undoDepth", isNaN(v) ? 10 : v);
      self.applyDepthCap();
    });
  }

  if (this.hapticsToggle) {
    this.hapticsToggle.addEventListener("change", function () {
      self.settings.set("haptics", self.hapticsToggle.checked);
    });
  }

  if (this.historyToggle) {
    this.historyToggle.addEventListener("change", function () {
      self.settings.set("showHistory", self.historyToggle.checked);
      self.gameManager.actuator.renderHistoryStrip(
        self.scoreHistory.list(),
        self.historyToggle.checked
      );
    });
  }

  if (this.clearHistoryBtn) {
    this.clearHistoryBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!confirm("Clear score history?")) return;
      self.scoreHistory.clear();
      self.renderHistoryList();
      self.gameManager.actuator.renderHistoryStrip([],
        self.settings.get("showHistory"));
    });
  }

  // Tap on the dim backdrop closes the panel.
  this.root.addEventListener("click", function (e) {
    if (e.target === self.root) self.close();
  });
};

SettingsPanel.prototype.syncFromSettings = function () {
  var depth = this.settings.get("undoDepth");
  if (this.depthSelect) {
    var found = false;
    for (var i = 0; i < this.depthSelect.options.length; i++) {
      if (parseInt(this.depthSelect.options[i].value, 10) === depth) {
        this.depthSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) this.depthSelect.value = String(depth);
  }
  if (this.hapticsToggle) this.hapticsToggle.checked = !!this.settings.get("haptics");
  if (this.historyToggle) this.historyToggle.checked = !!this.settings.get("showHistory");
};

// Trim the live undo stack down to the new cap immediately.
SettingsPanel.prototype.applyDepthCap = function () {
  var depth = this.settings.get("undoDepth");
  if (depth > 0 && this.gameManager.undoStack.length > depth) {
    this.gameManager.undoStack.splice(0, this.gameManager.undoStack.length - depth);
    this.gameManager.actuate();
  }
};

SettingsPanel.prototype.open = function () {
  if (!this.root) return;
  this.syncFromSettings();
  this.renderHistoryList();
  this.root.classList.add("is-open");
};

SettingsPanel.prototype.close = function () {
  if (!this.root) return;
  this.root.classList.remove("is-open");
};

SettingsPanel.prototype.renderHistoryList = function () {
  if (!this.historyList) return;
  while (this.historyList.firstChild) {
    this.historyList.removeChild(this.historyList.firstChild);
  }
  var entries = this.scoreHistory.list();
  if (!entries.length) {
    var li = document.createElement("li");
    li.className = "settings-history-empty";
    li.textContent = "No games yet — finish a game to start tracking.";
    this.historyList.appendChild(li);
    return;
  }
  entries.slice(0, 10).forEach(function (e) {
    var li = document.createElement("li");
    var d = new Date(e.endedAt);
    var date = isNaN(d.getTime()) ? "" :
               (d.getMonth() + 1) + "/" + d.getDate();
    // Each game can attach a free-form `note` string (e.g. "max 256",
    // "cleared!", "23/25 moves") via ScoreHistory.add(score, { note }).
    var note = e.note || "";
    li.innerHTML = '<span class="hist-score">' + e.score + '</span>' +
                   '<span class="hist-tile">' + note + '</span>' +
                   '<span class="hist-date">' + date + '</span>';
    this.historyList.appendChild(li);
  }, this);
};
