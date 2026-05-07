window.requestAnimationFrame(function () {
  var ready = (window.IDBMirror && window.IDBMirror.hydrate)
              ? window.IDBMirror.hydrate() : Promise.resolve();

  ready.then(function () {
    if (window.IDBMirror && window.IDBMirror.requestPersistence) {
      window.IDBMirror.requestPersistence();
    }

    var GAME_ID = "frenzy";
    var storageManager = new LocalStorageManager(GAME_ID);
    var settings       = new Settings(storageManager.storage);
    // Frenzy adds a per-game runLength setting. Inject it as a default if
    // missing so the settings panel select reflects the right value.
    if (!("runLength" in settings.values)) {
      settings.values.runLength = 240;
      settings.save();
    }
    var haptics        = new Haptics(settings);
    var scoreHistory   = new ScoreHistory(storageManager.storage, GAME_ID);
    var inputManager   = new InputManager();
    var actuator       = new FrenzyActuator();

    var game = new FrenzyGame({
      gameId: GAME_ID,
      storageManager: storageManager,
      inputManager:   inputManager,
      actuator:       actuator,
      settings:       settings,
      haptics:        haptics,
      scoreHistory:   scoreHistory
    });

    actuator.onColorPick = function (color) { game.pick(color); };

    // Wire the scratch button by hand since it's outside the action row.
    var scratchBtn = document.querySelector(".scratch-card-button");
    if (scratchBtn) {
      var openScratch = function (e) {
        e.preventDefault();
        inputManager.emit("openScratch");
      };
      scratchBtn.addEventListener("click", openScratch);
      scratchBtn.addEventListener("touchend", openScratch);
    }

    // Settings panel: bind the run-length select manually since it's
    // not part of the shared SettingsPanel schema.
    var panel = new SettingsPanel(settings, game, scoreHistory);
    inputManager.on("openSettings",  function () { panel.open(); });
    inputManager.on("closeSettings", function () { panel.close(); });
    var runLengthSel = document.querySelector(".settings-run-length");
    if (runLengthSel) {
      runLengthSel.value = String(settings.get("runLength") || 240);
      runLengthSel.addEventListener("change", function () {
        var v = parseInt(runLengthSel.value, 10);
        if (!isNaN(v)) {
          settings.set("runLength", v);
        }
      });
    }

    // Initial XP bar value.
    actuator.updateXp(0, 15);
    game.boot();
    actuator.renderHistoryStrip(scoreHistory.list(), settings.get("showHistory"));

    window.gameManager      = game;
    window.gameSettings     = settings;
    window.gameScoreHistory = scoreHistory;
  });
});
