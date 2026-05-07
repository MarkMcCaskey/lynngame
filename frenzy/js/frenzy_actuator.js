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

  // Special call-outs.
  if (info.bigPick) {
    this._spawnBanner("BIG!", 600);
    this._shakeBoard("shake-md");
  }
  if (info.combo === 5)  this._spawnBanner("COMBO 5", 600);
  if (info.combo === 10) this._spawnBanner("ON FIRE", 800);
  if (info.combo === 20) { this._spawnBanner("LEGENDARY", 1000); this._shakeBoard("shake-lg"); }
  if (info.rainbow) this._spawnBanner("RAINBOW", 900);

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

FrenzyActuator.prototype.showScratchCard = function (reward, onClaim) {
  var overlay = document.createElement("div");
  overlay.className = "scratch-overlay";
  overlay.innerHTML =
    '<div class="scratch-card flair-' + reward.flair + '">' +
      '<div class="scratch-card-prize">' + reward.label + '</div>' +
      '<canvas class="scratch-canvas" width="320" height="200"></canvas>' +
      '<div class="scratch-hint">Drag to scratch</div>' +
      '<a class="scratch-claim is-hidden">Claim</a>' +
    '</div>';
  document.body.appendChild(overlay);
  var canvas = overlay.querySelector(".scratch-canvas");
  var claim  = overlay.querySelector(".scratch-claim");
  var hint   = overlay.querySelector(".scratch-hint");
  var ctx    = canvas.getContext("2d");
  // Match canvas drawing buffer to its CSS size for a 1:1 pixel scratch.
  var cssWidth  = canvas.clientWidth || 320;
  var cssHeight = canvas.clientHeight || 200;
  canvas.width = cssWidth;
  canvas.height = cssHeight;

  // Silver overlay with a "?" pattern.
  var grad = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
  grad.addColorStop(0,    "#cfd2d8");
  grad.addColorStop(0.5,  "#f0f1f4");
  grad.addColorStop(1,    "#a9adb6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "rgba(80, 80, 100, 0.55)";
  ctx.font = "bold 38px Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("S C R A T C H", cssWidth / 2, cssHeight / 2);

  ctx.globalCompositeOperation = "destination-out";

  var scratched = false;
  var revealedPx = 0;
  var totalPx = cssWidth * cssHeight;

  function pointerPos(e) {
    var rect = canvas.getBoundingClientRect();
    var sx = canvas.width / rect.width;
    var sy = canvas.height / rect.height;
    var t = (e.touches && e.touches[0]) || e;
    return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
  }

  function scratchAt(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
    ctx.fill();
    revealedPx += Math.PI * 22 * 22; // approximate
    scratched = true;
    if (revealedPx > totalPx * 0.45) {
      // Auto-clear the rest with a flourish.
      ctx.fillRect(0, 0, cssWidth, cssHeight);
      hint.classList.add("is-hidden");
      claim.classList.remove("is-hidden");
    }
  }

  var dragging = false;
  function onDown(e) { dragging = true; scratchAt(pointerPos(e)); e.preventDefault(); }
  function onMove(e) { if (dragging) { scratchAt(pointerPos(e)); e.preventDefault(); } }
  function onUp(e)   { dragging = false; }

  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup",   onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove",  onMove, { passive: false });
  canvas.addEventListener("touchend",   onUp);

  function close() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (onClaim) onClaim();
  }
  claim.addEventListener("click", close);
  claim.addEventListener("touchend", function (e) { e.preventDefault(); close(); });
};
