// FrenzyActuator handles all DOM updates and visual juice for Color Frenzy.
// It does NOT extend BaseActuator because Frenzy doesn't use undo/redo and
// has a different stats area, but it adopts the same conventions.
function FrenzyActuator() {
  this.scoreContainer = document.querySelector(".score-container");
  this.bestContainer  = document.querySelector(".best-container");
  this.timerEl        = document.querySelector(".frenzy-timer");
  this.waveEl         = document.querySelector(".frenzy-wave");
  this.levelEl        = document.querySelector(".frenzy-level");
  this.comboEl        = document.querySelector(".frenzy-combo");
  this.comboBarFill   = document.querySelector(".combo-bar-fill");
  this.xpBarFill      = document.querySelector(".xp-bar-fill");
  this.xpBarLabel     = document.querySelector(".xp-bar-label");
  this.boardEl        = document.querySelector(".frenzy-board");
  this.fxEl           = document.querySelector(".frenzy-fx");
  this.pickerEl       = document.querySelector(".frenzy-picker");
  this.messageEl      = document.querySelector(".game-message");
  this.historyStrip   = document.querySelector(".score-history-strip");
  this.scratchBtn     = document.querySelector(".scratch-card-button");
  this.scratchCountEl = document.querySelector(".scratch-count");
  this.containerEl    = document.querySelector(".frenzy-container");
  this.gameContainerEl = document.querySelector(".frenzy-game-container");

  this.lastScore = 0;
  this.onCellTap   = null;
  this.onColorPick = null;
  this._cells = null;
  this._lastSize = 0;
  this._pickerBuilt = false;
  this._comboTimerStyle = null;
  this._fxBatch = []; // queue of FX nodes to clean up on game restart
}

// Public events the application wires up:
//   - onColorPick(colorIndex) when the player taps a color in the picker
//   - the scratch card button is wired through inputManager via "openScratch"

// ---------------------------------------------------------- score / chrome

FrenzyActuator.prototype.updateScore = function (score) {
  if (!this.scoreContainer) return;
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
    // Brief score badge bump
    this.scoreContainer.classList.remove("score-bump");
    void this.scoreContainer.offsetWidth; // restart animation
    this.scoreContainer.classList.add("score-bump");
  }
};

FrenzyActuator.prototype.updateBestScore = function (best) {
  if (this.bestContainer) this.bestContainer.textContent = best;
};

FrenzyActuator.prototype.updateTimer = function (ms) {
  if (!this.timerEl) return;
  var totalSec = Math.max(0, Math.ceil(ms / 1000));
  var m = Math.floor(totalSec / 60);
  var s = totalSec % 60;
  this.timerEl.textContent = m + ":" + (s < 10 ? "0" : "") + s;
  // Urgency: highlight when under 30s.
  this.timerEl.classList.toggle("urgent", ms <= 30000 && ms > 0);
};

FrenzyActuator.prototype.updateWave = function (wave) {
  if (this.waveEl) this.waveEl.textContent = wave;
};

FrenzyActuator.prototype.updateLevel = function (level) {
  if (this.levelEl) this.levelEl.textContent = level;
};

FrenzyActuator.prototype.updateXp = function (xp, max) {
  if (this.xpBarFill) this.xpBarFill.style.width = Math.min(100, (xp / max) * 100) + "%";
  if (this.xpBarLabel) this.xpBarLabel.textContent = xp + " / " + max;
};

FrenzyActuator.prototype.updateCombo = function (combo, multiplier) {
  if (!this.comboEl) return;
  if (combo === 0) {
    this.comboEl.textContent = "x1";
    this.comboEl.classList.remove("hot", "blazing");
    if (this.comboBarFill) this.comboBarFill.style.width = "0%";
    // Drop persistent rim glow when combo dies.
    if (this.gameContainerEl) {
      this.gameContainerEl.classList.remove("combo-active", "combo-hot", "combo-blazing");
    }
    return;
  }
  // Casino flair: tier label by combo size.
  var label = "x" + combo;
  if (multiplier) label += "  (x" + (Math.round(multiplier * 10) / 10) + ")";
  this.comboEl.textContent = label;
  this.comboEl.classList.toggle("hot",     combo >= 5 && combo < 12);
  this.comboEl.classList.toggle("blazing", combo >= 12);
};

