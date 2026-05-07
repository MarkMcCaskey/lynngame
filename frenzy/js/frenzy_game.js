// Color Frenzy. Color-flood mechanic on a 13x13 grid, but endless: clear
// the board and a new wave starts with a celebration. Score scales with a
// combo multiplier that grows on every successful pick and decays after
// ~2s of inactivity. The board is dynamic in two ways: perimeter tiles
// reroll their colors every couple seconds, and "hot" cells appear with
// a glowing pulse — absorbing one scores 5x.
//
// On top of that there's an XP / level / perk loop. Each absorbed cell
// is +1 XP; on level-up the game pauses and a "chest" / slot-machine
// reveal shows three randomly-chosen perks for the player to pick from.
// Perks stack across the run.
//
// No undo/redo (real-time game). No fail state, just a fixed-length timed
// run with a final score that lands in score history.
function FrenzyGame(opts) {
  this.gameId         = opts.gameId;
  this.storageManager = opts.storageManager;
  this.inputManager   = opts.inputManager;
  this.actuator       = opts.actuator;
  this.settings       = opts.settings;
  this.haptics        = opts.haptics || { pulse: function () {} };
  this.scoreHistory   = opts.scoreHistory;

  this.size       = 13;
  this.colorCount = 6;
  this.startCell  = { x: 6, y: 6 };

  // Pacing knobs
  this.basePerCell    = 10;
  this.hotMultiplier  = 5;
  this.hotLifetimeMs  = 8000;
  this.hotSpawnMinMs  = 3000;
  this.hotSpawnMaxMs  = 5500;
  this.churnMinMs     = 1500;
  this.churnMaxMs     = 2400;
  this.churnCount     = 2;
  this.comboTimeoutMs = 2000;
  this.auraBaseMs     = 4000;
  this.bountySpawnMinMs = 7000;
  this.bountySpawnMaxMs = 11000;
  this.bountyTurnsMin   = 5;
  this.bountyTurnsMax   = 8;
  this.bountyPayout     = 500;

  var self = this;
  this.inputManager.on("restart", function () { self.restart(); });
  this.inputManager.on("openScratch", function () { self.openScratchCard(); });
}

// Perk catalog. Each pick offers 3 perks chosen randomly from this list
// (skipping any that have hit maxLevel for this run). Effects are applied
// inside pick() / tick() based on the current `state.perks` map.
FrenzyGame.PERKS = [
  { id: "magnet",  name: "Magnet",   icon: "🧲", blurb: "+1 random matching cell per pick",         maxLevel: 5 }, // 🧲
  { id: "mult",    name: "Boost",    icon: "💎", blurb: "+50% score multiplier",                    maxLevel: 4 }, // 💎
  { id: "aura",    name: "Aura",     icon: "✨",       blurb: "Auto-absorbs an adjacent cell on a timer", maxLevel: 3 }, // ✨
  { id: "combo",   name: "Combo+",   icon: "🔥", blurb: "Combo multiplier grows faster",            maxLevel: 3 }, // 🔥
  { id: "lucky",   name: "Lucky",    icon: "🍀", blurb: "More hot cells, longer fuse",              maxLevel: 3 }, // 🍀
  { id: "greed",   name: "Greed",    icon: "💰", blurb: "+1 base score per cell",                   maxLevel: 5 }, // 💰
  { id: "heart",   name: "Heart",    icon: "⏱️", blurb: "+20s on the clock",                        maxLevel: 3 }, // ⏱️
  { id: "rainbow", name: "Rainbow",  icon: "🌈", blurb: "Every 6th pick clears that color everywhere", maxLevel: 1 } // 🌈
];

// Scratch-card symbol pool. A real card draws 9 of these into a 3x3 grid
// (one per cell, each cell rolled independently) and the prize is
// determined by the most-common symbol after the player scratches off
// the silver. `base` is the prize amount when 3-of-a-kind hits;
// 4-of-a-kind doubles, 5-of-a-kind triples, etc. 2-of-a-kind pays a
// fraction. 0/1 matches falls back to a small consolation prize.
FrenzyGame.SCRATCH_SYMBOLS = [
  { id: "cherry",  icon: "🍒", weight: 28, base: 100,  kind: "score", flair: "common"   },
  { id: "seven",   icon: "7️⃣", weight: 22, base: 250,  kind: "score", flair: "common"   },
  { id: "gold",    icon: "💰", weight: 20, base: 500,  kind: "score", flair: "uncommon" },
  { id: "star",    icon: "⭐", weight: 14, base: 1000, kind: "score", flair: "rare"     },
  { id: "clock",   icon: "⏱️", weight: 6,  base: 30,   kind: "time",  flair: "rare"     },
  { id: "gift",    icon: "🎁", weight: 6,  base: 1,    kind: "perk",  flair: "epic"     },
  { id: "diamond", icon: "💎", weight: 4,  base: 2500, kind: "score", flair: "jackpot"  }
];

FrenzyGame.prototype.boot = function () {
  this.runDurationMs = this._configuredRunMs();
  this.newGame();
  this.actuator.renderBoard(this.state, this.size, this.startCell, this.region());
  this.actuator.updateScore(0);
  this.actuator.updateBestScore(this.storageManager.getBestScore());
  this.actuator.updateCombo(0, 0);
  this.actuator.updateWave(1);
  this.actuator.updateTimer(this.state.timeLeftMs);
  this.actuator.updateLevel(1);
  this.actuator.updateXp(0, this.state.xpToLevel);
  this.startLoop();
};

FrenzyGame.prototype._configuredRunMs = function () {
  if (!this.settings) return 240000;
  var v = parseInt(this.settings.get("runLength"), 10);
  if (isNaN(v) || v <= 0) return 240000;
  return v * 1000;
};

FrenzyGame.prototype._xpForLevel = function (level) {
  // XP needed to reach the *next* level. Geometric (1.6x per level) so
  // each level requires meaningfully more cells than the last:
  //   L1->L2:   80    L2->L3:  128    L3->L4:  205    L4->L5:  328
  //   L5->L6:  524    L6->L7:  839    L7->L8: 1343    L8->L9: 2148
  // Cumulative: 80, 208, 413, 741, 1265, 2104, 3447, 5595
  // First chest is genuinely earned (~30s of decent play) and late-run
  // levels are rare — the player gets to *use* their perks instead of
  // constantly being interrupted by another chest reveal.
  return Math.round(80 * Math.pow(1.6, level - 1));
};

FrenzyGame.prototype.newGame = function () {
  var cells = [];
  for (var x = 0; x < this.size; x++) {
    var col = [];
    for (var y = 0; y < this.size; y++) col.push(Math.floor(Math.random() * this.colorCount));
    cells.push(col);
  }
  this.state = {
    cells: cells,
    score: 0,
    combo: 0,
    comboTimerMs: 0,
    wave: 1,
    timeLeftMs: this.runDurationMs,
    hotCells: {},
    bounties: {},
    nextChurnMs: 1500,
    nextHotMs: 3500,
    nextBountyMs: 6000,
    ended: false,
    totalAbsorbed: 0,
    maxCombo: 0,
    xp: 0,
    level: 1,
    xpToLevel: this._xpForLevel(1),
    perks: {},
    paused: false,
    pickCount: 0,
    auraTimerMs: this.auraBaseMs,
    scratchCards: 0
  };
  this._scoreRecorded = false;
};

FrenzyGame.prototype.restart = function () {
  this.runDurationMs = this._configuredRunMs();
  this.stopLoop();
  this.newGame();
  if (this.actuator.continueGame) this.actuator.continueGame();
  if (this.actuator.clearFx) this.actuator.clearFx();
  this.actuator.renderBoard(this.state, this.size, this.startCell, this.region());
  this.actuator.updateScore(0);
  this.actuator.updateCombo(0, 0);
  this.actuator.updateWave(1);
  this.actuator.updateLevel(1);
  this.actuator.updateXp(0, this.state.xpToLevel);
  this.actuator.updateTimer(this.state.timeLeftMs);
  this.startLoop();
};

FrenzyGame.prototype.startLoop = function () {
  if (this._raf) return;
  var self = this;
  var last = performance.now();
  function tick(now) {
    var dt = now - last;
    last = now;
    if (dt > 200) dt = 200; // tab-return clamp
    self.tick(dt, now);
    self._raf = requestAnimationFrame(tick);
  }
  this._raf = requestAnimationFrame(tick);
};

FrenzyGame.prototype.stopLoop = function () {
  if (this._raf) cancelAnimationFrame(this._raf);
  this._raf = null;
};