FrenzyActuator.prototype.updateComboTimer = function (frac) {
  if (this.comboBarFill) this.comboBarFill.style.width = Math.max(0, Math.min(100, frac * 100)) + "%";
};

// ---------------------------------------------------------- board rendering

FrenzyActuator.prototype.renderBoard = function (state, size, start, region) {
  if (!this.boardEl) return;
  this.buildPicker(6);
  this.markCurrentColor(state.cells[start.x][start.y]);

  this.boardEl.style.setProperty("--size", size);
  if (this._lastSize !== size || !this._cells) {
    while (this.boardEl.firstChild) this.boardEl.removeChild(this.boardEl.firstChild);
    this._cells = [];
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var cellEl = document.createElement("div");
        cellEl.className = "frenzy-cell";
        var dist = Math.abs(x - start.x) + Math.abs(y - start.y);
        cellEl.style.setProperty("--cell-delay", (dist * 30) + "ms");
        if (x === start.x && y === start.y) cellEl.classList.add("is-start");
        cellEl.dataset.x = x;
        cellEl.dataset.y = y;
        this.boardEl.appendChild(cellEl);
        this._cells.push(cellEl);
      }
    }
    this._lastSize = size;
  }

  var inRegion = {};
  region.forEach(function (p) { inRegion[p[0] + "," + p[1]] = true; });

  for (var yy = 0; yy < size; yy++) {
    for (var xx = 0; xx < size; xx++) {
      var idx = yy * size + xx;
      var cell = this._cells[idx];
      var v = state.cells[xx][yy];
      var keyStr = xx + "," + yy;
      var classes = "frenzy-cell color-" + v;
      if (inRegion[keyStr])              classes += " in-region";
      if (xx === start.x && yy === start.y) classes += " is-start";
      if (state.hotCells && state.hotCells[keyStr]) classes += " is-hot";
      cell.className = classes;
    }
  }
};

// --------------------------------------------------- absorption animation

FrenzyActuator.prototype.afterPick = function (info) {
  // info = { absorbed: [[x,y]...], gain, combo, multiplier, hotsHit, bigPick, magnetExtras, rainbowExtras, color }
  var size = this._lastSize;
  if (!size) return;
  var picked = info.color;
  // Absorbed cells: paint the new color (already updated in state) and pulse.
  var absorbedSet = {};
  info.absorbed.forEach(function (p) { absorbedSet[p[0] + "," + p[1]] = true; });

  // For each absorbed cell, trigger a "just-joined" animation. We strip
  // and re-add the class to restart the keyframe (in case the same cell
  // was animated last pick).
  for (var i = 0; i < this._cells.length; i++) {
    var cell = this._cells[i];
    var key = cell.dataset.x + "," + cell.dataset.y;
    if (absorbedSet[key]) {
      cell.classList.remove("just-joined");
      void cell.offsetWidth;
      // For magnet/rainbow cells, use a stronger "pop" to differentiate.
      cell.className = "frenzy-cell color-" + picked + " in-region just-joined";
      if (+cell.dataset.x === 6 && +cell.dataset.y === 6) cell.classList.add("is-start");
    }
  }

  // Score popup at the centroid of the absorbed cells.
  if (info.absorbed.length > 0 && info.gain > 0) {
    var cx = 0, cy = 0;
    info.absorbed.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= info.absorbed.length;
    cy /= info.absorbed.length;
    this._spawnPopup("+" + info.gain, cx, cy, info.bigPick ? "popup-big" : "popup-normal");
  }

  // Tiered call-outs by absorption size. The bigger the pick the more
  // the screen earns it: small "BIG!" → MEGA stamp + chip rain →
  // MASSIVE earthquake + heavier rain. Each tier subsumes the smaller
  // ones so we don't double-stack banners.
  if (info.absorbed.length >= 25) {
    this._spawnMegaStamp("MASSIVE", 1800);
    this._shakeBoard("shake-lg");
    this._spawnChipRain(20, info.gain);
  } else if (info.absorbed.length >= 15) {
    this._spawnMegaStamp("MEGA", 1500);
    this._shakeBoard("shake-lg");
    this._spawnChipRain(12, info.gain);
  } else if (info.bigPick) {
    this._spawnBanner("BIG!", 600);
    this._shakeBoard("shake-md");
  }

  // Combo milestones get progressively heavier reactions.
  if (info.combo === 5)  this._spawnBanner("COMBO 5", 700);
  if (info.combo === 10) {
    this._spawnBanner("ON FIRE", 900);
    this._spawnChipRain(8, Math.round(info.gain * 0.5));
  }
  if (info.combo === 15) {
    this._spawnMegaStamp("UNSTOPPABLE", 1300);
    this._spawnChipRain(10, Math.round(info.gain * 0.6));
  }
  if (info.combo === 20) {
    this._spawnMegaStamp("LEGENDARY", 1800);
    this._shakeBoard("shake-lg");
    this._spawnChipRain(16, info.gain);
  }
  if (info.rainbow) this._spawnBanner("RAINBOW", 900);

  // Persistent rim glow on the game container while combo is high. The
  // class tier (combo-active / combo-hot / combo-blazing) drives a CSS
  // animation so the screen breathes between picks, not just on the
  // pick itself. Removed in updateCombo when combo decays to 0.
  if (this.gameContainerEl) {
    this.gameContainerEl.classList.remove("combo-active", "combo-hot", "combo-blazing");
    if (info.combo >= 20)      this.gameContainerEl.classList.add("combo-blazing");
    else if (info.combo >= 10) this.gameContainerEl.classList.add("combo-hot");
    else if (info.combo >= 5)  this.gameContainerEl.classList.add("combo-active");
  }

  if (info.bountyHits && info.bountyHits.length) {
    var totalBountyGain = info.bountyHits.reduce(function (a, b) { return a + b.gain; }, 0);
    this._spawnBanner("BOUNTY +" + totalBountyGain, 900);
    this._shakeBoard("shake-md");
    this._spawnChipRain(6, totalBountyGain);
  }

  // Picker glow on the chosen color.
  this._pulsePicker(picked);
};