FrenzyGame.prototype.tick = function (dtMs, nowMs) {
  if (this.state.ended) return;
  // Pause everything during the level-up modal so the timer/decay don't
  // burn while the player is choosing a perk.
  if (this.state.paused) return;

  this.state.timeLeftMs -= dtMs;
  if (this.state.timeLeftMs <= 0) {
    this.state.timeLeftMs = 0;
    this.actuator.updateTimer(0);
    this.endRun();
    return;
  }
  this.actuator.updateTimer(this.state.timeLeftMs);

  if (this.state.combo > 0) {
    this.state.comboTimerMs -= dtMs;
    if (this.state.comboTimerMs <= 0) {
      this.state.combo = 0;
      this.state.comboTimerMs = 0;
      this.actuator.updateCombo(0, 0);
    } else {
      this.actuator.updateComboTimer(this.state.comboTimerMs / this.comboTimeoutMs);
    }
  }

  this.state.nextChurnMs -= dtMs;
  if (this.state.nextChurnMs <= 0) {
    this.state.nextChurnMs = this.churnMinMs + Math.random() * (this.churnMaxMs - this.churnMinMs);
    this.churnEdges();
  }

  // Lucky perk shortens the spawn windows.
  var luckyLvl = this.state.perks.lucky || 0;
  var lucky = 1 + 0.3 * luckyLvl;
  this.state.nextHotMs -= dtMs;
  if (this.state.nextHotMs <= 0) {
    this.state.nextHotMs = (this.hotSpawnMinMs + Math.random() *
                            (this.hotSpawnMaxMs - this.hotSpawnMinMs)) / lucky;
    this.spawnHot(nowMs, luckyLvl);
  }

  for (var k in this.state.hotCells) {
    if (this.state.hotCells[k] <= nowMs) {
      delete this.state.hotCells[k];
      this.actuator.unmarkHot(k);
    }
  }

  // Bounty cells: special targets with a turn counter (not a time
  // counter — they only tick down when the player makes a pick, so the
  // turn budget is real and forces route planning). Spawn periodically,
  // capped at 2 active at once. Counter decrements happen inside pick().
  this.state.nextBountyMs -= dtMs;
  if (this.state.nextBountyMs <= 0) {
    this.state.nextBountyMs = this.bountySpawnMinMs +
                              Math.random() * (this.bountySpawnMaxMs - this.bountySpawnMinMs);
    if (Object.keys(this.state.bounties).length < 2) this.spawnBounty();
  }

  // Aura perk: every N seconds (shorter at higher level), absorb one
  // adjacent-to-region cell. Scaled so L1 fires every 4s, L3 every ~2s.
  var auraLvl = this.state.perks.aura || 0;
  if (auraLvl > 0) {
    this.state.auraTimerMs -= dtMs;
    if (this.state.auraTimerMs <= 0) {
      this.state.auraTimerMs = this.auraBaseMs / (1 + 0.4 * auraLvl);
      this.triggerAura();
    }
  }
};

FrenzyGame.prototype.currentColor = function () {
  return this.state.cells[this.startCell.x][this.startCell.y];
};

FrenzyGame.prototype.region = function () {
  var color = this.currentColor();
  var seen = {};
  var stack = [[this.startCell.x, this.startCell.y]];
  var out = [];
  while (stack.length) {
    var p = stack.pop();
    var x = p[0], y = p[1];
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
    var key = x + "," + y;
    if (seen[key]) continue;
    if (this.state.cells[x][y] !== color) continue;
    seen[key] = true;
    out.push(p);
    stack.push([x + 1, y]); stack.push([x - 1, y]);
    stack.push([x, y + 1]); stack.push([x, y - 1]);
  }
  return out;
};

FrenzyGame.prototype.pick = function (color) {
  if (this.state.ended || this.state.paused) return;
  if (color === this.currentColor()) return;

  this.state.pickCount += 1;

  var oldRegion = {};
  this.region().forEach(function (p) { oldRegion[p[0] + "," + p[1]] = true; });

  for (var k in oldRegion) {
    var xy = k.split(",");
    this.state.cells[+xy[0]][+xy[1]] = color;
  }

  // Magnet perk: also absorb K random cells of the new color from anywhere.
  var magnetLvl = this.state.perks.magnet || 0;
  var magnetExtras = [];
  if (magnetLvl > 0) {
    var pool = [];
    for (var x = 0; x < this.size; x++) {
      for (var y = 0; y < this.size; y++) {
        if (this.state.cells[x][y] === color && !oldRegion[x + "," + y]) {
          pool.push([x, y]);
        }
      }
    }
    // Pull magnetLvl unique cells from the pool.
    for (var i = 0; i < magnetLvl && pool.length > 0; i++) {
      var idx = Math.floor(Math.random() * pool.length);
      magnetExtras.push(pool.splice(idx, 1)[0]);
    }
    // Don't re-paint cells that are already this color elsewhere — but DO
    // teleport them into the player's region by routing them through the
    // existing flood. Simpler: if a magnet cell happens to be connected to
    // the new region after the repaint, it would already be in newRegion.
    // For non-connected matches, we mark them explicitly so the actuator
    // can fly them in visually. They count as absorbed for scoring.
  }

  // Rainbow perk: every Nth pick (N = 7 - rainbowLvl, capped 1 -> every 6),
  // absorb all cells of `color` everywhere.
  var rainbowLvl = this.state.perks.rainbow || 0;
  var rainbowFired = false;
  var rainbowExtras = [];
  if (rainbowLvl > 0 && this.state.pickCount % 6 === 0) {
    rainbowFired = true;
    for (var rx = 0; rx < this.size; rx++) {
      for (var ry = 0; ry < this.size; ry++) {
        if (this.state.cells[rx][ry] === color && !oldRegion[rx + "," + ry]) {
          rainbowExtras.push([rx, ry]);
        }
      }
    }
  }

  var newRegion = this.region();
  var absorbed = [];
  var seenAbsorbed = {};
  function pushAbsorbed(p) {
    var k = p[0] + "," + p[1];
    if (seenAbsorbed[k]) return;
    seenAbsorbed[k] = true;
    absorbed.push(p);
  }
  for (var ni = 0; ni < newRegion.length; ni++) {
    var nk = newRegion[ni][0] + "," + newRegion[ni][1];
    if (!oldRegion[nk]) pushAbsorbed(newRegion[ni]);
  }
  magnetExtras.forEach(pushAbsorbed);
  rainbowExtras.forEach(pushAbsorbed);

  // Combo: only grows on substantive absorbs (>= 3 cells). Small picks
  // (1-2 cells) hold combo where it is and reset the decay timer so the
  // player doesn't lose what they have, but they don't get the multiplier
  // bump for free. Wasted picks (0 cells absorbed) let combo decay
  // naturally — punishes mashing colors that don't connect to the
  // region. This is the anti-mash rule that gives the player a reason
  // to read the board before each tap.
  if (absorbed.length >= 3) {
    this.state.combo += 1;
    this.state.comboTimerMs = this.comboTimeoutMs;
    if (this.state.combo > this.state.maxCombo) this.state.maxCombo = this.state.combo;
  } else if (absorbed.length > 0) {
    this.state.comboTimerMs = this.comboTimeoutMs;
  }

  var comboLvl  = this.state.perks.combo || 0;
  var multLvl   = this.state.perks.mult  || 0;
  var greedLvl  = this.state.perks.greed || 0;

  var comboStep   = 0.2 + 0.1 * comboLvl;
  var comboMul    = 1 + (this.state.combo - 1) * comboStep;
  var multBonus   = 1 + 0.5 * multLvl;
  var basePerCell = this.basePerCell + greedLvl;

  // Build a set of absorbed cell keys so we can match against hots and
  // bounties in O(1).
  var absorbedSet = {};
  for (var ai = 0; ai < absorbed.length; ai++) {
    absorbedSet[absorbed[ai][0] + "," + absorbed[ai][1]] = true;
  }

  var hots = this.state.hotCells;
  var hotsHit = [];
  var rawCellScore = 0;
  for (var j = 0; j < absorbed.length; j++) {
    var p = absorbed[j];
    var k2 = p[0] + "," + p[1];
    if (hots[k2]) {
      rawCellScore += basePerCell * this.hotMultiplier;
      hotsHit.push(k2);
      delete hots[k2];
    } else {
      rawCellScore += basePerCell;
    }
  }
  var gain = Math.round(rawCellScore * comboMul * multBonus);
  this.state.score += gain;
  this.state.totalAbsorbed += absorbed.length;

  // Bounty cells: every pick decrements every active bounty's turn
  // counter. If the absorbed set contains a bounty cell, pay it out
  // (flat amount, scaled by combo/mult so combos still matter). If a
  // bounty's counter hits 0 without being grabbed, it just expires. The
  // turn-based counter (rather than time-based) is what makes bounties
  // a real planning decision: a player who's mashing burns turns and
  // misses the bonus.
  var bountyHits = [];
  var bountyKeys = Object.keys(this.state.bounties);
  for (var bi = 0; bi < bountyKeys.length; bi++) {
    var bk = bountyKeys[bi];
    var b  = this.state.bounties[bk];
    b.turnsLeft -= 1;
    if (absorbedSet[bk]) {
      var bountyGain = Math.round(this.bountyPayout * comboMul * multBonus);
      this.state.score += bountyGain;
      gain += bountyGain;
      bountyHits.push({ key: bk, gain: bountyGain });
      delete this.state.bounties[bk];
      this.actuator.unmarkBounty(bk);
    } else if (b.turnsLeft <= 0) {
      delete this.state.bounties[bk];
      this.actuator.unmarkBounty(bk);
    } else {
      this.actuator.updateBountyTurns(bk, b.turnsLeft);
    }
  }

  this.haptics.pulse(absorbed.length > 8 ? 18 : (absorbed.length > 2 ? 12 : 8));

  this.actuator.afterPick({
    color: color,
    absorbed: absorbed,
    gain: gain,
    combo: this.state.combo,
    multiplier: comboMul * multBonus,
    hotsHit: hotsHit,
    bountyHits: bountyHits,
    bigPick: absorbed.length >= 8,
    rainbow: rainbowFired,
    magnetExtras: magnetExtras,
    rainbowExtras: rainbowExtras
  });
  this.actuator.updateScore(this.state.score);
  this.actuator.updateCombo(this.state.combo, comboMul * multBonus);
  this.actuator.updateBestScore(Math.max(this.state.score, this.storageManager.getBestScore()));

  // Random scratch-card drop on a "big pick" (lots of cells absorbed).
  // Tiny chance, separate from the wave-clear drop, so the card can drop
  // mid-wave too.
  if (absorbed.length >= 12 && Math.random() < 0.05) {
    this.grantScratchCard();
  }

  if (this.regionFillsBoard()) {
    this.completeWave();
  }

  this.gainXp(absorbed.length);
};