FrenzyActuator.prototype._cellCenter = function (cx, cy) {
  // Returns a pixel position relative to .frenzy-fx for popup/anchor.
  if (!this.boardEl) return { x: 0, y: 0 };
  var rect = this.boardEl.getBoundingClientRect();
  var fxRect = this.fxEl.getBoundingClientRect();
  // We have a CSS grid with `--size` columns and equal rows.
  var size = this._lastSize;
  var cellW = rect.width / size;
  var cellH = rect.height / size;
  return {
    x: (rect.left - fxRect.left) + (cx + 0.5) * cellW,
    y: (rect.top  - fxRect.top)  + (cy + 0.5) * cellH
  };
};

FrenzyActuator.prototype._spawnPopup = function (text, cx, cy, className) {
  if (!this.fxEl) return;
  var pos = this._cellCenter(cx, cy);
  var el = document.createElement("div");
  el.className = "score-popup " + (className || "");
  el.textContent = text;
  el.style.left = pos.x + "px";
  el.style.top  = pos.y + "px";
  this.fxEl.appendChild(el);
  el.addEventListener("animationend", function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
};

FrenzyActuator.prototype._spawnBanner = function (text, durationMs) {
  if (!this.fxEl) return;
  var el = document.createElement("div");
  el.className = "frenzy-banner";
  el.textContent = text;
  el.style.animationDuration = durationMs + "ms";
  this.fxEl.appendChild(el);
  el.addEventListener("animationend", function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
};

// Mega stamp: a slower, bigger banner for huge plays. Distinct from
// the regular _spawnBanner so the keyframe can hold longer.
FrenzyActuator.prototype._spawnMegaStamp = function (text, durationMs) {
  if (!this.fxEl) return;
  var el = document.createElement("div");
  el.className = "mega-stamp";
  el.textContent = text;
  el.style.animationDuration = (durationMs || 1500) + "ms";
  this.fxEl.appendChild(el);
  el.addEventListener("animationend", function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
};

// Chip rain: a shower of "+N" chips falling down across the play area.
// Each chip is a DOM element with a randomized horizontal drift,
// stagger delay, and rotation, animated entirely via CSS keyframes.
FrenzyActuator.prototype._spawnChipRain = function (count, totalGain) {
  if (!this.fxEl) return;
  var rect = this.fxEl.getBoundingClientRect();
  var width = rect.width;
  var height = rect.height;
  var perChip = Math.max(1, Math.round(totalGain / count));
  for (var i = 0; i < count; i++) {
    var chip = document.createElement("div");
    chip.className = "score-chip";
    // Slight value variation so the chips don't all read the same.
    var v = Math.round(perChip * (0.7 + Math.random() * 0.6));
    chip.textContent = "+" + v;
    chip.style.left = (Math.random() * width) + "px";
    chip.style.top  = "-20px";
    chip.style.animationDelay = (Math.random() * 250) + "ms";
    chip.style.setProperty("--chip-dy",  (height + 60) + "px");
    chip.style.setProperty("--chip-dx",  ((Math.random() - 0.5) * 80) + "px");
    chip.style.setProperty("--chip-rot", ((Math.random() - 0.5) * 720) + "deg");
    this.fxEl.appendChild(chip);
    chip.addEventListener("animationend", function (e) {
      if (e.target.parentNode) e.target.parentNode.removeChild(e.target);
    });
  }
};

FrenzyActuator.prototype._shakeBoard = function (cls) {
  if (!this.containerEl) return;
  this.containerEl.classList.remove("shake-sm", "shake-md", "shake-lg");
  void this.containerEl.offsetWidth;
  this.containerEl.classList.add(cls);
  var c = this.containerEl;
  setTimeout(function () { c.classList.remove(cls); }, 600);
};

FrenzyActuator.prototype._pulsePicker = function (color) {
  if (!this.pickerEl) return;
  var btn = this.pickerEl.querySelector('.frenzy-color-btn[data-color="' + color + '"]');
  if (!btn) return;
  btn.classList.remove("pulsed");
  void btn.offsetWidth;
  btn.classList.add("pulsed");
};

// --------------------------------------------------- hot cells & churn

FrenzyActuator.prototype.markHot = function (x, y) {
  var size = this._lastSize;
  if (!size) return;
  var idx = y * size + x;
  var cell = this._cells[idx];
  if (cell) cell.classList.add("is-hot");
};

FrenzyActuator.prototype.unmarkHot = function (key) {
  var xy = key.split(",");
  var size = this._lastSize;
  if (!size) return;
  var idx = (+xy[1]) * size + (+xy[0]);
  var cell = this._cells[idx];
  if (cell) cell.classList.remove("is-hot");
};

// --------------------------------------------------- bounty cells

FrenzyActuator.prototype.markBounty = function (x, y, turns) {
  var size = this._lastSize;
  if (!size) return;
  var idx = y * size + x;
  var cell = this._cells[idx];
  if (!cell) return;
  cell.classList.add("is-bounty");
  cell.dataset.bountyTurns = turns;
  // Spawn a small badge child element (so we can position the number
  // independently and animate it). We re-use this child if it already
  // exists, but renderBoard will recreate cells so it should be fresh.
  if (!cell.querySelector(".bounty-badge")) {
    var badge = document.createElement("div");
    badge.className = "bounty-badge";
    cell.appendChild(badge);
  }
  cell.querySelector(".bounty-badge").textContent = turns;
};

FrenzyActuator.prototype.updateBountyTurns = function (key, turns) {
  var xy = key.split(",");
  var size = this._lastSize;
  if (!size) return;
  var idx = (+xy[1]) * size + (+xy[0]);
  var cell = this._cells[idx];
  if (!cell) return;
  cell.dataset.bountyTurns = turns;
  var badge = cell.querySelector(".bounty-badge");
  if (badge) {
    badge.textContent = turns;
    // Brief tick animation on every decrement so the player sees the
    // counter is actually counting down.
    badge.classList.remove("bounty-tick");
    void badge.offsetWidth;
    badge.classList.add("bounty-tick");
  }
};

FrenzyActuator.prototype.unmarkBounty = function (key) {
  var xy = key.split(",");
  var size = this._lastSize;
  if (!size) return;
  var idx = (+xy[1]) * size + (+xy[0]);
  var cell = this._cells[idx];
  if (!cell) return;
  cell.classList.remove("is-bounty");
  delete cell.dataset.bountyTurns;
  var badge = cell.querySelector(".bounty-badge");
  if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
};

FrenzyActuator.prototype.churnCell = function (x, y, color) {
  var size = this._lastSize;
  if (!size) return;
  var idx = y * size + x;
  var cell = this._cells[idx];
  if (!cell) return;
  // Strip color-N classes and apply the new one.
  cell.className = cell.className.replace(/\bcolor-\d+\b/g, "").trim();
  cell.classList.add("color-" + color);
  cell.classList.remove("churn-flash");
  void cell.offsetWidth;
  cell.classList.add("churn-flash");
};

// --------------------------------------------------- wave celebration

FrenzyActuator.prototype.celebrateWave = function (waveNumber, bonus) {
  if (!this.fxEl) return;
  this._spawnBanner("WAVE " + waveNumber + "  +" + bonus, 1400);
  if (this.boardEl) {
    this.boardEl.classList.remove("wave-clear");
    void this.boardEl.offsetWidth;
    this.boardEl.classList.add("wave-clear");
    var b = this.boardEl;
    setTimeout(function () { b.classList.remove("wave-clear"); }, 1200);
  }
  this._shakeBoard("shake-lg");
  // Quick confetti spray
  this._confetti(36);
};

FrenzyActuator.prototype._confetti = function (count) {
  if (!this.fxEl) return;
  var fxRect = this.fxEl.getBoundingClientRect();
  var width = fxRect.width;
  var height = fxRect.height;
  for (var i = 0; i < count; i++) {
    var p = document.createElement("div");
    p.className = "confetti color-" + (i % 6);
    p.style.left = (Math.random() * width) + "px";
    p.style.top  = (height * 0.1 + Math.random() * height * 0.2) + "px";
    p.style.animationDuration = (700 + Math.random() * 600) + "ms";
    p.style.setProperty("--dx", ((Math.random() - 0.5) * 200) + "px");
    p.style.setProperty("--dy", (200 + Math.random() * 220) + "px");
    p.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
    this.fxEl.appendChild(p);
    p.addEventListener("animationend", function (e) {
      if (e.target.parentNode) e.target.parentNode.removeChild(e.target);
    });
  }
};

// --------------------------------------------------- color picker

FrenzyActuator.prototype.buildPicker = function (colorCount) {
  if (this._pickerBuilt || !this.pickerEl) return;
  this._pickerBuilt = true;
  for (var i = 0; i < colorCount; i++) {
    var btn = document.createElement("button");
    btn.className = "frenzy-color-btn color-" + i;
    btn.dataset.color = i;
    btn.setAttribute("aria-label", "Color " + (i + 1));
    this.pickerEl.appendChild(btn);
  }
  var self = this;
  function handle(e) {
    var t = e.target;
    if (!t.classList || !t.classList.contains("frenzy-color-btn")) return;
    var c = parseInt(t.dataset.color, 10);
    if (isNaN(c)) return;
    e.preventDefault();
    if (self.onColorPick) self.onColorPick(c);
  }
  this.pickerEl.addEventListener("click", handle);
  this.pickerEl.addEventListener("touchend", handle);
};

FrenzyActuator.prototype.markCurrentColor = function (color) {
  if (!this.pickerEl) return;
  var btns = this.pickerEl.querySelectorAll(".frenzy-color-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("is-current", i === color);
  }
};

// Update each color picker button with a "would absorb N cells" hint
// and highlight the best non-current color. Pattern recognition is the
// loop: the player can see at a glance which color would scoop up the
// most cells right now, and choose to take it or detour for a bounty.
FrenzyActuator.prototype.updatePickerHints = function (counts, bestIdx, currentColor) {
  if (!this.pickerEl) return;
  var btns = this.pickerEl.querySelectorAll(".frenzy-color-btn");
  for (var i = 0; i < btns.length; i++) {
    var btn = btns[i];
    var n = counts[i];
    btn.classList.toggle("is-best", i === bestIdx && n > 0);
    // Maintain a small badge child showing the absorb count. Hide the
    // badge for the current (no-op) color and for zero-count picks.
    var badge = btn.querySelector(".picker-hint");
    if (i === currentColor || n <= 0) {
      if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
      continue;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "picker-hint";
      btn.appendChild(badge);
    }
    badge.textContent = n;
  }
};

// --------------------------------------------------- game over / continue

FrenzyActuator.prototype.continueGame = function () {
  if (this.messageEl) {
    this.messageEl.classList.remove("game-over", "game-won");
  }
  this.lastScore = 0;
};

FrenzyActuator.prototype.clearFx = function () {
  if (this.fxEl) {
    while (this.fxEl.firstChild) this.fxEl.removeChild(this.fxEl.firstChild);
  }
};

FrenzyActuator.prototype.showFinalScreen = function (stats) {
  if (!this.messageEl) return;
  var p = this.messageEl.querySelector("p");
  if (p) p.textContent = "Time!";
  var statsEl = this.messageEl.querySelector(".game-message-stats");
  if (statsEl) {
    statsEl.innerHTML =
      '<div class="final-row"><span>Final score</span><strong>' + stats.score + '</strong></div>' +
      '<div class="final-row"><span>Wave reached</span><strong>' + stats.wave + '</strong></div>' +
      '<div class="final-row"><span>Max combo</span><strong>x' + stats.maxCombo + '</strong></div>' +
      '<div class="final-row"><span>Cells absorbed</span><strong>' + stats.totalAbsorbed + '</strong></div>' +
      '<div class="final-row"><span>Level reached</span><strong>' + stats.level + '</strong></div>';
  }
  this.messageEl.classList.add("game-over");
  this._confetti(60);
};

FrenzyActuator.prototype.renderHistoryStrip = function (entries, visible) {
  if (!this.historyStrip) return;
  if (!visible) { this.historyStrip.classList.add("is-hidden"); return; }
  this.historyStrip.classList.remove("is-hidden");
  while (this.historyStrip.firstChild) this.historyStrip.removeChild(this.historyStrip.firstChild);
  if (!entries.length) {
    var hint = document.createElement("span");
    hint.className = "score-history-empty";
    hint.textContent = "Recent runs appear here.";
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

// --------------------------------------------------- chest / level up

// `currentPerks` is the map of already-acquired perk levels (perks[id] = level).
FrenzyActuator.prototype.openChest = function (newLevel, choices, currentPerks, callback) {
  // Build overlay
  var overlay = document.createElement("div");
  overlay.className = "chest-overlay";
  overlay.innerHTML =
    '<div class="chest-card">' +
      '<div class="chest-banner">LEVEL ' + newLevel + '</div>' +
      '<div class="chest-art"><div class="chest-glow"></div><div class="chest-icon">!</div></div>' +
      '<div class="chest-reels"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  var reelsEl = overlay.querySelector(".chest-reels");

  // The chest "rumbles" for a randomized duration before the reels appear.
  var rumbleMs = 700 + Math.random() * 1100;
  var artEl = overlay.querySelector(".chest-art");
  artEl.classList.add("rumble");

  var self = this;
  var allPerkIcons = FrenzyGame.PERKS.map(function (p) { return p.icon; });

  setTimeout(function () {
    artEl.classList.remove("rumble");
    artEl.classList.add("burst");

    // Spawn 3 reels. Each reel cycles through icons rapidly, then locks.
    choices.forEach(function (perk, i) {
      var reel = document.createElement("div");
      reel.className = "perk-reel";
      reel.innerHTML =
        '<div class="reel-icon">?</div>' +
        '<div class="reel-name"></div>' +
        '<div class="reel-blurb"></div>' +
        '<div class="reel-level"></div>';
      reelsEl.appendChild(reel);

      var iconEl = reel.querySelector(".reel-icon");
      var spinner = setInterval(function () {
        iconEl.textContent = allPerkIcons[Math.floor(Math.random() * allPerkIcons.length)];
      }, 70);

      var lockDelay = 800 + i * 280 + Math.random() * 600;
      setTimeout(function () {
        clearInterval(spinner);
        iconEl.textContent = perk.icon;
        var current = (currentPerks[perk.id] || 0);
        reel.querySelector(".reel-name").textContent  = perk.name;
        reel.querySelector(".reel-blurb").textContent = perk.blurb;
        reel.querySelector(".reel-level").textContent =
          (current > 0 ? ("Lv " + current + " -> " + (current + 1)) : ("Lv 1 / " + perk.maxLevel));
        reel.classList.add("locked");
        // Trigger a small confetti burst on the lock
        var rect = reel.getBoundingClientRect();
        // (not stricly necessary; visual)

        // After the last reel locks, become tappable.
        if (i === choices.length - 1) {
          overlay.classList.add("ready");
          reelsEl.querySelectorAll(".perk-reel").forEach(function (r, idx) {
            r.addEventListener("click", function () {
              if (!overlay.classList.contains("ready")) return;
              overlay.classList.add("claimed");
              r.classList.add("chosen");
              setTimeout(function () {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                if (callback) callback(choices[idx].id);
              }, 380);
            });
          });
        }
      }, lockDelay);
    });
  }, rumbleMs);
};

// --------------------------------------------------- scratch card

FrenzyActuator.prototype.updateScratchCount = function (n) {
  if (!this.scratchBtn) return;
  if (this.scratchCountEl) this.scratchCountEl.textContent = n;
  this.scratchBtn.classList.toggle("is-hidden", n <= 0);
};

FrenzyActuator.prototype.flashScratchDrop = function () {
  if (!this.scratchBtn || this.scratchBtn.classList.contains("is-hidden")) {
    // Make sure it's visible so the flash is seen.
    if (this.scratchBtn) this.scratchBtn.classList.remove("is-hidden");
  }
  if (!this.scratchBtn) return;
  this.scratchBtn.classList.remove("drop-flash");
  void this.scratchBtn.offsetWidth;
  this.scratchBtn.classList.add("drop-flash");
};

FrenzyActuator.prototype.showScratchCard = function (symbols, reward, onClaim) {
  var overlay = document.createElement("div");
  overlay.className = "scratch-overlay flair-" + reward.flair;
  // Build the 3x3 grid of symbol cells, then a canvas overlay above
  // them. The canvas is z-indexed above the grid so the silver hides
  // the symbols until the player scratches it off.
  var html = '<div class="scratch-card flair-' + reward.flair + '">' +
             '  <div class="scratch-title">SCRATCH ALL 9</div>' +
             '  <div class="scratch-grid">';
  for (var i = 0; i < 9; i++) {
    html += '<div class="scratch-cell" data-sym="' + symbols[i].id + '">' +
              '<span class="scratch-cell-icon">' + symbols[i].icon + '</span>' +
            '</div>';
  }
  html += '    <canvas class="scratch-canvas"></canvas>' +
          '  </div>' +
          '  <div class="scratch-result is-hidden">' +
          '    <div class="scratch-result-line"></div>' +
          '    <div class="scratch-result-prize"></div>' +
          '    <a class="scratch-claim">Claim</a>' +
          '  </div>' +
          '  <div class="scratch-hint">Drag to scratch the silver off all 9 spots</div>' +
          '</div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  var canvas = overlay.querySelector(".scratch-canvas");
  var grid   = overlay.querySelector(".scratch-grid");
  var claim  = overlay.querySelector(".scratch-claim");
  var hint   = overlay.querySelector(".scratch-hint");
  var resultEl = overlay.querySelector(".scratch-result");
  var resultLine  = overlay.querySelector(".scratch-result-line");
  var resultPrize = overlay.querySelector(".scratch-result-prize");

  // Wait for layout so we can size the canvas to the grid.
  function sizeCanvas() {
    var rect = grid.getBoundingClientRect();
    var cssWidth  = Math.max(220, Math.round(rect.width));
    var cssHeight = Math.max(220, Math.round(rect.height));
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width  = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    canvas.width  = cssWidth  * ratio;
    canvas.height = cssHeight * ratio;
    var ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    return { ctx: ctx, w: cssWidth, h: cssHeight, ratio: ratio };
  }
  var dim = sizeCanvas();
  var ctx = dim.ctx;
  var W = dim.w, H = dim.h;

  // Paint the silver overlay with a subtle "S C R A T C H" texture.
  var grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0,    "#cfd2d8");
  grad.addColorStop(0.5,  "#f0f1f4");
  grad.addColorStop(1,    "#a9adb6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(80, 80, 100, 0.42)";
  ctx.font = "bold 26px Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Tile the word a few times for a busy texture.
  for (var ty = 30; ty < H; ty += 60) {
    for (var tx = 30; tx < W; tx += 130) {
      ctx.fillText("SCRATCH", tx, ty);
    }
  }

  // From here on we erase pixels with destination-out for a real scratch feel.
  ctx.globalCompositeOperation = "destination-out";

  // Scratch tuning. The radius controls how much each stroke clears
  // visually; the threshold is a real fraction of *cleared pixels* on
  // the canvas, not a stroke-area estimate. The earlier version
  // approximated revealed area from the stroke length × radius, which
  // double-counted overlapping strokes — that's why the card was
  // revealing after ~20% of visible silver was actually gone. Here we
  // sample the actual canvas alpha periodically so the reveal really
  // requires the player to clean off most of the silver.
  var radius = 11;
  var threshold = 0.65;
  var revealed = false;

  function pointerPos(e) {
    var rect = canvas.getBoundingClientRect();
    var sx = W / rect.width;
    var sy = H / rect.height;
    var t = (e.touches && e.touches[0]) || e;
    return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
  }

  function scratchAt(p, prev) {
    ctx.beginPath();
    if (prev) {
      ctx.lineCap = "round";
      ctx.lineWidth = radius * 2;
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sample the actual canvas alpha at a 12x12 grid of points to compute
  // the true fraction cleared. We sample on a timer (every 200ms) instead
  // of every stroke so the cost (~144 1px reads) doesn't show up on the
  // input path. The drawing buffer is at canvas.width/height which is
  // CSS-size * devicePixelRatio, so we sample those coords directly.
  var aw = canvas.width;
  var ah = canvas.height;
  var sampleTimer = setInterval(function () {
    if (revealed) { clearInterval(sampleTimer); return; }
    var cleared = 0;
    var samples = 0;
    var GRID = 12;
    for (var sy = 0; sy < GRID; sy++) {
      for (var sx = 0; sx < GRID; sx++) {
        var px = Math.floor((sx + 0.5) / GRID * aw);
        var py = Math.floor((sy + 0.5) / GRID * ah);
        var a;
        try { a = ctx.getImageData(px, py, 1, 1).data[3]; } catch (e) { a = 255; }
        if (a < 60) cleared++;
        samples++;
      }
    }
    if (cleared / samples > threshold) {
      revealed = true;
      clearInterval(sampleTimer);
      finishReveal();
    }
  }, 200);

  function finishReveal() {
    // Fade out and clear the canvas — the symbols underneath show through.
    canvas.classList.add("revealed");
    setTimeout(function () { ctx.clearRect(0, 0, W, H); }, 320);

    // Highlight matching cells if 2+ of a kind landed.
    if (reward.matchSymbolId && reward.matchCount >= 2) {
      var matches = grid.querySelectorAll('.scratch-cell[data-sym="' + reward.matchSymbolId + '"]');
      matches.forEach(function (cell) { cell.classList.add("matched"); });
    }

    // Show the result row + claim button.
    if (hint) hint.classList.add("is-hidden");
    setTimeout(function () {
      resultEl.classList.remove("is-hidden");
      var sym = FrenzyGame.SCRATCH_SYMBOLS.find(function (s) {
        return s.id === reward.matchSymbolId;
      });
      if (reward.kind === "bust") {
        resultEl.classList.add("is-bust");
        if (sym && reward.matchCount === 2) {
          resultLine.textContent = "Almost! 2× " + sym.icon;
        } else {
          resultLine.textContent = "No matches";
        }
        resultPrize.textContent = "BUST";
      } else {
        resultEl.classList.remove("is-bust");
        resultLine.textContent = reward.matchCount + "× " +
          (sym ? sym.icon : "") + "  MATCH!";
        resultPrize.textContent = reward.label;
      }
    }, 480);
  }

  var dragging = false;
  var prev = null;
  function onDown(e) { dragging = true; prev = pointerPos(e); scratchAt(prev, null); e.preventDefault(); }
  function onMove(e) {
    if (!dragging) return;
    var p = pointerPos(e);
    scratchAt(p, prev);
    prev = p;
    e.preventDefault();
  }
  function onUp() { dragging = false; prev = null; }

  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup",   onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove",  onMove, { passive: false });
  canvas.addEventListener("touchend",   onUp);

  function close() {
    window.removeEventListener("mouseup", onUp);
    clearInterval(sampleTimer);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (onClaim) onClaim();
  }
  claim.addEventListener("click", close);
  claim.addEventListener("touchend", function (e) { e.preventDefault(); close(); });
};