FrenzyGame.prototype.grantScratchCard = function () {
  this.state.scratchCards += 1;
  this.actuator.updateScratchCount(this.state.scratchCards);
  this.actuator.flashScratchDrop();
};

// Roll 9 symbols for a real scratch card (3x3 grid). Each cell is an
// independent draw weighted by SCRATCH_SYMBOLS[i].weight.
FrenzyGame.prototype._rollScratchSymbols = function () {
  var pool = FrenzyGame.SCRATCH_SYMBOLS;
  var total = 0;
  for (var i = 0; i < pool.length; i++) total += pool[i].weight;
  var grid = [];
  for (var c = 0; c < 9; c++) {
    var roll = Math.random() * total;
    var acc = 0;
    for (var j = 0; j < pool.length; j++) {
      acc += pool[j].weight;
      if (roll < acc) { grid.push(pool[j]); break; }
    }
  }
  return grid;
};

// Score a scratch card from its 9 symbols. The most-common symbol wins:
//   - 3+ of a kind: full reward, multiplied by (count - 2) so 3=1x, 4=2x ...
//   - 2 of a kind:  fractional reward (30%)
//   - 0/1 matches:  flat consolation (+50)
// Ties on count broken by rarity (lowest weight wins).
FrenzyGame.prototype._scoreScratch = function (symbols) {
  var counts = {};
  symbols.forEach(function (s) { counts[s.id] = (counts[s.id] || 0) + 1; });
  var pool = FrenzyGame.SCRATCH_SYMBOLS;
  var best = null;
  pool.forEach(function (sym) {
    var n = counts[sym.id] || 0;
    if (!best ||
        n > best.count ||
        (n === best.count && sym.weight < best.sym.weight)) {
      best = { sym: sym, count: n };
    }
  });

  if (best.count >= 3) {
    var mul = best.count - 2;
    if (best.sym.kind === "score") {
      return { kind: "score", amount: best.sym.base * mul,
               label: "+" + (best.sym.base * mul),
               matchSymbolId: best.sym.id, matchCount: best.count, flair: best.sym.flair };
    }
    if (best.sym.kind === "time") {
      return { kind: "time", amount: best.sym.base * mul,
               label: "+" + (best.sym.base * mul) + "s",
               matchSymbolId: best.sym.id, matchCount: best.count, flair: best.sym.flair };
    }
    if (best.sym.kind === "perk") {
      return { kind: "perk", label: "Free Perk",
               matchSymbolId: best.sym.id, matchCount: best.count, flair: best.sym.flair };
    }
  }
  if (best.count === 2) {
    if (best.sym.kind === "score") {
      var amt = Math.round(best.sym.base * 0.3);
      return { kind: "score", amount: amt, label: "+" + amt,
               matchSymbolId: best.sym.id, matchCount: 2, flair: "common" };
    }
    if (best.sym.kind === "time") {
      var t = Math.max(5, Math.round(best.sym.base * 0.3));
      return { kind: "time", amount: t, label: "+" + t + "s",
               matchSymbolId: best.sym.id, matchCount: 2, flair: "common" };
    }
    // 2 perks pays a flat score consolation (free perk with N=2 felt
    // too generous given how easy 2-of-a-kind is to roll).
    return { kind: "score", amount: 100, label: "+100",
             matchSymbolId: null, matchCount: 0, flair: "common" };
  }
  return { kind: "score", amount: 50, label: "+50",
           matchSymbolId: null, matchCount: 0, flair: "common" };
};

FrenzyGame.prototype.openScratchCard = function () {
  if (this.state.scratchCards <= 0) return;
  if (this.state.paused) return;
  this.state.paused = true;
  var symbols = this._rollScratchSymbols();
  var reward = this._scoreScratch(symbols);
  var self = this;
  this.actuator.showScratchCard(symbols, reward, function () {
    self.state.scratchCards -= 1;
    self.actuator.updateScratchCount(self.state.scratchCards);
    self.state.paused = false;
    self._applyScratchReward(reward);
  });
};

FrenzyGame.prototype._applyScratchReward = function (reward) {
  switch (reward.kind) {
    case "score":
      this.state.score += reward.amount;
      this.actuator.updateScore(this.state.score);
      break;
    case "time":
      this.state.timeLeftMs += reward.amount * 1000;
      // Don't break the game-over check; cap implicitly via display.
      break;
    case "wave":
      // Auto-clear the current wave: paint the entire board to current color
      // so completeWave() fires naturally.
      var color = this.currentColor();
      for (var x = 0; x < this.size; x++) {
        for (var y = 0; y < this.size; y++) this.state.cells[x][y] = color;
      }
      this.completeWave();
      break;
    case "perk":
      this.openFreeChest();
      break;
  }
};

FrenzyGame.prototype.gainXp = function (amount) {
  this.state.xp += amount;
  this.actuator.updateXp(this.state.xp, this.state.xpToLevel);
  if (this.state.xp >= this.state.xpToLevel) {
    this.triggerLevelUp();
  }
};

FrenzyGame.prototype._availablePerks = function () {
  return FrenzyGame.PERKS.filter(function (p) {
    return (this.state.perks[p.id] || 0) < p.maxLevel;
  }, this);
};

FrenzyGame.prototype._roll3Perks = function () {
  var pool = this._availablePerks().slice();
  var choices = [];
  for (var i = 0; i < 3 && pool.length > 0; i++) {
    var idx = Math.floor(Math.random() * pool.length);
    choices.push(pool.splice(idx, 1)[0]);
  }
  return choices;
};

FrenzyGame.prototype.triggerLevelUp = function () {
  if (this.state.paused) return;
  this.state.paused = true;

  var available = this._availablePerks();
  if (!available.length) {
    // No more upgrades — drain the level and award a flat score prize.
    this.state.score += 250;
    this.state.xp -= this.state.xpToLevel;
    this.state.level += 1;
    this.state.xpToLevel = this._xpForLevel(this.state.level);
    this.state.paused = false;
    this.actuator.updateLevel(this.state.level);
    this.actuator.updateScore(this.state.score);
    this.actuator.updateXp(this.state.xp, this.state.xpToLevel);
    return;
  }

  var choices = this._roll3Perks();
  var self = this;
  this.actuator.openChest(this.state.level + 1, choices, this.state.perks, function (chosen) {
    self._grantPerk(chosen);
    self.state.xp -= self.state.xpToLevel;
    self.state.level += 1;
    self.state.xpToLevel = self._xpForLevel(self.state.level);
    self.actuator.updateLevel(self.state.level);
    self.actuator.updateXp(self.state.xp, self.state.xpToLevel);
    self.state.paused = false;
    if (self.state.xp >= self.state.xpToLevel) {
      setTimeout(function () { self.triggerLevelUp(); }, 320);
    }
  });
};

// Grant a perk without spending a level (used by scratch-card "Free Perk").
FrenzyGame.prototype._grantPerk = function (perkId) {
  this.state.perks[perkId] = (this.state.perks[perkId] || 0) + 1;
  if (perkId === "heart") {
    this.state.timeLeftMs += 20000;
  }
};

// Open a free chest without spending a level. Used by the scratch-card
// "Free Perk" reward. Pauses the game like a normal level-up.
FrenzyGame.prototype.openFreeChest = function () {
  if (this.state.paused) return;
  var available = this._availablePerks();
  if (!available.length) {
    // No upgrades available — fall back to a score prize.
    this.state.score += 500;
    this.actuator.updateScore(this.state.score);
    return;
  }
  this.state.paused = true;
  var choices = this._roll3Perks();
  var self = this;
  this.actuator.openChest(this.state.level, choices, this.state.perks, function (chosen) {
    self._grantPerk(chosen);
    self.state.paused = false;
  });
};

FrenzyGame.prototype.regionFillsBoard = function () {
  var color = this.currentColor();
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      if (this.state.cells[x][y] !== color) return false;
    }
  }
  return true;
};

FrenzyGame.prototype.completeWave = function () {
  var bonus = 200 + this.state.wave * 100;
  this.state.score += bonus;
  this.state.wave += 1;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      if (x === this.startCell.x && y === this.startCell.y) continue;
      this.state.cells[x][y] = Math.floor(Math.random() * this.colorCount);
    }
  }
  for (var k in this.state.hotCells) {
    delete this.state.hotCells[k];
    this.actuator.unmarkHot(k);
  }
  for (var bk in this.state.bounties) {
    delete this.state.bounties[bk];
    this.actuator.unmarkBounty(bk);
  }

  this.actuator.celebrateWave(this.state.wave, bonus);
  this.actuator.renderBoard(this.state, this.size, this.startCell, this.region());
  this.actuator.updateWave(this.state.wave);
  this.actuator.updateScore(this.state.score);

  // Wave-clear scratch drop. Base 30%, bumps slightly per wave so the
  // player keeps getting cards as the run goes on.
  var dropChance = Math.min(0.5, 0.30 + 0.03 * (this.state.wave - 2));
  if (Math.random() < dropChance) this.grantScratchCard();
};

FrenzyGame.prototype.churnEdges = function () {
  var size = this.size;
  var perim = [];
  for (var x = 0; x < size; x++) { perim.push([x, 0]); perim.push([x, size - 1]); }
  for (var y = 1; y < size - 1; y++) { perim.push([0, y]); perim.push([size - 1, y]); }

  var regionSet = {};
  this.region().forEach(function (p) { regionSet[p[0] + "," + p[1]] = true; });

  var candidates = [];
  for (var i = 0; i < perim.length; i++) {
    var k = perim[i][0] + "," + perim[i][1];
    if (!regionSet[k]) candidates.push(perim[i]);
  }
  for (var n = 0; n < this.churnCount && candidates.length > 0; n++) {
    var idx = Math.floor(Math.random() * candidates.length);
    var c = candidates.splice(idx, 1)[0];
    var newColor = Math.floor(Math.random() * this.colorCount);
    this.state.cells[c[0]][c[1]] = newColor;
    this.actuator.churnCell(c[0], c[1], newColor);
  }
};

FrenzyGame.prototype.spawnBounty = function () {
  // Pick a random non-region, non-hot, non-bounty cell.
  var regionSet = {};
  this.region().forEach(function (p) { regionSet[p[0] + "," + p[1]] = true; });
  var candidates = [];
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      var k = x + "," + y;
      if (regionSet[k]) continue;
      if (this.state.hotCells[k]) continue;
      if (this.state.bounties[k]) continue;
      candidates.push([x, y, k]);
    }
  }
  if (!candidates.length) return;
  var p = candidates[Math.floor(Math.random() * candidates.length)];
  var turns = this.bountyTurnsMin +
              Math.floor(Math.random() * (this.bountyTurnsMax - this.bountyTurnsMin + 1));
  this.state.bounties[p[2]] = { turnsLeft: turns, payout: this.bountyPayout };
  this.actuator.markBounty(p[0], p[1], turns);
};

FrenzyGame.prototype.spawnHot = function (nowMs, luckyLvl) {
  var regionSet = {};
  this.region().forEach(function (p) { regionSet[p[0] + "," + p[1]] = true; });
  var candidates = [];
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      var k = x + "," + y;
      if (regionSet[k]) continue;
      if (this.state.hotCells[k]) continue;
      if (this.state.bounties[k]) continue; // don't double up with a bounty
      candidates.push([x, y, k]);
    }
  }
  if (!candidates.length) return;
  var p = candidates[Math.floor(Math.random() * candidates.length)];
  var lifetime = this.hotLifetimeMs * (1 + 0.25 * (luckyLvl || 0));
  this.state.hotCells[p[2]] = nowMs + lifetime;
  this.actuator.markHot(p[0], p[1]);
};

// Aura perk effect: pick a random cell adjacent to the region and absorb it
// (set to current color). Counts toward combo and triggers a small visual.
FrenzyGame.prototype.triggerAura = function () {
  var color = this.currentColor();
  var regionSet = {};
  this.region().forEach(function (p) { regionSet[p[0] + "," + p[1]] = true; });

  var adj = {};
  for (var k in regionSet) {
    var xy = k.split(",");
    var rx = +xy[0], ry = +xy[1];
    [[rx + 1, ry], [rx - 1, ry], [rx, ry + 1], [rx, ry - 1]].forEach(function (n) {
      if (n[0] < 0 || n[0] >= this.size || n[1] < 0 || n[1] >= this.size) return;
      var ak = n[0] + "," + n[1];
      if (regionSet[ak]) return;
      // Don't auto-absorb cells of the player's own color (they'd be in the
      // region already if they were connected).
      if (this.state.cells[n[0]][n[1]] === color) return;
      adj[ak] = n;
    }, this);
  }
  var keys = Object.keys(adj);
  if (!keys.length) return;
  var pick = adj[keys[Math.floor(Math.random() * keys.length)]];
  this.state.cells[pick[0]][pick[1]] = color;
  this.state.totalAbsorbed += 1;

  // Aura is a free single-cell pick — it keeps the combo alive (timer
  // reset) but doesn't grow it. Otherwise an aura ticking in the
  // background would pump combo for free, defeating the anti-mash rule
  // that combo only grows on substantive player picks.
  if (this.state.combo > 0) this.state.comboTimerMs = this.comboTimeoutMs;

  var comboStep = 0.2 + 0.1 * (this.state.perks.combo || 0);
  var comboMul = 1 + (this.state.combo - 1) * comboStep;
  var multBonus = 1 + 0.5 * (this.state.perks.mult || 0);
  var basePerCell = this.basePerCell + (this.state.perks.greed || 0);
  var gain = Math.round(basePerCell * comboMul * multBonus);
  this.state.score += gain;

  this.actuator.afterPick({
    color: color,
    absorbed: [pick],
    gain: gain,
    combo: this.state.combo,
    multiplier: comboMul * multBonus,
    hotsHit: [],
    bigPick: false,
    auraSource: true
  });
  this.actuator.updateScore(this.state.score);
  this.actuator.updateCombo(this.state.combo, comboMul * multBonus);
  this.gainXp(1);
};

FrenzyGame.prototype.endRun = function () {
  if (this.state.ended) return;
  this.state.ended = true;
  this.stopLoop();
  if (!this._scoreRecorded) {
    this._scoreRecorded = true;
    if (this.storageManager.getBestScore() < this.state.score) {
      this.storageManager.setBestScore(this.state.score);
    }
    if (this.scoreHistory) {
      this.scoreHistory.add(this.state.score, {
        note: "wave " + this.state.wave + " · ×" + this.state.maxCombo + " · L" + this.state.level
      });
    }
  }
  this.actuator.showFinalScreen({
    score: this.state.score,
    wave: this.state.wave,
    maxCombo: this.state.maxCombo,
    totalAbsorbed: this.state.totalAbsorbed,
    level: this.state.level
  });
  this.actuator.renderHistoryStrip(
    this.scoreHistory.list(),
    this.settings ? this.settings.get("showHistory") : true
  );
};
